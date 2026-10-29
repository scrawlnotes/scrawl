# Takvim, saat ve kalan şablonlar (taslak)

Durum: 22 Ekim 2026'da onaylandı, PLAN'a 15. aşama olarak işlendi. Kararlar 11. bölümde. 1. dilim kodda (mockup 6e1c8f0).

## 1. Amaç

Kalan iki app şablonu, Randevu ve rezervasyon ile E-ticaret, bugün yapılır. Randevu'nun önünde uygulamanın kendisinde iki eksik var: tarihte saat yok, koleksiyonun takvimi yok. Bu plan önce onları, sonra şablonları kurar.

22 Ekim'de kullanıcının verdiği kararlar:
- Tarih alanına saat; ayrıca yalnız saat tutan bir alan. Her tarihte saat olmayacak (görevlerde olduğu gibi): saatsiz değer de takvimde yerini bulur.
- Ay takvimi değil, tam bir takvim: gün, hafta, ay.
- Takvim koleksiyona gelir; orada olanlar Today ve Upcoming'de de görünür.
- Bugünkü app şablonlarında takvimi eksik olan yerlere takvim eklenir.
- Müşterinin kendisinin randevu alması ve müşteriye SMS ya da e-posta hatırlatma sunucu tarafına, sonraya yazılır (9. bölüm). Uygulama sunucuya bağlıyken onlar da çalışır.

## 2. Saat

### Veri

- **Tarih alanında saat:** alanın yeni seçeneği `time: true` (Fields'te "With time"). Değer `2026-10-22` ya da `2026-10-22T14:30` olabilir: saat isteğe bağlıdır, saatsiz değer tüm gün sayılır. Seçenek kapalı alan bugünkü gibi yalnız gün tutar.
- **Saat alanı:** yeni alan türü `time` ("Time"), değeri `14:30`. Örnek: çalışanın mesaisinin başı ve sonu, bir yerin açılış saati.
- **Süre:** yeni tür yok; dakika tutan sayı alanı, yeni biçimi **Duration** ile "45 min", "1 h 30 min" diye görünür.
- **Saat dilimi tutulmaz.** Değer duvar saatidir: "14:30", işyerinin saati. Space'in herkesi aynı saati görür.
- Değer kaydın dosyasında metin olarak durur; sync için bir şey değişmez.

### Dil (formül ve kural)

- `now()`: şimdiki gün ve saat.
- Saatli değere süre eklenir: `start + minutes(duration)`, `start + hours(2)`. İki saatli değerin farkı dakikadır: `end - start`.
- `day(start)` saatli değerin günü, `time(start)` saati; `at(day, time)` gün ve saati birleştirir.
- Karşılaştırmada saatsiz değer günün başıdır (00:00); saat alanları kendi aralarında karşılaştırılır (`time(start) >= staff.from`).
- Düğmenin sorusunda yeni türler: `type: "date", time: true` ve `type: "time"` (Reschedule yeni saati sorar).

### Ekranda

- **Gösterim:** "22 Oct, 14:30"; saatin 24 ya da 12 saat yazılışı cihazın diline göre.
- **Masaüstü:** tablo hücresinde ve formda gün kutusunun yanında saat kutusu, boş bırakılabilir.
- **Telefon:** gün seçicinin altında "Add time" satırı ve saat seçici.
- **Filtre:** Today, Before ve After gibi gün koşulları saatli değerin gününe bakar.
- **Sıralama:** aynı günde saatsizler önce gelir, sonra saat sırası.
- **CSV ve Excel:** Excel'in tarih-saat hücresi saatli değer olur; dışa aktarımda aynı yazılış.
- **Ajan:** `2026-10-22T14:30` ya da `2026-10-22 14:30`, saat alanında `14:30`; rehber söyler.

### Görevler ve kartlar

Saatsiz kalır. Takvimde gün ve haftanın tüm gün satırında, ayda günün içinde dururlar (11. bölüm, 1. karar).

## 3. Takvim bileşeni

Tek bir takvim; Upcoming'in bugünkü ay takviminin yerine geçer ve koleksiyonun, panonun takvim görünümü de odur.

### Görünümler

- **Day, Week, Month:** başlıkta önceki ve sonraki, **Today** ve görünüm seçici; hafta Pazartesi başlar (bugünkü gibi). Seçilen görünüm cihazda kalır.
- **Day ve Week:**
  - Üstte **tüm gün satırı:** saatsiz öğeler, birden çok güne yayılanlar.
  - Altında **saat ızgarası:** açılışta 07:00'ye kaydırılmış, şimdiki saati gösteren çizgiyle.
  - Saatli öğe başından sonuna bir kutudur. Sonu yoksa süresi, o da yoksa 30 dakika. Üst üste binen kutular yan yana durur.
- **Month:** günün hücresinde öğeler saat sırasıyla, saatlinin başında saati; sığmayan "+N more". Güne tıklayınca o günün penceresi açılır (bugünkü gibi).

### Etkileşim

- **Açma:** öğeye tıklayınca kendi penceresinde açılır: görev, kart ya da kayıt.
- **Ekleme:**
  - Koleksiyonun takviminde boş bir saate tıklayınca, ya da sürükleyerek aralık seçince, o saatte yeni kayıt formu açılır.
  - Upcoming'de bir güne tıklayınca o güne görev eklenir, bugünkü gibi.
- **Taşıma:** öğe sürüklenince günü, saatliyse saati değişir.
- **Süre:** kaydın kutusunun altı çekilince bitişi ya da süresi değişir. Her değişiklik toast'la gelir, Undo'su vardır.
- **Renk:** öğenin rengi kendi kaynağının rengidir: kaydın seçilen bir seçim alanının rengi (durum, çalışan), görevin listesi, kartın panosu.

### Telefon

- **Day ve Month:** Day, saat ızgarasıyla ve sağa sola kaydırarak gün değiştirerek. Hafta telefona sığmaz.
- **+:** o güne ya da saate ekler.
- **Uzun basma:** öğeyi taşır.

### Teknik

- `apps/web/src/Calendar.tsx`: `TimeGrid` (bilgisayarda Day ve Week) ve `PhoneHours` (telefonda günün saatleri). Tüm gün satırının hücrelerini çağıran verir; Upcoming'in ayı `Upcoming.tsx`'te, telefonun hafta şeridi ve ayı `PhoneUpcoming.tsx`'te.
- Kutu modeli `CalendarBox`: anahtar, başlık, alt satır, başlangıç, bitiş ya da süre, renk, taşınır mı. Açma, taşıma, süre çekme ve boş saate ekleme çağıranın işlevleridir; yazdığını o yazar, Undo'suyla.
- Core'da `calendar.ts`: `weekStart`, `weekDays`, `layoutDay` (bir günün kutuları, çakışanlar sütunlarda; önceki günden taşan gün başından, ertesi güne taşan gün sonuna kadar), `atMinutes`, `minutesBetween`. Saf işlevler, testli.
- Yalnız görünen günlerin kutuları hesaplanır.

## 4. Koleksiyonun ve panonun takvimi; Today ve Upcoming

- **Koleksiyon:** görünümü (View) bir türle gelir: Table ya da Calendar.
  - **Ayarlar:** başlangıç alanı (tarih ya da saatli tarih); isteğe bağlı bitiş alanı ya da süre alanı; isteğe bağlı renk alanı; **Show in Today and Upcoming** (varsayılan açık).
  - **Filtre:** görünümün koşulları takvime de uygulanır. Kayıtlı bir görünüm "Ayşe'nin takvimi" olabilir.
  - **Dosyada:** `_collection.json`'da `views[]`: `{ "kind": "calendar", "calendar": { "start": "start", "end": "end", "duration": "duration", "color": "staff", "upcoming": true } }`.
- **Ekleme:** görünümlerin + menüsünde Calendar; ilk tarih alanı seçili gelir.
- **Pano:** Board ve List'in yanında Calendar. Kartlar vadesine göre, tüm gün.
- **Today ve Upcoming:** Show in Today and Upcoming açık takvim görünümlerinin, görünümün koşullarına uyan kayıtları bugünden ileriye görünür.
  - **Today:** saatsizler önce, sonra saat sırası.
  - **Upcoming:** List'te günlerin altında; Calendar yeni tam takvimdir (görev, kart, alt görev, kayıt).
  - **Geçmiş kayıtlar:** "late" olmaz; geçmişte kalan randevu geç kalmış değildir.
  - **Okuma:** yalnız Today ve Upcoming'e açık koleksiyonların kayıtları okunur; açılış hızı korunur.
- **Ajan:**
  - `records`'a gün aralığı: `from`, `to`.
  - `tasks` ve `cards`'ın `due: "today"`'i gibi, ajan "bugün neler var" diye sorulunca kayıtları da verir.
  - Rehber takvim görünümünü anlatır.

## 5. Bugünkü şablonlara takvim

Yalnız yeni kurulan app'lere gelir. Kurulu bir app'e kişi görünümü kendisi ekler; Add to app var olanı değiştirmez.

| Şablon | Takvim | Koşul | Today ve Upcoming |
|---|---|---|---|
| CRM | Activities, tarih saatli olur; renk türe göre | — | evet |
| Satış | Orders, vadeye göre | Paid ve Cancelled değil | hayır |
| Destek | Requests panosu, vadeye göre | — | (pano) |
| Proje | Projects, başlangıçtan bitişe; Work panosu | Done ve Cancelled değil | hayır |
| Bütçe | Payments, vadeye göre | Paid değil | evet |
| Stok | Purchase orders, beklenen tarihe göre | Ordered | evet |
| Ürün | Releases, planlanan tarihe göre | Planned | hayır |
| İşe alım | Interviews, tarih saatli olur | — | evet |
| Demirbaş | Maintenance, tarihe göre | Planned | evet |
| İçerik | Content panosu, vadeye göre; Campaigns başlangıçtan bitişe | — | (pano) |

Pano kartları zaten Upcoming'de; panonun takvimi yalnız görünümdür.

## 6. Randevu ve rezervasyon

Şablon penceresinde Customers grubunda. Bir hizmetin ya da bir yerin, kimin için, ne zaman ve kimle olduğu.

| Parça | Tür | İçinde | Hesaplanan |
|---|---|---|---|
| Appointments | koleksiyon, Calendar görünümüyle | başlık, müşteri, hizmet, çalışan (ekipte), kaynak (rezervasyonda), başlangıç (saatli, zorunlu), süre (hizmetten), durum (Booked, Confirmed, Done, No-show, Cancelled), fiyat (soruya göre, hizmetten), not | bitiş |
| Services | koleksiyon (hizmette) | ad, süre, fiyat (soruya göre), veren çalışanlar (ekipte) | — |
| Staff | koleksiyon (ekipte) | ad, telefon, e-posta, mesai başı ve sonu (saat alanı, 09:00–18:00), çalıştığı günler (Mon–Fri) | bugünkü randevuları |
| Resources | koleksiyon (rezervasyonda) | ad, tür (room, table, vehicle, equipment), kapasite | — |
| People | koleksiyon, ortak (CRM ile) | müşteriler | son randevu, randevu sayısı, gelmediği |
| How we take bookings | tanıtım notunda | randevu nasıl verilir, iptal ve gelmeme kuralları | — |

- **Takvim:** Appointments'ın varsayılan görünümü Calendar (Week); renk ekipte çalışana, değilse duruma göre. Ekipte her çalışanın kendi kayıtlı takvim görünümü de kurulur. Today ve Upcoming'de görünür.
- **Kurallar:**
  - Kaydederken süre ve fiyat boşsa hizmetten yazılır.
  - Kontrol: aynı çalışanın ya da aynı kaynağın, iptal edilmemiş, saatleri çakışan başka randevusu varsa işaretlenir ("Overlaps with Ayşe Yılmaz, 14:30"). Reddedilmez.
  - Kontrol: ekipte çalışanın mesaisi ya da çalıştığı günler dışında kalan randevu işaretlenir.
  - Düğmeler: **Confirm**, **Done**, **No-show**, **Cancel** (nedenini sorar), **Reschedule** (yeni saati sorar).
  - Bütçe kuruluysa ve fiyat alınıyorsa Done olan randevu, fiyatıyla bir gelen ödeme açar.
- **Sorular:**
  1. **Neyin randevusu?** Hizmet (varsayılan), kaynak rezervasyonu, ikisi.
  2. **Randevuları kim veriyor?** Yalnız ben (varsayılan), bir ekip. Ekipse çalışanlar bir listeyle sorulur.
  3. **Hizmetleriniz:** liste, adı ve dakikası ("Consultation 30", "Follow-up 15"); hizmette sorulur.
  4. **Kaynaklarınız:** liste ("Room 1", "Room 2"); rezervasyonda sorulur.
  5. **Ücret alıyor musunuz?** Evet (varsayılan). Bütçe seçildiyse altında: **Done olan randevu ödeme olarak yazılsın mı?** Evet.

## 7. E-ticaret

İçeriği `design/scrawl-apps.md` 10'daki öneri (22 Ekim). Satış'ın ve Stok'un üstüne oturur, Money grubunda.

- **Parçalar:**
  - Channels: komisyon, sabit ücret, hakediş günü.
  - Orders'a eklenenler: kanal, pazaryeri sipariş no, kargoya son gün, kargo firması ve takip no, kargo maliyeti; Packed ve Shipped durumları; net kâr.
  - Returns.
  - Products'a satılan, iade edilen ve net kâr.
- **Kurallar:**
  - Ship ve Return düğmeleri.
  - İade stoğa döner.
  - İade ödemesi ve hakediş Bütçe'ye yazılır.
  - Geciken sipariş işaretlenir.
- **Sorular:** kanallar, kargo firmaları, iadeler, hakediş.
- **Takvim:** Orders'ın kargoya son güne göre takvimi, Today ve Upcoming'de (Shipped değilse).
- **Siparişlerin girişi:** bugün Excel'le, içe aktarmayla ya da ajanla. Pazaryeri sipariş no'suyla eşleştiren ve satırları siparişe ayıran içe aktarma bu planda yok (11. bölüm, 5. karar).

## 8. Testler

- **core:**
  - Saatli ve saat değerleri okunur ve yazılır.
  - Dil: `now`, `minutes`, `hours`, `day`, `time`, `at`, fark ve karşılaştırma, saatsizle saatli.
  - Filtre ve sıralama.
  - CSV ve Excel.
  - Takvim düzeni: çakışan kutuların sütunları, çok günlük öğe, tüm gün satırı, hafta ve ay aralıkları.
  - Today ve Upcoming'e giren kayıtlar: görünümün koşulları, açık ya da kapalı olması.
- **Şablonlar:**
  - On iki şablonun bütün kümeleri (4095) her cevapla çok uzun sürer. Bütün ikili ve üçlü kümeler, hepsi bir arada ve her biri eksik kalan kümeler denenir.
  - Kurulan her görünüm ve kural denetimden geçer.
- **agent:**
  - `save_record`'da saatli değer, `records`'ta gün aralığı.
  - Randevu akışı uçtan uca: hizmetten süre, çakışma, Reschedule, Done ve ödeme.
  - E-ticaret akışı uçtan uca: Ship, iade, stoğa dönüş, hakediş.
- **Tarayıcıda:**
  - Takvim, masaüstünde ve telefonda üç görünümüyle: taşıma, süre çekme, boş saate ekleme.
  - Today ve Upcoming'de kayıtlar.
  - Saat girişi.

## 9. Sunucu tarafına, sonraya

Uygulama Scrawl sunucusuna bağlı bir space'te bunları da kullanır; sunucusuz space'te yoktur.

- **Müşterinin kendisinin randevu alması:** sunucuda herkese açık randevu sayfası. Services, Staff, Resources ve boş saatlerden seçilir; alınan randevu Appointments'a Booked kayıt olarak düşer.
- **Hatırlatma:** sunucuda zamanlanmış iş, randevudan belli bir süre önce müşteriye e-posta ya da SMS (SMS sağlayıcısıyla). Sonraya kalanlar'daki "sunucuda otomasyon"la birlikte.
- **Pazaryeri ve kargo entegrasyonları:** Trendyol, Hepsiburada, Amazon gibi pazaryerlerinden siparişler kendiliğinden gelir (kanal, pazaryeri sipariş no, satırlar); kargo firması ve takip no pazaryerine geri yazılır; hakedişler, iadeler ve müşteri soruları okunur; kargo firmalarından takip durumu gelir. Altyapısı 22. aşamada, `design/integrations.md` (29 Ekim): entegrasyonu ajan yazar; sunucudaki space'te zamanlanmış koşuyla, sunucusuz space'te masaüstünden çalışır. E-ticaret'e hazır gelmesi sonraya kaldı (aynı belgenin 14. bölümü). Roadmap ROA-188.

## 10. Dilimler

Bugün, sırasıyla; her dilimin sonunda commit sorulur. Arayüzü olan dilim önce `design/mockups.html`'de mockup'la başlar.

1. **Saat:** tarihte saat, saat alanı, Duration biçimi, dil, filtre, sıralama, içe ve dışa aktarma, ajan. Mockup: Fields'te With time ve Time, gün ve saat kutusu, telefonda saat seçici.
2. **Takvim bileşeni:** Day, Week, Month; masaüstü ve telefon; Upcoming'in takvimi yerine. Mockup.
3. **Koleksiyonun ve panonun takvim görünümü; Today ve Upcoming'de kayıtlar.** Mockup: görünümün ayarları, Today'de bir kayıt.
4. **Bugünkü şablonlara takvim:** 5. bölüm; Activities ve Interviews saatli.
5. **Randevu ve rezervasyon.**
6. **E-ticaret.**


## 11. Kararlar

22 Ekim 2026'da onaylandı:

1. **Görev ve kartta saat:** saatsiz kalır, takvimde tüm gün satırında durur.
2. **Telefonda takvim:** Day ve Month; hafta telefona sığmaz.
3. **Bugünkü şablonlara takvim:** 5. bölümdeki tablo, Today ve Upcoming'de görünecekler dahil.
4. **Randevu'da Satış zinciri yok:** Done olan randevu Bütçe'ye ödeme yazar, sipariş açmaz.
5. **E-ticaret:** ayrı şablon, Satış'ın sorusu değil; kanal ve kargo listelerinin varsayılanı cihazın bölgesine göre; pazaryeri içe aktarması şimdilik ajanla.
6. **PLAN'da yeri:** yeni aşama "15 Takvim ve kalan şablonlar"; Dropbox 16, Google Drive 17, Mobil 18 oldu.

22 Ekim 2026'da, 1. dilimin kodu yazılırken verilen kararlar:
- Tablo tarihi bugünkü gibi yazar: "2026-10-22 14:30"; saati olmayan, alanı saatliyse soluk "all day".
- Bilgisayarda tarayıcının kendi gün ve saat kutuları; saatin 24 ya da 12 saat yazılışı tarayıcının dilinden. Saat kutusu gün seçilene kadar kapalı.
- Telefonda dakika çarkı beşer beşer (değer beşin katı değilse o da listede); Time açılınca 09:00'dan başlar; sheet'in altında No date tarihi temizler.
- Süre "90", "1:30", "1 h 30 min" ya da "2h" diye yazılır, bilgisayarda da telefonda da.
- `now()` geldi; iki saatli değerin farkı dakika, öteki gün; karşılaştırmada saatsiz değer 00:00.
- Saatsiz alana saatli değer gelirse (ajan, içe aktarma, kural) yalnız günü yazılır.
- İçe aktarmada hücreleri saatli sütun saatli tarih, yalnız saatler Time alanı olur; Excel'e saatli değer saatiyle (`m/d/yy h:mm`) gider.
- Düğmenin sorusu `type: "time"` ya da `type: "date", time: true` olabilir; ajan cevaplar.
- Fields'teki alan listesinde "date and time" ve "number · duration"; saatli tarih sütunu daha geniş.

22 Ekim 2026'da, 2. dilimin kodu yazılırken verilen kararlar:
- Haftanın tüm gün hücresinde üç öğe; fazlası varsa iki öğe ve "+N more". Day hepsini gösterir.
- Tüm gün hücresine tıklayınca günün penceresi açılır, aydaki gibi; öğe başka güne sürüklenince o günü alır, Undo'suyla.
- Add task her görünümde yarına ekler; takvim yarının olduğu yere döner.
- Upcoming'de saatlere tıklamak bir şey eklemez: görevin saati yok, kayıtlar 3. dilimde gelir.
- Başlıkta Today, ‹ ›, aralığın adı (hafta "Oct 19 – 25, 2026", gün "Thursday, Oct 22, 2026"); Day, Week, Month seçici Add task'in yanında. Status bar'da "5 tasks this week", "4 tasks on Fri, Oct 23".
- Saatler 07:00'nin biraz üstünden açılır, saati yarım görünmesin diye.
- Telefonda List, Day, Month; bilgisayarda seçilen Week telefonda Day görünür. Seçim cihazda kalır, bilgisayarınkiyle aynı yerde.
- Telefonda Day ve Month bugünle açılır (taslaktaki gibi; önceden ay yarınla açılıyordu). + gösterilen güne ekler.
- Telefonun Day'inde başlık, hafta şeridi ve çipler durur, yalnız saatler kayar. Çipe dokununca görev kendi sheet'inde, kart panosunda, alt görev kartında ya da kaydında açılır. Saatlerde sağa sola kaydırınca gün değişir.
- Başlığın altında Day'de gün yazılır; Month'ta yazılmaz, ayın adı hemen altında.
- Telefonda uzun basıp taşıma, kayıt kutularıyla 3. dilimde gelir.

22 Ekim 2026'da 3. dilimin mockup'ıyla onaylananlar:
- Görünümler çubuğunun sonunda +: Table (o anki tabloyla yeni görünüm, Save as view gibi; o da yerinde kalır) ya da Calendar.
- Calendar görünümünün penceresi: Name, Starts, Length (Ends, Duration ya da None: 30 dakika), Color, Show in Today and Upcoming, koşullar; sonra ··· ile değişir. Araç çubuğunda Today, ‹ ›, Day, Week, Month, Filter, ···; Group ve Columns yok.
- Starts saatliyse Week, yalnız günse Month ile açılır; seçim görünüm başına cihazda kalır.
- Boş saatlerde sürükleyip aralık seçince ya da yarım saate tıklayınca yeni kayıt formu, başlangıcı ve süresi dolu.
- Today'de görevler ve kartlar, sonra tüm gün kayıtlar, sonra saatliler saat sırasıyla. Kaydın satırında kutu yerine renginde çizgi; önce saati, sonra koleksiyonu, kişisi, bağlı kaydı. Geçmişte kalan soluk. Upcoming'in List'inde günlerin altında aynı sıra.
- Panonun Calendar'ı yalnız ay: kartın saati yok. Status bar günü olmayan kartları sayar.
- Telefonda takvim görünümü görünüm çiplerinde, Day ve Month; kurulması bilgisayarda. Kutuya uzun basıp sürükleyince saati, şeritteki güne bırakınca günü değişir. Today'de kayıtlar saat sütunuyla.

22 Ekim 2026'da, 3. dilimin kodu yazılırken verilen kararlar:
- Dosyada `"kind": "calendar"` ve `"calendar": { start, end?, duration?, color?, upcoming }`. İkisi birden yazılmışsa end geçer. Silinmiş bir alanı adlayan ayar düşer; start ilk tarih alanına döner, tarih alanı hiç yoksa görünüm tablo olur.
- Yeni takvim görünümü: adı Calendar, ilk tarih alanı, süre biçimli bir sayı varsa Length'te o, ilk seçim alanı renk, Show in Today and Upcoming açık.
- Length'te bitiş için tarih alanları ve tarih veren formüller, süre için sayılar ve sayı veren formüller, bir de None. Color'da yalnız seçim alanları.
- Görünümün Day, Week ya da Month seçimi cihazda, tarayıcının deposunda kalır.
- Başlangıcı formül olan kayıt taşınmaz, yalnız açılır. Bitişi yazılan bir alansa kayıtla birlikte kayar. Süre ya da bitiş yazılan bir alan değilse kutunun altı çekilmez. Yalnız gün tutan alana saat yazılmaz.
- Tüm gün satırında ve ayda sürüklenen kayıt günü alır, saati kalır.
- Ayda günün boş yerine ya da tüm gün hücresine tıklayınca o güne yeni kayıt açılır. Ayda günün numarası o günün Day'ini açar; +N more günün listesini küçük bir pencerede gösterir.
- Today'de kayıtlar Today bölümünde görevlerden sonra gelir; kartlar bugünkü gibi panolarının altında kalır. Önceki gün başlayıp bugün süren kayıt bugünün altında tüm gün görünür. Bugün bitmiş olan soluktur.
- Upcoming'in takviminde bugünden ileriki saatli kayıtlar kutudur, orada da taşınır ve uzatılır, Undo'suyla. Status bar'da "5 tasks · 4 records this week"; Today'de "… · 3 records".
- Kenar çubuğundaki Today ve Upcoming sayıları kayıtları saymaz, bugünkü gibi.
- Panonun takviminde bitmemiş kartlar, bütün fazlarıyla. Yalnız bilgisayarda; telefonda Board ve List kalır, bilgisayarda seçilen Calendar telefonda Board açılır. Status bar'da "11 cards in October · 12 with no day".
- Telefonda takvim görünümünde + gösterilen güne kayıt ekler. Uzun basma 0,45 saniye; parmak şeridin üstündeyken yalnız gün değişir, saat kalır.
- Ajanın `records`'unda `from`, `to` ve `due` (today, upcoming). Bunlar koleksiyonun ilk takvim görünümünün başlangıç alanına göre çalışır, takvim yoksa ilk tarih alanına göre. Koleksiyon verilmezse takvimlerin Today ve Upcoming'e getirdiği kayıtlar gelir; space adlanmadıysa her space'te aranır. Rehber takvim görünümünü ve "bugün neler var" sorusunu anlatır.

22 Ekim 2026'da, 4. dilimin kodu yazılırken verilen kararlar:
- Takvim görünümü yalnız o kurulumda açılan koleksiyona yazılır; Add to app'te var olan koleksiyona eklenmez. Her şablonun görünümünün adı Calendar.
- Orders ve Payments vadeye (Due) göre; Bütçe şablonunda vade kapatıldıysa tarihe (Date) göre.
- Renk: Activities, Interviews ve Maintenance türe göre; Payments yöne göre (In, Out); ötekiler duruma göre.
- CRM'in Log a call ve Log a meeting düğmeleri görüşmeyi şimdiki gün ve saatle yazar; şirketin Last contact'ı da saatiyle görünür. İşe alımın Schedule interview'ı saati de sorar.
- Panolara (Requests, Work, Content) bir şey eklenmez; Calendar her panoda var.

22 Ekim 2026'da, 5. dilimin kodu yazılırken verilen kararlar:
- Kural dili genişledi (onaylı): `check()` içinde yalnız okuyan `find()` ve `linked()`; değiştirenler orada reddedilir. Formüllerde ve kurallarda `weekday(x)`, Mon … Sun, günler seçiminin yazdığı gibi İngilizce.
- Şemada `defaultView`: koleksiyon, cihazda bir görünüm seçilene kadar onunla açılır; Appointments Calendar ile açılır.
- Takvimin rengi bir bağlantı ya da kişi alanı da olabilir, adının rengiyle; Appointments ekipte çalışana, değilse duruma göre renklenir.
- Sorular: neyin randevusu (hizmet, kaynak, ikisi), kim veriyor (yalnız ben, ekip), ekip listesi (boş gelir), hizmetler (Consultation 30, Follow-up 15), kaynaklar (Room 1, Room 2), ücret, Bütçe seçiliyse ödeme.
- Çalışanın mesaisi 09:00–18:00, Pazartesi–Cuma gelir; kendi ekranında değişir. Hizmeti olmayan randevunun süresi 60 dakika gelir.
- Alanlar: Title, Customer (People), Service, With (Staff), Resource, Start (saatli, zorunlu), Duration, Ends (formül), Status, Price (ücretliyse), Note.
- Düğmeler: Confirm yalnız Booked olana; Done, No-show, Cancel ve Reschedule Booked ya da Confirmed olana. Cancel nedeni Note'a yazar; Reschedule yeniden Booked yapar.
- Kontroller: aynı çalışanın ya da kaynağın çakışanı ("Overlaps with …, 14:30"), mesai dışı ("Outside Ayşe's hours, 09:00 to 18:00"), çalışmadığı gün ("Ayşe does not work on Sun"); iptal edilmiş olan işaretlenmez, sayılmaz.
- Done olan randevunun ödemesi: fiyatı kadar, gelen, Invoiced, Appointments bütçe satırına, randevuya bağlı.
- People'da Last appointment, Appointments, No-shows; Staff'ta bugünkü randevu sayısı (Today).
- Ekipte her çalışanın takvim görünümü kendi adıyla; Today ve Upcoming'e yalnız ortak takvim gelir.
- Şablon Customers grubunda, Customer support'tan sonra; README'de ve karşılama notunda şablon listesinde.

22 Ekim 2026'da E-ticaret için onaylanan öneri:
- E-ticaret seçilince Satış da kurulur; Stok zorunlu değil, varsa iade stoğa döner. Money grubunda.
- Channels: ad, komisyon %, sipariş başı ücret, hakediş günü; sipariş sayısı, ciro, net kâr, iade oranı.
- Orders'a kanal, pazaryeri sipariş no, kargoya son gün, kargo firması, takip no, kargo maliyeti; Confirmed ile Delivered arasında Packed ve Shipped; komisyon, ürün maliyeti, net kâr, marj.
- Returns (soruya göre): sipariş, ürün, adet, neden, durum (Requested, Received, Refunded, Rejected), iade tutarı.
- Products'a satılan, iade edilen, iade oranı, kâr; Stok yoksa maliyet.
- Ship (kargo firması ve takip no) ve Return düğmeleri; Received stoğa giriş, Refunded giden ödeme, Delivered kanalın hakedişi beklenen tahsilat; kargoya son günü geçen sipariş işaretlenir; Destek varsa talep kanallarına pazaryeri soruları ve yorumlar.
- Orders'a "To ship" takvimi, kargoya son güne göre, Today ve Upcoming'de; Satış'ın vade takvimi kalır.
- Sorular: kanallar, kargo firmaları, iadeler, Bütçe seçiliyse hakediş ve iade ödemeleri. Varsayılan listeler bölgeye göre: Türkiye'de Trendyol, Hepsiburada, Amazon, Own site ve Yurtiçi, Aras, MNG, PTT Kargo; başka yerde Amazon, eBay, Etsy, Own site ve DHL, UPS, FedEx, DPD. Ajan genel listeyle kurar.

22 Ekim 2026'da, 6. dilimin kodu yazılırken verilen kararlar:
- Bölge, şablon penceresinde tarayıcının dilinden okunur (tr → TR). Soru tanımına bölgeye göre varsayılan (`regional`) eklendi.
- Packed ve Shipped Satış'ın durumlarına E-ticaret kuruluysa girer. Stok'ta "onaylanınca düş" seçiliyse bu iki durumda da stok düşmüş sayılır.
- Komisyon pay olarak tutulur (0,2 = %20) ve yüzde görünür. Net kâr vergi açıksa ara toplamdan, değilse toplamdan hesaplanır.
- Kanalın sayıları Cancelled ve Quote siparişleri saymaz. İadenin kanalı kaydedilirken siparişinden yazılır; kanalın iade oranı buradan çıkar.
- Ürünün satılan adedi bütün sipariş satırlarını sayar, iptal edilenleri de; satırın durumu yok.
- Ship yalnız Confirmed ya da Packed olana, Return yalnız gönderilmiş olana çıkar. İade "Return of ORD-0001" adıyla Requested açılır.
- Hakediş Planned yazılır; tutarı toplamdan komisyon düşülerek, vadesi bugün + kanalın günü. İade ödemesi Paid, bugün yazılır. İkisi de Sales bütçe satırına gider.
- "To ship" kanala göre renklenir.
- İkonlar: E-ticaret globe; Randevu clock oldu (calendar İçerik takviminde).
- README'de ve karşılama notunda on iki şablon.
- Düzeltme: kanalı olan siparişte "Left to collect" komisyonu düşer (toplam − komisyon − tahsil edilen); hakediş ödenince sıfırlanır. Sipariş satırı siparişinin durumunu gösterir (Order status); ürünün satılanı ve kârı Quote ve Cancelled siparişleri saymaz.
- Add to app düzeltmesi (onaylı): var olan bir seçim alanına yeni şablonun getirdiği seçenekler eklenir, şablondaki sırasıyla; kişinin eklediği seçenekler ve renkler kalır. Şablonun yazdığı ve kimsenin değiştirmediği formül yenisiyle değişir; kişinin değiştirdiği formüle dokunulmaz. Özet bunları "2 choices, 1 formula worked out anew" diye söyler. Böylece Satış'ı kurulu bir app'e eklenen E-ticaret Packed ve Shipped'i ve yeni "Left to collect"i getirir.
