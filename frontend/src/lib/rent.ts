import type { RentPaymentT, RentUnitT } from './api';

// Kira/aidat dönem hesapları (backend _unit_amount ile aynı formül).

export const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export function addMonths(donem: string, n: number): string {
  const [y, m] = donem.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return ym(d);
}

/** Dönem tutarı: yıllık artış varsa her sözleşme yılında bileşik artar. */
export function unitAmount(u: Pick<RentUnitT, 'tutar' | 'artisOrani' | 'baslangic'>, donem: string): number {
  const [sy, sm] = (u.baslangic || '').split('-').map(Number);
  const [y, m] = donem.split('-').map(Number);
  const months = sy ? (y - sy) * 12 + (m - sm) : 0;
  const years = Math.max(0, Math.floor(months / 12));
  return Math.round(u.tutar * Math.pow(1 + (u.artisOrani || 0) / 100, years) * 100) / 100;
}

/** Birim bu dönemde tahsil edilmeli mi (sözleşme aralığında ve aktif). */
export function isBillable(u: RentUnitT, donem: string): boolean {
  if (!u.aktif) return false;
  const start = (u.baslangic || '').slice(0, 7);
  const end = (u.bitis || '').slice(0, 7);
  return (!start || donem >= start) && (!end || donem <= end);
}

export type PeriodStatus = 'paid' | 'due' | 'late' | 'none';

export function periodStatus(u: RentUnitT, donem: string, paid: RentPaymentT | undefined, today: Date = new Date()): PeriodStatus {
  if (paid) return 'paid';
  if (!isBillable(u, donem)) return 'none';
  const cur = ym(today);
  if (donem < cur) return 'late';
  if (donem === cur && today.getDate() > (u.gun || 1)) return 'late';
  return 'due';
}

/** Ödenmemiş geçmiş dönemler (en fazla son 24 ay). */
export function overdue(u: RentUnitT, paidSet: Set<string>, today: Date = new Date()): { donemler: string[]; toplam: number } {
  const donemler: string[] = [];
  let toplam = 0;
  const cur = ym(today);
  for (let i = 24; i >= 0; i--) {
    const d = addMonths(cur, -i);
    if (periodStatus(u, d, paidSet.has(d) ? ({} as RentPaymentT) : undefined, today) === 'late') {
      donemler.push(d);
      toplam += unitAmount(u, d);
    }
  }
  return { donemler, toplam };
}

/** Sözleşme bitişine kalan gün (bitiş yoksa null). */
export function daysToEnd(u: RentUnitT, today: Date = new Date()): number | null {
  if (!u.bitis) return null;
  const end = Date.parse(`${u.bitis}T00:00:00`);
  return Math.ceil((end - today.getTime()) / 86400000);
}
