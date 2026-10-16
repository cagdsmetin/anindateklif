# Kayıt istemeyen ücretsiz araçlar: online teklif oluşturucu ve KDV hesaplama.
# Tamamen tarayıcıda çalışır (sunucuya veri gitmez); taslak yalnız ziyaretçinin
# kendi tarayıcısında localStorage'a yazılır. PDF, tarayıcının yazdır →
# "PDF olarak kaydet" özelliğiyle alınır (kütüphane yok, her cihazda çalışır).

TEKLIF_OLUSTUR_GOVDE = """<div class="kap">
<nav class="kirinti" aria-label="Konum"><a href="/">Ana sayfa</a> › Ücretsiz teklif oluşturucu</nav>
<h1>Ücretsiz online fiyat teklifi oluşturucu</h1>
<p class="giris-metni">Kayıt olmadan fiyat teklifi hazırlayın: bilgileri doldurun, kalemleri ekleyin, PDF olarak indirin. Tutar, KDV ve genel toplam otomatik hesaplanır. Bilgileriniz sunucuya gönderilmez, yalnızca bu tarayıcıda saklanır.</p>
<div class="arac">
<form id="tf" class="arac-form" autocomplete="on" onsubmit="return false">
<fieldset><legend>Firmanız</legend>
<label>Firma adı<input name="firma" placeholder="Örnek Yapı Dekorasyon"></label>
<label>Adres<input name="adres"></label>
<div class="ikili"><label>Telefon<input name="tel" inputmode="tel"></label><label>E-posta<input name="eposta" type="email"></label></div>
<label>Vergi dairesi / no<input name="vergi"></label>
<label>Logo (isteğe bağlı)<input name="logo" type="file" accept="image/*"></label>
</fieldset>
<fieldset><legend>Müşteri ve teklif</legend>
<label>Müşteri adı / unvanı<input name="musteri"></label>
<label>Konu<input name="konu" placeholder="Salon boya ve parke yenileme"></label>
<div class="ikili"><label>Teklif no<input name="no"></label><label>Tarih<input name="tarih" type="date"></label></div>
<div class="ikili"><label>Geçerlilik (gün)<input name="gecerlilik" type="number" min="1" value="15"></label>
<label>Para birimi<select name="para"><option value="TL">TL</option><option value="USD">USD</option><option value="EUR">EUR</option></select></label></div>
</fieldset>
<fieldset><legend>Kalemler</legend>
<div id="satirlar"></div>
<button type="button" class="dugme ikincil" id="ekle">+ Kalem ekle</button>
<div class="ikili"><label>İskonto %<input name="iskonto" type="number" min="0" max="100" step="0.01" value="0"></label>
<label>KDV %<select name="kdv"><option>20</option><option>10</option><option>1</option><option>0</option></select></label></div>
<label class="onay"><input type="checkbox" name="kdvdahil"> Birim fiyatlar KDV dahil</label>
</fieldset>
<fieldset><legend>Koşullar</legend>
<label>Ödeme koşulları<input name="odeme" value="%40 sipariş onayında, %60 teslimde"></label>
<label>Teslim / montaj süresi<input name="teslim"></label>
<label>Notlar (dahil olmayanlar vb.)<textarea name="notlar" rows="3"></textarea></label>
</fieldset>
<p><button type="button" class="dugme buyuk" id="pdf">PDF olarak indir</button> <button type="button" class="dugme ikincil" id="temizle">Formu temizle</button></p>
<p class="kucuk">PDF için açılan yazdırma penceresinde hedef olarak "PDF olarak kaydet"i seçin.</p>
</form>
<section class="onizleme-kap" aria-label="Teklif önizlemesi"><div id="belge" class="belge"></div></section>
</div>
<aside class="cta"><h2>Teklifi WhatsApp'tan tek dokunuşla gönderin</h2><p>Anında Teklif'te aynı teklifi kataloğunuzdan saniyeler içinde hazırlar, müşteriye WhatsApp'tan gönderir, onay ve tahsilatı takip edersiniz. Ayda 5 teklif ücretsiz.</p><a class="dugme buyuk" href="/register">Ücretsiz hesap aç</a></aside>
<section class="dar"><h2>Nasıl kullanılır?</h2><ol><li>Firma ve müşteri bilgilerini girin; logonuzu ekleyin.</li><li>Her kalem için açıklama, miktar, birim ve birim fiyat yazın.</li><li>İskonto ve KDV oranını seçin; toplamlar otomatik hesaplanır.</li><li>Ödeme ve teslim koşullarını yazın.</li><li>"PDF olarak indir"e basın ve yazdırma penceresinde "PDF olarak kaydet"i seçin.</li></ol>
<p>Teklifte neler olması gerektiğini <a href="/rehber/fiyat-teklifi-nasil-hazirlanir.html">fiyat teklifi nasıl hazırlanır</a> rehberinde, örnek bir teklifi <a href="/rehber/fiyat-teklifi-ornegi.html">fiyat teklifi örneği</a> sayfasında bulabilirsiniz.</p></section>
</div>
<script>
(function(){
var f=document.getElementById('tf'),satirlar=document.getElementById('satirlar'),belge=document.getElementById('belge'),logo='',ANAHTAR='at_teklif_taslak_v1';
function e(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function sayi(v){v=String(v||'').replace(/\\s/g,'');if(v.indexOf(',')>-1)v=v.replace(/\\./g,'').replace(',','.');else if(/^-?\\d{1,3}(\\.\\d{3})+$/.test(v))v=v.replace(/\\./g,'');var n=parseFloat(v);return isFinite(n)?n:0}
function para(n){return n.toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' '+f.para.value}
function satirEkle(d){d=d||{};var r=document.createElement('div');r.className='satir';
r.innerHTML='<input placeholder="Açıklama" data-k="ac"><input placeholder="Miktar" inputmode="decimal" data-k="mi"><input placeholder="Birim" data-k="bi"><input placeholder="Birim fiyat" inputmode="decimal" data-k="bf"><button type="button" aria-label="Kalemi sil">×</button>';
['ac','mi','bi','bf'].forEach(function(k){r.querySelector('[data-k='+k+']').value=d[k]||(k==='bi'&&!d.ac?'adet':'')});
r.querySelector('button').onclick=function(){r.remove();ciz()};satirlar.appendChild(r)}
function veri(){var d={};['firma','adres','tel','eposta','vergi','musteri','konu','no','tarih','gecerlilik','para','iskonto','kdv','odeme','teslim','notlar'].forEach(function(k){d[k]=f[k].value});d.kdvdahil=f.kdvdahil.checked;
d.satirlar=[].map.call(satirlar.children,function(r){var o={};['ac','mi','bi','bf'].forEach(function(k){o[k]=r.querySelector('[data-k='+k+']').value});return o});return d}
function ciz(){var d=veri(),k=sayi(d.kdv)/100,isk=sayi(d.iskonto)/100,ara=0,sat='';
d.satirlar.forEach(function(s,i){if(!s.ac&&!s.bf)return;var m=sayi(s.mi)||1,bf=sayi(s.bf);if(d.kdvdahil)bf=bf/(1+k);var t=m*bf;ara+=t;
sat+='<tr><td>'+(i+1)+'</td><td>'+e(s.ac)+'</td><td class="sag">'+e(s.mi||'1')+' '+e(s.bi)+'</td><td class="sag">'+para(bf)+'</td><td class="sag">'+para(t)+'</td></tr>'});
var iskT=ara*isk,mat=ara-iskT,kdvT=mat*k,gen=mat+kdvT;
var tarih=d.tarih?new Date(d.tarih+'T00:00:00').toLocaleDateString('tr-TR'):'';
belge.innerHTML='<div class="b-ust"><div>'+(logo?'<img src="'+logo+'" alt="" class="b-logo">':'')+'<strong>'+e(d.firma||'Firma adınız')+'</strong><br>'+e(d.adres)+'<br>'+e([d.tel,d.eposta].filter(Boolean).join(' · '))+(d.vergi?'<br>'+e(d.vergi):'')+'</div><div class="sag"><strong class="b-baslik">FİYAT TEKLİFİ</strong><br>'+(d.no?'No: '+e(d.no)+'<br>':'')+(tarih?'Tarih: '+tarih:'')+'</div></div>'+
'<p><strong>Sayın:</strong> '+e(d.musteri||'—')+(d.konu?' &nbsp;·&nbsp; <strong>Konu:</strong> '+e(d.konu):'')+'</p>'+
'<table><thead><tr><th>#</th><th>Açıklama</th><th class="sag">Miktar</th><th class="sag">Birim fiyat</th><th class="sag">Tutar</th></tr></thead><tbody>'+(sat||'<tr><td colspan="5" class="bos">Kalem ekleyin</td></tr>')+'</tbody></table>'+
'<table class="b-toplam"><tr><td>Ara toplam</td><td class="sag">'+para(ara)+'</td></tr>'+(isk?'<tr><td>İskonto (%'+e(d.iskonto)+')</td><td class="sag">-'+para(iskT)+'</td></tr>':'')+'<tr><td>KDV (%'+e(d.kdv)+')</td><td class="sag">'+para(kdvT)+'</td></tr><tr class="b-gen"><td>Genel toplam</td><td class="sag">'+para(gen)+'</td></tr></table>'+
'<div class="b-not">'+(d.gecerlilik?'<p>Bu teklif düzenleme tarihinden itibaren '+e(d.gecerlilik)+' gün geçerlidir.</p>':'')+(d.odeme?'<p><strong>Ödeme:</strong> '+e(d.odeme)+'</p>':'')+(d.teslim?'<p><strong>Teslim:</strong> '+e(d.teslim)+'</p>':'')+(d.notlar?'<p>'+e(d.notlar).replace(/\\n/g,'<br>')+'</p>':'')+'</div>'+
'<p class="b-imza">Kaşe / İmza</p><p class="b-alt">anindateklif.co ile hazırlandı</p>';
try{var kayit=veri();kayit.logo=logo;localStorage.setItem(ANAHTAR,JSON.stringify(kayit))}catch(x){}}
function yukle(){var d=null;try{d=JSON.parse(localStorage.getItem(ANAHTAR)||'null')}catch(x){}
if(d){Object.keys(d).forEach(function(k){if(f[k]&&f[k].type!=='file'){if(f[k].type==='checkbox')f[k].checked=!!d[k];else f[k].value=d[k]}});logo=d.logo||'';(d.satirlar||[]).forEach(satirEkle)}
if(!f.tarih.value)f.tarih.value=new Date().toISOString().slice(0,10);
if(!f.no.value)f.no.value=new Date().getFullYear()+'-001';
if(!satirlar.children.length){satirEkle();satirEkle();satirEkle()}}
f.addEventListener('input',ciz);f.addEventListener('change',ciz);
f.logo.addEventListener('change',function(){var dosya=f.logo.files[0];if(!dosya)return;var o=new FileReader();o.onload=function(){logo=o.result;ciz()};o.readAsDataURL(dosya)});
document.getElementById('ekle').onclick=function(){satirEkle();ciz()};
document.getElementById('pdf').onclick=function(){ciz();var eski=document.title;document.title=('Teklif '+(f.no.value||'')+' '+(f.musteri.value||'')).trim();window.print();setTimeout(function(){document.title=eski},500)};
document.getElementById('temizle').onclick=function(){if(!confirm('Form temizlensin mi?'))return;try{localStorage.removeItem(ANAHTAR)}catch(x){}f.reset();logo='';satirlar.innerHTML='';yukle();ciz()};
yukle();ciz();
})();
</script>"""

KDV_GOVDE = """<div class="kap dar">
<nav class="kirinti" aria-label="Konum"><a href="/">Ana sayfa</a> › KDV hesaplama</nav>
<h1>KDV hesaplama (KDV dahil ve hariç)</h1>
<div class="kisa-cevap"><strong>Kısa cevap:</strong> KDV hariç tutardan KDV dahil tutara geçmek için tutarı (1 + KDV oranı) ile çarpın: 1.000 TL × 1,20 = 1.200 TL. KDV dahil tutardan KDV hariç tutarı bulmak için (1 + KDV oranı)'na bölün: 1.200 TL ÷ 1,20 = 1.000 TL. Türkiye'de genel KDV oranı %20'dir; indirimli oranlar %10 ve %1'dir.</div>
<form id="kf" class="arac-form kdv" onsubmit="return false">
<label>Tutar<input name="tutar" inputmode="decimal" value="1000"></label>
<label>KDV oranı<select name="oran"><option value="20">%20</option><option value="10">%10</option><option value="1">%1</option><option value="ozel">Diğer</option></select></label>
<label id="ozelk" hidden>Oran (%)<input name="ozel" inputmode="decimal" value="18"></label>
<fieldset class="secim"><legend>Girdiğim tutar</legend>
<label><input type="radio" name="yon" value="haric" checked> KDV hariç</label>
<label><input type="radio" name="yon" value="dahil"> KDV dahil</label></fieldset>
</form>
<table class="fiyat" id="ks"><tbody><tr><td>KDV hariç tutar</td><td id="k1"></td></tr><tr><td>KDV tutarı</td><td id="k2"></td></tr><tr><td><strong>KDV dahil tutar</strong></td><td id="k3"></td></tr></tbody></table>
<h2>KDV hesaplama formülleri</h2>
<table><thead><tr><th>Ne arıyorsunuz?</th><th>Formül</th><th>Örnek (%20)</th></tr></thead><tbody>
<tr><td>KDV tutarı (hariç tutardan)</td><td>Tutar × oran</td><td>1.000 × 0,20 = 200 TL</td></tr>
<tr><td>KDV dahil tutar</td><td>Tutar × (1 + oran)</td><td>1.000 × 1,20 = 1.200 TL</td></tr>
<tr><td>KDV hariç tutar (dahil tutardan)</td><td>Tutar ÷ (1 + oran)</td><td>1.200 ÷ 1,20 = 1.000 TL</td></tr>
<tr><td>KDV tutarı (dahil tutardan)</td><td>Tutar − Tutar ÷ (1 + oran)</td><td>1.200 − 1.000 = 200 TL</td></tr>
</tbody></table>
<p>Fiyat teklifinde KDV'nin dahil mi hariç mi olduğunu mutlaka yazın. Ayrıntılar: <a href="/rehber/fiyat-teklifi-nasil-hazirlanir.html">fiyat teklifi nasıl hazırlanır?</a> Hangi oranın uygulanacağını mal veya hizmetinize göre mali müşavirinizle teyit edin.</p>
</div>
<script>
(function(){var f=document.getElementById('kf');
function sayi(v){v=String(v||'').replace(/\\s/g,'');if(v.indexOf(',')>-1)v=v.replace(/\\./g,'').replace(',','.');else if(/^-?\\d{1,3}(\\.\\d{3})+$/.test(v))v=v.replace(/\\./g,'');var n=parseFloat(v);return isFinite(n)?n:0}
function tl(n){return n.toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' TL'}
function h(){var oz=f.oran.value==='ozel';document.getElementById('ozelk').hidden=!oz;var o=(oz?sayi(f.ozel.value):sayi(f.oran.value))/100,t=sayi(f.tutar.value),haric=f.yon.value==='dahil'?t/(1+o):t;
document.getElementById('k1').textContent=tl(haric);document.getElementById('k2').textContent=tl(haric*o);document.getElementById('k3').textContent=tl(haric*(1+o))}
f.addEventListener('input',h);f.addEventListener('change',h);h()})();
</script>"""

ARAC_CSS = """.arac{display:grid;grid-template-columns:minmax(300px,420px) 1fr;gap:22px;align-items:start;margin:18px 0}
.arac-form fieldset{border:1px solid var(--cizgi);border-radius:14px;padding:12px 14px;margin:0 0 12px}.arac-form legend{color:#fff;font-weight:700;padding:0 6px}
.arac-form label{display:block;font-size:13px;color:var(--soluk);margin:6px 0}
.arac-form input,.arac-form select,.arac-form textarea{display:block;width:100%;margin-top:4px;background:var(--kart);border:1px solid var(--cizgi);border-radius:9px;color:#fff;padding:9px 10px;font:inherit;font-size:15px}
.arac-form input[type=checkbox],.arac-form input[type=radio]{display:inline;width:auto;margin:0 6px 0 0}.arac-form .onay,.secim label{color:var(--metin);font-size:14px}
.ikili{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.satir{display:grid;grid-template-columns:2.4fr .8fr .8fr 1.1fr 34px;gap:6px;margin-bottom:6px}.satir input{margin:0;padding:8px}.satir button{background:transparent;border:1px solid var(--cizgi);border-radius:8px;color:var(--soluk);font-size:18px;cursor:pointer}
button.dugme{border:0;cursor:pointer;font:inherit;font-weight:700}
.onizleme-kap{position:sticky;top:80px}
.belge{background:#fff;color:#1E293B;border-radius:12px;padding:28px;font-size:13px;line-height:1.5;box-shadow:0 20px 50px rgba(0,0,0,.4);min-height:560px}
.belge table{display:table;width:100%;border-collapse:collapse;margin:12px 0;font-size:12.5px}.belge th{background:#1E3A8A;color:#fff}.belge td,.belge th{border:1px solid #CBD5E1;padding:6px 8px}
.belge .sag{text-align:right}.b-ust{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #1E3A8A;padding-bottom:12px;margin-bottom:10px}.b-logo{max-height:56px;max-width:160px;display:block;margin-bottom:6px}
.b-baslik{font-size:18px;color:#1E3A8A}.b-toplam{width:60%!important;margin-left:auto!important}.b-gen td{font-weight:800;font-size:14px;background:#EFF6FF}.bos{text-align:center;color:#94A3B8}
.b-not p{margin:4px 0}.b-imza{margin-top:36px;text-align:right;color:#475569}.b-alt{margin-top:24px;text-align:center;font-size:10px;color:#94A3B8}
.kdv{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:18px 0}.kdv .secim{grid-column:1/-1;display:flex;gap:18px}
@media (max-width:860px){.arac{grid-template-columns:1fr}.onizleme-kap{position:static}.belge{padding:16px}}
@media print{@page{size:A4;margin:14mm}body.statik{background:#fff!important}.ust,.alt,.kirinti,h1,.giris-metni,.arac-form,.cta,section.dar,.dar{display:none!important}
.arac{display:block;margin:0}.onizleme-kap{position:static}.belge{box-shadow:none;padding:0;min-height:0;border-radius:0}
.belge th{-webkit-print-color-adjust:exact;print-color-adjust:exact}.b-gen td{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
"""
