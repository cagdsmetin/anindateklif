from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends, Form, Request
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
import requests
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

# Weekly / yearly subscription tiers (monthly plan retired — weekly gives a low-
# commitment entry point, yearly is the discounted "taahhütlü" option).
SUBSCRIPTION_PLANS = {
    "weekly": {
        "price_try": 50.0,
        "duration_days": 7,
        "label": "Haftalık Abonelik",
        "iyzico_item_id": "anindateklif_weekly",
    },
    "yearly": {
        "price_try": 2000.0,
        "list_price_try": 2400.0,
        "duration_days": 365,
        "label": "Yıllık Abonelik",
        "iyzico_item_id": "anindateklif_yearly",
    },
}
DEFAULT_SUBSCRIPTION_PLAN = "yearly"
# Backward-compat alias for any stray reference to the old single-tier price.
SUBSCRIPTION_PRICE_TRY = SUBSCRIPTION_PLANS[DEFAULT_SUBSCRIPTION_PLAN]["price_try"]

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

# Explicit CORS allowlist — override via the ALLOWED_ORIGINS env var (comma
# separated) if a new frontend domain goes live without a code change.
ALLOWED_ORIGINS = [
    o.strip() for o in os.environ.get(
        "ALLOWED_ORIGINS",
        f"{FRONTEND_BASE_URL},https://anindateklif.co,https://www.anindateklif.co",
    ).split(",") if o.strip()
]

MAX_LOGO_BASE64_CHARS = 2_800_000  # ~2MB decoded

IYZICO_API_KEY = os.environ.get("IYZICO_API_KEY", "")
IYZICO_SECRET_KEY = os.environ.get("IYZICO_SECRET_KEY", "")
IYZICO_BASE_URL = os.environ.get("IYZICO_BASE_URL", "https://sandbox-api.iyzipay.com")

# Resend (https://resend.com) transactional email — used to deliver password-reset
# links. If RESEND_API_KEY is unset, forgot_password() falls back to logging the
# reset link (dev/MVP mode) instead of raising — the API always behaves the same
# either way, it just won't actually reach the user's inbox until the key is set.
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
RESEND_FROM_EMAIL = os.environ.get("RESEND_FROM_EMAIL", "Anında Teklif <onboarding@resend.dev>")

# WhatsApp OTP telefon doğrulama (Twilio). Hesap/API anahtarı olmadan bu
# özellik sessizce devre dışı kalır — /auth/phone/send-code net bir hata döner.
TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_WHATSAPP_FROM = os.environ.get("TWILIO_WHATSAPP_FROM", "")  # örn: "whatsapp:+14155238886"


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
    "bir işlem (kayıt, ödeme, silme vb.) yapamazsın; sadece metin önerisi/taslak üretirsin.\n\n"
    "EK YETENEK — Katalog Yapılandırıcı önerisi: Uygulamada 'Katalog' sekmesinde kullanıcılar sattıkları "
    "ürün/hizmet için tekrar kullanılabilir bir alan seti (ör. ölçü, motor markası, renk) tanımlayabilir. "
    "Kullanıcı hangi ürün/hizmeti sattığını VE teklif hazırlarken hangi değişken alanları (ölçü, tip, marka, "
    "renk, seçenek vb.) girmesi gerektiğini yeterince açık anlattıysa, normal cevabının en sonuna, ayrı bir "
    "satırda SADECE şu formatta bir JSON bloğu ekle (kullanıcı bunu görmeyecek, arka planda ayıklanacak):\n"
    "```json\n"
    "{\"action\": \"add_system_type\", \"name\": \"<ürün/hizmet tipi adı>\", \"fields\": ["
    "{\"label\": \"<alan adı>\", \"type\": \"text|number|select|checkbox\", "
    "\"options\": [\"...\"]}]}\n"
    "```\n"
    "Kurallar: 'options' sadece type=select ise ve en az 2 seçenekle doldurulur, diğer tiplerde boş dizi olur. "
    "Kullanıcı yeterince bilgi vermediyse veya sadece genel bir soru soruyorsa bu JSON bloğunu KESİNLİKLE EKLEME, "
    "bunun yerine hangi bilgilere ihtiyacın olduğunu sor. En fazla 8 alan öner."
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


# ============ RATE LIMITING ============
# Simple in-memory sliding window — enough for a single-replica deploy. If
# this service ever scales to multiple replicas, swap the dict below for a
# shared store (e.g. Redis) so limits are enforced consistently across them.
import time as _time
from collections import defaultdict as _defaultdict

_rate_buckets: Dict[str, list] = _defaultdict(list)


def _rate_limit(key: str, max_requests: int, window_seconds: int) -> None:
    now = _time.time()
    bucket = _rate_buckets[key]
    cutoff = now - window_seconds
    while bucket and bucket[0] < cutoff:
        bucket.pop(0)
    if len(bucket) >= max_requests:
        raise HTTPException(status_code=429, detail="Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar deneyin.")
    bucket.append(now)


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def _send_password_reset_email(to_email: str, reset_link: str):
    """Send the password-reset link via Resend. Silently falls back to a log
    line if RESEND_API_KEY isn't configured yet, so forgot_password() never
    has to change behavior based on whether email delivery is set up."""
    if not RESEND_API_KEY:
        logging.info(f"[PasswordReset] RESEND_API_KEY not set, link={reset_link}")
        return
    try:
        resp = await asyncio.to_thread(
            requests.post,
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
            json={
                "from": RESEND_FROM_EMAIL,
                "to": [to_email],
                "subject": "Şifre Sıfırlama - Anında Teklif",
                "html": (
                    "<div style=\"font-family: sans-serif; max-width: 480px; margin: 0 auto;\">"
                    "<h2>Şifreni Sıfırla</h2>"
                    "<p>Anında Teklif hesabın için şifre sıfırlama talebinde bulundun. Aşağıdaki bağlantıya "
                    "tıklayarak yeni şifreni belirleyebilirsin. Bu bağlantı 30 dakika geçerlidir.</p>"
                    f"<p><a href=\"{reset_link}\" style=\"display:inline-block;background:#2563eb;color:#fff;"
                    "padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;\">Şifremi Sıfırla</a></p>"
                    "<p>Eğer bu talebi sen yapmadıysan bu e-postayı yok sayabilirsin.</p>"
                    "</div>"
                ),
            },
            timeout=10,
        )
        if resp.status_code >= 300:
            logging.warning(f"[PasswordReset] resend send failed status={resp.status_code} body={resp.text[:300]}")
    except Exception as e:
        logging.warning(f"[PasswordReset] resend send exception: {e}")


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
    phone_verified: bool = False
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
    if payload.get("jti") and await db.revoked_tokens.find_one({"jti": payload["jti"]}):
        raise HTTPException(status_code=401, detail="Session expired")
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
        phone_verified=bool(u.get("phone_verified", False)),
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
async def register(payload: RegisterRequest, request: Request):
    _rate_limit(f"register:ip:{_client_ip(request)}", 8, 3600)
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
async def login(payload: LoginRequest, request: Request):
    email = _normalize_email(payload.email)
    _rate_limit(f"login:ip:{_client_ip(request)}", 20, 300)
    _rate_limit(f"login:email:{email}", 8, 900)
    u = await db.users.find_one({"email": email}, {"_id": 0})
    # timing-safe check
    valid = _verify_password(payload.password, u["hashed_password"] if u else _DUMMY_HASH)
    if not u or not valid or not u.get("hashed_password"):
        raise HTTPException(status_code=401, detail="E-posta veya şifre hatalı")
    access = _make_access_token(u)
    return AuthResponse(access_token=access, user=_user_out(u))


@api_router.post("/auth/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest, request: Request):
    # Always respond identically to prevent enumeration.
    email = _normalize_email(payload.email)
    _rate_limit(f"forgot:ip:{_client_ip(request)}", 10, 3600)
    _rate_limit(f"forgot:email:{email}", 3, 900)
    u = await db.users.find_one({"email": email}, {"_id": 0})
    if u:
        raw = py_secrets.token_urlsafe(32)
        await db.password_resets.insert_one({
            "token_hash": _sha256(raw),
            "user_id": u["user_id"],
            "expires_at": _utc() + timedelta(minutes=RESET_TOKEN_MINUTES),
            "used_at": None,
        })
        reset_link = f"{FRONTEND_BASE_URL.rstrip('/')}/reset-password?token={raw}"
        await _send_password_reset_email(email, reset_link)
        # Intentionally not logging the raw token/link — anyone with log
        # access could otherwise hijack the reset.
        logging.info(f"[PasswordReset] Reset link issued for {email}")
    return {"message": "Eğer bu e-posta kayıtlıysa, sıfırlama bağlantısı gönderildi."}


@api_router.post("/auth/reset-password")
async def reset_password(payload: ResetPasswordRequest, request: Request):
    _rate_limit(f"reset:ip:{_client_ip(request)}", 20, 900)
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


# ============ PHONE VERIFICATION (WhatsApp OTP via Twilio) ============
# In-memory store is fine here: codes are short-lived (5 dk) and this endpoint
# is per-user/per-IP rate limited, so losing state on a restart just means the
# user asks for a new code — no data-loss risk.
_phone_otp_store: Dict[str, Dict[str, Any]] = {}
_OTP_TTL_SECONDS = 300


class PhoneSendCodeRequest(BaseModel):
    phone: str


class PhoneVerifyCodeRequest(BaseModel):
    phone: str
    code: str


def _normalize_phone(raw: str) -> str:
    digits = re.sub(r"[^\d+]", "", raw or "")
    if digits and not digits.startswith("+"):
        # Varsayılan TR: 0 ile başlıyorsa +90 ile değiştir, yoksa +90 ekle
        digits = digits.lstrip("0")
        digits = "+90" + digits
    return digits


@api_router.post("/auth/phone/send-code")
async def phone_send_code(payload: PhoneSendCodeRequest, request: Request, user=Depends(get_current_user)):
    if not (TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_WHATSAPP_FROM):
        raise HTTPException(
            status_code=503,
            detail="Telefon doğrulama şu an yapılandırılmadı (Twilio bilgileri eksik). Lütfen daha sonra tekrar deneyin.",
        )
    phone = _normalize_phone(payload.phone)
    if len(phone) < 8:
        raise HTTPException(status_code=400, detail="Geçerli bir telefon numarası giriniz")

    _rate_limit(f"otp-send:user:{user['user_id']}", 5, 3600)
    _rate_limit(f"otp-send:ip:{_client_ip(request)}", 10, 3600)

    code = f"{py_secrets.randbelow(1000000):06d}"
    _phone_otp_store[f"{user['user_id']}:{phone}"] = {
        "code": code,
        "expires_at": _time.time() + _OTP_TTL_SECONDS,
        "attempts": 0,
    }

    try:
        resp = await asyncio.to_thread(
            requests.post,
            f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json",
            auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN),
            data={
                "From": TWILIO_WHATSAPP_FROM,
                "To": f"whatsapp:{phone}",
                "Body": f"Anında Teklif doğrulama kodunuz: {code} (5 dakika geçerlidir)",
            },
            timeout=10,
        )
        if resp.status_code >= 300:
            logging.error(f"[phone-otp] Twilio send failed: {resp.status_code} {resp.text[:300]}")
            raise HTTPException(status_code=502, detail="Kod gönderilemedi, lütfen daha sonra tekrar deneyin")
    except HTTPException:
        raise
    except Exception:
        logging.exception("[phone-otp] Twilio send exception")
        raise HTTPException(status_code=502, detail="Kod gönderilemedi, lütfen daha sonra tekrar deneyin")

    return {"ok": True, "phone": phone}


@api_router.post("/auth/phone/verify-code")
async def phone_verify_code(payload: PhoneVerifyCodeRequest, user=Depends(get_current_user)):
    phone = _normalize_phone(payload.phone)
    key = f"{user['user_id']}:{phone}"
    entry = _phone_otp_store.get(key)
    if not entry:
        raise HTTPException(status_code=400, detail="Önce doğrulama kodu isteyin")
    if _time.time() > entry["expires_at"]:
        _phone_otp_store.pop(key, None)
        raise HTTPException(status_code=400, detail="Kodun süresi doldu, yeni kod isteyin")
    entry["attempts"] += 1
    if entry["attempts"] > 5:
        _phone_otp_store.pop(key, None)
        raise HTTPException(status_code=429, detail="Çok fazla hatalı deneme, yeni kod isteyin")
    if payload.code.strip() != entry["code"]:
        raise HTTPException(status_code=400, detail="Kod hatalı")

    _phone_otp_store.pop(key, None)
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"phone": phone, "phone_verified": True}},
    )
    doc = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return _user_out(doc)


@api_router.post("/auth/logout")
async def auth_logout(authorization: Optional[str] = Header(None)):
    # Revoke this specific token server-side (by jti) so a stolen/leaked
    # token stops working immediately instead of staying valid until it
    # naturally expires.
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:].strip()
        try:
            payload = jwt.decode(
                token, JWT_SECRET, algorithms=[JWT_ALGORITHM],
                issuer=JWT_ISSUER, audience=JWT_AUDIENCE,
                options={"verify_exp": False},
            )
            jti = payload.get("jti")
            exp = payload.get("exp")
            if jti:
                expires_at = datetime.fromtimestamp(exp, tz=timezone.utc) if exp else _utc() + timedelta(minutes=ACCESS_TOKEN_MINUTES)
                await db.revoked_tokens.update_one(
                    {"jti": jti},
                    {"$set": {"jti": jti, "revoked_at": utc_now_iso(), "expires_at": expires_at}},
                    upsert=True,
                )
        except Exception:
            pass
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

    @field_validator("logoBase64")
    @classmethod
    def _logo_size(cls, v: str) -> str:
        if v and len(v) > MAX_LOGO_BASE64_CHARS:
            raise ValueError("Logo dosyası çok büyük (maksimum ~2MB)")
        return v


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


class KasaEntry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    userId: str
    companyId: str
    tur: str  # "gelir" | "gider"
    kategori: str
    tutar: float = 0.0
    paraBirimi: str = "TRY"
    yontem: str = "Nakit"  # Nakit | Kart | Havale/EFT | Diğer
    notlar: str = ""
    tarih: str  # YYYY-MM-DD
    createdAt: str = Field(default_factory=utc_now_iso)


class KasaEntryCreate(BaseModel):
    companyId: str
    tur: str
    kategori: str
    tutar: float = 0.0
    paraBirimi: str = "TRY"
    yontem: str = "Nakit"
    notlar: str = ""
    tarih: str


class TahsilatEntry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    userId: str
    companyId: str
    customerId: str = ""
    musteriAdi: str
    musteriTelefon: str = ""
    tur: str  # "borc" | "tahsilat"
    tutar: float = 0.0
    paraBirimi: str = "TRY"
    yontem: str = "Nakit"  # Nakit | Kart | Havale/EFT | Diğer (tahsilat için)
    vadeTarihi: str = ""   # YYYY-MM-DD (borc için, opsiyonel)
    notlar: str = ""
    tarih: str  # YYYY-MM-DD
    quoteId: str = ""  # dolu ise: bu borç bir teklifin "Onaylandı" durumuna geçmesiyle otomatik oluşturuldu
    createdAt: str = Field(default_factory=utc_now_iso)


class TahsilatEntryCreate(BaseModel):
    companyId: str
    customerId: str = ""
    musteriAdi: str
    musteriTelefon: str = ""
    tur: str
    tutar: float = 0.0
    paraBirimi: str = "TRY"
    yontem: str = "Nakit"
    vadeTarihi: str = ""
    notlar: str = ""
    tarih: str
    quoteId: str = ""


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
    await db.kasa.delete_many({"companyId": company_id, "userId": uid})
    await db.tahsilat.delete_many({"companyId": company_id, "userId": uid})
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


# ============ KASA (GELİR/GİDER) ROUTES ============
@api_router.get("/kasa/{company_id}", response_model=List[KasaEntry])
async def list_kasa(company_id: str, user=Depends(get_current_user)):
    await _own_company(user["user_id"], company_id)
    docs = await db.kasa.find({"companyId": company_id, "userId": user["user_id"]}, {"_id": 0}).to_list(5000)
    return [KasaEntry(**d) for d in docs]


@api_router.post("/kasa", response_model=KasaEntry)
async def create_kasa_entry(payload: KasaEntryCreate, user=Depends(get_current_user)):
    await _own_company(user["user_id"], payload.companyId)
    obj = KasaEntry(userId=user["user_id"], **payload.dict())
    await db.kasa.insert_one(obj.dict())
    return obj


@api_router.delete("/kasa/{entry_id}")
async def delete_kasa_entry(entry_id: str, user=Depends(get_current_user)):
    await db.kasa.delete_one({"id": entry_id, "userId": user["user_id"]})
    return {"ok": True}


# ============ TAHSILAT (ALACAK/BORÇ) ROUTES ============
@api_router.get("/tahsilat/{company_id}", response_model=List[TahsilatEntry])
async def list_tahsilat(company_id: str, user=Depends(get_current_user)):
    await _own_company(user["user_id"], company_id)
    docs = await db.tahsilat.find({"companyId": company_id, "userId": user["user_id"]}, {"_id": 0}).to_list(5000)
    return [TahsilatEntry(**d) for d in docs]


@api_router.post("/tahsilat", response_model=TahsilatEntry)
async def create_tahsilat_entry(payload: TahsilatEntryCreate, user=Depends(get_current_user)):
    await _own_company(user["user_id"], payload.companyId)
    obj = TahsilatEntry(userId=user["user_id"], **payload.dict())
    await db.tahsilat.insert_one(obj.dict())
    return obj


@api_router.delete("/tahsilat/{entry_id}")
async def delete_tahsilat_entry(entry_id: str, user=Depends(get_current_user)):
    await db.tahsilat.delete_one({"id": entry_id, "userId": user["user_id"]})
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
    previous_durum = doc.get("durum")
    doc["durum"] = payload.durum
    doc["updatedAt"] = utc_now_iso()
    await db.quotes.replace_one({"id": quote_id, "userId": user["user_id"]}, doc)

    # Teklif "Onaylandı" durumuna ilk kez geçtiğinde, müşteri için otomatik bir
    # tahsilat borcu oluştur — kullanıcı bunu manuel eklemek zorunda kalmasın.
    # Mükerrer önleme: bu quote_id için zaten bir "borc" kaydı varsa tekrar oluşturma.
    if payload.durum == "Onaylandı" and previous_durum != "Onaylandı":
        existing = await db.tahsilat.find_one({
            "userId": user["user_id"],
            "quoteId": quote_id,
            "tur": "borc",
        })
        if not existing and float(doc.get("genelToplam") or 0) > 0:
            matched_customer_id = ""
            mus_firma = (doc.get("musFirma") or "").strip()
            mus_telefon = (doc.get("musTelefon") or "").strip()
            if mus_telefon:
                cust = await db.customers.find_one({
                    "userId": user["user_id"],
                    "companyId": doc.get("companyId"),
                    "telefon": mus_telefon,
                })
                if cust:
                    matched_customer_id = cust.get("id", "")
            if not matched_customer_id and mus_firma:
                cust = await db.customers.find_one({
                    "userId": user["user_id"],
                    "companyId": doc.get("companyId"),
                    "firma": {"$regex": f"^{re.escape(mus_firma)}$", "$options": "i"},
                })
                if cust:
                    matched_customer_id = cust.get("id", "")

            tahsilat_doc = TahsilatEntry(
                userId=user["user_id"],
                companyId=doc.get("companyId"),
                customerId=matched_customer_id,
                musteriAdi=mus_firma or doc.get("musYetkili") or "Müşteri",
                musteriTelefon=mus_telefon,
                tur="borc",
                tutar=float(doc.get("genelToplam") or 0),
                paraBirimi=doc.get("paraBirimi") or "TRY",
                yontem="Diğer",
                vadeTarihi="",
                notlar=f"Teklif {doc.get('teklifNo', '')} onaylandı (otomatik oluşturuldu)",
                tarih=utc_now_iso()[:10],
                quoteId=quote_id,
            )
            await db.tahsilat.insert_one(tahsilat_doc.model_dump())

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
    subscription_weekly_price_try: float = SUBSCRIPTION_PLANS["weekly"]["price_try"]
    subscription_yearly_price_try: float = SUBSCRIPTION_PLANS["yearly"]["price_try"]
    subscription_yearly_list_price_try: float = SUBSCRIPTION_PLANS["yearly"]["list_price_try"]
    payment_enabled: bool = False


@api_router.get("/config", response_model=AppConfig)
async def get_app_config():
    return AppConfig(
        whatsapp_number=WHATSAPP_SUPPORT_NUMBER,
        ai_assistant_enabled=bool(_anthropic_client),
        subscription_price_try=SUBSCRIPTION_PRICE_TRY,
        subscription_weekly_price_try=SUBSCRIPTION_PLANS["weekly"]["price_try"],
        subscription_yearly_price_try=SUBSCRIPTION_PLANS["yearly"]["price_try"],
        subscription_yearly_list_price_try=SUBSCRIPTION_PLANS["yearly"]["list_price_try"],
        payment_enabled=bool(IYZICO_API_KEY and IYZICO_SECRET_KEY),
    )


# ============ LIVE RATES (USD/EUR/BTC/ETH -> TRY) ============
# Small in-memory cache so the Panel's rate strip doesn't hammer the upstream
# free APIs on every page load — a few minutes of staleness is fine for this.
_rates_cache: dict = {"data": None, "ts": 0.0}
_RATES_TTL_SECONDS = 30  # kısa cache — panel şeridi "anlık" hissettirsin diye


class RatesResponse(BaseModel):
    usd_try: Optional[float] = None
    eur_try: Optional[float] = None
    btc_try: Optional[float] = None
    btc_usd: Optional[float] = None
    eth_try: Optional[float] = None
    eth_usd: Optional[float] = None
    bist100: Optional[float] = None
    bist50: Optional[float] = None
    bist30: Optional[float] = None
    updatedAt: str = ""
    stale: bool = False


async def _fetch_yahoo_index(symbol: str) -> Optional[float]:
    """Borsa İstanbul endeksleri için resmi/ücretsiz bir API yok — Yahoo Finance'in
    genel (anahtarsız) chart endpoint'ini kullanıyoruz. Herhangi bir hata durumunda
    sessizce None döner, panel şeridinde o pill görünmez olur."""
    try:
        resp = await asyncio.to_thread(
            requests.get,
            f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
            params={"interval": "1m", "range": "1d"},
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=6,
        )
        data = resp.json()
        result = (data.get("chart") or {}).get("result") or []
        if not result:
            return None
        price = (result[0].get("meta") or {}).get("regularMarketPrice")
        return float(price) if price is not None else None
    except Exception:
        return None


@api_router.get("/rates", response_model=RatesResponse)
async def get_rates():
    now = _time.time()
    cached = _rates_cache["data"]
    if cached and (now - _rates_cache["ts"]) < _RATES_TTL_SECONDS:
        return RatesResponse(**cached)

    result = dict(cached) if cached else {}
    try:
        fx_resp = await asyncio.to_thread(
            requests.get, "https://api.frankfurter.app/latest",
            params={"from": "USD", "to": "TRY,EUR"}, timeout=6,
        )
        fx = fx_resp.json()
        usd_try = fx.get("rates", {}).get("TRY")
        usd_eur = fx.get("rates", {}).get("EUR")
        if usd_try:
            result["usd_try"] = usd_try
            if usd_eur:
                result["eur_try"] = usd_try / usd_eur
    except Exception:
        logging.warning("[rates] frankfurter.app fetch failed", exc_info=True)

    try:
        cg_resp = await asyncio.to_thread(
            requests.get, "https://api.coingecko.com/api/v3/simple/price",
            params={"ids": "bitcoin,ethereum", "vs_currencies": "try,usd"}, timeout=6,
        )
        cg = cg_resp.json()
        if "bitcoin" in cg:
            result["btc_try"] = cg["bitcoin"].get("try")
            result["btc_usd"] = cg["bitcoin"].get("usd")
        if "ethereum" in cg:
            result["eth_try"] = cg["ethereum"].get("try")
            result["eth_usd"] = cg["ethereum"].get("usd")
    except Exception:
        logging.warning("[rates] coingecko fetch failed", exc_info=True)

    try:
        b100, b50, b30 = await asyncio.gather(
            _fetch_yahoo_index("XU100.IS"),
            _fetch_yahoo_index("XU050.IS"),
            _fetch_yahoo_index("XU030.IS"),
        )
        if b100 is not None:
            result["bist100"] = b100
        if b50 is not None:
            result["bist50"] = b50
        if b30 is not None:
            result["bist30"] = b30
    except Exception:
        logging.warning("[rates] BIST fetch failed", exc_info=True)

    result["updatedAt"] = utc_now_iso()
    result["stale"] = not result.get("usd_try") and not result.get("btc_try")
    _rates_cache["data"] = result
    _rates_cache["ts"] = now
    return RatesResponse(**result)


# ============ SUBSCRIPTION / QUOTA ============
class PlanOut(BaseModel):
    id: str
    label: str
    price_try: float
    list_price_try: Optional[float] = None
    duration_days: int


class SubscriptionStatus(BaseModel):
    subscription_active: bool
    subscription_expires_at: Optional[str] = None
    subscription_plan: Optional[str] = None
    plan_price_try: float = SUBSCRIPTION_PRICE_TRY
    plans: List[PlanOut] = []
    period: str
    quotes_used_this_month: int
    free_limit: int
    remaining_free: Optional[int] = None


def _plans_out() -> List[PlanOut]:
    return [
        PlanOut(
            id=plan_id,
            label=cfg["label"],
            price_try=cfg["price_try"],
            list_price_try=cfg.get("list_price_try"),
            duration_days=cfg["duration_days"],
        )
        for plan_id, cfg in SUBSCRIPTION_PLANS.items()
    ]


@api_router.get("/subscription/status", response_model=SubscriptionStatus)
async def subscription_status(user=Depends(get_current_user)):
    state = await _get_quota_state(user)
    return SubscriptionStatus(
        subscription_active=state["subscription_active"],
        subscription_expires_at=user.get("subscription_expires_at"),
        subscription_plan=user.get("subscription_plan"),
        plan_price_try=SUBSCRIPTION_PRICE_TRY,
        plans=_plans_out(),
        period=state["period"],
        quotes_used_this_month=state["count"],
        free_limit=state["free_limit"],
        remaining_free=state["remaining_free"],
    )


class SubscriptionCheckoutRequest(BaseModel):
    plan: str
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
    plan_id = payload.plan if payload.plan in SUBSCRIPTION_PLANS else DEFAULT_SUBSCRIPTION_PLAN
    plan_cfg = SUBSCRIPTION_PLANS[plan_id]
    plan_price = plan_cfg["price_try"]
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
        "price": f"{plan_price:.2f}",
        "paidPrice": f"{plan_price:.2f}",
        "currency": "TRY",
        "basketId": f"sub_{user['user_id']}_{plan_id}_{uuid.uuid4().hex[:8]}",
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
            "id": plan_cfg["iyzico_item_id"],
            "name": f"Anında Teklif {plan_cfg['label']}",
            "category1": "Yazılım",
            "itemType": "VIRTUAL",
            "price": f"{plan_price:.2f}",
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
        "plan": plan_id,
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
        plan_id = (pending or {}).get("plan")
        plan_cfg = SUBSCRIPTION_PLANS.get(plan_id) or SUBSCRIPTION_PLANS[DEFAULT_SUBSCRIPTION_PLAN]
        duration_days = plan_cfg["duration_days"]
        # Extend from current expiry if the user still has active time left
        # (renewal before expiry), otherwise from now.
        current_expiry_raw = None
        current_user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "subscription_expires_at": 1})
        if current_user:
            current_expiry_raw = current_user.get("subscription_expires_at")
        base = utc_now()
        if current_expiry_raw:
            try:
                existing = datetime.fromisoformat(current_expiry_raw)
                if existing.tzinfo is None:
                    existing = existing.replace(tzinfo=timezone.utc)
                if existing > base:
                    base = existing
            except Exception:
                pass
        new_expiry = base + timedelta(days=duration_days)
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {
                "subscription_status": "active",
                "subscription_expires_at": new_expiry.isoformat(),
                "subscription_plan": plan_id or DEFAULT_SUBSCRIPTION_PLAN,
            }},
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


class AssistantSystemField(BaseModel):
    label: str
    type: str = "text"
    options: List[str] = []


class AssistantAction(BaseModel):
    action: str
    name: str
    fields: List[AssistantSystemField] = []


class AssistantChatResponse(BaseModel):
    reply: str
    action: Optional[AssistantAction] = None


_ASSISTANT_JSON_BLOCK_RE = re.compile(r"```json\s*(\{.*?\})\s*```", re.DOTALL)
_ALLOWED_FIELD_TYPES = {"text", "number", "select", "checkbox"}


def _extract_assistant_action(reply_text: str):
    """Pulls a trailing ```json {...}``` block (if any) out of the assistant's
    reply, validates/sanitizes it against the add_system_type schema, and
    returns (clean_reply_text, action_or_None). Any malformed block is
    silently dropped from the reply rather than surfaced as an error — the
    user still gets the rest of the conversational answer."""
    m = _ASSISTANT_JSON_BLOCK_RE.search(reply_text)
    if not m:
        return reply_text.strip(), None
    clean_text = (reply_text[: m.start()] + reply_text[m.end():]).strip()
    try:
        data = json.loads(m.group(1))
    except Exception:
        return clean_text, None
    if not isinstance(data, dict) or data.get("action") != "add_system_type":
        return clean_text, None
    name = str(data.get("name") or "").strip()
    if not name:
        return clean_text, None
    raw_fields = data.get("fields") or []
    fields = []
    for f in raw_fields[:12]:
        if not isinstance(f, dict):
            continue
        label = str(f.get("label") or "").strip()
        ftype = str(f.get("type") or "text").strip().lower()
        if not label or ftype not in _ALLOWED_FIELD_TYPES:
            continue
        options = [str(o).strip() for o in (f.get("options") or []) if str(o).strip()] if ftype == "select" else []
        if ftype == "select" and len(options) < 2:
            continue
        fields.append(AssistantSystemField(label=label, type=ftype, options=options))
    if not fields:
        return clean_text, None
    return clean_text, AssistantAction(action="add_system_type", name=name, fields=fields)


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
    reply_text = reply_text or "Üzgünüm, şu anda bir yanıt oluşturamadım."
    clean_reply, action = _extract_assistant_action(reply_text)
    return AssistantChatResponse(reply=clean_reply or reply_text, action=action)


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def _security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    return response


logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def on_startup():
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("user_id", unique=True)
        await db.password_resets.create_index("token_hash", unique=True)
        await db.password_resets.create_index("expires_at", expireAfterSeconds=0)
        await db.revoked_tokens.create_index("jti", unique=True)
        await db.revoked_tokens.create_index("expires_at", expireAfterSeconds=0)
    except Exception as e:
        logger.warning(f"Index setup issue: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
