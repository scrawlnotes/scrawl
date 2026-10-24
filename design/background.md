# Masaüstünde arka planda çalışma ve dosya izleme (taslak)

Durum: 24 Ekim 2026, onaylı. Kullanıcı üç seçenekten birincisini seçti: pencere kapanınca uygulama arka planda çalışmayı sürdürür, klasörler izlenir. Tasarım ve 10. bölümdeki kararlar olduğu gibi onaylandı.

## 1. Sorun

Bilgisayardaki ajan (`scrawl-mcp`) dosyalara doğrudan ulaşır ve uygulama kapalıyken de çalışır (`design/agent.md` 6). Ama sync uygulamanın içinde ve yalnız uygulama açıkken döner. Uygulama çoğu zaman kapalı. O sırada:

- Ajan bu bilgisayardaki eski kopyayı okur. Telefonda ya da web'de eklenen görünmez.
- Ajanın yazdığı bilgisayarda kalır. Telefon, web ve space'teki diğer kişiler onu ancak uygulama açılınca görür.

Koddaki nedenleri:

- Pencere kapanınca süreç biter (`lib.rs`, `run`).
- Uygulama açık ama pencere küçültülmüşse de sync'in 30 saniyelik turu durur: tur, sayfa görünür değilse hiçbir şey yapmadan döner (`apps/web/src/sync.ts`, `EVERY_MS` aralığı).
- Başka bir programın yazdığı ancak pencere öne gelince okunur (`App.tsx`, `focus` ile `session.rescan`). Sync turu klasörü her turda baştan taradığı için ajanın yazdığını bulur, ama turu tetikleyen bir şey yok.

Yalnız masaüstü uygulaması değişir (Windows ve macOS). Web, telefon, sunucu ve `scrawl-mcp` aynı kalır.

## 2. Kullanıcı ne görür

### 2.1 Pencereyi kapatınca

- Windows'ta ×, Alt+F4; macOS'ta kırmızı düğme, Cmd+W: pencere gizlenir, uygulama çalışmayı sürdürür. Görev çubuğunda düğmesi kalmaz, tepside simgesi durur.
- Küçültülen pencere eskisi gibi görev çubuğunda kalır. Sync artık küçültülmüşken de döner.
- İlk kez kapatıldığında bir kez sistem bildirimi çıkar:
  - Başlık: "Scrawl is still running"
  - Metin: "Your notes keep syncing. Quit from the Scrawl icon in the tray." (macOS'ta "in the menu bar")
- Arka planda çalışma kapalıysa (2.4) pencereyi kapatmak bugünkü gibi uygulamadan çıkar.

### 2.2 Tepsideki simge

Windows'ta bildirim alanında, macOS'ta menü çubuğunda durur.

- Windows'ta sol tık pencereyi açar, sağ tık menüyü açar. macOS'ta tık menüyü açar.
- Menü sistemin kendi menüsüdür:
  - **Open Scrawl**
  - Sync durumu, tıklanamaz bir satır olarak. Status bar'daki sync yazısının aynısıdır, yalnız "2 min ago" gibi değişen süre yerine saat yazar: "Synced at 14:32", "Syncing…", "Offline", "Sign in to OneDrive". Sync bir sorun yüzünden durduysa bunu buradan görmek mümkün olur.
  - Çizgi
  - **Quit Scrawl**
- Fareyle üstüne gelince "Scrawl · Synced at 14:32" yazar.
- Simge, uygulama simgesinin sade bir hali olur: Windows'ta renkli 16 ve 32 px, macOS'ta tek renkli "template" (menü çubuğunun rengini alır). Çizimi 1. dilimde onaya gelir.
- macOS'ta pencere kapalıyken Dock'ta simge olmaz, uygulama yalnız menü çubuğunda durur. Pencere açılınca Dock'taki simge de gelir. Cmd+Q bugünkü gibi uygulamadan çıkar.

### 2.3 Bilgisayar açılınca başlama

- Kullanıcı bilgisayarına girince Scrawl penceresiz başlar ve yalnız tepside görünür. Sync hemen döner.
- Scrawl zaten çalışırken Başlat menüsünden ya da Dock'tan bir daha açılırsa ikinci bir kopya başlamaz, çalışan pencere öne gelir. Bugün iki kopya aynı anda açılabiliyor, ikisi de aynı klasörü sync ediyor; bu da kapanmış olur.

### 2.4 Settings › General

Settings'te yeni bir **General** bölümü olur. Yalnız masaüstünde görünür, Appearance'ın altında durur. İçinde Settings'teki satır düzeninde iki onay kutusu var, her birinin altında soluk bir cümle:

- **Keep running when the window is closed**
  "Your notes keep syncing, so agents on this computer work on what's current."
- **Open at login**
  "Scrawl starts in the background when you sign in to this computer."

İkincisinin durumu sistemden okunur (Windows'ta kayıt defterindeki başlangıç satırı, macOS'ta LaunchAgent). Biri kapatılırsa diğeri değişmez.

### 2.5 Settings › Agents

"This computer" bloğunda, arka planda çalışma kapalıysa notun altında bir satır daha olur:

"When Scrawl is closed, what an agent writes here waits on this computer until Scrawl opens again." Yanında **Keep running** düğmesi, 2.4'teki ayarı açar.

Ayar açıksa blok bugünkü gibi kalır.

### 2.6 Güncellemeler

Bugün indirilen güncelleme Restart'a basılınca ya da uygulama kapanınca kurulur. Arka planda çalışan uygulama haftalarca kapanmayabilir, bu yüzden:

- Güncelleme hazır olduğunda pencere kapalıysa kendiliğinden kurulur. Uygulama yeni sürümle yine penceresiz açılır. Kullanıcı bir şey görmez.
- Pencere açıksa bugünkü gibi status bar'da Restart çıkar. Basılmazsa pencere kapatılınca kurulur.
- Quit ile çıkarken hazır güncelleme bugünkü gibi kurulur.
- Windows kapanırken ya da kullanıcı oturumu kapatırken kurulmaz. Bu sırada kurulum yarıda kesilebilir. Güncelleme bir sonraki açılışta yeniden indirilir ve pencere kapalıyken kurulur. (Bugün kapanışta kurulum her durumda yapılıyor; arka planda çalışan uygulama da çoğunlukla Windows kapanırken çıkacağı için bu risk büyürdü.)

## 3. Arka planda sync

- Sync turu masaüstünde pencere gizli ya da küçültülmüşken de döner. `sync.ts`'teki görünürlük koşulu yalnız web'de ve telefonda kalır. Orada sayfa gizliyken tur boşa çalışmasın diye kondu, masaüstünde bu gerekçe artık yok.
- Pencere gizlenince bugün de bir tur başlıyor (`visibilitychange`). Bu tur yazılan son şeyi de götürür, olduğu gibi kalır.
- Sunucudaki space'lerin canlı kanalı (`ServerLive`) gizliyken de açık kalır. Sunucuda değişen şey saniyeler içinde iner.
- Windows'ta WebView2 gizli sayfanın zamanlayıcılarını seyreltebilir. Chromium, beş dakikadan uzun gizli kalan sayfada tekrarlanan zamanlayıcıları dakikada bire indirebilir. Bu durumda OneDrive'daki space'in turu 30 saniye yerine dakikada bir döner, ajan için bu yeterli. Ölçülür (8.2). Yetmezse tur Rust'taki bir zamanlayıcıdan olayla tetiklenir.
- macOS'ta App Nap görünmeyen uygulamanın zamanlayıcılarını seyreltir. Mac mini'de ölçülür. Tur birkaç dakikadan seyrek kalırsa, arka plandayken `NSProcessInfo.beginActivity` ile App Nap'ten çıkılır.
- Bellek: gizli pencerenin WebView'i açık kalır. Bir saat gizli kaldıktan sonra Windows'ta ve macOS'ta ölçülür, sonuç bu belgeye yazılır.

## 4. Dosya izleme

- Rust tarafı, her space'in bu bilgisayardaki klasörünü (kişisel vault ve `spaces[].folder`) alt klasörleriyle izler: `notify` crate'i ve onun `notify-debouncer-full`'u, bir saniye bekleyerek. Windows'ta `ReadDirectoryChangesW`, macOS'ta FSEvents kullanılır.
- Değişen yollar web tarafına bir olayla gider: `folder-changed`, `{ folder, paths }`.
- Web tarafı yolları ayıklar:
  - `isSynced` olmayanlar atılır: `.scrawl/sync-state.json`, `sync-base`, history, `.tmp` ve `.part` gibi cihazda kalan dosyalar.
  - Uygulamanın son üç saniyede kendi yazdıkları da atılır. `TauriFs` yazdığı yolları zamanıyla birlikte kısa bir süre tutar. Uygulamanın kendi kaydı ve sync'in indirdiği dosyalar da olay doğurur; bunlar atılmazsa her kayıttan ve her inişten sonra boş bir tur ve boş bir yeniden okuma olur.
- Kalan bir değişiklik o space için "kaydedildi" gibi sayılır, yani bugünkü kayıttan sonraki tur bekleyişi kullanılır: OneDrive'daki space'te 5 saniye, sunucudakinde 1 saniye. Yeni bir bekleme süresi gelmez.
- Pencere görünürse `session.rescan(space)` da çalışır. Ajanın yazdığı açık pencerede hemen görünür; pencereye tıklamayı beklemez. Kaydedilmemiş yazısı olan not bugünkü gibi korunur. PLAN 4.8'in "Sonra" listesindeki "dosya izleme" de bununla kapanır.
- İzleme arka planda çalışma ayarından bağımsızdır, uygulama açıkken her zaman çalışır.
- Space eklenince, çıkarılınca ya da klasörü taşınınca izlenen klasörler yenilenir. Web tarafı `watch_folders` komutuyla güncel listeyi verir, Rust eski izlemeleri kapatır.

## 5. Başlangıç, kapanış ve tek kopya

- **Tek kopya:** `tauri-plugin-single-instance`. İkinci başlatma çalışan kopyaya iletilir. Çalışan kopya pencereyi gösterir, küçültülmüşse büyütür ve öne getirir. İkinci başlatma `--background` ile gelmişse hiçbir şey yapmaz.
- **Penceresiz başlama:** `--background` argümanıyla ya da 6. bölümdeki işaretle. Pencere `visible(false)` ile kurulur, sayfa ve sync normal açılır, `window_ready` pencereyi göstermez. macOS'ta bugünkü "çizilene kadar gizli, en çok üç saniye" beklemesi bu durumda atlanır.
- **Bilgisayar açılınca başlama:** `tauri-plugin-autostart`, argüman `--background`. Windows'ta `HKCU\…\Run` altına yazar. macOS'ta `MacosLauncher::LaunchAgent` kullanılır. Kaldırılınca Windows'taki başlangıç satırı da silinir: NSIS'in kaldırma kancası (`NSIS_HOOK_POSTUNINSTALL`) bu satırı siler.
- **Pencereyi kapatma:** `WindowEvent::CloseRequested` olayında arka planda çalışma açıksa `prevent_close` ve `hide` yapılır. macOS'ta bunun yanında `ActivationPolicy::Accessory` ayarlanır; pencere açılınca `Regular`'a döner.
- **Quit:** Rust web tarafına `quit` olayını gönderir. Web tarafı bekleyen kaydı yazar (`session.flush`) ve `quit_now` der, ardından Rust `app.exit(0)` ile çıkar. Web tarafı üç saniyede cevap vermezse Rust yine çıkar.

## 6. Güncelleme

- `update.rs`'te indirme bittiğinde pencere görünmüyorsa güncelleme kurulur. Pencere görünüyorsa beklenir; pencere gizlendiğinde kurulur.
- Kurmadan önce `shell.json`'a `startHidden: true` yazılır. Yeniden açılan uygulama bunu okur, penceresiz başlar ve işareti siler. Windows'ta yükleyici uygulamayı kendisi yeniden açar, macOS'ta `app.restart()` açar; ikisinde de işaret aynı işi görür.
- Windows'ta penceresiz kurulum NSIS'in sessiz biçimiyle yapılır (`installMode: "quiet"`), bugünkü `passive` bir ilerleme penceresi gösterir. Eklentinin bu biçimi kurulum başına seçtirip seçtirmediği 4. dilimde denenir. Seçtirmiyorsa iki kurulum da sessiz olur; o durumda Restart'a basılınca ilerleme penceresi görünmez, pencere kapanıp birkaç saniye sonra yeni sürümle açılır.
- `on_exit` yalnız Quit ve Restart'ta kurar. Rust, Quit'in ve Restart'ın kendisinden geldiğini bir bayrakla bilir. Sistem kapanırken gelen çıkışta bayrak yoktur, kurulum yapılmaz.

## 7. Kodda

**Rust (`apps/desktop/src-tauri`)**

- Yeni crate'ler: `tauri` için `tray-icon` özelliği, `tauri-plugin-single-instance`, `tauri-plugin-autostart`, `tauri-plugin-notification`, `notify`, `notify-debouncer-full`.
- `src/background.rs`: tepsi simgesi ve menüsü, kapatma davranışı, Quit, penceresiz başlama, `shell.json`.
- `src/watch.rs`: klasör izleme ve `folder-changed` olayı.
- `update.rs`: 6. bölümdeki kurulum zamanı.
- Yeni komutlar:
  - `background_get` ve `background_set`: arka planda çalışma ayarı.
  - `autostart_get` ve `autostart_set`: bilgisayar açılınca başlama, durumu sistemden okunur.
  - `tray_status`: menüdeki sync satırı ve fareyle üstüne gelince çıkan yazı.
  - `watch_folders`: izlenecek klasörlerin listesi.
  - `quit_now`.
- Olaylar: `folder-changed`, `quit`.
- `shell.json`, uygulamanın ayar klasöründe (`app_config_dir`), `settings.json`'ın yanında durur:

  ```json
  { "background": true, "autostartSet": true, "backgroundTold": false, "startHidden": false }
  ```

  - `background`: pencere kapanınca arka planda çalışma. Dosyada yoksa `true`.
  - `autostartSet`: açılışta başlama bir kez varsayılan olarak kuruldu mu. Kullanıcı bunu kapatırsa bir daha açılmaz.
  - `backgroundTold`: ilk kapatmadaki bildirim gösterildi mi.
  - `startHidden`: 6. bölümdeki güncelleme işareti.

  Bunlar `settings.json`'a konmaz. Web tarafı o dosyayı her kayıtta kendi bildiği alanlarla (`vault`, `spaces`) baştan yazar (`storage.ts`, `saveSettings`), yeni bir alan olsa silinirdi. `scrawl-mcp` da bu ayarlara ihtiyaç duymaz.
- `tauri.conf.json`: tepsi simgesi dosyaları ve NSIS kaldırma kancası.

**Web (`apps/web/src`)**

- `sync.ts`: masaüstünde tur gizliyken de döner. `folder-changed` olayını dinler ve ilgili space için kayıttan sonraki turu başlatır. Sync durumu değişince `tray_status`'u çağırır.
- `tauriFs.ts`: son yazılan yolları zamanıyla kısa bir süre tutar.
- `App.tsx`: pencere görünürken `folder-changed` gelince `session.rescan(space)`. Quit olayında `session.flush()` ve ardından `quit_now`.
- `Settings.tsx`: General bölümü (masaüstünde).
- `Agents.tsx`: 2.5'teki satır ve Keep running düğmesi.
- Yeni metinler `packages/i18n/src/en.ts`'e girer.

**Değişmeyenler:** `packages/core`, `packages/agent`, `apps/mcp`, sunucu, telefon düzeni.

## 8. Testler

### 8.1 Otomatik

- Rust:
  - kapatma kararı: arka planda çalışma açıkken gizler, kapalıyken çıkar;
  - `shell.json` yokken varsayılanlar;
  - güncellemenin kurulma zamanı: pencere görünürken beklenir, gizliyken kurulur, Quit'te kurulur, sistem kapanırken kurulmaz;
  - izleyicinin olayları birleştirmesi ve yolları klasörün içine göre vermesi (geçici bir klasörde gerçek dosya yazarak).
- Web:
  - `isSynced` olmayan yolların ve uygulamanın kendi yazdıklarının ayıklanması;
  - masaüstünde turun gizliyken de dönmesi, web'de dönmemesi;
  - tepsideki durum yazısı (saatli biçim).

### 8.2 Elle (bitti ölçütü)

Windows'ta ve Mac mini'de:

1. Pencere kapatılır; uygulama tepside kalır. İlk kapatmada bildirim çıkar, ikincisinde çıkmaz.
2. Pencere kapalıyken Claude Code `scrawl-mcp` ile kişisel space'e bir görev yazar. Görev telefonda ve web'de 10 saniye içinde görünür.
3. Telefonda bir not değişir. Pencere kapalıyken ajan onu en çok bir dakika içinde yeni haliyle okur. Gizli kalma süresi beş dakikayı geçince de ölçülür (WebView2 seyreltmesi, macOS'ta App Nap).
4. Pencere açıkken ajan bir şey yazar; pencere ona tıklamadan yenilenir.
5. Bilgisayar yeniden başlatılır; Scrawl penceresiz başlar ve sync'i döner.
6. Scrawl çalışırken Başlat menüsünden yeniden açılır; ikinci kopya başlamaz, pencere öne gelir.
7. Tepsiden Quit; uygulama çıkar, ajanın sonraki yazısı bilgisayarda bekler. General'de iki ayar kapatılıp açılır.
8. Pencere kapalıyken yeni bir sürüm yayımlanır. Uygulama kendiliğinden kurulur ve penceresiz açılır.
9. Bellek: bir saat gizli kaldıktan sonra ölçülür.
10. Uygulama kaldırılınca Windows'taki başlangıç satırı da gider.

Denemeler Roadmap'te "deneme" etiketli kartlar olur.

## 9. Dilimler

1. **Arka planda çalışma:** tepsi simgesi ve menüsü, kapatınca gizleme, Quit, tek kopya, `shell.json`, sync'in gizliyken dönmesi, tepsideki durum satırı, ilk kapatma bildirimi, macOS'ta Dock davranışı, General bölümünün ilk satırı, Agents'taki satır.
2. **Bilgisayar açılınca başlama:** autostart, `--background`, penceresiz başlama, ilk açılışta bir kez kurulması, General'in ikinci satırı, NSIS kaldırma kancası.
3. **Dosya izleme:** `watch.rs`, `watch_folders`, ayıklama, kayıttan sonraki tur, görünür pencerede yeniden okuma.
4. **Güncelleme:** pencere kapalıyken kurulum, `startHidden`, Windows'ta sessiz kurulum, sistem kapanırken kurmama.

Her dilimden sonra commit için sorulur. Yayın masaüstü sürümüyle yapılır (`design/desktop-release.md`): dördü bitince tek sürüm olarak.

## 10. Onayına sunulan kararlar

1. **Varsayılanlar:** "Keep running when the window is closed" ve "Open at login" ikisi de açık gelir. Bu, yeni kurulumda da bu sürüme güncellenen kurulumda da geçerlidir. Açılışta başlama yalnız bir kez varsayılan olarak kurulur; kullanıcı kapatırsa bir daha açılmaz.
2. **İlk kapatmada bildirim:** bir kez, 2.1'deki metinle.
3. **Ayarın yeri:** Settings'te yeni, yalnız masaüstünde görünen General bölümü, Appearance'ın altında.
4. **macOS:** pencere kapalıyken Dock'ta simge yok, yalnız menü çubuğunda. Pencere açılınca Dock'taki simge de gelir.
5. **Güncelleme:** pencere kapalıyken kendiliğinden kurulur ve uygulama penceresiz açılır. Windows kapanırken kurulmaz.
6. **Tepsi menüsü:** Open Scrawl, sync durumu, Quit Scrawl. Başka bir şey yok.
7. **Mockup:** yok. Menü sistemin kendi menüsü, General bölümü Settings'in var olan satırlarından oluşuyor. Tepsi simgesinin çizimi 1. dilimde ayrıca onaya gelir.

## 11. PLAN'da değişecekler

Onaydan sonra, ayrıca önerilip onayla yapılır:

- 6. bölümde yeni **18. aşama: Masaüstünde arka planda çalışma.** Bitti sayılır: pencere kapalıyken ajanın yazdığı telefonda saniyeler içinde görünüyor, telefonda değişen ajana bir dakika içinde iniyor; uygulama bilgisayar açılınca penceresiz başlıyor; güncelleme pencere kapalıyken kuruluyor. Dropbox 19'a, Google Drive 20'ye, Mobil 21'e kayar.
- 4.8 Ajan: "Sonra" listesindeki "dosya izleme" çıkar. Bilgisayardaki kapının satırına "uygulama arka planda çalıştığı sürece ajanın yazdığı hemen sync edilir" eklenir.
- Roadmap panosu: 18. faz, dört dilim kartı, 8.2'deki denemeler "deneme" etiketli kartlar.
- `design/agent.md` 6, "Uygulama ne zaman görür" maddesi bu belgeye bağlanır.

## 12. 1. dilim yazılırken görülenler (24 Ekim 2026)

- **Tepsi simgesi:** onaylı çizim (`design/tray-icon.html`) `apps/desktop/src-tauri/icons/tray/`'da: Windows için `tray-16/20/24/32.png`, macOS için `tray-template.png` ve `tray-template@2x.png`. Simge, uygulamanın başladığı ekranın ölçeğine göre seçilir: istenen boyuttan küçük olmayan en küçüğü, %175 ve üstünde 32 px. macOS'ta @2x ekranda 36 px'lik çizim kullanılır. Önizleme `mockups.html`'e değil ayrı bir sayfaya kondu, çünkü o sırada başka bir oturum `mockups.html`'de çalışıyordu.
- **Tepsi ne zaman kurulur:** menünün sözcüklerini, ilk kapatma bildirimini ve sync satırını web tarafı verir (`tray_start`, `tray_status`), `cloud.rs`'teki giriş sayfaları gibi. Tepsi bu yüzden sayfa açılınca kurulur. O ana kadar pencere kapatılırsa uygulama kapanır: geri getirecek simge olmadan pencere hiç gizlenmez.
- **Sync satırı:** hiçbir space sync etmiyorsa menüden çıkar ve fareyle üstüne gelince yalnız "Scrawl" yazar.
- **macOS'ta Dock:** `ActivationPolicy::Accessory` yerine Tauri'nin `set_dock_visibility` işlevi kullanıldı; etkisi aynı. Pencere kapalıyken Dock'taki simgeye tıklanırsa (`RunEvent::Reopen`) pencere geri gelir.
- **Kod:** `src-tauri/src/background.rs` (tepsi, kapatma, Quit, `shell.json`); `lib.rs`'te `tauri-plugin-single-instance` ilk eklenti, `tauri-plugin-notification`, `on_window_event`. Tauri'ye `tray-icon` ve `image-png` özellikleri eklendi. Web tarafında `tray.ts`, `SyncViews.tsx`'te `trayText`, `sync.ts`'te masaüstünde gizliyken de dönen tur, Settings'te General, Agents'ta Keep running satırı.
- **Testler:** Rust'ta dört test: kapatma kararı, `shell.json` yokken varsayılanlar, ölçeğe göre simge, her simgenin boyutu (Rust 19 test).
- **Windows'ta denendi**, gerçek notlara dokunmayan ayrı bir kimlikle (`app.scrawlnotes.desktop.trytray`, sonra silindi):
  - Pencere kapatılınca gizlendi, uygulama çalışmayı sürdürdü.
  - İlk kapatma bildirimi bir kez gönderildi (`shell.json`'da `backgroundTold`).
  - Uygulama ikinci kez başlatılınca ikinci kopya hemen kapandı, gizli pencere geri geldi.
  - Background kapalıyken pencereyi kapatmak uygulamadan çıktı.
- **Elle denenecek:** tepsi simgesinin ve menüsünün görünüşü, sol tık ve sağ tık, Quit (bekleyen kaydın yazılması), bildirimin görünüşü, gizliyken sync turu, General ve Agents ekranları, macOS.

## 13. 2. dilim yazılırken görülenler (24 Ekim 2026)

- **Açılışta başlama:** `tauri-plugin-autostart` 2.7 (altında `auto-launch` 0.6), argüman `--background`. Windows'ta değer `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` altında, adı ürünün adı (`Scrawl`). Eklentinin `is_enabled`'ı Task Manager'ın Startup apps anahtarına da bakar, orada kapatılan General'de kapalı görünür. macOS'ta `MacosLauncher::LaunchAgent`.
- **Bir kez açılması:** yalnız derlenmiş uygulamada, ilk başlangıçta ya da bu sürüme güncellenen kurulumun ilk başlangıcında (`shell.json`'da `autostartSet`). Geliştirirken çalışan uygulama başlangıca yazılmaz; yazılsaydı kurulu uygulamayla aynı adı (`Scrawl`) taşır, onun satırının üstüne yazardı.
- **Penceresiz başlama:** `--background` ile pencere görünmez kurulur, sayfa yüklenir ve sync döner. Sayfa çizilince gelen `window_ready` pencereyi göstermez; tepsiden Open ya da Scrawl'ın yeniden başlatılması gösterir. Bilgisayarın ikinci kez `--background` ile başlattığı kopya hiçbir şey göstermez. macOS'ta o sırada Dock'ta simge olmaz.
- **Kaldırma:** `windows/hooks.nsh`, `NSIS_HOOK_POSTUNINSTALL` ile iki değeri siler: Run'daki satır ve Task Manager'ın anahtarı. Tauri'nin yükleyicisi güncellemede kaldırıcıyı çalıştırmaz ("In update mode, always proceeds without uninstalling"); kanca yalnız uygulama gerçekten kaldırılınca çalışır. Kişi elle yeniden kurarken "önce kaldır"ı seçerse başlangıç satırı da gider ve `autostartSet` kaldığı için kendiliğinden geri gelmez; General'den açılır. Kanca NSIS'in derleyicisinden geçti, gerçek bir kaldırmada denenmedi.
- **General:** ikinci satır "Open at login". Durumu bölüm açılınca sistemden okunur; okunana kadar kutu pasif.
- **Testler:** Rust'ta `--background`'u tanıyan test, `shell.json`'da `autostartSet` (Rust 20 test).
- **Windows'ta denendi**, ayrı kimlikle (sonra silindi):
  - `--background` ile başlayınca ana pencere görünmez kaldı, sayfa açıldı (ayar dosyası yazıldı).
  - İkinci kez `--background` ile başlatılınca ikinci kopya kapandı, pencere gizli kaldı.
  - Argümansız başlatılınca pencere geldi.
  - Geliştirme derlemesi başlangıca satır yazmadı.
- **Elle denenecek:** bilgisayar yeniden başlayınca Scrawl'ın tepside açılması, General'deki "Open at login"in açılıp kapanması ve Task Manager'da kapatılınca kapalı görünmesi, kaldırınca satırın gitmesi, macOS'ta LaunchAgent.
