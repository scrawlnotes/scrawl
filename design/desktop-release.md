# Masaüstü dağıtımı ve güncelleme: teknik tasarım (taslak)

Aşama dışı bir altyapı işi. Durum: plan onaylandı (16 Ekim 2026): imzasız başlanır, SignPath'e sonra başvurulur. Durum çubuğu ve About mockup'ı onaylandı (mockup sayfasında GÜNCELLEME · MASAÜSTÜ). 1. dilim (Windows) yazıldı, 14. bölümde notlar; sırada secret'lar ve ilk release. Masaüstü uygulaması Tauri 2 (`apps/desktop`), setup bugün NSIS ile elle derleniyor; GitHub'da henüz hiç release yok.

## 1. Ne istiyoruz

- Her sürümde Windows setup'ı GitHub Releases'ta durur; sonra mac de.
- Yayın tek adımdır: tag push. Derleme, yükleme ve yayın CI'dadır.
- Kurulu uygulama yeni sürümü görünür biçimde haber verir; kişi isterse günceller. Otomatik güncelleme yok.

## 2. İnsanlar nasıl yapıyor

Çoğu uygulama (VS Code, Chrome, Slack, Electron'un `autoUpdater`'ı) arka planda sessizce indirip "Restart to update" düğmesi gösterir. Scrawl 6 Kasım'a kadar böyleydi. 6 Kasım'da değişti: kullanıcı otomatik güncelleme istemiyor, sessiz indirme de yok. Yeni sürüm sorulur, kişi Update derse iner.

## 3. Kullanıcı ne görür

6 Kasım'da onaylanan akış (mockup sohbette, uygulama penceresinin içinde tıklanabilir):

1. `latest.json` açılıştan 3 sn sonra ve yarım saatte bir okunur. Pencere tepsiden ya da Dock'tan geri getirilince de okunur, son başarılı bakış 10 dakikadan eskiyse. Önceki "30 sn sonra ve 4 saatte bir" pratikte işlemiyordu: uygulama girişte tepsiye başlayıp günlerce açık kalıyor, pencereyi açıp kapamak yeniden başlatmıyor, 4 saatlik bekleme de bilgisayar uyurken ilerlemiyor.
2. Yeni sürüm varsa hiçbir şey inmez. Ortada bir pencere sorar: **Scrawl 0.1.24 is out**, "You have 0.1.23.", What's new linki, **Later** ve **Update**.
3. Later: bu açılışta bir daha sorulmaz. Pencere tepsiden yeniden açılınca yine sorar. Kenar çubuğunun altında, Files'ın üstünde vurgulu **Update to 0.1.24** satırı güncellenene kadar kalır. Satıra tıklamak pencereyi açar.
4. Update: en yeni sürüm iner, pencerede yüzde ve çubuk görünür. Pencere kapatılabilir, iniş sürer, satır "Downloading · 62%" der. İnince uygulama kendiliğinden yeniden başlar (Update'e basıldı). Pencere kapatılmışsa yeniden başlamaz, bir kez "0.1.24 is ready · Later / Restart" diye sorar, satır "Restart to update" olur.
5. İnmezse pencere nedenini söyler, Try again ve Later çıkar. Satır yine "Update to 0.1.24" der.
6. Restart: yazılan kaydedilir, uygulama kapanır, yeni sürümle açılır. Kurulum sessizdir (NSIS quiet, 24 Ekim'den beri).
7. İnmiş ama Restart'a basılmamış güncelleme: pencere tepsiye kapatılınca kurulur, yeni sürüm penceresiz açılır; Quit ile çıkılınca kurulur. Sistem kapanırken kurulmaz (`design/background.md` 2.6). İnen yalnız Update'e basılınca indiği için bu da kişinin kararıdır.
8. Başka bir pencere açıksa güncelleme penceresi onun üstüne çıkmaz, o kapanınca çıkar.
9. Settings › About: sürüm, What's new, Check for updates ve sonucu. Check yalnız bakar; yeni sürüm varsa **Update** ve What's new in 0.1.24 çıkar, iniş ve Restart burada da görünür. Durum çubuğunda artık güncelleme yazısı yok.
10. İnternet yoksa ya da GitHub'a ulaşılamazsa kendiliğinden bakışta hiçbir şey görünmez.

## 4. Teknoloji

| Ne | Seçim | Neden |
|---|---|---|
| Updater | `tauri-plugin-updater` 2 | Tauri'nin resmi eklentisi: indirir, imzayı doğrular, NSIS setup'ını çalıştırır |
| Setup | NSIS (bugünkü), `currentUser` | `%LOCALAPPDATA%\Scrawl`'a kurulur, yönetici izni istemez; güncellemede UAC çıkmaz |
| CI | GitHub Actions + `tauri-apps/tauri-action@v1` | Setup'ı derler, release'e yükler, `latest.json`'ı üretir |
| Güncelleme bilgisi | Release'teki `latest.json`; endpoint `https://github.com/scrawlnotes/scrawl/releases/latest/download/latest.json` | Sunucu yok, bedava |
| Güncelleme imzası | minisign anahtar çifti (`tauri signer generate`) | Windows imzasından ayrıdır; imzası tutmayan dosya kurulmaz |
| Maliyet | Public repoda GitHub'ın runner'ları bedava, Windows ve macOS dahil | |

## 5. Sürüm ve release

- **Tek sürüm yeri:** `apps/desktop/package.json`. `tauri.conf.json`'da `"version": "../package.json"`. İlk sürüm 0.1.0.
- **Etiket:** `desktop-v0.1.0` (`server-v`, `mcp-v` gibi). CI, etiketin package.json'daki sürümle aynı olduğunu kontrol eder.
- **Sürüm notu:** `apps/desktop/CHANGELOG.md`'de `## 0.1.0` başlığının altında, İngilizce ve kısa. CI bu bölümü release'in metni ve `latest.json`'daki `notes` yapar. Bölüm yoksa yayın durur.
- **Release:** adı "Scrawl 0.1.0". Dosyalar `Scrawl-setup.exe`, `Scrawl-setup.exe.sig` ve `latest.json`. Setup'ın adında sürüm yok, böylece README'deki `releases/latest/download/Scrawl-setup.exe` linki hep son sürümü indirir. `latest.json`'daki linkler etiketin kendi dosyalarına gider.
- **"Latest" release masaüstünündür:** updater onu okur. `mcp.yml`'deki release `make_latest: false` alır, yoksa bir MCP sürümü masaüstünün güncellemesini keser.
- **Yayın adımı:** sürümü artır, notu yaz, commit, tag, push. Bunu ben hazırlarım, push senin onayınla.
- **Kötü sürüm çıkarsa:** yeni bir yama sürümü çıkar. Updater eski sürüme inmez.

## 6. CI: `.github/workflows/desktop.yml`

Tetikler: `desktop-v*` etiketi; `apps/desktop/src-tauri/**`'ya dokunan push ve PR (yalnız test); `workflow_dispatch` (yayınlamadan derler, setup'ı workflow artifact'ı olarak bırakır).

| Job | Runner | Ne yapar |
|---|---|---|
| `test` | windows-latest | `cargo test` (src-tauri) |
| `build` | matrix: windows-latest (mac sonra) | pnpm 12.9.1, Node 24, Rust stable, `Swatinem/rust-cache`; `pnpm install --frozen-lockfile --filter "@scrawlnotes/desktop..." --filter "@scrawlnotes/web..."`; etiket = sürüm kontrolü; CHANGELOG'dan not; `tauri-action` ile `releaseDraft: true`, `tagName`, `releaseName`, `releaseBody`, `releaseAssetNamePattern`. İzin: `contents: write` |
| `publish` | ubuntu-latest | `build` bütün platformlarda bitince `gh release edit <tag> --draft=false --latest` |

Release, bütün platformlar bitene kadar draft'tır. Kimse yarım release görmez, updater da yarım `latest.json` okumaz.

Secret'lar: `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. İmza ve mac gelince onlarınkiler eklenir.

## 7. Uygulamadaki kod

**Rust** (`apps/desktop/src-tauri/src/update.rs`):

- `tauri-plugin-updater` kaydı. Yalnız release derlemede çalışır, `tauri dev`'de kapalıdır.
- Durum: `Idle`, `Checking`, `UpToDate { checked }`, `Available { version }`, `Downloading { version, percent }`, `Ready { version }`, `Failed { offline, reason }`. İnen setup bellekte durur (birkaç MB).
- Zamanlayıcı: 3 sn sonra ve yarım saatte bir yalnız `check` → `Available` ya da `UpToDate`. `background::show` pencereyi geri getirince `shown` event'i gönderir ve `look_if_stale` son başarılı bakış 10 dakikadan eskiyse bakar. `Available` iken kendiliğinden bakış tekrar edilmez; Update zaten en yenisini indirir. Her değişiklik `update` event'iyle web'e gider.
- Komutlar: `update_state`, `update_check` (About'tan, yalnız bakar), `update_download` (Update: `check` + `download` → `Ready`; pencere gizliyse kurulur), `update_restart` (`install`, `restart_after_install(true)`).
- `RunEvent::ExitRequested`: durum `Ready` ise `restart_after_install(false)` ile `install`. Windows'ta `install` uygulamayı kendisi kapatır.
- Config: `plugins.updater` içinde `pubkey`, `endpoints`, `windows.installMode: "quiet"` (24 Ekim'e kadar `"passive"`). `bundle.createUpdaterArtifacts: true` yalnız `tauri.release.conf.json`'da, CI `--config` ile verir: yoksa elle `pnpm desktop:build` özel anahtar ister.
- JS eklentisinin izinleri (`updater:default`) verilmez. Web yalnız bizim üç komutumuzu çağırır.

**Web:**

- `apps/web/src/desktopUpdate.ts`: `pwa.ts`'nin masaüstü eşi (durum ve abonelik) ve güncelleme penceresinin adımı (`ask` / `download` / `ready`), Later'ın tuttuğu sürüm.
- `dialogs.tsx` `DesktopUpdateDialog`; `App.tsx` onu başka pencere yokken gösterir, Update'ten sonra iniş bitince Restart'ı çağırır (önce `session.beforeSync()`, sonra `update_restart`).
- `Sidebar.tsx`: alt kısımda güncelleme satırı.
- Settings › About; i18n `update.*`, `side.updateTo` ve yanındakiler.

## 8. Windows imzası

Updater'ın imzası güncellemeyi korur. Windows'un baktığı imza (Authenticode) başka şeydir ve yalnız ilk kurulumda görünür. Updater'ın indirdiği dosyada SmartScreen uyarısı çıkmaz.

| Seçenek | Bedeli | Ne olur |
|---|---|---|
| İmzasız | bedava | İlk kurulumda SmartScreen: "Windows protected your PC" → More info → Run anyway. Edge indirmede uyarabilir. Smart App Control açık bir PC'de setup hiç çalışmaz (bu ayar yalnız temiz kurulmuş Windows 11'lerde açık olabilir). Güncellemeleri etkilemez. |
| SignPath Foundation | bedava (açık kaynak) | Yayıncı "SignPath Foundation" görünür. Başvuru için imzasız bir sürümün yayında olması gerekir. İmzalama CI'da yapılır; README'ye bir teşekkür satırı istenir. Super Productivity gibi uygulamalar böyle imzalıyor. |
| Kendi adına OV sertifika (Certum, SSL.com…) | yılda ~150-300$ | Yayıncı "Kaan Arslan" görünür. Anahtar bulutta ya da donanımda durur; CI'a bağlamak biraz uğraş ister. |
| Azure Artifact Signing | ~10$/ay | Bireysel geliştiriciye yalnız ABD ve Kanada'da açık; Türkiye'den olmuyor. |

İmza SmartScreen uyarısını hemen kaldırmaz; itibar indirmelerle birikir (EV sertifika da artık bunu atlamıyor). Smart App Control engelini ise imza kaldırır.

**Karar (16 Ekim):** 0.1.0 imzasız çıkar, hemen ardından SignPath'e başvurulur. Onay gelince imza `bundle.windows.signCommand` ile CI'a girer. Tauri updater'ın `.sig` dosyasını imzalanmış setup'tan üretir, sıra bozulmaz.

## 9. Mac

**Karar (16 Ekim):** Mac sürümü 0.1.2 ile imzasız çıkar; Apple Developer sonra.

- Matrix'te `macos-latest`, `--target universal-apple-darwin`: Intel ve Apple Silicon için tek `Scrawl.dmg`; updater için `Scrawl.app.tar.gz` ve `.sig`; `latest.json`'da `darwin-aarch64` ve `darwin-x86_64`. publish adımı üçünü ve dmg'yi arar.
- `tauri.macos.conf.json`: paketler `app` ve `dmg`, `signingIdentity: "-"`. Ad hoc imza Apple Silicon'da şart: imzasız indirilen uygulama için Mac "hasarlı" der ve açtırmaz; ad hoc imzalıda ilk açılışta System Settings › Privacy & Security › Open Anyway yeter.
- Ad hoc imza her sürümde değişir. Keychain'deki anahtarlar (OneDrive, sunucu) güncellemeden sonra ilk okunurken Mac izin sorabilir; Always Allow bir daha sordurmaz. Apple Developer imzası gelince biter.
- Apple Developer Program yılda 99$ (bireysel üyelik Türkiye'den olur). Gelince secret'lar: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY` ve notarization için App Store Connect API anahtarı; `signingIdentity` onlardan gelir.
- Koddakiler: Tauri 2 Mac'te varsayılan menüyü (Edit dahil, Cmd+C ve Cmd+V) kendisi kurar; `keyring` 4 Mac'te Keychain'i kendisi seçer.
- Deneme: evdeki Mac mini (`ssh mac`); yerelde `CI=true pnpm tauri build --target universal-apple-darwin`.

## 10. Güvenlik

- Updater'ın özel anahtarı ve şifresi yalnız GitHub secret'ında ve senin şifre yöneticinde durur, repoya hiç girmez. Kaybolursa kurulu uygulamalar güncellenemez, herkes elle yeniden kurar.
- Anahtarı bu makinede ben üretebilirim. Secret'a koymayı sen yaparsın ya da `gh secret set` ile benim koymama onay verirsin.
- Updater yalnız HTTPS kullanır ve imzası tutmayan dosyayı kurmaz.
- Kontrol, GitHub'dan tek bir dosya okumaktır. Uygulama hiçbir bilgi göndermez; GitHub'a ulaşılamazsa uygulama aynen çalışır.
- Yalnız `build` ve `publish` job'ları yazma izni alır. İsteğe bağlı: GitHub'da `desktop-v*` etiketlerini yalnız senin oluşturabildiğin bir kural.
- `identifier` (`app.scrawlnotes.desktop`) hiç değişmez. Değişirse updater ve cihazdaki ayarlar kopar.

## 11. Testler

- Rust: kapanışta kurma kararı küçük bir fonksiyon, testli (`Ready`'de kurar, diğer durumlarda kurmaz).
- CHANGELOG'dan not çıkaran betik: bölümü bulur, yoksa hata verir (2 test).
- CI: `workflow_dispatch` ile yayınlamadan derleme, setup'ı bu makinede kurma.
- Uçtan uca, gerçek release'lerle (henüz kullanıcı yok, sorun olmaz):
  1. 0.1.0'ı GitHub'dan indirip kur, SmartScreen'i gör.
  2. 0.1.1 yayınla → Check for updates → Restart → 0.1.1 açılır.
  3. 0.1.2 yayınla → düğmeye basma, kapat → sonraki açılış 0.1.2.
  4. İnternet kapalıyken açılış: hiçbir şey görünmez, About nedenini söyler.
  5. Settings › Apps'ten kaldırma: notlar yerinde kalır.

## 12. Dilimler

1. **Windows:** tek sürüm yeri, updater (Rust, durum çubuğu, About), `desktop.yml`, CHANGELOG, `mcp.yml`'de `make_latest: false`, README'de indirme linki. Önce About ve durum çubuğu için mockup. Bitti sayılır: 0.1.0 GitHub'dan kuruluyor; 0.1.1 Restart'la, 0.1.2 kapanışta geliyor.
2. **Windows imzası:** SignPath onayı gelince.
3. **Mac:** Apple hesabı ve deneme için bir Mac olunca.

Sonra: winget (`winget install Scrawl`, bedava), Linux (AppImage ve deb, iş akışına bir satır), Windows ARM64, beta kanalı.

## 13. PLAN

5.1 tablosuna "Dağıtım" satırı yazıldı (16 Ekim).

## 14. Yazılırken görülenler (16 Ekim 2026)

- `tauri-plugin-updater` 2.14, `zip` özelliği kapalı: istediği `zip` 4 sürümlerinin hepsi crates.io'da geri çekilmiş, bulunamıyor. Windows'ta güncelleme doğrudan setup'tır, zip gerekmez. Mac'in `.app.tar.gz`'si `tar` ile açılır, o özellikten bağımsız geliyor; mac diliminde yine de denenecek.
- Özellikler `native-tls` ve `system-proxy`: uygulamanın kendi `reqwest`'i gibi, rustls ikinci kez girmez.
- Anahtar çifti `~/.tauri/scrawl.key` (şifresi yanında `scrawl.key.password`), açık anahtar `tauri.conf.json`'da.
- Rust: `src-tauri/src/update.rs`, komutlar `update_state`, `update_check`, `update_restart`; kapanışta kurulum `RunEvent::ExitRequested`'te. 3 test (aynı anda iki arama başlamaz, indirme yüzdesi, web'in okuduğu biçim).
- Web: `desktopUpdate.ts`, durum çubuğunda Restart (üstüne gelince ipucu), Settings › About; Restart önce yazılanı kaydeder (`session.beforeSync`), kurulamazsa bildirim çıkar.
- `apps/desktop/scripts/release-notes.mjs` ve 2 testi (`pnpm --filter @scrawlnotes/desktop test`).
- Bu makinede CI'ın yaptığı derleme denendi: `Scrawl_0.1.0_x64-setup.exe` (5,25 MB) ve `.sig` çıktı; sürüm package.json'dan geliyor.
- Etiketle tetiklenmezse yedek yol: Actions'ta Desktop iş akışını etiketin üstünde elle çalıştırmak aynı release'i çıkarır.
- Latest release masaüstünündür. Settings › Agents'taki Claude Desktop düğmesi `.mcpb`'yi `releases/latest`'ten açıyordu; artık MCP'nin kendi sürümünün release'ine gider (`mcp-v<apps/mcp/package.json sürümü>/scrawl.mcpb`), sürüm web derlenirken alınır. Masaüstündeki düğme bu düzeltmeyi bir sonraki masaüstü sürümüyle alır.
