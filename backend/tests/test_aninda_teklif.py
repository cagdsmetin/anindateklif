"""Backend tests for Anında Teklif API (SaaS multi-tenant rewrite).

Covers:
- Auth guard: 401 on unauthenticated CRUD, 401 on POST /api/auth/session with fake session_id.
- Multi-tenancy isolation between userA and userB.
- Company/Catalog/Customer/Quote CRUD (authenticated).
- New Company fields (ozelNotlar, banklar, motorlar, aydinlatmalar, sistemTipleri, hazirlayanEmails).
- Quote item modes (technical / manual / general) persistence + server-side totals.
- MongoDB _id leakage protection.
- Cascade delete of catalog/customers/quotes when company is deleted.
"""
import os
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests
from pymongo import MongoClient

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

_mc = MongoClient(MONGO_URL)
_db = _mc[DB_NAME]


def _seed_user(email_suffix: str):
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    session_token = f"tok_{uuid.uuid4().hex}"
    _db.users.insert_one({
        "user_id": user_id,
        "email": f"TEST_{email_suffix}_{uuid.uuid4().hex[:6]}@test.local",
        "name": f"E2E {email_suffix}",
        "picture": "",
        "createdAt": datetime.now(timezone.utc).isoformat(),
    })
    _db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user_id,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=1),
        "created_at": datetime.now(timezone.utc),
    })
    return user_id, session_token


@pytest.fixture(scope="module")
def users():
    """Seed two synthetic users A and B."""
    uidA, tokA = _seed_user("A")
    uidB, tokB = _seed_user("B")
    yield {"A": (uidA, tokA), "B": (uidB, tokB)}
    # cleanup: drop all data by both users
    for (uid, _tok) in [users_data for users_data in [(uidA, tokA), (uidB, tokB)]]:
        pass
    for uid in [uidA, uidB]:
        _db.companies.delete_many({"userId": uid})
        _db.catalog.delete_many({"userId": uid})
        _db.customers.delete_many({"userId": uid})
        _db.quotes.delete_many({"userId": uid})
        _db.users.delete_one({"user_id": uid})
        _db.user_sessions.delete_many({"user_id": uid})


def _sess(token: str):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def sA(users):
    return _sess(users["A"][1])


@pytest.fixture(scope="module")
def sB(users):
    return _sess(users["B"][1])


@pytest.fixture(scope="module")
def companyA(sA):
    payload = {
        "sirketAdi": f"TEST_CoA_{uuid.uuid4().hex[:6]}",
        "adres": "Adres A",
        "telefon": "+90 111",
        "email": "a@x.com",
        "ozelNotlar": "Varsayılan notlar A",
        "banklar": [
            {"banka": "VAKIF", "turu": "VAKIF KATILIM (TL)", "hesapSahibi": "SKYART", "iban": "TR00 0000"},
        ],
        "hazirlayanEmails": ["prep@a.com"],
        "motorlar": ["Somfy", "Nice"],
        "aydinlatmalar": ["LED-3000K", "LED-4000K"],
        "sistemTipleri": ["Pistonlu Bioklimatik", "Sabit Kanopi"],
    }
    r = sA.post(f"{API}/companies", json=payload)
    assert r.status_code == 200, r.text
    return r.json()


# =========================================================================
# 1. Health & auth guard
# =========================================================================
def test_health_public():
    r = requests.get(f"{API}/")
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


class TestAuthGuard:
    """All CRUD endpoints must reject unauthenticated requests with 401."""

    endpoints = [
        ("GET", "/companies"),
        ("POST", "/companies"),
        ("GET", "/companies/anyid"),
        ("PUT", "/companies/anyid"),
        ("DELETE", "/companies/anyid"),
        ("GET", "/catalog/anyid"),
        ("POST", "/catalog"),
        ("POST", "/catalog/bulk"),
        ("PUT", "/catalog/anyid"),
        ("DELETE", "/catalog/anyid"),
        ("GET", "/customers/anyid"),
        ("POST", "/customers"),
        ("DELETE", "/customers/anyid"),
        ("GET", "/quotes/anyid"),
        ("POST", "/quotes"),
        ("PUT", "/quotes/anyid"),
        ("PATCH", "/quotes/anyid/status"),
        ("DELETE", "/quotes/anyid"),
        ("GET", "/auth/me"),
    ]

    @pytest.mark.parametrize("method,path", endpoints)
    def test_no_token_returns_401(self, method, path):
        r = requests.request(method, f"{API}{path}", json={})
        assert r.status_code == 401, f"{method} {path} expected 401 got {r.status_code}"

    def test_invalid_token_returns_401(self):
        r = requests.get(f"{API}/companies", headers={"Authorization": "Bearer not-a-real-token"})
        assert r.status_code == 401

    def test_auth_session_with_fake_id_returns_401(self):
        r = requests.post(f"{API}/auth/session", json={"session_id": f"fake-{uuid.uuid4().hex}"})
        assert r.status_code == 401


class TestAuthMe:
    def test_me_returns_seeded_user(self, sA, users):
        r = sA.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["user_id"] == users["A"][0]
        assert "_id" not in r.json()


# =========================================================================
# 2. Company CRUD + new SaaS fields
# =========================================================================
class TestCompany:
    def test_create_persists_new_fields(self, sA, companyA):
        assert "_id" not in companyA
        assert companyA["ozelNotlar"] == "Varsayılan notlar A"
        assert len(companyA["banklar"]) == 1
        assert companyA["banklar"][0]["iban"] == "TR00 0000"
        assert companyA["motorlar"] == ["Somfy", "Nice"]
        assert companyA["aydinlatmalar"] == ["LED-3000K", "LED-4000K"]
        assert companyA["sistemTipleri"] == ["Pistonlu Bioklimatik", "Sabit Kanopi"]
        assert companyA["hazirlayanEmails"] == ["prep@a.com"]
        assert "userId" in companyA and companyA["userId"].startswith("user_")

    def test_list_only_own(self, sA, sB, companyA):
        rA = sA.get(f"{API}/companies")
        rB = sB.get(f"{API}/companies")
        assert rA.status_code == 200 and rB.status_code == 200
        ids_A = {c["id"] for c in rA.json()}
        ids_B = {c["id"] for c in rB.json()}
        assert companyA["id"] in ids_A
        assert companyA["id"] not in ids_B  # multi-tenant isolation
        assert all("_id" not in c for c in rA.json())

    def test_put_persists_all_new_fields(self, sA, companyA):
        payload = {
            "sirketAdi": companyA["sirketAdi"],
            "adres": "Yeni Adres A",
            "ozelNotlar": "Güncellenmiş notlar",
            "banklar": [
                {"banka": "ZIRAAT", "turu": "ZIRAAT (USD)", "hesapSahibi": "SKYART", "iban": "TR11 1111"},
                {"banka": "GARANTI", "turu": "GARANTI (EUR)", "hesapSahibi": "SKYART", "iban": "TR22 2222"},
            ],
            "motorlar": ["Somfy", "Nice", "Becker"],
            "aydinlatmalar": ["LED-3000K"],
            "sistemTipleri": ["Pistonlu Bioklimatik"],
            "hazirlayanEmails": ["a@x.com", "b@x.com"],
        }
        r = sA.put(f"{API}/companies/{companyA['id']}", json=payload)
        assert r.status_code == 200, r.text
        # Verify persistence via GET
        got = sA.get(f"{API}/companies/{companyA['id']}").json()
        assert got["ozelNotlar"] == "Güncellenmiş notlar"
        assert len(got["banklar"]) == 2
        assert got["motorlar"] == ["Somfy", "Nice", "Becker"]
        assert got["hazirlayanEmails"] == ["a@x.com", "b@x.com"]
        assert "_id" not in got

    def test_cross_tenant_get_returns_404(self, sB, companyA):
        r = sB.get(f"{API}/companies/{companyA['id']}")
        assert r.status_code == 404

    def test_cross_tenant_put_returns_404(self, sB, companyA):
        r = sB.put(f"{API}/companies/{companyA['id']}", json={"sirketAdi": "HIJACK"})
        assert r.status_code == 404

    def test_cross_tenant_delete_returns_404(self, sB, companyA):
        r = sB.delete(f"{API}/companies/{companyA['id']}")
        assert r.status_code == 404


# =========================================================================
# 3. Catalog multi-tenant + CRUD
# =========================================================================
class TestCatalog:
    def test_create_and_isolation(self, sA, sB, companyA):
        r = sA.post(f"{API}/catalog", json={
            "companyId": companyA["id"], "kategori": "TEST",
            "urunAdi": "TEST_CatA", "birimFiyat": 100.0, "paraBirimi": "USD",
        })
        assert r.status_code == 200
        item = r.json()
        assert "_id" not in item
        assert item["userId"] == companyA["userId"]

        # userB cannot list this company's catalog
        rB = sB.get(f"{API}/catalog/{companyA['id']}")
        assert rB.status_code == 404

        # userB cannot update userA's item
        upd = sB.put(f"{API}/catalog/{item['id']}", json={
            "companyId": companyA["id"], "urunAdi": "HIJACK", "birimFiyat": 1
        })
        assert upd.status_code == 404

        # userA can update
        upd2 = sA.put(f"{API}/catalog/{item['id']}", json={
            "companyId": companyA["id"], "urunAdi": "TEST_CatA_v2", "birimFiyat": 200
        })
        assert upd2.status_code == 200
        assert upd2.json()["urunAdi"] == "TEST_CatA_v2"

    def test_bulk_create(self, sA, companyA):
        r = sA.post(f"{API}/catalog/bulk", json={
            "companyId": companyA["id"],
            "items": [
                {"companyId": companyA["id"], "urunAdi": "TEST_Bulk_A", "birimFiyat": 10},
                {"companyId": companyA["id"], "urunAdi": "TEST_Bulk_B", "birimFiyat": 20},
            ],
        })
        assert r.status_code == 200
        assert len(r.json()) == 2
        assert all("_id" not in x and x["userId"] for x in r.json())


# =========================================================================
# 4. Customers multi-tenant
# =========================================================================
class TestCustomer:
    def test_create_and_isolation(self, sA, sB, companyA):
        r = sA.post(f"{API}/customers", json={
            "companyId": companyA["id"], "firma": "TEST_Cust_A"
        })
        assert r.status_code == 200
        assert "_id" not in r.json()

        rB = sB.get(f"{API}/customers/{companyA['id']}")
        assert rB.status_code == 404  # not their company


# =========================================================================
# 5. Quotes - modes + totals + isolation
# =========================================================================
class TestQuote:
    def test_create_with_three_modes_and_totals(self, sA, companyA):
        payload = {
            "companyId": companyA["id"],
            "teklifNo": "AT-TEST-MODES",
            "tarih": "2026-01-15",
            "gecerlilik": "2026-02-15",
            "hazirlayanEmail": "prep@a.com",
            "musFirma": "TEST_QC_A",
            "musYetkili": "Y",
            "iskonto": 10,
            "kdvOrani": 20,
            "items": [
                {
                    "mode": "technical",
                    "urunAdi": "Pistonlu Bioklimatik Sistem",
                    "sistemTipi": "Pistonlu Bioklimatik",
                    "genislikMm": 4000,
                    "uzunlukMm": 6000,
                    "yukseklikMm": 3000,
                    "motor": "Somfy",
                    "aydinlatma": "LED-3000K",
                    "kopukDolgu": True,
                    "ralAna": "RAL 9005",
                    "ralPanel": "RAL 9016",
                    "ekBilgi": "Yanyana, Demonte",
                    "adet": 1, "birim": "Adet", "birimFiyat": 1000,
                },
                {
                    "mode": "manual",
                    "urunAdi": "Aksesuar Paketi",
                    "customFields": [
                        {"key": "Renk", "value": "Antrasit"},
                        {"key": "Boy", "value": "2m"},
                    ],
                    "adet": 2, "birim": "Adet", "birimFiyat": 100,
                },
                {
                    "mode": "general",
                    "urunAdi": "Nakliye",
                    "adet": 1, "birim": "Hizmet", "birimFiyat": 50,
                },
            ],
        }
        r = sA.post(f"{API}/quotes", json=payload)
        assert r.status_code == 200, r.text
        q = r.json()
        assert "_id" not in q
        assert q["userId"] == companyA["userId"]
        # subtotal = 1000 + 200 + 50 = 1250; iskonto 10% = 125; araToplam 1125; kdv 20% = 225; genel 1350
        assert q["iskontoTutar"] == pytest.approx(125.0)
        assert q["araToplam"] == pytest.approx(1125.0)
        assert q["kdvTutar"] == pytest.approx(225.0)
        assert q["genelToplam"] == pytest.approx(1350.0)
        # Persistence of mode-specific fields
        tech = next(i for i in q["items"] if i["mode"] == "technical")
        assert tech["sistemTipi"] == "Pistonlu Bioklimatik"
        assert tech["genislikMm"] == 4000
        assert tech["motor"] == "Somfy"
        assert tech["aydinlatma"] == "LED-3000K"
        assert tech["kopukDolgu"] is True
        assert tech["ralAna"] == "RAL 9005"
        assert tech["ralPanel"] == "RAL 9016"
        assert tech["ekBilgi"] == "Yanyana, Demonte"
        manual = next(i for i in q["items"] if i["mode"] == "manual")
        assert len(manual["customFields"]) == 2
        assert manual["customFields"][0] == {"key": "Renk", "value": "Antrasit"}
        pytest.quote_id_A = q["id"]

    def test_cross_tenant_isolation(self, sB, companyA):
        # userB cannot list quotes for userA's company
        r = sB.get(f"{API}/quotes/{companyA['id']}")
        assert r.status_code == 404
        # userB cannot update or delete userA's quote
        qid = getattr(pytest, "quote_id_A", None)
        assert qid
        r2 = sB.put(f"{API}/quotes/{qid}", json={
            "companyId": companyA["id"], "teklifNo": "H",
            "tarih": "2026-01-01", "gecerlilik": "2026-02-01", "musFirma": "H",
            "items": [],
        })
        assert r2.status_code == 404
        r3 = sB.patch(f"{API}/quotes/{qid}/status", json={"durum": "İptal"})
        assert r3.status_code == 404
        r4 = sB.delete(f"{API}/quotes/{qid}")
        # delete returns ok=True regardless (soft), but data should be untouched
        assert r4.status_code == 200

    def test_userA_quote_survives_userB_delete_attempt(self, sA):
        qid = getattr(pytest, "quote_id_A", None)
        # After userB's DELETE attempt, verify userA still sees the quote
        r = sA.get(f"{API}/companies")
        # find via list quotes on companyA
        assert r.status_code == 200
        # We locate quote via user's list
        for c in r.json():
            lr = sA.get(f"{API}/quotes/{c['id']}")
            if lr.status_code == 200:
                if any(x["id"] == qid for x in lr.json()):
                    return
        pytest.fail("userA's quote was removed by userB delete — multi-tenancy BROKEN")

    def test_patch_status_and_update(self, sA):
        qid = getattr(pytest, "quote_id_A", None)
        r = sA.patch(f"{API}/quotes/{qid}/status", json={"durum": "Onaylandı"})
        assert r.status_code == 200
        assert r.json()["durum"] == "Onaylandı"


# =========================================================================
# 6. Cascade delete
# =========================================================================
def test_cascade_delete(sA):
    c = sA.post(f"{API}/companies", json={"sirketAdi": f"TEST_CascadeCo_{uuid.uuid4().hex[:6]}"}).json()
    cid = c["id"]
    sA.post(f"{API}/catalog", json={"companyId": cid, "urunAdi": "TEST_X"})
    sA.post(f"{API}/customers", json={"companyId": cid, "firma": "TEST_C"})
    sA.post(f"{API}/quotes", json={
        "companyId": cid, "teklifNo": "AT-CD1",
        "tarih": "2026-01-01", "gecerlilik": "2026-02-01",
        "musFirma": "TEST_QC", "items": [],
    })
    dr = sA.delete(f"{API}/companies/{cid}")
    assert dr.status_code == 200
    # cascaded — GET on missing company returns 404 (not the collection but sub-list)
    assert sA.get(f"{API}/companies/{cid}").status_code == 404
    assert sA.get(f"{API}/catalog/{cid}").status_code == 404
    assert sA.get(f"{API}/customers/{cid}").status_code == 404
    assert sA.get(f"{API}/quotes/{cid}").status_code == 404
