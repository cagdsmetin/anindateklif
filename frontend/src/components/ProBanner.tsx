import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme } from '@/src/lib/theme';
import { api } from '@/src/lib/api';
import { useAuth } from '@/src/state/AuthContext';
import { useLanguage } from '@/src/lib/i18n';
import { storage } from '@/src/utils/storage';
import { themedStyles } from '@/src/components/motion';

// Tum ekranlarin ustunde (TopHeader altinda) duran abonelik seridi:
//  - Hediye kodu (promo) aktifken: "Pro hediye sureniz X gun sonra sona erecek" + Abone Ol
//  - Hediye bittiyse: "Pro hediye sureniz sona erdi" + Abone Ol
//  - Ucretli abonelik bitmek uzereyken: "Aboneliginiz X gun sonra sona eriyor" + Yenile
// Kapatilinca sadece o gun icin gizlenir; ertesi gun tekrar gorunur.

type SubStatus = {
  subscription_active: boolean;
  subscription_plan?: string | null;
  days_left?: number | null;
  renewal_due_soon?: boolean;
};

// Modul duzeyinde onbellek: TopHeader ~40 ekranda kullaniliyor, her ekran
// gecisinde /subscription/status'a istek atmamak icin.
const CACHE_TTL_MS = 5 * 60 * 1000;
let cached: { status: SubStatus | null; at: number; userId: string } | null = null;
let inflight: Promise<SubStatus | null> | null = null;
const listeners = new Set<(s: SubStatus | null) => void>();

async function loadStatus(userId: string, force = false): Promise<SubStatus | null> {
  if (!force && cached && cached.userId === userId && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.status;
  }
  if (!force && inflight) return inflight;
  inflight = api
    .subscriptionStatus()
    .then((r: any) => {
      cached = { status: r as SubStatus, at: Date.now(), userId };
      listeners.forEach((l) => l(cached!.status));
      return cached.status;
    })
    .catch(() => cached?.status ?? null)
    .finally(() => { inflight = null; });
  return inflight;
}

// Hediye kodu kullanildiginda / odeme tamamlandiginda cagrilir ki serit
// 5 dk onbellegi beklemeden guncellensin.
export function refreshProBanner() {
  const userId = cached?.userId;
  cached = null;
  if (userId) loadStatus(userId, true);
}

function todayKey() {
  // Yerel tarih (UTC degil): Turkiye'de gece 00-03 arasi kapatilan serit
  // yanlis gune yazilmasin.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type Variant = { tone: 'green' | 'red' | 'gold'; icon: React.ComponentProps<typeof Ionicons>['name']; text: string; cta: string };

export default function ProBanner() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const [status, setStatus] = useState<SubStatus | null>(
    cached && user && cached.userId === user.user_id ? cached.status : null
  );
  const [dismissedToday, setDismissedToday] = useState<boolean | null>(null);
  const dismissKey = user ? `pro_banner_dismissed_${user.user_id}` : '';

  useEffect(() => {
    if (!user || user.is_staff) return;
    let alive = true;
    const onUpdate = (s: SubStatus | null) => { if (alive) setStatus(s); };
    listeners.add(onUpdate);
    loadStatus(user.user_id).then(onUpdate);
    storage.getItem(dismissKey, '').then((v) => { if (alive) setDismissedToday(v === todayKey()); });
    return () => { alive = false; listeners.delete(onUpdate); };
  }, [user, dismissKey]);

  if (!user || user.is_staff || !status || dismissedToday !== false) return null;

  const days = Math.max(0, status.days_left ?? 0);
  const isPromo = status.subscription_plan === 'promo';
  let v: Variant | null = null;
  if (isPromo && status.subscription_active) {
    v = {
      tone: days <= 7 ? 'gold' : 'green',
      icon: 'gift-outline',
      text: days === 0 ? t('proBanner.s002') : `${t('proBanner.s001')} ${days} ${t('proBanner.s003')}`,
      cta: t('proBanner.s004'),
    };
  } else if (isPromo && !status.subscription_active) {
    v = { tone: 'red', icon: 'alert-circle-outline', text: t('proBanner.s005'), cta: t('proBanner.s004') };
  } else if (status.subscription_active && status.renewal_due_soon) {
    v = {
      tone: 'gold',
      icon: 'time-outline',
      text: `${t('proBanner.s006')} ${days} ${t('proBanner.s007')}`,
      cta: t('proBanner.s008'),
    };
  }
  if (!v) return null;

  const s = styles;
  const c =
    v.tone === 'green'
      ? { bg: theme.colors.greenSoft, fg: theme.colors.greenText, btn: '#15803D' }
      : v.tone === 'red'
        ? { bg: theme.colors.redSoft, fg: theme.colors.redText, btn: '#DC2626' }
        : { bg: theme.colors.goldSoft, fg: theme.colors.goldText, btn: '#B45309' };

  const dismiss = () => {
    setDismissedToday(true);
    storage.setItem(dismissKey, todayKey());
  };

  return (
    <View style={[s.bar, { backgroundColor: c.bg }]} testID="pro-banner">
      <Ionicons name={v.icon} size={17} color={c.fg} />
      <Text style={[s.text, { color: c.fg }]} numberOfLines={2}>{v.text}</Text>
      <TouchableOpacity
        style={[s.cta, { backgroundColor: c.btn }]}
        onPress={() => router.push('/subscription' as any)}
        testID="pro-banner-cta"
      >
        <Text style={s.ctaText}>{v.cta}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} testID="pro-banner-close">
        <Ionicons name="close" size={18} color={c.fg} />
      </TouchableOpacity>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  text: { flex: 1, fontSize: 13, fontWeight: '600' },
  cta: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: theme.radius.pill },
  ctaText: { color: '#fff', fontSize: 12, fontWeight: '800' },
}));
