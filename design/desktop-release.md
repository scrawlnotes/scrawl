# Masaüstü dağıtımı ve güncelleme: teknik tasarım (taslak)

Aşama dışı bir altyapı işi. Durum: plan onaylandı (16 Ekim 2026): imzasız başlanır, SignPath'e sonra başvurulur. Durum çubuğu ve About mockup'ı çizildi (mockup sayfasında GÜNCELLEME · MASAÜSTÜ), onay bekliyor. Masaüstü uygulaması Tauri 2 (`apps/desktop`), setup bugün NSIS ile elle derleniyor; GitHub'da henüz hiç release yok.

## 1. Ne istiyoruz

- Her sürümde Windows setup'ı GitHub Releases'ta durur; sonra mac de.
- Yayın tek adımdır: tag push. Derleme, yükleme ve yayın CI'dadır.
- Kurulu uygulama kendini günceller ve kullanıcının işini bölmez.

## 2. İnsanlar nasıl yapıyor

VS Code, Chrome, Slack, Obsidian, Todoist ve Electron'un `autoUpdater`'ı aynı yolu izler:

- Arka planda sessizce kontrol eder ve indirir. İzin sormaz.
- İnince küçük bir "Restart to update" düğmesi gösterir. Modal pencere yok, zorla yeniden başlatma yok.
- Düğmeye basılmazsa güncelleme uygulama kapanınca kurulur. Sonraki açılış yeni sürümdür.

Kurulum açılışta değil kapanışta yapılır: açılış hiç yavaşlamaz.

## 3. Kullanıcı ne görür

1. Açılıştan 30 sn sonra ve sonra 4 saatte bir `latest.json` okunur.
2. Yeni sürüm varsa sessizce iner ve imzası doğrulanır. İnerken hiçbir şey görünmez.
3. Durum çubuğunda **New version ready · Restart** çıkar. Web'deki "Reload"ın yeri ve sözü aynıdır, yalnız düğme Restart'tır.
4. Restart: yazılan kaydedilir, uygulama kapanır, küçük bir ilerleme penceresi görünür (NSIS passive), uygulama yeni sürümle açılır. Birkaç saniye sürer.
5. Basılmazsa: pencere kapatılınca aynı kurulum çalışır, uygulama yeniden açılmaz.
6. İnternet yoksa ya da GitHub'a ulaşılamazsa hiçbir şey görünmez.
7. Settings › About (yeni bölüm, yalnız masaüstünde): sürüm, What's new (bu sürümün GitHub sayfası), Check for updates ve sonucu (Up to date, Downloading 0.2.0…, Restart, ya da neden kontrol edilemediği); en altta açık kaynak ve GitHub linki.

Otomatik güncellemeyi kapatma ayarı ilk sürümde yok.

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
- **Release:** adı "Scrawl 0.1.0". Dosyalar `Scrawl-Setup.exe`, `Scrawl-Setup.exe.sig` ve `latest.json`. Setup'ın adında sürüm yok, böylece README'deki `releases/latest/download/Scrawl-Setup.exe` linki hep son sürümü indirir. `latest.json`'daki linkler etiketin kendi dosyalarına gider.
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
- Durum: `Idle`, `Checking`, `Downloading { version }`, `Ready { version, notes, bytes }`, `Failed { reason }`. İnen setup bellekte durur (birkaç MB).
- Zamanlayıcı: 30 sn sonra ve 4 saatte bir `check` → yeni sürüm varsa `download` → `Ready`. Her değişiklik `update` event'iyle web'e gider.
- Komutlar: `update_state`, `update_check` (About'tan), `update_restart` (`install`, `restart_after_install(true)`).
- `RunEvent::ExitRequested`: durum `Ready` ise `restart_after_install(false)` ile `install`. Windows'ta `install` uygulamayı kendisi kapatır.
- Config: `plugins.updater` içinde `pubkey`, `endpoints`, `windows.installMode: "passive"`; `bundle.createUpdaterArtifacts: true`.
- JS eklentisinin izinleri (`updater:default`) verilmez. Web yalnız bizim üç komutumuzu çağırır.

**Web:**

- `apps/web/src/desktopUpdate.ts`: `pwa.ts`'nin masaüstü eşi (durum ve abonelik).
- `App.tsx` durum çubuğu: masaüstünde Restart. Önce `session.beforeSync()`, sonra `update_restart`, web'deki Reload gibi.
- Settings › About: mockup onaylanınca.
- i18n: `status.restart`, `settings.about` ve About'un metinleri.

## 8. Windows imzası (karar gerekiyor)

Updater'ın imzası güncellemeyi korur. Windows'un baktığı imza (Authenticode) başka şeydir ve yalnız ilk kurulumda görünür. Updater'ın indirdiği dosyada SmartScreen uyarısı çıkmaz.

| Seçenek | Bedeli | Ne olur |
|---|---|---|
| İmzasız | bedava | İlk kurulumda SmartScreen: "Windows protected your PC" → More info → Run anyway. Edge indirmede uyarabilir. Smart App Control açık bir PC'de setup hiç çalışmaz (bu ayar yalnız temiz kurulmuş Windows 11'lerde açık olabilir). Güncellemeleri etkilemez. |
| SignPath Foundation | bedava (açık kaynak) | Yayıncı "SignPath Foundation" görünür. Başvuru için imzasız bir sürümün yayında olması gerekir. İmzalama CI'da yapılır; README'ye bir teşekkür satırı istenir. Super Productivity gibi uygulamalar böyle imzalıyor. |
| Kendi adına OV sertifika (Certum, SSL.com…) | yılda ~150-300$ | Yayıncı "Kaan Arslan" görünür. Anahtar bulutta ya da donanımda durur; CI'a bağlamak biraz uğraş ister. |
| Azure Artifact Signing | ~10$/ay | Bireysel geliştiriciye yalnız ABD ve Kanada'da açık; Türkiye'den olmuyor. |

İmza SmartScreen uyarısını hemen kaldırmaz; itibar indirmelerle birikir (EV sertifika da artık bunu atlamıyor). Smart App Control engelini ise imza kaldırır.

**Karar (16 Ekim):** 0.1.0 imzasız çıkar, hemen ardından SignPath'e başvurulur. Onay gelince imza `bundle.windows.signCommand` ile CI'a girer. Tauri updater'ın `.sig` dosyasını imzalanmış setup'tan üretir, sıra bozulmaz.

## 9. Mac (sonra)

- Apple Developer Program yılda 99$ (bireysel üyelik Türkiye'den olur). İmzasız ve notarize edilmemiş bir mac uygulaması pratikte açılmaz: System Settings › Privacy & Security › Open Anyway gerekir.
- Matrix'e `macos-latest`, `--target universal-apple-darwin`: Intel ve Apple Silicon için tek `Scrawl.dmg`; updater için `.app.tar.gz` ve `.sig`; `latest.json`'a `darwin-aarch64` ve `darwin-x86_64`.
- Secret'lar: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY` ve notarization için App Store Connect API anahtarı.
- Kodda bakılacaklar: Edit menüsü (Cmd+C ve Cmd+V onsuz çalışmaz), Keychain (`keyring` destekliyor), OneDrive girişi, kısayollarda Cmd, pencere başlığı. Mac'e özel ayarlar `tauri.macos.conf.json`'da.
- Deneme için bir Mac gerekir; bizde yok.

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

## 13. PLAN'a önerilen ek

5.1 tablosuna "Dağıtım" satırı yazıldı (16 Ekim).
