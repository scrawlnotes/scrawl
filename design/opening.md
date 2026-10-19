# Açılış: hızlı ve kademeli (taslak)

Durum: 19 Ekim 2026. Kullanıcı dört adımı onayladı: ölçüm, Microsoft dönüşünün çizimi beklememesi, kademeli açılış (her klasörün içinde yükleniyor, space'ler birbirini beklemeden açılır), daha az okuma. Ölçüm About'ta değil, Settings'te yeni bir Logs bölümünde, standart log satırlarıyla durur; sonra başka loglar da oraya yazar. 14. ve 15. bölümün kararları onaylandı; 1. dilim 41ba81e'de, 2. dilim 1825595'te, 3. dilim 8446e8e'de (16. bölüm), 4. dilim yazıldı (17. bölüm). Ekranlar `design/mockups.html`'de, "Açılış" bölümünde.

## 1. Sorun

19 Ekim sabahı app.scrawlnotes.com açılırken sayfa önce OneDrive'a gidip döndü. Sekmelerin ve yan panelin gelmesi yaklaşık 40 saniye sürdü. Bir süre yalnız alttaki Settings kısmı göründü, sonra her şey bir anda geldi. Sunucudaki dört space de ayrı ayrı değil, en sonda hepsiyle birlikte geldi.

Koddaki nedenleri:

- **Microsoft'a gidiş dönüş çizimden önce yapılıyor.** `main.tsx`'teki `prepareSignIn`, giriş 20 saatten eskiyse sayfayı Microsoft'a gönderiyor. Dönüşte token isteği bitene kadar uygulama hiç çizilmiyor, sayfa bomboş kalıyor. Her yönlendirme süreyi sıfırladığı için bu her sabahki ilk açılışta oluyor. `design/cloud.md` 8b bunu "bir iki saniye" diye varsaymış, ama ölçen bir şey yok.
- **Her şey okunmadan hiçbir şey gösterilmiyor.** `session.start` sırasıyla şunları yapıyor:
  - bütün space'leri açıyor,
  - her notun tamamını yalnız başlığı için okuyor,
  - her task list, board ve keys dosyasını, her koleksiyonun her kaydını ve çöp kutusunu okuyor.
  `ready: true` en sonda geliyor. O ana kadar yan panelde yalnız Today, Upcoming, Inbox ve alttaki satırlar var. Status bar'da küçük bir "Opening…" yazıyor, telefon genişliğinde hiçbir işaret yok.
- **Gereksiz iş:**
  - Koleksiyon klasörü iki kez listeleniyor (`readTree` ve `loadCollection`).
  - OPFS'te listeleme her dosya için sırayla bir `getFile` bekliyor.
  - `rescan()` her pencere odağında ve değişiklik getiren her sync turundan sonra bütün space'lerin her şeyini yeniden okuyor.

## 2. Ölçümler

Canlıdaki build ayrı bir origin'de (`web-build-perf`, port 4191) sahte veriyle açıldı. Uygulama aynı origin'den bir iframe'de açılıp OPFS çağrıları sayıldı. Ölçümler bu bilgisayarda yapıldı, açılış süreleri "Opening…" yazısı kalkana kadardır.

| Veri | Açılış | `getFile` | Okunan dosya |
|---|---|---|---|
| Boş kurulum | 0,16 sn | 8 | 5 |
| 300 not + 2 koleksiyon × 1.500 kayıt, index hazır | 1,3 sn | 6.616 | 309 |
| Aynısı, index bayat (ilk açılış, ya da sync kayıtları yeni getirmiş) | 4,0 sn | 9.613 | 3.306 |
| 2.300 not + 3.000 kayıt | 2,6 sn | 10.615 | 2.308 |

Bir klasörün 1.500 dosyasını listelemek sırayla 345 ms, paralel `getFile` ile 100 ms sürüyor.

Sunucudaki space'ler küçük: Klinitra'da on kadar öğe, Planetary Nebula'da 2 not, Scrawl'da 3 dosya var. Yani 40 saniyenin büyük kısmı dosya okumaktan gelmiyor gibi. Geriye iki aday kalıyor:
- Microsoft'a gidiş dönüş ve token isteği,
- tarayıcıdaki kişisel space'in buradan görülemeyen büyüklüğü.

1. dilim bunu kullanıcının kendi cihazında gösterir.

## 3. Kullanıcı ne görür

- **Açılış ekranı:** uygulamanın kodu yüklenene kadar sayfa boş kalmaz, temanın arka planı gelir. 400 ms'yi geçerse ortada Scrawl simgesi belirir. Bilgisayarda bu süre genelde 100 ms civarında, o yüzden orada simge hiç görünmez.
- **Microsoft dönüşü:** uygulama hemen çizilir, token isteği arkada biter. Sync bekler.
- **Kabuk hemen gelir:** yan panelde Today, Upcoming ve her space'in başlığı; sekmeler son açılıştaki gibi. Ekrandaki not, dosyası okunur okunmaz açılır. Ağacın okunmasını beklemez.
- **Space başlığı:** space'in her şeyi okunana kadar başlığında küçük bir spinner döner. Space beklemeden açılıp kapanır. İçinde okunmuş olan her şey görünür, en üstü henüz okunmadıysa içinde "Loading…" satırı durur.
- **Klasör:** açılan bir klasörün içi henüz okunmadıysa içinde "Loading…" satırı durur ve o klasör okuma sırasının önüne geçer. Kapalı klasörün sayısı içi okununca görünür.
- **Sekmesi açık bir koleksiyon, board, liste ya da keys:** içi okunana kadar sekmenin içinde, başlığın altında "Loading…" görünür.
- **Today, Upcoming ve başlangıç sayfasının Today'i:** okunan listelerdeki işler görünür. Altında, okunmakta olan space'leri sayan bir satır durur: "Still opening Klinitra and Scrawl…". Karar 14.1'de.
- **Arama penceresi:** okunmakta olan space varken, sonuçların altında aynı satır görünür.
- **Status bar:** her şey okunana kadar "Opening…" yazar, sonra bugünkü gibi Saved.
- **Telefon:**
  - Browse'da okunmamış bir space'in bölümünde "Loading…" satırı durur.
  - İçi okunmamış bir klasörün sayfası "Empty folder" demez, "Loading…" der.
  - Today ve Search'te bilgisayardaki satır görünür.
- **Settings › Logs:** bu cihazın log satırları; her açılış kendi satırlarını yazar (10. bölüm).

## 4. Açılışın aşamaları

`session.start` dört parçaya ayrılır:

1. **Kabuk:**
   - `openVault` ve `openSpaces` çalışır; space'lerin adları `.scrawl/space.json`'dan gelir.
   - `loadWorkspace`, `loadFilters`, `loadSpace`, `startMe` ve onboarding notu okunur.
   - Her space'in başlık index'i okunur (11. bölüm).
   - Editör kurulur.
   - `set({ ready: true, reading: tüm space'ler, tabs, tree: [], spaces: ağaçları boş })` yapılır.
   - `ready` artık "kabuk hazır" demektir, bugünden çok daha önce gelir.
2. **Ekrandaki sekme:** dosyası doğrudan okunur, ağacı beklemez. Dosyası yoksa sekme düşer, sıradaki açılır. Liste, board ya da keys ise o dosya, koleksiyonsa o koleksiyon okuma sırasının başına konur.
3. **Okuma kuyruğu (5. bölüm):** bütün space'ler aynı kuyrukta okunur. Bir space'in her şeyi bitince:
   - `reading`'den çıkar,
   - o space'in sekmeleri kontrol edilir (bugünkü filtre, space space),
   - o space'in sync'i başlar.
4. **Hepsi bitince:** bugünkü gibi `pruneHistory`, `sweepAttachments`, `recountFiles` ve `meetSpaces` çalışır.

## 5. Okuma kuyruğu

Tek bir kuyruk vardır. En çok 8 iş aynı anda çalışır, çünkü OPFS her çağrı için tarayıcının dosya sürecine gider ve binlerce eşzamanlı çağrı birbirini bekletir. İşler önce önceliğine, sonra geldiği sıraya göre alınır:

1. Ekrandaki sekmenin dosyası ya da koleksiyonu.
2. Her space'in en üstü: kök listelenir.
3. İstenen klasörler: yan panelde açık olanlar (Sidebar'ın cihazda tuttuğu açık klasörler) ve şimdi açılan bir klasör (`session.want(path)`). Telefonda bir klasör sayfası açılınca da `want` çağrılır.
4. Task list, board ve keys dosyaları: küçüktür; Today ve sayılar bunlarla dolar.
5. Kalan klasörler, sığdan derine.
6. Koleksiyonlar.
7. Her space'in çöp kutusu.

**Klasör işi:** klasörün listesi, onu bulan üst klasörün işinde zaten alınmıştır. İş şunları yapar:
- notları ayırır ve başlıklarını index'ten alır; index'te yoksa ya da değişmişse dosyayı okur,
- içindeki her alt klasörü listeler; böylece koleksiyon mu, klasör mü olduğu bugünkü gibi `_collection.json`'dan anlaşılır,
- alt klasörler `reading: true` ile ağaca girer, listeleri bekleyen işlerine verilir,
- task list, board, keys ve koleksiyonları kuyruğa koyar.

**Ekrana yazma:** sonuçlar `set()` ile en sık 100 ms'de bir yazılır. Böylece binlerce iş binlerce kez çizim yaptırmaz. Kuyruk boşalınca son bir kez yazılır.

**Yeni kod:**
- core'da `readFolder(fs, dir, listed, titles)`: bir klasörün düğümlerini, alt klasörlerinin listelerini ve okunan notların başlıklarını döner. `readTree` bu fonksiyonla yeniden yazılır; `refreshTree` ve masaüstü aynı kodu kullanır.
- Kuyruk `apps/web/src/opening.ts`'te olur: öncelik, eşzamanlılık, `want`.

## 6. Veri modeli

- `TreeNode.reading?: true`: içi henüz okunmamış klasör; o sırada `children` boştur.
- `Snapshot.reading: ReadonlySet<string>`: her şeyi henüz okunmamış space'lerin anahtarları; kişisel space `''`.
- Liste, board, keys ve koleksiyon sekmeleri: dosya `tasks`/`boards`/`keys`/`collections` içinde yoksa ve space'i `reading`'deyse yükleniyor durumunu gösterir. Space'i okunmuş, dosyası yoksa sekme bugünkü gibi düşer.
- Ağacı dolaşan yardımcılar (`titlesOf`, `countItems`, `folderPathsOf`, `noteTexts`, Create'in ve Move to'nun klasör listeleri) değişmez. Okuma sürerken eksik görürler, okuma bitince tamamlanırlar.

## 7. Sekmeler

- `workspace.tabs` kabukla birlikte hemen gösterilir.
- Notların sekme adları başlık index'inden gelir. Diğer sekmelerin adları zaten dosya adındandır.
- Ekrandaki sekme 4. bölümün 2. adımında açılır.
- Diğer sekmeler space'leri bitince kontrol edilir. Dosyası olmayan sekme düşer, bugünkü gibi.

## 8. Sync ve yeniden okuma

- **Sync:** her space'in sync'i o space okununca başlar. Bugün hepsi okununca başlıyor. `SyncService` başlangıç için `ready`'yi değil, `reading`'den çıkan space'leri izler.
- **İlk okuma sürerken:** `rescan()` ve `refreshTree()` bitmesini bekler. Açılışta pencere odağı ek bir okuma yaptırmaz.
- **İlk okumadan sonra:** `refreshTree` aynı `readFolder`'ı kullanır. Başlık index'i ve koleksiyon index'iyle çoğu klasör yalnız listelenir, yalnız değişen notlar okunur.
- **Yeni öneri (14.5):** `afterSync` yalnız sync olan space'i yeniden okur. Bugün tek bir space'in turu bütün space'leri okutuyor.

## 9. Microsoft dönüşü ve açılış ekranı

**Dönüş:**
- Microsoft'a gidiş çizimden önce kalır, çünkü sayfa çizilmeden ayrılmalı. Bu kısım yalnız PKCE, `sessionStorage` ve `location.assign`'dır; ağ beklemez.
- Dönüşte `takeReturn()` adresi hemen temizler ve gelenleri alır; `finish()` token isteğini arkada yapar, uygulama beklemeden çizilir.
- `cloud.ts` bir `signInSettled` promise'i tutar:
  - `SignedCloud.token()` önce onu bekler. Böylece sync ya da Graph isteği eski anahtarla yarışmaz.
  - `SyncService`, `afterSignIn`'i bu promise bitince çalıştırır.
- `Pending`'e `leftAt` (`Date.now()`) ve `before` (ayrılan sayfanın `performance.now()`'ı) eklenir. Açılışın log satırları bunlarla Microsoft'ta geçen süreyi hesaplar.

**Açılış ekranı:**
- `index.html`'de `#root`'un içinde düz HTML ve CSS ile bir `.boot` öğesi durur. `createRoot` çizince yerini uygulama alır.
- `applyTheme` temanın arka plan rengini ve kenar rengini `localStorage`'da `scrawl.boot` olarak tutar, arka planı sayfanın kendisine (`html`) de verir. `index.html`'deki küçük satır içi betik bunu okuyup sayfaya ve `theme-color`'a verir. Yoksa `prefers-color-scheme`'e göre koyu ya da açık seçilir.
- Simge (`/icons/icon-192.png`, 64 px) `animation-delay: 400ms` ile belirir; az hareket isteyen cihazda geçişsiz.
- CSP yok, satır içi betik engellenmez.

## 10. Logs

**Ne:** Settings'te yeni bir bölüm: Logs. Bu cihazda olanları standart log satırlarıyla gösterir. Şimdilik yalnız açılış yazar; sonra başka parçalar (sync gibi) aynı yere kendi kaynak adlarıyla yazar.

**Satır:**

```
2026-10-19 08:12:12.112  WARN   opening  Opened in 38.2 s; longest: Microsoft 31.0 s
```

- **Zaman:** cihazın saatiyle, milisaniyesiyle.
- **Seviye:** INFO, WARN, ERROR.
- **Kaynak:** satırı yazan parça, şimdilik `opening`.
- **Mesaj:** tek satır, İngilizce. Loglar arama ve gönderme içindir, çevrilmez.
- **İçerik:** not, liste ya da kayıt adı yazılmaz; space'in adı yazılır, hangi space'in yavaş olduğu ancak onunla anlaşılır.

**Açılışın satırları:**

| Ne zaman | Seviye | Mesaj |
|---|---|---|
| Giriş 20 saatten eskiyse, sayfa ayrılmadan önce | INFO | `Sign-in is 23 h old: renewing with Microsoft` |
| Microsoft'tan dönünce | INFO | `Back from Microsoft after 31.0 s` |
| Microsoft hata döndüyse | WARN | `Renewing with Microsoft failed: <neden>` |
| Uygulamanın kodu çalışınca | INFO | `Page loaded in 0.3 s` |
| Token isteği bitince | INFO, hatada WARN | `Signed in to OneDrive in 0.8 s` |
| Kabuk çizilince | INFO | `Shell drawn at 0.4 s` |
| Ekrandaki sekme gösterilince | INFO | `First tab at 0.5 s: a note` (türü, adı değil) |
| Her space okununca | INFO | `Personal read in 6.5 s: 412 notes, 9 read from disk; 38 folders, 4 lists, 0 records` |
| Her şey okununca | INFO; 5 saniyeyi geçtiyse WARN | `Opened in 38.2 s; longest: Microsoft 31.0 s` |
| Açılış hata verirse | ERROR | `Opening failed: <hata>` |

Masaüstünde Microsoft satırları yoktur.

2. dilimden sonra token isteği açılışı beklemez: `Signed in to OneDrive` satırı çoğu zaman `Opened in`den sonra gelir ve en uzun adıma sayılmaz.

**Veri ve kod:**
- `localStorage`'da `scrawl.log`: `{ at: number; level: 'info' | 'warn' | 'error'; source: string; text: string }[]`.
- En çok 1.000 satır tutulur; yenisi gelince en eskisi düşer.
- Yalnız bu cihazdadır, sync'e girmez.
- Microsoft'a ayrılan sayfa kendi satırını ayrılmadan önce yazar.
- `apps/web/src/log.ts`: `log(level, source, text)`, `logLines()`, `subscribeLog`, `logText(lines)`. Açılışın ölçümü `opening.ts`'te durur ve satırlarını bununla yazar.

**Ekran: Settings › Logs**
- Settings'te About'tan önceki bölüm.
- Üst satırda seviye seçimi (All, Warnings, Errors), Copy ve Save…. Warnings, WARN ve ERROR satırlarını gösterir.
- Satırlar eskiden yeniye sıralıdır. Bölüm açılınca en alta kaymış gelir; yeni satır gelince alttaysa altta kalır.
- Monospace yazı. Sütunlar: zaman, seviye, kaynak, mesaj. Mesaj kendi sütununda alt satıra geçer, kesilmez.
- Seviyenin rengi: INFO soluk, WARN sarı, ERROR kırmızı.
- Copy görünen satırları düz metin olarak panoya kopyalar ve "Copied" der. Save… `scrawl-2026-10-19.log` dosyasını kaydeder: masaüstünde Save penceresi açılır, web'de indirilir.
- Altında not: "Kept on this device: the last 1,000 lines. They leave it only when you copy or save them."
- Satır yoksa: "Nothing logged yet."
- **Telefonda:** Settings listesinde Logs satırı olur. Sayfada üstte All, Warnings, Errors; satırlar gün başlıklarının altında durur. Her satırda önce saat, seviye ve kaynak, altında mesaj yer alır. Copy nav bar'dadır.

## 11. Daha az okuma

**Başlık index'i:**
- Her space'in `.scrawl/index/notes.json` dosyası:
  ```json
  { "version": 1, "notes": { "Klasör/Not.md": { "modified": 0, "size": 0, "title": "…", "empty": true } } }
  ```
- `.scrawl/index` sync'e girmez (`DEVICE_ONLY`).
- Listelemede `modified` ve `size` index'tekiyle aynıysa başlık index'ten gelir, değilse not okunur.
- Space okununca index değiştiyse yazılır; giden notlar index'ten düşer.
- Koleksiyon index'i aynı yolla çalışıyor.

**Koleksiyon tek listelenir:** `loadCollection(fs, dir, ids, readOnly, listed?)`. Klasör işinin aldığı liste verilir, ikinci `list` çağrısı yapılmaz.

**Yeni öneri (14.4):** `OpfsFs.list` önce bütün girişleri toplar, sonra `getFile`'ları `Promise.all` ile paralel çağırır. 1.500 dosyada 345 ms'den 100 ms'ye iner. Masaüstünde listeyi Rust verdiği için orada değişen bir şey yok.

## 12. Testler

**core (vitest):**
- `readFolder`:
  - düğümlerin türleri ve sırası `readTree`'yle aynı,
  - koleksiyon verilen listeden anlaşılır,
  - alt klasörler `reading` ile gelir ve listeleri döner.
- Başlık index'i (çağrıları sayan bir `MemoryFs` ile):
  - değişmemiş not okunmaz,
  - değişen not okunur,
  - index yazılır, giden not index'ten düşer,
  - bozuk index sessizce boş sayılır.
- `loadCollection` verilen listeyle ikinci kez listelemez.
- `readTree` yeni haliyle bugünkü testlerin hepsini geçer.

**web:** web'de test aracı yok. Session'ın davranışı tarayıcıda denenir:
- 4191 origin'indeki iki veri setiyle önce ve sonra ölçülür; Logs da orada görülür.
- Okuma sürerken klasör açmak, sekme değiştirmek, yazmak ve kapatıp açmak denenir.
- Dosyası silinmiş bir sekmeyle açılış denenir.

**Gerçek deneme:** kullanıcının cihazında gerçek OneDrive dönüşüyle bir sabah açılışı ve Logs'un Copy'si; panoda "deneme" kartı.

## 13. Dilimler

Onaylanan sırayla. Her dilim bitince commit sorulur.

1. **Ölçüm:** `log.ts`, açılışın satırları ve Settings › Logs. Yayınlanınca kullanıcının bir sonraki sabahı neyin beklettiğini gösterir.
2. **Microsoft dönüşü ve açılış ekranı:** `signInSettled`, `index.html`'deki `.boot`, `scrawl.boot`.
3. **Kademeli açılış:**
   - `session.start`'ın parçaları, kuyruk, `reading`,
   - yan panelde, Browse'da, sekmelerde, Today, Upcoming, Search'te ve başlangıç sayfasında yükleniyor durumları,
   - sekmelerin space space kontrolü,
   - space space sync.
4. **Daha az okuma:** başlık index'i, koleksiyonun tek listelenmesi, paralel listeleme ve space space yeniden okuma.

## 14. Verilen kararlar (19 Ekim 2026)

1. **Açılış sürerken Today, Upcoming, Search ve başlangıç sayfası** okunan işleri gösterir; altlarında "Still opening …" satırı durur.
2. **Ölçüm About'ta değil,** Settings'te ayrı bir Logs bölümündedir. Satırları standart log biçimindedir, sonra başka loglar da oraya yazar (10. bölüm). About bugünkü gibi kalır, telefonda yine görünmez.
3. **Açılış ekranı:** temanın arka planı, 400 ms'den sonra ortada Scrawl simgesi; yazı yok.
4. **Paralel listeleme** kapsama girdi (11. bölüm).
5. **Space space yeniden okuma** kapsama girdi (8. bölüm).
6. **Takip:** PLAN'da 6. aşama (Web) satırı, panoda "6 Web" fazı. Her dilim bir kart olur, gerçek açılış denemesi "deneme" kartı.

## 15. Logs kararları (19 Ekim 2026, onaylandı)

1. **WARN eşiği:** 5 saniyeyi geçen açılış WARN yazılır, böylece Warnings'e geçince yavaş açılışlar kalır.
2. **Kaç satır:** 1.000. Bir açılış 8–10 satır yazar, yani yaklaşık 100 açılış sığar.
3. **Clear yok:** satırlar kendiliğinden düşer. Silmek isteyen olursa sonra eklenir.
4. **Telefonda Save yok,** yalnız Copy. Telefonda dosya kaydetmek paylaşma penceresi demek ve Copy aynı işi görüyor.
5. **Mesajlar İngilizce ve çevrilmez;** not, liste ve kayıt adları yazılmaz, space adları yazılır.

## 16. 3. dilim yazılırken görülenler (19 Ekim 2026)

- **Kabuk:** `ready` space'ler açılınca, workspace, filtreler, profil ve space'lerin insanları okununca gelir; yan panelde her space başlığı spinner'la, içinde Loading… durur. Kişisel space'te Inbox satırı hep vardır; Inbox dosyası yoksa da okunur, bugünkü gibi boş liste olur.
- **Sekmeler:** bu cihazda olmayan bir space'in sekmesi kabukla birlikte düşer. Ekrandaki not dosyasından okunur; dosyası yoksa sekme düşer ve sıradaki açılır. Ekrandaki liste, board, keys ya da koleksiyon okuma sırasının başındadır; okunana kadar sekme yükleniyor görünümünü gösterir. Diğer sekmeler space'leri okununca kontrol edilir.
- **Okuma sürerken yapılan değişiklik:** liste yazılırken dosyadaki haliyle birleştirildiği için okunmamış bir listeye görev eklense de dosyadaki görevler kalır; sonradan gelen okuma, açılış sırasında değişmiş bir listenin, board'un, keys dosyasının ya da koleksiyonun üstüne yazmaz.
- **Yeniden okuma:** açılış sürerken istenen `refreshTree` (oluşturma, taşıma, silme, pencere odağı, sync turu) beklemez; açılış bitince bir kez yapılır. Yani açılış sürerken oluşturulan bir not, sekmesi hemen açılsa da, yan panele açılış bitince girer.
- **Log:** 1. dilimin adım adım satırları (Spaces opened, Attachments listed, ağaç, listeler, çöp kutusu) yerine her space'in kendi satırı var: `Personal read in 1.8 s: 300 notes, 300 read from disk; 10 folders, 1 task list, 0 boards, 2 collections, 3000 records`.
- **Ölçüm** (geliştirme sunucusu, 5196; kişisel space'te 300 not ve 2 × 1.500 kayıt, üç space'te 100'er not ve 500'er kayıt): kabuk 0,2–0,3 sn, ilk sekme 0,4–0,5 sn, üç space 0,9 sn'de, kişisel space 1,8–1,9 sn'de, hepsi 2,2 sn'de (koleksiyon index'i hazırken; ilk açılışta 6,0 sn). Açılış sürerken açılan klasör 0,03 sn'de Loading… gösterdi, 0,17 sn'de doldu.
- **Görülen:** bir klasörün koleksiyon mu klasör mü olduğu içi bütünüyle listelenerek anlaşılıyor. Kişisel space'in en üstü, içindeki iki 1.500 kayıtlı koleksiyonun listesini beklediği için öteki space'ler bütünüyle okunduktan sonra geldi. 4. dilimde koleksiyon, `_collection.json`'un tek bir `stat`'ıyla anlaşılır; liste koleksiyonun kendi işinde bir kez alınır (11. bölümdeki "koleksiyon tek listelenir").

## 17. 4. dilim yazılırken görülenler (19 Ekim 2026)

- **Başlık index'i:** dosyası `.scrawl/index/_titles.json`. Adı `_` ile başlıyor, çünkü `_` ile başlayan klasörler gizli sayılır; böylece hiçbir koleksiyonun index'iyle karışmaz. Açılışta her space'in index'i en üstü okunmadan önce okunur, space bütünüyle okununca yazılır. `refreshTree` de aynı index'i kullanır. Yalnız bütün bir ağaç okununca yazılır; okunurken görülmeyen not index'ten düşer.
- **Koleksiyon:** dosya katmanı tek bir dosyanın varlığını söyleyebiliyorsa (`stat`; OPFS, masaüstü ve bellek), koleksiyon `_collection.json`'un `stat`'ıyla anlaşılır. Klasör kendi işinde listelenir, koleksiyon `loadCollection`'da bir kez. Böylece bir space'in en üstü içindeki koleksiyonları beklemez.
- **Paralel listeleme:** `OpfsFs.list` girişleri toplar, her dosyanın boyutunu ve zamanını aynı anda ister.
- **Yeniden okuma:** okumalar sırayla gider. Biri başlamayı beklerken istenen öteki onun içine katılır; tek space'lik bir istek, bütününü isteyenle birleşince bütün olur. Sync turundan sonra yalnız o space'in ağacı, listeleri, koleksiyonları ve çöp kutusu okunur, açık notlarından da yalnız o space'inkiler. Öteki space'lerinkiler olduğu gibi kalır. Pencere odağı ve oluşturma, taşıma, silme hepsini okur.
- **Ölçüm** (aynı veri, geliştirme sunucusu): açılış 2,2 sn'den 1,1–1,2 sn'ye indi. Kişisel space 1,8 sn yerine 0,7 sn'de, öteki üç space 0,5–0,7 sn'de okundu, hiçbir not diskten okunmadı. Index yokken ilk açılışta her not bir kez okunur ve index yazılır.
