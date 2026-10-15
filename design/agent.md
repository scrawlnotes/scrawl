# Ajan: teknik tasarım (taslak)

12. aşama. PLAN 4.8'in teknik karşılığıdır. Durum: kararlar onaylandı (15 Ekim 2026, 12. bölüm); 1, 2 ve 3. dilim (araçlar, sunucudaki kapı, bilgisayardaki kapı) yazıldı, 13. bölümde notlar; sırada elle deneme ve 4. dilim. Sunucu (11. aşama, `design/server.md`) yazıldı ve ayakta; ajan onun üstüne kurulur.

## 1. Tek kural

**Ajan, notlara senin ulaştığın yerden ulaşır.**

- Bilgisayarındaki ajan (Claude Code, Claude Desktop, Cursor ve stdio konuşan her istemci) bilgisayarındaki klasörleri görür: kişisel vault ve space'lerin bu cihazdaki kopyaları. Space'in OneDrive'da, Dropbox'ta ya da bir sunucuda olması fark etmez; ajan kopyayı düzenler, sync taşır.
- Dışarıdaki ajan (claude.ai web ve telefon, ChatGPT, başka bir makinedeki Claude Code) yalnız bir Scrawl sunucusunu görebilir. Bulut sağlayıcıdaki bir klasörü göremez, çünkü ona ancak kişinin anahtarıyla ve kişinin cihazından ulaşılır. Bizim barındırdığımız bir köprü yoktur: olsa Microsoft ve Dropbox anahtarlarını biz tutardık, "bizim sunucumuz yok" ilkesi bozulurdu.

Ayarlar ekranındaki cümle sağlayıcıdan bağımsızdır: *"Claude and ChatGPT on the web and on your phone can't reach this computer. Connect them to a Scrawl server."*

| İstemci | Bilgisayardaki klasörler | Scrawl sunucusu |
|---|---|---|
| Claude Code | `scrawl-mcp` (stdio) | `https://<sunucu>/mcp` |
| Claude Desktop | `.mcpb` paketi, çift tıkla kurulur | claude.ai'da eklenen connector burada da görünür |
| Cursor ve benzerleri | `scrawl-mcp` (stdio) | adres |
| claude.ai web ve telefon | yok | custom connector (web'de eklenir, telefonda da çalışır) |
| ChatGPT | yok; yalnız uzaktan bağlantı tanır | connector (Developer mode) |

## 2. Genel yapı

```
packages/agent          araçlar: VaultFs + packages/core üstünde; iki kapı aynı kodu sunar
      │
      ├── apps/mcp      scrawl-mcp: stdio komutu (npm: @scrawlnotes/mcp) ve Claude Desktop için .mcpb
      │                 vault'ları masaüstü uygulamasının ayarlarından ya da --vault ile bulur
      │
      └── apps/server   POST /mcp (Streamable HTTP) + OAuth uçları
                        ServerFs: VaultFs'in SQLite + blobs üstündeki hali; yazınca canlı kanal "değişti" der
```

Ajan hiçbir zaman ayrı bir veri yolu kullanmaz: yerelde dosyaları düzenler, sunucuda aynı `SpaceFiles` deposunu düzenler. Uygulamanın gördüğüyle ajanın gördüğü aynı dosyadır.

## 3. Teknoloji

| Ne | Seçim | Neden |
|---|---|---|
| Protokol | MCP 2026-07-28, en yeni sürüm | Oturumsuz Streamable HTTP: her istek kendi başına, `Mcp-Session-Id` yok; istemcinin adı her istekte gelir |
| SDK | `@modelcontextprotocol/server` 2.3 (v2), `@modelcontextprotocol/hono` 2.0, `@modelcontextprotocol/server/stdio` | v2 kararlı hat; `createMcpHandler` ve `serveStdio` 2025 sürümünü konuşan istemcilere de kendileri cevap verir (`legacy: 'stateless'` varsayılan). Eski tek paket `@modelcontextprotocol/sdk` (1.x) kullanılmaz |
| Şema | zod v4 | SDK'nın beklediği; `inputSchema` ve `outputSchema` buradan JSON Schema'ya çevrilir |
| Dosya sistemi | `VaultFs` (`packages/core/src/fs.ts`) | Bilgisayarda `NodeFs` (node:fs), sunucuda `ServerFs`; araçlar ikisini de bilmez |
| Çalışma ortamı | Node 24 LTS (SDK en az 20 ister) | Sunucuyla aynı |
| Paketleme | `apps/mcp`: esbuild ile tek dosya; npm'de `@scrawlnotes/mcp` (bin `scrawl-mcp`); `.mcpb` paketi `@anthropic-ai/mcpb` ile | `npx -y @scrawlnotes/mcp` Node'u olan herkeste; Claude Desktop `.mcpb`'yi kendi Node'uyla çalıştırır, kullanıcı Node kurmaz |
| Test | vitest | Diğer paketlerle aynı; araç testleri `MemoryFs` üstünde, sözleşme testleri `ServerFs` üstünde de koşar |
| Yer, lisans | `packages/agent` ve `apps/mcp` MIT; sunucudaki kapı `apps/server`'da AGPL | Uygulama tarafı MIT kalır |

## 4. Araçlar

On dört araç; hepsi `packages/agent`'ta. Büyük araç listesi her istemciyi kötüleştirir, bu yüzden "arayüzde yapılan her şey" için araç çoğaltılmaz: biçimler düz dosya olduğu için `read` ve `write` ile her şey yapılır, araçlar kuralları bilen kısayollardır (kimlik, birleştirme, sütun türü, link çözme, hesaplanmış değerler).

Her araç bir `space` alır (kimlik ya da ad); ajan tek space görüyorsa boş bırakılır. Yollar space içinde, `/` ile, uygulamanın sekmede gösterdiği gibi.

**Ada göre çözme:** pano, koleksiyon ya da liste isteyen her araç (`cards`, `save_card`, `comment`, `records`, `save_record`, `tasks`, `save_task`) yol da ad da kabul eder; `space` de öyle. Ad büyük-küçük harfe bakmadan tek bir şeye uyuyorsa araç onu kullanır ve cevabında yolunu söyler. Birden fazlasına uyuyorsa ("Scrawl" ve "Scrawl v2") araç hiçbir şey yazmaz, adayları yollarıyla döndürür; ajan kişiye sorar. Hiçbirine uymuyorsa en yakın adları döndürür. Aynı kural kayıtlar için de geçerlidir: `save_record` ve `save_card`'da link alanının değeri ile `save_task`'in `record`'u ad ya da kodla verilir; birden fazla kayıt uyuyorsa araç yazmaz, adayları döndürür. Kural araçta olduğu için ajanın tahmin etme şansı kalmaz; Scrawl "şu anki proje" diye bir şey uydurmaz, bağlam istemciden gelir (Claude Code çalıştığı klasörü, claude.ai konuşmayı bilir).

| Araç | Girdi | Ne yapar, ne döner | Core |
|---|---|---|---|
| `spaces` | — | Ajanın gördüğü space'ler: kimlik, ad, nerede ("this computer", "OneDrive", sunucu adresi), kişisel mi. Yanında bugünün tarihi ve kişinin adı: istemciler bugünü her zaman vermez, "haftaya ara" gibi bir tarih ve aktör buradan bilinir | `readSpaceEntries`, `loadSpace`, `loadMe` |
| `tree` | `space`, `folder?`, `kind?` | Klasör ağacı; her düğümün türü: note, tasks, board, keys, collection, filter, folder. `kind` verilince yalnız o türdekiler, yollarıyla: bütün panolar tek çağrıda | `readTree` |
| `read` | `space`, `path` | Dosyanın metni: not, kayıt (frontmatter + gövde), görev listesi, pano, şema. Keys, `.scrawl/` ve `_attachments/` reddedilir | `fs.readText` |
| `write` | `space`, `path`, `text`, `ifMatch?` | Dosyayı olduğu gibi yazar, klasörlerini açar; `ifMatch` verilmişse ve dosya değişmişse yazmaz, şimdiki özeti döner. Notun önceki hali her zaman sürüm olarak kalır. Keys, `.scrawl/` ve `_attachments/` reddedilir; 1 MB'tan büyük metin reddedilir | `fs.writeText`, `keepVersion({ always: true })` |
| `search` | `query`, `space?`, `limit?` | Arama penceresinin bulduğu gibi: ad ve metinden; her satırda space, yol, tür, başlık, parça | `searchIndex`, `search` |
| `create` | `space`, `folder`, `kind`, `name`, `template?`, `text?` | Not, görev listesi, pano (software, simple, issues, crm), koleksiyon (companies, people, activities, feedback, payments, blank) ya da klasör; yolu döner | `createNote`, `createTaskList`, `createBoard`, `newSchema` + `saveSchema`, `createFolder` |
| `trash` | `space`, `path` | Çöpe atar; Trash'ten geri alınır. Kalıcı silme yok | `trashItem`, `trashFolder` |
| `records` | `space`, `collection`, `where?`, `sort?`, `limit?` | Koleksiyonun kayıtları; `where` şemanın koşul dilidir (`{ field, op, value }`, op'lar `CONDITION_OPS`), formül ve rollup hesaplanmış, uymayan değer işaretli (`problems`) | `loadSchema`, kayıt okuma, `evaluateFormula`, `withRollups`, koşullar |
| `cards` | `space`, `board`, `column?`, `phase?`, `assignee?`, `label?`, `open?`, `brief?` | Kartlar; `column` kimlik, ad ya da tür (`backlog`, `active`, `review`, `done`, `dropped`) olur, `phase` boşken geçerli faz (ajan fazın dışına çıkmaz; `phase: "all"` hepsi). Tek kart ve `brief: true` ile "Copy as brief"in metni: başlık, kimlik, açıklama, linkli notlar, fazın amacı ve bitti ölçütü | `loadBoard`, `currentPhase`, `phaseCards`, `columnOf`, `cardValues` |
| `tasks` | `space`, `list?`, `due?` (today, upcoming, overdue), `assignee?`, `done?` | Görevler; liste yolu ya da tarihe göre bütün listelerden | `loadList`, `dueToday`, `dueUpcoming`, `filterTasks` |
| `save_record` | `space`, `collection`, `id?`, `values`, `body?` | `id` yoksa yeni kayıt, varsa günceller. Değerler alan anahtarı ya da etiketiyle; link alanı kaydın adı, kodu ya da kimliğiyle ("Acme Corp", "CUS-0012"); select'te olmayan seçenek, boş zorunlu alan ve türe uymayan değer reddedilmez, yazılır ve `problems`'ta döner (arayüzde işaretli görünür). Kimliği, yolu ve kaydı döner | `readValue`, `linkTo`, kayıt yazma |
| `save_card` | `space`, `board`, `id?`, `title?`, `description?`, `column?`, `phase?`, `priority?`, `due?`, `labels?`, `assignee?`, `values?` | Yeni kart ya da güncelleme; `column` verilmişse taşır (kimlik, ad ya da tür: "review" ilk review sütunudur). Yeni kart geçerli faza ve ilk sütuna düşer. Zaman çizgisine aktörle yazılır | `addCard`, `updateCard`, `moveCard`, `moveCardToKind` |
| `save_task` | `space`, `list?`, `id?`, `title?`, `description?`, `due?`, `priority?`, `assignee?`, `record?`, `section?`, `done?` | Yeni görev ya da güncelleme; `list` boşken kişisel space'in Inbox'ı. `done` kapatır ve açar | `addTask`, `updateTask`, `setDone` |
| `comment` | `space`, `board`, `card`, `text` | Kartın zaman çizgisine yorum; ajanın "şunu yaptım, şu kaldı" dediği yer | `addComment` |

Araç açıklamaları (`description`) ve `annotations` doğru doldurulur: okuyanlar `readOnlyHint: true`, `write`, `trash` ve `save_*` `destructiveHint`'i doğru söyler; ChatGPT yazan her aracı kullanıcıya onaylatır, Claude da ipuçlarına bakar. Dönen her şey hem metin hem `structuredContent` olur.

**Kaynak:** `scrawl://guide`, markdown. Klasör düzeni, her elementin dosya biçimi (not, `.tasks.json`, `.board.json`, `_collection.json` ve kayıt dosyası, kimlikler, sütun türleri, fazlar, link ve önbelleklenmiş ad, formül ve rollup yazımı, şablonlar), `.scrawl/`'ın ne olduğu ve dokunulmayacağı, SOP notu alışkanlığı ("Won olunca kapanış tarihini yaz" gibi kuralı not söyler, ajan uygular). Rehber ajanın tavrını da söyler: önce etrafına bak (`spaces`, `tree`, `search`), eklemeden önce var olana bak ve varsa onu güncelle, birden fazla şey uyuyorsa sor, emin olmadığın şeyi yazma. Ajan bunu bir kez okur, sonra "bana bir CRM kur" dediğinde `create` ve `write` ile şemayı ve düzeni kendisi yazar. Araç açıklamaları bu kaynağa işaret eder ve aynı kuralı kısaca tekrar eder.

**Kapalı olanlar:** Keys dosyaları (sırlar), `.scrawl/` (geçmiş, dizin, kişiler, ben), `_attachments/` (ekler; v1'de ne okunur ne yazılır). Ajan hiçbir şeyi kalıcı silmez. Space ekleme, kişi çıkarma, sunucu ayarları gibi şeyler araç değildir.

**Birleştirme:** araçlar oku-değiştir-yaz yapar (`loadBoard` → `addCard` → `saveBoard`). Bilgisayarda bu, uygulamanın kendi yazmasıyla aynıdır; OneDrive sync'i dosyayı olduğu gibi taşır ve bugünkü birleştirme kuralları (zaman çizgisi eklenerek, kart kimliği çakışınca yeniden numaralama) geçerlidir. Sunucuda `ServerFs` yazarken dosyanın okunduğu andaki özetini `If-Match` olarak verir; biri aynı anda yazmışsa 412 gelir, araç dosyayı yeniden okuyup değişikliği bir kez daha uygular.

## 5. Aktör ve iz

- İstemci adı: 2026-07-28 sürümünde her istekte gelebilir (`clientInfo`, SHOULD), eski sürümle bağlanan istemcide açılıştan alınır. Bugünkü SDK (2.3) adı istekle taşımıyor ve sunucuda her istek taze bir örnekle karşılandığı için açılış da yok; bu yüzden sunucuda ad OAuth kaydından gelir (DCR'deki `client_name` ya da CIMD belgesindeki ad: "Claude", "ChatGPT"), protokol adı taşıdığında o öne geçer. Ayar istemez.
- Kişi bilgisayarda `.scrawl/me.json`'dan, sunucuda hesaptan bilinir. Aktör `"<istemci> · <kişi>"` yazılır: "Claude Code · Kaan". Kartın zaman çizgisinde, yorumda ve sunucudaki `versions` satırlarında bu görünür. Kişi adsızsa yalnız istemcinin adı.
- Atama (assignee) için ajan bir kişi değildir; `people.json`'a girmez. Kişisel space'te kartın Assignee'si yazılan bir ad olduğu için ajan kendine "Claude" yazabilir (PLAN 4.4).
- Ajanın üstüne yazdığı notun önceki hali her zaman sürüm olarak kalır (`keepVersion`, `always: true`); insan History'den geri alır.
- Sunucuda her ajan bağlantısı bir cihaz satırıdır (`devices`): adı istemcinin adı, `seen_at` son isteğin zamanı. Hesabın sunucu sayfasında "Agents" altında görünür ve oradan kesilir (7. bölüm).

## 6. Bilgisayardaki kapı: `scrawl-mcp`

- **Komut:** `scrawl-mcp` (npm: `@scrawlnotes/mcp`). Argümansız çalışınca masaüstü uygulamasının ayar dosyasını okur ve uygulamanın gördüğü her şeyi görür: kişisel vault ve `spaces[]`'teki klasörler. Dosya Tauri'nin `app_config_dir`'inde, kimlik `app.scrawlnotes.desktop`: Windows `%APPDATA%\app.scrawlnotes.desktop\settings.json`, macOS `~/Library/Application Support/app.scrawlnotes.desktop/settings.json`, Linux `~/.config/app.scrawlnotes.desktop/settings.json`. Uygulamanın açık olması gerekmez.
- **`--vault <klasör>`** (tekrarlanabilir): masaüstü uygulaması olmayan bir makinede ya da yalnız belli klasörler için. Her klasör bir space'tir; `space.json`'u olmayan klasör "Personal" sayılır. Ayar dosyası da yoksa ve `--vault` de verilmemişse komut ne yapılacağını söyleyip çıkar.
- **Taşıma:** stdio, `serveStdio` ile; her bağlantı için `McpServer` fabrikadan kurulur. Log yalnız stderr'e; stdout protokolündür.
- **Dosya sistemi:** `NodeFs` (`node:fs/promises`, `VaultFs`'i dolduran küçük sınıf; `apps/web/src/tauriFs.ts`'in Node hali). Büyük-küçük harf ve Unicode biçimi `keyOf` ile uygulamadaki gibi.
- **Uygulama ne zaman görür:** masaüstü uygulaması pencere öne gelince vault'u yeniden tarar (`session.rescan`, bugün de başka bir program değiştirmiş olabilir diye); ajanın yazdığı, pencereye dönünce görünür. OneDrive'daki space'te sync kopyadan buluta taşır; uygulama kapalıysa açılınca. Anında görmek için dosya izleme sonra.
- **Claude Desktop:** `.mcpb` paketi (`manifest.json` 0.3, `server.type: "node"`, bağımlılıklar pakette). `user_config` tek bir alan: `folders`, tür `directory`, `multiple: true`, isteğe bağlı; boş bırakılırsa ayar dosyası. Paket GitHub Releases'te durur ve uygulamanın Agents ekranındaki düğme onu açar; Claude Desktop "kur" diye sorar.
- **Claude Code:** `claude mcp add scrawl -- npx -y @scrawlnotes/mcp`. Proje başına istenirse `.mcp.json`'a aynı satır.
- **Cursor:** `cursor://anysphere.cursor-deeplink/mcp/install?name=scrawl&config=<base64>`; config `{ "command": "npx", "args": ["-y", "@scrawlnotes/mcp"] }`.
- **Sunucudaki space'in kopyası:** sunucuya bağlı bir space'in bu cihazdaki kopyası da klasördür; bilgisayardaki ajan onu da görür ve sync sunucuya taşır. Aynı space'e hem buradan hem sunucudan ulaşmak gerekmez; bilgisayarda yerel kapı, dışarıda sunucu.

## 7. Sunucudaki kapı: `/mcp`

### 7.1 Uç

- `POST /mcp`, Streamable HTTP, oturumsuz: `createMcpHandler(fabrika)`, her istekte taze `McpServer`. Var olan Hono uygulamasına takılır (`handler.fetch(c.req.raw, { authInfo, parsedBody })`); SDK'nın `createMcpHonoApp`'ı kullanılmaz, çünkü uygulama zaten var ve herkese açık bir adreste (Host ve Origin denetimi yerel sunucular içindir; bizimki HTTPS'in arkasında ve kimlik token'dadır).
- Her istek `Authorization: Bearer <token>` taşır. Token yoksa ya da geçersizse `401` ve `WWW-Authenticate: Bearer resource_metadata="https://<sunucu>/.well-known/oauth-protected-resource/mcp", scope="scrawl"`; bu başlık istemcinin giriş akışını başlatır (Claude 200'deki başlığı saymaz, 401 şart).
- `GET /.well-known/oauth-protected-resource/mcp`: `{ resource: "https://<sunucu>/mcp", authorization_servers: ["https://<sunucu>"], scopes_supported: ["scrawl"], bearer_methods_supported: ["header"] }`. `resource` istemcinin yazdığı adresle birebir aynı olmalı; `SCRAWL_URL`'den türer.
- `GET /.well-known/oauth-authorization-server`: issuer `https://<sunucu>`, `authorization_endpoint: /oauth/authorize`, `token_endpoint: /oauth/token`, `registration_endpoint: /oauth/register`, `response_types_supported: ["code"]`, `grant_types_supported: ["authorization_code", "refresh_token"]`, `code_challenge_methods_supported: ["S256"]`, `token_endpoint_auth_methods_supported: ["none"]`, `client_id_metadata_document_supported: true`, `authorization_response_iss_parameter_supported: true`, `scopes_supported: ["scrawl", "offline_access"]`.
- **Hangi space'ler:** hesabın üyesi olduğu space'ler (`spaces.of(account)`); her araç `spaces.check` ile üyeliğe bakar. Kişisel space sunucuda olmadığı için (11. aşama) dışarıdaki ajan onu görmez; bu yüzden sunucuda `save_task`'te `list` zorunludur, araç bunu söyler.
- **`ServerFs`:** `VaultFs`'in `SpaceFiles` + `Blobs` üstündeki hali, space başına bir tane. `list` `entries`'ten önekle (`inside(key)`), `readText` blob dosyasından, `writeText` metni `blobs.take` ile alıp `files.write(space, path, taken, ifMatch, by)` ile; `move`, `remove`, `mkdir` birebir. Yazınca `onChange` çalışır, canlı kanal "değişti" der, kişinin açık uygulaması bir iki saniyede yeniler: ajanın yazdığı kart ekranda belirir.
- **Dizin ve arama:** `.scrawl/index/` sync'e girmediği için sunucuda yoktur; `records` kayıt dosyalarını okur (SQLite ve blob için ucuz). `search` space'in dosyalarından dizin kurar ve space'in `seq`'iyle önbellekler.
- Dosya sınırı `SCRAWL_MAX_FILE_MB` aynen; `read` ve `write` 1 MB metin.

### 7.2 Giriş: sunucu kendi yetki sunucusudur

SDK token vermez, yalnız denetler; yetki sunucusu bizim olur ve küçüktür: iki metadata belgesi, dört uç, üç tablo. Dış bir kimlik sağlayıcı yok; hesaplar zaten sunucuda.

- **İstemci kaydı:** iki yol, ikisi de bizim tarafta elle kayıt istemez.
  - *CIMD* (Client ID Metadata Document, spec'in tercihi): `client_id` bir HTTPS adresidir; sunucu o adresten JSON belgeyi alır (`client_name`, `redirect_uris`), `redirect_uri`'yi oradakilerle karşılaştırır. Claude Code, claude.ai ve ChatGPT böyle gelir. Belge 24 saat önbelleklenir. Alma kuralları (SSRF): yalnız `https`, herkese açık bir alan adı (özel ve loopback adresler reddedilir), 5 saniye, 64 KB, yönlendirme izlenmez.
  - *DCR* (`POST /oauth/register`, RFC 7591): CIMD'si olmayan istemci için. `client_name` ve `redirect_uris` kaydedilir, `client_id` rastgele; gizli anahtar yok (herkese açık istemci). Tablo `oauth_clients (id, name, redirect_uris, created_at)`.
  - Yönlendirme adresleri istemciden gelir, bizde liste yoktur: Claude `https://claude.ai/api/mcp/auth_callback`, ChatGPT `https://chatgpt.com/connector_platform_oauth_redirect`, Claude Code `http://localhost/callback` ve `http://127.0.0.1/callback`. Loopback adreslerde port karşılaştırmaya girmez (RFC 8252; Claude Code her oturumda başka port kullanır).
- **`GET /oauth/authorize`:** `client_id`, `redirect_uri`, `response_type=code`, `code_challenge` (yalnız S256), `state`, `resource` (`https://<sunucu>/mcp` olmalı), `scope`. Sunucunun kendi sayfası açılır (`pages.ts`'in üslubunda, `/join` gibi): *"Let Claude use your Scrawl account on scrawl.kaanarslan.dev? It will see the spaces you're in."*, e-posta ve şifre, **Allow** ve **Cancel**. Girişte `/sessions`'ın kaba kuvvet sınırı (dakikada 5). Doğruysa 10 dakikalık, tek kullanımlık bir kod üretilir (özeti saklanır; client, redirect_uri, code_challenge, resource, hesap, scope ile) ve `code`, `state`, `iss` ile geri yönlendirilir. Çerez yok; her bağlantıda şifre sorulur, nadir bir iş.
- **`POST /oauth/token`** (`application/x-www-form-urlencoded`):
  - `grant_type=authorization_code` + `code` + `code_verifier` + `redirect_uri` + `resource`: PKCE ve diğerleri tutuyorsa access token (256 bit rastgele, 1 saat) ve refresh token (256 bit, 90 gün). Kod bir kez; ikinci kullanımda `invalid_grant` ve o kodla verilen token'lar iptal.
  - `grant_type=refresh_token`: yeni access ve yeni refresh (döndürme); eskisi aynı cevapta geçersiz olur. Geçersiz, süresi dolmuş ya da kesilmiş refresh'e `invalid_grant` (Claude bunu bekler, başka kod bağlantıyı bozar).
  - Token'ların yalnız özeti durur. Audience `resource`tur; `/mcp` yalnız kendi token'ını kabul eder.
- **Tablolar:** ajan bağlantısı bir `devices` satırıdır (`name` istemcinin adı, `token_hash` şimdiki access token'ın özeti, `seen_at`, `revoked_at`); yanında `agents (device_id PK, client_id, client_name, scope, access_expires_at, refresh_hash, refresh_expires_at, created_at)`. Böylece `/mcp`'nin bearer denetimi bugünkü `devices` denetimidir, süreye bakmak eklenir. `oauth_codes (code_hash PK, client_id, redirect_uri, code_challenge, resource, account_id, scope, expires_at, used_at)`.
- **Kesme:** hesabın sunucu sayfasında Agents listesi ("Claude · connected 15 Oct · last used 2 min ago", **Disconnect**); kesilen bağlantının access ve refresh'i biter, bir sonraki istek 401 alır ve Claude yeniden giriş ister. Hesap çıkarılınca bugünkü gibi hepsi biter.
- **Süreler:** istemciler discovery, register ve token uçlarına 10 saniye verir; hepsi SQLite'ta anında cevaplanır. CIMD belgesini alma 5 saniyeyle sınırlıdır ve önbelleklidir.
- **HTTPS:** Anthropic ve OpenAI sunucuya internetten gelir; Caddy ya da Cloudflare Tunnel (`design/server.md`, 8. bölüm) ikisi de olur. `SCRAWL_URL` `https://` değilse `/mcp` ve OAuth uçları yalnız `localhost`'ta açılır; yerel denemede Claude Code `http://localhost:8080/mcp`'ye bağlanır.

### 7.3 Araçlar sunucuda

Aynı `packages/agent`; fabrikaya hesap, `ServerFs` üreticisi, aktör ("Claude · Kaan") ve `Actor { account, device }` verilir. `save_task`'te `list` zorunludur. `spaces` üyelik listesinden gelir. Hiçbir araç sunucu yönetimi yapmaz.

## 8. Arayüz

**Settings › Agents** (bilgisayar), mockup'ı `design/mockups.html`'de "Ajanlar: bilgisayarda ve sunucuda" bölümü (15 Ekim; onay bekliyor), sonra kodlanır. Taslağın söylediği:

- Üstte tek cümle: *"An agent reaches your notes the way you do: here, the folders on this computer; on the web and your phone, a Scrawl server."*
- **Bu bilgisayarın bloğu** ("Laptop · Personal · Acme · Side projects"): `npx -y @scrawlnotes/mcp` satırı ve Copy; "Add to" satırında **Claude Desktop** (`.mcpb`'yi açar), **Claude Code** (`claude mcp add` satırını kopyalar), **Cursor** (deeplink). Bir sunucuya bağlı değilken altında kesik çizgili bir kutu: *"Claude and ChatGPT on the web and on your phone can't reach this computer. Connect them to a Scrawl server."* ve **Connect a server…** (Add space'teki aynı pencere).
- **Her bağlı sunucu için bir blok** ("scrawl.kaanarslan.dev · kaan@…"): adres `https://scrawl.kaanarslan.dev/mcp` ve Copy; "Add to" satırında **Claude** (küçük pencerede adımlar: claude.ai › Settings › Connectors › Add custom connector, adres ve Copy, giriş sayfası; "Added on the web, it works on your phone and in Claude Desktop too"), **ChatGPT** (Settings › Apps & Connectors › Advanced › Developer mode › Create; adres), **Claude Code** (`claude mcp add --transport http scrawl https://…/mcp` kopyalanır). Bloğun içinde bu hesaba bağlı ajanların listesi (ad, ne zaman bağlandı, en son ne zaman; ··· menüsünde Disconnect). Sunucunun kendi sayfasında (Settings › Spaces › sunucu) hesabın altında tek bir Agents satırı adları sayar ve **Manage…** ile buraya getirir; liste tek yerde durur.
- **Telefonda** Settings › Agents yalnız sunucu bloklarını gösterir; bilgisayar bloğu yoktur, çünkü telefondaki Claude ancak sunucuya ulaşır. Sunucu yoksa tek cümle: *"Claude on your phone can reach your notes through a Scrawl server. Connect one on a computer."*
- Metinler `packages/i18n/src/en.ts`'e girer. Rehberin uzun hali `apps/server/README.md`'de "Agents" bölümü ve `apps/mcp/README.md`.

## 9. Güvenlik

- Token'lar ve kodlar yalnız özetle durur; access 1 saat, refresh 90 gün ve döner; kod 10 dakika ve tek kullanım; PKCE S256 zorunlu; `resource` ve audience denetimi; `iss` yönlendirmede verilir.
- `/oauth/authorize` sayfası şifreyi yalnız form gövdesinde alır; token ve kod hiçbir zaman URL'de durmaz (yalnız yönlendirmedeki `code`, tek kullanımlık ve kısa).
- CIMD belgesi alma: yalnız `https`, herkese açık adres, 5 saniye, 64 KB, yönlendirme yok, 24 saat önbellek. DCR kayıtlarında `redirect_uris` `https` ya da loopback olmalı.
- Ajan hesabın yetkisinden fazlasını alamaz; her araç üyeliği sunucuda denetler, rol kuralları aynen (yazma Member'a da açık, bugünkü gibi).
- Keys dosyaları, `.scrawl/` ve ekler iki kapıda da kapalı; kalıcı silme yok; `write` ve `read` 1 MB.
- Kaba kuvvet: giriş sayfasına `/sessions`'ın sınırı; `/oauth/token` ve `/oauth/register` adres başına dakikada 30.
- stdio komutu yalnız ayar dosyasındaki ve `--vault`'taki klasörlere dokunur; başka yol kabul etmez (`..` ve mutlak yol reddedilir, sunucudaki `checkPath` gibi).

## 10. Testler

- **Araçlar (`packages/agent`, `MemoryFs`):** pano kurma, kart ekleme, türle sütuna taşıma, yorum, brief; geçerli faz dışına çıkmama; koleksiyon kurma ve `records`'ta koşul, sıralama, formül ve rollup; `save_record`'da ad ve kodla link çözme, uymayan değerin yazılıp `problems`'ta dönmesi; görev ekleme ve kapatma, Inbox varsayılanı; `write`'ın notun önceki halini sürüm olarak bırakması ve `ifMatch`; Keys, `.scrawl/` ve eklerin reddi; aktör metni; `scrawl://guide`'ın okunması; ada göre çözme (tek eşleşme yolunu söyler, iki eşleşme yazmaz ve adayları döndürür, eşleşme yoksa en yakınlar; link ve görevin `record`'u için de), `tree`'nin tür süzgeci, `spaces`'in bugünü ve kişiyi söylemesi.
- **Sözleşme:** aynı araç testleri `ServerFs` üstünde, test içinde açılan bir sunucuya karşı da koşar; iki kapı aynı davranmalı.
- **Sunucu:** metadata belgeleri; DCR; CIMD (sahte belge sunucusuyla; `http`, özel adres ve büyük belge reddi); PKCE yanlış verifier → `invalid_grant`; kodun ikinci kullanımı; refresh döndürme ve eskisinin geçersizliği; süresi dolmuş token → 401 ve `WWW-Authenticate`; yanlış `resource`; üyesi olunmayan space'in görünmemesi; `/mcp` ile `tools/list` ve bir çağrı; yazmanın `changes`'ta ve canlı kanalda görünmesi; Disconnect sonrası 401; eski (2025) protokolle gelen istemcinin cevap alması.
- **Bilgisayar:** ayar dosyasının üç işletim sisteminde bulunması, `--vault`, `space.json`'u olmayan klasörün Personal sayılması, iki space'in `spaces`'ta görünmesi, stdout'a protokol dışında hiçbir şey yazılmaması.
- **Elle (bitti ölçütü):** Claude Code bu bilgisayardaki OneDrive space'inden panodan kart alıp koleksiyona kayıt yazıyor, insan pencereye dönünce görüyor; Claude Desktop `.mcpb` ile kuruluyor; claude.ai'da connector ekleniyor ve telefondaki Claude sunucudaki space'te bir şirkete görüşme ekliyor, açık uygulamada saniyeler içinde beliriyor; ChatGPT Developer mode'da aynı sunucuya bağlanıyor; Cursor deeplink'le kuruluyor.

## 11. Dilimler

1. **Araçlar:** `packages/agent` (on dört araç, `scrawl://guide`, aktör, ada göre çözme), testleri `MemoryFs` üstünde.
2. **Sunucudaki kapı:** `ServerFs`, `POST /mcp`, metadata belgeleri, CIMD ve DCR, giriş sayfası, token ve refresh, `devices` ve `agents` tabloları, Disconnect; claude.ai'da (web ve telefon), ChatGPT'de ve Claude Code'da deneme; `scrawl.kaanarslan.dev/mcp`.
3. **Bilgisayardaki kapı:** `NodeFs`, `apps/mcp` (`scrawl-mcp`, ayar dosyası ve `--vault`, stdio), npm paketi, `.mcpb` paketi; Claude Code ve Claude Desktop ile deneme.
4. **Arayüz ve rehber:** Settings › Agents mockup'ı, sonra bilgisayar ve telefon ekranı; hesabın sunucu sayfasında Agents; Cursor deeplink; README'lerde istemci başına adımlar.

Sonra: komut satırı yüzü (aynı paketin ikinci yüzü, ihtiyaç çıkarsa), sunucuda zamanlanmış ajan koşuları ve otomasyon (ajan sunucuda koşar, aynı araçlarla), ajan için ince yetkiler (salt okunur ajan, space'e göre), dosya izleme (masaüstünde anında yenileme), eklerin okunması.

## 12. Kararlar (15 Ekim 2026)

1. Tek MCP kodu, iki kapı; bizim barındırdığımız köprü yok. Kural: ajan notlara senin ulaştığın yerden ulaşır.
2. MCP'nin en yeni sürümü (2026-07-28) ve SDK v2; eski istemciler SDK'nın uyumluluğuyla.
3. On dört araç ve `scrawl://guide`; arayüzdeki her iş için araç yok, dosya biçimi sözleşmedir.
4. Keys, `.scrawl/` ve ekler ajana kapalı; ajan çöpe atar, kalıcı silmez.
5. Aktör "Claude Code · Kaan"; notun önceki hali her zaman sürüm olarak kalır.
6. Sunucu kendi yetki sunucusu: CIMD ve DCR, PKCE, giriş sayfası sunucunun; her bağlantı bir cihaz, hesabın sayfasından kesilir.
7. Bilgisayardaki kapı uygulamanın ayarlarını okur, uygulama açık olmak zorunda değil; `npx -y @scrawlnotes/mcp` ve `.mcpb`.
8. CLI şimdilik yok.
9. (Eklendi, onaylı.) Araçlar pano, koleksiyon ve listeyi ad ile de alır; ad birden fazlasına uyuyorsa yazmaz, adayları döndürür. `tree`'de tür süzgeci. Rehber "önce bak, varsa güncelle, belirsizse sor" der. Belli bir projeye ya da senaryoya bağlı hiçbir şey yok.
10. (Eklendi, onaylı.) Belirsizlik kuralı kayıtlara da uygulanır: link ve görevin `record`'u adla verilip birden fazla kayıt uyuyorsa araç yazmaz, adayları döndürür. `spaces` bugünün tarihini ve kişinin adını döner.


## 13. Yazılırken görülenler (15 Ekim 2026)

- **Kod:** `packages/agent` (`src/server.ts` araçları kurar; `read.ts`, `write.ts`, `records.ts`, `cards.ts`, `tasks.ts` araçların kendisi; `space.ts` ada göre çözme; `guide.ts` rehber; 13 test, biri gerçek MCP istemcisiyle). Sunucuda `src/agent.ts` (uçlar ve /mcp), `src/oauth.ts` (yetki sunucusu), `src/agentfs.ts` (`ServerFs`), `src/pages.ts`'te giriş sayfası, `db.ts`'te 2. göç; 7 test.
- **İstemci adı:** 5. bölümdeki gibi; sunucuda OAuth'tan.
- **Çakışma:** `ServerFs` yazarken dosyanın okunduğu andaki özetini `If-Match` verir; biri arada yazmışsa bir kez daha dener ve yazar. Araç düzeyinde yeniden birleştirme yok: iki bütün yazmadan sonrakisi kalır, uygulamanın sync'teki birleştirmesi burada işlemez. Küçük ekipte nadir; gerekirse sonra.
- **Token süresi ve SDK:** SDK'nın bearer denetimi süreyi gerçek saate göre ölçer; sunucu kalan süreyi kendi saatinden hesaplayıp verir, böylece testlerdeki sahte saat de çalışır.
- **Ajan anahtarı API'yi açmaz:** `devices`'taki bir ajan satırının token'ı `/api/v1/*`'de 401 alır (`agent-key`); yalnız `/mcp` içindir. Uygulamanın kendi cihaz anahtarı da `/mcp`'yi açmaz.
- **Hesap uçları:** `GET /api/v1/agents` hesabın bağlantıları (`id`, `client`, `connected`, `seen`), `DELETE /api/v1/agents/:id` keser. Arayüz 4. dilimde.
- **Elle deneme bekliyor:** Claude Code'dan `claude mcp add --transport http scrawl https://scrawl.kaanarslan.dev/mcp`; claude.ai'da custom connector; ChatGPT Developer mode. Sunucu imajı yeni sürümde `/mcp`'yi açar, veritabanı açılışta kendini yükseltir.
- **Bilgisayardaki kapı (3. dilim):** `apps/mcp`: `src/nodefs.ts` (`NodeFs`, Tauri köprüsünün Node hali; vault dışına çıkan yolu reddeder), `src/vaults.ts` (ayar dosyası üç sistemde: Windows `%APPDATA%\\app.scrawlnotes.desktop\\settings.json`, macOS `~/Library/Application Support/…`, Linux `$XDG_CONFIG_HOME` ya da `~/.config/…`; `vault` boşsa veri klasöründeki `Personal`; space'in adı klasördeki `space.json`'dan, yeri `source.provider`'dan), `src/main.ts` (komut satırı: klasörler ya da `--vault`, `--client`, `--help`, `--version`; `serveStdio`). `scripts/build.mjs` tek dosya `dist/scrawl-mcp.mjs` (1.8 MB, Node 20+), `scripts/bundle.mjs` manifest'i yazıp `mcpb pack` ile `dist/scrawl.mcpb` (350 KB; `user_config.folders` dizin, çoklu, isteğe bağlı; boşsa ayar dosyası; `--client Claude`). 5 test, biri derlenmiş komutla gerçek stdio istemcisi üstünden. `.github/workflows/mcp.yml`: her değişiklikte test, `mcp-v0.1.0` etiketinde npm'e `@scrawlnotes/mcp` (npm'de `scrawlnotes` organizasyonu ve `NPM_TOKEN` sırrı gerekir) ve GitHub release'e `scrawl.mcpb`.
- **stdio'da istemci adı:** eski (2025) açılışla gelen istemcide `getClientVersion()` adı verir (test istemcisi "test-client" olarak yazdı); yeni sürümle gelende ad yoksa `--client` ya da "Agent". Bu bilgisayarda komut argümansız kişisel vault'u buldu (`OneDrive\\Belgeler\\Notes`).
