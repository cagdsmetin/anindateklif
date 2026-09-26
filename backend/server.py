from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends, Form, Request, Query
from fastapi.responses import RedirectResponse, StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import DuplicateKeyError
import os
import re
import json
import base64
import asyncio
import logging
import hashlib
import secrets as py_secrets
import bcrypt
import jwt
import requests
from pathlib import Path
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import List, Optional, Dict, Any, Tuple
import uuid
import io
from html import escape as esc
from datetime import datetime, timezone, timedelta
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.drawing.image import Image as XLImage
import albert_genau_calc as ag_calc
import zip_perde
import ag_geometry as ag_geom


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET')
if not JWT_SECRET:
    # No usable default here on purpose -- signing tokens with a value that's
    # sitting in source control would let anyone who reads this file forge a
    # valid login for any account, including admin. Fail loudly at startup
    # instead of silently running insecure.
    raise RuntimeError("JWT_SECRET environment variable is not set. Refusing to start.")
JWT_ISSUER = os.environ.get('JWT_ISSUER', 'anindateklif-api')
JWT_AUDIENCE = os.environ.get('JWT_AUDIENCE', 'anindateklif-client')
JWT_ALGORITHM = 'HS256'
ACCESS_TOKEN_MINUTES = 60 * 24 * 7  # 7 days for MVP
RESET_TOKEN_MINUTES = 30
EMAIL_VERIFY_TOKEN_MINUTES = 60 * 24  # doğrulama linki 24 saat geçerli

# Sık kullanılan tek-kullanımlık/geçici e-posta servisleri -- kayıt formunda
# "fake mail ile ikinci hesap açma" senaryosunu engellemek için domain bazlı
# reddediyoruz (gerçek bir servise/anahtara ihtiyaç duymayan, anında etkili
# bir önlem). ADDITIONAL_BLOCKED_EMAIL_DOMAINS env var'ıyla virgülle ayrılmış
# ek domain eklenebilir, kod değişikliği/redeploy gerekmeden.
_DISPOSABLE_EMAIL_DOMAINS = {
    "mailinator.com", "10minutemail.com", "guerrillamail.com", "guerrillamail.net",
    "tempmail.com", "temp-mail.org", "yopmail.com", "throwawaymail.com",
    "trashmail.com", "sharklasers.com", "getnada.com", "dispostable.com",
    "fakeinbox.com", "maildrop.cc", "tempr.email", "mohmal.com", "moakt.com",
    "emailondeck.com", "mintemail.com", "mailnesia.com", "mailcatch.com",
    "spamgourmet.com", "33mail.com", "fakemailgenerator.com", "moakt.cc",
    "emailtemporario.com.br", "tempmailo.com", "tempinbox.com", "burnermail.io",
    "mailtemp.info", "1secmail.com", "1secmail.net", "1secmail.org",
    "crazymailing.com", "correotemporal.org", "mytemp.email", "tempmail.dev",
}
_BLOCKED_EMAIL_DOMAINS = _DISPOSABLE_EMAIL_DOMAINS | set(
    d.strip().lower() for d in os.environ.get("ADDITIONAL_BLOCKED_EMAIL_DOMAINS", "").split(",") if d.strip()
)

# ============ MONETIZATION CONFIG ============
FREE_MONTHLY_QUOTE_LIMIT = 5

# Soft-deleted quotes stay recoverable in the trash for this many days before
# being permanently purged (lazily, the next time the trash is listed).
QUOTE_TRASH_RETENTION_DAYS = 30

# Weekly / yearly subscription tiers (monthly plan retired — weekly gives a low-
# commitment entry point, yearly is the discounted "taahhütlü" option). Price
# scales with team size (owner + staff, see _seat_count) — a whole team shares
# one subscription under the owner's account, so the price has to account for
# how many people are actually using it.
SEAT_TIERS = [
    {"max_seats": 5, "weekly_price": 50.0, "yearly_price": 2000.0, "yearly_list_price": 2400.0},
    {"max_seats": 10, "weekly_price": 70.0, "yearly_price": 2800.0, "yearly_list_price": 3400.0},
    {"max_seats": 30, "weekly_price": 80.0, "yearly_price": 3200.0, "yearly_list_price": 3900.0},
    {"max_seats": None, "weekly_price": 110.0, "yearly_price": 4400.0, "yearly_list_price": 5300.0},  # 31+
]
DEFAULT_SUBSCRIPTION_PLAN = "yearly"

# İngilizce (USD) / İtalyanca (EUR) kullanan müşteriler için SABİT fiyatlar --
# kur ne olursa olsun hep aynı $/€ tutarı ödenir (TL kullanıcıları etkilenmez,
# onlar hep yukarıdaki *_try fiyatlarını öder). Taban (1-5 koltuk) tier için
# haftalık $10/€10, yıllık $400/€400 (liste fiyatı $480/€480, TL'deki
# 2400/2000=1.2 indirim oranıyla aynı) -- üst tier'lar TL tier'larıyla aynı
# oranda ölçeklenir (örn. 70/50=1.4x tier'da $14/€14 haftalık gibi).
BASE_WEEKLY_TRY = SEAT_TIERS[0]["weekly_price"]
BASE_YEARLY_TRY = SEAT_TIERS[0]["yearly_price"]
BASE_WEEKLY_USD = 10.0
BASE_WEEKLY_EUR = 10.0
BASE_YEARLY_USD = 400.0
BASE_YEARLY_EUR = 400.0
BASE_YEARLY_LIST_USD = 480.0
BASE_YEARLY_LIST_EUR = 480.0

for _tier in SEAT_TIERS:
    _wr = _tier["weekly_price"] / BASE_WEEKLY_TRY
    _yr = _tier["yearly_price"] / BASE_YEARLY_TRY
    _tier["weekly_price_usd"] = round(BASE_WEEKLY_USD * _wr, 2)
    _tier["weekly_price_eur"] = round(BASE_WEEKLY_EUR * _wr, 2)
    _tier["yearly_price_usd"] = round(BASE_YEARLY_USD * _yr, 2)
    _tier["yearly_price_eur"] = round(BASE_YEARLY_EUR * _yr, 2)
    _tier["yearly_list_price_usd"] = round(BASE_YEARLY_LIST_USD * _yr, 2)
    _tier["yearly_list_price_eur"] = round(BASE_YEARLY_LIST_EUR * _yr, 2)


def _seat_tier(seats: int) -> Dict[str, Any]:
    for tier in SEAT_TIERS:
        if tier["max_seats"] is None or seats <= tier["max_seats"]:
            return tier
    return SEAT_TIERS[-1]


async def _seat_count(owner_user_id: str) -> int:
    """1 (owner) + however many staff accounts are currently active under them."""
    staff_count = await db.users.count_documents({"staff_owner_user_id": owner_user_id})
    return 1 + staff_count


def _plans_for_tier(tier: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    return {
        "weekly": {
            "price_try": tier["weekly_price"],
            "price_usd": tier["weekly_price_usd"],
            "price_eur": tier["weekly_price_eur"],
            "duration_days": 7,
            "label": "Haftalık Abonelik",
            "iyzico_item_id": "anindateklif_weekly",
        },
        "yearly": {
            "price_try": tier["yearly_price"],
            "list_price_try": tier["yearly_list_price"],
            "price_usd": tier["yearly_price_usd"],
            "list_price_usd": tier["yearly_list_price_usd"],
            "price_eur": tier["yearly_price_eur"],
            "list_price_eur": tier["yearly_list_price_eur"],
            "duration_days": 365,
            "label": "Yıllık Abonelik",
            "iyzico_item_id": "anindateklif_yearly",
        },
    }


def currencyForLang(lang: Optional[str]) -> str:
    """Frontend'deki src/lib/i18n.tsx -> currencyForLang ile birebir aynı
    eşleme: İtalyanca -> EUR, İngilizce -> USD, diğer her şey (Türkçe dahil)
    -> TRY."""
    if lang == "it":
        return "EUR"
    if lang == "en":
        return "USD"
    return "TRY"


def _plan_price_for_currency(plan_cfg: Dict[str, Any], currency: str) -> Tuple[float, str]:
    """(tutar, iyzico_para_birimi) -- kullanıcının dilinden gelen currency
    'USD'/'EUR' ise sabit $/€ fiyatı, aksi halde (varsayılan) TL fiyatı."""
    if currency == "USD" and plan_cfg.get("price_usd") is not None:
        return float(plan_cfg["price_usd"]), "USD"
    if currency == "EUR" and plan_cfg.get("price_eur") is not None:
        return float(plan_cfg["price_eur"]), "EUR"
    return float(plan_cfg["price_try"]), "TRY"


# Base (1-5 seat) tier — used wherever a seat count isn't known yet (e.g. the
# public /config endpoint, shown to visitors before they've signed up/added
# any staff) and as a backward-compat alias for any stray old reference.
SUBSCRIPTION_PLANS = _plans_for_tier(SEAT_TIERS[0])
SUBSCRIPTION_PRICE_TRY = SUBSCRIPTION_PLANS[DEFAULT_SUBSCRIPTION_PLAN]["price_try"]

# Comma-separated list of emails that always get unlimited free access, no
# subscription required. Managed entirely via the FREE_ACCESS_EMAILS env var
# on Railway -- add/remove an email there any time, no code change or
# redeploy needed (the service picks up the new value on its next restart,
# which Railway does automatically when you edit a variable).
FREE_ACCESS_EMAILS = set(
    e.strip().lower() for e in os.environ.get("FREE_ACCESS_EMAILS", "").split(",") if e.strip()
)

# Uygulamayı işleten kişi(ler) — hediye/promosyon kodu üretme gibi admin-only
# işlemler bu e-postalarla sınırlı. Varsayılan olarak hesap sahibinin e-postası
# tanımlı geliyor, ekstra bir Railway env-var ayarlamaya gerek kalmadan çalışsın
# diye; başka admin eklemek istenirse ADMIN_EMAILS env var'ı virgülle ayrılmış
# olarak override edebilir.
ADMIN_EMAILS = set(
    e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "ncagdasm@gmail.com").split(",") if e.strip()
)

BACKEND_BASE_URL = os.environ.get("BACKEND_BASE_URL", "https://anindateklif-production.up.railway.app")
# Every customer-facing link we generate (e-posta dogrulama, sifre sifirlama,
# ekip daveti, odeme sonucu) is built from this. It used to default to the raw
# Railway domain, and since the env var was never set in production that is the
# address customers actually received -- our own brand nowhere in sight.
#
# Deliberately the "www" host, not the apex: anindateklif.co only redirects its
# root, so anindateklif.co/reset-password?token=... 404s. That fix needs a DNS
# change at the registrar; until then www is the host that serves deep links.
FRONTEND_BASE_URL = os.environ.get("FRONTEND_BASE_URL", "https://www.anindateklif.co")
RAILWAY_FRONTEND_URL = "https://just-mercy-production.up.railway.app"
WHATSAPP_SUPPORT_NUMBER = os.environ.get("WHATSAPP_SUPPORT_NUMBER", "")

# Explicit CORS allowlist — override via the ALLOWED_ORIGINS env var (comma
# separated) if a new frontend domain goes live without a code change.
#
# The Railway-generated domain stays on the list even though FRONTEND_BASE_URL
# no longer points at it: it is still publicly reachable and is where we'd look
# if the custom domain ever had trouble. Duplicates are collapsed so the list
# stays clean whichever host FRONTEND_BASE_URL names.
_DEFAULT_ALLOWED_ORIGINS = ",".join([
    FRONTEND_BASE_URL,
    "https://anindateklif.co",
    "https://www.anindateklif.co",
    RAILWAY_FRONTEND_URL,
])
ALLOWED_ORIGINS = list(dict.fromkeys(
    o.strip() for o in os.environ.get("ALLOWED_ORIGINS", _DEFAULT_ALLOWED_ORIGINS).split(",") if o.strip()
))

MAX_LOGO_BASE64_CHARS = 2_800_000  # ~2MB decoded
MAX_CATALOG_FILE_BASE64_CHARS = 21_000_000  # ~15MB decoded (base64 is ~1.37x raw size); MongoDB doc limit is 16MB so this is the practical ceiling

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
    # BUG FIX: iyzipay Python SDK'si (iyzipay_resource.py) 'base_url'i dogrudan
    # http.client.HTTPSConnection(base_url)'e host olarak geciriyor -- yani
    # BASINDA SEMA (https://) OLMAMASI gerekiyor (ornek: 'sandbox-api.iyzipay.com',
    # 'https://sandbox-api.iyzipay.com' DEGIL). IYZICO_BASE_URL env degiskeni
    # (veya varsayilanimiz) sema ile ayarlanmissa, HTTPSConnection host'u
    # '//sandbox-api.iyzipay.com' olarak parse etmeye calisiyor ve
    # "http.client.InvalidURL: nonnumeric port: '//sandbox-api.iyzipay.com'"
    # hatasiyla PATLIYORDU -- bu da /subscription/checkout'un her zaman
    # "Odeme saglayicisina ulasilamadi" donmesine sebep oluyordu. Burada
    # sema'yi (varsa) temizleyip SADECE host'u gonderiyoruz.
    base = (IYZICO_BASE_URL or "").strip()
    for prefix in ("https://", "http://"):
        if base.startswith(prefix):
            base = base[len(prefix):]
            break
    base = base.rstrip("/")
    return {"api_key": IYZICO_API_KEY, "secret_key": IYZICO_SECRET_KEY, "base_url": base}


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

# Firma Arama Takibi -- "Yeni Talep" gönderildiğinde admin'e sormadan, doğrudan
# yapay zekanın web_search aracıyla GERÇEK firma bulup listeye eklemesi için.
# Uydurma isim/telefon üretmeyi kesinlikle yasaklıyoruz -- bulamadığı alanı
# boş bırakması isteniyor, tahmin etmesi değil.
LEAD_FINDER_SYSTEM_PROMPT = (
    "Sen bir B2B satış/pazarlama araştırma asistanısın. Görevin: kullanıcının verdiği sektörde ve "
    "bölgede GERÇEKTEN VAR OLAN firmaları web_search aracını kullanarak internetten arayıp bulmak. "
    "KURALLAR (çok önemli):\n"
    "1) KESİNLİKLE uydurma/tahmini firma adı, telefon numarası, website veya e-posta üretme. Sadece "
    "arama sonuçlarında gerçekten gördüğün, resmi sitesinde/iletişim sayfasında yazan bilgileri listele.\n"
    "2) Bir firma için telefon, website veya e-posta bulamazsan o alanı boş bırak (""), asla tahmini "
    "değer yazma.\n"
    "3) Website varsa 'website' alanına domaini yaz (ör. ornekfirma.com.tr). E-posta varsa (genelde "
    "firmanın kendi sitesindeki iletişim sayfasında görünür) 'email' alanına yaz.\n"
    "4) Her firma için varsa ilçe/il bilgisini 'bolge' alanına yaz.\n"
    "5) En fazla 12 firma öner, aynı firmayı tekrar etme.\n"
    "6) Hiç uygun/doğrulanabilir firma bulamazsan boş dizi döndür.\n\n"
    "Cevabının EN SONUNDA, başka HİÇBİR açıklama/markdown olmadan sadece şu formatta bir JSON dizisi ver:\n"
    "```json\n[{\"firma\": \"...\", \"bolge\": \"...\", \"telefon\": \"...\", \"website\": \"...\", \"email\": \"...\"}]\n```"
)

_LEAD_JSON_ARR_RE = re.compile(r"```json\s*(\[.*?\])\s*```", re.DOTALL)


def _extract_ai_leads(reply_text: str) -> List[Dict[str, str]]:
    """AI'nin cevabından firma listesi JSON dizisini ayıklar ve doğrular.
    Firma adı olmayan veya bariz bozuk kayıtları atar; hiçbir alanı
    UYDURMAZ -- sadece modelin verdiği veriyi temizler/sınırlar."""
    m = _LEAD_JSON_ARR_RE.search(reply_text)
    raw = m.group(1) if m else reply_text
    try:
        data = json.loads(raw)
    except Exception:
        return []
    if not isinstance(data, list):
        return []
    out: List[Dict[str, str]] = []
    seen = set()
    for item in data[:15]:
        if not isinstance(item, dict):
            continue
        firma = str(item.get("firma") or "").strip()
        if not firma or len(firma) > 200:
            continue
        key = firma.lower()
        if key in seen:
            continue
        seen.add(key)
        bolge = str(item.get("bolge") or "").strip()[:120]
        telefon = str(item.get("telefon") or "").strip()[:40]
        website = str(item.get("website") or "").strip()[:200]
        email = str(item.get("email") or "").strip()[:200]
        out.append({"firma": firma, "bolge": bolge, "telefon": telefon, "website": website, "email": email})
    return out


# Dummy hash for timing-safe login (mitigates account enumeration)
_DUMMY_HASH = bcrypt.hashpw(b"dummy-password-not-used", bcrypt.gensalt()).decode()

# GÜVENLİK: FastAPI varsayılan olarak /docs (Swagger UI), /redoc ve
# /openapi.json'ı KİMLİK DOĞRULAMASIZ, herkese açık bırakır -- bu da tüm
# uç nokta listesini (admin/impersonate dahil), her modelin alan adlarını
# vs. isteyen herkese servis eder (saldırgan için ücretsiz bir keşif
# haritası). ENABLE_API_DOCS=true set edilmedikçe (lokal geliştirmede
# elle açılabilir) bunlar production'da tamamen kapalı.
_ENABLE_API_DOCS = os.environ.get("ENABLE_API_DOCS", "false").lower() == "true"
app = FastAPI(
    title="Anında Teklif API",
    docs_url="/docs" if _ENABLE_API_DOCS else None,
    redoc_url="/redoc" if _ENABLE_API_DOCS else None,
    openapi_url="/openapi.json" if _ENABLE_API_DOCS else None,
)
api_router = APIRouter(prefix="/api")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_now_iso() -> str:
    return utc_now().isoformat()


# ============ AUTH ============
def _utc(): return datetime.now(timezone.utc)


def _normalize_email(e: str) -> str:
    return (e or "").strip().lower()


_ALIAS_INSENSITIVE_DOMAINS = {"gmail.com", "googlemail.com"}


def _canonical_email_key(email: str) -> str:
    """Collapses provider-level address aliasing (Gmail dot-insensitivity and
    +tag subaddressing) into one key, purely for duplicate-account detection
    at registration time. The user's real, original email is still what's
    stored/displayed/logged into everywhere else -- this key only feeds the
    "have we seen this inbox before" check, so one person can't spin up
    unlimited free-tier accounts as a+1@gmail.com, a+2@gmail.com, a.b@gmail.com..."""
    email = _normalize_email(email)
    if "@" not in email:
        return email
    local, _, domain = email.partition("@")
    local = local.split("+", 1)[0]
    if domain in _ALIAS_INSENSITIVE_DOMAINS:
        local = local.replace(".", "")
    return f"{local}@{domain}"


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
    # X-Forwarded-For is a comma-separated hop chain; the client can put
    # anything it wants at the front of it. Only the LAST entry is the one
    # appended by our own trusted edge proxy (Railway), so that's the only
    # part of this header safe to use for rate-limiting/abuse tracking.
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        parts = [p.strip() for p in fwd.split(",") if p.strip()]
        if parts:
            return parts[-1]
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


async def _send_verification_email(to_email: str, verify_link: str):
    """Same Resend-or-log-fallback pattern as password reset. While
    RESEND_API_KEY isn't configured, register() marks accounts as already
    verified (see below) so this never actually gets called in that state --
    it only starts mattering once a real Resend key is added."""
    if not RESEND_API_KEY:
        logging.info(f"[EmailVerify] RESEND_API_KEY not set, link={verify_link}")
        return
    try:
        resp = await asyncio.to_thread(
            requests.post,
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
            json={
                "from": RESEND_FROM_EMAIL,
                "to": [to_email],
                "subject": "E-postanı Doğrula - Anında Teklif",
                "html": (
                    "<div style=\"font-family: sans-serif; max-width: 480px; margin: 0 auto;\">"
                    "<h2>Hoş geldin!</h2>"
                    "<p>Anında Teklif hesabını aktifleştirmek için e-posta adresini doğrulaman gerekiyor. "
                    "Aşağıdaki bağlantıya tıkla. Bu bağlantı 24 saat geçerlidir.</p>"
                    f"<p><a href=\"{verify_link}\" style=\"display:inline-block;background:#2563eb;color:#fff;"
                    "padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;\">E-postamı Doğrula</a></p>"
                    "<p>Bu hesabı sen açmadıysan bu e-postayı yok sayabilirsin.</p>"
                    "</div>"
                ),
            },
            timeout=10,
        )
        if resp.status_code >= 300:
            logging.warning(f"[EmailVerify] resend send failed status={resp.status_code} body={resp.text[:300]}")
    except Exception as e:
        logging.warning(f"[EmailVerify] resend send exception: {e}")


async def _issue_email_verification(user_id: str, email: str):
    raw = py_secrets.token_urlsafe(32)
    await db.email_verifications.insert_one({
        "token_hash": _sha256(raw),
        "user_id": user_id,
        "expires_at": _utc() + timedelta(minutes=EMAIL_VERIFY_TOKEN_MINUTES),
        "used_at": None,
    })
    verify_link = f"{FRONTEND_BASE_URL.rstrip('/')}/verify-email?token={raw}"
    await _send_verification_email(email, verify_link)


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
    phone: str

    @field_validator("password")
    @classmethod
    def _pw(cls, v: str) -> str:
        try:
            return _validate_password(v)
        except ValueError as e:
            raise ValueError(str(e))

    @field_validator("phone")
    @classmethod
    def _phone_required(cls, v: str) -> str:
        digits = re.sub(r"[^\d]", "", v or "")
        if len(digits) < 10:
            raise ValueError("Geçerli bir telefon numarası giriniz")
        return v


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
    email_verified: bool = True
    name: str = ""
    phone: str = ""
    phone_verified: bool = False
    picture: str = ""
    country: str = ""
    currency: str = ""
    tax_label: str = ""
    language: str = "tr"
    theme: str = "light"
    onboarding_completed: bool = False
    is_staff: bool = False
    staff_role: Optional[str] = None
    staff_company_id: Optional[str] = None
    is_impersonated: bool = False
    impersonated_by: Optional[str] = None


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
    language: Optional[str] = None
    theme: Optional[str] = None
    onboarding_completed: Optional[bool] = None

    @field_validator("language")
    @classmethod
    def _lang_allowed(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("tr", "en", "it"):
            raise ValueError("Gecersiz dil kodu")
        return v

    @field_validator("theme")
    @classmethod
    def _theme_allowed(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("light", "dark"):
            raise ValueError("Gecersiz tema")
        return v


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
    account = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0})
    if not account:
        raise HTTPException(status_code=401, detail="User not found")
    # Admin tarafindan silinmis (geri alinabilir durumdaki) hesap oturum
    # acamaz ve elindeki token da calismaz -- veriler 30 gun saklanir ama
    # hesap kullanilamaz (bkz. DELETE /admin/customers/{user_id}).
    if account.get("deleted_at"):
        raise HTTPException(status_code=401, detail="Bu hesap kapatildi")

    # Şifre sıfırlanınca (forgot-password akışı), o andan ÖNCE verilmiş tüm
    # access token'ları geçersiz say -- aksi halde çalınmış/sızmış bir token,
    # kullanıcı şifresini değiştirdikten sonra da 7 gün boyunca geçerli kalır.
    pw_changed_at = account.get("pw_changed_at")
    if pw_changed_at and payload.get("iat"):
        if isinstance(pw_changed_at, str):
            try:
                pw_changed_at = datetime.fromisoformat(pw_changed_at)
            except Exception:
                pw_changed_at = None
        if pw_changed_at:
            if pw_changed_at.tzinfo is None:
                pw_changed_at = pw_changed_at.replace(tzinfo=timezone.utc)
            iat_dt = datetime.fromtimestamp(payload["iat"], tz=timezone.utc)
            if iat_dt < pw_changed_at:
                raise HTTPException(status_code=401, detail="Session expired")

    # Admin destek/impersonasyon oturumu ise (bkz. /admin/impersonate) bu
    # bilgiyi çözümlenen kullanıcı sözlüğüne taşı ki auth/me üzerinden
    # frontend'e "destek modundasın" banner'ı için ulaşabilsin.
    imp_flag = bool(payload.get("imp"))
    imp_by = payload.get("imp_by") if imp_flag else None

    owner_id = account.get("staff_owner_user_id")
    if owner_id:
        # Staff account — every company-scoped query (quotes/customers/kasa/
        # tahsilat/catalog/services/campaigns/company/subscription) keys off
        # user["user_id"], so resolving straight to the OWNER's record here
        # makes the whole team share one company's data and one subscription
        # with zero changes to any of those endpoints. `actual_user_id` is
        # kept so identity-only endpoints (auth/me, phone OTP) can still act
        # on the real logged-in person instead of the owner.
        owner = await db.users.find_one({"user_id": owner_id}, {"_id": 0})
        if not owner:
            raise HTTPException(status_code=401, detail="Bağlı olduğunuz firma hesabı artık mevcut değil")
        resolved = dict(owner)
        resolved["is_staff"] = True
        resolved["staff_role"] = account.get("staff_role", "staff")
        resolved["staff_of_company_id"] = account.get("staff_of_company_id", "")
        resolved["actual_user_id"] = account["user_id"]
        # Teklif sahiplik/onay sistemi (bkz. _actor_email/_actor_name ve
        # Quote.createdByUserId) için: "resolved" sözlüğü artık firma
        # sahibinin e-postasını/adını taşıyor, gerçek giriş yapan personelin
        # kendi kimliği kaybolmasın diye ayrıca saklıyoruz.
        resolved["actor_email"] = account.get("email", "")
        resolved["actor_name"] = account.get("name", "")
        resolved["_impersonated"] = imp_flag
        resolved["_impersonated_by"] = imp_by
        return resolved

    account["is_staff"] = False
    account["actor_email"] = account.get("email", "")
    account["actor_name"] = account.get("name", "")
    account["_impersonated"] = imp_flag
    account["_impersonated_by"] = imp_by
    return account


def _self_id(user: Dict[str, Any]) -> str:
    """The REAL logged-in person's user_id — same as user["user_id"] for a
    normal/owner account, but for a resolved staff account (see
    get_current_user) user["user_id"] has been swapped to the OWNER's id, so
    identity-only endpoints (auth/me, phone OTP) must use this instead."""
    return user.get("actual_user_id") or user["user_id"]


def _actor_email(user: Dict[str, Any]) -> str:
    """Gerçek giriş yapan kişinin e-postası (personel için firma sahibinin
    değil, personelin kendi e-postası) -- teklif sahiplik/onay sistemi."""
    return user.get("actor_email") or user.get("email", "")


def _actor_name(user: Dict[str, Any]) -> str:
    return user.get("actor_name") or user.get("name", "")


def _user_out(u: Dict[str, Any]) -> UserOut:
    return UserOut(
        user_id=u["user_id"],
        email=u["email"],
        email_verified=bool(u.get("email_verified", True)),
        name=u.get("name", ""),
        phone=u.get("phone", ""),
        phone_verified=bool(u.get("phone_verified", False)),
        picture=u.get("picture", ""),
        country=u.get("country", ""),
        currency=u.get("currency", ""),
        tax_label=u.get("tax_label", ""),
        language=u.get("language", "tr"),
        theme=u.get("theme", "light"),
        onboarding_completed=bool(u.get("onboarding_completed", False)),
        is_staff=bool(u.get("staff_owner_user_id")),
        staff_role=u.get("staff_role"),
        staff_company_id=u.get("staff_of_company_id"),
        is_impersonated=bool(u.get("_impersonated")),
        impersonated_by=u.get("_impersonated_by"),
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


def _renewal_days_left(user: Dict[str, Any]) -> Optional[int]:
    """Returns whole days left until subscription_expires_at, or None if there's
    no expiry (no active paid subscription / unlimited free-access account)."""
    exp = user.get("subscription_expires_at")
    if not exp:
        return None
    if isinstance(exp, str):
        try:
            exp = datetime.fromisoformat(exp)
        except Exception:
            return None
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    delta = exp - _utc()
    return max(0, delta.days)


def _renewal_due_soon(user: Dict[str, Any], days_left: Optional[int]) -> bool:
    """A plan-aware reminder threshold: weekly plans warn with 2 days left,
    yearly plans warn with 14 days left, anything else defaults to 3 days."""
    if days_left is None:
        return False
    plan_id = user.get("subscription_plan")
    plan_cfg = SUBSCRIPTION_PLANS.get(plan_id)
    if plan_cfg and plan_cfg["duration_days"] <= 7:
        threshold = 2
    elif plan_cfg and plan_cfg["duration_days"] >= 365:
        threshold = 14
    else:
        threshold = 3
    return days_left <= threshold


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
    if stored_period == period:
        # Atomic check-and-increment: only succeeds if the count is still what
        # we just read, so two simultaneous requests can't both slip past the
        # limit check above and both increment (closes a TOCTOU race).
        result = await db.users.update_one(
            {"user_id": user["user_id"], "monthly_quote_period": period, "monthly_quote_count": count},
            {"$set": {"monthly_quote_count": count + 1}},
        )
        if result.modified_count == 0 and not active:
            # Someone else's concurrent request won the race and pushed the
            # counter past the limit -- re-check for real rather than silently
            # letting this request through.
            fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
            fresh_count = fresh.get("monthly_quote_count", 0) if fresh and fresh.get("monthly_quote_period") == period else 0
            if fresh_count >= FREE_MONTHLY_QUOTE_LIMIT:
                raise HTTPException(
                    status_code=402,
                    detail="Bu ay için 5 ücretsiz teklif hakkınızı kullandınız. Devam etmek için aboneliği başlatın.",
                )
            await db.users.update_one(
                {"user_id": user["user_id"]},
                {"$set": {"monthly_quote_period": period, "monthly_quote_count": fresh_count + 1}},
            )
    else:
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"monthly_quote_period": period, "monthly_quote_count": 1}},
        )


@api_router.post("/auth/register", response_model=AuthResponse, status_code=201)
async def register(payload: RegisterRequest, request: Request):
    _rate_limit(f"register:ip:{_client_ip(request)}", 8, 3600)
    email = _normalize_email(payload.email)
    domain = email.split("@")[-1].lower() if "@" in email else ""
    if domain in _BLOCKED_EMAIL_DOMAINS or any(
        domain == d or domain.endswith("." + d) for d in _BLOCKED_EMAIL_DOMAINS
    ):
        raise HTTPException(status_code=400, detail="Geçici/tek kullanımlık e-posta adresleriyle kayıt olunamaz. Lütfen gerçek bir e-posta adresi kullanın.")
    if await db.users.find_one({"email": email}, {"_id": 0}):
        raise HTTPException(status_code=409, detail="Bu e-posta zaten kayıtlı")
    email_canonical = _canonical_email_key(email)
    if await db.users.find_one({"email_canonical": email_canonical}, {"_id": 0}):
        raise HTTPException(status_code=409, detail="Bu e-posta adresiyle (veya bir varyasyonuyla) zaten bir hesap mevcut")

    # Aynı telefon numarasıyla birden fazla hesap açılmasını engelle -- format
    # farklı yazılmış olsa bile (0532..., +90532..., 90532... hepsi aynı
    # numaraya normalize edilip öyle karşılaştırılıyor).
    phone_normalized = _normalize_phone(payload.phone)
    if await db.users.find_one({"phone_normalized": phone_normalized}, {"_id": 0}):
        raise HTTPException(status_code=409, detail="Bu telefon numarasıyla zaten bir hesap mevcut")

    user_id = f"user_{uuid.uuid4().hex[:12]}"
    # RESEND_API_KEY ayarlı değilken e-posta doğrulaması hiç zorunlu kılınmıyor
    # (henüz gönderim altyapısı yok) -- bu, telefon OTP altyapısıyla aynı
    # "kodu hazır ama pasif" desenidir. Anahtar eklenince yeni kayıtlar
    # otomatik olarak doğrulama gerektirmeye başlar, mevcut kodda değişiklik
    # gerekmeden.
    email_verified = not bool(RESEND_API_KEY)
    user = {
        "user_id": user_id,
        "email": email,
        "email_canonical": email_canonical,
        "email_verified": email_verified,
        "hashed_password": _hash_password(payload.password),
        "name": (payload.name or "").strip(),
        "phone": (payload.phone or "").strip(),
        "phone_normalized": phone_normalized,
        "picture": "",
        "country": "",
        "currency": "",
        "tax_label": "",
        "language": "tr",
        "onboarding_completed": False,
        "createdAt": _utc().isoformat(),
    }
    try:
        await db.users.insert_one(user)
    except DuplicateKeyError:
        # Two simultaneous registrations raced past the find_one checks above
        # (same email/phone/canonical-email); the unique index is the real
        # backstop here, we just turn it into a clean error instead of a 500.
        raise HTTPException(status_code=409, detail="Bu bilgilerle zaten bir hesap mevcut")
    if not email_verified:
        await _issue_email_verification(user_id, email)
    access = _make_access_token(user)
    return AuthResponse(access_token=access, user=_user_out(user))


class VerifyEmailRequest(BaseModel):
    token: str


@api_router.post("/auth/verify-email")
async def verify_email(payload: VerifyEmailRequest, request: Request):
    _rate_limit(f"verify-email:ip:{_client_ip(request)}", 20, 900)
    doc = await db.email_verifications.find_one({"token_hash": _sha256(payload.token), "used_at": None}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=400, detail="Geçersiz veya kullanılmış doğrulama bağlantısı")
    exp = doc.get("expires_at")
    if isinstance(exp, str):
        try: exp = datetime.fromisoformat(exp)
        except Exception: exp = None
    if not exp or (exp.tzinfo and exp < _utc()) or (not exp.tzinfo and exp.replace(tzinfo=timezone.utc) < _utc()):
        raise HTTPException(status_code=400, detail="Doğrulama bağlantısının süresi dolmuş, yeni bir tane isteyin")
    await db.users.update_one({"user_id": doc["user_id"]}, {"$set": {"email_verified": True}})
    await db.email_verifications.update_one(
        {"token_hash": _sha256(payload.token)}, {"$set": {"used_at": utc_now_iso()}}
    )
    return {"message": "E-posta doğrulandı"}


@api_router.post("/auth/resend-verification")
async def resend_verification(request: Request, user=Depends(get_current_user)):
    self_id = _self_id(user)
    _rate_limit(f"resend-verify:user:{self_id}", 5, 3600)
    u = await db.users.find_one({"user_id": self_id}, {"_id": 0})
    if not u:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    if u.get("email_verified", True):
        return {"message": "E-posta zaten doğrulanmış"}
    await _issue_email_verification(self_id, u["email"])
    return {"message": "Doğrulama bağlantısı tekrar gönderildi"}


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
    # Admin tarafindan silinmis hesap (geri alma suresi dolmadan) giris yapamaz.
    if u.get("deleted_at"):
        raise HTTPException(status_code=403, detail="Bu hesap kapatıldı. Destek ile iletişime geçin.")
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
        {"$set": {"hashed_password": _hash_password(payload.new_password), "pw_changed_at": _utc()}},
    )
    await db.password_resets.update_one({"token_hash": doc["token_hash"]}, {"$set": {"used_at": _utc()}})
    return {"message": "Şifre başarıyla güncellendi"}


@api_router.get("/auth/me", response_model=UserOut)
async def auth_me(user=Depends(get_current_user)):
    self_id = _self_id(user)
    doc = await db.users.find_one({"user_id": self_id}, {"_id": 0}) if user.get("is_staff") else user
    return _user_out(doc or user)


@api_router.patch("/auth/me", response_model=UserOut)
async def update_me(payload: UserProfileUpdate, user=Depends(get_current_user)):
    self_id = _self_id(user)
    updates = {k: v for k, v in payload.dict(exclude_unset=True).items() if v is not None}
    if updates:
        await db.users.update_one({"user_id": self_id}, {"$set": updates})
    doc = await db.users.find_one({"user_id": self_id}, {"_id": 0})
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


# Twilio hesabı yükseltilip WhatsApp içerik şablonu (Content Template) onaylanana kadar
# bu özellik kapalı tutuluyor (bkz. ContentSid Required / trial hesap kısıtı).
PHONE_OTP_ENABLED = os.environ.get("PHONE_OTP_ENABLED", "false").lower() == "true"


@api_router.post("/auth/phone/send-code")
async def phone_send_code(payload: PhoneSendCodeRequest, request: Request, user=Depends(get_current_user)):
    if not PHONE_OTP_ENABLED or not (TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_WHATSAPP_FROM):
        raise HTTPException(
            status_code=503,
            detail="Telefon doğrulama şu an yapılandırılmadı. Lütfen daha sonra tekrar deneyin.",
        )
    phone = _normalize_phone(payload.phone)
    if len(phone) < 8:
        raise HTTPException(status_code=400, detail="Geçerli bir telefon numarası giriniz")

    self_id = _self_id(user)
    _rate_limit(f"otp-send:user:{self_id}", 5, 3600)
    _rate_limit(f"otp-send:ip:{_client_ip(request)}", 10, 3600)

    code = f"{py_secrets.randbelow(1000000):06d}"
    _phone_otp_store[f"{self_id}:{phone}"] = {
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
    self_id = _self_id(user)
    key = f"{self_id}:{phone}"
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
        {"user_id": self_id},
        {"$set": {"phone": phone, "phone_verified": True}},
    )
    doc = await db.users.find_one({"user_id": self_id}, {"_id": 0})
    return _user_out(doc)


@api_router.delete("/auth/account")
async def delete_account(user=Depends(get_current_user)):
    """Google Play / App Store hesap silme politikası gereği: kullanıcı
    hesabını ve (owner ise) sahip olduğu tüm iş verilerini kalıcı olarak
    siler. Personel (staff) hesabı için sadece kendi girişini siler, sahibin
    firma verilerine dokunmaz."""
    self_id = _self_id(user)
    own_doc = await db.users.find_one({"user_id": self_id}, {"_id": 0})
    if not own_doc:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")

    if own_doc.get("staff_owner_user_id"):
        # Personel hesabı: sadece kendi girişini ve bekleyen davetini sil.
        await db.users.delete_one({"user_id": self_id})
        await db.company_invites.delete_many({"email": own_doc.get("email")})
        return {"ok": True}

    # Firma sahibi hesabı: tüm firma verilerini ve bağlı personel girişlerini sil.
    uid = self_id
    await db.companies.delete_many({"userId": uid})
    await db.catalog.delete_many({"userId": uid})
    await db.customers.delete_many({"userId": uid})
    await db.quotes.delete_many({"userId": uid})
    await db.services.delete_many({"userId": uid})
    await db.campaigns.delete_many({"userId": uid})
    await db.manual_reminders.delete_many({"userId": uid})
    await db.kasa.delete_many({"userId": uid})
    await db.tahsilat.delete_many({"userId": uid})
    await db.company_invites.delete_many({"ownerUserId": uid})
    await db.subscription_payments.delete_many({"user_id": uid})
    await db.email_verifications.delete_many({"user_id": uid})
    await db.password_resets.delete_many({"user_id": uid})
    await db.users.delete_many({"staff_owner_user_id": uid})
    await db.users.delete_one({"user_id": uid})
    return {"ok": True}


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
    leadDailyCount: int = 10  # Firma Arama Takibi: günde kaç firma "Bugün Aranacaklar" listesine düşsün
    # Albert Genau modülü SADECE gerçekten Albert Genau bayisi olan firmalarda
    # görünsün diye (bkz. /admin/companies/{id}/albert-genau-enabled) --
    # varsayılan kapalı, sadece platform admini açar. CompanyCreate/Update
    # modelinde YOK bilerek: firma sahibi kendi kendine açamaz.
    albertGenauEnabled: bool = False
    # Firma sahibinin kendi beyanı: "Albert Genau bayisiyim" -- admin'e bilgi
    # vermek icindir, TEK BASINA erisim ACMAZ (albertGenauEnabled hala admin
    # tarafindan ayrica acilmali). Bu yuzden bilerek CompanyCreate'de de var --
    # albertGenauEnabled'in aksine firma sahibi bunu ozgurce degistirebilir.
    albertGenauClaimed: bool = False
    # Zip Perde bayiligi -- albertGenauEnabled ile ayni kural: sadece platform
    # admini acar (bkz. /admin/companies/{id}/zip-perde-enabled), bu yuzden
    # CompanyCreate'de YOK.
    zipPerdeEnabled: bool = False
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
    albertGenauClaimed: bool = False

    @field_validator("logoBase64")
    @classmethod
    def _logo_size(cls, v: str) -> str:
        if not v:
            return v
        if len(v) > MAX_LOGO_BASE64_CHARS:
            raise ValueError("Logo dosyası çok büyük (maksimum ~2MB)")
        # Only accept an actual base64 image data-URI here. This field gets
        # dropped into an <img src="..."> attribute when building PDFs, so
        # anything else (e.g. `x" onerror="...`) would be a stored-XSS vector.
        if not re.match(r'^data:image/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/]+=*$', v):
            raise ValueError("Logo geçerli bir resim (PNG/JPG/WEBP/GIF) verisi değil")
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
    # Stok takibi (opsiyonel): acik olan urunlerde onaylanan tekliflerdeki
    # adet stoktan otomatik duser (bkz. _apply_quote_stock).
    stokTakip: bool = False
    stok: float = 0.0
    minStok: float = 0.0
    stokKodu: str = ""
    createdAt: str = Field(default_factory=utc_now_iso)


class CatalogItemCreate(BaseModel):
    companyId: str
    kategori: str = "Genel"
    urunAdi: str
    aciklama: str = ""
    birim: str = "Adet"
    birimFiyat: float = 0.0
    paraBirimi: str = "USD"
    # None = dokunma (Excel fiyat guncellemesi stoku sifirlamasin)
    stokTakip: Optional[bool] = None
    stok: Optional[float] = None
    minStok: Optional[float] = None
    stokKodu: Optional[str] = None


class CatalogBulkCreate(BaseModel):
    companyId: str
    items: List[CatalogItemCreate]


class CatalogBulkResult(BaseModel):
    """/catalog/bulk yaniti -- urunAdi eslesen kalemler guncellenir, geri
    kalanlar yeni eklenir; frontend createdCount/updatedCount ile kullaniciya
    'X guncellendi, Y yeni eklendi' gibi bir ozet gosterebilir."""
    items: List[CatalogItem]
    createdCount: int
    updatedCount: int


ALLOWED_CATALOG_FILE_MIME_RE = re.compile(
    r'^data:(application/pdf|image/(png|jpe?g|webp));base64,[A-Za-z0-9+/]+=*$'
)


class CompanyCatalogFile(BaseModel):
    """Firmanın kendi hazırladığı katalog dosyaları (PDF/görsel) — Katalog
    sekmesindeki yapılandırılmış ürün listesinden ayrı: burası hazır bir
    tanıtım/katalog dosyasını olduğu gibi saklayıp müşteriyle paylaşmak için."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    userId: str
    companyId: str
    name: str
    mime: str
    size: int  # decoded byte size, for display
    dataBase64: str
    createdAt: str = Field(default_factory=utc_now_iso)


class CompanyCatalogFileCreate(BaseModel):
    companyId: str
    name: str
    dataBase64: str

    @field_validator("name")
    @classmethod
    def _name_len(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("Dosya adı zorunlu")
        if len(v) > 200:
            v = v[:200]
        return v

    @field_validator("dataBase64")
    @classmethod
    def _file_valid(cls, v: str) -> str:
        if not v:
            raise ValueError("Dosya verisi boş")
        if len(v) > MAX_CATALOG_FILE_BASE64_CHARS:
            raise ValueError("Dosya çok büyük (maksimum ~8MB)")
        if not ALLOWED_CATALOG_FILE_MIME_RE.match(v):
            raise ValueError("Sadece PDF, PNG, JPG veya WEBP dosyaları yüklenebilir")
        return v


class CompanyCatalogFileOut(BaseModel):
    id: str
    companyId: str
    name: str
    mime: str
    size: int
    createdAt: str


class CatalogFileEmailShareRequest(BaseModel):
    toEmail: EmailStr
    message: str = ""

    @field_validator("message")
    @classmethod
    def _message_len(cls, v: str) -> str:
        v = (v or "").strip()
        if len(v) > 1000:
            v = v[:1000]
        return v


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
    quoteId: Optional[str] = None  # onaylanan tekliften otomatik oluşturulduysa bağlantı (mükerrer önleme için)
    tahsilatId: Optional[str] = None  # bir tahsilat (para girişi) kaydından otomatik oluşturulduysa bağlantı
    kurTRY: float = 0.0  # paraBirimi TRY değilse: kayıt anındaki USD/EUR->TRY kuru (bilgi amaçlı, referans)
    hesap: str = "Ana Kasa"  # hangi kasa/banka hesabı (Kasa ayarlarından tanımlanır)
    kdvOrani: float = 0.0  # >0 ise tutar KDV dahildir; KDV özetinde indirilecek/hesaplanan KDV'ye girer
    recurringId: Optional[str] = None  # tekrarlayan bir kuraldan otomatik oluşturulduysa kuralın id'si
    # Kaydı giren/sahiplenen personelin gerçek user_id'si (bkz. _self_id);
    # boşsa firma sahibi/yönetici kaydıdır. Kısıtlı personel Kasa'da yalnız
    # kendi kayıtlarını görür (bkz. list_kasa).
    personelId: str = ""
    # Harcama bir müşteriyle ilgiliyse (nakliye, montaj malzemesi vb.).
    customerId: str = ""
    musteriAdi: str = ""
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
    kurTRY: float = 0.0
    hesap: str = "Ana Kasa"
    kdvOrani: float = 0.0
    customerId: str = ""
    musteriAdi: str = ""


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
    yontem: str = "Nakit"  # Nakit | Kart | Havale/EFT | Çek | Diğer (tahsilat için)
    vadeTarihi: str = ""   # YYYY-MM-DD (borc için, opsiyonel)
    notlar: str = ""
    tarih: str  # YYYY-MM-DD
    quoteId: str = ""  # dolu ise: bu borç bir teklifin "Onaylandı" durumuna geçmesiyle otomatik oluşturuldu
    kurTRY: float = 0.0  # paraBirimi TRY değilse: kayıt anındaki USD/EUR->TRY kuru (bilgi amaçlı, referans)
    # Müşteriden sorumlu personelin gerçek user_id'si; boşsa sahiplik teklif
    # ve müşteri üzerinden çözülür (bkz. _tahsilat_owners).
    personelId: str = ""
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
    kurTRY: float = 0.0


class Customer(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    userId: str
    companyId: str
    firma: str
    yetkili: str = ""
    telefon: str = ""
    email: str = ""
    adres: str = ""
    # e-Fatura/e-Arsiv icin alici bilgileri (opsiyonel).
    vergiNo: str = ""
    vergiDairesi: str = ""
    il: str = ""
    ilce: str = ""
    # Müşteriyi ekleyen kişinin gerçek user_id'si (bkz. _self_id); kısıtlı
    # personel yalnız kendi müşterilerini görür (bkz. _visible_customers).
    createdByUserId: str = ""
    createdAt: str = Field(default_factory=utc_now_iso)


class CustomerCreate(BaseModel):
    companyId: str
    firma: str
    yetkili: str = ""
    telefon: str = ""
    email: str = ""
    adres: str = ""
    # None = bu alanlara dokunma (eski istemciler gondermez, mevcut deger silinmesin)
    vergiNo: Optional[str] = None
    vergiDairesi: Optional[str] = None
    il: Optional[str] = None
    ilce: Optional[str] = None


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
    # Teklif verildikten sonra bu kaleme ait isteğe bağlı maliyet girişi --
    # kalem bazında girilince Quote.maliyet toplamı otomatik hesaplanır
    # (bkz. update_quote_item_maliyet).
    maliyet: Optional[float] = None
    # Albert Genau hesaplayıcısından eklenen kalemler için maliyet kırılımı
    # (kar HARİÇ) -- Geçmiş ekranındaki "Maliyet Ekle" alanı, yukarıdaki
    # `maliyet` henüz elle girilmemişse bu üçünün toplamıyla otomatik
    # doldurulur (bkz. frontend history.tsx). Sadece bir öneri kaynağıdır;
    # `maliyet` alanı her zaman öncelikli kalır.
    agMaliyet: Optional[float] = None
    agMontajBedeli: Optional[float] = None
    agImalatBedeli: Optional[float] = None
    # Kalemin cizim modeli (bkz. ag_geometry.py). Teklif PDF'indeki teknik
    # cizim sayfasi bundan uretilir. Serbest sekilli tutulur: modelin alanlari
    # (cephe/modul/giyotin) aile bazinda degisiyor ve burada dogrulanmasi
    # gerekmiyor -- uretildigi yer zaten ag_geometry.
    agCizim: Optional[Dict[str, Any]] = None
    # Zip Perde secimi (orn. {"motor": "somfy", "kumas": "screen", "logo": "var"};
    # eski kayitlarda {"logo": true} gibi bool). Ek fiyatlar icin bkz.
    # frontend src/lib/zip-perde.ts ZIP_GRUPLAR.
    zipEkler: Optional[Dict[str, Any]] = None
    # Zip Perde montaj bedeli (perde basina TL; fiyata EUR'ya cevrilip kar
    # HARIC en sona eklenir).
    zipMontajTl: Optional[float] = None


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
    maliyet: Optional[float] = None
    # Kaleme bağlı olmayan, kullanıcının serbestçe "açıklama + fiyat" olarak
    # ekleyip çıkarabildiği ek maliyet satırları (örn. nakliye, ekstra
    # işçilik). Kalem bazlı maliyetlerin (items[].maliyet) yanına eklenir,
    # onların yerine geçmez -- bkz. _recompute_quote_maliyet.
    ekstraMaliyetler: List[Dict[str, Any]] = Field(default_factory=list)
    # Bu teklifi GERÇEKTE kim oluşturdu (Quote.userId firma-paylaşımlı/ortak
    # bir kimliktir -- personel de sahip de aynı userId altında saklanır --
    # bu yüzden ekip içi düzenleme izni burada ayrıca tutulan gerçek
    # kimliğe bakar, bkz. _actor_email/_self_id ve /quotes/{id}/edit-requests).
    createdByUserId: str = ""
    createdByEmail: str = ""
    createdByName: str = ""
    # Musteriye verilen kampanya/kupon kodu (bkz. /coupons) -- iskonto'ya
    # zaten yansitilmis olarak gelir, burada sadece kayit/kullanim sayimi icin.
    kuponKodu: str = ""
    # Ilk "Onaylandı" anı (personel primi donem hesabi icin).
    approvedAt: Optional[str] = None
    # Onayla birlikte katalog stoğundan düşüldü mü (bkz. _apply_quote_stock).
    stokDusuldu: bool = False
    createdAt: str = Field(default_factory=utc_now_iso)
    updatedAt: str = Field(default_factory=utc_now_iso)
    deletedAt: Optional[str] = None


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
    kuponKodu: str = ""


class QuoteStatusUpdate(BaseModel):
    durum: str


class QuoteMaliyetUpdate(BaseModel):
    maliyet: Optional[float] = None


class QuoteItemMaliyetUpdate(BaseModel):
    itemId: str
    maliyet: Optional[float] = None


class QuoteEkstraMaliyetItem(BaseModel):
    id: str
    aciklama: str = ""
    tutar: float = 0


class QuoteEkstraMaliyetUpdate(BaseModel):
    # Her seferinde tüm listeyi gönderip yerine yazıyoruz (ekle/çıkar/güncelle
    # hepsi aynı uçtan) -- basit ve tutarlı tutmak için.
    ekstraMaliyetler: List[QuoteEkstraMaliyetItem] = Field(default_factory=list)


# Bir ekip üyesi başka bir üyenin oluşturduğu teklifi düzenlemek isterse,
# doğrudan değiştiremesin diye -- teklifi oluşturan kişiden onay istenir.
# Onaylanınca tek seferlik düzenleme hakkı doğar (bkz. update_quote).
class QuoteEditRequest(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    quoteId: str
    companyId: str
    ownerUserId: str  # firma-paylaşımlı ortak userId (sorgu kapsamı için)
    requestedByUserId: str
    requestedByEmail: str = ""
    requestedByName: str = ""
    approverUserId: str
    approverEmail: str = ""
    teklifNo: str = ""
    musFirma: str = ""
    status: str = "pending"  # pending | approved | denied
    createdAt: str = Field(default_factory=utc_now_iso)
    resolvedAt: Optional[str] = None


class QuoteEditRequestRespond(BaseModel):
    approve: bool


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


# Kullanıcının Takvim/Hatırlatmalar ekranında kendi eliyle oluşturduğu
# serbest not/hatırlatıcı -- garanti/bakım/teklif/kampanya gibi otomatik
# üretilen hatırlatmalardan farklı olarak tamamen manuel, herhangi bir
# tarihe bağlanabilir (randevu, geri arama, vs).
class ManualReminder(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    userId: str
    companyId: str
    baslik: str
    notu: str = ""
    tarih: str  # YYYY-MM-DD
    tamamlandi: bool = False
    icsUid: str = ""  # .ics iceri aktarimindan geldiyse (mukerrer onleme)
    createdAt: str = Field(default_factory=utc_now_iso)
    updatedAt: str = Field(default_factory=utc_now_iso)


class ManualReminderCreate(BaseModel):
    companyId: str
    baslik: str
    notu: str = ""
    tarih: str


class ManualReminderUpdate(BaseModel):
    baslik: Optional[str] = None
    notu: Optional[str] = None
    tarih: Optional[str] = None
    tamamlandi: Optional[bool] = None


# ============ HELPERS ============
def compute_totals(items: List[QuoteItem], iskonto: float, kdvOrani: float):
    subtotal = sum((it.adet or 0) * (it.birimFiyat or 0) for it in items)
    iskontoTutar = subtotal * (iskonto or 0) / 100
    araToplam = subtotal - iskontoTutar
    kdvTutar = araToplam * (kdvOrani or 0) / 100
    genelToplam = araToplam + kdvTutar
    return subtotal, iskontoTutar, kdvTutar, genelToplam


async def _own_company(user: Dict[str, Any], company_id: str):
    doc = await db.companies.find_one({"id": company_id, "userId": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Company not found or not yours")
    # A staff account is only ever meant to touch the ONE company they were
    # invited into — without this, staff could reach any OTHER company the
    # same owner also happens to run, just because both resolve to the same
    # owner user_id for data-scoping purposes.
    staff_company = user.get("staff_of_company_id")
    if user.get("is_staff") and staff_company and staff_company != company_id:
        raise HTTPException(status_code=403, detail="Bu firmaya erişim izniniz yok")
    return doc


def _require_albert_genau_enabled(company_doc: Optional[Dict[str, Any]]):
    # Albert Genau modulu, admin bu firma icin acmadikca (bkz.
    # PATCH /admin/companies/{id}/albert-genau-enabled) kullanilamaz --
    # ownership dogrulamasi (_own_company) tek basina yeterli degil, cunku
    # o sadece "bu firma senin" der, "bu firma Albert Genau bayisi" demez.
    if not company_doc or not company_doc.get("albertGenauEnabled"):
        raise HTTPException(status_code=403, detail="Bu firma icin Albert Genau modulu aktif degil")


def _require_zip_perde_enabled(company_doc: Optional[Dict[str, Any]]):
    if not company_doc or not company_doc.get("zipPerdeEnabled"):
        raise HTTPException(status_code=403, detail="Bu firma icin Zip Perde modulu aktif degil")


# ============ COMPANY ROUTES ============
@api_router.get("/")
async def root():
    return {"message": "Anında Teklif API", "status": "ok"}


@api_router.get("/health")
async def health():
    # Railway bu ucu düzenli olarak yoklar: process ayakta görünse bile
    # MongoDB'ye erişemiyorsa (deadlock/bağlantı kopması gibi) burası hata
    # döner ve Railway servisi otomatik olarak yeniden başlatır -- process'in
    # sadece "canlı" değil "sağlıklı" olduğunu doğrulayan tek uç bu.
    try:
        await db.command("ping")
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"DB unreachable: {e}")
    return {"status": "ok"}


@api_router.get("/companies", response_model=List[Company])
async def list_companies(user=Depends(get_current_user)):
    if user.get("is_staff") and user.get("staff_of_company_id"):
        docs = await db.companies.find(
            {"userId": user["user_id"], "id": user["staff_of_company_id"]}, {"_id": 0}
        ).to_list(1000)
    else:
        docs = await db.companies.find({"userId": user["user_id"]}, {"_id": 0}).to_list(1000)
    return [Company(**d) for d in docs]


@api_router.post("/companies", response_model=Company)
async def create_company(payload: CompanyCreate, user=Depends(get_current_user)):
    obj = Company(userId=user["user_id"], **payload.dict())
    await db.companies.insert_one(obj.dict())
    return obj


@api_router.get("/companies/{company_id}", response_model=Company)
async def get_company(company_id: str, user=Depends(get_current_user)):
    doc = await _own_company(user, company_id)
    return Company(**doc)


@api_router.put("/companies/{company_id}", response_model=Company)
async def update_company(company_id: str, payload: CompanyCreate, user=Depends(get_current_user)):
    doc = await _own_company(user, company_id)
    if user.get("is_staff"):
        # Staff can still hit this endpoint for the one thing they're allowed
        # to touch (Teklif ekranındaki "özel notlar") -- but the Yapılandırıcı
        # (sistemTipleri) itself is owner-only, so block only when that part
        # of the payload actually differs from what's saved.
        existing_systems = doc.get("sistemTipleri") or []
        new_systems = [s.dict() if hasattr(s, "dict") else s for s in (payload.sistemTipleri or [])]
        if new_systems != existing_systems:
            raise HTTPException(status_code=403, detail="Hizmet/Ürün Yapılandırıcı'yı sadece firma sahibi düzenleyebilir")
    updated = {**doc, **payload.dict(), "userId": user["user_id"], "updatedAt": utc_now_iso()}
    await db.companies.replace_one({"id": company_id, "userId": user["user_id"]}, updated)
    return Company(**updated)


@api_router.delete("/companies/{company_id}")
async def delete_company(company_id: str, user=Depends(get_current_user)):
    await _own_company(user, company_id)
    uid = user["user_id"]
    await db.companies.delete_one({"id": company_id, "userId": uid})
    await db.catalog.delete_many({"companyId": company_id, "userId": uid})
    await db.customers.delete_many({"companyId": company_id, "userId": uid})
    await db.quotes.delete_many({"companyId": company_id, "userId": uid})
    await db.services.delete_many({"companyId": company_id, "userId": uid})
    await db.campaigns.delete_many({"companyId": company_id, "userId": uid})
    await db.manual_reminders.delete_many({"companyId": company_id, "userId": uid})
    await db.kasa.delete_many({"companyId": company_id, "userId": uid})
    await db.tahsilat.delete_many({"companyId": company_id, "userId": uid})
    return {"ok": True}


# ============ TEAM / STAFF MEMBERS ============
# A company can have staff accounts besides the owner. Staff log in with
# their own email/password but get_current_user() resolves them straight to
# the owner's user_id for every company-scoped query (quotes, customers,
# kasa, tahsilat, catalog, services, campaigns, subscription) — see the
# resolution logic there. This section only covers inviting/listing/removing
# staff; the "share the owner's data" part needs no changes anywhere else.

STAFF_INVITE_EXPIRY_DAYS = 7
STAFF_ROLES = ("admin", "staff")  # "staff" is blocked from Kasa/Tahsilat


class StaffInviteRequest(BaseModel):
    email: EmailStr
    role: str = "staff"

    @field_validator("role")
    @classmethod
    def _role(cls, v: str) -> str:
        if v not in STAFF_ROLES:
            raise ValueError("Geçersiz rol")
        return v


class StaffInviteResponse(BaseModel):
    invite_id: str
    email: str
    role: str
    invite_link: str
    expires_at: str


class StaffInviteInfo(BaseModel):
    valid: bool
    reason: Optional[str] = None
    company_name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None


class StaffAcceptRequest(BaseModel):
    name: str
    password: str

    @field_validator("password")
    @classmethod
    def _pw(cls, v: str) -> str:
        try:
            return _validate_password(v)
        except ValueError as e:
            raise ValueError(str(e))


class StaffMemberOut(BaseModel):
    type: str  # "active" | "pending"
    id: str  # user_id for active, invite_id for pending
    email: str
    role: str
    name: str = ""
    createdAt: str = ""


async def _send_staff_invite_email(to_email: str, company_name: str, invite_link: str):
    """Best-effort — same Resend setup as password-reset email. If
    RESEND_API_KEY isn't configured, this silently no-ops: the invite link
    returned in the API response (for the owner to share manually) is always
    the primary path regardless of whether this succeeds."""
    if not RESEND_API_KEY:
        return
    try:
        await asyncio.to_thread(
            requests.post,
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
            json={
                "from": RESEND_FROM_EMAIL,
                "to": [to_email],
                "subject": f"{company_name} sizi Anında Teklif'e davet etti",
                "html": (
                    "<div style=\"font-family:sans-serif;max-width:480px;margin:0 auto;\">"
                    f"<p><b>{esc(company_name)}</b> sizi Anında Teklif ekibine davet etti.</p>"
                    "<p>Katılmak için aşağıdaki bağlantıya tıklayıp bir şifre belirleyin.</p>"
                    f"<p><a href=\"{invite_link}\" style=\"display:inline-block;background:#2563eb;color:#fff;"
                    "padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;\">Daveti Kabul Et</a></p>"
                    "</div>"
                ),
            },
            timeout=10,
        )
    except Exception:
        logging.warning("[StaffInvite] resend send exception", exc_info=True)


@api_router.post("/company/{company_id}/members/invite", response_model=StaffInviteResponse)
async def invite_staff_member(company_id: str, payload: StaffInviteRequest, user=Depends(get_current_user)):
    if user.get("is_staff"):
        raise HTTPException(status_code=403, detail="Sadece firma sahibi personel davet edebilir")
    # Davet e-postasi rastgele adrese gidebildigi icin kullanici basina
    # saatlik sinir -- aksi halde bu uc toplu e-posta araci olarak
    # kullanilabilir ve gonderim alan adimiz kara listeye duser.
    _rate_limit(f"staff-invite:user:{user['user_id']}", 20, 3600)
    company = await _own_company(user, company_id)
    email = _normalize_email(payload.email)

    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    if existing_user and not existing_user.get("staff_owner_user_id"):
        raise HTTPException(status_code=409, detail="Bu e-posta zaten başka bir hesapla kayıtlı")
    if existing_user and existing_user.get("staff_of_company_id") == company_id:
        raise HTTPException(status_code=409, detail="Bu kişi zaten ekibinizde")

    token = py_secrets.token_urlsafe(24)
    invite_id = str(uuid.uuid4())
    expires_at = utc_now() + timedelta(days=STAFF_INVITE_EXPIRY_DAYS)
    await db.company_invites.insert_one({
        "id": invite_id,
        "companyId": company_id,
        "ownerUserId": user["user_id"],
        "email": email,
        "role": payload.role,
        "token": token,
        "status": "pending",
        "createdAt": utc_now_iso(),
        "expiresAt": expires_at.isoformat(),
    })
    invite_link = f"{FRONTEND_BASE_URL.rstrip('/')}/join?token={token}"
    await _send_staff_invite_email(email, company.get("sirketAdi") or "Firma", invite_link)
    return StaffInviteResponse(
        invite_id=invite_id, email=email, role=payload.role, invite_link=invite_link,
        expires_at=expires_at.isoformat(),
    )


@api_router.get("/company/invites/{token}", response_model=StaffInviteInfo)
async def get_staff_invite(token: str):
    invite = await db.company_invites.find_one({"token": token}, {"_id": 0})
    if not invite:
        return StaffInviteInfo(valid=False, reason="Davet bulunamadı")
    if invite.get("status") != "pending":
        return StaffInviteInfo(valid=False, reason="Bu davet artık geçerli değil")
    exp = invite.get("expiresAt")
    try:
        exp_dt = datetime.fromisoformat(exp) if exp else None
        if exp_dt and exp_dt.tzinfo is None:
            exp_dt = exp_dt.replace(tzinfo=timezone.utc)
    except Exception:
        exp_dt = None
    if exp_dt and exp_dt < utc_now():
        return StaffInviteInfo(valid=False, reason="Davetin süresi dolmuş")
    company = await db.companies.find_one({"id": invite["companyId"]}, {"_id": 0})
    return StaffInviteInfo(
        valid=True, company_name=(company or {}).get("sirketAdi") or "Firma",
        email=invite["email"], role=invite["role"],
    )


@api_router.post("/company/invites/{token}/accept", response_model=AuthResponse)
async def accept_staff_invite(token: str, payload: StaffAcceptRequest, request: Request):
    _rate_limit(f"invite-accept:ip:{_client_ip(request)}", 10, 3600)
    invite = await db.company_invites.find_one({"token": token}, {"_id": 0})
    if not invite or invite.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Geçersiz veya kullanılmış davet")
    exp = invite.get("expiresAt")
    try:
        exp_dt = datetime.fromisoformat(exp) if exp else None
        if exp_dt and exp_dt.tzinfo is None:
            exp_dt = exp_dt.replace(tzinfo=timezone.utc)
    except Exception:
        exp_dt = None
    if exp_dt and exp_dt < utc_now():
        raise HTTPException(status_code=400, detail="Davetin süresi dolmuş")

    email = invite["email"]
    if await db.users.find_one({"email": email}, {"_id": 0}):
        raise HTTPException(status_code=409, detail="Bu e-posta zaten kayıtlı")

    user_id = f"user_{uuid.uuid4().hex[:12]}"
    new_user = {
        "user_id": user_id,
        "email": email,
        "hashed_password": _hash_password(payload.password),
        "name": (payload.name or "").strip(),
        "phone": "",
        "picture": "",
        "country": "",
        "currency": "",
        "tax_label": "",
        "onboarding_completed": True,  # staff joins an already-set-up company, skip onboarding
        "staff_of_company_id": invite["companyId"],
        "staff_owner_user_id": invite["ownerUserId"],
        "staff_role": invite["role"],
        "createdAt": utc_now().isoformat(),
    }
    await db.users.insert_one(new_user)
    await db.company_invites.update_one(
        {"id": invite["id"]}, {"$set": {"status": "accepted", "acceptedByUserId": user_id}}
    )
    access = _make_access_token(new_user)
    return AuthResponse(access_token=access, user=_user_out(new_user))


@api_router.get("/company/{company_id}/members", response_model=List[StaffMemberOut])
async def list_staff_members(company_id: str, user=Depends(get_current_user)):
    if user.get("is_staff"):
        raise HTTPException(status_code=403, detail="Sadece firma sahibi ekibi görebilir")
    await _own_company(user, company_id)
    out: List[StaffMemberOut] = []
    active = await db.users.find(
        {"staff_of_company_id": company_id, "staff_owner_user_id": user["user_id"]}, {"_id": 0}
    ).to_list(500)
    for u in active:
        out.append(StaffMemberOut(
            type="active", id=u["user_id"], email=u["email"], role=u.get("staff_role", "staff"),
            name=u.get("name", ""), createdAt=u.get("createdAt", ""),
        ))
    pending = await db.company_invites.find(
        {"companyId": company_id, "ownerUserId": user["user_id"], "status": "pending"}, {"_id": 0}
    ).to_list(500)
    for inv in pending:
        out.append(StaffMemberOut(
            type="pending", id=inv["id"], email=inv["email"], role=inv.get("role", "staff"),
            createdAt=inv.get("createdAt", ""),
        ))
    return out


@api_router.delete("/company/{company_id}/members/{member_user_id}")
async def remove_staff_member(company_id: str, member_user_id: str, user=Depends(get_current_user)):
    if user.get("is_staff"):
        raise HTTPException(status_code=403, detail="Sadece firma sahibi personeli çıkarabilir")
    await _own_company(user, company_id)
    result = await db.users.update_one(
        {"user_id": member_user_id, "staff_of_company_id": company_id, "staff_owner_user_id": user["user_id"]},
        {"$unset": {"staff_owner_user_id": "", "staff_of_company_id": "", "staff_role": ""}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Personel bulunamadı")
    return {"ok": True}


@api_router.delete("/company/{company_id}/invites/{invite_id}")
async def revoke_staff_invite(company_id: str, invite_id: str, user=Depends(get_current_user)):
    if user.get("is_staff"):
        raise HTTPException(status_code=403, detail="Sadece firma sahibi daveti iptal edebilir")
    await _own_company(user, company_id)
    result = await db.company_invites.update_one(
        {"id": invite_id, "companyId": company_id, "ownerUserId": user["user_id"], "status": "pending"},
        {"$set": {"status": "revoked"}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Davet bulunamadı")
    return {"ok": True}


# ============ TEAM CHAT (personel içi mesajlaşma) ============
# Aynı firmadaki firma sahibi + personelin uygulama içinden birbirine mesaj
# atabilmesi için basit bir DM (birebir mesajlaşma) altyapısı. Firma sahibi
# ekipteki HERKESİN kimle ne konuştuğunu görebilir (oversight); personel ise
# sadece kendi dahil olduğu konuşmaları görür.
class TeamMessageCreate(BaseModel):
    companyId: str
    recipientId: str
    text: str

    @field_validator("text")
    @classmethod
    def _text_len(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("Mesaj boş olamaz")
        if len(v) > 2000:
            raise ValueError("Mesaj çok uzun")
        return v


class TeamMessageOut(BaseModel):
    id: str
    companyId: str
    senderId: str
    senderName: str
    recipientId: str
    recipientName: str
    text: str
    createdAt: str
    readAt: Optional[str] = None


class TeamDirectoryMember(BaseModel):
    userId: str
    name: str
    email: str
    role: str  # "owner" | staff_role


class TeamConversationOut(BaseModel):
    otherUserId: Optional[str] = None
    otherUserName: Optional[str] = None
    lastText: str
    lastAt: str
    unreadCount: int = 0
    participantAId: Optional[str] = None
    participantAName: Optional[str] = None
    participantBId: Optional[str] = None
    participantBName: Optional[str] = None


def _team_msg_out(m: Dict[str, Any]) -> TeamMessageOut:
    return TeamMessageOut(
        id=m["id"], companyId=m["companyId"], senderId=m["senderId"], senderName=m.get("senderName", ""),
        recipientId=m["recipientId"], recipientName=m.get("recipientName", ""), text=m["text"],
        createdAt=m["createdAt"], readAt=m.get("readAt"),
    )


async def _team_display_name(u: Dict[str, Any]) -> str:
    return (u.get("name") or "").strip() or (u.get("email") or "Kullanıcı")


@api_router.get("/team/directory", response_model=List[TeamDirectoryMember])
async def team_directory(company_id: str, user=Depends(get_current_user)):
    await _own_company(user, company_id)
    owner_id = user["user_id"]
    owner_doc = await db.users.find_one({"user_id": owner_id}, {"_id": 0}) or {}
    out = [TeamDirectoryMember(
        userId=owner_id, name=await _team_display_name(owner_doc),
        email=owner_doc.get("email", ""), role="owner",
    )]
    staff = await db.users.find(
        {"staff_of_company_id": company_id, "staff_owner_user_id": owner_id}, {"_id": 0}
    ).to_list(500)
    for s in staff:
        out.append(TeamDirectoryMember(
            userId=s["user_id"], name=await _team_display_name(s),
            email=s.get("email", ""), role=s.get("staff_role", "staff"),
        ))
    return out


@api_router.post("/team/messages", response_model=TeamMessageOut)
async def send_team_message(payload: TeamMessageCreate, user=Depends(get_current_user)):
    await _own_company(user, payload.companyId)
    self_id = _self_id(user)
    owner_id = user["user_id"]
    if payload.recipientId == self_id:
        raise HTTPException(status_code=400, detail="Kendinize mesaj gönderemezsiniz")

    if payload.recipientId == owner_id:
        recipient = await db.users.find_one({"user_id": owner_id}, {"_id": 0})
    else:
        recipient = await db.users.find_one(
            {"user_id": payload.recipientId, "staff_of_company_id": payload.companyId, "staff_owner_user_id": owner_id},
            {"_id": 0},
        )
    if not recipient:
        raise HTTPException(status_code=404, detail="Alıcı bu ekipte bulunamadı")

    self_doc = await db.users.find_one({"user_id": self_id}, {"_id": 0}) or {}
    msg = {
        "id": str(uuid.uuid4()),
        "companyId": payload.companyId,
        "senderId": self_id,
        "senderName": await _team_display_name(self_doc),
        "recipientId": payload.recipientId,
        "recipientName": await _team_display_name(recipient),
        "text": payload.text,
        "createdAt": utc_now_iso(),
        "readAt": None,
        "deletedFor": [],
        # Yonetici oversight'i icin mesaj burada 30 gun tutulur; personel
        # kendi tarafinda 'deletedFor' ile hemen gizleyebilir ama gercek kayit
        # bu tarihe kadar (yukaridaki TTL index sayesinde) veritabaninda kalir.
        "expiresAt": _utc() + timedelta(days=30),
    }
    await db.team_messages.insert_one(msg)
    return _team_msg_out(msg)


@api_router.get("/team/messages", response_model=List[TeamMessageOut])
async def get_team_thread(company_id: str, with_: str = Query(..., alias="with"), user=Depends(get_current_user)):
    await _own_company(user, company_id)
    self_id = _self_id(user)
    msgs = await db.team_messages.find({
        "companyId": company_id,
        "deletedFor": {"$ne": self_id},
        "$or": [
            {"senderId": self_id, "recipientId": with_},
            {"senderId": with_, "recipientId": self_id},
        ],
    }, {"_id": 0}).sort("createdAt", 1).to_list(2000)
    await db.team_messages.update_many(
        {"companyId": company_id, "senderId": with_, "recipientId": self_id, "readAt": None},
        {"$set": {"readAt": utc_now_iso()}},
    )
    return [_team_msg_out(m) for m in msgs]


@api_router.delete("/team/messages")
async def delete_team_thread_for_self(company_id: str, with_: str = Query(..., alias="with"), user=Depends(get_current_user)):
    """Personelin/kullanicinin 'Konusmayi Sil' istegi -- sadece KENDI
    gorunumunden hemen kaldirir (deletedFor). Firma sahibinin oversight
    ('Tum Konusmalar') gorunumu ve 30 gunluk saklama suresi bundan
    etkilenmez; gercek kayit TTL index'e kadar veritabaninda kalmaya
    devam eder."""
    await _own_company(user, company_id)
    self_id = _self_id(user)
    await db.team_messages.update_many(
        {
            "companyId": company_id,
            "$or": [
                {"senderId": self_id, "recipientId": with_},
                {"senderId": with_, "recipientId": self_id},
            ],
        },
        {"$addToSet": {"deletedFor": self_id}},
    )
    return {"ok": True}


@api_router.get("/team/messages/admin", response_model=List[TeamMessageOut])
async def get_team_thread_admin(company_id: str, a: str, b: str, user=Depends(get_current_user)):
    if user.get("is_staff"):
        raise HTTPException(status_code=403, detail="Sadece firma sahibi tüm konuşmaları görebilir")
    await _own_company(user, company_id)
    msgs = await db.team_messages.find({
        "companyId": company_id,
        "$or": [{"senderId": a, "recipientId": b}, {"senderId": b, "recipientId": a}],
    }, {"_id": 0}).sort("createdAt", 1).to_list(2000)
    return [_team_msg_out(m) for m in msgs]


@api_router.get("/team/conversations", response_model=List[TeamConversationOut])
async def list_team_conversations(company_id: str, scope: str = "mine", user=Depends(get_current_user)):
    await _own_company(user, company_id)
    self_id = _self_id(user)
    is_owner = not user.get("is_staff")
    if scope == "all" and not is_owner:
        raise HTTPException(status_code=403, detail="Sadece firma sahibi tüm konuşmaları görebilir")

    msgs = await db.team_messages.find({"companyId": company_id}, {"_id": 0}).sort("createdAt", 1).to_list(5000)

    if scope == "all":
        groups: Dict[str, Dict[str, Any]] = {}
        for m in msgs:
            pair = tuple(sorted([m["senderId"], m["recipientId"]]))
            key = f"{pair[0]}|{pair[1]}"
            g = groups.setdefault(key, {"participantAId": pair[0], "participantBId": pair[1], "_names": {}})
            g["lastText"] = m["text"]
            g["lastAt"] = m["createdAt"]
            g["_names"][m["senderId"]] = m.get("senderName", "")
            g["_names"][m["recipientId"]] = m.get("recipientName", "")
        out = []
        for g in groups.values():
            names = g.pop("_names")
            out.append(TeamConversationOut(
                lastText=g["lastText"], lastAt=g["lastAt"],
                participantAId=g["participantAId"], participantAName=names.get(g["participantAId"], ""),
                participantBId=g["participantBId"], participantBName=names.get(g["participantBId"], ""),
            ))
        out.sort(key=lambda c: c.lastAt, reverse=True)
        return out

    groups2: Dict[str, Dict[str, Any]] = {}
    unread: Dict[str, int] = {}
    for m in msgs:
        if m["senderId"] != self_id and m["recipientId"] != self_id:
            continue
        if self_id in (m.get("deletedFor") or []):
            continue
        other_id = m["recipientId"] if m["senderId"] == self_id else m["senderId"]
        other_name = m.get("recipientName", "") if m["senderId"] == self_id else m.get("senderName", "")
        groups2[other_id] = {"otherUserId": other_id, "otherUserName": other_name, "lastText": m["text"], "lastAt": m["createdAt"]}
        if m["recipientId"] == self_id and not m.get("readAt"):
            unread[other_id] = unread.get(other_id, 0) + 1
    out2 = [
        TeamConversationOut(
            otherUserId=g["otherUserId"], otherUserName=g["otherUserName"],
            lastText=g["lastText"], lastAt=g["lastAt"], unreadCount=unread.get(other_id, 0),
        )
        for other_id, g in groups2.items()
    ]
    out2.sort(key=lambda c: c.lastAt, reverse=True)
    return out2


# ============ CATALOG ROUTES ============
@api_router.get("/catalog/{company_id}", response_model=List[CatalogItem])
async def list_catalog(company_id: str, user=Depends(get_current_user)):
    await _own_company(user, company_id)
    docs = await db.catalog.find({"companyId": company_id, "userId": user["user_id"]}, {"_id": 0}).to_list(2000)
    return [CatalogItem(**d) for d in docs]


# Hizmet/Ürün kataloğu ve Yapılandırıcı sadece firma sahibi tarafından
# yönetilir -- personel bunları görüp teklifte kullanabilir ama
# ekleyemez/düzenleyemez/silemez.
def _require_owner(user: Dict[str, Any]):
    if user.get("is_staff"):
        raise HTTPException(status_code=403, detail="Bu işlemi sadece firma sahibi yapabilir")


@api_router.post("/catalog", response_model=CatalogItem)
async def create_catalog_item(payload: CatalogItemCreate, user=Depends(get_current_user)):
    _require_owner(user)
    await _own_company(user, payload.companyId)
    obj = CatalogItem(userId=user["user_id"], **payload.dict(exclude_none=True))
    await db.catalog.insert_one(obj.dict())
    if obj.stokTakip and obj.stok:
        await _log_stock_move(user, obj.dict(), "giris", obj.stok, 0.0, obj.stok, "Açılış stoku")
    return obj


@api_router.post("/catalog/bulk", response_model=CatalogBulkResult)
async def bulk_create_catalog(payload: CatalogBulkCreate, user=Depends(get_current_user)):
    _require_owner(user)
    await _own_company(user, payload.companyId)
    # Ayni fiyat listesi (Excel/CSV) -- tablo duzeni aynen kalip sadece
    # fiyatlar zam gorunce -- Katalog'dan tekrar yuklendiginde, ayni urun
    # adiyla ZATEN VAR OLAN kalemi coklamak yerine sadece fiyat/birim/
    # aciklama/kategori bilgisini GUNCELLER. Boylece Teklif ekraninda o
    # urun secildiginde hesaplama artik yeni yuklenen fiyattan devam eder.
    # Eslesme, ayni firma icinde urunAdi'nin (bosluk kirpilmis, kucuk harfe
    # cevrilmis) tekil oldugu varsayimiyla yapilir.
    existing_docs = await db.catalog.find(
        {"companyId": payload.companyId, "userId": user["user_id"]}, {"_id": 0}
    ).to_list(5000)
    existing_by_name: Dict[str, dict] = {}
    for doc in existing_docs:
        key = (doc.get("urunAdi") or "").strip().casefold()
        if key and key not in existing_by_name:
            existing_by_name[key] = doc

    result: List[CatalogItem] = []
    created_count = 0
    updated_count = 0
    for it in payload.items:
        d = it.dict(exclude_none=True)
        d["companyId"] = payload.companyId
        key = (d.get("urunAdi") or "").strip().casefold()
        match = existing_by_name.get(key) if key else None
        if match:
            updated_doc = {**match, **d}
            await db.catalog.replace_one({"id": match["id"], "userId": user["user_id"]}, updated_doc)
            result.append(CatalogItem(**updated_doc))
            updated_count += 1
        else:
            obj = CatalogItem(userId=user["user_id"], **d)
            await db.catalog.insert_one(obj.dict())
            if key:
                existing_by_name[key] = obj.dict()
            result.append(obj)
            created_count += 1
    return CatalogBulkResult(items=result, createdCount=created_count, updatedCount=updated_count)


@api_router.put("/catalog/{item_id}", response_model=CatalogItem)
async def update_catalog_item(item_id: str, payload: CatalogItemCreate, user=Depends(get_current_user)):
    _require_owner(user)
    await _own_company(user, payload.companyId)
    doc = await db.catalog.find_one({"id": item_id, "userId": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Item not found")
    updated = {**doc, **payload.dict(exclude_none=True)}
    await db.catalog.replace_one({"id": item_id, "userId": user["user_id"]}, updated)
    old_stok = float(doc.get("stok") or 0)
    new_stok = float(updated.get("stok") or 0)
    if updated.get("stokTakip") and abs(new_stok - old_stok) > 1e-9:
        await _log_stock_move(user, updated, "duzeltme", new_stok - old_stok, old_stok, new_stok, "Elle düzeltme")
    return CatalogItem(**updated)


@api_router.delete("/catalog/{item_id}")
async def delete_catalog_item(item_id: str, user=Depends(get_current_user)):
    _require_owner(user)
    await db.catalog.delete_one({"id": item_id, "userId": user["user_id"]})
    return {"ok": True}


# ============ REKLAM ISTIHBARATI (rakip reklam takibi / "ad-spy") ============
# MyDijital OS'teki "Reklam Istihbarati" modulunun karsiligi: rakiplerin
# (Meta/Instagram/Facebook vb.) reklamlarini kaydedip, ne kadar suredir
# yayinda olduklarina bakarak bir "kazanma sinyali" puani hesapliyoruz --
# bir reklam ne kadar uzun sure durmadan yayinda kaliyorsa, reklamverenin
# onu o kadar "kazanan" (donusum getiren) bir reklam olarak degerlendirip
# butcesini kesmedigi varsayilir; bu tum ad-spy araclarinin (MyDijital
# dahil) kullandigi standart, kabaca dogru bir sezgidir.
#
# Canli Meta Reklam Kutuphanesi taramasi resmi bir Facebook Gelistirici
# uygulamasi + erisim jetonu gerektirdigi icin (bkz. sohbet gecmisi), ilk
# surum MyDijital'in kendisinin de sundugu JSON/CSV ice aktarma yolunu
# birincil veri girisi olarak kullanir -- bayi, kendi bulduklarini (ekran
# goruntusu + not olarak, ya da baska bir arac ile) buraya elle veya toplu
# olarak ekler; canli otomatik tarama ileride ayri bir gelistirme.
AD_DURUM_VALUES = {"Aktif", "Pasif"}


def _ad_gun_sayisi(ilk: str, son: str, durum: str) -> int:
    """Ilk ve son gorulme tarihleri arasindaki gun sayisi (yayin suresi).
    Durum "Aktif" ise 'son gorulme' yerine bugun kullanilir -- hala
    yayinda oldugu icin suresi her gecen gun artmaya devam eder."""
    try:
        d1 = datetime.strptime((ilk or "")[:10], "%Y-%m-%d")
    except ValueError:
        return 0
    if durum == "Aktif":
        d2 = _utc().replace(tzinfo=None)
    else:
        try:
            d2 = datetime.strptime((son or ilk or "")[:10], "%Y-%m-%d")
        except ValueError:
            d2 = d1
    return max(0, (d2 - d1).days)


def _ad_kazanma_skoru(gun: int) -> int:
    # 0-100 arasi kaba bir puan: her gun ~3 puan, 34+ gunde tavan (100).
    return min(100, round(gun * 3))


def _ad_kazanma_sinyali(gun: int) -> str:
    if gun >= 30:
        return "Çok Güçlü"
    if gun >= 14:
        return "Güçlü"
    if gun >= 5:
        return "Test Edilebilir"
    return "Zayıf"


def _ad_record_out(d: Dict[str, Any]) -> Dict[str, Any]:
    gun = _ad_gun_sayisi(d.get("ilkGorulmeTarihi", ""), d.get("sonGorulmeTarihi", ""), d.get("durum", "Aktif"))
    d = dict(d)
    d["yayinGunSayisi"] = gun
    d["kazanmaSkoru"] = _ad_kazanma_skoru(gun)
    d["kazanmaSinyali"] = _ad_kazanma_sinyali(gun)
    return d


class AdRecord(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    userId: str
    companyId: str
    reklamveren: str
    baslik: str = ""
    mecra: str = "Meta"
    gorselUrl: str = ""
    ilkGorulmeTarihi: str = Field(default_factory=lambda: utc_now_iso()[:10])
    sonGorulmeTarihi: str = ""
    durum: str = "Aktif"
    favori: bool = False
    notlar: str = ""
    createdAt: str = Field(default_factory=utc_now_iso)
    updatedAt: str = Field(default_factory=utc_now_iso)


class AdRecordCreate(BaseModel):
    companyId: str
    reklamveren: str
    baslik: str = ""
    mecra: str = "Meta"
    gorselUrl: str = ""
    ilkGorulmeTarihi: str = ""
    sonGorulmeTarihi: str = ""
    durum: str = "Aktif"
    notlar: str = ""

    @field_validator("reklamveren")
    @classmethod
    def _reklamveren_len(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("Reklamveren adı zorunlu")
        if len(v) > 200:
            raise ValueError("Reklamveren adı çok uzun")
        return v

    @field_validator("durum")
    @classmethod
    def _durum_valid(cls, v: str) -> str:
        if v not in AD_DURUM_VALUES:
            raise ValueError("Geçersiz durum")
        return v


class AdRecordUpdate(BaseModel):
    reklamveren: Optional[str] = None
    baslik: Optional[str] = None
    mecra: Optional[str] = None
    gorselUrl: Optional[str] = None
    ilkGorulmeTarihi: Optional[str] = None
    sonGorulmeTarihi: Optional[str] = None
    durum: Optional[str] = None
    favori: Optional[bool] = None
    notlar: Optional[str] = None


class AdBulkImportRequest(BaseModel):
    companyId: str
    items: List[AdRecordCreate]


class AdWatchItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    userId: str
    companyId: str
    terim: str
    createdAt: str = Field(default_factory=utc_now_iso)


class AdWatchItemCreate(BaseModel):
    companyId: str
    terim: str

    @field_validator("terim")
    @classmethod
    def _terim_len(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("Terim zorunlu")
        if len(v) > 150:
            raise ValueError("Terim çok uzun")
        return v


@api_router.get("/ads-intel/records/{company_id}")
async def list_ad_records(company_id: str, user=Depends(get_current_user)):
    _require_manager(user)
    await _own_company(user, company_id)
    docs = await db.ad_records.find({"companyId": company_id, "userId": user["user_id"]}, {"_id": 0}).sort("createdAt", -1).to_list(2000)
    return [_ad_record_out(d) for d in docs]


@api_router.post("/ads-intel/records")
async def create_ad_record(payload: AdRecordCreate, user=Depends(get_current_user)):
    _require_manager(user)
    await _own_company(user, payload.companyId)
    obj = AdRecord(
        userId=user["user_id"],
        companyId=payload.companyId,
        reklamveren=payload.reklamveren,
        baslik=payload.baslik.strip()[:300],
        mecra=payload.mecra.strip()[:50] or "Meta",
        gorselUrl=payload.gorselUrl.strip()[:1000],
        ilkGorulmeTarihi=(payload.ilkGorulmeTarihi or utc_now_iso()[:10])[:10],
        sonGorulmeTarihi=payload.sonGorulmeTarihi[:10] if payload.sonGorulmeTarihi else "",
        durum=payload.durum,
        notlar=payload.notlar.strip()[:1000],
    )
    await db.ad_records.insert_one(obj.model_dump())
    return _ad_record_out(obj.model_dump())


@api_router.post("/ads-intel/records/import")
async def import_ad_records(payload: AdBulkImportRequest, user=Depends(get_current_user)):
    _require_manager(user)
    await _own_company(user, payload.companyId)
    if len(payload.items) > 500:
        raise HTTPException(400, "Tek seferde en fazla 500 kayıt içe aktarılabilir")
    created = []
    for item in payload.items:
        obj = AdRecord(
            userId=user["user_id"],
            companyId=payload.companyId,
            reklamveren=item.reklamveren,
            baslik=item.baslik.strip()[:300],
            mecra=(item.mecra or "Meta").strip()[:50] or "Meta",
            gorselUrl=item.gorselUrl.strip()[:1000],
            ilkGorulmeTarihi=(item.ilkGorulmeTarihi or utc_now_iso()[:10])[:10],
            sonGorulmeTarihi=item.sonGorulmeTarihi[:10] if item.sonGorulmeTarihi else "",
            durum=item.durum if item.durum in AD_DURUM_VALUES else "Aktif",
            notlar=item.notlar.strip()[:1000],
        )
        created.append(obj)
    if created:
        await db.ad_records.insert_many([c.model_dump() for c in created])
    return {"created": len(created)}


@api_router.patch("/ads-intel/records/{record_id}")
async def update_ad_record(record_id: str, payload: AdRecordUpdate, user=Depends(get_current_user)):
    _require_manager(user)
    doc = await db.ad_records.find_one({"id": record_id, "userId": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Kayıt bulunamadı")
    updates: Dict[str, Any] = {"updatedAt": utc_now_iso()}
    if payload.reklamveren is not None:
        v = payload.reklamveren.strip()
        if not v:
            raise HTTPException(400, "Reklamveren adı boş olamaz")
        updates["reklamveren"] = v[:200]
    if payload.baslik is not None:
        updates["baslik"] = payload.baslik.strip()[:300]
    if payload.mecra is not None:
        updates["mecra"] = payload.mecra.strip()[:50] or "Meta"
    if payload.gorselUrl is not None:
        updates["gorselUrl"] = payload.gorselUrl.strip()[:1000]
    if payload.ilkGorulmeTarihi is not None:
        updates["ilkGorulmeTarihi"] = payload.ilkGorulmeTarihi[:10]
    if payload.sonGorulmeTarihi is not None:
        updates["sonGorulmeTarihi"] = payload.sonGorulmeTarihi[:10]
    if payload.durum is not None:
        if payload.durum not in AD_DURUM_VALUES:
            raise HTTPException(400, "Geçersiz durum")
        updates["durum"] = payload.durum
    if payload.favori is not None:
        updates["favori"] = payload.favori
    if payload.notlar is not None:
        updates["notlar"] = payload.notlar.strip()[:1000]
    await db.ad_records.update_one({"id": record_id, "userId": user["user_id"]}, {"$set": updates})
    doc.update(updates)
    return _ad_record_out(doc)


@api_router.delete("/ads-intel/records/{record_id}")
async def delete_ad_record(record_id: str, user=Depends(get_current_user)):
    _require_manager(user)
    await db.ad_records.delete_one({"id": record_id, "userId": user["user_id"]})
    return {"ok": True}


@api_router.get("/ads-intel/watchlist/{company_id}", response_model=List[AdWatchItem])
async def list_ad_watchlist(company_id: str, user=Depends(get_current_user)):
    _require_manager(user)
    await _own_company(user, company_id)
    docs = await db.ad_watchlist.find({"companyId": company_id, "userId": user["user_id"]}, {"_id": 0}).sort("createdAt", -1).to_list(200)
    return [AdWatchItem(**d) for d in docs]


@api_router.post("/ads-intel/watchlist", response_model=AdWatchItem)
async def create_ad_watchlist_item(payload: AdWatchItemCreate, user=Depends(get_current_user)):
    _require_manager(user)
    await _own_company(user, payload.companyId)
    existing = await db.ad_watchlist.count_documents({"companyId": payload.companyId, "userId": user["user_id"]})
    if existing >= 100:
        raise HTTPException(400, "İzleme listesi dolu (en fazla 100 terim)")
    obj = AdWatchItem(userId=user["user_id"], companyId=payload.companyId, terim=payload.terim)
    await db.ad_watchlist.insert_one(obj.model_dump())
    return obj


@api_router.delete("/ads-intel/watchlist/{item_id}")
async def delete_ad_watchlist_item(item_id: str, user=Depends(get_current_user)):
    _require_manager(user)
    await db.ad_watchlist.delete_one({"id": item_id, "userId": user["user_id"]})
    return {"ok": True}


# ============ E-FATURA (Nilvera entegrasyonu) ============
# MyDijital OS'teki "E-Fatura" modulunun karsiligi. Nilvera gercek bir
# e-fatura/e-arsiv API saglayicisidir (https://developer.nilvera.com):
#   - Kimlik dogrulama: "Authorization: Bearer {API_ANAHTARI}" header'i.
#   - Test ortami tabani: https://apitest.nilvera.com
#   - Canli ortam tabani: https://api.nilvera.com
# v1 kapsami BILEREK sinirli: kimlik bilgisi saklama + GERCEK bir baglanti
# testi (GET /general/GlobalCompany -- Nilvera'nin dogruladigimiz, hafif,
# mukellef listesi donen ucu). Fatura KESME (belge olusturma/gonderme) bu
# surumde YOK -- kullanicinin kendi Nilvera hesabinda dogru sablon/seri
# ayarlarinin dogrulanmasi ve daha genis test gerektirir; sahte/calismayan
# bir "fatura kes" ucu eklemek yerine, once gercekten calisan bir baglanti
# testiyle baslayip fatura kesmeyi ayrica ele almak tercih edildi.
NILVERA_BASE_URLS = {
    "test": "https://apitest.nilvera.com",
    "canli": "https://api.nilvera.com",
}


def _efatura_mask_key(api_key: str) -> str:
    if not api_key:
        return ""
    if len(api_key) <= 6:
        return "*" * len(api_key)
    return f"{api_key[:3]}{'*' * (len(api_key) - 6)}{api_key[-3:]}"


class EFaturaConfig(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    userId: str
    companyId: str
    apiKey: str = ""
    ortam: str = "test"  # "test" | "canli" -- canli'ya sadece basarili test sonrasi gecilebilir
    firmaVergiNo: str = ""
    firmaUnvani: str = ""
    firmaAdres: str = ""
    firmaVergiDairesi: str = ""
    firmaIl: str = ""
    firmaIlce: str = ""
    faturaSerisi: str = ""
    sablonId: str = ""
    lastTestOk: bool = False
    lastTestAt: Optional[str] = None
    lastTestMessage: str = ""
    createdAt: str = Field(default_factory=utc_now_iso)
    updatedAt: str = Field(default_factory=utc_now_iso)


class EFaturaConfigUpdate(BaseModel):
    companyId: str
    apiKey: Optional[str] = None  # None = degistirme; "" = temizle
    ortam: Optional[str] = None
    firmaVergiNo: Optional[str] = None
    firmaUnvani: Optional[str] = None
    firmaAdres: Optional[str] = None
    firmaVergiDairesi: Optional[str] = None
    firmaIl: Optional[str] = None
    firmaIlce: Optional[str] = None
    faturaSerisi: Optional[str] = None
    sablonId: Optional[str] = None

    @field_validator("ortam")
    @classmethod
    def _ortam_allowed(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("test", "canli"):
            raise ValueError("Geçersiz ortam")
        return v


class EFaturaConfigOut(BaseModel):
    companyId: str
    apiKeyMasked: str = ""
    hasApiKey: bool = False
    ortam: str = "test"
    firmaVergiNo: str = ""
    firmaUnvani: str = ""
    firmaAdres: str = ""
    firmaVergiDairesi: str = ""
    firmaIl: str = ""
    firmaIlce: str = ""
    faturaSerisi: str = ""
    sablonId: str = ""
    lastTestOk: bool = False
    lastTestAt: Optional[str] = None
    lastTestMessage: str = ""


class EFaturaTestResult(BaseModel):
    ok: bool
    message: str


def _efatura_out(doc: Dict[str, Any], company_id: str) -> EFaturaConfigOut:
    if not doc:
        return EFaturaConfigOut(companyId=company_id)
    return EFaturaConfigOut(
        companyId=company_id,
        apiKeyMasked=_efatura_mask_key(doc.get("apiKey", "")),
        hasApiKey=bool(doc.get("apiKey")),
        ortam=doc.get("ortam", "test"),
        firmaVergiNo=doc.get("firmaVergiNo", ""),
        firmaUnvani=doc.get("firmaUnvani", ""),
        firmaAdres=doc.get("firmaAdres", ""),
        firmaVergiDairesi=doc.get("firmaVergiDairesi", ""),
        firmaIl=doc.get("firmaIl", ""),
        firmaIlce=doc.get("firmaIlce", ""),
        faturaSerisi=doc.get("faturaSerisi", ""),
        sablonId=doc.get("sablonId", ""),
        lastTestOk=bool(doc.get("lastTestOk", False)),
        lastTestAt=doc.get("lastTestAt"),
        lastTestMessage=doc.get("lastTestMessage", ""),
    )


@api_router.get("/efatura/config/{company_id}", response_model=EFaturaConfigOut)
async def get_efatura_config(company_id: str, user=Depends(get_current_user)):
    await _own_company(user, company_id)
    doc = await db.efatura_configs.find_one({"companyId": company_id, "userId": user["user_id"]}, {"_id": 0})
    return _efatura_out(doc, company_id)


@api_router.put("/efatura/config", response_model=EFaturaConfigOut)
async def update_efatura_config(payload: EFaturaConfigUpdate, user=Depends(get_current_user)):
    await _own_company(user, payload.companyId)
    existing = await db.efatura_configs.find_one({"companyId": payload.companyId, "userId": user["user_id"]}, {"_id": 0})
    now = utc_now_iso()
    updates: Dict[str, Any] = {"updatedAt": now}
    if payload.apiKey is not None:
        updates["apiKey"] = payload.apiKey.strip()[:500]
        # API anahtari degisince onceki testin gecerliligi kalmaz.
        updates["lastTestOk"] = False
        updates["lastTestMessage"] = ""
    if payload.ortam is not None:
        # Canli ortama sadece test ortaminda basarili bir baglanti testi
        # yapildiktan sonra gecilebilir -- MyDijital'in de uyguladigi,
        # yanlislikla gercek fatura kesmeyi engelleyen bir emniyet kemeri.
        if payload.ortam == "canli":
            already_ok = bool((existing or {}).get("lastTestOk")) and (existing or {}).get("ortam") != "canli"
            just_tested = bool((existing or {}).get("lastTestOk"))
            if not just_tested:
                raise HTTPException(400, "Canlı ortama geçmeden önce test ortamında bağlantıyı başarıyla test etmelisiniz")
        updates["ortam"] = payload.ortam
    if payload.firmaVergiNo is not None:
        updates["firmaVergiNo"] = payload.firmaVergiNo.strip()[:20]
    if payload.firmaUnvani is not None:
        updates["firmaUnvani"] = payload.firmaUnvani.strip()[:200]
    if payload.firmaAdres is not None:
        updates["firmaAdres"] = payload.firmaAdres.strip()[:500]
    for fld in ("firmaVergiDairesi", "firmaIl", "firmaIlce"):
        val = getattr(payload, fld)
        if val is not None:
            updates[fld] = val.strip()[:100]
    if payload.faturaSerisi is not None:
        updates["faturaSerisi"] = payload.faturaSerisi.strip()[:20]
    if payload.sablonId is not None:
        updates["sablonId"] = payload.sablonId.strip()[:100]

    if existing:
        await db.efatura_configs.update_one({"id": existing["id"]}, {"$set": updates})
        merged = {**existing, **updates}
    else:
        obj = EFaturaConfig(userId=user["user_id"], companyId=payload.companyId, **{
            k: v for k, v in updates.items() if k in EFaturaConfig.model_fields and k != "updatedAt"
        })
        await db.efatura_configs.insert_one(obj.model_dump())
        merged = obj.model_dump()
    return _efatura_out(merged, payload.companyId)


@api_router.post("/efatura/test/{company_id}", response_model=EFaturaTestResult)
async def test_efatura_connection(company_id: str, user=Depends(get_current_user)):
    await _own_company(user, company_id)
    doc = await db.efatura_configs.find_one({"companyId": company_id, "userId": user["user_id"]}, {"_id": 0})
    if not doc or not doc.get("apiKey"):
        raise HTTPException(400, "Önce Nilvera API anahtarınızı kaydedin")
    ortam = doc.get("ortam", "test")
    base_url = NILVERA_BASE_URLS.get(ortam, NILVERA_BASE_URLS["test"])
    now = utc_now_iso()
    try:
        resp = await asyncio.to_thread(
            requests.get,
            f"{base_url}/general/GlobalCompany",
            headers={"Authorization": f"Bearer {doc['apiKey']}", "Accept": "application/json"},
            params={"PageSize": "1", "Page": "1"},
            timeout=10,
        )
        if resp.status_code == 200:
            ok, msg = True, "Bağlantı başarılı — Nilvera API anahtarınız doğrulandı."
        elif resp.status_code == 401:
            ok, msg = False, "API anahtarı geçersiz veya yetkisiz (401)."
        else:
            ok, msg = False, f"Nilvera bağlantı hatası (HTTP {resp.status_code})."
    except requests.exceptions.Timeout:
        ok, msg = False, "Nilvera'ya bağlanılamadı (zaman aşımı)."
    except Exception as e:
        logger.error(f"efatura test error: {e}")
        ok, msg = False, "Bağlantı testi sırasında beklenmeyen bir hata oluştu."

    await db.efatura_configs.update_one(
        {"companyId": company_id, "userId": user["user_id"]},
        {"$set": {"lastTestOk": ok, "lastTestAt": now, "lastTestMessage": msg, "updatedAt": now}},
    )
    return EFaturaTestResult(ok=ok, message=msg)


# ============ ALBERT GENAU (parametrik pergola/bioklimatik hesaplayici) ============
# Bu bolum, Albert Genau'nun kendi Excel maliyet analizi dosyalarindan
# (bkz. backend/albert_genau_calc.py) cikarilan gercek formullerle genislik/
# derinlik/yukseklik girildiginde tam malzeme listesi + fiyat hesabi yapan
# ayri bir katalog turudur. Fiyat listesi (SKU->fiyat) `albert_genau_config`
# kolleksiyonunda tutulur -- bu, kod degismeden (formuller sabit kalirken)
# Albert Genau yeni bir fiyat listesi yayinladiginda tek yapilmasi gereken
# seyin ayni Excel dosyasini tekrar yuklemek olmasini saglar.

class AlbertGenauCepheInput(BaseModel):
    """Soldan saga girilen tek bir cephe. Bir balkon bu cephelerin
    zinciridir -- ustanin sahada olcu alma sirasiyla ayni."""
    genislikMm: float
    yukseklikMm: float
    kanatSayisi: Optional[int] = None   # bos ise olcuden onerilir
    adet: int = 1
    sagAci: Optional[Any] = None        # 'duvar' | 90 | 135 | 225 | 270 | serbest derece
    toplanmaYonu: Optional[str] = None  # bkz. ag_geom.TOPLANMA_YONLERI
    solKoseGenisKapak: bool = False
    sagKoseGenisKapak: bool = False


class AlbertGenauGeometryRequest(BaseModel):
    """Cizim modeli istegi -- FIYAT HESAPLAMAZ.

    Kullanici olcu yazarken (debounce ile) cagrilir; donen model hem
    ekrandaki canli cizimi hem teklife eklenen teknik cizimi besler.
    Pahali olan fiyat hesabi (calculate) bundan tamamen ayridir."""
    companyId: Optional[str] = None
    kind: str                                          # 'cephe' | 'modul' | 'giyotin'
    # kind='cephe'
    cepheler: Optional[List[AlbertGenauCepheInput]] = None
    maxKanatMm: Optional[float] = None
    # kind='cephe' + bcTip: donen modele BC formu icin oneri (kanat
    # miktarlari + kose sayisi) eklenir; bkz. ag_geometry.bc_oneri.
    bcTip: Optional[str] = None
    # kind='modul' (bioklimatik pergola) ve kind='giyotin' (VERTIFLEX)
    tip: Optional[str] = None
    genislikMm: Optional[float] = None
    derinlikMm: Optional[float] = None
    yukseklikMm: Optional[float] = None
    panelSayisi: Optional[int] = None
    # kind='modul' icin elle verilen bolunme. Albert Genau disindaki (elle
    # girilen) kalemlerde modul/lamel sayisi AG fiyat listesindeki derinlik
    # tablosundan turetilemez -- orada bu tablo gecerli degil. Verilirse
    # PriceBook'a hic gidilmez.
    modulSayisi: Optional[int] = None
    lamelSayisiToplam: Optional[int] = None

    @field_validator("kind")
    @classmethod
    def _kind_valid(cls, v: str) -> str:
        if v not in ("cephe", "modul", "giyotin"):
            raise ValueError(f"Gecersiz cizim tipi: {v}")
        return v


class AlbertGenauCalculateRequest(BaseModel):
    # Opsiyonel: gonderilirse hesaplama o firmanin kendi yukledigi Albert
    # Genau fiyat listesini kullanir (bkz. _get_ag_price_data). Gonderilmezse
    # (eski istemciler / geriye donuk uyumluluk) ortak/varsayilan listeye
    # duser -- boylece bu alan eklendiginde mevcut akis kesintiye ugramaz.
    companyId: Optional[str] = None
    tip: str  # ag_calc.SYSTEM_TYPES icinden biri
    genislikMm: float
    derinlikMm: float
    yukseklikMm: Optional[float] = None
    cornerFlat: bool = False
    somfy: bool = False
    noWallBracket: bool = False
    finish: Optional[str] = None
    ledOption: Optional[str] = None  # None | 'warm' | 'warm_rgb'
    ledMidSupport: bool = False
    kopuk: bool = False
    alisIskontoPct: float = 0.0
    montajBedeli: float = 0.0
    imalatBedeli: float = 0.0
    karMarjiPct: float = 0.0
    odemeTipi: str = "nakit"  # 'nakit' | 'kredi_karti' -- hangi Excel sutununa gore hesaplanacagi

    @field_validator("tip")
    @classmethod
    def _tip_valid(cls, v: str) -> str:
        if v not in ag_calc.SYSTEM_TYPES:
            raise ValueError(f"Gecersiz sistem tipi: {v}")
        return v

    @field_validator("odemeTipi")
    @classmethod
    def _odeme_tipi_valid(cls, v: str) -> str:
        if v not in ("nakit", "kredi_karti"):
            raise ValueError("odemeTipi 'nakit' veya 'kredi_karti' olmalidir")
        return v

    @field_validator("alisIskontoPct", "karMarjiPct")
    @classmethod
    def _pct_range(cls, v: float) -> float:
        if v is None:
            return 0.0
        if v < 0 or v > 100:
            raise ValueError("Oran 0-100 araliginda olmalidir")
        return v

    @field_validator("genislikMm", "derinlikMm")
    @classmethod
    def _dim_positive(cls, v: float) -> float:
        if v is None or v <= 0 or v > 20000:
            raise ValueError("Olcu 0-20000mm araliginda olmalidir")
        return v


class AlbertGenauPartsListCalculateRequest(BaseModel):
    # AIRFLEX gibi "duz parca listesi" urun aileleri icin: genislik/derinlik
    # yerine, sistemi olusturan her SKU'ye bayinin girdigi MIKTAR kullanilir
    # (bkz. ag_calc.PARTS_LIST_SYSTEMS / calculate_parts_list).
    companyId: Optional[str] = None
    systemId: str  # ag_calc.PARTS_LIST_SYSTEMS icinden biri (orn. 'airflex')
    quantities: Dict[str, float] = {}
    finish: Optional[str] = None
    alisIskontoPct: float = 0.0
    montajBedeli: float = 0.0
    imalatBedeli: float = 0.0
    karMarjiPct: float = 0.0
    odemeTipi: str = "nakit"

    @field_validator("systemId")
    @classmethod
    def _system_valid(cls, v: str) -> str:
        if v not in ag_calc.PARTS_LIST_SYSTEMS:
            raise ValueError(f"Gecersiz parca listesi sistemi: {v}")
        return v

    @field_validator("odemeTipi")
    @classmethod
    def _odeme_tipi_valid(cls, v: str) -> str:
        if v not in ("nakit", "kredi_karti"):
            raise ValueError("odemeTipi 'nakit' veya 'kredi_karti' olmalidir")
        return v

    @field_validator("alisIskontoPct", "karMarjiPct")
    @classmethod
    def _pct_range(cls, v: float) -> float:
        if v is None:
            return 0.0
        if v < 0 or v > 100:
            raise ValueError("Oran 0-100 araliginda olmalidir")
        return v

    @field_validator("quantities")
    @classmethod
    def _qty_valid(cls, v: Dict[str, float]) -> Dict[str, float]:
        v = v or {}
        if len(v) > 200:
            raise ValueError("Cok fazla kalem")
        out = {}
        for sku, qty in v.items():
            q = float(qty or 0)
            if q < 0 or q > 100000:
                raise ValueError("Miktar 0-100000 araliginda olmalidir")
            out[str(sku)[:40]] = q
        return out


class AlbertGenauAirflexModuleRequest(BaseModel):
    # AIRFLEX katlanir cam balkon: olcu yerine ADET (kac sistem) girilir --
    # yukseklik her zaman sabit 1850mm'dir (bkz. ag_calc.calculate_airflex_module
    # ustundeki yorum, bayiden alinan gercek mühendislik kurallari).
    companyId: Optional[str] = None
    adet: int
    tekerlekli: bool = False
    kapiVar: bool = False
    kilitVar: bool = False
    camSabitGenislikMm: float = 0.0
    camSabitFiyatM2: float = 0.0
    camHareketliGenislikMm: float = 0.0
    camHareketliFiyatM2: float = 0.0
    finish: Optional[str] = None
    alisIskontoPct: float = 0.0
    montajBedeli: float = 0.0
    imalatBedeli: float = 0.0
    karMarjiPct: float = 0.0
    odemeTipi: str = "nakit"

    @field_validator("adet")
    @classmethod
    def _adet_valid(cls, v: int) -> int:
        if v is None or v < 1 or v > 500:
            raise ValueError("Adet 1-500 araliginda olmalidir")
        return v

    @field_validator("odemeTipi")
    @classmethod
    def _odeme_tipi_valid(cls, v: str) -> str:
        if v not in ("nakit", "kredi_karti"):
            raise ValueError("odemeTipi 'nakit' veya 'kredi_karti' olmalidir")
        return v

    @field_validator("alisIskontoPct", "karMarjiPct")
    @classmethod
    def _pct_range(cls, v: float) -> float:
        if v is None:
            return 0.0
        if v < 0 or v > 100:
            raise ValueError("Oran 0-100 araliginda olmalidir")
        return v

    @field_validator("camSabitGenislikMm", "camHareketliGenislikMm")
    @classmethod
    def _cam_genislik_valid(cls, v: float) -> float:
        v = v or 0.0
        if v < 0 or v > 5000:
            raise ValueError("Cam genisligi 0-5000mm araliginda olmalidir")
        return v

    @field_validator("camSabitFiyatM2", "camHareketliFiyatM2")
    @classmethod
    def _cam_fiyat_valid(cls, v: float) -> float:
        v = v or 0.0
        if v < 0 or v > 1_000_000:
            raise ValueError("Cam fiyati gecersiz")
        return v


class AlbertGenauVertiflexCalculateRequest(BaseModel):
    # VERTIFLEX (dusey giyotin cam balkon, 6 alt tip) icin -- BIOFLEX gibi
    # genislik/yukseklik (mm) girdili GEOMETRIK bir aile ama panel sayisi/
    # motor markasi/kumanda kanali/inox/alicisiz/su-tahliyeli/secumax-taraf
    # gibi tip-bazli ek secenekleri var (bkz. ag_calc.VERTIFLEX_TYPE_META).
    companyId: Optional[str] = None
    tip: str  # ag_calc.VERTIFLEX_SYSTEM_TYPES icinden biri
    genislikMm: float
    yukseklikMm: float
    panelSayisi: Optional[str] = None  # '2' | '3' | '4' (tipe gore gecerli secenekler degisir)
    motor: str = "ag"  # 'ag' | 'somfy'
    kumandaKanal: Optional[int] = None  # None = kumanda eklenmez (bkz. VERTIFLEX_TYPE_META.kumandaOptional)
    secumaxTaraf: str = "sag"  # sadece UP TWIN: 'sag' | 'sol'
    inoxZincirli: bool = False
    alicisiz: bool = False
    suTahliyeliAltKasa: bool = False
    # Sadece STATU IMPETUS CLEAN TWIN icin: IMPETUS TWIN STATU ELEKTROMEKANIK
    # SET (G05080) adedi -- Excel'de sabit degil, genis aciklikta birden
    # fazla set gerekebildigi icin bayi elle girer (varsayilan 1).
    elektromekanikSetAdet: int = 1
    finish: Optional[str] = None
    camFiyatlariM2: Dict[str, float] = {}  # {'CAM-8MM-TEMPERLI': 1200} gibi
    alisIskontoPct: float = 0.0
    montajBedeli: float = 0.0
    imalatBedeli: float = 0.0
    karMarjiPct: float = 0.0
    odemeTipi: str = "nakit"

    @field_validator("tip")
    @classmethod
    def _tip_valid(cls, v: str) -> str:
        if v not in ag_calc.VERTIFLEX_SYSTEM_TYPES:
            raise ValueError(f"Gecersiz VERTIFLEX sistem tipi: {v}")
        return v

    @field_validator("motor")
    @classmethod
    def _motor_valid(cls, v: str) -> str:
        if v not in ("ag", "somfy"):
            raise ValueError("motor 'ag' veya 'somfy' olmalidir")
        return v

    @field_validator("secumaxTaraf")
    @classmethod
    def _secumax_taraf_valid(cls, v: str) -> str:
        if v not in ("sag", "sol"):
            raise ValueError("secumaxTaraf 'sag' veya 'sol' olmalidir")
        return v

    @field_validator("panelSayisi")
    @classmethod
    def _panel_sayisi_valid(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if v not in ("2", "3", "4"):
            raise ValueError("panelSayisi '2', '3' veya '4' olmalidir")
        return v

    @field_validator("kumandaKanal")
    @classmethod
    def _kumanda_kanal_valid(cls, v: Optional[int]) -> Optional[int]:
        if v is None:
            return v
        if v not in (1, 5, 15, 16):
            raise ValueError("kumandaKanal gecersiz")
        return v

    @field_validator("odemeTipi")
    @classmethod
    def _odeme_tipi_valid(cls, v: str) -> str:
        if v not in ("nakit", "kredi_karti"):
            raise ValueError("odemeTipi 'nakit' veya 'kredi_karti' olmalidir")
        return v

    @field_validator("alisIskontoPct", "karMarjiPct")
    @classmethod
    def _pct_range(cls, v: float) -> float:
        if v is None:
            return 0.0
        if v < 0 or v > 100:
            raise ValueError("Oran 0-100 araliginda olmalidir")
        return v

    @field_validator("genislikMm", "yukseklikMm")
    @classmethod
    def _dim_positive(cls, v: float) -> float:
        if v is None or v <= 0 or v > 20000:
            raise ValueError("Olcu 0-20000mm araliginda olmalidir")
        return v

    @field_validator("camFiyatlariM2")
    @classmethod
    def _cam_fiyat_valid(cls, v: Dict[str, float]) -> Dict[str, float]:
        v = v or {}
        out = {}
        for sku, fiyat in list(v.items())[:10]:
            f = float(fiyat or 0)
            if f < 0 or f > 1_000_000:
                raise ValueError("Cam fiyati gecersiz")
            out[str(sku)[:40]] = f
        return out

    @field_validator("elektromekanikSetAdet")
    @classmethod
    def _elektromekanik_set_adet_valid(cls, v: int) -> int:
        if v is None:
            return 1
        if v < 1 or v > 50:
            raise ValueError("elektromekanikSetAdet 1-50 araliginda olmalidir")
        return v


class AlbertGenauKisBahcesiCalculateRequest(BaseModel):
    # KIŞ BAHÇESİ (sabit cam tavanli kompozit/aluminyum kis bahcesi, 2 alt
    # tip) icin -- genislik/derinlik (mm) + tavan bolum sayisi + arka duvar
    # alt yukseklik girdili GEOMETRIK bir aile (bkz. ag_calc.KIS_BAHCESI_TYPE_META).
    companyId: Optional[str] = None
    tip: str  # ag_calc.KIS_BAHCESI_SYSTEM_TYPES icinden biri
    genislikMm: float
    derinlikMm: float
    tavanBolumSayisi: int
    arkaDuvarAltYukseklikMm: float
    araDikmeSayisi: int = 0
    ayarliDuvarBaglantisi: bool = False  # sadece PREMIUM 08-10
    kirisUstuVidaKapama: bool = False
    ortaKayit: bool = False
    ucgenMikroPencere: bool = False
    finish: Optional[str] = None
    camFiyatlariM2: Dict[str, float] = {}  # {'CAM-KB0810-TAVAN': 1200} gibi
    alisIskontoPct: float = 0.0
    montajBedeli: float = 0.0
    imalatBedeli: float = 0.0
    karMarjiPct: float = 0.0
    odemeTipi: str = "nakit"

    @field_validator("tip")
    @classmethod
    def _tip_valid(cls, v: str) -> str:
        if v not in ag_calc.KIS_BAHCESI_SYSTEM_TYPES:
            raise ValueError(f"Gecersiz KIŞ BAHÇESİ sistem tipi: {v}")
        return v

    @field_validator("tavanBolumSayisi")
    @classmethod
    def _tavan_bolum_valid(cls, v: int) -> int:
        if v is None or v < 1 or v > 50:
            raise ValueError("Tavan bölüm sayısı 1-50 aralığında olmalıdır")
        return v

    @field_validator("araDikmeSayisi")
    @classmethod
    def _ara_dikme_valid(cls, v: int) -> int:
        if v is None:
            return 0
        if v < 0 or v > 50:
            raise ValueError("Ara dikme sayısı 0-50 aralığında olmalıdır")
        return v

    @field_validator("odemeTipi")
    @classmethod
    def _odeme_tipi_valid(cls, v: str) -> str:
        if v not in ("nakit", "kredi_karti"):
            raise ValueError("odemeTipi 'nakit' veya 'kredi_karti' olmalidir")
        return v

    @field_validator("alisIskontoPct", "karMarjiPct")
    @classmethod
    def _pct_range(cls, v: float) -> float:
        if v is None:
            return 0.0
        if v < 0 or v > 100:
            raise ValueError("Oran 0-100 araliginda olmalidir")
        return v

    @field_validator("genislikMm", "derinlikMm", "arkaDuvarAltYukseklikMm")
    @classmethod
    def _dim_positive(cls, v: float) -> float:
        if v is None or v <= 0 or v > 30000:
            raise ValueError("Olcu 0-30000mm araliginda olmalidir")
        return v

    @field_validator("camFiyatlariM2")
    @classmethod
    def _cam_fiyat_valid(cls, v: Dict[str, float]) -> Dict[str, float]:
        v = v or {}
        out = {}
        for sku, fiyat in list(v.items())[:10]:
            f = float(fiyat or 0)
            if f < 0 or f > 1_000_000:
                raise ValueError("Cam fiyati gecersiz")
            out[str(sku)[:40]] = f
        return out


class AlbertGenauItemCreate(BaseModel):
    companyId: str
    tip: str
    isim: str
    montajBedeli: float = 0.0
    imalatBedeli: float = 0.0
    karMarjiPct: float = 0.0
    paraBirimi: str = "TRY"

    @field_validator("tip")
    @classmethod
    def _tip_valid(cls, v: str) -> str:
        if v not in ag_calc.SYSTEM_TYPES:
            raise ValueError(f"Gecersiz sistem tipi: {v}")
        return v

    @field_validator("isim")
    @classmethod
    def _isim_req(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("Isim zorunlu")
        return v[:120]


class AlbertGenauItem(AlbertGenauItemCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    userId: str
    createdAt: str = Field(default_factory=utc_now_iso)


async def _get_ag_price_data(company_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    # Fiyat listesi MERKEZI olarak yonetilir: admin (Albert Genau distributor'u)
    # yeni fiyatlar geldikce tek bir yerden (bkz. /albert-genau/price-list/upload,
    # "id": "default") gunceller ve albertGenauEnabled=true olan TUM firmalar
    # otomatik olarak bu guncel listeyi kullanir -- her bayinin kendi Excel'ini
    # ayrica yuklemesi ZORUNLU DEGIL (onceki surumde oyleydi, bkz. git gecmisi
    # _require_company_ag_price_list). Bir firma isterse yine de KENDI ozel
    # fiyat listesini yukleyip (bkz. /albert-genau/company-price-list/upload)
    # merkezi listenin onune gecebilir -- o yuzden company-bazli liste hala
    # ilk once kontrol ediliyor, sadece artik ZORUNLU degil.
    if company_id:
        doc = await db.albert_genau_config.find_one({"companyId": company_id}, {"_id": 0})
        if doc and doc.get("price_list"):
            return doc
    default_doc = await db.albert_genau_config.find_one({"id": "default"}, {"_id": 0})
    if default_doc and default_doc.get("price_list"):
        return default_doc
    return None  # None -> ag_calc kendi paketindeki varsayilani kullanir


async def _get_yedek_parca_data() -> Optional[Dict[str, Any]]:
    # YEDEK PARÇA, digger urun ailelerinden farkli olarak KENDI ayri
    # kataloguna sahip (bkz. albert_genau_calc.py modul-ustu notu -- B8505102
    # SKU'sunun ana price_list'te ve bu katalogda FARKLI fiyatlarda olmasi
    # yuzunden bilerek birlestirilmedi). Bu yuzden firma-bazli override YOK --
    # tek bir merkezi ("default") katalog var, admin yukleyince tum bayilere
    # aninda yansir (bkz. /albert-genau/yedek-parca/admin-upload).
    doc = await db.yedek_parca_config.find_one({"id": "default"}, {"_id": 0})
    if doc and doc.get("items"):
        return doc
    return None  # None -> ag_calc paket-ici varsayilan (yedek_parca.json) kullanir


@api_router.get("/albert-genau/types")
async def albert_genau_types(companyId: Optional[str] = None, user=Depends(get_current_user)):
    # depthValuesMm: standart panel-adimli derinlik tablosunun tüm degerleri --
    # frontend, kullanici derinlik yazarken (Hesapla'ya basmadan) bu degerlerle
    # karsilastirip tam denk gelmiyorsa alt/ust secim kutusunu HEMEN gösterebilsin
    # (bkz. PriceBook.depth_choice ile ayni mantik, istemci tarafinda tekrarlanir).
    if companyId:
        company_doc = await _own_company(user, companyId)
        _require_albert_genau_enabled(company_doc)
    price_data = await _get_ag_price_data(companyId)
    base = price_data or ag_calc._DEFAULT_DATA
    depth_values = sorted({float(v) for v in base["depth_table"].values()})
    return {"types": [{"id": t, "label": ag_calc.SYSTEM_TYPE_LABELS[t]} for t in ag_calc.SYSTEM_TYPES],
            "finishes": list(ag_calc.FINISH_OPTIONS.keys()),
            "depthValuesMm": depth_values,
            # Olcu bazli (genislik/derinlik) degil, duz parca listesi + miktar
            # girisiyle calisan urun aileleri (orn. AIRFLEX) -- bkz.
            # ag_calc.PARTS_LIST_SYSTEMS / /albert-genau/parts-list-items.
            "partsListSystems": [{"id": k, "label": v["label"]} for k, v in ag_calc.PARTS_LIST_SYSTEMS.items()],
            # VERTIFLEX (dusey giyotin) -- form secenekleri icin bkz.
            # /albert-genau/vertiflex/types (tip-bazli detayli meta doner).
            "vertiflexTypes": [{"id": t, "label": ag_calc.VERTIFLEX_TYPE_LABELS[t]} for t in ag_calc.VERTIFLEX_SYSTEM_TYPES],
            # KIŞ BAHÇESİ (sabit cam tavanli kis bahcesi, 2 alt tip) -- form
            # secenekleri icin bkz. /albert-genau/kis-bahcesi/types.
            "kisBahcesiTypes": [{"id": t, "label": ag_calc.KIS_BAHCESI_TYPE_LABELS[t]} for t in ag_calc.KIS_BAHCESI_SYSTEM_TYPES],
            # BC ailesi (TIARA/SLIDER NEXT/SLIDE MASTER/HD/TANGO/OPTIMA --
            # 39 varyant) -- detayli (kanatInputs/flagInputs/camItems) meta
            # icin bkz. /albert-genau/bc/types.
            "bcTypes": [{"id": t, "label": ag_calc.BC_TYPE_LABELS[t]} for t in ag_calc.BC_SYSTEM_TYPES]}


@api_router.get("/albert-genau/vertiflex/types")
async def albert_genau_vertiflex_types(companyId: Optional[str] = None, user=Depends(get_current_user)):
    # Her VERTIFLEX tipi icin frontend'in formu dogru cizebilmesi adina
    # panel sayisi/motor/kumanda kanali/inox/alicisiz/su-tahliyeli/secumax-
    # taraf secenekleri + kac cam kalemi girilmesi gerektigini dondurur
    # (bkz. ag_calc.VERTIFLEX_TYPE_META).
    if companyId:
        company_doc = await _own_company(user, companyId)
        _require_albert_genau_enabled(company_doc)
    return {
        "types": [
            {"id": t, "label": ag_calc.VERTIFLEX_TYPE_LABELS[t], **ag_calc.VERTIFLEX_TYPE_META[t]}
            for t in ag_calc.VERTIFLEX_SYSTEM_TYPES
        ],
        "finishes": list(ag_calc.FINISH_OPTIONS.keys()),
    }


def _run_ag_vertiflex_calculate(payload: "AlbertGenauVertiflexCalculateRequest", price_data: Optional[Dict[str, Any]]):
    try:
        return ag_calc.calculate_vertiflex(
            tip=payload.tip,
            genislik_mm=payload.genislikMm,
            yukseklik_mm=payload.yukseklikMm,
            panel_sayisi=payload.panelSayisi,
            motor=payload.motor,
            kumanda_kanal=payload.kumandaKanal,
            secumax_taraf=payload.secumaxTaraf,
            inox_zincirli=payload.inoxZincirli,
            alicisiz=payload.alicisiz,
            su_tahliyeli_alt_kasa=payload.suTahliyeliAltKasa,
            elektromekanik_set_adet=payload.elektromekanikSetAdet,
            finish=payload.finish,
            cam_fiyatlari_m2=payload.camFiyatlariM2,
            alis_iskonto_pct=payload.alisIskontoPct,
            montaj_bedeli=payload.montajBedeli,
            imalat_bedeli=payload.imalatBedeli,
            kar_marji_pct=payload.karMarjiPct,
            odeme_tipi=payload.odemeTipi,
            price_data=price_data,
        )
    except (ValueError, KeyError) as e:
        raise HTTPException(status_code=422, detail=str(e))


@api_router.post("/albert-genau/vertiflex/calculate")
async def albert_genau_vertiflex_calculate(payload: AlbertGenauVertiflexCalculateRequest, user=Depends(get_current_user)):
    if payload.companyId:
        company_doc = await _own_company(user, payload.companyId)
        _require_albert_genau_enabled(company_doc)
    price_data = await _get_ag_price_data(payload.companyId)
    return _run_ag_vertiflex_calculate(payload, price_data)


@api_router.get("/albert-genau/kis-bahcesi/types")
async def albert_genau_kis_bahcesi_types(companyId: Optional[str] = None, user=Depends(get_current_user)):
    # Her KIŞ BAHÇESİ tipi icin frontend'in formu dogru cizebilmesi adina
    # ayarli-duvar-baglantisi/kiris-ustu-vida-kapama/orta-kayit/ucgen-mikro-
    # pencere secenekleri + kac cam kalemi girilmesi gerektigini dondurur
    # (bkz. ag_calc.KIS_BAHCESI_TYPE_META).
    if companyId:
        company_doc = await _own_company(user, companyId)
        _require_albert_genau_enabled(company_doc)
    return {
        "types": [
            {"id": t, "label": ag_calc.KIS_BAHCESI_TYPE_LABELS[t], **ag_calc.KIS_BAHCESI_TYPE_META[t]}
            for t in ag_calc.KIS_BAHCESI_SYSTEM_TYPES
        ],
        "finishes": list(ag_calc.FINISH_OPTIONS.keys()),
    }


def _run_ag_kis_bahcesi_calculate(payload: "AlbertGenauKisBahcesiCalculateRequest", price_data: Optional[Dict[str, Any]]):
    try:
        return ag_calc.calculate_kis_bahcesi(
            tip=payload.tip,
            genislik_mm=payload.genislikMm,
            derinlik_mm=payload.derinlikMm,
            tavan_bolum_sayisi=payload.tavanBolumSayisi,
            arka_duvar_alt_yukseklik_mm=payload.arkaDuvarAltYukseklikMm,
            ara_dikme_sayisi=payload.araDikmeSayisi,
            ayarli_duvar_baglantisi=payload.ayarliDuvarBaglantisi,
            kiris_ustu_vida_kapama=payload.kirisUstuVidaKapama,
            orta_kayit=payload.ortaKayit,
            ucgen_mikro_pencere=payload.ucgenMikroPencere,
            finish=payload.finish,
            cam_fiyatlari_m2=payload.camFiyatlariM2,
            alis_iskonto_pct=payload.alisIskontoPct,
            montaj_bedeli=payload.montajBedeli,
            imalat_bedeli=payload.imalatBedeli,
            kar_marji_pct=payload.karMarjiPct,
            odeme_tipi=payload.odemeTipi,
            price_data=price_data,
        )
    except (ValueError, KeyError) as e:
        raise HTTPException(status_code=422, detail=str(e))


@api_router.post("/albert-genau/kis-bahcesi/calculate")
async def albert_genau_kis_bahcesi_calculate(payload: AlbertGenauKisBahcesiCalculateRequest, user=Depends(get_current_user)):
    if payload.companyId:
        company_doc = await _own_company(user, payload.companyId)
        _require_albert_genau_enabled(company_doc)
    price_data = await _get_ag_price_data(payload.companyId)
    return _run_ag_kis_bahcesi_calculate(payload, price_data)


class AlbertGenauBcCalculateRequest(BaseModel):
    # BC ailesi (TIARA/TIARA FLAT/INT/ZERO/SLIM, SLIDER NEXT/SLIDE MASTER,
    # ATRIUM/MOMENTUM/CENTRUM HD, TANGO/OPTIMA -- 39 kaydirmali sistem
    # varyanti). Diger ailelerden farkli olarak kanat/bayrak alanlari
    # TIPE GORE DEGISIR (bkz. ag_calc.BC_TYPE_META[tip]) -- o yuzden sabit
    # alanlar yerine genel {ref: deger} sozlukleri kullanilir; frontend
    # ilgili tipin kanatInputs/flagInputs anahtarlarini bu sozluklerle
    # doldurur.
    companyId: Optional[str] = None
    tip: str  # ag_calc.BC_SYSTEM_TYPES icinden biri
    genislikMm: Optional[float] = None
    yukseklikMm: Optional[float] = None
    kanatMiktarlari: Dict[str, float] = {}   # {"C18": 4, ...}
    bayrakDegerleri: Dict[str, float] = {}   # {"F14": 1, ...}
    rayTipi: Optional[int] = None            # sadece hasRayType=true icin, 1-4
    finish: Optional[str] = None
    camFiyatlariM2: Dict[str, float] = {}    # {"CAM-bc_tiara_08-1": 1500} gibi
    alisIskontoPct: float = 0.0
    montajBedeli: float = 0.0
    imalatBedeli: float = 0.0
    karMarjiPct: float = 0.0
    odemeTipi: str = "nakit"

    @field_validator("tip")
    @classmethod
    def _tip_valid(cls, v: str) -> str:
        if v not in ag_calc.BC_SYSTEM_TYPES:
            raise ValueError(f"Gecersiz BC sistem tipi: {v}")
        return v

    @field_validator("genislikMm", "yukseklikMm")
    @classmethod
    def _dim_valid(cls, v: Optional[float]) -> Optional[float]:
        if v is None:
            return None
        if v <= 0 or v > 30000:
            raise ValueError("Olcu 0-30000mm araliginda olmalidir")
        return v

    @field_validator("rayTipi")
    @classmethod
    def _ray_tipi_valid(cls, v: Optional[int]) -> Optional[int]:
        if v is None:
            return None
        if v not in (1, 2, 3, 4):
            raise ValueError("Ray tipi 1-4 araliginda olmalidir")
        return v

    @field_validator("kanatMiktarlari", "bayrakDegerleri")
    @classmethod
    def _ref_map_valid(cls, v: Dict[str, float]) -> Dict[str, float]:
        v = v or {}
        out = {}
        for ref, deger in list(v.items())[:40]:
            d = float(deger or 0)
            if d < 0 or d > 10000:
                raise ValueError("Miktar/bayrak degeri gecersiz")
            out[str(ref)[:10]] = d
        return out

    @field_validator("odemeTipi")
    @classmethod
    def _odeme_tipi_valid(cls, v: str) -> str:
        if v not in ("nakit", "kredi_karti"):
            raise ValueError("odemeTipi 'nakit' veya 'kredi_karti' olmalidir")
        return v

    @field_validator("alisIskontoPct", "karMarjiPct")
    @classmethod
    def _pct_range(cls, v: float) -> float:
        if v is None:
            return 0.0
        if v < 0 or v > 100:
            raise ValueError("Oran 0-100 araliginda olmalidir")
        return v

    @field_validator("camFiyatlariM2")
    @classmethod
    def _cam_fiyat_valid(cls, v: Dict[str, float]) -> Dict[str, float]:
        v = v or {}
        out = {}
        for sku, fiyat in list(v.items())[:10]:
            f = float(fiyat or 0)
            if f < 0 or f > 1_000_000:
                raise ValueError("Cam fiyati gecersiz")
            out[str(sku)[:60]] = f
        return out


@api_router.get("/albert-genau/bc/types")
async def albert_genau_bc_types(companyId: Optional[str] = None, user=Depends(get_current_user)):
    # Her BC tipi icin frontend'in dinamik formu dogru cizebilmesi adina
    # kanatInputs/flagInputs/camItems/hasRayType meta bilgisini dondurur
    # (bkz. ag_calc.BC_TYPE_META) -- diger ailelerden farkli olarak bu
    # alanlar TIPE GORE DEGISTIGI icin sabit form yerine veri-guduml (data-
    # driven) bir form kurulmasi gerekiyor.
    if companyId:
        company_doc = await _own_company(user, companyId)
        _require_albert_genau_enabled(company_doc)
    return {
        "types": [
            {"id": t, "label": ag_calc.BC_TYPE_LABELS[t], **ag_calc.BC_TYPE_META[t]}
            for t in ag_calc.BC_SYSTEM_TYPES
        ],
        "finishes": list(ag_calc.FINISH_OPTIONS.keys()),
    }


def _run_ag_bc_calculate(payload: "AlbertGenauBcCalculateRequest", price_data: Optional[Dict[str, Any]]):
    try:
        return ag_calc.calculate_bc(
            tip=payload.tip,
            genislik_mm=payload.genislikMm,
            yukseklik_mm=payload.yukseklikMm,
            kanat_miktarlari=payload.kanatMiktarlari,
            bayrak_degerleri=payload.bayrakDegerleri,
            ray_tipi=payload.rayTipi,
            finish=payload.finish,
            cam_fiyatlari_m2=payload.camFiyatlariM2,
            alis_iskonto_pct=payload.alisIskontoPct,
            montaj_bedeli=payload.montajBedeli,
            imalat_bedeli=payload.imalatBedeli,
            kar_marji_pct=payload.karMarjiPct,
            odeme_tipi=payload.odemeTipi,
            price_data=price_data,
        )
    except (ValueError, KeyError) as e:
        raise HTTPException(status_code=422, detail=str(e))


@api_router.post("/albert-genau/bc/calculate")
async def albert_genau_bc_calculate(payload: AlbertGenauBcCalculateRequest, user=Depends(get_current_user)):
    if payload.companyId:
        company_doc = await _own_company(user, payload.companyId)
        _require_albert_genau_enabled(company_doc)
    price_data = await _get_ag_price_data(payload.companyId)
    return _run_ag_bc_calculate(payload, price_data)


class AlbertGenauYedekParcaCalculateRequest(BaseModel):
    # YEDEK PARÇA -- dağıtık parça-değişim kataloğu (243 kalem). Diğer
    # ailelerden farklı olarak bayı SABİT bir "sistem" seçmez, kataloğun
    # HERHANGİ bir alt kümesini serbestçe seçip miktar girer (bkz.
    # ag_calc.YEDEK_PARCA_ITEMS / calculate_yedek_parca).
    companyId: Optional[str] = None
    quantities: Dict[str, float] = {}
    alisIskontoPct: float = 0.0
    montajBedeli: float = 0.0
    imalatBedeli: float = 0.0
    karMarjiPct: float = 0.0
    odemeTipi: str = "nakit"

    @field_validator("odemeTipi")
    @classmethod
    def _odeme_tipi_valid(cls, v: str) -> str:
        if v not in ("nakit", "kredi_karti"):
            raise ValueError("odemeTipi 'nakit' veya 'kredi_karti' olmalidir")
        return v

    @field_validator("alisIskontoPct", "karMarjiPct")
    @classmethod
    def _pct_range(cls, v: float) -> float:
        if v is None:
            return 0.0
        if v < 0 or v > 100:
            raise ValueError("Oran 0-100 araliginda olmalidir")
        return v

    @field_validator("quantities")
    @classmethod
    def _qty_valid(cls, v: Dict[str, float]) -> Dict[str, float]:
        v = v or {}
        if len(v) > 300:
            raise ValueError("Cok fazla kalem")
        out = {}
        for sku, qty in v.items():
            q = float(qty or 0)
            if q < 0 or q > 100_000:
                raise ValueError("Miktar gecersiz")
            out[str(sku)[:40]] = q
        return out


@api_router.get("/albert-genau/yedek-parca/items")
async def albert_genau_yedek_parca_items(companyId: Optional[str] = None, user=Depends(get_current_user)):
    # Katalog firma-bazli fiyat listesi override'indan etkilenmez (bkz.
    # albert_genau_calc.py modul-ustu notu) -- ama admin'in Mongo'ya
    # yukledigi TEK merkezi katalog varsa (bkz. _get_yedek_parca_data) o
    # kullanilir, yoksa paket-ici varsayilana (yedek_parca.json) dusulur.
    # companyId burada sadece albertGenauEnabled kontrolu icin kullanilir.
    if companyId:
        company_doc = await _own_company(user, companyId)
        _require_albert_genau_enabled(company_doc)
    catalog = await _get_yedek_parca_data()
    if catalog:
        return {"items": catalog["items"], "groups": catalog["groups"]}
    return {"items": ag_calc.YEDEK_PARCA_ITEMS, "groups": ag_calc.YEDEK_PARCA_GROUPS}


def _run_ag_yedek_parca_calculate(payload: "AlbertGenauYedekParcaCalculateRequest", catalog_data: Optional[Dict[str, Any]]):
    try:
        return ag_calc.calculate_yedek_parca(
            quantities=payload.quantities,
            alis_iskonto_pct=payload.alisIskontoPct,
            montaj_bedeli=payload.montajBedeli,
            imalat_bedeli=payload.imalatBedeli,
            kar_marji_pct=payload.karMarjiPct,
            odeme_tipi=payload.odemeTipi,
            catalog_data=catalog_data,
        )
    except (ValueError, KeyError) as e:
        raise HTTPException(status_code=422, detail=str(e))


@api_router.post("/albert-genau/yedek-parca/calculate")
async def albert_genau_yedek_parca_calculate(payload: AlbertGenauYedekParcaCalculateRequest, user=Depends(get_current_user)):
    if payload.companyId:
        company_doc = await _own_company(user, payload.companyId)
        _require_albert_genau_enabled(company_doc)
    catalog_data = await _get_yedek_parca_data()
    return _run_ag_yedek_parca_calculate(payload, catalog_data)


@api_router.get("/albert-genau/parts-list-items")
async def albert_genau_parts_list_items(systemId: str, companyId: Optional[str] = None, user=Depends(get_current_user)):
    # AIRFLEX gibi bir "parca listesi" sisteminin kalemlerini (sku/isim/birim)
    # dondurur ki frontend miktar giris formunu bunlardan olustursun.
    if systemId not in ag_calc.PARTS_LIST_SYSTEMS:
        raise HTTPException(status_code=422, detail="Gecersiz parca listesi sistemi")
    if companyId:
        company_doc = await _own_company(user, companyId)
        _require_albert_genau_enabled(company_doc)
    price_data = await _get_ag_price_data(companyId)
    return {
        "systemId": systemId,
        "systemLabel": ag_calc.PARTS_LIST_SYSTEMS[systemId]["label"],
        "items": ag_calc.parts_list_items(systemId, price_data),
    }


def _run_ag_parts_list_calculate(payload: "AlbertGenauPartsListCalculateRequest", price_data: Optional[Dict[str, Any]]):
    try:
        return ag_calc.calculate_parts_list(
            system_id=payload.systemId,
            quantities=payload.quantities,
            finish=payload.finish,
            alis_iskonto_pct=payload.alisIskontoPct,
            montaj_bedeli=payload.montajBedeli,
            imalat_bedeli=payload.imalatBedeli,
            kar_marji_pct=payload.karMarjiPct,
            odeme_tipi=payload.odemeTipi,
            price_data=price_data,
        )
    except (ValueError, KeyError) as e:
        raise HTTPException(status_code=422, detail=str(e))


@api_router.post("/albert-genau/parts-list/calculate")
async def albert_genau_parts_list_calculate(payload: AlbertGenauPartsListCalculateRequest, user=Depends(get_current_user)):
    if payload.companyId:
        company_doc = await _own_company(user, payload.companyId)
        _require_albert_genau_enabled(company_doc)
    price_data = await _get_ag_price_data(payload.companyId)
    return _run_ag_parts_list_calculate(payload, price_data)


@api_router.post("/albert-genau/airflex-module/calculate")
async def albert_genau_airflex_module_calculate(payload: AlbertGenauAirflexModuleRequest, user=Depends(get_current_user)):
    if payload.companyId:
        company_doc = await _own_company(user, payload.companyId)
        _require_albert_genau_enabled(company_doc)
    price_data = await _get_ag_price_data(payload.companyId)
    try:
        return ag_calc.calculate_airflex_module(
            adet=payload.adet,
            tekerlekli=payload.tekerlekli,
            kapi_var=payload.kapiVar,
            kilit_var=payload.kilitVar,
            cam_sabit_genislik_mm=payload.camSabitGenislikMm,
            cam_sabit_fiyat_m2=payload.camSabitFiyatM2,
            cam_hareketli_genislik_mm=payload.camHareketliGenislikMm,
            cam_hareketli_fiyat_m2=payload.camHareketliFiyatM2,
            finish=payload.finish,
            alis_iskonto_pct=payload.alisIskontoPct,
            montaj_bedeli=payload.montajBedeli,
            imalat_bedeli=payload.imalatBedeli,
            kar_marji_pct=payload.karMarjiPct,
            odeme_tipi=payload.odemeTipi,
            price_data=price_data,
        )
    except (ValueError, KeyError) as e:
        raise HTTPException(status_code=422, detail=str(e))


def _run_ag_calculate(payload: "AlbertGenauCalculateRequest", price_data: Optional[Dict[str, Any]]):
    try:
        return ag_calc.calculate(
            tip=payload.tip,
            genislik_mm=payload.genislikMm,
            derinlik_mm=payload.derinlikMm,
            yukseklik_mm=payload.yukseklikMm,
            corner_flat=payload.cornerFlat,
            somfy=payload.somfy,
            no_wall_bracket=payload.noWallBracket,
            finish=payload.finish,
            led_option=payload.ledOption,
            led_mid_support=payload.ledMidSupport,
            kopuk=payload.kopuk,
            alis_iskonto_pct=payload.alisIskontoPct,
            montaj_bedeli=payload.montajBedeli,
            imalat_bedeli=payload.imalatBedeli,
            kar_marji_pct=payload.karMarjiPct,
            odeme_tipi=payload.odemeTipi,
            price_data=price_data,
        )
    except ag_calc.DepthChoiceRequired as e:
        # Derinlik iki standart panel-adimi arasinda kaliyor -- otomatik
        # yuvarlamak yerine 409 ile alt/ust seceneklerini dondururuz ki
        # istemci kullaniciya secim yaptirip ayni istegi kesin bir
        # derinlikMm ile tekrar gonderebilsin.
        raise HTTPException(status_code=409, detail={
            "code": "depth_choice_required",
            "message": str(e),
            "floorMm": e.floor_mm,
            "ceilMm": e.ceil_mm,
            "rawMm": e.raw_mm,
        })
    except (ValueError, KeyError) as e:
        raise HTTPException(status_code=422, detail=str(e))


@api_router.post("/albert-genau/calculate")
async def albert_genau_calculate(payload: AlbertGenauCalculateRequest, user=Depends(get_current_user)):
    if payload.companyId:
        company_doc = await _own_company(user, payload.companyId)
        _require_albert_genau_enabled(company_doc)
    price_data = await _get_ag_price_data(payload.companyId)
    return _run_ag_calculate(payload, price_data)


@api_router.post("/albert-genau/calculate/export-excel")
async def albert_genau_export_excel(payload: AlbertGenauCalculateRequest, user=Depends(get_current_user)):
    if payload.companyId:
        company_doc = await _own_company(user, payload.companyId)
        _require_albert_genau_enabled(company_doc)
    price_data = await _get_ag_price_data(payload.companyId)
    result = _run_ag_calculate(payload, price_data)

    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
    from io import BytesIO

    wb = Workbook()
    ws = wb.active
    ws.title = "Albert Genau Hesap"

    header_fill = PatternFill(start_color="1F2937", end_color="1F2937", fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True, size=11)
    title_font = Font(bold=True, size=14)
    bold = Font(bold=True)
    thin = Side(style="thin", color="D1D5DB")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    ws.merge_cells("A1:D1")
    ws["A1"] = f"{result['tipAdi']} - Fiyat Hesabi"
    ws["A1"].font = title_font

    girdi = result["girdi"]
    odeme_label = "NAKIT" if result.get("odemeTipi", "nakit") == "nakit" else "KREDI KARTI"
    rows_info = [
        ("Genislik (mm)", girdi.get("genislikMm")),
        ("Girilen Derinlik (mm)", girdi.get("derinlikMmGirilen")),
        ("Uygulanan Derinlik (mm)", girdi.get("yapilabilirDerinlikMm")),
        ("Yukseklik (mm)", girdi.get("yukseklikMm")),
        ("Modul Sayisi", girdi.get("modulSayisi")),
        ("Odeme Tipi", odeme_label),
    ]
    r = 3
    for label, val in rows_info:
        ws.cell(row=r, column=1, value=label).font = bold
        ws.cell(row=r, column=2, value=val)
        r += 1

    r += 1
    ws.cell(row=r, column=1, value="Malzeme Kalemleri").font = Font(bold=True, size=12)
    r += 1
    headers = ["Kalem", "SKU", "Birim Fiyat", "Miktar", "Toplam"]
    for i, h in enumerate(headers, start=1):
        c = ws.cell(row=r, column=i, value=h)
        c.font = header_font
        c.fill = header_fill
        c.border = border
    r += 1
    kalem_start = r
    for k in result["kalemler"]:
        ws.cell(row=r, column=1, value=k["label"]).border = border
        ws.cell(row=r, column=2, value=k["sku"]).border = border
        ws.cell(row=r, column=3, value=k["birimFiyat"]).border = border
        ws.cell(row=r, column=4, value=k["miktar"]).border = border
        ws.cell(row=r, column=5, value=k["toplam"]).border = border
        r += 1
    kalem_end = r - 1

    r += 1
    summary_rows = [
        (f"Profil Grubu Toplam ({odeme_label})", result.get("profilGrubuToplamFiresiz", result["profilGrubuToplam"])),
        (f"Profil Fire Payi (%{round((result.get('profilFireOrani') or 0) * 100)})", result.get("profilFireTutari", 0)),
        (f"Aksesuar Grubu Toplam ({odeme_label})", result["aksesuarGrubuToplam"]),
        ("Opsiyonel Toplam", result.get("opsiyonelToplam", 0)),
        (f"Malzeme Maliyeti Toplam ({odeme_label})", result["maliyetToplam"]),
        (f"Alis Iskontosu (%{result.get('alisIskontoPct', 0)})", None),
        ("Iskontolu Malzeme Maliyeti", result.get("maliyetIndirimli")),
        (f"Kar Tutari (%{result.get('karMarjiPct', 0)})", result.get("karTutari")),
        ("Montaj Bedeli", result["montajBedeli"]),
        ("Imalat ve Diger Giderler", result.get("imalatBedeli", 0)),
        (f"SATIS FIYATI ({odeme_label})", result["satisFiyati"]),
    ]
    for label, val in summary_rows:
        ws.cell(row=r, column=1, value=label).font = bold
        if val is not None:
            ws.cell(row=r, column=4, value=val).font = bold
        if label.startswith("SATIS FIYATI"):
            for col in range(1, 6):
                ws.cell(row=r, column=col).fill = PatternFill(start_color="FDE68A", end_color="FDE68A", fill_type="solid")
        r += 1

    for col, width in zip("ABCDE", [34, 16, 14, 10, 14]):
        ws.column_dimensions[col].width = width

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    filename = f"albert-genau-{payload.tip}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@api_router.post("/albert-genau/calculate/export-drawing")
async def albert_genau_export_drawing(payload: AlbertGenauCalculateRequest, user=Depends(get_current_user)):
    """Excel'deki 'CIZIMLER' sayfasindaki modul semasina benzer, girilen
    olculere gore otomatik uretilen basit bir teknik cizim -- PNG olarak
    dondurulur ve frontend'de teklife ek (attachment) olarak eklenir.
    Gercek CAD cizimi degil, dealer'a ve musteriye kac modul/kanat oldugunu
    gosteren bir semadir."""
    if payload.companyId:
        company_doc = await _own_company(user, payload.companyId)
        _require_albert_genau_enabled(company_doc)
    price_data = await _get_ag_price_data(payload.companyId)
    result = _run_ag_calculate(payload, price_data)
    girdi = result["girdi"]

    from PIL import Image, ImageDraw, ImageFont
    from io import BytesIO

    modul_sayisi = max(1, int(girdi.get("modulSayisi") or 1))
    # `panelSayisiModul` adina ragmen TUM modullerin TOPLAM lamel sayisidir
    # (module_panel_count'taki G3 formulu C3 ile carpilir). Her modulun icine
    # toplami cizersek cok modullu pergolada lamel sayisi katlanir -- ekrandaki
    # canli cizim ile ayni bolunmeyi gostermesi icin modul basina dusen sayi
    # kullanilir (bkz. ag_geometry.modul_semasi).
    lamel_toplam = max(1, int(girdi.get("panelSayisiModul") or 1))
    panel_sayisi = min(30, max(1, round(lamel_toplam / modul_sayisi)))
    genislik_mm = girdi.get("genislikMm") or 0
    derinlik_mm = girdi.get("yapilabilirDerinlikMm") or girdi.get("derinlikMmGirilen") or 0

    def _font(size: int, bold: bool = False):
        candidates = [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        ]
        for path in candidates:
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
        return ImageFont.load_default()

    font_title = _font(20, bold=True)
    font_info = _font(15)
    font_module = _font(22, bold=True)

    PAD = 30
    TITLE_H = 50
    INFO_H = 34
    MODULE_GAP = 12
    MODULE_W = 240
    aspect = (derinlik_mm / genislik_mm) if genislik_mm else 0.6
    MODULE_H = int(max(260, min(460, MODULE_W * aspect * 1.6)))

    # Cok modul varsa (>5) genisligi sikistirarak resmin cok buyumesini onle.
    if modul_sayisi > 5:
        MODULE_W = max(140, int(MODULE_W * 5 / modul_sayisi))

    canvas_w = PAD * 2 + modul_sayisi * MODULE_W + (modul_sayisi - 1) * MODULE_GAP
    canvas_h = PAD * 2 + TITLE_H + INFO_H + MODULE_H

    img = Image.new("RGB", (canvas_w, canvas_h), "#FFFFFF")
    d = ImageDraw.Draw(img)

    # Dis cerceve + baslik kutusu
    d.rectangle([2, 2, canvas_w - 3, canvas_h - 3], outline="#111827", width=2)
    d.rectangle([2, 2, canvas_w - 3, TITLE_H], outline="#111827", width=2, fill="#1F2937")
    title_text = "TEKNİK ÇİZİM VE DETAYLARI"
    tb = d.textbbox((0, 0), title_text, font=font_title)
    d.text(((canvas_w - (tb[2] - tb[0])) / 2, (TITLE_H - (tb[3] - tb[1])) / 2 - tb[1]), title_text, font=font_title, fill="#FFFFFF")

    info_text = (
        f"Genişlik: {genislik_mm:.0f} mm    Derinlik: {derinlik_mm:.0f} mm    "
        f"Modül Sayısı: {modul_sayisi}    Lamel: {panel_sayisi}/modül (toplam {lamel_toplam})"
    )
    ib = d.textbbox((0, 0), info_text, font=font_info)
    d.text(((canvas_w - (ib[2] - ib[0])) / 2, TITLE_H + 8), info_text, font=font_info, fill="#374151")

    y0 = TITLE_H + INFO_H
    for i in range(modul_sayisi):
        x0 = PAD + i * (MODULE_W + MODULE_GAP)
        x1 = x0 + MODULE_W
        y1 = y0 + MODULE_H

        # Renkli "olcu kilavuzu" cercevesi -- orijinal Excel cizimindeki gibi
        # her kenarda farkli renk (sadece gorsel referans, olcek disi).
        d.line([x0, y0 + 4, x1, y0 + 4], fill="#DB2777", width=3)     # ust: magenta
        d.line([x0, y1 - 4, x1, y1 - 4], fill="#2563EB", width=3)     # alt: mavi
        d.line([x0 + 4, y0, x0 + 4, y1], fill="#16A34A", width=3)     # sol: yesil
        d.line([x1 - 4, y0, x1 - 4, y1], fill="#0891B2", width=3)     # sag: camgobegi

        # Ana govde
        inset = 14
        d.rectangle([x0 + inset, y0 + inset, x1 - inset, y1 - inset], outline="#111827", width=2)

        # Kanat/lamel cizgileri
        inner_pad = 26
        ix0, iy0, ix1, iy1 = x0 + inner_pad, y0 + inner_pad, x1 - inner_pad, y1 - inner_pad
        if panel_sayisi > 1 and iy1 > iy0:
            step = (iy1 - iy0) / panel_sayisi
            for k in range(1, panel_sayisi):
                ly = iy0 + step * k
                d.line([ix0, ly, ix1, ly], fill="#9CA3AF", width=1)
            d.rectangle([ix0, iy0, ix1, iy1], outline="#0891B2", width=1)

        # Kose baglanti (vida/kelepce) isaretleri
        for cx, cy in [(x0 + inset, y0 + inset), (x1 - inset, y0 + inset), (x0 + inset, y1 - inset), (x1 - inset, y1 - inset)]:
            d.rectangle([cx - 7, cy - 7, cx + 7, cy + 7], outline="#111827", fill="#E5E7EB", width=1)
            d.line([cx - 4, cy - 4, cx + 4, cy + 4], fill="#111827", width=1)
            d.line([cx - 4, cy + 4, cx + 4, cy - 4], fill="#111827", width=1)

        label = f"MODUL {i + 1}"
        lb = d.textbbox((0, 0), label, font=font_module)
        d.text((x0 + (MODULE_W - (lb[2] - lb[0])) / 2, y0 + (MODULE_H - (lb[3] - lb[1])) / 2 - lb[1]), label, font=font_module, fill="#111827")

    buf = BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    filename = f"albert-genau-{payload.tip}-cizim.png"
    return StreamingResponse(
        buf,
        media_type="image/png",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@api_router.post("/albert-genau/geometry")
async def albert_genau_geometry(payload: AlbertGenauGeometryRequest, user=Depends(get_current_user)):
    """Olculerden cizim modelini uretir -- fiyat hesaplamadan.

    Cizim geometrisinin TEK kaynagi burasi: ekrandaki canli cizim de,
    teklife eklenen teknik cizim de ayni modeli kullanir, boylece ikisi
    birbirinden kaymaz. Modul (pergola) bolunmesi hala PriceBook'tan
    gelir -- Excel'den dogrulanmis matematigi cogaltmamak icin.
    """
    if payload.companyId:
        company_doc = await _own_company(user, payload.companyId)
        _require_albert_genau_enabled(company_doc)

    try:
        if payload.kind == "cephe":
            if not payload.cepheler:
                raise HTTPException(422, "En az bir cephe gerekli")
            model = ag_geom.cephe_zinciri(
                [c.dict() for c in payload.cepheler],
                max_kanat_mm=payload.maxKanatMm or ag_geom.VARSAYILAN_MAX_KANAT_MM,
                # Profil dusum degerleri Albert Genau'dan gelene kadar yok:
                # cam olculeri bilerek uretilmez (bkz. ag_geometry basligi).
                profil_dusumu=None,
            )
            # BC tipi biliniyorsa form onerisini de uret: bugun bayinin elle
            # yazdigi kanat miktarlari ve kose sayisi cizimden gelsin.
            bc_meta = ag_calc.BC_TYPE_META.get(payload.bcTip) if payload.bcTip else None
            if bc_meta:
                model["bcOneri"] = ag_geom.bc_oneri(
                    model, bc_meta.get("kanatInputs"), bc_meta.get("flagInputs")
                )
            # Cepheler farkli yukseklikteyse calculate'e tek bir yukseklik
            # gitmek zorunda -- en buyugu alinir ve kullaniciya soylenir.
            yukseklikler = {c["yukseklikMm"] for c in model["cepheler"]}
            if len(yukseklikler) > 1:
                model["uyarilar"].append(
                    "Cepheler farkli yukseklikte; fiyat hesabinda en buyuk "
                    f"yukseklik ({max(yukseklikler):.0f}mm) kullanilacak."
                )
            return model

        if payload.kind == "modul":
            if payload.genislikMm is None or payload.derinlikMm is None:
                raise HTTPException(422, "Genislik ve derinlik gerekli")
            if payload.modulSayisi:
                # Elle girilen kalem: bolunme kullanicidan gelir, derinlik
                # standart olcuye oturtulmaz (AG derinlik tablosu gecerli degil).
                model = ag_geom.modul_semasi(
                    genislik_mm=payload.genislikMm,
                    derinlik_mm=payload.derinlikMm,
                    modul_sayisi=payload.modulSayisi,
                    lamel_sayisi_toplam=payload.lamelSayisiToplam or payload.modulSayisi,
                )
                return model
            price_data = await _get_ag_price_data(payload.companyId)
            pb = ag_calc.PriceBook(price_data)
            modul_sayisi, lamel_sayisi, derinlik_snap = pb.module_panel_count(
                payload.genislikMm, payload.derinlikMm
            )
            model = ag_geom.modul_semasi(
                genislik_mm=payload.genislikMm,
                derinlik_mm=derinlik_snap,
                modul_sayisi=modul_sayisi,
                lamel_sayisi_toplam=lamel_sayisi,
            )
            model["derinlikGirilenMm"] = payload.derinlikMm
            model["derinlikSnapMm"] = derinlik_snap
            return model

        # kind == 'giyotin'
        if payload.genislikMm is None or payload.yukseklikMm is None:
            raise HTTPException(422, "Genislik ve yukseklik gerekli")
        return ag_geom.giyotin_semasi(
            tip=payload.tip or "",
            genislik_mm=payload.genislikMm,
            yukseklik_mm=payload.yukseklikMm,
            panel_sayisi=payload.panelSayisi or 3,
        )
    except ag_geom.GeometriHatasi as e:
        raise HTTPException(422, str(e))


@api_router.get("/albert-genau/items", response_model=List[AlbertGenauItem])
async def list_albert_genau_items(companyId: str, user=Depends(get_current_user)):
    await _own_company(user, companyId)
    docs = await db.albert_genau_items.find({"companyId": companyId, "userId": user["user_id"]}, {"_id": 0}).to_list(500)
    return [AlbertGenauItem(**d) for d in docs]


@api_router.post("/albert-genau/items", response_model=AlbertGenauItem)
async def create_albert_genau_item(payload: AlbertGenauItemCreate, user=Depends(get_current_user)):
    _require_owner(user)
    await _own_company(user, payload.companyId)
    obj = AlbertGenauItem(userId=user["user_id"], **payload.dict())
    await db.albert_genau_items.insert_one(obj.dict())
    return obj


@api_router.put("/albert-genau/items/{item_id}", response_model=AlbertGenauItem)
async def update_albert_genau_item(item_id: str, payload: AlbertGenauItemCreate, user=Depends(get_current_user)):
    _require_owner(user)
    await _own_company(user, payload.companyId)
    doc = await db.albert_genau_items.find_one({"id": item_id, "userId": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Kalem bulunamadi")
    updated = {**doc, **payload.dict()}
    await db.albert_genau_items.replace_one({"id": item_id, "userId": user["user_id"]}, updated)
    return AlbertGenauItem(**updated)


@api_router.delete("/albert-genau/items/{item_id}")
async def delete_albert_genau_item(item_id: str, user=Depends(get_current_user)):
    _require_owner(user)
    await db.albert_genau_items.delete_one({"id": item_id, "userId": user["user_id"]})
    return {"ok": True}


def _parse_ag_price_excel(file_bytes: bytes) -> Dict[str, Any]:
    """'SİPARİŞ FORMU' sayfasindaki (SKU, ad, birim, fiyat, agirlik) fiyat
    listesini okur. Hesaplama formulleri/tablolari (depth_table, belt_table)
    bu dosyada DEGISTIRILMEZ -- sadece fiyatlar guncellenir, cunku bunlar
    Albert Genau'nun urun/imalat mantigina bagli sabitlerdir."""
    try:
        wb = load_workbook(io.BytesIO(file_bytes), data_only=True)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Excel dosyasi okunamadi: {e}")
    if "SİPARİŞ FORMU" not in wb.sheetnames:
        raise HTTPException(status_code=422, detail="Bu dosyada 'SİPARİŞ FORMU' sayfasi bulunamadi")
    ws = wb["SİPARİŞ FORMU"]
    price_list: Dict[str, Any] = {}
    for row in range(5, 200):
        code = ws.cell(row=row, column=1).value
        name = ws.cell(row=row, column=2).value
        unit = ws.cell(row=row, column=5).value
        price = ws.cell(row=row, column=6).value
        weight = ws.cell(row=row, column=7).value
        if not code or not isinstance(code, str) or name is None or price is None:
            continue
        try:
            price = float(price)
        except (TypeError, ValueError):
            continue
        price_list[code.strip()] = {"name": str(name).strip(), "unit": unit, "price": price, "weight": weight}
    if len(price_list) < 20:
        raise HTTPException(status_code=422, detail="Fiyat listesinde beklenenden az kalem bulundu, dosyayi kontrol edin")
    return price_list


def _parse_yedek_parca_excel(file_bytes: bytes) -> Dict[str, Any]:
    """"YEDEK PARÇA" sayfasindaki dagitik parca katalogunu okur (bkz.
    backend/data/yedek_parca.json'un asil kaynagi). Sutunlar: A=grup adi
    (seyrek -- sadece bir grubun ilk satirinda dolu), B=SKU, C=aciklama,
    D=birim, E=fiyat. Veri 4. satirdan baslar. Ayni SKU birden fazla kez
    gecerse (kaynak Excel'de bilinen bir veri kalitesi sorunu) SON gecen
    deger kazanir ama sozlukteki KONUMU ilk-gorulme sirasinda kalir (Python
    dict overwrite semantigi) -- bu, ilk entegrasyondaki dedup kuraliyla
    birebir aynidir."""
    try:
        wb = load_workbook(io.BytesIO(file_bytes), data_only=True)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Excel dosyasi okunamadi: {e}")
    sheet_name = "YEDEK PARÇA" if "YEDEK PARÇA" in wb.sheetnames else None
    if not sheet_name:
        for name in wb.sheetnames:
            if "YEDEK" in name.upper() and "PAR" in name.upper():
                sheet_name = name
                break
    if not sheet_name:
        raise HTTPException(status_code=422, detail="Bu dosyada 'YEDEK PARÇA' sayfasi bulunamadi")
    ws = wb[sheet_name]
    dedup: Dict[str, Dict[str, Any]] = {}
    current_group = ""
    for row in range(4, ws.max_row + 2):
        group_cell = ws.cell(row=row, column=1).value
        sku = ws.cell(row=row, column=2).value
        name = ws.cell(row=row, column=3).value
        unit = ws.cell(row=row, column=4).value
        price = ws.cell(row=row, column=5).value
        if group_cell and str(group_cell).strip():
            current_group = str(group_cell).strip()
        if not sku or not isinstance(sku, str) or name is None or price is None:
            continue
        try:
            price = float(price)
        except (TypeError, ValueError):
            continue
        dedup[sku.strip()] = {
            "sku": sku.strip(),
            "name": str(name).strip(),
            "unit": str(unit).strip() if unit else "",
            "price": price,
            "group": current_group or "GENEL",
        }
    items = list(dedup.values())
    if len(items) < 20:
        raise HTTPException(status_code=422, detail="Yedek parça listesinde beklenenden az kalem bulundu, dosyayi kontrol edin")
    groups = list(dict.fromkeys(it["group"] for it in items))
    return {"items": items, "groups": groups}


@api_router.get("/albert-genau/price-list/status")
async def albert_genau_price_list_status(user=Depends(get_current_user)):
    _require_admin(user)
    doc = await db.albert_genau_config.find_one({"id": "default"}, {"_id": 0})
    if not doc:
        return {"exists": False, "skuCount": len(ag_calc._DEFAULT_DATA["price_list"]), "source": "varsayilan (paket icinde)"}
    return {"exists": True, "skuCount": len(doc.get("price_list", {})), "updatedAt": doc.get("updatedAt"),
            "updatedBy": doc.get("updatedBy"), "source": "yuklenen Excel"}


@api_router.post("/albert-genau/price-list/upload")
async def albert_genau_price_list_upload(payload: Dict[str, str], user=Depends(get_current_user)):
    # Sadece platform admini gunceller -- Albert Genau'nun kendi resmi fiyat
    # listesi, tek bir firmanin verisi degil, bu yuzden ADMIN_EMAILS ile
    # sinirli (bkz. _require_admin), sirket sahiplerinin normal yetkisi degil.
    _require_admin(user)
    b64 = (payload or {}).get("fileBase64", "")
    if not b64 or "," not in b64:
        raise HTTPException(status_code=422, detail="Gecersiz dosya verisi")
    try:
        file_bytes = base64.b64decode(b64.split(",", 1)[1])
    except Exception:
        raise HTTPException(status_code=422, detail="Dosya cozumlenemedi")
    if len(file_bytes) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Dosya cok buyuk (maksimum 20MB)")
    new_price_list = _parse_ag_price_excel(file_bytes)
    existing = await db.albert_genau_config.find_one({"id": "default"}, {"_id": 0})
    base = existing or ag_calc._DEFAULT_DATA
    updated_doc = {
        "id": "default",
        "price_list": new_price_list,
        "depth_table": base["depth_table"],
        "belt_table": base["belt_table"],
        "updatedAt": utc_now_iso(),
        "updatedBy": user.get("email", ""),
    }
    await db.albert_genau_config.replace_one({"id": "default"}, updated_doc, upsert=True)
    return {"ok": True, "skuCount": len(new_price_list)}


# --- Yedek Parça kataloğu (admin-only, TEK merkezi kayıt) -----------------
# Yukarıdaki price-list/* ana Excel'i (BIOFLEX/AIRFLEX/VERTIFLEX/KIŞ BAHÇESİ/
# BC'nin HEPSİNİN kullandığı ortak SKU->fiyat listesi) günceller. YEDEK PARÇA
# ise kasıtlı olarak AYRI bir katalogdur (bkz. albert_genau_calc.py modül-üstü
# notu -- B8505102 SKU'sunun iki listede FARKLI fiyatta olması), o yüzden
# kendi admin status/upload çiftine sahip.
@api_router.get("/albert-genau/yedek-parca/admin-status")
async def albert_genau_yedek_parca_admin_status(user=Depends(get_current_user)):
    _require_admin(user)
    doc = await db.yedek_parca_config.find_one({"id": "default"}, {"_id": 0})
    if not doc:
        return {"exists": False, "itemCount": len(ag_calc.YEDEK_PARCA_ITEMS), "source": "varsayılan (paket içinde)"}
    return {"exists": True, "itemCount": len(doc.get("items", [])), "updatedAt": doc.get("updatedAt"),
            "updatedBy": doc.get("updatedBy"), "source": "yüklenen Excel"}


@api_router.post("/albert-genau/yedek-parca/admin-upload")
async def albert_genau_yedek_parca_admin_upload(payload: Dict[str, str], user=Depends(get_current_user)):
    _require_admin(user)
    b64 = (payload or {}).get("fileBase64", "")
    if not b64 or "," not in b64:
        raise HTTPException(status_code=422, detail="Geçersiz dosya verisi")
    try:
        file_bytes = base64.b64decode(b64.split(",", 1)[1])
    except Exception:
        raise HTTPException(status_code=422, detail="Dosya çözümlenemedi")
    if len(file_bytes) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Dosya çok büyük (maksimum 20MB)")
    parsed = _parse_yedek_parca_excel(file_bytes)
    updated_doc = {
        "id": "default",
        "items": parsed["items"],
        "groups": parsed["groups"],
        "updatedAt": utc_now_iso(),
        "updatedBy": user.get("email", ""),
    }
    await db.yedek_parca_config.replace_one({"id": "default"}, updated_doc, upsert=True)
    return {"ok": True, "itemCount": len(parsed["items"])}


# --- Firma-bazli (bayi) fiyat listesi -------------------------------------
# Yukarisi (price-list/status, price-list/upload) admin-only ve TEK ortak
# ("default") listeyi yonetiyor. Ancak her Albert Genau bayisi kendi Excel
# fiyat listesini (ayni tablo duzeni, fiyatlar farkli) kendi hesabindan
# yukleyebilmeli -- yeni bir bayiye verilen baslangic dosyasi budur, ve
# zam geldiginde bayi sadece bu ekrandan yeni Excel'i tekrar yukler.
# Sadece firma SAHIBI yukleyebilir (personel goremez/degistiremez).
@api_router.get("/albert-genau/company-price-list/status")
async def albert_genau_company_price_list_status(companyId: str, user=Depends(get_current_user)):
    _require_owner(user)
    company_doc = await _own_company(user, companyId)
    _require_albert_genau_enabled(company_doc)
    doc = await db.albert_genau_config.find_one({"companyId": companyId}, {"_id": 0})
    if not doc:
        default_doc = await db.albert_genau_config.find_one({"id": "default"}, {"_id": 0})
        base = default_doc or ag_calc._DEFAULT_DATA
        return {
            "exists": False,
            "skuCount": len(base.get("price_list", {})),
            "source": "henüz yüklenmedi — Excel dosyanızı yüklemeden hesaplama yapamazsınız",
        }
    return {
        "exists": True,
        "skuCount": len(doc.get("price_list", {})),
        "updatedAt": doc.get("updatedAt"),
        "updatedBy": doc.get("updatedBy"),
        "source": "kendi yüklediğiniz Excel",
    }


@api_router.post("/albert-genau/company-price-list/upload")
async def albert_genau_company_price_list_upload(payload: Dict[str, str], user=Depends(get_current_user)):
    _require_owner(user)
    company_id = (payload or {}).get("companyId", "")
    if not company_id:
        raise HTTPException(status_code=422, detail="companyId zorunlu")
    company_doc = await _own_company(user, company_id)
    _require_albert_genau_enabled(company_doc)
    b64 = (payload or {}).get("fileBase64", "")
    if not b64 or "," not in b64:
        raise HTTPException(status_code=422, detail="Geçersiz dosya verisi")
    try:
        file_bytes = base64.b64decode(b64.split(",", 1)[1])
    except Exception:
        raise HTTPException(status_code=422, detail="Dosya çözümlenemedi")
    if len(file_bytes) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Dosya çok büyük (maksimum 20MB)")
    new_price_list = _parse_ag_price_excel(file_bytes)
    existing = await db.albert_genau_config.find_one({"companyId": company_id}, {"_id": 0})
    default_doc = await db.albert_genau_config.find_one({"id": "default"}, {"_id": 0})
    base = existing or default_doc or ag_calc._DEFAULT_DATA
    updated_doc = {
        "companyId": company_id,
        "price_list": new_price_list,
        "depth_table": base["depth_table"],
        "belt_table": base["belt_table"],
        "updatedAt": utc_now_iso(),
        "updatedBy": user.get("email", ""),
    }
    await db.albert_genau_config.replace_one({"companyId": company_id}, updated_doc, upsert=True)
    return {"ok": True, "skuCount": len(new_price_list)}


@api_router.get("/albert-genau/export-package")
async def albert_genau_export_package(user=Depends(get_current_user)):
    # Bayi (dealer) paketi: bu uygulamayı satın alan yeni bir Albert Genau
    # bayisine, kendi kurulumuna yükleyebileceği taşınabilir bir JSON paketi
    # -- güncel fiyat listesi + derinlik/kayış tablolari + sistem tipi
    # tanimlari. Hesaplama formulleri (albert_genau_calc.py) pakette YER
    # ALMAZ -- onlar kod olarak zaten her kurulumda mevcuttur; sadece VERI
    # (fiyat/tablo) tasinir. Admin-only: bu, tek bir uretici icin paylasilan
    # resmi fiyat kitabidir.
    _require_admin(user)
    price_data = await _get_ag_price_data()
    base = price_data or ag_calc._DEFAULT_DATA
    return {
        "exportedAt": utc_now_iso(),
        "exportedBy": user.get("email", ""),
        "formatVersion": 1,
        "systemTypes": [{"id": t, "label": ag_calc.SYSTEM_TYPE_LABELS[t]} for t in ag_calc.SYSTEM_TYPES],
        "finishOptions": ag_calc.FINISH_OPTIONS,
        "priceList": base["price_list"],
        "depthTable": base["depth_table"],
        "beltTable": base["belt_table"],
    }


@api_router.get("/albert-genau/export-package.csv")
async def albert_genau_export_price_csv(user=Depends(get_current_user)):
    # Aynı fiyat listesinin insan-okunur CSV hali -- Excel'de acilip
    # incelenebilir/paylasilabilir (SKU, ad, birim, fiyat, agirlik).
    _require_admin(user)
    price_data = await _get_ag_price_data()
    base = price_data or ag_calc._DEFAULT_DATA
    lines = ["sku,ad,birim,fiyat,agirlik"]
    for sku, item in sorted(base["price_list"].items()):
        name = str(item.get("name", "")).replace('"', "'")
        unit = str(item.get("unit", "") or "")
        price = item.get("price", 0)
        weight = item.get("weight", "") if item.get("weight") is not None else ""
        lines.append(f'"{sku}","{name}","{unit}",{price},{weight}')
    csv_text = "\n".join(lines)
    return StreamingResponse(
        io.BytesIO(csv_text.encode("utf-8-sig")),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=albert-genau-fiyat-listesi.csv"},
    )


# ============ ZIP PERDE (bayi fiyat tablosu) ============
# Tek merkezi tablo (zip_perde_config, "id": "default"): admin tedarikcinin
# Excel'ini yukler, zipPerdeEnabled olan tum firmalar aninda yeni fiyatlari
# kullanir. Hesap/arama mantigi icin bkz. backend/zip_perde.py.
async def _get_zip_perde_table() -> Dict[str, Any]:
    doc = await db.zip_perde_config.find_one({"id": "default"}, {"_id": 0})
    if doc and doc.get("prices"):
        return doc
    return {**zip_perde.DEFAULT_TABLE, "source": "varsayilan"}


def _decode_excel_upload(payload: Dict[str, str]) -> bytes:
    b64 = (payload or {}).get("fileBase64", "")
    if not b64 or "," not in b64:
        raise HTTPException(status_code=422, detail="Geçersiz dosya verisi")
    try:
        file_bytes = base64.b64decode(b64.split(",", 1)[1])
    except Exception:
        raise HTTPException(status_code=422, detail="Dosya çözümlenemedi")
    if len(file_bytes) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Dosya çok büyük (maksimum 20MB)")
    return file_bytes


@api_router.get("/zip-perde/table")
async def zip_perde_table(companyId: str, user=Depends(get_current_user)):
    company_doc = await _own_company(user, companyId)
    _require_zip_perde_enabled(company_doc)
    t = await _get_zip_perde_table()
    return {k: t.get(k) for k in ("widths", "heights", "prices", "currency", "updatedAt")}


@api_router.get("/zip-perde/admin-status")
async def zip_perde_admin_status(user=Depends(get_current_user)):
    _require_admin(user)
    t = await _get_zip_perde_table()
    return {
        "exists": t.get("source") != "varsayilan",
        "source": "yüklenen Excel" if t.get("source") != "varsayilan" else "varsayılan (paket içinde)",
        "widths": t["widths"],
        "heights": t["heights"],
        "prices": t["prices"],
        "currency": t.get("currency", zip_perde.CURRENCY),
        "updatedAt": t.get("updatedAt"),
        "updatedBy": t.get("updatedBy"),
    }


@api_router.post("/zip-perde/admin-upload")
async def zip_perde_admin_upload(payload: Dict[str, str], user=Depends(get_current_user)):
    _require_admin(user)
    file_bytes = _decode_excel_upload(payload)
    try:
        parsed = zip_perde.parse_excel(file_bytes)
    except zip_perde.ZipPerdeTabloHatasi as e:
        raise HTTPException(status_code=422, detail=str(e))
    doc = {
        "id": "default",
        **parsed,
        "updatedAt": utc_now_iso(),
        "updatedBy": user.get("email", ""),
    }
    await db.zip_perde_config.replace_one({"id": "default"}, doc, upsert=True)
    return {"ok": True, "widthCount": len(parsed["widths"]), "heightCount": len(parsed["heights"]), "zamPct": parsed["zamPct"]}


# ============ COMPANY CATALOG FILES (hazır PDF/görsel katalog paylaşımı) ============
MAX_CATALOG_FILES_PER_COMPANY = 20


async def _send_catalog_file_email(to_email: str, from_company_name: str, file_name: str, mime: str, data_b64_content_only: str, message: str):
    if not RESEND_API_KEY:
        raise HTTPException(status_code=503, detail="E-posta gönderimi şu an kullanılamıyor")
    try:
        resp = await asyncio.to_thread(
            requests.post,
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
            json={
                "from": RESEND_FROM_EMAIL,
                "to": [to_email],
                "subject": f"{from_company_name} — Katalog",
                "html": (
                    "<div style=\"font-family:sans-serif;max-width:480px;margin:0 auto;\">"
                    f"<p><b>{esc(from_company_name)}</b> sizinle bir katalog dosyası paylaştı.</p>"
                    + (f"<p>{esc(message)}</p>" if message.strip() else "")
                    + "<p>Katalog dosyası bu e-postaya ek olarak iliştirilmiştir.</p>"
                    "</div>"
                ),
                "attachments": [
                    {"filename": file_name, "content": data_b64_content_only}
                ],
            },
            timeout=20,
        )
        if resp.status_code >= 400:
            logging.warning("[CatalogFile] resend send failed: %s %s", resp.status_code, resp.text[:300])
            raise HTTPException(status_code=502, detail="E-posta gönderilemedi")
    except HTTPException:
        raise
    except Exception:
        logging.warning("[CatalogFile] resend send exception", exc_info=True)
        raise HTTPException(status_code=502, detail="E-posta gönderilemedi")


@api_router.get("/company/{company_id}/catalog-files", response_model=List[CompanyCatalogFileOut])
async def list_catalog_files(company_id: str, user=Depends(get_current_user)):
    await _own_company(user, company_id)
    docs = await db.catalog_files.find(
        {"companyId": company_id, "userId": user["user_id"]},
        {"_id": 0, "dataBase64": 0},
    ).sort("createdAt", -1).to_list(200)
    return [CompanyCatalogFileOut(**d) for d in docs]


@api_router.post("/company/catalog-files", response_model=CompanyCatalogFileOut)
async def upload_catalog_file(payload: CompanyCatalogFileCreate, user=Depends(get_current_user)):
    await _own_company(user, payload.companyId)
    existing_count = await db.catalog_files.count_documents({"companyId": payload.companyId, "userId": user["user_id"]})
    if existing_count >= MAX_CATALOG_FILES_PER_COMPANY:
        raise HTTPException(status_code=400, detail=f"En fazla {MAX_CATALOG_FILES_PER_COMPANY} katalog dosyası yükleyebilirsiniz")

    header, _, b64_content = payload.dataBase64.partition(",")
    mime_match = re.match(r'^data:([^;]+);base64$', header)
    mime = mime_match.group(1) if mime_match else "application/octet-stream"
    try:
        decoded_size = len(base64.b64decode(b64_content, validate=False))
    except Exception:
        decoded_size = 0

    obj = CompanyCatalogFile(
        userId=user["user_id"], companyId=payload.companyId, name=payload.name,
        mime=mime, size=decoded_size, dataBase64=payload.dataBase64,
    )
    await db.catalog_files.insert_one(obj.dict())
    return CompanyCatalogFileOut(id=obj.id, companyId=obj.companyId, name=obj.name, mime=obj.mime, size=obj.size, createdAt=obj.createdAt)


@api_router.get("/company/catalog-files/{file_id}/download")
async def download_catalog_file(file_id: str, user=Depends(get_current_user)):
    doc = await db.catalog_files.find_one({"id": file_id, "userId": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Dosya bulunamadı")
    return {"id": doc["id"], "name": doc["name"], "mime": doc["mime"], "dataBase64": doc["dataBase64"]}


@api_router.delete("/company/catalog-files/{file_id}")
async def delete_catalog_file(file_id: str, user=Depends(get_current_user)):
    await db.catalog_files.delete_one({"id": file_id, "userId": user["user_id"]})
    return {"ok": True}


@api_router.post("/company/catalog-files/{file_id}/share-email")
async def share_catalog_file_email(file_id: str, payload: CatalogFileEmailShareRequest, user=Depends(get_current_user)):
    # Katalog dosyasi EK olarak rastgele bir adrese gonderiliyor; hiz siniri
    # olmadan bu uc bir spam rolesi haline gelir (bkz. invite_staff_member).
    _rate_limit(f"catalog-share:user:{user['user_id']}", 30, 3600)
    doc = await db.catalog_files.find_one({"id": file_id, "userId": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Dosya bulunamadı")
    company = await db.companies.find_one({"id": doc["companyId"], "userId": user["user_id"]}, {"_id": 0})
    company_name = (company or {}).get("sirketAdi") or "Firma"
    _, _, b64_content = doc["dataBase64"].partition(",")
    await _send_catalog_file_email(str(payload.toEmail), company_name, doc["name"], doc["mime"], b64_content, payload.message)
    return {"ok": True}


def _is_manager(user: Dict[str, Any]) -> bool:
    """Yönetici = firma sahibi ya da 'admin' rollü personel."""
    return not user.get("is_staff") or user.get("staff_role") == "admin"


def _require_manager(user: Dict[str, Any]):
    if not _is_manager(user):
        raise HTTPException(status_code=403, detail="Bu işlemi sadece yöneticiler yapabilir")


def _cust_keys(d: Dict[str, Any]) -> List[str]:
    """Bir tahsilat/kasa kaydının müşteri anahtarları: müşteri id'si ve
    (büyük/küçük harf duyarsız) müşteri adı -- biri boş olabilir."""
    keys = []
    if (d.get("customerId") or "").strip():
        keys.append("id:" + d["customerId"].strip())
    name = (d.get("musteriAdi") or "").strip().lower()
    if name:
        keys.append("ad:" + name)
    return keys


async def _tahsilat_owners(user: Dict[str, Any], company_id: str, entries: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Her tahsilat kaydının sorumlu personelini çözer.

    Sıra: kayıttaki personelId -> bağlı teklifi oluşturan kişi -> aynı
    müşterinin (id ya da ad) tek bir sahibi varsa o. Sahibi çözülemeyen
    kayıtları yalnız yöneticiler görür. Dönen sözlük:
    {"by_id": {entry_id: owner}, "by_key": {cust_key: set(owner)}}."""
    uid = user["user_id"]
    quote_ids = list({e["quoteId"] for e in entries if e.get("quoteId")})
    quote_owner: Dict[str, str] = {}
    if quote_ids:
        async for q in db.quotes.find({"userId": uid, "companyId": company_id, "id": {"$in": quote_ids}}, {"_id": 0, "id": 1, "createdByUserId": 1}):
            # Sahiplik kaydı olmayan eski teklifler firma sahibinindir.
            quote_owner[q["id"]] = q.get("createdByUserId") or uid
    by_id: Dict[str, str] = {}
    by_key: Dict[str, set] = {}
    for e in entries:
        owner = e.get("personelId") or (quote_owner.get(e["quoteId"], "") if e.get("quoteId") else "")
        if owner:
            by_id[e["id"]] = owner
            for k in _cust_keys(e):
                by_key.setdefault(k, set()).add(owner)
    for e in entries:
        if e["id"] in by_id:
            continue
        owners = set()
        for k in _cust_keys(e):
            owners |= by_key.get(k, set())
        if len(owners) == 1:
            by_id[e["id"]] = next(iter(owners))
    return {"by_id": by_id, "by_key": by_key}


async def _staff_visible_tahsilat(user: Dict[str, Any], company_id: str) -> List[Dict[str, Any]]:
    entries = await db.tahsilat.find({"companyId": company_id, "userId": user["user_id"]}, {"_id": 0}).to_list(5000)
    if _is_manager(user):
        return entries
    me = _self_id(user)
    by_id = (await _tahsilat_owners(user, company_id, entries))["by_id"]
    return [e for e in entries if by_id.get(e["id"]) == me]


def _can_see_quote(user: Dict[str, Any], doc: Dict[str, Any]) -> bool:
    """Kısıtlı personel yalnız kendi hazırladığı teklifleri görür; sahiplik
    kaydı olmayan eski teklifler firma sahibinindir."""
    return _is_manager(user) or (doc.get("createdByUserId") or user["user_id"]) == _self_id(user)


async def _require_quote_access(user: Dict[str, Any], quote_id: str):
    doc = await db.quotes.find_one({"id": quote_id, "userId": user["user_id"]}, {"_id": 0, "createdByUserId": 1})
    if doc and not _can_see_quote(user, doc):
        raise HTTPException(status_code=404, detail="Teklif bulunamadı")


async def _visible_customers(user: Dict[str, Any], company_id: str, docs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Kısıtlı personelin müşterileri: kendi eklediği, kendi teklif verdiği
    (firma adı ya da telefon eşleşmesi) ya da Tahsilat'ta ona ait olanlar."""
    if _is_manager(user):
        return docs
    me = _self_id(user)
    names, phones, ids = set(), set(), set()
    async for q in db.quotes.find({"userId": user["user_id"], "companyId": company_id, "createdByUserId": me}, {"_id": 0, "musFirma": 1, "musTelefon": 1}):
        if (q.get("musFirma") or "").strip():
            names.add(q["musFirma"].strip().lower())
        if (q.get("musTelefon") or "").strip():
            phones.add(q["musTelefon"].strip())
    for t in await _staff_visible_tahsilat(user, company_id):
        if t.get("customerId"):
            ids.add(t["customerId"])
        if (t.get("musteriAdi") or "").strip():
            names.add(t["musteriAdi"].strip().lower())
    return [
        c for c in docs
        if c.get("createdByUserId") == me or c.get("id") in ids
        or (c.get("firma") or "").strip().lower() in names
        or ((c.get("telefon") or "").strip() and c["telefon"].strip() in phones)
    ]


async def _require_customer_access(user: Dict[str, Any], doc: Dict[str, Any]):
    if not await _visible_customers(user, doc.get("companyId", ""), [doc]):
        raise HTTPException(status_code=404, detail="Customer not found")


# ============ KASA (GELİR/GİDER) ROUTES ============
@api_router.get("/kasa/{company_id}", response_model=List[KasaEntry])
async def list_kasa(company_id: str, user=Depends(get_current_user)):
    await _own_company(user, company_id)
    await _materialize_recurring(user["user_id"], company_id)
    docs = await db.kasa.find({"companyId": company_id, "userId": user["user_id"]}, {"_id": 0}).to_list(5000)
    if not _is_manager(user):
        # Kısıtlı personel firmanın kasasını görmez: yalnız kendi girdiği
        # gelir/giderler + kendi müşterilerinden yapılan tahsilatların gelirleri.
        me = _self_id(user)
        mine = {t["id"] for t in await _staff_visible_tahsilat(user, company_id)}
        docs = [d for d in docs if d.get("personelId") == me or (d.get("tahsilatId") and d["tahsilatId"] in mine)]
    return [KasaEntry(**d) for d in docs]


@api_router.post("/kasa", response_model=KasaEntry)
async def create_kasa_entry(payload: KasaEntryCreate, user=Depends(get_current_user)):
    await _own_company(user, payload.companyId)
    obj = KasaEntry(userId=user["user_id"], personelId="" if _is_manager(user) else _self_id(user), **payload.dict())
    await db.kasa.insert_one(obj.dict())
    return obj


@api_router.delete("/kasa/{entry_id}")
async def delete_kasa_entry(entry_id: str, user=Depends(get_current_user)):
    _require_manager(user)
    await db.kasa.delete_one({"id": entry_id, "userId": user["user_id"]})
    return {"ok": True}


# ---- Kasa ayarları: özel kategoriler + birden fazla kasa/banka hesabı ----
# Firma belgesine değil ayrı koleksiyona yazılıyor: /companies PUT tüm belgeyi
# CompanyCreate varsayılanlarıyla değiştirdiği için eski sürüm istemciler bu
# alanları sessizce sıfırlayabilirdi.
DEFAULT_KASA_HESAPLARI = ["Ana Kasa"]


class KasaSettings(BaseModel):
    companyId: str
    gelirKategorileri: List[str] = Field(default_factory=list)
    giderKategorileri: List[str] = Field(default_factory=list)
    hesaplar: List[str] = Field(default_factory=lambda: list(DEFAULT_KASA_HESAPLARI))


def _clean_names(items: List[str], limit: int = 50) -> List[str]:
    out: List[str] = []
    for x in items or []:
        x = (x or "").strip()[:40]
        if x and x not in out:
            out.append(x)
    return out[:limit]


@api_router.get("/kasa-settings/{company_id}", response_model=KasaSettings)
async def get_kasa_settings(company_id: str, user=Depends(get_current_user)):
    await _own_company(user, company_id)
    doc = await db.kasa_settings.find_one({"companyId": company_id, "userId": user["user_id"]}, {"_id": 0, "userId": 0})
    return KasaSettings(**(doc or {"companyId": company_id}))


@api_router.put("/kasa-settings", response_model=KasaSettings)
async def put_kasa_settings(payload: KasaSettings, user=Depends(get_current_user)):
    _require_manager(user)
    await _own_company(user, payload.companyId)
    obj = KasaSettings(
        companyId=payload.companyId,
        gelirKategorileri=_clean_names(payload.gelirKategorileri),
        giderKategorileri=_clean_names(payload.giderKategorileri),
        hesaplar=_clean_names(payload.hesaplar, 20) or list(DEFAULT_KASA_HESAPLARI),
    )
    await db.kasa_settings.update_one(
        {"companyId": payload.companyId, "userId": user["user_id"]},
        {"$set": {**obj.dict(), "userId": user["user_id"]}},
        upsert=True,
    )
    return obj


# ---- Tekrarlayan gelir/gider (kira, maaş, abonelik...) ----
# Kural her ay "gun" gününde bir Kasa kaydı üretir. Kayıtlar Kasa listesi
# istendiğinde tembel (lazy) olarak oluşturulur: arka planda cron gerekmez,
# (recurringId, tarih) çifti ile mükerrer kayıt engellenir.
class KasaRecurring(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    userId: str
    companyId: str
    tur: str  # "gelir" | "gider"
    kategori: str
    tutar: float = 0.0
    paraBirimi: str = "TRY"
    yontem: str = "Havale/EFT"
    notlar: str = ""
    hesap: str = "Ana Kasa"
    kdvOrani: float = 0.0
    gun: int = 1  # ayın kaçıncı günü (1-28)
    baslangic: str  # YYYY-MM-DD
    bitis: str = ""  # YYYY-MM-DD, boşsa süresiz
    aktif: bool = True
    createdAt: str = Field(default_factory=utc_now_iso)


class KasaRecurringCreate(BaseModel):
    companyId: str
    tur: str
    kategori: str
    tutar: float
    paraBirimi: str = "TRY"
    yontem: str = "Havale/EFT"
    notlar: str = ""
    hesap: str = "Ana Kasa"
    kdvOrani: float = 0.0
    gun: int = 1
    baslangic: str = ""
    bitis: str = ""


class KasaRecurringPatch(BaseModel):
    aktif: Optional[bool] = None
    tutar: Optional[float] = None
    bitis: Optional[str] = None


def _istanbul_today():
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("Europe/Istanbul")).date()
    except Exception:
        return (_utc() + timedelta(hours=3)).date()


def _recurring_due_dates(rule: Dict[str, Any], today) -> List[str]:
    """Kuralın bugüne kadar (dahil) vadesi gelmiş ay tarihleri (YYYY-MM-DD), en fazla son 36 ay."""
    try:
        start = datetime.strptime(rule["baslangic"], "%Y-%m-%d").date()
    except Exception:
        return []
    end = today
    if rule.get("bitis"):
        try:
            end = min(end, datetime.strptime(rule["bitis"], "%Y-%m-%d").date())
        except Exception:
            pass
    gun = max(1, min(28, int(rule.get("gun") or 1)))
    out: List[str] = []
    # Çok eski bir başlangıç tarihi girilse bile en fazla ~3 yıl geriye gidilir.
    floor = today.replace(year=today.year - 3, day=1)
    y, m = (start.year, start.month) if start >= floor else (floor.year, floor.month)
    while True:
        d = datetime(y, m, gun).date()
        if d > end:
            break
        if d >= start:
            out.append(d.isoformat())
        m += 1
        if m > 12:
            y, m = y + 1, 1
    return out[-36:]


async def _materialize_recurring(user_id: str, company_id: str) -> int:
    today = _istanbul_today()
    created = 0
    rules = await db.kasa_recurring.find({"userId": user_id, "companyId": company_id, "aktif": True}, {"_id": 0}).to_list(200)
    for r in rules:
        for tarih in _recurring_due_dates(r, today):
            if await db.kasa.find_one({"userId": user_id, "recurringId": r["id"], "tarih": tarih}, {"_id": 1}):
                continue
            entry = KasaEntry(
                userId=user_id, companyId=company_id, tur=r["tur"], kategori=r["kategori"], tutar=r["tutar"],
                paraBirimi=r.get("paraBirimi", "TRY"), yontem=r.get("yontem", "Havale/EFT"),
                notlar=r.get("notlar") or "Tekrarlayan", tarih=tarih, hesap=r.get("hesap", "Ana Kasa"),
                kdvOrani=r.get("kdvOrani", 0.0), recurringId=r["id"],
            )
            await db.kasa.insert_one(entry.dict())
            created += 1
    return created


@api_router.get("/kasa-recurring/{company_id}", response_model=List[KasaRecurring])
async def list_kasa_recurring(company_id: str, user=Depends(get_current_user)):
    _require_manager(user)
    await _own_company(user, company_id)
    docs = await db.kasa_recurring.find({"companyId": company_id, "userId": user["user_id"]}, {"_id": 0}).to_list(200)
    return [KasaRecurring(**d) for d in docs]


@api_router.post("/kasa-recurring", response_model=KasaRecurring)
async def create_kasa_recurring(payload: KasaRecurringCreate, user=Depends(get_current_user)):
    _require_manager(user)
    await _own_company(user, payload.companyId)
    if payload.tur not in ("gelir", "gider"):
        raise HTTPException(status_code=422, detail="Tür gelir veya gider olmalı")
    if payload.tutar <= 0:
        raise HTTPException(status_code=422, detail="Tutar sıfırdan büyük olmalı")
    data = payload.dict()
    data["gun"] = max(1, min(28, int(data.get("gun") or 1)))
    data["baslangic"] = data.get("baslangic") or _istanbul_today().isoformat()
    obj = KasaRecurring(userId=user["user_id"], **data)
    await db.kasa_recurring.insert_one(obj.dict())
    await _materialize_recurring(user["user_id"], payload.companyId)
    return obj


@api_router.patch("/kasa-recurring/{rule_id}", response_model=KasaRecurring)
async def patch_kasa_recurring(rule_id: str, payload: KasaRecurringPatch, user=Depends(get_current_user)):
    _require_manager(user)
    doc = await db.kasa_recurring.find_one({"id": rule_id, "userId": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Kural bulunamadı")
    patch = {k: v for k, v in payload.dict().items() if v is not None}
    await db.kasa_recurring.update_one({"id": rule_id, "userId": user["user_id"]}, {"$set": patch})
    doc.update(patch)
    return KasaRecurring(**doc)


@api_router.delete("/kasa-recurring/{rule_id}")
async def delete_kasa_recurring(rule_id: str, user=Depends(get_current_user)):
    _require_manager(user)
    # Kural silinir; geçmişte oluşturduğu Kasa kayıtları yerinde kalır.
    await db.kasa_recurring.delete_one({"id": rule_id, "userId": user["user_id"]})
    return {"ok": True}


# ============ TAHSILAT (ALACAK/BORÇ) ROUTES ============
@api_router.get("/tahsilat/{company_id}", response_model=List[TahsilatEntry])
async def list_tahsilat(company_id: str, user=Depends(get_current_user)):
    await _own_company(user, company_id)
    return [TahsilatEntry(**d) for d in await _staff_visible_tahsilat(user, company_id)]


@api_router.post("/tahsilat", response_model=TahsilatEntry)
async def create_tahsilat_entry(payload: TahsilatEntryCreate, user=Depends(get_current_user)):
    await _own_company(user, payload.companyId)
    personel_id = ""
    if not _is_manager(user):
        # Personel yalnız kendi müşterisine (ya da henüz kimsenin olmayan yeni
        # bir müşteriye) kayıt girebilir; başka personelin müşterisine değil.
        me = _self_id(user)
        entries = await db.tahsilat.find({"companyId": payload.companyId, "userId": user["user_id"]}, {"_id": 0}).to_list(5000)
        by_key = (await _tahsilat_owners(user, payload.companyId, entries))["by_key"]
        owners = set()
        for k in _cust_keys(payload.dict()):
            owners |= by_key.get(k, set())
        if owners and me not in owners:
            raise HTTPException(status_code=403, detail="Bu müşteri size atanmamış; kaydı bir yönetici girebilir")
        personel_id = me
    obj = TahsilatEntry(userId=user["user_id"], personelId=personel_id, **payload.dict())
    await db.tahsilat.insert_one(obj.dict())

    # Müşteriden gerçekten para geldiğinde ("tahsilat" kaydı) bu tutar Kasa'ya
    # da otomatik "gelir" olarak işlenir — kullanıcı ayrıca Kasa'ya elle girmek
    # zorunda kalmasın. Sadece "borc" (henüz tahsil edilmemiş alacak) kayıtları
    # Kasa'yı etkilemez.
    if obj.tur == "tahsilat" and obj.tutar > 0:
        kasa_doc = KasaEntry(
            userId=user["user_id"],
            companyId=obj.companyId,
            tur="gelir",
            kategori="Tahsilat",
            tutar=obj.tutar,
            paraBirimi=obj.paraBirimi,
            yontem=obj.yontem,
            notlar=f"{obj.musteriAdi} - tahsilat" + (f" ({obj.notlar})" if obj.notlar else ""),
            tarih=obj.tarih,
            tahsilatId=obj.id,
            kurTRY=obj.kurTRY,
            personelId=obj.personelId,
            customerId=obj.customerId,
            musteriAdi=obj.musteriAdi,
        )
        await db.kasa.insert_one(kasa_doc.dict())

    return obj


@api_router.delete("/tahsilat/{entry_id}")
async def delete_tahsilat_entry(entry_id: str, user=Depends(get_current_user)):
    _require_manager(user)
    # Bu tahsilat kaydından otomatik oluşturulmuş bir Kasa geliri varsa, kaydı
    # silerken onu da temizle (yanlış girilen bir tahsilat Kasa'da asılı kalmasın).
    await db.kasa.delete_many({"userId": user["user_id"], "tahsilatId": entry_id})
    await db.tahsilat.delete_one({"id": entry_id, "userId": user["user_id"]})
    return {"ok": True}


# ============ CUSTOMER ROUTES ============
@api_router.get("/customers/{company_id}", response_model=List[Customer])
async def list_customers(company_id: str, user=Depends(get_current_user)):
    await _own_company(user, company_id)
    docs = await db.customers.find({"companyId": company_id, "userId": user["user_id"]}, {"_id": 0}).to_list(2000)
    return [Customer(**d) for d in await _visible_customers(user, company_id, docs)]


@api_router.post("/customers", response_model=Customer)
async def create_customer(payload: CustomerCreate, user=Depends(get_current_user)):
    await _own_company(user, payload.companyId)
    existing = await db.customers.find_one(
        {"companyId": payload.companyId, "firma": payload.firma, "userId": user["user_id"]}, {"_id": 0}
    )
    if existing:
        if not await _visible_customers(user, payload.companyId, [existing]):
            raise HTTPException(status_code=409, detail="Bu isimde bir müşteri başka bir personelde kayıtlı; yöneticinize başvurun")
        updated = {**existing, **payload.dict(exclude_none=True)}
        await db.customers.replace_one({"id": existing["id"], "userId": user["user_id"]}, updated)
        return Customer(**updated)
    obj = Customer(userId=user["user_id"], createdByUserId=_self_id(user), **payload.dict(exclude_none=True))
    await db.customers.insert_one(obj.dict())
    return obj


class CustomerBulkRow(BaseModel):
    firma: str
    yetkili: str = ""
    telefon: str = ""
    email: str = ""
    adres: str = ""


class CustomerBulkRequest(BaseModel):
    companyId: str
    customers: List[CustomerBulkRow]


class CustomerBulkResult(BaseModel):
    created: int = 0
    updated: int = 0
    skipped: int = 0


@api_router.post("/customers/bulk", response_model=CustomerBulkResult)
async def bulk_import_customers(payload: CustomerBulkRequest, user=Depends(get_current_user)):
    """Excel/CSV'den müşteri aktarımı. Aynı firma adı varsa günceller; ama
    dosyadaki BOŞ hücreler mevcut dolu alanları silmez (yalnızca dolu
    hücreler üzerine yazılır)."""
    await _own_company(user, payload.companyId)
    if len(payload.customers) > 3000:
        raise HTTPException(status_code=413, detail="Tek seferde en fazla 3000 müşteri aktarılabilir")
    res = CustomerBulkResult()
    seen = set()
    for row in payload.customers:
        firma = (row.firma or "").strip()[:200]
        key = firma.casefold()
        if not firma or key in seen:
            res.skipped += 1
            continue
        seen.add(key)
        fields = {k: (getattr(row, k) or "").strip()[:500] for k in ("yetkili", "telefon", "email", "adres")}
        existing = await db.customers.find_one(
            {"companyId": payload.companyId, "firma": firma, "userId": user["user_id"]}, {"_id": 0}
        )
        if existing:
            if not await _visible_customers(user, payload.companyId, [existing]):
                res.skipped += 1
                continue
            patch = {k: v for k, v in fields.items() if v}
            if patch:
                await db.customers.update_one({"id": existing["id"], "userId": user["user_id"]}, {"$set": patch})
                res.updated += 1
            else:
                res.skipped += 1
            continue
        obj = Customer(userId=user["user_id"], companyId=payload.companyId, firma=firma, createdByUserId=_self_id(user), **fields)
        await db.customers.insert_one(obj.dict())
        res.created += 1
    return res


@api_router.put("/customers/{customer_id}", response_model=Customer)
async def update_customer(customer_id: str, payload: CustomerCreate, user=Depends(get_current_user)):
    await _own_company(user, payload.companyId)
    existing = await db.customers.find_one({"id": customer_id, "userId": user["user_id"]}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Customer not found")
    await _require_customer_access(user, existing)
    updated = {**existing, **payload.dict(exclude_none=True)}
    await db.customers.replace_one({"id": customer_id, "userId": user["user_id"]}, updated)
    return Customer(**updated)


@api_router.delete("/customers/{customer_id}")
async def delete_customer(customer_id: str, user=Depends(get_current_user)):
    doc = await db.customers.find_one({"id": customer_id, "userId": user["user_id"]}, {"_id": 0})
    if doc:
        await _require_customer_access(user, doc)
    await db.customers.delete_one({"id": customer_id, "userId": user["user_id"]})
    return {"ok": True}


# ============ SERVICE ROUTES (Servis & Garanti) ============
@api_router.get("/services/{company_id}", response_model=List[Service])
async def list_services(company_id: str, user=Depends(get_current_user)):
    await _own_company(user, company_id)
    docs = await db.services.find({"companyId": company_id, "userId": user["user_id"]}, {"_id": 0}).sort("createdAt", -1).to_list(2000)
    return [Service(**d) for d in docs]


@api_router.post("/services", response_model=Service)
async def create_service(payload: ServiceCreate, user=Depends(get_current_user)):
    await _own_company(user, payload.companyId)
    obj = Service(userId=user["user_id"], **payload.dict())
    await db.services.insert_one(obj.dict())
    return obj


@api_router.put("/services/{service_id}", response_model=Service)
async def update_service(service_id: str, payload: ServiceCreate, user=Depends(get_current_user)):
    await _own_company(user, payload.companyId)
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
    await _own_company(user, company_id)
    docs = await db.campaigns.find({"companyId": company_id, "userId": user["user_id"]}, {"_id": 0}).sort("createdAt", -1).to_list(2000)
    return [Campaign(**d) for d in docs]


@api_router.post("/campaigns", response_model=Campaign)
async def create_campaign(payload: CampaignCreate, user=Depends(get_current_user)):
    await _own_company(user, payload.companyId)
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


# ============ MANUAL REMINDER ROUTES (Takvim -- serbest not/hatırlatıcı) ============
@api_router.get("/reminders/{company_id}", response_model=List[ManualReminder])
async def list_manual_reminders(company_id: str, user=Depends(get_current_user)):
    await _own_company(user, company_id)
    docs = await db.manual_reminders.find({"companyId": company_id, "userId": user["user_id"]}, {"_id": 0}).sort("tarih", 1).to_list(2000)
    return [ManualReminder(**d) for d in docs]


@api_router.post("/reminders", response_model=ManualReminder)
async def create_manual_reminder(payload: ManualReminderCreate, user=Depends(get_current_user)):
    await _own_company(user, payload.companyId)
    obj = ManualReminder(userId=user["user_id"], **payload.dict())
    await db.manual_reminders.insert_one(obj.dict())
    return obj


@api_router.patch("/reminders/{reminder_id}", response_model=ManualReminder)
async def update_manual_reminder(reminder_id: str, payload: ManualReminderUpdate, user=Depends(get_current_user)):
    doc = await db.manual_reminders.find_one({"id": reminder_id, "userId": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Hatırlatıcı bulunamadı")
    updates = {k: v for k, v in payload.dict().items() if v is not None}
    doc.update(updates)
    doc["updatedAt"] = utc_now_iso()
    await db.manual_reminders.replace_one({"id": reminder_id, "userId": user["user_id"]}, doc)
    return ManualReminder(**doc)


@api_router.delete("/reminders/{reminder_id}")
async def delete_manual_reminder(reminder_id: str, user=Depends(get_current_user)):
    await db.manual_reminders.delete_one({"id": reminder_id, "userId": user["user_id"]})
    return {"ok": True}


# ============ QUOTE ROUTES ============
@api_router.get("/quotes/{company_id}", response_model=List[Quote])
async def list_quotes(company_id: str, user=Depends(get_current_user)):
    await _own_company(user, company_id)
    docs = await db.quotes.find(
        {"companyId": company_id, "userId": user["user_id"], "deletedAt": None}, {"_id": 0}
    ).sort("createdAt", -1).to_list(2000)
    return [Quote(**d) for d in docs if _can_see_quote(user, d)]


@api_router.post("/quotes", response_model=Quote)
async def create_quote(payload: QuoteCreate, user=Depends(get_current_user)):
    await _own_company(user, payload.companyId)
    await _enforce_and_increment_quota(user)
    data = payload.dict()
    items = [QuoteItem(**it) if isinstance(it, dict) else it for it in data.get("items", [])]
    data["items"] = [it.dict() for it in items]
    subtotal, iskontoTutar, kdvTutar, genelToplam = compute_totals(items, data["iskonto"], data["kdvOrani"])
    data["araToplam"] = subtotal - iskontoTutar
    data["iskontoTutar"] = iskontoTutar
    data["kdvTutar"] = kdvTutar
    data["genelToplam"] = genelToplam
    data["createdByUserId"] = _self_id(user)
    data["createdByEmail"] = _actor_email(user)
    data["createdByName"] = _actor_name(user)
    data["kuponKodu"] = (data.get("kuponKodu") or "").strip().upper()[:40]
    obj = Quote(userId=user["user_id"], **data)
    await db.quotes.insert_one(obj.dict())
    if obj.kuponKodu:
        await _consume_coupon(user, obj.companyId, obj.kuponKodu)
    _event_quote_created(user, obj.dict())
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
            new_c = Customer(createdByUserId=_self_id(user), **payload_c)
            await db.customers.insert_one(new_c.dict())
    return obj


@api_router.get("/quotes/edit-requests/list", response_model=List[QuoteEditRequest])
async def list_quote_edit_requests(user=Depends(get_current_user)):
    """Şu anki gerçek kullanıcının hem gönderdiği hem de kendisine gelen
    (onaylaması gereken) teklif düzenleme isteklerini döner -- frontend
    ikisini de tek çağrıyla alıp ayırt eder (requestedByUserId/approverUserId
    kendi id'siyle karşılaştırılarak)."""
    actor_id = _self_id(user)
    docs = await db.quote_edit_requests.find(
        {"ownerUserId": user["user_id"], "$or": [{"approverUserId": actor_id}, {"requestedByUserId": actor_id}]},
        {"_id": 0},
    ).sort("createdAt", -1).to_list(200)
    return [QuoteEditRequest(**d) for d in docs]


@api_router.post("/quotes/{quote_id}/edit-requests", response_model=QuoteEditRequest)
async def create_quote_edit_request(quote_id: str, user=Depends(get_current_user)):
    await _require_quote_access(user, quote_id)
    doc = await db.quotes.find_one({"id": quote_id, "userId": user["user_id"], "deletedAt": None}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Quote not found")
    actor_id = _self_id(user)
    creator_id = doc.get("createdByUserId") or ""
    if not creator_id or creator_id == actor_id:
        raise HTTPException(400, "Bu teklif için onay isteğine gerek yok, doğrudan düzenleyebilirsiniz")
    existing = await db.quote_edit_requests.find_one(
        {"quoteId": quote_id, "requestedByUserId": actor_id, "status": "pending"}, {"_id": 0}
    )
    if existing:
        return QuoteEditRequest(**existing)
    reqobj = QuoteEditRequest(
        quoteId=quote_id,
        companyId=doc.get("companyId", ""),
        ownerUserId=user["user_id"],
        requestedByUserId=actor_id,
        requestedByEmail=_actor_email(user),
        requestedByName=_actor_name(user),
        approverUserId=creator_id,
        approverEmail=doc.get("createdByEmail", ""),
        teklifNo=doc.get("teklifNo", ""),
        musFirma=doc.get("musFirma", ""),
    )
    await db.quote_edit_requests.insert_one(reqobj.dict())
    return reqobj


@api_router.post("/quotes/edit-requests/{request_id}/respond", response_model=QuoteEditRequest)
async def respond_quote_edit_request(request_id: str, payload: QuoteEditRequestRespond, user=Depends(get_current_user)):
    actor_id = _self_id(user)
    doc = await db.quote_edit_requests.find_one({"id": request_id, "ownerUserId": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "İstek bulunamadı")
    if doc.get("approverUserId") != actor_id:
        raise HTTPException(403, "Bu isteği yalnızca teklifi oluşturan kişi yanıtlayabilir")
    if doc.get("status") != "pending":
        raise HTTPException(400, "Bu istek zaten yanıtlanmış")
    doc["status"] = "approved" if payload.approve else "denied"
    doc["resolvedAt"] = utc_now_iso()
    await db.quote_edit_requests.replace_one({"id": request_id}, doc)
    return QuoteEditRequest(**doc)


@api_router.put("/quotes/{quote_id}", response_model=Quote)
async def update_quote(quote_id: str, payload: QuoteCreate, user=Depends(get_current_user)):
    await _require_quote_access(user, quote_id)
    await _own_company(user, payload.companyId)
    doc = await db.quotes.find_one({"id": quote_id, "userId": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Quote not found")

    actor_id = _self_id(user)
    creator_id = doc.get("createdByUserId") or ""
    if not creator_id:
        # Bu özellikten önce oluşturulmuş eski bir teklif -- sahiplik kaydı
        # yok, geriye dönük olarak ilk düzenleyeni sahip say (kimseyi kilitli
        # bırakmamak için) ve buradan sonra normal kurala tabi olsun.
        doc["createdByUserId"] = actor_id
        doc["createdByEmail"] = _actor_email(user)
        doc["createdByName"] = _actor_name(user)
    elif creator_id != actor_id:
        approved = await db.quote_edit_requests.find_one(
            {"quoteId": quote_id, "requestedByUserId": actor_id, "status": "approved"}, {"_id": 0}
        )
        if not approved:
            raise HTTPException(
                status_code=403,
                detail=f"Bu teklifi yalnızca oluşturan kişi ({doc.get('createdByEmail') or doc.get('createdByName') or 'ilgili kullanıcı'}) düzenleyebilir. Düzenlemek için ondan onay isteyin.",
            )
        # Onay tek kullanımlık: bu düzenleme kaydedilince tüketilir, bir
        # sonraki düzenleme için tekrar onay istenmesi gerekir.
        await db.quote_edit_requests.delete_one({"id": approved["id"]})

    data = payload.dict()
    items = [QuoteItem(**it) if isinstance(it, dict) else it for it in data.get("items", [])]
    data["items"] = [it.dict() for it in items]
    subtotal, iskontoTutar, kdvTutar, genelToplam = compute_totals(items, data["iskonto"], data["kdvOrani"])
    data["araToplam"] = subtotal - iskontoTutar
    data["iskontoTutar"] = iskontoTutar
    data["kdvTutar"] = kdvTutar
    data["genelToplam"] = genelToplam
    data["updatedAt"] = utc_now_iso()
    data["kuponKodu"] = (data.get("kuponKodu") or "").strip().upper()[:40]
    updated = {**doc, **data}
    await db.quotes.replace_one({"id": quote_id, "userId": user["user_id"]}, updated)
    if data["kuponKodu"] and data["kuponKodu"] != (doc.get("kuponKodu") or ""):
        await _consume_coupon(user, payload.companyId, data["kuponKodu"])
    return Quote(**updated)


@api_router.patch("/quotes/{quote_id}/status", response_model=Quote)
async def update_quote_status(quote_id: str, payload: QuoteStatusUpdate, user=Depends(get_current_user)):
    await _require_quote_access(user, quote_id)
    doc = await db.quotes.find_one({"id": quote_id, "userId": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Quote not found")
    previous_durum = doc.get("durum")
    # Onaylı bir teklifi reddetmek, o teklife bağlı Tahsilat borcunu da iptal
    # ediyor -- bu geri alınamaz bir mali işlem olduğu için sadece firma
    # sahibi yapabilir, hiçbir personel (admin rollü olsa bile) yapamaz.
    if previous_durum == "Onaylandı" and payload.durum == "Reddedildi" and user.get("is_staff"):
        raise HTTPException(status_code=403, detail="Onaylı bir teklifi sadece firma sahibi reddedebilir")
    doc["durum"] = payload.durum
    doc["updatedAt"] = utc_now_iso()
    if payload.durum == "Onaylandı" and not doc.get("approvedAt"):
        doc["approvedAt"] = doc["updatedAt"]
    # Stok: onaylanınca katalogdaki stok takipli ürünlerden düş; onaydan
    # çıkınca (Reddedildi/Beklemede) geri ekle.
    if payload.durum == "Onaylandı" and not doc.get("stokDusuldu"):
        doc["stokDusuldu"] = await _apply_quote_stock(user, doc, -1)
    elif payload.durum != "Onaylandı" and doc.get("stokDusuldu"):
        await _apply_quote_stock(user, doc, +1)
        doc["stokDusuldu"] = False
    await db.quotes.replace_one({"id": quote_id, "userId": user["user_id"]}, doc)
    if payload.durum == "Onaylandı" and previous_durum != "Onaylandı":
        _event_quote_approved(user, doc)

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

            entry_cur = doc.get("paraBirimi") or "TRY"
            entry_kur = 0.0
            if entry_cur != "TRY":
                try:
                    rates_now = await get_rates()
                    entry_kur = float((rates_now.usd_try if entry_cur == "USD" else rates_now.eur_try) or 0)
                except Exception:
                    entry_kur = 0.0

            tahsilat_doc = TahsilatEntry(
                userId=user["user_id"],
                companyId=doc.get("companyId"),
                customerId=matched_customer_id,
                musteriAdi=mus_firma or doc.get("musYetkili") or "Müşteri",
                musteriTelefon=mus_telefon,
                tur="borc",
                tutar=float(doc.get("genelToplam") or 0),
                paraBirimi=entry_cur,
                yontem="Diğer",
                vadeTarihi="",
                notlar=f"Teklif {doc.get('teklifNo', '')} onaylandı (otomatik oluşturuldu)",
                tarih=utc_now_iso()[:10],
                quoteId=quote_id,
                kurTRY=entry_kur,
                # Müşteri, teklifi hazırlayan personelin (yoksa onaylayanın).
                personelId=doc.get("createdByUserId") or _self_id(user),
            )
            await db.tahsilat.insert_one(tahsilat_doc.model_dump())
        # NOT: Onay anında Kasa'ya gelir YAZILMAZ — teklif tutarı henüz tahsil
        # edilmiş değil, sadece müşteri carisine borç işlenir. Kasa'ya gelir,
        # müşteriden gerçekten para geldiğinde (Tahsilat ekranından "tahsilat"
        # kaydı girildiğinde, bkz. create_tahsilat_entry) otomatik eklenir.

    # Onayın tam tersi: teklif "Reddedildi" durumuna geçerse, bu teklife bağlı
    # TÜM Tahsilat kayıtlarını iptal et (sil) -- hem otomatik oluşan borç
    # (tur="borc") hem de kullanıcının bu teklif için elle girdiği gerçek
    # ödeme kayıtları (tur="tahsilat"). Gerçek bir ödeme kaydı Kasa'ya da bir
    # gelir satırı yazmış olabilir (bkz. create_tahsilat_entry) -- yanlışlıkla
    # onaylanan bir teklif reddedilince bu kasa kaydı da asılı kalmasın diye
    # önce ilişkili tahsilat id'lerini bulup buna bağlı Kasa satırlarını, sonra
    # da tahsilat kayıtlarının kendisini siliyoruz. Teklif hiç onaylanmadıysa
    # zaten böyle bir kayıt yoktur, hiçbir şey silinmez.
    if payload.durum == "Reddedildi" and previous_durum != "Reddedildi":
        linked_tahsilat_ids = [
            t["id"] async for t in db.tahsilat.find(
                {"userId": user["user_id"], "quoteId": quote_id}, {"_id": 0, "id": 1}
            )
        ]
        if linked_tahsilat_ids:
            await db.kasa.delete_many({
                "userId": user["user_id"],
                "tahsilatId": {"$in": linked_tahsilat_ids},
            })
        await db.kasa.delete_many({
            "userId": user["user_id"],
            "quoteId": quote_id,
        })
        await db.tahsilat.delete_many({
            "userId": user["user_id"],
            "quoteId": quote_id,
        })

    return Quote(**doc)


def _recompute_quote_maliyet(doc: Dict[str, Any]) -> None:
    """Quote.maliyet toplamini, kalem bazli girilen maliyetler (items[].maliyet)
    ile kaleme bagli olmayan serbest ek maliyet satirlarinin (ekstraMaliyetler --
    kullanicinin dogrudan acikama+fiyat olarak ekledigi nakliye/iscilik vb.
    satirlar) toplami olarak yeniden hesaplar. Hicbiri girilmemisse maliyet
    opsiyonel kabul edilip None birakilir."""
    items = doc.get("items", [])
    entered_item_costs = [it.get("maliyet") for it in items if it.get("maliyet") is not None]
    ekstra_raw = doc.get("ekstraMaliyetler") or []
    ekstra = [e for e in ekstra_raw if (e.get("aciklama") or "").strip() or (e.get("tutar") or 0)]
    if entered_item_costs or ekstra:
        doc["maliyet"] = sum(entered_item_costs) + sum((e.get("tutar") or 0) for e in ekstra)
    else:
        doc["maliyet"] = None


@api_router.patch("/quotes/{quote_id}/maliyet", response_model=Quote)
async def update_quote_maliyet(quote_id: str, payload: QuoteMaliyetUpdate, user=Depends(get_current_user)):
    """Teklif verildikten sonra girilen isteğe bağlı maliyet -- kar hesabı için.
    Zorunlu değil: null gönderilirse maliyet temizlenmiş sayılır."""
    await _require_quote_access(user, quote_id)
    doc = await db.quotes.find_one({"id": quote_id, "userId": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Quote not found")
    doc["maliyet"] = payload.maliyet
    doc["updatedAt"] = utc_now_iso()
    await db.quotes.replace_one({"id": quote_id, "userId": user["user_id"]}, doc)
    return Quote(**doc)


@api_router.patch("/quotes/{quote_id}/item-maliyet", response_model=Quote)
async def update_quote_item_maliyet(quote_id: str, payload: QuoteItemMaliyetUpdate, user=Depends(get_current_user)):
    """Kullanıcı "hangi kalemden ne kadar maliyeti oldu" diye tek tek
    girebilsin diye eklendi -- her kalemin kendi maliyet alanını günceller ve
    üstteki Quote.maliyet toplamını, en az bir kalemde değer varsa
    kalemlerin toplamı olacak şekilde otomatik yeniden hesaplar (eski
    tek-kutulu update_quote_maliyet ile de hâlâ elle geçersiz kılınabilir)."""
    await _require_quote_access(user, quote_id)
    doc = await db.quotes.find_one({"id": quote_id, "userId": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Quote not found")
    items = doc.get("items", [])
    found = False
    for it in items:
        if it.get("id") == payload.itemId:
            it["maliyet"] = payload.maliyet
            found = True
            break
    if not found:
        raise HTTPException(404, "Quote item not found")
    doc["items"] = items
    _recompute_quote_maliyet(doc)
    doc["updatedAt"] = utc_now_iso()
    await db.quotes.replace_one({"id": quote_id, "userId": user["user_id"]}, doc)
    return Quote(**doc)


@api_router.patch("/quotes/{quote_id}/ekstra-maliyet", response_model=Quote)
async def update_quote_ekstra_maliyet(quote_id: str, payload: QuoteEkstraMaliyetUpdate, user=Depends(get_current_user)):
    """Kullanıcının teklif kalemlerine bağlı olmadan, doğrudan serbestçe
    "açıklama + fiyat" girip ekleyip çıkarabildiği ek maliyet satırları
    (örn. nakliye, ekstra işçilik). Kalem bazlı maliyetlerin
    (update_quote_item_maliyet) yerine değil yanına eklenir -- her ikisi de
    _recompute_quote_maliyet ile toplama dahil edilir. İstek her seferinde
    güncel listenin tamamını gönderir, biz de olduğu gibi yerine yazarız."""
    await _require_quote_access(user, quote_id)
    doc = await db.quotes.find_one({"id": quote_id, "userId": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Quote not found")
    doc["ekstraMaliyetler"] = [e.dict() for e in payload.ekstraMaliyetler]
    _recompute_quote_maliyet(doc)
    doc["updatedAt"] = utc_now_iso()
    await db.quotes.replace_one({"id": quote_id, "userId": user["user_id"]}, doc)
    return Quote(**doc)


@api_router.delete("/quotes/{quote_id}")
async def delete_quote(quote_id: str, user=Depends(get_current_user)):
    """Soft delete — moves the quote to the trash instead of erasing it, so an
    accidental delete can be undone within QUOTE_TRASH_RETENTION_DAYS days.

    A quote that already has real money movement recorded against it in
    Tahsilat (tur="tahsilat" -- an actual payment received/given, as opposed
    to the auto-generated "borc" receivable) cannot be deleted directly: the
    person must go delete those payment records first. This prevents a quote
    from disappearing out from under real cash-flow history. The auto-created
    "borc" entry (if any, and not yet paid) is just an unpaid receivable with
    no real money moved yet, so it's safe to clean up automatically here.
    """
    await _require_quote_access(user, quote_id)
    has_real_payment = await db.tahsilat.find_one(
        {"userId": user["user_id"], "quoteId": quote_id, "tur": "tahsilat"}
    )
    if has_real_payment:
        raise HTTPException(
            status_code=400,
            detail="Bu teklife bağlı Tahsilat kaydı var. Önce Tahsilat sayfasından bu teklifle ilgili ödeme kayıtlarını silmelisiniz.",
        )
    result = await db.quotes.update_one(
        {"id": quote_id, "userId": user["user_id"], "deletedAt": None},
        {"$set": {"deletedAt": utc_now_iso()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Teklif bulunamadı")
    # No real payment against this quote -- safe to drop the auto-generated
    # unpaid debt record too, so it doesn't linger in Tahsilat referencing a
    # now-deleted quote.
    await db.tahsilat.delete_many(
        {"userId": user["user_id"], "quoteId": quote_id, "tur": "borc"}
    )
    return {"ok": True}


async def _purge_expired_quote_trash(user_id: str):
    cutoff = utc_now() - timedelta(days=QUOTE_TRASH_RETENTION_DAYS)
    trashed = await db.quotes.find(
        {"userId": user_id, "deletedAt": {"$exists": True, "$ne": None}}, {"_id": 0, "id": 1, "deletedAt": 1}
    ).to_list(2000)
    expired_ids = []
    for d in trashed:
        try:
            da = datetime.fromisoformat(d["deletedAt"])
            if da.tzinfo is None:
                da = da.replace(tzinfo=timezone.utc)
            if da < cutoff:
                expired_ids.append(d["id"])
        except Exception:
            continue
    if expired_ids:
        await db.quotes.delete_many({"userId": user_id, "id": {"$in": expired_ids}})


@api_router.get("/quotes/{company_id}/trash", response_model=List[Quote])
async def list_trashed_quotes(company_id: str, user=Depends(get_current_user)):
    await _own_company(user, company_id)
    await _purge_expired_quote_trash(user["user_id"])
    docs = await db.quotes.find(
        {"companyId": company_id, "userId": user["user_id"], "deletedAt": {"$exists": True, "$ne": None}}, {"_id": 0}
    ).sort("deletedAt", -1).to_list(2000)
    return [Quote(**d) for d in docs if _can_see_quote(user, d)]


@api_router.post("/quotes/{quote_id}/restore", response_model=Quote)
async def restore_quote(quote_id: str, user=Depends(get_current_user)):
    await _require_quote_access(user, quote_id)
    result = await db.quotes.update_one(
        {"id": quote_id, "userId": user["user_id"], "deletedAt": {"$exists": True, "$ne": None}},
        {"$unset": {"deletedAt": ""}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Silinen teklif bulunamadı (süresi dolmuş olabilir)")
    doc = await db.quotes.find_one({"id": quote_id, "userId": user["user_id"]}, {"_id": 0})
    return Quote(**doc)


# ============ QUOTE EXCEL EXPORT ============
# Kullanıcının onayladığı referans tasarıma birebir uyan STİLLİ bir .xlsx
# üretir (lacivert/gri kurumsal doküman görünümü). Frontend'de kullanılan
# ücretsiz 'xlsx' (SheetJS Community) kütüphanesi hücre rengi/kalın yazı
# YAZAMIYOR (sadece Pro sürüm destekler) -- bu yüzden görsel tasarım burada,
# openpyxl ile (tam stil desteğine sahip) sunucu tarafında üretiliyor.
#
# Kalem açıklaması (buildItemDescription) ve **vurgu** notu ayrıştırma
# (parseNoteSegments) mantığı frontend/src/lib/quote-utils.ts'teki aynı
# adlı fonksiyonlarla birebir aynı davranacak şekilde Python'a taşınmıştır --
# biri değişirse diğeri de güncellenmelidir.
_XLSX_NAVY = "1F2A44"
_XLSX_GRAY = "D9D9D9"
_XLSX_RED = "C0392B"
_CUR_SYMBOL = {"USD": "$", "EUR": "€", "TRY": "₺"}


def _xlsx_money_fmt(cur: str) -> str:
    sym = _CUR_SYMBOL.get(cur, cur)
    return f'"{sym}"#,##0.00'


def _xlsx_normalize_label(s: str) -> str:
    s = (s or "").lower()
    s = s.translate(str.maketrans({"ı": "i", "ş": "s", "ğ": "g", "ü": "u", "ö": "o", "ç": "c"}))
    return re.sub(r"[^a-z0-9]", "", s)


_XLSX_HEIGHT_LABELS = {"yukseklik", "h", "height"}
_XLSX_WIDTH_LABELS = {"genislik", "cephe", "en", "width", "w"}
_XLSX_DEPTH_LABELS = {"derinlik", "uzunluk", "boy", "depth", "length", "d", "l"}


def _xlsx_dim_role(label: str) -> Optional[str]:
    n = _xlsx_normalize_label(label)
    if n in _XLSX_HEIGHT_LABELS:
        return "height"
    if n in _XLSX_WIDTH_LABELS:
        return "width"
    if n in _XLSX_DEPTH_LABELS:
        return "depth"
    return None


def _xlsx_render_dimension_fields(fields: List[Dict[str, str]]) -> List[str]:
    items = [{"label": (f.get("label") or "").strip(), "value": (f.get("value") or "").strip()} for f in fields]
    for it in items:
        it["role"] = _xlsx_dim_role(it["label"])
    width_has = any(it["role"] == "width" and it["value"] for it in items)
    depth_has = any(it["role"] == "depth" and it["value"] for it in items)
    combine = width_has and depth_has
    parts: List[str] = []
    emitted = False
    for it in items:
        if not it["label"] and not it["value"]:
            continue
        if it["role"] == "height" and it["value"]:
            parts.append(f"H: {it['value']} mm")
            continue
        if it["role"] in ("width", "depth") and combine:
            if not emitted:
                w = next(x["value"] for x in items if x["role"] == "width")
                d = next(x["value"] for x in items if x["role"] == "depth")
                parts.append(f"{w} x {d} mm")
                emitted = True
            continue
        if it["label"] and it["value"]:
            parts.append(f"{it['label']}: {it['value']}")
        elif it["value"]:
            parts.append(it["value"])
        else:
            parts.append(it["label"])
    return parts


def _xlsx_build_item_description(it: Dict[str, Any]) -> str:
    parts: List[str] = []
    mode = it.get("mode") or "general"
    if mode == "technical":
        head = it.get("sistemTipi") or it.get("urunAdi") or ""
        if head:
            parts.append(head)
        parts.extend(_xlsx_render_dimension_fields(it.get("sistemFields") or []))
    elif mode == "manual":
        head = it.get("urunAdi") or ""
        if head:
            parts.append(head)
        for f in it.get("customFields") or []:
            key = (f.get("key") or "").strip()
            value = (f.get("value") or "").strip()
            if not key and not value:
                continue
            if key and value:
                parts.append(f"{key}: {value}")
            elif value:
                parts.append(value)
            else:
                parts.append(key)
    else:
        head = it.get("urunAdi") or ""
        if head:
            parts.append(head)
        if it.get("aciklama"):
            parts.append(it["aciklama"])
    return (", ".join(parts) + ".") if parts else ""


def _xlsx_parse_note_segments(raw: str):
    if not raw:
        return []
    segments = []
    last_index = 0
    for m in re.finditer(r"\*\*([^*]+)\*\*", raw):
        if m.start() > last_index:
            segments.append((raw[last_index:m.start()], False))
        segments.append((m.group(1), True))
        last_index = m.end()
    if last_index < len(raw):
        segments.append((raw[last_index:], False))
    return segments


def _xlsx_notes_to_lines(raw: str):
    segments = _xlsx_parse_note_segments(raw)
    lines = []
    cur_text = ""
    cur_emph = False
    for text, emph in segments:
        subparts = text.split("\n")
        for i, part in enumerate(subparts):
            cur_text += part
            if emph and part.strip():
                cur_emph = True
            if i < len(subparts) - 1:
                lines.append((cur_text, cur_emph))
                cur_text = ""
                cur_emph = False
    if cur_text.strip() or cur_emph:
        lines.append((cur_text, cur_emph))
    return [(t, e) for t, e in lines if t.strip()]


def _xlsx_fmt_date_ddmmyyyy(iso: str) -> str:
    try:
        d = datetime.strptime((iso or "")[:10], "%Y-%m-%d")
        return d.strftime("%d-%m-%Y")
    except Exception:
        return iso or ""


def build_quote_xlsx(company: Dict[str, Any], quote: Dict[str, Any]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Teklif"
    n_cols = 5  # A..E

    navy_fill = PatternFill("solid", fgColor=_XLSX_NAVY)
    gray_fill = PatternFill("solid", fgColor=_XLSX_GRAY)
    red_fill = PatternFill("solid", fgColor=_XLSX_RED)

    def merge_full(row: int, text: str, font: Font, fill: Optional[PatternFill] = None,
                    align: Optional[Alignment] = None, height: Optional[float] = None,
                    start_col: int = 1, end_col: Optional[int] = None):
        end_col = end_col or n_cols
        ws.merge_cells(start_row=row, start_column=start_col, end_row=row, end_column=end_col)
        cell = ws.cell(row=row, column=start_col, value=text)
        cell.font = font
        cell.alignment = align or Alignment(horizontal="left", vertical="center", indent=1)
        if fill:
            for c in range(start_col, end_col + 1):
                ws.cell(row=row, column=c).fill = fill
        if height:
            ws.row_dimensions[row].height = height
        return cell

    cur = quote.get("paraBirimi", "USD")
    money_fmt = _xlsx_money_fmt(cur)

    r = 1
    merge_full(r, company.get("sirketAdi") or "Anında Teklif", Font(bold=True, size=14), height=32)
    header_name_row = r
    r += 1
    contact_bits = [b for b in [company.get("adres"), company.get("telefon"), company.get("email"), company.get("website")] if b]
    merge_full(r, "  ".join(contact_bits), Font(size=9))
    r += 1
    merge_full(r, "TEKLİF FORMU", Font(bold=True, size=16), fill=gray_fill, height=20)
    r += 1
    r += 1  # spacer

    # ---- Firma logosu (üst-sağ köşe) ----
    logo_b64 = company.get("logoBase64") or ""
    if logo_b64.startswith("data:image/"):
        try:
            img_bytes = base64.b64decode(logo_b64.split(",", 1)[1])
            img = XLImage(io.BytesIO(img_bytes))
            max_h = 60
            if img.height > max_h:
                ratio = max_h / img.height
                img.width = int(img.width * ratio)
                img.height = max_h
            ws.add_image(img, f"{get_column_letter(n_cols)}{header_name_row}")
        except Exception:
            logger.warning("Excel export: logo gömülemedi", exc_info=True)

    def info_row(row: int, label: str, value: str):
        c1 = ws.cell(row=row, column=1, value=label)
        c1.font = Font(bold=True, size=10)
        ws.merge_cells(start_row=row, start_column=2, end_row=row, end_column=n_cols)
        c2 = ws.cell(row=row, column=2, value=value)
        c2.font = Font(size=10)

    info_row(r, "Teklif No", quote.get("teklifNo", "")); r += 1
    info_row(r, "Tarih", _xlsx_fmt_date_ddmmyyyy(quote.get("tarih", ""))); r += 1
    info_row(r, "Geçerlilik Tarihi", _xlsx_fmt_date_ddmmyyyy(quote.get("gecerlilik", ""))); r += 1
    r += 1  # spacer

    merge_full(r, "MÜŞTERİ BİLGİLERİ / SİPARİŞ BİLGİLERİ", Font(bold=True, size=10, color="FFFFFF"), fill=navy_fill)
    r += 1

    def two_col_row(row: int, l1: str, v1: str, l2: str, v2: str):
        c1 = ws.cell(row=row, column=1, value=l1); c1.font = Font(bold=True, size=10)
        c2 = ws.cell(row=row, column=2, value=v1); c2.font = Font(size=10)
        c3 = ws.cell(row=row, column=3, value=l2); c3.font = Font(bold=True, size=10)
        ws.merge_cells(start_row=row, start_column=4, end_row=row, end_column=n_cols)
        c4 = ws.cell(row=row, column=4, value=v2); c4.font = Font(size=10)

    two_col_row(r, "Firma", quote.get("musFirma", ""), "Proje Adı", quote.get("projeAdi", "")); r += 1
    two_col_row(r, "Müşteri Adı", quote.get("musYetkili", ""), "Nakliye", quote.get("nakliye", "")); r += 1
    two_col_row(r, "Telefon", quote.get("musTelefon") or "-", "Para Birimi", quote.get("paraBirimi", "")); r += 1
    two_col_row(r, "E-mail", quote.get("musEmail") or "-", "Ödeme Şekli", quote.get("odemeSekli", "")); r += 1
    two_col_row(r, "Adres", quote.get("musAdres", ""), "Menşei", quote.get("mensei", "")); r += 1
    two_col_row(r, "", "", "Teslim", quote.get("teslimGun", "")); r += 1
    r += 1  # spacer

    table_header_row = r
    headers = ["S.NO", "SİSTEM / HİZMET", "ADET", "BİRİM FİYAT", "TOPLAM FİYAT"]
    for i, h in enumerate(headers, start=1):
        cell = ws.cell(row=r, column=i, value=h)
        cell.font = Font(bold=True, size=10, color="FFFFFF")
        cell.fill = navy_fill
        cell.alignment = Alignment(horizontal="center" if i in (1, 3) else "left", vertical="center")
    r += 1

    items = quote.get("items") or []
    first_item_row = r
    for idx, it in enumerate(items):
        adet = float(it.get("adet") or 0)
        fiyat = float(it.get("birimFiyat") or 0)
        desc = _xlsx_build_item_description(it)
        row_vals = [idx + 1, desc, adet, fiyat]
        for ci, v in enumerate(row_vals, start=1):
            cell = ws.cell(row=r, column=ci, value=v)
            cell.font = Font(size=10)
            if ci == 1:
                cell.alignment = Alignment(horizontal="center", vertical="top")
            elif ci == 2:
                cell.alignment = Alignment(horizontal="left", vertical="top", wrap_text=True)
            elif ci == 3:
                cell.alignment = Alignment(horizontal="center", vertical="top")
            elif ci == 4:
                cell.alignment = Alignment(horizontal="right", vertical="top")
                cell.number_format = money_fmt
        e_cell = ws.cell(row=r, column=5, value=f"=C{r}*D{r}")
        e_cell.font = Font(size=10)
        e_cell.alignment = Alignment(horizontal="right", vertical="top")
        e_cell.number_format = money_fmt
        ws.row_dimensions[r].height = 90
        r += 1
    last_item_row = r - 1

    merge_full(r, "ÖLÇÜ VE ÖZELLİKLERİ DİKKATLİ KONTROL EDİNİZ. OLASI HATALARDAN FİRMAMIZ SORUMLU DEĞİLDİR.",
               Font(bold=True, size=10, color="FFFFFF"), fill=red_fill)
    r += 1
    r += 1  # spacer

    totals_start = r
    notlar = (quote.get("notlar") or "").strip()
    note_lines = _xlsx_notes_to_lines(notlar) if notlar else []

    if notlar:
        c = ws.cell(row=r, column=1, value="ÖZEL NOTLAR & SATIŞ DETAYLARI")
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=3)
        c.font = Font(bold=True, size=10, color="FFFFFF")
        for cc in range(1, 4):
            ws.cell(row=r, column=cc).fill = navy_fill
        notes_row = r + 1
        for text, emph in note_lines:
            ws.merge_cells(start_row=notes_row, start_column=1, end_row=notes_row, end_column=3)
            nc = ws.cell(row=notes_row, column=1, value=text)
            nc.font = Font(bold=emph, size=10)
            nc.alignment = Alignment(horizontal="left", vertical="top", wrap_text=True)
            notes_row += 1
    else:
        notes_row = r

    iskonto_or = float(quote.get("iskonto") or 0)
    kdv_or = float(quote.get("kdvOrani") or 0)
    iskonto_tutar = float(quote.get("iskontoTutar") or 0)
    kdv_tutar = float(quote.get("kdvTutar") or 0)
    genel_toplam = float(quote.get("genelToplam") or 0)

    def total_row(row: int, label: str, value):
        dc = ws.cell(row=row, column=4, value=label)
        dc.font = Font(bold=True, size=10)
        dc.fill = gray_fill
        ec = ws.cell(row=row, column=5, value=value)
        ec.font = Font(bold=True, size=10)
        ec.fill = gray_fill
        ec.number_format = money_fmt
        ec.alignment = Alignment(horizontal="right")

    tr = totals_start
    if items:
        total_row(tr, "ARA TOPLAM", f"=SUM(E{first_item_row}:E{last_item_row})")
    else:
        total_row(tr, "ARA TOPLAM", 0)
    tr += 1
    if iskonto_or > 0:
        total_row(tr, f"İSKONTO (%{iskonto_or:g})", -iskonto_tutar)
        tr += 1
    if kdv_or > 0:
        total_row(tr, f"KDV (%{kdv_or:g})", kdv_tutar)
        tr += 1
    total_row(tr, "GENEL TOPLAM", genel_toplam)
    tr += 1

    r = max(notes_row, tr)
    r += 1  # spacer
    merge_full(r, "Bu teklif Anında Teklif uygulaması ile hazırlanmıştır. www.anindateklif.co", Font(size=8))

    ws.column_dimensions["A"].width = 6
    ws.column_dimensions["B"].width = 55
    ws.column_dimensions["C"].width = 8
    ws.column_dimensions["D"].width = 14
    ws.column_dimensions["E"].width = 16
    ws.sheet_view.showGridLines = False

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@api_router.get("/quotes/{quote_id}/export-excel")
async def export_quote_excel(quote_id: str, user=Depends(get_current_user)):
    await _require_quote_access(user, quote_id)
    doc = await db.quotes.find_one({"id": quote_id, "userId": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Quote not found")
    company = await db.companies.find_one({"id": doc.get("companyId")}, {"_id": 0}) or {}
    staff_company = user.get("staff_of_company_id")
    if user.get("is_staff") and staff_company and staff_company != doc.get("companyId"):
        raise HTTPException(status_code=403, detail="Bu firmaya erişim izniniz yok")
    xlsx_bytes = build_quote_xlsx(company, doc)
    file_name = f"teklif-{(doc.get('teklifNo') or quote_id).replace('/', '-')}.xlsx"
    return StreamingResponse(
        io.BytesIO(xlsx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{file_name}"'},
    )


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
    altin_ons_usd: Optional[float] = None
    altin_gram_try: Optional[float] = None
    gumus_ons_usd: Optional[float] = None
    gumus_gram_try: Optional[float] = None
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


# ============ GİRİŞ ÖNCESİ OTOMATİK DİL (IP -> ÜLKE) ============
# splash/login/register ekranları, kullanıcı daha önce hiç dil seçmemişse
# (cihazda kayıtlı bir seçim yoksa) IP'sinin ülkesine göre karşılanır:
# İtalya -> it, Türkiye -> tr, diğer tüm ülkeler -> en. Üçüncü parti servise
# ulaşılamazsa ya da ülke tespit edilemezse sessizce 'tr' varsayılanına döner
# (mevcut davranışla aynı, hiçbir regresyona yol açmaz).
def _lang_for_country(country: Optional[str]) -> str:
    if country == "IT":
        return "it"
    if country == "TR":
        return "tr"
    if country:
        return "en"
    return "tr"


@api_router.get("/geo-lang")
async def geo_lang(request: Request):
    ip = _client_ip(request)
    country = None
    if ip and ip != "unknown" and not ip.startswith(("10.", "192.168.", "127.", "172.")):
        try:
            resp = await asyncio.to_thread(requests.get, f"https://ipapi.co/{ip}/country/", timeout=3)
            if resp.status_code == 200:
                candidate = resp.text.strip().upper()
                if len(candidate) == 2 and candidate.isalpha():
                    country = candidate
        except Exception:
            country = None
    return {"lang": _lang_for_country(country), "country": country}


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
            params={"ids": "bitcoin,ethereum", "vs_currencies": "try,usd"},
            headers={"User-Agent": "Mozilla/5.0"}, timeout=6,
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

    # CoinGecko'nun ücretsiz API'si paylaşımlı bulut IP'lerini (Railway dahil)
    # sık sık rate-limitliyor/engelliyor. Yukarıdaki çağrı boş dönerse Binance'in
    # anahtarsız public ticker uç noktasından USD fiyatını alıp, zaten elimizde
    # olan usd_try kuruyla kendimiz TL'ye çeviriyoruz — tek bir sağlayıcıya bağımlı
    # kalmamak için.
    if not result.get("btc_usd") or not result.get("eth_usd"):
        try:
            binance_resp = await asyncio.to_thread(
                requests.get, "https://api.binance.com/api/v3/ticker/price",
                params={"symbols": '["BTCUSDT","ETHUSDT"]'}, timeout=6,
            )
            for row in binance_resp.json():
                price = float(row.get("price"))
                if row.get("symbol") == "BTCUSDT" and not result.get("btc_usd"):
                    result["btc_usd"] = price
                elif row.get("symbol") == "ETHUSDT" and not result.get("eth_usd"):
                    result["eth_usd"] = price
        except Exception:
            logging.warning("[rates] binance fallback fetch failed", exc_info=True)

    usd_try_rate = result.get("usd_try")
    if not result.get("btc_try") and result.get("btc_usd") and usd_try_rate:
        result["btc_try"] = result["btc_usd"] * usd_try_rate
    if not result.get("eth_try") and result.get("eth_usd") and usd_try_rate:
        result["eth_try"] = result["eth_usd"] * usd_try_rate

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

    # Altın/Gümüş: ons (troy ons) fiyatı USD cinsinden Yahoo Finance spot
    # sembolünden alınıp, zaten elimizde olan USD/TRY kuruyla gram fiyatına
    # çeviriyoruz (1 ons = 31.1034768 gram) -- Türkiye'de kuyumcu fiyatı
    # olarak asıl aranan değer bu.
    try:
        ons_altin, ons_gumus = await asyncio.gather(
            _fetch_yahoo_index("GC=F"),
            _fetch_yahoo_index("SI=F"),
        )
        if ons_altin is not None:
            result["altin_ons_usd"] = ons_altin
            if usd_try_rate:
                result["altin_gram_try"] = (ons_altin / 31.1034768) * usd_try_rate
        if ons_gumus is not None:
            result["gumus_ons_usd"] = ons_gumus
            if usd_try_rate:
                result["gumus_gram_try"] = (ons_gumus / 31.1034768) * usd_try_rate
    except Exception:
        logging.warning("[rates] Altin/Gumus fetch failed", exc_info=True)

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
    price_usd: Optional[float] = None
    list_price_usd: Optional[float] = None
    price_eur: Optional[float] = None
    list_price_eur: Optional[float] = None
    duration_days: int


class SubscriptionStatus(BaseModel):
    subscription_active: bool
    subscription_expires_at: Optional[str] = None
    subscription_plan: Optional[str] = None
    # Kullaniciya gosterilecek plan adi ("Haftalik", "Yillik", "Hediye kodu").
    plan_label: Optional[str] = None
    days_left: Optional[int] = None
    # Hediye kodu kullanildiysa: kodun toplam gun sayisi ve kodun kendisi --
    # "90 gunluk hediye kodunun 47 gunu kaldi" diyebilmek icin.
    promo_days_total: Optional[int] = None
    promo_code: Optional[str] = None
    renewal_due_soon: bool = False
    plan_price_try: float = SUBSCRIPTION_PRICE_TRY
    plans: List[PlanOut] = []
    seat_count: int = 1
    period: str
    quotes_used_this_month: int
    free_limit: int
    remaining_free: Optional[int] = None


def _plans_out(plans: Dict[str, Dict[str, Any]]) -> List[PlanOut]:
    return [
        PlanOut(
            id=plan_id,
            label=cfg["label"],
            price_try=cfg["price_try"],
            list_price_try=cfg.get("list_price_try"),
            price_usd=cfg.get("price_usd"),
            list_price_usd=cfg.get("list_price_usd"),
            price_eur=cfg.get("price_eur"),
            list_price_eur=cfg.get("list_price_eur"),
            duration_days=cfg["duration_days"],
        )
        for plan_id, cfg in plans.items()
    ]


@api_router.get("/subscription/status", response_model=SubscriptionStatus)
async def subscription_status(user=Depends(get_current_user)):
    state = await _get_quota_state(user)
    days_left = _renewal_days_left(user)
    seats = await _seat_count(user["user_id"])
    tier = _seat_tier(seats)
    plans = _plans_for_tier(tier)
    plan_id = user.get("subscription_plan")
    if plan_id == "promo":
        plan_label = "Hediye kodu"
    else:
        plan_cfg = plans.get(plan_id) if plan_id else None
        plan_label = plan_cfg["label"] if plan_cfg else None
    return SubscriptionStatus(
        subscription_active=state["subscription_active"],
        subscription_expires_at=user.get("subscription_expires_at"),
        subscription_plan=plan_id,
        plan_label=plan_label,
        days_left=days_left,
        promo_days_total=user.get("promo_days_total") if plan_id == "promo" else None,
        promo_code=user.get("promo_code") if plan_id == "promo" else None,
        renewal_due_soon=state["subscription_active"] and _renewal_due_soon(user, days_left),
        plan_price_try=plans[DEFAULT_SUBSCRIPTION_PLAN]["price_try"],
        plans=_plans_out(plans),
        seat_count=seats,
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
    if user.get("is_staff"):
        raise HTTPException(status_code=403, detail="Abonelik işlemlerini sadece firma sahibi yapabilir")
    if not IYZICO_API_KEY or not IYZICO_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Ödeme sistemi henüz yapılandırılmadı")
    seats = await _seat_count(user["user_id"])
    plans = _plans_for_tier(_seat_tier(seats))
    plan_id = payload.plan if payload.plan in plans else DEFAULT_SUBSCRIPTION_PLAN
    plan_cfg = plans[plan_id]
    # Kullanıcının uygulama dili İngilizce ise $, İtalyanca ise € ile sabit
    # fiyattan tahsil edilir; Türkçe (veya bilinmeyen bir dil) için her zaman
    # TL. Ekranda gösterilen fiyatla (subscription.tsx) burada tahsil edilen
    # tutar birebir aynı olmalı.
    billing_currency = currencyForLang(user.get("language", "tr"))
    plan_price, iyzico_currency = _plan_price_for_currency(plan_cfg, billing_currency)

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
        "currency": iyzico_currency,
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
    # BUG FIX: bu blokta (iyzipay'e agsal erisim, kutuphane/parsing hatasi vs.)
    # yakalanmamis HERHANGI bir exception, FastAPI'nin varsayilan 500
    # handler'inda JSON OLMAYAN duz metin bir govde uretiyordu ("Internal
    # Server Error") -- bu da istemcinin JSON.parse(body) denemesini
    # basarisiz kilip ekranda hep jenerik "Odeme baslatilamadi, lutfen
    # tekrar deneyin" mesajini gostermesine sebep oluyordu; gercek sebep
    # (ag hatasi mi, iyzico'nun kendi hata mesaji mi) hem kullaniciya hem
    # de loglara hic yansimiyordu. Simdi tum riskli kisim try/except ile
    # sariliyor: gercek hata loglaniyor ve kullaniciya anlamli, JSON bir
    # hata donduruluyor.
    try:
        import iyzipay
        cf = iyzipay.CheckoutFormInitialize()
        result = await asyncio.to_thread(cf.create, request, _iyzico_options())
        response = json.load(result)
    except HTTPException:
        raise
    except Exception:
        logger.exception("[subscription] iyzico checkout create basarisiz")
        raise HTTPException(status_code=502, detail="Ödeme sağlayıcısına ulaşılamadı, lütfen daha sonra tekrar deneyin")
    if response.get("status") != "success":
        logger.error(f"[subscription] iyzico checkout status!=success: {response}")
        raise HTTPException(status_code=502, detail=response.get("errorMessage") or "Ödeme başlatılamadı")
    token = response.get("token")
    if not token:
        logger.error(f"[subscription] iyzico basarili ama token yok: {response}")
        raise HTTPException(status_code=502, detail="Ödeme sayfası oluşturulamadı, lütfen tekrar deneyin")
    await db.subscription_payments.insert_one({
        "user_id": user["user_id"],
        "token": token,
        "conversation_id": conversation_id,
        "plan": plan_id,
        "amount": plan_price,
        "currency": iyzico_currency,
        "status": "pending",
        "created_at": utc_now_iso(),
    })
    return SubscriptionCheckoutResponse(
        payment_page_url=response.get("paymentPageUrl"),
        checkout_form_content=response.get("checkoutFormContent"),
        token=token,
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

    # GÜVENLİK: Iyzico webhook'ları yeniden deneyebilir, ve token checkout
    # sırasında istemciye (yönlendirme URL'sinde) görünür olduğu için istemci
    # de bu uç noktayı elle tekrar tekrar çağırabilir. Bu idempotency kontrolü
    # olmadan AYNI tek ödeme, callback her çağrıldığında abonelik süresini
    # tekrar tekrar uzatıyordu (ücretsiz sınırsız uzatma açığı). Bir token
    # zaten "paid" olarak işaretlenmişse süreyi bir daha UZATMADAN, sadece
    # zaten başarılı olduğunu bildiren aynı sonucu döndürüyoruz.
    already_processed = bool(pending) and pending.get("status") == "paid"

    if success and user_id and not already_processed:
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
    elif already_processed:
        # Bu token için abonelik zaten bir kez uzatılmış -- tekrar hiçbir
        # şey değiştirmeden, kullanıcıya yine "başarılı" sonucunu gösteriyoruz
        # (ödeme gerçekten başarılıydı, sadece ikinci kez işlemiyoruz).
        redirect_url = f"{FRONTEND_BASE_URL.rstrip('/')}/subscription-result?status=success"
    else:
        if pending:
            await db.subscription_payments.update_one({"token": token}, {"$set": {"status": "failed"}})
        redirect_url = f"{FRONTEND_BASE_URL.rstrip('/')}/subscription-result?status=failed"

    return RedirectResponse(url=redirect_url, status_code=302)


# ============ FİRMA ARAMA TAKİBİ (LEAD / POTANSİYEL MÜŞTERİ) ============
# Her firma kendi sektöründe (pergola, cam balkon, peyzaj mimarlığı, vb.)
# potansiyel iş ortaklarını/firmaları aramak isteyebilir. Uygulama içinde canlı,
# otomatik bir harita/işletme araması YOK (bu, ücretli bir servis - örn. Google
# Places API - gerektirir). Bunun yerine: firma sahibi "hangi sektörde, hangi
# bölgede firma arıyorum" diye bir TALEP oluşturur; bu talep admin'e (uygulama
# sahibine) düşer, admin gerçek araştırmayı yapıp bulduğu firmaları (isim,
# bölge, kategori, telefon) o firmanın listesine toplu olarak ekler. Firma
# sahibi/personeli sonra bu listeyi klasik bir "arama takip" tablosu gibi
# kullanır: her gün belirlenen sayıda firma "Bugün Aranacaklar" listesine
# düşer, arayınca durumunu işaretler, dilerse WhatsApp'tan mesaj atar.

LEAD_DURUM_VALUES = {"Aranmadı", "Arandı", "Cevap Yok", "Olumlu Dönüş", "Olumsuz Dönüş", "Kapandı"}
DEFAULT_LEAD_DAILY_COUNT = 10
MAX_LEAD_DAILY_COUNT = 100


class LeadCompany(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    userId: str
    companyId: str
    firma: str
    bolge: str = ""
    kategori: str = ""
    telefon: str = ""
    website: str = ""
    email: str = ""
    # Yönetici bu firmayı bir personele atayıp "ara, iletişime geç" gibi bir
    # not bırakabilir -- personel kendi ekranında sadece kendisine atananları
    # ayrı bir baloncukta görür. Boşsa kimseye atanmamış demektir.
    atananKullaniciId: str = ""
    atananNot: str = ""
    durum: str = "Aranmadı"
    notlar: str = ""
    # Bu firmayı ne zaman TEKRAR aramamız gerektiğini işaretlemek için
    # (örn. "Cevap Yok" dendiğinde 3 gün sonra tekrar ara). Boşsa özel bir
    # tarih yok demektir. "YYYY-MM-DD" formatında.
    tekrarTarihi: str = ""
    # Kanban pano yükseltmesi: fırsat (potansiyel satış) tutarı -- TL bazında,
    # "Açık Fırsat Değeri" özet kartı ve sütun toplamları için kullanılır.
    firsatTutari: float = 0.0
    # Aynı durum (kanban sütunu) içindeki sürükle-bırak sırasını korumak için.
    # createdAt'e güvenilmez çünkü kullanıcı sürükleyerek elle sıralama yapabilir.
    siraNo: float = 0.0
    createdAt: str = Field(default_factory=utc_now_iso)
    updatedAt: str = Field(default_factory=utc_now_iso)


class LeadCompanyCreate(BaseModel):
    companyId: str
    firma: str
    bolge: str = ""
    kategori: str = ""
    telefon: str = ""
    website: str = ""
    email: str = ""
    firsatTutari: float = 0.0

    @field_validator("firma")
    @classmethod
    def _firma_len(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("Firma adı zorunlu")
        if len(v) > 200:
            raise ValueError("Firma adı çok uzun")
        return v


class LeadBulkAddRequest(BaseModel):
    companyId: str
    items: List[LeadCompanyCreate]


class LeadAiFillRequest(BaseModel):
    companyId: str
    sektor: str
    bolge: str = ""
    aciklama: str = ""

    @field_validator("sektor")
    @classmethod
    def _sektor_len(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("Sektör zorunlu")
        if len(v) > 120:
            raise ValueError("Sektör çok uzun")
        return v


class LeadStatusUpdate(BaseModel):
    durum: Optional[str] = None
    notlar: Optional[str] = None
    tekrarTarihi: Optional[str] = None
    website: Optional[str] = None
    email: Optional[str] = None
    atananKullaniciId: Optional[str] = None
    atananNot: Optional[str] = None
    firsatTutari: Optional[float] = None
    siraNo: Optional[float] = None


class LeadReorderItem(BaseModel):
    id: str
    durum: str
    siraNo: float


class LeadReorderRequest(BaseModel):
    items: List[LeadReorderItem]


class LeadDailyCountUpdate(BaseModel):
    dailyCount: int


class LeadSearchRequest(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    userId: str
    companyId: str
    companyName: str = ""
    sektor: str
    bolge: str = ""
    aciklama: str = ""
    durum: str = "Beklemede"  # "Beklemede" | "Tamamlandı"
    createdAt: str = Field(default_factory=utc_now_iso)


class LeadSearchRequestCreate(BaseModel):
    companyId: str
    sektor: str
    bolge: str = ""
    aciklama: str = ""

    @field_validator("sektor")
    @classmethod
    def _sektor_len(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("Sektör zorunlu")
        if len(v) > 200:
            raise ValueError("Sektör çok uzun")
        return v


@api_router.get("/leads/{company_id}", response_model=List[LeadCompany])
async def list_leads(company_id: str, user=Depends(get_current_user)):
    await _own_company(user, company_id)
    docs = await db.leads.find({"companyId": company_id, "userId": user["user_id"]}, {"_id": 0}).sort("createdAt", 1).to_list(5000)
    return [LeadCompany(**d) for d in docs]


# Kullanıcının kendi bulduğu bir firmayı (ör. Arkiv, Mimarlar Odası, Google
# üzerinden araştırıp bulduğu) doğrudan kendi listesine eklemesi için --
# admin bulk-add'in aksine herhangi bir kullanıcı kendi firmasına kendi
# leadlerini ekleyebilir, admin onayı gerekmez.
@api_router.post("/leads", response_model=LeadCompany)
async def create_lead(payload: LeadCompanyCreate, user=Depends(get_current_user)):
    await _own_company(user, payload.companyId)
    obj = LeadCompany(
        userId=user["user_id"],
        companyId=payload.companyId,
        firma=payload.firma,
        bolge=payload.bolge,
        kategori=payload.kategori,
        telefon=payload.telefon,
        website=payload.website,
        email=payload.email,
        firsatTutari=payload.firsatTutari or 0.0,
    )
    await db.leads.insert_one(obj.model_dump())
    return obj


# Kullanıcı "Yeni Talep" sekmesinde sektör/bölge girip gönderdiğinde --
# admin'e bir talep DÜŞMÜYOR, doğrudan burada yapay zeka (web_search aracıyla)
# gerçek firmaları arayıp bulduklarını kullanıcının kendi listesine ekliyor.
@api_router.post("/leads/ai-find", response_model=List[LeadCompany])
async def ai_find_leads(payload: LeadAiFillRequest, user=Depends(get_current_user)):
    if not _anthropic_client:
        raise HTTPException(status_code=503, detail="Yapay zeka asistanı henüz yapılandırılmadı")
    await _own_company(user, payload.companyId)
    prompt = f"Sektör: {payload.sektor}\nBölge: {payload.bolge.strip() or 'belirtilmedi (Türkiye geneli arayabilirsin)'}"
    if payload.aciklama.strip():
        prompt += f"\nEk not: {payload.aciklama.strip()}"
    try:
        resp = await asyncio.to_thread(
            _anthropic_client.messages.create,
            model="claude-sonnet-5",
            max_tokens=3000,
            system=LEAD_FINDER_SYSTEM_PROMPT,
            tools=[{"type": "web_search_20250305", "name": "web_search", "max_uses": 6}],
            messages=[{"role": "user", "content": prompt}],
        )
        reply_text = "".join(
            block.text for block in resp.content if getattr(block, "type", None) == "text"
        ).strip()
    except Exception as e:
        logger.error(f"Lead AI find error: {e}")
        raise HTTPException(status_code=502, detail="Firma araması şu anda yapılamadı, lütfen tekrar deneyin")
    items = _extract_ai_leads(reply_text)
    if not items:
        raise HTTPException(status_code=404, detail="Uygun firma bulunamadı, farklı bir sektör/bölge dene")
    created = []
    for item in items:
        obj = LeadCompany(
            userId=user["user_id"],
            companyId=payload.companyId,
            firma=item["firma"],
            bolge=item["bolge"],
            kategori=payload.sektor.strip(),
            telefon=item["telefon"],
            website=item.get("website", ""),
            email=item.get("email", ""),
        )
        await db.leads.insert_one(obj.model_dump())
        created.append(obj)
    return created


@api_router.get("/leads/{company_id}/today", response_model=List[LeadCompany])
async def list_leads_today(company_id: str, user=Depends(get_current_user)):
    company = await _own_company(user, company_id)
    daily_count = int(company.get("leadDailyCount") or DEFAULT_LEAD_DAILY_COUNT)
    daily_count = max(1, min(daily_count, MAX_LEAD_DAILY_COUNT))
    today_str = datetime.now(timezone.utc).date().isoformat()
    # "Bugün aranacaklar" = henüz aranmamış ya da cevap alınamamış firmalar,
    # en eski eklenenden başlayarak günlük limit kadarı. Bir firma arandı /
    # sonuçlandı olarak işaretlenince otomatik olarak bu listeden düşer ve
    # yerine bir sonraki bekleyen firma gelir — ayrı bir "gün" alanı tutmaya
    # gerek kalmadan "aranmayanlar bir sonraki güne taşınır" davranışı budur.
    # "Tekrar arama tarihi" ileri bir güne ayarlanmışsa (örn. "3 gün sonra
    # tekrar ara") o tarih gelene kadar bu listede tekrar görünmez — unutma
    # riski olmadan, ama gereksiz yere de her gün karşımıza çıkmadan.
    docs = await db.leads.find(
        {
            "companyId": company_id,
            "userId": user["user_id"],
            "durum": {"$in": ["Aranmadı", "Cevap Yok"]},
            "$or": [{"tekrarTarihi": {"$in": ["", None]}}, {"tekrarTarihi": {"$lte": today_str}}],
        },
        {"_id": 0},
    ).sort("createdAt", 1).limit(daily_count).to_list(daily_count)
    return [LeadCompany(**d) for d in docs]


@api_router.patch("/company/{company_id}/lead-daily-count")
async def update_lead_daily_count(company_id: str, payload: LeadDailyCountUpdate, user=Depends(get_current_user)):
    await _own_company(user, company_id)
    count = max(1, min(int(payload.dailyCount), MAX_LEAD_DAILY_COUNT))
    await db.companies.update_one({"id": company_id, "userId": user["user_id"]}, {"$set": {"leadDailyCount": count}})
    return {"ok": True, "dailyCount": count}


@api_router.patch("/leads/{lead_id}", response_model=LeadCompany)
async def update_lead(lead_id: str, payload: LeadStatusUpdate, user=Depends(get_current_user)):
    doc = await db.leads.find_one({"id": lead_id, "userId": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Kayıt bulunamadı")
    updates: Dict[str, Any] = {"updatedAt": utc_now_iso()}
    if payload.durum is not None:
        if payload.durum not in LEAD_DURUM_VALUES:
            raise HTTPException(400, "Geçersiz durum")
        updates["durum"] = payload.durum
    if payload.notlar is not None:
        updates["notlar"] = payload.notlar[:2000]
    if payload.tekrarTarihi is not None:
        t = (payload.tekrarTarihi or "").strip()
        if t and not re.match(r"^\d{4}-\d{2}-\d{2}$", t):
            raise HTTPException(400, "Geçersiz tarih formatı")
        updates["tekrarTarihi"] = t
    if payload.website is not None:
        updates["website"] = payload.website.strip()[:200]
    if payload.email is not None:
        updates["email"] = payload.email.strip()[:200]
    if payload.atananKullaniciId is not None or payload.atananNot is not None:
        # Firmayı bir personele atamak sadece firma sahibine (ya da "admin"
        # rollü personele) açık -- normal personel başkasına iş atayamaz.
        if user.get("is_staff") and user.get("staff_role") != "admin":
            raise HTTPException(status_code=403, detail="Sadece firma sahibi atama yapabilir")
        if payload.atananKullaniciId is not None:
            updates["atananKullaniciId"] = payload.atananKullaniciId.strip()
        if payload.atananNot is not None:
            updates["atananNot"] = payload.atananNot.strip()[:500]
    if payload.firsatTutari is not None:
        if payload.firsatTutari < 0 or payload.firsatTutari > 100_000_000:
            raise HTTPException(400, "Geçersiz fırsat tutarı")
        updates["firsatTutari"] = payload.firsatTutari
    if payload.siraNo is not None:
        updates["siraNo"] = payload.siraNo
    await db.leads.update_one({"id": lead_id, "userId": user["user_id"]}, {"$set": updates})
    doc.update(updates)
    return LeadCompany(**doc)


# Kanban panosunda sürükle-bırak sonrası -- sütun (durum) değişimi ve/veya
# sütun içi sıra değişimi tek istekte toplu güncellenir (tek tek PATCH yerine).
@api_router.patch("/leads/reorder")
async def reorder_leads(payload: LeadReorderRequest, user=Depends(get_current_user)):
    if len(payload.items) > 500:
        raise HTTPException(400, "Çok fazla kayıt")
    now = utc_now_iso()
    for item in payload.items:
        if item.durum not in LEAD_DURUM_VALUES:
            raise HTTPException(400, "Geçersiz durum")
        await db.leads.update_one(
            {"id": item.id, "userId": user["user_id"]},
            {"$set": {"durum": item.durum, "siraNo": item.siraNo, "updatedAt": now}},
        )
    return {"ok": True}


@api_router.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str, user=Depends(get_current_user)):
    await db.leads.delete_one({"id": lead_id, "userId": user["user_id"]})
    return {"ok": True}


@api_router.post("/leads/search-request", response_model=LeadSearchRequest)
async def create_lead_search_request(payload: LeadSearchRequestCreate, user=Depends(get_current_user)):
    company = await _own_company(user, payload.companyId)
    obj = LeadSearchRequest(
        userId=user["user_id"],
        companyId=payload.companyId,
        companyName=company.get("sirketAdi", ""),
        sektor=payload.sektor.strip(),
        bolge=(payload.bolge or "").strip(),
        aciklama=(payload.aciklama or "").strip()[:2000],
    )
    await db.lead_search_requests.insert_one(obj.model_dump())
    return obj


@api_router.get("/leads/search-requests/{company_id}", response_model=List[LeadSearchRequest])
async def list_lead_search_requests(company_id: str, user=Depends(get_current_user)):
    await _own_company(user, company_id)
    docs = await db.lead_search_requests.find(
        {"companyId": company_id, "userId": user["user_id"]}, {"_id": 0}
    ).sort("createdAt", -1).to_list(500)
    return [LeadSearchRequest(**d) for d in docs]


# Artık "Yeni Talep" admin'e düşmüyor (bkz. /leads/ai-find) -- bu eski
# kayıtlar sadece geçmişten kalma. Kullanıcı isterse kendi geçmiş taleplerini
# temizleyebilsin diye basit bir self-servis silme uç noktası.
@api_router.delete("/leads/search-requests/{request_id}")
async def delete_lead_search_request(request_id: str, user=Depends(get_current_user)):
    await db.lead_search_requests.delete_one({"id": request_id, "userId": user["user_id"]})
    return {"ok": True}


# --- Admin: tüm firmalardan gelen arama taleplerini gör, araştırılan firmaları toplu ekle ---
@api_router.get("/admin/leads/search-requests", response_model=List[LeadSearchRequest])
async def admin_list_lead_search_requests(user=Depends(get_current_user)):
    _require_admin(user)
    docs = await db.lead_search_requests.find({}, {"_id": 0}).sort("createdAt", -1).to_list(1000)
    return [LeadSearchRequest(**d) for d in docs]


@api_router.patch("/admin/leads/search-requests/{request_id}")
async def admin_update_lead_search_request(request_id: str, payload: LeadStatusUpdate, user=Depends(get_current_user)):
    _require_admin(user)
    if payload.durum and payload.durum not in {"Beklemede", "Tamamlandı"}:
        raise HTTPException(400, "Geçersiz durum")
    updates = {}
    if payload.durum:
        updates["durum"] = payload.durum
    if not updates:
        raise HTTPException(400, "Güncellenecek alan yok")
    await db.lead_search_requests.update_one({"id": request_id}, {"$set": updates})
    return {"ok": True}


@api_router.post("/admin/leads/bulk-add", response_model=List[LeadCompany])
async def admin_bulk_add_leads(payload: LeadBulkAddRequest, user=Depends(get_current_user)):
    _require_admin(user)
    target_company = await db.companies.find_one({"id": payload.companyId}, {"_id": 0})
    if not target_company:
        raise HTTPException(404, "Firma bulunamadı")
    if len(payload.items) > 200:
        raise HTTPException(400, "Tek seferde en fazla 200 firma eklenebilir")
    created = []
    for item in payload.items:
        obj = LeadCompany(
            userId=target_company["userId"],
            companyId=payload.companyId,
            firma=item.firma,
            bolge=item.bolge,
            kategori=item.kategori,
            telefon=item.telefon,
        )
        await db.leads.insert_one(obj.model_dump())
        created.append(obj)
    if created:
        _event_leads_ready(target_company["userId"], len(created), str(uuid.uuid4())[:8])
    return created


# ============ HEDİYE / PROMOSYON KODU ============
# cagdas'ın hediye etmek istediği müşteri adaylarına verebileceği tek kullanımlık
# kodlar: kodu giren kullanıcı, kaydırma tuşuna basar basmaz belirlenen süre
# boyunca (varsayılan 90 gün) sınırsız teklif hakkına sahip olur (tıpkı ücretli
# bir abonelik gibi -- subscription_expires_at ileri atılır). Kod üretme/listeleme
# sadece ADMIN_EMAILS'teki hesaplara açık; kullanma (redeem) herhangi bir giriş
# yapmış firma sahibine açık.
def _require_admin(user: Dict[str, Any]):
    email = (user.get("email") or "").strip().lower()
    if email not in ADMIN_EMAILS:
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")


def _generate_promo_code() -> str:
    # Karışmasın diye 0/O, 1/I gibi belirsiz karakterler hariç tutulmuş bir alfabe.
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(py_secrets.choice(alphabet) for _ in range(8))


class PromoCodeCreateRequest(BaseModel):
    count: int = 1
    duration_days: int = 90
    note: Optional[str] = None


class PromoCodeOut(BaseModel):
    code: str
    duration_days: int
    note: Optional[str] = None
    created_at: str
    used: bool
    used_by_email: Optional[str] = None
    used_at: Optional[str] = None


@api_router.post("/admin/promo-codes", response_model=List[PromoCodeOut])
async def create_promo_codes(payload: PromoCodeCreateRequest, user=Depends(get_current_user)):
    _require_admin(user)
    count = max(1, min(payload.count, 100))
    duration_days = max(1, min(payload.duration_days, 3650))
    docs = []
    for _ in range(count):
        for _attempt in range(5):
            code = _generate_promo_code()
            if not await db.promo_codes.find_one({"code": code}, {"_id": 1}):
                break
        doc = {
            "code": code,
            "duration_days": duration_days,
            "note": (payload.note or "").strip() or None,
            "created_by": user["user_id"],
            "created_at": utc_now_iso(),
            "used": False,
            "used_by_user_id": None,
            "used_by_email": None,
            "used_at": None,
        }
        await db.promo_codes.insert_one(dict(doc))
        docs.append(doc)
    return [PromoCodeOut(**{k: v for k, v in d.items() if k in PromoCodeOut.model_fields}) for d in docs]


@api_router.get("/admin/promo-codes", response_model=List[PromoCodeOut])
async def list_promo_codes(user=Depends(get_current_user)):
    _require_admin(user)
    cursor = db.promo_codes.find({}, {"_id": 0}).sort("created_at", -1).limit(500)
    docs = await cursor.to_list(500)
    return [PromoCodeOut(**{k: v for k, v in d.items() if k in PromoCodeOut.model_fields}) for d in docs]


# ============ MÜŞTERİ OLARAK GİR (ADMIN IMPERSONATION) ============
# Uygulamayı satan/kuran admin (ADMIN_EMAILS), bir müşterinin şifresini
# görmeden/sormadan, o firmanın hesabına KISA SÜRELİ ve KAYIT ALTINA ALINAN
# (audit) bir destek erişimi açabilir. Mekanizma: normal login ile birebir
# aynı yapıda bir access token üretilir (get_current_user'da hiçbir özel
# kod yolu gerekmez), sadece "imp"/"imp_by" claim'leri eklenir ve süresi
# çok kısa tutulur (30 dk). Bu token'la yapılan HER işlem, o müşterinin
# kendi hesabıyla girmiş gibi işler (kalem/katalog düzenleme dahil) — ama
# admin kendi şifresini asla görmez/kullanmaz, müşteri de hiçbir şey yapmaz.
IMPERSONATION_TOKEN_MINUTES = 30


def _make_impersonation_token(target_user: Dict[str, Any], admin_email: str) -> Tuple[str, str]:
    now = _utc()
    jti = str(uuid.uuid4())
    payload = {
        "sub": target_user["user_id"],
        "email": target_user["email"],
        "type": "access",
        "jti": jti,
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
        "iat": now,
        "exp": now + timedelta(minutes=IMPERSONATION_TOKEN_MINUTES),
        "imp": True,
        "imp_by": admin_email,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM), jti


class AdminCustomerOut(BaseModel):
    user_id: str
    email: str
    name: str = ""
    phone: str = ""
    company_name: str = ""
    company_id: Optional[str] = None
    albert_genau_enabled: bool = False
    albert_genau_claimed: bool = False
    zip_perde_enabled: bool = False
    created_at: Optional[str] = None
    subscription_active: bool = False


class ImpersonateResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
    company_name: str = ""


@api_router.get("/admin/customers", response_model=List[AdminCustomerOut])
async def admin_list_customers(user=Depends(get_current_user)):
    _require_admin(user)
    # Geri alma suresi dolmus hesaplar bu listeye her bakildiginda temizlenir
    # (bkz. _purge_expired_accounts).
    await _purge_expired_accounts()
    # Sadece gerçek firma sahibi hesapları (personel hesapları hariç) —
    # personelin hesabına değil, doğrudan firma sahibine girilir.
    docs = await db.users.find(
        {"staff_owner_user_id": {"$in": [None, ""]}, "deleted_at": {"$in": [None, ""]}},
        {"_id": 0, "user_id": 1, "email": 1, "name": 1, "phone": 1, "createdAt": 1, "subscription_expires_at": 1},
    ).sort("createdAt", -1).to_list(2000)
    out: List[AdminCustomerOut] = []
    for d in docs:
        email = (d.get("email") or "").strip().lower()
        if email in ADMIN_EMAILS:
            continue
        company = await db.companies.find_one(
            {"userId": d["user_id"]},
            {"_id": 0, "id": 1, "sirketAdi": 1, "albertGenauEnabled": 1, "albertGenauClaimed": 1, "zipPerdeEnabled": 1},
        )
        out.append(AdminCustomerOut(
            user_id=d["user_id"],
            email=d.get("email", ""),
            name=d.get("name", ""),
            phone=d.get("phone", ""),
            company_name=(company or {}).get("sirketAdi", ""),
            company_id=(company or {}).get("id"),
            albert_genau_enabled=bool((company or {}).get("albertGenauEnabled", False)),
            albert_genau_claimed=bool((company or {}).get("albertGenauClaimed", False)),
            zip_perde_enabled=bool((company or {}).get("zipPerdeEnabled", False)),
            created_at=d.get("createdAt"),
            subscription_active=_is_subscription_active(d),
        ))
    return out


# ============================================================================
# Admin: hesap silme (geri alinabilir) + 30 gun sonra kalici temizlik
# ----------------------------------------------------------------------------
# Yanlislikla silinen bir hesabin geri getirilebilmesi icin silme islemi
# once "yumusak" yapilir: kullanici dokumanina deleted_at / purge_after
# yazilir. Hesap o andan itibaren oturum acamaz (bkz. get_current_user) ama
# firma verileri (teklifler, musteriler, kasa...) oldugu gibi durur.
# purge_after gecince veriler depolama alanindan kalici olarak silinir.
#
# Temizlik icin ayri bir zamanlayici kurmak yerine admin listeyi her actiginda
# suresi dolmuslar temizlenir -- tek admin ekrani oldugu icin bu yeterli ve
# calismayan bir cron'a bagli kalmaz.
# ============================================================================

ACCOUNT_PURGE_DAYS = 30


async def _hard_delete_user_data(uid: str) -> None:
    """Bir firma sahibinin tum is verilerini ve bagli personel girislerini
    kalici olarak siler. (Kullanicinin kendi hesabini silmesiyle ayni kapsam
    -- bkz. DELETE /auth/account.)"""
    await db.companies.delete_many({"userId": uid})
    await db.catalog.delete_many({"userId": uid})
    await db.customers.delete_many({"userId": uid})
    await db.quotes.delete_many({"userId": uid})
    await db.services.delete_many({"userId": uid})
    await db.campaigns.delete_many({"userId": uid})
    await db.manual_reminders.delete_many({"userId": uid})
    await db.kasa.delete_many({"userId": uid})
    await db.tahsilat.delete_many({"userId": uid})
    await db.company_invites.delete_many({"ownerUserId": uid})
    await db.subscription_payments.delete_many({"user_id": uid})
    await db.email_verifications.delete_many({"user_id": uid})
    await db.password_resets.delete_many({"user_id": uid})
    await db.users.delete_many({"staff_owner_user_id": uid})
    await db.users.delete_one({"user_id": uid})


async def _purge_expired_accounts() -> int:
    """Geri alma suresi dolmus hesaplari kalici olarak siler. Silinen hesap
    sayisini dondurur."""
    now = utc_now_iso()
    expired = await db.users.find(
        {"deleted_at": {"$ne": None}, "purge_after": {"$lte": now}},
        {"_id": 0, "user_id": 1},
    ).to_list(500)
    for doc in expired:
        await _hard_delete_user_data(doc["user_id"])
    return len(expired)


class DeletedAccountOut(BaseModel):
    user_id: str
    email: str
    name: str = ""
    company_name: str = ""
    deleted_at: str
    purge_after: str
    days_left: int


@api_router.delete("/admin/customers/{target_user_id}")
async def admin_delete_customer(target_user_id: str, user=Depends(get_current_user)):
    """Hesabi geri alinabilir sekilde siler. Veriler ACCOUNT_PURGE_DAYS gun
    saklanir, sonra kalici olarak temizlenir."""
    _require_admin(user)
    doc = await db.users.find_one({"user_id": target_user_id}, {"_id": 0, "user_id": 1, "email": 1})
    if not doc:
        raise HTTPException(status_code=404, detail="Hesap bulunamadi")
    email = (doc.get("email") or "").strip().lower()
    if email in ADMIN_EMAILS:
        raise HTTPException(status_code=400, detail="Admin hesabi silinemez")
    if target_user_id == _self_id(user):
        raise HTTPException(status_code=400, detail="Kendi hesabinizi buradan silemezsiniz")
    now = utc_now()
    await db.users.update_one(
        {"user_id": target_user_id},
        {"$set": {
            "deleted_at": now.isoformat(),
            "deleted_by": (user.get("email") or ""),
            "purge_after": (now + timedelta(days=ACCOUNT_PURGE_DAYS)).isoformat(),
        }},
    )
    return {"ok": True, "user_id": target_user_id, "purge_days": ACCOUNT_PURGE_DAYS}


@api_router.post("/admin/customers/{target_user_id}/restore")
async def admin_restore_customer(target_user_id: str, user=Depends(get_current_user)):
    """Yanlislikla silinen hesabi geri getirir (veriler hic silinmemisti)."""
    _require_admin(user)
    doc = await db.users.find_one({"user_id": target_user_id}, {"_id": 0, "user_id": 1, "deleted_at": 1})
    if not doc:
        raise HTTPException(status_code=404, detail="Hesap bulunamadi")
    if not doc.get("deleted_at"):
        raise HTTPException(status_code=400, detail="Bu hesap zaten aktif")
    await db.users.update_one(
        {"user_id": target_user_id},
        {"$unset": {"deleted_at": "", "deleted_by": "", "purge_after": ""}},
    )
    return {"ok": True, "user_id": target_user_id}


@api_router.get("/admin/customers/deleted", response_model=List[DeletedAccountOut])
async def admin_list_deleted_customers(user=Depends(get_current_user)):
    _require_admin(user)
    await _purge_expired_accounts()
    docs = await db.users.find(
        {"deleted_at": {"$ne": None}},
        {"_id": 0, "user_id": 1, "email": 1, "name": 1, "deleted_at": 1, "purge_after": 1},
    ).sort("deleted_at", -1).to_list(500)
    out: List[DeletedAccountOut] = []
    now = utc_now()
    for d in docs:
        try:
            purge = datetime.fromisoformat(d.get("purge_after") or "")
            if purge.tzinfo is None:
                purge = purge.replace(tzinfo=timezone.utc)
            days_left = max(0, (purge - now).days)
        except Exception:
            days_left = 0
        company = await db.companies.find_one({"userId": d["user_id"]}, {"_id": 0, "sirketAdi": 1})
        out.append(DeletedAccountOut(
            user_id=d["user_id"],
            email=d.get("email", ""),
            name=d.get("name", ""),
            company_name=(company or {}).get("sirketAdi", ""),
            deleted_at=d.get("deleted_at") or "",
            purge_after=d.get("purge_after") or "",
            days_left=days_left,
        ))
    return out


class AlbertGenauEnabledRequest(BaseModel):
    enabled: bool


@api_router.patch("/admin/companies/{company_id}/albert-genau-enabled")
async def admin_set_albert_genau_enabled(company_id: str, payload: AlbertGenauEnabledRequest, user=Depends(get_current_user)):
    # Albert Genau modülünün hangi firmalarda görüneceğini SADECE platform
    # admini belirler -- firma sahibi kendi kendine açamaz (bkz. Company.albertGenauEnabled).
    _require_admin(user)
    company = await db.companies.find_one({"id": company_id}, {"_id": 0, "id": 1})
    if not company:
        raise HTTPException(status_code=404, detail="Firma bulunamadı")
    await db.companies.update_one(
        {"id": company_id},
        {"$set": {"albertGenauEnabled": bool(payload.enabled), "updatedAt": utc_now_iso()}},
    )
    return {"ok": True, "companyId": company_id, "albertGenauEnabled": bool(payload.enabled)}


@api_router.patch("/admin/companies/{company_id}/zip-perde-enabled")
async def admin_set_zip_perde_enabled(company_id: str, payload: AlbertGenauEnabledRequest, user=Depends(get_current_user)):
    _require_admin(user)
    company = await db.companies.find_one({"id": company_id}, {"_id": 0, "id": 1})
    if not company:
        raise HTTPException(status_code=404, detail="Firma bulunamadı")
    await db.companies.update_one(
        {"id": company_id},
        {"$set": {"zipPerdeEnabled": bool(payload.enabled), "updatedAt": utc_now_iso()}},
    )
    return {"ok": True, "companyId": company_id, "zipPerdeEnabled": bool(payload.enabled)}


@api_router.post("/admin/impersonate/{target_user_id}", response_model=ImpersonateResponse)
async def admin_impersonate(target_user_id: str, user=Depends(get_current_user)):
    _require_admin(user)
    target = await db.users.find_one({"user_id": target_user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    if target.get("staff_owner_user_id"):
        raise HTTPException(status_code=400, detail="Bu bir personel hesabı — doğrudan firma sahibine giriş yapın")
    target_email = (target.get("email") or "").strip().lower()
    if target_email in ADMIN_EMAILS:
        raise HTTPException(status_code=400, detail="Admin hesabına giriş yapılamaz")
    token, jti = _make_impersonation_token(target, user["email"])
    company = await db.companies.find_one({"userId": target_user_id}, {"_id": 0, "sirketAdi": 1})
    await db.admin_impersonation_log.insert_one({
        "id": str(uuid.uuid4()),
        "admin_user_id": user["user_id"],
        "admin_email": user["email"],
        "target_user_id": target_user_id,
        "target_email": target.get("email"),
        "jti": jti,
        "started_at": utc_now_iso(),
        "ended_at": None,
    })
    target_out = dict(target)
    target_out["is_staff"] = False
    target_out["_impersonated"] = True
    target_out["_impersonated_by"] = user["email"]
    return ImpersonateResponse(
        access_token=token,
        user=_user_out(target_out),
        company_name=(company or {}).get("sirketAdi", ""),
    )


@api_router.post("/admin/impersonate/end")
async def admin_impersonate_end(authorization: Optional[str] = Header(None)):
    # Bilinçli olarak get_current_user KULLANMIYOR: o fonksiyon "imp" token'ını
    # zaten hedef müşteriye çözümler, admin kimliğine değil. Burada tek amaç,
    # elimizdeki (Authorization header'daki) impersonation token'ının kendisini
    # sunucu tarafında iptal etmek -- bunun için token'ın kendisi (jti) yeterli
    # kanıttır, başka bir yetki kontrolüne gerek yok.
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization[7:].strip()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM], issuer=JWT_ISSUER, audience=JWT_AUDIENCE)
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    if not payload.get("imp"):
        raise HTTPException(status_code=400, detail="Bu bir destek (impersonation) oturumu değil")
    jti = payload.get("jti")
    if jti:
        await db.revoked_tokens.insert_one({"jti": jti, "revoked_at": utc_now_iso(), "reason": "impersonation_end"})
        await db.admin_impersonation_log.update_one({"jti": jti}, {"$set": {"ended_at": utc_now_iso()}})
    return {"ok": True}


class PromoRedeemRequest(BaseModel):
    code: str


@api_router.post("/promo/redeem")
async def redeem_promo_code(payload: PromoRedeemRequest, user=Depends(get_current_user)):
    _rate_limit(f"promo-redeem:user:{user['user_id']}", 10, 3600)
    if user.get("is_staff"):
        raise HTTPException(status_code=403, detail="Hediye kodunu sadece firma sahibi kullanabilir")
    code = (payload.code or "").strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Kod giriniz")
    doc = await db.promo_codes.find_one({"code": code})
    if not doc:
        raise HTTPException(status_code=404, detail="Kod geçersiz")
    if doc.get("used"):
        raise HTTPException(status_code=400, detail="Bu kod daha önce kullanılmış")

    duration_days = doc.get("duration_days", 90)
    # Zaten aktif bir aboneliği varsa süresini kısaltmamak için mevcut bitiş
    # tarihinden, yoksa şu andan itibaren ekliyoruz (checkout'taki mantıkla aynı).
    base = utc_now()
    current_expiry_raw = user.get("subscription_expires_at")
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

    result = await db.promo_codes.update_one(
        {"code": code, "used": False},
        {"$set": {
            "used": True,
            "used_by_user_id": user["user_id"],
            "used_by_email": user.get("email"),
            "used_at": utc_now_iso(),
        }},
    )
    if result.modified_count == 0:
        # Aynı anda başka bir istek kodu kullanmış olabilir (yarış durumu).
        raise HTTPException(status_code=400, detail="Bu kod daha önce kullanılmış")

    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "subscription_status": "active",
            "subscription_expires_at": new_expiry.isoformat(),
            "subscription_plan": "promo",
            # Abonelik ekraninda "90 gunluk hediye kodunun X gunu kaldi"
            # diyebilmek icin toplam sure ve kullanim ani da saklanir.
            "promo_code": code,
            "promo_days_total": duration_days,
            "promo_redeemed_at": utc_now_iso(),
        }},
    )
    return {"ok": True, "subscription_expires_at": new_expiry.isoformat(), "duration_days": duration_days}


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


# ============ SÖZLEŞMELER ============
# Onaylanan tekliften ya da sıfırdan hazırlanan satış/hizmet sözleşmeleri.
# Metin düz yazı olarak saklanır ("MADDE 1 - ..." başlıkları); PDF istemcide
# üretilir. Yapay zeka taslağı Anthropic ile yazılır, kullanıcı düzenleyip kaydeder.
CONTRACT_STATUSES = ("Taslak", "Gönderildi", "İmzalandı", "İptal")


class Contract(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    userId: str
    companyId: str
    quoteId: str = ""
    teklifNo: str = ""
    baslik: str
    musFirma: str = ""
    musYetkili: str = ""
    musTelefon: str = ""
    musEmail: str = ""
    musAdres: str = ""
    tutar: float = 0.0
    paraBirimi: str = "TRY"
    icerik: str = ""
    durum: str = "Taslak"
    isTemplate: bool = False
    createdByEmail: str = ""
    createdAt: str = Field(default_factory=utc_now_iso)
    updatedAt: str = Field(default_factory=utc_now_iso)


class ContractCreate(BaseModel):
    companyId: str
    quoteId: str = ""
    teklifNo: str = ""
    baslik: str
    musFirma: str = ""
    musYetkili: str = ""
    musTelefon: str = ""
    musEmail: str = ""
    musAdres: str = ""
    tutar: float = 0.0
    paraBirimi: str = "TRY"
    icerik: str = ""
    durum: str = "Taslak"
    isTemplate: bool = False


class ContractUpdate(BaseModel):
    baslik: Optional[str] = None
    musFirma: Optional[str] = None
    musYetkili: Optional[str] = None
    musTelefon: Optional[str] = None
    musEmail: Optional[str] = None
    musAdres: Optional[str] = None
    tutar: Optional[float] = None
    paraBirimi: Optional[str] = None
    icerik: Optional[str] = None
    durum: Optional[str] = None
    isTemplate: Optional[bool] = None


class ContractAiRequest(BaseModel):
    companyId: str
    quoteId: str = ""
    sozlesmeTuru: str = ""       # ör. "Satış ve montaj sözleşmesi"
    talimat: str = ""            # kullanıcının ek istekleri (ödeme planı, garanti süresi...)
    mevcutMetin: str = ""        # doluysa: bu metni talimata göre düzenle
    dil: str = "tr"             # kullanıcının uygulama dili: tr | en | it
    musFirma: str = ""
    musYetkili: str = ""
    musAdres: str = ""
    musTelefon: str = ""
    musEmail: str = ""
    tutar: float = 0.0
    paraBirimi: str = "TRY"


class ContractAiResponse(BaseModel):
    baslik: str
    icerik: str


CONTRACT_SYSTEM_PROMPT = (
    "Sen Türk hukukuna ve ticari teamüllere hakim, KOBİ'ler için sözleşme hazırlayan bir asistansın. "
    "Verilen firma (SATICI/YÜKLENİCİ) ve müşteri (ALICI/İŞ SAHİBİ) bilgileri ile teklif kalemlerinden "
    "anlaşılır, dengeli ve uygulanabilir bir sözleşme metni yazarsın (varsayılan dil Türkçe; kullanıcı DİL belirtirse metnin tamamı o dilde olur).\n"
    "Kurallar:\n"
    "- Çıktı SADECE sözleşme metnidir; açıklama, selamlama, markdown (#, **, ```) KULLANMA.\n"
    "- İlk satır sözleşmenin başlığıdır (ör. SATIŞ VE MONTAJ SÖZLEŞMESİ), büyük harfle.\n"
    "- Maddeleri 'MADDE 1 - TARAFLAR' biçiminde numaralandır; alt bentleri (a), (b) veya 1.1 şeklinde yaz.\n"
    "- Tipik maddeler: Taraflar, Sözleşmenin Konusu, Ürün/Hizmet ve Kapsam, Bedel ve Ödeme Koşulları, "
    "Teslim/Montaj Süresi ve Yeri, Tarafların Yükümlülükleri, Garanti ve Servis, Cayma/Fesih, Mücbir Sebep, "
    "Kişisel Verilerin Korunması (KVKK), Uyuşmazlıkların Çözümü (yetkili mahkeme/icra daireleri), Yürürlük.\n"
    "- Teklifte olmayan bilgileri UYDURMA: bilinmeyen tarih, IBAN, kimlik no vb. için '........' boşluk bırak.\n"
    "- Tutarları teklifteki para birimiyle ve KDV durumunu belirterek yaz.\n"
    "- Tüketiciye satışsa 6502 sayılı Tüketicinin Korunması Hakkında Kanun'a uygun cayma ve garanti hükümleri ekle.\n"
    "- Sonda tarih, taraf adları ve imza alanları bulunsun (SATICI / ALICI, Ad Soyad - İmza - Kaşe).\n"
    "- Kullanıcı mevcut bir metin verip düzenleme istediyse, metnin tamamını düzenlenmiş haliyle geri ver."
)


def _contract_quote_context(company: Dict[str, Any], quote: Optional[Dict[str, Any]]) -> str:
    lines = [
        "SATICI / YÜKLENİCİ FİRMA:",
        f"- Unvan: {company.get('sirketAdi', '')}",
        f"- Adres: {company.get('adres', '')}",
        f"- Telefon: {company.get('telefon', '')}  E-posta: {company.get('email', '')}",
        f"- Vergi Dairesi / No: {company.get('vergiDairesi', '')} / {company.get('vergiNo', '')}",
    ]
    if quote:
        cur = quote.get("paraBirimi") or "TRY"
        lines += [
            "",
            f"TEKLİF No {quote.get('teklifNo', '')} (tarih {quote.get('tarih', '')}, geçerlilik {quote.get('gecerlilik', '')}):",
            f"- Müşteri: {quote.get('musFirma', '')} / Yetkili: {quote.get('musYetkili', '')}",
            f"- Müşteri adresi: {quote.get('musAdres', '')}  Tel: {quote.get('musTelefon', '')}  E-posta: {quote.get('musEmail', '')}",
            f"- Proje: {quote.get('projeAdi', '')}",
            f"- Ödeme şekli: {quote.get('odemeSekli', '')}",
            f"- Teslim süresi (gün): {quote.get('teslimGun', '')}  Teslim şekli: {quote.get('nakliye', '')}",
            "- Kalemler:",
        ]
        for i, it in enumerate(quote.get("items") or [], 1):
            ad = it.get("urunAdi") or it.get("sistemTipi") or "Kalem"
            fields = ", ".join(f"{f.get('label')}: {f.get('value')}" for f in (it.get("sistemFields") or []) if f.get("value"))
            desc = (it.get("aciklama") or "").replace("\n", " ")[:300]
            lines.append(
                f"  {i}. {ad} — {it.get('adet', 1)} {it.get('birim', 'Adet')} x {it.get('birimFiyat', 0)} {cur}"
                + (f" ({fields})" if fields else "")
                + (f" — {desc}" if desc else "")
            )
        lines += [
            f"- Ara toplam: {quote.get('araToplam', 0)} {cur}, iskonto: {quote.get('iskontoTutar', 0)} {cur}",
            f"- KDV %{quote.get('kdvOrani', 20)}: {quote.get('kdvTutar', 0)} {cur}",
            f"- GENEL TOPLAM (KDV dahil): {quote.get('genelToplam', 0)} {cur}",
        ]
        if quote.get("notlar"):
            lines.append(f"- Teklif notları: {str(quote.get('notlar'))[:800]}")
    return "\n".join(lines)


@api_router.get("/contracts/{company_id}", response_model=List[Contract])
async def list_contracts(company_id: str, user=Depends(get_current_user)):
    await _own_company(user, company_id)
    docs = await db.contracts.find(
        {"companyId": company_id, "userId": user["user_id"]}, {"_id": 0}
    ).sort("updatedAt", -1).to_list(1000)
    return [Contract(**d) for d in docs]


@api_router.post("/contracts", response_model=Contract)
async def create_contract(payload: ContractCreate, user=Depends(get_current_user)):
    await _own_company(user, payload.companyId)
    data = payload.dict()
    if data["durum"] not in CONTRACT_STATUSES:
        data["durum"] = "Taslak"
    obj = Contract(userId=user["user_id"], createdByEmail=user.get("email", ""), **data)
    await db.contracts.insert_one(obj.dict())
    return obj


@api_router.put("/contracts/{contract_id}", response_model=Contract)
async def update_contract(contract_id: str, payload: ContractUpdate, user=Depends(get_current_user)):
    doc = await db.contracts.find_one({"id": contract_id, "userId": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Sözleşme bulunamadı")
    await _own_company(user, doc["companyId"])
    patch = {k: v for k, v in payload.dict().items() if v is not None}
    if "durum" in patch and patch["durum"] not in CONTRACT_STATUSES:
        raise HTTPException(status_code=422, detail="Geçersiz durum")
    patch["updatedAt"] = utc_now_iso()
    await db.contracts.update_one({"id": contract_id, "userId": user["user_id"]}, {"$set": patch})
    doc.update(patch)
    return Contract(**doc)


@api_router.delete("/contracts/{contract_id}")
async def delete_contract(contract_id: str, user=Depends(get_current_user)):
    doc = await db.contracts.find_one({"id": contract_id, "userId": user["user_id"]}, {"_id": 0, "companyId": 1})
    if not doc:
        raise HTTPException(status_code=404, detail="Sözleşme bulunamadı")
    await _own_company(user, doc["companyId"])
    await db.contracts.delete_one({"id": contract_id, "userId": user["user_id"]})
    return {"ok": True}


@api_router.post("/contracts/ai-draft", response_model=ContractAiResponse)
async def contract_ai_draft(payload: ContractAiRequest, user=Depends(get_current_user)):
    if not _anthropic_client:
        raise HTTPException(status_code=503, detail="Yapay zeka henüz yapılandırılmadı")
    _rate_limit(f"contract-ai:user:{user['user_id']}", 30, 24 * 3600)
    company = await _own_company(user, payload.companyId)
    quote = None
    if payload.quoteId:
        quote = await db.quotes.find_one(
            {"id": payload.quoteId, "userId": user["user_id"], "companyId": payload.companyId}, {"_id": 0}
        )
        if quote and not _can_see_quote(user, quote):
            quote = None
        if not quote:
            raise HTTPException(status_code=404, detail="Teklif bulunamadı")
    parts = [_contract_quote_context(company, quote)]
    if payload.musFirma or payload.musYetkili or payload.musAdres or payload.musTelefon or payload.musEmail:
        # Kullanıcının sözleşme ekranında girdiği / müşteri kaydından doldurduğu
        # güncel bilgiler teklifteki eski/eksik bilgilere göre önceliklidir.
        parts.append(
            f"\nMÜŞTERİ (güncel, öncelikli): {payload.musFirma} / Yetkili: {payload.musYetkili} / "
            f"Adres: {payload.musAdres} / Tel: {payload.musTelefon} / E-posta: {payload.musEmail}"
        )
    if not quote and payload.tutar:
        parts.append(f"Sözleşme bedeli: {payload.tutar} {payload.paraBirimi}")
    parts.append(f"\nSözleşme türü: {payload.sozlesmeTuru.strip() or 'Satış ve hizmet sözleşmesi'}")
    parts.append(f"Bugünün tarihi: {_utc().strftime('%d.%m.%Y')}")
    if payload.talimat.strip():
        parts.append(f"Kullanıcının ek istekleri: {payload.talimat.strip()[:2000]}")
    dil = (payload.dil or "tr").lower()
    if dil in ("en", "it"):
        dil_adi = "İngilizce (English)" if dil == "en" else "İtalyanca (Italiano)"
        parts.append(
            f"DİL: Sözleşmenin TAMAMINI {dil_adi} yaz (başlık, madde başlıkları ve imza alanları dahil; "
            f"madde başlıklarını {'ARTICLE 1 - PARTIES' if dil == 'en' else 'ARTICOLO 1 - PARTI'} biçiminde yaz). "
            "Türkiye'ye özgü kanun numaralarına (6502, 6698 vb.) atıf yapma; genel ve uygulanabilir hükümler kullan, "
            "yetkili mahkeme/yer için '........' bırak."
        )
    if payload.mevcutMetin.strip():
        parts.append("\nDÜZENLENECEK MEVCUT METİN:\n" + payload.mevcutMetin.strip()[:20000])
    try:
        resp = await asyncio.to_thread(
            _anthropic_client.messages.create,
            model="claude-sonnet-5",
            max_tokens=8000,
            system=CONTRACT_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": "\n".join(parts)}],
        )
        text = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text").strip()
        if getattr(resp, "stop_reason", None) == "max_tokens":
            logger.warning("Contract AI hit max_tokens; returning truncated text with a note")
            text += "\n\n[... Metin uzunluk sınırına takıldı; eksik kalan maddeleri 'Düzenle' ile tamamlatabilirsiniz.]"
    except Exception as e:
        logger.error(f"Contract AI error: {e}")
        raise HTTPException(status_code=502, detail="Yapay zeka şu anda yanıt veremiyor, lütfen tekrar deneyin")
    text = re.sub(r"^```[a-z]*\n?|\n?```$", "", text).replace("**", "").strip()
    if not text:
        raise HTTPException(status_code=502, detail="Sözleşme metni oluşturulamadı")
    first, _, rest = text.partition("\n")
    baslik = first.strip().lstrip("#").strip()[:120] or "SÖZLEŞME"
    return ContractAiResponse(baslik=baslik, icerik=text)


# ============ STOK TAKİBİ ============
# Katalogda "stokTakip" açık olan ürünler için stok hareketleri. Teklif
# "Onaylandı" olunca kalemlerdeki adet, ürün adı eşleşen katalog kaleminden
# otomatik düşer; onaydan çıkınca geri eklenir (bkz. update_quote_status).
class StockMove(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    userId: str
    companyId: str
    itemId: str
    urunAdi: str = ""
    tip: str  # giris | cikis | duzeltme | satis | iade
    miktar: float  # işaretli: + stoka giriş, - stoktan çıkış
    onceki: float = 0.0
    sonraki: float = 0.0
    aciklama: str = ""
    quoteId: str = ""
    createdByEmail: str = ""
    createdAt: str = Field(default_factory=utc_now_iso)


class StockMoveCreate(BaseModel):
    companyId: str
    tip: str  # giris | cikis | duzeltme (sayım: miktar = yeni stok)
    miktar: float
    aciklama: str = ""


async def _log_stock_move(user, item, tip, miktar, onceki, sonraki, aciklama, quote_id=""):
    mv = StockMove(
        userId=user["user_id"], companyId=item.get("companyId", ""), itemId=item["id"],
        urunAdi=item.get("urunAdi", ""), tip=tip, miktar=round(float(miktar), 4),
        onceki=round(float(onceki), 4), sonraki=round(float(sonraki), 4),
        aciklama=(aciklama or "")[:300], quoteId=quote_id, createdByEmail=_actor_email(user),
    )
    await db.stock_moves.insert_one(mv.dict())


async def _apply_quote_stock(user: Dict[str, Any], quote: Dict[str, Any], sign: int) -> bool:
    """sign=-1: onay (stoktan düş), +1: onaydan çıkış (geri ekle). Stok takipli
    en az bir ürün etkilendiyse True döner."""
    items = quote.get("items") or []
    if not items:
        return False
    catalog = await db.catalog.find(
        {"userId": user["user_id"], "companyId": quote.get("companyId"), "stokTakip": True}, {"_id": 0}
    ).to_list(5000)
    by_name: Dict[str, Dict[str, Any]] = {}
    for c in catalog:
        k = (c.get("urunAdi") or "").strip().casefold()
        if k and k not in by_name:
            by_name[k] = c
    if not by_name:
        return False
    qty: Dict[str, float] = {}
    for it in items:
        k = (it.get("urunAdi") or it.get("sistemTipi") or "").strip().casefold()
        if k in by_name:
            qty[k] = qty.get(k, 0.0) + float(it.get("adet") or 0)
    touched = False
    for k, q in qty.items():
        if q <= 0:
            continue
        c = by_name[k]
        await db.catalog.update_one({"id": c["id"], "userId": user["user_id"]}, {"$inc": {"stok": sign * q}})
        after = await db.catalog.find_one({"id": c["id"], "userId": user["user_id"]}, {"_id": 0}) or c
        sonraki = float(after.get("stok") or 0)
        await _log_stock_move(
            user, after, "satis" if sign < 0 else "iade", sign * q, sonraki - sign * q, sonraki,
            f"Teklif {quote.get('teklifNo', '')} " + ("onaylandı" if sign < 0 else "onaydan çıkarıldı"),
            quote.get("id", ""),
        )
        touched = True
    return touched


@api_router.post("/catalog/{item_id}/stock", response_model=CatalogItem)
async def move_catalog_stock(item_id: str, payload: StockMoveCreate, user=Depends(get_current_user)):
    await _own_company(user, payload.companyId)
    doc = await db.catalog.find_one({"id": item_id, "userId": user["user_id"], "companyId": payload.companyId}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Ürün bulunamadı")
    if payload.tip not in ("giris", "cikis", "duzeltme"):
        raise HTTPException(422, "Geçersiz hareket tipi")
    onceki = float(doc.get("stok") or 0)
    if payload.tip == "duzeltme":
        sonraki = float(payload.miktar)
        delta = sonraki - onceki
    else:
        m = abs(float(payload.miktar))
        if m <= 0:
            raise HTTPException(422, "Miktar girin")
        delta = m if payload.tip == "giris" else -m
        sonraki = onceki + delta
    await db.catalog.update_one(
        {"id": item_id, "userId": user["user_id"]}, {"$set": {"stok": sonraki, "stokTakip": True}}
    )
    doc.update({"stok": sonraki, "stokTakip": True})
    default_note = {"giris": "Stok girişi", "cikis": "Stok çıkışı", "duzeltme": "Sayım düzeltmesi"}[payload.tip]
    await _log_stock_move(user, doc, payload.tip, delta, onceki, sonraki, payload.aciklama.strip() or default_note)
    return CatalogItem(**doc)


@api_router.get("/stock-moves/{company_id}", response_model=List[StockMove])
async def list_stock_moves(company_id: str, itemId: Optional[str] = None, user=Depends(get_current_user)):
    await _own_company(user, company_id)
    q: Dict[str, Any] = {"userId": user["user_id"], "companyId": company_id}
    if itemId:
        q["itemId"] = itemId
    docs = await db.stock_moves.find(q, {"_id": 0}).sort("createdAt", -1).to_list(500)
    return [StockMove(**d) for d in docs]


# ============ KUPON / KAMPANYA KODLARI ============
class Coupon(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    userId: str
    companyId: str
    kod: str
    aciklama: str = ""
    tip: str = "yuzde"  # yuzde | tutar
    deger: float = 0.0
    paraBirimi: str = "TRY"  # tip=tutar için
    baslangic: str = ""  # YYYY-MM-DD, boşsa hemen
    bitis: str = ""  # YYYY-MM-DD, boşsa süresiz
    maxKullanim: int = 0  # 0 = sınırsız
    kullanim: int = 0
    aktif: bool = True
    createdAt: str = Field(default_factory=utc_now_iso)


class CouponCreate(BaseModel):
    companyId: str
    kod: str
    aciklama: str = ""
    tip: str = "yuzde"
    deger: float = 0.0
    paraBirimi: str = "TRY"
    baslangic: str = ""
    bitis: str = ""
    maxKullanim: int = 0
    aktif: bool = True


class CouponValidateRequest(BaseModel):
    companyId: str
    kod: str


def _norm_coupon_code(kod: str) -> str:
    return re.sub(r"[^A-Z0-9_-]", "", (kod or "").strip().upper().replace("İ", "I"))[:30]


def _coupon_clean(payload: CouponCreate) -> Dict[str, Any]:
    d = payload.dict()
    d["kod"] = _norm_coupon_code(d["kod"])
    if len(d["kod"]) < 3:
        raise HTTPException(422, "Kod en az 3 karakter olmalı (harf, rakam, - veya _)")
    if d["tip"] not in ("yuzde", "tutar"):
        raise HTTPException(422, "Geçersiz indirim tipi")
    if d["deger"] <= 0 or (d["tip"] == "yuzde" and d["deger"] > 100):
        raise HTTPException(422, "İndirim değeri geçersiz")
    for f in ("baslangic", "bitis"):
        if d[f] and not re.match(r"^\d{4}-\d{2}-\d{2}$", d[f]):
            raise HTTPException(422, "Tarih YYYY-AA-GG biçiminde olmalı")
    d["aciklama"] = d["aciklama"].strip()[:200]
    d["maxKullanim"] = max(0, int(d["maxKullanim"] or 0))
    return d


@api_router.get("/coupons/{company_id}", response_model=List[Coupon])
async def list_coupons(company_id: str, user=Depends(get_current_user)):
    await _own_company(user, company_id)
    docs = await db.coupons.find({"userId": user["user_id"], "companyId": company_id}, {"_id": 0}).sort("createdAt", -1).to_list(1000)
    return [Coupon(**d) for d in docs]


@api_router.post("/coupons", response_model=Coupon)
async def create_coupon(payload: CouponCreate, user=Depends(get_current_user)):
    _require_owner(user)
    await _own_company(user, payload.companyId)
    d = _coupon_clean(payload)
    if await db.coupons.find_one({"userId": user["user_id"], "companyId": payload.companyId, "kod": d["kod"]}):
        raise HTTPException(409, "Bu kod zaten var")
    obj = Coupon(userId=user["user_id"], **d)
    await db.coupons.insert_one(obj.dict())
    return obj


@api_router.put("/coupons/{coupon_id}", response_model=Coupon)
async def update_coupon(coupon_id: str, payload: CouponCreate, user=Depends(get_current_user)):
    _require_owner(user)
    await _own_company(user, payload.companyId)
    doc = await db.coupons.find_one({"id": coupon_id, "userId": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Kupon bulunamadı")
    d = _coupon_clean(payload)
    if d["kod"] != doc["kod"] and await db.coupons.find_one({"userId": user["user_id"], "companyId": payload.companyId, "kod": d["kod"]}):
        raise HTTPException(409, "Bu kod zaten var")
    doc.update(d)
    await db.coupons.replace_one({"id": coupon_id, "userId": user["user_id"]}, doc)
    return Coupon(**doc)


@api_router.delete("/coupons/{coupon_id}")
async def delete_coupon(coupon_id: str, user=Depends(get_current_user)):
    _require_owner(user)
    await db.coupons.delete_one({"id": coupon_id, "userId": user["user_id"]})
    return {"ok": True}


@api_router.post("/coupons/validate", response_model=Coupon)
async def validate_coupon(payload: CouponValidateRequest, user=Depends(get_current_user)):
    await _own_company(user, payload.companyId)
    kod = _norm_coupon_code(payload.kod)
    doc = await db.coupons.find_one({"userId": user["user_id"], "companyId": payload.companyId, "kod": kod}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Kupon bulunamadı")
    today = _istanbul_today().isoformat()
    if not doc.get("aktif", True):
        raise HTTPException(422, "Bu kupon pasif")
    if doc.get("baslangic") and today < doc["baslangic"]:
        raise HTTPException(422, "Bu kupon henüz başlamadı")
    if doc.get("bitis") and today > doc["bitis"]:
        raise HTTPException(422, "Bu kuponun süresi doldu")
    if doc.get("maxKullanim") and int(doc.get("kullanim") or 0) >= int(doc["maxKullanim"]):
        raise HTTPException(422, "Bu kuponun kullanım hakkı doldu")
    return Coupon(**doc)


async def _consume_coupon(user: Dict[str, Any], company_id: str, kod: str) -> None:
    await db.coupons.update_one(
        {"userId": user["user_id"], "companyId": company_id, "kod": _norm_coupon_code(kod)},
        {"$inc": {"kullanim": 1}},
    )


# ============ PERSONEL PRİMİ ============
# Sadece oranlar saklanır; hesap (onaylanan teklifler x oran) istemcide,
# zaten yüklü teklif listesi ve kurlar üzerinden yapılır.
class CommissionRule(BaseModel):
    memberId: str
    oran: float = 0.0  # yüzde
    baz: str = "ciro"  # ciro (KDV hariç) | kar (ciro - maliyet)


class CommissionSettings(BaseModel):
    companyId: str
    rules: List[CommissionRule] = Field(default_factory=list)


@api_router.get("/commission-settings/{company_id}", response_model=CommissionSettings)
async def get_commission_settings(company_id: str, user=Depends(get_current_user)):
    _require_manager(user)
    await _own_company(user, company_id)
    doc = await db.commission_settings.find_one({"userId": user["user_id"], "companyId": company_id}, {"_id": 0})
    return CommissionSettings(companyId=company_id, rules=(doc or {}).get("rules", []))


@api_router.put("/commission-settings", response_model=CommissionSettings)
async def put_commission_settings(payload: CommissionSettings, user=Depends(get_current_user)):
    _require_manager(user)
    await _own_company(user, payload.companyId)
    rules = []
    for r in payload.rules[:200]:
        if r.baz not in ("ciro", "kar"):
            r.baz = "ciro"
        r.oran = max(0.0, min(100.0, float(r.oran or 0)))
        rules.append(r.dict())
    await db.commission_settings.update_one(
        {"userId": user["user_id"], "companyId": payload.companyId},
        {"$set": {"rules": rules, "updatedAt": utc_now_iso()}},
        upsert=True,
    )
    return CommissionSettings(companyId=payload.companyId, rules=rules)


# ============ AI: GOOGLE / TRIPADVISOR YORUM YANITI ============
REVIEW_REPLY_SYSTEM_PROMPT = (
    "Bir işletme sahibinin adına, müşterinin herkese açık yorumuna (Google Haritalar, TripAdvisor vb.) "
    "yazılacak yanıtı hazırlıyorsun. Kurallar: 2-5 cümle, doğal ve insani; kopyala-yapıştır gibi durmasın. "
    "Müşteriye adıyla (varsa) hitap et. Olumlu yorumda somut bir detaya değinerek teşekkür et ve tekrar bekle. "
    "Olumsuz yorumda savunmaya geçme, tartışma; özür dile, sorunu kabul et, çözüm için iletişim kanalını "
    "(telefon/e-posta verilmişse onu) öner. Yapılmamış bir şeyi vaat etme, indirim/para iadesi teklif etme "
    "(kullanıcı talimatında yoksa). Kişisel veri, sipariş detayı veya iç bilgi paylaşma. Emoji kullanma. "
    "Sonunu işletme adıyla imzala. SADECE yanıt metnini yaz; başlık, tırnak veya açıklama ekleme."
)


class ReviewReplyRequest(BaseModel):
    companyId: str
    yorum: str
    puan: int = 5
    musteriAdi: str = ""
    ton: str = "profesyonel"  # profesyonel | samimi | resmi | ozur
    talimat: str = ""
    dil: str = "tr"


class ReviewReplyResponse(BaseModel):
    yanit: str


@api_router.post("/ai/review-reply", response_model=ReviewReplyResponse)
async def ai_review_reply(payload: ReviewReplyRequest, user=Depends(get_current_user)):
    if not _anthropic_client:
        raise HTTPException(status_code=503, detail="Yapay zeka henüz yapılandırılmadı")
    if not payload.yorum.strip():
        raise HTTPException(422, "Yorum metnini girin")
    _rate_limit(f"review-ai:user:{user['user_id']}", 80, 24 * 3600)
    company = await _own_company(user, payload.companyId)
    ton_map = {
        "profesyonel": "profesyonel ve sıcak",
        "samimi": "samimi, içten, esnaf sıcaklığında",
        "resmi": "resmi ve kurumsal",
        "ozur": "özür dileyen, çözüm odaklı ve alçakgönüllü",
    }
    dil_map = {"tr": "Türkçe", "en": "İngilizce (English)", "it": "İtalyanca (Italiano)"}
    dil = dil_map.get((payload.dil or "tr").lower(), None)
    parts = [
        f"İşletme: {company.get('sirketAdi', '')}",
        f"İletişim: tel {company.get('telefon', '') or '-'}, e-posta {company.get('email', '') or '-'}",
        f"Puan: {max(1, min(5, payload.puan))}/5",
        f"Müşteri adı: {payload.musteriAdi.strip() or '(bilinmiyor)'}",
        f"Ton: {ton_map.get(payload.ton, ton_map['profesyonel'])}",
        f"Yanıt dili: {dil or 'yorumun yazıldığı dil'}",
    ]
    if payload.talimat.strip():
        parts.append(f"İşletme sahibinin ek notu: {payload.talimat.strip()[:800]}")
    parts.append("\nMÜŞTERİ YORUMU:\n" + payload.yorum.strip()[:4000])
    try:
        resp = await asyncio.to_thread(
            _anthropic_client.messages.create,
            model="claude-sonnet-5",
            max_tokens=700,
            system=REVIEW_REPLY_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": "\n".join(parts)}],
        )
        text = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text").strip()
    except Exception as e:
        logger.error(f"Review AI error: {e}")
        raise HTTPException(status_code=502, detail="Yapay zeka şu anda yanıt veremiyor, lütfen tekrar deneyin")
    text = text.replace("**", "").strip().strip('"').strip()
    if not text:
        raise HTTPException(status_code=502, detail="Yanıt oluşturulamadı")
    return ReviewReplyResponse(yanit=text)


# ============ TAKVİM SENKRONU (.ics) ============
# Dışa: firmaya özel gizli bir abonelik adresi (webcal) -- Google/Apple/Outlook
# takvimine bir kez eklenir, hatırlatmalar/servis/bakım/vade günleri orada
# kendiliğinden görünür. İçe: .ics dosyasındaki etkinlikler hatırlatıcı olur.
class CalendarFeedOut(BaseModel):
    url: str
    webcalUrl: str


class CalendarImportRequest(BaseModel):
    companyId: str
    ics: str


class CalendarImportResult(BaseModel):
    created: int = 0
    skipped: int = 0


def _public_base(request: Request) -> str:
    env = os.environ.get("PUBLIC_API_URL", "").rstrip("/")
    if env:
        return env
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme
    if host and not host.startswith(("localhost", "127.0.0.1")):
        proto = "https"
    return f"{proto}://{host}"


async def _calendar_feed_doc(user: Dict[str, Any], company_id: str, rotate: bool = False) -> Dict[str, Any]:
    # Yöneticiler firmanın ortak takvimini paylaşır (mevcut abonelik linkleri
    # bozulmasın diye eski kayıt biçimi korunuyor); kısıtlı personelin kendi
    # takvimi olur ve vade kayıtlarında yalnız kendi müşterileri çıkar.
    person = "" if _is_manager(user) else _self_id(user)
    q = {"userId": user["user_id"], "companyId": company_id}
    find_q = {**q, "personId": person} if person else {**q, "personId": {"$in": [None, ""]}}
    doc = await db.calendar_feeds.find_one(find_q, {"_id": 0})
    if doc and not rotate:
        return doc
    new = {**q, "personId": person, "token": py_secrets.token_urlsafe(24), "includeFinance": True, "createdAt": utc_now_iso()}
    await db.calendar_feeds.update_one(find_q, {"$set": new}, upsert=True)
    return new


def _feed_out(request: Request, token: str) -> CalendarFeedOut:
    url = f"{_public_base(request)}/api/calendar/feed/{token}.ics"
    return CalendarFeedOut(url=url, webcalUrl=re.sub(r"^https?://", "webcal://", url))


@api_router.get("/calendar/feed-url/{company_id}", response_model=CalendarFeedOut)
async def get_calendar_feed_url(company_id: str, request: Request, user=Depends(get_current_user)):
    await _own_company(user, company_id)
    doc = await _calendar_feed_doc(user, company_id)
    return _feed_out(request, doc["token"])


@api_router.post("/calendar/feed-url/{company_id}/rotate", response_model=CalendarFeedOut)
async def rotate_calendar_feed_url(company_id: str, request: Request, user=Depends(get_current_user)):
    await _own_company(user, company_id)
    doc = await _calendar_feed_doc(user, company_id, rotate=True)
    return _feed_out(request, doc["token"])


def _ics_escape(s: str) -> str:
    return (s or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\r", "").replace("\n", "\\n")


def _ics_fold(line: str) -> str:
    out, cur = [], ""
    for ch in line:
        if len((cur + ch).encode("utf-8")) > 74:
            out.append(cur)
            cur = " " + ch
        else:
            cur += ch
    out.append(cur)
    return "\r\n".join(out)


def _ics_event(uid: str, date_iso: str, summary: str, desc: str = "") -> List[str]:
    try:
        d = datetime.strptime(date_iso[:10], "%Y-%m-%d").date()
    except Exception:
        return []
    stamp = _utc().strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VEVENT",
        f"UID:{uid}@anindateklif",
        f"DTSTAMP:{stamp}",
        f"DTSTART;VALUE=DATE:{d.strftime('%Y%m%d')}",
        f"DTEND;VALUE=DATE:{(d + timedelta(days=1)).strftime('%Y%m%d')}",
        f"SUMMARY:{_ics_escape(summary)}",
    ]
    if desc:
        lines.append(f"DESCRIPTION:{_ics_escape(desc)}")
    lines.append("END:VEVENT")
    return lines


@api_router.get("/calendar/feed/{token}.ics")
async def calendar_feed(token: str):
    feed = await db.calendar_feeds.find_one({"token": token}, {"_id": 0})
    if not feed:
        raise HTTPException(404, "Takvim bulunamadı")
    uid, cid = feed["userId"], feed["companyId"]
    company = await db.companies.find_one({"id": cid, "userId": uid}, {"_id": 0, "sirketAdi": 1}) or {}
    since = (_istanbul_today() - timedelta(days=90)).isoformat()
    ev: List[str] = []
    async for r in db.manual_reminders.find({"userId": uid, "companyId": cid, "tarih": {"$gte": since}}, {"_id": 0}):
        mark = "✓ " if r.get("tamamlandi") else ""
        ev += _ics_event(f"rem-{r['id']}", r["tarih"], mark + r.get("baslik", ""), r.get("notu", ""))
    async for s in db.services.find({"userId": uid, "companyId": cid}, {"_id": 0}):
        who = s.get("musFirma") or s.get("musYetkili") or ""
        info = f"{who} {s.get('musTelefon', '')}".strip()
        if s.get("servisTarihi", "") >= since:
            ev += _ics_event(f"srv-{s['id']}", s["servisTarihi"], f"Servis: {s.get('baslik', '')} – {who}", info)
        if s.get("bakimTarihi", "") >= since:
            ev += _ics_event(f"bkm-{s['id']}", s["bakimTarihi"], f"Bakım: {s.get('baslik', '')} – {who}", info)
        if s.get("garantiBitis", "") >= since:
            ev += _ics_event(f"grn-{s['id']}", s["garantiBitis"], f"Garanti bitiyor: {s.get('baslik', '')} – {who}", info)
    if feed.get("includeFinance", True):
        dues = await db.tahsilat.find({"userId": uid, "companyId": cid, "tur": "borc", "vadeTarihi": {"$gte": since}}, {"_id": 0}).to_list(5000)
        if feed.get("personId"):
            owners = (await _tahsilat_owners({"user_id": uid}, cid, await db.tahsilat.find({"userId": uid, "companyId": cid}, {"_id": 0}).to_list(5000)))["by_id"]
            dues = [t for t in dues if owners.get(t["id"]) == feed["personId"]]
        for t in dues:
            ev += _ics_event(
                f"vade-{t['id']}", t["vadeTarihi"],
                f"Vade: {t.get('musteriAdi', '')} {t.get('tutar', 0):,.2f} {t.get('paraBirimi', 'TRY')}",
                t.get("notlar", ""),
            )
    name = f"{company.get('sirketAdi', 'Anında Teklif')} – Anında Teklif"
    lines = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//AnindaTeklif//TR", "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH", f"X-WR-CALNAME:{_ics_escape(name)}", "X-WR-TIMEZONE:Europe/Istanbul",
        "REFRESH-INTERVAL;VALUE=DURATION:PT2H", "X-PUBLISHED-TTL:PT2H",
        *ev, "END:VCALENDAR",
    ]
    body = "\r\n".join(_ics_fold(l) for l in lines) + "\r\n"
    return StreamingResponse(
        io.BytesIO(body.encode("utf-8")), media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": 'inline; filename="anindateklif.ics"', "Cache-Control": "no-cache"},
    )


def _ics_unescape(s: str) -> str:
    return s.replace("\\n", "\n").replace("\\N", "\n").replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\")


def _parse_ics_events(text: str) -> List[Dict[str, str]]:
    raw = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    lines: List[str] = []
    for l in raw:
        if l[:1] in (" ", "\t") and lines:
            lines[-1] += l[1:]
        else:
            lines.append(l)
    events, cur = [], None
    for l in lines:
        if l == "BEGIN:VEVENT":
            cur = {}
        elif l == "END:VEVENT":
            if cur is not None:
                events.append(cur)
            cur = None
        elif cur is not None and ":" in l:
            k, v = l.split(":", 1)
            name, _, params = k.partition(";")
            name = name.upper()
            if name in ("SUMMARY", "DESCRIPTION", "LOCATION", "UID") and name not in cur:
                cur[name] = _ics_unescape(v)
            elif name == "DTSTART" and "DTSTART" not in cur:
                cur["DTSTART"] = v.strip()
                cur["TZ"] = params
    return events


def _ics_date(v: str) -> Optional[str]:
    m = re.match(r"^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?", v or "")
    if not m:
        return None
    y, mo, d, hh, mi, ss, z = m.groups()
    try:
        if hh and z:
            dt = datetime(int(y), int(mo), int(d), int(hh), int(mi), int(ss), tzinfo=timezone.utc) + timedelta(hours=3)
            return dt.date().isoformat()
        return datetime(int(y), int(mo), int(d)).date().isoformat()
    except ValueError:
        return None


@api_router.post("/calendar/import", response_model=CalendarImportResult)
async def import_calendar(payload: CalendarImportRequest, user=Depends(get_current_user)):
    await _own_company(user, payload.companyId)
    if len(payload.ics) > 3_000_000:
        raise HTTPException(413, "Dosya çok büyük (en fazla 3 MB)")
    if "BEGIN:VCALENDAR" not in payload.ics[:5000].upper():
        raise HTTPException(422, "Geçerli bir .ics takvim dosyası değil")
    events = _parse_ics_events(payload.ics)
    since = (_istanbul_today() - timedelta(days=30)).isoformat()
    existing = {
        d.get("icsUid") async for d in db.manual_reminders.find(
            {"userId": user["user_id"], "companyId": payload.companyId, "icsUid": {"$nin": ["", None]}}, {"_id": 0, "icsUid": 1}
        )
    }
    res = CalendarImportResult()
    docs = []
    for e in events:
        tarih = _ics_date(e.get("DTSTART", ""))
        baslik = (e.get("SUMMARY") or "").strip()
        uid = (e.get("UID") or f"{tarih}-{baslik}")[:300]
        if not tarih or not baslik or tarih < since or uid in existing or len(docs) >= 1000:
            res.skipped += 1
            continue
        existing.add(uid)
        notu = "\n".join(x for x in [(e.get("LOCATION") or "").strip(), (e.get("DESCRIPTION") or "").strip()] if x)[:2000]
        docs.append(ManualReminder(
            userId=user["user_id"], companyId=payload.companyId, baslik=baslik[:200], notu=notu,
            tarih=tarih, icsUid=uid,
        ).dict())
    if docs:
        await db.manual_reminders.insert_many(docs)
    res.created = len(docs)
    return res


# ============ OTOMATİK E-POSTA HATIRLATMALARI ============
# Arka planda (bkz. _notify_loop) her gün sabah: vadesi yaklaşan/geçen borçlar,
# yaklaşan bakımlar ve cevapsız teklifler için MÜŞTERİYE e-posta; firma
# sahibine de günlük özet. Her gönderim notify_log'a benzersiz anahtarla
# yazılır, aynı hatırlatma asla iki kez gitmez.
class NotifySettings(BaseModel):
    companyId: str
    aktif: bool = False
    dil: str = "tr"
    vadeHatirlat: bool = True
    vadeGunOnce: int = 3
    vadeGecikme: bool = True
    bakimHatirlat: bool = True
    bakimGunOnce: int = 7
    teklifTakip: bool = True
    teklifTakipGun: int = 3
    gunlukOzet: bool = True
    ozetEmail: str = ""
    whatsapp: bool = False  # e-postaya ek olarak WhatsApp şablon mesajı da gönder
    whatsappAvailable: bool = False  # sadece çıktı: sunucuda onaylı şablon var mı


# Otomatik WhatsApp (Twilio + Meta onaylı "Utility" şablonları). Şablon SID'leri
# (HX...) ortam değişkeni olarak girilene kadar tamamen kapalıdır. Değişkenler:
# vade/gecikme: {1} müşteri, {2} firma, {3} tutar, {4} tarih
# bakim:         {1} müşteri, {2} firma, {3} iş/ürün, {4} tarih
# teklif:        {1} müşteri, {2} firma, {3} teklif no, {4} tarih
WA_TEMPLATES = {
    k: os.environ.get(f"TWILIO_WA_TPL_{k.upper()}", "").strip()
    for k in ("vade", "gecikme", "bakim", "teklif")
}
WA_DAILY_CAP = int(os.environ.get("WA_DAILY_CAP", "100"))


def _wa_available(kind: Optional[str] = None) -> bool:
    if not (TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_WHATSAPP_FROM):
        return False
    return bool(WA_TEMPLATES.get(kind)) if kind else any(WA_TEMPLATES.values())


async def _notify_wa_once(uid: str, cid: str, key: str, kind: str, phone: str, variables: Dict[str, str]) -> bool:
    if not _wa_available(kind):
        return False
    to = _normalize_phone(phone or "")
    if len(re.sub(r"\D", "", to)) < 10:
        return False
    today = _istanbul_today().isoformat()
    if await db.notify_log.count_documents({"companyId": cid, "kanal": "whatsapp", "createdAt": {"$gte": today}}) >= WA_DAILY_CAP:
        return False
    if await db.notify_log.find_one({"key": key}):
        return False
    try:
        await db.notify_log.insert_one({"key": key, "userId": uid, "companyId": cid, "tip": f"wa-{kind}", "kanal": "whatsapp",
                                        "alici": to, "konu": f"WhatsApp: {kind} – {variables.get('1', '')}",
                                        "durum": "gönderiliyor", "createdAt": utc_now_iso()})
    except DuplicateKeyError:
        return False
    ok, err = False, ""
    try:
        resp = await asyncio.to_thread(
            requests.post,
            f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json",
            auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN),
            data={"From": TWILIO_WHATSAPP_FROM, "To": f"whatsapp:{to}", "ContentSid": WA_TEMPLATES[kind],
                  "ContentVariables": json.dumps({k: (v or "-")[:120] for k, v in variables.items()}, ensure_ascii=False)},
            timeout=15,
        )
        ok = resp.status_code < 300
        if not ok:
            err = f"HTTP {resp.status_code}"
            logger.warning(f"[NotifyWA] twilio failed {resp.status_code} {resp.text[:300]}")
    except Exception as e:
        err = "Gönderim hatası"
        logger.warning(f"[NotifyWA] exception: {e}")
    await db.notify_log.update_one({"key": key}, {"$set": {"durum": "gönderildi" if ok else f"hata: {err}"}})
    return ok


class NotifyLogOut(BaseModel):
    key: str
    tip: str
    alici: str
    konu: str
    durum: str
    createdAt: str


class NotifyTestRequest(BaseModel):
    companyId: str
    email: str


NOTIFY_TEXT = {
    "tr": {
        "vade_s": "Ödeme hatırlatması – {company}",
        "vade_b": "Sayın {name},<br><br>{company} nezdindeki <b>{amount}</b> tutarındaki ödemenizin vadesi <b>{date}</b> tarihindedir.{extra}<br><br>Ödemenizi yaptıysanız bu e-postayı dikkate almayınız.",
        "gecik_s": "Vadesi geçen ödeme – {company}",
        "gecik_b": "Sayın {name},<br><br>{company} nezdindeki <b>{amount}</b> tutarındaki ödemenizin vadesi <b>{date}</b> tarihinde dolmuştur. En kısa sürede ödemenizi rica ederiz.<br><br>Ödemenizi yaptıysanız bu e-postayı dikkate almayınız.",
        "bakim_s": "Bakım zamanı yaklaşıyor – {company}",
        "bakim_b": "Sayın {name},<br><br><b>{title}</b> için periyodik bakım tarihiniz <b>{date}</b>. Uygun olduğunuz gün ve saati bize bildirirseniz randevunuzu oluşturalım.",
        "teklif_s": "Teklifimiz hakkında – {company}",
        "teklif_b": "Sayın {name},<br><br>{date} tarihinde ilettiğimiz <b>{no}</b> numaralı teklifimizi inceleme fırsatınız oldu mu? Sorularınız veya değişiklik talepleriniz için bize her zaman ulaşabilirsiniz.",
        "iban": "<br><br>Banka: {bank} – IBAN: <b>{iban}</b>",
        "contact": "İletişim",
        "ozet_s": "Bugünün özeti – {company}",
        "ozet_h": "Günaydın! {date} için özetiniz:",
        "ozet_rem": "Hatırlatmalar", "ozet_srv": "Servis / bakım", "ozet_due": "Vadesi bugün olan borçlar",
        "ozet_over": "Vadesi geçmiş borç sayısı", "ozet_sent": "Bugün müşterilere giden otomatik e-postalar",
        "test_s": "Test e-postası – {company}",
        "test_b": "Bu bir deneme e-postasıdır. Otomatik hatırlatmalar bu adresten müşterilerinize bu görünümde gidecek.",
    },
    "en": {
        "vade_s": "Payment reminder – {company}",
        "vade_b": "Dear {name},<br><br>Your payment of <b>{amount}</b> to {company} is due on <b>{date}</b>.{extra}<br><br>If you have already paid, please disregard this email.",
        "gecik_s": "Overdue payment – {company}",
        "gecik_b": "Dear {name},<br><br>Your payment of <b>{amount}</b> to {company} was due on <b>{date}</b>. We kindly ask you to settle it as soon as possible.<br><br>If you have already paid, please disregard this email.",
        "bakim_s": "Maintenance due soon – {company}",
        "bakim_b": "Dear {name},<br><br>Scheduled maintenance for <b>{title}</b> is due on <b>{date}</b>. Let us know a convenient day and time and we will book your appointment.",
        "teklif_s": "About our quote – {company}",
        "teklif_b": "Dear {name},<br><br>Have you had a chance to review quote <b>{no}</b> we sent on {date}? Feel free to contact us with any questions or changes.",
        "iban": "<br><br>Bank: {bank} – IBAN: <b>{iban}</b>",
        "contact": "Contact",
        "ozet_s": "Today's summary – {company}",
        "ozet_h": "Good morning! Your summary for {date}:",
        "ozet_rem": "Reminders", "ozet_srv": "Service / maintenance", "ozet_due": "Debts due today",
        "ozet_over": "Overdue debts", "ozet_sent": "Automatic emails sent to customers today",
        "test_s": "Test email – {company}",
        "test_b": "This is a test email. Automatic reminders will reach your customers from this address in this format.",
    },
    "it": {
        "vade_s": "Promemoria di pagamento – {company}",
        "vade_b": "Gentile {name},<br><br>il pagamento di <b>{amount}</b> a {company} scade il <b>{date}</b>.{extra}<br><br>Se ha già pagato, ignori questa email.",
        "gecik_s": "Pagamento scaduto – {company}",
        "gecik_b": "Gentile {name},<br><br>il pagamento di <b>{amount}</b> a {company} è scaduto il <b>{date}</b>. La preghiamo di provvedere al più presto.<br><br>Se ha già pagato, ignori questa email.",
        "bakim_s": "Manutenzione in scadenza – {company}",
        "bakim_b": "Gentile {name},<br><br>la manutenzione periodica di <b>{title}</b> è prevista per il <b>{date}</b>. Ci indichi giorno e ora preferiti e fisseremo l'appuntamento.",
        "teklif_s": "Il nostro preventivo – {company}",
        "teklif_b": "Gentile {name},<br><br>ha avuto modo di esaminare il preventivo <b>{no}</b> inviato il {date}? Siamo a disposizione per domande o modifiche.",
        "iban": "<br><br>Banca: {bank} – IBAN: <b>{iban}</b>",
        "contact": "Contatti",
        "ozet_s": "Riepilogo di oggi – {company}",
        "ozet_h": "Buongiorno! Il riepilogo per il {date}:",
        "ozet_rem": "Promemoria", "ozet_srv": "Assistenza / manutenzione", "ozet_due": "Debiti in scadenza oggi",
        "ozet_over": "Debiti scaduti", "ozet_sent": "Email automatiche inviate ai clienti oggi",
        "test_s": "Email di prova – {company}",
        "test_b": "Questa è un'email di prova. I promemoria automatici arriveranno ai clienti da questo indirizzo con questo aspetto.",
    },
}


def _fmt_money(v: float, cur: str) -> str:
    sym = {"TRY": "₺", "USD": "$", "EUR": "€"}.get(cur, cur + " ")
    s = f"{float(v or 0):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{sym}{s}"


def _fmt_date_tr(iso: str) -> str:
    try:
        return datetime.strptime(iso[:10], "%Y-%m-%d").strftime("%d.%m.%Y")
    except Exception:
        return iso


def _email_shell(company: Dict[str, Any], body_html: str, lang: str) -> str:
    T = NOTIFY_TEXT.get(lang, NOTIFY_TEXT["tr"])
    contact = " · ".join(esc(x) for x in [company.get("telefon", ""), company.get("email", ""), company.get("website", "")] if x)
    return (
        "<div style=\"font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;font-size:14.5px;line-height:1.55\">"
        f"<div style=\"font-weight:800;font-size:17px;color:#0369A1;margin-bottom:14px\">{esc(company.get('sirketAdi', ''))}</div>"
        f"<div>{body_html}</div>"
        f"<div style=\"margin-top:22px;padding-top:12px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12.5px\">{T['contact']}: {contact or esc(company.get('sirketAdi', ''))}</div>"
        "</div>"
    )


def _from_address_for(company: Dict[str, Any]) -> str:
    m = re.search(r"<([^>]+)>", RESEND_FROM_EMAIL)
    addr = m.group(1) if m else RESEND_FROM_EMAIL.strip()
    name = re.sub(r"[<>\"\r\n]", "", company.get("sirketAdi", "") or "Anında Teklif")[:60]
    return f"{name} <{addr}>"


async def _send_company_email(company: Dict[str, Any], to: str, subject: str, html_body: str,
                              headers: Optional[Dict[str, str]] = None) -> Tuple[bool, str]:
    if not RESEND_API_KEY:
        return False, "E-posta servisi yapılandırılmamış"
    payload: Dict[str, Any] = {"from": _from_address_for(company), "to": [to], "subject": subject[:200], "html": html_body}
    if headers:
        payload["headers"] = headers
    if company.get("email") and "@" in company["email"]:
        payload["reply_to"] = company["email"]
    try:
        resp = await asyncio.to_thread(
            requests.post, "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
            json=payload, timeout=15,
        )
        if resp.status_code in (200, 201, 202):
            return True, ""
        logger.warning(f"[Notify] resend failed status={resp.status_code} body={resp.text[:300]}")
        return False, f"HTTP {resp.status_code}"
    except Exception as e:
        logger.warning(f"[Notify] resend exception: {e}")
        return False, "Gönderim hatası"


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


async def _notify_once(uid: str, cid: str, key: str, tip: str, company: Dict[str, Any], to: str, subject: str, body: str) -> bool:
    """Aynı anahtarla ikinci kez gönderim yapmaz (unique index + önce-yaz)."""
    to = (to or "").strip()
    if not _EMAIL_RE.match(to):
        return False
    log = {"key": key, "userId": uid, "companyId": cid, "tip": tip, "alici": to, "konu": subject[:200],
           "durum": "gönderiliyor", "createdAt": utc_now_iso()}
    try:
        if await db.notify_log.find_one({"key": key}):
            return False
        await db.notify_log.insert_one(log)
    except DuplicateKeyError:
        return False
    ok, err = await _send_company_email(company, to, subject, body)
    await db.notify_log.update_one({"key": key}, {"$set": {"durum": "gönderildi" if ok else f"hata: {err}"}})
    return ok


async def _customer_email_map(uid: str, cid: str) -> Tuple[Dict[str, str], Dict[str, str]]:
    by_id, by_name = {}, {}
    async for c in db.customers.find({"userId": uid, "companyId": cid}, {"_id": 0, "id": 1, "firma": 1, "email": 1}):
        if c.get("email"):
            by_id[c["id"]] = c["email"]
            by_name[(c.get("firma") or "").strip().casefold()] = c["email"]
    return by_id, by_name


async def _run_notifications_for(settings: Dict[str, Any], today) -> int:
    uid, cid = settings["userId"], settings["companyId"]
    company = await db.companies.find_one({"id": cid, "userId": uid}, {"_id": 0})
    if not company:
        return 0
    lang = settings.get("dil") if settings.get("dil") in NOTIFY_TEXT else "tr"
    T = NOTIFY_TEXT[lang]
    cname = company.get("sirketAdi", "")
    by_id, by_name = await _customer_email_map(uid, cid)
    phone_by_id, phone_by_name = {}, {}
    async for c in db.customers.find({"userId": uid, "companyId": cid, "telefon": {"$nin": ["", None]}}, {"_id": 0, "id": 1, "firma": 1, "telefon": 1}):
        phone_by_id[c["id"]] = c["telefon"]
        phone_by_name[(c.get("firma") or "").strip().casefold()] = c["telefon"]
    bank = (company.get("banklar") or [{}])[0] if company.get("banklar") else {}
    sent = 0

    if settings.get("vadeHatirlat", True) or settings.get("vadeGecikme", True):
        entries = await db.tahsilat.find({"userId": uid, "companyId": cid}, {"_id": 0}).to_list(20000)
        # Müşteri bazında açık bakiye: tamamı ödenmiş borç için hatırlatma gitmesin.
        bal: Dict[str, float] = {}
        for t in entries:
            k = t.get("customerId") or (t.get("musteriAdi") or "").strip().casefold()
            sign = 1 if t.get("tur") == "borc" else -1
            bal[k] = bal.get(k, 0.0) + sign * float(t.get("tutar") or 0)
        target = (today + timedelta(days=int(settings.get("vadeGunOnce", 3)))).isoformat()
        yesterday = (today - timedelta(days=1)).isoformat()
        for t in entries:
            if t.get("tur") != "borc" or not t.get("vadeTarihi"):
                continue
            k = t.get("customerId") or (t.get("musteriAdi") or "").strip().casefold()
            if bal.get(k, 0) <= 0.009:
                continue
            email = by_id.get(t.get("customerId", "")) or by_name.get((t.get("musteriAdi") or "").strip().casefold(), "")
            fmt = dict(company=esc(cname), name=esc(t.get("musteriAdi", "")), amount=_fmt_money(t.get("tutar", 0), t.get("paraBirimi", "TRY")),
                       date=_fmt_date_tr(t["vadeTarihi"]), extra="")
            if bank.get("iban"):
                fmt["extra"] = T["iban"].format(bank=esc(bank.get("banka", "") or bank.get("bankaAdi", "")), iban=esc(bank["iban"]))
            wa = settings.get("whatsapp") and (t.get("musteriTelefon") or phone_by_id.get(t.get("customerId", "")) or phone_by_name.get((t.get("musteriAdi") or "").strip().casefold(), ""))
            wa_vars = {"1": t.get("musteriAdi", ""), "2": cname, "3": _fmt_money(t.get("tutar", 0), t.get("paraBirimi", "TRY")), "4": _fmt_date_tr(t["vadeTarihi"])}
            if settings.get("vadeHatirlat", True) and t["vadeTarihi"] == target:
                sent += await _notify_once(uid, cid, f"vade:{t['id']}:{target}", "vade", company, email,
                                           T["vade_s"].format(company=cname), _email_shell(company, T["vade_b"].format(**fmt), lang))
                if wa:
                    sent += await _notify_wa_once(uid, cid, f"wa:vade:{t['id']}:{target}", "vade", wa, wa_vars)
            if settings.get("vadeGecikme", True) and t["vadeTarihi"] == yesterday:
                sent += await _notify_once(uid, cid, f"gecik:{t['id']}", "gecikme", company, email,
                                           T["gecik_s"].format(company=cname), _email_shell(company, T["gecik_b"].format(**fmt), lang))
                if wa:
                    sent += await _notify_wa_once(uid, cid, f"wa:gecik:{t['id']}", "gecikme", wa, wa_vars)

    if settings.get("bakimHatirlat", True):
        target = (today + timedelta(days=int(settings.get("bakimGunOnce", 7)))).isoformat()
        async for s in db.services.find({"userId": uid, "companyId": cid, "bakimTarihi": target}, {"_id": 0}):
            if s.get("durum") == "İptal":
                continue
            email = by_name.get((s.get("musFirma") or "").strip().casefold(), "")
            body = T["bakim_b"].format(name=esc(s.get("musYetkili") or s.get("musFirma") or ""), title=esc(s.get("baslik", "")), date=_fmt_date_tr(target))
            sent += await _notify_once(uid, cid, f"bakim:{s['id']}:{target}", "bakim", company, email,
                                       T["bakim_s"].format(company=cname), _email_shell(company, body, lang))
            wa = settings.get("whatsapp") and (s.get("musTelefon") or phone_by_name.get((s.get("musFirma") or "").strip().casefold(), ""))
            if wa:
                sent += await _notify_wa_once(uid, cid, f"wa:bakim:{s['id']}:{target}", "bakim", wa, {
                    "1": s.get("musYetkili") or s.get("musFirma") or "", "2": cname, "3": s.get("baslik", ""), "4": _fmt_date_tr(target)})

    if settings.get("teklifTakip", True):
        qdate = (today - timedelta(days=int(settings.get("teklifTakipGun", 3)))).isoformat()
        async for q in db.quotes.find({"userId": uid, "companyId": cid, "durum": "Beklemede", "tarih": qdate, "deletedAt": None}, {"_id": 0}):
            email = q.get("musEmail") or by_name.get((q.get("musFirma") or "").strip().casefold(), "")
            body = T["teklif_b"].format(name=esc(q.get("musYetkili") or q.get("musFirma") or ""), no=esc(q.get("teklifNo", "")), date=_fmt_date_tr(qdate))
            sent += await _notify_once(uid, cid, f"teklif:{q['id']}", "teklif", company, email,
                                       T["teklif_s"].format(company=cname), _email_shell(company, body, lang))
            wa = settings.get("whatsapp") and (q.get("musTelefon") or phone_by_name.get((q.get("musFirma") or "").strip().casefold(), ""))
            if wa:
                sent += await _notify_wa_once(uid, cid, f"wa:teklif:{q['id']}", "teklif", wa, {
                    "1": q.get("musYetkili") or q.get("musFirma") or "", "2": cname, "3": q.get("teklifNo", ""), "4": _fmt_date_tr(qdate)})

    if settings.get("gunlukOzet", True):
        tday = today.isoformat()
        owner = await db.users.find_one({"user_id": uid}, {"_id": 0, "email": 1})
        to = settings.get("ozetEmail") or company.get("email") or (owner or {}).get("email", "")
        rems = await db.manual_reminders.find({"userId": uid, "companyId": cid, "tarih": tday, "tamamlandi": False}, {"_id": 0}).to_list(100)
        srvs = await db.services.find({"userId": uid, "companyId": cid, "$or": [{"servisTarihi": tday}, {"bakimTarihi": tday}]}, {"_id": 0}).to_list(100)
        dues = await db.tahsilat.find({"userId": uid, "companyId": cid, "tur": "borc", "vadeTarihi": tday}, {"_id": 0}).to_list(100)
        over = await db.tahsilat.count_documents({"userId": uid, "companyId": cid, "tur": "borc", "vadeTarihi": {"$gt": "", "$lt": tday}})
        auto = await db.notify_log.count_documents({"userId": uid, "companyId": cid, "createdAt": {"$gte": tday}, "tip": {"$ne": "ozet"}})
        if rems or srvs or dues:
            def ul(title, rows):
                if not rows:
                    return ""
                return f"<p style='margin:14px 0 4px'><b>{title}</b></p><ul style='margin:0;padding-left:18px'>" + "".join(f"<li>{r}</li>" for r in rows) + "</ul>"
            body = f"<p>{T['ozet_h'].format(date=_fmt_date_tr(tday))}</p>"
            body += ul(T["ozet_rem"], [esc(r.get("baslik", "")) for r in rems])
            body += ul(T["ozet_srv"], [esc(f"{s.get('baslik', '')} – {s.get('musFirma', '')} {s.get('musTelefon', '')}") for s in srvs])
            body += ul(T["ozet_due"], [esc(f"{d.get('musteriAdi', '')}: ") + _fmt_money(d.get("tutar", 0), d.get("paraBirimi", "TRY")) for d in dues])
            if over:
                body += f"<p>{T['ozet_over']}: <b>{over}</b></p>"
            if auto:
                body += f"<p>{T['ozet_sent']}: <b>{auto}</b></p>"
            await _notify_once(uid, cid, f"ozet:{cid}:{tday}", "ozet", company, to,
                               T["ozet_s"].format(company=cname), _email_shell(company, body, lang))
    return sent


async def _run_notifications(today=None) -> int:
    today = today or _istanbul_today()
    total = 0
    async for st in db.notify_settings.find({"aktif": True}, {"_id": 0}):
        try:
            total += await _run_notifications_for(st, today)
        except Exception as e:
            logger.warning(f"[Notify] company {st.get('companyId')} failed: {e}")
    return total


async def _notify_loop():
    await asyncio.sleep(90)
    while True:
        try:
            try:
                from zoneinfo import ZoneInfo
                hour = datetime.now(ZoneInfo("Europe/Istanbul")).hour
            except Exception:
                hour = (_utc() + timedelta(hours=3)).hour
            if 9 <= hour < 21:
                n = await _run_notifications()
                if n:
                    logger.info(f"[Notify] {n} otomatik e-posta gönderildi")
        except Exception as e:
            logger.warning(f"[Notify] loop error: {e}")
        await asyncio.sleep(30 * 60)


@api_router.get("/notify-settings/{company_id}", response_model=NotifySettings)
async def get_notify_settings(company_id: str, user=Depends(get_current_user)):
    _require_manager(user)
    await _own_company(user, company_id)
    doc = await db.notify_settings.find_one({"userId": user["user_id"], "companyId": company_id}, {"_id": 0})
    return NotifySettings(**{**(doc or {}), "companyId": company_id, "whatsappAvailable": _wa_available()})


@api_router.put("/notify-settings", response_model=NotifySettings)
async def put_notify_settings(payload: NotifySettings, user=Depends(get_current_user)):
    _require_manager(user)
    await _own_company(user, payload.companyId)
    d = payload.dict()
    for f in ("vadeGunOnce", "bakimGunOnce", "teklifTakipGun"):
        d[f] = max(0, min(60, int(d[f])))
    d["dil"] = d["dil"] if d["dil"] in NOTIFY_TEXT else "tr"
    d["ozetEmail"] = d["ozetEmail"].strip()[:200]
    d.pop("whatsappAvailable", None)
    if not _wa_available():
        d["whatsapp"] = False
    if d["ozetEmail"] and not _EMAIL_RE.match(d["ozetEmail"]):
        raise HTTPException(422, "Özet e-posta adresi geçersiz")
    await db.notify_settings.update_one(
        {"userId": user["user_id"], "companyId": payload.companyId},
        {"$set": {**d, "userId": user["user_id"], "updatedAt": utc_now_iso()}}, upsert=True,
    )
    return NotifySettings(**d, whatsappAvailable=_wa_available())


@api_router.get("/notify-log/{company_id}", response_model=List[NotifyLogOut])
async def list_notify_log(company_id: str, user=Depends(get_current_user)):
    _require_manager(user)
    await _own_company(user, company_id)
    docs = await db.notify_log.find({"userId": user["user_id"], "companyId": company_id}, {"_id": 0}).sort("createdAt", -1).to_list(200)
    return [NotifyLogOut(**{k: d.get(k, "") for k in NotifyLogOut.model_fields}) for d in docs]


@api_router.post("/notify-settings/test")
async def test_notify_email(payload: NotifyTestRequest, user=Depends(get_current_user)):
    _require_manager(user)
    _rate_limit(f"notify-test:{user['user_id']}", 10, 3600)
    company = await _own_company(user, payload.companyId)
    if not _EMAIL_RE.match(payload.email.strip()):
        raise HTTPException(422, "E-posta adresi geçersiz")
    st = await db.notify_settings.find_one({"userId": user["user_id"], "companyId": payload.companyId}, {"_id": 0}) or {}
    lang = st.get("dil") if st.get("dil") in NOTIFY_TEXT else "tr"
    T = NOTIFY_TEXT[lang]
    ok, err = await _send_company_email(company, payload.email.strip(), T["test_s"].format(company=company.get("sirketAdi", "")),
                                        _email_shell(company, T["test_b"], lang))
    if not ok:
        raise HTTPException(502, f"Gönderilemedi: {err}")
    return {"ok": True}


# ============ E-FATURA / E-ARŞİV KESME (Nilvera) ============
# Onaylanan tekliften fatura: alıcı e-Fatura mükellefiyse /einvoice (TEMEL/
# TİCARİ), değilse /earchive (EARSIVFATURA). Alan adları Nilvera'nın
# swagger şemasından (apitest.nilvera.com/{earchive,einvoice,general}/swagger).
UNIT_CODES = {
    "adet": "C62", "ad": "C62", "m2": "MTK", "m²": "MTK", "metrekare": "MTK", "m": "MTR", "mt": "MTR", "metre": "MTR",
    "kg": "KGM", "ton": "TNE", "lt": "LTR", "litre": "LTR", "saat": "HUR", "gün": "DAY", "gun": "DAY",
    "takım": "SET", "takim": "SET", "set": "SET", "paket": "PA", "m3": "MTQ", "m³": "MTQ", "ay": "MON", "koli": "CS",
}


class InvoiceParty(BaseModel):
    vergiNo: str
    unvan: str
    vergiDairesi: str = ""
    adres: str = ""
    il: str = ""
    ilce: str = ""
    ulke: str = "Türkiye"
    email: str = ""
    telefon: str = ""


class InvoiceRequest(BaseModel):
    companyId: str
    quoteId: str
    alici: InvoiceParty
    notlar: str = ""
    efaturaProfil: str = "TEMELFATURA"  # TEMELFATURA | TICARIFATURA (sadece e-Fatura mükellefi alıcıda)


class Invoice(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    userId: str
    companyId: str
    quoteId: str = ""
    teklifNo: str = ""
    tur: str  # earsiv | efatura
    profil: str
    uuid: str
    faturaNo: str = ""
    ortam: str = "test"
    aliciUnvan: str = ""
    aliciVergiNo: str = ""
    aliciEmail: str = ""
    paraBirimi: str = "TRY"
    araToplam: float = 0.0
    kdvTutar: float = 0.0
    genelToplam: float = 0.0
    durum: str = "Gönderildi"
    durumDetay: str = ""
    createdByEmail: str = ""
    createdAt: str = Field(default_factory=utc_now_iso)


class TaxpayerCheckRequest(BaseModel):
    companyId: str
    vergiNo: str


class TaxpayerCheckOut(BaseModel):
    mukellef: bool
    alias: str = ""
    unvan: str = ""


class PdfOut(BaseModel):
    pdfBase64: str
    fileName: str = "fatura.pdf"


class IncomingInvoiceOut(BaseModel):
    uuid: str
    faturaNo: str = ""
    gonderen: str = ""
    gonderenVkn: str = ""
    tarih: str = ""
    paraBirimi: str = "TRY"
    matrah: float = 0.0
    kdv: float = 0.0
    toplam: float = 0.0
    durum: str = ""


async def _nilvera_cfg(user: Dict[str, Any], company_id: str) -> Dict[str, Any]:
    doc = await db.efatura_configs.find_one({"companyId": company_id, "userId": user["user_id"]}, {"_id": 0})
    if not doc or not doc.get("apiKey"):
        raise HTTPException(400, "Önce e-Fatura ekranından Nilvera API anahtarınızı kaydedin")
    if not doc.get("lastTestOk"):
        raise HTTPException(400, "Önce e-Fatura ekranında bağlantı testini başarıyla tamamlayın")
    if not re.fullmatch(r"\d{10,11}", doc.get("firmaVergiNo", "")):
        raise HTTPException(400, "e-Fatura ayarlarında firmanızın VKN/TCKN bilgisini girin")
    return doc


def _nilvera_err(resp) -> str:
    try:
        j = resp.json()
        if isinstance(j, dict):
            errs = j.get("Errors") or j.get("errors") or []
            if isinstance(errs, list) and errs:
                return "; ".join(str(e.get("Description") or e.get("Detail") or e.get("Code") or e) if isinstance(e, dict) else str(e) for e in errs)[:500]
            return str(j.get("Message") or j.get("message") or j.get("title") or j)[:500]
        return str(j)[:500]
    except Exception:
        return (resp.text or f"HTTP {resp.status_code}")[:500]


async def _nilvera(cfg: Dict[str, Any], method: str, path: str, **kw):
    base = NILVERA_BASE_URLS.get(cfg.get("ortam", "test"), NILVERA_BASE_URLS["test"])
    headers = {"Authorization": f"Bearer {cfg['apiKey']}", "Accept": "application/json"}
    headers.update(kw.pop("headers", {}))
    try:
        return await asyncio.to_thread(requests.request, method, f"{base}{path}", headers=headers, timeout=45, **kw)
    except requests.exceptions.Timeout:
        raise HTTPException(504, "Nilvera yanıt vermedi (zaman aşımı), tekrar deneyin")
    except Exception as e:
        logger.error(f"nilvera {path} error: {e}")
        raise HTTPException(502, "Nilvera'ya bağlanılamadı")


def _pdf_b64_from(resp) -> str:
    if resp.content[:4] == b"%PDF":
        return base64.b64encode(resp.content).decode()
    try:
        j = resp.json()
    except Exception:
        return (resp.text or "").strip().strip('"')
    if isinstance(j, str):
        return j
    if isinstance(j, dict):
        for v in j.values():
            if isinstance(v, str) and len(v) > 100:
                return v
    return ""


async def _check_taxpayer(cfg: Dict[str, Any], vkn: str) -> TaxpayerCheckOut:
    resp = await _nilvera(cfg, "GET", f"/general/GlobalCompany/Check/TaxNumber/{vkn}", params={"globalUserType": "Invoice"})
    if resp.status_code == 404:
        return TaxpayerCheckOut(mukellef=False)
    if resp.status_code != 200:
        raise HTTPException(502, f"Mükellef sorgusu başarısız: {_nilvera_err(resp)}")
    try:
        rows = resp.json() or []
    except Exception:
        rows = []
    if not isinstance(rows, list) or not rows:
        return TaxpayerCheckOut(mukellef=False)
    pk = [r for r in rows if (r.get("Type") or "").upper() == "PK"] or rows
    alias = next((r.get("Name") for r in pk if "defaultpk" in (r.get("Name") or "")), None) or pk[0].get("Name") or ""
    return TaxpayerCheckOut(mukellef=True, alias=alias, unvan=pk[0].get("Title") or "")


async def _invoice_rate(cur: str) -> Optional[float]:
    if cur == "TRY":
        return None
    try:
        r = await get_rates()
        v = float((r.usd_try if cur == "USD" else r.eur_try) or 0)
        return round(v, 4) if v > 0 else None
    except Exception:
        return None


def _build_invoice_doc(cfg: Dict[str, Any], company: Dict[str, Any], quote: Dict[str, Any], req: InvoiceRequest,
                       profile: str, rate: Optional[float], inv_uuid: str) -> Dict[str, Any]:
    isk = float(quote.get("iskonto") or 0)
    kdv_p = float(quote.get("kdvOrani") or 0)
    lines, gross_t, allow_t, kdv_t = [], 0.0, 0.0, 0.0
    for it in quote.get("items") or []:
        qty = float(it.get("adet") or 0)
        price = float(it.get("birimFiyat") or 0)
        if qty <= 0 or price < 0:
            continue
        gross = round(qty * price, 2)
        allow = round(gross * isk / 100, 2)
        kdv = round((gross - allow) * kdv_p / 100, 2)
        gross_t += gross
        allow_t += allow
        kdv_t += kdv
        name = (it.get("urunAdi") or it.get("sistemTipi") or (it.get("aciklama") or "").split("\n")[0] or "Ürün / Hizmet").strip()[:250]
        desc_parts = [f"{f.get('label', '')}: {f.get('value', '')}" for f in (it.get("sistemFields") or []) if f.get("value")]
        desc_parts += [f"{f.get('key', '')}: {f.get('value', '')}" for f in (it.get("customFields") or []) if f.get("value")]
        if it.get("aciklama") and it.get("aciklama").strip()[:250] != name:
            desc_parts.append(it["aciklama"].strip())
        unit = UNIT_CODES.get((it.get("birim") or "Adet").strip().casefold(), "C62")
        lines.append({
            "Index": str(len(lines) + 1), "Name": name, "Description": " / ".join(desc_parts)[:500] or None,
            "Quantity": qty, "UnitType": unit, "Price": round(price, 6), "AllowanceTotal": allow,
            "KDVPercent": kdv_p, "KDVTotal": kdv,
        })
    if not lines:
        raise HTTPException(422, "Teklifte faturalanacak kalem yok")
    info: Dict[str, Any] = {
        "UUID": inv_uuid, "InvoiceType": "SATIS", "InvoiceProfile": profile,
        "IssueDate": (_utc() + timedelta(hours=3)).strftime("%Y-%m-%dT%H:%M:%S"),
        "CurrencyCode": quote.get("paraBirimi") or "TRY",
        "LineExtensionAmount": round(gross_t, 2), "GeneralAllowanceTotal": round(allow_t, 2),
        "KdvTotal": round(kdv_t, 2), "PayableAmount": round(gross_t - allow_t + kdv_t, 2),
        "GeneralKDV1Total": 0, "GeneralKDV8Total": 0, "GeneralKDV10Total": 0, "GeneralKDV18Total": 0, "GeneralKDV20Total": 0,
    }
    if int(kdv_p) in (1, 8, 10, 18, 20) and float(int(kdv_p)) == kdv_p:
        info[f"GeneralKDV{int(kdv_p)}Total"] = round(kdv_t, 2)
    if rate:
        info["ExchangeRate"] = rate
    if cfg.get("sablonId"):
        info["TemplateUUID"] = cfg["sablonId"]
    if cfg.get("faturaSerisi"):
        info["InvoiceSerieOrNumber"] = cfg["faturaSerisi"]
    a = req.alici
    if profile == "EARSIVFATURA":
        info["SalesPlatform"] = "NORMAL"
        info["SendType"] = "ELEKTRONIK" if a.email.strip() else "KAGIT"
    company_info = {
        "TaxNumber": cfg["firmaVergiNo"], "Name": cfg.get("firmaUnvani") or company.get("sirketAdi", ""),
        "TaxOffice": cfg.get("firmaVergiDairesi") or company.get("vergiDairesi", ""),
        "Address": cfg.get("firmaAdres") or company.get("adres", ""),
        "District": cfg.get("firmaIlce") or "Merkez", "City": cfg.get("firmaIl") or "", "Country": "Türkiye",
        "Phone": company.get("telefon", ""), "Mail": company.get("email", ""), "WebSite": company.get("website", ""),
    }
    customer_info = {
        "TaxNumber": a.vergiNo.strip(), "Name": a.unvan.strip(), "TaxOffice": a.vergiDairesi.strip(),
        "Address": a.adres.strip(), "District": a.ilce.strip() or "Merkez", "City": a.il.strip(),
        "Country": a.ulke.strip() or "Türkiye", "Mail": a.email.strip() or None, "Phone": a.telefon.strip() or None,
    }
    notes = [n for n in [req.notlar.strip()[:500], f"Teklif No: {quote.get('teklifNo', '')}"] if n]
    return {"InvoiceInfo": info, "CompanyInfo": company_info, "CustomerInfo": customer_info, "InvoiceLines": lines, "Notes": notes}


def _validate_invoice_party(a: InvoiceParty):
    if not re.fullmatch(r"\d{10}|\d{11}", a.vergiNo.strip()):
        raise HTTPException(422, "Alıcı VKN (10 hane) veya TCKN (11 hane) girin")
    if not a.unvan.strip():
        raise HTTPException(422, "Alıcı unvanı / adı soyadı gerekli")
    if not a.adres.strip() or not a.il.strip():
        raise HTTPException(422, "Alıcı adresi ve ili gerekli")
    if len(a.vergiNo.strip()) == 10 and not a.vergiDairesi.strip():
        raise HTTPException(422, "Şirket alıcılarda vergi dairesi gerekli")


async def _prepare_invoice(req: InvoiceRequest, user: Dict[str, Any]):
    _require_manager(user)
    company = await _own_company(user, req.companyId)
    cfg = await _nilvera_cfg(user, req.companyId)
    _validate_invoice_party(req.alici)
    quote = await db.quotes.find_one({"id": req.quoteId, "userId": user["user_id"], "companyId": req.companyId}, {"_id": 0})
    if not quote:
        raise HTTPException(404, "Teklif bulunamadı")
    if quote.get("durum") != "Onaylandı":
        raise HTTPException(422, "Sadece onaylanan tekliflerden fatura kesilebilir")
    tp = await _check_taxpayer(cfg, req.alici.vergiNo.strip())
    if tp.mukellef:
        tur, profile = "efatura", (req.efaturaProfil if req.efaturaProfil in ("TEMELFATURA", "TICARIFATURA") else "TEMELFATURA")
    else:
        tur, profile = "earsiv", "EARSIVFATURA"
    rate = await _invoice_rate(quote.get("paraBirimi") or "TRY")
    if (quote.get("paraBirimi") or "TRY") != "TRY" and not rate:
        raise HTTPException(503, "Döviz kuru alınamadı, biraz sonra tekrar deneyin")
    inv_uuid = str(uuid.uuid4())
    body = _build_invoice_doc(cfg, company, quote, req, profile, rate, inv_uuid)
    payload = {"ArchiveInvoice": body} if tur == "earsiv" else {"EInvoice": body, "CustomerAlias": tp.alias}
    return company, cfg, quote, tur, profile, inv_uuid, body, payload


@api_router.post("/efatura/check-taxpayer", response_model=TaxpayerCheckOut)
async def efatura_check_taxpayer(payload: TaxpayerCheckRequest, user=Depends(get_current_user)):
    _require_manager(user)
    await _own_company(user, payload.companyId)
    if not re.fullmatch(r"\d{10}|\d{11}", payload.vergiNo.strip()):
        raise HTTPException(422, "VKN 10, TCKN 11 haneli olmalı")
    cfg = await _nilvera_cfg(user, payload.companyId)
    return await _check_taxpayer(cfg, payload.vergiNo.strip())


@api_router.post("/efatura/invoices/preview", response_model=PdfOut)
async def efatura_preview(payload: InvoiceRequest, user=Depends(get_current_user)):
    _, cfg, quote, tur, _, _, _, body = await _prepare_invoice(payload, user)
    path = "/earchive/Send/Model/Download/Pdf" if tur == "earsiv" else "/einvoice/Send/Model/Download/Pdf"
    resp = await _nilvera(cfg, "POST", path, json=body)
    if resp.status_code != 200:
        raise HTTPException(502, f"Önizleme alınamadı: {_nilvera_err(resp)}")
    b64 = _pdf_b64_from(resp)
    if not b64:
        raise HTTPException(502, "Önizleme PDF'i boş döndü")
    return PdfOut(pdfBase64=b64, fileName=f"Onizleme_{quote.get('teklifNo', '')}.pdf")


@api_router.post("/efatura/invoices", response_model=Invoice)
async def efatura_issue(payload: InvoiceRequest, user=Depends(get_current_user)):
    _rate_limit(f"efatura-issue:{user['user_id']}", 60, 3600)
    dup = await db.invoices.find_one(
        {"userId": user["user_id"], "quoteId": payload.quoteId, "durum": {"$nin": ["Hata", "İptal"]}}, {"_id": 0}
    )
    if dup:
        raise HTTPException(409, f"Bu teklif için zaten fatura kesildi ({dup.get('faturaNo') or dup.get('uuid')})")
    company, cfg, quote, tur, profile, inv_uuid, body, req_body = await _prepare_invoice(payload, user)
    path = "/earchive/Send/Model" if tur == "earsiv" else "/einvoice/Send/Model"
    resp = await _nilvera(cfg, "POST", path, json=req_body)
    if resp.status_code != 200:
        raise HTTPException(502, f"Fatura gönderilemedi: {_nilvera_err(resp)}")
    try:
        rj = resp.json() or {}
    except Exception:
        rj = {}
    info = body["InvoiceInfo"]
    inv = Invoice(
        userId=user["user_id"], companyId=payload.companyId, quoteId=payload.quoteId, teklifNo=quote.get("teklifNo", ""),
        tur=tur, profil=profile, uuid=str(rj.get("UUID") or inv_uuid), faturaNo=rj.get("InvoiceNumber") or "",
        ortam=cfg.get("ortam", "test"), aliciUnvan=payload.alici.unvan.strip(), aliciVergiNo=payload.alici.vergiNo.strip(),
        aliciEmail=payload.alici.email.strip(), paraBirimi=info["CurrencyCode"],
        araToplam=round(info["LineExtensionAmount"] - info["GeneralAllowanceTotal"], 2), kdvTutar=info["KdvTotal"],
        genelToplam=info["PayableAmount"], createdByEmail=_actor_email(user),
    )
    await db.invoices.insert_one(inv.dict())
    # Alıcının vergi bilgilerini müşteri kartına işle -- bir dahaki faturada hazır gelsin.
    a = payload.alici
    patch = {k: v for k, v in {"vergiNo": a.vergiNo.strip(), "vergiDairesi": a.vergiDairesi.strip(), "il": a.il.strip(), "ilce": a.ilce.strip()}.items() if v}
    if patch and quote.get("musFirma"):
        await db.customers.update_one({"userId": user["user_id"], "companyId": payload.companyId, "firma": quote["musFirma"]}, {"$set": patch})
    return inv


@api_router.get("/efatura/invoices/{company_id}", response_model=List[Invoice])
async def efatura_list(company_id: str, user=Depends(get_current_user)):
    _require_manager(user)
    await _own_company(user, company_id)
    docs = await db.invoices.find({"userId": user["user_id"], "companyId": company_id}, {"_id": 0}).sort("createdAt", -1).to_list(2000)
    return [Invoice(**d) for d in docs]


async def _own_invoice(user, invoice_id):
    _require_manager(user)
    inv = await db.invoices.find_one({"id": invoice_id, "userId": user["user_id"]}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Fatura bulunamadı")
    await _own_company(user, inv["companyId"])
    cfg = await db.efatura_configs.find_one({"companyId": inv["companyId"], "userId": user["user_id"]}, {"_id": 0})
    if not cfg or not cfg.get("apiKey"):
        raise HTTPException(400, "Nilvera API anahtarı bulunamadı")
    # Fatura kesildiği ortamdan sorgulanır (sonradan canlıya geçilmiş olsa bile).
    return inv, {**cfg, "ortam": inv.get("ortam", cfg.get("ortam", "test"))}


@api_router.get("/efatura/invoice/{invoice_id}/pdf", response_model=PdfOut)
async def efatura_invoice_pdf(invoice_id: str, user=Depends(get_current_user)):
    inv, cfg = await _own_invoice(user, invoice_id)
    path = f"/earchive/Invoices/{inv['uuid']}/pdf" if inv["tur"] == "earsiv" else f"/einvoice/Sale/{inv['uuid']}/pdf"
    resp = await _nilvera(cfg, "GET", path)
    if resp.status_code != 200:
        raise HTTPException(502, f"PDF alınamadı: {_nilvera_err(resp)}")
    return PdfOut(pdfBase64=_pdf_b64_from(resp), fileName=f"Fatura_{inv.get('faturaNo') or inv['uuid'][:8]}.pdf")


@api_router.post("/efatura/invoice/{invoice_id}/refresh", response_model=Invoice)
async def efatura_invoice_refresh(invoice_id: str, user=Depends(get_current_user)):
    inv, cfg = await _own_invoice(user, invoice_id)
    path = f"/earchive/Invoices/{inv['uuid']}/Status" if inv["tur"] == "earsiv" else f"/einvoice/Sale/{inv['uuid']}/Status"
    resp = await _nilvera(cfg, "GET", path)
    if resp.status_code != 200:
        raise HTTPException(502, f"Durum alınamadı: {_nilvera_err(resp)}")
    try:
        j = resp.json() or {}
    except Exception:
        j = {}
    code = str(j.get("StatusCode") or "")
    detail = str(j.get("StatusDetail") or "")
    durum = {"succeed": "Başarılı", "error": "Hata", "waiting": "Bekliyor", "unknown": "Bekliyor"}.get(code.lower(), code or inv["durum"])
    if j.get("CancelStatus"):
        durum = "İptal"
    patch = {"durum": durum, "durumDetay": detail[:300]}
    await db.invoices.update_one({"id": invoice_id, "userId": user["user_id"]}, {"$set": patch})
    inv.update(patch)
    return Invoice(**inv)


@api_router.get("/efatura/incoming/{company_id}", response_model=List[IncomingInvoiceOut])
async def efatura_incoming(company_id: str, page: int = 1, user=Depends(get_current_user)):
    _require_manager(user)
    await _own_company(user, company_id)
    cfg = await _nilvera_cfg(user, company_id)
    resp = await _nilvera(cfg, "GET", "/einvoice/Purchase", params={"Page": max(1, page), "PageSize": 50, "SortColumn": "IssueDate", "SortType": "DESC"})
    if resp.status_code != 200:
        raise HTTPException(502, f"Gelen faturalar alınamadı: {_nilvera_err(resp)}")
    try:
        content = (resp.json() or {}).get("Content") or []
    except Exception:
        content = []
    out = []
    for r in content:
        out.append(IncomingInvoiceOut(
            uuid=str(r.get("UUID") or ""), faturaNo=r.get("InvoiceNumber") or "", gonderen=r.get("SenderName") or "",
            gonderenVkn=r.get("SenderTaxNumber") or "", tarih=(r.get("IssueDate") or "")[:10],
            paraBirimi=r.get("CurrencyCode") or "TRY", matrah=float(r.get("TaxExclusiveAmount") or r.get("LineExtensionAmount") or 0),
            kdv=float(r.get("TaxTotalAmount") or 0), toplam=float(r.get("PayableAmount") or 0),
            durum=str(r.get("StatusDetail") or r.get("StatusCode") or ""),
        ))
    return out


@api_router.get("/efatura/incoming/{company_id}/{inv_uuid}/pdf", response_model=PdfOut)
async def efatura_incoming_pdf(company_id: str, inv_uuid: str, user=Depends(get_current_user)):
    _require_manager(user)
    await _own_company(user, company_id)
    if not re.fullmatch(r"[0-9a-fA-F-]{32,36}", inv_uuid):
        raise HTTPException(422, "Geçersiz fatura kimliği")
    cfg = await _nilvera_cfg(user, company_id)
    resp = await _nilvera(cfg, "GET", f"/einvoice/Purchase/{inv_uuid}/pdf")
    if resp.status_code != 200:
        raise HTTPException(502, f"PDF alınamadı: {_nilvera_err(resp)}")
    return PdfOut(pdfBase64=_pdf_b64_from(resp), fileName=f"Gelen_Fatura_{inv_uuid[:8]}.pdf")

# ============ GECELİK VERİTABANI YEDEĞİ ============
# Her gece (İstanbul 03:00'ten sonra ilk kontrolde) tüm koleksiyonlar tek bir
# gzip'li JSON-lines dosyasına dökülür ve Railway Storage Bucket'a yüklenir.
# Satır biçimi: {"c": <koleksiyon>, "d": <belge (extended JSON)>}.
# Saklama: son BACKUP_KEEP_DAYS günlük + her ayın ilk yedeği (monthly/, 12 ay).
# Geri yükleme: backend/scripts/restore_backup.py
BACKUP_KEEP_DAYS = int(os.environ.get("BACKUP_KEEP_DAYS", "14"))


def _backup_s3():
    bucket = os.environ.get("BACKUP_BUCKET", "")
    if not bucket or not os.environ.get("BACKUP_ACCESS_KEY_ID"):
        return None, None
    import boto3
    s3 = boto3.client(
        "s3",
        endpoint_url=os.environ.get("BACKUP_ENDPOINT") or None,
        aws_access_key_id=os.environ.get("BACKUP_ACCESS_KEY_ID"),
        aws_secret_access_key=os.environ.get("BACKUP_SECRET_ACCESS_KEY"),
        region_name=os.environ.get("BACKUP_REGION") or "auto",
    )
    return s3, bucket


async def _run_backup(day: str) -> Dict[str, Any]:
    import gzip
    import tempfile
    from bson import json_util
    s3, bucket = _backup_s3()
    if not s3:
        raise RuntimeError("BACKUP_BUCKET ayarlı değil")
    counts: Dict[str, int] = {}
    fd, path = tempfile.mkstemp(suffix=".jsonl.gz")
    os.close(fd)
    try:
        with gzip.open(path, "wt", encoding="utf-8") as fh:
            for name in sorted(await db.list_collection_names()):
                if name.startswith("system.") or name == "backup_log":
                    continue
                n = 0
                async for doc in db[name].find({}).batch_size(500):
                    fh.write(json_util.dumps({"c": name, "d": doc}, json_options=json_util.CANONICAL_JSON_OPTIONS))
                    fh.write("\n")
                    n += 1
                counts[name] = n
        size = os.path.getsize(path)
        key = f"daily/{day}.jsonl.gz"
        await asyncio.to_thread(s3.upload_file, path, bucket, key)
        if day.endswith("-01") or not await _backup_has_month(s3, bucket, day[:7]):
            await asyncio.to_thread(s3.copy_object, Bucket=bucket, Key=f"monthly/{day[:7]}.jsonl.gz",
                                    CopySource={"Bucket": bucket, "Key": key})
        await _backup_prune(s3, bucket)
        return {"key": key, "size": size, "counts": counts}
    finally:
        try:
            os.remove(path)
        except OSError:
            pass


async def _backup_list(s3, bucket, prefix: str) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    token = None
    while True:
        kw = {"Bucket": bucket, "Prefix": prefix}
        if token:
            kw["ContinuationToken"] = token
        resp = await asyncio.to_thread(s3.list_objects_v2, **kw)
        for o in resp.get("Contents", []):
            out.append({"key": o["Key"], "size": o["Size"], "modified": o["LastModified"].isoformat()})
        if not resp.get("IsTruncated"):
            return out
        token = resp.get("NextContinuationToken")


async def _backup_has_month(s3, bucket, month: str) -> bool:
    return bool(await _backup_list(s3, bucket, f"monthly/{month}"))


async def _backup_prune(s3, bucket):
    daily = sorted(o["key"] for o in await _backup_list(s3, bucket, "daily/"))
    monthly = sorted(o["key"] for o in await _backup_list(s3, bucket, "monthly/"))
    for key in daily[:-BACKUP_KEEP_DAYS] + monthly[:-12]:
        await asyncio.to_thread(s3.delete_object, Bucket=bucket, Key=key)


async def _backup_once_today() -> Optional[Dict[str, Any]]:
    day = _istanbul_today().isoformat()
    # Aynı gün iki kez (ya da birden fazla replika varsa aynı anda) çalışmasın.
    try:
        await db.backup_log.insert_one({"_id": day, "status": "running", "startedAt": utc_now_iso()})
    except Exception:
        return None
    try:
        res = await _run_backup(day)
        await db.backup_log.update_one({"_id": day}, {"$set": {"status": "ok", "finishedAt": utc_now_iso(), **res}})
        logger.info(f"[Backup] {res['key']} yüklendi ({res['size'] // 1024} KB, {sum(res['counts'].values())} belge)")
        return res
    except Exception as e:
        # Kaydı sil ki bir sonraki saatlik kontrolde tekrar denensin.
        await db.backup_log.delete_one({"_id": day})
        logger.error(f"[Backup] başarısız: {e}")
        raise


async def _backup_loop():
    await asyncio.sleep(120)
    while True:
        try:
            try:
                from zoneinfo import ZoneInfo
                hour = datetime.now(ZoneInfo("Europe/Istanbul")).hour
            except Exception:
                hour = (_utc() + timedelta(hours=3)).hour
            if hour >= 3:
                # Yedek + kapasite kontrolü günde bir kez; yedek hata verirse
                # her saat yeniden denenir ve (günde bir) admin'e bildirilir.
                try:
                    done = await _backup_once_today()
                    err = None
                except Exception as e:
                    done, err = None, str(e)
                if done or err:
                    await _capacity_check(err)
        except Exception as e:
            logger.warning(f"[Backup] döngü hatası: {e}")
        await asyncio.sleep(60 * 60)


# ============ KAPASİTE UYARISI ============
# Günde bir kez (yedekle birlikte) disk / e-posta kotası / yedek durumunu
# ölçer; eşik aşılırsa ADMIN_EMAILS'e e-posta atar. Aynı uyarı 7 günde bir
# tekrarlanır (durum düzelmediyse). Eşikler env ile değiştirilebilir.
CAP_DISK_PCT = float(os.environ.get("CAP_DISK_PCT", "70"))
CAP_EMAIL_DAY = int(os.environ.get("CAP_EMAIL_DAY", "80"))        # Resend ücretsiz: 100/gün
CAP_EMAIL_MONTH = int(os.environ.get("CAP_EMAIL_MONTH", "2400"))  # Resend ücretsiz: 3000/ay


async def _capacity_snapshot() -> Dict[str, Any]:
    snap: Dict[str, Any] = {}
    try:
        st = await db.command({"dbStats": 1, "freeStorage": 1})
        used, total = float(st.get("fsUsedSize") or 0), float(st.get("fsTotalSize") or 0)
        snap["dataMB"] = round((float(st.get("storageSize", 0)) + float(st.get("indexSize", 0))) / 1048576, 1)
        if total:
            snap["diskUsedMB"], snap["diskTotalMB"] = round(used / 1048576), round(total / 1048576)
            snap["diskPct"] = round(used * 100 / total, 1)
    except Exception as e:
        snap["diskErr"] = str(e)[:200]
    today = _istanbul_today().isoformat()
    sent = {"durum": "gönderildi", "kanal": {"$ne": "whatsapp"}}
    snap["emailToday"] = await db.notify_log.count_documents({**sent, "createdAt": {"$gte": today}})
    snap["emailMonth"] = await db.notify_log.count_documents({**sent, "createdAt": {"$gte": today[:7]}})
    snap["email429"] = await db.notify_log.count_documents({"durum": {"$regex": "429"}, "createdAt": {"$gte": today[:7]}})
    snap["companies"] = await db.companies.count_documents({})
    snap["users"] = await db.users.count_documents({})
    return snap


def _capacity_issues(snap: Dict[str, Any], backup_err: Optional[str]) -> List[Tuple[str, str]]:
    out: List[Tuple[str, str]] = []
    if snap.get("diskPct", 0) >= CAP_DISK_PCT:
        out.append(("disk", f"MongoDB diski %{snap['diskPct']} dolu ({snap['diskUsedMB']} / {snap['diskTotalMB']} MB). "
                            "Railway → MongoDB → Volume → Resize ile büyütme zamanı."))
    if snap.get("emailToday", 0) >= CAP_EMAIL_DAY or snap.get("emailMonth", 0) >= CAP_EMAIL_MONTH or snap.get("email429", 0):
        out.append(("email", f"Otomatik e-posta: bugün {snap['emailToday']}, bu ay {snap['emailMonth']} gönderim"
                             f"{', ' + str(snap['email429']) + ' kota (429) hatası' if snap.get('email429') else ''}. "
                             "Resend ücretsiz plan sınırı 100/gün, 3000/ay — ücretli plana geçme zamanı."))
    if backup_err:
        out.append(("backup", f"Gecelik yedek alınamadı: {backup_err[:300]}"))
    return out


async def _send_admin_email(subject: str, html_body: str) -> bool:
    # Yüksek öncelik başlıkları: Outlook/Apple Mail'de kırmızı ünlem; Gmail'de
    # "önemli" işaretlemesine yardımcı olur.
    prio = {"X-Priority": "1 (Highest)", "X-MSMail-Priority": "High", "Importance": "high"}
    ok_any = False
    for to in sorted(ADMIN_EMAILS):
        ok, _ = await _send_company_email({"sirketAdi": "🚨 Anında Teklif Sistem"}, to, subject, html_body, headers=prio)
        ok_any = ok_any or ok
    return ok_any


_CAP_META = {
    "disk": ("💾", "Veritabanı diski doluyor", "Railway'de diski büyüt",
             "https://railway.com/project/{pid}", "Railway → MongoDB → Settings → Volume → boyutu artır (ör. 10 GB)."),
    "email": ("✉️", "E-posta kotası doluyor", "Resend planını yükselt",
              "https://resend.com/settings/billing", "Resend ücretsiz planı: 100/gün, 3000/ay. Pro plan ~20 $/ay (50 bin e-posta)."),
    "backup": ("🛟", "Gecelik yedek alınamadı", "Railway loglarına bak",
               "https://railway.com/project/{pid}", "Yedek her saat yeniden denenir; düzelmezse Claude'a bu e-postayı gösterin."),
}


def _capacity_email(due: List[Tuple[str, str]], snap: Dict[str, Any], test: bool = False) -> Tuple[str, str]:
    pid = os.environ.get("RAILWAY_PROJECT_ID", "")
    first = _CAP_META.get(due[0][0], ("⚠️", "Kapasite uyarısı"))[1] if due else "Kapasite uyarısı"
    subject = ("🧪 TEST — " if test else "🚨 İŞLEM GEREKLİ — ") + f"Anında Teklif: {first}" + (f" (+{len(due) - 1})" if len(due) > 1 else "")
    cards = ""
    for kind, msg in due:
        icon, title, cta, url, hint = _CAP_META.get(kind, ("⚠️", "Uyarı", "", "", ""))
        btn = (f"<a href='{esc(url.format(pid=pid))}' style='display:inline-block;background:#dc2626;color:#fff;"
               f"text-decoration:none;font-weight:700;padding:10px 18px;border-radius:8px;margin-top:10px'>{esc(cta)} →</a>") if url else ""
        cards += (f"<div style='border:2px solid #fecaca;background:#fef2f2;border-radius:12px;padding:16px;margin:0 0 14px'>"
                  f"<div style='font-size:18px;font-weight:800;color:#991b1b'>{icon} {esc(title)}</div>"
                  f"<div style='font-size:15px;color:#1f2937;margin-top:8px;line-height:1.5'>{esc(msg)}</div>"
                  f"<div style='font-size:13px;color:#6b7280;margin-top:6px'>{esc(hint)}</div>{btn}</div>")
    banner = ("🧪 BU BİR TEST E-POSTASIDIR — gerçek uyarılar bu şekilde görünür" if test
              else "🚨 KAPASİTE UYARISI — İŞLEM GEREKLİ")
    stat = lambda label, val: (f"<td style='padding:8px 12px;text-align:center'><div style='font-size:20px;font-weight:800;color:#111827'>{esc(str(val))}</div>"
                               f"<div style='font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px'>{esc(label)}</div></td>")
    disk = f"%{snap['diskPct']}" if snap.get("diskPct") is not None else "?"
    html = (f"<div style='font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff'>"
            f"<div style='background:{'#7c3aed' if test else '#dc2626'};color:#fff;font-size:20px;font-weight:900;padding:22px 20px;"
            f"text-align:center;border-radius:12px 12px 0 0;letter-spacing:.3px'>{banner}</div>"
            f"<div style='padding:20px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px'>{cards}"
            f"<table style='width:100%;border-collapse:collapse;background:#f9fafb;border-radius:10px;margin-top:6px'><tr>"
            f"{stat('Disk', disk)}{stat('Firma', snap.get('companies', '?'))}{stat('Kullanıcı', snap.get('users', '?'))}"
            f"{stat('Bugün e-posta', snap.get('emailToday', 0))}</tr></table>"
            f"<p style='font-size:12px;color:#9ca3af;margin-top:16px'>Bu e-posta Anında Teklif sunucusu tarafından otomatik gönderildi. "
            f"Aynı uyarı durum düzelene kadar haftada bir (yedek hatası günde bir) tekrarlanır.</p></div></div>")
    return subject, html


async def _capacity_check(backup_err: Optional[str] = None) -> List[str]:
    snap = await _capacity_snapshot()
    await db.capacity_log.update_one({"_id": _istanbul_today().isoformat()}, {"$set": {**snap, "at": utc_now_iso()}}, upsert=True)
    logger.info("[Kapasite] " + ", ".join(f"{k}={v}" for k, v in snap.items()))
    due: List[Tuple[str, str]] = []
    for kind, msg in _capacity_issues(snap, backup_err):
        # Yedek hatası günde bir, diğerleri haftada bir hatırlatılır.
        since = (datetime.now(timezone.utc) - timedelta(days=1 if kind == "backup" else 7)).isoformat()
        last = await db.capacity_alerts.find_one({"_id": kind})
        if last and last.get("sentAt", "") > since:
            continue
        due.append((kind, msg))
    if not due:
        return []
    subject, body = _capacity_email(due, snap)
    if await _send_admin_email(subject, body):
        for kind, _ in due:
            await db.capacity_alerts.update_one({"_id": kind}, {"$set": {"sentAt": utc_now_iso()}}, upsert=True)
    return [k for k, _ in due]


@api_router.post("/admin/capacity/test-alert")
async def admin_capacity_test_alert(user=Depends(get_current_user)):
    _require_admin(user)
    _rate_limit(f"cap-test:{user.get('user_id')}", 3, 3600)
    snap = await _capacity_snapshot()
    sample = [("disk", f"MongoDB diski %{snap.get('diskPct', '?')} dolu ({snap.get('diskUsedMB', '?')} / {snap.get('diskTotalMB', '?')} MB). "
                       "Örnek: %70'i geçince bu uyarı gelir."),
              ("email", "Örnek: otomatik e-postalar günde 80 veya ayda 2400'ü geçince bu uyarı gelir."),
              ("backup", "Örnek: gecelik yedek alınamazsa bu uyarı gelir.")]
    subject, body = _capacity_email(sample, snap, test=True)
    ok = await _send_admin_email(subject, body)
    if not ok:
        raise HTTPException(502, "Test e-postası gönderilemedi")
    return {"sent": True, "to": sorted(ADMIN_EMAILS)}


@api_router.get("/admin/capacity")
async def admin_capacity(user=Depends(get_current_user)):
    _require_admin(user)
    snap = await _capacity_snapshot()
    history = await db.capacity_log.find({}).sort("_id", -1).to_list(60)
    return {"now": snap, "issues": [m for _, m in _capacity_issues(snap, None)], "history": history}

@api_router.get("/admin/backups")
async def admin_list_backups(user=Depends(get_current_user)):
    _require_admin(user)
    s3, bucket = _backup_s3()
    if not s3:
        return {"configured": False, "backups": [], "log": []}
    objs = await _backup_list(s3, bucket, "")
    log = await db.backup_log.find({}, {"counts": 0}).sort("_id", -1).to_list(30)
    return {"configured": True, "backups": sorted(objs, key=lambda o: o["key"], reverse=True), "log": log}


@api_router.post("/admin/backups/run")
async def admin_run_backup(user=Depends(get_current_user)):
    _require_admin(user)
    day = _istanbul_today().isoformat() + "-manual-" + datetime.now(timezone.utc).strftime("%H%M%S")
    try:
        res = await _run_backup(day)
    except Exception as e:
        raise HTTPException(500, f"Yedek alınamadı: {e}")
    return {"key": res["key"], "size": res["size"], "documents": sum(res["counts"].values())}



# ============ UYGULAMA İÇİ BİLDİRİMLER + PUSH ============
# Her kullanıcının (gerçek kişi, _self_id) bir bildirim kutusu vardır:
#  - olay: ekibinden biri teklif hazırladı/onayladı, lead listesi hazır...
#  - akilli: bekleyen teklif, bugünkü işler, düşük stok, abonelik bitiyor...
#  - ipucu: uygulamayı daha iyi kullanmak için günlük kısa öneri
#  - duyuru: admin'in tüm kullanıcılara gönderdiği kampanya/yenilik
# Her bildirim uygulama içinde listelenir; kullanıcı izin verdiyse telefona
# (Expo push, Android/iOS) ve tarayıcıya (Web Push, VAPID) da gönderilir.
# Günlük motor (_engage_loop) firma sahiplerine sabah bir "bugün" özeti ve
# akşam bir akıllı hatırlatma ya da ipucu gönderir; aynı gün ikinci kez
# göndermez (unique key). Kullanıcı ipucu/akıllı/push'u ayrı ayrı kapatabilir.
VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", "")
VAPID_SUBJECT = os.environ.get("VAPID_SUBJECT", "mailto:destek@anindateklif.co")
NOTIF_TIPS = ("olay", "akilli", "ipucu", "duyuru")


class UserNotificationOut(BaseModel):
    id: str
    tip: str
    baslik: str
    mesaj: str
    link: str = ""
    createdAt: str
    readAt: Optional[str] = None


class NotifPrefs(BaseModel):
    ipucu: bool = True
    akilli: bool = True
    push: bool = True
    lang: str = "tr"


class PushRegisterIn(BaseModel):
    kind: str  # "expo" | "web"
    token: str = ""
    subscription: Optional[Dict[str, Any]] = None
    platform: str = ""


class BroadcastIn(BaseModel):
    baslik: str
    mesaj: str
    link: str = ""
    push: bool = True


def _bg(coro):
    """İsteği bekletmeden arka planda çalıştır; hatayı yut ama logla."""
    async def runner():
        try:
            await coro
        except Exception as e:
            logger.warning(f"[Bildirim] arka plan hatası: {e}")
    try:
        return asyncio.get_running_loop().create_task(runner())
    except RuntimeError:
        return None


async def _notif_prefs(uid: str) -> Dict[str, Any]:
    doc = await db.notif_prefs.find_one({"_id": uid}) or {}
    return NotifPrefs(**{k: v for k, v in doc.items() if k != "_id"}).model_dump()


async def _notify_user(uid: str, key: str, tip: str, baslik: str, mesaj: str, link: str = "",
                       push: bool = True, kind: str = "") -> bool:
    """Bildirimi kutuya yazar (aynı key ile ikinci kez yazmaz) ve push'lar."""
    doc = {"id": str(uuid.uuid4()), "userId": uid, "key": key, "tip": tip, "kind": kind or tip,
           "baslik": baslik[:120], "mesaj": mesaj[:400], "link": link, "createdAt": utc_now_iso(), "readAt": None}
    try:
        await db.user_notifications.insert_one(doc)
    except DuplicateKeyError:
        return False
    if push and (await _notif_prefs(uid)).get("push", True):
        await _push_send(uid, doc)
    return True


async def _push_send(uid: str, doc: Dict[str, Any]) -> int:
    subs = await db.push_subs.find({"userId": uid}, {"_id": 0}).to_list(20)
    if not subs:
        return 0
    unread = await db.user_notifications.count_documents({"userId": uid, "readAt": None})
    data = {"id": doc["id"], "link": doc.get("link", "")}
    sent = 0
    expo = [s for s in subs if s.get("kind") == "expo" and s.get("token")]
    if expo:
        msgs = [{"to": s["token"], "title": doc["baslik"], "body": doc["mesaj"], "data": data,
                 "sound": "default", "badge": unread, "channelId": "default"} for s in expo]
        try:
            resp = await asyncio.to_thread(
                requests.post, "https://exp.host/--/api/v2/push/send", json=msgs, timeout=15,
                headers={"Accept": "application/json", "Content-Type": "application/json"},
            )
            for s, r in zip(expo, (resp.json() or {}).get("data", []) if resp.status_code == 200 else []):
                if r.get("status") == "ok":
                    sent += 1
                elif (r.get("details") or {}).get("error") == "DeviceNotRegistered":
                    await db.push_subs.delete_one({"id": s["id"]})
        except Exception as e:
            logger.warning(f"[Push] expo hatası: {e}")
    web = [s for s in subs if s.get("kind") == "web" and s.get("subscription")]
    if web and VAPID_PRIVATE_KEY:
        from pywebpush import webpush, WebPushException
        payload = json.dumps({"title": doc["baslik"], "body": doc["mesaj"], "badge": unread, **data}, ensure_ascii=False)
        for s in web:
            try:
                await asyncio.to_thread(webpush, subscription_info=s["subscription"], data=payload,
                                        vapid_private_key=VAPID_PRIVATE_KEY, vapid_claims={"sub": VAPID_SUBJECT}, ttl=86400)
                sent += 1
            except WebPushException as e:
                code = getattr(getattr(e, "response", None), "status_code", 0)
                if code in (404, 410):
                    await db.push_subs.delete_one({"id": s["id"]})
                else:
                    logger.warning(f"[Push] web hatası {code}: {str(e)[:200]}")
            except Exception as e:
                logger.warning(f"[Push] web hatası: {e}")
    return sent


@api_router.get("/notifications")
async def list_user_notifications(limit: int = 50, before: str = "", lang: str = "", user=Depends(get_current_user)):
    uid = _self_id(user)
    if lang in ("tr", "en", "it"):
        await db.notif_prefs.update_one({"_id": uid}, {"$set": {"lang": lang}}, upsert=True)
    q: Dict[str, Any] = {"userId": uid}
    if before:
        q["createdAt"] = {"$lt": before}
    docs = await db.user_notifications.find(q, {"_id": 0}).sort("createdAt", -1).to_list(max(1, min(limit, 100)))
    unread = await db.user_notifications.count_documents({"userId": uid, "readAt": None})
    return {"items": [UserNotificationOut(**d).model_dump() for d in docs], "unread": unread}


@api_router.get("/notifications/unread-count")
async def unread_user_notifications(user=Depends(get_current_user)):
    return {"unread": await db.user_notifications.count_documents({"userId": _self_id(user), "readAt": None})}


@api_router.post("/notifications/read-all")
async def read_all_user_notifications(user=Depends(get_current_user)):
    r = await db.user_notifications.update_many({"userId": _self_id(user), "readAt": None}, {"$set": {"readAt": utc_now_iso()}})
    return {"ok": True, "updated": r.modified_count}


@api_router.post("/notifications/{notif_id}/read")
async def read_user_notification(notif_id: str, user=Depends(get_current_user)):
    await db.user_notifications.update_one({"id": notif_id, "userId": _self_id(user), "readAt": None}, {"$set": {"readAt": utc_now_iso()}})
    return {"ok": True}


@api_router.get("/notifications/prefs", response_model=NotifPrefs)
async def get_notif_prefs(user=Depends(get_current_user)):
    return NotifPrefs(**await _notif_prefs(_self_id(user)))


@api_router.put("/notifications/prefs", response_model=NotifPrefs)
async def put_notif_prefs(payload: NotifPrefs, user=Depends(get_current_user)):
    data = payload.model_dump()
    if data["lang"] not in ("tr", "en", "it"):
        data["lang"] = "tr"
    await db.notif_prefs.update_one({"_id": _self_id(user)}, {"$set": data}, upsert=True)
    return NotifPrefs(**data)


@api_router.get("/push/config")
async def push_config():
    return {"vapidPublicKey": VAPID_PUBLIC_KEY}


@api_router.post("/push/register")
async def push_register(payload: PushRegisterIn, user=Depends(get_current_user)):
    uid = _self_id(user)
    if payload.kind == "expo":
        if not re.fullmatch(r"(Exponent|Expo)PushToken\[[A-Za-z0-9_\-]+\]", payload.token or ""):
            raise HTTPException(422, "Geçersiz push anahtarı")
        ident = payload.token
    elif payload.kind == "web":
        sub = payload.subscription or {}
        ep = str(sub.get("endpoint") or "")
        keys = sub.get("keys") or {}
        if not ep.startswith("https://") or not keys.get("p256dh") or not keys.get("auth") or len(ep) > 1000:
            raise HTTPException(422, "Geçersiz tarayıcı aboneliği")
        ident = ep
    else:
        raise HTTPException(422, "Geçersiz tür")
    # Aynı cihaz başka hesapla giriş yaptıysa eski hesaptan kopar.
    await db.push_subs.delete_many({"ident": ident, "userId": {"$ne": uid}})
    await db.push_subs.update_one(
        {"ident": ident},
        {"$set": {"userId": uid, "kind": payload.kind, "token": payload.token if payload.kind == "expo" else "",
                  "subscription": payload.subscription if payload.kind == "web" else None,
                  "platform": payload.platform[:20], "updatedAt": utc_now_iso()},
         "$setOnInsert": {"id": str(uuid.uuid4()), "ident": ident, "createdAt": utc_now_iso()}},
        upsert=True,
    )
    if await db.push_subs.count_documents({"userId": uid}) > 10:
        old = await db.push_subs.find({"userId": uid}, {"_id": 0, "id": 1}).sort("updatedAt", 1).to_list(5)
        await db.push_subs.delete_many({"id": {"$in": [o["id"] for o in old]}})
    return {"ok": True}


@api_router.post("/push/unregister")
async def push_unregister(payload: PushRegisterIn, user=Depends(get_current_user)):
    ident = payload.token if payload.kind == "expo" else str((payload.subscription or {}).get("endpoint") or "")
    await db.push_subs.delete_many({"ident": ident, "userId": _self_id(user)})
    return {"ok": True}


# ---- Olay bildirimleri (diğer uçlardan çağrılır) ----
def _event_quote_created(user: Dict[str, Any], q: Dict[str, Any]):
    if not user.get("is_staff"):
        return
    who = _actor_name(user) or "Ekip üyeniz"
    _bg(_notify_user(user["user_id"], f"q-new:{q['id']}", "olay", f"📝 {who} yeni teklif hazırladı",
                     f"{q.get('teklifNo', '')} · {q.get('musFirma', '')} — {_fmt_money(q.get('genelToplam', 0), q.get('paraBirimi', 'TRY'))}",
                     "/history", kind="ekip-teklif"))


def _event_quote_approved(user: Dict[str, Any], q: Dict[str, Any]):
    who = _actor_name(user) if user.get("is_staff") else ""
    msg = f"{q.get('teklifNo', '')} numaralı {q.get('musFirma', '')} teklifi onaylandı" + (f" ({who})" if who else "") + \
          f" — {_fmt_money(q.get('genelToplam', 0), q.get('paraBirimi', 'TRY'))}. Tahsilat kaydı otomatik oluşturuldu."
    # Onaylayan kişiye push atmaya gerek yok; firma sahibine (personel onayladıysa) push'la.
    _bg(_notify_user(user["user_id"], f"q-ok:{q['id']}", "olay", "🎉 Müjde! Teklif onaylandı", msg, "/tahsilat",
                     push=bool(user.get("is_staff")), kind="teklif-onay"))


def _event_leads_ready(owner_uid: str, n: int, batch: str):
    _bg(_notify_user(owner_uid, f"leads:{batch}", "olay", f"🎯 {n} yeni potansiyel müşteri hazır",
                     "İstediğiniz firma listesi eklendi. Hemen arayıp teklif verin.", "/leads", kind="lead"))


# ---- Günlük motor ----
TIPS: Dict[str, List[Tuple[str, str, str]]] = {
    "tr": [
        ("İlk teklifinizi 1 dakikada hazırlayın ⚡", "Müşteriyi seçin, kalemleri ekleyin, PDF hazır. Hemen deneyin.", "/teklif"),
        ("Kataloğunuz hız kazandırır 📦", "Sık sattığınız ürünleri fiyatlarıyla kataloğa ekleyin, teklifte tek dokunuşla seçin.", "/catalog"),
        ("Teklifinize logonuzu ekleyin 🏷️", "Firma bilgileriniz ve logonuz her PDF'te görünür; teklifiniz kurumsal durur.", "/company"),
        ("WhatsApp'tan tek dokunuşla gönderin 💬", "Hazırladığınız teklifi PDF olarak müşterinize anında iletin.", "/history"),
        ("Bekleyen teklifler unutulmasın ⏳", "Teklif geçmişinde yanıt bekleyenleri görün, müşterinizi bir kez daha arayın.", "/history"),
        ("Müşteri kartı = tüm geçmiş tek yerde 📇", "Müşterinin teklifleri, ödemeleri ve notları tek ekranda.", "/customers"),
        ("Excel'deki müşterilerinizi taşıyın 📥", "Müşteri listenizi Excel'den tek seferde içe aktarın, baştan yazmayın.", "/customers"),
        ("Tahsilatı takip edin, para içeride kalmasın 💰", "Onaylanan teklifler otomatik borç olarak düşer; ödeme gelince işaretleyin.", "/tahsilat"),
        ("Vadesi geçen alacak var mı? 🔔", "Borçlu müşteriler listesiyle kimden ne kadar alacağınız olduğunu görün.", "/borclu-musteriler"),
        ("Kasanız cebinizde 🧾", "Gelir ve giderleri girin, ay sonunda kâr-zararınızı tek bakışta görün.", "/kasa"),
        ("Hatırlatmaları sisteme bırakın ⏰", "Vade, bakım ve teklif takibi e-postalarını otomatik gönderin.", "/reminders"),
        ("Takviminizi telefonunuza bağlayın 📅", "Randevu ve hatırlatmalarınız Google/Apple takvimde de görünsün.", "/calendar"),
        ("Sözleşmeyi yapay zekâ yazsın 🤖", "Teklifinizden birkaç saniyede sözleşme taslağı oluşturun.", "/contracts"),
        ("e-Faturayı teklif ekranından kesin 🧾", "Onaylanan teklifi tek tuşla e-Fatura/e-Arşiv'e dönüştürün.", "/efatura"),
        ("Stok takibi açık mı? 📊", "Stoklu ürünler onaylanan tekliflerle otomatik düşer; azalınca uyarır.", "/catalog"),
        ("İndirim kuponu ile müşteri kazanın 🎟️", "Kampanya kuponu oluşturun, teklifte kodu girince indirim otomatik uygulansın.", "/kuponlar"),
        ("Ekibinizi ekleyin 👥", "Personeliniz kendi hesabıyla teklif hazırlasın, siz her şeyi görün.", "/personel"),
        ("Personel primini hesaplayın 🏆", "Onaylanan tekliflerden ciro veya kâr üzerinden prim otomatik hesaplanır.", "/prim"),
        ("Google yorumlarına saniyede yanıt ✍️", "Yapay zekâ, müşteri yorumuna kibar ve profesyonel yanıt hazırlasın.", "/yorumlar"),
        ("Yeni müşteri mi arıyorsunuz? 🎯", "Bölgenizdeki potansiyel firmaları listeleyin, sırayla arayın.", "/leads"),
        ("Servis ve bakım kayıtlarınız düzenli olsun 🔧", "Yapılan işleri ve bir sonraki bakım tarihini kaydedin.", "/services"),
        ("Raporlarla işinizi ölçün 📈", "Hangi ay kaç teklif verdiniz, kaçı onaylandı? Raporlarda görün.", "/reports"),
        ("Dövizle teklif verin 💱", "USD veya EUR teklif hazırlayın; güncel kurla TL karşılığı otomatik hesaplanır.", "/teklif"),
        ("Hızlı dönen teklif işi kazandırır 🏁", "Müşteri genellikle ilk yanıt verenle çalışır; teklifi bugün gönderin.", "/teklif"),
        ("Yazılı teklif, sonradan tartışmayı önler 🤝", "Kalemler, fiyat ve KDV net olsun; iş bitince sürpriz yaşamayın.", "/teklif"),
        ("Bugün kaç teklif verdiniz? 🤔", "Günde bir teklif bile ay sonunda fark yaratır.", "/teklif"),
        ("Maliyeti girin, kârınızı görün 💡", "Teklife maliyet eklerseniz kâr marjınız raporlarda görünür.", "/teklif"),
        ("Eski teklifi kopyalayıp yenisini yapın 📋", "Benzer işler için geçmiş teklifi çoğaltın, sadece farkları değiştirin.", "/history"),
        ("Ekip içi mesajlaşma 💬", "Personelinizle iş konuşmalarını uygulama içinden yapın.", "/team-chat"),
        ("Akşam eve iş götürmeyin 🏠", "Sahada ölçüyü alın, teklifi oradan gönderin; akşam size kalsın.", "/teklif"),
    ],
    "en": [
        ("Create a quote in one minute ⚡", "Pick the customer, add items, your PDF is ready.", "/teklif"),
        ("Your catalog saves time 📦", "Save your frequent products with prices and pick them in one tap.", "/catalog"),
        ("Add your logo to quotes 🏷️", "Your company details and logo appear on every PDF.", "/company"),
        ("Send via WhatsApp in one tap 💬", "Share the quote PDF with your customer instantly.", "/history"),
        ("Don't forget pending quotes ⏳", "See quotes awaiting an answer and follow up today.", "/history"),
        ("Track your collections 💰", "Approved quotes become receivables automatically.", "/tahsilat"),
        ("Let reminders run themselves ⏰", "Send due-date, maintenance and follow-up e-mails automatically.", "/reminders"),
        ("Sync your calendar 📅", "See reminders in Google/Apple Calendar too.", "/calendar"),
        ("Let AI draft the contract 🤖", "Turn a quote into a contract draft in seconds.", "/contracts"),
        ("Add your team 👥", "Staff prepare quotes with their own login, you see everything.", "/personel"),
        ("Fast quotes win jobs 🏁", "Customers usually go with whoever answers first.", "/teklif"),
        ("How many quotes today? 🤔", "One quote a day makes a big difference by month end.", "/teklif"),
    ],
    "it": [
        ("Crea un preventivo in un minuto ⚡", "Scegli il cliente, aggiungi le voci e il PDF è pronto.", "/teklif"),
        ("Il catalogo ti fa risparmiare tempo 📦", "Salva i prodotti più venduti con i prezzi e selezionali con un tocco.", "/catalog"),
        ("Aggiungi il tuo logo 🏷️", "I dati aziendali e il logo compaiono su ogni PDF.", "/company"),
        ("Invia con WhatsApp in un tocco 💬", "Condividi subito il PDF del preventivo con il cliente.", "/history"),
        ("Non dimenticare i preventivi in attesa ⏳", "Vedi quelli senza risposta e richiama oggi il cliente.", "/history"),
        ("Tieni traccia degli incassi 💰", "I preventivi approvati diventano crediti automaticamente.", "/tahsilat"),
        ("Promemoria automatici ⏰", "Invia in automatico e-mail di scadenza, manutenzione e follow-up.", "/reminders"),
        ("Sincronizza il calendario 📅", "Vedi i promemoria anche su Google/Apple Calendar.", "/calendar"),
        ("Il contratto lo scrive l'IA 🤖", "Trasforma un preventivo in una bozza di contratto in pochi secondi.", "/contracts"),
        ("Aggiungi il tuo team 👥", "Il personale prepara preventivi con il proprio accesso, tu vedi tutto.", "/personel"),
        ("Chi risponde prima vince 🏁", "Il cliente sceglie spesso chi risponde per primo.", "/teklif"),
        ("Quanti preventivi oggi? 🤔", "Un preventivo al giorno fa la differenza a fine mese.", "/teklif"),
    ],
}

ENGAGE_TEXT = {
    "tr": {
        "morning_t": "☀️ Bugün sizi bekleyenler",
        "rem": "{n} hatırlatma", "srv": "{n} servis/bakım", "due": "{n} vadesi gelen tahsilat",
        "morning_m": "{items}. Günü planlamak için dokunun.",
        "sub_t": "⏰ Aboneliğiniz {d} gün içinde bitiyor", "sub_m": "Tekliflerinize kesintisiz devam etmek için aboneliğinizi yenileyin.",
        "pending_t": "📨 {n} teklif yanıt bekliyor", "pending_m": "3 günden eski bekleyen teklifleriniz var. Müşterinizi arayıp durumu sorun.",
        "stock_t": "📉 {n} üründe stok azaldı", "stock_m": "Minimum seviyenin altına düşen ürünler var: {names}.",
        "idle_t": "👋 Bir süredir teklif hazırlamadınız", "idle_m": "Elinizdeki işi hemen teklife dönüştürün, müşteriniz beklemesin.",
        "week_t": "📊 Geçen hafta: {n} teklif, {a} onay", "week_m": "Onaylanan tutar {sum}. Bu hafta bir adım öteye!",
        "week_zero_m": "Bu hafta hedef koyun: her gün en az bir teklif.",
    },
    "en": {
        "morning_t": "☀️ What's waiting for you today",
        "rem": "{n} reminder(s)", "srv": "{n} service visit(s)", "due": "{n} payment(s) due",
        "morning_m": "{items}. Tap to plan your day.",
        "sub_t": "⏰ Your subscription ends in {d} day(s)", "sub_m": "Renew to keep sending quotes without interruption.",
        "pending_t": "📨 {n} quote(s) awaiting reply", "pending_m": "Some quotes are older than 3 days. Give your customer a call.",
        "stock_t": "📉 Low stock on {n} item(s)", "stock_m": "Below minimum: {names}.",
        "idle_t": "👋 No quotes lately", "idle_m": "Turn the job at hand into a quote now.",
        "week_t": "📊 Last week: {n} quotes, {a} approved", "week_m": "Approved total {sum}. Keep it going!",
        "week_zero_m": "Set a goal this week: at least one quote a day.",
    },
    "it": {
        "morning_t": "☀️ Cosa ti aspetta oggi",
        "rem": "{n} promemoria", "srv": "{n} interventi", "due": "{n} incassi in scadenza",
        "morning_m": "{items}. Tocca per pianificare la giornata.",
        "sub_t": "⏰ L'abbonamento scade tra {d} giorni", "sub_m": "Rinnova per continuare senza interruzioni.",
        "pending_t": "📨 {n} preventivi in attesa", "pending_m": "Alcuni hanno più di 3 giorni. Chiama il cliente.",
        "stock_t": "📉 Scorte basse su {n} articoli", "stock_m": "Sotto il minimo: {names}.",
        "idle_t": "👋 Nessun preventivo di recente", "idle_m": "Trasforma subito il lavoro in un preventivo.",
        "week_t": "📊 Settimana scorsa: {n} preventivi, {a} approvati", "week_m": "Totale approvato {sum}. Avanti così!",
        "week_zero_m": "Obiettivo della settimana: almeno un preventivo al giorno.",
    },
}


def _slot_minute(uid: str, day: str, start: int, span: int) -> int:
    """Kullanıcıya özgü, güne göre değişen gönderim dakikası (hepsi aynı anda gitmesin)."""
    import hashlib
    h = int(hashlib.sha1(f"{uid}:{day}:{start}".encode()).hexdigest()[:8], 16)
    return start + h % span


async def _last_kind_at(uid: str, kind: str) -> str:
    d = await db.user_notifications.find_one({"userId": uid, "kind": kind}, {"_id": 0, "createdAt": 1}, sort=[("createdAt", -1)])
    return (d or {}).get("createdAt", "")


async def _engage_morning(u: Dict[str, Any], prefs: Dict[str, Any], today) -> bool:
    uid, tday = u["user_id"], today.isoformat()
    T = ENGAGE_TEXT.get(prefs.get("lang"), ENGAGE_TEXT["tr"])
    if not prefs.get("akilli", True):
        return False
    days = _renewal_days_left(u)
    if days is not None and days <= 3 and (u.get("email") or "").lower() not in FREE_ACCESS_EMAILS:
        exp_key = str(u.get("subscription_expires_at"))[:10]
        if await _notify_user(uid, f"sub:{uid}:{exp_key}", "akilli", T["sub_t"].format(d=max(days, 1)), T["sub_m"], "/subscription", kind="abonelik"):
            return True
    rems = await db.manual_reminders.count_documents({"userId": uid, "tarih": tday, "tamamlandi": False})
    srvs = await db.services.count_documents({"userId": uid, "$or": [{"servisTarihi": tday}, {"bakimTarihi": tday}], "durum": {"$ne": "İptal"}})
    dues = await db.tahsilat.count_documents({"userId": uid, "tur": "borc", "vadeTarihi": tday})
    parts = [T[k].format(n=n) for k, n in (("rem", rems), ("srv", srvs), ("due", dues)) if n]
    if not parts:
        return False
    link = "/reminders" if rems else ("/services" if srvs else "/tahsilat")
    return await _notify_user(uid, f"sabah:{uid}:{tday}", "akilli", T["morning_t"], T["morning_m"].format(items=", ".join(parts)), link, kind="sabah")


async def _engage_evening(u: Dict[str, Any], prefs: Dict[str, Any], today) -> bool:
    uid, tday = u["user_id"], today.isoformat()
    lang = prefs.get("lang") if prefs.get("lang") in TIPS else "tr"
    T = ENGAGE_TEXT[lang]
    key = f"aksam:{uid}:{tday}"
    if await db.user_notifications.find_one({"key": key}, {"_id": 1}):
        return False
    now = datetime.now(timezone.utc)
    ago = lambda d: (now - timedelta(days=d)).isoformat()
    if prefs.get("akilli", True):
        # Pazartesi: geçen haftanın özeti
        if today.weekday() == 0:
            start, end = (today - timedelta(days=7)).isoformat(), tday
            qs = await db.quotes.find({"userId": uid, "deletedAt": None, "tarih": {"$gte": start, "$lt": end}},
                                      {"_id": 0, "durum": 1, "genelToplam": 1, "paraBirimi": 1}).to_list(5000)
            if await db.quotes.count_documents({"userId": uid}) > 0:
                ok = [q for q in qs if q.get("durum") == "Onaylandı"]
                cur = (ok[0].get("paraBirimi") if ok else "TRY") or "TRY"
                total = sum(float(q.get("genelToplam") or 0) for q in ok if (q.get("paraBirimi") or "TRY") == cur)
                msg = T["week_m"].format(sum=_fmt_money(total, cur)) if ok else T["week_zero_m"]
                return await _notify_user(uid, key, "akilli", T["week_t"].format(n=len(qs), a=len(ok)), msg, "/reports", kind="haftalik")
        old = (today - timedelta(days=3)).isoformat()
        pend = await db.quotes.count_documents({"userId": uid, "durum": "Beklemede", "deletedAt": None, "tarih": {"$lte": old, "$gte": (today - timedelta(days=30)).isoformat()}})
        if pend and await _last_kind_at(uid, "bekleyen") < ago(3):
            return await _notify_user(uid, key, "akilli", T["pending_t"].format(n=pend), T["pending_m"], "/history", kind="bekleyen")
        low = await db.catalog.find({"userId": uid, "stokTakip": True, "$expr": {"$lte": ["$stok", "$minStok"]}, "minStok": {"$gt": 0}},
                                    {"_id": 0, "urunAdi": 1}).to_list(50)
        if low and await _last_kind_at(uid, "stok") < ago(7):
            names = ", ".join(x.get("urunAdi", "") for x in low[:3]) + ("…" if len(low) > 3 else "")
            return await _notify_user(uid, key, "akilli", T["stock_t"].format(n=len(low)), T["stock_m"].format(names=names), "/catalog", kind="stok")
        last_q = await db.quotes.find_one({"userId": uid}, {"_id": 0, "createdAt": 1}, sort=[("createdAt", -1)])
        if last_q and (last_q.get("createdAt") or "") < ago(5) and await _last_kind_at(uid, "pasif") < ago(5):
            return await _notify_user(uid, key, "akilli", T["idle_t"], T["idle_m"], "/teklif", kind="pasif")
    if prefs.get("ipucu", True):
        pool = TIPS[lang]
        st = await db.notif_prefs.find_one_and_update({"_id": uid}, {"$inc": {"tipIdx": 1}}, upsert=True, return_document=True)
        title, msg, link = pool[((st or {}).get("tipIdx", 1) - 1) % len(pool)]
        return await _notify_user(uid, key, "ipucu", title, msg, link, kind="ipucu")
    return False


async def _engage_mark(key: str) -> bool:
    """Bu kullanıcı/gün/dilim için ilk kez mi? (Her dilim günde bir kez değerlendirilir.)"""
    try:
        await db.engage_marks.insert_one({"_id": key, "at": utc_now_iso()})
        return True
    except DuplicateKeyError:
        return False


async def _engage_tick(now_ist: Optional[datetime] = None) -> int:
    if now_ist is None:
        try:
            from zoneinfo import ZoneInfo
            now_ist = datetime.now(ZoneInfo("Europe/Istanbul"))
        except Exception:
            now_ist = _utc() + timedelta(hours=3)
    today = now_ist.date()
    tday = today.isoformat()
    minute = now_ist.hour * 60 + now_ist.minute
    in_morning, in_evening = 9 * 60 <= minute < 11 * 60, 19 * 60 <= minute < 22 * 60
    if not (in_morning or in_evening):
        return 0
    sent = 0
    async for u in db.users.find({"staff_owner_user_id": {"$in": [None, ""]}, "deleted_at": {"$in": [None, ""]}},
                                 {"_id": 0, "user_id": 1, "email": 1, "subscription_expires_at": 1}):
        uid = u.get("user_id")
        if not uid:
            continue
        try:
            if in_morning and minute >= _slot_minute(uid, tday, 9 * 60, 60):
                if await _engage_mark(f"sabah:{uid}:{tday}"):
                    sent += int(await _engage_morning(u, await _notif_prefs(uid), today))
            if in_evening and minute >= _slot_minute(uid, tday, 19 * 60 + 30, 120):
                # Hiç şirketi olmayan (kaydı yarım kalmış) hesaplara gönderme.
                if await _engage_mark(f"aksam:{uid}:{tday}") and await db.companies.find_one({"userId": uid}, {"_id": 1}):
                    sent += int(await _engage_evening(u, await _notif_prefs(uid), today))
        except Exception as e:
            logger.warning(f"[Engage] {uid}: {e}")
    return sent


async def _engage_loop():
    await asyncio.sleep(150)
    while True:
        try:
            n = await _engage_tick()
            if n:
                logger.info(f"[Engage] {n} bildirim gönderildi")
        except Exception as e:
            logger.warning(f"[Engage] döngü hatası: {e}")
        await asyncio.sleep(10 * 60)


@api_router.post("/admin/notifications/broadcast")
async def admin_broadcast(payload: BroadcastIn, user=Depends(get_current_user)):
    _require_admin(user)
    baslik, mesaj = payload.baslik.strip(), payload.mesaj.strip()
    if not baslik or not mesaj:
        raise HTTPException(422, "Başlık ve mesaj gerekli")
    if payload.link and not re.fullmatch(r"/[a-z0-9\-/]*", payload.link):
        raise HTTPException(422, "Bağlantı uygulama içi bir yol olmalı (ör. /teklif)")
    batch = str(uuid.uuid4())[:8]
    ids = [u["user_id"] async for u in db.users.find({"deleted_at": {"$in": [None, ""]}}, {"_id": 0, "user_id": 1}) if u.get("user_id")]

    async def run():
        n = 0
        for i in range(0, len(ids), 20):
            res = await asyncio.gather(*[_notify_user(uid, f"duyuru:{batch}:{uid}", "duyuru", baslik, mesaj, payload.link,
                                                      push=payload.push, kind="duyuru") for uid in ids[i:i + 20]], return_exceptions=True)
            n += sum(1 for r in res if r is True)
        logger.info(f"[Duyuru] {batch}: {n}/{len(ids)} kullanıcıya gönderildi")
    _bg(run())
    return {"ok": True, "recipients": len(ids), "batch": batch}


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


# GÜVENLİK: en büyük meşru istek gövdemiz (katalog dosyası base64) ~21MB --
# bundan büyük hiçbir istek gövdesi olmamalı. Bu kontrol olmadan, Content-Length
# ile bildirilmiş dev bir gövde, herhangi bir Pydantic doğrulaması çalışmadan
# ÖNCE tamamen belleğe okunuyor (uvicorn/Starlette body parse aşaması) --
# kimliği doğrulanmamış bir istemci bile sunucuyu bellek tüketimiyle
# yorabilir (DoS). Content-Length erkenden reddedilerek bu engelleniyor.
_MAX_REQUEST_BODY_BYTES = 25 * 1024 * 1024  # ~25MB (en büyük meşru yük + pay)


@app.middleware("http")
async def _max_body_size(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > _MAX_REQUEST_BODY_BYTES:
                from fastapi.responses import JSONResponse
                return JSONResponse(status_code=413, content={"detail": "İstek gövdesi çok büyük"})
        except ValueError:
            pass
    return await call_next(request)


logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# BUG FIX (genel): FastAPI/Starlette varsayilan olarak, bir endpoint icinde
# yakalanmamis herhangi bir exception oldugunda JSON DEGIL, duz metin
# "Internal Server Error" govdesi donduruyordu. Istemci tarafinda (api.ts)
# hata govdesi hep JSON.parse() ile okunmaya calisiliyor; bu parse basarisiz
# oldugunda kullaniciya gercek sebep yerine hep jenerik "... basarisiz,
# lutfen tekrar deneyin" mesaji gosteriliyordu (ör. Abonelik odeme ekrani).
# Bu handler, HERHANGI bir route'ta beklenmeyen bir hata olustugunda
# gercek traceback'i loglar VE istemciye duzgun bir JSON {"detail": ...}
# govdesi doner -- boylece hem kullanici anlamli bir mesaj gorur hem de
# Railway loglarindan gercek sebep izlenebilir.
@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception(f"[unhandled] {request.method} {request.url.path}")
    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=500,
        content={"detail": "Beklenmeyen bir hata oluştu, lütfen tekrar deneyin"},
    )


@app.on_event("startup")
async def on_startup():
    # Railway'deki Mongo diski 500 MB; Mongo ise varsayılan olarak indeks
    # kurmak için 500 MB BOŞ alan istiyor -- bu diskte asla sağlanamaz ve
    # yeni indeksler hiç oluşmuyordu. Eşiği düşür (mongod her açılışta
    # varsayılana döndüğü için her başlangıçta tekrar ayarlanır).
    try:
        await client.admin.command({"setParameter": 1, "indexBuildMinAvailableDiskSpaceMB": 50})
    except Exception as e:
        logger.warning(f"indexBuildMinAvailableDiskSpaceMB ayarlanamadi: {e}")
    try:
        sizes = []
        for name in await db.list_collection_names():
            st = await db.command("collStats", name)
            sizes.append((int(st.get("storageSize", 0)) + int(st.get("totalIndexSize", 0)), name, int(st.get("count", 0))))
        sizes.sort(reverse=True)
        logger.info("DB boyutlari (KB): " + ", ".join(f"{n}={b // 1024}KB/{c}" for b, n, c in sizes[:15]))
    except Exception as e:
        logger.warning(f"DB boyut raporu alinamadi: {e}")
    try:
        snap = await _capacity_snapshot()
        logger.info("[Kapasite] " + ", ".join(f"{k}={v}" for k, v in snap.items()))
    except Exception as e:
        logger.warning(f"Kapasite olcumu alinamadi: {e}")
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("user_id", unique=True)
        await db.users.create_index("phone_normalized", unique=True, sparse=True)
        await db.users.create_index("email_canonical", unique=True, sparse=True)
        await db.password_resets.create_index("token_hash", unique=True)
        await db.password_resets.create_index("expires_at", expireAfterSeconds=0)
        await db.revoked_tokens.create_index("jti", unique=True)
        await db.revoked_tokens.create_index("expires_at", expireAfterSeconds=0)
        # Ekip Sohbeti: personel bir konusmayi kendi tarafinda hemen "silebilir"
        # (bkz. deletedFor), ama mesajlar yonetici gorunumu icin 30 gun daha
        # veritabaninda kalir ve bu TTL index sayesinde suresi dolunca
        # otomatik olarak tamamen silinir.
        await db.team_messages.create_index("expiresAt", expireAfterSeconds=0)
        # Veri büyüdükçe (yüzlerce/binlerce teklif, tahsilat vb. biriktikçe)
        # her firma sorgusunun tüm koleksiyonu taramaması için: bu dört
        # koleksiyon userId+companyId ile filtreleniyor, listelerde de
        # createdAt'a göre sıralanıyor -- bileşik index bu sorguları tek
        # index taramasıyla karşılar.
        await db.quotes.create_index([("userId", 1), ("companyId", 1), ("createdAt", -1)])
        await db.customers.create_index([("userId", 1), ("companyId", 1)])
        await db.kasa.create_index([("userId", 1), ("companyId", 1)])
        await db.tahsilat.create_index([("userId", 1), ("companyId", 1)])
        await db.notify_log.create_index("key", unique=True)
        await db.stock_moves.create_index([("userId", 1), ("companyId", 1), ("createdAt", -1)])
        await db.calendar_feeds.create_index("token", unique=True)
        await db.invoices.create_index([("userId", 1), ("companyId", 1)])
        await db.user_notifications.create_index("key", unique=True)
        await db.user_notifications.create_index([("userId", 1), ("createdAt", -1)])
        await db.user_notifications.create_index([("userId", 1), ("readAt", 1)])
        await db.push_subs.create_index("ident", unique=True)
        await db.push_subs.create_index("userId")
    except Exception as e:
        logger.warning(f"Index setup issue: {e}")

    # Otomatik e-posta hatırlatmaları (vade/bakım/teklif takibi/günlük özet).
    if os.environ.get("NOTIFY_LOOP_DISABLED") != "1":
        app.state.notify_task = asyncio.create_task(_notify_loop())

    # Kullanıcı bildirimleri: sabah özeti + akşam akıllı hatırlatma/ipucu.
    if os.environ.get("ENGAGE_LOOP_DISABLED") != "1":
        app.state.engage_task = asyncio.create_task(_engage_loop())

    # Gecelik veritabanı yedeği (BACKUP_BUCKET ayarlıysa).
    if os.environ.get("BACKUP_BUCKET") and os.environ.get("BACKUP_LOOP_DISABLED") != "1":
        app.state.backup_task = asyncio.create_task(_backup_loop())

    try:
        # Albert Genau fiyat listesi: ilk acilista, veritabaninda henuz
        # kayit yoksa, paket icindeki varsayilan Excel-cikartma verisiyle
        # (albert_genau_price_data.json) tohumla. Daha sonra admin panelden
        # yeni bir Excel yuklendiginde bu kayit guncellenir; formuller
        # (albert_genau_calc.py) hic degismez.
        existing_ag = await db.albert_genau_config.find_one({"id": "default"})
        if not existing_ag:
            await db.albert_genau_config.insert_one({
                "id": "default",
                "price_list": ag_calc._DEFAULT_DATA["price_list"],
                "depth_table": ag_calc._DEFAULT_DATA["depth_table"],
                "belt_table": ag_calc._DEFAULT_DATA["belt_table"],
                "updatedAt": utc_now_iso(),
                "updatedBy": "seed",
            })
    except Exception as e:
        logger.warning(f"Albert Genau seed issue: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
