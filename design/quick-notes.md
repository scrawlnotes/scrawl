# Hızlı notlar (Quick notes)

Durum: 24 Ekim 2026'da kullanıcı Google Keep'teki gibi hızlı not istedi. Ölçüt Keep: açınca bütün notlar ve içerikleri bir bakışta görünür. Aynı gün kararları verdi (8. bölüm). Bu taslak ve mockup (Quick notes bölümü) onay bekliyor.

## 1. Kapsam

- **Ne işe yarar:** birkaç satırlık notlar: bir adres, bir telefon, lastik basıncı, şirket bilgileri. Bugün her not bir dosya olduğu için 40 kısa not 40 satır demek; bakmak, açmak, aramak zahmetli. Notu bir dosyada `***` ile bölmek de hızlı yazmaya uymuyor.
- **Tek ekran:** hızlı notlar ağaçta görünmez. Kendi ekranları vardır; orada kartlar halinde, içerikleriyle durur.
- **Yalnız Personal:** hızlı notlar kişisel space'tedir. Space seçimi, klasör ve ad sorulmaz. Kişisel space nerede sync oluyorsa onlar da orada sync olur.
- **Editör aynı:** notun editöründe ne yapılıyorsa hızlı notta da yapılır: biçim çubuğu, resim yapıştırma, dosya bırakma, ses kaydı, tablo, callout, To task, To card, History.
- **Başlık ve not:** Keep'teki gibi iki alan. Başlık boş kalabilir.
- **Pin ve sıra Keep'teki gibi:** pinlenen notlar üstte Pinned altında durur. Sıralama Custom (elle), Date created ya da Date modified.

## 2. Dosyada

### 2.1 Notlar: `Quick notes/`

- Kişisel space'in kökünde `Quick notes` klasörü. Her hızlı not içinde bir `.md` dosyası; OneDrive'da ve başka bir editörde de okunur.
- Dosyanın adı oluşturulduğu andır: `2026-10-24 192301.md`. Bugünkü adsız notların (`createScratchNote`) adıyla aynı biçim. Başlık değişince dosya yeniden adlandırılmaz; sync'te taşıma da olmaz.
- Başlık dosyanın ilk satırıdır, H1 olarak; altında bir boş satır, sonra not:

  ```markdown
  # Necati apartman yöneticisi

  0541 379 91 36
  ```

- Başlık yoksa dosya doğrudan notla başlar. Okurken ilk satır `# ` ile başlıyorsa başlık odur, kalan nottur.
- Neden dosya adı değil: aynı başlıkta iki not olabilir (Keep'teki gibi), başlıkta `/` ve `:` yazılabilir, başlık değişince dosya taşınmaz. Uygulamanın her yerinde ad bugünkü `displayTitle` ile çıkar: adsız dosya ilk satırıyla görünür, `#` atılır. Böylece arama, Trash ve To task'ın "geldiği not"u başlığı gösterir; başlık yoksa notun ilk satırını.
- Başlık düz metindir. Yazılan `*`, `_`, `#` olduğu gibi kalır; dosyada notlardaki gibi ters eğik çizgiyle kaçırılır.
- Kenar durum: başlıksız bir notun ilk satırına H1 verilirse, bir sonraki açılışta o satır başlık olur. Kabul edildi; notun içinde H1 nadirdir.
- Ekler notlardaki gibi `_attachments/`'a gider. Silinen hızlı not çöpe gider, kullandığı dosyalar onunla gider (PLAN 4.2 Çöp kutusu).
- Ağaç `Quick notes` klasörünü kişisel space'in kökünde atlar (`readTree`). Kenar çubuğunda, Browse'da, Move to listesinde ve Create'in klasör listesinde yoktur.
- Kişinin önceden aynı adda bir klasörü varsa, içindeki notlar hızlı not olur. Klasörde başka bir şey de varsa (liste, pano, alt klasör) klasör ağaçta kalır, içinde yalnız onlar görünür.

### 2.2 Sıra ve pin: `.scrawl/quick-notes.json`

```json
{ "order": ["2026-10-24 192301.md", "2026-10-22 081455.md"], "pinned": ["2026-10-20 101010.md"] }
```

- `order` Custom sıradır, dosya adlarıyla. `pinned` pinli notlar, aynı sırayla gösterilir.
- Yeni not `order`'ın başına girer. Listede olmayan not (ajan yazdı, başka cihazda oluştu ve dosya henüz gelmedi, ya da elle kondu) en üste, oluşturulma anına göre en yenisi önce gelir.
- Listede olup klasörde olmayan ad atlanır; dosya bir sonraki yazılışta temizlenir. Çöpten dönen not, adı listeden çıkmışsa en üste gelir.
- Sync: `favorites.json` gibi personal'da durur ve birleştirilir. Yeni bir birleştirme türü `quickNotes`: iki liste de `mergeOrder` ile (`sync/merge-records.ts`).
- Ajana kapalıdır (`.scrawl/`). Ajanın yazdığı not en üste gelir.

### 2.3 Cihazda: sıralama

- Sort seçimi cihazdadır, klasörlerin Sort by'ı gibi: `workspace.json`'da `quickNotes: { sort: 'custom' | 'created' | 'modified' }`. Varsayılan Custom.
- Date created bugünkü oluşturma anlarından gelir (`.scrawl/created/`). Date modified dosyanın son yazılışıdır (Last modified).
- Pinned bölümü de seçilen sırayla dizilir, Keep'teki gibi.

## 3. Ekranda: masaüstü

### 3.1 Kenar çubuğu

- Filters & Labels'ın altında **Quick notes** satırı, Favorites'tan önce. Sağında kaç hızlı not olduğu yazar, pinliler dahil.
- Tıklayınca Quick notes sekmesi açılır, Today gibi bir görünüm. Adı değişmez, sekmesinde simgesi var.

### 3.2 Quick notes sekmesi

- **Üst satır:** solda Quick notes ve not sayısı, sağda arama kutusu ve Sort düğmesi. Sort'un menüsü: Custom, Date created, Date modified; seçili olanın yanında tik.
- **Arama kutusu:** yazdıkça kartları süzer, başlıktan ve nottan. Eşleşme uygulamanın aramasıyla aynı: kelime başında, büyük küçük harf ve aksan farkı gözetmeden. Bulunan kelimeler kartta işaretlenir. Sonuç yoksa: "No quick notes match."
- **Yazma kutusu:** ortada, Keep'teki gibi kapalıyken tek satır: "Take a note…". Tıklayınca yerinde açılır: üstte biçim çubuğu, altında Title, sağında pin simgesi, sonra not, en altta sağda Close. İmleç notta açılır; Title'a tıklayınca oraya geçer, Title'da Enter nota iner.
- Close, Esc ve dışarı tıklamak kaydeder, kutu kapanır; yeni kart Custom'da en üstte görünür ve bir an vurgulanır. Başlık da not da boşsa iz bırakmaz. Yeni not açıkken pin simgesine basılırsa Pinned'a girer.
- **Kartlar:** Keep'teki gibi sabit genişlikte (240 px) kolonlar, pencere genişledikçe kolon artar; kartlar alt alta sıkışık durur (masonry). Pinli not varsa üstte Pinned, altta Others başlığı; yoksa başlık yok.
- **Boş:** hiç hızlı not yokken kartların yerinde ortada simge ve "Notes you take here show up as cards." Yazma kutusu yerinde durur.

### 3.3 Kart

- Başlık kalın; altında not, editördeki görünümüyle ama düzenlenemez: listeler, kalın, link, resim (kart genişliğinde), ses kaydı oynatıcısıyla, dosya linki.
- Uzun not 320 px'ten sonra kesilir, altı soluklaşır.
- Başlıksız kartta yalnız not var, ilk satırı kalın değil (Keep'teki gibi).
- Tıklamak notu pencerede açar (3.4). Karttaki linke tıklamak linki açar, oynatıcı oynatır.
- Üstüne gelince sağ üstte pin simgesi, sağ altta ···. Sağ tık da aynı menüyü açar: Copy, Move to…, History…, Delete. Pin simgesi pinler ve pinden çıkarır.
- Copy notu panoya koyar, notlardaki kopyalama gibi (düz metin, HTML, markdown); başlık en üstte.
- Move to… notu bir klasöre taşır ve normal bir not olur; ağaçta başlığıyla görünür, başlık notta H1'dir. Hızlı notlardan çıkar.
- Delete sormadan çöpe atar, altta "Moved to Trash" ve Undo (görev ve kart gibi).
- Custom sıradayken kart sürüklenip bırakılır; yalnız kendi bölümünde (Pinned ya da Others). Date created ve Date modified'da sürükleme yoktur.

### 3.4 Pencere

- Karta tıklayınca ekranın ortasında bir pencere açılır, kartın yerinden büyüyerek. İçi yazma kutusuyla aynı: üstte biçim çubuğu, Title ve sağında pin, not, altta solda "Modified today, 19:23", sağda ··· ve Close.
- Biçim çubuğu notunkinin aynısıdır (PLAN 4.2 Biçimlendirme): Undo, Redo, biçimler, başlıklar, bloklar, Find, çoklu imleç, resim, tablo, ayırıcı, ses kaydı, To task, To card. Pencere 720 px genişliğindedir; sığmayan çubuk yana kayar, dar penceredeki gibi.
- ··· menüsü: Copy, Move to…, History…, Markdown, Delete. Markdown notun ham halini aynı pencerede gösterir, notun durum çubuğundaki düğme gibi.
- Close, Esc ve dışarı tıklamak kaydeder ve kapatır. Kaydetme notlardaki gibi yazdıkça olur; Close yalnız kapatır.
- Pencere sekme değildir: Recent'e girmez, sekme şeridine eklenmez.

### 3.5 Ekleme yerleri

- **Create:** en üstte Quick note, `1`; "A few lines, seen at a glance". Altında çizgi, sonra öbür türler, numaraları birer kayar (Note `2`). Quick note'un ikinci adımı yok: Create kapanır, açık olan şeyin üstünde boş bir hızlı not penceresi açılır, imleç notta.
- **Space ve klasör + menüsü:** en üstte New quick note, altında çizgi, sonra New note here… ve öbürleri. Sağ tıktaki Add new'de de en üstte Quick note. Hangi space'ten açılırsa açılsın not Personal'a gider; o yüzden adında "here" yok.
- **Başlangıç sayfası:** Create'in türlerinin sırasında da ilk Quick note; tıklayınca aynı pencere açılır.
- **Arama penceresi:** Actions'ta yazınca adı uyan işlemlere New quick note eklenir.
- **Quick notes sekmesi:** yazma kutusu.

### 3.6 Başka yerlerde

- **Her yerde arama:** hızlı notları da bulur. Sağda "Quick note", üstte yer olarak "Quick notes". Açınca pencere açılır, bulunan kelimeler işaretli. All'da ve Notes'ta çıkar.
- **Trash:** silinen hızlı not eski yeri "Quick notes" ile görünür; Restore onu hızlı notlara döndürür.
- **To task ve To card:** görevin ve kartın "geldiği not"u hızlı notu pencerede açar.
- **Files:** hızlı notta kullanılan dosyanın "Used in" yerinde notun başlığı; tıklayınca pencere açılır.

## 4. Ekranda: telefon

- **Browse:** Filters & Labels'ın altında, aynı grupta Quick notes satırı, sağında sayı. Favorites varsa onların altında.
- **Quick notes sayfası:** büyük başlık Quick notes, üst barda Sort simgesi. Altında arama kutusu, sonra kartlar iki kolon. Pinned ve Others masaüstündeki gibi. + yeni hızlı not açar.
- Sort action sheet'tir: Custom, Date created, Date modified.
- **Kart:** dokununca not sayfası açılır. Basılı tutup bırakınca action sheet: Pin (ya da Unpin), Copy, Move to…, kırmızı Delete. Custom'da basılı tutup kaydırınca kart sürüklenir (görevlerdeki gibi).
- **Not sayfası:** üst barda geri (Quick notes), pin ve ···; altında notun format bar'ı, notlardaki gibi hep görünür (PLAN 4.9 Not). Sonra Title (büyük, soluk ipucu "Title"), altında not (ipucu "Note"). ··· menüsü: Copy, Move to…, Find, Markdown, History, Delete; en altta soluk "Modified today, 19:23" (notlardaki gibi).
- **Yeni hızlı not:** imleç notta, klavye açık. Title'a dokununca oraya geçer, Title'da return nota iner. Geri dönünce kaydedilmiş olur; başlık ve not boşsa iz kalmaz.
- **+ sheet'i:** Browse'da ve klasörde + Create sheet'ini açar; en üstte Quick note, altında çizgi. Seçince sheet kapanır, yeni hızlı not sayfası açılır. Klasörün ··· menüsünde de en üstte New quick note.
- Hızlı not sayfası Recent'e girmez.

## 5. Ajan

- `Quick notes` klasörü ajana açıktır, notlar gibi okunur ve yazılır. `tree` onu kişisel space'te bir klasör olarak gösterir.
- Ajanın rehberine bir satır: hızlı not eklemek `Quick notes` klasörüne `create` ile not yazmaktır; başlık ilk satırda `# ` ile.
- Pin ve sıra ajana kapalı (`.scrawl/`).

## 6. Teknik

### 6.1 Çekirdek (`packages/core`)

- `quick-notes.ts`:
  - `QUICK_NOTES = 'Quick notes'`, `QUICK_NOTES_FILE = '.scrawl/quick-notes.json'`.
  - `splitQuickNote(text) → { title, body }`, `joinQuickNote(title, body) → text`. Başlıktaki işaretler editörün yazdığı gibi ters eğik çizgiyle kaçırılır, okurken çözülür (`files.ts`'teki `escaped` / `unescaped` gibi).
  - `parseQuickOrder`, `writeQuickOrder`; `orderedQuickNotes(files, order, created, modified, sort) → { pinned, others }`: listede olmayanları en üste koyar, olmayanları atar.
  - `createQuickNote(fs, title, body, now)`: `createScratchNote(fs, now, QUICK_NOTES)` ile dosyayı açar, adı `order`'ın başına yazar.
- `vault.ts` `readTree`: kişisel space'in kökünde `Quick notes` klasörünün `.md` dosyalarını atlar; içinde başka şey yoksa klasörü de atlar. `isQuickNote(path)`.
- `sync/merge-files.ts`: `mergeKindOf` `.scrawl/quick-notes.json` için `quickNotes`; `mergeFile` iki listeyi `mergeOrder` ile birleştirir.
- `search.ts`: sonuçta `quick: true`; yer "Quick notes".
- `vault.ts` `Workspace`: `quickNotes?: { sort }`.

### 6.2 Web (`apps/web`)

- `items.ts`: `QUICK = 'view:quick'`.
- `QuickNotes.tsx`: sekme (üst satır, yazma kutusu, kart ızgarası, sürükleme), `QuickCard`, `QuickNoteWindow` (biçim çubuğu, Title, editör, alt satır). Editör notlarınki (`@scrawlnotes/editor`), aynı session işlevleri: kaydetme, ekler, kayıt, History.
- Kart ızgarası CSS `columns` değil, kolonlara dağıtan küçük bir yerleşim: Custom sırası soldan sağa okunsun diye (Keep'te sıra satır satırdır). Kartın yüksekliği ölçülür, her kart en kısa kolona girer.
- Karttaki not, editörün salt okunur görünümüyle çizilir (`EditorView` `editable: false`), ilk 320 px.
- `Sidebar.tsx`: Filters & Labels'tan sonra Quick notes satırı ve sayısı.
- `dialogs.tsx` `KINDS`: başa `quick`, ardından ayırıcı. `NewDialog` `quick` seçilince kapanır ve `onQuick()` çağırır.
- Klasör ve space + menüsü, sağ tık Add new, `StartPage.tsx`, arama penceresinin Actions'ı.
- `Phone.tsx`: Browse satırı, `quick` sayfası; `PhoneQuickNotes.tsx`: sayfa, kartlar, not sayfası. `PhoneCreate.tsx`: başa Quick note.
- `session.ts`: `openQuickNote(path)`, `newQuickNote()`, `pinQuickNote`, `moveQuickNote`; kaydetme notlardaki yazma yolundan.
- i18n: `quick.*` metinleri.

### 6.3 Testler

- Çekirdek: başlıklı, başlıksız, `#` içeren başlık yazılıp okunur; `readTree` klasörü atlar, içinde liste varsa klasör kalır; listede olmayan not en üste gelir, olmayan ad atılır; `quickNotes` birleştirmesi iki cihazın sıra değişikliğini birleştirir; arama hızlı notu bulur ve işaretler.
- Web: tarayıcıda yazma kutusu, pencere, sürükleme, Sort, pin, Move to, Delete ve Undo; telefonda sayfa, sheet'ler ve klavye.

## 7. Dilimler

1. **Çekirdek ve masaüstü:** dosya biçimi, sıra dosyası ve birleştirmesi, ağaç, kenar çubuğu satırı, Quick notes sekmesi, kartlar, pencere, Sort, pin, sürükleme, menü. Ajan rehberindeki satır.
2. **Ekleme yerleri ve başka yerler:** Create, + menüleri, Add new, başlangıç sayfası, arama penceresi (sonuç ve Actions), Trash, To task / To card, Files.
3. **Telefon:** Browse satırı, Quick notes sayfası, not sayfası, + sheet'i, action sheet'ler.

## 8. Kararlar (24 Ekim 2026, kullanıcı)

- Hızlı notlar yalnız Personal'da; space gerekmez.
- Her + menüsünde Quick note en üstte.
- Kenar çubuğunda ve telefonda Browse'da Filters & Labels'ın altında; yanında kaç not olduğu.
- Saklama: gizli bir klasörde her not ayrı dosya (önerilen birinci seçenek).
- Notta tepede biçim çubuğu; eklerken Title ve Note, Title'a tıklayınca oraya geçer.
- Markdown editörde ne yapılıyorsa hızlı notta da yapılır (resim, ses vb.).
- Pin olsun.
- Sıra Keep'teki gibi.
- Tepside (system tray) hızlı not ve genel kısayol yok.
