# Yeni app şablonları: iş ve kişisel

22 Ekim 2026'da onaylandı; PLAN'da 16. aşama. Kullanıcının seçtikleri: iş tarafında sekiz şablon, kişisel tarafta on bir şablon; şablon penceresinde Business ve Personal ayrımı.

Her şablon bugünkülerin yolunu izler (`packages/core/src/apps/templates/*.ts`): parçalar, alanlar, kurallar, düğmeler, takvim görünümü, tanıtım notu ve sorular; her soru bir cevapla hazır gelir. Ortak parçalar (People, Companies, Payments, Products) bugünkü gibi paylaşılır. Hesaplananlar formül, lookup ve rollup'tır; kurallar `_rules.js`'tedir.

## 1. Şablon penceresinde Business ve Personal

- Her şablonun bir kitlesi olur: `audience: 'business' | 'personal'`.
- Şablonlar adımının üstünde iki seçenek: **Business · Personal**. Kişisel space'te Personal ile, öbürlerinde Business ile açılır; seçim cihazda kalır.
- Bir app ya iş ya kişisel şablonlardan kurulur: iki tarafın parçaları birbirine bağlanmaz, verileri de çoğu zaman ayrı space'lerde durur. Öbür tarafa geçince seçilenler bırakılır. Add to app yalnız app'in kendi tarafındaki şablonları sunar.
- Kişisel şablonlar yalnız veri paylaştıklarıyla aynı app'e girer: Seyahat ve Paylaşılan harcamalar (Trips, Spending), Kişisel finans ve Paylaşılan harcamalar (kendi payın harcama olarak), Yakınlar ve Okuma (Recommended by bir yakına bağlanır), Spor ve Gym (Exercises). Öbürleri hep kendi app'i olur. Bir şablon seçilince uymayanlar soluk ve tıklanmaz, açıklamalarının yerinde "Set it up as its own app" yazar; Edit app'te app'teki şablonlar seçili sayılır; bağı kopan seçim kurulmaz, nedeni söylenir; ajan da buna uyar. İş şablonları hep birlikte seçilebilir (28 Ekim).
- İş şablonları bugünkü gruplarında kalır (Customers, Work, Money). Kişiseller üç grupta: **Money and home** (Kişisel finans, Ev araç ve belgeler, Tarifler), **Health** (Sağlık, Spor ve antrenman, Alışkanlıklar) ve **Life** (Seyahat, Paylaşılan harcamalar, İş arama, Yakınlar, Okuma ve izleme).
- Ajanın `create` aracı şablonları kitlesiyle listeler; iki taraftan şablonu aynı app'e koymaz, nedenini söyler.
- Ekranı değiştiği için önce mockup.

## 2. Dile ve takvime eklenenler

| Ek | Ne için | Nasıl |
|---|---|---|
| `months(n)`, `years(n)` | yenileme, aidat, fatura, doğum günü | bir güne eklenince takvim ayı ve yılı ekler: `renews + months(1)`; 31 Ocak + 1 ay 28 ya da 29 Şubat olur |
| `workdays(a, b)` | izin günleri | iki gün arası (ikisi dahil) Pazartesi–Cuma gün sayısı; tatiller kuralda düşülür |
| Takvimin başlangıcı formül olabilir | her yıl Upcoming'e gelen doğum günü | formül bir gün veriyorsa takvim onunla çalışır; böyle kayıt sürüklenmez, yalnız açılır |

Hepsi core'da, testli; ajan rehberi anlatır.

## 3. İş şablonları

### 3.1 Abonelikler ve tekrarlayan gelir (Money)

Spor salonu üyeliği, bakım anlaşması, yazılım aboneliği, aylık danışmanlık gibi her tekrarlayan satış.

- **Plans:** ad, dönem (Monthly, Quarterly, Yearly), fiyat; aktif abone sayısı, aylık değer toplamı.
- **Subscriptions:** müşteri (People ya da Companies, CRM ile ortak), plan, tutar (plandan), dönem (plandan), başlangıç, yenileme günü, durum (Trial, Active, Paused, Cancelled), iptal günü ve nedeni; aylık değer (MRR: tutar ÷ dönemin ay sayısı).
- **Müşteriye:** aktif abonelik sayısı, aylık değer.
- **Düğmeler:** Renew (yenileme gününü bir dönem ileri alır; Bütçe varsa gelen ödeme yazar), Pause, Resume, Cancel (nedenini sorar).
- **Kontrol:** yenileme günü geçmiş aktif abonelik işaretlenir.
- **Takvim:** yenileme gününe göre, aktifler; Today ve Upcoming'de.
- **Görünümler:** Active (aylık değer toplanır: MRR), Cancelled (iptal gününe göre).
- **Sorular:** ne satıyorsunuz (abonelik, üyelik, hizmet anlaşması; yalnız adlar değişir), planlarınız (liste, "Basic monthly"), deneme süresi var mı, müşteriler şirket mi kişi mi (CRM yoksa), Bütçe seçiliyse yenileme ödeme olarak yazılsın mı.

### 3.2 Sözleşmeler ve yenilemeler (Work)

Kira, sigorta, tedarikçi, bakım, yazılım lisansı, müşteri sözleşmesi.

- **Contracts:** ad, karşı taraf (Companies ya da People), tür, sahibi, başlangıç, bitiş, kendiliğinden yenilenir mi, ihbar süresi (gün), son iptal günü (formül: bitiş − ihbar süresi), tutar, dönem, yıllık tutar, durum (Draft, Active, Ended, Cancelled); belge kaydın ekinde.
- **Düğmeler:** Renew (başlangıç ve bitişi bir dönem ileri alır), End, Cancel.
- **Kontrol:** kendiliğinden yenilenen ve son iptal günü geçmiş sözleşme "Notice passed; it renews" diye işaretlenir.
- **Takvim:** son iptal gününe göre, aktifler, Today ve Upcoming'de; ikinci görünüm bitiş gününe göre.
- **Sorular:** hangi sözleşmeler (çoklu seçim: customer, supplier, lease, insurance, software, service), ihbar süresi varsayılanı (30 gün), yazılım lisanslarında koltuk sayısı tutulsun mu.

### 3.3 İzinler ve ekip (Work)

- **Employees:** ad, e-posta, telefon, ekip, yönetici, işe başlama, yıllık izin hakkı; bu yıl kullanılan (onaylı izinlerin günleri), kalan.
- **Leave requests:** çalışan, tür, ilk ve son gün, gün sayısı (`workdays` eksi tatiller, kaydederken), durum (Requested, Approved, Rejected, Cancelled), onaylayan, not.
- **Holidays:** ad, gün; kurulurken bölgenin bu yılki resmi tatilleri.
- **Düğmeler:** Approve, Reject (nedenini sorar).
- **Kontroller:** aynı çalışanın çakışan izni; kalan hakkı aşan izin. İkisi de işaretlenir, reddedilmez.
- **Takvim:** onaylı izinler ilk günden son güne, türüne göre renkli; Today'de kimin yok olduğu. Tatiller ayrı görünüm.
- **İşe alımla:** Hire, işe alınanı Employees'e de ekler.
- **Sorular:** izin türleri (liste: Annual, Sick, Unpaid, Remote), yıllık izin hakkı (Türkiye'de 14, başka yerde 20 gün), resmi tatiller eklensin mi, izinler onaylanıyor mu.

### 3.4 Hedefler (Work)

Satış hedefinden çeyreklik ekip hedeflerine.

- **Goals:** ad, dönem, sahibi, bitiş günü, ilerleme (ölçütlerin ortalaması), durum (On track, At risk, Off track, Done).
- **Key results:** hedef, ad, başlangıç değeri, hedef değer, şimdiki değer, birim, ilerleme (0–%100 arasında).
- **Check-ins (soruya göre):** ölçüt, gün, değer, not. Update düğmesi yeni değeri ve notu sorar, ölçütü günceller ve kaydı ekler.
- **Takvim:** hedeflerin bitiş gününe göre.
- **Proje ve Ürün ile:** projeye ve yol haritası kartına hedef bağlantısı.
- **Sorular:** dönem (çeyrek, yarıyıl, yıl), ilerleme kayıtları tutulsun mu.

### 3.5 Olaylar ve düzeltici faaliyetler (Work)

Hizmet kesintisi, kalite sorunu, iş kazası ve ramak kala, büyüyen müşteri şikayeti, güvenlik olayı.

- **Incidents:** başlık, tür, önem (Critical, Major, Minor), başlangıç ve bitiş (saatli), süre, durum (Open, Investigating, Resolved, Closed), sorumlu, kök neden; rapor kaydın gövdesinde.
- **Actions panosu:** düzeltici faaliyetler kart olarak (To do, Doing, Done), olaya bağlı, son günleri Upcoming'de.
- **Düğmeler:** Resolve (bitişi şimdi yapar), Close, Add action (başlığı, kimin ve son günü sorar; panoya kart açar).
- **Kontrol:** kök nedeni yazılmadan kapatılan olay işaretlenir.
- **Takvim:** olaylar başlangıçtan bitişe, önemine göre renkli; Today'de değil.
- **Destekle:** talepten olay açılabilir, olayın talepleri görünür.
- **Sorular:** olay türleri (liste: Outage, Quality, Safety, Complaint, Security), düzeltici faaliyetler panoda tutulsun mu.

### 3.6 Saha servisi ve iş emirleri (Customers)

Asansör, klima, beyaz eşya, tesisat, bakım firmaları.

- **Equipment:** müşterinin yerindeki cihaz: müşteri, adres, tür, marka ve model, seri no, kurulum günü, periyodik bakım aralığı, sonraki bakım.
- **Work orders:** müşteri, cihaz, tür (Repair, Maintenance, Installation, Inspection), teknisyen, saatli başlangıç, süre, durum (Open, Scheduled, In progress, Done, Cancelled), işçilik saati, fiyat; servis raporu gövdede.
- **Work order lines:** kullanılan parça (Products) ve adedi; Stok varsa iş Done olunca stoktan düşer.
- **Technicians:** ad, telefon, mesai; Randevu'daki Staff gibi.
- **Düğmeler:** Schedule (teknisyeni ve saati sorar), Start, Done (raporu sorar; periyodik bakımsa sonraki bakımı yazar), Invoice (Satış varsa sipariş, Bütçe varsa ödeme açar).
- **Kontroller:** aynı teknisyenin çakışan işi; bakım günü geçmiş cihaz.
- **Takvim:** iş emirleri teknisyene göre renkli, Today ve Upcoming'de; her teknisyenin kendi takvimi; cihazların sonraki bakımı ayrı görünüm.
- **Sorular:** hangi işler (onarım, bakım, kurulum), teknisyenler (liste), parçalar stoktan mı düşsün (Stok seçiliyse), periyodik bakım anlaşmaları var mı, faturalama (Satış ya da Bütçe seçiliyse).

### 3.7 Danışmanlık: müşteriler ve işler (Customers)

Danışmanlık firmaları; muhasebe ve hukuk büroları bir soruyla.

- **Clients:** Companies ya da People (CRM ile ortak).
- **Engagements:** müşteri, tür, ücret modeli (Fixed, Hourly, Retainer), bütçe (saat ve tutar), başlangıç ve bitiş, durum (Proposal, Active, On hold, Done); harcanan saat, faturalanmamış tutar, bütçenin kullanılan payı.
- **Deliverables:** iş, ad, sahibi, son gün, durum; son günler Upcoming'de.
- **Time entries:** iş, kişi, gün, saat, faturalanır mı, ücret, tutar. Proje şablonundaki Time entries ile ortak parça.
- **Expenses:** iş, gün, tutar, faturalanır mı.
- **Düğmeler:** Log time (saati ve notu sorar), Bill (faturalanmamış saat ve masrafları toplar; Bütçe varsa gelen ödeme yazar, kayıtları faturalandı yapar).
- **Kontrol:** bütçesini aşan iş işaretlenir.
- **Tekrarlayan son tarihler (soruya göre):** müşteri, ad, son gün, tekrar (Monthly, Quarterly, Yearly), durum. Done olunca bir sonraki dönemin kaydı açılır (`months(n)`). Takvimde, Today ve Upcoming'de.
- **Takvim:** teslimler ve son tarihler.
- **Sorular:** ücret modelleri, saat tutuluyor mu, tekrarlayan son tarihler var mı (liste, "VAT return monthly"), Bütçe seçiliyse fatura ödeme olarak yazılsın mı.

### 3.8 Dernek ve kulüp: üyeler, aidat, bağışlar (Customers)

- **Members:** ad, iletişim, üyelik türü, üyelik başlangıcı, durum (Active, Lapsed, Left), gönüllü mü, becerileri; ödenen ve geciken aidat.
- **Dues:** üye, dönem, tutar, son gün, durum (Due, Paid, Waived). Issue dues düğmesi aktif üyelere dönemin aidatını yazar; Paid olunca Bütçe varsa gelen ödeme.
- **Donations (soruya göre):** bağışçı (People), tutar, gün, kampanya, makbuz no.
- **Campaigns (soruya göre):** hedef tutar, toplanan, başlangıç ve bitiş.
- **Kontrol:** son günü geçmiş ödenmemiş aidat işaretlenir; üye bir dönemden fazla geciktiyse durumu Lapsed olur.
- **Takvim:** aidat son günleri, Today ve Upcoming'de; kampanyalar başlangıçtan bitişe.
- **Sorular:** aidat (aylık, yıllık, yok) ve tutarı, üyelik türleri (liste), bağışlar tutulsun mu, kampanyalar tutulsun mu, Bütçe seçiliyse ödemeler oraya yazılsın mı.

## 4. Kişisel şablonlar

Kişi için kurulur; para birimi kişisel finansta sorulur.

### 4.1 Kişisel finans (Money and home)

28 Ekim, en az giriş ölçütüyle baştan (Spendee, Wallet, Money Manager, YNAB, Monarch örnek). Mockup: `design/mockups.html` › Kişisel finans: tutar önce, ay bir bakışta.

- **Transactions (ana ekran):** ekleme tutarla başlar; Out, In ya da Transfer; kategori çiplerden, en çok kullanılan önde; hesap son kullanılan, gün bugün; Description isteğe bağlı, boşsa kategorinin adı (altında bu açıklama yazar). Transfer "To" hesabını sorar, birinden düşer ötekine ekler. Tablo bu ayla açılır, günlere göre gruplu, her günün toplamı; ayın gelir, gider ve neti üstte. Tutar işaretli ve renkli. Formda "This month" ve "Bill" yok.
- **Accounts:** tabloda ad, tür, bakiye ve toplam; açılış bakiyesi yalnız pencerede. Aktarım iki hesabı da doğru etkiler. Borçlu kart kırmızı.
- **Categories:** Spending ya da Income. Tek görünüm (All): bütün kategoriler, türü sütunda, her birinde bu ay harcanan; limiti olanda "₺3.200 of ₺5.000" çubuğu, kalan, durum On track, Close (%90'dan çok), Over. Ayrı Budget görünümü yok. Home'daki bütçe kutusu yalnız limiti olanları gösterir, hiçbiri yoksa limit vermeyi söyler.
- **Recurring (Bills yerine):** ad, tutar, Out ya da In, sıklık (Weekly, Monthly, Every 3 months, Every 6 months, Yearly; Custom), sonraki gün, hesap, kategori, Paid automatically (varsayılan açık). Tutar boş olabilir: boşken kendiliğinden yazılmaz, Today'de Paid ile ilk sefer sorulur ve tutulur. Kendiliğinden olan günü gelince işlemini kendisi yazar ve bir sonraki döneme geçer; yazılan işlem o gün Today'de görünür, toast ve Undo. Tutarı değişen (elektrik) Today'de Paid ile, tutarı sorar; ödenmezse Overdue'da kalır. Tutar penceresinden değişir, sonrakiler yeni tutarla yazılır, öncekiler kalır; eklenir, silinir. Penceresinde yazılan işlemleri.
- **Home:** Today şeridi; ayın geliri, gideri, neti ve en çok harcanan; hesap bakiyeleri ve toplamı; bütçe çubukları; yaklaşan düzenli kayıtlar.
- **Hazır veri:** yaklaşık 20 harcama kategorisi ve Salary, Freelance, Other income; hesaplar sihirbazdan.
- **Sorular:** hesaplar; her seferinde aynı gelen ve giden, sütunlu satırlar: Name, Amount, In or out, Every, Day, Category. Hazır satırlar tutarsız gelir: Salary (15), Rent (1), Electricity, Water, Natural gas (20), Internet (5), Phone (10), Building fee (5), Streaming (12). Hesap ilk hesap; sonraki gün o ayın ya da gelecek ayın o günü. Elektrik, su, doğalgaz kendiliğinden yazılmaz, her ay Paid ile. Aylık bütçe tutulsun mu.
- **Açıklamalar:** adı yetmeyen alanların altında kısa açıklama: Description, Opening balance, Monthly limit, Recurring'de Amount, Next, Paid automatically.
- **Telefon:** büyük tutar, Out/In/Transfer, kategori çipleri, Add; işlemler günlere göre.
- **Uygulamanın geri kalanıyla:** Today'de Paid ve kendiliğinden yazılanlar, Overdue'da ödenmeyen; Upcoming'de yaklaşan düzenliler; Shared expenses kişinin payını yazmaya devam eder.
- **Altyapı:** ad alanı isteğe bağlı (`optional`, kural doldurur); varsayılan `=last()` (son kayıttaki değer); bağ alanı formda çip (`chips`, en çok kullanılan önde); rollup'ta tek bağ (`via`); takvimde kendiliğinden basılan düğme (`auto`: bir tik alanı; uygulama açılınca günü gelmiş olanlar bir kez); Home kartında değer (parçanın `home` ayarı) ve ay toplamları.
- Önceden kurulmuş Personal finance app'leri olduğu gibi kalır.

### 4.2 Ev, araç ve belgeler (Money and home)

28 Ekim, kullanıcının denemesinden baştan:

- **Documents:** yalnız belgeler: kullanım kılavuzu, pasaport, poliçe, garanti belgesi. Ad, ait olduğu ev ya da araba (boş olabilir), bitiş günü (boş olabilir), hatırlatma (bitişten 30 gün önce). Dosya notlara eklenir. Tür, numara, mağaza yok.
- **Reminders:** tekrar eden her iş, evde ve arabada: kombi bakımı, su arıtma filtresi, muayene, sigorta, servis, lastik. Ad, ait olduğu ev ya da araba, aralık, sonraki gün, son yapıldığı gün. Done son yapıldığı günü bugün yapar, sonrakini aralığa göre yazar; günü geçen işaretlenir. Done Today satırında da var; günü geçen, Done'a basılana dek Overdue'da kalır (28 Ekim, Health ile).
- **Aralık:** hazır kalıplar Weekly, Monthly, Every 3 months, Every 6 months, Yearly, Every 2 years; ve Custom: sayı ve birim (Days, Weeks, Months, Years), yalnız Custom seçilince görünür (`design/shown-when.md`). Km tutulmaz.
- **Homes** ve **Cars:** her ev ve her araba bir kayıt; penceresinde kendi hatırlatmaları ve belgeleri. Arabanın sıradaki günü hatırlatmalarının en yakını, günü geçen hatırlatması olan araba işaretlenir.
- Tek ev ya da tek araba varken boş bırakılan ev ya da araba kaydederken ona bağlanır.
- **Takvim:** bitecek belgeler ve hatırlatmalar Today ve Upcoming'de.
- **Sorular:** neleri tutuyorsunuz (Documents, Cars, Home reminders), evler (Home), evdeki hatırlatmalar (kombi bakımı her yıl, duman dedektörü pilleri her yıl, klima filtreleri 3 ayda bir, su arıtma filtreleri 6 ayda bir), arabalar (Car), arabanın hatırlatmaları (muayene 2 yılda bir, sigorta, servis her yıl, lastik 6 ayda bir). Hazır hatırlatmalar her ev ve her araba için ayrı kurulur; aralık adından okunur: bir kalıp o kalıp, `every 10 days` gibisi Custom; söylemiyorsa yıllık.
- Önceden kurulmuş Home app'leri olduğu gibi kalır.

### 4.3 Sağlık (Health)

28 Ekim, kullanıcının "en az giriş" ölçütüyle baştan (Medisafe, MyTherapy, aile sağlık uygulamaları örnek). Mockup: `design/mockups.html` › Sağlık: en az girişle.

- **Medicines:** ad, kimin, doz, günde kaç kez (Once a day, Twice a day, 3 times a day, As needed), kutudaki adet, başlangıç (bugün). **Runs out** hesaplanır: başlangıç + adet / günlük; bitmeden 5 gün önce Today ve Upcoming'e gelir, az kalan işaretlenir. **Refilled** başlangıcı bugün yapar; **Stopped** listeden çıkarır (Taking görünümü). Elle yazılan "ne zaman" ve "yeniden alma günü" yok.
- **Appointments:** adı doktor (Doctor), kimin, saatli gün, nerede; daha önce yazılan doktorlar ve yerler yazarken öneri olarak çıkar. Takvimi Today ve Upcoming'de. **Book follow-up**: In 2 weeks, 1 month, 3 months, 6 months, 1 year; aynı doktor, yer ve kişiyle o güne yeni randevu. Ayrı doktor kaydı ve ekranı yok (28 Ekim, kullanıcı: kimse doktor kaydetmez).
- **Check-ups:** tekrar eden kontroller ve aşılar (diş, yıllık kontrol, göz, grip aşısı); her kişi için ayrı; aralık Home'un Reminders'ındaki gibi (hazır kalıplar ve Custom); Done son günü ve sıradakini yazar; günü geçen işaretlenir. Ayrı Vaccinations ekranı yok.
- **Records:** tahlil, rapor, reçete, görüntüleme: ad, tür, gün, kimin; dosya notlarda. Düz "Result" metni yok.
- **Aile:** kişi alanı yalnız aile seçilince; kontroller her kişi için kurulur.
- **Today satırı:** ilaç "Medicines · kişi · 5 days left" ve **Refilled**; kontrol "Check-ups · kişi" ve **Done**; randevu "Appointments · kişi · yer". Günü geçen kontrol ya da ilaç Done/Refilled'a basılana dek Overdue'da kalır. Bunun için her takvime: `button` (Today satırındaki düğme, kurallardan bir action) ve `words` (satırın koleksiyondan sonra söylediği alanlar); düğmesi olan takvimin günü geçen kaydı late olarak kalır.
- **Pencereler:** ilaçta Status, Left ve Remind on gizli (Stopped düğmesi, tablo Left'i "5 days left" diye yazar); randevunun adı doktorun kendisi, ayrı başlık yok.
- **Önceden yazılanı önermek:** her koleksiyonda bir yazı ya da ad alanı `suggest` ile, yazarken diğer kayıtlarda o alana yazılanları en çok yazılan önce önerir (masaüstünde alanın altında liste, telefonda alanın altında çipler; Fields'ta "Suggest what was written").
- **İlaç alma hatırlatması yok:** her doz için Today'de satır günlük işaretleme yükü getirir; yalnız bitiş hatırlatılır.
- **Sorular:** kimin için (ben, aile; aileyse kişiler), ilaçlar tutulsun mu, tekrar eden kontroller (liste: Dentist every 6 months, General check-up every year, Eye exam every 2 years, Flu shot every year).
- Önceden kurulmuş Health app'leri olduğu gibi kalır.

### 4.4 Tarifler ve yemek planı (Money and home)

28 Ekim'den beri `design/meal-plans.md`: günlük yemek planının yerine beslenme programı (Plans) ve takibi (Days), tarife Link. İlk hâli:

- **Recipes:** ad, tür, süre, kaç kişilik, etiketler; yapılışı gövdede.
- **Ingredients:** tarif, malzeme, miktar.
- **Meal plan:** gün, öğün (Breakfast, Lunch, Dinner), tarif.
- **Shopping list:** malzeme, miktar, alındı mı, tarif.
- **Düğme:** Add to shopping list (tarifin ya da haftanın malzemelerini listeye yazar).
- **Takvim:** haftalık yemek planı.
- **Sorular:** öğünler (liste), alışveriş listesi tutulsun mu.

### 4.5 Seyahat (Life)

29 Ekim, mağaza ekranlarına bakılarak ikinci kez (TripIt, Wanderlog, PackPoint). Mockup: `design/mockups.html` › Seyahat, taslak 2.

- **Gezi penceresi:** başlıkta adı ("Rome · Nov 2026", kendiliğinden) ve altında "12–16 Nov · 5 days · in 14 days" (TripIt). Üç sütun: solda nereye, ilk ve son gün (ikisi de boş kalabilir, "No days yet"), bütçe, tek satır "$300 spent · $1700 left · $340 a day", To do; ortada rezervasyonlar gün başlıklarıyla, her biri saati, türünün simgesi (✈ 🏨 🚗 🚆 🎟), adı ve tek satırı, otel giriş gününde "check in", çıkış gününde "check out" (TripIt); altında numaralı gidilecek yerler, günüyle (Wanderlog); sağda gezinin türü çiplerle, valiz gruplara göre yuvarlak tikli, "1 of 41 done", tiklenen üstü çizili (PackPoint); harcamalar ad ve tutarla. Notes yok.
- **Rezervasyon:** tür yan yana seçimle; Flight'ta uçuş no, koltuk, From, To, Departs ve Arrives; Train'de koltuk, From, To; Hotel'de otelin adı, adres, Check in ve Check out; Car'da Pick up ve Drop off; Event'te adı ve adres. Confirmation, Cost, notlarda yalnız ek (bilet). Uçuşun ve trenin adı kendiliğinden "IST → FCO". Cost kendi harcamasını yazar, değişince harcama da.
- **Harcama (yalnız Seyahat):** başlık, tutar ve yanında birim (app'te ikinci birim varsa), yabancı birimde "1 EUR = 1,1 $" satırı, kur o birimde son kullanılan; ne zaman; gezi bugünkü gezi, yoksa son kullanılan. Kategori yok. Notlarda yalnız ek (fiş).
- **Geziler listesi:** ad, ne zaman, kalan bütçe ("$1600 left", aşanda "over"), valiz ("40 to pack").
- **Packing list:** 62 hazır madde, gruplar, her birinin Taken on'u çiplerle; Home'da kutusu yok.
- **Home:** sıradaki gezi büyük, altında günleri, valizi ve kalan bütçesi, "in 14 days". Harcamaların ve Packing list'in kutusu yok.
- **Shared expenses ile:** gezi grup olur; yeni gezi kurulumdaki kişileri alır; sağ sütunda People (bakiyeleriyle) ve Who pays whom (tikli); rezervasyonda Paid by; harcama Paylaşılan harcamalar'daki gibi.
- **Takvimler:** gezilerin ve rezervasyonların takvimi sekme değil, yalnız Today ve Upcoming için.
- **Sorular:** neleri tutuyorsunuz (gidilecek yerler, valiz listesi, harcamalar). "Başka para birimi" sorusu yok: birimler app'in birimleri.
- **Altyapı:** alanın etiketi başka alanın seçimine göre (`labelBy`); bir alanın yanında öbürü (`beside`); kur cümle olarak (`rate`); pencerenin başlığı kaydın adı ve bir satır (`head`); alan ya da blok belli sütunda (`place`, `column`); notlar yalnız ek ya da hiç (`notes`); bağlı blokların görünüşü (`look`): `days` (gün gün, simge, giriş ve çıkış), `checklist` (yuvarlak tik, gruplar, numaralı), `split`; blokta başlık (`title`); gizli takvim (`hidden`); Home'da büyük ilk kayıt (`first`) ya da kutusuz (`off`); dilde `monthday()` ve `monthname()`; kaydedince çıkan bildirim kural adı olmadan ("41 things added · 3 members added").
- **Mockup'tan farklar:** rezervasyonda alanlar ikişerli yan yana değil alt alta, tür seçiminde simge yok (simge gezide); paralar binlik ayraçsız ("$31400", formül metni); bütçe çubuğu yok, tek satır yazı; valiz kısaltılmadan tam liste ("26 more" yok); bakiyeler renksiz; Settle up solda düğme, People başlığında değil; paylaşılan gezide valiz de sağ sütunda; harcama penceresinde gezi alanı görünür (mockup'ta başlıkta); Home'da "Coming bookings" kartı yok; telefonda gezinin sekmeleri Details, Bookings, Places, Packing, Expenses, People, Who pays whom (mockup'ta Money tek sekme).

### 4.6 İş arama (Life)

29 Ekim, Huntr, Teal ve Simplify'ın ekranlarına bakılarak baştan. Mockup: `design/mockups.html` › İş arama.

- **Applications:** listede üstte aşamalar sayılarıyla ("6 Saved · 7 Applied", Teal), satırda pozisyon, şirket, aşama noktaları (Simplify), ne zamandır ("12 days") ve sıradaki iş ("Interview · Thu 14:00", "Follow up on 12 Nov", Saved'de "1 of 4 done"). Active (bitenler hariç) ve All.
- **Yeni başvuru:** başlıkta pozisyon, altında aşama çubuğu; Company, Location (önceden yazılanlar önerilir), Job post; notlar ve ek. Gerisi kaydedince (Simplify, Huntr).
- **Başvuru penceresi:** başlıkta pozisyon, altında "Linear · Remote · applied 12 days ago"; tıklanan aşama çubuğu Saved → Applied → Screening → Interview → Offer, sonda Accepted ve Rejected (Teal). Solda Company, Location, Job post, Salary, Contact, Contact email, notlar (ilan metni, CV); sağda Interviews gün gün (Teal'in Interview Tracking'i) ve To do.
- **Kendiliğinden:** aşama değişince haber günü bugün; Saved'den çıkınca başvuru günü; Saved'de açılan başvuruya hazır To do (Tailor your resume, Write a cover letter, Find a referral, Apply); görüşme eklenince haber günü ve aşama Interview.
- **Takip:** gönderilmiş, bitmemiş ve seçilen süre (7, 14, 21 gün) ses çıkmayan başvuru Today'de **Followed up** düğmesiyle; basınca bir hafta sonra yine gelir, basılmazsa Overdue'da kalır.
- **Interviews (başvurunun satırları):** ne zaman (saatli), tür (Phone screen, Technical, Culture, Panel, Final, Other), kiminle, notlar; adı kendiliğinden "Technical · Software Engineer, Linear"; Today'de saatiyle. Menüde yok.
- **Home:** aşama sayıları, bugünün görüşmeleri ve takipleri.
- **Companies kalktı** (şirket başvurunun içinde yazılır); Source, Last heard ve Next step alanları yok.
- **Sorular:** aşamalar (liste, hazır), kaç gün sonra takip (A week, Two weeks, Three weeks).
- **Altyapı:** seçimde `steps` (formda ok çubuğu, tabloda noktalar, telefonda kayan çubuk; `end` ve `no`), pencere başlığında aşamalar (`head.steps`), görünümde ve Home'da aşama sayıları (`counts`), yeni kaydın sorduğu alanlar (`layout.new`), zorunlu adın yer tutucusu alanın adı.
- **Mockup'tan farklar:** yeni başvuruda Position ayrı kutu değil başlık, aşama seçimi düğmeler değil çubuk; pencerede solda Followed up düğmesi de var; görüşme satırının adı pencerede de uzun ("Technical · Software Engineer, Linear"); görüşmenin saati yoksa satırda saat yok; Home'da "This week: 3 applied · 2 interviews" satırı yok; telefonda To do ayrı sekme değil Details'in altında, yeni başvuruda aşama yok (Saved gelir); listede pozisyonun altında şirket değil, şirket ayrı sütun.

### 4.7 Yakınlar ve doğum günleri (Life)

29 Ekim, hip, Dex ve Garden'ın ekranlarına bakılarak baştan. Mockup: `design/mockups.html` › Yakınlar ve doğum günleri.

- **People:** ad, yakınlık (çipler), doğum günü ve yıldönümü (gün ve ay, yıl bilinirse: `--11-12` ya da `1990-11-12`), telefon, e-posta, Keep in touch (Every week … Every year, hazır aralık sorudan), notlar. Başlıkta "Friend · birthday on 12 Nov · last talked 33 days ago" (Dex); yeni kişide ad, yakınlık, doğum günü, telefon, Keep in touch.
- **Görünümler:** Birthdays sıradaki güne göre, Today, Tomorrow ve ay ay (hip), satırda "Turns 36 · 29 Oct" ya da yılsızda "12 Nov" ve "in 14 days"; Keep in touch sırası gelene göre, "3 days late", "4 weeks left", son konuşma (Garden).
- **Today:** doğum günü ve yıldönümü gününde **Wished** düğmesiyle (bir Message anı yazılır, gün gelecek yıla geçer; hip); sırası gelen kişi **Talked** ile (bugüne bir an yazılır; Garden'ın In touch today'i), geç kalan Overdue'da. Sıra ilk konuşmadan sonra sayılır; hiç konuşulmamış kişi Today'e gelmez, "Not talked yet" der.
- **Moments (kişinin satırları):** ne zaman, tür (Call, Visit, Message), not; kişinin penceresinde gün gün (Dex). Menüde yok.
- **Home:** sıradaki doğum günleri; bugünün Wished ve Talked satırları.
- **Sorular:** yıldönümleri de mi, hazır Keep in touch aralığı (Every week … Every 3 months, No reminders).
- **Altyapı:** yılsız gün (`yearless`, `--MM-DD`; formda gün, ay ve isteğe bağlı yıl; tabloda "12 Nov"); dilde `upcoming(gün, -den)` (bir günün sıradaki gelişi, 29 Şubat artık olmayan yılda 28'i) ve yılsız günde `year()` boş; formül metnine göre gruplama (kayıtların sırasıyla).
- **Mockup'tan farklar:** Call ve Message düğmeleri masaüstünde yok (telefonda telefon ve e-posta yazılınca var); Talked ve Wished başlığın altında değil solda, Wished gününde değilse soluk; yıldönümü doğum gününün yanında değil altında; Keep in touch'ta "3 days late" renksiz; anın adı pencerede "Talked with Can Demir"; Home'da ayrı Keep in touch kutusu yok (sırası gelenler Home'un Today'inde); ay başlığında yıl da var ("Nov 2026").

### 4.8 Okuma ve izleme listesi (Life)

29 Ekim, Sequel, MyAnimeList ve StoryGraph'ın ekranlarına bakılarak baştan: her tür kendi ekranında. Mockup: `design/mockups.html` › Okuma ve izleme.

- **Tür başına ekran:** kurulumda seçilen her tür menüde bir ekran (Books, Films, Series, Anime, Manga, Webtoons, Podcasts, Games), sonra Lists, Quotes, Years. Altta tek koleksiyon (Library), her ekran onun türe süzülmüş görünümü; listeler, alıntılar ve yıl hedefi bütün türleri sayar. Bir ekranda eklenen kayıt o türle gelir, tür sorulmaz (Sequel'in Movies, Series, Games, Books bölümleri).
- **Durumlar türün diliyle:** değer aynı (Want, In progress, Paused, Done, Dropped), görünen ad türe göre: anime ve dizide Plan to watch, Watching, On hold, Completed, Dropped (MyAnimeList); kitap, manga ve webtoonda Plan to read, Reading; podcastte Plan to listen, Listening; filmde yalnız To watch ve Watched (Sequel); oyunda Wishlist, Playing, Played. Up next kalktı.
- **Ekranın listesi:** duruma göre gruplu, sırası In progress, Want, Paused, Done, Dropped; Done ve Dropped kapalı başlar, yalnız sayıları görünür. Satırda kapak, ad ve altında tek satır ("TV · 2024 · Netflix", "Andy Weir · 476 pages"), ilerleme ve çubuğu (toplamı bilinmeyende çubuk yok), +1 ya da Update, puan, bir not ("New episode today", "11 to go", "Every Sunday").
- **Alanlar türe göre:** kitapta yazar ve sayfa; mangada bölüm ve cilt, "Ch. 254 / 374 · Vol. 22 / 42" (MyAnimeList); dizide sezon ve bölüm, "S2 · E6 / 10" (Sequel); anime ve podcastte bölüm; filmde yönetmen ve süre, ilerleme yok; oyunda platform ve kaç saatte biter. Hepsinde puan, nerede ve linki, bilgi linki, kimin önerdiği. Türler (Genres) türe göre hazır gelir. Ödünç yalnız kitapta ve mangada.
- **İlerleme:** anime, dizi, manga, webtoon ve podcastte satırda ve pencerede **+1**: bir bölüm yazar, toast ve Undo; sonuncuda Done. Kitapta **Update** sayfayı sorar (StoryGraph). Her ilerleme günlüğe yazılır, pencerede gün gün.
- **Yeni bölüm:** yayını süren için "New episode every" haftanın günleri; o gün Today'de "Dandadan · E7 out" ve **Watched** (mangada Read), kaçan birikmez. Çıkış günü (Comes out) Today ve Upcoming'de.
- **Pencere:** başlıkta ad, altında "Anime · 2023 · 28 episodes · Crunchyroll · watching since 2 Oct" (MyAnimeList). Solda durum, puan, türler, nerede, bilgi linki, kimin önerdiği, yorum; sağda ilerleme ve +1, izlenenler gün gün, alıntılar.
- **Home:** Today satırları; her tür bir kutu, "3 watching" ve ilk kayıtlar ilerlemesiyle (Sequel'in Saved'i); yılın kutusu, "14 of 24 finished · on track".
- **Sorular:** türler, nerede, yıllık hedef, alıntılar, ödünç, çıkış günleri. "İlerleme tutulsun mu" sorusu kalktı.
- **Altyapı:** şablon menüsünde bir görünümle açılan ekran, adıyla (`{ role, view, name }`; kişinin menüsünde `name`, gizlenen ekran `yol#görünüm`); görünümüyle açılan ekranda öbür görünümlerin sekmesi yok; görünümün koşulu yeni kaydın değeri (`viewValues`, telefonda + da); seçeneğin adı ve sunulması başka alana göre (`choicesBy`); görünümde kapalı başlayan gruplar (`closed`) ve her satırda bir düğme (`button`); satırın adının altında bir alan ve kapağı (`line`); düğmenin bildirimi (`done`); pencerede düğmeler bir sütunda (`actions` bloğu); seçim sıralaması seçeneklerin sırasıyla; çalışamayan ve nedenini söylemeyen düğme görünmez; Home'da kapalı grubu olan görünüm ilk durumunu sayar ("3 watching"); telefonda birkaç alan soran yeni kayıt adını da sorar.
- **Mockup'tan farklar:** kapak yalnız linki verilince resim, renkli harf kutusu yok; tür ekranlarında All, Airing, Lent sekmeleri yok (ekran tek görünüm); satırın altında "TV" yok, "2024 · Netflix"; not sütununun başlığı "Note"; pencerede sağda büyük "E17 of 28" yok, Episode kutusu ve +1, izlenenler "Log" listesi; Today'de koleksiyon adı "Library", Watched'ın bildirimi "Frieren: done today"; yeni kayıtta Episodes ile Where alt alta; araç çubuğunda "Filter · 1" ve "Group by Status" görünür.

22 Ekim'deki ilk hâli:

- **Library:** her eser.
  - Tür: Book, Film, Series, Anime, Manga, Webtoon, Podcast, Game.
  - Yazarı ya da yönetmeni, yılı, türleri (çoklu), kimin önerdiği (Yakınlar varsa ona bağlı), kapak resmi; yorum gövdede.
  - Bilgi linki: IMDb, Goodreads, MyAnimeList ya da başka bir sayfa.
  - Nerede izlenir ya da okunur: bir seçim (Netflix, Max, Disney+, Prime Video, Crunchyroll, Webtoon, Kindle, kağıt…) ve doğrudan link. Liste bölgeye göre gelir.
  - Durum: Want, Up next, In progress, Paused, Done, Dropped; puan 1–5; başlama ve bitiş.
- **İlerleme (soruya göre):** türüne göre sayfa (Book), bölüm (Series, Anime, Podcast) ya da bölüm/cilt (Manga, Webtoon); okunan ya da izlenen, toplam, yüzde. Update düğmesi yenisini sorar, günlüğe yazar; sonuncuda Done olur, bitiş günü yazılır.
- **Log:** gün, eser, sayfa ya da bölüm ya da dakika. Bu haftaki sayfa ve bölüm, art arda günler, yılın toplamı.
- **Yıllık hedef (soruya göre):** "2026'da 24 kitap" gibi; biten, gidişat ve bu hızla yıl sonunda varılacak sayı.
- **Quotes (soruya göre):** alıntı, eser, sayfa ya da bölüm, etiketler.
- **Lists:** kişinin kendi listeleri ("Yaz için", "Oscar adayları", "Ayşe'nin önerileri"); bir eser birden çok listede.
- **Ödünç (soruya göre):** kime verildi, ne zaman, ne zaman geri gelmeli; geri gelme günü Upcoming'de, geciken işaretlenir.
- **Çıkış günleri (soruya göre):** beklenen kitap, film, yeni sezon ya da yeni bölümün günü Upcoming'de.
- **Görünümler:** Up next (sırayla), In progress (ilerlemesiyle), bu yıl bitenler (puanıyla), türe göre, nerede izleneceğine göre; bitenlerin takvimi.
- **Ajan ile:** adı yazmak yeter; ajan yazarını, yılını, sayfa ya da bölüm sayısını ve bilgi linkini doldurabilir. Rehber anlatır.
- **Sorular:** hangi türler (çoklu, hepsi seçili), nerede izliyor ve okuyorsunuz (liste, bölgeye göre: Türkiye'de Netflix, Disney+, Prime Video, Max, Exxen, TOD, Gain, Mubi, YouTube, Crunchyroll, Webtoon, Kindle, kağıt; başka yerde Netflix, Max, Disney+, Prime Video, Apple TV+, Hulu, YouTube, Crunchyroll, Webtoon, Kindle, kağıt), ilerleme tutulsun mu, yıllık hedef (sayı ya da yok), alıntılar, ödünç, çıkış günleri.

### 4.9 Alışkanlıklar ve kişisel hedefler (Health)

28 Ekim, "en az giriş, işin önünde engel yok" ölçütüyle baştan (Streaks, Loop Habit Tracker, Strides örnek). Mockup: `design/mockups.html` › Alışkanlıklar ve hedefler: Today'den tek tıkla.

- **Habits:** ad, sıklık: Every day, On some days (günler, yalnız o seçilince), Times a week (kaç kez, yalnız o seçilince). Her alışkanlık kendi gününde Today'e gelir; **Done** tek tıkla o günün kaydını yazar, toast ve Undo. Kaçan gün Overdue'ya düşmez, birikmez. Haftada N kez olan, o haftanın sayısı dolana dek her gün gelir. Upcoming'de görünmez.
- **Tabloda son 7 gün:** her gün bir kutu; yapılan işaretli, bugün çerçeveli, alışkanlığın günü olmayan soluk; tıklamak o günü işaretler ya da kaldırır (unutulan gün böyle yazılır). Yanında seri (🔥 12 days; haftada N kez olanda hafta), bu hafta (6 of 7) ve son 30 gün yüzdesi.
- **Pencere:** solda ad ve sıklık; sağda ayın takvimi, günlere tıklanarak işaretlenir, üstünde seri, en iyi seri, 30 günde kaç kez.
- **Check-ins:** alışkanlık ve gün; arkada tutulur, menüde yok. Today'deki Done, tablodaki ve penceredeki kutular bunu yazar ya da siler.
- **Goals:** ölçüsüyle iki türlü. **Number:** Start, Target, Unit, Now; **Update** küçük pencerede şimdiki değeri sorar. **Steps:** adımlar kaydın alt görevleri, tarihli olan Today ve Upcoming'e gelir ve orada işaretlenir. Since (bugün) ve By. İlerleme (çubuk ve "7 of 24 books" ya da "2 of 5 steps") ve durum (On track, Behind, Done) kendiliğinden: Behind, Since'ten By'a geçen süreye göre olması gerekenin gerisinde. Hedef günü Upcoming'de; geçmiş ve bitmemiş hedef işaretlenir.
- **Uygulamanın geri kalanıyla:** alışkanlık Today'de işaretlenir, Upcoming'de yok; hedef günü Upcoming'de; hedefin adımları alt görev olarak Today ve Upcoming'de. Chat için fırsat yok.
- **Sorular:** alışkanlıklarınız, sıklığı sözünden okunur ("Walk 30 minutes" her gün, "Gym 3 times a week", "Call mom on Sunday"); kişisel hedefler tutulsun mu.
- **Altyapı:** tekrar eden takvimde Start'sız tek düğmeyle kapanan gün (`start: false`, düğmesi `skip`), geçen günün late kalmaması (`late: false`), haftada N kez (`perWeek`, o hafta dolunca kalan günler gelmez); tabloda son N günün şeridi (görünümde `days`), pencerede ayın takvimi (`days` bloğu); kural dilinde `streak`, `best`, `week`, `steps`, `stepsDone`; yüzde alanı çubuk (`bar`, yanında `caption`), formül alanında renkli seçenekler (`colors`); koleksiyonun düz tablosuna varsayılan sütunlar (`columns`); alt görev bloğuna başka ad (`title`, `add`: Steps, Add step); şerit ve ayda alışkanlığın başlangıcından önceki gün de işaretlenir.
- Önceden kurulmuş Habits and goals app'leri olduğu gibi kalır.

### 4.10 Spor ve antrenman (Health)

22 Ekim'de eklendi.

- **Workouts:** gün ve saat, tür (Run, Gym, Swim, Cycle, Yoga, Team sport, Other), süre, mesafe, zorluk (1–10), not; bu haftaki antrenman sayısı, dakika ve kilometre.
- **Plan:** hangi gün ne yapılacağı; o günün antrenmanı Today'de. Done düğmesi plandakini Workouts'a yazar.
- **Exercises ve Sets (soruya göre):** egzersiz ve kas grubu; set: antrenman, egzersiz, ağırlık, tekrar. Egzersizin en iyisi (kişisel rekor) ve en son ne zaman yapıldığı.
- **Body (soruya göre):** gün, kilo, bel, yağ oranı; ilk ölçüyle fark.
- **Races and goals (soruya göre):** yarış ya da hedef ("10K under 50 min", "Bench 100 kg"), gün, hedef süre ya da değer, sonuç.
- **Takvim:** plan ve yarışlar, Today ve Upcoming'de.
- **Sorular:** hangi sporlar (çoklu), set ve tekrar tutulsun mu, vücut ölçüleri tutulsun mu, yarışlar ve hedefler tutulsun mu.
- Antrenör ve spor salonu için ayrı iş şablonu yok: üyeler, ders programı ve paketler Randevu ile Abonelikler'le kurulur.

### 4.11 Paylaşılan harcamalar (Life)

**29 Ekim, mağaza ekranlarına bakılarak ikinci kez** (Tricount, Splitwise; mockup: `design/mockups.html` › Paylaşılan harcamalar, taslak 2):

- **Harcama** Tricount'un Add Expense'i gibi: başlık, tutar ve yanında birim (app'te ikinci birim varsa; yabancı birimde "1 EUR = 1,1 $", son kullanılan kur), Paid by (son ödeyen), When, grup ya da gezi; sonra "Equally · By amounts · By parts" ve grubun her kişisi bir satır: yuvarlak tik, payı yanında. By parts'ta "2x" ve −/+, payı kendiliğinden; By amounts'ta tutar kişinin yanında yazılır, toplam tutmazsa "$100 missing". Ödeyenin yanında "paid", kuruş artanı ondadır. Tiki kaldırılan pay dışında kalır. Kira için tek kutu: Every month (yalnız gruplarda), gününde payıyla yeniden yazılır, Undo ile. Notlarda yalnız ek (fiş). Kategori, Rate kutusu, Shares tablosu, "+ Add line" yok.
- **Grup penceresi:** başlıkta adı ve "2 people · $0 this month"; solda People (bakiyeleriyle) ve Who pays whom (tikli, "0 of 2 done", ödenen üstü çizili), Settle up; sağda harcamalar (ad, kim ödedi, tutar). Notes yok. Liste: kişiler, bu ay, ödenecekler.
- **Home:** grupların bu ayı ve ödenecekleri; harcamaların sayısı kutusu yok.
- **Menü:** Expenses ve Groups (Travel ile Trips); Settlements menüde yok.
- **Sorular:** kimlerle, bölme şekilleri, Kişisel finans seçiliyse kendi payın oraya. "Başka para biriminde harcama" sorusu kalktı.
- **Mockup'tan farklar:** Every month etiket ve kutu (mockup'ta tek satır "Every month, as the rent"); Paid by ve When yan yana değil alt alta; grup penceresinde sütunlar 1'e 2 (mockup'ta eşit); tiki kaldırınca paylar yeniden bölünür, verilen parça sayıları 1x'e döner; telefonda grup sayfası sekmeli, tutar büyük yazılmıyor, Paid by ve When ayrı satırlarda; bakiyeler renksiz.

Önceki hâli (28 Ekim): tutar önce; Paid by ve For whom çipler; By amounts'ta pay satırın penceresinde, By shares'te pay sayısı; kategori; Repeats (No, Weekly, Monthly); grupta kişiler, Who pays whom tabloları.

Önceki hâli (22 Ekim):

22 Ekim'de eklendi. Gezi, ev arkadaşları, ortak yemekler, aile içi masraflar: kim ne ödedi, kimin kime ne kadar borcu var.

- **Groups:** ad, para birimi, kişiler; toplam harcama, kişi başı ortalama.
- **People:** grubun kişileri (Yakınlar'ın People'ından ayrı rol); ödediği, payına düşen, bakiyesi (+ alacaklı, − borçlu).
- **Expenses:** ne için, gün, tutar, kim ödedi, kimler arasında (varsayılan grubun herkesi), bölme şekli (Equally; soruya göre By amounts, By shares), kategori; fiş ekte. Soruya göre para birimi ve kur, grubun para birimine çevrilir.
- **Shares:** harcama kaydedilince her kişinin payı yazılır; kuruş artanı ödeyene kalır. Bakiyeler buradan.
- **Settlements:** kim kime ne ödedi. Grubun **Settle up** düğmesi en az ödemeyle "kim kime ne kadar" önerilerini yazar; ödenen Paid işaretlenir, bakiyeler sıfıra iner.
- **Seyahat ile:** gezi aynı zamanda grup olur; gezinin harcamaları bu şablonun Expenses'ıdır, gezinin harcanan tutarı ve bütçesi buradan gelir.
- **Kişisel finans ile (soruya göre):** kendi payın senin hesabına harcama olarak yazılır.
- Herkesin kendi harcamasını girmesi için app paylaşılan bir space'te kurulur (sunucu, paylaşılan OneDrive); değilse kayıtları bir kişi tutar. Grubun özetini dışa aktarıp göndermek sonraya.
- **Sorular:** kimlerle (liste), grubun para birimi, farklı para biriminde harcama oluyor mu, bölme şekilleri (yalnız eşit, tutar ve oranla da), Kişisel finans seçiliyse kendi payın oraya yazılsın mı.

## 5. Ortak kurallar

- Bir şablon başka bir şablonla birlikte kurulunca bağlanır; tek başına da eksiksiz çalışır.
- Her şablonun tanıtım notu, Today ve Upcoming'e gelen takvimi ve en az bir kontrolü var.
- Varsayılan listeler İngilizce; bölgeye göre olanlar (tatiller, izin hakkı) E-ticaretteki `regional` yoluyla.
- README ve karşılama notu şablonları Business ve Personal diye sayar.

## 6. PLAN'da yeri ve dilimler

Yeni aşama **16 Yeni app şablonları**; Dropbox 17, Google Drive 18, Mobil 19 olur.

1. Pencerede Business ve Personal; dildeki `months`, `years`, `workdays`; formülden başlayan takvim. Mockup ister.
2. Abonelikler, Sözleşmeler.
3. İzinler, Hedefler, Olaylar.
4. Saha servisi, Danışmanlık, Dernek.
5. Kişisel finans, Ev araç ve belgeler, Sağlık.
6. Tarifler, Seyahat, Paylaşılan harcamalar, İş arama.
7. Yakınlar, Okuma ve izleme, Alışkanlıklar, Spor ve antrenman.

Roadmap'te faz "16 Yeni app şablonları" ve her dilim bir kart; denemeler "deneme" etiketli kartlar.

## 7. Testler

- **core:** her şablonun kurulumu (parçalar, alanlar, görünümler, varsayılan cevaplar, bölge listeleri); `months`, `years`, `workdays`; formülden başlayan takvim; her şablonun kontrolleri çalışırken.
- **Bütün kümeler:** core ve ajanın her şablon kümesini kuran testleri 31 şablonla çok uzar (2^31 küme). Bunun yerine her şablonu tek başına, her şablonu her öbür şablonla ikili, ve iş ile kişisel grupların hepsini birlikte kurmak.
- **ajan:** her şablonda düğmeleri ve kuralları baştan sona deneyen bir akış (E-ticaret testindeki gibi).
- **web:** penceredeki Business ve Personal seçimi tarayıcıda; her dilimde bir kurulum tarayıcıda açılır.

## 8. Kararlar

22 Ekim 2026'da onaylandı:

1. Business ve Personal: iki seçenekli seçim, kişisel space'te Personal ile açılması; bir app tek taraftan kurulur, Add to app ve ajan da buna uyar (22 Ekim, mockup'tan sonra; önce All, etiket ve karışık seçim düşünülmüştü).
2. Dil eklemeleri: `months(n)`, `years(n)`, `workdays(a, b)`; formülden başlayan takvim.
3. Her şablonun içeriği ve soruları (3. ve 4. bölüm).
4. PLAN'da yeni aşama 16; Dropbox 17, Google Drive 18, Mobil 19; dilimlerin sırası 6. bölümdeki gibi.
5. Bütün kümeler testinin yerine tek tek, ikili ve gruplar hep birlikte.

1. dilimin kodunda verilenler (22 Ekim, onaylı):

- Seçim cihazda iki yerde tutulur: kişisel space için ve öbür space'ler için.
- Business · Personal seçimi iki tarafta da şablon olunca görünür; kişisel şablonlar gelene kadar pencere bugünkü gibidir. Şablonu olmayan grup gösterilmez.
- `workdays(a, b)` b, a'dan önceyse eksi sayı verir (Excel'deki NETWORKDAYS gibi).
- `months()` ve `years()` saate eklenmez; tek başına bir değer olarak boş görünür.
- Takvim ayarında formül alanı, kaydın kendi alanlarından gün verdiği anlaşılıyorsa listelenir; bağlı kaydın gününü okuyan formül, şablonda ya da ajanın yazdığı dosyada başlangıç verilmişse kabul edilir. Böyle kayıt takvimde ve Upcoming'de sürüklenmez, yalnız açılır.
- Ajanın şablon listesinde her şablonun `audience`'ı yazar; rehber şablonları iki taraf başlığıyla sayar.

2. dilimin kodunda verilenler (22 Ekim, onaylı):

- Abonelikte "ne satıyorsunuz" cevabı koleksiyonun adını verir: Subscriptions, Memberships ya da Service agreements; üyelikte ödeyen alanı Member olur, Plans aynı kalır. Bunun için şablon, parça adını cevaba göre verebilir (`AppTemplate.names`).
- Varsayılan planlar Basic monthly, Pro monthly, Pro yearly. Dönem planın adından okunur: yearly ve annual yıllık, quarterly çeyreklik, dönem yoksa aylık; fiyatlar kurulumdan sonra planlara yazılır.
- Deneme süresi sorusu varsayılan Hayır. Evet ise planda Trial days (14) olur; yeni kayıt Trial ile başlar, yenileme günü denemenin bittiği gündür; Renew Active yapar.
- Ödeyen: CRM varsa onun müşterileri; yoksa soru sorulur, varsayılan Companies.
- Yenileme ödemesi Invoiced, vadesi yenileme günü, Bütçe'de koleksiyonun adını taşıyan satıra yazılır.
- Adı boş kayıt "müşteri · plan" adını alır; plan ve müşteri yalnız aktiflerin aylık değerini toplar.
- Sözleşmenin karşı tarafı Companies; app'te People varsa Contact alanı da eklenir.
- Sözleşmede varsayılanlar: durum Active, kendiliğinden yenilenir Evet, dönem Yearly; ihbar sorusu Yok, 15, 30, 60, 90 gün, varsayılan 30.
- Cancel by takvimi Today ve Upcoming'e gelir; Ends ayrı takvimdir ve aynı sözleşme iki kez görünmesin diye Upcoming'e gelmez.
- Renew aktif ya da bitmiş sözleşmede; Cancel taslak ya da aktifte, onay ister, neden sormaz.
- Bütün kümeler testinin yerine her şablon tek başına, aynı taraftan her ikili, her grup ve her taraf hep birlikte (core'da altı cevap ve para birimi biçimiyle, ajanda iki).

3. dilimin kodunda verilenler (22 Ekim, onaylı):

- Resmi tatiller sorusu: None, Turkey, United States, United Kingdom, Germany; varsayılan cihazın bölgesine göre, başka yerde None. Bu yılın ve gelecek yılın tatilleri kurulur (`packages/core/src/apps/holidays.ts`).
  - Türkiye'nin dini bayramları Diyanet'in açıkladığı tarihlerle: 2026 Ramazan 20–22 Mart, Kurban 27–30 Mayıs; 2027 Ramazan 9–11 Mart, Kurban 16–19 Mayıs. Yeni yıl açıklanınca tabloya eklenir; o zamana kadar o yılın yalnız sabit tatilleri kurulur.
  - Arife ve 28 Ekim gibi yarım günler dahil değil.
  - ABD'de hafta sonuna düşen tatil Cuma ya da Pazartesi'ye, İngiltere'de sonraki iş gününe kayar; Almanya'da kaymaz. Adlar İngilizce.
- Yıllık izin hakkı seçeneği 10, 14, 15, 20, 25, 30 gün; Türkiye'de 14, başka yerde 20.
- Listedeki ilk izin türü yıllık haktan düşülür ("from the allowance"); liste boşsa olağan türler kurulur.
- Gün sayısı ilk ya da son gün değişince yeniden hesaplanır, elle yazılan başka durumda kalır; tek günlük izinde ilk gün yeter.
- İzinler onaylanmıyorsa durumlar yalnız Approved ve Cancelled, düğme yok.
- Tatil takvimi Upcoming'e gelmez.
- İşe alınanı Employees'e Candidates'taki bir kaydetme kuralı ekler; Hire değişmez, İzinler app'e sonradan eklense de çalışır.
- Kurulum o günün tarihini bilir: pencerede cihazın, ajanda ajanın günü.
- Hedefin dönemi soruya göre "2026 Q4", "2026 H2" ya da "2026" diye başlar.
- Ölçütün ilerlemesi %0 ile %100 arasında tutulur; başlangıç değeri 0.
- Hedeflerde kontrol: bitiş günü geçmiş ve Done olmayan hedef "Past its due day" diye işaretlenir (her şablonda en az bir kontrol kuralı için).
- Update yalnız ilerleme kayıtları tutuluyorsa var; değilse Current elle yazılır.
- Olayda varsayılanlar: önem Major, başlangıç şimdi, sorumlu kişinin kendisi.
- Talepten olay: talep kartının Incident alanında olay seçilir; olay ona bağlı kartları gösterir.
- Actions panosunun kolonları To do, Doing, Done.

4. dilimin kodunda verilenler (23 Ekim, onaylı):

- Saha servisinde müşteri CRM'in müşterileridir (CRM kişiler demiyorsa şirketler); şablon sormaz.
- Bakım aralıkları Varlıklar'daki gibi aylık, 3 ayda bir, 6 ayda bir, yıllık; "sonraki bakım" takvimi ayrı görünüm, Upcoming'e gelmez.
- Done'ın kısa notu "What was done" alanındadır; uzun rapor ve fotoğraflar kaydın notlarında (düğme notlara yazamaz).
- İş emri: kod WO-0001, süre 60 dakika, adı türünden ve cihazından, müşterisi cihazından. Teknisyen mesaisi 08:00–17:00, Pazartesi–Cuma; listede adı verilen her teknisyenin kendi takvimi var.
- Parçalar iş Done olunca "use" türüyle stoktan düşer, Done'dan çıkarsa geri gelir; birden çok depoda varsayılan depodan.
- Invoice: siparişin satırları ürüne bağlanmaz (stok iki kez düşmesin); vade 30 gün; Bütçe yolunda "Field service" satırı; bir iş emri bir kez faturalanır.
- Danışmanlıkta müşteri Abonelikteki gibi: CRM'inkiler, yoksa soru (varsayılan Companies); iki şablon aynı yardımcıyı kullanır.
- Bütçe kullanımı para bütçesi yazıldıysa paradan, yoksa saatten; kontrol "Over its budget: 110% used".
- Log time saatlik işte faturalanacak sayılır, ücretini işten alır; gün sorusu zorunlu değil, boşsa bugün.
- Bill önce onay ister; yalnız saatleri ve masrafları faturalar (sabit ücret ve retainer değil); vade 30 gün, "Consulting" satırı.
- Son tarihlerde listenin her maddesi bir tür olur ("VAT return monthly": tür "VAT return", aylık). Teslim durumları To do, In progress, Delivered.
- Dernekte aidat dönemleri ayrı bir parça, Dues periods: dönemin tutarı ve son günü; Issue dues bu kaydın üstündedir, çünkü düğme tek kaydın üstünde çalışır. Dönemin adı varsayılan yıl (aylıkta "2026-10").
- Yeni dönem yazılırken eski aidatı geciken aktif üye Lapsed olur ve yeni aidatı da yazılır; geciken aidatı ödenince yeniden Active.
- Aidatta düğme yok; Paid ya da Waived elle seçilir.
- Bağış: makbuz no RCP-0001, adı "bağışçı · gün". Bütçe'de bağışlar "Donations", aidatlar "Dues" satırına.
- Kampanyalar Content takviminin Campaigns'iyle aynı parça; bağış tarafı Target, Raised, Reached ekler (Content'in Goal'ü metin).
- Dernek soruları: üyelik türleri Regular, Student, Honorary; bağışlar varsayılan Evet, kampanyalar Hayır.

5. dilimin kodunda verilenler (23 Ekim, onaylı):

- Hesabın türü adından: "card", "cash", "saving" geçmiyorsa banka hesabı. Varsayılan hesaplar Bank account, Credit card, Cash; varsayılan kategoriler dokuz (Groceries … Other).
- Para birimi her app'teki gibi App adımında sorulur. Birden çok para biriminde işlem hesabının para birimini alır; kişisel app'te açıklama "each account says which it is in" der.
- Faturada "Paid automatically" yalnız bir işarettir; son günü geçen işaretli fatura da işaretlenir. Paid tutarı ve hesabı sorar, varsayılanları faturadan.
- Ev şablonunda hiçbir şey seçilmezse eşyalar kurulur. Ev işinin sıklığı adından, yazmıyorsa yıllık; varsayılan işler Boiler service, Smoke alarm batteries, Air conditioner filters (üç ayda bir).
- Araçta "Next" en yakın günü, "Next is" hangisi olduğunu yazar (Upcoming bir kaydı bir kez gösterir); yapılan işin yeni günü elle yazılır.
- Doktor randevuları iş tarafındaki Randevu'dan ayrı bir parça, adı yine Appointments.
- Aile için isim listesi verilirse "For" seçimdir, liste boşsa metin; takvimler kişiye göre renkli.
- Sağlıkta kontroller: "Get more by" günü geçmiş ve bitmemiş ilaç; sonraki günü geçmiş aşı (her şablonda en az bir kontrol için). Tahlillerin takvimi yok; randevuda Note alanı var.
- Ev şablonunun ikonu `keys` (taslaktaki `key` uygulamada yok).

6. dilimin kodunda verilenler (23 Ekim, onaylı):

- Paylaşılan harcamalarda grubun kişileri "Members" adlı koleksiyon (Yakınlar'ın People'ıyla aynı adı taşımasın). Her kişi bir gruba bağlı; aynı kişi iki grupta iki kayıttır, bakiyeler grup başına.
- Sorulan kişiler app'in adını taşıyan ilk gruba bağlanır: kurulumda bir kayıt, aynı kurulumda öncekine adıyla bağlanabilir. Seyahat varsa grup kurulmaz, kişiler gezilerine sonra bağlanır.
- Her pay kaydı tek bir kişiye bağlı, "ödediği" ve "payı" ile; yapılmış ödeme de iki pay kaydıdır. Bakiye bunlardan toplanır (bir harcamada ödeyen ve paylaşanlar aynı kişilere bağlı olduğundan başka türlü sayılamaz).
- Settle up en fazla "kişi sayısı eksi bir" ödeme önerir; kesin en azı aramaz.
- Tutar, ödeyen, kimler arasında, bölme şekli ya da kur değişince paylar yeniden yazılır; tutarla bölünende elle yazılanlar yeniden eşitlenir.
- Kişisel finansla kendi pay "Me" işaretli kişinin, banka hesabından harcama olarak yazılır.
- Paylaşılan harcamalarda takvim yok: güne bağlı bir şeyi yok.
- Tariflerde tür seçenekleri Main, Soup, Salad, Side, Dessert, Breakfast, Snack; alışveriş listesi "To buy" görünümüyle açılır; malzemesiz tarif "No ingredients yet" diye işaretlenir (her şablonda bir kontrol için).
- Seyahatte rezervasyon türleri Flight, Hotel, Train, Car, Event; harcama kategorileri Transport, Stay, Food, Activities, Shopping, Other; "biten, başlangıçtan önce" kontrolleri.
- İş aramada aşamalar CRM'deki gibi okunur (Rejected bitmiş, son aşama tamam); takip kontrolü yalnız süren başvurularda. Companies iş tarafındakinden ayrı bir parça.

7. dilimin kodunda verilenler (23 Ekim, onaylı):

- Yakınlarda kişi, doğum günü ve yıldönümünden önce gelenin gününde Upcoming'e gelir, hangisi olduğunu ve gireceği yaşı söyler. Yakınlık Family, Friend, Partner, Colleague, Other; görüşme türü Call, Visit, Message, Other, adı "Call with Ayşe" gibi.
- Okumada yıllık hedef Yok, 12, 24, 36, 52 (varsayılan Yok); alıntılar Evet, ödünç Hayır, çıkış günleri Evet. "Kağıt" listede Paper. Kapak bir link alanı.
- İlerleme birimi türe göre: kitap sayfa; manga ve webtoon chapter; film dakika; oyun saat; dizi, anime, podcast bölüm.
- Yıl kaydı: bu yılınki kurulumda 1 Ocak'tan, hedefiyle; yeni bir yılda eser bitince o yılın kaydı açılır. Hız: bitenler × 365 ÷ yılın geçen günleri. Art arda günler bir gün atlanınca 0.
- "Bu haftaki sayfa ve bölüm" günlükte birime göre gruplanmış "This week" görünümüdür (son 7 gün, toplamlarıyla).
- Okuma görünümleri: Up next, In progress (ilerlemeye göre), Finished this year, By type, By where, bitenlerin takvimi (Upcoming'e gelmez); Coming out ve Lent Upcoming'e gelir.
- Alışkanlıklarda varsayılanlar Walk 30 minutes, Read 20 pages, Drink 2 litres of water, In bed by 23:00; günlük, haftada 7. "Last 7 days" takvim haftası değil. Hedefe yetişemeyecek alışkanlık işaretlenir, bugün yapılmadıysa hâlâ yapılabilir sayılır (her şablonda bir kontrol için). Hedeflerde durumlar Not started, On track, At risk, Done; ilerleme yüzde.
- Sporda set ve tekrar sorusu yalnız Gym seçiliyse; vücut ölçüleri ve yarışlar varsayılan Hayır; türlere Other eklenir. Plan durumları Planned, Done, Skipped; Done antrenmanı o günün tarihiyle, saatsiz yazar ve plana bağlar. Set antrenmanının gününü alır. Yarışta hedef ve sonuç metin; günü geçmiş ve sonucu yazılmamış yarış işaretlenir.
- Health grubunun sırası taslaktaki gibi: Health, Sport and training, Habits and goals.
