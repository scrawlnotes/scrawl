# MCP testinin düzeltmeleri (taslak)

Durum: 19 Ekim 2026. Sunucu 0.2.14'te on beş araç, Scrawl space'inin `MCP Test` klasöründe elle denendi. Kullanıcı bulguların düzeltilmesini onayladı ve silmenin her yerde olmasını, ama geri alınabilmesini istedi. 2. bölümün yaklaşımı ve 7. bölümdeki ilk dört karar onaylandı; 1., 2. ve 3. dilim commit'li. Ajanın bir işi bitirirken yaşadığı sürtünme sonra ölçüldü ve 6. bölümde 5. dilim olarak eklendi; onun kararları (7. bölüm, 5–9) da onaylandı.

## 1. Testte çıkanlar

Numaralar sohbetteki listeyle aynı. 1 silme, 2. bölümde. 17 (bir kez gelen boş hata) geçiciydi, düzeltilecek bir şey yok.

| No | Ne oluyor | Nerede düzelir |
|---|---|---|
| 2 | Aynı `save_task` iki kez gidince görev iki kez ekleniyor | 3. bölüm |
| 3 | `create` aynı adla ikinci not açıyor ("Not Bir 2") ve bunu söylemiyor | 3. bölüm |
| 4 | "Kaan" yazınca "Kaan Arslan" bulunmuyor, "Kaan" adında olmayan bir kişi atanıyor | 3. bölüm |
| 5 | Sunucuda "bugün" UTC'ye göre; 00:00–03:00 arası dün oluyor | 5. bölüm |
| 6 | Not taşınınca fazın not bağlantısı kopuyor (uygulamada da) | 4. bölüm |
| 7 | Bozuk şema ve bozuk görev listesi "yazıldı" diye kabul ediliyor, okununca başka bir şey çıkıyor | 3. bölüm |
| 8 | 2026-02-30 gibi olmayan günler kabul ediliyor | 4. bölüm |
| 9 | Görev güncellenirken `section` yok sayılıyor; görev başka section'a ya da listeye taşınamıyor | 3. bölüm |
| 10 | Karta ve göreve not bağlanamıyor | 3. bölüm |
| 11 | İki kayda aynı kod verilebiliyor | 3. bölüm |
| 12 | `write` uygulamanın göstermediği dosyaları da yazıyor (`script.js`) | 3. bölüm |
| 13 | `read`, "Ne yapmalı?" gibi adı yazıldığı gibi alınca dosyayı bulamıyor | 3. bölüm |
| 14 | Bazı hata metinleri ne yapılacağını söylemiyor | 3. bölüm |
| 15 | `trash` adla çalışmıyor, ne attığını yanlış söylüyor | 2. bölüm |
| 16 | Kart alanına uymayan değerin hatası beklenen türü söylemiyor | 3. bölüm |
| 18 | Aramada birebir eşleşme, kelime eşleşmesinin altında kalıyor | 4. bölüm |

## 2. Geri alınabilir silme

### Bugün

| Silinen | Uygulamada | Ajanda |
|---|---|---|
| Not, görev listesi, pano, klasör, koleksiyon | Çöpe gider, geri alınır | `trash`, aynısı |
| Kayıt | Çöpe gider, geri alınır | `trash` kaydın `.md` yolunu alıyor ama bunu hiçbir yer söylemiyor |
| Görev (alt görevleriyle) | Onaydan sonra kalıcı olarak gider | Yok, yalnız kapatılır |
| Section (görevleriyle) | Onaydan sonra kalıcı olarak gider | Yok |
| Kart | Onaydan sonra kalıcı olarak gider (dosyaları çöpe) | Yok, yalnız Dropped'a; software ve simple panolarda Dropped yok |
| Sütun, faz, alan | Kartlar ve değerler kalır, veri kaybolmaz | `write` ile |
| Yorum, alt görev | Kalıcı olarak gider | Alt görev `remove: true` ile, yorum yok |

Yani geri alınamayan silme uygulamada da var. Ajana silme verirken bunu da kapatmak gerekiyor.

### Önerilen: silinen görev, section ve kart da çöpe gider

Çöp bugün `.scrawl/trash/` klasörü ve `index.json`'dan oluşuyor; dosyalar oraya taşınıyor, index nereden geldiklerini tutuyor. Silinen görev, section ve kart da oraya kendi küçük dosyalarıyla gider.

**Veri modeli.** Dosyanın adı bugünküler gibi silinme anıyla başlar: `2026-10-19 175012 Ana görev.task.json`. Index'teki satır aynı (`name`, `from`, `deleted`), `from` görevin listesi ya da kartın panosu olur.

- **Görev**, `*.task.json`: `{ "version": 1, "kind": "task", "section": { id, name } | null, "parent": id | null, "after": id | null, "tasks": [görev ve bütün alt görevleri, olduğu gibi] }`
- **Section**, `*.section.json`: `{ "version": 1, "kind": "section", "after": id | null, "section": { id, name }, "tasks": [section'ın görevleri ve alt görevleri] }`
- **Kart**, `*.card.json`: `{ "version": 1, "kind": "card", "column": { id, name, kind }, "phase": { id, name } | null, "after": id | null, "card": {kart, timeline, alt görevler ve değerlerle birlikte} }`

Görev ya da kart, dosyanın içinde bir "silindi" işaretiyle tutulmaz. Bunun iki nedeni var:
- **Boyut.** Bir görev yaklaşık 350 bayt. Bir kart ise timeline'ı, alt görevleri ve açıklamasıyla 3–10 KB tutuyor. Silinenler dosyada kalırsa liste ve pano hiç küçülmez. Her kayıtta, her sync'te ve sunucudaki her sürümde bütün dosya yeniden yazılır. Yoğun bir panoda birkaç yüz silinmiş kart dosyayı ajanın okuyabildiği 1 MB'ın üstüne çıkarır.
- **Her yerde atlamak gerekir.** Silinmiş işaretli görevler ve kartlar dosyanın içinde dururken onları okuyan her yer atlamak zorunda kalır: Today, Upcoming, aramalar, rollup'lar, sayılar, dışa aktarma ve ajanın araçları. Biri unutulursa silinen şey orada görünür.

Ayrı dosya iki sorunu da çıkarmıyor: listeler ve panolar küçülür, çöp yalnız Trash ekranında okunur. Uygulama açılırken bugün çöpü de okuyor (`design/opening.md`). Çöpte çok dosya varsa açılışı yavaşlatmasın diye her silinenin başlığı ve sayıları index'te tutulur, açılışta dosyalar tek tek açılmaz. Dosya adları bilerek `.tasks.json` ya da `.board.json` ile bitmiyor, yoksa `readTrash` bunları liste ya da pano sanırdı.

**Geri alma.** `restoreFromTrash`:
- Görevi kendi listesine, section'ına ve yerine (`after`), kartı kendi panosuna, sütununa, fazına ve yerine koyar.
- Section, sütun ya da faz artık yoksa önce adıyla arar. Onu da bulamazsa görev section'sız, kart ilk sütunda ve fazsız döner.
- Id'ler ve kart anahtarı (ROA-12) aynı kalır. `nextKey` hiç geri gitmediği için anahtar çakışmaz.
- O id listede ya da panoda zaten varsa (iki cihaz aynı şeyi geri aldıysa) ikinci kez eklemez.
- Kartla birlikte çöpe giden dosyalar onunla geri gelir. `canLink` `.json`'u zaten sayıyor, `restoreAttachments` olduğu gibi çalışır.
- Liste ya da pano çöpteyse geri alma bunu söyler ve önce onu geri getirmeyi önerir. Kalıcı olarak silindiyse geri alınamayacağını söyler.
- Liste ya da pano sonradan taşınır ya da adı değişirse `move` index'teki `from`'u da yeni yere çevirir. Görevin ve kartın dönüş yeri böylece kaybolmaz.

**Uygulama.**
- Trash ekranında görev, section ve kart da görünür. Başlık satırı "Task · Yapılacaklar", "Card · Roadmap · ROA-12" gibidir.
- Önizleme: görev alt görevleriyle, kart başlığı, sütunu, açıklaması, alt görevleri ve yorumlarıyla görünür. `readTrashed` yeni türleri okur.
- Restore ve Delete forever düğmeleri öbürlerindeki gibidir.
- Silme geri alınabildiği için onay penceresi kalkar, yerine Todoist'teki gibi "Moved to Trash · Undo" toast'ı gelir. Bu bir karar, 7. bölümde.

**Ajan.**
- `trash` `path` yanında `id` de alır. `path` artık `move`'daki gibi adla da verilebilir.
- `id` görev listesinde görevi (id ya da başlık), panoda kartı (anahtar, numara, id ya da başlık), koleksiyonda kaydı (id, ad ya da kod) gösterir.
- Görev listesinde `section` alırsa section'ı görevleriyle siler.
- Birden fazla şey eşleşirse bugünkü gibi hiçbir şey silinmez, adaylar döner.
- Dönen sonuç ne silindiğini (tür, başlık, nereden) ve kişinin onu Trash'ten geri alabileceğini söyler. Not için `note`, koleksiyon için `collection` der.
- `trash` zaten yıkıcı diye işaretli; Claude ve ChatGPT silmeden önce kişiye soruyor.
- Rehber şunu söyler: biten işi kapat (`done`, Dropped); yanlış ya da kopya olan, hiç orada olmaması gereken şeyi `trash` ile sil.
- Rehberdeki "Not yours: restoring from the trash" kalır. Geri almak kişinin işi olmaya devam eder.

**Çöpe gitmeyenler.**
- Yorum ve alt görev küçük ve tek satırlık şeyler, çöpü doldurmasınlar. Uygulamada silinince aynı toast gelir ve Undo geri getirir.
- Ajan alt görevi `remove: true` ile siler. Yorum silemez; kendi yazdığı yanlış yorumu silebilmesi istenirse sonra eklenir.
- Sütun, faz ve alan silinince zaten veri kaybolmuyor, değişmezler.

**Sunucu.** Sunucudaki space'in `.scrawl/trash/` klasörü ve index'i aynı. Ajanın bugünkü `trash`'i orada çalışıyor, yeni türler için ayrıca bir iş yok.

### Testler

- Çekirdek (`trash.test.ts`):
  - görev alt görevleriyle çöpe gider ve kendi section'ına, yerine döner
  - section görevleriyle gider ve döner
  - kart timeline'ı, değerleri ve dosyalarıyla gider ve döner
  - section, sütun ya da faz silindiyse adıyla, o da yoksa varsayılana döner
  - aynı id iki kez geri alınmaz
  - liste taşındıysa yeni yerine döner
  - liste çöpteyse ya da kalıcı olarak silindiyse ne olduğu söylenir
  - eski `readTrash` yeni dosyaları atlar
- Ajan (`agent.test.ts`):
  - `trash` görevi, kartı, kaydı ve section'ı id ya da adla siler
  - birden fazla eşleşince hiçbir şey silmez, adayları döndürür
  - silinen şey `tasks`, `cards` ve `records`'ta görünmez, Trash'te görünür
- Uygulama: görev ve kart silinince toast gelir, Undo geri getirir; Trash ekranında yeni türlerin önizlemesi ve Restore.

## 3. Ajan araçlarının düzeltmeleri

Hepsi `packages/agent`'ta. Her biri `agent.test.ts`'e bir testle girer.

- **(2) Görevde tekrar koruması.**
  - `save_task` yeni görev eklerken aynı listede, aynı üst görevin altında, aynı başlıkta açık bir görev bulursa eklemez, onu `exists: true` ile döndürür.
  - İkincisi isteniyorsa `another: true` verilir; kart ve kayıttakiyle aynı.
- **(3) `create`'te tekrar koruması.**
  - Aynı klasörde aynı türde ve aynı adda bir şey varsa onu `exists: true` ve yoluyla döndürür.
  - Numaralı yeni bir tane (`Not Bir 2`) yalnız `another: true` ile açılır.
  - Klasör için de `exists: true` söylenir.
- **(4) Kişi adı.**
  - `personRefOf` önce adın tamamına bakar. Bulamazsa ad ya da soyad tek bir kişiyle eşleşiyorsa onu alır ("Kaan" → Kaan Arslan).
  - Kişileri olan bir space'te (sunucu, paylaşılan) kimseyle eşleşmeyen ad reddedilir ve space'teki kişiler döner.
  - Kişisel space'te yazılan ad bugünkü gibi kalır.
  - `spaces` her space'in kişilerinin adlarını da verir, ajan kime atayabileceğini bilsin.
- **(7) `write` kontrolü.** Bozuk dosyayı yazmaz, neyin yanlış olduğunu tek tek söyleyerek reddeder.
  - **Şemada:** anahtarlar tekil olmalı, en fazla bir `name` ve bir `code` alanı olmalı, türler bilinen türler olmalı. Bağlantının koleksiyonu ve rollup'ın kaynağı space'te olmalı. Formül çözülebilmeli (`evaluateFormula`'nın okuduğu dil).
  - **Görev listesinde:** her görevin `id`'si ve `title`'ı olmalı, `parent` ve `section` var olan bir şeyi göstermeli.
  - **Panoda:** sütunların `id`, `name` ve bilinen bir `kind`'ı olmalı, en az bir `done` sütunu olmalı, en fazla bir faz `current` olmalı.
- **(9) Görevi taşımak.**
  - `save_task` `id` ile `section` (ad ya da null), `parent` (id ya da en üst için null) ve `toList` (başka bir liste) alır.
  - Çekirdekteki `moveTask` ve `moveTaskToList` kullanılır.
  - Boş başlık sessizce yok sayılmaz, reddedilir.
- **(10) Not bağlamak.** `save_card` ve `save_task` `note` alır: notun yolu ya da adı, kaldırmak için null.
- **(11) Tekil kod.** `save_record` başka bir kaydın kodunu (büyük/küçük harf fark etmeden) eklerken de güncellerken de reddeder.
- **(12) Yalnız Scrawl dosyaları.** `write` yalnız `.md`, `.tasks.json`, `.board.json` ve `_collection.json` yazar. Ötekileri, uygulamanın göstermediğini söyleyerek reddeder.
- **(13) Adı yazıldığı gibi okumak.** `read`, `write`, `trash` ve `move` yolu bulamazsa adı `fileNameOf` ile dosyadaki karşılığına çevirip bir daha bakar. Yine bulamazsa en yakın yolları döndürür.
- **(14, 16) Hata metinleri.**
  - "Subtasks go at most 5 levels deep"
  - "A task list needs a name"
  - "Value is a number, like 4900"
  - Klasör taşınmak istenince "Folders are not moved; move what is in them"
- **Rehber ve açıklamalar.** Görev ve `create` için tekrar kuralı, `trash`'in görev, kart, kayıt ve section'ı da sildiği, `note`, `toList`, kişiler eklenir.

## 4. Çekirdek düzeltmeleri

`packages/core`'da. Uygulamayı da etkiler, çünkü uygulama da aynı kodu kullanıyor.

- **(6) Faz notu.** `relinkBoardNote` kartların notu gibi fazların `note`'unu da yeni yola çevirir. Test: not taşınınca ve adı değişince fazın notu izler.
- **(8) Olmayan gün.**
  - Günü yalnız biçimiyle değil takvimle de denetleyen tek bir `isDay` olur. `dayArg` ve `readValue('date')` onu kullanır.
  - Uygulamada yapıştırılan ya da içe aktarılan 2026-02-30 hatalı değer olarak görünür.
  - Test: 2026-02-30, 2026-13-01 ve 2025-02-29 reddedilir, 2024-02-29 kabul edilir.
- **(18) Arama sırası.** Birebir eşleşen ifade, yalnız kelimeleri eşleşenlerin üstüne çıkar. Uygulamadaki arama penceresi de böyle sıralar. Test: "Satır iki" aramasında "Satır iki" yazan not ilk sırada.

## 5. Saat dilimi (5)

Sunucu `today`'i ve adsız notun adını kendi saatine (UTC) göre hesaplıyor. Kişinin saat dilimi hesabında tutulur:
- Uygulama, giriş yapınca ve açılışta tarayıcının saat dilimini (`Intl.DateTimeFormat().resolvedOptions().timeZone`) sunucuya söyler. Sunucu bunu hesabın yanına yazar.
- Ajanın kapısı `now`'u ve `today`'i bu saat dilimine göre verir. `dayOf` bir `timeZone` alır.
- Kişinin saat dilimi henüz bilinmiyorsa sunucunun `TZ` ayarı kullanılır. Coolify'da bu `Europe/Istanbul` yapılır.
- Bilgisayardaki stdio komutu zaten yerel saatle çalışıyor, değişmez.

Test: saat dilimi Europe/Istanbul olan bir kişi için 02:00'de `today` o günü verir, UTC'nin dününü vermez.

## 6. Ajanın sürtünmesi (5. dilim)

Hız değil, bir işi bitirmek için ajanın kaç adım attığı ve neye takıldığı. Ölçüm 19 Ekim'de, sunucudaki dört space'te (Game Development, Klinitra, OzBI, Scrawl) yalnız okuyan çağrılarla yapıldı.

### Bugün

- **Space seçme zorunluluğu.** Birden fazla space varken `tree`, `cards`, `tasks` ve `records` space verilmeden reddediliyor ("Which space?"), ad verilse de. `pickElement` yalnız tek bir space'in içinde arıyor. Ajan önce boşa bir çağrı yapıyor ya da space'i kendisi tahmin ediyor.
- **Arama space'leri bulmuyor.** "Klinitra" araması Klinitra'daki görevleri getirdi, space'in kendisini getirmedi. Sonuçlar space'i adıyla değil kimliğiyle (`sp-p15edl79`) gösteriyor.
- **Kart listesi ağır.** `cards`, Roadmap'in 7 açık kartı için yaklaşık 8 KB döndü: her çağrıda 16 fazın ve bütün sütunların kimlikleri, her kartın açıklaması ve bütün yorumları geliyor. Eklemeden önce bakmak için çağrılan liste ajanın bağlamını dolduruyor.
- **Toplu yazma yok.** Toplantıdan çıkan her madde ayrı bir `save_card` çağrısı. ChatGPT yazan her çağrı için kişiye onay sorduğundan (`design/agent.md` 4) beş madde beş onay demek.
- **Tarihe göre her yerden bakılamıyor.** `tasks` `due` ile yalnız bir space'e bakıyor; `cards`'ın tarih filtresi yok ve pano istiyor. "Bugün ne var?" her space için `tasks`, sonra her panonun bütün kartları.
- **Gürültülü öneriler.** Ad bulunamayınca `pickElement` ve `pickRecord` hiçbir şey benzemese de 20'ye kadar alakasız öğe öneriyor (`nearest`'in "yoksa hepsi" yedeği). Yollar için bu 2. dilimde düzeldi (`nearestPaths`).

| İş | Bugün | Bu dilimden sonra |
|---|---|---|
| "Scrawl toplantısını Roadmap'e işle", 5 madde | 9 çağrı (`spaces`, `tree`, `cards`, not, 5× `save_card`), ChatGPT'de 6 onay | 4 çağrı (`spaces`, kısa `cards`, not, notla bağlı tek `save_card`), 2 onay |
| "Bugün ne var?" | 4× `tasks`, her panonun bütün kartları | `tasks` ve `cards` `due: "today"` ile, 2 çağrı |
| "Roadmap'e kart ekle", space söylenmeden | "Which space?" reddi, sonra tekrar | Tek çağrı |
| "Klinitra'da ne var?" | `spaces`'ten adı eşleştirip `tree` | `search` space'i de buluyor |

### Önerilen

**1. Space vermeden adla bulma.**
- `space.ts`'e `pickAcross(agent, space, ref, kinds, what)` gelir. `space` verilmişse bugünkü gibi `pickSpace` ve `pickElement` çalışır. Verilmemişse ve tek space varsa yine aynısı olur.
- Birden fazla space varken her space'in `elementsOf(kinds)`'i `pickElement`'in kurallarıyla (yol, yazıldığı gibi ad, başlık) taranır:
  - Tek eşleşme kullanılır ve sonuçta space'in kimliği ve adı söylenir.
  - Birden fazla eşleşmede hiçbir şey yazılmaz; adaylar space adlarıyla döner (`{ space, spaceName, path, title }`).
  - Hiç eşleşme yoksa bütün space'lerdeki benzer adlar (6. madde) döner.
- Kullananlar:
  - `cards`, `save_card`, `comment` (pano)
  - `tasks`, `save_task` (liste)
  - `records`, `save_record` (koleksiyon)
  - `move` (öğe)
  - `read` ve `trash` (yalnız bir space'te olan yol)
- Bir şey **yaratan** çağrı space olmadan bugünkü gibi reddedilir: `create` ve `write` ile yeni bir dosya. Nereye yazılacağını tahmin etmek yanlış space'e yazmak olur.
- `tree` `kind` ile ve space'siz çağrılırsa her space'in o türdeki öğelerini tek listede verir; her öğede `space` ve `spaceName` bulunur. `kind` yoksa bütün ağaç çok uzun olacağı için bugünkü gibi space ister.
- `tasks` liste ve space verilmeden `due` ya da `assignee` ile çağrılırsa bütün space'lerin listelerine bakar; her görevde `space` ve `spaceName` bulunur. Filtresiz ve space'siz çağrı space ister, çünkü bütün görevler çok fazla olur.

**2. Kısa kart listesi.**
- `cards` varsayılan olarak her kartın kısa halini verir: `{ key, title, column, phase, priority, due, labels, assignee, subtasks: "2/5", comments: 3, note }`. Kart kimliği yok (anahtar yeter), açıklama ve yorum metinleri yok.
- Tam hali (bugünkü `cardOut`) yalnız tek kart istenince (`card`) ya da `full: true` ile gelir.
- Başlıkta sütunlar `{ name, kind }` olarak gelir; araçlar sütunu zaten adıyla ya da türüyle alıyor. Fazlardan yalnız açık olanlar (`current`, `upcoming`) adlarıyla gelir, bitenlerin sayısı `donePhases` olarak söylenir. Panonun alanları (`fields`) olduğu gibi kalır, çünkü `values` onlarla yazılıyor.
- Beklenen boyut: aynı 7 kart için yaklaşık 1,5 KB.
- `write` için kimlikler gerekirse ajan dosyayı zaten `read` ile okuyor; rehber bunu söyler.

**3. Toplu ekleme ve değiştirme.**
- `save_card` ve `save_task` tek kartın ya da görevin alanları yerine `items` da alır: aynı pano ya da liste için en fazla 50 öğe. Her öğe bugünkü tek çağrının alanlarını taşır (`id` ile değiştirmek de olur). `board`, `list` ve `space` bir kez, en üstte verilir.
- Önce bütün öğeler denetlenir (gün, öncelik, kişi, sütun, faz, alanlar). Biri reddedilirse **hiçbiri yazılmaz**; ret hangi öğe olduğunu (`item: 3`) ve nedenini söyler.
- Hepsi geçerse pano ya da liste bir kez okunur, öğeler sırayla uygulanır ve dosya bir kez yazılır.
- Tekrar koruması öğeler arasında da çalışır: aynı başlıkta iki öğe gelirse ikincisi `exists` olur, `another: true` verilmemişse.
- Sonuç `{ created, changed, exists, cards | tasks }` döner; kartlar 2. maddedeki kısa haliyle.
- `items` ile tek öğe alanları birlikte verilirse reddedilir, hangisinin kastedildiği belli olmaz.
- Açıklamalar toplantı örneğini verir: "maddeleri tek çağrıda `items` ile yaz, notu `note` ile bağla".

**4. Tarihe ve kişiye göre her yerden.**
- `cards` `due` (`overdue`, `today`, `upcoming`) ve `assignee` alır; `board` isteğe bağlı olur.
- Pano verilmezse 1. maddedeki gibi space'in, space de verilmezse bütün space'lerin panolarına bakılır. Fazın değil tarihin önemli olduğu bu görünümde kartların hepsi taranır, ama yalnız açık olanlar; her kartta `board` ve `spaceName` bulunur.
- Panosuz çağrıda en az bir filtre gerekir (`due`, `assignee` ya da `label`). Bütün panoların bütün kartları çok fazla olur.
- `due` görevlerdeki gibi `todayOf(agent)` ile, yani kişinin saat dilimiyle hesaplanır.
- `tasks` ve `cards`'ta `assignee: "me"` kişinin kendisi demektir (`agent.person()`).
- Rehberin "ne için hangi araç" tablosuna "Bugün ne var: `tasks` ve `cards`, ikisi de `due: "today"` ile" satırı eklenir.

**5. Aramada space.**
- `thingsOf` her space için kendisini de bir öğe olarak ekler: `{ kind: 'space', name, path: '', where }`. `FindKind`'da `space` zaten var.
- Her sonuçta `space` kimliğinin yanında `spaceName` de bulunur.
- "Klinitra" araması önce space'i, sonra içindekileri getirir. Space adının kendisi, çekirdekteki sıralamaya göre adla tam eşleşme olduğu için en üstte çıkar.

**6. Gürültüsüz öneriler.**
- `nearest` hiçbir şey benzemiyorsa boş döner, hepsini değil.
- `pickElement` ve `pickRecord`'un `nearest` alanı yalnız benzeyenlerle gelir; boşsa hiç gelmez, `nearestPaths` gibi.

**Araç sayısı 15 kalır.** Yeni parametreler: `cards`'ta `full`, `due` ve isteğe bağlı `board`; `save_card` ve `save_task`'ta `items`. Sunucu ve bilgisayar kapısı aynı kodu kullandığı için ikisi birlikte değişir.

### Testler (`agent.test.ts`)

- **Space'siz bulma:**
  - iki space'te tek "Roadmap" panosu space'siz bulunuyor ve sonuçta space'i yazıyor
  - iki space'te iki "Yapılacaklar" listesi varsa adaylar space adlarıyla dönüyor ve hiçbir şey yazılmıyor
  - `create` space'siz reddediliyor
  - `tree` (`kind` ile) ve `tasks` (`due` ile) space'siz bütün space'leri kapsıyor
- **Kısa liste:** varsayılan kartlarda açıklama ve yorum metni yok, sayıları var; `full: true` ve tek kart bugünkü tam hali veriyor; başlıkta yalnız açık fazlar var.
- **Toplu ekleme:**
  - beş kart tek çağrıda yazılıyor, dosya bir kez yazılıyor
  - biri reddedilince hiçbiri yazılmıyor, ret öğenin sırasını söylüyor
  - öğeler arasında aynı başlık `exists` oluyor
  - görevlerde de aynısı
- **Tarihe göre:** iki space'te bugün tarihli kartlar panosuz `cards` ile geliyor; filtresiz panosuz çağrı reddediliyor; `assignee: "me"` kişinin kartlarını ve görevlerini veriyor.
- **Arama:** space adıyla arama space'i ilk sırada getiriyor; sonuçlarda `spaceName` var.
- **Öneriler:** hiçbir şey benzemeyince `nearest` alanı gelmiyor.
- **MCP üstünden:** `save_card` `items` ile, gerçek bir istemciden tek çağrıda.

## 7. Kararlar

### 1.–4. dilim için (onaylandı)

1. Silinen görev, section ve kart, 2. bölümdeki gibi çöpe ayrı dosya olarak gider.
2. Uygulamada görev, section ve kart silinirken onay penceresi yerine "Moved to Trash · Undo" toast'ı gelir.
3. Saat dilimi kişinin hesabında tutulur, yalnız sunucunun ayarına bırakılmaz.
4. "Kaan" gibi tek bir kişiyle eşleşen ad ya da soyad kabul edilir. Kişileri olan space'te eşleşmeyen ad reddedilir.

### 5. dilim için (onaylandı)

5. Space vermeden adla bulma yalnız var olanı bulur. Bir şey yaratan çağrı (`create`, `write` ile yeni dosya) space'siz bugünkü gibi reddedilir.
6. `cards` varsayılan olarak kısa liste verir; tam hali tek kart ya da `full: true` ile gelir.
7. Toplu eklemede bir öğe reddedilirse hiçbiri yazılmaz.
8. Panosuz `cards` ve space'siz `tasks` en az bir filtre ister: `due` ya da `assignee`, kartlarda `label` da.
9. `assignee: "me"` kişinin kendisidir.

## 8. Dilimler ve yayın

1. **Çekirdek düzeltmeleri** (4. bölüm): faz notu, olmayan gün, arama sırası. Commit d5b3ee7.
2. **Ajan düzeltmeleri** (3. bölüm) ve rehber. Commit c43801c.
3. **Saat dilimi** (5. bölüm): sunucu, uygulama ve kapı. Commit 8efff2e.
4. **Geri alınabilir silme** (2. bölüm): çekirdek, Trash ekranı, toast ve ajanın `trash`'i.
5. **Ajanın sürtünmesi** (6. bölüm): space'siz bulma, kısa liste, toplu ekleme, tarihe göre her yerden, aramada space, gürültüsüz öneriler. Yalnız `packages/agent` ve rehberi değişir; 4. dilimden bağımsızdır, önce ya da sonra yapılabilir.

Her dilim kendi commit'i. 2. ve 3. dilim bitince sunucu 0.2.15 Coolify'a çıkar; 5. dilim de sunucunun bir sonraki sürümüyle çıkar. Web, 1., 3. ve 4. dilimden sonra Cloudflare'e çıkar. Masaüstü bir sonraki sürümle gelir. Her yayından sonra aynı denemeler `MCP Test` klasöründe yeniden yapılır.
