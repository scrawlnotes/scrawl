# MCP testinin düzeltmeleri (taslak)

Durum: 19 Ekim 2026. Sunucu 0.2.14'te on beş araç, Scrawl space'inin `MCP Test` klasöründe elle denendi. Kullanıcı bulguların düzeltilmesini onayladı ve silmenin her yerde olmasını, ama geri alınabilmesini istedi. 2. bölümün yaklaşımı ve 6. bölümdeki dört karar onaylandı.

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
- Silme geri alınabildiği için onay penceresi kalkar, yerine Todoist'teki gibi "Moved to Trash · Undo" toast'ı gelir. Bu bir karar, 6. bölümde.

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

## 6. Kararlar (onaylandı)

1. Silinen görev, section ve kart, 2. bölümdeki gibi çöpe ayrı dosya olarak gider.
2. Uygulamada görev, section ve kart silinirken onay penceresi yerine "Moved to Trash · Undo" toast'ı gelir.
3. Saat dilimi kişinin hesabında tutulur, yalnız sunucunun ayarına bırakılmaz.
4. "Kaan" gibi tek bir kişiyle eşleşen ad ya da soyad kabul edilir. Kişileri olan space'te eşleşmeyen ad reddedilir.

## 7. Dilimler ve yayın

1. **Çekirdek düzeltmeleri** (4. bölüm): faz notu, olmayan gün, arama sırası.
2. **Ajan düzeltmeleri** (3. bölüm) ve rehber.
3. **Saat dilimi** (5. bölüm): sunucu, uygulama ve kapı.
4. **Geri alınabilir silme** (2. bölüm): çekirdek, Trash ekranı, toast ve ajanın `trash`'i.

Her dilim kendi commit'i. 2. ve 3. dilim bitince sunucu 0.2.15 Coolify'a çıkar. Web, 1., 3. ve 4. dilimden sonra Cloudflare'e çıkar. Masaüstü bir sonraki sürümle gelir. Her yayından sonra aynı denemeler `MCP Test` klasöründe yeniden yapılır.
