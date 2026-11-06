import React, { useEffect } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter, usePathname } from 'expo-router';

// Bilinmeyen adresler için gerçek 404 ekranı. Sunucu bilinmeyen yollara SPA'yı
// 200 ile döndürdüğü için (serve -s), arama motorları sayfayı "soft 404" olmasın
// diye noindex işaretliyoruz. Ayrıca yaygın hukuki adresleri statik sayfalara yönlendiriyoruz.
const YONLENDIR: Record<string, string> = {
  '/gizlilik': '/gizlilik.html',
  '/gizlilik-politikasi': '/gizlilik.html',
  '/kullanim-sartlari': '/kullanim-sartlari.html',
  '/kullanim-kosullari': '/kullanim-sartlari.html',
  '/terms': '/kullanim-sartlari.html',
  '/terms-of-service': '/kullanim-sartlari.html',
};

export default function NotFound() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const hedef = YONLENDIR[pathname.replace(/\/+$/, '').toLowerCase()];
    if (hedef) {
      window.location.replace(hedef);
      return;
    }
    document.title = 'Sayfa bulunamadı (404) | Anında Teklif';
    let m = document.querySelector('meta[name=robots]') as HTMLMetaElement | null;
    if (!m) {
      m = document.createElement('meta');
      m.name = 'robots';
      document.head.appendChild(m);
    }
    m.content = 'noindex, nofollow';
  }, [pathname]);

  return (
    <View style={s.root}>
      <Text style={s.code}>404</Text>
      <Text style={s.title}>Sayfa bulunamadı</Text>
      <Text style={s.text}>Aradığınız adres taşınmış ya da hiç var olmamış olabilir.</Text>
      <TouchableOpacity style={s.btn} onPress={() => router.replace('/')} accessibilityRole="button">
        <Text style={s.btnText}>Ana sayfaya dön</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B1220', padding: 24 },
  code: { fontSize: 72, fontWeight: '800', color: '#3B82F6' },
  title: { fontSize: 24, fontWeight: '700', color: '#fff', marginTop: 4 },
  text: { fontSize: 16, color: '#94A3B8', marginTop: 8, textAlign: 'center', maxWidth: 360 },
  btn: { marginTop: 24, backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
