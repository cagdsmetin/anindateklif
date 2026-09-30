"""In-process tests for the iyzico recurring subscription and Google
(login / Calendar / Business Profile) integrations.

Runs without a live backend or network: Mongo is mongomock-motor, and the
iyzico/Google HTTP calls are replaced with in-memory fakes.
    pip install mongomock-motor httpx
    pytest tests/test_integrations.py -n 0
"""
import os
import asyncio
import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse, parse_qs

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:1")
os.environ.setdefault("DB_NAME", "test_integrations")
os.environ.setdefault("JWT_SECRET", "test-secret")

mongomock_motor = pytest.importorskip("mongomock_motor")
import jwt  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import server  # noqa: E402


@pytest.fixture()
def env(monkeypatch):
    db = mongomock_motor.AsyncMongoMockClient()["t"]
    monkeypatch.setattr(server, "db", db)
    monkeypatch.setattr(server, "IYZICO_API_KEY", "k")
    monkeypatch.setattr(server, "IYZICO_SECRET_KEY", "s")
    monkeypatch.setattr(server, "GOOGLE_CLIENT_ID", "cid.apps.googleusercontent.com")
    monkeypatch.setattr(server, "GOOGLE_CLIENT_SECRET", "csecret")
    monkeypatch.setattr(server, "GOOGLE_ENABLED", True)
    monkeypatch.setattr(server, "GOOGLE_BUSINESS_ENABLED", True)
    server._rate_buckets.clear()
    return db


def run(coro):
    return asyncio.run(coro)


async def _mk_user(db, uid="user_a", **extra):
    doc = {"user_id": uid, "email": f"{uid}@example.com", "name": "Ali Veli", "hashed_password": "x",
           "language": "tr", **extra}
    await db.users.insert_one(dict(doc))
    await db.companies.insert_one({"id": "c1", "userId": uid, "sirketAdi": "Firma"})
    return doc


def _auth(uid="user_a"):
    return {"Authorization": f"Bearer {server._make_access_token({'user_id': uid, 'email': uid + '@example.com'})}"}


def _ms(dt):
    return int(dt.timestamp() * 1000)


# ------------------------------------------------------------------ iyzico
class TestRecurring:
    def test_plan_ref_lookup(self, monkeypatch):
        monkeypatch.setattr(server, "IYZICO_SUB_PLANS", {"yearly:5:TRY": "R5", "weekly:max:USD": "RMAX"})
        assert server._iyzico_sub_plan_ref("yearly", server.SEAT_TIERS[0], "TRY") == "R5"
        assert server._iyzico_sub_plan_ref("weekly", server.SEAT_TIERS[-1], "USD") == "RMAX"
        assert server._iyzico_sub_plan_ref("weekly", server.SEAT_TIERS[0], "TRY") == ""

    def test_paid_until_uses_only_successful_orders(self):
        now = datetime.now(timezone.utc).replace(microsecond=0)
        detail = {"orders": [
            {"orderStatus": "SUCCESS", "endPeriod": _ms(now + timedelta(days=7))},
            {"orderStatus": "FAILED", "endPeriod": _ms(now + timedelta(days=14))},
        ]}
        assert server._recurring_paid_until(detail) == now + timedelta(days=7)
        assert server._recurring_paid_until({"orders": []}) is None

    def test_checkout_uses_recurring_form_and_serves_page(self, env, monkeypatch):
        monkeypatch.setattr(server, "IYZICO_SUB_PLANS", {"yearly:5:TRY": "PLAN-REF"})
        seen = {}

        async def fake_json(fn, req):
            seen["req"] = req
            return {"status": "success", "token": "tok1", "checkoutFormContent": "<script>iyzi()</script>"}

        monkeypatch.setattr(server, "_iyzico_json", fake_json)
        run(_mk_user(env))
        c = TestClient(server.app)
        r = c.post("/api/subscription/checkout", headers=_auth(), json={
            "plan": "yearly", "buyer_identity_number": "11111111111", "billing_address": "a", "billing_city": "b"})
        assert r.status_code == 200, r.text
        assert seen["req"]["pricingPlanReferenceCode"] == "PLAN-REF"
        assert r.json()["payment_page_url"].endswith("/api/subscription/recurring/pay/tok1")
        page = c.get("/api/subscription/recurring/pay/tok1")
        assert "iyzipay-checkout-form" in page.text and "<script>iyzi()</script>" in page.text

    def test_callback_activates_and_keeps_remaining_time(self, env, monkeypatch):
        now = datetime.now(timezone.utc).replace(microsecond=0)
        remaining = now + timedelta(days=10)
        run(_mk_user(env, subscription_expires_at=remaining.isoformat()))
        run(env.subscription_payments.insert_one(
            {"user_id": "user_a", "token": "tok1", "recurring": True, "plan": "yearly", "status": "pending"}))

        async def fake_json(fn, req):
            return {"status": "success", "data": {"referenceCode": "SUB1", "subscriptionStatus": "ACTIVE",
                                                  "customerReferenceCode": "CUS1", "startDate": _ms(now)}}

        async def fake_detail(ref):
            assert ref == "SUB1"
            return {"status": "success", "data": {"subscriptionStatus": "ACTIVE", "orders": [
                {"orderStatus": "SUCCESS", "endPeriod": _ms(now + timedelta(days=365))}]}}

        monkeypatch.setattr(server, "_iyzico_json", fake_json)
        monkeypatch.setattr(server, "_iyzico_subscription_detail", fake_detail)
        c = TestClient(server.app)
        r = c.post("/api/subscription/recurring/callback", data={"token": "tok1"}, follow_redirects=False)
        assert r.status_code == 302 and "status=success" in r.headers["location"]
        u = run(env.users.find_one({"user_id": "user_a"}))
        assert u["auto_renew"] is True and u["iyzico_sub_ref"] == "SUB1"
        exp = datetime.fromisoformat(u["subscription_expires_at"])
        # 365 gün + başlangıçta kalan ~10 gün
        assert abs((exp - (now + timedelta(days=375))).total_seconds()) < 120
        # Tekrar çağrı süreyi bir daha uzatmaz.
        c.post("/api/subscription/recurring/callback", data={"token": "tok1"}, follow_redirects=False)
        assert run(env.users.find_one({"user_id": "user_a"}))["subscription_expires_at"] == u["subscription_expires_at"]
        st = c.get("/api/subscription/status", headers=_auth()).json()
        assert st["auto_renew"] is True and st["renewal_due_soon"] is False

    def test_webhook_resyncs_from_iyzico(self, env, monkeypatch):
        now = datetime.now(timezone.utc).replace(microsecond=0)
        run(_mk_user(env, iyzico_sub_ref="SUB1", auto_renew=True,
                     subscription_expires_at=(now + timedelta(days=1)).isoformat()))

        async def fake_detail(ref):
            return {"status": "success", "data": {"subscriptionStatus": "ACTIVE", "orders": [
                {"orderStatus": "SUCCESS", "endPeriod": _ms(now + timedelta(days=1))},
                {"orderStatus": "SUCCESS", "endPeriod": _ms(now + timedelta(days=8))}]}}

        monkeypatch.setattr(server, "_iyzico_subscription_detail", fake_detail)
        body = {"merchantId": "M", "iyziEventType": "subscription.order.success",
                "subscriptionReferenceCode": "SUB1", "orderReferenceCode": "O", "customerReferenceCode": "C"}
        sig = hmac.new(b"s", ("M" + "s" + "subscription.order.successSUB1OC").encode(), hashlib.sha256).hexdigest()
        assert server._iyzico_webhook_signature_ok(body, sig)
        assert not server._iyzico_webhook_signature_ok(body, "00")
        r = TestClient(server.app).post("/api/subscription/recurring/webhook", json=body,
                                        headers={"X-IYZ-Signature-V3": sig})
        assert r.status_code == 200
        exp = datetime.fromisoformat(run(env.users.find_one({"user_id": "user_a"}))["subscription_expires_at"])
        assert exp == now + timedelta(days=8)

    def test_cancel_turns_off_auto_renew(self, env, monkeypatch):
        run(_mk_user(env, iyzico_sub_ref="SUB1", auto_renew=True, iyzico_sub_status="ACTIVE"))

        async def fake_json(fn, req):
            assert req["subscriptionReferenceCode"] == "SUB1"
            return {"status": "success"}

        monkeypatch.setattr(server, "_iyzico_json", fake_json)
        r = TestClient(server.app).post("/api/subscription/cancel", headers=_auth())
        assert r.status_code == 200, r.text
        u = run(env.users.find_one({"user_id": "user_a"}))
        assert u["auto_renew"] is False and u["iyzico_sub_status"] == "CANCELED"

    def test_seat_tier_change_moves_plan_next_period_both_ways(self, env, monkeypatch):
        monkeypatch.setattr(server, "IYZICO_SUB_PLANS", {
            "yearly:5:TRY": "P5", "yearly:10:TRY": "P10", "yearly:30:TRY": "P30"})
        run(_mk_user(env, iyzico_sub_ref="SUB1", auto_renew=True, iyzico_sub_status="ACTIVE",
                     subscription_plan="yearly", iyzico_sub_pricing_ref="P5", iyzico_sub_currency="TRY",
                     subscription_expires_at="2027-01-01T00:00:00+00:00"))
        calls = []

        async def fake_json(fn, req):
            calls.append(req)
            return {"status": "success", "data": {"referenceCode": f"SUB{len(calls) + 1}"}}

        monkeypatch.setattr(server, "_iyzico_json", fake_json)

        async def set_staff(n):
            await env.users.delete_many({"staff_owner_user_id": "user_a"})
            for i in range(n):
                await env.users.insert_one({"user_id": f"st{i}", "email": f"st{i}@x.com", "staff_owner_user_id": "user_a"})
            await server._ensure_recurring_tier("user_a")

        run(set_staff(4))  # 5 kişi: kademe aynı, istek yok
        assert calls == []
        run(set_staff(10))  # 11 kişi: 11–30 kademesi
        assert calls[-1]["newPricingPlanReferenceCode"] == "P30" and calls[-1]["upgradePeriod"] == "NEXT_PERIOD"
        u = run(env.users.find_one({"user_id": "user_a"}))
        assert u["iyzico_sub_pricing_ref"] == "P30" and u["iyzico_sub_ref"] == "SUB2"
        assert u["iyzico_sub_prev_refs"] == ["SUB1"]
        st = TestClient(server.app).get("/api/subscription/status", headers=_auth()).json()
        assert st["next_renewal_tier"] == "11–30 kişi"
        run(set_staff(10))  # tekrar çağrı: plan zaten doğru
        assert len(calls) == 1
        run(set_staff(3))  # 4 kişi: alt kademeye iner
        assert calls[-1]["newPricingPlanReferenceCode"] == "P5"
        assert run(env.users.find_one({"user_id": "user_a"}))["iyzico_sub_tier_change"]["label"] == "1–5 kişi"


# ------------------------------------------------------------------ Google login
def _id_token(sub="g-1", email="new.user@gmail.com", verified=True, aud="cid.apps.googleusercontent.com"):
    return jwt.encode({"sub": sub, "email": email, "email_verified": verified, "aud": aud,
                       "iss": "https://accounts.google.com", "name": "Yeni Kişi",
                       "exp": int(datetime.now(timezone.utc).timestamp()) + 600}, "whatever", algorithm="HS256")


class TestGoogleLogin:
    def _login(self, env, monkeypatch, id_token, redirect="https://www.anindateklif.co/google-auth"):
        async def fake_token(data):
            return {"access_token": "at", "id_token": id_token, "expires_in": 3600}

        monkeypatch.setattr(server, "_google_post_token", fake_token)
        c = TestClient(server.app)
        r = c.get("/api/auth/google/start", params={"redirect": redirect}, follow_redirects=False)
        assert r.status_code == 302
        state = parse_qs(urlparse(r.headers["location"]).query)["state"][0]
        r = c.get("/api/google/oauth/callback", params={"state": state, "code": "abc"}, follow_redirects=False)
        assert r.status_code == 302
        return c, parse_qs(urlparse(r.headers["location"]).query)

    def test_rejects_foreign_redirect(self, env):
        r = TestClient(server.app).get("/api/auth/google/start", params={"redirect": "https://evil.example/x"},
                                       follow_redirects=False)
        assert r.status_code == 400
        assert server._allowed_app_redirect("anindateklif://google-auth")
        assert not server._allowed_app_redirect("javascript:alert(1)")

    def test_new_user_signup_and_one_time_code(self, env, monkeypatch):
        c, q = self._login(env, monkeypatch, _id_token())
        code = q["google_code"][0]
        r = c.post("/api/auth/google/exchange", json={"code": code})
        assert r.status_code == 200, r.text
        assert r.json()["user"]["email"] == "new.user@gmail.com"
        u = run(env.users.find_one({"email": "new.user@gmail.com"}))
        assert u["google_sub"] == "g-1" and u["hashed_password"] == "" and "phone_normalized" not in u
        # Kod tek kullanımlık.
        assert c.post("/api/auth/google/exchange", json={"code": code}).status_code == 400
        # Şifresiz hesap şifreyle giriş yapamaz.
        assert c.post("/api/auth/login", json={"email": "new.user@gmail.com", "password": ""}).status_code in (401, 422)

    def test_links_existing_account_by_gmail_canonical(self, env, monkeypatch):
        run(env.users.insert_one({"user_id": "user_old", "email": "newuser@gmail.com",
                                  "email_canonical": "newuser@gmail.com", "hashed_password": "h"}))
        c, q = self._login(env, monkeypatch, _id_token(email="new.user@gmail.com"))
        r = c.post("/api/auth/google/exchange", json={"code": q["google_code"][0]})
        assert r.json()["user"]["user_id"] == "user_old"
        assert run(env.users.count_documents({})) == 1

    def test_unverified_email_or_wrong_audience_rejected(self, env, monkeypatch):
        _, q = self._login(env, monkeypatch, _id_token(verified=False))
        assert "google_error" in q
        _, q = self._login(env, monkeypatch, _id_token(aud="someone-else"))
        assert q["google_error"] == ["exchange"]


# ------------------------------------------------------------------ Google Calendar
class FakeGoogle:
    """Minimal in-memory Calendar API: one app calendar + the user's primary."""

    def __init__(self):
        self.cals = {"primary": {}}
        self.n = 0

    async def api(self, conn, method, url, params=None, body=None):
        path = url.split("/calendar/v3", 1)[1]
        parts = [p for p in path.split("/") if p]
        if parts == ["calendars"] and method == "POST":
            self.n += 1
            cid = f"cal{self.n}"
            self.cals[cid] = {}
            return {"id": cid}
        cal = parts[1].replace("%40", "@")
        if cal not in self.cals:
            raise server.GoogleApiError(404, "not found")
        events = self.cals[cal]
        if len(parts) == 3:
            if method == "GET":
                return {"items": list(events.values())}
            self.n += 1
            ev = {**body, "id": f"ev{self.n}"}
            events[ev["id"]] = ev
            return ev
        eid = parts[3]
        if method == "PATCH":
            events[eid] = {**events[eid], **body}
            return events[eid]
        if method == "DELETE":
            events.pop(eid, None)
            return {}
        raise AssertionError((method, url))


class TestGoogleCalendar:
    def _setup(self, env, monkeypatch):
        fake = FakeGoogle()
        monkeypatch.setattr(server, "_google_api", fake.api)
        run(_mk_user(env))
        run(env.google_connections.insert_one({
            "id": "conn-1", "userId": "user_a", "companyId": "c1", "purpose": "calendar", "personId": "",
            "status": "active", "refresh_token_enc": server._google_encrypt("rt")}))
        return fake

    def test_two_way_sync(self, env, monkeypatch):
        fake = self._setup(env, monkeypatch)
        today = server._istanbul_today()
        d1, d2 = (today + timedelta(days=3)).isoformat(), (today + timedelta(days=5)).isoformat()
        run(env.manual_reminders.insert_one(server.ManualReminder(
            id="r1", userId="user_a", companyId="c1", baslik="Müşteriyi ara", tarih=d1).dict()))
        run(env.manual_reminders.insert_one(server.ManualReminder(
            id="r2", userId="user_a", companyId="c1", baslik="Silinecek", tarih=d1).dict()))
        fake.cals["primary"]["p1"] = {"id": "p1", "summary": "Toplantı", "start": {"date": d2}}

        stats = run(server._gcal_sync("conn-1"))
        assert stats["pushed"] == 2 and stats["imported"] == 1
        app_cal = fake.cals["cal1"]
        assert sorted(e["summary"] for e in app_cal.values()) == ["Müşteriyi ara", "Silinecek"]
        imported = run(env.manual_reminders.find_one({"icsUid": {"$regex": "^gcal:"}}))
        assert imported["baslik"] == "Toplantı" and imported["tarih"] == d2

        # İkinci senkron: hiçbir şey değişmedi -> hiçbir şey yazılmaz, içe aktarılan geri yazılmaz.
        stats = run(server._gcal_sync("conn-1"))
        assert stats["pushed"] == 0 and stats["imported"] == 0 and len(app_cal) == 2

        # Google'da tarih değiştirildi -> hatırlatıcı güncellenir; Google'da silindi -> hatırlatıcı silinir.
        ev1 = next(e for e in app_cal.values() if e["summary"] == "Müşteriyi ara")
        ev1["start"] = {"date": d2}
        ev2 = next(e for e in app_cal.values() if e["summary"] == "Silinecek")
        del app_cal[ev2["id"]]
        # Uygulamada yeni hatırlatıcı; ana takvimdeki etkinlik silindi.
        run(env.manual_reminders.insert_one(server.ManualReminder(
            id="r3", userId="user_a", companyId="c1", baslik="Yeni", tarih=d1).dict()))
        del fake.cals["primary"]["p1"]

        stats = run(server._gcal_sync("conn-1"))
        assert stats["updatedFromGoogle"] == 1 and stats["deletedFromGoogle"] == 1
        assert stats["deleted"] == 1 and stats["pushed"] == 1
        assert run(env.manual_reminders.find_one({"id": "r1"}))["tarih"] == d2
        assert run(env.manual_reminders.find_one({"id": "r2"})) is None
        assert run(env.manual_reminders.count_documents({"icsUid": {"$regex": "^gcal:"}})) == 0

        # Uygulamada silinen hatırlatıcı Google'dan da kalkar.
        run(env.manual_reminders.delete_one({"id": "r3"}))
        stats = run(server._gcal_sync("conn-1"))
        assert stats["removed"] == 1
        assert sorted(e["summary"] for e in app_cal.values()) == ["Müşteriyi ara"]

    def test_connections_endpoint_and_sync_route(self, env, monkeypatch):
        self._setup(env, monkeypatch)
        c = TestClient(server.app)
        r = c.get("/api/google/connections/c1", headers=_auth())
        assert r.status_code == 200
        cal = next(x for x in r.json() if x["purpose"] == "calendar")
        assert cal["connected"] is True
        r = c.post("/api/google/calendar/sync/c1", headers=_auth())
        assert r.status_code == 200, r.text
        r = c.post("/api/google/connect/start", headers=_auth(),
                   json={"purpose": "calendar", "companyId": "c1", "redirect": "https://www.anindateklif.co/calendar"})
        assert r.status_code == 200 and "calendar.app.created" in r.json()["url"]


# ------------------------------------------------------------------ Business Profile
class TestBusinessReviews:
    def test_reply_only_to_own_location(self, env, monkeypatch):
        calls = []

        async def fake_api(conn, method, url, params=None, body=None):
            calls.append((method, url, body))
            if method == "GET":
                return {"reviews": [{"name": "accounts/1/locations/2/reviews/r1", "starRating": "FOUR",
                                     "comment": "İyi", "reviewer": {"displayName": "Ayşe"}}],
                        "averageRating": 4.0, "totalReviewCount": 1}
            return {"comment": body["comment"], "updateTime": "2026-01-01T00:00:00Z"}

        monkeypatch.setattr(server, "_google_api", fake_api)
        run(_mk_user(env))
        run(env.google_connections.insert_one({
            "id": "conn-b", "userId": "user_a", "companyId": "c1", "purpose": "business", "personId": "",
            "status": "active", "locationName": "accounts/1/locations/2"}))
        c = TestClient(server.app)
        r = c.get("/api/google/business/reviews/c1", headers=_auth())
        assert r.status_code == 200 and r.json()["reviews"][0]["stars"] == 4
        bad = c.post("/api/google/business/reviews/reply", headers=_auth(), json={
            "companyId": "c1", "reviewName": "accounts/9/locations/9/reviews/r1", "comment": "Teşekkürler"})
        assert bad.status_code == 422
        ok = c.post("/api/google/business/reviews/reply", headers=_auth(), json={
            "companyId": "c1", "reviewName": "accounts/1/locations/2/reviews/r1", "comment": "Teşekkürler"})
        assert ok.status_code == 200, ok.text
        assert calls[-1][0] == "PUT" and calls[-1][1].endswith("/accounts/1/locations/2/reviews/r1/reply")
