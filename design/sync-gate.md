# Eski sürüm eşitlemesin: açılışta yeni sürüm ve sürüm kapısı

25 Ekim 2026'da onaylandı; aynı gün kodda (ROA-285, ROA-286), commit ve yayın bekliyor.

## 1. Neden

22 Ekim'de iç içe silinen klasörlerin geri gelmesi düzeltildi (26d652c, masaüstü 0.1.12). 25 Ekim'de Chrome'da günlerdir açılmamış bir web sekmesi açıldı. Service worker o sekmeye düzeltmeden önceki derlemeyi verdi. Yeni sürüm arkada inerken eski kod eşitlemeye başladı ve 12:56'da üç klasörü boş olarak geri getirdi: sunucudaki Scrawl space'inde `MCP Test`, OneDrive'daki kişisel space'te `Projects` ve çöpte `2026-10-19 224024 Demo`. Hepsi eski hatanın izini taşıyor: silinmeden önceki hâllerinden bir kat eksikler.

Kök neden şu: web yeni sürümü kullanıcı Reload'a basana kadar bekletiyor, eski sürüm de bu arada eşitlemeye devam ediyor. Bir sync düzeltmesi yayınlanınca, güncellenmemiş her kopya hatayı yeniden yapabiliyor. İki parça var:

- **Açılışta yeni sürüm (web):** açılan sayfa, yeni bir sürüm varsa eşitlemeye başlamadan önce ona geçer.
- **Sürüm kapısı (her yerde):** bir space'i yeni kuralla eşitleyen bir cihaz olduysa, o kuralı bilmeyen eski bir sürüm o space'i eşitlemez ve "güncelle" der.

## 2. Açılışta yeni sürüm (web)

Bugün: `apps/web/sw/sw.js` yeni derlemeyi indirip bekletir; `pwa.ts` durum çubuğunda "New version ready · Reload" gösterir. Sayfa açıldığında service worker eski sürümün dosyalarını verir, `start.tsx` uygulamayı çizer ve `SyncService.start()` cihaz kimliği gelir gelmez eşitlemeye başlar.

Yeni akış:

1. **Bekleyen sürüm zaten cihazdaysa** (daha önceki bir açılışta inmiş): uygulama çizilmeden önce ona geçilir. `startWebApp()` bir promise döner. `registration.waiting` varsa ve sayfayı eski bir sürüm yönetiyorsa `waiting.postMessage('update')` gönderilir, `controllerchange` gelince sayfa yenilenir. Dosyalar zaten cihazda olduğu için bunun maliyeti yalnız bir yenileme. `start.tsx`, `createRoot(...).render` öncesinde bu promise'i bekler; boot ekranı bu sırada durur.
2. **Bekleyen yoksa** uygulama hemen çizilir; açılış yavaşlamaz. Arkada `registration.update()` çağrılır. İlk eşitleme turu bu kontrolün bitmesini bekler (`updateSettled()`):
   - Yeni sürüm yoksa, kontrol başarısız olursa ya da cihaz çevrimdışıysa eşitleme hemen başlar.
   - Yeni sürüm iniyorsa eşitleme onun bitmesini bekler, en fazla 60 saniye.
     - Kullanıcı açıldığından beri hiçbir şey yazmadıysa ya da tıklamadıysa `session.beforeSync()` ile kaydedilmemiş ne varsa yazılır ve sayfa yeni sürüme geçer.
     - Kullanıcı bir şey yaptıysa sayfa kendiliğinden yenilenmez. Bugünkü "New version ready · Reload" gösterilir, eşitleme bu sürümle sürer. Bu sürüm space için fazla eskiyse sürüm kapısı onu durdurur (3. bölüm).
   - 60 saniye dolarsa eşitleme başlar; korumayı kapı üstlenir.
3. Günlerce açık kalan sekme bugünkü gibi kalır: ekrana dönünce yeni sürümü arar ve Reload'u gösterir. Tehlikeli durumu kapı keser.

Etkilenen dosyalar: `apps/web/src/pwa.ts` (`startWebApp` promise döner, `updateSettled()`, ilk girdiyi dinleme), `apps/web/src/start.tsx` (çizmeden önce bekleme), `apps/web/src/sync.ts` (`start()` içinde `loadDevice()` ile birlikte `updateSettled()` beklenir). Masaüstünde ve geliştirme sunucusunda `updateSettled()` hemen çözülür. Masaüstünün kendi güncelleyicisi ayrıdır; masaüstünü kapı korur.

## 3. Sürüm kapısı

### 3.1 Eşitleme seviyesi

`packages/core/src/sync/level.ts` içinde `SYNC_LEVEL` adında bir tamsayı tutulur. Sürüm numarasından bağımsızdır ve yalnızca eski sürümlerin bozacağı bir sync değişikliği çıktığında artırılır. Bu işle `SYNC_LEVEL = 1` olur: içinde 26d652c düzeltmesi ve kapının kendisi var. Kapıyı bilmeyen bugünkü sürümler 0 sayılır.

### 3.2 Uzaktaki kayıt: `.scrawl/sync.json`

Her sağlayıcıda (sunucu, OneDrive, sonra gelecekler) space'in içinde eşitlenen küçük bir dosya: `{"version": 1, "level": 1}`. Space'i eşitlemiş cihazların en yüksek seviyesini söyler.

- **Tur başında:** motor listeyi okuduktan sonra, başka bir şey yapmadan önce bakar; bu `stopIfMoved` ile aynı yerdir. Dosya listede değişmiş olarak geldiyse uzaktan okunur, gelmediyse yereldeki kopyası okunur (son eşitlenen hâli). Uzaktaki seviye `SYNC_LEVEL`'dan büyükse tur hiçbir şey yapmadan `RemoteNeedsNewer(level)` hatası atar. Bunun tek istisnası listeden önce çalışan `awayOps`'tur: buluttan inmemiş büyük eklerde kullanıcının istediği taşıma ve silme işleri. Bunlar klasörlere dokunmaz.
- **Tur sonunda:** dosya yoksa ya da seviyesi küçükse yerelde `SYNC_LEVEL` ile yazılır, bir sonraki turda normal bir dosya gibi yüklenir. Seviye hiçbir zaman düşürülmez.
- **Birleştirme:** iki cihaz dosyayı aynı anda farklı seviyelerle yazarsa büyük olan kazanır. `merge-files.ts`'e `syncLevel` türü eklenir; çakışma kopyası oluşmaz.
- **Ne zaman korur:** kapıyı bilen sürümler arasında. Seviye bir gün 2'ye çıkınca, seviyesi 1 olan her kopya OneDrive'da da sunucuda da durur. Bugünkü eski derlemeler bu dosyayı okumaz; onları OneDrive'da hiçbir şey durduramaz, sunucuda 3.3 durdurur.

### 3.3 Sunucuda başlık kontrolü

Sunucu, kapıyı bilmeyen bugünkü eski derlemeleri de hemen durdurabilir:

- `ServerRemote` (`packages/core/src/sync/server.ts`) her isteğe `Scrawl-Sync: <SYNC_LEVEL>` başlığını ekler.
- Sunucu (`apps/server/src/app.ts`), eşitleme uçlarından önce bir ara katman çalıştırır: `GET /spaces/:id/changes`, `PUT` ve `DELETE /spaces/:id/files/*`, `POST /spaces/:id/move`, `POST /spaces/:id/dirs`. Başlık yoksa ya da değeri `MIN_SYNC_LEVEL`'dan küçükse 426 döner: `{"error": {"code": "update-app", "message": "This version of Scrawl is too old to sync. Reload the page, or update the app."}}`. `GET /files/*` açık kalır; okumak bir şey bozmaz, sohbetteki ekler de onu kullanır.
- `MIN_SYNC_LEVEL`, `apps/server/src/config.ts` içinde ayrı bir sabittir. İlk yayında 0'dır, yani kontrol bir şey reddetmez; istemciler başlığı göndermeye başlayınca 1 olur. Seviyesi düşük bir sürüm kendi turunda ilk istek olan `changes`'ta durur, yani hiçbir şey yazmaz. Eski derlemeler sunucunun mesajını sync panelinde hata olarak gösterir.
- CORS: `allowHeaders` listesine `Scrawl-Sync` eklenir. Bu, istemcilerden önce yayında olmalı. Tarayıcı, `Authorization` taşıyan her istekte zaten ön istek (preflight) yapıyor. Sunucu yeni başlığa izin vermezse, onu gönderen web ve masaüstü sunucuya hiç bağlanamaz. Yayın sırası bu yüzden üç adımlı (4. bölüm).
- İstemci: `ServerRemote.fail`, `update-app` kodunu `RemoteNeedsNewer` hatasına çevirir.
- Ajanlar (`/mcp`) ve `apps/mcp` bu uçları kullanmaz; etkilenmezler.
- `MIN_SYNC_LEVEL` yalnızca o seviyedeki web ve masaüstü yayındayken artırılır. Önce artırılırsa herkes eşitlemeden kalır.

### 3.4 Uygulamada görünüşü

- `apps/web/src/sync.ts`'e yeni bir aşama eklenir: `SyncPhase` içinde `'update'`. `RemoteNeedsNewer` gelince space bu aşamaya geçer, tıpkı `'moved'` gibi. Bu space için yeni tur başlamaz; güncellenince kendiliğinden sürer.
- Durum çubuğunda, sync panelinde ve telefonun sync ekranında aynı metin çıkar: "Update Scrawl to keep syncing". Altında da şu açıklama: "A newer Scrawl synced this space. This version stops here so it does not undo what the newer one did." Sunucu geri çevirdiyse (seviyesini söylemez) açıklama şudur: "The server asks for a newer Scrawl to sync. This version stops here until it is updated." (`why: 'server'`).
- Düğme web'de **Reload** olur, masaüstünde **Update**. Basınca yeni sürüm aranır ve inmesi beklenir (düğmede "Updating…"); inince web sayfası ona geçer, masaüstü yeniden başlar. Yeni sürüm bulunamazsa düğme eski hâline döner ve üstüne gelince "No newer version was found yet. Try again in a while." der.
- Metinler `packages/i18n/src/en.ts` içine yazılır.

## 4. Yayın sırası

Başlık CORS'a takıldığı için yayın üç adımlıdır (25 Ekim, kullanıcının seçimi; sorgu parametresi seçeneği bırakıldı):

1. **Sunucu 0.2.23:** CORS `Scrawl-Sync` başlığına izin verir. Kapının kodu yayındadır ama `MIN_SYNC_LEVEL = 0` olduğu için hiçbir isteği reddetmez. Bugünkü istemciler bu adımdan etkilenmez.
2. **Web ve masaüstü 0.1.16 birlikte:** açılışta yeni sürüm, `.scrawl/sync.json`, `Scrawl-Sync` başlığı ve `'update'` aşaması. Kullanıcının bütün kopyaları 0.1.16'ya geçer. Masaüstü kendini günceller. Web kopyaları (Chrome, Zen, iPhone) yeni kodu bir kez Reload ile alır; sonrasını 2. bölüm halleder.
3. **Sunucu 0.2.24:** `MIN_SYNC_LEVEL = 1`. Bundan sonra güncellenmemiş bir kopya sunucudaki space'leri bozamaz. OneDrive'daki kişisel space'i ise hâlâ bozabilir; onun için 2. adımdaki elle Reload şart.
4. Temizlik kullanıcıda: üç klasör bir kez silinir.

## 5. Testler

- `engine.test.ts`:
  - İlk tur `.scrawl/sync.json`'ı seviye 1 ile yükler.
  - Uzakta seviye 2 varsa tur hiçbir şey yüklemeden ve indirmeden `RemoteNeedsNewer` atar; yerelde de hiçbir şey değişmez.
  - İki cihaz farklı seviye yazarsa büyük olan kalır ve çakışma kopyası oluşmaz.
  - Seviye hiç düşmez.
- `merge.test.ts`: `syncLevel` iki yönde de aynı sonucu verir.
- `server.test.ts` (core): istekler `Scrawl-Sync` başlığını taşır; 426 `update-app` cevabı `RemoteNeedsNewer` olur.
- `apps/server/src/server.test.ts`:
  - Başlıksız ya da düşük seviyeli `changes`, `PUT`, `DELETE`, `move` ve `dirs` istekleri 426 alır.
  - Yeterli seviyeyle hepsi çalışır; `GET /files` başlıksız da çalışır.
  - CORS ön isteği `Scrawl-Sync` başlığına izin verir.
- Açılıştaki karar `apps/web/src/newVersion.ts` içinde, tarayıcısız sınanır (`newVersion.test.ts`). Web'e bunun için öbür paketlerdeki gibi vitest ve `test` betiği eklendi. Sahte registration ile:
  - Açılışta bekleyen sürüm varsa yenilenir.
  - Süre içinde inen sürüm, kullanıcı bir şey yapmadıysa yenilenir.
  - Kullanıcı bir şey yaptıysa Reload istemi çıkar ve eşitleme başlar.
  - Kontrol başarısızsa eşitleme başlar.
  - İnen sürüm bozulursa ve ilk açılışta (sayfayı eski bir sürüm yönetmiyorken) eşitleme başlar.
  - 60 saniyelik üst sınır `pwa.ts`'te (`within`), birim testinde değil.
- Elle (tarayıcıda, `vite preview` ile iki ayrı derleme): eski derleme açıkken yeni derleme yayınlanır, sekme kapatılıp açılır. Yeni sürüme eşitlemeden önce geçildiği konsol günlüğünden görülür. Her derlemeden sonra service worker ve önbellekler silinir. 25 Ekim'de denendi: v1 açıkken v2 derlendi; sekme açılınca v1 çalıştı, v2'yi buldu ve kimse bir şeye dokunmadan ona geçti. Açık sekmede v3 inince sekme yenilenmedi, "New version ready" çıktı; sekme yeniden açılınca çizilmeden v3'e geçti. Konsolda hata yok. Seviye 99 isteyen yerel sunucuyla space eşitlemesi "Update Scrawl to keep syncing" aşamasında durdu: ayarlarda, durum çubuğunda ve sync panelinde sunucunun açıklaması ve Reload göründü.
- Gerçek deneme kullanıcıda: Roadmap'te deneme kartı.

## 6. Bu işte olmayanlar

- Bugünkü eski derlemeler OneDrive'da durdurulamaz; kapıyı bilmiyorlar. Her web kopyası bir kez elle güncellenmeli.
- Günlerce açık sekmenin kendiliğinden yenilenmesi yok; kapı yeter.
- Masaüstünde "açılışta yeni sürüm" yok. Masaüstü güncellemesini kendi indirip kuruyor (design/desktop-release.md, design/background.md); aradaki saatlerde kapı korur.
