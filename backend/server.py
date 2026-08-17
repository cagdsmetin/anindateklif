from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends, Form
from fastapi.responses import RedirectResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import json
import asyncio
import logging
import hashlib
import secrets as py_secrets
import bcrypt
import jwt
from pathlib import Path
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'change-me-please-not-secure')
JWT_ISSUER = os.environ.get('JWT_ISSUER', 'anindateklif-api')
JWT_AUDIENCE = os.environ.get('JWT_AUDIENCE', 'anindateklif-client')
JWT_ALGORITHM = 'HS256'
ACCESS_TOKEN_MINUTES = 60 * 24 * 7  # 7 days for MVP
RESET_TOKEN_MINUTES = 30

# ============ MONETIZATION CONFIG ============
FREE_MONTHLY_QUOTE_LIMIT = 5
SUBSCRIPTION_PRICE_TRY = 149.0
SUBSCRIPTION_DURATION_DAYS = 30

# Comma-separated list of emails that always get unlimited free access, no
# subscription required. Managed entirely via the FREE_ACCESS_EMAILS env var
# on Railway -- add/remove an email there any time, no code change or
# redeploy needed (the service picks up the new value on its next restart,
# which Railway does automatically when you edit a variable).
FREE_ACCESS_EMAILS = set(
    e.strip().lower() for e in os.environ.get("FREE_ACCESS_EMAILS", "").split(",") if e.strip()
)

BACKEND_BASE_URL = os.environ.get("BACKEND_BASE_URL", "https://anindateklif-production.up.railway.app")
FRONTEND_BASE_URL = os.environ.get("FRONTEND_BASE_URL", "https://just-mercy-production.up.railway.app")
WHATSAPP_SUPPORT_NUMBER = os.environ.get("WHATSAPP_SUPPORT_NUMBER", "")

IYZICO_API_KEY = os.environ.get("IYZICO_API_KEY", "")
IYZICO_SECRET_KEY = os.environ.get("IYZICO_SECRET_KEY", "")
IYZICO_BASE_URL = os.environ.get("IYZICO_BASE_URL", "https://sandbox-api.iyzipay.com")


def _iyzico_options():
    return {"api_key": IYZICO_API_KEY, "secret_key": IYZICO_SECRET_KEY, "base_url": IYZICO_BASE_URL}


ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
_anthropic_client = None
if ANTHROPIC_API_KEY:
    try:
        import anthropic
        _anthropic_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    except Exception:
        _anthropic_client = None

ASSISTANT_SYSTEM_PROMPT = (
    "Sen 'Anında Teklif' uygulamasının Türkçe konuşan yapay zeka asistanısın. "
    "Kullanıcılara uygulamayı nasıl kullanacaklarını anlatır VE teklif (fiyat teklifi/proforma) hazırlamalarına "
    "yardımcı olursun: ürün/hizmet açıklamasından teklif kalemi metni önerirsin, fiyatlandırma notu ve genel "
    "teklif notları için taslak yazarsın. Kısa, net ve profesyonel bir Türkçe kullan. Kullanıcı adına gerçek "
    "bir işlem (kayıt, ödeme, silme vb.) yapamazsın; sadece metin önerisi/taslak üretirsin."
)

# Dummy hash for timing-safe login (mitigates account enumeration)
_DUMMY_HASH = bcrypt.hashpw(b"dummy-password-not-used", bcrypt.gensalt()).decode()

app = FastAPI(title="Anında Teklif API")
api_router = APIRouter(prefix="/api")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_now_iso() -> str:
    return utc_now().isoformat()


# ============ AUTH ============
def _utc(): return datetime.now(timezone.utc)


def _normalize_email(e: str) -> str:
    return (e or "").strip().lower()


def _validate_password(p: str) -> str:
    if not p or len(p) < 8:
        raise ValueError("Şifre en az 8 karakter olmalıdır")
    if not re.search(r"[a-z]", p):
        raise ValueError("Şifre en az bir küçük harf içermelidir")
    if not re.search(r"[A-Z]", p):
        raise ValueError("Şifre en az bir büyük harf içermelidir")
    if not re.search(r"\d", p):
        raise ValueError("Şifre en az bir rakam içermelidir")
    if not re.search(r"[^A-Za-z0-9]", p):
        raise ValueError("Şifre en az bir sembol içermelidir")
    return p


def _hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def _verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False


def _sha256(v: str) -> str:
    return hashlib.sha256(v.encode()).hexdigest()


def _make_access_token(user: Dict[str, Any]) -> str:
    now = _utc()
    payload = {
        "sub": user["user_id"],
        "email": user["email"],
        "type": "access",
        "jti": str(uuid.uuid4()),
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
        "iat": now,
        "exp": now + timedelta(minutes=ACCESS_TOKEN_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str
    phone: Optional[str] = ""

    @field_validator("password")
    @classmethod
    def _pw(cls, v: str) -> str:
        try:
            return _validate_password(v)
        except ValueError as e:
            raise ValueError(str(e))


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class UserOut(BaseModel):
    user_id: str
    email: str
    name: str = ""
    phone: str = ""
    picture: str = ""
    country: str = ""
    currency: str = ""
    tax_label: str = ""
    onboarding_completed: bool = False


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class UserProfileUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    country: Optional[str] = None
    currency: Optional[str] = None
    tax_label: Optional[str] = None
    onboarding_completed: Optional[bool] = None


async def get_current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Empty token")
    try:
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
            issuer=JWT_ISSUER,
            audience=JWT_AUDIENCE,
        )
        if payload.get("type") != "access" or not payload.get("sub"):
            raise HTTPException(status_code=401, detail="Invalid token type")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def _user_out(u: Dict[str, Any]) -> UserOut:
    return UserOut(
        user_id=u["user_id"],
        email=u["email"],
        name=u.get("name", ""),
        phone=u.get("phone", ""),
        picture=u.get("picture", ""),
        country=u.get("country", ""),
        currency=u.get("currency", ""),
        tax_label=u.get("tax_label", ""),
        onboarding_completed=bool(u.get("onboarding_completed", False)),
    )


# ============ QUOTA / SUBSCRIPTION HELPERS ============
def _current_period_key() -> str:
    now = _utc()
    return f"{now.year:04d}-{now.month:02d}"


def _is_subscription_active(user: Dict[str, Any]) -> bool:
    email = (user.get("email") or "").strip().lower()
    if email in FREE_ACCESS_EMAILS:
        return True
    exp = user.get("subscription_expires_at")
    if not exp:
        return False
    if isinstance(exp, str):
        try:
            exp = datetime.fromisoformat(exp)
        except Exception:
            return False
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    return exp > _utc()


async def _get_quota_state(user: Dict[str, Any]) -> Dict[str, Any]:
    period = _current_period_key()
    stored_period = user.get("monthly_quote_period")
    count = user.get("monthly_quote_count", 0) if stored_period == period else 0
    active = _is_subscription_active(user)
    remaining = None if active else max(0, FREE_MONTHLY_QUOTE_LIMIT - count)
    return {
        "period": period,
        "count": count,
        "subscription_active": active,
        "free_limit": FREE_MONTHLY_QUOTE_LIMIT,
        "remaining_free": remaining,
    }


async def _enforce_and_increment_quota(user: Dict[str, Any]):
    """Raises 402 if the user is out of free quotes this month and has no active subscription.
    Otherwise increments (or resets + increments, on month rollover) the counter."""
    period = _current_period_key()
    stored_period = user.get("monthly_quote_period")
    count = user.get("monthly_quote_count", 0) if stored_period == period else 0
    active = _is_subscription_active(user)
    if not active and count >= FREE_MONTHLY_QUOTE_LIMIT:
        raise HTTPException(
            status_code=402,
            detail="Bu ay için 5 ücretsiz teklif hakkınızı kullandınız. Devam etmek için aboneliği başlatın.",
        )
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"monthly_quote_period": period, "monthly_quote_count": count + 1}},
    )


@api_router.post("/auth/register", response_model=AuthResponse, status_code=201)
async def register(payload: RegisterRequest):
    email = _normalize_email(payload.email)
    if await db.users.find_one({"email": email}, {"_id": 0}):
        raise HTTPException(status_code=409, detail="Bu e-posta zaten kayıtlı")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    user = {
        "user_id": user_id,
        "email": email,
        "hashed_password": _hash_password(payload.password),
        "name": (payload.name or "").strip(),
        "phone": (payload.phone or "").strip(),
        "picture": "",
        "country": "",
        "currency": "",
        "tax_label": "",
        "onboarding_completed": False,
        "createdAt": _utc().isoformat(),
    }
    await db.users.insert_one(user)
    access = _make_access_token(user)
    return AuthResponse(access_token=access, user=_user_out(user))


@api_router.post("/auth/login", response_model=AuthResponse)
async def login(payload: LoginRequest):
    email = _normalize_email(payload.email)
    u = await db.users.find_one({"email": email}, {"_id": 0})
    # timing-safe check
    valid = _verify_password(payload.password, u["hashed_password"] if u else _DUMMY_HASH)
    if not u or not valid or not u.get("hashed_password"):
        raise HTTPException(status_code=401, detail="E-posta veya şifre hatalı")
    access = _make_access_token(u)
    return AuthResponse(access_token=access, user=_user_out(u))


@api_router.post("/auth/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest):
    # Always respond identically to prevent enumeration.
    email = _normalize_email(payload.email)
    u = await db.users.find_one({"email": email}, {"_id": 0})
    if u:
        raw = py_secrets.token_urlsafe(32)
        await db.password_resets.insert_one({
            "token_hash": _sha256(raw),
            "user_id": u["user_id"],
            "expires_at": _utc() + timedelta(minutes=RESET_TOKEN_MINUTES),
            "used_at": None,
        })
        # In a real app, email raw to user. For MVP, we log it.
        logging.info(f"[PasswordReset] {email} token={raw}")
    return {"message": "Eğer bu e-posta kayıtlıysa, sıfırlama bağlantısı gönderildi."}


@api_router.post("/auth/reset-password")
async def reset_password(payload: ResetPasswordRequest):
    doc = await db.password_resets.find_one({"token_hash": _sha256(payload.token), "used_at": None}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=400, detail="Geçersiz veya kullanılmış sıfırlama bağlantısı")
    exp = doc.get("expires_at")
    if isinstance(exp, str):
        try: exp = datetime.fromisoformat(exp)
        except Exception: exp = None
    if not exp or (exp.tzinfo and exp < _utc()) or (not exp.tzinfo and exp.replace(tzinfo=timezone.utc) < _utc()):
        raise HTTPException(status_code=400, detail="Sıfırlama bağlantısının süresi dolmuş")
    try:
        _validate_password(payload.new_password)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    await db.users.update_one(
        {"user_id": doc["user_id"]},
        {"$set": {"hashed_password": _hash_password(payload.new_password)}},
    )
    await db.password_resets.update_one({"token_hash": doc["token_hash"]}, {"$set": {"used_at": _utc()}})
    return {"message": "Şifre başarıyla güncellendi"}


@api_router.get("/auth/me", response_model=UserOut)
async def auth_me(user=Depends(get_current_user)):
    return _user_out(user)


@api_router.patch("/auth/me", response_model=UserOut)
async def update_me(payload: UserProfileUpdate, user=Depends(get_current_user)):
    updates = {k: v for k, v in payload.dict(exclude_unset=True).items() if v is not None}
    if updates:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
    doc = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return _user_out(doc)


@api_router.post("/auth/logout")
async def auth_logout():
    # Stateless JWT — client discards token. Return OK for API symmetry.
    return {"ok": True}


# ============ MODELS ============
class BankAccount(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    banka: str = ""
    turu: str = ""  # e.g. "VAKIF KATILIM (TL)"
    hesapSahibi: str = ""
    iban: str = ""


class SystemField(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    label: str  # e.g. "Motor Çeşidi"
    type: str = "text"  # text | select | number | checkbox
    options: List[str] = Field(default_factory=list)  # only for select


class SystemTypeDef(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str  # e.g. "Cam Balkon"
    fields: List[SystemField] = Field(default_factory=list)


class Company(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    userId: str
    sirketAdi: str
    imzaMetni: str = ""
    logoBase64: str = ""
    adres: str = ""
    telefon: str = ""
    telefon2: str = ""
    email: str = ""
    website: str = ""
    vergiDairesi: str = ""
    vergiNo: str = ""
    ozelNotlar: str = ""  # PDF default notes
    banklar: List[BankAccount] = Field(default_factory=list)
    hazirlayanEmails: List[str] = Field(default_factory=list)
    sistemTipleri: List[SystemTypeDef] = Field(default_factory=list)
    createdAt: str = Field(default_factory=utc_now_iso)
    updatedAt: str = Field(default_factory=utc_now_iso)


class CompanyCreate(BaseModel):
    sirketAdi: str
    imzaMetni: str = ""
    logoBase64: str = ""
    adres: str = ""
    telefon: str = ""
    telefon2: str = ""
    email: str = ""
    website: str = ""
    vergiDairesi: str = ""
    vergiNo: str = ""
    ozelNotlar: str = ""
    banklar: List[BankAccount] = Field(default_factory=list)
    hazirlayanEmails: List[str] = Field(default_factory=list)
    sistemTipleri: List[SystemTypeDef] = Field(default_factory=list)


class CatalogItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    userId: str
    companyId: str
    kategori: str = "Genel"
    urunAdi: str
    aciklama: str = ""
    birim: str = "Adet"
    birimFiyat: float = 0.0
    paraBirimi: str = "USD"
    createdAt: str = Field(default_factory=utc_now_iso)


class CatalogItemCreate(BaseModel):
    companyId: str
    kategori: str = "Genel"
    urunAdi: str
    aciklama: str = ""
    birim: str = "Adet"
    birimFiyat: float = 0.0
    paraBirimi: str = "USD"


class CatalogBulkCreate(BaseModel):
    companyId: str
    items: List[CatalogItemCreate]


class Customer(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    userId: str
    companyId: str
    firma: str
    yetkili: str = ""
    telefon: str = ""
    email: str = ""
    adres: str = ""
    createdAt: str = Field(default_factory=utc_now_iso)


class CustomerCreate(BaseModel):
    companyId: str
    firma: str
    yetkili: str = ""
    telefon: str = ""
    email: str = ""
    adres: str = ""


class Service(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    userId: str
    companyId: str
    musFirma: str = ""
    musYetkili: str = ""
    musTelefon: str = ""
    baslik: str
    aciklama: str = ""
    servisTarihi: str = ""       # ISO date the installation/service took place
    garantiBitis: str = ""       # warranty end date (ISO), optional
    bakimTarihi: str = ""        # next scheduled maintenance date (ISO), optional
    durum: str = "Açık"          # Açık | Devam ediyor | Tamamlandı | İptal
    createdAt: str = Field(default_factory=utc_now_iso)
    updatedAt: str = Field(default_factory=utc_now_iso)


class ServiceCreate(BaseModel):
    companyId: str
    musFirma: str = ""
    musYetkili: str = ""
    musTelefon: str = ""
    baslik: str
    aciklama: str = ""
    servisTarihi: str = ""
    garantiBitis: str = ""
    bakimTarihi: str = ""
    durum: str = "Açık"


class ServiceStatusUpdate(BaseModel):
    durum: str


class QuoteItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    mode: str = "general"  # "technical" | "manual" | "general"
    urunAdi: str = ""
    # Technical mode
    sistemTipiId: str = ""     # references company.sistemTipleri[].id
    sistemTipi: str = ""       # snapshot name for display / PDF (e.g. "Cam Balkon")
    sistemFields: List[Dict[str, str]] = Field(default_factory=list)  # [{label, value}]
    # Manual mode
    customFields: List[Dict[str, str]] = Field(default_factory=list)  # [{key, value}]
    # General mode
    aciklama: str = ""
    # Common
    adet: float = 1
    birim: str = "Adet"
    birimFiyat: float = 0


class Quote(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    userId: str
    companyId: str
    teklifNo: str
    tarih: str
    gecerlilik: str
    hazirlayanEmail: str = ""
    musFirma: str
    musYetkili: str = ""
    musTelefon: str = ""
    musEmail: str = ""
    musAdres: str = ""
    projeAdi: str = ""
    nakliye: str = "EXW"
    paraBirimi: str = "USD"
    odemeSekli: str = ""
    mensei: str = "TÜRKİYE"
    teslimGun: str = ""
    iskonto: float = 0
    kdvOrani: float = 20
    notlar: str = ""
    items: List[QuoteItem] = Field(default_factory=list)
    ekler: List[Dict[str, str]] = Field(default_factory=list)  # [{id, baslik, icerik}]
    durum: str = "Beklemede"
    araToplam: float = 0
    iskontoTutar: float = 0
    kdvTutar: float = 0
    genelToplam: float = 0
    createdAt: str = Field(default_factory=utc_now_iso)
    updatedAt: str = Field(default_factory=utc_now_iso)


class QuoteCreate(BaseModel):
    companyId: str
    teklifNo: str
    tarih: str
    gecerlilik: str
    hazirlayanEmail: str = ""
    musFirma: str
    musYetkili: str = ""
    musTelefon: str = ""
    musEmail: str = ""
    musAdres: str = ""
    projeAdi: str = ""
    nakliye: str = "EXW"
    paraBirimi: str = "USD"
    odemeSekli: str = ""
    mensei: str = "TÜRKİYE"
    teslimGun: str = ""
    iskonto: float = 0
    kdvOrani: float = 20
    notlar: str = ""
    items: List[QuoteItem] = Field(default_factory=list)
    ekler: List[Dict[str, str]] = Field(default_factory=list)
    durum: str = "Beklemede"


class QuoteStatusUpdate(BaseModel):
    durum: str


class CampaignSend(BaseModel):
    sent: bool = False
    sentAt: Optional[str] = None


class Campaign(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    userId: str
    companyId: str
    baslik: str
    mesaj: str
    sends: Dict[str, CampaignSend] = Field(default_factory=dict)
    createdAt: str = Field(default_factory=utc_now_iso)
    updatedAt: str = Field(default_factory=utc_now_iso)


class CampaignCreate(BaseModel):
    companyId: str
    baslik: str
    mesaj: str


class CampaignMarkSent(BaseModel):
    customerId: str


# ============ HELPERS ============
def compute_totals(items: List[QuoteItem], iskonto: float, kdvOrani: float):
    subtotal = sum((it.adet or 0) * (it.birimFiyat or 0) for it in items)
    iskontoTutar = subtotal * (iskonto or 0) / 100
    araToplam = subtotal - iskontoTutar
    kdvTutar = araToplam * (kdvOrani or 0) / 100
    genelToplam = araToplam + kdvTutar
    return subtotal, iskontoTutar, kdvTutar, genelToplam


async def _own_company(user_id: str, company_id: str):
    doc = await db.companies.find_one({"id": company_id, "userId": user_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Company not found or not yours")
    return doc


# ============ COMPANY ROUTES ============
@api_router.get("/")
async def root():
    return {"message": "Anında Teklif API", "status": "ok"}


@api_router.get("/companies", response_model=List[Company])
async def list_companies(user=Depends(get_current_user)):
    docs = await db.companies.find({"userId": user["user_id"]}, {"_id": 0}).to_list(1000)
    return [Company(**d) for d in docs]


@api_router.post("/companies", response_model=Company)
async def create_company(payload: CompanyCreate, user=Depends(get_current_user)):
    obj = Company(userId=user["user_id"], **payload.dict())
    await db.companies.insert_one(obj.dict())
    return obj


@api_router.get("/companies/{company_id}", response_model=Company)
async def get_company(company_id: str, user=Depends(get_current_user)):
    doc = await _own_company(user["user_id"], company_id)
    return Company(**doc)


@api_router.put("/companies/{company_id}", response_model=Company)
async def update_company(company_id: str, payload: CompanyCreate, user=Depends(get_current_user)):
    doc = await _own_company(user["user_id"], company_id)
    updated = {**doc, **payload.dict(), "userId": user["user_id"], "updatedAt": utc_now_iso()}
    await db.companies.replace_one({"id": company_id, "userId": user["user_id"]}, updated)
    return Company(**updated)


@api_router.delete("/companies/{company_id}")
async def delete_company(company_id: str, user=Depends(get_current_user)):
    await _own_company(user["user_id"], company_id)
    uid = user["user_id"]
    await db.companies.delete_one({"id": company_id, "userId": uid})
    await db.catalog.delete_many({"companyId": company_id, "userId": uid})
    await db.customers.delete_many({"companyId": company_id, "userId": uid})
    await db.quotes.delete_many({"companyId": company_id, "userId": uid})
    await db.services.delete_many({"companyId": company_id, "userId": uid})
    await db.campaigns.delete_many({"companyId": company_id, "userId": uid})
    return {"ok": True}


# ============ CATALOG ROUTES ============
@api_router.get("/catalog/{company_id}", response_model=List[CatalogItem])
async def list_catalog(company_id: str, user=Depends(get_current_user)):
    await _own_company(user["user_id"], company_id)
    docs = await db.catalog.find({"companyId": company_id, "userId": user["user_id"]}, {"_id": 0}).to_list(2000)
    return [CatalogItem(**d) for d in docs]


@api_router.post("/catalog", response_model=CatalogItem)
async def create_catalog_item(payload: CatalogItemCreate, user=Depends(get_current_user)):
    await _own_company(user["user_id"], payload.companyId)
    obj = CatalogItem(userId=user["user_id"], **payload.dict())
    await db.catalog.insert_one(obj.dict())
    return obj


@api_router.post("/catalog/bulk", response_model=List[CatalogItem])
async def bulk_create_catalog(payload: CatalogBulkCreate, user=Depends(get_current_user)):
    await _own_company(user["user_id"], payload.companyId)
    created = []
    for it in payload.items:
        d = it.dict()
        d["companyId"] = payload.companyId
        obj = CatalogItem(userId=user["user_id"], **d)
        await db.catalog.insert_one(obj.dict())
        created.append(obj)
    return created


@api_router.put("/catalog/{item_id}", response_model=CatalogItem)
async def update_catalog_item(item_id: str, payload: CatalogItemCreate, user=Depends(get_current_user)):
    doc = await db.catalog.find_one({"id": item_id, "userId": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Item not found")
    updated = {**doc, **payload.dict()}
    await db.catalog.replace_one({"id": item_id, "userId": user["user_id"]}, updated)
    return CatalogItem(**updated)


@api_router.delete("/catalog/{item_id}")
async def delete_catalog_item(item_id: str, user=Depends(get_current_user)):
    await db.catalog.delete_one({"id": item_id, "userId": user["user_id"]})
    return {"ok": True}


# ============ CUSTOMER ROUTES ============
@api_router.get("/customers/{company_id}", response_model=List[Customer])
async def list_customers(company_id: str, user=Depends(get_current_user)):
    await _own_company(user["user_id"], company_id)
    docs = await db.customers.find({"companyId": company_id, "userId": user["user_id"]}, {"_id": 0}).to_list(2000)
    return [Customer(**d) for d in docs]


@api_router.post("/customers", response_model=Customer)
async def create_customer(payload: CustomerCreate, user=Depends(get_current_user)):
    await _own_company(user["user_id"], payload.companyId)
    existing = await db.customers.find_one(
        {"companyId": payload.companyId, "firma": payload.firma, "userId": user["user_id"]}, {"_id": 0}
    )
    if existing:
        updated = {**existing, **payload.dict()}
        await db.customers.replace_one({"id": existing["id"], "userId": user["user_id"]}, updated)
        return Customer(**updated)
    obj = Customer(userId=user["user_id"], **payload.dict())
    await db.customers.insert_one(obj.dict())
    return obj


@api_router.delete("/customers/{customer_id}")
async def delete_customer(customer_id: str, user=Depends(get_current_user)):
    await db.customers.delete_one({"id": customer_id, "userId": user["user_id"]})
    return {"ok": True}


# ============ SERVICE ROUTES (Servis & Garanti) ============
@api_router.get("/services/{company_id}", response_model=List[Service])
async def list_services(company_id: str, user=Depends(get_current_user)):
    await _own_company(user["user_id"], company_id)
    docs = await db.services.find({"companyId": company_id, "userId": user["user_id"]}, {"_id": 0}).sort("createdAt", -1).to_list(2000)
    return [Service(**d) for d in docs]


@api_router.post("/services", response_model=Service)
async def create_service(payload: ServiceCreate, user=Depends(get_current_user)):
    await _own_company(user["user_id"], payload.companyId)
    obj = Service(userId=user["user_id"], **payload.dict())
    await db.services.insert_one(obj.dict())
    return obj


@api_router.put("/services/{service_id}", response_model=Service)
async def update_service(service_id: str, payload: ServiceCreate, user=Depends(get_current_user)):
    doc = await db.services.find_one({"id": service_id, "userId": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Service not found")
    updated = {**doc, **payload.dict(), "updatedAt": utc_now_iso()}
    await db.services.replace_one({"id": service_id, "userId": user["user_id"]}, updated)
    return Service(**updated)


@api_router.patch("/services/{service_id}/status", response_model=Service)
async def update_service_status(service_id: str, payload: ServiceStatusUpdate, user=Depends(get_current_user)):
    doc = await db.services.find_one({"id": service_id, "userId": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Service not found")
    doc["durum"] = payload.durum
    doc["updatedAt"] = utc_now_iso()
    await db.services.replace_one({"id": service_id, "userId": user["user_id"]}, doc)
    return Service(**doc)


@api_router.delete("/services/{service_id}")
async def delete_service(service_id: str, user=Depends(get_current_user)):
    await db.services.delete_one({"id": service_id, "userId": user["user_id"]})
    return {"ok": True}


# ============ CAMPAIGN ROUTES (Kampanya) ============
@api_router.get("/campaigns/{company_id}", response_model=List[Campaign])
async def list_campaigns(company_id: str, user=Depends(get_current_user)):
    await _own_company(user["user_id"], company_id)
    docs = await db.campaigns.find({"companyId": company_id, "userId": user["user_id"]}, {"_id": 0}).sort("createdAt", -1).to_list(2000)
    return [Campaign(**d) for d in docs]


@api_router.post("/campaigns", response_model=Campaign)
async def create_campaign(payload: CampaignCreate, user=Depends(get_current_user)):
    await _own_company(user["user_id"], payload.companyId)
    obj = Campaign(userId=user["user_id"], **payload.dict())
    await db.campaigns.insert_one(obj.dict())
    return obj


@api_router.patch("/campaigns/{campaign_id}/mark-sent", response_model=Campaign)
async def mark_campaign_sent(campaign_id: str, payload: CampaignMarkSent, user=Depends(get_current_user)):
    doc = await db.campaigns.find_one({"id": campaign_id, "userId": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Campaign not found")
    sends = doc.get("sends") or {}
    sends[payload.customerId] = {"sent": True, "sentAt": utc_now_iso()}
    doc["sends"] = sends
    doc["updatedAt"] = utc_now_iso()
    await db.campaigns.replace_one({"id": campaign_id, "userId": user["user_id"]}, doc)
    return Campaign(**doc)


@api_router.delete("/campaigns/{campaign_id}")
async def delete_campaign(campaign_id: str, user=Depends(get_current_user)):
    await db.campaigns.delete_one({"id": campaign_id, "userId": user["user_id"]})
    return {"ok": True}


# ============ QUOTE ROUTES ============
@api_router.get("/quotes/{company_id}", response_model=List[Quote])
async def list_quotes(company_id: str, user=Depends(get_current_user)):
    await _own_company(user["user_id"], company_id)
    docs = await db.quotes.find({"companyId": company_id, "userId": user["user_id"]}, {"_id": 0}).sort("createdAt", -1).to_list(2000)
    return [Quote(**d) for d in docs]


@api_router.post("/quotes", response_model=Quote)
async def create_quote(payload: QuoteCreate, user=Depends(get_current_user)):
    await _own_company(user["user_id"], payload.companyId)
    await _enforce_and_increment_quota(user)
    data = payload.dict()
    items = [QuoteItem(**it) if isinstance(it, dict) else it for it in data.get("items", [])]
    data["items"] = [it.dict() for it in items]
    subtotal, iskontoTutar, kdvTutar, genelToplam = compute_totals(items, data["iskonto"], data["kdvOrani"])
    data["araToplam"] = subtotal - iskontoTutar
    data["iskontoTutar"] = iskontoTutar
    data["kdvTutar"] = kdvTutar
    data["genelToplam"] = genelToplam
    obj = Quote(userId=user["user_id"], **data)
    await db.quotes.insert_one(obj.dict())
    # upsert customer
    if obj.musFirma:
        existing = await db.customers.find_one(
            {"companyId": obj.companyId, "userId": user["user_id"], "firma": obj.musFirma}, {"_id": 0}
        )
        payload_c = {
            "companyId": obj.companyId,
            "userId": user["user_id"],
            "firma": obj.musFirma,
            "yetkili": obj.musYetkili,
            "telefon": obj.musTelefon,
            "email": obj.musEmail,
            "adres": obj.musAdres,
        }
        if existing:
            await db.customers.update_one({"id": existing["id"]}, {"$set": payload_c})
        else:
            new_c = Customer(**payload_c)
            await db.customers.insert_one(new_c.dict())
    return obj


@api_router.put("/quotes/{quote_id}", response_model=Quote)
async def update_quote(quote_id: str, payload: QuoteCreate, user=Depends(get_current_user)):
    doc = await db.quotes.find_one({"id": quote_id, "userId": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Quote not found")
    data = payload.dict()
    items = [QuoteItem(**it) if isinstance(it, dict) else it for it in data.get("items", [])]
    data["items"] = [it.dict() for it in items]
    subtotal, iskontoTutar, kdvTutar, genelToplam = compute_totals(items, data["iskonto"], data["kdvOrani"])
    data["araToplam"] = subtotal - iskontoTutar
    data["iskontoTutar"] = iskontoTutar
    data["kdvTutar"] = kdvTutar
    data["genelToplam"] = genelToplam
    data["updatedAt"] = utc_now_iso()
    updated = {**doc, **data}
    await db.quotes.replace_one({"id": quote_id, "userId": user["user_id"]}, updated)
    return Quote(**updated)


@api_router.patch("/quotes/{quote_id}/status", response_model=Quote)
async def update_quote_status(quote_id: str, payload: QuoteStatusUpdate, user=Depends(get_current_user)):
    doc = await db.quotes.find_one({"id": quote_id, "userId": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Quote not found")
    doc["durum"] = payload.durum
    doc["updatedAt"] = utc_now_iso()
    await db.quotes.replace_one({"id": quote_id, "userId": user["user_id"]}, doc)
    return Quote(**doc)


@api_router.delete("/quotes/{quote_id}")
async def delete_quote(quote_id: str, user=Depends(get_current_user)):
    await db.quotes.delete_one({"id": quote_id, "userId": user["user_id"]})
    return {"ok": True}


# ============ APP CONFIG (public) ============
class AppConfig(BaseModel):
    whatsapp_number: str = ""
    ai_assistant_enabled: bool = False
    subscription_price_try: float = SUBSCRIPTION_PRICE_TRY
    payment_enabled: bool = False


@api_router.get("/config", response_model=AppConfig)
async def get_app_config():
    return AppConfig(
        whatsapp_number=WHATSAPP_SUPPORT_NUMBER,
        ai_assistant_enabled=bool(_anthropic_client),
        subscription_price_try=SUBSCRIPTION_PRICE_TRY,
        payment_enabled=bool(IYZICO_API_KEY and IYZICO_SECRET_KEY),
    )


# ============ SUBSCRIPTION / QUOTA ============
class SubscriptionStatus(BaseModel):
    subscription_active: bool
    subscription_expires_at: Optional[str] = None
    plan_price_try: float = SUBSCRIPTION_PRICE_TRY
    period: str
    quotes_used_this_month: int
    free_limit: int
    remaining_free: Optional[int] = None


@api_router.get("/subscription/status", response_model=SubscriptionStatus)
async def subscription_status(user=Depends(get_current_user)):
    state = await _get_quota_state(user)
    return SubscriptionStatus(
        subscription_active=state["subscription_active"],
        subscription_expires_at=user.get("subscription_expires_at"),
        plan_price_try=SUBSCRIPTION_PRICE_TRY,
        period=state["period"],
        quotes_used_this_month=state["count"],
        free_limit=state["free_limit"],
        remaining_free=state["remaining_free"],
    )


class SubscriptionCheckoutRequest(BaseModel):
    buyer_identity_number: str
    billing_address: str
    billing_city: str
    billing_zip: str = ""


class SubscriptionCheckoutResponse(BaseModel):
    payment_page_url: Optional[str] = None
    checkout_form_content: Optional[str] = None
    token: str


@api_router.post("/subscription/checkout", response_model=SubscriptionCheckoutResponse)
async def create_subscription_checkout(payload: SubscriptionCheckoutRequest, user=Depends(get_current_user)):
    if not IYZICO_API_KEY or not IYZICO_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Ödeme sistemi henüz yapılandırılmadı")
    import iyzipay

    name_parts = (user.get("name") or "Müşteri").strip().split(" ", 1)
    first_name = name_parts[0] or "Müşteri"
    last_name = name_parts[1] if len(name_parts) > 1 else "-"
    conversation_id = f"sub_{user['user_id']}_{uuid.uuid4().hex[:8]}"
    address = payload.billing_address or "-"
    city = payload.billing_city or "İstanbul"
    zip_code = payload.billing_zip or "34000"

    request = {
        "locale": "tr",
        "conversationId": conversation_id,
        "price": f"{SUBSCRIPTION_PRICE_TRY:.2f}",
        "paidPrice": f"{SUBSCRIPTION_PRICE_TRY:.2f}",
        "currency": "TRY",
        "basketId": f"sub_{user['user_id']}_{utc_now().strftime('%Y%m')}",
        "paymentGroup": "SUBSCRIPTION",
        "callbackUrl": f"{BACKEND_BASE_URL.rstrip('/')}/api/subscription/callback",
        "buyer": {
            "id": user["user_id"],
            "name": first_name,
            "surname": last_name,
            "gsmNumber": user.get("phone") or "+905000000000",
            "email": user["email"],
            "identityNumber": payload.buyer_identity_number,
            "registrationAddress": address,
            "ip": "85.34.78.112",
            "city": city,
            "country": "Turkey",
            "zipCode": zip_code,
        },
        "shippingAddress": {
            "contactName": user.get("name") or "Müşteri",
            "city": city,
            "country": "Turkey",
            "address": address,
            "zipCode": zip_code,
        },
        "billingAddress": {
            "contactName": user.get("name") or "Müşteri",
            "city": city,
            "country": "Turkey",
            "address": address,
            "zipCode": zip_code,
        },
        "basketItems": [{
            "id": "anindateklif_monthly",
            "name": "Anında Teklif Aylık Abonelik",
            "category1": "Yazılım",
            "itemType": "VIRTUAL",
            "price": f"{SUBSCRIPTION_PRICE_TRY:.2f}",
        }],
    }
    cf = iyzipay.CheckoutFormInitialize()
    result = await asyncio.to_thread(cf.create, request, _iyzico_options())
    response = json.load(result)
    if response.get("status") != "success":
        raise HTTPException(status_code=502, detail=response.get("errorMessage", "Ödeme başlatılamadı"))
    await db.subscription_payments.insert_one({
        "user_id": user["user_id"],
        "token": response["token"],
        "conversation_id": conversation_id,
        "status": "pending",
        "created_at": utc_now_iso(),
    })
    return SubscriptionCheckoutResponse(
        payment_page_url=response.get("paymentPageUrl"),
        checkout_form_content=response.get("checkoutFormContent"),
        token=response["token"],
    )


@api_router.post("/subscription/callback")
async def subscription_callback(token: str = Form(...)):
    import iyzipay

    request = {"locale": "tr", "conversationId": str(uuid.uuid4()), "token": token}
    cf = iyzipay.CheckoutForm()
    result = await asyncio.to_thread(cf.retrieve, request, _iyzico_options())
    response = json.load(result)

    pending = await db.subscription_payments.find_one({"token": token}, {"_id": 0})
    user_id = pending["user_id"] if pending else None
    success = response.get("status") == "success" and response.get("paymentStatus") == "SUCCESS"

    if success and user_id:
        new_expiry = utc_now() + timedelta(days=SUBSCRIPTION_DURATION_DAYS)
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"subscription_status": "active", "subscription_expires_at": new_expiry.isoformat()}},
        )
        if pending:
            await db.subscription_payments.update_one(
                {"token": token}, {"$set": {"status": "paid", "payment_id": response.get("paymentId")}}
            )
        redirect_url = f"{FRONTEND_BASE_URL.rstrip('/')}/subscription-result?status=success"
    else:
        if pending:
            await db.subscription_payments.update_one({"token": token}, {"$set": {"status": "failed"}})
        redirect_url = f"{FRONTEND_BASE_URL.rstrip('/')}/subscription-result?status=failed"

    return RedirectResponse(url=redirect_url, status_code=302)


# ============ AI ASSISTANT ============
class AssistantChatRequest(BaseModel):
    message: str
    quote_context: Optional[Dict[str, Any]] = None


class AssistantChatResponse(BaseModel):
    reply: str


@api_router.post("/assistant/chat", response_model=AssistantChatResponse)
async def assistant_chat(payload: AssistantChatRequest, user=Depends(get_current_user)):
    if not _anthropic_client:
        raise HTTPException(status_code=503, detail="Yapay zeka asistanı henüz yapılandırılmadı")
    user_message = (payload.message or "").strip()
    if not user_message:
        raise HTTPException(status_code=422, detail="Mesaj boş olamaz")
    context_note = ""
    if payload.quote_context:
        try:
            context_note = "\n\nMevcut teklif taslağı bilgileri (JSON):\n" + json.dumps(payload.quote_context, ensure_ascii=False)
        except Exception:
            context_note = ""
    try:
        resp = await asyncio.to_thread(
            _anthropic_client.messages.create,
            model="claude-sonnet-5",
            max_tokens=1024,
            system=ASSISTANT_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message + context_note}],
        )
        reply_text = "".join(
            block.text for block in resp.content if getattr(block, "type", None) == "text"
        ).strip()
    except Exception as e:
        logger.error(f"Assistant chat error: {e}")
        raise HTTPException(status_code=502, detail="Asistan şu anda yanıt veremiyor, lütfen tekrar deneyin")
    return AssistantChatResponse(reply=reply_text or "Üzgünüm, şu anda bir yanıt oluşturamadım.")


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def on_startup():
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("user_id", unique=True)
        await db.password_resets.create_index("token_hash", unique=True)
        await db.password_resets.create_index("expires_at", expireAfterSeconds=0)
    except Exception as e:
        logger.warning(f"Index setup issue: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
