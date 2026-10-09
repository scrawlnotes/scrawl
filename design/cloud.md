# Bulut bağlantısı: tasarım

Faz 5'in ikinci adımı: kişisel space'in, kullanıcının kendi bulut hesabındaki bir klasörle eşitlenmesi. Önce masaüstünde OneDrive; Google Drive aynı çerçeveye space'lerden sonra, 10. aşamada eklenir (10. bölüm). Sync motoru hazırdır (`design/sync.md`); bu adım ona bir uzak depo, bir giriş ve bir yüz verir. Birden çok space 9. aşamadadır.

## 1. Parçalar

| Parça | Nerede | Ne yapar |
|---|---|---|
| Giriş | `apps/web` (akış) + Rust (dinleyici, token isteği, anahtar deposu) | Hesaba izin aldırır, anahtarları saklar ve yeniler |
| OneDrive adaptörü | `packages/core/src/sync/onedrive.ts` | Motorun `RemoteStore` arayüzünü Microsoft Graph ile doldurur |
| Google Drive adaptörü | `packages/core/src/sync/gdrive.ts` | Aynı arayüzü Drive API ile doldurur (10. bölüm) |
| Sync servisi | `apps/web` | Motoru doğru anlarda çalıştırır, uygulamayı tazeler, durumu gösterir |
| Arayüz | Settings → Spaces, durum çubuğu | Bağlanma, klasör seçme, durum, cihaz adı |

Adaptör çekirdektedir ve yalnızca `fetch` ile bir `token()` alır; böylece web sürümü (6. aşama) aynı adaptörü kullanır ve testlerde Graph sahte bir `fetch` ile taklit edilir.

## 2. Giriş (masaüstü)

- **Akış:** OAuth 2.0 yetki kodu + PKCE, uygulama kaydındaki "Mobile and desktop applications" platformu, istemci gizli anahtarı yok. Yetki adresi `https://login.microsoftonline.com/common/oauth2/v2.0/authorize`; izinler `Files.ReadWrite offline_access User.Read`.
- **Sistem tarayıcısı ve geri dönüş:** Rust, bilgisayarın kendi içinde (`127.0.0.1`) rastgele bir portta tek seferlik bir dinleyici açar; geri dönüş adresi `http://localhost:<port>`'tur (Entra, kayıtta portsuz yazılan `http://localhost` için her porta izin verir). Tarayıcıda giriş bitince dinleyici kodu alır, sayfaya "Scrawl'a dönebilirsin" yazar ve kapanır. `state` değeri karşılaştırılır; tutmazsa giriş reddedilir. Dinleyici 5 dakika sonra kendiliğinden kapanır.
- **Token isteği Rust'tan yapılır.** Entra, masaüstü istemcisine ait bir kodun bir web sayfasından (`Origin` başlığıyla) takas edilmesini reddeder; web görünümü her isteğe `Origin` koyar. Kodun takası ve anahtarın yenilenmesi bu yüzden Rust'ta, `Origin` olmadan yapılır. Graph'a yapılan dosya istekleri ise web tarafından gider (Graph buna izin verir).
- **Saklama:** Uzun ömürlü yenileme anahtarı Windows Kimlik Bilgisi Yöneticisi'nde durur (`keyring` crate'i; macOS'ta Keychain). Kısa ömürlü erişim anahtarı yalnızca bellekte tutulur, süresi dolunca ya da Graph 401 dönünce yenilenir. Diskte, vault'ta ya da ayar dosyasında hiçbir anahtar durmaz.
- **İstemci kimliği:** Varsayılan Scrawl kaydının kimliği koddadır (gizli değildir). Kendi kaydını kullanmak isteyen, bağlanmadan önce Settings'te kendi kimliğini girebilir (11. bölüm).
- **Rust komutları** sağlayıcıdan bağımsızdır, Google da aynılarını kullanır: `oauth_listen` (dinleyiciyi açar, portu döner), `oauth_wait` (kodu ve `state`'i bekler), `token_request` (bir token adresine form gönderir), `secret_get` / `secret_set` / `secret_delete`.

## 3. Bağlantının ayarı

Hangi sağlayıcının, hangi hesabın, hangi klasörün bağlı olduğu cihazdadır (PLAN 5.3: space listesi cihazdadır), vault'ta değil: `{ provider: 'onedrive', account: { name, email }, folder: { id, path } }`. Cihaz kimliği (rastgele) ve cihaz adı da cihazdadır. Cihaz adı varsayılan olarak bilgisayarın adıdır; Settings'te değiştirilir ve çakışma kopyalarının adına girer.

**Bağlantıyı kesmek:** anahtar anahtar deposundan silinir, bağlantı ayarı ve sync durumu (`.scrawl/sync-state.json`, `.scrawl/sync-base/`, adaptörün eşlemesi) kaldırılır. Yereldeki notlara ve buluttaki dosyalara dokunulmaz.

## 4. Klasör seçimi

Giriş bitince "Choose a folder in OneDrive" penceresi açılır: OneDrive'ın klasörleri, içine girilerek gezilir; "New folder" ile klasör açılır; "Use this folder" seçer. Başlangıçta önerilen yer kökte `Scrawl` klasörüdür (yoksa oluşturmak bir tıktır).

- Seçilen klasör boşsa notlar oraya yüklenir.
- Burası boşsa (yeni cihaz) klasördekiler iner.
- İkisi de doluysa motorun ilk eşitleme kuralları uygulanır: aynı olanlar bağlanır, farklı olanlar birleşir, hiçbir şey kaybolmaz. Pencerede bu bir cümleyle söylenir: "Notes already in that folder and here are put together."

## 5. OneDrive adaptörü

- **Değişiklik listesi:** seçilen klasörün `delta`'sı (`/me/drive/items/{id}/delta`); sayfalar `@odata.nextLink` ile sonuna kadar okunur, imleç `@odata.deltaLink`'tir. Kişisel OneDrive klasör düzeyinde delta verir; iş hesabında bu reddedilirse kökün delta'sı okunup klasörün altındakiler süzülür. `410 Gone` gelirse (imleç çok eskidi) liste baştan okunur ve motora tam liste olarak verilir; motor bunu zaten bir ilk eşitleme gibi karşılar.
- **Kimlikten yola:** delta yolları vermez ve bir klasörün adı değişince içindekiler listede görünmez; öğeler kimlikleriyle izlenmelidir. Adaptör `{ kimlik → ad, üst kimlik, tür, cTag, eTag, boyut, özet }` eşlemesini cihaza özel `.scrawl/onedrive.json` dosyasında tutar (motorun eşitlemediği yollara eklenir) ve yolları üst klasörlere çıkarak kurar. Adı ya da yeri değişen bir klasörün altındaki her dosya için motora "eski yol gitti, yeni yolda aynı etiketli dosya var" denir; motor bunu taşıma olarak görür, hiçbir şey yeniden inmez.
- **Etiket ve özet:** etiket `cTag`'dir (yalnızca içerik değişince değişir). Özet `quickXorHash`'tir; iki hesap türünde de garanti olan tek özet budur. Adaptör `hashOf`'u QuickXorHash'i TypeScript'te hesaplayarak sağlar, böylece aynı olan dosyalar indirilmeden bağlanır.
- **Okuma:** öğenin `@microsoft.graph.downloadUrl`'i alınır ve o adresten okunur. `/content` bir yönlendirme döner; yönlendirmeyi yetki başlığıyla izlemek web görünümünde engellenir.
- **Yazma:** 10 MiB'a kadar tek istek (`PUT …:/content`); var olan dosyada `If-Match: <cTag>`, yeni dosyada `@microsoft.graph.conflictBehavior=fail`. Daha büyük dosyalar yükleme oturumuyla, 5 MiB'lık parçalarla (320 KiB'ın katı) gönderilir; kesilen oturum kaldığı yerden sürer. Yola yazmak eksik üst klasörleri kendisi açar. `412` ve `409` motora `RemoteConflict` olarak döner.
- **Taşıma, silme, klasör:** `PATCH` (yeni üst klasör ve ad, `If-Match` ile), `DELETE` (`If-Match` ile), klasör için `POST children` (`409` "zaten var" sayılır).
- **Adlar:** OneDrive'ın kabul etmediği adlar (`" * : < > ? / \ |`, sonda nokta ya da boşluk, `CON` gibi ayrılmış adlar) eşitlenmez ve durumda "OneDrive bu adı kabul etmiyor" diye gösterilir; ad sessizce değiştirilmez. Uygulamanın kendi verdiği adlar bu kurallara zaten uyar.
- **Yük ve hata:** `429` ve `503`'te `Retry-After` kadar beklenip yeniden denenir. Bağlantı yoksa tur sessizce biter, durum "Offline" olur, bir sonraki tetikte yeniden denenir.

## 6. Sync servisi (motorun uygulamaya bağlanması)

- **Ne zaman:** açılışta, bir kayıttan 5 saniye sonra, açıkken 30 saniyede bir, pencereye dönülünce, "Sync now" ile. Aynı anda tek tur; tur sürerken gelen tetik, tur bitince bir tur daha yaptırır.
- **Önce:** editörde kaydedilmemiş yazı kaydedilir.
- **Tur sırasında yazılan:** motor bir yerel dosyaya indirme ya da birleştirme yazmadan hemen önce dosyanın, turun başında okuduğu halinde olduğuna bakar; kullanıcı tur sürerken yazıp kaydettiyse o dosya bu turda bırakılır, sonraki turda ele alınır. (Motora eklenecek küçük bir koruma.)
- **Sonra:** bir şey indiyse, birleştiyse, taşındıysa ya da silindiyse uygulama bugünkü "dışarıda değişti" yoluyla tazelenir: ağaç, listeler, panolar ve açık notlar diskten okunur.
- **Masaüstünün dosya listesi** dosyaların yazılma zamanını verecek şekilde genişletilir (Rust); motor her turda dosyaları okumak zorunda kalmaz.
- **Kaydederken birleştirme (uygulamada eklendi):** motorun koruması, kullanıcının tur sırasında kaydettiği dosyanın üstüne yazmamayı sağlar; tersi de olabilir: motor bir notu indirdikten hemen sonra, kullanıcının o sırada yazdığı ama henüz kaydedilmemiş metin kaydedilir. Bu yüzden uygulama bir notu, görev listesini ya da panoyu kaydetmeden önce dosyanın, kendisinin en son okuduğu ya da yazdığı halinde olup olmadığına bakar. Değişmişse sync'in birleştirme kurallarıyla birleştirir (notta satır satır, listede ve panoda kayıt kayıt) ve sonucu ekrana da getirir. Aynı satır iki tarafta değişmişse yazılan kalır, dosyadaki sürüm geçmişe kaydedilir.
- **Taşınanın izlenmesi (uygulamada eklendi):** başka bir cihazda taşınan ya da adı değişen dosyanın açık sekmesi, düzenleme durumu ve geçmişi yeni yoluna gider. Çöpe taşınan ya da silinen dosyanın sekmesi kapanır.

## 7. Durum

- **Durum çubuğunda** sync'in hali ve yanında **Sync now** düğmesi durur; eşitlemek için ayarları açmak gerekmez.
  - Hal:
    - "Synced to OneDrive 12 s ago" (her birkaç saniyede güncellenir).
    - Tur sürerken "Syncing 38%": yüzde her zaman yanındadır, düğmenin oku döner (7a).
    - Bağlantı yokken "Offline".
    - Yenileme anahtarı geçersizse "Sign in to OneDrive again".
  - Sync now düğmesi hemen bir tur başlatır; tur sürüyorsa, bittikten sonra bir tur daha yaptırır.
  - Halin yazısı **sync panelini** açar (7a). Giriş gerekiyorsa ya da hata varsa panelden ve Settings → Spaces'ten çözülür.
  - Bağlı değilken durum çubuğunda sync'e ait hiçbir şey görünmez.
- **Çakışma kopyası** oluştuğunda durum çubuğunda kısa bir bildirim çıkar ("Conflict copy: Plan (conflict, Laptop, …)"); tıklanınca kopya açılır. Kopya ağaçta normal bir not olarak durur.
- Beklenmeyen bir hata olursa durum çubuğunda "Could not sync", Settings'te hatanın kendisi yazar; sonraki tetikte yeniden denenir.
- Eşitlenemeyen dosyalar sync panelinin **Not synced** sekmesinde, nedenleri ve yapılacak şeyle birlikte durur. Settings → Spaces'te bağlantının altında yalnızca sayıları yazar ("2 files not synced").

## 7a. Sync paneli (taslak: `design/mockups.html`, Sync panel, Sync done, Sync phone)

Bir turun ne yaptığını, ne yapamadığını ve ne kadarının kaldığını gösterir. Bir space binlerce dosya tutabilir; panel buna göre kuruludur.

- **Açılışı:**
  - Bilgisayarda, durum çubuğundaki sync yazısının üstünde biraz durunca açılır. İmleç yazının ya da panelin üstünde kaldıkça açık kalır, ikisinden de çıkınca kapanır.
  - Tıklayınca sabitlenir: Escape'e, panelin dışına tıklayınca ya da yazıya yeniden tıklayınca kapanır.
  - Telefonda üstüne gelme yoktur: dokununca alttan bir sayfa olarak açılır. Tutamağı ve × düğmesi vardır; arkasına dokununca ya da aşağı çekince kapanır.
  - Uygulamayı kilitlemez: panel açıkken yazmaya devam edilebilir.
- **Tur sürerken:**
  - Başlık "Syncing with OneDrive" ve yüzde.
  - İnce bir ilerleme çubuğu.
  - Bir satır: "1,296 of 3,412 files · 41 MB of 108 MB · about 2 min left". Kalan süre, aktarım birkaç saniye sürdükten sonra hızdan hesaplanır.
  - Şu an giden ya da gelen dosya, büyükse kendi çubuğu ve baytlarıyla ("site-visit.mp4 · 23 of 51 MB").
- **Tur bitince:** başlık "Synced to OneDrive · 12 s ago". Altında son turun özeti yazar: "3 sent, 2 brought, 1 merged, 1 moved, 1 conflict copy".
- **Sekmeler:**
  - Tur sürerken **Waiting · Done · Not synced**, tur bitince **Done · Not synced**. Hepsinin sayısı yanında yazar.
  - "Not synced"te bir şey varsa sayısı vurgulu renkte durur.
  - Açılınca gelen sekme: tur sürerken Waiting; tur bitince, eşitlenemeyen varsa Not synced, yoksa Done.
  - Hepsini bir arada gösteren bir sekme yoktur; binlerce satırda gürültü olurdu.
- **Satırlar:**
  - Her satırda yönün simgesi (gönderildi ↑, getirildi ↓, birleşti, taşındı, çöpe gitti, çakışma kopyası), dosyanın adı, soluk renkte klasörü ve sağda boyutu ya da sonucu ("sent", "from Phone notes").
  - Waiting, dosyaları gidecekleri sırayla gösterir.
  - Not synced satırında neden yazar:
    - "OneDrive does not take “:” or “?” in a name. It stays on this device until it is renamed."
    - "Changed here while it was being synced; it goes with the next turn."
    - Bağlantı koptuysa "Stopped: OneDrive cannot be reached"; kalanlar Waiting'de kalır.
  - Panel yalnızca bilgi verir: satırlardan bir şey yapılmaz, arama alanı yoktur. Altta yalnızca "Sync settings" ve "Sync now" durur.
- **Çok dosya:**
  - Liste yalnızca ekranda görünen satırları çizer (sabit satır yüksekliği); binlerce satır kaydırılarak gezilir.
  - Satırlar bellekte yalnızca sürmekte olan ve bir önceki tur için tutulur; geçmiş saklanmaz.
- **Yüzde (her zaman):**
  - Önce turun bakma kısmı gelir (değişiklik listesini okumak, buradaki dosyalara bakmak, karşılaştırmak) ve %0'dan %10'a kadar sayılır. Toplam belli olmadan önce "Syncing 0%" ve "Reading the list of changes… 1,400 files so far" yazar.
  - Aktarım %10'dan %100'e kadar baytla sayılır. Her dosya en az 64 KB sayılır; böylece yüzlerce küçük not da çubuğu ilerletir, tek bir büyük video da onu dondurmaz. Taşıma ve silme küçük birer iş sayılır.
  - Tur bitmeden %100 görünmez. Bitince "Synced" yazar. Bir saniyeden kısa süren bir tur kısa bir "Syncing 0%…" gösterir.
- **Altta:**
  - Tur sürerken "Started 1 min ago" ve "Sync settings".
  - Tur bitince ne zaman eşitlendiğini anlatan kısa bir cümle, "Sync settings" ve "Sync now".
  - Telefonda yalnızca düğmeler, tam genişlikte.
- **Settings'teki Sync satırı** da tur sürerken "Syncing 38%" yazar.
- **Telefonda kullanım:** durum çubuğu dardır. Solda imleç yeri, ortada "Saved", sağda bulut simgesi, "Syncing 38%" ve Sync now durur. Satırlar dokunmaya uygun yükseklikte (34 px), sekmeler genişliği eşit paylaşır.

## 8. Arayüz (taslak: `design/mockups.html`, Settings görünümleri)

Settings → Spaces'te kişisel space'in kartına bir **Sync** satırı eklenir:
- **Bağlı değilken:** bir cümle ve "Connect OneDrive" düğmesi (Google Drive adımı gelince yanına "Connect Google Drive").
- **Bağlıyken:** sağlayıcı, hesap, klasörün yolu, son eşitleme zamanı, "Sync now" ve "Disconnect". (Sync now durum çubuğunda da vardır.)

Kartın altında **This device** bölümü: cihaz adı alanı ve Save. Klasör seçimi ayrı bir küçük penceredir (4. bölüm). Telefonda aynı şey Spaces sayfasında alt alta durur.

## 8a. Uygulamada netleşenler

- **Bağlantı bir klasöre aittir.** Bağlantının ayarı, açık notes klasörünün yoluyla birlikte saklanır. Masaüstünde başka bir klasör açılırsa o klasör bağlı görünmez; aynı OneDrive klasörü iki ayrı yerel klasörle istemeden karışmaz.
- **Bağlanmak temiz başlar.** Bir klasöre bağlanırken (yeniden bağlanırken de) önceki sync durumu silinir ve ilk eşitleme kuralları uygulanır. Aynı dosyalar özetten tanınır, hiçbiri yeniden yüklenmez.
- **Anahtar deposu:** Windows bir kimlik bilgisinde en fazla 2560 bayt tutar, Microsoft'un yenileme anahtarı bundan uzun olabilir. Anahtar parçalara bölünerek saklanır, parçaların sayısı kendi adı altında durur.
- **Büyük dosyanın yarıda kesilmesi:** bir parça yolda kaybolursa yükleme oturumuna nerede kaldığı sorulur ve oradan sürer. Uygulama kapanırsa sonraki tur dosyayı baştan yükler; oturumlar cihazda saklanmaz.
- **Tarayıcıda:** web sürümünde sync 6. aşamadadır, Settings'te Sync satırı görünmez. Geliştirirken tarayıcı, gerçek adaptör ve gerçek ekranlarla, Graph'ın bellekteki bir taklidine (`FakeGraph`) bağlanır. Sayfa yenilenince her şeyi unutur ve üretim paketine girmez.
- **Motor:** sağlayıcı "her şeyi yeniden listeledim" diyebilir (`full`); listede olmayan gitmiş sayılır. Sağlayıcının kabul etmediği adlar raporda `refused` olarak döner. Listelenip okunmadan önce uzakta silinen dosya turu durdurmaz. Başka cihazda taşınanlar `followed` olarak döner.

## 9. Güvenlik ve gizlilik

- Sunucumuz yoktur; uygulama yalnızca Microsoft'un giriş ve Graph adresleriyle konuşur.
- `Files.ReadWrite` bütün OneDrive'a erişim izni verir (paylaşılan klasörler 7. aşamada `Files.ReadWrite.All` ister). Uygulama yalnızca seçilen klasörde çalışır; izin ekranından önce Settings'te bu bir cümleyle söylenir.
- Anahtarlar yalnızca işletim sisteminin anahtar deposundadır; günlüklere ve hata mesajlarına yazılmaz.

## 10. Google Drive (10. aşama, space'lerden sonra)

Motor, sync servisi, durum ve panel aynıdır. Farklar girişte, adaptörde ve birkaç yazıdadır.

### 10.1 Erişim: `drive.file`

Google iki yol verir:
- **`drive.file`:** Scrawl yalnızca kendi açtığı dosya ve klasörleri görür; Google bunu hassas saymaz. Scrawl'ın kaydı, marka doğrulamasıyla yayına çıkar; güvenlik denetimi istenmez.
- **`drive`:** bütün Drive'a erişir. Google bunu "kısıtlı" sayar: yayına çıkmak için ayrı bir inceleme gerekir, o bitene kadar en fazla 100 kullanıcı girebilir ve giriş ekranında "doğrulanmamış uygulama" uyarısı çıkar.

Scrawl `drive.file` kullanır. Sonuçları:
- Scrawl'ın bir cihazda açtığı dosyayı aynı kayıtla giren her cihaz görür.
- Scrawl'ın açtığı bir dosya başka bir programda değiştirilirse (ör. Drive for desktop ile başka bir editörde) değişiklik görülür; dosya aynı dosyadır.
- **Klasöre Drive'ın sitesinden ya da başka bir programdan konan yeni dosyalar görülmez.** Klasör penceresi bunu bir cümleyle söyler (10.5).
- Klasör seçerken yalnızca Scrawl'ın açtığı klasörler listelenir. İlk cihaz kökte `Scrawl` klasörünü açar, sonrakiler onu orada bulur.

Bütün Drive'a erişim istenirse sonra "kendi kaydını kullan" yolunun arkasına konabilir; ilk sürümde yoktur.

**Paylaşılan space'te durum belirsizdir.** `drive.file` erişimi kişiye bağlıdır: A'nın Scrawl'ının açtığı dosyayı B'nin Scrawl'ı kendiliğinden görmez, B'nin onu Scrawl'la açmış olması gerekir. Google bunun için Picker'ı verir; masaüstünde girişle birlikte tarayıcıda açılır, seçilenlerin kimlikleri geri döner. Klasör seçilince içindekilere ve A'nın sonradan eklediklerine erişim gelip gelmediği belgelerde yazmaz. Uygulamadan önce iki hesapla denenir: A bir klasör paylaşır, B Picker'la seçer, A sonra bir dosya ekler, B onu görür mü. Görmüyorsa paylaşılan space için `drive` erişimi ek izin olarak istenir; Google sonradan ek izin istemeye izin verir, ama kısıtlı izin olduğundan Google'ın incelemesi gerekir.

### 10.2 Giriş

- Aynı akış ve aynı Rust komutları (2. bölüm): yetki kodu + PKCE (S256), sistem tarayıcısı, bilgisayarın kendi içinde dinleyici.
- Yetki adresi `https://accounts.google.com/o/oauth2/v2/auth`, token adresi `https://oauth2.googleapis.com/token`, kapsam `https://www.googleapis.com/auth/drive.file`.
- Geri dönüş adresi `http://127.0.0.1:<port>`; Google `localhost` yerine bunu önerir.
- Kalıcı anahtar için `access_type=offline` ve `prompt=consent` istenir; Google yenileme anahtarını yalnızca ilk onayda verir, bu yüzden her girişte onay sorulur.
- Google'ın "Desktop app" kayıtlarına verdiği istemci gizli anahtarı gizli değildir (Google da öyle sayar). Belgelerde isteğe bağlıdır; Google isterse kimlikle birlikte koda girer. Bu, uygulanırken denenir.
- Yenileme anahtarı Kimlik Bilgisi Yöneticisi'nde `google` adıyla durur; erişim anahtarı yalnızca bellektedir.
- Hesabın adı ve e-postası Drive'ın `about` adresinden alınır; ayrıca izin istenmez.
- **Kayıt deneme aşamasındayken** (Google'da "Testing") yenileme anahtarı 7 günde biter, her hafta yeniden giriş gerekir. Kayıt yayına alınınca bu kalkar (10.7).

### 10.3 Adaptör (`packages/core/src/sync/gdrive.ts`)

- **Kimlikle izleme:** Drive de yol vermez, öğeleri kimlikle tanır. OneDrive'daki gibi `{ kimlik → ad, üst kimlik, tür, etiket, boyut, özet, oluşma zamanı }` eşlemesi cihaza özel `.scrawl/gdrive.json` dosyasında tutulur, yollar üst klasörlere çıkılarak kurulur. Adı ya da yeri değişen klasörün altındakiler motora taşıma olarak bildirilir.
- **İlk listeleme:** Drive'ın değişiklik listesi geçmişi vermez, yalnızca bir andan sonrasını verir. Önce o anın imleci alınır (`changes.getStartPageToken`), sonra klasör ağacı `files.list` ile sayfa sayfa gezilir. İmleç gezintiden önce alındığı için gezinti sırasında değişen bir şey kaçmaz.
- **Sonraki listelemeler:** `changes.list` ile imleçten bu yana değişenler okunur. Liste bütün Drive içindir (`drive.file` ile yalnızca Scrawl'ın dosyaları); klasörün altında olmayanlar üst kimliklerden ayıklanır. Yeni imleç `newStartPageToken`'dır. İmleç geçersizse ağaç baştan gezilir ve motora tam liste verilir.
- **Gidenler:** çöpe atılan (`trashed`) ya da silinen (`removed`) öğe gitmiş sayılır.
- **Etiket ve özet:** etiket `headRevisionId`'dir; yalnızca içerik değişince değişir, ad değişince değişmez. Özet `md5Checksum`'dır. Tarayıcının şifreleme arayüzü MD5 vermez; `hashOf` için MD5 TypeScript'te yazılır (QuickXorHash gibi küçük bir modül). Aynı olan dosyalar böylece indirilmeden bağlanır.
- **Space'e girmeyenler:** Google Dokümanlar, E-Tablolar gibi Drive'a özgü dosyaların indirilecek içeriği yoktur; kısayollar da dosya değildir. İkisi de atlanır (OneDrive'daki OneNote gibi).
- **Aynı adlı iki dosya:** Drive aynı klasörde aynı adlı (ya da yalnızca büyük-küçük harfi farklı) iki dosyaya izin verir; bilgisayar buna izin vermez. Önce oluşan dosya yolu alır, öbürü eşitlenmez ve panelin Not synced sekmesinde yazar: "Google Drive has two files called “Plan.md” here. The older one is synced." Adında `/` olan bir Drive dosyası da yola çevrilemez, aynı yerde yazar. Bunun için motor, uzaktan gelen eşitlenmeyen yolları da Not synced'e alacak şekilde biraz genişler.
- **Koşullu yazma yoktur.** Drive v3 `If-Match` almaz. Var olan dosyanın üstüne yazmadan, taşımadan ya da silmeden hemen önce `headRevisionId`'ine bakılır; motorun bildiğinden farklıysa `RemoteConflict` olur. Yeni dosyada önce klasörde o adla dosya var mı diye bakılır. Bakmayla yazma arasında kısa bir aralık kalır; o aralıkta başka cihaz yazarsa üstüne yazılan sürüm kaybolmaz, Drive onu dosyanın sürüm geçmişinde tutar.
- **Okuma:** `files/{id}?alt=media`, yetki başlığıyla. Yönlendirme yoktur.
- **Yazma:** 5 MiB'a kadar tek istek (yeni dosyada ad ve üst klasörle birlikte, var olanda yalnızca içerik). Daha büyükler yeniden başlatılabilir yükleme oturumuyla, 256 KiB'ın katı parçalarla gider; kesilen parça, oturuma nerede kaldığı sorularak oradan sürer. Drive yola yazmaz; eksik üst klasörler eşlemeden bulunur ya da açılır.
- **Taşıma:** `files.update` ile yeni ad ve `addParents`/`removeParents`.
- **Silme:** dosya ya da klasör Drive'ın çöpüne atılır, kalıcı silinmez (OneDrive'da da silinen çöp kutusuna gider).
- **Adlar:** Drive Scrawl'ın verdiği her adı alır; `accepts` yalnızca çok uzun yolları geri çevirir.
- **Yük ve hata:** `429`, `403` (`rateLimitExceeded`, `userRateLimitExceeded`) ve `5xx`'te bekleyip yeniden denenir. `401`'de bir kez yeni anahtar alınır, yine olmazsa "Sign in again". Klasör `404` ya da çöpteyse "The Google Drive folder is gone". OneDrive'daki istek döngüsü (anahtar, yeniden deneme, bekleme) iki adaptörün ortak parçası olur.

### 10.4 Bağlantı ve sync servisi

- Bağlantının ayarı aynıdır, yalnız `provider` `'onedrive'` ya da `'gdrive'` olur. Sync servisi bulutu bağlantının sağlayıcısına göre seçer.
- Bağlantıyı kesmek `.scrawl/gdrive.json`'u da siler.
- `.scrawl/gdrive.json` motorun eşitlemediği yollara eklenir.
- Masaüstünde vault, Drive for desktop'ın eşitlediği bir klasördeyse çift eşitleme uyarısı (sync.md) Google Drive için de gösterilir.

### 10.5 Arayüz

- Settings → Spaces'te, bağlı değilken "Connect OneDrive"ın yanında "Connect Google Drive" durur. Altındaki cümle sağlayıcıya göre değişir: "Scrawl works only in the folder you choose, and sees only the files it puts there."
- Klasör penceresi: "Choose a folder in Google Drive". Yalnızca Scrawl'ın açtığı klasörler listelenir, kökte `Scrawl` önerilir. Altta bir cümle: "Files put in this folder from elsewhere are not seen by Scrawl."
- OneDrive'ın adını taşıyan yazılar (durum çubuğu, panel, giriş sayfası, hatalar) sağlayıcının adını alır.
- Ekran değişiklikleri küçüktür; onaydan sonra `design/mockups.html`'deki Settings ve klasör penceresi görünümlerine Google Drive hâlleri eklenir.

### 10.6 Tarayıcıda (6. aşama)

Adaptör çekirdektedir, web sürümü de onu kullanır. `drive.file` erişimi kayda bağlı olduğundan web'in kaydı masaüstününkiyle aynı Google Cloud projesinde olmalıdır; masaüstünde açılan dosyaları web'in gördüğü o aşamada denenir. Geliştirirken tarayıcı, OneDrive'daki gibi, Drive'ın bellekteki bir taklidine (`FakeDrive`) bağlanır.

### 10.7 Hazırlık (Scrawl'ın Google kaydı)

1. Google Cloud'da bir proje, içinde Drive API açık.
2. OAuth onay ekranı: dış kullanıcılar, kapsam yalnızca `drive.file`.
3. "Desktop app" türünde bir OAuth istemcisi. Kimliği (ve gizli olmayan gizli anahtarı) OneDrive'ınki gibi koda girer.
4. Kayıt yayına alınır. `drive.file` için yalnızca marka doğrulaması gerekir; yayına alınana kadar giriş haftada bir yenilenir.

Adaptör ve ekranlar bu kayıt olmadan, taklit Drive'la yazılıp sınanır.

### 10.8 Sınanması

- **Adaptör,** sahte bir Drive (`fetch` taklidi) ile sınanır: ağacın gezilmesi ve imleç, değişiklik sayfaları, geçersiz imleçle baştan okuma, kimlikten yol kurma, adı değişen klasörün taşıma olarak bildirilmesi, çöp ve silinme, Drive'a özgü dosyaların atlanması, aynı adlı iki dosya, sürüme bakarak yazmada `RemoteConflict`, parça parça yükleme ve kesilip sürme, MD5'in bilinen örneklerle doğruluğu.
- **Giriş ve gerçek Drive** kayıt hazır olunca elle denenir: bağlanma, ilk eşitleme, iki cihaz, kesip yeniden bağlanma.

## 11. Sınanması

- **Adaptör,** sahte bir Graph (`fetch` taklidi) ile sınanır:
  - delta sayfaları ve imleç;
  - kimlikten yol kurma;
  - adı değişen klasörün taşıma olarak bildirilmesi;
  - `410` ile baştan okuma;
  - `412`/`409`'un `RemoteConflict` olması;
  - büyük dosyanın parça parça yüklenmesi;
  - QuickXorHash'in bilinen örneklerle doğruluğu.
- **Motorun yeni koruması** ("tur sırasında değişen dosyanın üstüne yazılmaz") motor testlerine bir senaryo olarak eklenir.
- **Giriş ve gerçek OneDrive** kullanıcının hesabıyla elle denenir: bağlanma, ilk eşitleme, iki cihaz, kesip yeniden bağlanma.
- **Kendi istemci kimliğini girme alanı** Settings'te bağlanmadan önce gösterilen küçük bir "Use your own app registration" bağlantısının arkasındadır; varsayılan kayıt çoğu kullanıcı için yeterlidir.
