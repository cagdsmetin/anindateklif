"""Customer endpoint regression tests (2026-01) — accompany the new UI screens
in /app/frontend/app/(tabs)/customers.tsx and /app/frontend/app/customer-add.tsx.

Focus:
- POST /api/customers accepts firma/yetkili/telefon/email/adres from the new form.
- GET /api/customers/{companyId} returns the created rows without leaking `_id`.
- DELETE /api/customers/{id} removes the row and honours multi-tenancy.
- Auth is required on POST/DELETE/GET.
- Multi-tenancy: user B cannot list or delete user A's customers.
- Upsert behaviour on the same (companyId, firma, telefon) triple (regression:
  server.py:599 uses replace_one when an existing match is found).
"""
import os
import uuid
import pytest
import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"
STRONG_PW = "Test1234!"


def _uniq_email(tag: str) -> str:
    return f"e2e+cust+{tag}+{uuid.uuid4().hex[:8]}@example.com"


def _register_and_session(tag: str):
    payload = {"email": _uniq_email(tag), "password": STRONG_PW, "name": f"Cust {tag}", "phone": "5550001111"}
    r = requests.post(f"{API}/auth/register", json=payload)
    assert r.status_code == 201, r.text
    tok = r.json()["access_token"]
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {tok}"})
    return s, r.json()["user"]


@pytest.fixture(scope="module")
def sessA():
    s, u = _register_and_session("A")
    return s, u


@pytest.fixture(scope="module")
def sessB():
    s, u = _register_and_session("B")
    return s, u


@pytest.fixture(scope="module")
def companyA(sessA):
    s, _ = sessA
    payload = {
        "sirketAdi": f"TEST_CustCoA_{uuid.uuid4().hex[:6]}",
        "adres": "Adres A",
        "telefon": "0555 111 2233",
        "email": "co-a@example.com",
    }
    r = s.post(f"{API}/companies", json=payload)
    assert r.status_code == 200, r.text
    return r.json()


# =========================================================================
# 1. POST /api/customers — new UI form maps to these fields exactly.
#    Frontend field labels:
#      "Ad Soyad / Firma Ünvanı"  -> backend `firma`
#      "Şirket Adı" (opsiyonel)   -> backend `yetkili`
#      "Telefon"                  -> backend `telefon`
#      "E-posta Adresi"           -> backend `email`
#      "Adres"                    -> backend `adres`
# =========================================================================
class TestCustomerCreate:
    def test_create_customer_with_all_new_ui_fields(self, sessA, companyA):
        s, _ = sessA
        payload = {
            "companyId": companyA["id"],
            "firma": "TEST_Ahmet Yılmaz",
            "yetkili": "TEST_Şirket A.Ş.",
            "telefon": "0532 111 22 33",
            "email": "ahmet@example.com",
            "adres": "İstanbul, Kadıköy",
        }
        r = s.post(f"{API}/customers", json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "_id" not in body
        assert body["firma"] == payload["firma"]
        assert body["yetkili"] == payload["yetkili"]
        assert body["telefon"] == payload["telefon"]
        assert body["email"] == payload["email"]
        assert body["adres"] == payload["adres"]
        assert body["companyId"] == companyA["id"]
        assert body["id"]
        pytest.cust_id_A = body["id"]

    def test_get_customer_persists_and_no_objectid(self, sessA, companyA):
        s, _ = sessA
        r = s.get(f"{API}/customers/{companyA['id']}")
        assert r.status_code == 200
        rows = r.json()
        found = next((c for c in rows if c["id"] == pytest.cust_id_A), None)
        assert found is not None, "Customer just created not returned by GET"
        assert "_id" not in found
        assert found["firma"] == "TEST_Ahmet Yılmaz"
        assert found["yetkili"] == "TEST_Şirket A.Ş."

    def test_create_customer_with_minimal_fields_only(self, sessA, companyA):
        """Frontend requires firma+telefon; yetkili/email/adres are optional."""
        s, _ = sessA
        payload = {
            "companyId": companyA["id"],
            "firma": "TEST_Minimal Müşteri",
            "telefon": "0533 000 00 00",
        }
        r = s.post(f"{API}/customers", json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["firma"] == "TEST_Minimal Müşteri"
        assert body["telefon"] == "0533 000 00 00"
        assert body["yetkili"] == ""
        assert body["email"] == ""
        assert body["adres"] == ""

    def test_create_customer_requires_companyId(self, sessA):
        s, _ = sessA
        r = s.post(f"{API}/customers", json={"firma": "X", "telefon": "1"})
        assert r.status_code in (400, 422)

    def test_create_customer_upserts_when_firma_and_telefon_match(self, sessA, companyA):
        """server.py:599 upserts on (companyId, firma, telefon). Editing from
        the new /customer-add?id=... screen re-POSTs and expects an UPDATE,
        not a duplicate row."""
        s, _ = sessA
        base = {
            "companyId": companyA["id"],
            "firma": "TEST_UpsertKey",
            "telefon": "0555 111 22 33",
        }
        r1 = s.post(f"{API}/customers", json={**base, "email": "v1@x.com", "adres": "V1", "yetkili": "Y1"})
        assert r1.status_code == 200
        first_id = r1.json()["id"]

        # Same firma + telefon triggers upsert (replace_one).
        r2 = s.post(f"{API}/customers", json={**base, "email": "v2@x.com", "adres": "V2", "yetkili": "Y2"})
        assert r2.status_code == 200
        assert r2.json()["id"] == first_id, "Upsert must reuse the existing id"

        # GET confirms exactly one row for that firma with v2 values.
        rows = s.get(f"{API}/customers/{companyA['id']}").json()
        matches = [c for c in rows if c["firma"] == "TEST_UpsertKey"]
        assert len(matches) == 1
        assert matches[0]["email"] == "v2@x.com"
        assert matches[0]["adres"] == "V2"
        assert matches[0]["yetkili"] == "Y2"


# =========================================================================
# 2. DELETE /api/customers/{id}
# =========================================================================
class TestCustomerDelete:
    def test_delete_removes_customer(self, sessA, companyA):
        s, _ = sessA
        # Create one
        r = s.post(f"{API}/customers", json={
            "companyId": companyA["id"],
            "firma": f"TEST_ToDelete_{uuid.uuid4().hex[:5]}",
            "telefon": "0500 000 00 00",
        })
        assert r.status_code == 200
        cid = r.json()["id"]

        # Delete
        d = s.delete(f"{API}/customers/{cid}")
        assert d.status_code == 200

        # GET no longer returns it
        rows = s.get(f"{API}/customers/{companyA['id']}").json()
        assert not any(c["id"] == cid for c in rows)


# =========================================================================
# 3. Multi-tenancy: user B cannot see or delete user A's customers.
# =========================================================================
class TestCustomerMultiTenancy:
    def test_userB_cannot_list_userA_customers(self, sessB, companyA):
        sB, _ = sessB
        # _own_company guard: user B does not own companyA -> 404 (stricter than
        # returning an empty list — verified via server.py:_own_company).
        r = sB.get(f"{API}/customers/{companyA['id']}")
        assert r.status_code == 404, (
            f"Multi-tenancy leak: user B got status {r.status_code} on GET /customers/{{userA.company}} — expected 404."
        )

    def test_userB_cannot_delete_userA_customer(self, sessA, sessB, companyA):
        sA, _ = sessA
        sB, _ = sessB
        # A creates
        r = sA.post(f"{API}/customers", json={
            "companyId": companyA["id"],
            "firma": f"TEST_MTOwnedByA_{uuid.uuid4().hex[:5]}",
            "telefon": "0511 000 00 00",
        })
        assert r.status_code == 200
        cid = r.json()["id"]

        # B tries to delete
        dB = sB.delete(f"{API}/customers/{cid}")
        # server responds 200 but delete filter is scoped -> A's row remains.
        # Verify A still sees it.
        rows = sA.get(f"{API}/customers/{companyA['id']}").json()
        assert any(c["id"] == cid for c in rows), (
            "Multi-tenancy leak: user B was able to delete user A's customer."
        )
        # Cleanup
        sA.delete(f"{API}/customers/{cid}")


# =========================================================================
# 4. Auth guards on customer endpoints
# =========================================================================
class TestCustomerAuth:
    def test_post_requires_auth(self, companyA):
        r = requests.post(f"{API}/customers", json={
            "companyId": companyA["id"], "firma": "X", "telefon": "1",
        })
        assert r.status_code == 401

    def test_get_requires_auth(self, companyA):
        r = requests.get(f"{API}/customers/{companyA['id']}")
        assert r.status_code == 401

    def test_delete_requires_auth(self):
        r = requests.delete(f"{API}/customers/does-not-matter")
        assert r.status_code == 401
