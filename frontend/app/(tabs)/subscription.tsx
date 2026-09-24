import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { api, RatesT } from '@/src/lib/api';
import { refreshProBanner } from '@/src/components/ProBanner';
import { useAuth } from '@/src/state/AuthContext';
import { storage } from '@/src/utils/storage';
import { useLanguage, upper } from '@/src/lib/i18n';
import { Aurora, BorderBeam, CountUp, MotionInput, MotionScrollView, Reveal, themedStyles } from '@/src/components/motion';
import { LinearGradient } from 'expo-linear-gradient';

type PlanT = {
  id: string;
  label: string;
  price_try: number;
  list_price_try?: number | null;
  price_usd?: number | null;
  list_price_usd?: number | null;
  price_eur?: number | null;
  list_price_eur?: number | null;
  duration_days: number;
};

type StatusT = {
  subscription_active: boolean;
  subscription_expires_at?: string | null;
  subscription_plan?: string | null;
  plan_label?: string | null;
  days_left?: number | null;
  promo_days_total?: number | null;
  promo_code?: string | null;
  renewal_due_soon?: boolean;
  plan_price_try: number;
  plans: PlanT[];
  seat_count?: number;
  period: string;
  quotes_used_this_month: number;
  free_limit: number;
  remaining_free?: number | null;
};

const BILLING_INFO_KEY = 'sub_billing_info_v1';

const FALLBACK_PLANS: PlanT[] = [
  { id: 'weekly', label: 'Haftalık Abonelik', price_try: 50, price_usd: 10, price_eur: 10, duration_days: 7 },
  {
    id: 'yearly',
    label: 'Yıllık Abonelik',
    price_try: 2000,
    list_price_try: 2400,
    price_usd: 400,
    list_price_usd: 480,
    price_eur: 400,
    list_price_eur: 480,
    duration_days: 365,
  },
];

function planUnitLabel(durationDays: number): string {
  if (durationDays === 7) return '/ hafta';
  if (durationDays === 365) return '/ yıl';
  if (durationDays === 30) return '/ ay';
  return `/ ${durationDays} gün`;
}

// İngilizce kullanan müşteri $, İtalyanca kullanan müşteri € ile SABİT
// fiyattan tahsil edilir (kur ne olursa olsun hep aynı $/€ tutarı --
// backend'deki price_usd/price_eur alanlarıyla birebir aynı, gerçekten
// tahsil edilen tutar budur). Türkçe'de değişen bir şey yok, hep TL.
// planPrimaryPrice: o dilde BÜYÜK gösterilecek asıl tutar + sembolü.
function planPrimaryPrice(plan: PlanT, lang: 'tr' | 'en' | 'it'): { amount: number; listAmount?: number | null; sym: string } {
  if (lang === 'en' && plan.price_usd != null) {
    return { amount: plan.price_usd, listAmount: plan.list_price_usd, sym: '$' };
  }
  if (lang === 'it' && plan.price_eur != null) {
    return { amount: plan.price_eur, listAmount: plan.list_price_eur, sym: '€' };
  }
  return { amount: plan.price_try, listAmount: plan.list_price_try, sym: '₺' };
}

// Asıl tahsilat $/€ olduğunda ekranın altında bilgi amaçlı "≈ ₺X" notu --
// o günün kuruyla yaklaşık TL karşılığı, sadece fikir vermek için.
function approxTryLabel(plan: PlanT, lang: 'tr' | 'en' | 'it', rates: RatesT | null): string | null {
  if (lang === 'tr') return null;
  const primary = planPrimaryPrice(plan, lang);
  if (primary.sym === '₺') return null; // fallback zaten TL, not gerekmiyor
  const rate = lang === 'en' ? rates?.usd_try : rates?.eur_try;
  if (!rate) return null;
  const val = primary.amount * rate;
  return `≈ ₺${val.toFixed(2)}`;
}

export default function SubscriptionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { lang } = useLanguage();

  const [status, setStatus] = useState<StatusT | null>(null);
  const [rates, setRates] = useState<RatesT | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [selectedPlan, setSelectedPlan] = useState<string>('yearly');
  const [kimlikNo, setKimlikNo] = useState('');
  const [adres, setAdres] = useState('');
  const [sehir, setSehir] = useState('İstanbul');
  const [posta, setPosta] = useState('34000');
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoError, setPromoError] = useState('');
  const [promoSuccess, setPromoSuccess] = useState('');

  useEffect(() => {
    api.rates().then((r) => setRates(r)).catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.subscriptionStatus();
        const st = res as StatusT;
        setStatus(st);
        // Odeme donusu bu ekrana gelir: ustteki abonelik seridi de guncellensin.
        refreshProBanner();
        if (st.subscription_plan) {
          setSelectedPlan(st.subscription_plan);
        } else if (st.plans && st.plans.length > 0 && !st.plans.some((p) => p.id === 'yearly')) {
          setSelectedPlan(st.plans[0].id);
        }
      } catch (e: any) {
        setError('Abonelik bilgisi alınamadı');
      } finally {
        setLoading(false);
      }
    })();
    (async () => {
      const saved = await storage.getItem<string>(BILLING_INFO_KEY, '');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed?.kimlikNo) setKimlikNo(parsed.kimlikNo);
          if (parsed?.adres) setAdres(parsed.adres);
          if (parsed?.sehir) setSehir(parsed.sehir);
          if (parsed?.posta) setPosta(parsed.posta);
        } catch {}
      }
    })();
  }, []);

  const plans: PlanT[] = useMemo(
    () => (status?.plans && status.plans.length > 0 ? status.plans : FALLBACK_PLANS),
    [status]
  );

  const activePlan = useMemo(
    () => plans.find((p) => p.id === selectedPlan) || plans[0],
    [plans, selectedPlan]
  );

  const onRedeemPromo = async () => {
    if (promoBusy) return;
    const code = promoCode.trim().toUpperCase();
    if (!code) { setPromoError('Kod giriniz'); return; }
    setPromoError('');
    setPromoSuccess('');
    setPromoBusy(true);
    try {
      const res: any = await api.redeemPromoCode(code);
      const days = res?.duration_days ?? 0;
      setPromoSuccess(`Kod uygulandı! ${days} gün sınırsız teklif hakkı tanımlandı.`);
      setPromoCode('');
      try {
        const st = await api.subscriptionStatus();
        setStatus(st as StatusT);
        refreshProBanner();
      } catch {}
    } catch (e: any) {
      let msg = 'Kod uygulanamadı';
      if (e?.body) {
        try {
          const parsed = JSON.parse(e.body);
          if (parsed?.detail) msg = parsed.detail;
        } catch {}
      }
      setPromoError(msg);
    } finally {
      setPromoBusy(false);
    }
  };

  const onSubscribe = async () => {
    if (busy || !activePlan) return;
    if (kimlikNo.trim().length < 5) {
      setError('TC Kimlik / Vergi No zorunlu');
      return;
    }
    if (!adres.trim() || !sehir.trim()) {
      setError('Adres ve şehir zorunlu');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const res = await api.subscriptionCheckout({
        plan: activePlan.id,
        buyer_identity_number: kimlikNo.trim(),
        billing_address: adres.trim(),
        billing_city: sehir.trim(),
        billing_zip: posta.trim(),
      });
      const url = res?.payment_page_url;
      if (url) {
        // Fatura bilgilerini yerelde sakla — bir sonraki yenilemede (haftalık/yıllık
        // dönem bitince) kullanıcı formu tekrar doldurmasın, tek tıkla yenileyebilsin.
        await storage.setItem(
          BILLING_INFO_KEY,
          JSON.stringify({ kimlikNo: kimlikNo.trim(), adres: adres.trim(), sehir: sehir.trim(), posta: posta.trim() })
        );
        await Linking.openURL(url);
      } else {
        setError('Ödeme sayfası oluşturulamadı');
      }
    } catch (e: any) {
      let msg = 'Ödeme başlatılamadı, lütfen tekrar deneyin';
      if (e?.body) {
        try {
          const parsed = JSON.parse(e.body);
          if (parsed?.detail) msg = parsed.detail;
        } catch {}
      }
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const remaining = status?.subscription_active ? null : status?.remaining_free ?? 0;
  const usedUp = !status?.subscription_active && (status?.remaining_free ?? 0) <= 0;
  const dueSoon = !!(status?.subscription_active && status?.renewal_due_soon);
  const isPromo = status?.subscription_plan === 'promo';
  const daysLeft = typeof status?.days_left === 'number' ? Math.max(0, status.days_left) : null;
  const promoTotal = isPromo && status?.promo_days_total ? status.promo_days_total : null;
  // Dolum orani: hediye kodunda kodun toplam suresine, abonelikte plan
  // suresine gore. Plan bilinmiyorsa 30 gunluk bir olcek varsayilir.
  const remainRatio = (() => {
    if (daysLeft === null) return 0;
    const planDays = promoTotal
      || (status?.subscription_plan === 'yearly' ? 365 : status?.subscription_plan === 'weekly' ? 7 : 30);
    return Math.max(0.04, Math.min(1, daysLeft / planDays));
  })();
  const expiryLabel = (() => {
    const raw = status?.subscription_expires_at;
    if (!raw) return '';
    const d = new Date(raw);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
  })();
  const showPlanSection = !status?.subscription_active || dueSoon;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} testID="subscription-back">
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Abonelik</Text>
        <View style={s.headerBtn} />
      </View>
      <View style={s.divider} />

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <MotionScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            {/* Durum kartı -- koyu "aurora" blok: abonelik durumu ve kalan
                ücretsiz hak tek bakışta görünür (21st.dev'deki koyu gradyanlı
                fiyatlandırma bölümlerinden esinlenildi). */}
            <Aurora
              colors={status?.subscription_active ? ['#10B981', '#6366F1', '#22D3EE'] : ['#6366F1', '#A855F7', '#22D3EE']}
              style={s.subHero}
            >
              <View style={s.subHeroInner}>
                <View style={s.subHeroTop}>
                  <View style={s.subHeroIcon}>
                    <Ionicons
                      name={status?.subscription_active ? (dueSoon ? 'time-outline' : 'checkmark-circle') : usedUp ? 'alert-circle' : 'sparkles'}
                      size={20}
                      color="#fff"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.subHeroEyebrow}>{isPromo ? 'HEDİYE KODU' : 'ABONELİK'}</Text>
                    <Text style={s.subHeroTitle} numberOfLines={2}>
                      {status?.subscription_active
                        ? isPromo
                          ? 'Hediye kodunuz kullanımda'
                          : `${status.plan_label || 'Aboneliğiniz'} aktif`
                        : usedUp
                          ? 'Ücretsiz hakkınız doldu'
                          : 'Ücretsiz kullanımdasınız'}
                    </Text>
                  </View>
                </View>

                {/* Kalan süre her zaman görünür: kullanıcı aboneliğinin ne
                    kadar kaldığını görmek için hesap ekranına girmek veya
                    süre dolmaya yaklaşmasını beklemek zorunda kalmasın. */}
                {status?.subscription_active && daysLeft !== null ? (
                  <View style={s.remainWrap}>
                    <View style={s.remainTop}>
                      <Text style={s.remainValue}>
                        {daysLeft}
                        <Text style={s.remainUnit}> gün kaldı</Text>
                      </Text>
                      {promoTotal ? (
                        <Text style={s.remainOf}>{promoTotal} günün {promoTotal - daysLeft} günü kullanıldı</Text>
                      ) : expiryLabel ? (
                        <Text style={s.remainOf}>Bitiş: {expiryLabel}</Text>
                      ) : null}
                    </View>
                    <View style={s.remainTrack}>
                      <View
                        style={[
                          s.remainFill,
                          { width: `${Math.round(remainRatio * 100)}%`, backgroundColor: dueSoon ? theme.colors.gold : theme.colors.green },
                        ]}
                      />
                    </View>
                  </View>
                ) : null}
                <Text style={s.subHeroText}>
                  {status?.subscription_active
                    ? dueSoon
                      ? 'Otomatik çekim yapılmaz — kesintisiz devam etmek için aşağıdan yenileyin.'
                      : 'Sınırsız teklif oluşturabilirsiniz.'
                    : usedUp
                      ? 'Devam etmek için bir plan seçin; teklifleriniz ve müşterileriniz olduğu gibi kalır.'
                      : `Bu ay ${status?.quotes_used_this_month ?? 0} / ${status?.free_limit ?? 5} ücretsiz teklif kullandınız.`}
                </Text>
                {!status?.subscription_active && (
                  <View style={s.quotaWrap}>
                    <View style={s.quotaBar}>
                      <View
                        style={[
                          s.quotaFill,
                          {
                            width: `${Math.min(100, Math.round(((status?.quotes_used_this_month ?? 0) / Math.max(1, status?.free_limit ?? 5)) * 100))}%`,
                            backgroundColor: usedUp ? '#F87171' : '#A5B4FC',
                          },
                        ]}
                      />
                    </View>
                    <Text style={s.quotaLabel}>
                      {usedUp ? 'Kalan hak yok' : `Kalan ücretsiz hak: ${remaining}`}
                    </Text>
                  </View>
                )}
              </View>
            </Aurora>

            {/* Hediye/promosyon kodu — kullanıcı raporu: "çok altta kalmış, göz
                önüne getir" -- eskiden CTA'nın altında, sayfanın en sonunda,
                küçük ve soluk bir metin linki olarak duruyordu; kolayca
                atlanıyordu. Şimdi status kartının hemen altında, plan
                seçiminden önce, kendi dikkat çekici (altın renkli) kartı
                içinde gösteriliyor. */}
            <TouchableOpacity
              style={s.promoToggle}
              onPress={() => setPromoOpen((v) => !v)}
              activeOpacity={0.85}
              testID="promo-toggle"
            >
              <View style={s.promoToggleIconWrap}>
                <Ionicons name="gift" size={18} color={theme.colors.gold} />
              </View>
              <Text style={s.promoToggleText}>Hediye kodunuz mu var?</Text>
              <Ionicons name={promoOpen ? 'chevron-up' : 'chevron-down'} size={16} color={theme.colors.goldDark} />
            </TouchableOpacity>
            {promoOpen && (
              <View style={s.promoBox}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <MotionInput
                    style={[s.input, { flex: 1, textTransform: 'uppercase' }]}
                    placeholder="Örn. AB12CD34"
                    placeholderTextColor="#94a3b8"
                    value={promoCode}
                    onChangeText={setPromoCode}
                    autoCapitalize="characters"
                    testID="promo-code-input"
                  />
                  <TouchableOpacity
                    style={[s.promoBtn, promoBusy && s.ctaDisabled]}
                    onPress={onRedeemPromo}
                    disabled={promoBusy}
                    testID="promo-redeem-submit"
                  >
                    {promoBusy ? <ActivityIndicator color="#fff" /> : <Text style={s.promoBtnText}>Uygula</Text>}
                  </TouchableOpacity>
                </View>
                {promoError ? <Text style={s.errorText}>{promoError}</Text> : null}
                {promoSuccess ? <Text style={s.promoSuccess}>{promoSuccess}</Text> : null}
              </View>
            )}

            {showPlanSection && (
              <>
                {/* Plan picker */}
                <Text style={s.formLabel}>{upper('Plan Seç')}</Text>
                {status && (status.seat_count ?? 1) > 1 && (
                  <View style={s.seatNote} testID="sub-seat-note">
                    <Ionicons name="people-outline" size={14} color={theme.colors.primary} />
                    <Text style={s.seatNoteText}>
                      {status.seat_count} kişilik ekibiniz için fiyatlandırma (siz dahil)
                    </Text>
                  </View>
                )}
                <View style={{ gap: 14, marginBottom: 24 }}>
                  {plans.map((plan) => {
                    const selected = plan.id === selectedPlan;
                    const isYearly = plan.duration_days >= 365;
                    const pp = planPrimaryPrice(plan, lang);
                    const approx = approxTryLabel(plan, lang, rates);
                    const save = pp.listAmount && pp.listAmount > pp.amount ? Math.round((1 - pp.amount / pp.listAmount) * 100) : 0;
                    const content = (
                      <View style={s.planInner}>
                        <View style={s.planHeaderRow}>
                          <Text style={[s.planName, selected && s.planNameSel]} numberOfLines={1}>{plan.label}</Text>
                          {isYearly && (
                            <View style={[s.planBadge, selected && s.planBadgeSel]}>
                              <Text style={[s.planBadgeText, selected && s.planBadgeTextSel]}>Önerilen</Text>
                            </View>
                          )}
                        </View>
                        <View style={s.priceRow}>
                          {pp.listAmount ? (
                            <Text style={[s.planListPrice, selected && s.planListPriceSel]}>
                              {pp.sym}{pp.listAmount.toFixed(0)}
                            </Text>
                          ) : null}
                          <CountUp
                            value={pp.amount}
                            duration={900}
                            format={(n) => `${pp.sym}${n.toFixed(pp.sym === '₺' ? 0 : 2)}`}
                            style={[s.planPrice, selected && s.planPriceSel]}
                          />
                          <Text style={[s.planPriceUnit, selected && s.planPriceUnitSel]}>{planUnitLabel(plan.duration_days)}</Text>
                        </View>
                        <View style={s.priceMetaRow}>
                          {save > 0 ? (
                            <View style={s.saveBadge}>
                              <Ionicons name="pricetag" size={10} color={theme.colors.greenText} />
                              <Text style={s.saveBadgeText}>%{save} indirim</Text>
                            </View>
                          ) : null}
                          {approx ? <Text style={[s.planApprox, selected && s.planApproxSel]}>{approx}</Text> : null}
                        </View>
                        <View style={{ marginTop: 14, gap: 9 }}>
                          <PlanBullet text="Sınırsız teklif oluşturma" dark={selected} />
                          <PlanBullet text={isYearly ? 'Yıllık otomatik yenileme' : 'Haftalık otomatik yenileme'} dark={selected} />
                          <PlanBullet text="Dilediğiniz zaman iptal" dark={selected} />
                        </View>
                        <View style={[s.radioOuter, selected && s.radioOuterSelected]}>
                          {selected && <View style={s.radioInner} />}
                        </View>
                      </View>
                    );
                    return (
                      <Reveal key={plan.id} variant="up">
                        <TouchableOpacity activeOpacity={0.92} onPress={() => setSelectedPlan(plan.id)} testID={`sub-plan-${plan.id}`}>
                          {selected ? (
                            <BorderBeam
                              radius={22}
                              width={1.6}
                              background="#0F172A"
                              baseBorder="rgba(148,163,184,0.25)"
                              colors={['rgba(129,140,248,0)', '#818CF8', '#22D3EE', 'rgba(34,211,238,0)']}
                            >
                              {content}
                            </BorderBeam>
                          ) : (
                            <View style={s.planShell}>{content}</View>
                          )}
                        </TouchableOpacity>
                      </Reveal>
                    );
                  })}
                </View>

                {/* Billing form */}
                <Text style={s.formLabel}>{upper('Fatura Bilgileri')}</Text>
                <View style={s.card}>
                  <FieldRow label="TC Kimlik / Vergi No" icon="card-outline" placeholder="11111111111" value={kimlikNo} onChange={setKimlikNo} keyboardType="number-pad" testID="sub-identity" />
                  <FieldRow label="Adres" icon="location-outline" placeholder="Fatura adresi" value={adres} onChange={setAdres} multiline testID="sub-address" />
                  <FieldRow label="Şehir" icon="business-outline" placeholder="İstanbul" value={sehir} onChange={setSehir} testID="sub-city" />
                  <FieldRow label="Posta Kodu" icon="mail-outline" placeholder="34000" value={posta} onChange={setPosta} keyboardType="number-pad" isLast testID="sub-zip" />
                </View>

                {error ? <Text style={s.errorText}>{error}</Text> : null}

                <TouchableOpacity style={[s.cta, busy && s.ctaDisabled]} onPress={onSubscribe} disabled={busy} activeOpacity={0.9} testID="sub-subscribe">
                  <LinearGradient
                    colors={['#6366F1', '#4F46E5', '#7C3AED']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="lock-closed" size={15} color="rgba(255,255,255,0.9)" />
                      <Text style={s.ctaText}>
                        {(() => {
                          if (!activePlan) return dueSoon ? 'Yenile' : 'Abone Ol';
                          const pp = planPrimaryPrice(activePlan, lang);
                          return `${dueSoon ? 'Yenile' : 'Abone Ol'} — ${pp.sym}${pp.amount.toFixed(pp.sym === '₺' ? 0 : 2)}${planUnitLabel(activePlan.duration_days)}`;
                        })()}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
                {activePlan && approxTryLabel(activePlan, lang, rates) ? (
                  <Text style={s.ctaApprox}>{approxTryLabel(activePlan, lang, rates)}</Text>
                ) : null}
                <Text style={s.footNote}>Ödeme iyzico güvenli ödeme sayfasına yönlendirilerek tamamlanır.</Text>
              </>
            )}
          </MotionScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

function PlanBullet({ text, dark }: { text: string; dark?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
      <View style={[s.bulletCheck, dark && s.bulletCheckDark]}>
        <Ionicons name="checkmark" size={11} color={dark ? '#6EE7B7' : theme.colors.green} />
      </View>
      <Text style={{ fontSize: 13.5, color: dark ? 'rgba(226,232,240,0.95)' : theme.colors.textSoft }}>{text}</Text>
    </View>
  );
}

function FieldRow({
  label,
  icon,
  isLast,
  onChange,
  ...rest
}: Omit<React.ComponentProps<typeof TextInput>, 'onChange'> & {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  isLast?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <View style={[s.field, isLast && { marginBottom: 0 }]}>
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={[s.inputWrap, rest.multiline && s.inputWrapMultiline]}>
        <Ionicons name={icon} size={17} color={theme.colors.primary} style={{ marginRight: 8, marginTop: rest.multiline ? 2 : 0 }} />
        <MotionInput
          {...rest}
          onChangeText={onChange}
          placeholderTextColor="#94a3b8"
          style={[s.input, rest.multiline && s.inputMultiline]}
        />
      </View>
    </View>
  );
}

const s = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surfaceSoft },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: theme.colors.surfaceSoft,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.text, letterSpacing: 0.1 },
  divider: { height: 1, backgroundColor: theme.colors.line },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 20,
  },
  statusCardInfo: { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.primaryBorder },
  statusCardActive: { backgroundColor: theme.colors.greenSoft, borderColor: '#86efac' },
  statusCardWarn: { backgroundColor: theme.colors.goldSoft, borderColor: theme.colors.goldBorder },
  statusCardDanger: { backgroundColor: theme.colors.redSoft, borderColor: theme.colors.red },
  statusTitle: { fontSize: 14.5, fontWeight: '800', color: theme.colors.text, marginBottom: 4 },
  statusText: { fontSize: 13, color: theme.colors.textMuted, lineHeight: 18 },
  seatNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
    marginTop: -6,
  },
  seatNoteText: {
    fontSize: 13,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  // Abonelik "hero" -- koyu aurora blok
  subHero: { borderRadius: 22, marginBottom: 18 },
  subHeroInner: { padding: 16 },
  subHeroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  subHeroIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: 'rgba(99,102,241,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(129,140,248,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subHeroEyebrow: { color: 'rgba(203,213,225,0.85)', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  subHeroTitle: { color: '#fff', fontSize: 17, fontWeight: '900', marginTop: 2, letterSpacing: -0.2 },
  subHeroText: { color: 'rgba(203,213,225,0.9)', fontSize: 12.5, lineHeight: 18, marginTop: 12 },
  // Kalan sure okunurlugu: buyuk rakam + ince ilerleme cubugu.
  remainWrap: {
    marginTop: 14, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)', borderRadius: 14, paddingHorizontal: 13, paddingVertical: 11,
  },
  remainTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  remainValue: { color: '#fff', fontSize: 25, fontWeight: '900', letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
  remainUnit: { color: 'rgba(226,232,240,0.85)', fontSize: 12.5, fontWeight: '800', letterSpacing: 0 },
  remainOf: { color: 'rgba(203,213,225,0.85)', fontSize: 11, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  remainTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.12)', marginTop: 9, overflow: 'hidden' },
  remainFill: { height: 6, borderRadius: 3 },
  quotaWrap: { marginTop: 14 },
  quotaBar: { height: 7, borderRadius: 4, backgroundColor: 'rgba(148,163,184,0.25)', overflow: 'hidden' },
  quotaFill: { height: '100%', borderRadius: 4 },
  quotaLabel: { color: 'rgba(203,213,225,0.9)', fontSize: 11, fontWeight: '800', marginTop: 7 },

  // Plan kartları
  planShell: {
    backgroundColor: theme.colors.surface,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: theme.colors.line,
    ...theme.shadow.sm,
  },
  planInner: { padding: 18, position: 'relative' },
  planNameSel: { color: '#fff' },
  planBadgeSel: { backgroundColor: 'rgba(129,140,248,0.25)', borderWidth: 1, borderColor: 'rgba(129,140,248,0.6)' },
  planBadgeTextSel: { color: '#C7D2FE' },
  planListPriceSel: { color: 'rgba(148,163,184,0.9)' },
  planPriceSel: { color: '#fff' },
  planPriceUnitSel: { color: 'rgba(203,213,225,0.85)' },
  planApproxSel: { color: 'rgba(203,213,225,0.85)' },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  priceMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  saveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.greenSoft,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  saveBadgeText: { color: theme.colors.greenText, fontSize: 10.5, fontWeight: '900' },
  bulletCheck: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulletCheckDark: { backgroundColor: 'rgba(16,185,129,0.18)' },
  planHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, paddingRight: 28 },
  planName: { fontSize: 15, fontWeight: '800', color: theme.colors.text },
  planBadge: { backgroundColor: theme.colors.primary, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  planBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  planListPrice: { fontSize: 15, fontWeight: '700', color: theme.colors.textMuted, textDecorationLine: 'line-through' },
  planPrice: { fontSize: 30, fontWeight: '900', color: theme.colors.primary },
  planPriceUnit: { fontSize: 14, fontWeight: '700', color: theme.colors.textMuted },
  planApprox: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  radioOuter: {
    position: 'absolute',
    top: 18,
    right: 18,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: theme.colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: { borderColor: theme.colors.primary },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: theme.colors.primary },
  formLabel: { fontSize: 13, fontWeight: '800', color: theme.colors.textMuted, marginBottom: 10, letterSpacing: 0.3, },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.line,
    ...theme.shadow.sm,
  },
  field: { marginBottom: 10 },
  fieldLabel: { fontSize: 12.5, fontWeight: '800', color: theme.colors.text, marginBottom: 5 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: 11,
    paddingHorizontal: 12,
    minHeight: 42,
  },
  inputWrapMultiline: { alignItems: 'flex-start', paddingTop: 10, paddingBottom: 10, minHeight: 64 },
  input: {
    flex: 1,
    fontSize: 13.5,
    color: theme.colors.text,
    paddingVertical: 0,
    ...(Platform.OS === 'web' ? ({ outlineWidth: 0 } as any) : {}),
  },
  inputMultiline: { minHeight: 48, textAlignVertical: 'top' },
  errorText: { color: theme.colors.red, fontSize: 13, fontWeight: '700', marginTop: 14, textAlign: 'center' },
  cta: {
    backgroundColor: theme.colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    overflow: 'hidden',
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
  ctaApprox: { fontSize: 12, color: theme.colors.textMuted, textAlign: 'center', marginTop: 6 },
  footNote: { fontSize: 11.5, color: theme.colors.textMuted, textAlign: 'center', marginTop: 10 },
  promoToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: theme.colors.goldSoft,
    borderWidth: 1.5,
    borderColor: theme.colors.goldBorder,
    borderRadius: 14,
    ...theme.shadow.sm,
  },
  promoToggleIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoToggleText: { flex: 1, fontSize: 13.5, fontWeight: '800', color: theme.colors.goldDark },
  promoBox: { marginTop: -10, marginBottom: 18, backgroundColor: theme.colors.goldSoft, borderRadius: 14, padding: 12, gap: 8, borderWidth: 1, borderColor: theme.colors.goldBorder },
  promoBtn: { backgroundColor: theme.colors.gold, borderRadius: 12, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  promoBtnText: { color: theme.colors.text, fontSize: 13.5, fontWeight: '900' },
  promoSuccess: { color: theme.colors.greenText, fontSize: 13, fontWeight: '700', textAlign: 'center' },
}));
