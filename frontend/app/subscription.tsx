import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
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
import { useAuth } from '@/src/state/AuthContext';
import { storage } from '@/src/utils/storage';
import { useLanguage, currencyForLang } from '@/src/lib/i18n';

type PlanT = {
  id: string;
  label: string;
  price_try: number;
  list_price_try?: number | null;
  duration_days: number;
};

type StatusT = {
  subscription_active: boolean;
  subscription_expires_at?: string | null;
  subscription_plan?: string | null;
  days_left?: number | null;
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
  { id: 'weekly', label: 'Haftalık Abonelik', price_try: 50, duration_days: 7 },
  { id: 'yearly', label: 'Yıllık Abonelik', price_try: 2000, list_price_try: 2400, duration_days: 365 },
];

function planUnitLabel(durationDays: number): string {
  if (durationDays === 7) return '/ hafta';
  if (durationDays === 365) return '/ yıl';
  if (durationDays === 30) return '/ ay';
  return `/ ${durationDays} gün`;
}

// Ödeme her zaman TL olarak (iyzico) tahsil edilir -- burada değişen yalnızca
// EKRANDAKİ yaklaşık karşılık: İngilizce kullanan kullanıcıya $ karşılığı,
// İtalyanca kullanan kullanıcıya € karşılığı küçük bir "≈" notu olarak
// gösterilir. Türkçe'de not gösterilmez, gerçek tahsilat tutarı zaten TL.
function approxPriceLabel(priceTry: number, lang: 'tr' | 'en' | 'it', rates: RatesT | null): string | null {
  if (lang === 'tr' || !priceTry) return null;
  const cur = currencyForLang(lang);
  const rate = cur === 'USD' ? rates?.usd_try : rates?.eur_try;
  if (!rate) return null;
  const val = priceTry / rate;
  const sym = cur === 'USD' ? '$' : '€';
  return `≈ ${sym}${val.toFixed(2)}`;
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
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            {/* Status card */}
            <View style={[s.statusCard, status?.subscription_active ? (dueSoon ? s.statusCardWarn : s.statusCardActive) : usedUp ? s.statusCardDanger : s.statusCardInfo]}>
              <Ionicons
                name={status?.subscription_active ? (dueSoon ? 'time-outline' : 'checkmark-circle') : usedUp ? 'alert-circle' : 'information-circle'}
                size={26}
                color={status?.subscription_active ? (dueSoon ? theme.colors.goldDark : theme.colors.green) : usedUp ? theme.colors.red : theme.colors.primary}
              />
              <View style={{ flex: 1, marginLeft: 12 }}>
                {status?.subscription_active ? (
                  dueSoon ? (
                    <>
                      <Text style={s.statusTitle}>
                        Aboneliğiniz {Math.max(status.days_left ?? 0, 0)} gün sonra sona eriyor
                      </Text>
                      <Text style={s.statusText}>Otomatik çekim yapılmaz — kesintisiz devam etmek için aşağıdan yenileyin.</Text>
                    </>
                  ) : (
                    <>
                      <Text style={s.statusTitle}>Aboneliğiniz aktif</Text>
                      <Text style={s.statusText}>Sınırsız teklif oluşturabilirsiniz.</Text>
                    </>
                  )
                ) : (
                  <>
                    <Text style={s.statusTitle}>
                      Bu ay {status?.quotes_used_this_month ?? 0} / {status?.free_limit ?? 5} ücretsiz teklif kullanıldı
                    </Text>
                    <Text style={s.statusText}>
                      {usedUp
                        ? 'Ücretsiz hakkınız bitti. Devam etmek için abone olun.'
                        : `Kalan ücretsiz hak: ${remaining}`}
                    </Text>
                  </>
                )}
              </View>
            </View>

            {showPlanSection && (
              <>
                {/* Plan picker */}
                <Text style={s.formLabel}>Plan Seç</Text>
                {status && (status.seat_count ?? 1) > 1 && (
                  <View style={s.seatNote} testID="sub-seat-note">
                    <Ionicons name="people-outline" size={14} color={theme.colors.primary} />
                    <Text style={s.seatNoteText}>
                      {status.seat_count} kişilik ekibiniz için fiyatlandırma (siz dahil)
                    </Text>
                  </View>
                )}
                <View style={{ gap: 12, marginBottom: 22 }}>
                  {plans.map((plan) => {
                    const selected = plan.id === selectedPlan;
                    const isYearly = plan.duration_days >= 365;
                    return (
                      <TouchableOpacity
                        key={plan.id}
                        activeOpacity={0.9}
                        onPress={() => setSelectedPlan(plan.id)}
                        style={[s.planCard, selected && s.planCardSelected]}
                        testID={`sub-plan-${plan.id}`}
                      >
                        <View style={s.planHeaderRow}>
                          <Text style={s.planName}>{plan.label}</Text>
                          {isYearly && (
                            <View style={s.planBadge}>
                              <Text style={s.planBadgeText}>Önerilen</Text>
                            </View>
                          )}
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                          {plan.list_price_try ? (
                            <Text style={s.planListPrice}>₺{plan.list_price_try.toFixed(0)}</Text>
                          ) : null}
                          <Text style={s.planPrice}>
                            ₺{plan.price_try.toFixed(0)} <Text style={s.planPriceUnit}>{planUnitLabel(plan.duration_days)}</Text>
                          </Text>
                        </View>
                        {approxPriceLabel(plan.price_try, lang, rates) ? (
                          <Text style={s.planApprox}>{approxPriceLabel(plan.price_try, lang, rates)}</Text>
                        ) : null}
                        <View style={{ marginTop: 12, gap: 8 }}>
                          <PlanBullet text="Sınırsız teklif oluşturma" />
                          <PlanBullet text={isYearly ? 'Yıllık otomatik yenileme' : 'Haftalık otomatik yenileme'} />
                          <PlanBullet text="Dilediğiniz zaman iptal" />
                        </View>
                        <View style={[s.radioOuter, selected && s.radioOuterSelected]}>
                          {selected && <View style={s.radioInner} />}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Billing form */}
                <Text style={s.formLabel}>Fatura Bilgileri</Text>
                <View style={s.card}>
                  <FieldRow label="TC Kimlik / Vergi No" icon="card-outline" placeholder="11111111111" value={kimlikNo} onChange={setKimlikNo} keyboardType="number-pad" testID="sub-identity" />
                  <FieldRow label="Adres" icon="location-outline" placeholder="Fatura adresi" value={adres} onChange={setAdres} multiline testID="sub-address" />
                  <FieldRow label="Şehir" icon="business-outline" placeholder="İstanbul" value={sehir} onChange={setSehir} testID="sub-city" />
                  <FieldRow label="Posta Kodu" icon="mail-outline" placeholder="34000" value={posta} onChange={setPosta} keyboardType="number-pad" isLast testID="sub-zip" />
                </View>

                {error ? <Text style={s.errorText}>{error}</Text> : null}

                <TouchableOpacity style={[s.cta, busy && s.ctaDisabled]} onPress={onSubscribe} disabled={busy} activeOpacity={0.9} testID="sub-subscribe">
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={s.ctaText}>
                      {dueSoon ? 'Yenile' : 'Abone Ol'} — ₺{(activePlan?.price_try ?? 0).toFixed(0)}{activePlan ? planUnitLabel(activePlan.duration_days) : ''}
                    </Text>
                  )}
                </TouchableOpacity>
                {approxPriceLabel(activePlan?.price_try ?? 0, lang, rates) ? (
                  <Text style={s.ctaApprox}>{approxPriceLabel(activePlan?.price_try ?? 0, lang, rates)}</Text>
                ) : null}
                <Text style={s.footNote}>Ödeme iyzico güvenli ödeme sayfasına yönlendirilerek tamamlanır.</Text>
              </>
            )}

            <TouchableOpacity
              style={s.promoToggle}
              onPress={() => setPromoOpen((v) => !v)}
              testID="promo-toggle"
            >
              <Ionicons name="gift-outline" size={16} color={theme.colors.gold} />
              <Text style={s.promoToggleText}>Hediye kodunuz mu var?</Text>
              <Ionicons name={promoOpen ? 'chevron-up' : 'chevron-down'} size={14} color={theme.colors.textMuted} />
            </TouchableOpacity>
            {promoOpen && (
              <View style={s.promoBox}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
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
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

function PlanBullet({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Ionicons name="checkmark" size={16} color={theme.colors.green} />
      <Text style={{ fontSize: 13.5, color: theme.colors.textSoft }}>{text}</Text>
    </View>
  );
}

function FieldRow({
  label,
  icon,
  isLast,
  onChange,
  ...rest
}: React.ComponentProps<typeof TextInput> & {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  isLast?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <View style={[s.field, isLast && { marginBottom: 0 }]}>
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={[s.inputWrap, rest.multiline && s.inputWrapMultiline]}>
        <Ionicons name={icon} size={20} color={theme.colors.primary} style={{ marginRight: 10, marginTop: rest.multiline ? 2 : 0 }} />
        <TextInput
          {...rest}
          onChangeText={onChange}
          placeholderTextColor="#94a3b8"
          style={[s.input, rest.multiline && s.inputMultiline]}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F5F7FA',
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
  statusCardDanger: { backgroundColor: theme.colors.redSoft, borderColor: '#fca5a5' },
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
  planCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: theme.colors.line,
    padding: 18,
    position: 'relative',
    ...theme.shadow.sm,
  },
  planCardSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
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
  formLabel: { fontSize: 13, fontWeight: '800', color: theme.colors.textMuted, marginBottom: 10, letterSpacing: 0.3, textTransform: 'uppercase' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.line,
    ...theme.shadow.sm,
  },
  field: { marginBottom: 16 },
  fieldLabel: { fontSize: 14, fontWeight: '800', color: theme.colors.text, marginBottom: 8 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FBFDFF',
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  inputWrapMultiline: { alignItems: 'flex-start', paddingTop: 14, paddingBottom: 14, minHeight: 80 },
  input: {
    flex: 1,
    fontSize: 15,
    color: theme.colors.text,
    paddingVertical: 0,
    ...(Platform.OS === 'web' ? ({ outlineWidth: 0 } as any) : {}),
  },
  inputMultiline: { minHeight: 56, textAlignVertical: 'top' },
  errorText: { color: theme.colors.red, fontSize: 13, fontWeight: '700', marginTop: 14, textAlign: 'center' },
  cta: {
    backgroundColor: theme.colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    ...theme.shadow.lg,
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
  ctaApprox: { fontSize: 12, color: theme.colors.textMuted, textAlign: 'center', marginTop: 6 },
  footNote: { fontSize: 11.5, color: theme.colors.textMuted, textAlign: 'center', marginTop: 10 },
  promoToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 18, paddingVertical: 8 },
  promoToggleText: { fontSize: 13, fontWeight: '700', color: theme.colors.textSoft },
  promoBox: { marginTop: 4, backgroundColor: theme.colors.goldSoft, borderRadius: 14, padding: 12, gap: 8 },
  promoBtn: { backgroundColor: theme.colors.gold, borderRadius: 12, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  promoBtnText: { color: '#fff', fontSize: 13.5, fontWeight: '800' },
  promoSuccess: { color: '#166534', fontSize: 13, fontWeight: '700', textAlign: 'center' },
});
