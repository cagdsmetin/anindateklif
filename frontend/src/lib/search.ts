// Hızlı arama yardımcıları: Türkçe büyük/küçük harf ve aksan duyarsız eşleştirme
// ("cagdas" yazınca "Çağdaş", "isik" yazınca "IŞIK" bulunur).
export function normalizeSearch(v: unknown): string {
  return String(v ?? '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Sorgudaki her kelime, verilen alanların en az birinde geçiyorsa true.
 * Telefon gibi alanlar için rakam dışı karakterler atılmış hali de aranır
 * ("0532123" yazınca "0532 123 45 67" bulunur).
 */
export function matchesQuery(query: string, fields: unknown[]): boolean {
  const tokens = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = fields.map(normalizeSearch).join(' \u0001 ');
  const digits = hay.replace(/\D/g, '');
  return tokens.every((tk) => {
    if (hay.includes(tk)) return true;
    const d = tk.replace(/\D/g, '');
    return d.length >= 3 && d.length === tk.length && digits.includes(d);
  });
}
