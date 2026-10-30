# App'in girişi, menüsü ve satırları (taslak)

25 Ekim 2026'da onaylandı, açık sorular önerilerle kapandı (10. bölüm). Kod yazılmadı. PLAN'da 20. aşama, Dosya ve klasör yetkisinden önce; Roadmap fazı 20, kartlar ROA-287–289. Mockup: `design/mockups.html`, "App'in girişi, menüsü ve satırları" bölümü.

## 1. Amaç

Bugün bir app yalnız bir klasör. Kullanıcının iki itirazı var:

- **Menü yok:** Kenar çubuğu app'in içindeki her koleksiyonu, panoyu ve tanıtım notunu eşit satırlar olarak diziyor. Gym'de 6 satır var, Spare parts'ta (CRM, Sales and invoicing, Stock and purchasing) 15. Hangisinin ana ekran, hangisinin başka bir kaydın satırları olduğu belli değil. App'e tıklayınca klasör açılıyor; karşılayan bir ekran yok. "Karışık işlerde burası tam bir çöplük oluyor."
- **Satırlar ayrı ekranda:** Yeni kayıt penceresi bağlı tabloları göstermiyor (`recordLayout`, yalnız onChange'li koleksiyonda gösteriyor). Yeni bir program için önce program kaydedilip pencere yeniden açılıyor, sonra maddeler ekleniyor; ya da Program items'a gidilip her satırda program seçiliyor. Ana tabloda bir kaydın satırları görünmüyor.

Karar (25 Ekim): app dosya işinden çıkar. **Kendi girişi ve kendi menüsü olan bir uygulama** gibi açılır, Odoo'daki ve HubSpot'taki gibi. Bir kaydın satırları o kaydın içinde ve ana tabloda, satırın altında yazılır.

## 2. İlke: dosyalar aynı, gösterilen uygulama

- **Diskte hiçbir şey değişmez:** app yine bir klasör; koleksiyonlar, panolar ve notlar yerinde. Sync, ajan, dışa aktarma ve linkler bugünkü gibi çalışır.
- **Kullanıcıya dosya olarak gösterilmez:** kenar çubuğunda app tek satırdır; içi app'in kendi sekmesinde, menüsüyle açılır.
- **Düzen yalnız ayar:** menü `_app.json`'da, satır olmak bağlı tablo bloğunda durur. İkisi de yoksa şablondan çıkar; kurulu app'lerin dosyalarına dokunulmaz.
- **Hiçbir şey saklanmaz:** app'in ··· menüsünde **Show files** klasörü bugünkü gibi açar. Arama ve ajan her şeyi bulur.

## 3. Kenar çubuğu

- **App tek satır:** klasörün ağaçtaki yerinde durur, açılır kapanır oku yoktur. İkonu şablonun ikonu (tek şablonlu app) ya da app ikonu (birden çok şablon).
- **Tıklayınca** app'in sekmesi açılır (5). Açıksa ona geçilir.
- **··· menüsü:** Home, About Spare parts, Edit menu…, Add to app…, Edit app…, Show files, Move to, Rename, Delete app. Tanıtım notu artık ağaçta değil, burada.
- **Show files:** app satırının altında klasörün içi bugünkü gibi açılır, satırın sağında **Hide files**. Tercih cihazda kalır.
- **Telefonda** Browse'da aynısı: app tek satır, dokununca app'in sayfası (7).

## 4. Satırlar

### 4.1 Ne zaman satır

Bir koleksiyonun kayıtları yalnız başka bir kaydın içinde anlamlıysa onun **satırlarıdır**: siparişin kalemleri, programın maddeleri, tarifin malzemeleri. Bunu ana koleksiyonun bağlı tablo bloğu söyler: Fields'ta bloğun ayarında **Lines of this record** onay kutusu (`lines: true`).

- Bir koleksiyonun tek sahibi olur. Workout items hem Workouts'ta hem Exercises'te tablo olarak görünür; sahibi Workouts'tur, Exercises'teki tablo bugünkü gibi geçmişi gösterir.
- Satırın sahibine bağı zorunlu olur; yeni satırda kendiliğinden dolar.
- Seçenek kapalıyken her şey bugünkü gibidir: ayrı koleksiyon, ayrı ekran. "Her case bu şekilde çalışmaz": Payments siparişin içinde görünür ama kendi ekranı da vardır, satır değildir.
- **Kendi penceresi olan kayıtlar satır olmaz:** Products, Companies, Exercises gibi kendi başına yaşayan kayıtlar her yerde kendi ekranında ve penceresinde açılır. Bir sipariş satırındaki Product hücresi linktir; tıklayınca ürünün kendi penceresi açılır, satırın içinde açılmaz.

### 4.2 Satır olunca

- **Menüde yok:** app'in menüsünde görünmez (5.2). App dışındaki bir klasörde ağaçta sahibinin altında, girintili durur.
- **Yeni kayıt penceresi:** satır tablosu hemen çıkar. + Add line ile eklenen satırlar taslaktır (onChange'in taslak satırları, `design/gym.md` 4.1); Create kaydı ve satırlarını bir kerede yazar, Cancel hiçbirini yazmaz. Kayıtlı bir kayıtta satırlar bugünkü gibi yerinde yazılır.
- **Ana tabloda:** her satırın başında ▸ ve sağında satır sayısı ("3 lines"). ▸ satırı açar: alt satırlar girintili gelir, bloğun sütunlarıyla, yerinde yazılır; en altta **+ Add line**. Bloğun gruplaması ve toplamı burada da geçerli. Görünümün ··· menüsünde **Expand all**, **Collapse all** ve **Lines under rows** (açık). Açık satırlar cihazda hatırlanır.
- **Telefonda:** liste satırının sağında satır sayısı ve ▾; dokununca satırlar altında açılır, onay kutusu olanlar orada işaretlenir. Yeni kayıt sayfasında satırlar Save'den önce eklenir (bugün telefon formu satırları kayıttan sonra gösteriyor).
- **Çöp:** ana kayıt çöpe gidince satırları da gider; geri gelince birlikte gelir (10.1).

## 5. App'in sekmesi

### 5.1 Üst satır

- Solda app'in ikonu ve adı.
- **Modüller:** Home ve her şablon için bir modül, şablonun kısa adıyla: CRM, Sales, Stock. Tek şablonlu app'te modül satırı yoktur; menü doğrudan app adının yanındadır (Gym: Home · Workouts · Programs · Exercises).
- Sağda app'in ··· menüsü (3'teki).

### 5.2 Menü

- Modülün altındaki satır onun menüsüdür: ekranlar, şablonun verdiği sırayla. Bir ekran bir koleksiyon ya da pano, istenirse bir görünümüyle (Subscriptions › Active).
- **Satırlar menüde yoktur** (4). Tanıtım notu da yoktur, ··· menüsündedir.
- **Ortak parçalar** onları kuran her modülde görünür: Companies CRM'de ve Sales'te, Products Sales'te ve Stock'ta. Aynı koleksiyondur; adı her yerde aynı.
- Not klasörü (Customer support'un Saved replies'ı) ekranda notlarının listesidir; not kendi sekmesinde açılır.
- **Ctrl+tık** (Mac'te ⌘) ekranı kendi sekmesinde açar, bugünkü koleksiyon sekmesi gibi.

### 5.3 Ekran

- Menüde seçilen ekran bugünkü koleksiyon ya da pano ekranıdır: görünümleri, Search, Fields, Add record. Adı tekrar yazılmaz; menüde seçilidir.
- Kayıt penceresi, kurallar, düğmeler bugünkü gibi.
- Sekme yerini tutar: başka sekmeye geçip dönünce aynı ekran açık. Kenar çubuğundan app'e tıklamak Home'u açar.
- Status bar bugünkü gibi ekranın sayısını ve sırasını söyler.

### 5.4 Home

App'in girişi. Yukarıdan aşağı:

- **Today:** app'in bugün ve geçmişte kalan işleri, Today'deki gibi: Gym'de programın günü Start ve Didn't go ile, CRM'de bugün takibi olan teklif. Yalnız varsa görünür.
- **Modül kartları:** her modül bir kart; içinde ekranları, her birinin sayısıyla. Sayı ekranın görünümünün kayıt sayısıdır ("12 open"), pano için açık kart sayısı. Kontrolden geçmeyen kayıtlar sarı "3 to check". Bir satıra tıklayınca o ekran açılır.
- **Tek şablonlu app'te** modül kartı yerine her ekran bir kutu: büyük sayısı, altında ne olduğu, sonra görünümünün ilk dört kaydı. Gym'de Workouts "8 this month" ve son gidişler, Programs ve programlar, Exercises "1 to check" ve kontrolden geçmeyen hareket başta.

### 5.5 Şablonsuz app

App bir şablondan gelmek zorunda değil. Ajan ya da kişi app'i sıfırdan kurar; girişi ve menüsü şablondan kurulanınkiyle aynı.

- **Dosyası:** `_app.json`'da `templates` boş, `menu` var. İsteğe bağlı `icon`: app'in ikonu, app ikonları arasından (yoksa app ikonu).
- **Kişi:** New app sihirbazının şablonlar adımında en sonda **Blank app**: ad sorulur, klasör ve `_app.json` yazılır, app'in sekmesi açılır. Home boşken "Add a screen" der.
- **Ekran eklemek:** Home'da ya da app'in ··· menüsünde **New collection**, **New board**, **New note**; açılan Create penceresinde yer app'in klasörüdür, modülü seçilir (bir modül varsa sorulmaz). Yapılan menüye eklenir. Var olan bir koleksiyon Edit menu'nün + Add screen'iyle eklenir.
- **Modüller:** başta tek ve adsızdır; modül satırı yoktur, tek şablonlu app gibi. Edit menu'den ikinci modül eklenince modül satırı çıkar.
- **Satırlar:** Fields'ta Lines of this record ile, şablondaki gibi.
- **Menüsü yoksa:** klasördeki koleksiyonlar ve panolar ad sırasıyla, satırlar ve notlar dışında. Ajanın elle yazdığı bir `_app.json` da böyle açılır.
- **Edit app:** yoktur; cevaplanacak soru yok. **Add to app** çalışır: eklenen şablonun modülü var olanların sonuna gelir.
- **Tanıtım notu:** yoktur; ··· menüsünde About görünmez. Kişi bir not yazıp menüye ekleyebilir.
- **Uygulama dışından eklenen:** ajan ya da Files ile klasöre konan koleksiyon kendiliğinden menüye girmez; Edit menu'de "In the folder, not in a menu" altında görünür, oradan eklenir.

## 6. Edit menu

App'in ··· menüsünde **Edit menu…**. Ortada bir pencere:

- Solda modüller, sağda seçili modülün ekranları; ikisi de sürüklenerek sıralanır, yerinde yeniden adlandırılır.
- Ekranın yanında göz: gizler. Gizli ekran menüde yoktur, dosyası yerindedir.
- **+ Add screen:** app'in klasöründeki bir koleksiyon ya da pano; kişinin kendi kurduğu da. Görünüm seçilebilir.
- **+ Add module:** boş bir modül; ekranlar sürüklenerek taşınır. Bir modül silinince ekranları ilk modüle geçer.
- **Home:** hangi modül kartlarının görüneceği, Today'in açık olup olmadığı.
- Altta satırlar soluk, sahibiyle: "Order lines · lines of Orders". Satırlıktan çıkarmak Fields'ın işi; burada yalnız söylenir.
- **Reset to template:** menüyü şablonun verdiğine döndürür.
- Save bir kerede yazar, toast'ta Undo. Telefonda sheet.

## 7. Telefon

- **Browse:** app tek satır, ikonuyla.
- **App'in sayfası:** başlıkta app'in adı, sağda ···. Today bölümü (varsa), sonra her modül bir grup: başlığı ve ekranları, sayılarıyla. Tek şablonlu app'te tek grup. Dokununca ekranın sayfası açılır, bugünkü koleksiyon sayfası.
- **Satırlar:** 4.2'deki gibi listede açılır; yeni kayıt sayfasında Save'den önce eklenir.
- Edit menu sheet olarak.

## 8. Teknik tasarım

### 8.1 Dosyalar

- **`_app.json`** isteğe bağlı `menu` alır:

  ```json
  "menu": {
    "modules": [
      { "name": "CRM", "template": "crm", "screens": [
        { "path": "Companies" }, { "path": "People" }, { "path": "Deals.board.json" }, { "path": "Activities" } ] },
      { "name": "Sales", "template": "sales", "screens": [
        { "path": "Orders", "view": "open" }, { "path": "Payments" }, { "path": "Companies" }, { "path": "Products" } ] }
    ],
    "hidden": ["Stock movements"],
    "home": { "today": true }
  }
  ```

  Yollar app klasörüne göre. `menu` yoksa şablonlardan çıkar (8.2); Edit menu ilk kaydedişte yazar.
- **`_collection.json`:** bağlı tablo bloğuna `lines?: true` (`LinkedBlock`). Kurulu app'lerde blokta yoksa şablonun parça bilgisinden okunur (8.2).

### 8.2 Core (`packages/core/src/apps/`)

- **`PieceInfo.lines?: string`:** satırı olduğu parçanın rolü: `order-lines` → `orders`, `program-items` → `programs`. Şablonlar yeni kurulumda bloğa `lines: true` yazar.
- **`AppTemplate.menu?(answers, app)`:** modülün ekranları, rolleriyle ve isteğe bağlı görünümüyle. Yoksa şablonun parçaları satırlar ve notlar çıkarılarak, `pieces()` sırasıyla.
- **`menuOf(app, collections, boards)`:** `_app.json`'daki menü, yoksa şablonlardan çıkan. Diskte olmayan ekranı atar; klasörde olup menüde olmayan koleksiyonu "Not in the menu" olarak Edit menu'ye verir.
- **`linesOf(collection, app?)`:** bir koleksiyonun satır koleksiyonları ve bağ alanları: bloktaki `lines`, yoksa şablonun `PieceInfo.lines`'ı rollerden.
- **`screenCount(collection | board, view?)`:** görünümün kayıt sayısı, kontrolden geçmeyen sayısı; pano için açık kart sayısı. Bugünkü `matchesConditions` ve `Computer.checks`.
- **Çöp:** `trashRecord` satırları da alır, geri alma birlikte (10.1).
- **Şablonsuz app (5.5):** `planApp` şablonsuz girdiyi kabul eder (bugünkü `apps.needsTemplate` yalnız ne şablon ne menü verilince); `AppFile` `menu?` ve `icon?` alır; `readAppFile` ikisini okur. `menuOf` menüsüz şablonsuz app'te klasörün koleksiyonlarını ve panolarını verir.

### 8.3 Web ve masaüstü

- **Sekme:** `app:<klasör>` (`items.ts`'e `appTab`, `appPathOf`). Sekmenin durumu: modül, ekran, ekranın görünümü; cihazda tutulur.
- **`AppView.tsx`:** üst satır, menü, Home, ekran. Ekran bugünkü `CollectionView` ya da `BoardView`; başlığı adı yazmadan.
- **Kenar çubuğu (`Sidebar.tsx`):** `TreeNode.app` olan klasör tek satır; Show files açıksa çocukları bugünkü gibi. ··· menüsü (`App.tsx` `appItems`) 3'teki sırayla.
- **Satırlar (`Collection.tsx`):** `recordLayout` yeni kayıtta `lines` bloklarını tutar; `RecordDialog` taslak satırları onChange'deki gibi yazar (`FormSave.drafted`). Tabloda satır açma: bugünkü tablo satırının altına `LinkedTable`'ın satırları, tablo sütunları yerine bloğun sütunlarıyla.
- **Fields.tsx:** bağlı tablo bloğunda Lines of this record.
- **Edit menu:** `AppMenuDialog.tsx`; oturumda `saveAppMenu` (`_app.json`'u yazar, Undo).
- **Telefon (`Phone.tsx`, `PhoneCollection.tsx`):** Browse'da app satırı, app sayfası, satırların açılması, yeni kayıt sayfasında satırlar.

### 8.4 Ajan (MCP)

- **Araç sayısı değişmez.**
- `tree` bir app'i `app: { modules: [{ name, screens }] }` ile verir; satır koleksiyonları `linesOf` ile.
- `create` app kurarken menüyü yazmaz (şablondan çıkar); `kind: "app"` ve `menu` ile menü değişir.
- **Şablonsuz app:** `create` `kind: "app"`, ad, şablon yok: boş app; `menu` ve `icon` verilebilir. Bir app'in klasöründe `create` ile kurulan koleksiyon ya da panoya `module` verilirse o modülün menüsüne eklenir.
- `records` ana kayıtla satır sayısını verir; `save_record`'a `lines: [{ … }]`: kayıt ve satırları bir kerede (yeni kayıtta taslak satırların karşılığı).
- **Rehber:** Apps bölümüne menü ve satırlar.

### 8.5 Sınırlar

- Menü ve satır yalnız gösterir; hiçbir dosya taşınmaz, silinmez. Gizli ekran Show files'ta ve aramada bulunur.
- Menü `_app.json`'la sync olur; paylaşılan space'te herkes aynı menüyü görür. Aynı anda iki kişi değiştirirse bugünkü sync kuralı.
- Dosya ve klasör yetkisi (22. aşama) bugünkü gibi: göremediği ekran kişinin menüsünde yoktur.

## 9. Şablonların menüsü

Her şablon bir modül; ekranlar bu sırayla. Satırlar menüde yok, sahibinin içinde.

| Şablon | Menü | Satırlar |
|---|---|---|
| CRM | Companies, People, Deals, Activities | – |
| Sales and invoicing | Orders, Payments, Companies, Products | Order lines (Orders) |
| Customer support | Requests, People, Feedback, Saved replies | – |
| Appointments | Appointments, People, Services | – |
| Projects | Projects, Work | – |
| Budget | Budget lines, Payments | – |
| Stock and purchasing | Products, Stock levels, Stock movements, Purchase orders, Locations, Companies | Purchase order lines (Purchase orders) |
| E-commerce | Orders, Returns, Payments, Products, Companies, Channels | Order lines (Orders) |
| Product development | Roadmap, Bugs, Feedback, Releases | – |
| Recruiting | Positions, Hiring, Candidates, Interviews | – |
| Assets | Assets, Maintenance | – |
| Content | Content | – |
| Subscriptions | Subscriptions, Plans, Companies | – |
| Contracts | Contracts, Companies | – |
| Time off | Leave requests, Employees, Holidays | – |
| Goals | Goals | Key results (Goals), Check-ins (Key results) |
| Incidents | Incidents, Actions | – |
| Field service | Work orders, Equipment, Companies, Technicians, Products | Work order lines (Work orders) |
| Consulting | Engagements, Time entries, Expenses, Deliverables, Companies | – |
| Personal finance | Transactions, Accounts, Bills, Categories | – |
| Home | Items, Documents, Vehicles, Home upkeep | – |
| Health | Appointments, Medications, Results, Vaccinations | – |
| Recipes | Recipes, Meal plan, Shopping list | Ingredients (Recipes) |
| Travel | Trips, Expenses | Bookings, Places, Packing (Trips) |
| Shared expenses | Expenses, Groups, Settlements | Shares (Expenses), Members (Groups) |
| Job search | Applications, Interviews, Companies | – |
| People | People | Moments (People) |
| Reading | Library, Lists, Years, Quotes | Log (Library) |
| Sport | Workouts, Plan, Exercises | Sets (Workouts) |
| Gym | Workouts, Programs, Exercises | Workout items (Workouts), Program items (Programs) |
| Habits | Habits, Goals | Check-ins (Habits) |

Stock levels ve Locations birden çok depoda kurulur; yoksa menüde de yok.

## 10. Kararlar

25 Ekim'de önerilerle kapandı.

1. **Ana kayıt çöpe gidince satırları:** birlikte gider, birlikte gelir. Satır sahibi olmadan anlamsız; bugün kalıyor ve sahipsiz satır oluyor.
2. **App'in kenar çubuğundaki yeri:** klasörün ağaçtaki yeri. App space'e aittir; paylaşılan space'te herkes aynı yerde görür. Ayrı bir "Apps" başlığında app hangi space'te olduğunu kaybederdi.
3. **Home'da Today:** açık; yalnız app'in o gün işi varsa görünür, Edit menu'den kapanır.
4. **Satırların tablodaki varsayılanı:** ▸ hep var, satırlar kapalı başlar; görünüm ayarıyla ▸ kalkar.
5. **9'daki sınıflama:** tablodaki gibi. Sport ve antrenman şablonu da değişir (Sets satır olur); şablonların birebir kalması gerekmiyor.

## 11. Testler

- **core:** `menuOf` her şablonun her cevabıyla: ekranlar diskte, satırlar ve notlar menüde değil; Spare parts'ta ortak parçalar iki modülde; `_app.json`'daki menü şablonun yerine geçiyor; gizli ve diskte olmayan ekran. `linesOf` blokta ve şablondan. `screenCount` görünüm ve kontrolle. Çöp: satırlarla birlikte ve geri.
- **Şablonsuz app:** `planApp` şablonsuz ve menülü; `readAppFile` `menu` ve `icon`; menüsüz şablonsuz app'in `menuOf`'u; Add to app'le şablon eklenince modülün sona gelmesi.
- **agent:** `tree`'de app ve menü; `save_record` `lines` ile yeni kayıt ve satırları bir kerede; `create` ile menü değiştirmek, boş app kurmak, `module` ile koleksiyonu menüye eklemek.
- **Tarayıcıda** (masaüstü ve telefon): Gym ve Spare parts'ta kenar çubuğu, Home, modüller, menü, Ctrl+tık; Show files; yeni sipariş penceresinde satırlar ve Create; Orders tablosunda ▸, yerinde yazma, + Add line; Edit menu'de sıralama, gizleme, Undo; telefonda app sayfası ve satırlar.

## 12. Dilimler

Önce mockup. Sonra:

1. **App'in sekmesi:** kenar çubuğunda tek satır ve ··· menüsü, Show files; sekme, modüller, menü, ekran; Home (Today ve kartlar); şablonların menüsü (9) ve `PieceInfo.lines`; telefonda Browse ve app sayfası; ajanın `tree`'si.
2. **Satırlar:** `lines` bloğu ve Fields; yeni kayıtta taslak satırlar (masaüstü ve telefon); tabloda ▸ ve yerinde yazma; telefonda listede açma; çöp; ajanın `save_record`'u ve `records`'u.
3. **Edit menu ve şablonsuz app:** pencere ve telefonda sheet, `_app.json`'da menü, Undo; Blank app, app'ten New collection / New board / New note; ajanın `create`'i (menü, boş app, `module`).
