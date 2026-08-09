"""Backend tests for Anında Teklif JWT auth rewrite (2026-01).

Covers:
- POST /api/auth/register: hash password, returns token+user, onboarding_completed=false
- POST /api/auth/register: rejects weak passwords with 422 (each rule)
- POST /api/auth/register: duplicate email -> 409
- POST /api/auth/login: valid returns token; invalid -> 401
- GET /api/auth/me + PATCH /api/auth/me
- POST /api/auth/forgot-password: identical 200 message; log entry when email exists
- POST /api/auth/reset-password: invalid token -> 400; valid token allows update
- Multi-tenancy: user A cannot access user B data
- POST /api/companies: new imzaMetni field persists
- All CRUD endpoints still functional after auth rewrite
"""
import os
import re
import time
import uuid
import subprocess
from typing import Dict, Any

import pytest
import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"

STRONG_PW = "Test1234!"


# ------------- helpers -------------
def _uniq_email(tag: str) -> str:
    # Note: EmailStr rejects .local reserved TLD, so use example.com
    return f"e2e+{tag}+{uuid.uuid4().hex[:8]}@example.com"


def _register(email=None, password=STRONG_PW, name="Tester", phone="5551112233"):
    payload = {"email": email or _uniq_email("reg"), "password": password, "name": name, "phone": phone}
    r = requests.post(f"{API}/auth/register", json=payload)
    return r, payload


def _sess(token: str) -> requests.Session:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    return s


# =========================================================================
# 1. Register
# =========================================================================
class TestRegister:
    def test_success_returns_token_and_user(self):
        r, payload = _register()
        assert r.status_code == 201, r.text
        body = r.json()
        assert "access_token" in body and body["access_token"]
        assert body["token_type"] == "bearer"
        u = body["user"]
        assert u["email"] == payload["email"].lower()
        assert u["name"] == payload["name"]
        assert u["phone"] == payload["phone"]
        assert u["onboarding_completed"] is False
        assert u["country"] == ""
        assert u["currency"] == ""
        assert u["tax_label"] == ""
        assert "user_id" in u and u["user_id"].startswith("user_")
        # Password never returned
        assert "password" not in u and "hashed_password" not in u

    def test_email_normalized_lowercase(self):
        email = f"E2E+MixCase+{uuid.uuid4().hex[:6]}@Example.COM"
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": STRONG_PW, "name": "Mix", "phone": ""
        })
        assert r.status_code == 201, r.text
        assert r.json()["user"]["email"] == email.lower()

    @pytest.mark.parametrize("bad_pw", [
        "Short1!",         # <8 chars
        "alllowercase1!",  # no uppercase
        "ALLUPPERCASE1!",  # no lowercase
        "NoDigitsHere!",   # no digit
        "NoSymbol123",     # no symbol
    ])
    def test_weak_password_rejected(self, bad_pw):
        r = requests.post(f"{API}/auth/register", json={
            "email": _uniq_email("weak"), "password": bad_pw, "name": "X", "phone": ""
        })
        assert r.status_code == 422, f"{bad_pw!r} expected 422 got {r.status_code}: {r.text}"

    def test_duplicate_email_returns_409(self):
        r1, payload = _register()
        assert r1.status_code == 201
        r2 = requests.post(f"{API}/auth/register", json={
            "email": payload["email"], "password": STRONG_PW, "name": "Dup", "phone": ""
        })
        assert r2.status_code == 409, r2.text


# =========================================================================
# 2. Login
# =========================================================================
class TestLogin:
    def test_login_valid(self):
        r, payload = _register()
        assert r.status_code == 201
        lr = requests.post(f"{API}/auth/login", json={
            "email": payload["email"], "password": payload["password"]
        })
        assert lr.status_code == 200, lr.text
        assert lr.json()["access_token"]
        assert lr.json()["user"]["email"] == payload["email"].lower()

    def test_login_invalid_password(self):
        r, payload = _register()
        assert r.status_code == 201
        lr = requests.post(f"{API}/auth/login", json={
            "email": payload["email"], "password": "Wrong123!"
        })
        assert lr.status_code == 401

    def test_login_unknown_email(self):
        lr = requests.post(f"{API}/auth/login", json={
            "email": _uniq_email("nobody"), "password": STRONG_PW
        })
        assert lr.status_code == 401


# =========================================================================
# 3. /auth/me GET + PATCH
# =========================================================================
class TestAuthMe:
    def test_me_returns_profile(self):
        r, payload = _register()
        token = r.json()["access_token"]
        s = _sess(token)
        me = s.get(f"{API}/auth/me")
        assert me.status_code == 200
        body = me.json()
        assert body["email"] == payload["email"].lower()
        assert body["onboarding_completed"] is False
        assert body["country"] == "" and body["currency"] == "" and body["tax_label"] == ""
        assert "_id" not in body

    def test_me_no_token_returns_401(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_me_invalid_token_returns_401(self):
        r = requests.get(f"{API}/auth/me", headers={"Authorization": "Bearer garbage"})
        assert r.status_code == 401

    def test_patch_me_updates_fields(self):
        r, _ = _register()
        s = _sess(r.json()["access_token"])
        # snapshot pre-existing fields
        me_before = s.get(f"{API}/auth/me").json()
        upd = s.patch(f"{API}/auth/me", json={
            "country": "TR", "currency": "TRY", "tax_label": "KDV", "onboarding_completed": True
        })
        assert upd.status_code == 200, upd.text
        body = upd.json()
        assert body["country"] == "TR"
        assert body["currency"] == "TRY"
        assert body["tax_label"] == "KDV"
        assert body["onboarding_completed"] is True
        # unchanged fields preserved
        assert body["email"] == me_before["email"]
        assert body["name"] == me_before["name"]
        # verify persistence via GET
        me_after = s.get(f"{API}/auth/me").json()
        assert me_after["country"] == "TR"
        assert me_after["onboarding_completed"] is True


# =========================================================================
# 4. Forgot / Reset password
# =========================================================================
class TestPasswordReset:
    def test_forgot_password_unknown_email_returns_200(self):
        r = requests.post(f"{API}/auth/forgot-password", json={"email": _uniq_email("ghost")})
        assert r.status_code == 200
        assert "message" in r.json()

    def test_forgot_password_known_email_logs_token_and_reset_works(self):
        # Register a user
        rr, payload = _register()
        assert rr.status_code == 201
        email = payload["email"]

        r = requests.post(f"{API}/auth/forgot-password", json={"email": email})
        assert r.status_code == 200
        # Both cases return same generic message
        assert r.json().get("message")

        # Poll backend log for token
        token = None
        for _ in range(20):
            try:
                out = subprocess.run(
                    ["tail", "-n", "500", "/var/log/supervisor/backend.err.log"],
                    capture_output=True, text=True, timeout=5,
                )
                combined = out.stdout + "\n" + subprocess.run(
                    ["tail", "-n", "500", "/var/log/supervisor/backend.out.log"],
                    capture_output=True, text=True, timeout=5,
                ).stdout
                # Look specifically for our email
                for line in combined.splitlines()[::-1]:
                    if "[PasswordReset]" in line and email in line:
                        m = re.search(r"token=(\S+)", line)
                        if m:
                            token = m.group(1)
                            break
                if token:
                    break
            except Exception:
                pass
            time.sleep(0.5)

        assert token, f"[PasswordReset] token not found in backend logs for {email}"

        # Invalid token -> 400
        bad = requests.post(f"{API}/auth/reset-password", json={
            "token": "invalid-" + uuid.uuid4().hex, "new_password": "NewPass1!"
        })
        assert bad.status_code == 400

        # Valid token -> ok, then login with new password
        new_pw = "NewPass1!"
        ok = requests.post(f"{API}/auth/reset-password", json={
            "token": token, "new_password": new_pw
        })
        assert ok.status_code == 200, ok.text

        # Login with new password succeeds
        lr = requests.post(f"{API}/auth/login", json={"email": email, "password": new_pw})
        assert lr.status_code == 200, lr.text
        # Old password now fails
        lr_old = requests.post(f"{API}/auth/login", json={"email": email, "password": STRONG_PW})
        assert lr_old.status_code == 401


# =========================================================================
# 5. Multi-tenancy isolation
# =========================================================================
@pytest.fixture(scope="module")
def two_users():
    rA, _ = _register()
    rB, _ = _register()
    assert rA.status_code == 201 and rB.status_code == 201
    tokA, tokB = rA.json()["access_token"], rB.json()["access_token"]
    return _sess(tokA), _sess(tokB), rA.json()["user"], rB.json()["user"]


class TestMultiTenancy:
    def test_company_isolation(self, two_users):
        sA, sB, uA, uB = two_users
        # A creates a company with new imzaMetni field
        r = sA.post(f"{API}/companies", json={
            "sirketAdi": f"TEST_MTA_{uuid.uuid4().hex[:6]}",
            "imzaMetni": "Saygılarımla,\nA Firma",
        })
        assert r.status_code == 200, r.text
        co = r.json()
        assert co["imzaMetni"] == "Saygılarımla,\nA Firma"
        assert co["userId"] == uA["user_id"]

        # B lists companies — must not see A's
        rB = sB.get(f"{API}/companies")
        assert rB.status_code == 200
        assert co["id"] not in {c["id"] for c in rB.json()}

        # B cannot GET A's company
        assert sB.get(f"{API}/companies/{co['id']}").status_code == 404
        # B cannot access A's catalog/customers/quotes
        assert sB.get(f"{API}/catalog/{co['id']}").status_code == 404
        assert sB.get(f"{API}/customers/{co['id']}").status_code == 404
        assert sB.get(f"{API}/quotes/{co['id']}").status_code == 404


# =========================================================================
# 6. Company imzaMetni field
# =========================================================================
class TestCompanyImzaMetni:
    def test_create_and_persist_imzaMetni(self):
        r, _ = _register()
        s = _sess(r.json()["access_token"])
        payload = {
            "sirketAdi": f"TEST_Imza_{uuid.uuid4().hex[:6]}",
            "imzaMetni": "İyi Çalışmalar\nSKYART A.Ş.",
        }
        cr = s.post(f"{API}/companies", json=payload)
        assert cr.status_code == 200, cr.text
        assert cr.json()["imzaMetni"] == payload["imzaMetni"]
        # Verify via GET
        got = s.get(f"{API}/companies/{cr.json()['id']}")
        assert got.status_code == 200
        assert got.json()["imzaMetni"] == payload["imzaMetni"]
        # And via list
        lst = s.get(f"{API}/companies")
        assert lst.status_code == 200
        entry = next(c for c in lst.json() if c["id"] == cr.json()["id"])
        assert entry["imzaMetni"] == payload["imzaMetni"]
        assert "_id" not in entry


# =========================================================================
# 7. CRUD smoke on catalog / customers / quotes (post-auth rewrite)
# =========================================================================
class TestCRUDSmoke:
    def test_full_flow(self):
        r, _ = _register()
        s = _sess(r.json()["access_token"])

        # Create company
        co = s.post(f"{API}/companies", json={
            "sirketAdi": f"TEST_Smoke_{uuid.uuid4().hex[:6]}",
            "imzaMetni": "Sig",
        }).json()
        cid = co["id"]

        # Catalog CRUD
        it = s.post(f"{API}/catalog", json={
            "companyId": cid, "urunAdi": "TEST_Item", "birimFiyat": 100.0
        })
        assert it.status_code == 200
        item = it.json()
        assert "_id" not in item

        lst_cat = s.get(f"{API}/catalog/{cid}")
        assert lst_cat.status_code == 200 and len(lst_cat.json()) >= 1

        upd = s.put(f"{API}/catalog/{item['id']}", json={
            "companyId": cid, "urunAdi": "TEST_Item2", "birimFiyat": 200
        })
        assert upd.status_code == 200
        assert upd.json()["urunAdi"] == "TEST_Item2"

        # Customer
        cu = s.post(f"{API}/customers", json={"companyId": cid, "firma": "TEST_CU"})
        assert cu.status_code == 200
        cust = cu.json()
        assert "_id" not in cust

        lst_cust = s.get(f"{API}/customers/{cid}")
        assert lst_cust.status_code == 200 and len(lst_cust.json()) >= 1

        # Quote with server-side totals
        qr = s.post(f"{API}/quotes", json={
            "companyId": cid, "teklifNo": "TEST-Q-1",
            "tarih": "2026-01-15", "gecerlilik": "2026-02-15",
            "musFirma": "TEST_QC", "iskonto": 10, "kdvOrani": 20,
            "items": [
                {"mode": "general", "urunAdi": "A", "adet": 2, "birim": "Adet", "birimFiyat": 500},
            ],
        })
        assert qr.status_code == 200, qr.text
        q = qr.json()
        # subtotal 1000, iskonto 100, ara 900, kdv 180, total 1080
        assert q["iskontoTutar"] == pytest.approx(100.0)
        assert q["araToplam"] == pytest.approx(900.0)
        assert q["kdvTutar"] == pytest.approx(180.0)
        assert q["genelToplam"] == pytest.approx(1080.0)

        # Status update
        sr = s.patch(f"{API}/quotes/{q['id']}/status", json={"durum": "Onaylandı"})
        assert sr.status_code == 200
        assert sr.json()["durum"] == "Onaylandı"

        # Delete quote
        assert s.delete(f"{API}/quotes/{q['id']}").status_code == 200

        # Cascade delete
        assert s.delete(f"{API}/companies/{cid}").status_code == 200
        assert s.get(f"{API}/companies/{cid}").status_code == 404
        assert s.get(f"{API}/catalog/{cid}").status_code == 404
        assert s.get(f"{API}/customers/{cid}").status_code == 404
