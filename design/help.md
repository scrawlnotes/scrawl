# Help

Durum: 7 Kasım 2026'da onaylandı. Pencerenin görünüşü `design/mockups.html` › Help penceresi; oradaki konu listesi eskidir, güncel liste bu belgenin 3. bölümündedir.

## 1. Amaç

Uygulamanın içinde, uygulamayı anlatan bir yardım. Bugün yalnız Welcome to Scrawl notu var; o da ilk adımları anlatır, bir özelliğin nasıl kullanıldığını değil. Help her özelliği, her app şablonunu ve Scrawl sunucusunu kendi notunda anlatır.

## 2. Kararlar (7 Kasım)

- Help ayrı bir penceredir, Settings gibi uygulamanın üstünde ortada açılır. Solda konular, ortada not, sağda On this page.
- Her sayfa bir nottur; uygulamanın notu gösterdiği gibi görünür, okunur, içine yazılmaz.
- Bölümlerle anlatılabilen her konu tek nottur; bölümlerine On this page'den gidilir. Altında birden çok not olan konular yalnız Apps, Business apps, Personal apps ve Scrawl server.
- Her app ayrı bir nottur. Büyük app'in her ekranı notunda ayrı bir bölümdür; listeye üçüncü seviye gelmez.
- Getting started, Welcome to Scrawl notunun kendisidir. Welcome notu ilk açılışta bugünkü gibi sekme olarak açılmaya devam eder.
- Search'ün Actions'ında Help: pencereyi açar. Help notlarının metni aramada çıkmaz.
- Notlar arası link: bir nottaki başka bir Help notunun linki o notu Help'te açar.
- Settings listenin en altındadır.

## 3. Konular

Sıra yeni kullanan birinin ihtiyacına göredir: önce günlük işler, sonra kayıt tutma, sonra bulma ve düzenleme, en sonda cihazlar, ekip, ajan ve kurulum.

| # | Konu | Not | İçinde |
|---|---|---|---|
| 1 | Getting started | `welcome.md` | Welcome to Scrawl |
| 2 | Notes | `notes` | yazma ve biçim çubuğu, `/` menüsü, tablolar, resim ve dosyalar, callout'lar, To task ve To card, History, Export, kopyalama |
| 3 | Quick notes | `quick-notes` | kart kart kısa notlar, sabitleme, arama, sıralama |
| 4 | Task lists | `task-lists` | görevler ve alt görevler, section'lar, Today, Upcoming ve takvimi, etiketler, filtreler, Favorites |
| 5 | Boards | `boards` | kartlar, sütunlar ve türleri, alanlar, fazlar, Software, Issue tracking ve CRM şablonları, süzme |
| 6 | Keys | `keys` | `.env` dosyası, gruplar, gizli değerler, Copy as .env, Text, güvenlik |
| 7 | Collections | `collections` | kayıt ve tablo, Fields ile form, bağlantılar, formül, lookup ve rollup, kurallar ve düğmeler, takvim, CSV ve Excel |
| 8 | Apps | `apps-how`, `apps-editing`, `apps-building` | How apps work; Editing an app (elle ve ajanla); Building an app with an agent |
| 9 | Business apps | her app bir not | Customers: CRM, Customer support, Appointments and bookings, Content calendar, Field service, Consulting. Money: Sales and invoicing, Budget and spending, Stock and purchasing, E-commerce, Assets and maintenance, Subscriptions and memberships. Work: Project management, Product development, Recruiting, Contracts and renewals, Time off and team, Goals, Incidents and actions |
| 10 | Personal apps | her app bir not | Money and home: Personal finance; Home, car and documents; Recipes and meal plan. Health: Health, Habits and goals, Gym, Sport and training. Life: Travel, Shared expenses, Job search, People and birthdays, Reading and watching |
| 11 | Search | `search` | neleri bulduğu, eşleşme, Actions |
| 12 | Spaces and folders | `spaces` | space'ler ve sırası, klasörler, taşıma ve Rename, linkler, Files, Trash |
| 13 | Sync | `sync` | nasıl çalıştığı ve offline, OneDrive, Scrawl server, öbür cihazlar, OneDrive klasörü paylaşma, sorunlar |
| 14 | Scrawl on your devices | `devices` | web, masaüstü (kurulum, güncelleme, tepside çalışma), telefon (ana ekrana ekleme) |
| 15 | Working together | `working-together` | space paylaşma, görev ve kartı birine verme, Activity |
| 16 | Chat | `chat` | room'lar, direct message'lar, bildirimler, arama, dışa aktarma; yalnız sunucuda |
| 17 | Agents | `agents` | ne yapar, bilgisayarda ve web'de bağlama, örnek istekler, kimliği, erişemediği yerler |
| 18 | Scrawl server | `server-about`, `server-setup`, `server-running` | What a server is (ne ekler, kimin için); Setting it up; Running it (yedek, dışa aktarma, güncelleme, ajanlar) |
| 19 | Settings | `settings` | Profile, Appearance, Spaces, Agents, Logs |

**App notunun iskeleti:** ne işe yaradığı; kurarken sorulanlar; ekranları; Today'e ne geldiği; hangi app'lerle birlikte çalıştığı; ajana neler sorulabileceği. Büyük app'te her ekran bir bölümdür (CRM: Companies and people, Deals, Activities, Home).

**Metin:** İngilizce, Welcome notunun dili gibi kısa ve sade; görüneni değil işi anlatır, kısayol anlatmaz. Yer söyleyen satırlar (kenar çubuğu, Browse) telefonda telefona göre yazılır.

## 4. Ekranlar

**Masaüstü ve web.** Kenar çubuğunun en altında, Settings'in altında Help. Pencere Settings'in kalıbındadır, ondan büyüktür (en fazla 1080 × 740). Esc ve × kapatır; açılınca Getting started'dadır.
- Solda konular. Altında notları olan konuya tıklamak onu açar ya da kapatır; açık notun konusu açık durur. Business apps ve Personal apps app seçme penceresindeki gruplarla yazılır.
- Ortada not; üstünde, bir konunun altındaysa konunun adı. Notun sonunda Previous ve Next, listedeki sırayla.
- Sağda On this page: notun `##` başlıkları; okunan işaretli, tıklayınca oraya kayar. İki başlıktan az olan notta ve 860 px'ten dar pencerede görünmez.
- Dar pencerede (640 px'ten dar, Settings gibi) önce konular bir liste, not kendi sayfası, başta geri düğmesi.

**Telefon.** Browse'un en altında, Settings'in altında Help satırı. Help sayfası konuların listesi; altında notları olan konunun satırında notları yazar ve kendi sayfasını açar (gruplar başlık olarak). Not kendi sayfasında açılır. On this page ve Previous/Next yoktur. Search'ün Help'i Browse'da Help'i açar.

## 5. Teknik tasarım

- **Notlar:** `apps/web/src/help/<id>.md`; telefonda farklı yazılan not için yanında `<id>.phone.md`. Getting started `apps/web/src/welcome.md` ve `welcome.phone.md`'dir, kopyası yoktur.
- **Liste:** `apps/web/src/help/index.ts`: konular sırayla `{ id, label, pages? }`, sayfa `{ id, label, group? }`. Sayfası olmayan konunun notu kendi `id`'sidir. Adlar `en.ts`'te (`help.*`).
- **Yükleme:** notlar `import.meta.glob('./*.md', { query: '?raw', import: 'default' })` ile, yalnız açılınca yüklenir; uygulamanın açılışına yük bindirmez.
- **Gösterme:** editörün salt okunur görünümü `createViewer` (History'nin kullandığı). Not bir kaydırma kutusunun içindedir, Previous/Next onun altında aynı kutudadır.
- **Linkler:** notta `[Sync](sync)` gibi, adresi bir notun `id`'si olan link o notu açar; `https:` linki tarayıcıda açılır. Masaüstünde düz tıklama yeter (not okunur olduğu için Ctrl gerekmez); telefonda `onLinkTap`.
- **On this page:** editör paketinde `headingsOf(state)`: markdown ağacının en üst seviyesindeki `ATXHeading2`'ler, metni baştaki emoji olmadan, yeriyle. Okunan başlık: kutunun üstünden geçmiş son başlık (`lineBlockAt(from).top` + `documentTop`); kutunun sonuna gelinince son başlık. Tıklayınca kutu o başlığa kayar.
- **Bağlantılar:** `App.tsx`'te `dialog.kind === 'help'`; kenar çubuğunda `windowRow` ile Help satırı (`help` simgesi); Search'ün Actions'ında `help`. `Phone.tsx`'te `help` ve `helpTopic` sayfaları, notun sayfası `helpNote`.
- **Dokunulmayanlar:** core, sunucu, ajan, masaüstünün Rust tarafı. Yayın yalnız web.

## 6. Testler

- `headingsOf`: `##` başlıkları sırayla ve yeriyle verir; kod bloğundaki ve alıntıdaki `##` sayılmaz; `#` ve `###` sayılmaz; baştaki emoji atılır.
- Liste ve dosyalar: listedeki her notun dosyası var, her dosya listede; her `.phone.md`'nin bilgisayar notu var; notlardaki her Help linki var olan bir notu gösterir; aynı `id` iki kez yok.

## 7. Dilimler

1. Pencere, telefon sayfaları, On this page, linkler ve app'ler dışındaki 21 not (Getting started, tek notluk 14 konu, Apps'in 3 ve Scrawl server'ın 3 notu). Business apps ve Personal apps notları yazılana kadar listede yoktur.
2. Business apps: 19 not.
3. Personal apps: 12 not.
