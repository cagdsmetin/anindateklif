"""Backend tests for Anında Teklif API.
Covers Company/Catalog/Customer/Quote CRUD, computed totals, cascade delete, bulk import,
status update, and MongoDB _id leakage protection.
"""
import os
import uuid
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://app-genesis-52.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def company(s):
    payload = {
        "sirketAdi": f"TEST_Company_{uuid.uuid4().hex[:6]}",
        "adres": "Test Adres",
        "telefon": "+90 555 000 0000",
        "email": "test@example.com",
        "hazirlayanEmails": ["a@x.com", "b@x.com"],
    }
    r = s.post(f"{API}/companies", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "_id" not in data
    assert data["sirketAdi"] == payload["sirketAdi"]
    yield data
    # cleanup
    s.delete(f"{API}/companies/{data['id']}")


# ----- Health -----
def test_health(s):
    r = s.get(f"{API}/")
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


# ----- Company -----
class TestCompany:
    def test_list_companies_no_objectid(self, s, company):
        r = s.get(f"{API}/companies")
        assert r.status_code == 200
        docs = r.json()
        assert isinstance(docs, list)
        assert all("_id" not in d for d in docs)
        assert any(d["id"] == company["id"] for d in docs)

    def test_get_company(self, s, company):
        r = s.get(f"{API}/companies/{company['id']}")
        assert r.status_code == 200
        assert r.json()["id"] == company["id"]

    def test_update_company(self, s, company):
        payload = {
            "sirketAdi": company["sirketAdi"],
            "adres": "Yeni Adres",
            "telefon": "+90 111",
            "email": "new@example.com",
            "hazirlayanEmails": ["updated@x.com"],
        }
        r = s.put(f"{API}/companies/{company['id']}", json=payload)
        assert r.status_code == 200
        assert r.json()["adres"] == "Yeni Adres"
        # Verify persistence
        got = s.get(f"{API}/companies/{company['id']}").json()
        assert got["adres"] == "Yeni Adres"
        assert got["hazirlayanEmails"] == ["updated@x.com"]

    def test_get_nonexistent(self, s):
        r = s.get(f"{API}/companies/nonexistent-id")
        assert r.status_code == 404


# ----- Catalog -----
class TestCatalog:
    def test_create_and_list_catalog(self, s, company):
        payload = {
            "companyId": company["id"],
            "kategori": "TEST",
            "urunAdi": "TEST_Urun_1",
            "birim": "Adet",
            "birimFiyat": 100.5,
            "paraBirimi": "USD",
        }
        r = s.post(f"{API}/catalog", json=payload)
        assert r.status_code == 200
        item = r.json()
        assert "_id" not in item
        assert item["urunAdi"] == "TEST_Urun_1"
        # list & verify
        lr = s.get(f"{API}/catalog/{company['id']}")
        assert lr.status_code == 200
        assert any(i["id"] == item["id"] for i in lr.json())

    def test_bulk_create(self, s, company):
        payload = {
            "companyId": company["id"],
            "items": [
                {"companyId": company["id"], "urunAdi": "TEST_Bulk_A", "birimFiyat": 10},
                {"companyId": company["id"], "urunAdi": "TEST_Bulk_B", "birimFiyat": 20},
                {"companyId": company["id"], "urunAdi": "TEST_Bulk_C", "birimFiyat": 30},
            ],
        }
        r = s.post(f"{API}/catalog/bulk", json=payload)
        assert r.status_code == 200
        created = r.json()
        assert len(created) == 3
        assert all("_id" not in c for c in created)

    def test_update_delete_catalog(self, s, company):
        r = s.post(f"{API}/catalog", json={
            "companyId": company["id"], "urunAdi": "TEST_ToUpdate", "birimFiyat": 5
        })
        item_id = r.json()["id"]
        upd = s.put(f"{API}/catalog/{item_id}", json={
            "companyId": company["id"], "urunAdi": "TEST_Updated", "birimFiyat": 99
        })
        assert upd.status_code == 200
        assert upd.json()["urunAdi"] == "TEST_Updated"
        # delete
        dr = s.delete(f"{API}/catalog/{item_id}")
        assert dr.status_code == 200


# ----- Customer -----
class TestCustomer:
    def test_create_customer_upsert(self, s, company):
        payload = {"companyId": company["id"], "firma": "TEST_Cust_A", "yetkili": "Y1"}
        r = s.post(f"{API}/customers", json=payload)
        assert r.status_code == 200
        first_id = r.json()["id"]
        assert "_id" not in r.json()
        # posting same firma should upsert (replace, keep id)
        payload2 = {"companyId": company["id"], "firma": "TEST_Cust_A", "yetkili": "Y2"}
        r2 = s.post(f"{API}/customers", json=payload2)
        assert r2.status_code == 200
        assert r2.json()["yetkili"] == "Y2"
        assert r2.json()["id"] == first_id

    def test_list_customers(self, s, company):
        r = s.get(f"{API}/customers/{company['id']}")
        assert r.status_code == 200
        assert all("_id" not in c for c in r.json())


# ----- Quotes -----
class TestQuote:
    def test_create_quote_computes_totals(self, s, company):
        payload = {
            "companyId": company["id"],
            "teklifNo": "AT-TEST01",
            "tarih": "2026-01-01",
            "gecerlilik": "2026-02-01",
            "musFirma": "TEST_QuoteCust",
            "musYetkili": "YY",
            "musTelefon": "555",
            "musEmail": "q@x.com",
            "musAdres": "A",
            "iskonto": 10,
            "kdvOrani": 20,
            "items": [
                {"id": "i1", "urunAdi": "P1", "adet": 2, "birim": "Adet", "birimFiyat": 100},
                {"id": "i2", "urunAdi": "P2", "adet": 1, "birim": "Adet", "birimFiyat": 50},
            ],
        }
        r = s.post(f"{API}/quotes", json=payload)
        assert r.status_code == 200, r.text
        q = r.json()
        assert "_id" not in q
        # subtotal = 250, iskonto 10% = 25, araToplam = 225, kdv 20% = 45, genel = 270
        assert q["iskontoTutar"] == pytest.approx(25.0)
        assert q["araToplam"] == pytest.approx(225.0)
        assert q["kdvTutar"] == pytest.approx(45.0)
        assert q["genelToplam"] == pytest.approx(270.0)
        # Customer upsert side-effect
        cust_list = s.get(f"{API}/customers/{company['id']}").json()
        assert any(c["firma"] == "TEST_QuoteCust" for c in cust_list)
        # Save id for later
        pytest.quote_id = q["id"]

    def test_list_quotes(self, s, company):
        r = s.get(f"{API}/quotes/{company['id']}")
        assert r.status_code == 200
        docs = r.json()
        assert isinstance(docs, list)
        assert all("_id" not in d for d in docs)

    def test_patch_status(self, s):
        qid = getattr(pytest, "quote_id", None)
        assert qid, "quote_id not set"
        r = s.patch(f"{API}/quotes/{qid}/status", json={"durum": "Onaylandı"})
        assert r.status_code == 200
        assert r.json()["durum"] == "Onaylandı"

    def test_update_quote_recomputes(self, s, company):
        qid = getattr(pytest, "quote_id", None)
        payload = {
            "companyId": company["id"],
            "teklifNo": "AT-TEST01",
            "tarih": "2026-01-01",
            "gecerlilik": "2026-02-01",
            "musFirma": "TEST_QuoteCust",
            "iskonto": 0,
            "kdvOrani": 20,
            "items": [{"id": "i1", "urunAdi": "P1", "adet": 1, "birim": "Adet", "birimFiyat": 100}],
        }
        r = s.put(f"{API}/quotes/{qid}", json=payload)
        assert r.status_code == 200
        q = r.json()
        assert q["araToplam"] == pytest.approx(100.0)
        assert q["kdvTutar"] == pytest.approx(20.0)
        assert q["genelToplam"] == pytest.approx(120.0)


# ----- Cascade delete -----
def test_cascade_delete(s):
    # Create isolated company with dependents
    c = s.post(f"{API}/companies", json={"sirketAdi": "TEST_CascadeCo"}).json()
    cid = c["id"]
    s.post(f"{API}/catalog", json={"companyId": cid, "urunAdi": "TEST_X"})
    s.post(f"{API}/customers", json={"companyId": cid, "firma": "TEST_Cust"})
    s.post(f"{API}/quotes", json={
        "companyId": cid,
        "teklifNo": "AT-CD1",
        "tarih": "2026-01-01",
        "gecerlilik": "2026-02-01",
        "musFirma": "TEST_QC",
        "items": [],
    })
    dr = s.delete(f"{API}/companies/{cid}")
    assert dr.status_code == 200
    # ensure cascaded
    assert s.get(f"{API}/catalog/{cid}").json() == []
    assert s.get(f"{API}/customers/{cid}").json() == []
    assert s.get(f"{API}/quotes/{cid}").json() == []
    # get company 404
    assert s.get(f"{API}/companies/{cid}").status_code == 404
