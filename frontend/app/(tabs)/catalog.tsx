import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
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
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';
import { theme } from '@/src/lib/theme';
import { useApp } from '@/src/state/AppContext';
import TopHeader from '@/src/components/TopHeader';
import { CatalogItemT } from '@/src/lib/api';

function fmt(n: number, cur: string) {
  const s = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
  const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '₺';
  return `${s} ${sym}`;
}

// --- Bulk import parsing --------------------------------------------------
// Accepts either pasted CSV text or a real CSV/Excel file. If the first row
// looks like a header (matches known Turkish/English column names), columns
// are mapped by name; otherwise the original fixed column order is assumed
// so existing pasted-CSV workflows keep working unchanged.
type BulkItem = { kategori: string; urunAdi: string; aciklama: string; birim: string; birimFiyat: number; paraBirimi: string };

const HEADER_ALIASES: Record<string, string[]> = {
  kategori: ['kategori', 'category', 'grup', 'group'],
  urunAdi: ['urunadi', 'urunismi', 'urun', 'productname', 'product', 'item', 'itemname', 'ad', 'isim', 'hizmet', 'hizmetadi', 'name', 'aciklama1'],
  aciklama: ['aciklama', 'description', 'not', 'notlar', 'detay'],
  birim: ['birim', 'unit', 'olcubirimi'],
  birimFiyat: ['birimfiyat', 'fiyat', 'price', 'unitprice', 'tutar', 'birimfiyati'],
  paraBirimi: ['parabirimi', 'currency', 'kur', 'doviz', 'parabirim'],
};

function normalizeHeader(h: string) {
  return (h || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/i̇/g, 'i')
    .replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '');
}

function detectHeaderMap(headerRow: string[]): Record<string, number> | null {
  const norm = headerRow.map(normalizeHeader);
  const map: Record<string, number> = {};
  Object.entries(HEADER_ALIASES).forEach(([field, aliases]) => {
    const idx = norm.findIndex((h) => aliases.includes(h));
    if (idx !== -1) map[field] = idx;
  });
  // Require a recognizable product-name column plus at least one more
  // recognized column before trusting the first row as a header.
  return map.urunAdi !== undefined && Object.keys(map).length >= 2 ? map : null;
}

function parsePrice(raw: string): number {
  let s = (raw || '').replace(/[^\d,.\-]/g, '').trim();
  if (!s) return 0;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    // Turkish/European convention: '.' groups thousands, ',' is the decimal separator.
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function normalizeCurrency(raw: string): string {
  const v = (raw || '').trim().toUpperCase();
  if (v === '$' || v === 'USD') return 'USD';
  if (v === '€' || v === 'EUR') return 'EUR';
  if (v === '₺' || v === 'TL' || v === 'TRY') return 'TRY';
  return ['USD', 'EUR', 'TRY'].includes(v) ? v : 'USD';
}

function rowsToItems(rows: string[][]): BulkItem[] {
  if (!rows.length) return [];
  const headerMap = detectHeaderMap(rows[0]);
  const dataRows = headerMap ? rows.slice(1) : rows;
  const cellAt = (cells: string[], idx?: number) => (idx !== undefined && cells[idx] !== undefined ? String(cells[idx]).trim() : '');

  return dataRows
    .map((cells) => {
      if (headerMap) {
        return {
          kategori: cellAt(cells, headerMap.kategori) || 'Genel',
          urunAdi: cellAt(cells, headerMap.urunAdi),
          aciklama: cellAt(cells, headerMap.aciklama),
          birim: cellAt(cells, headerMap.birim) || 'Adet',
          birimFiyat: parsePrice(cellAt(cells, headerMap.birimFiyat)),
          paraBirimi: normalizeCurrency(cellAt(cells, headerMap.paraBirimi)),
        };
      }
      // Fixed fallback order: kategori,urunAdi,birim,birimFiyat,paraBirimi
      return {
        kategori: cellAt(cells, 0) || 'Genel',
        urunAdi: cellAt(cells, 1),
        aciklama: '',
        birim: cellAt(cells, 2) || 'Adet',
        birimFiyat: parsePrice(cellAt(cells, 3)),
        paraBirimi: normalizeCurrency(cellAt(cells, 4)),
      };
    })
    .filter((i) => i.urunAdi);
}

function textToRows(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => r.split(/[,;\t]/).map((p) => p.trim()));
}

function sheetToRows(wb: XLSX.WorkBook): string[][] {
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  const raw = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, raw: false, defval: '' });
  return raw
    .map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? '').trim()) : []))
    .filter((r) => r.some((c) => c));
}

export default function CatalogScreen() {
  const { catalog, addCatalogItem, updateCatalogItem, deleteCatalogItem, bulkAddCatalog, activeCompany, showToast } = useApp();
  const insets = useSafeAreaInsets();
  const [showForm, setShowForm] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [editing, setEditing] = useState<CatalogItemT | null>(null);
  const [bulkText, setBulkText] = useState('');
  const [q, setQ] = useState('');

  const [f, setF] = useState({
    kategori: 'Genel',
    urunAdi: '',
    aciklama: '',
    birim: 'Adet',
    birimFiyat: '',
    paraBirimi: 'USD',
  });

  const openNew = () => {
    setEditing(null);
    setF({ kategori: 'Genel', urunAdi: '', aciklama: '', birim: 'Adet', birimFiyat: '', paraBirimi: 'USD' });
    setShowForm(true);
  };
  const openEdit = (it: CatalogItemT) => {
    setEditing(it);
    setF({
      kategori: it.kategori,
      urunAdi: it.urunAdi,
      aciklama: it.aciklama,
      birim: it.birim,
      birimFiyat: String(it.birimFiyat),
      paraBirimi: it.paraBirimi,
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!f.urunAdi.trim()) {
      showToast('Ürün adı zorunlu');
      return;
    }
    try {
      if (editing) {
        await updateCatalogItem(editing.id, {
          kategori: f.kategori,
          urunAdi: f.urunAdi,
          aciklama: f.aciklama,
          birim: f.birim,
          birimFiyat: Number(f.birimFiyat) || 0,
          paraBirimi: f.paraBirimi,
        });
        showToast('Ürün güncellendi');
      } else {
        await addCatalogItem({
          kategori: f.kategori,
          urunAdi: f.urunAdi,
          aciklama: f.aciklama,
          birim: f.birim,
          birimFiyat: Number(f.birimFiyat) || 0,
          paraBirimi: f.paraBirimi,
        });
        showToast('Ürün eklendi');
      }
      setShowForm(false);
    } catch (e: any) {
      showToast('Hata: ' + (e?.message || ''));
    }
  };

  const [importing, setImporting] = useState(false);

  const doBulk = async () => {
    const rows = textToRows(bulkText);
    if (!rows.length) {
      showToast('CSV boş');
      return;
    }
    const items = rowsToItems(rows);
    if (!items.length) {
      showToast('Geçerli satır yok. Format: kategori,ürün,birim,fiyat,para birimi');
      return;
    }
    try {
      await bulkAddCatalog(items);
      showToast(`${items.length} ürün eklendi`);
      setBulkText('');
      setShowBulk(false);
    } catch (e: any) {
      showToast('Hata: ' + (e?.message || ''));
    }
  };

  // Real file upload: lets people pick a .csv/.txt file, or a price list they
  // already built in Excel (.xlsx/.xls), and imports it directly — no manual
  // copy/paste into the text box needed.
  const pickAndImportFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'text/csv',
          'text/comma-separated-values',
          'text/plain',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const name = (asset.name || '').toLowerCase();
      const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls') || !!asset.mimeType?.includes('spreadsheet') || !!asset.mimeType?.includes('ms-excel');
      const webFile: any = (asset as any).file;

      setImporting(true);
      let rows: string[][] = [];
      if (isExcel) {
        let workbook: XLSX.WorkBook;
        if (Platform.OS === 'web' && webFile) {
          const buf = await webFile.arrayBuffer();
          workbook = XLSX.read(buf, { type: 'array' });
        } else {
          const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
          workbook = XLSX.read(b64, { type: 'base64' });
        }
        rows = sheetToRows(workbook);
      } else {
        let text: string;
        if (Platform.OS === 'web' && webFile) {
          text = await webFile.text();
        } else {
          text = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
        }
        rows = textToRows(text);
      }

      const items = rowsToItems(rows);
      if (!items.length) {
        showToast('Dosyada geçerli ürün satırı bulunamadı');
        return;
      }
      await bulkAddCatalog(items);
      showToast(`${items.length} ürün dosyadan içe aktarıldı`);
      setBulkText('');
      setShowBulk(false);
    } catch (e: any) {
      showToast('Dosya okunamadı: ' + (e?.message || ''));
    } finally {
      setImporting(false);
    }
  };

  const filtered = q
    ? catalog.filter(
        (c) =>
          c.urunAdi.toLowerCase().includes(q.toLowerCase()) ||
          c.kategori.toLowerCase().includes(q.toLowerCase())
      )
    : catalog;

  if (!activeCompany) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <TopHeader title="Katalog" />
        <View style={s.empty}>
          <Text style={s.emptyText}>Önce firma seçiniz</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <TopHeader title="Ürün / Hizmet Kataloğu" />
      <View style={{ padding: 14 }}>
        <View style={s.searchWrap}>
          <Ionicons name="search" size={16} color={theme.colors.textMuted} />
          <TextInput
            testID="catalog-search-input"
            style={s.searchInput}
            placeholder="Ürün / Kategori ara..."
            placeholderTextColor="#94a3b8"
            value={q}
            onChangeText={setQ}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <TouchableOpacity style={[s.btnAcc, { flex: 1 }]} onPress={openNew} testID="new-catalog-btn">
            <Ionicons name="add-circle" size={16} color="#fff" />
            <Text style={s.btnAccText}>Yeni Ürün</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btnAcc, { flex: 1, backgroundColor: theme.colors.navy }]} onPress={() => setShowBulk(true)} testID="bulk-import-btn">
            <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
            <Text style={s.btnAccText}>Toplu İçe Aktar</Text>
          </TouchableOpacity>
        </View>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {filtered.length === 0 ? (
          <View style={s.emptyBox}>
            <Ionicons name="cube-outline" size={30} color={theme.colors.textMuted} />
            <Text style={s.emptyTextBox}>Katalog boş. Yeni ürün ekleyin veya toplu içe aktarın.</Text>
          </View>
        ) : (
          filtered.map((c) => (
            <View key={c.id} style={s.card} testID={`catalog-card-${c.id}`}>
              <View style={{ flex: 1 }}>
                <Text style={s.catBadge}>{c.kategori}</Text>
                <Text style={s.catName} numberOfLines={2}>{c.urunAdi}</Text>
                {c.aciklama ? <Text style={s.catDesc} numberOfLines={2}>{c.aciklama}</Text> : null}
                <Text style={s.catPrice}>{fmt(c.birimFiyat, c.paraBirimi)} / {c.birim}</Text>
              </View>
              <View style={{ gap: 6 }}>
                <TouchableOpacity onPress={() => openEdit(c)} testID={`edit-${c.id}`}>
                  <Ionicons name="pencil" size={20} color={theme.colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteCatalogItem(c.id)} testID={`delete-${c.id}`}>
                  <Ionicons name="trash" size={20} color={theme.colors.red} />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Form modal */}
      <Modal visible={showForm} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHdr}>
              <Text style={s.modalTitle}>{editing ? 'Ürünü Düzenle' : 'Yeni Ürün'}</Text>
              <TouchableOpacity onPress={() => setShowForm(false)}>
                <Ionicons name="close" size={22} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              <FieldGroup label="Kategori">
                <TextInput style={s.input} value={f.kategori} onChangeText={(v) => setF({ ...f, kategori: v })} testID="cat-kategori" />
              </FieldGroup>
              <FieldGroup label="Ürün / Hizmet Adı">
                <TextInput style={s.input} value={f.urunAdi} onChangeText={(v) => setF({ ...f, urunAdi: v })} testID="cat-urunadi" />
              </FieldGroup>
              <FieldGroup label="Açıklama (opsiyonel)">
                <TextInput style={[s.input, { minHeight: 60, textAlignVertical: 'top' }]} multiline value={f.aciklama} onChangeText={(v) => setF({ ...f, aciklama: v })} />
              </FieldGroup>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <FieldGroup label="Birim" flex={1}>
                  <TextInput style={s.input} value={f.birim} onChangeText={(v) => setF({ ...f, birim: v })} testID="cat-birim" />
                </FieldGroup>
                <FieldGroup label="Birim Fiyat" flex={1.2}>
                  <TextInput style={s.input} keyboardType="numeric" value={f.birimFiyat} onChangeText={(v) => setF({ ...f, birimFiyat: v.replace(',', '.') })} testID="cat-fiyat" />
                </FieldGroup>
              </View>
              <FieldGroup label="Para Birimi">
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {['USD', 'EUR', 'TRY'].map((cur) => (
                    <TouchableOpacity
                      key={cur}
                      style={[s.chip, f.paraBirimi === cur && s.chipA]}
                      onPress={() => setF({ ...f, paraBirimi: cur })}
                    >
                      <Text style={[s.chipT, f.paraBirimi === cur && s.chipTA]}>{cur}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </FieldGroup>
              <TouchableOpacity style={s.btnAccBig} onPress={save} testID="save-catalog-btn">
                <Ionicons name="checkmark-done" size={18} color="#fff" />
                <Text style={s.btnAccText}>{editing ? 'Güncelle' : 'Kaydet'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Bulk import modal */}
      <Modal visible={showBulk} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHdr}>
              <Text style={s.modalTitle}>Toplu İçe Aktar</Text>
              <TouchableOpacity onPress={() => setShowBulk(false)}>
                <Ionicons name="close" size={22} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[s.btnAccBig, { marginTop: 0, backgroundColor: theme.colors.navy }]}
              onPress={pickAndImportFile}
              disabled={importing}
              testID="bulk-file-pick-btn"
            >
              <Ionicons name="document-attach-outline" size={18} color="#fff" />
              <Text style={s.btnAccText}>{importing ? 'Yükleniyor…' : 'Excel / CSV Dosyası Yükle'}</Text>
            </TouchableOpacity>
            <Text style={s.hint}>
              .xlsx, .xls veya .csv dosyanızı doğrudan yükleyebilirsiniz. Dosyada başlık satırı varsa
              (ör. Kategori, Ürün Adı, Birim, Fiyat, Para Birimi) sütunlar otomatik eşleştirilir.
              {"\n\n"}Ya da aşağıya yapıştırın — her satır bir ürün. Format: {"\n"}
              <Text style={s.hintCode}>kategori,ürün adı,birim,fiyat,para birimi</Text>
              {"\n"}Örnek: <Text style={s.hintCode}>Yazılım,Mobil Uygulama,Proje,3500,USD</Text>
            </Text>
            <TextInput
              testID="bulk-csv-input"
              style={[s.input, { minHeight: 160, textAlignVertical: 'top', fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }), fontSize: 12 }]}
              multiline
              value={bulkText}
              onChangeText={setBulkText}
              placeholder={'Yazılım,Mobil Uygulama,Proje,3500,USD\nDanışmanlık,UI/UX Tasarım,Ay,1200,EUR'}
              placeholderTextColor="#94a3b8"
            />
            <TouchableOpacity style={s.btnAccBig} onPress={doBulk} testID="bulk-save-btn">
              <Ionicons name="cloud-upload" size={18} color="#fff" />
              <Text style={s.btnAccText}>Yapıştırılan Metni Ekle</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function FieldGroup({ label, children, flex }: { label: string; children: React.ReactNode; flex?: number }) {
  return (
    <View style={[{ marginBottom: 10 }, flex ? { flex } : {}]}>
      <Text style={s.label}>{label}</Text>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: theme.colors.textMuted },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.line,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: { flex: 1, paddingVertical: Platform.OS === 'ios' ? 12 : 8, fontSize: 13, color: theme.colors.text },
  btnAcc: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 11,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btnAccBig: {
    marginTop: 12,
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnAccText: { color: '#fff', fontWeight: '800', fontSize: 12.5 },
  emptyBox: {
    marginTop: 24,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: theme.colors.lineDark,
    borderRadius: 12,
    padding: 30,
    alignItems: 'center',
    gap: 8,
  },
  emptyTextBox: { fontSize: 12.5, color: theme.colors.textMuted, textAlign: 'center' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.line,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  catBadge: {
    fontSize: 9.5,
    color: theme.colors.primary,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  catName: { fontSize: 14, fontWeight: '800', color: theme.colors.text, marginTop: 2 },
  catDesc: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  catPrice: { fontSize: 12.5, color: theme.colors.textSoft, fontWeight: '700', marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: '90%',
  },
  modalHdr: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.line,
    marginBottom: 12,
  },
  modalTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text },
  label: { fontSize: 10, fontWeight: '700', color: theme.colors.textSoft, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: theme.colors.lineDark,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 9,
    fontSize: 13.5,
    color: theme.colors.text,
  },
  chip: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: theme.colors.lineDark,
    borderRadius: 8,
    alignItems: 'center',
  },
  chipA: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipT: { fontSize: 11.5, fontWeight: '700', color: theme.colors.textMuted },
  chipTA: { color: '#fff' },
  hint: { fontSize: 11.5, color: theme.colors.textMuted, marginBottom: 8, lineHeight: 18 },
  hintCode: { color: theme.colors.text, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) },
});
