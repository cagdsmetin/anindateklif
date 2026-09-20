import {
  useFonts,
  PlusJakartaSans_300Light,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';

// Marka yazı tipini yükler. Ağırlıklar AYRI aile adlarıyla kaydedilir --
// Android'de `fontFamily + fontWeight` birlikte çalışmadığı için stiller
// doğrudan bu adları kullanır (bkz. src/lib/brand-font.ts).
// Dönüş değeri bilerek beklenmiyor: font gelene kadar sistem fontu görünür,
// geldiğinde React yeniden çizer.
export function useBrandFonts(): readonly [boolean, Error | null] {
  return useFonts({
    PlusJakartaSans_300Light,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
}
