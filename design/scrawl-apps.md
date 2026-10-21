# Scrawl apps: hazır şablonlardan app kurmak (taslak)

Durum: 21 Ekim 2026'da onaylandı, PLAN.md'ye 14. aşama olarak işlendi. 1. dilim kodda (mockup 58c5b3d, kod 0508919). 2. dilim kodda: şablonların çekirdeği ve ajan.

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
- İlk sürümde yedi şablon var: CRM, Satış ve faturalama, Müşteri desteği, Proje yönetimi, Bütçe ve harcama, Stok ve satın alma, Ürün geliştirme (3. bölüm). İşe alım, Demirbaş ve bakım, Randevu ve rezervasyon, İçerik takvimi ileride yapılacaklar planında (10. bölüm).
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
- Tanıtım notu parçaları kendi dosyalarına link verir. Notlarda dosyaya link bugün açılmıyor (yalnız http ve mailto); bu ayrı bir iş olarak planlanacak. O gelene kadar not parçaları kalın adla yazar.

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

### 3.1 CRM

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

| Parça | Tür | İçinde |
|---|---|---|
| Requests | pano | New, In progress, Waiting on customer, Resolved, Closed; kartta şirket, kişi, kanal, tür (question, problem, request) |
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

## 4. Zincir

### 4.1 Ortak parçalar ve şablon işareti

Bir app'in her koleksiyonu şemasında hangi parça olduğunu taşır: `"role"` alanı (`companies`, `people`, `products`, `orders`, `order-lines`, `payments`, `budget-lines`, `expenses`, `stock-movements`, `stock-levels`, `locations`, `purchase-orders`, `purchase-order-lines`, `projects`, `time-entries`, `feedback`, `releases`…). Panolar da aynı işareti alır: pano dosyasında `"role"` (`deals`, `requests`, `work`, `roadmap`, `bugs`). Saved replies klasörü adından bulunur.

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

- **Türler:** `number`, `text`, `date`, `choice` (`options` ile), `link` (`collection` ile: transferde depo). `default` bir değer ya da kaydın alanlarını okuyan bir formüldür; `required: true` boş bırakılmasını engeller; `note` kutunun altındaki kısa satırdır (bir metin ya da ``() => `Now ${stock}` ``).
- **`say`:** düğmenin seçeneği; pencerenin başlığının altındaki cümle (``say: () => `${name} has ${stock} in stock` ``). Yazılmazsa kaydın adı görünür.
- **Liste indeksi:** `find("Locations")[0]`, `linked("Stock levels")[1]`; olmayan sıra boş verir. Formülde de geçerlidir.
- **Gövdede** `input.total` olarak okunur. Rules sekmesi `ask`'ı da denetler: olmayan tür, `input`'ta tanımlanmamış ad, türü tutmayan işlem satırında söylenir.
- **Pencere:** düğmeye basınca onay penceresinin yerine sorular gelir; `confirm` da varsa yapacakları altlarında sayılır ve girilen değerle yeniden hesaplanır. Telefonda sheet.
- **Ajan:** `save_record`'a `action` ile `input` verilir (`{ "total": 42 }`); eksik zorunlu değer reddedilir, satırıyla.
- **Satırın ··· menüsünden** basılan düğme de aynı pencereyi açar.

## 6. Teknik tasarım

### 6.1 Core

- **`packages/core/src/apps/`** yeni bir klasör:
  - `templates/` her şablon bir dosya: `crm.ts`, `sales.ts`, `support.ts`, `projects.ts`, `budget.ts`, `stock.ts`, `product.ts`. Her biri `AppTemplate` verir: `id`, `version`, `group`, ad ve açıklama (i18n anahtarları), `questions`, `build(answers, ctx)`.
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

- **core `apps`:** her şablon tek başına; yedi şablonun bütün birleşimleri (128) her cevap kümesiyle kurulup her şema şema denetiminden, her kural dosyası `rulesProblems`'tan hatasız geçer. Ortak parçalar bir kez kurulur ve bağlar doğru yere gider. Kurulum `MemoryFs`'e yazılır, yarıda düşen kurulum hiçbir şey bırakmaz, Undo hepsini geri alır.
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

## 9. PLAN'da değişenler

- Yeni bir aşama: Scrawl apps, 14. aşama, 13'ün hemen ardından; Dropbox ve sonrası birer sıra kayar (21 Ekim'de kararlaştırıldı).
- 4.6'ya şablonla kurulan app'ler ve şablon işareti.
- Sonraya kalanlar'a 10. bölüm.
- Roadmap panosuna yeni faz ve dört dilimin kartları.

## 10. İleride yapılacaklar

- **Yeni şablonlar:** İşe alım (pozisyonlar, adaylar, süreç panosu, görüşmeler), Demirbaş ve bakım, Randevu ve rezervasyon, İçerik takvimi.
- **Randevu ve rezervasyon'un istedikleri:** tarih alanında saat, gün ve hafta görünümü (takvim). İçerik takvimi de bunlardan yararlanır.
- **Stok:** lot ve seri numarası.
- **Kişinin kendi şablonu:** bir app klasörünü şablon olarak kaydetmek (Roadmap'te ROA-151).
- **Şablonun yeni sürümünü kurulu app'e uygulamak:** `_app.json`'daki sürümle mümkün; ilk sürümde yok.
