# Ajanın büyük dosyalarda çalışması (taslak)

Durum: 22 Ekim 2026. Yedi karar onaylandı. 5. bölümdeki üç ek de plana alındı.

## 1. Sorun

Bugün panoya faz eklemek, kolon değiştirmek, listeye section eklemek ya da bir notta tek cümle düzeltmek için ajan dosyanın tamamını okuyup tamamını geri yazıyor. Desktop'taki oturum bu yüzden Roadmap'e 16. aşamanın fazını ekleyemedi. Dosya 260 KB ve tek araç çağrısında geri yazılamıyor.

Takılan yer Scrawl'ın sınırı değil. O sınır 1 MB. Takılan, modelin bir çağrıda üretebileceği metin. 260 KB, on binlerce token ediyor. Sınırı büyütmek bunu çözmez. Okumak da pahalı: aynı dosyayı okumak bağlamın büyük kısmını yiyor.

Roadmap'te ölçtüm:

| Parça | Boyut |
|---|---|
| Dosyanın tamamı | 259 KB |
| 186 kart | 198 KB (açıklamalar 44 KB, alt görevler 51 KB, timeline 21 KB) |
| Kartlar dışındaki her şey (19 faz, 5 kolon) | 6 KB |

Değişen 6 KB, gidip gelen 520 KB.

Aynı sorun şu işlerde de var:

| İş | Bugün | Neden ağır |
|---|---|---|
| Faz eklemek, kapatmak, sıralamak, hedefini değiştirmek | Bütün panoyu `read`, sonra `write` | Kartlar da gidip geliyor |
| Kolon eklemek, adını ya da türünü değiştirmek, silmek | Aynı | Aynı |
| Panoya alan eklemek | Aynı | Aynı |
| Section eklemek, adını değiştirmek, sıralamak | Bütün listeyi `read`, sonra `write` | Görevler de gidip geliyor (Yapılacaklar 15 KB) |
| Koleksiyonun view'ı ya da layout'u | Bütün şemayı `read`, sonra `write` | Şema çoğu zaman küçük, ama büyük app şemalarında bütün alanlar da gidip geliyor |
| Notta bir cümleyi değiştirmek | Bütün notu `read`, sonra `write` | Uzun notun tamamı gidip geliyor, model yeniden yazarken metni bozabiliyor |
| Uzun bir not yazmak | Tek `write` | Çağrıya sığmayan not hiç yazılamıyor |
| `_rules.js`'te bir satırı değiştirmek | Bütün dosyayı `read`, sonra `write` | Aynı |

Bir de anlam sorunu var. Uygulamada bir faz kapanınca bitmemiş kartları sonraki faza geçiyor. Kolon silinince kartları ilk kolona gidiyor. Faz silinince kartları fazsız kalıyor. Kolonun türü done olunca kartlarına bitiş zamanı yazılıyor. Bütün dosyayı yazan ajan bunları kendisi yapmak zorunda. Yapmazsa kapanan fazda açık kartlar kalıyor, kolon silme isteği de reddediliyor.

## 2. Önerilen: `read` ve `write` parça alır, araç sayısı aynı kalır

Yeni araç yok. `read`'e bir, `write`'a üç girdi eklenir.

### JSON dosyalarında `part`

`read` ve `write`, `part` girdisini alır. Bu girdi dosyanın üst düzeydeki bir anahtarıdır.

| Dosya | Parçalar | Parça olmayanlar |
|---|---|---|
| Pano | `columns`, `phases`, `fields`, `phasesOn`, `prefix`, `view` | `cards` (save_card'ın işi), `nextKey` (kendiliğinden artar) |
| Görev listesi | `sections` | `tasks` (save_task'ın işi) |
| Şema | `fields`, `layout`, `views`, `defaultView`, `singular` | `version`, `template`, `role` |

- `read`, `part` ile yalnızca o parçayı JSON olarak verir, parçanın kendi hash'iyle birlikte. Roadmap'in fazları 6 KB.
- `write`, aynı `part` ile yalnızca o parçayı değiştirir. Dosyanın geri kalanı olduğu gibi kalır. `text` o parçanın JSON'udur, örneğin fazların listesi.
- `ifMatch` parçanın hash'idir. Kişi bu arada bir kart taşıdıysa yazma reddedilmez. Yalnızca fazlar değiştiyse reddedilir.
- Id'si olmadan gelen yeni kolona, faza ya da section'a bir id verilir (karar 4).
- Dosyanın bütün denetimi aynen çalışır. Parça yerine konduktan sonra dosya bugünkü `checkFile`'dan geçer. Bir hata varsa hiçbir şey yazılmaz ve her hata tek tek söylenir.

Faz eklemek iki çağrı:

1. `read { path: "Roadmap", part: "phases" }`: 19 faz ve hash gelir.
2. `write { path: "Roadmap", part: "phases", text: "[…20 faz…]", ifMatch }`

Gidip gelen 12 KB olur, 520 KB değil.

### Parça yazılınca kartlar uygulamadaki gibi izler (karar 2)

Yazılan parça eskisiyle karşılaştırılır. Uygulamada aynı değişiklik kartlara ne yapıyorsa burada da o yapılır, core'un aynı fonksiyonlarıyla:

| Değişiklik | Kartlara olan | Core'da |
|---|---|---|
| Kolon çıkarıldı | Kartları ilk kolonun sonuna geçer (bugün reddediliyor) | `removeColumn` |
| Kolonun türü değişti | done'a girenlere bitiş zamanı yazılır, done'dan çıkanlardan silinir | `setColumnKind` |
| Faz çıkarıldı | Kartları fazsız kalır | `removePhase` |
| Açık bir faz done oldu | Bitmemiş kartları `unfinished`'ın dediği yere gider: adıyla açık bir faza, `"none"` ile fazsız, `"stay"` ile kapanan fazda kalır. Verilmezse sonraki açık faza geçer; sonrasında açık faz yoksa ilk açık faza, hiç açık faz yoksa fazsız kalır (23 Ekim) | `nextOpenPhase`; uygulamada Close phase penceresi aynı seçimi sorar, `closePhase` |
| Alanlar değişti | Değerler kartta kalır | `setBoardFields` |

Kart taşınınca timeline'a ajanın adı yazılır, save_card'da olduğu gibi. Sonuç ne olduğunu söyler: "3 cards went to Stage 17", "2 cards went to Backlog".

Görev listesinde görevleri olan bir section çıkarılamaz. Ajana `trash` ile `section` kullanması söylenir. O zaman section görevleriyle çöpe gider ve geri alınabilir. Boş bir section ise doğrudan çıkarılır (karar 3). Genel kural şu: parça yazmak hiçbir kartı ya da görevi silmez.

### Metin dosyalarında `edits` ve `append`

Bu iki girdi notlar ve `_rules.js` içindir.

- `edits: [{ find, replace, all? }]`: her `find` metinde bir kez geçmelidir. Hiç geçmiyorsa ya da birden çok geçiyorsa (`all` verilmediyse) istek reddedilir ve kaç kez geçtiği söylenir. Değişiklikler sırayla uygulanır: ya hepsi yazılır ya hiçbiri. Notun eski hali bugünkü gibi sürüm olarak kalır. `_rules.js`'in sonucu bugünkü gibi denetlenir.
- `append`: metni dosyanın sonuna ekler, gerekirse araya bir satır sonu koyar. Dosya yoksa açar. Böylece uzun bir not birkaç çağrıda yazılabilir. Hiçbir şey kaybolmadığı için sürüm yazılmaz (karar 5).
- JSON dosyalarında `edits` ve `append` reddedilir, onun yerine `part` söylenir (karar 6).
- Bir dosya en fazla 1 MB olabilir, `read` okuyabilsin diye. Bu sınır değişmez.

Örnek: notta bir cümleyi değiştirmek tek çağrıdır. Ajan cümleyi biliyorsa okumasına da gerek kalmaz: `write { path, edits: [{ find: "eski cümle", replace: "yeni cümle" }] }`.

### Kesilen çağrı tekrar gelince

Rehberin kuralı "tekrar çağır, hiçbir şey iki kez olmaz". Yeni girdiler de bu kurala uyar (karar 7):

- `part`: parça zaten yazılan haldeyse `ifMatch`'e bakılmaz, sonuç `written: false` ile başarılı döner. Bugünkü bütün dosya yazmada da aynısı yapılır.
- `append`: dosyanın sonu zaten bu metinse ikinci kez eklenmez, `exists: true` döner.
- `edits`: `find` artık yoksa ama `replace` metinde varsa red mesajı bunu söyler: "zaten yazılmış olabilir, notu oku".

### Ne yapmaz

- Kart, görev ya da kayıt yazmaz. Onlar save_card, save_task ve save_record'un işi.
- Hiçbir sınırı büyütmez.

## 3. Başka yollar neden seçilmedi

- **Panolar için ayrı bir araç** (save_board: add_phase, close_phase…): hem bir araç daha ekler hem de şeması uzun olur. Parçayı yazıp eskisiyle karşılaştırmak aynı sonucu veriyor.
- **JSON Patch** (`/phases/3`): zayıf modeller index'i ve yolu yazarken yanılıyor. Sıra değişince de yanlış yere yazılıyor.
- **Panoyu iki dosyaya bölmek** (yapı ve kartlar): veri modeli ve sync değişir, eski panoların taşınması gerekir. Sorunu ajan için çözmek bunu gerektirmiyor.

## 4. Teknik ayrıntı

### Araç şemaları (`packages/agent/src/server.ts`)

- `read`: `part: z.string().optional()`.
- `write`: `text` artık zorunlu değil. Yeni girdiler: `part: z.string().optional()`, `edits: z.array(z.object({ find: z.string().min(1), replace: z.string(), all: z.boolean().optional() })).min(1).max(50).optional()` ve `append: z.string().optional()`. `text`, `edits` ve `append`'ten tam olarak biri verilmelidir, yoksa istek reddedilir. `part` yalnızca `text` ile birlikte verilebilir. `unfinished: z.string().optional()` (23 Ekim): `part: "phases"` bir fazı done yazınca bitmemiş kartların gideceği yer. Açık olmayan, bulunmayan ya da kapanan fazın kendisini gösteren değer reddedilir ve hiçbir şey yazılmaz; red açık fazları sayar.
- `write`'a da `client(ctx)` gider, save_card'a gittiği gibi: kart taşınınca timeline'a kimin taşıdığı yazılır.
- Açıklamalar yeniden yazılır. `write`'ınki şunu söyler: "bütün dosya `text` ile, bir JSON parçası `part` ile, bir notun bir yeri `edits` ile, notun sonu `append` ile". `read`'inki: "bir pano, liste ya da şemanın tek parçası için `part`".

### Yeni dosya: `packages/agent/src/parts.ts`

- `PARTS`: her dosya türünün parçaları ve parça olmadığında verilen boş değer. Listeler için `[]`, ötekiler için `null`.
- `partOf(kind, data, part)`: parçanın değeri ve metni. Metin `JSON.stringify(value, null, 2)`, hash'i `hashOf(metin)`.
- `boardWithPart(board, part, value, renames, now, by, unfinished)`: id'si olmayanlara id verir. Sonra yukarıdaki tablodaki işleri yapar:
  - Çıkarılan her kolonun kartları `moveCard` ile yeni listenin ilk kolonunun sonuna gider.
  - Türü değişen her kolon için `setColumnKind` çağrılır.
  - Çıkarılan fazlar için `removePhase` çağrılır.
  - Açıkken done olan fazların bitmemiş kartları `unfinished`'ın dediği yere gider; verilmezse yeni sıraya göre `nextOpenPhase`'in verdiği faza.
  - `fields` için `setBoardFields(board, value)` çağrılır.
  - Diğer parçalar olduğu gibi atanır.

  Fonksiyon kartlara olanları tek tek döndürür: hangi kart nereye gitti.
- `listWithPart(list, value)`: id verir. Görevleri olan bir section çıkarılmışsa Refusal fırlatır: kaç görev olduğunu ve `trash` + `section` kullanılacağını söyler.
- Şema ham JSON olarak okunur, parça yerine konur ve `serializeSchema`'nın biçimiyle yazılır. Normalleştirilmez. MCP testinde çıkan "sessizce iyileştirme" sorunu burada tekrar olmasın.

### `read.ts`, `write.ts`

- `readTool`: `part` varsa dosya pano, liste ya da şema olmalıdır, ve parça o türün `PARTS` listesinde bulunmalıdır. Değilse istek reddedilir ve geçerli parçalar listelenir. Döndürdüğü: `{ space, path, kind, part, hash, text }`.
- `writeTool` dört yola ayrılır: bugünkü bütün yazma, `writePart`, `writeEdits`, `writeAppend`. Dördü de `writePlace`, `checkOpen` ve 1 MB denetimini paylaşır.
- `writePart`:
  1. Pano ve liste için `loadBoard`/`loadList` çağrılır, save_card ve save_task'ın okuduğu gibi.
  2. `ifMatch` parçanın şimdiki hash'iyle karşılaştırılır.
  3. Parça değiştirilir.
  4. Sonuç serialize edilir ve `checkJson`'dan geçer.
  5. `saveBoard`/`saveList`/`writeText` ile yazılır.
- `writeEdits`: yalnızca notlarda ve `_rules.js`'te çalışır, dosya önceden var olmalıdır. Dosyada `\r\n` varsa `find` ve `replace`'teki `\n`'ler `\r\n` olur. Sonuç 1 MB'ı geçmemelidir. `_rules.js`'te `checkRules` çalışır, notta `keepVersion` bugünkü gibi çalışır. Döndürdüğü: `{ path, hash, replaced }`.
- `writeAppend`: yalnızca notlarda ve `_rules.js`'te çalışır. Dosya yoksa açar, sürüm yazmaz. `_rules.js`'te birleşen metin denetlenir. Yani parça parça yazılan kural dosyası her adımda geçerli kalmak zorundadır. Rehber bunu söyler.

### Rehber (`packages/agent/src/guide.ts`)

- Tablo:
  - "Change a collection's fields, a board's columns or phases" satırı değişir: "`read` with `part`, change it, `write` it back with the same `part` and `ifMatch`; the cards follow as in the app".
  - İki satır eklenir: "Change a part of a note or rules: `write` with `edits`" ve "Write a long note: `write` with `text`, then `append`".
- Boards, Task lists ve Collections bölümlerinde "read the board…write it back" cümleleri `part` ile yeniden yazılır. "Keep every id; a new one needs none" eklenir.
- "When a call is cut off" bölümüne yeni girdilerin tekrar kuralı eklenir.

### Testler

`packages/agent/src/agent.test.ts`:

- `read` + `part: "phases"`: yalnızca fazlar gelir, hash doğrudur. Geçersiz bir parça listesiyle reddedilir. `cards`, `tasks` ve `nextKey` reddedilir.
- Faz eklemek: kartlar bayt bayt aynı kalır. Id'si olmayan faza id verilir.
- Arada bir kart taşınmış olsa da fazların `ifMatch`'i geçer. Fazlar değişmişse reddedilir.
- Faz done olur: bitmemiş kartlar sonraki faza geçer, son fazdaysa fazsız kalır. Sonuç bunu söyler. `unfinished` ile `"stay"`, adıyla bir faz ve `"none"`; kapanan faz, done faz ve bulunmayan ad reddedilir.
- Kolon çıkarılır: kartları ilk kolonun sonuna geçer, timeline'a ajanın adı yazılır. Son done kolonu çıkarılınca istek reddedilir.
- Kolonun türü done olur: kartlara bitiş zamanı yazılır.
- Görevleri olan section çıkarılmak istenince istek reddedilir. Boş section çıkarılır.
- Şema `part: "views"`: `fields` olduğu gibi kalır. Yanlış formül bugünkü gibi reddedilir.
- Aynı parça tekrar yazılınca `written: false` döner, `ifMatch` eski olsa da.
- `edits`: tek eşleşme yazılır. Eşleşme yoksa ya da birden çoksa reddedilir. `all` verilince hepsi değişir. Biri reddedilince hiçbiri yazılmaz. CRLF'li notta da çalışır. Notun sürümü kalır. `_rules.js`'te hata satırıyla reddedilir. JSON dosyasında reddedilir.
- `append`: dosya açılır, metin sona eklenir, sürüm yazılmaz. Aynı metin tekrar gelince eklenmez. 1 MB'ı geçince reddedilir.

- `renames`: panoda kartların değeri değişir. Koleksiyonda kayıt dosyaları ve view koşulları değişir. Olmayan bir eski ya da yeni ad reddedilir. Not yazılırken verilen `renames` reddedilir.
- `after`: kart kolonun başına ve iki kartın arasına konur, başka kolona da `after` ile taşınır. Görev section'ın başına ve alt görevlerin arasına konur. Yanlış yerdeki `after` reddedilir. `items` içinde de çalışır.
- `lines`: aralık doğru döner, `total` doğrudur, hash dosyanın tamamınındır. Sondan taşan aralık kısalır. `part` ile birlikte reddedilir. `search` notta `lineNo` verir.

`apps/server/src/agent.test.ts`: HTTP üzerinden bir `part` turu (`read`, sonra `write`).

### Sürüm ve yayın

Değişiklik `packages/agent`'ta. Sunucu 0.2.19 olur (server-v etiketi, Coolify). `apps/mcp` aynı kodu kullanır, npm yayını henüz yok. Web ve masaüstü değişmez. Yayın kararı senin.

Başka bir oturum şu an `packages/agent/src/server.ts`'te çalışıyor (Antigravity adı). Commit'e yalnızca bu işin parçaları girer.

## 5. Eklenenler (22 Ekim, onaylı)

İlk taslakta plan dışında kalan üç madde de bu dilime girdi.

### Seçenek adı değişince değerler de değişir (`renames`)

Uygulamada bir seçeneğin adı değişince o seçeneği taşıyan kartların ve kayıtların değeri de değişiyor. Ajan bugün bunu yapamıyor: yeni adı yazınca eski değerler eski adla kalıyor ve uygulama hepsini hatalı diye işaretliyor.

- `write`, `renames: { "<alan anahtarı>": { "<eski>": "<yeni>" } }` alır. Panoda `fields` parçasıyla, koleksiyonda ise şema bütün olarak ya da `fields` parçasıyla yazılırken kullanılır. Başka yerde reddedilir.
- Her eski ad o alanın eski seçeneklerinden, her yeni ad da yeni seçeneklerinden biri olmalıdır. Değilse istek reddedilir ve alanın seçenekleri söylenir.
- Panoda kartların değerleri `setBoardFields(board, fields, renames)` ile değişir.
- Koleksiyonda o seçeneği taşıyan her kaydın dosyası yeniden yazılır. Uygulamanın Fields penceresi de aynı yolu izliyor: `renameChoices`, sonra `serializeRecord`. Şemanın view'larındaki koşullar da değişir; bunun için core'da `renameInViews` dışa açılır.
- Sonuç kaç kartın ya da kaydın değiştiğini söyler: "4 records took the new names".

### Kart ve görev sırası (`after`)

save_card bir kartı kolonun içinde belli bir yere, save_task da bir görevi listede belli bir yere koyamıyor; hep sona ekliyor. "Bunu en üste al" yapılamıyor.

- save_card `after` alır: kartın kolonunda hemen arkasına geleceği kart, anahtarıyla (ROA-12). En başa almak için `"top"`. `column` ile birlikte verilirse o kolonda geçerlidir. Verilmezse bugünkü gibi çalışır: başka kolona giden kart sona gider, yerinde kalan kart yerinde kalır.
- save_task `after` alır: görevin hemen arkasına geleceği görev, id'siyle ya da başlığıyla. Bu görev aynı üst görevin altında ya da aynı section'da olmalıdır. En başa almak için `"top"`. `section`, `parent` ve `toList` ile birlikte de çalışır.
- Yeni bir kart ya da görev de `after` ile istenen yere eklenir. `items` içinde her öğe kendi `after`'ını alabilir.
- Verilen kart ya da görev o yerde değilse istek reddedilir ve o yerdekiler listelenir.
- Core'da hazır: `moveCard(board, id, { column, after })` ve `moveTask(list, id, { parent, section, after })`. İkisinde de `after: null` en başa koyar.

### Büyük bir notun bir kısmını okumak (`lines`)

- `read`, `lines: { from, to? }` alır. Satır numaraları 1'den başlar ve iki uç da dahildir. Yalnızca bu satırlar döner. Sonuçta `lines: { from, to, total }` bulunur.
- Hash yine dosyanın tamamınındır, böylece arkasından gelen `write` `ifMatch` ve `edits` ile çalışır.
- Notlarda, `_rules.js`'te ve kayıt dosyalarında çalışır, `part` ile birlikte verilemez.
- Notun tamamı okununca da sonuçta satır sayısı bulunur (`lineCount`). Ajan böylece notun ne kadar uzun olduğunu görür.
- `search` bir notta bulduğu satırın numarasını da verir (`lineNo`). Ajan böylece `read` ile doğrudan o satırların çevresini okuyabilir.
- 1 MB'lık okuma sınırı değişmez.

## 6. Kararlar (onaylandı, 22 Ekim)

1. Yaklaşım: yeni araç yok. `read` ve `write` `part` alır, `write` ayrıca `edits` ve `append` alır.
2. Parça yazılınca kartlar uygulamadaki gibi izler: kolon çıkınca kartları ilk kolona geçer, faz kapanınca sonraki faza geçer… Sonuç ne olduğunu söyler. Başka seçenek: kartları etkileyen değişiklik reddedilir.
3. Görevleri olan bir section parça yazarak çıkarılamaz, ajana `trash` söylenir.
4. Id'si olmadan gelen yeni kolona, faza ya da section'a id verilir.
5. `append` sürüm yazmaz. Aynı metin sonda zaten varsa ikinci kez eklemez.
6. `edits` ve `append` yalnızca notlarda ve `_rules.js`'te çalışır. JSON'da `part` kullanılır.
7. Parça zaten yazılan haldeyse `ifMatch`'e bakılmaz, başarılı sayılır. Bütün dosya yazmada da aynısı yapılır.

## 7. Dilim

Tek dilim: `parts.ts`, `read`/`write`, 5. bölümdeki üç ek (`renames`, `after`, `lines`), `server.ts`'teki şemalar, rehber ve testler. Ardından sunucu 0.2.19 yayını gelir (kararı senin). 16. aşamanın fazı Roadmap'e bu yayından sonra MCP ile eklenebilir.
