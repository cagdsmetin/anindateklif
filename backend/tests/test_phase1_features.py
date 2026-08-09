"""Phase 1 backend regression tests for Anında Teklif (2026-01).

Focus:
- POST /api/quotes with new `ekler: [{id, baslik, icerik}]` field persists and GET returns it.
- POST /api/companies persists `imzaMetni` (regression from prior session).
- PUT /api/companies/{id} preserves reordered `sistemTipleri[i].fields` order round-trip.
- Multi-tenancy still enforced on companies + quotes.
- MongoDB `_id` never leaks.
"""
import os
import uuid
import pytest
import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"
STRONG_PW = "Test1234!"


def _uniq_email(tag: str) -> str:
    return f"e2e+phase1+{tag}+{uuid.uuid4().hex[:8]}@example.com"


def _register_and_session(tag: str):
    payload = {"email": _uniq_email(tag), "password": STRONG_PW, "name": f"P1 {tag}", "phone": "5550001111"}
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
        "sirketAdi": f"TEST_P1_CoA_{uuid.uuid4().hex[:6]}",
        "imzaMetni": "Saygılarımızla,\nSatış Ekibi",
        "adres": "Adres A",
        "telefon": "0555 111 2233",
        "email": "co-a@example.com",
        "sistemTipleri": [
            {
                "id": "sys-1",
                "name": "Cam Balkon",
                "fields": [
                    {"id": "f-a", "label": "Genişlik", "type": "text", "options": []},
                    {"id": "f-b", "label": "Yükseklik", "type": "text", "options": []},
                    {"id": "f-c", "label": "Renk", "type": "select", "options": ["Beyaz", "Siyah"]},
                ],
            }
        ],
    }
    r = s.post(f"{API}/companies", json=payload)
    assert r.status_code == 200, r.text
    return r.json()


# =========================================================================
# 1. Company.imzaMetni regression + creation persistence
# =========================================================================
class TestCompanyImzaMetni:
    def test_post_persists_imzaMetni(self, companyA):
        assert "_id" not in companyA
        assert companyA["imzaMetni"] == "Saygılarımızla,\nSatış Ekibi"

    def test_get_returns_imzaMetni(self, sessA, companyA):
        s, _ = sessA
        got = s.get(f"{API}/companies/{companyA['id']}")
        assert got.status_code == 200
        body = got.json()
        assert body["imzaMetni"] == "Saygılarımızla,\nSatış Ekibi"
        assert "_id" not in body


# =========================================================================
# 2. PUT /api/companies preserves reordered sistemTipleri[i].fields
# =========================================================================
class TestCompanyReorderFields:
    def test_put_persists_reordered_fields(self, sessA, companyA):
        s, _ = sessA
        # Reverse the fields order: c, b, a
        original_fields = companyA["sistemTipleri"][0]["fields"]
        new_order = [original_fields[2], original_fields[0], original_fields[1]]
        # Expected labels order after PUT: Renk, Genişlik, Yükseklik
        expected_labels = [f["label"] for f in new_order]

        put_payload = {
            "sirketAdi": companyA["sirketAdi"],
            "imzaMetni": companyA["imzaMetni"],
            "sistemTipleri": [
                {
                    "id": companyA["sistemTipleri"][0]["id"],
                    "name": companyA["sistemTipleri"][0]["name"],
                    "fields": new_order,
                }
            ],
        }
        r = s.put(f"{API}/companies/{companyA['id']}", json=put_payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert [f["label"] for f in body["sistemTipleri"][0]["fields"]] == expected_labels

        # Round-trip via GET
        got = s.get(f"{API}/companies/{companyA['id']}")
        assert got.status_code == 200
        got_labels = [f["label"] for f in got.json()["sistemTipleri"][0]["fields"]]
        assert got_labels == expected_labels
        # ids preserved
        got_ids = [f["id"] for f in got.json()["sistemTipleri"][0]["fields"]]
        assert got_ids == [f["id"] for f in new_order]


# =========================================================================
# 3. Quote.ekler persistence — NEW field
# =========================================================================
class TestQuoteEkler:
    def test_post_quote_persists_ekler(self, sessA, companyA):
        s, _ = sessA
        ekler = [
            {"id": "ek-1", "baslik": "Teknik Şartname", "icerik": "Alüminyum profil, 6mm cam..."},
            {"id": "ek-2", "baslik": "Garanti Koşulları", "icerik": "2 yıl imalat garantisi."},
        ]
        payload = {
            "companyId": companyA["id"],
            "teklifNo": f"AT-P1-{uuid.uuid4().hex[:6]}",
            "tarih": "2026-01-15",
            "gecerlilik": "2026-02-15",
            "musFirma": "TEST_MusFirma_P1",
            "musYetkili": "Ali Veli",
            "iskonto": 0,
            "kdvOrani": 20,
            "items": [
                {"mode": "general", "urunAdi": "Test Ürün", "adet": 1, "birim": "Adet", "birimFiyat": 500}
            ],
            "ekler": ekler,
        }
        r = s.post(f"{API}/quotes", json=payload)
        assert r.status_code == 200, r.text
        q = r.json()
        assert "_id" not in q
        assert isinstance(q.get("ekler"), list)
        assert len(q["ekler"]) == 2
        assert q["ekler"][0]["baslik"] == "Teknik Şartname"
        assert q["ekler"][0]["icerik"].startswith("Alüminyum")
        assert q["ekler"][1]["id"] == "ek-2"
        pytest.p1_quote_id = q["id"]

    def test_get_quote_returns_ekler(self, sessA, companyA):
        s, _ = sessA
        qid = getattr(pytest, "p1_quote_id", None)
        assert qid, "prior test did not set p1_quote_id"
        lr = s.get(f"{API}/quotes/{companyA['id']}")
        assert lr.status_code == 200
        found = next((x for x in lr.json() if x["id"] == qid), None)
        assert found is not None
        assert len(found["ekler"]) == 2
        assert [e["baslik"] for e in found["ekler"]] == ["Teknik Şartname", "Garanti Koşulları"]
        assert "_id" not in found

    def test_put_quote_updates_ekler(self, sessA, companyA):
        s, _ = sessA
        qid = getattr(pytest, "p1_quote_id", None)
        payload = {
            "companyId": companyA["id"],
            "teklifNo": f"AT-P1-UPD-{uuid.uuid4().hex[:6]}",
            "tarih": "2026-01-15",
            "gecerlilik": "2026-02-15",
            "musFirma": "TEST_MusFirma_P1",
            "iskonto": 0,
            "kdvOrani": 20,
            "items": [
                {"mode": "general", "urunAdi": "Test Ürün", "adet": 1, "birim": "Adet", "birimFiyat": 500}
            ],
            "ekler": [{"id": "ek-only", "baslik": "Tek Ek", "icerik": "Tek içerik"}],
        }
        r = s.put(f"{API}/quotes/{qid}", json=payload)
        assert r.status_code == 200, r.text
        assert len(r.json()["ekler"]) == 1
        assert r.json()["ekler"][0]["baslik"] == "Tek Ek"

    def test_post_quote_without_ekler_defaults_to_empty_list(self, sessA, companyA):
        s, _ = sessA
        payload = {
            "companyId": companyA["id"],
            "teklifNo": f"AT-P1-NOEK-{uuid.uuid4().hex[:6]}",
            "tarih": "2026-01-15",
            "gecerlilik": "2026-02-15",
            "musFirma": "TEST_NoEkler",
            "iskonto": 0,
            "kdvOrani": 20,
            "items": [
                {"mode": "general", "urunAdi": "X", "adet": 1, "birim": "Adet", "birimFiyat": 10}
            ],
        }
        r = s.post(f"{API}/quotes", json=payload)
        assert r.status_code == 200
        assert r.json()["ekler"] == []


# =========================================================================
# 4. Multi-tenancy — B cannot see or write A's quote/ekler
# =========================================================================
class TestMultiTenancy:
    def test_userB_cannot_list_userA_quotes(self, sessB, companyA):
        sB, _ = sessB
        r = sB.get(f"{API}/quotes/{companyA['id']}")
        assert r.status_code == 404

    def test_userB_cannot_update_userA_quote_ekler(self, sessB, companyA):
        sB, _ = sessB
        qid = getattr(pytest, "p1_quote_id", None)
        assert qid
        r = sB.put(f"{API}/quotes/{qid}", json={
            "companyId": companyA["id"],
            "teklifNo": "HIJACK",
            "tarih": "2026-01-01",
            "gecerlilik": "2026-02-01",
            "musFirma": "H",
            "items": [],
            "ekler": [{"id": "x", "baslik": "HIJACK", "icerik": "..."}],
        })
        assert r.status_code == 404

    def test_userB_cannot_read_userA_company(self, sessB, companyA):
        sB, _ = sessB
        r = sB.get(f"{API}/companies/{companyA['id']}")
        assert r.status_code == 404


# =========================================================================
# 5. Auth still guards these endpoints
# =========================================================================
def test_quotes_post_requires_auth(companyA):
    r = requests.post(f"{API}/quotes", json={
        "companyId": companyA["id"], "teklifNo": "X", "tarih": "2026-01-01",
        "gecerlilik": "2026-02-01", "musFirma": "X", "items": [], "ekler": [],
    })
    assert r.status_code == 401
