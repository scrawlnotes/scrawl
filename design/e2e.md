# Uygulama geneli e2e, kullanıcı gözüyle tarama ve öneriler (taslak)

Durum: taslak, onay bekliyor. PLAN.md ve Roadmap'e onaydan sonra yazılır.

## 1. Kapsam

Üç iş, aynı yürüyüşte:

1. **E2E testleri.** Uygulamanın ana akışları baştan sona, gerçek tarayıcıda çalışır mı. Çıktısı: tekrar çalıştırılabilen bir test takımı ve kırık bulunanların listesi.
2. **Kullanıcı gözüyle UI/UX taraması.** Her akışı bir son kullanıcı gibi kullanmak: kaç tık, ne görür, nerede takılır, ne eksik, ne çirkin. Çıktısı: bulgu listesi.
3. **Değer katacak özellikler.** Tarama sırasında görülen boşluklar. Çıktısı: liste, her biri için neden ve öneri. Hiçbiri onaysız yapılmaz.

Bulunan hatalar sormadan düzeltilir. UI/UX sorunları ve yeni özellikler onaya gelir.

Neyi yapmaz:
- Birim testlerin yerine geçmez (vitest testleri olduğu gibi kalır).
- Piksel karşılaştırmalı görsel test yok: kırılgan, her cila değişikliğinde bozulur. Ekran görüntüsü rapora kanıt olarak eklenir.
- Gerçek hesapları ve gerçek veriyi kullanmaz (bkz. 6. bölüm).

## 2. Ortam

Hepsi bu bilgisayarda, gerçek hiçbir hesaba dokunmadan:

| Parça | Nasıl |
|---|---|
| Web | `vite` dev sunucusu. Dev'de OneDrive, Google Calendar ve Outlook sahte (`cloud.ts` FakeCloud, `google.ts`, `outlook.ts`) |
| Sunucu | `apps/server` geçici bir veri klasörüyle, her koşuda boş başlar |
| Cihazlar | Her test yeni bir tarayıcı bağlamı: boş OPFS, boş depolama, ilk açılış. İki kişi/iki cihaz gereken testlerde iki bağlam aynı sunucuya bağlanır |
| Boyutlar | Masaüstü 1440×900 ve telefon 390×844 (iPhone, dokunma açık). Tarama ayrıca açık ve koyu modda |

## 3. Akışlar

Her alan için hem test hem tarama. Sıra, kullanıcının uygulamayla karşılaşma sırası.

| # | Alan | Akışlar (özet) |
|---|---|---|
| A | İlk açılış | Start page, welcome notu, kişisel space'i (sahte) OneDrive'a bağlama, boş durumlar |
| B | Notlar ve editör | Yeni not, başlık/vurgu/liste/link/resim/kod/callout/tablo, yazınca liste, Excel'den yapıştırma, sekmeler, Rename, taşıma, Trash ve geri alma, sürümler, PDF/HTML/MD dışa aktarma, Quick notes |
| C | Görevler | Liste, alt görev, öncelik, tarih, Scheduled, bölümler, sürükleyerek sıralama, etiketler, filtreler, Favorites, Remind, Undo toast |
| D | Pano | Şablondan pano, kart, sütunlar, faz kapatma, kart penceresi, yorum, mention |
| E | Koleksiyon ve app'ler | Şablondan app kurma (CRM, Gym ve birkaç şablon), kayıt formu, tablo, görünümler, kurallar, CSV/XLSX içe aktarma, hatalı girdinin gösterilmesi, Edit app |
| F | Takvim | Calendar, sahte Outlook/Google olayları, görevi ve kartı takvimde taşıma |
| G | Arama | Ctrl+K, Recent ve son aramalar, bulup açma |
| H | Space'ler ve sync | Yerel sunucuya bağlanma, davet ve katılma, iki cihaz arası sync, çakışma, offline şeridi, space taşıma |
| I | Chat | Oda, DM, dosya, mention, arama, ajanla DM |
| J | Bildirimler | Mention, atama, Remind, son tarih, Settings |
| K | Ajan | Yerel sunucunun `/mcp` kapısıyla ana araçlar (tree, read, write, save_task, save_card, save_record) ve yazılanın arayüzde görünmesi |
| L | Diğer ekranlar | Settings, Help, Keys, Files, Trash, Activity, People |
| M | Telefon kabuğu | Tab bar, sheet'ler, sayfa geçişleri, klavye açıkken düzen, 44 px dokunma alanları |

## 4. Tarama ölçütleri

Her ekran için bakılacaklar, kendi kurallarımızdan:

- Bir kullanıcı işi en kısa yoldan bitirebiliyor mu; gereksiz ekran, ön kayıt, ritüel var mı.
- Görevlerde davranış Todoist'teki, CRM'de HubSpot'taki gibi mi.
- Hatalı girdi yazıldığı yerde ve nedeniyle görünüyor mu; hiçbir şey sessizce kaybolmuyor mu.
- Boş, yükleniyor, hata ve offline durumları var ve anlaşılır mı.
- Metin kısa ve sade mi; teknik ad yerine cümle mi.
- Ölçüler: telefonda 44 px dokunma, bilgisayarda 28 px tıklama, 16 px simge.
- Açık ve koyu modda okunuyor mu, kontrast yeterli mi.
- Klavye: Tab sırası, odak görünüyor mu, Esc kapatıyor mu; düğme ve alanların erişilebilir adı var mı.
- Prototip görünümü (hizasız, taslaktan sapan, cilası eksik yer) var mı.

## 5. Bulgular ve öneriler

`design/e2e-findings.md`'de, alan alan.

- **Hata** (bir şey olması gerektiği gibi çalışmıyor): ekran, adım, ne oldu, nasıl düzeltildi, commit. Sormadan düzeltilir; liste ne yapıldığının kaydıdır.
- **UI/UX bulgusu** (çalışıyor ama zor, eksik ya da çirkin): ekran, adım, ne görülüyor, neden sorun, önerilen düzeltme, önem (Zor: yapılıyor ama yoruyor · Cila), ekran görüntüsü. Kararı sen verirsin: düzelt, sonra, hayır.
- **Özellik önerisi:** ihtiyaç (hangi akışta görüldü), neden değer katar, öneri, piyasada nasıl (örnek ürün), büyüklük (küçük / orta / büyük). Her biri için kararı sen verirsin: yap, sonra, hayır. Onaylananlar Roadmap'e kart olur.

## 6. Dışarıda kalanlar (her biri senin kararın)

| Konu | Neden dışarıda | Seçenek |
|---|---|---|
| Masaüstü uygulamasına özgü (tepsi, açılışta başlama, dosya izleme, güncelleme, Kaydet penceresi) | Tarayıcıda yok; Tauri'yi sürmek için `tauri-driver` + Edge WebDriver kurulumu gerekir | Sonra ayrı dilim ya da elle |
| Gerçek iPhone | Tarayıcıdaki telefon boyutu iOS klavyesini ve Safari'nin tuhaflıklarını tam vermez | Senin cihaz denemelerin |
| Gerçek OneDrive, Google, Outlook hesapları | Gerçek veriye dokunur, testler tekrarlanabilir olmaz | Sahteleriyle test, gerçeği elle |
| Canlı sunucu (scrawl.kaanarslan.dev) ve senin space'lerin | Gerçek veri | Hiç dokunulmaz |
| CI'de her push'ta çalışması | GitHub Actions dakikası; önce yerelde oturmalı | Takım oturunca karar |

## 7. Teknik

**Araç: Playwright (`@playwright/test`).** Neden: birden çok tarayıcı bağlamı (iki cihaz/iki kişi) tek testte, telefon emülasyonu, `webServer` ile vite ve sunucuyu kendisi başlatır, iz (trace) ve ekran görüntüsü verir. Yeni bir geliştirme bağımlılığıdır, yalnız testte kullanılır, uygulamaya girmez.

**Yer:** yeni workspace paketi `e2e/` (kökte, `apps/` ve `packages/` dışında; uygulama değil).

```
e2e/
  package.json          @scrawlnotes/e2e, devDependency @playwright/test
  playwright.config.ts  projeler: desktop (Chromium 1440×900), phone (390×844, isMobile, hasTouch)
  fixtures.ts           yeni cihaz, ikinci cihaz, sunucuya bağlı space, sahte OneDrive bağlama
  tests/
    a-first-run.spec.ts
    b-notes.spec.ts
    ...                 3. bölümdeki her alan için bir dosya
```

- **Sunucular:** `webServer` ile `vite --port 5199 --strictPort` ve sunucu ayrı bir portta, geçici veri klasörüyle. Senin açık dev ortamına (5173, 8080) dokunmaz.
- **Seçiciler:** `getByRole`, `getByLabel`, `getByText`. Uygulamaya `data-testid` eklenmez; bir öğe rolüyle bulunamıyorsa bu bir erişilebilirlik bulgusudur, rapora girer.
- **Veri kurma:** akışın kendisi test ediliyorsa arayüzden; testin konusu değilse (örn. 200 görevli liste) OPFS'e `page.evaluate` ile dosya yazılarak.
- **Kararlılık:** sabit bekleme yok, Playwright'ın kendi beklemeleri; animasyonlar test bağlamında kapalı (gizli panelde donan `.mb-page.enter`/`.mb-sheet` sorunu için).
- **Komut:** kökte `pnpm e2e` (hepsi), `pnpm e2e --project=phone`, `pnpm e2e tests/c-tasks.spec.ts`. Rapor `e2e/report/` (git'e girmez).
- **Ajan testleri (K):** sunucunun `/mcp` kapısına test içinden MCP istemcisiyle bağlanıp araç çağırmak, sonra arayüzde sonucu görmek.

## 8. Dilimler

Her dilim bir alan grubunu hem tarar hem teste bağlar: önce kullanıcı gibi kullanırım, bulduğum hataları düzeltirim, sonra çalışan akışı testle kilitlerim. Dilim sonunda sana UI/UX bulguları ve özellik önerileri gelir.

1. **Altyapı:** `e2e/` paketi, iki sunucu, fixture'lar, ilk duman testi (aç, not yaz, yenile, not duruyor) iki boyutta.
2. **Tek kişi, çekirdek:** A, B, C, G, L.
3. **Tek kişi, yapılar:** D, E, F.
4. **Birlikte çalışma:** H, I, J, K (iki bağlam, yerel sunucu).
5. **Telefon:** M ve önceki akışların telefon projesinde koşması.
6. **Toplu rapor:** `design/e2e-findings.md` son hali, özellik önerileri listesi.

Takip: Roadmap'te bir faz ("E2E ve UX taraması"), her dilim bir kart; hata düzeltmeleri dilimin kartında, onaylanan UI/UX düzeltmeleri ve özellikler ayrı kart.
