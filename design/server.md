# Sunucu: teknik tasarım (taslak)

11. aşama. PLAN 5.5'in teknik karşılığıdır. Durum: kararlar onaylandı (15 Ekim 2026, 11. bölüm); sırada mockup'lar, kodda bir şey yazılmadı.

## 1. Kapsam

**Bu aşamada:** ekibin kendi makinesine kurduğu bir Docker sunucusu; space'ler orada durur; istemci ona sync motoruyla, OneDrive'ın yanında bir sağlayıcı olarak bağlanır; bir kişinin değişikliği diğerine bir iki saniyede geçer; hesap, cihaz anahtarı, davet linki; kurulum rehberi, yedek ve güncelleme.

**Sonra:** ince yetkiler (salt okunur üye, klasöre göre yetki), SSO, otomasyon, zamanlanmış ajan koşuları, "şu an düzenliyor" göstergesi, sunucudaki sürüm geçmişinin ekranı ve notta "son yazan kazanır + şerit", kişisel space'in sunucuya bağlanması, Postgres, SSO, lisans, link ile paylaşma, CRDT. 12. aşamadaki ajan (MCP) bu API'nin üstüne kurulur.

## 2. Genel yapı

```
Scrawl (masaüstü, web, telefon)
  sync motoru ── ServerRemote (RemoteStore'un sunucu hali)
        │  HTTPS: REST (dosyalar, hesap)  +  WebSocket (değişti bildirimi)
        ▼
Caddy ya da Cloudflare Tunnel   (HTTPS burada biter)
        ▼
scrawl-server (Node, tek süreç, :8080)
        ▼
/data   scrawl.db (SQLite)  +  blobs/ (içerikler)
```

Uygulama sunucuya doğrudan "canlı" bağlanmaz; yerel kopya hep vardır, motor bugünkü gibi tur atar. Sunucunun OneDrive'dan iki farkı vardır: değişince haber verir (sorgulamak gerekmez) ve hakkı kendisi denetler.

## 3. Teknoloji

| Ne | Seçim | Neden |
|---|---|---|
| Dil, çalışma ortamı | TypeScript, Node 24 LTS | `packages/core` aynen kullanılır: `keyOf`, `sha256`, birleştirme ve kişiler; ileride otomasyon ve ajan da aynı kodla çalışır |
| HTTP | Hono + `@hono/node-server` | Küçük, tipli, bağımlılığı az |
| WebSocket | `ws` | Node'da standart, Hono'nun sunucusuna takılır |
| Veritabanı | SQLite, `better-sqlite3`, WAL modu | Tek dosya, kurulum yok, küçük ekip için fazlasıyla hızlı; senkron API tek süreçte basit |
| Şifre | `node:crypto` scrypt | Yerleşik, yerel derleme istemez |
| Paketleme | esbuild ile tek dosya, `node:24-slim` imajı | İmaj küçük; linux/amd64 ve linux/arm64 (Raspberry Pi, ARM VPS) |
| İmaj deposu | GitHub Container Registry (`ghcr.io/scrawlnotes/server`, `scrawlnotes` organizasyonunda), GitHub Actions etiketle yayınlar | Repo GitHub'a taşınıyor; Actions kendi anahtarıyla yükler, ayrı bir sır gerekmez; açık repoda bedava ve çekme sınırı yok. Yalnız burası; Docker Hub şimdilik yok |
| Test | vitest | Depodaki diğer paketlerle aynı |
| Yer, lisans | `apps/server`, AGPL-3.0 (klasörde kendi LICENSE'ı) | Uygulama MIT kalır |

## 4. Veri

### 4.1 Diskte

```
/data/scrawl.db            hesaplar, cihazlar, space'ler, üyelikler, davetler, dosya kayıtları, sürümler
/data/blobs/ab/abcdef…     içerikler, SHA-256 özetiyle adlı; aynı içerik bir kez durur
/data/tmp/                 yüklenmekte olan dosyalar
/data/backups/             yedek komutunun yazdığı yer
```

İçerikler veritabanının içinde değil yanında durur: büyük ekler (video, PDF) SQLite'ta parça parça okunamaz, belleğe bütün alınır. Yedek tek klasördür.

### 4.2 Tablolar

```sql
accounts (id TEXT PK,             -- kişinin me.json'daki GUID'i
          email TEXT UNIQUE COLLATE NOCASE, name TEXT,
          password TEXT,          -- scrypt: tuz ve özet
          role TEXT,              -- 'owner' (kuran, tek) | 'admin' | 'member'
          created_at, disabled_at)

devices  (id TEXT PK, account_id, name,  -- "Kaan's laptop"
          token_hash TEXT UNIQUE,        -- anahtarın SHA-256'sı; anahtarın kendisi tutulmaz
          created_at, seen_at, revoked_at)

spaces   (id TEXT PK,             -- Scrawl'daki space id'si (sp-xxxxxxxx)
          name, created_by, created_at,
          seq INTEGER,            -- son değişikliğin numarası
          oldest_seq INTEGER)     -- bundan eski imleçe tam liste verilir

members  (space_id, account_id, role TEXT,  -- 'manager' | 'member'
          added_by, added_at, PK (space_id, account_id))

invites  (code_hash TEXT PK, kind TEXT,  -- 'space' | 'reset'
          space_id, account_id, created_by, expires_at, used_at)

entries  (space_id, key TEXT,     -- keyOf(path): büyük-küçük harf ve Unicode biçimi fark etmez
          path TEXT,              -- yazıldığı gibi
          kind TEXT,              -- 'file' | 'dir'
          hash TEXT, size INTEGER, width INTEGER, height INTEGER,
          seq INTEGER, author_id, device_id, at, deleted INTEGER,
          PK (space_id, key))     -- her yolun şimdiki hali; silinenler de (iz olarak)
          INDEX (space_id, seq)

versions (space_id, path, op TEXT, -- 'write' | 'move' | 'remove'
          hash, size, author_id, device_id, at)  -- yalnız eklenir; geçmiş ekranı sonra bunu okur
```

### 4.3 Kurallar

- **Etiket (`tag`):** içeriğin SHA-256'sı. İçerik değişince değişir, yalnızca o zaman; taşımada aynı kalır (motorun OneDrive'ın `cTag`'inden beklediği). `hash` da aynı değerdir; istemcinin `hashOf`'u `sha256`'dır, böylece zaten aynı olan bir klasör ilk kez eşitlenirken hiçbir şey gitmez.
- **İmleç:** space'in `seq`'i. Her değişiklik space'in `seq`'ini bir artırır ve satıra yazar. `changes(cursor)` = `seq > cursor` olan satırlar; silinmiş satır `removed`'a gider.
- **Silinenlerin izi** 90 gün tutulur. Daha eski bir imleçle gelen istemciye tam liste ve `full: true` verilir; motor bunu zaten bilir.
- **Klasörler:** bir dosya yazılınca üst klasörlerinin satırı da açılır; boş klasör `mkdir`'le açılır; klasör silinince altındakilerin hepsi silinmiş olur.
- **Yollar:** göreli, `..` ve boş parça yok, denetim karakteri yok, en çok 1024 karakter. Cihaza özel yollar (`isSynced` dışında kalanlar) zaten gelmez.
- **Geçmiş:** v1'de hiçbir sürüm silinmez. Kullanılmayan içerikleri temizleme ve süre sınırı sonra.

### 4.4 Bir yazma

1. Gövde `/data/tmp/`'ye akarken SHA-256'sı hesaplanır; dosya bellekte bütün tutulmaz.
2. Space başına bir kilit (süreç içi) alınır; tek işlemde (transaction):
   - `If-Match` şimdiki satırın `hash`'iyle, `If-None-Match: *` satır yokluğuyla karşılaştırılır; tutmazsa 412 döner, geçici dosya silinir.
   - Geçici dosya `blobs/`'a taşınır (orada aynısı varsa silinir).
   - Space'in `seq`'i artar, satır güncellenir, `versions`'a bir satır eklenir.
3. Kilit bırakılır, space'e abone olan bağlantılara `{ space, seq }` gider.

## 5. API

Hepsi `https://<sunucu>/api/v1` altında, JSON; her istek `Authorization: Bearer <cihaz anahtarı>` taşır (sunucunun hali, kurulum, giriş ve davet hariç).

### 5.1 Dosyalar (RemoteStore'un tel hali)

| İstek | Karşılığı | Dönen |
|---|---|---|
| `GET /spaces/:id/changes?cursor=N` | `changes` | `{ changed, removed, cursor, full?, more? }`, sayfada en çok 1000; `more` varsa adaptör devam eder |
| `GET /spaces/:id/files/<yol>` | `read` | içerik, `ETag: <tag>` |
| `PUT /spaces/:id/files/<yol>` + `If-Match` ya da `If-None-Match: *` | `write` | `{ path, kind, tag, size, hash }` |
| `POST /spaces/:id/move` `{ from, to, ifMatch }` | `move` | dosya; `to`'da bir şey varsa 412 |
| `DELETE /spaces/:id/files/<yol>` + `If-Match` | `remove` | 204 |
| `POST /spaces/:id/dirs` `{ path }` | `mkdir` | 204 |

| Sunucunun cevabı | İstemcide |
|---|---|
| 401 (anahtar yok, geçersiz ya da geri alınmış) | `RemoteSignedOut` → "Sign in again" |
| 403 (space'in üyesi değil), 404 (space yok) | `RemoteFolderGone` |
| 404 (okunan dosya yok), 412 | `RemoteConflict` (motor yeniden bakar) |
| 413 | dosya sunucunun sınırından büyük; panelde gönderilemeyenler arasında |
| 5xx, ağ hatası | `RemoteOffline` |

### 5.2 Hesap, space, kişiler

| İstek | Ne yapar |
|---|---|
| `GET /server` | sunucunun hali: `{ version, new, setupOpen }`; `new` hiç hesap yokken |
| `POST /setup` `{ name, email, password, person, device }` | yalnız hiç hesap yokken ve kurulum açıkken: ilk hesap sahibi olur; `{ token, account }`. Hesap varsa 409, süre dolduysa 410, `SCRAWL_OWNER_EMAIL` tutmazsa 403 |
| `POST /sessions` `{ email, password, device }` | giriş; `{ token, account }` |
| `DELETE /sessions/current` | bu cihazdan çıkış, anahtar geri alınır |
| `GET /me` | hesap |
| `GET /spaces` | üyesi olunan space'ler |
| `POST /spaces` `{ id, name }` (Owner, Admin) | yeni space; açan Manager'ı olur |
| `GET /spaces/:id/members` | üyeler |
| `PATCH /spaces/:id/members/:account` `{ role }` (Manager) | Manager yapar ya da Member'a döndürür; son Manager Member olamaz |
| `DELETE /spaces/:id/members/:account` (Manager; Owner ve Admin her space'te) | space'ten çıkarma; erişim hemen biter |
| `POST /spaces/:id/invites` (Manager) | davet linki: `https://<sunucu>/join/<kod>`; gelen space'in Member'ı, sunucunun Member'ı olur |
| `GET /invites/:code` | linkin ne olduğu: hangi sunucu, hangi space, kim çağırdı |
| `POST /invites/:code/accept` `{ name, email, password, person, device }` | hesap açılır (ya da var olan hesapla girilir), space'e katılınır; `{ token, account, space }` |
| `GET /accounts` (Owner, Admin) | sunucudaki hesaplar, rolleri ve kaç space'te oldukları |
| `PATCH /accounts/:id` `{ role }` (Owner) | Admin ya da Member yapar; Owner'ın rolü değişmez |
| `DELETE /accounts/:id` (Owner, Admin; Owner silinmez) | hesabı sunucudan çıkarır: bütün space'lerden çıkar, cihaz anahtarları geçersiz olur; yaptıkları space'lerde kalır |
| `POST /accounts/:id/reset` (Owner, Admin) | şifre yenileme linki, 24 saat, tek kullanımlık |

### 5.3 Canlı kanal

`wss://<sunucu>/api/v1/live`. Tarayıcı WebSocket'e başlık koyamadığı için anahtar ilk mesajla gelir: `{ "type": "hello", "token": "…" }`; 5 saniyede gelmezse ya da geçersizse bağlantı kapanır. Sonra sunucu, kişinin üyesi olduğu her space değiştiğinde `{ "type": "changed", "space": "sp-…", "seq": 812 }` gönderir. 30 saniyede bir ping. İstemci `seq` kendi imlecinden büyükse o space'in turunu hemen başlatır. Bağlantı koparsa artan aralıklarla yeniden bağlanır, bu sırada 30 saniyelik tur sürer.

## 6. Kimlik ve güvenlik

- **İlk kurulum:** sunucuya ilk bağlanan sahibi olur (Coolify ve Immich de böyle). Uygulama Connect a server…'da adresi alınca `GET /server`'a bakar; sunucu yeniyse kurulum formunu açar, ad ve e-posta Profile'dan gelir, şifre seçilir. Kurulum, sunucunun hesapsız açıldığı andan bir saat sonra kapanır; süre dolduysa uygulama sunucuyu barındırma panelinden yeniden başlatmasını söyler, yeniden başlayan hesapsız sunucuda süre yeniden işler. `SCRAWL_OWNER_EMAIL` verilmişse sunucuyu yalnız o e-posta kurabilir (Coolify'ın kurulumda tanımlanan yönetici hesabı gibi). Log okumak gerekmez.
- **Roller:** sunucuda Owner, Admin, Member; space'te Manager, Member (yetki tablosu PLAN 5.5'te). Her istek rolü sunucuda denetler; yetmeyen 403 döner ve uygulama o düğmeyi zaten göstermez. Dosya isteklerinde 403 "üye değil" demektir (5.1).
- **Davet:** space'in Manager'ları Invite… ile link alır; tek kullanımlık, 7 gün. Link tarayıcıda açılırsa sunucunun küçük bir sayfası "Bunu Scrawl'da aç" der: web uygulamasına linkle gönderen bir düğme ve masaüstü için "Add space › Connect a server…'a yapıştır" cümlesi.
- **Sunucunun adresi tarayıcıda:** kurulmamışken "This Scrawl server is ready. Open Scrawl and connect to <adres> to set it up.", kurulduktan sonra "This is a Scrawl server. Open Scrawl and connect to <adres>." yazan düz bir sayfa.
- **Kimlik:** hesabın id'si, daveti kabul eden cihazdaki `me.json` id'sidir; atamalar ve `people.json` bugünkü gibi çalışır. Başka bir cihazda girişte hesabın id'si o cihazdakinden farklıysa o cihaz hesabınkini alır.
- **Anahtar:** girişte cihaza 256 bitlik rastgele bir anahtar verilir; sunucuda yalnızca özeti durur; süresi yoktur, çıkışta ya da kişi çıkarılınca geri alınır. İstemcide OneDrive anahtarıyla aynı yerde durur: masaüstünde sistemin kimlik deposunda, web'de tarayıcının deposunda.
- **Şifre:** en az 8 karakter; scrypt (N=2^15, r=8, p=1). Unutulursa sahibi yenileme linki verir; e-posta gönderilmez, SMTP gerekmez.
- **Kaba kuvvet:** aynı e-posta ve adresten dakikada 5 giriş denemesi.
- **HTTPS şart:** app.scrawlnotes.com HTTPS olmayan bir adrese istek atamaz, telefon da. `SCRAWL_URL` `https://` değilse sunucu yalnız `localhost` için açılır.
- **CORS:** her kökene açık (`Access-Control-Allow-Origin: *`); çerez yok, kimlik başlıkta. `Authorization`, `If-Match`, `If-None-Match` izinli; `ETag` görünür.
- **Sınırlar:** dosya başına `SCRAWL_MAX_FILE_MB` (varsayılan 1024); bütün sorgular parametreli.

## 7. İstemci

- **core:** `packages/core/src/sync/server.ts`: `ServerRemote` (`RemoteStore`'u yukarıdaki API ile doldurur, sayfaları kendisi birleştirir) ve `ServerAccount` (giriş, space'ler, üyeler, davet). Hataları 5.1'deki tabloya göre motorun hatalarına çevirir.
- **Space kaynağı:** `SpaceSource` zaten sağlayıcıya açık: `{ provider: 'server', account: '<e-posta>', place: { url: 'https://kaan.scrawlnotes.com', space: 'sp-…' } }`. `Connection.provider` `'onedrive' | 'server'` olur.
- **Sync servisi** (`apps/web/src/sync.ts`): sunucudaki space'in birimi `ServerRemote` kullanır; her sunucu için tek bir canlı bağlantı açılır, bütün space'leri onu dinler. Kaydettikten sonraki bekleme sunucu space'lerinde 1 saniye; canlı bağlantı varken 30 saniyelik tur 60 saniyeye çıkar.
- **Arayüz** (mockup sayfasının Sunucu bölümü): Add space › Location'da her bağlı sunucu bir satır ("kaan.scrawlnotes.com · kaan@…") ve Connect a server…. Connect a server… tek bir alandır, sunucunun adresi ya da davet linki; Continue'da uygulama bakar ve kurulum (sunucu yeni), katılma (davet linki) ya da giriş (kurulu sunucu) formunu açar. Varsayılan adres yoktur; alan boşken silik bir örnek görünür, cihaz bağlandığı sunucuyu hatırlar ve alan onunla dolu gelir. Hesabı olmayan biri girmeye çalışırsa: "No account with this email on <adres>. Enter your own server's address, or ask its owner for a link." Folder adımının yerinde Space: New space (yazılan adla) ya da davet edilip bu cihazda olmayan space'ler; space sayfasında Manager'lar etiketli, People'ın yanında Invite… (link, Copy, New link) ve satırların menüsünde Make manager ve Remove from <space> yalnız Manager'lara görünür; New space yalnız Owner ve Admin'e. Settings › Spaces'in altında Servers; satır sunucunun sayfasını açar: hangi hesapla girildiği ve Sign out on this device, Owner ve Admin için ayrıca sunucudaki hesaplar, rolleri ve menüde Make admin / Make member (Owner), New password link…, Remove from server. Sync paneli ve durumları değişmez.
- **Kişisel space** v1'de sunucuya bağlanmaz; OneDrive'da kalır ya da hiç sync olmaz.

## 8. Kurulum ve işletme

```yaml
# docker-compose.yml
services:
  scrawl:
    image: ghcr.io/scrawlnotes/server:1
    restart: unless-stopped
    environment:
      SCRAWL_URL: https://scrawl.example.com
    volumes:
      - ./data:/data
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy:/data
volumes:
  caddy:
```

```
# Caddyfile
scrawl.example.com {
  reverse_proxy scrawl:8080
}
```

- **Ayarlar:** `SCRAWL_URL` (linklerde geçen adres), `PORT` (8080), `SCRAWL_MAX_FILE_MB`, isteğe bağlı `SCRAWL_OWNER_EMAIL` (sunucuyu yalnız bu e-posta kurar).
- **Deneme (yerelde):** bu bilgisayarda Docker'la `http://localhost:8080`. `localhost` tarayıcıya göre güvenli sayıldığı için geliştirme sunucusundaki web uygulaması ve masaüstü uygulaması HTTPS'siz bağlanır. iPhone denemesi Coolify'daki sunucuyla yapılır.
- **Bizim kullanımımız (Coolify):** ilkbyte Cloud I (2 çekirdek x86, 2 GB RAM, 20 GB SSD, Denizli), var olan Coolify'a sunucu olarak eklenir; Scrawl sunucusu orada "Docker Image" kaynağıdır (ya da Coolify GitHub'daki repodan kendisi derler). 20 GB başlangıç için yeter; her sürüm saklandığı ve yedekler aynı diske yazıldığı için son 7 yedek tutulur, makinenin dışına kopya sonra. HTTPS'i ve WebSocket'i Coolify'ın kendi proxy'si taşır, compose'daki Caddy orada gerekmez; alan adı kişisel bir alt alan adıdır (`scrawl.kaanarslan.dev`), Coolify'da verilir, `SCRAWL_URL` ona eşitlenir; Cloudflare'deki kaydı DNS only (gri bulut) olur, çünkü proxy'de bedava planın tek yüklemesi 100 MB'la sınırlı; `/data` kalıcı bir volume'dur. Yedek Coolify'ın Scheduled Tasks'ıyla her gece container'da `scrawl-server backup` çalıştırır.
- **HTTPS'in iki yolu (rehber):** alan adın varsa ve 80/443 açabiliyorsan Caddy sertifikayı kendisi alır. Port açamıyorsan ya da evdeki bir makinedeyse Cloudflare Tunnel: `cloudflared` compose'a üçüncü servis olarak eklenir, port açılmaz, bedavadır, kuranın kendi Cloudflare hesabındadır (alan adı Cloudflare'de olmalı). İkisi de WebSocket'i taşır.
- **Yedek:** `docker compose exec scrawl scrawl-server backup` → `/data/backups/<tarih>/`: SQLite'ın canlı yedek API'siyle tutarlı bir kopya ve `blobs/`. Geri yükleme: sunucuyu durdur, `/data`'yı yedekle değiştir, başlat.
- **Dışa aktarma:** `scrawl-server export <space>` space'in son halini normal bir klasör ağacı olarak zip'ler; OneDrive'a dönmek için.
- **Güncelleme:** `docker compose pull && docker compose up -d`. Şema değişiklikleri açılışta sırayla uygulanır (veritabanında şema sürümü durur).

## 9. Testler

- **Sunucu:** yazma ve `If-Match`, taşıma, silme (klasörle), `changes` ve imleç, silinenlerin izi ve `full`, yol kuralları, ilk bağlananın sahip olması (süre, `SCRAWL_OWNER_EMAIL`, hesap varken ikinci kurulumun reddi), giriş, anahtar geri alma, davet (süre, tek kullanım), üyelik denetimi, kanal bildirimi.
- **Sözleşme:** motorun `MemoryRemote`'la koşan testlerinden sağlayıcı davranışına dayananlar, test içinde açılan bir sunucuya karşı `ServerRemote` ile de koşar; ikisi aynı davranmalı.
- **Uçtan uca:** iki kasa aynı space'e bağlı; birinde yapılan değişiklik bildirimle ötekine 2 saniye içinde geçer; panoda aynı anda iki kart değişir, ikisi de kalır.
- **Elle (bitti ölçütü):** Scrawl'ın kendi ekibi bir space'i kendi sunucusunda kullanıyor; masaüstü, web ve iPhone'da.

## 10. Dilimler

1. **Sunucu ve bağlanma:** `apps/server` (tablolar, dosya API'si, ilk bağlananın sahip olduğu kurulum, giriş, "hazır" sayfası, yedek komutu), Docker imajı; core'da `ServerRemote` ve `ServerAccount`; Add space'te sunucu, Connect a server… (tek alan, kurulum ve giriş), New space; sync 30 saniyelik turla.
2. **Anında yansıma:** canlı kanal, bildirimle tur, kısa bekleme; açık pano, koleksiyon ve notun yerinde yenilendiğinin denetimi.
3. **Kişiler ve roller:** davet linki ve `/join` sayfası, kabul, üyeler, sunucuda ve space'te roller, sunucunun sayfası (hesaplar), Remove, şifre yenileme linki, Sign out.
4. **Kurulum:** compose, Caddy ve Cloudflare Tunnel rehberi, Coolify notu, imajın GitHub Actions'la ghcr.io'ya yayını (amd64 ve arm64), dışa aktarma komutu, güncelleme notu.

## 11. Kararlar (15 Ekim 2026)

1. Giriş e-posta ve şifreyle, davet ve şifre yenileme linkle; e-posta gönderilmez.
2. Herkes yalnız davet edildiği space'leri görür.
3. Depo: SQLite + yanında içerikler (yedek tek klasör); Postgres sonra. PLAN 5.5 buna göre düzeltildi.
4. Çakışma: ilk sürümde OneDrive'daki birleştirme aynen; PLAN 5.5'teki "son yazan kazanır + geçmiş + şerit" geçmiş ekranıyla sonra.
5. Deneme yerelde Docker'la; bizim kullanımımız Coolify'a bağlanan küçük bir sunucuda, kişisel bir alt alan adıyla (`scrawl.kaanarslan.dev`).
6. Herkes kendi sunucusunu kurar; bizim işlettiğimiz açık bir sunucu yok. Uygulamada varsayılan sunucu adresi yok; cihaz bağlandığını hatırlar.
7. Sunucuya ilk bağlanan sahibi olur; log ve kurulum linki yok. Kurulum bir saat açık kalır, isteğe bağlı `SCRAWL_OWNER_EMAIL`.
8. Temel roller bu aşamada ve açık çekirdekte: sunucuda Owner, Admin, Member (space'i Owner ve Admin açar); space'te Manager, Member (Invite… ve çıkarma Manager'ın). İnce yetkiler ve SSO ileride `ee/`.
