import React, { useMemo, useState } from 'react';
import {
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

const AY_ADLARI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const GUN_BASLIKLARI = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'];

type EventKind = 'garanti' | 'bakim' | 'teklif';

type CalEvent = {
  id: string;
  kind: EventKind;
  title: string;
  sub: string;
  onPress?: () => void;
};

const KIND_LABEL: Record<EventKind, string> = {
  garanti: 'Garanti Bitişi',
  bakim: 'Bakım',
  teklif: 'Teklif Geçerlilik',
};
const KIND_COLOR: Record<EventKind, string> = {
  garanti: theme.colors.modules.gecmis,
  bakim: theme.colors.modules.servis,
  teklif: theme.colors.modules.teklif,
};
const KIND_ICON: Record<EventKind, keyof typeof Ionicons.glyphMap> = {
  garanti: 'shield-checkmark-outline',
  bakim: 'construct-outline',
  teklif: 'document-text-outline',
};

function pad2(n: number) {
  return String(n).padStart(2, '0');
}
function isoOf(y: number, m: number, d: number) {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}
function todayIso() {
  const t = new Date();
  return isoOf(t.getFullYear(), t.getMonth(), t.getDate());
}

export default function CalendarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { services, quotes, activeCompany } = useApp();

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth()); // 0-11
  const [selectedDate, setSelectedDate] = useState<string>(todayIso());

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalEvent[]> = {};
    const add = (iso: string, ev: CalEvent) => {
      const m = (iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return;
      if (!map[iso]) map[iso] = [];
      map[iso].push(ev);
    };
    services.forEach((svc) => {
      if (svc.garantiBitis) {
        add(svc.garantiBitis, {
          id: `g-${svc.id}`,
          kind: 'garanti',
          title: svc.musFirma || svc.baslik || 'Servis',
          sub: svc.baslik || '',
          onPress: () => router.push({ pathname: '/service-add', params: { id: svc.id } } as any),
        });
      }
      if (svc.bakimTarihi) {
        add(svc.bakimTarihi, {
          id: `b-${svc.id}`,
          kind: 'bakim',
          title: svc.musFirma || svc.baslik || 'Servis',
          sub: svc.baslik || '',
          onPress: () => router.push({ pathname: '/service-add', params: { id: svc.id } } as any),
        });
      }
    });
    quotes
      .filter((q) => q.durum === 'Beklemede' || q.durum === 'Görüldü')
      .forEach((q) => {
        if (q.gecerlilik) {
          add(q.gecerlilik, {
            id: `t-${q.id}`,
            kind: 'teklif',
            title: q.musFirma || '(İsimsiz)',
            sub: q.teklifNo || '',
            onPress: () => router.push({ pathname: '/(tabs)/teklif', params: { quoteId: q.id } } as any),
          });
        }
      });
    return map;
  }, [services, quotes, router]);

  const goPrevMonth = () => {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); } else { setViewMonth((m) => m - 1); }
  };
  const goNextMonth = () => {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); } else { setViewMonth((m) => m + 1); }
  };
  const goToday = () => {
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setSelectedDate(todayIso());
  };

  const grid = useMemo(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    // JS getDay(): 0=Sun..6=Sat -> Pazartesi başlangıçlı indeks için dönüştür
    const jsDay = firstOfMonth.getDay();
    const leading = (jsDay + 6) % 7; // 0 = Pazartesi
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: { day: number | null; iso: string | null }[] = [];
    for (let i = 0; i < leading; i++) cells.push({ day: null, iso: null });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, iso: isoOf(viewYear, viewMonth, d) });
    while (cells.length % 7 !== 0) cells.push({ day: null, iso: null });
    return cells;
  }, [viewYear, viewMonth]);

  const selectedEvents = eventsByDate[selectedDate] || [];
  const tIso = todayIso();

  if (!activeCompany) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Takvim</Text>
          <View style={s.headerBtn} />
        </View>
        <View style={s.empty}><Text style={s.emptyText}>Önce firma seçiniz</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Takvim</Text>
        <TouchableOpacity onPress={goToday} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="today-outline" size={20} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>
      <View style={s.divider} />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <View style={s.monthNav}>
          <TouchableOpacity onPress={goPrevMonth} style={s.monthNavBtn}>
            <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={s.monthLabel}>{AY_ADLARI[viewMonth]} {viewYear}</Text>
          <TouchableOpacity onPress={goNextMonth} style={s.monthNavBtn}>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        <View style={s.weekRow}>
          {GUN_BASLIKLARI.map((g) => (
            <Text key={g} style={s.weekDayLabel}>{g}</Text>
          ))}
        </View>

        <View style={s.grid}>
          {grid.map((cell, idx) => {
            if (!cell.day || !cell.iso) return <View key={idx} style={s.cell} />;
            const evs = eventsByDate[cell.iso] || [];
            const isToday = cell.iso === tIso;
            const isSelected = cell.iso === selectedDate;
            const kinds = Array.from(new Set(evs.map((e) => e.kind)));
            return (
              <TouchableOpacity
                key={idx}
                style={[s.cell, s.dayCell, isSelected && s.dayCellSelected, isToday && !isSelected && s.dayCellToday]}
                onPress={() => setSelectedDate(cell.iso!)}
                testID={`cal-day-${cell.iso}`}
              >
                <Text style={[s.dayNum, isSelected && s.dayNumSelected]}>{cell.day}</Text>
                {kinds.length > 0 && (
                  <View style={s.dotsRow}>
                    {kinds.map((k) => (
                      <View key={k} style={[s.dot, { backgroundColor: KIND_COLOR[k] }]} />
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={s.legendRow}>
          {(Object.keys(KIND_LABEL) as EventKind[]).map((k) => (
            <View key={k} style={s.legendItem}>
              <View style={[s.dot, { backgroundColor: KIND_COLOR[k] }]} />
              <Text style={s.legendText}>{KIND_LABEL[k]}</Text>
            </View>
          ))}
        </View>

        <Text style={s.sectionTitle}>{selectedDate === tIso ? 'Bugün' : selectedDate}</Text>
        {selectedEvents.length === 0 ? (
          <View style={s.emptyBox}>
            <Ionicons name="calendar-outline" size={26} color={theme.colors.textMuted} />
            <Text style={s.emptyTextBox}>Bu tarihte bir şey yok.</Text>
          </View>
        ) : (
          selectedEvents.map((ev) => (
            <TouchableOpacity key={ev.id} style={s.eventRow} onPress={ev.onPress} testID={`cal-event-${ev.id}`}>
              <View style={[s.eventIcon, { backgroundColor: KIND_COLOR[ev.kind] + '22' }]}>
                <Ionicons name={KIND_ICON[ev.kind]} size={16} color={KIND_COLOR[ev.kind]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.eventTitle} numberOfLines={1}>{ev.title}</Text>
                <Text style={s.eventSub} numberOfLines={1}>{KIND_LABEL[ev.kind]}{ev.sub ? ` · ${ev.sub}` : ''}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const CELL_SIZE = '14.28%';

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: theme.colors.textMuted },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff' },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', color: theme.colors.text, letterSpacing: 0.1 },
  divider: { height: 1, backgroundColor: theme.colors.line },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  monthNavBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  monthLabel: { fontSize: 15, fontWeight: '900', color: theme.colors.navy },
  weekRow: { flexDirection: 'row', marginBottom: 6 },
  weekDayLabel: { width: CELL_SIZE as any, textAlign: 'center', fontSize: 11, fontWeight: '800', color: theme.colors.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: CELL_SIZE as any, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayCell: { borderRadius: 6, borderWidth: 1, borderColor: theme.colors.line, backgroundColor: '#fff' },
  dayCellSelected: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  dayCellToday: { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.primary },
  dayNum: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  dayNumSelected: { color: '#fff' },
  dotsRow: { flexDirection: 'row', gap: 2, marginTop: 3 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 14, marginBottom: 20 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontSize: 11, color: theme.colors.textMuted, fontWeight: '600' },
  sectionTitle: { fontSize: 12.5, fontWeight: '900', color: theme.colors.navy, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 },
  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 30, gap: 8 },
  emptyTextBox: { color: theme.colors.textMuted, fontSize: 12.5, textAlign: 'center' },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: theme.colors.line, padding: 12, marginBottom: 8 },
  eventIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  eventTitle: { fontSize: 13, fontWeight: '800', color: theme.colors.text },
  eventSub: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
});
