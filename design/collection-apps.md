# Koleksiyonla küçük uygulamalar: teknik tasarım (taslak)

Durum: 20 Ekim 2026'da onaylandı, PLAN.md'ye işlendi. 1. dilim kodda (ffc68b3). 2. dilim kodda (mockup 63e5ec8, kod 2c2c4fd). 3. dilim kodda (mockup 3eb21de, kod 5a10baf). 4. dilimin mockup'ı 21 Ekim'de onaylandı (`design/mockups.html`, 13. aşama · 4. dilim).

## 1. Amaç

Ajan bir şirket için küçük uygulamalar kurabilmeli: formlar, akış, hesap ve iş kuralları. Örnek: proje bazlı çalışan bir şirket, bir projenin görevlerini, gelirini, giderini ve bütçesini kalem kalem Scrawl'da yürütür. Bu bir ERP değil. Ölçü, küçük bir ekibin işinin çoğunu görebilmesi; kapsam bundan büyümez.

Bugün eksik olan dört şey var:
- **Hesap gücü:** formül yalnız sayıyla çalışıyor, rollup koşul almıyor, lookup yok, rollup başka bir hesaplanan alanı okuyamıyor.
- **Hızlı giriş:** her kayıt ayrı bir pencere; varsayılan değer ve sayı biçimi yok.
- **Kural:** alanlar arası doğrulama yok.
- **İş:** bir düğmeyle ya da kaydederken yapılan iş yok.

Verilen kararlar (20 Ekim 2026):
- Ana kitle teknoloji sektörü. Başka bir sektör de kullanabilir, onu engellemeyiz. Teknoloji işinde de proje ve bütçe yönetimi var.
- **Kural dili** bu tasarımda (6. bölüm). Tam bir JS değildir: yalnız Scrawl'ın verisini görür, dosyaya, ağa ve fazlasına erişemez. İş kuralı yazar, akışı ilerletir, hesap yapar, kayıt ekler, günceller ve siler. Söz dizimi JS'e benzer. Formül de aynı söz dizimiyle yazılır (4.1).
- Kural düğmede ve **kaydederken** çalışır. Kaydederken çalışan kuralı kaydı kaydeden yer bir kez çalıştırır, sunucu gerekmez (6.5).
- **Otomasyon** bu tasarımda yok. Otomasyon, kimse bir şey yapmadan, saati gelince ya da bir değişiklik nereden gelirse gelsin sunucunun kendiliğinden yaptığı iştir. Anlamlı kapsamı bildirimle birliktedir; ayrı bir tasarım konusudur ve PLAN'da Sonraya kalanlar'da durur. Gelirse sunucuda olur.
- "Şablonlar hep bizden" kuralı kalkar. Bir klasörü şablon olarak kaydetmek (uygulama şablonu) ayrı bir tasarımdır.
- Sıra: (1) dil ve hesap: ifade, koşullu rollup, lookup; (2) doğrulama, varsayılan değer, sayı biçimi; (3) hızlı kalem girişi; (4) düğmeler; (5) kaydederken kural.
- Code alanına özel bir kural yoktur. PLAN 4.6'daki "hep elle yazılır, hiçbir zaman kendiliğinden dolmaz" cümlesi, ajanın kodu kendiliğinden doldurduğu belirli bir durum için söylenmişti; genel kural değildir ve plandan çıkar.
- Sıradaki numara varsayılan değerle verilir: `next()` (5.1).
- Tabloda hücreye tıklayınca hücre seçilir; kayıt satırın başındaki düğmeyle ve name hücresiyle açılır (5.2).
- Sayı biçimi cihazın dil ve bölge ayarına göredir (4.6).
- Para birimini kaydın bir alanından okuyan sütunda tablo ve grup toplamı para birimine göre ayrılır; rollup ve formülde v1'de para birimi alan başınadır (4.6).
- Bu iş 13. aşamanın (Dropbox, S3, GitHub) önüne girer.
- Finans ayrı bir space olmaz, space'ler arası link de gerekmez. Bölümler space'in içinde yetkiyle ayrılır; bu, sunucuda klasöre göre yetkiyle gelir (PLAN, Sonraya kalanlar).

21 Ekim 2026'da, 2. dilimin mockup'ıyla verilen kararlar:
- Fields penceresinin sekmeleri Design, Rules ve Schema'dır. Text'in adı Schema olur ve en sona geçer; şema dosyasını gösterir.
- Para birimi her cihazda simgesiyle yazılır: İngilizce bir cihazda `₺1,250.50` (4.6).
- Tarayıcı bölgeyi bilmez, yalnız kendi dilini bilir. Settings › Appearance'ta cihaz başına **Numbers** seçeneği olur: tarayıcıya göre, `1.234,56` ya da `1,234.56` (4.6).
- Rollup'ın koşulu para birimini tek birine sabitlerse karışık para birimi uyarısı kalkar (4.6).
- Formdaki sayı kutusu biçimli görünür, yazarken düz sayıya döner (4.6).
- Varsayılan değer alanın düzenleyicisinde Value ya da Formula olarak verilir (5.1).
- Rules sekmesinde yanlış satır varken Save kapalıdır (6.1).

21 Ekim 2026'da, 3. dilimin mockup'ıyla verilen kararlar:
- Hücre, Enter ve yazmaya başlamanın yanında seçili hücreye bir daha tıklayınca ve çift tıklayınca da düzenlenir (5.2).
- Kaydı açan düğme yalnız üstünde durulan ya da seçili satırda görünür (5.2).
- + Add row'un Add ve Cancel düğmeleri yeni satırın altında, sağdadır; tablo yana kaysa da görünür (5.2).
- Tablo görünümündeki bağlı blokta başlıktaki "+ Add …" düğmesi yoktur; tek ekleme yeri alttaki + Add row'dur (5.3).
- Bağlı tablonun toplamı blok başına açılır ya da kapanır (5.3).

21 Ekim 2026'da, 4. dilimin mockup'ıyla verilen kararlar:
- `when` tutmayan düğmenin ipucunu kural isteğe bağlı `hint` ile yazar (`{ when: () => status == "Active", hint: "Only while the status is Active" }`); `hint` yoksa ipucu koşulu yazıldığı gibi gösterir (6.4).
- Düzende Buttons bloğu yoksa ve kurallarda düğme varsa düğmeler kayıt ekranının en üstünde çıkar (6.4).
- Tablo satırının ··· menüsü üstünde durulan satırın sonunda görünür: Open, düğmeler (soluk olan nedeniyle), Delete (6.4).
- Düşen kuralın toast'ı kapatılana kadar kalır, satır numarasını ve nedeni söyler (6.4).
- Onay sorusu eklenenleri sayıyla ve adlarıyla, değişen alanı eski ve yeni değeriyle yazar (6.4).

## 2. Örnek: proje, görev ve bütçe

Asansör şirketi de, yazılım ajansı da aynı yapıyı kurar:

| Parça | Ne | İçinde |
|---|---|---|
| Projects | koleksiyon | name, code, customer (→ Companies), status, start, delivery, contract; budget, spent, income (rollup), remaining, health (formül) |
| Budget lines | koleksiyon | name, project (→ Projects), category, planned; actual (rollup), remaining (formül) |
| Transactions | koleksiyon | name, project, line (→ Budget lines), direction (In / Out), amount, date, invoice, status, due, paid_on; customer (lookup) |
| Projects board | pano | Survey, Production, Installation, Acceptance; kartta project alanı |
| How we run a project | not | süreç; ajan bunu okuyarak süreci bilir |

Projenin kayıt ekranı: solda alanlar ve notlar; sağda Budget lines ve Transactions birer tablo olarak, altlarında toplamlarıyla; en altta Cards and tasks. Üstte "Start project" düğmesi var: standart alt görevleri ve bütçe kalemlerini açar, durumu Active yapar. Bir ödeme Paid olunca ödeme günü kaydederken yazılır; durum ister formdan, ister tablodan, ister ajandan değişsin. Vadesi geçen ödeme bir formülle her gün kendiliğinden görünür.

Projects'in şeması (`_collection.json`), bir parçası:

```json
{
  "fields": [
    { "key": "code", "label": "Code", "type": "code", "default": "=next('PRJ-', 4)" },
    { "key": "status", "label": "Status", "type": "select", "options": ["Offer", "Active", "Done", "Cancelled"], "default": "Offer" },
    { "key": "start", "label": "Start", "type": "date", "default": "=today()" },
    { "key": "budget", "label": "Budget", "type": "rollup",
      "rollup": { "from": "Budget lines", "fn": "sum", "field": "planned" },
      "format": { "style": "currency", "currency": "TRY" } },
    { "key": "spent", "label": "Spent", "type": "rollup",
      "rollup": { "from": "Transactions", "fn": "sum", "field": "amount",
                  "where": [{ "field": "direction", "op": "is", "value": ["Out"] }] },
      "format": { "style": "currency", "currency": "TRY" } },
    { "key": "remaining", "label": "Remaining", "type": "formula", "formula": "budget - spent",
      "format": { "style": "currency", "currency": "TRY" } },
    { "key": "health", "label": "Health", "type": "formula", "formula": "spent > budget ? 'Over budget' : 'OK'" }
  ]
}
```

Projects'in kuralları (`_rules.js`):

```js
check("delivery", () => delivery >= start, "Delivery is before the start")

action("Start project", { when: () => status == "Offer", confirm: true }, () => {
  for (const name of ["Material", "Labour", "Transport"]) {
    add("Budget lines", { name, category: name, planned: contract * 0.3 })
  }
  subtask("Site survey", { due: start + 3 })
  subtask("Order the cabin")
  status = "Active"
})
```

Transactions'ın kuralları:

```js
check("line", () => direction != "Out" || !empty(line), "Pick the budget line")

onSave("Paid date", () => {
  if (status == "Paid" && old.status != "Paid" && empty(paid_on)) paid_on = today()
})
```

Bitti sayılır: bir ajan bu örneği tek bir istekle MCP üzerinden kuruyor, şema ve kural denetiminden hatasız geçiyor; bir kişi kalemleri tablodan hızlıca giriyor ve proje ekranında planlanan, gerçekleşen ve kalan tutarı ₺ biçimiyle görüyor; bütçe aşılınca işaret çıkıyor; "Start project" görevleri ve kalemleri açıyor; ödeme tablodan da Paid yapılsa ödeme günü yazılıyor; vadesi geçen ödemeler formülle görünüyor.

## 3. Neyin nerede çalıştığı

Tasarımın tek ilkesi bu ayrım. Bir şeyin nerede ve kaç kez çalıştığı belli olmazsa sync onu bozar.

| Ne | Nerede çalışır | Dosyaya yazar mı |
|---|---|---|
| Formül, lookup, rollup, doğrulama | Okuyan her yerde: masaüstü, web, telefon, MCP (bilgisayarda ve sunucuda), dışa aktarma | Hayır |
| Varsayılan değer | Kaydı açan yerde, bir kez | Evet, sıradan bir değer olarak |
| Düğme | Kişinin bastığı yerde ya da ajanın çağırdığı yerde | Evet |
| Kaydederken kural | Kaydı kaydeden yerde, bir kez: form, tablo, içe aktarma, düğme, ajanın `save_record`'u | Evet |

- Okurken hesaplananlar hiçbir zaman dosyaya yazılmaz (bugünkü gibi). Bu yüzden çakışma yok, her yerde aynı sonuç çıkar.
- Yazan şeyler yalnız bir kişi, bir düğme ya da ajan bir şey yazdığında çalışır. Sync'le gelen bir değişiklikte hiçbir zaman çalışmaz; böyle olsaydı her cihaz aynı işi bir kez daha yapardı. Dosyası elle düzenlenen kayıtta da çalışmaz.
- Hepsi her space'te çalışır, sunucu gerekmez.
- Hepsi `packages/core`'da tek kodla yazılır. Uygulama ve MCP aynı kodu çağırır.

## 4. Hesap

### 4.1 Dil

Formül, doğrulama, varsayılan değer ve kurallar tek bir dili kullanır. Söz dizimi JS'e benzer, ama JS değildir: kendi okuyucumuz ve yorumlayıcımız onu çalıştırır ve yalnız izin verdiğimiz parçaları kabul eder. İki seviyesi var:

- **İfade:** formül, doğrulamanın koşulu, varsayılan değer. Yalnız okur, hiçbir şey yazmaz, aynı girdiyle hep aynı sonucu verir. Her yerde, her an hesaplanır.
- **Kural:** düğmenin ve kaydederken çalışan kuralın gövdesi. İfadenin her şeyine ek olarak değişken, `if`, döngü, arama ve kayıt değiştirme vardır (6.2).

İfadenin parçaları:
- **Değerler:** sayı `12.5`; metin `"Over budget"` ya da `'Over budget'`; şablonlu metin `` `${name} survey` ``; `true`, `false`, `null`; liste `[1, 2]`.
- **Alanlar:** anahtarıyla (`planned`). Bir link alanının hedefindeki alan noktayla okunur: `project.customer`, `project.customer.segment`. Bunu tabloda sütun olarak göstermek için lookup alanı vardır (4.3).
- **İşlemler:** `+ - * / %` (`+` metni metne ekler), karşılaştırma `== != < <= > >=`, mantık `&& || !`, `koşul ? ise : değilse`, parantez. Dilde tür dönüştürme yoktur; `===` ile `!==` da kabul edilir ve `==` ile `!=` ile aynıdır.
- **Tarihler:** tarih − tarih gün sayısıdır, tarih + sayı tarihtir. `today() - last_contact` bugünkü gibi gün sayısı verir. Bu JS'teki gibi değildir, dilimizin kuralıdır.
- **Fonksiyonlar:** `today()`, `empty(x)`, `round(x, basamak)`, `abs(x)`, `min(…)`, `max(…)`, `year(d)`, `month(d)`, `contains(metin ya da liste, değer)`, `text(x)`. Yalnız varsayılan değerde ve kuralda: `me()` (bakan kişiye göre değiştiği için formülde olmaz) ve varsayılan değerde `next(önek, basamak)`.
- **Alan türleri dilde:** select ve person metindir (`status == "Paid"`). Çoklu seçim listedir (`contains(tags, "vip")`). Onay kutusu `true` ya da `false`'tur. Tek link hedef kayıttır, metin olarak adını verir.
- **Boş değer:** boş bir alanla yapılan hesap boş verir (bugünkü gibi), karşılaştırma yanlış verir. `empty(x)` boş olup olmadığını sorar.
- **Tür denetimi:** ifade okunurken alanların türünden sonucun türü çıkarılır: sayı, metin, tarih ya da onay. `? :`'nin iki kolu farklı türdeyse, sayı bekleyen yere metin verilmişse ya da olmayan bir alan okunuyorsa Fields penceresi söyler. Ajanın şema denetimi de aynısını söyler.
- **Formülde olmayanlar:** atama, değişken, döngü, `find()` ve `linked()`. Formül her an her yerde hesaplanır ve neye bağlı olduğu belli olmalıdır; başka kayıtlardan değer almanın yolu nokta, lookup ve rollup'tır.
- **Geriye uyum:** bugünkü formüller (`qty * unit_price`, `today() - last_contact`) aynen çalışır.
- **Değer mi ifade mi:** varsayılan değer `=` ile başlıyorsa ifadedir (`"=today()"`), başlamıyorsa olduğu gibi yazılır (`"Offer"`). Formül hep ifadedir.

Uygulama: `packages/core/src/lang/` altında okuyucu (tokenizer ve Pratt), tür denetimi ve yorumlayıcı. Bugünkü `tokenize` ve `parseFormula` bunun yerine geçer. `eval`, `new Function` ya da bir JS motoru yoktur. Hazır bir JS okuyucusu (acorn gibi) seçilmedi: 100 KB'ın üstünde ve kabul etmediğimiz söz dizimini reddetmek için yine ayrı bir denetim gerekiyor. Kendi okuyucumuz yanlışı "`while` is not allowed in a rule" gibi, ne yapılacağını söyleyerek bildirir. Sınırlar 8. bölümde. Yeni bağımlılık yok.

### 4.2 Formül

Alan türü aynı kalır (`formula`). Değişen şunlar:
- Sonuç sayı, metin, tarih ya da onay olabilir. Tablo sıralamayı, gruplamayı ve Filter koşullarını sonucun türüne göre yapar (`opsFor` sonucun türünü alır).
- Formül lookup ve rollup alanlarını, linkin hedefini noktayla okuyabilir.
- Panonun alanları da aynı türü kullandığı için kartta formül de aynı dilden gelir.

### 4.3 Lookup

Yeni alan türü `lookup`: bir link alanından hedef kaydın bir alanını gösterir. PLAN 4.6'da yazıyor ama kodda yok.

```json
{ "key": "customer", "label": "Customer", "type": "lookup", "lookup": { "link": "project", "field": "customer" } }
```

- `link` bu koleksiyonun bir link alanıdır; `field` hedef koleksiyonun herhangi bir alanıdır. Hesaplanan bir alan da olabilir, böylece zincir kurulur (giderde projenin müşterisinin segmenti).
- Çoklu link ise değerler liste olur: tabloda ve formda çip olarak görünür.
- Formda salt okunurdur; tabloda sütundur, sıralanır ve süzülür.
- Formüldeki `project.customer` ile aynı değeri verir. Lookup, bunu bir sütun olarak göstermek içindir.
- Panoda da çalışır: kartta müşterinin ülkesi.
- Fields penceresinde iki seçimle kurulur: hangi link, hangi alan.

### 4.4 Rollup

Bugünkü rollup'a üç şey eklenir:
- **`where`:** kaynak kayıtlar ya da kartlar için koşullar. Bunlar Filter penceresindeki koşul satırlarının aynısıdır, Fields penceresinde de aynı satırlarla kurulur. Gelir ve gider böyle ayrılır.
- **`avg`:** `count`, `sum`, `max` ve `min`'in yanına ortalama.
- **Zincir:** kaynak alan hesaplanan bir alan olabilir: kalemin gerçekleşeni (rollup) projede toplanır, kalemin kalanı (formül) projede en küçüğüyle alınır.
- **Hiçbir şey yokken:** bağlanan bir kayıt ya da kart yoksa `sum` ve `count` 0 verir; `avg`, `max` ve `min` boş kalır. Böylece yeni bir projenin kalanı (`budget - spent`) boş değil, bütçenin kendisidir (20 Ekim kararı).

Koşullarda tarih değeri olarak `"today"` da yazılabilir (`due` `before` `today`). Bu Filter penceresine de gelir; PLAN'daki "vadesi geçmiş kayıtlı bir filtredir" cümlesi ancak böyle tutar. Bugün koşul yalnız sabit bir gün alıyor.

### 4.5 Hesap motoru

Yeni dosya: `packages/core/src/compute.ts`. Bugünkü `fieldValueOf`, `withRollups` ve `rolledValues`'un yerini alır.

- `computeSpace({ collections, boards, today })` bir `Computed` döner: `value(dir, recordId, key)` ve kaydın bütün değerleri.
- Hesap tembeldir ve sonucu saklanır: bir değer istendiğinde hesaplanır, bir kez hesaplanan bir daha hesaplanmaz. Space'te bir şey değişince yeni bir `Computed` kurulur.
- Ters link dizini bir kez kurulur: her koleksiyonun her link alanı için "bu kayda link verenler". Bugün `linkedRecords` her kayıt için bütün koleksiyonu tarıyor; rollup çoğaldıkça bu yavaşlar.
- Noktayla okunan hedef de lookup gibi motorun içinden hesaplanır.
- Döngü: hesaplanmakta olan bir değer yeniden istenirse boş döner ve bir sorun yazılır. Fields penceresi "budget reads spent, which reads budget" gibi söyler.
- Tablo, form, bağlı kayıt blokları, Today, dışa aktarma, kurallar ve MCP hep bunu kullanır.
- Hedef: 5.000 kayıt ve kayıt başına on hesaplanan alan, dizüstü bilgisayarda 50 ms'nin altında (testte ölçülür).

### 4.6 Sayı biçimi

Sayı, formül, rollup ve lookup alanında `format`:

```json
"format": { "style": "currency", "currency": "TRY", "decimals": 2 }
```

- `style`: `number`, `currency` ya da `percent`. `decimals`: 0 ile 4 arası.
- Yüzde, Excel'deki gibi kesirle tutulur: 0,18 değeri %18 görünür. Excel'e aktarınca aynı kalır.
- Gösterim `Intl.NumberFormat` ile, cihazın dil ve bölge ayarına göre yapılır. Para birimi her cihazda simgesiyle yazılır (`currencyDisplay: "narrowSymbol"`): Türkiye'de `₺1.250,50`, ABD'de `₺1,250.50`. Dosyadaki değer hep düz sayıdır. Aynı space'te iki kişi kendi biçimini görür.
- Tarayıcı bölge ayarını bilmez, yalnız kendi dilini bilir: Chrome İngilizceyse Windows'ta bölge Türkiye olsa da `1,250.50` görünür. Bu yüzden Settings › Appearance'ta cihaz başına **Numbers** seçeneği vardır: *As the browser* (varsayılan), `1.234,56`, `1,234.56`. Seçenek cihazda kalır, sync'e girmez.
- Formdaki sayı kutusu biçimli görünür (`₺96.800`); kutuya girince düz sayıya döner, çıkınca yeniden biçimlenir.
- Biçim Fields penceresinde alanın düzenleyicisindedir: Format satırında Number, Currency ya da Percent ve para birimi (listeden bir kod ya da *From a field* altında kaydın bir select ya da text alanı), Decimals satırında 0-4.
- Tablo toplamı, grup toplamları, kart yüzü ve sütun başı toplamı da biçimi kullanır. Bugünkü `numberText` (hep en-US) `formatNumber(value, format)` olur.
- Excel'e aktarmada hücre sayı olarak kalır, biçimi hücrenin biçimi olur (`₺#,##0.00`). CSV düz sayı yazar.
- Para birimi ya alanın kendisinde yazar (`"currency": "TRY"`) ya da kaydın bir alanından okunur (`"currencyField": "currency"`, Payments'taki gibi her ödemenin kendi para birimi).
- Para birimini alandan okuyan bir sütunda tablo toplamı ve grup toplamları para birimine göre ayrılır: `₺120.000 · €4.500`. Bugün TL ile EUR birbirine ekleniyor; bu yanlış.
- Rollup ve formülde v1'de para birimi alan başınadır. Para birimini alandan okuyan bir alanı toplayan rollup, karışık para birimini toplayacağı için Fields penceresinde ve şema denetiminde uyarı verir. Rollup'ın koşulu para birimi alanını tek bir değere sabitlerse (`Currency is EUR`) uyarı kalkar.

## 5. Giriş

### 5.1 Varsayılan değer

Hesaplanmayan her alanda `default` olabilir: sabit bir değer (`"Offer"`, `0`, `true`) ya da ifade (`"=today()"`, `"=me()"`, `"=project.currency"`).

- Fields penceresinde alanın düzenleyicisinde Default satırı vardır: **Value** ya da **Formula**. Value, alanın formdaki kutusuyla verilir (seçenek, kişi, gün; günde Today da seçilir ve `=today()` yazılır). Formula, formül kutusudur; altında yeni kaydın ne alacağı yazar ("Next: PRJ-0016").
- Yeni kayıt formu açılırken doldurulur. Kişi değeri görür ve değiştirebilir. Bağlı kayıt bloğundan açılan formda linkler önce dolar, ardından varsayılanlar şema sırasıyla hesaplanır. Bu yüzden bir varsayılan, linkin hedefini okuyabilir.
- Ajanın `save_record`'u ve kuraldaki `add()` yeni bir kayıtta verilmeyen alanı varsayılanla doldurur.
- İçe aktarmada dosyada sütunu olmayan alan da varsayılanı alır.
- Dosyaya sıradan bir değer olarak yazılır. Sonra değişmez; hesaplanan alan değildir.
- **Sıradaki numara:** numara isteyen bir alan bunu da varsayılan değerle alır: `"default": "=next('PRJ-', 4)"`, yani koleksiyonda bu önekle başlayan en büyük numaranın bir fazlası (PRJ-0013). Code'a özel değildir, metin alanında da aynı çalışır. Kişi kutuda değiştirebilir. İki cihaz çevrimdışıyken aynı numarayı verebilir; bu durumda iki kayıt aynı numarayı taşır, kişi birini değiştirir.

### 5.2 Tabloda düzenleme (önce mockup)

"Kalem kalem takip"in asıl engeli giriş hızı. Tablo hesap tablosu gibi çalışır:
- Bir hücreye tıklayınca hücre seçilir. Enter'a basınca, yazmaya başlayınca, seçili hücreye bir daha tıklayınca ya da çift tıklayınca düzenlenir. Seçim açılır listesi, link seçici ve gün formdakiyle aynıdır ve hücrenin altında açılır. Hücreden çıkınca değer yazılır. Esc vazgeçer. Oklar ve Tab seçimi taşır.
- Hesaplanan hücreler salt okunurdur ve soluk görünür.
- Kayıt, satırın başındaki düğmeyle ve name hücresiyle açılır. Düğme üstünde durulan ya da seçili satırda görünür. Bugünkü "satıra tıklayınca kayıt açılır" davranışı böylece değişir.
- Tablonun altında **+ Add row**: varsayılanları dolu boş bir satır açılır, ad kutusu klavyeyi alır. **Add** ve **Cancel** yeni satırın altında, sağda durur. Name boşken Add soluktur. Dosya Add'e basınca tek seferde yazılır. Gruplu tabloda + Add row tablonun en altındadır; eklenen kayıt kendi grubuna geçer.
- Her hücre değişikliği kaydın kendi dosyasını yazar ve kaydederken çalışan kuralları çalıştırır. Farklı alanlar satır bazında birleştiği için iki kişinin aynı kayıtta farklı hücreleri düzenlemesi çakışma çıkarmaz.
- Telefonda tablo yok; liste ve form bugünkü gibi kalır (4.9).

### 5.3 Bağlı kayıt tablosu (önce mockup)

Bağlı kayıt bloğuna üçüncü bir görünüm: `style: "table"`.

```json
{ "block": "linked", "collection": "Budget lines", "style": "table", "fields": ["name", "category", "planned", "actual", "remaining"], "sums": true }
```

- Sütunlar `fields`'tır. Hücreler 5.2'deki gibi düzenlenir.
- Altta **+ Add row** bulunur; başlıkta "+ Add …" düğmesi yoktur. Satırın linkleri bugünkü + Add gibi dolu gelir: kayda ve kaydın kendi linklerine.
- `sums` açıksa sayı sütunlarının altında biçimli toplam görünür. Fields penceresinde blok Timeline, List ya da Table olur; Table'da gösterilen alanlar sütundur, "Sums under it" toplamı açar.
- Satırın başındaki düğme kaydı bu pencerenin üstünde açar (bugünkü gibi).
- Telefonda liste olarak görünür, altında toplam satırı.

## 6. Kurallar

### 6.1 Kural dosyası

Bir koleksiyonun kuralları klasöründe `_rules.js` dosyasında durur; şema (`_collection.json`) alanları, düzeni ve görünümleri tutmaya devam eder.

- Ayrı dosyanın nedeni: çok satırlı kod JSON'un içinde kaçış karakterleriyle okunmaz hale gelir, ajan da onu yazarken yanılır. Ayrı dosyada kod olduğu gibi durur, editörler JS gibi renklendirir, sync'te not gibi satır bazında birleşir.
- Dosya JS olarak çalıştırılmaz; kendi okuyucumuz okur. En üstte yalnız üç çağrı olabilir: `check(…)`, `action(…)` ve `onSave(…)`. Gerisi hatadır.
- Fields penceresinin sekmeleri Design, Rules ve Schema'dır. Rules sekmesi dosyayı gösterir ve düzenletir: CodeMirror'ın JS renklendirmesiyle (editörde zaten olan `language-data`), yanlış satırın altında ne olduğu, Save ile yazılır. Yanlış bir satır varken Save kapalıdır ve altta hangi satır olduğu yazar. Dosya yoksa sekme boş açılır; ilk Save dosyayı yaratır.
- 2. dilimde dosya yalnız `check` alır; `action` 4. dilimde, `onSave` 5. dilimde eklenir.
- Kayıtlar sync'le gelirken dosya da gelir; kural her cihazda aynıdır.

### 6.2 Kural dili

Ne için: iş kuralı yazmak, akışı ilerletmek, hesap yapmak, kayıt eklemek, güncellemek ve silmek. Yalnız aynı space'teki Scrawl verisini görür. Ajan da kişi de aynı dili yazar.

- **Deyimler:** `let`, `const`, atama, `if` / `else`, `for (const x of liste)`, `return` (erken bitirmek için). Arrow fonksiyon yalnız liste işlemlerinin içinde kullanılır: `lines.filter(l => l.actual > l.planned)`. Olmayanlar: `while`, fonksiyon ve sınıf tanımı, `new`, `import`, `try`, `eval`, `window`, `fetch`, `Math` gibi globaller.
- **Okumak:** bu kaydın alanları çıplak adıyla (`status`), bu kaydın kendisi `this` (link vermek için), kaydederken eski değerler `old` (yeni kayıtta `old`'un alanları boştur). Arama: `linked("Transactions")` bu kayda link veren kayıtlar; `find("Transactions", { project: this, direction: "Out" })` bir koleksiyonda arama; `cards("Projects board", { project: this })` bir panonun kartları. Bulunan kayıtların ve kartların alanları noktayla okunur, hesaplananlar da (`r.remaining`). Listelerde `.length`, `.filter`, `.map`, `.some`, `.every`, `.includes`, `sum(liste)` ve `sum(liste, r => r.amount)`.
- **Değiştirmek:**
  - `status = "Active"`: bu kaydın alanı.
  - `add("Budget lines", { name, planned })`: yeni kayıt. Eklediği kaydı döner. Hedef koleksiyonun bu koleksiyona bakan link alanı verilmezse bu kayıtla dolar (bugünkü + Add gibi). Varsayılanlar uygulanır.
  - `update(r, { status: "Paid" })`: başka bir kayıt.
  - `remove(r)`: kayıt çöpe gider.
  - `card("Projects board", { title, column, assignee, due })`: kart. Panonun bu koleksiyona bakan link alanı bu kayıtla dolar.
  - `move(c, "Installation")`: kartı başka bir sütuna taşır; akış böyle ilerler.
  - `subtask("Site survey", { due, assignee })`: bu kayda alt görev.
  - `task("Inbox", { title, due })`: bir görev listesine bu kayda bağlı görev.
- **Yapamadıkları:** dosya ve ek, ağ, başka bir space, ayarlar, kişiler, koleksiyonun şeması ya da kuralları.
- **Çalışma:** kural önce ne yapacağının listesini çıkarır, bu sırada hiçbir şey yazmaz. Kendi yaptığı değişiklikleri görür: eklediği kaydı `find()` bulur. Sonra liste bir kerede yazılır. Kural yarıda bir hatayla durursa hiçbir şey yazılmaz; hata satırıyla söylenir.
- Uygulama: `packages/core/src/lang/run.ts`. `runRule(space, record, body, actor)` değişiklik listesini (`Change[]`) döner, `applyChanges(fs, changes)` bugünkü `addRecord`, `updateRecord`, çöp ve pano işlevleriyle yazar.

### 6.3 Doğrulama

Ne için: bir kaydın kendi içinde tutarlı olup olmadığını söylemek. Örnekler: teslim günü başlangıçtan önce olamaz; gider bir bütçe kalemine bağlı olmalı; kalemin gerçekleşeni planlananı aşmamalı. Hesaplanan değerleri de okur. Yapmadıkları: kaydı reddetmez, hiçbir şey yazmaz.

```js
check("delivery", () => delivery >= start, "Delivery is before the start")
check("actual", () => actual <= planned, "Over budget")
```

- İlk değer işaretin gösterileceği alandır (`null` ise kayıt). İkincisi koşuldur ve bir ifadedir: doğru olmalıdır, yanlışsa kayıt işaretlenir. Boş sonuç (henüz yazılmamış bir alan) sorun sayılmaz.
- Bugünkü doğrulama gibi kayıt reddedilmez, işaretlenir: satır başında nokta, alanın hücresi vurgulu, formda o kutunun altında mesaj (alan yoksa formun üstünde), durum çubuğunda "N to check". `recordProblems` yeni bir `check` türü döner.
- Okuyan her yerde hesaplanır. MCP'de `records` ve `save_record` bu sorunları `problems` içinde verir.

### 6.4 Düğmeler

Ne için: kişinin bir kayıtta tekrar tekrar yaptığı, birkaç adımlık işi tek düğmeye indirmek. Örnekler: "Start project" (standart alt görevler, bütçe kalemleri, durum Active), "Close project" (durum Done, açık kartlar Acceptance'a). Yapmadıkları: kendiliğinden çalışmaz; yalnız bir kişi bastığında ya da ajan çağırdığında çalışır.

```js
action("Close project", { when: () => status == "Active", confirm: true }, () => {
  for (const c of cards("Projects board", { project: this })) move(c, "Acceptance")
  status = "Done"
})
```

- Düzende yeni bir blok: `{ "block": "actions" }` (Fields penceresinde Buttons). Kayıt ekranında düğmeler olarak çizilir; düzende bu blok yoksa düğmeler kayıt ekranının en üstündedir. Tablodaki satırın ··· menüsünde de bulunur: menü üstünde durulan satırın sonunda görünür, içinde Open, düğmeler ve Delete vardır.
- `when` yanlışsa düğme soluk olur; üstünde durunca `hint` yazar, `hint` yoksa koşul yazıldığı gibi görünür. `confirm` varsa önce değişiklik listesinden sayılan bir soru gelir: eklenenler sayıyla ve adlarıyla ("3 budget lines: Material, Labour, Transport"), değişen alan eski ve yeni değeriyle ("Status from Offer to Active").
- Kural yarıda düşerse hiçbir şey yazılmaz; toast kapatılana kadar kalır, satırı ve nedeni söyler.
- Formda kaydedilmemiş bir değişiklik varsa önce kaydedilir, sonra çalışır.
- Bittiğinde toast çıkar: "Start project: 3 budget lines, 2 subtasks" ve **Undo**. Undo, eklenenleri çöpe atar, değişenleri eski değerine döndürür, silinenleri çöpten geri getirir.
- Düğmenin değiştirdiği kayıtlarda kaydederken çalışan kurallar da çalışır (6.5).
- Ajan için `save_record`'a `action` girdisi eklenir. Araç sayısı değişmez.

### 6.5 Kaydederken çalışan kural

Ne için: bir değişiklik olunca, nereden yapılırsa yapılsın, aynı işin yapılması. Örnekler: ödeme Paid olunca ödeme günü yazılsın; proje Active olunca panoya bir "Kickoff" kartı açılsın; bütçe kalemi seçilmeden girilen gider projenin "Other" kalemine bağlansın.

```js
onSave("Kickoff card", () => {
  if (status == "Active" && old.status != "Active") card("Projects board", { title: `${name} kickoff`, column: "Survey" })
})
```

- **Ne zaman:** kişi, düğme ya da ajan bir kaydı yazınca: formda Save, tabloda hücre, + Add row, içe aktarma, düğmenin değiştirdiği kayıtlar, ajanın `save_record`'u. Kaydın yeni değerleri ve `old` ile eski değerleri okunur.
- **Nerede:** kaydı yazan yerde, bir kez: masaüstü, web, telefon ya da MCP (bilgisayarda ve sunucuda).
- **Ne zaman çalışmaz:** sync'le gelen değişiklikte, dosyası elle (ya da ajanın `write`'ıyla) düzenlenen kayıtta.
- **Döngü olmaz:** kuralın kendi yaptığı değişiklikler (bu kayıtta ya da başka kayıtlarda) hiçbir kaydederken kuralını yeniden çalıştırmaz.
- **Sıra:** kural, kaydın yeni değerleriyle kayıt yazılmadan önce çalışır. Bu kayda yaptığı değişiklikler kayıtla birlikte tek seferde yazılır, başka kayıtlara yaptıkları hemen ardından. Formda kuralın yazdığı değer hemen görünür (`paid_on` dolar).
- **Hata:** kural düşerse kayıt yine kişinin yazdığıyla yazılır, kişinin yazdığı kaybolmaz. Kuralın değişiklikleri yazılmaz; toast hatayı söyler, Rules sekmesi son hatayı gösterir.
- **Başka kayıtlar:** kural başka kayıtları da değiştirdiyse toast söyler ("Kickoff card: 1 card added") ve **Undo** sunar.

## 7. Ajan (MCP)

- Araç sayısı 15 kalır.
- `records`: lookup'lar ve hesaplanan yeni alanlar hesaplanmış gelir; doğrulama sorunları `problems`'ta yer alır; alanın `format`'ı `fieldOut`'ta verilir.
- `save_record`: yeni kayıtta varsayılanlar uygulanır; kaydederken çalışan kurallar çalışır ve sonuç neyi değiştirdiklerini söyler; `action: "Start project"` düğmeyi çalıştırır.
- `read` ve `write` `_rules.js`'i de açar. Bugün `_` ile başlayan dosyalardan yalnız `_collection.json` açık (`packages/agent/src/paths.ts`).
- `check.ts` `_rules.js`'i de denetler: okunamayan satır, olmayan alan, türü tutmayan işlem, olmayan koleksiyon ya da pano. Yanlışı satırıyla ve ajanın düzeltebileceği biçimde söyler; bozuk dosya yazılmaz.
- `scrawl://guide`'a dilin kısa başvurusu ve "küçük bir uygulama kurmak" bölümü eklenir: koleksiyonlar, linkler, hesaplananlar, düzen, pano, süreç notu, kurallar; 2. bölümdeki örnek kısaltılmış haliyle.

## 8. Güvenlik ve sınırlar

- Dil kendi okuyucumuz ve yorumlayıcımızla çalışır. `eval` ya da JS motoru yok. Yorumlayıcı yalnız 6.2'deki işlemleri tanır; dosyaya, ağa, globallere, başka bir space'e ulaşamaz. Bu yüzden ayrı bir sandbox gerekmez.
- Sınırlar: bir ifade en çok 2.000 karakter; `_rules.js` en çok 50.000 karakter; bir çalışma en çok 100.000 adım; bir çalışmada en çok 500 değişiklik. Sınıra gelen kural hiçbir şey yazmadan durur ve neden durduğunu söyler.
- Silme çöpe gider. Düğmede ve başka kayıtlara dokunan kaydederken kuralında Undo, her yerde sürüm geçmişi var.
- Kayıt bazında yetki, koşullu alan ve serbest yerleşim bu tasarımda da yok (PLAN 4.6 Yapmayacaklarımız).

## 9. Testler

- **core `lang`:** okuyucu (öncelik, metin ve şablonlu metin, nokta, `? :`, reddedilen söz dizimi ve mesajı), tür denetimi, boş değer, tarih işlemleri, sınırlar; bugünkü formüllerin aynı sonucu vermesi.
- **core `compute.ts`:** lookup ve nokta zinciri, `where`'li rollup, rollup'ın rollup'ı, döngünün bulunması, pano kaynağı, 5.000 kayıtta süre.
- **Doğrulama ve giriş:** `check` sorunu, varsayılanların sırası (önce link, sonra linkin hedefini okuyan varsayılan), `next()`, biçim (TR ve US), para birimine göre ayrılan toplam ve karışık para birimi uyarısı.
- **Kurallar:** her işlem (`add`, `update`, `remove`, `card`, `move`, `subtask`, `task`), kuralın kendi eklediğini görmesi, hatada hiçbir şeyin yazılmaması, sınırlar, Undo; `onSave`'in bir kez çalışması, `old`, sync'le gelen değişiklikte çalışmaması, döngü olmaması, düşen kuralda kaydın yine yazılması.
- **agent:** `records`'ta lookup ve doğrulama sorunu, `save_record`'da varsayılan, `onSave` ve `action`, `_rules.js`'in okunup yazılması ve `check.ts`'nin denetimi.
- **Tarayıcıda:** tabloda düzenleme, + Add row, bağlı kayıt tablosu ve toplamı, Rules sekmesi, düğme ve Undo, tablodan Paid yapınca ödeme gününün yazılması, 2. bölümdeki örneğin baştan kurulması.

## 10. Dilimler

Arayüzü olan her dilim önce `design/mockups.html`'de mockup'la başlar ve onaydan sonra yazılır.

1. **Dil ve hesap:** dilin okuyucusu ve ifade seviyesi, tür denetimi, `compute.ts`, formülün yeni dili, nokta, lookup, rollup'ta `where`, `avg` ve zincir, koşulda `today`; Fields penceresinde lookup ve rollup koşulları; MCP ve `check.ts`.
2. **Doğrulama ve giriş:** `_rules.js` ve `check`, Rules sekmesi; varsayılan değer ve `next()`; sayı biçimi ve para birimine göre toplam (Excel'e aktarma dahil).
3. **Hızlı giriş:** tabloda düzenleme, + Add row, bağlı kayıt tablosu ve toplamları.
4. **Düğmeler:** dilin kural seviyesi (deyimler, okuma ve değiştirme işlemleri, değişiklik listesi), `action`, actions bloğu, onay sorusu, Undo, `save_record`'da `action`.
5. **Kaydederken kural:** `onSave`, `old`, kaydetme yollarına bağlanması (form, tablo, içe aktarma, düğme, `save_record`), toast ve Undo.

## 11. PLAN'da değişecekler (onaydan sonra)

- **1. Amaç ve 3:** kitle cümlesi: ana kitle teknoloji sektörü, başka sektör engellenmez; "ajan bir şirkete küçük uygulamalar kurar" hedefi.
- **4.6:** Code'un tanımındaki "hep elle yazılır, hiçbir zaman kendiliğinden dolmaz" çıkar; Formül, lookup ve doğrulama paragrafı yeni dille; "Otomasyon yok" cümlesinin yerine kural dili, düğmeler ve kaydederken çalışan kural gelir, sunucudaki otomasyonun Sonraya kalanlar'da olduğu söylenir; Şablonlar'da "hep bizden" çıkar; Biçim'e `_rules.js`; Düzen'e tablo görünümlü bağlı blok ve actions bloğu; Görünümler'e tabloda düzenleme; Yapmayacaklarımız'dan "otomasyon ve kural motoru" çıkar.
- **Sonraya kalanlar:** otomasyon maddesi şöyle olur: sunucuda; kimse yokken ve değişiklik nereden gelirse gelsin yapılan iş ve bildirim birlikte. Klasöre göre yetki maddesine, bir space'in bölümlerinin (finans gibi) bununla ayrıldığı eklenir; space'ler arası link yoktur.
- **6. Aşamalar:** 13. aşamanın (Dropbox, S3, GitHub) önüne yeni bir aşama olarak girer; sonrakiler birer kayar.
- **7. Riskler:** "Koleksiyonun Airtable'a dönüşmesi" maddesinin sınırı: düzen kolon, section ve element sınırında; formül saf; kural dili yalnız space'in kayıtlarını, kartlarını ve görevlerini görür; yazan iş yalnız düğmede ve kaydederken, yazan yerde bir kez.
- Roadmap panosu da aynı değişikliklerle güncellenir.
