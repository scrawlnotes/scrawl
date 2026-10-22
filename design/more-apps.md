# Yeni app şablonları: iş ve kişisel

22 Ekim 2026'da onaylandı; PLAN'da 16. aşama. Kullanıcının seçtikleri: iş tarafında sekiz şablon, kişisel tarafta on bir şablon; şablon penceresinde Business ve Personal ayrımı.

Her şablon bugünkülerin yolunu izler (`packages/core/src/apps/templates/*.ts`): parçalar, alanlar, kurallar, düğmeler, takvim görünümü, tanıtım notu ve sorular; her soru bir cevapla hazır gelir. Ortak parçalar (People, Companies, Payments, Products) bugünkü gibi paylaşılır. Hesaplananlar formül, lookup ve rollup'tır; kurallar `_rules.js`'tedir.

## 1. Şablon penceresinde Business ve Personal

- Her şablonun bir kitlesi olur: `audience: 'business' | 'personal'`.
- Şablonlar adımının üstünde iki seçenek: **Business · Personal**. Kişisel space'te Personal ile, öbürlerinde Business ile açılır; seçim cihazda kalır.
- Bir app ya iş ya kişisel şablonlardan kurulur: iki tarafın parçaları birbirine bağlanmaz, verileri de çoğu zaman ayrı space'lerde durur. Öbür tarafa geçince seçilenler bırakılır. Add to app yalnız app'in kendi tarafındaki şablonları sunar.
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

- **Accounts:** ad, tür (Bank, Card, Cash, Savings), açılış bakiyesi, bakiye (açılış + girenler − çıkanlar).
- **Transactions:** hesap, gün, tutar, yön (In, Out), kategori, not; "bu ay mı" (formül).
- **Categories:** ad, aylık sınır, bu ay harcanan, kalan.
- **Bills and subscriptions:** ad, tutar, dönem, sonraki son gün, otomatik ödeme mi. Paid düğmesi harcamayı yazar ve son günü bir dönem ileri alır.
- **Kontroller:** sınırı aşan kategori; son günü geçmiş fatura.
- **Takvim:** faturalar, Today ve Upcoming'de.
- **Sorular:** para birimi, hesaplarınız (liste), kategoriler (liste, hazır), faturalar tutulsun mu.

### 4.2 Ev, araç ve belgeler (Money and home)

- **Items:** ad, oda, alındığı gün, fiyat, garanti bitişi; fatura ekte.
- **Documents:** tür (ID, Passport, Driving licence, Insurance, Other), no, bitiş, hatırlatma (bitişten 30 gün önce).
- **Vehicles:** plaka, muayene, sigorta, bakım günleri, km.
- **Home upkeep:** iş (Kombi bakımı gibi), aralık, sonraki gün. Done sonrakini yazar.
- **Takvim:** bitecek belgeler, biten garantiler, araç ve ev işleri; Today ve Upcoming'de.
- **Sorular:** neleri tutuyorsunuz (çoklu: eşyalar, belgeler, araç, ev bakımı), ev bakım işleri (liste).

### 4.3 Sağlık (Health)

- **Appointments:** doktor, bölüm, saatli gün, yer, not.
- **Medications:** ad, doz, ne zaman, başlangıç ve bitiş, yeniden alma günü.
- **Results:** gün, tahlil, sonuç; belge ekte.
- **Vaccinations:** ad, gün, sonraki.
- **Takvim:** randevular, ilaç yenileme ve aşılar; Today ve Upcoming'de.
- **Sorular:** kimin için (yalnız ben, aile; aileyse kişi alanı), ilaçlar tutulsun mu.

### 4.4 Tarifler ve yemek planı (Money and home)

- **Recipes:** ad, tür, süre, kaç kişilik, etiketler; yapılışı gövdede.
- **Ingredients:** tarif, malzeme, miktar.
- **Meal plan:** gün, öğün (Breakfast, Lunch, Dinner), tarif.
- **Shopping list:** malzeme, miktar, alındı mı, tarif.
- **Düğme:** Add to shopping list (tarifin ya da haftanın malzemelerini listeye yazar).
- **Takvim:** haftalık yemek planı.
- **Sorular:** öğünler (liste), alışveriş listesi tutulsun mu.

### 4.5 Seyahat (Life)

- **Trips:** ad, nereye, ilk ve son gün, bütçe, harcanan.
- **Bookings:** gezi, tür (Flight, Hotel, Train, Car, Event), saatli başlangıç ve bitiş, onay no, tutar; bilet ekte.
- **Places:** gezi, ad, link, gidildi mi.
- **Packing:** gezi, eşya, alındı mı.
- **Expenses:** gezi, tutar, kategori.
- **Takvim:** rezervasyonlar saatleriyle, Today ve Upcoming'de.
- **Sorular:** neleri tutuyorsunuz (çoklu: gidilecek yerler, valiz listesi, harcamalar).

### 4.6 İş arama (Life)

- **Companies:** ad, site, not.
- **Applications:** şirket, pozisyon, ilan linki, başvuru günü, durum (Applied, Screening, Interview, Offer, Rejected, Accepted), maaş, kaynak, sonraki adım günü.
- **Interviews:** başvuru, saatli gün, tür, kiminle, not.
- **Kontrol:** 14 gündür ses çıkmayan başvuru "Follow up" diye işaretlenir.
- **Takvim:** görüşmeler ve sonraki adımlar, Today ve Upcoming'de.
- **Sorular:** başvuru aşamaları (liste).

### 4.7 Yakınlar ve doğum günleri (Life)

- **People** (CRM'in People'ıyla ortak değil; rolü ayrı): ad, yakınlık, doğum günü, yıldönümü, telefon, ne sıklıkla görüşmek istendiği (gün); son görüşme, sonraki doğum günü (formül, `years(n)` ile).
- **Moments:** kişi, gün, tür (Call, Visit, Message), not.
- **Kontrol:** istenen sıklıktan uzun süredir görüşülmeyen kişi işaretlenir.
- **Takvim:** sonraki doğum günleri ve yıldönümleri her yıl, Today ve Upcoming'de.
- **Sorular:** yıldönümleri tutulsun mu, görüşme sıklığı tutulsun mu.

### 4.8 Okuma ve izleme listesi (Life)

22 Ekim'de kullanıcının gerçekte tuttuğuna göre genişletildi.

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

- **Habits:** ad, sıklık (Daily, Weekly), haftalık hedef; son 7 günde, bugün yapıldı mı.
- **Check-ins:** alışkanlık, gün. Done today düğmesi bugünün kaydını yazar, bir gün bir kez.
- **Goals:** ad, son gün, ilerleme, durum, not.
- **Takvim:** hedeflerin son günleri.
- **Sorular:** alışkanlıklarınız (liste, hazır), kişisel hedefler tutulsun mu.

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
