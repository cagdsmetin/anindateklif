from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends, Form, Request, Query
from fastapi.responses import RedirectResponse
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
from datetime import datetime, timezone, timedelta


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
    onboarding_completed: Optional[bool] = None

    @field_validator("language")
    @classmethod
    def _lang_allowed(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("tr", "en", "it"):
            raise ValueError("Gecersiz dil kodu")
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
        resolved["_impersonated"] = imp_flag
        resolved["_impersonated_by"] = imp_by
        return resolved

    account["is_staff"] = False
    account["_impersonated"] = imp_flag
    account["_impersonated_by"] = imp_by
    return account


def _self_id(user: Dict[str, Any]) -> str:
    """The REAL logged-in person's user_id — same as user["user_id"] for a
    normal/owner account, but for a resolved staff account (see
    get_current_user) user["user_id"] has been swapped to the OWNER's id, so
    identity-only endpoints (auth/me, phone OTP) must use this instead."""
    return user.get("actual_user_id") or user["user_id"]


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
    maliyet: Optional[float] = None
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


class QuoteStatusUpdate(BaseModel):
    durum: str


class QuoteMaliyetUpdate(BaseModel):
    maliyet: Optional[float] = None


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


# ============ COMPANY ROUTES ============
@api_router.get("/")
async def root():
    return {"message": "Anında Teklif API", "status": "ok"}


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
    obj = CatalogItem(userId=user["user_id"], **payload.dict())
    await db.catalog.insert_one(obj.dict())
    return obj


@api_router.post("/catalog/bulk", response_model=List[CatalogItem])
async def bulk_create_catalog(payload: CatalogBulkCreate, user=Depends(get_current_user)):
    _require_owner(user)
    await _own_company(user, payload.companyId)
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
    _require_owner(user)
    doc = await db.catalog.find_one({"id": item_id, "userId": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Item not found")
    updated = {**doc, **payload.dict()}
    await db.catalog.replace_one({"id": item_id, "userId": user["user_id"]}, updated)
    return CatalogItem(**updated)


@api_router.delete("/catalog/{item_id}")
async def delete_catalog_item(item_id: str, user=Depends(get_current_user)):
    _require_owner(user)
    await db.catalog.delete_one({"id": item_id, "userId": user["user_id"]})
    return {"ok": True}


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
    doc = await db.catalog_files.find_one({"id": file_id, "userId": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Dosya bulunamadı")
    company = await db.companies.find_one({"id": doc["companyId"], "userId": user["user_id"]}, {"_id": 0})
    company_name = (company or {}).get("sirketAdi") or "Firma"
    _, _, b64_content = doc["dataBase64"].partition(",")
    await _send_catalog_file_email(str(payload.toEmail), company_name, doc["name"], doc["mime"], b64_content, payload.message)
    return {"ok": True}


def _require_kasa_access(user: Dict[str, Any]):
    """Restricted staff (role 'staff', not 'admin') never see Kasa/Tahsilat —
    enforced here server-side, not just by hiding the tabs in the app."""
    if user.get("is_staff") and user.get("staff_role") != "admin":
        raise HTTPException(status_code=403, detail="Bu bölüme erişim izniniz yok")


# ============ KASA (GELİR/GİDER) ROUTES ============
@api_router.get("/kasa/{company_id}", response_model=List[KasaEntry])
async def list_kasa(company_id: str, user=Depends(get_current_user)):
    _require_kasa_access(user)
    await _own_company(user, company_id)
    docs = await db.kasa.find({"companyId": company_id, "userId": user["user_id"]}, {"_id": 0}).to_list(5000)
    return [KasaEntry(**d) for d in docs]


@api_router.post("/kasa", response_model=KasaEntry)
async def create_kasa_entry(payload: KasaEntryCreate, user=Depends(get_current_user)):
    _require_kasa_access(user)
    await _own_company(user, payload.companyId)
    obj = KasaEntry(userId=user["user_id"], **payload.dict())
    await db.kasa.insert_one(obj.dict())
    return obj


@api_router.delete("/kasa/{entry_id}")
async def delete_kasa_entry(entry_id: str, user=Depends(get_current_user)):
    _require_kasa_access(user)
    await db.kasa.delete_one({"id": entry_id, "userId": user["user_id"]})
    return {"ok": True}


# ============ TAHSILAT (ALACAK/BORÇ) ROUTES ============
@api_router.get("/tahsilat/{company_id}", response_model=List[TahsilatEntry])
async def list_tahsilat(company_id: str, user=Depends(get_current_user)):
    _require_kasa_access(user)
    await _own_company(user, company_id)
    docs = await db.tahsilat.find({"companyId": company_id, "userId": user["user_id"]}, {"_id": 0}).to_list(5000)
    return [TahsilatEntry(**d) for d in docs]


@api_router.post("/tahsilat", response_model=TahsilatEntry)
async def create_tahsilat_entry(payload: TahsilatEntryCreate, user=Depends(get_current_user)):
    _require_kasa_access(user)
    await _own_company(user, payload.companyId)
    obj = TahsilatEntry(userId=user["user_id"], **payload.dict())
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
        )
        await db.kasa.insert_one(kasa_doc.dict())

    return obj


@api_router.delete("/tahsilat/{entry_id}")
async def delete_tahsilat_entry(entry_id: str, user=Depends(get_current_user)):
    _require_kasa_access(user)
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
    return [Customer(**d) for d in docs]


@api_router.post("/customers", response_model=Customer)
async def create_customer(payload: CustomerCreate, user=Depends(get_current_user)):
    await _own_company(user, payload.companyId)
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


@api_router.put("/customers/{customer_id}", response_model=Customer)
async def update_customer(customer_id: str, payload: CustomerCreate, user=Depends(get_current_user)):
    await _own_company(user, payload.companyId)
    existing = await db.customers.find_one({"id": customer_id, "userId": user["user_id"]}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Customer not found")
    updated = {**existing, **payload.dict()}
    await db.customers.replace_one({"id": customer_id, "userId": user["user_id"]}, updated)
    return Customer(**updated)


@api_router.delete("/customers/{customer_id}")
async def delete_customer(customer_id: str, user=Depends(get_current_user)):
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
    return [Quote(**d) for d in docs]


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
    # Onaylı bir teklifi reddetmek, o teklife bağlı Tahsilat borcunu da iptal
    # ediyor -- bu geri alınamaz bir mali işlem olduğu için sadece firma
    # sahibi yapabilir, hiçbir personel (admin rollü olsa bile) yapamaz.
    if previous_durum == "Onaylandı" and payload.durum == "Reddedildi" and user.get("is_staff"):
        raise HTTPException(status_code=403, detail="Onaylı bir teklifi sadece firma sahibi reddedebilir")
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
            )
            await db.tahsilat.insert_one(tahsilat_doc.model_dump())
        # NOT: Onay anında Kasa'ya gelir YAZILMAZ — teklif tutarı henüz tahsil
        # edilmiş değil, sadece müşteri carisine borç işlenir. Kasa'ya gelir,
        # müşteriden gerçekten para geldiğinde (Tahsilat ekranından "tahsilat"
        # kaydı girildiğinde, bkz. create_tahsilat_entry) otomatik eklenir.

    # Onayın tam tersi: teklif "Reddedildi" durumuna geçerse, bu teklif için
    # otomatik oluşturulmuş olan borç kaydını iptal et (sil). Teklif hiç
    # onaylanmadıysa zaten böyle bir kayıt yoktur, hiçbir şey silinmez.
    if payload.durum == "Reddedildi" and previous_durum != "Reddedildi":
        await db.tahsilat.delete_many({
            "userId": user["user_id"],
            "quoteId": quote_id,
            "tur": "borc",
        })

    return Quote(**doc)


@api_router.patch("/quotes/{quote_id}/maliyet", response_model=Quote)
async def update_quote_maliyet(quote_id: str, payload: QuoteMaliyetUpdate, user=Depends(get_current_user)):
    """Teklif verildikten sonra girilen isteğe bağlı maliyet -- kar hesabı için.
    Zorunlu değil: null gönderilirse maliyet temizlenmiş sayılır."""
    doc = await db.quotes.find_one({"id": quote_id, "userId": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Quote not found")
    doc["maliyet"] = payload.maliyet
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
    return [Quote(**d) for d in docs]


@api_router.post("/quotes/{quote_id}/restore", response_model=Quote)
async def restore_quote(quote_id: str, user=Depends(get_current_user)):
    result = await db.quotes.update_one(
        {"id": quote_id, "userId": user["user_id"], "deletedAt": {"$exists": True, "$ne": None}},
        {"$unset": {"deletedAt": ""}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Silinen teklif bulunamadı (süresi dolmuş olabilir)")
    doc = await db.quotes.find_one({"id": quote_id, "userId": user["user_id"]}, {"_id": 0})
    return Quote(**doc)


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
    days_left: Optional[int] = None
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
    return SubscriptionStatus(
        subscription_active=state["subscription_active"],
        subscription_expires_at=user.get("subscription_expires_at"),
        subscription_plan=user.get("subscription_plan"),
        days_left=days_left,
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
        "amount": plan_price,
        "currency": iyzico_currency,
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
    await db.leads.update_one({"id": lead_id, "userId": user["user_id"]}, {"$set": updates})
    doc.update(updates)
    return LeadCompany(**doc)


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
    # Sadece gerçek firma sahibi hesapları (personel hesapları hariç) —
    # personelin hesabına değil, doğrudan firma sahibine girilir.
    docs = await db.users.find(
        {"staff_owner_user_id": {"$in": [None, ""]}},
        {"_id": 0, "user_id": 1, "email": 1, "name": 1, "phone": 1, "createdAt": 1, "subscription_expires_at": 1},
    ).sort("createdAt", -1).to_list(2000)
    out: List[AdminCustomerOut] = []
    for d in docs:
        email = (d.get("email") or "").strip().lower()
        if email in ADMIN_EMAILS:
            continue
        company = await db.companies.find_one({"userId": d["user_id"]}, {"_id": 0, "sirketAdi": 1})
        out.append(AdminCustomerOut(
            user_id=d["user_id"],
            email=d.get("email", ""),
            name=d.get("name", ""),
            phone=d.get("phone", ""),
            company_name=(company or {}).get("sirketAdi", ""),
            created_at=d.get("createdAt"),
            subscription_active=_is_subscription_active(d),
        ))
    return out


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
    except Exception as e:
        logger.warning(f"Index setup issue: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
