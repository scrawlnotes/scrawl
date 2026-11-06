# Telefonda sync şeridi

4 Kasım 2026: mockup ve bu belge onaylandı (`design/mockups.html`, "Telefonda sync şeridi"; PLAN 4.9).

## 1. Neden

3 Kasım'da telefonda Gym'in 3-Day Full Body programına Start denip antrenman yazıldı. Telefon 2 Kasım akşamki değişiklikleri almamıştı: programın günleri bilgisayarda Mon, Wed, Fri'dan Tue, Wed, Fri'ya geçmişti, 27 ve 30 Ekim de Didn't go ile kapanmıştı. Telefonda program hâlâ eski günlerindeydi. Bu yüzden Today 3 Kasım yerine Overdue'da **Mon, Nov 2**'yi gösterdi, Start da o günü yazdı. Antrenman ve 13 hareketi bilgisayara 4 Kasım 19:54'te, 30 Ekim için ikinci bir Didn't go ile birlikte geldi. 3 Kasım açık kaldı ve Today'de Overdue olarak yeniden çıktı.

Kod doğru çalıştı. Eksik olan, telefonun bunu söylememesiydi. Telefonda sync bugün yalnız Browse'un altındaki Sync satırında, tek kelimeyle görünüyor. Today'de ve öbür sekmelerde hiçbir şey yok. Telefonun eski veriyle çalıştığı da, yazılanın gitmediği de anlaşılmıyor.

## 2. Ne görünür

Yalnız telefonda. Bilgisayarda durum çubuğu bunu zaten söylüyor, o yüzden masaüstü ve bilgisayardaki web bugünkü gibi kalır.

- **Yeri:** tab bar'ın hemen üstünde, iki satırlık yuvarlak bir şerit. Tab bar görünen her sayfada çıkar (Recent, Browse, Today ve onlardan açılan sayfalar). Sync sayfasının kendisinde çıkmaz.
- **Ne zaman:** yalnız bir sorun varken. Her şey yolundayken hiçbir şey görünmez.
  - **Sync edemiyor:** uyarı simgesi, üstte Browse'daki Sync satırının bugünkü sözü (Offline, Signed out, Folder gone, Moved, Update, Failed). Altında son sync'in zamanı: "Last synced 21:40", "Last synced yesterday, 21:40" ya da "Last synced Sun, Nov 2, 21:40".
  - **Bu telefonda gitmemiş değişiklik varsa:** alt satır "14 changes not sent yet · synced Nov 2, 21:40" olur, sayı turuncu renktedir.
  - **Uzun aradan sonra ilk tur:** bağlıyken şerit yalnız son başarılı sync 1 saatten eskiyse çıkar. Üstte "Syncing 38%", altta son sync'in zamanı, şeridin altında ince bir ilerleme çizgisi vardır. Tur bitince şerit kalkar. 30 saniyede bir dönen olağan turlarda çıkmaz.
  - **3 saniye kuralı:** şerit, nedeni 3 saniye sürünce çıkar. Kısa bir tur ya da telefon uyanırken bir an offline görünmesi ekranı oynatmaz (6 Kasım).
- **Birden çok space:** tek şerit. Sync edemeyen bir space varsa söz onunkidir, sayı bütün space'lerdeki gitmemiş değişikliklerin toplamıdır, zaman da en eski son sync'tir. Sync edemeyen yoksa uzun aradan sonra turu süren space'in yüzdesi gösterilir.
- **Dokununca:** bugünkü Sync sayfası açılır (birden çok space varken liste). Satırlardaki söz de aynı bilgiyi verir: "Offline · 14 changes not sent yet".
- **Değişiklik:** bu cihazda son sync'ten beri eklenen, değişen ya da silinen her dosya bir değişikliktir. Örnekteki 14, antrenman kaydı ile 13 hareketinin dosyalarıdır.

## 3. Teknik

### 3.1 Son sync zamanı kalıcı olur

Bugün `SpaceSync.syncedAt` yalnız bellekte duruyor (`apps/web/src/sync.ts`, `FRESH`). Sayfa yeniden açılınca `null` oluyor. iPhone'da PWA sık sık yeniden yüklendiği için çevrimdışı açılışta "son sync" bilinmiyordu.

- Başarılı her turun sonunda zaman `localStorage`'a yazılır. Anahtar `scrawl.syncedAt.<space>`, kişisel space için `PERSONAL` ve `vaultKey()` kullanılır. Hesap ya da klasör değişince bağlantıyla birlikte silinir.
- `unit()` yeni birimi bu değerle kurar. Böylece açılışta da son sync bilinir.

### 3.2 Gitmemiş değişiklikler

- **Core:** `packages/core/src/sync/engine.ts` içine `changedHere(fs, deviceId): Promise<number>`. Sync durumunu (`loadSyncState`) yükler, klasörü turdaki `walk` ile dolaşır, `trashedHere` dosyalarını çıkarır. Her dosyayı turun `localStatus` kuralıyla karşılaştırır: yol, boyut ve değişme zamanı tutuyorsa hash'e bakılmaz, tutmuyorsa hash'e bakılır. `new`, `changed` ve `deleted` sayılır. Turun `localStatus`'u bu ortak karşılaştırmayı kullanacak şekilde ayrılır, böylece iki kural ayrışmaz. Uzakla konuşmaz, internetsiz çalışır.
- **Web:** `SpaceSync`'e `waiting: number` eklenir (varsayılan 0). Şu anlarda hesaplanır:
  - bir tur hata ile bittiğinde (offline, signedOut, failed vb.);
  - birim bu hallerden birindeyken her kayıttan sonra, bugünkü `soon()` beklemesiyle birlikte.

  Başarılı tur sayıyı 0 yapar. Aynı space'te tur sürerken hesaplanmaz, çünkü ikisi de sync durumunu okur. Çakışmayı bugünkü `alone()` önler.

### 3.3 Şerit

- **`apps/web/src/SyncViews.tsx`:** `stripOf(sync: SyncSnapshot, now: number): { word, sub, waiting, pct } | null`. Kuralı 2. bölümdeki gibidir: önce sync edemeyen birim (`shortOf(unit).bad`), yoksa 1 saatten eski `syncedAt` ile tur süren birim, o da yoksa `null`. Zaman metni bugün, dün ve daha eski için ayrı biçimdedir.
- **`apps/web/src/Phone.tsx`:** `PhoneSyncStrip`, tab bar ile birlikte çizilir. Dokununca `push({ kind: 'sync' })`. Sync sayfasında çizilmez. `PhoneSyncList` ve `PhoneSyncPage` satırlarında söze "· N changes not sent yet" eklenir.
- **`apps/web/src/styles.css`:** `.mb-sstrip`, mockup'taki ölçülerle: tab bar'ın 86 px üstü, kenarlardan 12 px, yarıçap 12 px, uyarı simgesi turuncu (`--p2`), ilerleme çizgisi 3 px.
- **`packages/i18n/src/en.ts`:** `sync.lastSynced`, `sync.lastSyncedYesterday`, `sync.lastSyncedOn`, `sync.notSent` (tekil ve çoğul), `sync.syncedOn`.

### 3.4 Güvenlik ve veri

Yeni bir veri yazılmaz, yalnız cihazdaki `localStorage`'a bir zaman yazılır. Sync durumu yalnız okunur. Sunucu ve masaüstü değişmez.

### 3.5 Testler

- **Core (`engine.test.ts`):** turdan sonra `changedHere` 0 verir. Yeni, değişen ve silinen dosyanın her biri 1 sayılır. Zamanı değişip içeriği aynı kalan dosya 0 sayılır. Çöpe yalnız bu cihazda giren dosya sayılmaz.
- **Web (`syncStrip.test.ts`):** her şey yolunda ise `null`. Offline ve değişiklik varsa söz, sayı ve zaman gelir. Tur sürüyorsa ve son sync 1 saatten eskiyse yüzde gelir, 1 saatten yeniyse `null`. Birden çok space varken toplam sayı ve en eski zaman kullanılır.
- **Elle (iPhone, Roadmap'te "deneme" kartı):** uçak modunda Today'de şeridin çıkması, bir görev yazınca sayının artması, uçak modu kapanınca şeridin yüzdeyle sürüp kalkması, uygulamayı kapatıp çevrimdışı açınca son sync zamanının görünmesi.

## 4. Dilim

Tek dilim: 3.1, 3.2 ve 3.3 ile testler. Kurulum gerekmez. Yayın web ile olur.
