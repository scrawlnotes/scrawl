# Outlook takvimi

Durum: 8 Kasım 2026'da onaylandı. 10. bölümdeki kararlar ve 9. bölümde dışarıda bırakılanlar onaylı; PLAN'da 4.13 ve 23. aşama. 1. dilimin mockup'ı onaylı: `design/mockups.html` › Outlook takvimi (data-dir="outlook").

Neden: Scrawl'daki işler telefonda, günün toplantılarının yanında, Scrawl'ı açmadan görülebilsin. Ölçüt Todoist'in takvim entegrasyonu ([Use the Calendar integration](https://todoist.com/help/articles/use-the-calendar-integration-rCqwLCt3G)). Bir farkla: Today'deki her şey takvime dökülmez, neyin gideceği tür tür seçilir (Tasks, Boards, her app, Collections). Today'e bir şey getiren bir app kurulurken de sorulur. Outlook'la başlanır, Google sonra gelir.

## 1. Kapsam

### 1.1 Ne yapar

Todoist'teki gibi, tek bir bağlantıyla iki şey yapar:

1. **Outlook'taki etkinlikler Scrawl'da görünür.** Toplantılar Today'de, Upcoming'de ve takvimde görünür. Scrawl'da değiştirilemezler, tıklanınca Outlook'ta açılırlar. Hangi Outlook takviminin görüneceği seçilir.
2. **Scrawl'daki işler Outlook'a gider.** Outlook'ta "Scrawl" adında ayrı bir takvim açılır. Seçilen takvimlerin, listelerin ve panoların işleri oraya etkinlik olarak yazılır. Telefonda Outlook'ta görünürler, Outlook hesabı ekliyse iPhone'un Takvim uygulamasında da.
   - Scrawl'da değişen her şey Outlook'a gider.
   - Outlook'ta etkinliğin adı, günü ya da saati değişirse Scrawl'daki iş de değişir. Etkinlik silinirse iş çöpe gider. Todoist'te de böyle, orada iş siliniyor.
   - Outlook'ta "Scrawl" takvimine elle eklenen bir etkinlik Scrawl'a gelmez. Todoist'te de gelmez.

### 1.2 Ne yapmaz

- Outlook'taki öbür takvimlerin etkinlikleri Scrawl'da düzenlenmez.
- Etkinlikler Scrawl'a yazılmaz. Space'e girmezler, sync edilmezler; görüneceği an Outlook'tan okunurlar. Todoist de saklamıyor.
- Ajan için yeni bir araç yok.

### 1.3 Neden bugünkü parçalar yetmiyor

Scrawl'ın takvimi yalnız uygulamanın içinde. Telefonda Scrawl'ı açmadan işleri toplantıların yanında görmenin yolu yok. Scrawl'da da Outlook'taki toplantılar görünmüyor, bu yüzden Today günün yarısını gösteriyor.

## 2. Kullanıcı ne görür

### 2.1 Settings › Calendars

Settings'te Notifications'tan sonra yeni bir bölüm. Telefonda Settings'te bir satır, kendi sayfasıyla. Önce mockup yapılır.

- **Bağlı değilken:** Connect Outlook Calendar. Microsoft girişi açılır, OneDrive girişindeki gibi; masaüstünde sistem tarayıcısında. Dönünce hesabın adı ve e-postası görünür, yanındaki menüde Disconnect vardır.
- **Show events in Scrawl** (açık gelir). Altında hesabın takvimleri, her birinin anahtarıyla. Kişinin kendi takvimleri açık gelir, başkasından paylaşılanlar kapalı. Todoist Outlook'ta böyle yapıyor. "Scrawl" takvimi bu listede yer almaz, çünkü içindeki işler Scrawl'da zaten görünüyor.
- **Sync to Outlook** (kapalı gelir). Açılınca altında **What goes** listesi çıkar. Listede Today ve Upcoming'e giren her şey tür türdür, her satırın bir anahtarı vardır. Liste tek tek panoları ya da görev listelerini göstermez:
  - **Tasks:** görev listelerindeki ve Inbox'taki görevler, alt görevleriyle.
  - **Boards:** panolardaki kartlar, alt görevleriyle.
  - **Kurulu her app ayrı bir satırdır** (Gym, Appointments gibi). Satır, app'in klasöründe Today'e giren her şeyi kapsar: takvimlerinin kayıtlarını, tekrar eden günleri (Gym'in antrenman günleri gibi), kayıtların alt görevlerini, app'in içindeki panoları ve görev listelerini. App'in içindeki bir pano Boards'a sayılmaz, app'in satırına aittir.
  - **Collections:** app dışındaki koleksiyonların Show in Today and Upcoming açık takvimleri. Yalnız böyle bir koleksiyon varsa görünür.
  - Her satır bütün space'leri kapsar. Bir app'in satırı ise yalnız o app'i.
  - **Varsayılan:** Tasks ve Boards açık, app'ler ve Collections kapalı. Sync to Outlook açılınca görevler ve kartlar hemen gider; öbürlerini kişi hemen altından açar.
  - Yalnız kişinin kendi işleri gider, Today'deki kurala göre. Paylaşılan bir listede başkasına verilmiş görev gitmez.
- **App kurulurken:** kişide Sync to Outlook açıksa ve kurulan app Today'e bir şey getiriyorsa, New app penceresinin app sayfasında (adın, yerin ve para birimlerinin sorulduğu sayfa) bir anahtar daha çıkar: **Sync to connected calendar**. Kapalı gelir. Seçim app'in cevaplarına yazılmaz, kişinin seçim dosyasına yazılır, çünkü paylaşılan bir space'te her kişinin seçimi kendine aittir. Bu yüzden Edit app'te görünmez; sonradan Settings › Calendars'tan değiştirilir.
  - Sync to Outlook kapalıyken kurulan app için bir şey sorulmaz. App listede kapalı görünür.
  - Var olan bir app'e şablon eklenirken sorulmaz, app'in satırı olduğu gibi kalır.
  - Ajanın kurduğu app için de sorulmaz, app kapalı gelir.
- **Sync to Outlook kapatılırsa** "Scrawl" takvimi Outlook'tan silinir. Önce sorulur: "The Scrawl calendar and its 14 events will be removed from Outlook." Todoist de böyle siliyor.

### 2.2 Outlook'ta

- **Görev ve kart:** gününde tüm gün süren bir etkinlik olur. Adı görevin başlığıdır; kartta önce anahtarı gelir, "ROA-12 Fix the login" gibi.
- **Takvim kaydı:** adıyla yazılır. Saati varsa Scrawl'ın takviminde göründüğü gibi, başlangıcından bitişine kadar sürer. Saati yoksa tüm gün olur.
- **Etkinliğin notu:** nerede olduğunu söyler, "Scrawl · Work › Roadmap" gibi.
- **Bitince:** adın başına ✓ gelir ve etkinlik takvimde kalır (Todoist'teki gibi). Kartın Done ya da Dropped sütununa gitmesi de bitmek sayılır.
- **Silinince:** iş çöpe giderse, seçimden çıkarsa ya da artık kişinin değilse (başkasına verildiyse) etkinliği silinir.
- **Aralık:** dünden 62 gün sonrasına kadar, Upcoming'in baktığı kadar. Aralığın gerisinde kalan etkinliklere dokunulmaz, ✓'lı bitmiş işler orada kalır.
- **Tekrar eden kayıtlar** (Gym planı, alışkanlık gibi): her günü ayrı bir etkinlik olur.

### 2.3 Outlook'tan geri gelenler

- **Ad değişirse:** görevin ya da kartın başlığı, kaydın adı değişir. Kaydın adı hesaplanıyorsa ("Technical · Ayşe Yılmaz" gibi) değişmez; bir sonraki turda Outlook'a Scrawl'daki ad geri yazılır.
- **Gün ya da saat değişirse:** görevin ya da kartın son günü, kaydın başlangıcı değişir. Bitiş alanı varsa aynı kadar kayar, süre alanı olduğu gibi kalır.
- **Görev ya da kart saatli bir yere taşınırsa** yalnız günü alınır. Scrawl'da görevlerin ve kartların saati yok, etkinlik tüm gün olarak geri döner.
- **Saatli bir kayıt tüm gün yapılırsa** saati kalkar, Todoist'teki gibi.
- **Etkinlik silinirse** iş çöpe gider ve Trash'ten geri alınabilir.
- **Tekrar eden bir kaydın tek günü** Outlook'ta değişirse geri gelmez; bir sonraki turda Scrawl'daki hali yazılır. Todoist'te de tek tekrar değişikliği geri gelmez.
- **İki tarafta birden değişirse** Scrawl'daki kalır.
- Geri gelen değişiklik kişinin adıyla yazılır, Activity'de onun yaptığı görünür.

### 2.4 Scrawl'da Outlook etkinlikleri

- **Today:** en üstte günün etkinlikleri, saat sırasıyla kısa bir grup halinde. Todoist bunu "event stack" diye gösteriyor. Telefonda da aynı.
- **Upcoming:** List'te her günün başında. Calendar'da (Day, Week, Month) saatli bloklar ve tüm gün şeridi olarak, Outlook takviminin rengiyle.
- **Tıklanınca** etkinlik Outlook'ta açılır.
- Today ve Upcoming'deki görünüş önce mockup'ta çizilir.

## 3. Nerede çalışır

- Outlook'a bağlı ve Scrawl'ın açık olduğu her cihazda: masaüstünde, web'de ve telefonda. Microsoft Graph tarayıcıdan çağrılabiliyor, yani entegrasyon kuralına uyuyor (PLAN 3). Masaüstü tepside arka planda çalıştığı için bilgisayar açıkken Outlook hep güncel kalır.
- Scrawl hiçbir cihazda açık değilse Outlook güncellenmez; ilk açılan cihaz eksikleri tamamlar. Sunucu Microsoft'a bağlanmaz. Kişinin işleri birden çok yerde durabiliyor (OneDrive'daki kişisel space, sunucudaki space'ler), sunucu ise yalnız kendinde olanı görüyor.
- Bağlantı her cihazda ayrı yapılır, OneDrive girişi gibi. Seçim ve takvimin hangi hesaba gideceği kişisel space'te durur, her cihazda aynıdır. Başka bir hesapla bağlanmış bir cihaz o hesabın etkinliklerini gösterir ama Scrawl takvimine yazmaz. Todoist de görevleri tek bir hesaba gönderiyor.
- **Ne zaman çalışır:** açılışta; Scrawl'da bir iş değişince, birkaç saniye bekleyip toplu olarak; pencere öne gelince; açıkken de 5 dakikada bir, Outlook'tan gelenler için. Outlook'un anında haber vermesi (change notification) için internetten erişilebilen bir adres gerekiyor, cihazda böyle bir adres yok.

## 4. Teknik

### 4.1 Microsoft girişi

- Uygulama kaydı aynı kalır: `DEFAULT_CLIENT_ID` ya da kişinin girdiği kimlik. Giriş ve anahtar ise OneDrive'ınkinden ayrı olur. Kapsamlar: `Calendars.ReadWrite offline_access User.Read`.
- Neden ayrı: takvimin hesabı OneDrive'ın hesabından farklı olabilir (iş Outlook'u, kişisel OneDrive). Sunucudaki space'leri kullanan biri de OneDrive'a hiç girmemiş olabilir.
- `cloud.ts`'teki giriş akışı ikinci kez kullanılır, bu kez kapsamı ve anahtarın saklandığı adı parametre olarak alır. Akış şöyle: PKCE; masaüstünde sistem tarayıcısı, `oauth_listen` ve kimlik deposu; tarayıcıda yönlendirme, `localStorage` ve 20 saatte bir yenileme. Yeni giriş kodu yazılmaz. Rust tarafında yalnız ikinci bir saklama adı eklenir.
- Microsoft izinleri giriş anında istendiği için uygulama kaydına önceden izin eklemek gerekmez. Bir kurum Calendars.ReadWrite için kullanıcı onayını kapattıysa yöneticinin onaylaması gerekir; Todoist'te de böyle.

### 4.2 Graph çağrıları

- **Takvimler:** `GET /me/calendars` (id, ad, renk, sahibi, yazılabilir mi).
- **Gösterme:** görünür her takvim için `GET /me/calendars/{id}/calendarView?startDateTime=…&endDateTime=…`, `Prefer: outlook.timezone="<cihazın IANA saat dilimi>"` başlığıyla. Yalnız ekrandaki aralık okunur, bellekte tutulur, diske yazılmaz.
- **Scrawl takvimi:** `POST /me/calendars { name: "Scrawl" }`. Kimliği seçim dosyasında durur. Takvim Outlook'ta silinmişse yeniden açılır.
- **Etkinlikler:** aralıktaki bütün Scrawl etkinlikleri `calendarView` ile, `$expand=singleValueExtendedProperties($filter=id eq '<Scrawl özelliği>')` eklenerek okunur. Oluşturma `POST /me/calendars/{id}/events` ile yapılır; `transactionId` işin kimliğinden türetilir, böylece yeniden denemede aynı etkinlik iki kez açılmaz. Değiştirme `PATCH`, silme `DELETE` ile. Hepsi 20'lik `$batch` paketleriyle gönderilir.
- **Saat:** Scrawl'da saat dilimi yok, duvar saati kullanılıyor. Outlook'a yazarken cihazın IANA saat dilimi verilir, okurken de `Prefer` başlığıyla aynı dilim istenir. Graph'ın IANA adlarını kabul ettiği 1. dilimde gerçek hesapla denenir; kabul etmezse Windows adına çevrilir.
- **Hata:** 429 ve 503'te `Retry-After` kadar beklenir. 401'de anahtar yenilenir; yenilenemezse Settings'te "Sign in again" çıkar. Bir tur yarıda kalırsa bir sonraki tur baştan karşılaştırır, bu yüzden yarım iş kalmaz.

### 4.3 Eşleştirme

- **Taban etkinliğin üstünde:** her etkinlik, Scrawl'a ait bir extended property taşır. İçinde işin kimliği ve Scrawl'ın en son yazdığı hali var: `{ v: 1, id, kind, title, start, end, allDay, done }`. Outlook'ta etkinliği değiştirmek bu özelliği değiştirmez. Böylece taban için ayrı bir dosya gerekmez ve her cihaz aynı tabanı görür.
- **Her tur üç yollu karşılaştırır,** sync motorundaki gibi: Scrawl'daki iş, taban ve Outlook'taki hal.
  - İş değişmiş, Outlook değişmemişse `PATCH` gider.
  - Outlook değişmiş, iş değişmemişse değişiklik işe yazılır (2.3), sonra taban güncellenir.
  - İkisi birden değişmişse Scrawl kazanır.
  - Seçili bir işin etkinliği yoksa ve bu cihaz onu daha önce görmemişse `POST` gider.
  - İş artık istenmiyorsa (2.2) `DELETE` gider.
- **Silineni tanımak:** her cihaz, gördüğü iş ile etkinlik eşlerini kendinde tutar (IndexedDB). Daha önce görülmüş bir etkinlik Outlook'ta yoksa silinmiştir ve iş çöpe gider. Hiç görülmemişse yeniden açılır. Bir kenar durumu var: yeni bağlanan bir cihazın ilk turunda Outlook'ta silinen bir etkinlik bir kez yeniden açılabilir. Silmeyi gören cihaz işi çöpe atınca o etkinlik de silinir.
- **Kurallar çekirdekte, saf fonksiyonlar olarak:** `wantedEvents(spaces, choice, me, today)` istenen etkinlikleri çıkarır. Today'in beslendiği yerlerden okur: görevler, `dueCards` ve `dueCardSubtasks`, `dueRecords`, `repeatDays` ve `dueRecordSubtasks`. Her birini yoluna göre bir satıra bağlar: app'in klasöründeyse o app'e, değilse Tasks'e, Boards'a ya da Collections'a. `planCalendar(wanted, events, seen)` ise `{ create, update, remove, back }` döner. `back` Scrawl'a yazılacakları taşır ve düğmeler gibi tek seferde, Undo'lu yazılır.

### 4.4 Seçim dosyası

Seçim, kişisel space'te `.scrawl/calendars.json` dosyasında durur; `.scrawl/favorites.json` gibi kişinin dosyasıdır ve sync'te 3 yollu birleşir (`merge-files.ts`'e yeni bir tür eklenir).

```json
{
  "version": 1,
  "account": "kaan@outlook.com",
  "calendar": "AAMkAG…",
  "show": { "AAMkAG…birthdays": false },
  "sync": true,
  "goes": { "tasks": true, "boards": false, "collections": false, "apps": { "@sp-…/Gym": true, "Clinic": false } }
}
```

Dosyada yalnız varsayılandan farklı olanlar tutulur. Yazılmamışsa Tasks ve Boards açık, app'ler ve Collections kapalı sayılır. App'ler klasörlerinin yoluyla yazılır, space'ler favorilerdeki gibi gösterilir.

### 4.5 Kodda

- **core:** `outlook-calendar.ts` (`wantedEvents`, `planCalendar`, dosyanın okunması, yazılması ve birleşmesi). Graph istemcisine takvim uçları, `FakeGraph`'a takvimler ve etkinlikler eklenir.
- **web:** `cloud.ts` girişi parametreli hale gelir. Yeni `outlook.ts` bağlantıyı ve turun zamanlamasını yönetir. `Settings.tsx`'e Calendars bölümü eklenir. `AppWizard.tsx`'in app sayfasına Sync to connected calendar eklenir. Today, Upcoming ve `Calendar.tsx`'e etkinlik katmanı, telefona Settings sayfası eklenir.
- **masaüstü:** anahtar için ikinci bir saklama adı. Arka planda çalışma zaten var (18. aşama).
- **Help:** Settings'e Calendars, Today'e ve Upcoming'e etkinlikler için birer satır.

## 5. Güvenlik

- Anahtar yalnız cihazda durur: masaüstünde kimlik deposunda, tarayıcıda `localStorage`'da. Space'e ya da sunucuya gitmez.
- İzin yalnız takvim içindir; e-postaya ve kişilere erişim yoktur.
- Scrawl yalnız kendi açtığı "Scrawl" takvimine yazar, öbür takvimleri yalnız okur.
- Etkinlikler hiçbir yerde saklanmaz.

## 6. Testler

### 6.1 Otomatik

- `wantedEvents`: her şeyin doğru satıra bağlanması (app'in içindeki pano app'e, app dışındaki koleksiyon Collections'a); yazılmamışsa Tasks ve Boards'un açık, app'lerin ve Collections'ın kapalı sayılması; yalnız kişinin işleri; aralık; tekrar eden günler; alt görevler; ✓; kartta anahtar.
- New app: Sync to Outlook açıkken ve app Today'e bir şey getiriyorsa anahtarın çıkması, öbür durumlarda çıkmaması, seçimin kişinin dosyasına yazılması.
- `planCalendar`: oluşturma, değiştirme ve silme; iki taraf birden değişince Scrawl'ın kalması; Outlook'ta silinenin çöpe gitmesi, görülmemişin yeniden açılması; tüm gün ile saatli arasında geçiş; hesaplanan adın geri yazılması; tekrar eden tek günün geri gelmemesi.
- `FakeGraph` ile tam bir tur: takvimin açılması, `$batch`, 429, silinmiş takvimin yeniden açılması.
- `calendars.json` dosyasının birleşmesi.

### 6.2 Elle (bitti ölçütü)

Gerçek bir outlook.com hesabıyla masaüstünde bağlanılır. Seçilen işler iPhone'da Outlook'ta görünür. Orada taşınan bir iş Scrawl'da da taşınır, silinen iş çöpe gider. Toplantılar Scrawl'ın Today'inde ve Upcoming'inde görünür.

## 7. Dilimler

1. **Bağlantı ve Outlook etkinliklerinin Scrawl'da görünmesi:** Settings › Calendars'ın üst yarısı; Today, Upcoming ve Calendar'daki katman. Önce mockup.
2. **Scrawl'dan takvime, Outlook ve Google:** Sync tasks to calendar, iki hesap bağlıyken Sync to, What goes listesi, Scrawl takvimi, seçim dosyası. Önce mockup.
3. **Takvimden geri gelenler, iki sağlayıcıdan:** ad, gün ya da saat, silme.
4. **Google bağlantısı ve etkinlikleri:** Settings › Calendars iki hesaplı (11.1). Sıra: 1, 4, 2, 3.

## 8. PLAN'da değişenler (8 Kasım 2026)

- 4.13 Outlook takvimi: 1. ve 2. bölümün kısası.
- 6. bölümde 23. aşama "Outlook takvimi". Dış entegrasyonlar 24, Dosya ve klasör yetkisi 25, Dropbox, S3 ve GitHub 26, Google Drive 27, Mobil 28 oldu.
- Sonraya kalanlar: takvimde Google Calendar.
- Roadmap'te faz "23 Outlook takvimi" ve üç dilim kartı.

## 9. Dışarıda bırakılanlar (8 Kasım 2026'da onaylandı)

- **Google Calendar:** Outlook'tan sonra (8 Kasım, kullanıcı: "outlookla başlayabiliriz"). Aynı gün 4. dilim oldu (11. bölüm).
- **Apple / iCloud:** yok (kullanıcı: "apple önemli değil"). Açık API'si yok. Todoist'te de doğrudan yok; iCloud takvimi Outlook'a abone edilirse Scrawl'da görünür.
- **Sunucunun Microsoft'a bağlanıp cihazlar kapalıyken yazması:** yok, gerekçesi 3. bölümde.
- **Ajanın Outlook etkinliklerini görmesi:** yok. Anahtar cihazda duruyor, sunucudaki `/mcp` ona ulaşamıyor. Todoist'te de etkinlikler yalnız gösteriliyor.
- **Outlook'ta Scrawl takvimine eklenen etkinliğin Scrawl'da iş olması:** yok, Todoist'te de yok.

## 10. Kararlar (8 Kasım 2026'da onaylandı)

1. **Kapsam:** Todoist'teki gibi iki parça (1.1). Outlook'taki ad, gün, saat değişikliği ve silme Scrawl'a geri gelir; Outlook'ta Scrawl takvimine elle eklenen bir etkinlik gelmez.
2. **Seçim:** Todoist'ten farklı olarak neyin gideceği What goes listesinde tür tür seçilir: Tasks, Boards, kurulu her app ve Collections (app dışındaki takvimler). App'in içindeki her şey o app'in satırına aittir. Yalnız kişinin kendi işleri gider.
3. **Varsayılan:** Tasks ve Boards açık, app'ler ve Collections kapalı (8 Kasım, kullanıcının kararı). Sync to Outlook açıkken Today'e bir şey getiren bir app kurulursa New app'te Sync to connected calendar sorulur ve kapalı gelir. Var olan app'e şablon eklenirken ve ajanın kurduğu app'te sorulmaz.
4. **Bitince ✓, silinince çöp:** biten işin etkinliği ✓ ile kalır. Outlook'ta silinen etkinliğin işi çöpe gider.
5. **Aralık:** dünden 62 gün sonrasına kadar.
6. **Nerede:** Scrawl'ın açık olduğu cihazlarda çalışır, masaüstü tepsiden de çalışır. Sunucu Microsoft'a bağlanmaz.
7. **Bağlantı:** her cihazda ayrı yapılır ve OneDrive girişinden ayrıdır. Seçim kişisel space'te durur.
8. **Çakışma:** iki tarafta birden değişirse Scrawl kazanır. Görev ve kartta Outlook'tan yalnız gün alınır.

## 11. Google Calendar (4. dilim, 8 Kasım 2026)

Outlook'un yaptığının aynısı Google Calendar'la: Google'daki etkinlikler Scrawl'da görünür, işler Google'da ayrı bir "Scrawl" takvimine gider, oradaki değişiklikler geri gelir. `wantedEvents` ve `planCalendar` ortaktır; değişen giriş, API çağrıları ve Settings › Calendars'taki satırdır. Dilimin taslağı ve mockup'ı ayrıca onaya gelir.

- **İzinler** (konsolun sınıflaması, `design/cloud.md` 10.7): `calendar.calendarlist.readonly` (hassas değil, takvim listesi), `calendar.events.readonly` (hassas, seçili takvimlerin etkinlikleri), `calendar.app.created` (hassas değil, "Scrawl" takvimini açmak, ona yazmak, oradaki değişiklikleri okumak; başka takvime dokunmaz). Bütün takvime erişen `calendar` istenmez. Kısıtlı izin yok, güvenlik denetimi (CASA) gerekmez; `calendar.events.readonly` için Google'ın incelemesi gerekir.
- **Giriş:** Drive'ınkinden ayrı, Outlook'un OneDrive'dan ayrı olması gibi. Masaüstünde Google'ın masaüstü kaydıyla `localhost` dönüşü; web'de ve telefonda kod ve yenileme app.scrawlnotes.com'daki Worker'dan (`design/cloud.md` 10.6).
- **Graph'ın karşılıkları:** `calendarList.list` (ad, renk, `accessRole`), `events.list` (`timeMin`, `timeMax`, `singleEvents=true`, `timeZone` cihazın IANA adıyla; Google IANA adlarını doğrudan alır), `calendars.insert { summary: "Scrawl" }`, `events.insert` / `patch` / `delete`. Taban, Outlook'taki extended property yerine `extendedProperties.private`'tadır. Etkinliğin kimliği işin kimliğinden türetilir (Google kimliği istemcinin vermesine izin verir, base32hex, 5–1024 karakter); yeniden denemede aynı etkinlik iki kez açılmaz, `transactionId`'nin işini görür. Tıklanınca `htmlLink` Google Calendar'da açar. `429` ve `403 rateLimitExceeded`'da beklenip yeniden denenir.

### 11.1 Tasarım (8 Kasım 2026'da onaylandı, mockup'ıyla)

Ölçüt yine Todoist ([Use the Calendar integration](https://todoist.com/help/articles/use-the-calendar-integration-rCqwLCt3G)): Settings › Calendars'ta Connect Google Calendar ve Connect Outlook Calendar; bağlanan her hesabın takvimleri kendi altında; Show events bütün hesaplar için tek anahtar; işler tek bir hesaba gider, iki hesap bağlıyken Sync to ile seçilir. Mockup: `design/mockups.html` › Outlook takvimi, "G:" ile başlayan görünümler.

**Dilimler.** Google'ın yazan parçaları ayrı bir dilim olmaz; Outlook'un 2. ve 3. dilimleri iki sağlayıcıyla yazılır, çünkü `wantedEvents` ve `planCalendar` ortaktır ve aynı şey iki kez yazılmaz:

- **4. dilim (şimdi):** Google bağlantısı ve Google etkinlikleri Scrawl'da; Settings › Calendars iki hesaplı düzene geçer.
- **2. dilim "Scrawl'dan takvime":** Sync tasks to calendar, iki hesap bağlıyken Sync to (Outlook ya da Google), What goes; "Scrawl" takvimi seçilen hesapta. New app'teki anahtar Sync to connected calendar'dır, hangi takvime gittiğini altındaki cümle söyler. Önce mockup, ROA-374'te.
- **3. dilim "Takvimden geri gelenler":** iki sağlayıcıdan.
- **Google'a başvuru 2. dilimden sonra:** video "Scrawl" takvimini de göstermeli.

**Settings › Calendars.**

- Üstte bir cümle: "Your Outlook and Google meetings in Today, Upcoming and the calendar, beside your tasks."
- Hiçbiri bağlı değilken iki düğme alt alta: **Connect Google Calendar** ("A Google account.") ve **Connect Outlook Calendar** ("A work or a personal Microsoft account.").
- Biri bağlanınca en üstte **Show events in Scrawl**, bütün hesaplar için tek anahtar (bugün Outlook hesabının altında; seçim dosyasında zaten tek, `events`). Altında her hesap bir grup: sağlayıcının adı başlık (Google, Outlook), hesap satırı (ad, "e-posta · on this computer" ya da "· in this browser", Disconnect) ve takvimleri anahtarlarıyla.
- Bağlanmamış sağlayıcının düğmesi grupların altında kalır.
- **Her sağlayıcıdan bir hesap.** Todoist ücretli planda üç hesaba izin veriyor; bizde Google'dan ve Outlook'tan birer hesap. İkinci bir Google hesabı sonra.
- **Google'ın takvimleri** Google'ın sırasıyla, birincil takvim önce. Varsayılan: Google Calendar'da işaretli olanlar açık (`calendarList`'in `selected`'ı), ötekiler kapalı. Outlook'taki "kendininkiler açık, paylaşılanlar kapalı"nın Google'daki karşılığı budur: Google'da tatil ve doğum günü takvimleri de abonedir, kişi Google'da ne görüyorsa o gelir. Başka bir kişinin takviminin altında "Shared with you".
- Telefonda Calendars sayfası aynı sırayla: Show events, hesap grupları, en altta bağlanma düğmeleri; Disconnect her grubun sonunda kırmızı satır.

**Today, Upcoming ve takvim.**

- İki sağlayıcının etkinlikleri aynı kutuda, saat sırasıyla, her biri takviminin renginde. Tıklanınca kendi uygulamasında açılır; ipucu "Open in Google Calendar" ya da "Open in Outlook".
- Bir sağlayıcının girişi düşerse yalnız onun etkinlikleri gider, kutunun üstünde tek satır: "Google asks you to sign in again. Your Google events are not showing." ve Sign in…. Öbürünün etkinlikleri kalır.
- Google'da reddedilen toplantılar görünmez; Google Calendar'ın varsayılanı da böyle.

**Giriş.**

- Masaüstünde sistem tarayıcısında, Outlook'taki gibi; Google'ın masaüstü kaydıyla, `localhost` dönüşü. Yenileme anahtarı kimlik deposunda ayrı bir adla.
- Web'de ve telefonda sayfa Google'a gider ve döner; kod ve yenileme Worker'dan (`design/cloud.md` 10.6). Yenileme anahtarı `localStorage`'da, erişim anahtarı bellekte, bir saat dolmadan yenilenir; kişi hiçbir yere dokunmaz.
- Kayıt Testing'deyken Google girişi 7 günde düşürür; yayına alınınca kalkar.

**Teknik.**

- **core:** `OutlookEvent` sağlayıcıdan bağımsız `CalendarEvent` olur, `provider: 'outlook' | 'google'` alanıyla; `eventsOn`, `timedOn` ve `CalendarChoice` ortaktır. Yeni `google-calendar.ts`: `GoogleReader` takvimleri `calendarList.list` ile okur (`summaryOverride ?? summary`, `backgroundColor`, `accessRole === 'owner'`, `selected`), etkinlikleri her görünen takvim için `events.list` ile (`timeMin`, `timeMax`, `singleEvents=true`, `orderBy=startTime`, `timeZone`, `nextPageToken` ile sayfa sayfa). Tüm gün etkinliğin bitişi Google'da ertesi gündür, `lastDay` bir gün geri alınır; `attendees`'de kişinin `responseStatus`'u `declined` olan atlanır. `FakeGoogle`, `FakeGraph` gibi, geliştirirken ve testlerde.
- **Seçim dosyası:** `show` düz kalır; Outlook'un uzun kimlikleriyle Google'ın e-posta biçimli kimlikleri çakışmaz. `isShown` bir takvimin varsayılanını sağlayıcısından alır: Outlook'ta `own`, Google'da `selected`.
- **web:** yeni `google.ts`: giriş, Worker'a `POST /google/token` ve `/google/refresh`, 401'de bir kez yenileme, yenilenemezse Sign in…; masaüstünde `oauth_listen` ve `token_request` (izinli adreslere `https://oauth2.googleapis.com/token`). `OutlookEvents.tsx` iki listeyi birleştirir. Settings › Calendars ve telefon sayfası iki hesaplı düzene geçer. Dizeler `google.*`, ortak olanlar `calendars.*`.
- **masaüstü:** Google'ın masaüstü kaydının kimliği ve gizli olmayan anahtarı kodda, OneDrive'ınki gibi; anahtar için ikinci saklama adı.
- **Help:** Settings › Calendars satırı Google'ı da anlatır.

**Testler.**

- `GoogleReader`: takvim listesi (birincil, işaretli, işaretsiz, paylaşılan), tüm gün etkinliğin son günü, saatli etkinlik cihazın saatinde, reddedilen toplantı, iki sayfalık liste, 401'de yenileme, 429'da bekleme.
- Birleşik kutu: iki sağlayıcının etkinlikleri saat sırasıyla; girişi düşen sağlayıcının satırı, öbürünün etkinlikleri.
- Elle (bitti ölçütü): gerçek bir Google hesabıyla masaüstünde ve iPhone'da bağlanılıyor, Google toplantıları Today'de ve Upcoming'de Outlook'unkilerle birlikte görünüyor, telefonda bir saatten sonra da yeniden giriş istenmiyor.

**Kararlar (8 Kasım 2026'da onaylandı):**

1. **Dilimler:** Google'ın yazan parçaları Outlook'un 2. ve 3. dilimleriyle birlikte; 4. dilim yalnız bağlantı ve etkinlikler.
2. **Hesap sayısı:** her sağlayıcıdan bir hesap.
3. **Google'da varsayılan:** Google Calendar'da işaretli takvimler açık.
4. **Show events in Scrawl:** bütün hesaplar için tek anahtar, en üstte (Todoist gibi).

## 12. 2. dilim: Scrawl'dan takvime, Outlook ve Google (8 Kasım 2026'da onaylandı, mockup'ıyla)

2. bölümde Outlook için yazılanın iki sağlayıcıyla hâli; kurallar (2.2, 4.3, 10) değişmez. Mockup: `design/mockups.html` › Outlook takvimi, "S:" ile başlayan görünümler.

**Settings › Calendars.** Hesapların altında ayrı bir bölüm, Todoist'teki gibi:

- **Sync tasks to calendar** (kapalı gelir). Altında: "Your work goes to a calendar named “Scrawl” in Google Calendar, beside your meetings, and on your phone with it." Hedef Outlook'sa "in Outlook".
- **Sync to:** yalnız iki hesap bağlıyken, iki satırdan biri seçilir: Google ve Outlook, e-postalarıyla. Tek hesap varsa hedef odur, satır görünmez.
- **What goes:** açılınca altında, satır satır anahtarıyla: Tasks, Boards, kurulu her app (Gym, Appointments), Collections (yalnız böyle bir koleksiyon varsa). Tasks ve Boards açık, öbürleri kapalı (10.3).
- **Google'a ilk açılışta** Google bir kez daha izin ister, çünkü 4. dilimin girişi yalnız okumayı istedi (`calendar.app.created` yok). Anahtarın altında bir cümle: "Google asks you once more, for the Scrawl calendar." Açınca Google'ın penceresi açılır; dönünce senkron başlar. Outlook'un izni zaten yazmayı kapsar.
- **Kapatınca ya da Sync to değişince** önce sorulur: "The Scrawl calendar and its 14 events will be removed from Google Calendar." Remove ve Cancel. Sync to değiştiyse sonra yeni hesapta "Scrawl" takvimi açılır, işler oraya gider.
- Telefonda aynı bölüm: switch, Sync to'da iki satır ve seçilinin yanında ✓, What goes'ta her satırın switch'i.

**New app.** Sync tasks to calendar açıkken ve kurulan app Today'e bir şey getiriyorsa, app sayfasında bir anahtar: **Sync to connected calendar**, kapalı gelir. Adı sağlayıcıyı söylemez (8 Kasım, kullanıcı: "add to google calendar demeyelim"; "sync to calendar" da Scrawl'ın kendi takvimi sanılır); altındaki cümle söyler: "Its appointments go to the Scrawl calendar in Google Calendar, beside your tasks.", hedef Outlook'sa "in Outlook" (2.1'deki kurallar).

**Takvimde.** 2.2'deki gibi: görev ve kart tüm gün, kartta önce anahtarı ("ROA-12 Fix the login"); kayıt saatiyle; biten işin başında ✓; notunda "Scrawl · Work › Roadmap".

**Teknik.**

- **Seçim dosyası** (4.4) iki sağlayıcıyı alır: `sync` ve `goes` aynı kalır; `to` (`"outlook"` ya da `"google"`), `account` (hedef hesabın e-postası) ve `calendar` (hedefteki "Scrawl" takviminin kimliği) eklenir. Başka bir hesapla bağlı bir cihaz o hesabın etkinliklerini gösterir, yazmaz (3).
- **Google'a yazma:** `calendars.insert { summary: "Scrawl" }`; etkinlikler `events.insert`, `patch`, `delete`. Kimlik işin kimliğinden türetilir (base32hex), yeniden denemede aynı etkinlik iki kez açılmaz. Taban `extendedProperties.private.scrawl`'da, 4.3'teki `{ v, id, kind, title, start, end, allDay, done }`. Okuma Scrawl takviminin `events.list`'iyle. Google'ın toplu isteği (`batch/calendar/v3`) 50'lik paketlerle.
- **Google'ın izni:** Sync tasks to calendar Google'a açılırken giriş `calendar.app.created` eklenerek yeniden yapılır (`include_granted_scopes=true`); masaüstünde sistem tarayıcısında, web'de sayfa gidip döner. Anahtar bu izni taşımıyorsa yazma denenmez, satırda Sign in… çıkar.
- **Kurallar ortak:** `wantedEvents` ve `planCalendar` sağlayıcıyı bilmez; her sağlayıcı yalnız "oku, aç, değiştir, sil" verir.

**Kararlar (8 Kasım 2026'da onaylandı):**

1. **Yeri:** Sync bölümü hesapların altında, Todoist'teki gibi; Show events en üstte kalır.
2. **Google'ın yazma izni** senkron ilk açılırken istenir, bağlanırken değil: yalnız okumak isteyen kişiye yazma izni sorulmaz.
3. **Sync to değişince** eski hesaptaki "Scrawl" takvimi sorularak silinir, yenisinde açılır; iki hesaba birden yazılmaz (Todoist de tek hesaba yazar).
