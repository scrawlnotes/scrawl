# Dış entegrasyonlar (taslak)

Durum: 29 Ekim 2026, onaylı. 13. bölümdeki kararlar onaylandı; 14. bölümdekilerin hepsi sonraya.

## 1. Kapsam

### 1.1 Ne için

Ajan (ya da kişi) bir dış servise bağlanan kodu yazar, Scrawl onu güvenli bir yerde çalıştırır. Kod servisten veri alır, koleksiyonlara, panolara ve görev listelerine yazar; space'te değişeni servise geri gönderir.

Çözdüğü örnekler:

- **TMDB:** Reading and watching'de film ya da dizi eklenince yılı, afişi, süresi, sezon ve bölüm sayısı dolar. İzlenen dizinin yeni bölüm günü kendiliğinden tazelenir.
- **Pazaryeri (Trendyol, Hepsiburada, Amazon):** siparişler Orders'a kendiliğinden gelir, pazaryeri sipariş no'suyla eşleşir, aynı sipariş iki kez girmez. Sipariş Shipped olunca kargo firması ve takip no pazaryerine yazılır. İadeler ve hakedişler okunur.
- **Kargo (Yurtiçi, Aras, MNG):** gönderi açılır, takip no ve etiket gelir, teslim durumu güncellenir.
- Aynı altyapıyla teknoloji tarafı: Stripe'tan ödemeler Payments'a, GitHub issue'ları panoya.

### 1.2 Ne yapmaz

- **Eklenti sistemi değildir** (PLAN 2 bunu dışarıda tutar). Arayüze ekran ya da davranış eklemez. Yalnız veri getirir ve götürür; kişiye bir düğme, bir durum satırı ve kendi ekranını gösterir.
- **Uygulama içi asistan değildir.** Kodu dışarıdaki ajan ya da kişi yazar.
- **Bizde çalışan hiçbir şey yoktur.** Proxy, OAuth aracısı, hazır bağlantı servisi yok.
- **Kural dili değişmez.** `_rules.js` ağa yine erişmez, senkron kalır.
- **Kimse yokken çalışan iş yalnız sunucudadır** (PLAN 2). Zamanlanmış koşu sunucuda olur. Uygulamada entegrasyon ancak biri bir şey yapınca çalışır: düğmeye basınca, kayıt yazınca, app'i açınca.

### 1.3 Neden bugünkü parçalar yetmiyor

- Kural dili ağa erişemez. Senkrondur; bekleme, sayfalama, `try/catch`, XML ve imza hesabı yoktur. Bunları eklemek kendi JS motorumuzu yazmak olur.
- İçe aktarma elle yapılır, tekrar eden işe uymaz.
- Ajan kişi istemeden çalışmaz, Keys dosyasını da göremez. Her seferinde ajana "siparişleri çek" demek iş değildir.

## 2. Kullanıcı ne görür

Akış (TMDB):

1. Kişi ajana "Library'deki filmleri TMDB'den doldur" der.
2. Ajan app klasörüne `TMDB.integration.js` yazar. Araç dosyayı denetler, yanlışı satırıyla söyler. Ajan deneme koşusu yapar: hangi istekler gitti, ne yazılacaktı görür; hiçbir şey yazılmaz.
3. Kenar çubuğunda ve app'in menüsünde **TMDB** görünür. Ekranında:
   - durum: Needs a key, Ready, Paused (kodun adresi ya da anahtarı değişti, Allow bekliyor), Failing;
   - rehber: ajanın yazdığı kısa adımlar ("themoviedb.org › Settings › API › API Read Access Token'ı kopyala") ve anahtar kutusu. Girilen değer app klasörünün Keys dosyasına yazılır, ajan onu göremez;
   - OAuth isteyen serviste Connect;
   - ne zaman çalıştığı (düğme, kaydedince, açılınca, her gün) ve Run now;
   - son koşular: ne zaman, nerede (bu cihaz, sunucu), ne yazdı, hata;
   - Code sekmesi: dosya, JS renklendirmesiyle.
4. Bundan sonra Library'ye film eklenince bilgileri gelir. Kayıtta "Refresh from TMDB" düğmesi durur. App açılınca, son tazelemeden 6 saat geçtiyse dizilerin yeni bölüm günleri tazelenir.
5. Hata sessiz kalmaz: kaydın üstünde "Couldn't reach TMDB · Retry", entegrasyon ekranında sebebi.

Ekranlar için önce mockup çizilir (bu belge onaylanınca).

## 3. Entegrasyon dosyası

App klasöründe `<Ad>.integration.js`. Gerçek bir JS modülüdür; varsayılan dışa aktarımı entegrasyonu tanımlar, gerisi onun fonksiyonlarıdır.

```js
// Library/TMDB.integration.js (alan adları örnek)
export default {
  name: "TMDB",
  hosts: ["api.themoviedb.org"],
  keys: { TMDB_TOKEN: "themoviedb.org › Settings › API › API Read Access Token" },
  auth: { bearer: "TMDB_TOKEN" },
  on: [
    { save: "Library", when: (r, old) => r.kind === "Film" && r.name !== old?.name, run: details },
    { button: "Library", label: "Refresh from TMDB", run: details },
    { open: "Library", every: "6h", run: nextEpisodes },
    { schedule: "1d", run: nextEpisodes },
  ],
};

async function details(s, film) {
  const found = await s.get("https://api.themoviedb.org/3/search/movie", { query: { query: film.name } });
  const m = found.json.results[0];
  if (!m) return s.say(`${film.name} is not on TMDB`);
  s.update(film, { year: m.release_date?.slice(0, 4), tmdb: m.id, poster: `https://image.tmdb.org/t/p/w342${m.poster_path}` });
}

async function nextEpisodes(s) {
  for (const show of s.records("Library").where((r) => r.kind === "Series" && r.status === "Watching" && r.tmdb)) {
    const tv = (await s.get(`https://api.themoviedb.org/3/tv/${show.tmdb}`)).json;
    s.update(show, { next_episode: tv.next_episode_to_air?.air_date ?? null });
  }
}
```

- `hosts`: kodun gidebileceği adresler. Yalnız `https`. Başka adrese istek hata verir.
- `keys`: kodun kullandığı anahtarlar ve her birinin nereden alındığı. Ekrandaki rehber buradan çizilir.
- `auth`: servisin kimlik doğrulaması (5. bölüm).
- `on`: ne zaman çalıştığı (6. bölüm).
- `browser: false` (isteğe bağlı): servis tarayıcıdan çağrılamıyor. Sunucusuz space'te web ve telefonda düğme soluk durur, basınca nedeni söylenir.

### 3.1 Kodun eli altındakiler (`s`)

| Ne | Nasıl |
|---|---|
| İstek | `s.get / post / put / patch / delete(url, { query, headers, json, form, body })` → `{ status, headers, text, json, bytes }`. Kimlik doğrulama eklenir; 429 ve 503'te `Retry-After`'a uyup üç kez yeniden dener. 4xx ve 5xx hata fırlatır, `{ ok: false }` ile istenirse fırlatmaz |
| Anahtar | `s.key("NAME")`: yalnız `keys`'te yazılı olanlar. Özel imza ya da giriş isteği için |
| Durum | `s.state`: koşudan koşuya kalan küçük JSON (son çekilen sipariş zamanı gibi). Koşu başarıyla biterse yazılır |
| Önbellek | `s.cache`: yalnız bellekte, cihazda ya da sunucuda (servisin giriş token'ı gibi) |
| Kayıt | `s.records("Orders")` → `.find({ marketplace_no })`, `.where(fn)`, `.add(values)`, `.update(record, values)`, `.upsert({ marketplace_no }, values)` |
| Kart, görev | `s.card(board, …)`, `s.move(card, column)`, `s.task(list, …)`: kural dilindekilerin aynısı |
| Ek | `s.attach(record, "label.pdf", bytes)`: kargo etiketi gibi |
| Yardımcılar | `s.xml.parse / build`, `s.csv`, `s.base64`, `s.hmac(alg, key, data)`, `s.sha256`, `s.today()` |
| Söz | `s.say(text)`: koşunun sonunda toast ve ekrandaki satır |

Yazılanlar düğmelerdeki gibi toplanır ve koşu bitince birden yazılır (`run.ts` değişiklik listesi). Yarıda düşen koşu hiçbir şey yazmaz, `s.state` de ilerlemez; sonraki koşu kaldığı yerden dener. Hedef koleksiyonun varsayılan değerleri ve `onSave`'i, ajanın `save_record`'undaki gibi uygulanır.

`upsert` yeni kaydın dosya adını anahtardan türetir (`TMDB` + `tmdb: 603` → hep aynı kısa id). İki cihaz aynı siparişi aynı anda çekerse aynı dosyayı yazar, sync onu tek kayıt olarak birleştirir; çift kayıt olmaz.

## 4. Nerede çalışır

| | Sunucusuz space | Sunucudaki space |
|---|---|---|
| Masaüstü | Bu cihazda; istek Rust'tan gider, CORS yok | Sunucuda |
| Web, telefon | Bu cihazda; istek tarayıcının `fetch`'i. Yalnız tarayıcıya açık servisler çalışır (TMDB, GitHub, Google, Stripe'ın bir kısmı) | Sunucuda |
| Zamanlanmış koşu | Yok | Sunucuda |

Neden sunucudaki space'te hep sunucu:

- Anahtar ve token tek yerde kullanılır.
- Telefon uzun sayfalamayı yarıda bırakmaz.
- Zamanlanmış koşuyla aynı yol.
- Aynı iş iki cihazda çalışmaz.

Kod her yerde aynı motorla çalışır (8. bölüm). Değişen yalnız isteği taşıyan katmandır.

**İstisna:** sunucusuz bir space'te tarayıcıya kapalı bir servis (Trendyol, Hepsiburada, Amazon, kargo firmalarının çoğu) web ve telefonda çalışmaz; masaüstünde ve sunucuda çalışır. Bizim proxy'miz olmadığı için başka yol yok. Bu, entegrasyon kuralının (PLAN 3) bir istisnasıdır, mesajlaşmanın yalnız sunucuda olması gibi. Karar 3.

## 5. Kimlik doğrulama

Yaygın yollar dosyada yazılır, değeri kod görmez; çalışma zamanı her isteğe ekler:

| `auth` | Örnek servis |
|---|---|
| yok | açık API'ler |
| `{ bearer: "TOKEN" }` | TMDB, GitHub, Shopify'ın özel app'i |
| `{ basic: ["USER", "PASS"] }` | Trendyol, Hepsiburada |
| `{ headers: { "x-api-key": "{KEY}" } }` | header'da anahtar ya da başka bir şey; Trendyol'un `User-Agent: {SELLER_ID} - SelfIntegration`'ı gibi |
| `{ query: { api_key: "{KEY}" } }` | adreste anahtar |
| `{ oauth2: { token, refresh: "REFRESH", client: ["ID", "SECRET"] } }` | Amazon SP-API: kişi refresh token'ı servisin kendi panelinden alır (kendi hesabına izin) |
| `{ oauth2: { token, client: [...] } }` | client credentials |
| `{ oauth2: { authorize, token, scopes, client: [...] } }` | yönlendirmeli giriş: ekranda Connect |

Birden fazlası birlikte yazılabilir (`basic` + `headers`). Hiçbirine uymayan (giriş isteğiyle token alan servis, SOAP gövdesinde kullanıcı adı ve şifre, HMAC imzası) kodda yapılır: `s.key`, `s.hmac`, token'ı `s.cache`'te tutarak.

OAuth:

- Access token yalnız bellektedir, süresi bitmeden yenilenir. Servis yeni bir refresh token verirse Keys dosyasına yazılır.
- Client id ve secret kişinin servise kendi kaydettiği uygulamanındır; rehber anlatır. Bizim kayıtlı uygulamamız yoktur.
- **Connect'in dönüşü:** sunucudaki space'te sunucunun `/integrations/callback` adresine (her istemciden çalışır). Sunucusuz masaüstünde bugünkü `oauth_listen` / `oauth_wait` ve Rust'taki `token_request` (izinli adreslere entegrasyonun token adresi eklenir). Sunucusuz web ve telefonda yalnız tarayıcıdan token alınmasına izin veren servislerde (PKCE, Google ve Microsoft gibi); diğerlerinde "Connect on the desktop app or a Scrawl server".

### 5.1 Anahtarların yeri

App klasöründeki Keys dosyası (`Keys.env`), entegrasyonun adıyla bir grupta (`# TMDB`). Yeni bir yer yok:

- Kişi görür ve düzenler; ajan göremez (bugün de kapalı).
- Sync ile space'teki herkese gider. Sunucu kendi kopyasından okur.
- Bugün düz metindir (PLAN 4.5, şifreleme sonra). Dosya ve klasör yetkisi (23. aşama) gelince sunucudaki space'te Keys dosyası yalnız Owner ve Admin'e açılabilir; sunucu yine okur.

Karar 4.

Sonra (kullanıcının kararı, 29 Ekim): app'lerin içinde bir Settings sayfası. Entegrasyonların anahtarları ve ayarları orada girilir. O zamana kadar anahtar entegrasyonun ekranından girilir (2. bölüm).

## 6. Ne zaman çalışır

| `on` | Ne zaman | Nerede |
|---|---|---|
| `button` | Kayıtta düğme (Buttons bloğu ve satırın `···` menüsü, bugünkü düğmeler gibi). `label` var, kayıt yok: koleksiyonun başlığında ("Pull orders") | Kim bastıysa; sunucudaki space'te sunucu |
| `save` | Koleksiyonun bir kaydı eklenince ya da değişince, `when(record, old)` doğruysa | Sunucusuz: yazan cihazda, bir kez, sync'te değil. Sunucuda: değişiklik sunucuya gelince, nereden gelirse gelsin (çevrimdışı yazılan da) |
| `open` | App ya da koleksiyon açılınca, son koşudan beri `every` geçtiyse | Açan cihazda; sunucudaki space'te sunucu |
| `schedule` | `"15m"`, `"1d"`, `"03:00"` | Yalnız sunucu |

- `save` kaydı bekletmez: kayıt önce yazılır, entegrasyon sonra çalışır, yazdıkları ikinci bir değişiklik olarak gelir. Entegrasyonun kendi yazdığı bir `save`'i tetiklemez; döngü olmaz.
- `open`'ın son koşu zamanı sync'teki durum dosyasındadır; iki cihaz arka arkaya açınca ikincisi çalıştırmaz.
- Undo: düğme ve `save` koşusunun sonunda toast ve Undo çıkar. Undo yalnız Scrawl'da yazılanı geri alır. Koşu servise bir şey gönderdiyse (`post`, `put`, `patch`, `delete`) Undo çıkmaz, toast ne gönderildiğini söyler.
- Bir entegrasyonun koşuları sırayla çalışır, üst üste binmez. Toplu içe aktarmada 500 kayıt 500 `save` koşusu demektir; sıraya girer.

## 7. Ajan

Yeni araç yok, var olanlar derinleşir:

- `create` (`kind: "integration"`): iskeletle dosyayı açar. `write` düzenler.
- Denetim (`create` ve `write`'ta): JS söz dizimi, varsayılan dışa aktarımın biçimi, `hosts`'un `https` ve dışarıdaki bir adres olması, adı geçen koleksiyon, pano ve alanların var olması. Yanlış satırıyla söylenir.
- Çalıştırma: `save_record` ile `action` (düğme) ve yeni `dryRun: true`: gidilen istekler (adres, durum, gövdenin başı) ve yazılacaklar döner, hiçbir şey yazılmaz. `save` ve `open` için de deneme koşusu bir kayıtla yapılır.
- `read` (`part: "runs"`): son koşular ve hataları.
- Anahtar eksikse araç söyler: "TMDB_TOKEN is missing: ask the person to enter it on TMDB's screen". Ajan değeri hiç görmez.
- Rehbere "Writing an integration" bölümü: dosyanın biçimi, `s`, örnek, anahtar istemenin yolu.

## 8. Teknik

### 8.1 Çalışma ortamı: QuickJS

Kod QuickJS'te çalışır (WebAssembly, `quickjs-emscripten`, MIT). Web, masaüstünün web görünümü ve sunucu (Node) aynı motoru kullanır.

- Gerçek bir sandbox: kodun `fetch`'i, dosyası, global'i yok; yalnız `s` var.
- Sınırlar (karar 8): koşu başına 60 sn, 64 MB bellek, 200 istek, yanıt başına 10 MB, 5.000 değişiklik.
- `await s.get(...)`: QuickJS'in kendi promise'i, iş dışarıda bitince çözülür (asyncify gerekmez).
- Yalnız bir entegrasyon çalışınca yüklenir. Boyutu 1. dilimde ölçülür.

Neden kural dili değil: 1.3. Neden Web Worker ya da `node:vm` değil: sunucuda güvenlik sınırı değiller; kod başka space'in verisine, sunucunun ortam değişkenlerine ve diskine ulaşabilir.

### 8.2 İsteği taşıyan katman

Ortak kod (kimlik doğrulama, yeniden deneme, `hosts` denetimi) tek; altında üç taşıyıcı:

- **Web:** `fetch`, `credentials: "omit"`. Ağ hatasında, cihaz çevrimiçiyse "TMDB didn't answer the browser. It may not allow browsers: use the desktop app or a Scrawl server."
- **Masaüstü:** yeni Rust komutu `http_request` (`reqwest`, var). Yalnız `https`, yalnız dışarıdaki adresler (adres çözülür, özel ve yerel IP reddedilir), çerez yok, `Origin` yok, 30 sn, 10 MB.
- **Sunucu:** Node `fetch`, aynı kurallar. SSRF koruması burada şart: `localhost`, `10.x`, `192.168.x`, `169.254.169.254` ve sunucunun kendisi reddedilir. Adres bir kez çözülür, bağlantı o IP'ye açılır (DNS rebinding).

### 8.3 Dosyalar ve kayıtlar

- `TMDB.integration.js`: kod. Ajan ve kişi yazar.
- `.scrawl/integrations/<id>.json`: `s.state`, son koşu zamanları ve son 50 koşunun özeti. Sync'e girer, ajana kapalı (`.scrawl/`).
- Anahtarlar: app klasörünün `Keys.env`'i (5.1).
- Etkinlikte entegrasyonun yazdıkları kendi adıyla görünür ("TMDB updated The Matrix"), ajanların kimliği gibi (17. aşama).

### 8.4 Değişiklik onayı

`hosts`, `keys` ya da `auth` değişince entegrasyon Paused olur. Keys dosyasını görebilen biri ekranda Allow'a basana kadar çalışmaz. Gövdedeki kod değişikliği onay istemez: anahtar yalnız yazılı adreslere gidebilir. Böylece bir ekip üyesi ya da ajan kodu değiştirip anahtarı başka bir yere gönderemez. Karar 7.

### 8.5 Kodda

- `packages/integrations` (yeni): `manifest.ts` (dosyayı QuickJS'te açar, tanımı okur, denetler), `sandbox.ts` (QuickJS, sınırlar, `s`), `auth.ts`, `http.ts` (ortak kısım + taşıyıcı arayüzü), `run.ts` (tetikleyici → koşu → değişiklik listesi → core'un yazma yolu, durum dosyası). QuickJS ağır olduğu için core'a girmez.
- `packages/core`: `upsert` ve anahtardan türeyen id; `s.records` için `run.ts`'in değişiklik listesinin dışa açılması.
- `apps/desktop/src-tauri/src/http.rs`: `http_request`. `cloud.rs`'te `token_request`'in izinli adresleri entegrasyonların token adresleriyle genişler.
- `apps/server/src/integrations.ts`: `POST /spaces/:id/integrations/run` (dosya, tetikleyici, kayıt, `dryRun`), `GET /integrations/callback`, değişiklik gelince `save` tetikleyicileri, dakikada bir dönen zamanlayıcı. Yazma, ajanın yazdığı yoldan (`agentfs.ts`): sürüm, canlı yayın ve etkinlik bugünkü gibi çalışır.
- `apps/web`: entegrasyon ekranı, düğmeler, kayıttaki hata satırı, `open` tetikleyicisi, Connect.
- `packages/agent`: `create` türü, denetim, `dryRun`, `read` `runs`, rehber.
- `packages/i18n`: metinler.

## 9. Güvenlik

- Kod sandbox'tadır; yalnız `s`'e ulaşır.
- İstek yalnız `hosts`'a, yalnız `https`'e, yalnız dışarıdaki adreslere gider (8.2).
- Anahtar yalnız `keys`'te yazılıysa okunur. Kayıtlarda ve koşu özetinde `Authorization`, çerez ve anahtar değerleri gizlenir.
- `hosts`, `keys`, `auth` değişikliği onay ister (8.4).
- Keys dosyası düz metindir (bugünkü durum); 5.1.
- Bir entegrasyonun kodu space'e yazabilen herkesçe değişir (yetki aşamasına kadar). Onay kuralı anahtarı korur, veriyi değil: kod space'in kayıtlarını yazılı adrese gönderebilir. Space'e yazabilen biri bunu bugün de elle yapabilir.

## 10. Testler

### 10.1 Otomatik

- Sandbox: sonsuz döngü 60 sn'de durur; bellek sınırı; `fetch`, `globalThis` ve benzerine erişim yok.
- `hosts` dışına istek, `http://`, özel IP: hata.
- `keys`'te olmayan anahtar okunmaz; koşu özetinde anahtar görünmez.
- Her `auth` türü, sahte taşıyıcıyla: doğru header ve query. OAuth: süresi biten token yenilenir, yeni refresh token Keys'e yazılır.
- 429'da `Retry-After`'la yeniden deneme; dördüncüde hata.
- Yarıda düşen koşu hiçbir şey yazmaz, `s.state` ilerlemez.
- `upsert`: aynı anahtar iki kez çekilince tek kayıt; iki ayrı cihazda aynı dosya adı.
- `save`: entegrasyonun kendi yazdığı tetiklemez; `when` yanlışsa çalışmaz.
- `open`: `every` dolmadan ikinci kez çalışmaz.
- XML, HMAC, base64 yardımcıları.
- Sunucu: SSRF (`localhost`, `10.0.0.1`, `169.254.169.254`, yerel IP'ye çözülen alan adı), çalıştırma isteğinde yetki, sahte saatle zamanlayıcı, OAuth dönüşünde `state` denetimi, değişiklik gelince `save`.
- Masaüstü: `http_request` `http://`'yi ve özel IP'yi reddeder.
- Ajan: denetimin satırlı hataları, `dryRun` hiçbir şey yazmaz, eksik anahtarın cümlesi.

### 10.2 Elle (bitti ölçütü)

- TMDB: sunucusuz space'te masaüstü, web ve telefon; sunucudaki space'te üçü. Film ekleyince bilgiler, düğme, açılınca tazeleme, sunucuda günlük koşu.
- Trendyol, test ortamında (stage), sunucudaki space'te: 15 dakikada bir siparişler, Shipped'te takip no'nun gitmesi, aynı siparişin iki kez girmemesi.
- Bir kargo firması (SOAP), test ortamında: gönderi açma ve etiket.
- Ajan: Claude Code'a "TMDB entegrasyonu yaz" denir; anahtar istemesi, deneme koşusu ve düzeltmesi.

## 11. Dilimler

1. **Çekirdek ve düğme:** QuickJS sandbox'ı, dosyanın tanımı ve denetimi, `s` (istek, anahtar, durum, kayıt, söz), basit kimlik doğrulama (bearer, basic, headers, query), web ve masaüstü taşıyıcıları, `button` tetikleyicisi, ajanın `create`, denetim ve `dryRun`'ı. Deneme: ajan TMDB entegrasyonunu yazar, sunucusuz space'te üç istemcide çalışır.
2. **Ekran ve olaylar** (önce mockup): entegrasyon ekranı (rehber, anahtar kutusu, durum, koşular, Allow, Code), kayıttaki hata satırı ve Retry, `save` ve `open` tetikleyicileri, Undo kuralı.
3. **Sunucu:** sunucudaki space'te koşuların sunucuya geçmesi, SSRF koruması, değişiklik gelince `save`, `schedule`. Deneme: Trendyol siparişleri.
4. **OAuth ve zor servisler:** üç OAuth yolu ve Connect, XML, HMAC, `s.cache`, `s.attach`. Deneme: kargo (SOAP) ve Amazon SP-API.

## 12. PLAN'da değişenler (29 Ekim 2026)

- 2, Yapmayacaklarımız: entegrasyonun eklenti sistemi olmadığı, bir cümle.
- 3, Entegrasyonlar satırı: 4. bölümdeki istisna. Sync sağlayıcıları satırındaki aşama numaraları da düzeldi.
- 4.11 Dış entegrasyonlar.
- 6, aşama tablosu: 22 Dış entegrasyonlar; Dosya ve klasör yetkisi 23, Dropbox, S3 ve GitHub 24, Google Drive 25, Mobil 26 (4.9, 5.5 ve native iOS bildirimindeki numaralar da).
- Sonraya kalanlar: "sunucuda pazaryeri ve kargo entegrasyonları" hazır entegrasyonlar oldu; 14. bölümdekiler eklendi. `design/calendar.md` 9 da bu altyapıya bağlandı.
- Roadmap: faz "22 Dış entegrasyonlar", sonrakiler bir kaydı; kartlar ROA-329 (plan, Done) ve ROA-330–333 (dört dilim); sonraya kalanlar ROA-334–337, ROA-188 hazır entegrasyonlar oldu.

## 13. Kararlar (29 Ekim 2026'da onaylandı)

1. **Dil:** entegrasyon kodu gerçek JS'tir, QuickJS sandbox'ında çalışır. Kural dili genişlemez, ağa kapalı kalır.
2. **Nerede çalışır:** sunucudaki space'te hep sunucuda; sunucusuz space'te tetikleyen cihazda (4. bölüm).
3. **İstisna:** tarayıcıya kapalı servisler sunucusuz space'te web ve telefonda çalışmaz; masaüstünde ve sunucuda çalışır.
4. **Anahtarlar:** app klasörünün Keys dosyasında; ayrı bir sunucu deposu yok (5.1).
5. **Dosya:** app klasöründe `<Ad>.integration.js`; kenar çubuğunda ve app'in menüsünde kendi ekranıyla görünen bir element.
6. **Kaydedince:** `save` kaydı bekletmez, sonra çalışır, hatası kayıtta görünür. Sunucudaki space'te sunucu, değişiklik nereden gelirse gelsin çalıştırır.
7. **Değişiklik onayı:** `hosts`, `keys`, `auth` değişince Allow beklenir (8.4).
8. **Sınırlar:** 60 sn, 64 MB, 200 istek, 10 MB yanıt, 5.000 değişiklik.
9. **Undo:** servise bir şey gönderen koşuda Undo yok.

## 14. Sonraya kalanlar (29 Ekim 2026'da kararlaştırıldı)

- **App'lerin içinde Settings sayfası** (5.1): entegrasyonların anahtarları ve ayarları orada girilir.
- **Webhook** (servisin bize haber vermesi: yeni sipariş, kargo teslim edildi). Yalnız sunucuda olur. Zamanlanmış koşu bugün aynı işi birkaç dakika gecikmeyle görür.
- **Kart ve görev olayları** (kart Shipped sütununa taşınınca, görev bitince). Bu planda olaylar yalnız koleksiyon kayıtlarında.
- **Hazır entegrasyonlar:** TMDB'nin Reading and watching'e, Trendyol, Hepsiburada, Amazon ve kargo firmalarının E-ticaret'e şablonla gelmesi. Bu plan altyapıdır; hazırları ajan ya da kişi yazar.
- **Kural dilinden entegrasyon çağırmak** (`_rules.js`'teki bir düğmenin TMDB'yi çağırması). Entegrasyon kendi düğmesini tanımladığı için gerekmiyor.
