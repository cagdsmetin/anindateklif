import React, { useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import TopHeader from '@/src/components/TopHeader';
import AnimatedPressable from '@/src/components/AnimatedPressable';
import { BubbleButton, MotionScrollView, Reveal, ScreenHero, SoftIcon, alpha, hashColor, themedStyles } from '@/src/components/motion';
import { useLanguage } from '@/src/lib/i18n';
import { QuoteT } from '@/src/lib/api';

const currencySymbol = (code: string) => (code === 'USD' ? '$' : code === 'EUR' ? '€' : '₺');
const formatMoney = (n: number) =>
  new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 3 }).format(n || 0);

const trDateShort = (iso: string) => {
  const m = (iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : (iso || '-');
};

// Müşteri kartındaki "Teklif Sayısı"na dokununca açılan listede, çok teklif
// birikmiş eski müşterilerde ekranın kilometrelerce uzamaması için varsayılan
// olarak son 3 ay gösteriliyor -- daha eskisini görmek isteyen üstteki
// çipten aralığı genişletebiliyor (Son 6 Ay / Bu Yıl / Tümü).
type DateRange = '3m' | '6m' | 'year' | 'all';
const rangeCutoff = (range: DateRange): string | null => {
  if (range === 'all') return null;
  const d = new Date();
  if (range === '3m') d.setMonth(d.getMonth() - 3);
  else if (range === '6m') d.setMonth(d.getMonth() - 6);
  else if (range === 'year') { d.setMonth(0); d.setDate(1); }
  return d.toISOString().slice(0, 10);
};

export default function CustomersScreen() {
  const { t } = useLanguage();
  const { customers, quotes, deleteCustomer, activeCompany } = useApp();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [quotesFor, setQuotesFor] = useState<{ id: string; firma: string; ownQuotes: QuoteT[] } | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>('3m');

  const enriched = useMemo(() => {
    return customers.map((c) => {
      const own = quotes.filter(
        (qq) =>
          qq.musFirma.trim().toLowerCase() === (c.firma || '').trim().toLowerCase() ||
          (qq.musTelefon && c.telefon && qq.musTelefon.replace(/\D/g, '') === c.telefon.replace(/\D/g, '')),
      );
      const total = own.reduce((a, x) => a + (x.genelToplam || 0), 0);
      const currency = own[0]?.paraBirimi || 'TRY';
      return { ...c, count: own.length, total, currency, ownQuotes: own };
    });
  }, [customers, quotes]);

  const filteredModalQuotes = useMemo(() => {
    if (!quotesFor) return [];
    const cutoff = rangeCutoff(dateRange);
    const list = cutoff ? quotesFor.ownQuotes.filter((qq) => (qq.tarih || '') >= cutoff) : quotesFor.ownQuotes;
    return [...list].sort((a, b) => (b.tarih || '').localeCompare(a.tarih || ''));
  }, [quotesFor, dateRange]);

  const RANGE_OPTIONS: { id: DateRange; label: string }[] = [
    { id: '3m', label: t('customers.s012') },
    { id: '6m', label: t('customers.s013') },
    { id: 'year', label: t('customers.s014') },
    { id: 'all', label: t('customers.s015') },
  ];

  if (!activeCompany) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <TopHeader title={t('customers.s001')} />
        <View style={s.empty}>
          <Text style={s.emptyText}>{t('customers.s002')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <TopHeader title={t('customers.s001')} />

      <MotionScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        progressColors={[theme.colors.modules.musteri, theme.colors.primary, '#A855F7']}
      >
        <View style={s.contentWrap}>
        <ScreenHero
          icon="people"
          title={t('customers.s001')}
          subtitle={activeCompany?.sirketAdi}
          color={theme.colors.modules.musteri}
          stats={[
            { label: t('customers.s001'), value: enriched.length },
            { label: t('customers.s007'), value: enriched.reduce((a, x) => a + x.count, 0) },
          ]}
        />
        {/* Primary CTA — matches the reference screenshot */}
        <Reveal variant="scale">
          <BubbleButton
            icon="person-add"
            label={t('customers.s003')}
            color={theme.colors.modules.musteri}
            size="lg"
            onPress={() => router.push('/customer-add')}
            testID="customer-add-btn"
            style={{ marginBottom: 16 }}
          />
        </Reveal>

        {enriched.length === 0 ? (
          <View style={s.emptyBox}>
            <Ionicons name="people-outline" size={30} color={theme.colors.textMuted} />
            <Text style={s.emptyTextBox}>{t('customers.s004')}</Text>
          </View>
        ) : (
          enriched.map((c, idx) => {
            const letter = ((c.firma || '?').trim().charAt(0) || '?').toUpperCase();
            // Her müşteri kendi sabit rengini alır -- liste tek renge boğulmasın
            const tone = hashColor(c.firma || c.id);
            return (
              <Reveal key={c.id} variant={idx % 2 === 0 ? 'left' : 'right'} distance={20}>
              <View style={s.card} testID={`customer-card-${c.id}`}>
                <View style={[s.cardStripe, { backgroundColor: tone }]} />
                {/* Top row: avatar + name/phone + actions */}
                <View style={s.topRow}>
                  <View style={[s.avatar, { backgroundColor: tone, boxShadow: `0 6px 14px ${alpha(tone, 0.35)}` }]}>
                    <Text style={s.avatarLetter}>{letter}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.name} numberOfLines={1}>{c.firma || t('customers.s005')}</Text>
                    {c.telefon ? (
                      <Text style={s.phone} numberOfLines={1}>{c.telefon}</Text>
                    ) : (
                      <Text style={s.phoneMuted}>{t('customers.s006')}</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => deleteCustomer(c.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    testID={`delete-cust-${c.id}`}
                    style={s.iconBtn}
                  >
                    <SoftIcon icon="trash-outline" color={theme.colors.red} size={30} iconSize={15} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: '/customer-add', params: { id: c.id } })}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    testID={`open-cust-${c.id}`}
                    style={s.iconBtn}
                  >
                    <SoftIcon icon="chevron-forward" color={theme.colors.primary} size={30} iconSize={16} />
                  </TouchableOpacity>
                </View>

                {/* Divider */}
                <View style={s.cardDivider} />

                {/* Bottom stats row */}
                <View style={s.statsRow}>
                  <TouchableOpacity
                    style={{ flex: 1 }}
                    disabled={c.count === 0}
                    onPress={() => { setDateRange('3m'); setQuotesFor({ id: c.id, firma: c.firma, ownQuotes: c.ownQuotes }); }}
                    testID={`customer-quote-count-${c.id}`}
                  >
                    <Text style={s.statLabel}>{t('customers.s007')}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Text style={[s.statValue, c.count > 0 && { color: theme.colors.primary, textDecorationLine: 'underline' }]}>
                        {c.count} {t('customers.s008')}
                      </Text>
                      {c.count > 0 && <Ionicons name="chevron-forward" size={12} color={theme.colors.primary} />}
                    </View>
                  </TouchableOpacity>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.statLabel}>{t('customers.s009')}</Text>
                    <Text style={[s.statValue, { color: theme.colors.primary }]}>
                      {currencySymbol(c.currency)}
                      {formatMoney(c.total)}
                    </Text>
                  </View>
                </View>
              </View>
              </Reveal>
            );
          })
        )}
        </View>
      </MotionScrollView>

      <Modal visible={!!quotesFor} transparent animationType="fade" onRequestClose={() => setQuotesFor(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle} numberOfLines={1}>{t('customers.s010')} {quotesFor?.firma}</Text>
              <TouchableOpacity onPress={() => setQuotesFor(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={s.rangeRow}>
              {RANGE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.id}
                  style={[s.rangeChip, dateRange === opt.id && s.rangeChipActive]}
                  onPress={() => setDateRange(opt.id)}
                  testID={`quote-range-${opt.id}`}
                >
                  <Text style={[s.rangeChipText, dateRange === opt.id && s.rangeChipTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {filteredModalQuotes.length === 0 ? (
                <Text style={s.modalEmpty}>{t('customers.s011')}</Text>
              ) : (
                filteredModalQuotes.map((q) => (
                  <TouchableOpacity
                    key={q.id}
                    style={s.quoteRow}
                    onPress={() => { setQuotesFor(null); router.push({ pathname: '/preview', params: { quoteId: q.id } }); }}
                    testID={`quote-row-${q.id}`}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.quoteRowNo} numberOfLines={1}>{q.teklifNo || '-'}</Text>
                      <Text style={s.quoteRowDate}>{trDateShort(q.tarih)}{q.durum ? ` · ${q.durum}` : ''}</Text>
                    </View>
                    <Text style={s.quoteRowAmount}>
                      {currencySymbol(q.paraBirimi)}{formatMoney(q.genelToplam || 0)}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surfaceSoft },
  contentWrap: { width: '100%', maxWidth: 720, alignSelf: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: theme.colors.textMuted },

  addBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 14,
    ...theme.shadow.lg,
  },
  addBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },

  emptyBox: {
    marginTop: 30,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderStyle: 'dashed',
  },
  emptyTextBox: { fontSize: 13, color: theme.colors.textMuted, textAlign: 'center', lineHeight: 18 },

  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.line,
    padding: 13,
    paddingTop: 15,
    marginBottom: 12,
    overflow: 'hidden',
    ...theme.shadow.sm,
  },
  cardStripe: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 14.5,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  name: { fontSize: 13, fontWeight: '800', color: theme.colors.text },
  phone: { fontSize: 11, color: theme.colors.textMuted, marginTop: 1 },
  phoneMuted: { fontSize: 10, color: theme.colors.lineDark, marginTop: 1, fontStyle: 'italic' },
  iconBtn: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },

  cardDivider: { height: 1, backgroundColor: theme.colors.line, marginVertical: 6 },

  statsRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  statLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: theme.colors.textMuted,
    letterSpacing: 1,
    marginBottom: 2,
  },
  statValue: { fontSize: 13, fontWeight: '900', color: theme.colors.text },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(8,11,20,0.58)', justifyContent: 'center', padding: 20 },
  modalBox: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 16,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    ...theme.shadow.lg,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8 },
  modalTitle: { flex: 1, fontSize: 15, fontWeight: '900', color: theme.colors.text },
  modalEmpty: { fontSize: 12.5, color: theme.colors.textMuted, textAlign: 'center', paddingVertical: 24 },

  rangeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 12 },
  rangeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.surfaceSoft,
  },
  rangeChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  rangeChipText: { fontSize: 11.5, fontWeight: '700', color: theme.colors.textMuted },
  rangeChipTextActive: { color: '#fff' },

  quoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.line,
  },
  quoteRowNo: { fontSize: 13, fontWeight: '800', color: theme.colors.text },
  quoteRowDate: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  quoteRowAmount: { fontSize: 13, fontWeight: '900', color: theme.colors.primary },
}));
