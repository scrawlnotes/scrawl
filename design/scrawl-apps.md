# Scrawl apps: hazır şablonlardan app kurmak (taslak)

Durum: 21 Ekim 2026'da onaylandı, PLAN.md'ye 14. aşama olarak işlendi. 1. dilim kodda (mockup 58c5b3d, kod 0508919). 2. dilim kodda (1c0a5f3), notlarda dosya linki kodda (7c8aac4). 3. dilim kodda (mockup 5818907, kod 0c60dce). 4. dilim kodda (mockup 96ffbd4, kod c87652d). 5. dilim (üç yeni şablon) kodda.

## 1. Amaç

13. aşamayla koleksiyonlar küçük uygulamaların altyapısı oldu: bağlı koleksiyonlar, hesaplananlar, düzen, kurallar, düğmeler, kaydederken çalışan kurallar, panolar. Bunları baştan kurmak bugün ya kişinin ya da ajanın işi. Scrawl apps kişiye çalışan bir başlangıç verir:

- Kişi space'teki **+** menüsünde **New app**'i seçer.
- Hazır şablonlardan istediklerini işaretler: CRM, Satış ve faturalama, Proje yönetimi…
- Her şablonun birkaç sorusunu cevaplar, app'e bir ad verir, **Create**'e basar.
- App'in adıyla bir klasör açılır; içinde birbirine bağlı koleksiyonlar, panolar, notlar ve kurallar kurulur.
- Kişi bundan sonra değiştirmek istediğini ajana söyler.

Asıl değer **zincirde**: birlikte seçilen şablonlar ortak parçalarını bir kez kurar ve birbirine bağlanır. CRM ile Satış aynı Companies'i kullanır, Satış ile Stok aynı Products'ı; para hep tek koleksiyonda, Payments'ta durur. Sonradan eklenen bir şablon da kurulu app'in parçalarını bulup onlara bağlanır.

Ölçü 13. aşamadakiyle aynı: bu bir ERP değil. Her şablon küçük bir ekibin işinin çoğunu görür, fazlasını değil. Fatura kesmek, bordro, muhasebe kayıtları kapsam dışında.

Verilen kararlar (21 Ekim 2026):
- İlk sürümde on şablon var: CRM, Satış ve faturalama, Müşteri desteği, Proje yönetimi, Bütçe ve harcama, Stok ve satın alma, Ürün geliştirme (3.1–3.7) ve 5. dilimde eklenen İşe alım, Demirbaş ve bakım, İçerik takvimi (3.8–3.10). Randevu ve rezervasyon ile E-ticaret ileride yapılacaklar planında (10. bölüm).
- Bazı sorular şablon başına değil, app başına bir kez sorulur: app adı ve para birimleri (2.2).
- Kurulu bir app'e şablon eklemek ilk sürümde var. Ortak parça şemasındaki şablon işaretinden bulunur; yalnız eklenir, hiçbir şey silinmez ya da değişmez; kurmadan önce özet gelir. App'ten şablon çıkarmak yok (4.2).
- Kural dili yeni bir yetenek alır: **soru soran düğme** (`ask`). Stok düzeltme, kısmi tahsilat, masrafı reddetme nedeni ve depolar arası transfer bununla yapılır (5. bölüm).
- Satış fatura kesmez; fatura numarasını ve tahsilatı izler. Vergi üründen gelir: oranı ve fiyata dahil mi olduğu. İndirim yalnız kalemde girilir. Sipariş geneline indirim ve kalem başına ikinci vergi yok; ihtiyacı olan ajana ekletir (3.2).
- Stok hep hareketlerden hesaplanır. Düzeltme **Correct stock** düğmesiyle yapılır ve bir düzeltme hareketi olarak kaydedilir (3.6).
- Birden çok depo ilk sürümde var; lot ve seri numarası ileride (3.6, 10. bölüm).
- Bütçe ayrı bir şablondur; Proje şablonu "projelerin bütçesini tutacak mısınız?" sorusuyla Bütçe'nin parçalarını kendisi kurdurur (3.4, 3.5).
- Satıştan gelen para Bütçe'ye bağlanır: fatura kesilince beklenen tahsilat açılır, gelir de bütçelenir (3.5).
- Çalışanların masrafları Bütçe'de, fişiyle ve onayıyla izlenir; maaş bordrosu kapsam dışında (3.5).
- Her app'in klasörünün en üstünde bir **tanıtım notu** olur ("About Atlas"): kurulan şablonlardan ve cevaplardan üretilir, yalnız kurulanı anlatır. Şablonların ayrı "How we…" süreç notları bunun içinde, her şablonun bölümünde "How we work" olarak durur (2.4).

21 Ekim 2026'da, 1. dilimin mockup'ıyla verilen kararlar:
- Soru soran düğme `confirm` yazılmasa da pencere açar. Yapacakları soruların altında "This will" başlığıyla listelenir ve yazdıkça yeniden hesaplanır (5).
- Pencerenin başlığı düğmenin adıdır, onay düğmesi de o adı taşır. Başlığın altında kaydın o anki durumu tek cümleyle yazar: kuralın `say`'i, yoksa kaydın adı (5).
- Varsayılan değer kutuda seçili gelir; yazmaya başlayınca yerine geçer. Kutunun altında kısa bir bilgi satırı olabilir: sorunun `note`'u ("Now 10", "Left to collect: ₺96.800") (5).
- Zorunlu soru boşken onay soluk kalır, kutunun altında neyin gerektiği yazar (5).
- Kayıt sorusu formdaki link seçicinin aynısını açar (5).
- Kural dili liste indeksini tanır: `find("Locations")[0]`; olmayan sıra boş verir (5).
- Telefonda sayı sorusu sayı klavyesini açar (5).

21 Ekim 2026'da, 2. dilimin kodu yazılırken verilen kararlar:
- Teknik:
  - Parçanın işareti `template` alanı genişletilerek değil, şemada ve pano dosyasında yeni bir `role` alanıyla tutulur. `template` bugün Create penceresine ve eksik bağlı koleksiyonu açmaya bağlı; ayrı alan onlara dokunmaz (4.1).
  - Kurulum tek geçişte yazılır. Plan yazılmadan önce bellekte bütünüyle denetlenir; iki geçiş ajanın yazma denetimi için gerekiyordu (6.1).
  - Sync birleştirmesinde pano alanları kayboluyordu; düzeltildi. Ajanda düğmeden sonra dönen kayıt panoların eski halini okuyordu; düzeltildi.
- Şablon davranışı:
  - Ödemelerde durum (Planned, Invoiced, Paid) hep var. "Ödemeleri vadesiyle izliyor musunuz?" yalnız vadeyi ve gecikmeyi kurar; tahsilat, masraf onayı ve mal kabulü durumla çalışır (3.5).
  - Birden çok para biriminde para birimini sipariş, satın alma siparişi, ödeme, masraf ve fırsat tutar; kalemlerde tutar düz sayıdır. Ürünün fiyatı ve maliyeti, bütçe kalemi ve projenin sözleşmesi ana para birimindedir; bütçenin ve projenin toplamları yalnız ana para birimindeki ödemeleri sayar (2.2).
  - Vergi ve indirim tam sayı yüzde olarak yazılır: "Tax %" 20, "Discount %" 10 (3.2).
  - Sipariş ve satın alma kaleminin adı "Item"dır, boşsa ürünün adı yazılır. Zaman kaydının adı "Note"tur (3.2, 3.4, 3.6).
  - Locations'ta "Default" kutusu vardır, ilk depo işaretli gelir. Deposu boş bir hareket, sipariş ya da satın alma siparişi varsayılan depoya yazılır (3.6).
  - Proje bütçesi evetse ve Bütçe seçilmediyse Bütçe'nin parçaları kendi varsayılanlarıyla kurulur ve tanıtım notunda Bütçe'nin bölümü de olur; `_app.json` yalnız Proje'yi tutar. Bütçe seçiliyse projenin bütçe sorusu sorulmaz (3.4).
  - Start project kartları projenin adıyla açılır: "Antalya Hotel: Kickoff" (3.4).
  - Ürünün türü (product, service) yalnız Satış'ta "ikisi" seçildiyse kurulur; hizmet kalemleri stoktan düşmez (3.2, 3.6).
- Tasarımda yazmayan varsayılanlar: talep kanalları e-posta, telefon, chat; hazır cevaplar evet, üç örnek cevapla; indirim evet; teklif evet; projeler ikisi için; proje bütçesi hayır; standart bütçe kalemleri Material %40, Labour %40, Transport %10; masraf kategorileri Travel, Meals, Supplies, Equipment, Other; depolar Main warehouse, Second warehouse.
- Kurulu app'e eklemek (4.2):
  - Aynı anahtarlı alan başka türdeyse ve eklenecek bir formül ya da kural onu okuyorsa hiçbir şey eklenmez, nedeni söylenir. Okuyan yoksa özette söylenir.
  - Kişinin sildiği bir parça eklemede geri kurulmaz.
  - Undo yeni klasörleri, panoları ve notları çöpe atar, değişen dosyaları eski haline getirir; koleksiyona eklenen kural dosyasını ve başlangıç kayıtlarını kaldırır.
  - Ajanın `create`'i: `folder` bir app ise ona ekler, değilse içinde yeni app kurar; aynı ad ve aynı şablonlarla yeniden çağrılınca `exists: true` döner.
- Tanıtım notu parçaları kendi dosyalarına link verir; bunun için notlarda dosyaya link geldi (2.5, 21 Ekim'de onaylandı).

21 Ekim 2026'da, 3. dilimin mockup'ıyla verilen kararlar (design/mockups.html, 14. aşama · 3. dilim):
- Create penceresinde App, Collection'ın altında 6. sırada; Filter 7'ye kayar. Başlangıç sayfasının "Start from a template" bölümünde bir App satırı pencereyi şablonlar adımında açar (2.1).
- Pencerenin üstünde Create'teki gibi adımlar: Templates, App, seçilen her şablon, Summary. Altta solda o adımın özeti, sağda Back (ilk adımda Cancel) ve Next; son adımda Create.
- Şablonlar Customers, Money ve Work gruplarında birer kart: adı, ne işe yaradığı, kuracağı parçalar ikonlarıyla; seçilen kart turuncu çerçeveli ve tikli; ortak parça kartın altında yazar ("Uses Companies with CRM").
- App adımında ad, yer (space'in en üstü ya da içinde bir klasör) ve para birimleri; para birimleri sıralı çipler, ilki "main", "Add a currency…" ile eklenir (2.2).
- Sorular: evet/hayır ve kısa seçim segmentli düğme, uzun seçenekli seçim radyo listesi, liste sürüklenen satırlar (× ile silinir, "Add a stage" gibi eklenir; aşamada waiting, done, dropped, ilk depoda default ipucu). Bir cevaba bağlı soru onun altında içeride durur; başka bir şablona bağlı soru "Asked because Sales and invoicing is set up too" der. Sayfanın başında "Every answer is ready; change only what is different for you." (2.3).
- Özet: üstte klasör ve yeri, yanında tanıtım notu; her şablon bir sütun: parçaları, düğmeleri, kendiliğinden olanlar; altta sayılar ve Create (2.1).
- Kurulunca klasör kenar çubuğunda açılır, tanıtım notu yeni sekmede; toast "Spare parts set up: 12 collections, 1 board, 1 note" ve Undo.
- Telefonda tam boy sheet: üst çubukta geri ve Next, altında ilerleme çizgisi, aynı sayfalar; özetin altında büyük Create.
- Satış'ın kart metni kısaldı: "Products, quotes, orders and the money coming in; invoices are made elsewhere."

21 Ekim 2026'da, 3. dilimin kodu yazılırken verilen kararlar:
- Para birimi önce cihazın bölgesinden gelir: Türkiye'de TRY, euro bölgesinde EUR, bilinmeyen yerde USD. Kod yazılıp Enter ya da + ile eklenir, yazarken sık kullanılanlar önerilir; çipler sürüklenerek sıralanır, ilki ana para birimidir.
- Ad ve yerle ilgili uyarı ad kutusunun altında çıkar; ad App sayfasından çıkarken denetlenir.
- En çok üç kısa seçenekli soru segmentli düğme, diğeri radyo listesi; çoklu seçim (talep kanalları) aç/kapa düğmeler. Listenin satırları yerinde yazılır, Enter yeni satır açar.
- Kartta yalnız şablonun kendi parçaları listelenir; ortak parça "Uses…" satırında söylenir.
- Pencerenin yüksekliği sayfasına göre; Esc ve Back bir adım geri, ilk adımda Cancel. Üstteki adım adları tıklanmaz.
- Telefonda geri düğmesi şablonun kısa adını söyler ("‹ Stock").
- Depolar sorusunun etiketi "Your warehouses", açıklaması altında; Bütçe kartının metni mockup'taki gibi.

22 Ekim 2026'da, 4. dilimin mockup'ıyla verilen kararlar (design/mockups.html, 14. aşama · 4. dilim):
- App klasörünün ··· menüsünde en üstte Add to app…, yalnız `_app.json` olan klasörde. Space'in ve klasörün + menüsünde New app here (2.1'deki + menüsü; 3. dilimde eksik kalmıştı).
- Pencerenin başlığı "Add to Spare parts"; adımları Templates, yeni şablonların soruları, Summary. Kurulu şablonlar soluk, "In the app" yazar, seçilmez; yeni şablonun kartı "Uses Products and Companies, in the app" der; başka şablona bağlı soru "Asked because Sales and invoicing is in the app" der (4.2).
- Özet iki sütun: Set up (kurulacak parçalar, düğmeler, kendiliğinden olanlar) ve Added to what is there (her parçaya ne eklendiği: "8 fields, 2 blocks on its screen, 3 rules"; tanıtım notuna "a section at its end"), altında "Nothing is changed or taken away". Olduğu gibi bırakılan alan bilgi kutusunda söylenir. Düğmenin adı Add.
- Eklenecek bir kural ya da formül var olan bir alanla çalışmayacaksa Add soluk kalır; kırmızı kutuda sade dille ne değişmesi gerektiği yazar ("Products has a Cost field that holds text; … Change Cost's type to Number in Products' Fields, then add the template again").
- Eklenince yeni parçalar kenar çubuğunda belirir; toast "Stock and purchasing added to Spare parts: 5 collections set up, 5 added to" ve Undo.
- Telefonda ··· bir action sheet, Add to app en üstte; pencere sheet.

22 Ekim 2026'da, 5. dilim için verilen kararlar:
- Yayından önce üç şablon daha: İşe alım, Demirbaş ve bakım, İçerik takvimi (3.8–3.10). Yeni ekran olmadığı için mockup yok; kartlar ve sorular var olan pencerede.
- Şablon penceresindeki gruplar: İçerik takvimi Customers'ta, Demirbaş ve bakım Money'de, İşe alım Work'te.
- Demirbaşın yerleri Stok'un depolarıyla aynı Locations listesidir.
- Randevu ve rezervasyon ile E-ticaret sonraya (10. bölüm).

22 Ekim 2026'da, 5. dilimin kodu yazılırken verilen kararlar:
- Kural dilinde bir düğmenin sorusu kişi de olabilir: `type: "person"`, kutusu formdaki kişi alanıyla aynı; Assign kişiyi böyle sorar. Ajan kişiyi adıyla verir; rehber söyler (5. bölüm).
- Aşama listesinde Hired ve Published bitti, Rejected bırakıldı sayılır (CRM'in aşama kuralı). Aşama listesi boş bırakılırsa pano varsayılan aşamalarla kurulur.
- İşe alım: kaynakta Agency dışındakiler seçili gelir, hiçbiri seçilmezse kaynak alanı kurulmaz. Kartın başlığı adayın adıdır, pozisyon kartta alan. İşe alınan sayısı adayın Hired for alanından sayılır (toplama pano sütununa bakamaz). Düğmeler Add to position, Schedule interview, Hire sırasıyla.
- Demirbaş: yeni demirbaş kişilere veriliyorsa In storage, verilmiyorsa In use başlar. Sonraki bakım planlı bakımların en yakın tarihidir; aralıklar 30, 91, 182 ve 365 gün. Log maintenance'ın türü düzenli bakımda Planned, değilse Repair ile gelir; notsuz kaydın adı "Service of MacBook Pro", "Repair of …". Locations'ın tanımı "your warehouses, offices and other places" oldu.
- İçerik takvimi: kampanyanın Published sayısı bütün içerikten yayınlanmamışlar çıkarılarak bulunur; kampanyanın başlangıcı bugünle gelir.
- İkonlar: İşe alım ataç, Demirbaş laptop, İçerik takvimi takvim.
- Bütün birleşim testleri uzadı (core 6138 plan, ajanda 2046 kurulum); süre sınırları buna göre.

22 Ekim 2026'da, 4. dilimin kodu yazılırken verilen kararlar:
- Kenar çubuğu bir klasörün app olduğunu içinde `_app.json` olmasından anlar; menü açılırken dosya okunmaz.
- Eklenecek olan var olan bir alanla çalışmayacaksa core hata vermez, ne değişmesi gerektiğini planda söyler; özet onu kırmızı kutuda gösterir. Böyle bir plan kurulmaz; ajan için davranış aynıdır.
- Özetin üstünde app'in yeri ve içindeki şablonlar yazar: "Spare parts in Atlas · CRM, Sales and invoicing, and Stock and purchasing".
- Kayıt sayısı tekil ve çoğul yazılır ("1 record"); New app'in özetinde de.
- Uyarıların kırmızısı tanımsız bir renge bağlıydı; 3. dilimin "ad alınmış" uyarısı da düzeldi.
- New app here her klasörün + menüsünde, app klasörünün kendisinde de.

## 2. Sihirbaz

### 2.1 Akış

**New app** sihirbazı ortada bir pencere; telefonda sayfalar arasında ilerleyen bir sheet. Adımlar:

1. **Şablonlar:** gruplara ayrılmış kartlar; her kartta şablonun adı, ne işe yaradığı ve neler kuracağı. Birden fazlası seçilir. Seçilen şablonların ortak parçası varsa kartın altında yazar ("Uses Companies with CRM").
2. **App:** ad ve para birimleri (2.2).
3. **Her şablonun soruları:** seçilen her şablon için bir sayfa, en çok dört soru. Her sorunun varsayılanı hazır gelir; kişi hiçbirine dokunmadan da ilerleyebilir.
4. **Özet:** klasörün adı ve içinde kurulacaklar, şablon şablon: koleksiyonlar, panolar, notlar, kurallar ve düğmeler, aradaki bağlar. **Create**.

Kurulunca app klasörü açılır ve tanıtım notu (2.4) ekranda olur. Toast'ta "Atlas created: 9 collections, 2 boards" ve **Undo** vardır; Undo klasörü çöpe atar.

### 2.2 App başına bir kez sorulanlar

- **App adı:** zorunlu. Klasörün adı olur. Aynı adlı bir klasör varsa sihirbaz söyler ve başka ad ister.
- **Para birimleri:** yalnız para tutan bir şablon seçildiyse sorulur (Satış, Bütçe, Stok, CRM'in fırsatları, Proje'nin bütçesi). Çoklu seçim; ilk seçilen varsayılan olur. Tek para birimi seçilirse para alanları onunla biçimlenir. Birden fazlası seçilirse para tutan kayıtlar kendi para birimini taşır ve toplamlar para birimine göre ayrı satırlarda görünür (13. aşama 4.6).

### 2.3 Soru türleri

| Tür | Görünüş | Örnek |
|---|---|---|
| choice | tek seçim | "Müşterileriniz kim?" |
| yesno | evet / hayır | "Zaman takibi yapacak mısınız?" |
| multi | çoklu seçim | "Talepler nereden geliyor?" |
| list | değiştirilebilir bir liste, varsayılanlarla dolu | fırsat aşamaları, gider kategorileri, depolar |
| text | tek satır | app adı |
| currencies | para birimi listesi, sıralı | para birimleri |

Bir soru başka bir şablonun seçilmesine ya da başka bir cevaba bağlı olabilir. "Satışta stok otomatik düşsün mü?" yalnız Satış ile Stok birlikteyse sorulur. "Fiyatlarınız genelde vergi dahil mi?" yalnız "Fiyatlara vergi ekleniyor mu?" evet ise sorulur.

### 2.4 Tanıtım notu

App klasörünün en üstünde, app'in adıyla bir not: "About Atlas". Kişinin ve ajanın app'i okuduğu tek yer. Kurulan şablonlardan ve verilen cevaplardan üretilir; bu yüzden yalnız gerçekten kurulanı anlatır. Stok düşümü "teslim edilince" seçildiyse "Stock drops when an order is delivered" yazar; "hayır" seçildiyse o satır hiç olmaz.

Önce app'in bir iki cümlelik tanımı ve şablonların birbirine nasıl bağlandığı, sonra her şablon için bir bölüm:
- **What it's for:** bir iki cümle.
- **What's in it:** koleksiyonlar ve panolar, her biri neyi tutar, neye bağlı; her biri kendi dosyasına link.
- **How to use it:** kısa adımlar ("Add a project, press Start project, log time on its screen").
- **What happens by itself:** kurallar ve düğmeler sade dille ("When a payment is marked Paid, its day is written").
- **How we work:** ekibin kendi kuralları; şablonun varsayılanıyla dolu gelir (aşamaların anlamı, kim neyi onaylar…), ekip değiştirir. 3. bölümde her şablonun "How we…" satırı bu bölümün içeriğidir.

En sonda **Changing it with your agent:** örnek isteklerle ("Add a field…", "Change the deal stages…").

Not İngilizce kurulur, uygulamanın dili gibi. Add to app'te yeni şablonun bölümü notun sonuna eklenir; kişinin notta değiştirdiği hiçbir şeye dokunulmaz (4.2).

### 2.5 Notlarda dosyaya link

Tanıtım notunun parçalara link verebilmesi için her notta geçerli (21 Ekim 2026'da onaylandı):

- **Yazım:** standart Markdown linki, notun klasörüne göre göreli yol; boşluk %20: `[Companies](Companies)`, `[Deals](Deals.board.json)`, `[Order lines](Order%20lines)`, `[Plan](../Plans/Roadmap.md)`. GitHub ve Obsidian gibi yerlerde de böyle okunur. Ekli dosyalar bugünkü gibi space'in en üstünden: `_attachments/…`. Bir kaydın ya da kartın notundaki link kaydın koleksiyonundan, kartın panosunun klasöründen okunur.
- **Açılış:** web linkleriyle aynı. Masaüstünde ve web'de Ctrl+tık (Mac'te ⌘) linki uygulamada açar: not, görev listesi, pano ve koleksiyon kendi sekmesinde, klasör kenar çubuğunda, ekli dosya Files'taki gibi. Telefonda dokununca çıkan menüde Open. Olmayan bir hedefte toast "It is not here any more." der.
- **Taşıma ve yeniden adlandırma:** bir not, görev listesi, pano, koleksiyon ya da klasör taşınınca ya da adı değişince ona giden linkler space'in bütün notlarında (kayıtların notları da) güncellenir; taşınan notun ve koleksiyonun kendi linkleri yeni yerinden yazılır. Ekrandaki not değişikliği bir düzenleme olarak alır. Uygulamada ve ajanın `move`'unda aynı kod çalışır (core `links.ts`); ajanın sonucu hangi notların değiştiğini söyler. Başka space'e taşımada linkler güncellenmez; space'ler arası link yoktur.
- **Ekleme:** link kutusuna (masaüstünde biçim çubuğunda Link, telefonda link sheet'i) bir ad yazınca altında space'teki eşleşen notlar, görev listeleri, panolar, koleksiyonlar ve klasörler listelenir; her satırda ne olduğu ve hangi klasörde olduğu yazar. Ok tuşları ve Enter ya da dokunarak seçilir; doğru göreli yol yazılır, seçili metin yoksa linkin metni seçilenin adı olur. `http`, `mailto` ya da `www.` ile başlayan bir adreste liste çıkmaz. Elle yazılan adresteki boşluk %20 olarak yazılır. Mockup'sız yapıldı (21 Ekim'de kararlaştırıldı).

## 3. Şablonlar

Her şablonun parçaları, ekranları, kuralları, zinciri ve soruları. Alan adları uygulamanın dilinde, İngilizce kurulur; burada Türkçe anlatılıyor. Tablolardaki "How we…" satırı ayrı bir not değil, şablonun tanıtım notundaki "How we work" bölümüdür (2.4).

Ortak parçalar:

| Ortak parça | Kullanan şablonlar |
|---|---|
| Companies | CRM, Satış, Destek, Stok (tedarikçiler) |
| People | CRM, Destek |
| Products | Satış, Stok |
| Payments | Satış, Bütçe, Stok (tedarikçi borcu) |
| Projects | Proje yönetimi, Bütçe |
| Feedback | Destek, Ürün geliştirme |
| Locations | Stok (birden çok depo), Demirbaş (birden çok yer) |

Ortak olmasa da başka şablonun parçasına bağlananlar: Demirbaşın tedarikçisi Companies'e (CRM, Satış, Destek ya da Stok kurduysa), bakım gideri Payments'a (Bütçe); içerik kartı Releases'e (Ürün geliştirme), kampanya Budget lines'a (Bütçe).

### 3.1 CRM

29 Ekim, Pipedrive, HubSpot ve Attio'nun ekranlarına bakılarak baştan. Mockup: `design/mockups.html` › CRM: Pipedrive'ın fırsatları, HubSpot'un şirket ve kişisi.

- **Ortak parçaların ilkesi:** şirketin ve kişinin penceresi HubSpot gibi üç sütun: solda bilgileri, ortada Log ve Plan, planlananlar ve geçmiş gün gün, sağda bağlı kayıtlar. Başka şablonlar (Sales, Support, Projects, Contracts, Stock, Assets…) şirkete ve kişiye yalnız sağ sütuna kart ekler.
- **Şirket:** başlıkta "Customer · İstanbul · 3 people · last contact 3 days ago"; Name, Website, Phone, Email, City, Industry (hazır sektörler), Size (1–10 … 1000+), Type (Customer, Supplier, Partner; Customer kazanılan fırsatla kendiliğinden), Owner (ben). Segment, Status, Tags kalktı.
- **Kişi:** başlıkta "Project Manager · Acme Lojistik · last contact 3 days ago"; Name, Company (önerilir), Job title, Email, Phone; Call ve Email. Status, Source, Tags kalktı.
- **Log:** şirketin, kişinin ve fırsatın penceresinde tek pencere: tür (Call, Meeting, Email, Note), ne zaman, kiminle, ne konuşuldu ve isteğe bağlı sıradaki adım (tür, ne, ne zaman); geçmişe bir, sıradaki adım varsa planlanana bir aktivite yazar (Pipedrive'ın "işi bitir, sıradakini planla"sı).
- **Activities:** Pipedrive'ınki gibi: Overdue, Today, Planned, satırında tik halkası; To do ve Done. Planlanan aktivite gününde Today'de **Done** ile (saatlisi Upcoming'de de); Done Log penceresini açar. Geciken Overdue'da kalır.
- **Deals (pano):** Pipedrive gibi sütun başında tutar ve sayı; kartta şirket ve kişi, değer, sıradaki adım: planlı yeşil, geciken kırmızı, adımı olmayan sarı üçgen "No next step". Fırsatın penceresinde aşama çubuğu, Log, Won ve Lost; Lost nedenini sorar (Price, Timing, Competitor, No budget, No response, Not a fit). Alanlar: Company, Contact, Value, Expected close, Source (Referral, Website, Event, Outbound, Partner), Owner. Sıradaki adımlar fırsata bağlı planlı aktiviteler (Today'e gelir), geçmiş yapılmış aktiviteleri.
- **Home:** bugünün aktiviteleri, aşama aşama Pipeline, bu ay kapanacaklar, "Gone quiet" (30 gündür teması olmayan müşteriler).
- **Menü:** Home, Deals, Companies, People, Activities.
- **Altyapı:**
  - Bağlantı alanı bir panonun kartlarını da gösterebilir (aktivitenin Deal'i): seçicide kartlar adıyla, ajan kartı başlığı ya da anahtarıyla bağlar, tıklayınca kart açılır.
  - Panoda `next` (kartın sıradaki adımı, ona bağlı açık aktivitelerin en erkeni; yoksa sarı üçgen, pano başında "2 with no next step"), `dropAsks` (Lost nedenini sorar), `blocks` (kart penceresinde bağlı kayıt blokları: Next steps, History), `press` (kart penceresinde şirketin Log ve Plan düğmeleri, fırsat seçili açılır), `wins` (Won şirketin Type'ına Customer yazar; uygulamada da ajanda da).
  - Fırsat penceresinde aşama çubuğu, Log, Plan, Won, Lost; Expected close ve Owner adlarıyla.
  - Kartta şirket ve kişi tek satırda; anahtar ve öncelik noktası yok.
  - Rollup'ta `won`; bağlı blokta `where`, `time` (iki satırlı planlı adım: ad · fırsat, altında gün · tür · kişi) ve `tab` (telefonda Activity ve Related sekmeleri, alanlar About'ta).
  - Kart bloğunda `board`: şirketin Deals'i, satırda aşama ve kapanış günü, + Add o şirkete bağlı fırsat açar.
  - Düğme sorusunda `chips`, `lines`, `section`, `within` (şirketin kişileri ve fırsatları); tarih sorusunda `chips` ile Tomorrow, Fri, Next week; verilen cevaplarla açılış (fırsattan Log); `done` yazan düğmede "This will" satırı yok.
  - Görünümde `ring`: düğmesi satır başında halka (Activities'te Done).
  - Telefon ve e-posta dolu kayıtta masaüstünde de Call ve Email düğmeleri; şirkete Email alanı.
  - Boş sütun pencereden düşer; başka şablonların şirket ve kişi kartları 3. sütunda.
- **Mockup'tan kalan farklar:** fırsat penceresinde kartın genel alanları (Priority, Labels) ve yorum zaman çizelgesi duruyor, aşama değişiklikleri History'de değil zaman çizelgesinde; Log'da tür çiplerinde simge yok, When ve With alt alta; telefonda Deals listesi standart telefon panosu.

22 Ekim'deki ilk hâli:

| Parça | Tür | İçinde | Hesaplanan |
|---|---|---|---|
| Companies | koleksiyon | ad, web sitesi, segment, tür (customer, supplier, partner), sorumlu, durum (prospect, active, churned), etiketler | son görüşme; açık fırsatların toplam değeri |
| People | koleksiyon | ad, şirket, e-posta, telefon, unvan, kaynak, durum | son görüşme |
| Activities | koleksiyon | başlık, tür (note, call, meeting, email), tarih (bugün), şirket, kişi, yapan (ben) | — |
| Deals | pano | Lead, Contacted, Meeting, Proposal, Won, Lost; kartta şirket, kişi, değer (para birimiyle), sonraki adım | — |
| How we sell | tanıtım notunda | aşamaların anlamı, bir fırsat ne zaman ilerler | — |

- **Ekranlar:** şirketin ekranında solda alanlar, sağda kişileri, görüşmeleri (zaman çizelgesi) ve fırsat kartları; kişinin ekranında görüşmeleri ve kartları.
- **Kurallar:** Companies ve People'da **Log a call** ve **Log a meeting** düğmeleri; kayda bağlı, tarihi bugün, yapanı ben olan bir görüşme açar. Activities'te kontrol: görüşme bir şirkete ya da kişiye bağlı olmalı.
- **Sorular:**
  1. **Müşterileriniz kim?** Şirketler ve oradaki kişiler (varsayılan) ya da yalnız kişiler. Yalnız kişilerse Companies kurulmaz; fırsatlar ve görüşmeler kişiye bağlanır.
  2. **Satış fırsatlarını takip edecek misiniz?** Evet (varsayılan): Deals kurulur ve aşamalar bir listeyle sorulur.

### 3.2 Satış ve faturalama

29 Ekim, Zoho Invoice, QuickBooks Online, Pipedrive, Odoo Sales ve Invoice Ninja'nın ekranlarına bakılarak baştan; Stok (3.6) ve E-ticaretle (`design/calendar.md` 7) birlikte, üçü CRM'le tek app'te. Mockup: `design/mockups.html` › Satış, stok ve e-ticaret. Roadmap ROA-338, deneme ROA-339.

- **Orders listesi:** üstte bir cümle (QuickBooks'un şeridi): "₺85.110 to collect · ₺19.150 overdue · ₺31.000 in quotes". Sekmeler Quotes, Open, To invoice, Unpaid, Paid. Sütunlar No, Customer, Date, Total, Left, Status; Status çipinin yanında "Overdue 12 days", "Due today", "Due Nov 20", "To invoice" (Invoice Ninja'nın sütunları).
- **Yeni teklif ya da sipariş:** müşteri, kalemler, toplamlar; numara ve tarih kendiliğinden, teklifte Valid until 30 gün sonrası (Odoo, Invoice Ninja). Kalem ürün seçilince fiyat ve vergiyle; stok yetmeyen kalemin altında "Not enough stock: 4 available".
- **Siparişin penceresi:** başlıkta "Invoiced · ₺39.150 · ₺19.150 left · 12 days overdue", altında aşama çubuğu (Quote, Confirmed, Delivered, Invoiced, Paid). Düğmeler duruma göre:
  - **Accept** (teklifi Confirmed yapar, fırsatı Won) ve **Declined** (fırsatı Lost, nedeni sorulur); Zoho'nun tek tıkla Convert'i.
  - **Invoice:** fatura numarasını ve günü (bugün) sorar; vadeyi müşterinin ödeme vadesinden hesaplar ("Due Nov 13 · Net 15, Kuzey Asansör's terms"), Invoiced yapar.
  - **Record payment:** tutar (kalan dolu), gün (bugün), yöntem çiplerle (Bank transfer, Card, Cash); kısmi ödemede sipariş açık kalır, kalan yazar; bir şey kalmayınca Paid (Odoo, QuickBooks).
  - Solda Customer, Deal, Date, Payment terms, Invoice no, Invoiced on, Due (geçmişse kırmızı); sağda kalemler ve toplamlar (Subtotal, Tax, Total, Collected, Left), altında tahsilatlar.
- **Today:** vadesi gelen fatura o gün Record payment ile; geçen ödenene kadar Overdue'da. Upcoming'de vadesi gelecekler; teklifler girmez.
- **Müşteri (Companies):** başlıkta "₺19.150 to collect · 1 overdue · ₺59.850 this year"; sağ sütunda Orders (Sales'ten), her biri durumu ve kalanıyla, + New quote o müşteriye teklif açar. Şirkete Payment terms (Due on receipt, Net 15, Net 30, Net 60), boşsa kurulumdaki.
- **CRM'le:** fırsatın penceresinde Quotes bloğu, + Quote şirketi ve fırsatı seçili teklif açar; teklif Accept edilince fırsat Won, Declined olunca Lost; fırsat Won'a çekilince açık teklifi Confirmed.
- **Home:** To collect (en eski vadeler), Quotes (açık teklifler), This month (To invoice, Collected, en çok alan müşteri).
- **Sorular:** bugünküler ve **Payment terms** (Net 30).
- **Altyapı** (Satış, Stok ve E-ticaret için birlikte, 29 Ekim):
  - Düğme sorusunda `rows`: bağlı kayıtları satır satır sorar (Receive'de gelenler, Return'de dönenler ve nedenleri), `show`, `from`, `why`; ajan satırları adıyla verir (`{ row, count, why }`). Tik sorusu `tick`.
  - Tabloda sayı yazılır (`edit`), sayımın Counted'ı.
  - Görünümde `sums` (üstte tek satır, "to collect · overdue"; `one` tekil adı, `by` en çok olan, `per` oran), `chips` (kanal çipleri, sayılarıyla), `set` (bir ekranın sekmeleri, All yok), `all` (Reorder all: düğme görünümdeki her kayda sırayla).
  - Home'da kutu başına `title`, `head`, `lines`, `periods` (Today, Yesterday, bu ay); bir koleksiyonun birden çok kutusu (`homes`), her biri kendi şablonunun modülünde; çok modüllü app'te Home modül modül kutular.
  - Panoda `wins.back` ve `loses`: kazanılan fırsat teklifini Confirmed, kaybedilen Declined yapar; kuralda `move(kart, sütun, değerler)` ve bağlantıyla kart (`move(deal, "Won")`), kartın alanı okunur (`deal.company`).
  - Bağlı blokta `add` (+ New quote, + Quote) ve `title`; `note` bloğu (formül cümlesi kutuda: kâr, toplamlar); ilk sütuna konan düğmeler alanların üstünde; adımlı seçim tabloda çip (`steps.chip`); formül dilinde `amount()`.
- **Mockup'tan kalan farklar:** sipariş listesinde Date ham gün olarak; ürün listesinde kod ayrı sütunda; kalemler tablosunda "Not enough stock" kalemin penceresinde (tabloda değil); Home'da hakedişler sipariş sipariş (kanal kanal değil), iadeler ayrı kutuda.

Teklif, sipariş ve tahsilatı izler. Faturayı kesmez; fatura muhasebe programından kesilir, numarası burada tutulur.

| Parça | Tür | İçinde | Hesaplanan |
|---|---|---|---|
| Products | koleksiyon, ortak | ad, kod (PRD-0001), tür (product, service), birim, fiyat, vergi oranı, fiyata vergi dahil mi, satışta mı | — |
| Orders | koleksiyon | kod (ORD-0001), müşteri, tarih (bugün), durum (Quote, Confirmed, Delivered, Invoiced, Paid, Cancelled), para birimi, vade, fatura no; depo (birden çok depo varsa) | ara toplam, indirim, vergi, toplam, tahsil edilen, kalan |
| Order lines | koleksiyon | sipariş, ürün, miktar, birim fiyat, indirim yüzdesi, vergi oranı, vergi dahil mi | net, vergi, tutar |
| Payments | koleksiyon, ortak | 3.5'teki alanlar; In yönlü kayıtlar tahsilattır | — |
| How we sell | tanıtım notunda | CRM'deki bölümle bir; teklif, onay ve tahsilat | — |

- **Kalemin hesabı:** vergi hariç fiyatta net = miktar × birim fiyat × (1 − indirim), vergi = net × oran, tutar = net + vergi. Vergi dahil fiyatta tutar = miktar × birim fiyat × (1 − indirim), net = tutar ÷ (1 + oran), vergi = tutar − net. Her kalem kendi vergi bilgisine göre hesaplanır; aynı siparişte farklı oranlar yan yana durur.
- **Ekranlar:** siparişin ekranında solda alanlar, sağda kalemler tablo olarak (altında toplamlar) ve tahsilatlar; müşterinin ekranında siparişleri.
- **Kurallar:**
  - Order lines'ta, kaydederken: birim fiyat, vergi oranı ve vergi dahil mi boşsa ürününkinden yazılır. Formda önizleme olduğu için değerler Save'den önce görünür.
  - Orders'ta kontrol: teklif dışındaki bir siparişin en az bir kalemi olmalı.
  - Orders'ta **Record payment** düğmesi: tutarı sorar, varsayılanı kalan tutar (5. bölüm). Bekleyen bir tahsilat varsa onu Paid yapar; kısmi ödemede kalanı için yeni bir bekleyen tahsilat bırakır; yoksa Paid bir tahsilat açar.
  - Payments'ta, kaydederken: siparişin kalanı sıfıra inince sipariş Paid olur.
- **Zincir:** CRM varsa müşteri Companies'e (yalnız kişilerde People'a) bağlanır; CRM yoksa Satış Companies'i kendisi kurar. Stok varsa Products ortaktır ve stok düşümü kurulur (3.6). Bütçe varsa tahsilatlar Payments'ta durur ve beklenen tahsilat açılır (3.5).
- **Sorular:**
  1. **Ne satıyorsunuz?** Ürün, hizmet ya da ikisi (varsayılan). Birim listesi buna göre gelir.
  2. **Fiyatlara vergi ekleniyor mu?** Evet (varsayılan): ikinci soru, **fiyatlarınız genelde vergi dahil mi, hariç mi?** Cevap yeni ürünün başlangıç değeridir. Hayırsa vergi alanları kurulmaz.
  3. **İndirim yapıyor musunuz?** Evetse kalemde indirim alanı kurulur.
  4. **Teklif veriyor musunuz?** Evetse siparişler Quote ile başlar; hayırsa Confirmed ile ve Quote durumu olmaz.

### 3.3 Müşteri desteği

30 Ekim, Help Scout, Zendesk ve Freshdesk'in ekranlarına bakılarak baştan; Saha servisi (`design/more-apps.md` 3.6) ve Danışmanlıkla (3.7) birlikte, üçü CRM'le tek app'te. Mockup: `design/mockups.html` › Destek, saha servisi ve danışmanlık. Roadmap ROA-340, deneme ROA-341.

- **Requests** pano değil koleksiyon. Sekmeler Mine, Unassigned, Waiting on customer, Solved (Mine kişinin kendi adıyla süzülür, koşulda `me`); üstte "12 open · 3 unassigned · 2 late". Satırda konu, kanal, kimden ("Acme Lojistik · Ayşe Kaya"), durum çipi ve "Reply due in 3 h", kırmızı "2 h late" ya da "waiting 2 days".
- **Yeni talep:** müşteri, şirket (boşsa kişininki), kanal, tür ve müşterinin yazdığı (What they wrote); yazılan konuşmanın ilk mesajı olur.
- **Penceresi** üç sütun: başlıkta "Open · Acme Lojistik · reply 2 h late · asked 23 h ago", altında aşamalar (New, Open, Waiting on customer, Solved, Closed); solda müşteri, şirket, kanal, tür, öncelik, kimde; ortada düğmeler ve konuşma gün gün (müşteri mavi, biz yeşil, iç not sarı); sağda bağlı fikir (Idea), şirketin öbür talepleri ve Saha servisi varsa işler (+ Job).
- **Reply:** yanıtın metni, altında **Saved reply** menüsü (Saved replies klasörünün notları); sonra durum çiplerle Keep open, Waiting on customer, Solved. Yanıt konuşmaya yazılır, talep kimsenin değilse yazanın olur, yanıt artık beklenmez. E-posta Scrawl'dan gitmez; posta programından gönderilir.
- **Customer wrote** talebi yeniden açar, yanıt süresi baştan başlar; **Note** yalnız ekibin gördüğü not; **Assign to me**.
- **Yanıt süresi:** kurulumda sorulur (4 saat, 8 saat, bir iş günü, iki iş günü; iş günü hafta sonunu atlar). Müşteri beklenirken işlemez. Yanıtı beklenen talep o gün Today'de Reply ile; geçen Overdue'da kalır.
- **Feedback:** her fikir kaç talepte istendiğini ve kimlerden geldiğini sayar; en çok istenenler Home'da.
- **Home:** Requests (açık ve geciken), Waiting on customer, Most asked.
- **Telefonda:** sayfa Conversation sekmesiyle açılır; Reply, Customer wrote, Note üstte.
- **Altyapı** (Destek, Saha servisi ve Danışmanlık için birlikte, 30 Ekim):
  - Bağlı blokta `look: 'thread'` (mesajlar gün gün, türün renginde, kim ve ne zaman) ve `through` (kaydın bir bağlantısının gösterdiği kayda bağlı öbürleri: şirketin öbür talepleri).
  - Düğme sorusunda `snippets` (metne bir klasörün notlarından hazır yanıt) ve `signature` (parmakla imza, çizginin yolu olarak saklanır); alanda `signature` çizildiği gibi gösterilir.
  - Görünüm koşulunda `me`: bakan kişinin adı.
  - Takvimde `lanes`: Day'de bağlantının her kaydı bir satır (teknisyen), kimsenin olmayanlar bir satır, günü olmayanlar yanda, sürükleyip satıra bırakılır.
  - `sheet` görünümü: hafta tablosu, satır bir bağlantı (proje), sütun gün, hücreye saat yazılır; + Add row ve Copy last week.
  - Yüzde çubuğunda `warn` (bütçe: %80'den sarı, aşınca kırmızı); yeni kayıt penceresi gizli bir alanı da sorabilir (`Layout.new`).
- **Mockup'tan kalan farklar:** kanal ikon değil çip; konuşmada "biz" yazanın adı, adı yoksa Us; Reply'da Assign to me ayrı düğme; talebin penceresinde notlar da var (ek için).

| Parça | Tür | İçinde |
|---|---|---|
| Requests | koleksiyon | kod (RQ-0001), konu, müşteri, şirket, kanal, tür (Question, Problem, Request), öncelik, kimde, durum (New, Open, Waiting on customer, Solved, Closed), fikir; yanıtın günü ve saati |
| Messages | koleksiyon, talebin satırları | talep, tür (Customer, Us, Note), kim, ne zaman, metin |
| Feedback | koleksiyon, ortak | başlık, kişi, şirket, kaynak, konu, durum (new, planned, done, declined) |
| Saved replies | klasör | sık sorulara hazır cevaplar, birer not |
| How we handle requests | tanıtım notunda | kim bakar, ne kadar sürede dönülür, ne zaman kapanır |

- **Ekranlar:** şirketin ve kişinin ekranında talep kartları ve geri bildirimleri.
- **Kurallar:** yok. Panoların kuralı olmadığı için yanıt süresi hedefi notta yazılı durur; kartın vadesi elle verilir.
- **Zincir:** CRM varsa Companies ve People'a bağlanır; yoksa Destek People'ı kendisi kurar. Ürün geliştirme varsa Feedback ortaktır.
- **Sorular:**
  1. **Talepler nereden geliyor?** Çoklu seçim: e-posta, telefon, chat, web formu, sosyal medya; seçilenler kanal seçenekleri olur.
  2. **Müşteri geri bildirimlerini de toplayacak mısınız?** Evet (varsayılan).
  3. **Hazır cevaplar klasörü kurulsun mu?**

### 3.4 Proje yönetimi

30 Ekim, Linear'ın proje güncellemeleri ve milestone'ları, Asana'nın portföyü ve monday'in zaman çizelgesine bakılarak baştan; Hedefler (`design/more-apps.md` 3.4) ve Sözleşmelerle (3.2) birlikte, üçü CRM ve Bütçe'yle tek app'te. Mockup: `design/mockups.html` › Proje, hedef ve sözleşme. Roadmap ROA-344, deneme ROA-345.

- **Liste:** sekmeler Active, Planned, On hold, Mine, Done; üstte "4 active · 1 at risk · 1 late · 1 update missing". Satırda müşteri, lider, sağlık (On track, At risk, Off track), güncellemesi eksikse "No update for 17 days", "1 of 4" çubuğu sağlık renginde, "Due Dec 15" ya da "12 days late", sıradaki milestone "Planning · Nov 22".
- **Timeline (yeni görünüm):** her proje bir satır; başlangıçtan bitişe çubuk sağlık renginde (planlanan gri), milestone'lar elmas (biten dolu), bugün çizgisi, bitişi geçen kırmızı taralı. Çubuğu sürüklemek iki günü, sağ ucunu çekmek bitişi değiştirir, Undo ile. Weeks, Months, Quarters; telefonda adlar solda, yalnız aylar.
- **Pencere:** başlıkta "Active · On track · 0 of 4 cards · due Dec 15 (in 46 days) · next: Planning Nov 22"; solda müşteri, lider, günler, sözleşme, durum, sağlık, bütçe çubuğu ("$12,400 of $20,000", %80 sarı), hedef; sağda Updates (her biri sağlık ve kendiliğinden yazılan ilerleme), Milestones (ad, gün, tik), kartlar (yerinde eklenir), saatler.
- **Start project:** Active yapar; kurulumdaki milestone'ları başlangıçla bitiş arasına eşit dağıtarak yazar (bitiş yoksa haftada bir), bütçe kalemleri önceki gibi. Kart açmaz. Başlangıç günü yalnız boşsa bugün olur.
- **Post update:** sağlık çiplerle, "What happened"; güncellemeye "64% done (was 58%) · end moved to Dec 15 · Planning · Nov 22" kendiliğinden eklenir. Sıklık kurulumda (Every week, Every two weeks, No updates); günü gelince liderin Today'inde Post update ile, üç gün geçince Update missing.
- **Milestone:** günü Today'de Done ile, geçerse Overdue'da; biten ya da değişen milestone sıradakini projeye yazar.
- **Close project:** Done ya da Cancelled; açık kartlar Move to Done ya da Drop them (Work'te Dropped sütunu); son söz son güncelleme olur.
- **Zaman takibi:** Track time saat ya da sayaç, Stop; hafta tablosu Time menüde; Danışmanlık da seçiliyse onun zaman kayıtları kullanılır.
- **Home:** Projects (aktif, riskte), Work, Hours this week.
- **Altyapı:** `timeline` görünümü (`start`, `end`, `color`, `marks`, `late`), çubukta beklenen çizgisi ve renk (`mark`, `tone`), takvimde `upcoming: 'today'` ile yalnız Today'de güncelleme.
- **Mockup'tan kalan farklar:** güncellemeler "Latest update" kutusu değil, en yenisi üstte liste; güncelleme notu sağlık çipinin altında değil ayrı sütunda, müşteri adın altında değil ayrı sütunda; geciken gün ve milestone kırmızı değil; Home'da bu haftanın milestone'ları kutusu yok, yerinde Work.

Önceki hali:

| Parça | Tür | İçinde | Hesaplanan |
|---|---|---|---|
| Projects | koleksiyon, ortak | ad, kod (PRJ-0001), müşteri, durum (Planned, Active, On hold, Done, Cancelled), sorumlu, başlangıç (bugün), bitiş; bütçe tutuluyorsa sözleşme tutarı | ilerleme (biten kartların oranı), gecikiyor mu; zaman takibinde toplam ve faturalanır saat; bütçede bütçe, harcanan, gelir, kalan, durum |
| Work | pano | Backlog, To do, In progress, Review, Done; kartta proje | — |
| Time entries | koleksiyon (soruya göre) | proje, kişi (ben), tarih (bugün), saat, faturalanır mı, not | — |
| How we run projects | tanıtım notunda | durumların anlamı, proje nasıl başlar ve kapanır | — |

- **Ekranlar:** projenin ekranında solda alanlar, sağda iş kartları, zaman kayıtları (altında toplam saat) ve bütçe tutuluyorsa bütçe kalemleri ile hareketler.
- **Kurallar:**
  - Kontrol: bitiş başlangıçtan önce olamaz.
  - **Start project:** durumu Active yapar; tekrar eden adımları Work panosunda kart olarak, standart bütçe kalemlerini sözleşmenin yüzdesiyle açar. Önce sorar.
  - **Close project:** durumu Done yapar, açık kartları Done sütununa taşır. Önce sorar.
- **Zincir:** CRM varsa müşteri Companies'e bağlanır. Bütçe sorusu evetse Bütçe'nin parçaları kurulur ve projeye bağlanır; Bütçe ayrıca seçilmese de.
- **Sorular:**
  1. **Projeleriniz kimin için?** Müşteriler için, şirket içi ya da ikisi. İç işse müşteri alanı kurulmaz.
  2. **Zaman takibi yapacak mısınız?** Hayır (varsayılan).
  3. **Her projede tekrar eden adımlar:** liste; varsayılanı Kickoff, Planning, Delivery, Review.
  4. **Projelerin bütçesini tutacak mısınız?** Evetse standart bütçe kalemleri bir listeyle sorulur (Material, Labour, Transport gibi, her biri sözleşmenin bir yüzdesiyle); boş bırakılabilir.

### 3.5 Bütçe ve harcama

30 Ekim, QuickBooks'un Budget vs Actuals ve Bills ekranlarına, Expensify'ın rapor durumlarına bakılarak baştan; Abonelik ve Demirbaşla birlikte. Mockup: `design/mockups.html` › Abonelik, bütçe ve demirbaş. Roadmap ROA-342, deneme ROA-343.

- **Budget:** This month ve This year sekmeleri, Income ve Expense grupları; satırda aylık planlanan, gerçekleşen, kullanılan çubuk (giderde %80'den sarı, aşınca kırmızı; gelirde uyarı yok), kalan. Üstte "$42,000 in · $31,500 out · $10,500 net · 1 over budget". Dönem sorusu kalktı: plan aylıktır, yıl on iki katı.
- **Payments (Bills and payments):** sekmeler To pay, Overdue, To collect, Paid; üstte bu hafta ödenecek, geciken ve tahsil edilecek. Satırda kime ya da kimden (To or from), bütçe kalemi, "Overdue 4 days", "Due today", "Due Nov 3", tutar.
- **Mark paid:** tutar (kalan dolu), gün, yöntem çiplerle; kısmi ödemede kalanı bekleyen bir ödeme olarak kalır. Vadesi gelen ödeme Today'de Mark paid ile; **Pays itself** işaretli olan kendiliğinden ödenir.
- **Comes again:** Monthly, Quarterly, Yearly; ödenince bir sonrakini bir dönem sonra açar.
- **Expenses:** sekmeler Mine, To approve, To pay back, Paid back, Rejected; yeni harcama tutar, kategori çiplerle, gün ve fiş (notlara ek). **Approve** bütçe kalemini çiplerle sorar, kalemin bu ayki durumunu söyler, geri ödemeyi To pay'e yazar; **Reject** nedenini sorar; ödenince Reimbursed.
- **Home:** This month (net, giren, çıkan, en çok harcanan), To pay, Over budget, To approve.
- **Altyapı:** çubuğun uyarısı bir alana bağlı olabilir (`warn: 'expense'`); kuralların yazdığı bağlı blokta + Add yok (`fixed`).
- **Mockup'tan kalan farklar:** onay bekleyen harcamalar Today'de tek satır değil, her biri kendi satırında Approve ile.

Para tek yerde durur: satış tahsilatları, tedarikçi borçları, projenin ve şirketin giderleri, çalışana geri ödenen masraflar hep Payments'ta.

| Parça | Tür | İçinde | Hesaplanan |
|---|---|---|---|
| Budget lines | koleksiyon | ad, tür (Income, Expense), kategori, dönem (soruya göre), planlanan, proje (Proje varsa) | gerçekleşen, kalan, kullanılan yüzde, durum |
| Payments | koleksiyon, ortak | ad, yön (In, Out), tutar, para birimi, tarih, kategori, bütçe kalemi, durum (Planned, Invoiced, Paid), vade, ödeme günü, ödeme şekli, fatura no; varsa proje, şirket, sipariş, satın alma siparişi, masraf | gecikti mi |
| Expenses | koleksiyon (soruya göre) | başlık, kişi (ben), tarih (bugün), tutar, para birimi, kategori, bütçe kalemi, proje, durum (Submitted, Approved, Rejected, Reimbursed), onaylayan, reddetme nedeni; fiş notlarda fotoğraf | — |
| How we manage money | tanıtım notunda | kim neyi onaylar, ödemeler ve masraflar nasıl izlenir | — |

- **Ekranlar:** bütçe kaleminin ekranında ödemeleri tablo olarak, altında toplamıyla; projenin ve siparişin ekranında kendi ödemeleri.
- **Kurallar:**
  - Kontrol: gider bir bütçe kalemine bağlı olmalı.
  - Payments'ta, kaydederken: Paid olunca ödeme günü yazılır. Bir masrafın ödemesi Paid olunca masraf Reimbursed olur.
  - Vadesi geçmiş ödeme bir formülle her gün kendiliğinden görünür.
  - Payments'ta **Mark paid** düğmesi; satırın ··· menüsünde de durur.
  - Expenses'ta **Approve** ve **Reject**, yalnız Submitted'da. Approve onaylayanı yazar ve çalışana ödenecek Out yönlü bir ödeme açar; Reject nedenini sorar (5. bölüm). Kontrol: onaylanmış masraf bir bütçe kalemine bağlı olmalı.
- **Zincir:**
  - Proje varsa kalemler projeye bağlanır.
  - Satış varsa bir "Sales" gelir kalemi kurulur, tahsilatlar ona bağlanır. Sipariş Invoiced olunca beklenen tahsilat açılır: In yönlü, Invoiced, siparişin toplamı ve vadesiyle; sipariş iptal edilirse ödenmemiş tahsilat kaldırılır.
  - Stok varsa mal kabulünde tedarikçi borcu açılır: Out yönlü, Invoiced (3.6).
- **Sorular:**
  1. **Giderlerinizi hangi kategorilere ayırıyorsunuz?** Liste; varsayılanı Rent, Salaries, Marketing, Software, Travel, Other.
  2. **Bütçeyi dönemlere bölüyor musunuz?** Dönemsiz (varsayılan), yıllık ya da aylık. Ödeme hangi kaleme bağlandıysa o dönemden düşer.
  3. **Ödemeleri vadesiyle izliyor musunuz?** Evet (varsayılan): durum, vade ve gecikme kurulur.
  4. **Çalışanların masraflarını da izleyecek misiniz?** Hayır (varsayılan). Evetse masraf kategorileri bir listeyle sorulur.
  5. **Fatura kesilince beklenen tahsilat otomatik açılsın mı?** Satış seçildiyse ve vadeli takip evetse; evet (varsayılan).

### 3.6 Stok ve satın alma

29 Ekim, Sortly, inFlow, Zoho Inventory ve Katana'nın ekranlarına bakılarak baştan, Satış (3.2) ve E-ticaretle birlikte. Mockup: `design/mockups.html` › Satış, stok ve e-ticaret.

- **Ürünün sayıları** (inFlow, Zoho, Katana): In stock (girişler − çıkışlar), Committed (onaylanmış, gitmemiş siparişlerin kalemleri), Available (In stock − Committed), On order (sipariş verilmiş satın almalarda gelecek). Low, Available + On order'a bakar (inFlow'un Anticipated'ı): sipariş verilmiş ürün düşük görünmez. Out, Available sıfır ya da altında.
- **Products:** üstte "48 products · ₺1.184.000 in stock · 3 low"; sütunlar Product (kodu yanında), In stock, Available, On order, Reorder at, Low/Out çipi; görünümler All ve Low stock. Low stock'ta **Reorder all**.
- **Ürünün penceresi:** başlıkta "38 in stock · 6 committed · 32 available · 20 on order"; düğmeler Adjust, Transfer (depo varsa), Reorder; solda Code, Unit, Price, Tax %, Cost, Supplier, Reorder at, Reorder quantity; sağda depo depo stok ve hareketler gün gün.
- **Adjust:** sayılan toplamı sorar ("Now 38 · 2 less"), nedeni çiplerle (Count, Damaged, Lost, Found, Other; Sortly, inFlow), depo varsa deposu.
- **Reorder:** tedarikçinin taslak satın alma siparişi varsa ürünü ona ekler, yoksa açar; miktar Reorder quantity, boşsa Reorder at'a çıkaracak kadar. **Reorder all** düşük ürünlerin hepsine basar, her tedarikçiye tek taslak (inFlow, Zoho).
- **Stock counts** (Sortly, inFlow, Katana, Odoo): sayım açılınca bütün ürünler (depo varsa o deponunkiler) satır, her birinde bugünkü stok; sayılan tabloda yazılır, fark yanında renkli; **Apply** farkları Count nedenli düzeltme olarak yazar, boş satır değişmez.
- **Satın alma:** Draft, Ordered, Partially received, Received, Cancelled. **Receive** kalemleri kalan miktarlarıyla dolu sorar (Sortly, Katana); eksik gelen düşürülür, sipariş Partially received kalır; gelenler giriş hareketi, ürünün maliyeti son alış fiyatı (inFlow). Beklenen günü gelen Today'de Receive ile, geciken Overdue'da.
- **Menü:** Products, Purchase orders, Stock counts, depo varsa Locations. Hareketler ve depo stokları menüden çıkar, ürünün ve deponun penceresinde. Tedarikçiler Companies'te Supplier türüyle; satın almada yalnız onlar önerilir.
- **Home:** Low stock (Reorder all), To receive, In stock (Stock value, Committed, On order).

Stok elle yazılmaz, hareketlerden hesaplanır.

| Parça | Tür | İçinde | Hesaplanan |
|---|---|---|---|
| Products | koleksiyon, ortak | Satış'taki alanlara ek: maliyet, kritik seviye, tedarikçi | stok (girişler − çıkışlar), stok değeri, durum (Low, OK) |
| Stock movements | koleksiyon | ürün, yön (In, Out), tür (purchase, sale, use, return, adjustment, transfer), miktar, tarih (bugün), yapan (ben); varsa depo, stok seviyesi, satın alma siparişi, sipariş | — |
| Companies | koleksiyon, ortak | tedarikçiler; CRM yoksa da kurulur | — |
| Purchase orders | koleksiyon (soruya göre) | kod (PO-0001), tedarikçi, tarih, durum (Draft, Ordered, Received, Cancelled), beklenen tarih; depo (birden çok depo varsa) | toplam |
| Purchase order lines | koleksiyon (soruya göre) | satın alma siparişi, ürün, miktar, birim maliyet (üründen) | tutar |
| Locations | koleksiyon (birden çok depoda) | ad, adres | — |
| Stock levels | koleksiyon (birden çok depoda) | ürün, depo; adı kendiliğinden "Ürün · Depo" | giriş, çıkış, stok |
| How we keep stock | tanıtım notunda | sipariş ne zaman verilir, mal nasıl kabul edilir, sayım ne zaman yapılır | — |

- **Kurallar:**
  - **Mal kabulü:** satın alma siparişi Received olunca her kalem için bir giriş hareketi açılır; geri alınırsa ya da iptal edilirse kaldırılır.
  - **Satışta düşüm** (Satış varsa, soruya göre): sipariş onaylanınca ya da teslim edilince her ürün kalemi için bir çıkış hareketi; hizmet kalemleri düşmez. Geri alınır ya da iptal edilirse hareketler kaldırılır. Stok yetmezse kalem işaretlenir ("Not enough stock: 3 left"); reddedilmez.
  - **Kritik stok:** stok kritik seviyenin altına inince ürün işaretlenir ("Low: 4 left").
  - **Correct stock** düğmesi: sayılan toplamı sorar, içinde bugünkü stok; farkı bir düzeltme hareketi olarak girer (5. bölüm). Birden çok depoda düğme Stock levels'ta durur.
  - **Reorder** düğmesi: ürünün tedarikçisine taslak bir satın alma siparişi açar, kalemiyle.
  - **Transfer** düğmesi (birden çok depoda): miktarı ve nereye gideceğini sorar; çıkan depodan ve giren depoya iki hareket açar.
  - Bir hareket kaydedilince (birden çok depoda) kural ürün ve depo çiftinin stok seviyesi kaydını bulur, yoksa açar, hareketi ona bağlar. Ürünün toplam stoğu depolardakilerin toplamıdır.
- **Ekranlar:** ürünün ekranında hareketleri ve depo depo stoğu; deponun ekranında oradaki ürünler; satın alma siparişinin ekranında kalemleri.
- **Zincir:** Satış varsa Products ortaktır, sipariş "hangi depodan" alır. Bütçe varsa mal kabulünde tedarikçi borcu Payments'a yazılır (soruya göre).
- **Sorular:**
  1. **Satın almayı da izleyecek misiniz?** Evet (varsayılan).
  2. **Birden çok deponuz var mı?** Hayır (varsayılan). Evetse depolar bir listeyle sorulur; ilki varsayılan depo.
  3. **Satışta stok otomatik düşsün mü?** Satış seçildiyse: hayır, onaylanınca ya da teslim edilince (varsayılan).
  4. **Mal kabulünde tedarikçi borcu otomatik yazılsın mı?** Bütçe seçildiyse: evet (varsayılan).

### 3.7 Ürün geliştirme

30 Ekim, Productboard'un geri bildirimi işe bağlaması, Linear'ın triage'ı ve Canny'nin changelog'u ve durum e-postalarına bakılarak baştan; İçerik takvimiyle (3.10) birlikte, ikisi Proje, Destek ve CRM'le tek app'te. Productboard ve Aha!'nın Now/Next/Later sayfaları açılamadı. Mockup: `design/mockups.html` › Ürün geliştirme ve içerik. Roadmap ROA-346, deneme ROA-347.

- **Roadmap:** sütunlar Ideas, Later, Next (bekleyen), Now (yapılan), Review, Shipped, Won't do; Won't do'ya bırakılan kart nedenini sorar. Kartın yüzünde tür çipi, "Asked by 12" ve sürüm: Destek varsa bağlı fikrin talepleri toplanır, yoksa bağlı geri bildirim sayılır.
- **Bugs:** New, Confirmed, Fixing, Fixed, Won't fix (nedenini sorar); yüzünde önem, talep ve sürüm. Destek varsa talepte **Report bug** başlık ve önemi sorar, talebe bağlı kart açar, talebe "Bug reported" yazar; kart Fixed'e geçince talep "Bug fixed" olur, yeniden Open olur ve yanıtı şimdi Today'de.
- **Releases:** Planned ve Released sekmeleri, satırda gün ve "5 of 8 cards done"; başlıkta "Planned · Nov 20 (in 21 days) · 5 of 8 cards done". Günü Upcoming'de, o gün Today'de Ship ile.
- **Ship:** açık kartları sorar (Move to the next release: bir sonraki planlı sürümle Next'e; Ship with it); notlarını Shipped kartlardan ve Fixed hatalardan New, Improved, Fixed başlıklarıyla yazar; kartların geri bildirimini done yapar; CRM varsa geri bildirimi veren şirkete "Tell them: Dark mode is out in 2.4" etkinliği açar (Today'de).
- **Home:** Next release.
- **Altyapı:** panoda kart yüzündeki alanlar (`face`), hesaplanan alanlar da; ajanda bitmiş kartın bağlı kayda yazdığı değer o kaydın onSave'lerini çalıştırır (web'de olduğu gibi).
- **Mockup'tan kalan farklar:** Home'da Now, Most asked ve Open bugs kutuları yok; hızlı eklenen kartta tür boş gelir (pano alan varsayılanı yazmaz); kart penceresinde hesaplanan alanlar (Requests, Asked) görünür; sürüm notu pencerede metin alanı.

Önceki hali:

| Parça | Tür | İçinde | Hesaplanan |
|---|---|---|---|
| Roadmap | pano | Backlog, Todo, Doing, Review, Done; kartta tür (feature, improvement, chore; hata panosu yoksa bug), alan, sürüm, geri bildirimler | — |
| Bugs | pano, liste görünümü (soruya göre) | New, Confirmed, Fixing, Fixed, Won't fix; kartta önem, sürüm, bildiren kişi | — |
| Releases | koleksiyon (soruya göre) | sürüm, planlanan tarih, çıkış tarihi, durum (Planned, Released); notlarda sürüm notları | açık kart sayısı |
| Feedback | koleksiyon, ortak | 3.3'teki alanlar | — |
| How we build | tanıtım notunda | bir iş fikirden sürüme nasıl gider, "bitti" ne demek | — |

- **Bağlar:** Roadmap kartı bir sürüme ve geri bildirimlere bağlanır; sürümün ekranında kartları, geri bildirimin ekranında onu karşılayan kart görünür.
- **Kurallar:** Releases'ta **Ship** düğmesi: durumu Released, çıkış tarihini bugün yapar; açık kart varsa sayısını söyleyip sorar. Kontrol: açık kartı olan bir sürüm Released ise işaretlenir.
- **Zincir:** Destek varsa Feedback ortaktır; CRM varsa geri bildirim şirkete ve kişiye bağlanır.
- **Sorular:**
  1. **Hataları ayrı bir panoda izleyecek misiniz?** Evet (varsayılan).
  2. **Sürüm çıkarıyor musunuz?** Evet (varsayılan).
  3. **Fazlarla mı çalışıyorsunuz?** Hayır (varsayılan). Evetse Roadmap'te fazlar açılır.
  4. **Müşteri geri bildirimini de toplayacak mısınız?** Destek seçilmediyse burada sorulur.

### 3.8 İşe alım

30 Ekim, Workable ve Greenhouse'un aday kartı, mülakat geri bildirimi ve teklif ekranlarına bakılarak baştan; İzinler (`design/more-apps.md` 3.3) ve Randevuyla (`design/calendar.md` 6) birlikte. Mockup: `design/mockups.html` › İşe alım, izin ve randevu. Roadmap ROA-348, deneme ROA-349.

- **Aday tek kart:** Candidates koleksiyonu kalktı; Hiring panosundaki kart adaydır: pozisyon (zorunlu), e-posta, telefon, LinkedIn, kaynak, teklif (para), başlama günü, ret nedeni (Not a fit, Took another offer, Withdrew, Salary, No answer). CV kartın açıklamasında.
- **Pano:** Applied, Screening, Interview, Offer, Hired, Rejected; Rejected'a giden kart nedenini sorar. Kart yüzünde pozisyon ve kaynak, altında sıradaki mülakat ("Technical · Thu 14:00"), yoksa "No interview planned"; üstte "No interview planned: 2".
- **Kart penceresi:** aşama çubuğu; pozisyonun düğmeleri kart verilerek: Schedule interview, Make offer, sağda Hire ve Reject (CRM'in Won ve Lost'u yerine). Mülakatlar gün gün, türün işaretiyle, altında "Mert Yılmaz · 4 · Yes · notlar"; + Schedule interview.
- **Schedule interview:** tür çiplerle, saat, görüşen (ben); mülakat "Technical · Ayşe Kaya" adıyla açılır.
- **Write feedback:** mülakat saatinde Today'de, yazılana kadar Overdue'da kalır; puan 1–5 çiplerle, Overall (Definitely not, No, Yes, Strong yes), Key take-aways.
- **Make offer:** maaş, başlama günü, not; kartı Offer'a taşır, teklifi ve günü yazar.
- **Hire:** başlama günü; kartı Hired'a taşır, kurulumdaki ilk adımları pozisyona aday adıyla alt görev olarak o güne açar ("Contract signed · Ayşe Kaya"), İzinler varsa Employees'e ekler; kadro dolunca pozisyon Filled.
- **Positions:** sekmeler Open, On hold, Filled, Closed; üstte "2 open · 8 in the pipeline · 1 offers out"; satırda yönetici, "5 applied · 1 screening · 1 interview", "0 of 2", kaç gündür açık.
- **Home:** Pipeline (aşama sayıları), Open positions, Interviews (gelen), Feedback due.
- **Altyapı:** panoda toplama sütuna göre süzülür (`where` ile `column`); `press.won` ve `press.lost` Won ve Lost'un yerine; `next.say` ve `next.none` sıradaki adımın sözü; kuralda kart bağının `name`'i; CRM'e özgü "Closing this month" kutusu ve "Expected close" yalnız para alanı olan panoda.
- **Mockup'tan kalan farklar:** kart yüzünde teklif ("Offer sent Oct 27 · $4,200") yazmıyor, teklif kartın alanında; mülakatın puan ortalaması pencere başlığında değil; Home'da Pipeline kutusu da var; pozisyon satırında ekip adın altında değil.

Önceki hali:

Açık pozisyonlar, adaylar, adayın süreçteki yeri ve görüşmeler. Şablon penceresinde Work grubunda.

| Parça | Tür | İçinde | Hesaplanan |
|---|---|---|---|
| Positions | koleksiyon | ad, kod (POS-0001), ekip, yer, çalışma şekli (Full-time, Part-time, Contract, Intern), kadro (1), sorumlu (ben), durum (Open, On hold, Filled, Closed), açılış (bugün) | başvuru (kartlar), süreçteki aday (açık kartlar), işe alınan, kalan kadro |
| Candidates | koleksiyon | ad, e-posta, telefon, LinkedIn, kaynak (soruya göre), etiketler, işe alındığı pozisyon, başlama günü; CV ve notlar kaydın notunda | görüşme sayısı, ortalama puan (soruya göre) |
| Hiring | pano | aşamalar (soru 1); kartta aday ve pozisyon | — |
| Interviews | koleksiyon (soruya göre) | başlık, aday, pozisyon, tarih (bugün), tür (Phone screen, Technical, Culture, Final), görüşen (ben); soruya göre puan (1–5) ve öneri (Strong yes, Yes, No, Strong no) | — |
| How we hire | tanıtım notunda | aşamaların anlamı, kim görüşür, teklif nasıl verilir | — |

- **Ekranlar:** pozisyonun ekranında adayların kartları ve görüşmeler; adayın ekranında kartları ve görüşmeleri zaman çizelgesi olarak.
- **Kurallar:**
  - Candidates'ta **Add to position:** pozisyonu sorar, Hiring panosunun ilk aşamasına adaya ve pozisyona bağlı bir kart açar.
  - **Schedule interview** (görüşmeler kaydediliyorsa): pozisyonu, tarihi ve türü sorar; görüşeni ben olan bir görüşme açar.
  - **Hire:** pozisyonu ve başlama gününü sorar. Adayın o pozisyondaki kartını bitti sayılan aşamaya (Hired) taşır, işe alındığı pozisyonu ve başlama gününü yazar, işe başlama adımlarını (soru 4) adayın alt görevleri olarak açar. Kalan kadro sıfıra inince pozisyonu Filled yapar.
  - Kontrol: puan 1 ile 5 arasında.
- **Zincir:** yok; tek başına durur.
- **Sorular:**
  1. **İşe alım aşamalarınız:** liste; varsayılanı Applied, Screening, Interview, Offer, Hired, Rejected. Hired bitti, Rejected bırakıldı sayılır; ipuçları CRM'in aşamalarındaki gibi.
  2. **Adaylar nereden geliyor?** Çoklu seçim: Referral, LinkedIn, Job boards, Website, Agency; varsayılanı ilk dördü. Seçilenler kaynak seçenekleri olur; hiçbiri seçilmezse kaynak alanı kurulmaz.
  3. **Görüşmeleri kaydedecek misiniz?** Evet (varsayılan): Interviews ve Schedule interview kurulur. Altında **puan ve öneri de tutulsun mu?** Evet (varsayılan).
  4. **İşe başlayan için adımlar:** liste; varsayılanı Contract signed, Equipment ready, Accounts opened, First week planned. Boş bırakılabilir.

### 3.9 Demirbaş ve bakım

30 Ekim, Snipe-IT ve Asset Panda'ya bakılarak baştan; Abonelik ve Bütçe'yle birlikte. Mockup: `design/mockups.html` › Abonelik, bütçe ve demirbaş. Roadmap ROA-342, deneme ROA-343.

- **Liste:** sekmeler In use, Available, In repair, Due back, With me, Retired; üstte "142 assets · $86,400 value · 1 due back · 4 warranty ending". Satırda ad, kategori, kimde ya da nerede, durum, "Due back Nov 20", bugünkü değer.
- **Pencere:** başlıkta "In use · Ayşe Kaya since Mar 4 · due back Nov 20 · $1,240 now ($1,800 bought) · under warranty"; solda kategori çiplerle, seri no, alış günü ve tutarı, tedarikçi, garanti, ömür, bakım aralığı ve sonraki bakım; sağda geçmiş (Maintenance: check out, check in, tamir, bakım).
- **Check out:** kime (kişi) ya da nereye (yer varsa), geri dönüş günü, not. Dönüş günü Today'de Check in ile.
- **Check in:** nasıl döndüğü (Good, Damaged, Needs repair; sonuncusu In repair yapar), nereye kondu, not.
- **Send to repair** ve **Back from repair** (maliyet; Bütçe varsa Maintenance kalemine ödeme), **Service done** (sonraki bakımı yazar; Today'de), **Retire**.
- **Değer:** maliyet kategorinin ömrüne göre (bilgisayar ve telefon 3, araç 5, mobilya 7, makine 10 yıl) eşit düşer; ömür değiştirilebilir. Garanti bitişi Upcoming'de.
- **Home:** Value (bugün ve alış), Due back, Coming up.
- **Mockup'tan kalan farklar:** Check out'ta "kişi ya da yer" seçimi ayrı soru değil, iki kutu; Home'daki Coming up yalnız bakımı gösterir.

Şirketin eşyaları: kimde, nerede oldukları, ne zaman bakım gördükleri ve kaça mal oldukları. Şablon penceresinde Money grubunda.

| Parça | Tür | İçinde | Hesaplanan |
|---|---|---|---|
| Assets | koleksiyon | kod (AST-0001), ad, kategori (soru 1), seri no, durum (In use, In storage, In repair, Retired), kimde (soruya göre), yer (soruya göre), tedarikçi, alış tarihi, maliyet, garanti bitişi, bakım aralığı (soruya göre) | garantide mi, toplam bakım gideri; düzenli bakımda son bakım, sonraki bakım, bakımı geçti mi |
| Maintenance | koleksiyon | başlık, demirbaş, tür (Planned, Repair, Inspection), tarih (bugün), durum (Planned, Done), yapan, maliyet | — |
| Locations | koleksiyon, ortak (soruya göre) | ad, adres; Stok birden çok depoyla kuruluysa onun listesi | — |
| How we look after things | tanıtım notunda | kim ne alır, arıza nasıl bildirilir, bakım ne zaman yapılır | — |

- **Ekranlar:** demirbaşın ekranında bakımları tablo olarak, altında toplam maliyet; yerin ekranında oradaki demirbaşlar; Companies varsa tedarikçinin ekranında ondan alınan demirbaşlar.
- **Kurallar:**
  - **Log maintenance:** türü, maliyeti ve notu sorar; bugünün tarihiyle Done bir bakım açar.
  - **Assign** (kişilere veriliyorsa): kişiyi sorar, kimde'yi yazar, durumu In use yapar. **Return:** kimde'yi boşaltır, durumu In storage yapar. Kontrol: Retired bir demirbaş kimsede olamaz.
  - **Retire:** önce sorar, durumu Retired yapar.
  - Maintenance'ta, kaydederken (düzenli bakımda): planlı bir bakım Done olunca ve demirbaşın aralığı varsa bir sonraki planlı bakım, aralık kadar sonraki tarihle açılır.
  - Sonraki bakımın tarihi geçince demirbaş işaretlenir ("Maintenance due").
- **Zincir:**
  - Stok birden çok depoyla kuruluysa Locations ortaktır; aynı adlı yer bir kez eklenir.
  - Companies varsa (CRM, Satış, Destek ya da Stok kurduysa) tedarikçi oraya bağlanır; yoksa düz metindir.
  - Bütçe kuruluysa ve soru 5 evetse bir "Maintenance" gider kalemi kurulur; maliyeti olan bakım Done olunca o kaleme bağlı, çıkan yönlü, Invoiced bir ödeme açılır.
- **Sorular:**
  1. **Demirbaş kategorileriniz:** liste; varsayılanı Computers, Phones, Furniture, Vehicles, Machines, Other.
  2. **Demirbaşları kişilere veriyor musunuz?** Evet (varsayılan): kimde, Assign ve Return.
  3. **Düzenli bakım yapıyor musunuz?** Evet (varsayılan): bakım aralığı (Monthly, Every 3 months, Every 6 months, Yearly), son ve sonraki bakım, sıradaki planlı bakım.
  4. **Birden çok yeriniz var mı?** Hayır (varsayılan). Evetse yerler bir listeyle sorulur; varsayılanı Head office, Warehouse.
  5. **Bakım giderleri Payments'a yazılsın mı?** Bütçe seçildiyse; evet (varsayılan).

### 3.10 İçerik takvimi

30 Ekim, CoSchedule'un task template'leri ve Buffer'ın takvimine bakılarak baştan; Ürün geliştirmeyle (3.7) birlikte. Loomly'nin onay akışı sayfası açılamadı. Mockup: `design/mockups.html` › Ürün geliştirme ve içerik. Roadmap ROA-346, deneme ROA-347.

- **İçerik pano değil koleksiyon:** takvim telefonda da çalışır, adımlar günlü olur, düğmeler kurulur.
- **Ekran:** açılışta takvim, yayın gününe göre kanal renginde; sekmeler Ideas, In progress, Scheduled, Published, Mine, aşama sayıları üstte; "1 going out this week · 1 in review".
- **Pencere:** "Review · LinkedIn · goes out Fri, Nov 13 (in 14 days) · 0 of 4 steps"; aşama çubuğu; kanal, Also on, tür, yayın günü, yazar, inceleyen, kampanya, sürüm; sağda adımlar.
- **Adımlar:** kurulumda sütunlu satırlarla (adım, tür, kaç gün önce), hazır: Article Outline 7, Draft 5, Images 3, Review 2; Post Draft 3, Images 2, Review 1; Video Script 10, Shoot 6, Edit 3, Review 2; Newsletter Draft 3, Review 1. Yeni içerik türünün adımlarını alır; adımın günü yayın gününden hesaplanır, yayın günü değişince kayar. Günü Today'de Done ile.
- **Düğmeler:** Send for review (inceleyeni sorar; Today'de Approve ile), Approve (Scheduled), Request changes (ne değişecek, Writing'e döner), Publish (link ve gün; yayın günü Today'de).
- **Kampanyalar:** timeline, içerikleri elmas; Plan content başlık, kanal, tür ve günü sorar, içeriği Writing'de açar, kampanyayı Running yapar; "0 of 1 out".
- **Home:** This week, In review, This month (kanal kanal).
- **Kurulum:** aşama listesi sorusu kalktı; aşamalar sabit (Idea, Writing, Review, Scheduled, Published).
- **Mockup'tan kalan farklar:** takvimde bir içerik iki kanaldaysa bir kez görünür (ana kanalın renginde); telefonda takvim ay ve gün görünümü, hafta listesi değil.

Önceki hali:

Ne, hangi kanalda, ne zaman yayınlanacak. Şablon penceresinde Customers grubunda.

| Parça | Tür | İçinde | Hesaplanan |
|---|---|---|---|
| Content | pano | aşamalar (soru 2); kartta kanal (soru 1), tür (Post, Article, Video, Newsletter), yayın linki; kampanya (soruya göre), sürüm (Ürün geliştirme varsa). Yayın günü kartın vadesi, sorumlu kartın kişisi | — |
| Campaigns | koleksiyon (soruya göre) | ad, amaç, başlangıç, bitiş, durum (Planned, Running, Done); Bütçe varsa bütçe kalemi | içerik sayısı, yayınlanan |
| How we publish | tanıtım notunda | ne sıklıkla yayınlanır, kim onaylar, yayından sonra ne yapılır | — |

- **Takvim:** yayın günü kartın vadesi olduğu için içerikler Upcoming'in takviminde görünür; ayrı bir takvim kurulmaz. Yayınlanan kart takvimden düşer.
- **Ekranlar:** kampanyanın ekranında kartları; Ürün geliştirme varsa sürümün ekranında içerikleri de (kartları).
- **Kurallar:** panoların kuralı yok. Campaigns'te **Plan content:** başlığı, kanalı ve yayın gününü sorar, kampanyaya bağlı bir kart açar. Kontrol: kampanyanın bitişi başlangıcından önce olamaz.
- **Zincir:** Ürün geliştirme varsa kart bir sürüme bağlanır (sürüm duyurusu). Bütçe varsa kampanya bir bütçe kalemine bağlanır ve kalemin gerçekleşenini gösterir.
- **Sorular:**
  1. **Hangi kanallarda yayınlıyorsunuz?** Çoklu seçim: Blog, Newsletter, LinkedIn, X, Instagram, YouTube, Podcast; varsayılanı Blog, Newsletter, LinkedIn.
  2. **Yayın aşamalarınız:** liste; varsayılanı Ideas, Writing, Review, Scheduled, Published. Published bitti sayılır.
  3. **Kampanyalarla mı çalışıyorsunuz?** Hayır (varsayılan).

## 4. Zincir

### 4.1 Ortak parçalar ve şablon işareti

Bir app'in her koleksiyonu şemasında hangi parça olduğunu taşır: `"role"` alanı (`companies`, `people`, `products`, `orders`, `order-lines`, `payments`, `budget-lines`, `expenses`, `stock-movements`, `stock-levels`, `locations`, `purchase-orders`, `purchase-order-lines`, `projects`, `time-entries`, `feedback`, `releases`, `positions`, `candidates`, `interviews`, `assets`, `maintenance`, `campaigns`…). Panolar da aynı işareti alır: pano dosyasında `"role"` (`deals`, `requests`, `work`, `roadmap`, `bugs`, `hiring`, `content`). Saved replies klasörü adından bulunur.

Şablon kurulurken ortak parça önce app klasöründe işaretinden aranır; varsa ona bağlanılır, yoksa kurulur. İşaret ad ve yerden bağımsızdır: kişi Companies'i "Customers" diye yeniden adlandırsa da, alt klasöre taşısa da bulunur. Aynı işaretten iki parça varsa ilki alınır ve özet bunu söyler.

### 4.2 Kurulu bir app'e şablon eklemek

App klasörünün ··· menüsünde **Add to app**. Aynı sihirbaz açılır, kurulu şablonlar işaretli ve soluk gelir. App başına sorulanlar sorulmaz, `_app.json`'dan okunur.

- **Yalnız eklenir.** Yeni koleksiyonlar, panolar ve notlar kurulur. Ortak parçaya yalnız eksik olan eklenir: bir alan, ekranında bir blok, kurallarında bir kural. Tanıtım notunun sonuna yeni şablonun bölümü eklenir; zincirle değişen şeyler ("Stock now drops when an order is delivered") o bölümde söylenir.
- **Hiçbir şey silinmez, değişmez.** Aynı anahtarlı bir alan başka türdeyse dokunulmaz, özet söyler. Aynı adlı bir kural varsa ikinci kez eklenmez. Kurallar dosyası kişi ya da ajan tarafından değiştirilmişse yeni kurallar sonuna eklenir.
- **Kurmadan önce özet:** "Orders, Order lines eklenecek; Companies'in ekranına Orders bloğu, Products'a satışta stok düşümü eklenecek." Create'e basınca yazılır; toast'ta Undo, eklenenleri çöpe atar, değişenleri eski haline getirir.
- **Çıkarmak yok.** Kişi istemediği parçaları çöpe atar ya da ajana söyler.

### 4.3 `_app.json`

App klasöründe, koleksiyonun `_collection.json`'u gibi gizli bir dosya:

```json
{
  "version": 1,
  "name": "Atlas",
  "currencies": ["TRY", "EUR"],
  "templates": [
    { "id": "crm", "version": 1, "answers": { "customers": "companies", "deals": true, "stages": ["Lead", "Contacted", "Meeting", "Proposal", "Won", "Lost"] } },
    { "id": "sales", "version": 1, "answers": { "sells": "both", "tax": true, "taxIncluded": false, "discount": true, "quotes": true } }
  ]
}
```

Hangi şablonların hangi cevaplarla ve hangi sürümle kurulduğunu tutar; Add to app ve ajan onu okur. Sync'e girer: app space'in diğer kişileri için de aynıdır.

## 5. Kural dilinde soru soran düğme

Bugün bir düğme yalnız onay alabiliyor. `ask` seçeneğiyle değer de sorar:

```js
action("Correct stock", { ask: { total: { label: "Counted total", type: "number", default: () => stock } } }, () => {
  const diff = input.total - stock
  if (diff != 0) add("Stock movements", { product: this, direction: diff > 0 ? "In" : "Out", type: "adjustment", quantity: abs(diff) })
})
```

- **Türler:** `number`, `text`, `date`, `choice` (`options` ile), `link` (`collection` ile: transferde depo), `person` (space'in kişilerinden biri: Assign; 5. dilimde eklendi). `default` bir değer ya da kaydın alanlarını okuyan bir formüldür; `required: true` boş bırakılmasını engeller; `note` kutunun altındaki kısa satırdır (bir metin ya da ``() => `Now ${stock}` ``).
- **`say`:** düğmenin seçeneği; pencerenin başlığının altındaki cümle (``say: () => `${name} has ${stock} in stock` ``). Yazılmazsa kaydın adı görünür.
- **Liste indeksi:** `find("Locations")[0]`, `linked("Stock levels")[1]`; olmayan sıra boş verir. Formülde de geçerlidir.
- **Gövdede** `input.total` olarak okunur. Rules sekmesi `ask`'ı da denetler: olmayan tür, `input`'ta tanımlanmamış ad, türü tutmayan işlem satırında söylenir.
- **Pencere:** düğmeye basınca onay penceresinin yerine sorular gelir; `confirm` da varsa yapacakları altlarında sayılır ve girilen değerle yeniden hesaplanır. Telefonda sheet.
- **Ajan:** `save_record`'a `action` ile `input` verilir (`{ "total": 42 }`); eksik zorunlu değer reddedilir, satırıyla.
- **Satırın ··· menüsünden** basılan düğme de aynı pencereyi açar.

## 6. Teknik tasarım

### 6.1 Core

- **`packages/core/src/apps/`** yeni bir klasör:
  - `templates/` her şablon bir dosya: `crm.ts`, `sales.ts`, `support.ts`, `projects.ts`, `budget.ts`, `stock.ts`, `product.ts`; 5. dilimde `recruiting.ts`, `assets.ts`, `content.ts`. Her biri `AppTemplate` verir: `id`, `version`, `group`, ad ve açıklama (i18n anahtarları), `questions`, `build(answers, ctx)`.
  - `questions.ts`: soru türleri (2.3), varsayılanlar, başka şablona ya da cevaba bağlı sorular, cevapların denetimi.
  - `build.ts`: seçilen şablonlar ve cevaplardan bir **kurulum planı** çıkarır, hiçbir şey yazmadan: kurulacak klasörler, şemalar, panolar, notlar, kural dosyaları ve var olanlara eklenecekler. Ortak parçalar bir kez üretilir; bağlar app klasöründeki yollarla kurulur. Kural dosyaları üretilip `rulesProblems` ile denetlenir; denetimden geçmeyen bir plan hiç yazılmaz (bu bir hata, kişiye değil bize söylenir).
  - `about.ts`: tanıtım notunu kurulum planından üretir (2.4); Add to app için yalnız yeni bölümü.
  - `install.ts`: denetlenmiş planı `VaultFs`'e bir kerede yazar, sırayla: klasörler, şemalar, kurallar ve başlangıç kayıtları, panolar, notlar, tanıtım notu, en son `_app.json`. Yarıda düşerse yazdıklarını geri alır. Geri alma işlevi verir (`undoApp`).
  - `roles.ts`: bir app klasöründe şablon işaretinden ortak parçaları bulur (4.1).
- **Şema:** isteğe bağlı `role` alanı, "bu koleksiyon hangi parça" der; Create penceresindeki koleksiyon şablonlarını etkilemez. Pano dosyası da isteğe bağlı `role` alanı alır; sync birleştirmesi onu ve pano alanlarını korur.
- **Kural dili:** `ask` ve `input` (5. bölüm) `rules.ts`, `lang.ts`, `run.ts`'te; `planAction` girilen değerleri alır.

### 6.2 Web ve masaüstü

- **New app:** space'in + menüsünde ve Create penceresinde yeni bir seçenek; başlangıç sayfasının şablonları arasında da. Sihirbaz bir pencere (2.1), telefonda sheet. Önce mockup.
- **Add to app:** app klasörünün ··· menüsünde; klasörde `_app.json` varsa görünür.
- **Soru soran düğme:** kayıt ekranındaki düğme, satırın ··· menüsü, telefon; onay penceresi sorularla.
- **Oturum:** `session.installApp(folder, plan)` kurar, ağacı yeniden okur, Undo verir; Add to app aynı yoldan.

### 6.3 Ajan (MCP)

- Araç sayısı değişmez. `create` yeni bir tür alır: `kind: "app"`, `templates` (id listesi), `answers` (şablon başına), `name`. Verilmeyen cevaplar varsayılanını alır. Kurulu bir app'e eklemek için `folder` app klasörüdür.
- Sonuç kurulanları ve eklenenleri söyler; yanlış bir cevap (olmayan seçenek, eksik ad) reddedilir, ne beklendiğiyle.
- Rehbere "Apps" bölümü: şablonlar, her birinin soruları ve seçenekleri, ortak parçalar. Ajan kişiye soruları sorup cevapları verebilir ya da kişinin anlattığından çıkarır.
- `read` `_app.json`'u açar; `write` onu yazmaz.
- `save_record`'a `input` (5. bölüm).

### 6.4 Sınırlar ve güvenlik

- Şablonlar bizim kodumuz; başkasının şablonu bu sürümde yok, çalıştırılan dışarıdan bir şey yok.
- Bir kurulum en çok birkaç düzine dosya yazar; tek seferde ve geri alınabilir.
- Kurallar 13. aşamanın sınırlarıyla çalışır: adım, değişiklik sayısı, dosya boyu.

## 7. Testler

- **core `apps`:** her şablon tek başına; şablonların bütün birleşimleri (yedi şablonda 127, onda 1023) her cevap kümesiyle kurulup her şema şema denetiminden, her kural dosyası `rulesProblems`'tan hatasız geçer. Ortak parçalar bir kez kurulur ve bağlar doğru yere gider. Kurulum `MemoryFs`'e yazılır, yarıda düşen kurulum hiçbir şey bırakmaz, Undo hepsini geri alır.
- **Zincir:** kurulu bir app'e şablon eklemek; yeniden adlandırılmış ve taşınmış ortak parçanın bulunması; aynı anahtarlı farklı türde alanın bırakılması; değiştirilmiş kurallar dosyasına ekleme; aynı adlı kuralın ikinci kez eklenmemesi.
- **Tanıtım notu:** yalnız kurulanı anlatır (seçilmeyen bir soru kuralı notta yok); linkleri kurulan dosyalara gider; Add to app değiştirilmiş notun yalnız sonuna ekler.
- **Kurallar uçtan uca:** Atlas'ta yapılanlar her şablon için: siparişte kalem hesabı (vergi dahil ve hariç, indirim), tahsilatta siparişin Paid olması, teslimde stok düşümü ve geri alınması, mal kabulü, Correct stock, transfer, masraf onayı ve geri ödeme, beklenen tahsilat.
- **Soru soran düğme:** `ask` okuma ve denetim, `input` ile çalışma, eksik zorunlu değer, ajanın `input`'u.
- **agent:** `create` ile app kurmak ve eklemek; rehberdeki örneğin bir kerede kurulması.
- **Tarayıcıda:** sihirbaz baştan sona, Add to app, Undo, soru soran düğme, telefon.

## 8. Dilimler

Arayüzü olan her dilim önce `design/mockups.html`'de mockup'la başlar ve onaydan sonra yazılır.

1. **Soru soran düğme:** `ask` ve `input`; kayıt ekranında, satır menüsünde ve telefonda soru penceresi; ajanın `input`'u.
2. **Şablonların çekirdeği ve ajan:** `apps/` (sorular, plan, kurulum, roller, tanıtım notu), yedi şablon, `_app.json`, şablon işareti; `create` ile `kind: "app"` ve rehber. Arayüzsüz ama ajanla hemen kullanılabilir.
3. **Sihirbaz:** New app, şablon kartları, sorular, özet, kurulum, Undo; telefon.
4. **Add to app:** kurulu app'e şablon eklemek; özet, Undo.
5. **Üç yeni şablon:** İşe alım, Demirbaş ve bakım, İçerik takvimi (3.8–3.10); sorular, kurallar, zincir, tanıtım notu, ajanın rehberi, testler. Yeni ekran yok, mockup yok.

## 9. PLAN'da değişenler

- Yeni bir aşama: Scrawl apps, 14. aşama, 13'ün hemen ardından; Dropbox ve sonrası birer sıra kayar (21 Ekim'de kararlaştırıldı).
- 4.6'ya şablonla kurulan app'ler ve şablon işareti.
- Sonraya kalanlar'a 10. bölüm.
- Roadmap panosuna yeni faz ve dört dilimin kartları.

## 10. İleride yapılacaklar

- **Randevu ve rezervasyon** (22 Ekim'de 15. aşamaya alındı, `design/calendar.md` 6; aşağıdaki ilk hali): Services (ad, süre, fiyat, veren çalışanlar), CRM'le ortak People (müşteriler), Appointments (müşteri, hizmet, çalışan, saatli başlangıç, durum Booked, Confirmed, Done, No-show, Cancelled; hesaplanan bitiş ve fiyat), soruya göre Resources (oda, masa, araç, cihaz); aynı çalışanın ya da kaynağın çakışan randevusu işaretlenir; Done randevu Satış ya da Bütçe varsa tahsilat açar. Sorular: neyin randevusu (hizmet, kaynak, ikisi), tek kişi mi ekip mi, ücret alınıyor mu. İstedikleri: tarih alanında saat (core, ajan, tablo, form ve telefonda saat seçici; mockup ister) ve koleksiyona takvim görünümü. Takvim yeniden tasarlanmaz: Upcoming'in ay takvimi koleksiyonun kayıtlarını seçilen tarih alanına göre gösterir, kayıtlı görünümün filtresiyle tek çalışanın ya da odanın takvimi olur, günün penceresi o günün kayıtlarını saat sırasıyla listeler; saat dilimli gün ve hafta görünümü daha sonra.
- **E-ticaret şablonu** (22 Ekim'de önerildi, aynı gün 15. aşamaya alındı, `design/calendar.md` 7): Satış'ın ve Stok'un üstüne oturur. Channels (Trendyol, Hepsiburada, Amazon, kendi site; komisyon %, sipariş başı sabit ücret, hakediş günü; sipariş sayısı, ciro, net kâr, iade oranı); Orders'a kanal, pazaryeri sipariş no, kargoya son gün, kargo firması, takip no, kargo maliyeti, Packed ve Shipped durumları, hesaplanan komisyon, ürün maliyeti, net kâr ve marj; Returns (sipariş, ürün, adet, neden, durum, iade tutarı); Products'a satılan, iade edilen, iade oranı, net kâr. Kurallar: Ship (kargo firması ve takip no), Return, iade Received olunca stoğa dönüş (Stok varsa), Refunded olunca iade ödemesi (Bütçe varsa), teslim edilen siparişin hakedişi beklenen tahsilat olarak (Bütçe varsa), kargoya son günü geçen sipariş işaretlenir. Destek varsa talep kanallarına pazaryeri soruları ve yorumları. Sorular: kanallar, kargo firmaları, iadeler, hakediş. Siparişlerin girişi: canlı bağlantı sunucu işi (sunucuda otomasyonla birlikte); içe aktarmanın pazaryeri sipariş no ile eşleşmesi ve satır satır gelen dosyayı siparişe ve kalemlere ayırması gerekir, bugün bunu ajan yapar. Açık kararlar: ayrı şablon mu Satış'ın sorusu mu, kanal ve kargo listelerinin varsayılanı bölgeye göre mi.
- **Stok:** lot ve seri numarası.
- **Kişinin kendi şablonu:** bir app klasörünü şablon olarak kaydetmek (Roadmap'te ROA-151).
- **Şablonun yeni sürümünü kurulu app'e uygulamak:** `_app.json`'daki sürümle mümkün; ilk sürümde yok.
