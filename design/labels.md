# Görevde etiket ve görevin düzenleme kutusu

Durum: 23 Ekim 2026'da kullanıcı görevlere etiket istedi; aynı işe görevin düzenleme kutusundaki üç değişikliği ekledi. Aynı gün taslak ve mockup (Etiketler bölümü) onaylandı. Etikete göre süzme bu işten çıktı: kullanıcı filtreleri başka bir oturumda baştan ele alıyor.

## 1. Kapsam

### 1.1 Etiket

- **Ne işe yarar:** görevi listesinden bağımsız gruplar: `waiting`, `call`, `errand`, `bug`.
- **Ölçüt Todoist:** satırda etiket çipleri, görevde etiket seçici, başlıkta `@` ile ekleme, etiketlerin yeniden adlandırılması, rengi ve silinmesi.
- **Space'te ortak:** bir space'in görevleri ve kartları aynı etiketleri kullanır. Today görevleri ve kartları birlikte gösterdiği için `bug` her yerde aynı etikettir, aynı renktedir.
- **Ortak bileşen:** seçici tek bileşendir; görevde, kartta ve koleksiyonun çoklu seçim (multi-select) alanında aynısı kullanılır. Telefonda da tek sheet.
- **Ne yapmaz:** etikete göre süzme bu işte yok (filtreler başka oturumda). Kenar çubuğunda etiket listesi yok. Kartın ve kaydın alt görevleri etiket almaz. Notta etiket yok; notta `#kelime` aramayla bulunur, bugünkü gibi.

### 1.2 Görevin düzenleme kutusu (masaüstü)

- **Alt bar:** görevin düzenleme kutusundaki düğmeler (Date, Priority, Labels, Given to, Record, Attach) kutunun altındaki bara iner; Cancel barın sağında. Bugün Attach açıklamanın altında, diğerleri satırın sağında ve düzenlerken gizli.
- **Açıklamada Enter kaydeder:** alt satıra inmez; alt satır Ctrl+Enter. Yalnız masaüstünde; telefonda Enter alt satırdır, sheet'in kendi Save'i var.
- **Save yok:** dışarı tıklamak ve Enter zaten kaydediyor. PLAN 4.1'deki "Her iş bir düğmeyle biter" kuralı telefon yalnız responsive iken gerekiyordu, kalkar.

## 2. Dosyada

### 2.1 Görev ve kart

```json
{ "id": "t-81", "title": "Call the accountant", "labels": ["call", "waiting"], … }
```

- Görevde `labels` alanı baştan ayrılmıştı (`tasks.ts`), şimdi kullanılır. Boşsa dosyaya yazılmaz. Kartta bugün de böyle.
- Etiket serbest bir kelimedir; baştaki ve sondaki boşluk kırpılır. Büyük-küçük harf farkı aynı etiket sayılır: `Bug` varken `bug` eklemek ikincisini getirmez, ilk yazılış kalır.

### 2.2 Space'in etiketleri: `.scrawl/labels.json`

```json
{ "labels": [ { "name": "waiting", "color": "orange" }, { "name": "bug", "color": "red" } ] }
```

- Renk koleksiyon seçeneklerinin dokuz renginden biridir: gray, red, orange, yellow, green, teal, blue, purple, pink. Fields penceresindeki renk noktalarıyla aynı.
- Seçiciden ya da `@` ile yeni bir etiket oluşunca dosyaya adından gelen renkle (dokuzdan biri, hep aynısı) yazılır. Bugün kartın etiketi rengini adından sürekli bir tondan alıyor; bu dokuz renge döner.
- Dosyada olmayan ama bir görevde ya da kartta kullanılan etiket de vardır (ajan yazmıştır, eski bir sürüm yazmıştır); adından gelen renkle görünür.
- Hiçbir yerde kullanılmayan etiket dosyada durur ve seçicide görünür (Todoist'teki gibi), Labels penceresinden silinene kadar.
- Sync: `filters.json` gibi birleştirilir; ad (büyük-küçük harf farksız) kimliktir, renk alan alan. Ajana kapalıdır (`.scrawl/`); ajan etiketi görevin ve kartın üstüne yazar.

## 3. Ekranda: masaüstü

### 3.1 Görev satırı

- Etiketler meta satırında, tarihten sonra çip olarak durur: renk noktası ve ad.
- Çipe tıklamak seçiciyi açar (tarih çipine tıklamak tarih menüsünü açtığı gibi).
- Satırın düğmelerinde öncelikten sonra etiket simgesi; ··· menüsünde Priority'den sonra Labels….
- Today ve Upcoming aynı satırı kullanır, orada da görünür.

### 3.2 Seçici (ortak)

- Üstte arama kutusu, odak onda. Altında space'in etiketleri: görevdekiler önce işaretli, sonra en çok kullanılan üstte. Seçici açıkken satırlar yer değiştirmez (kartta bugün böyle).
- Tıklamak ya da Enter işaret koyar ya da kaldırır; seçici açık kalır, Esc ya da dışarı tıklamak kapatır.
- Aranan etiket yoksa en altta `Create “kelime”`; Enter onu oluşturur ve koyar.
- En altta `Edit labels…`: Labels penceresini açar.
- Kartta bugünkü yerinde, Labels alanının altında açılır. Görevde düğmenin altında.

### 3.3 Başlıkta `@`

- Görev başlığında kelime başında `@` yazınca başlığın altında seçicinin listesi açılır (arama kutusu yok; `@`'ten sonra yazılan aramadır).
- Enter, Tab ya da tıklama seçilileri koyar: `@kelime` başlıktan silinir, etiket çip olarak alt bara girer. Listede yoksa ilk satır `Create “kelime”`dir.
- Boşluk ya da Esc listeyi kapatır, yazılan başlıkta kalır. `ali@site.com` gibi kelimenin ortasındaki `@` listeyi açmaz.
- Liste açıkken Enter görevi eklemez/kaydetmez, etiketi seçer; ikinci Enter ekler. Todoist'teki gibi.
- Çalıştığı yerler: yeni görev kutusu, görevin düzenleme kutusu, alt görev ekleme satırı; telefonda + ile ekleme ve görevin sheet'i.

### 3.4 Görevin düzenleme kutusu

```
[○] Call the accountant
    Ask about the VAT return for Q3.
    ─────────────────────────────────────────────────────────────
    [📅 Oct 24] [⚑ p2] [🏷 call · waiting] [👤 Mert] [▦ Record] [📎]      Cancel
```

- Başlık, açıklama, altta bar. Bardaki düğmeler yeni görev kutusundaki çiplerin aynısıdır: değer varsa renkli, yoksa adıyla soluk. Given to yalnız kişili space'te.
- Bar düzenlerken meta satırının yerini alır; alt görev sayısı ve "from:" linkleri açıklamanın altında kalır.
- Attach barda simge; dosya açıklamanın imlecine eklenir, bugünkü gibi.
- Save yok. Kaydetmek: başlıkta ya da açıklamada Enter, ya da kutunun dışına tıklamak. Cancel ve Esc vazgeçer.
- Yeni görev kutusu (TaskComposer) aynı düzene gelir: çiplerine Labels eklenir, Attach açıklamanın altından bara iner. Foot'u (liste seçimi, Cancel, Add task) değişmez.

### 3.5 Labels penceresi (yönetim)

- Ortada küçük pencere: "Labels · Scrawl". Space'in etiketleri adına göre sıralı; her satırda renk noktası, ad, kaç görevde ve kaç kartta olduğu, ···.
- Renk noktasına tıklamak dokuz rengi açar. Ada tıklamak (ya da ··· › Rename) yerinde yeniden adlandırır; Enter ya da dışarı tıklamak kaydeder.
- Varolan bir etiketin adı verilirse ikisi birleşir: önce sorulur ("bug zaten var. Merge?").
- ··· › Delete onay sorar: "Delete “waiting”? It comes off 12 tasks and 3 cards." Etiket her yerden kalkar, görevler ve kartlar yerinde kalır. Çöpe gitmez, geri alınmaz.
- Yeniden adlandırma ve silme space'teki bütün görev listelerini ve panoları yazar; kimsenin Worked on'una girmez, zaman çizgisine yazılmaz.
- Pencere seçicinin `Edit labels…` satırından açılır.

### 3.6 Kart ve koleksiyon

- Kartın Labels alanı ortak seçiciye geçer; görünüşü bugünkü gibi kalır, listeye `Edit labels…` gelir. Pano yüzündeki ve List görünümündeki çipler space'in renklerini alır.
- Koleksiyonun çoklu seçim alanı (CRM'deki Tags gibi) aynı alanı kullanır: kutuda çipler, tıklayınca seçici. Seçenekler alanın seçenekleri, renkleri alanın renkleri. Yeni bir değer yazılınca bugünkü gibi kayda eklenir; buna ek olarak koleksiyonun başka kayıtlarında kullanılan değerler de listede çıkar (bugün çıkmıyor: Tags'e bir kayıtta yazılan, sonrakinde önerilmiyor). Koleksiyonda `Edit labels…` yok; seçenekler bugünkü gibi Fields'ta düzenlenir.
- Koleksiyon tablosundaki hücre düzenlemesi ve telefondaki çoklu seçim sheet'i de aynı bileşene geçer.

### 3.7 Masaüstünde Save'in kalktığı yerler

Dışarı tıklayınca ve Enter'la zaten kaydeden yerler:

| Yer | Bugün | Sonra |
|---|---|---|
| Görevin düzenleme kutusu | Cancel, Save | Barda Cancel |
| Section'ın adı | Cancel, Save | Cancel |
| Kartın alt görevini düzenleme | Cancel, Save | Cancel |
| Kartın başlığı ve metin alanları | Değişince Save | Yok |
| Panoda sütunun ve fazın adı | Save | Yok (telefonda kalır) |

Pencereler (Rename, kayıt formu, Fields, Settings'teki ad, Keys satırı) dışarı tıklayınca kaydetmez; Save'leri kalır.

## 4. Ekranda: telefon

- Görev satırında etiketler meta satırında, diğer bilgilerin yanında.
- Görevin sheet'inde Priority'den sonra **Labels** satırı; dokununca etiket sheet'i.
- + ile eklemede çiplere Labels eklenir; başlıkta `@` klavyenin üstünde listeyi açar.
- Etiket sheet'i (ortak): arama, işaretli satırlar, `Create “kelime”`, en altta Edit labels. Kart ve koleksiyon da bunu kullanır (bugünkü LabelSheet ve çoklu seçimin ChoiceSheet'i yerine).
- Edit labels bir sayfa açar: etiketler renk noktasıyla; dokununca adı, rengi ve Delete'i olan bir sheet.

## 5. Ajan

- `save_task`: `labels` (dizinin tamamı; boş dizi hepsini kaldırır). `items` ile eklerken de.
- `tasks`: `label` süzgeci (kartlardaki `cards` gibi); her görev `labels`'ıyla döner.
- Rehber: görevin alanlarına `labels`; bir space'te görev ve kart etiketlerinin ortak olduğu, yeni etiket uydurmadan önce varolanlara bakılacağı.
- Ajan etiketi yeniden adlandırmaz, silmez, rengini değiştirmez; o kişinindir.

## 6. Kodda

- **core**
  - `labels.ts` (yeni): `SpaceLabel { name; color? }`, `parseLabels`, `labelsFile(root)`, `cleanLabels` (board.ts'ten taşınır, harf farksız), `labelColor(name, known)` (dosyadaki renk ya da addan dokuzdan biri), `usedLabels(lists, boards)` (adı, görev ve kart sayısı), `relabel(fs, root, from, to | null)` (space'in `*.tasks.json` ve `*.board.json`'larını gezer, değişeni yazar; `labels.json`'u da).
  - `tasks.ts`: `NewTask.labels`, `TaskPatch.labels`; yazarken `cleanLabels`. Etiket değişikliği `workedOn`'a girer, timeline'a yazılmaz (kartta da böyle).
  - `search.ts`: görev etiketinden de bulunur.
  - `sync/merge-files.ts`: `.scrawl/labels.json` birleştirme türü.
- **agent:** `tasks.ts`, `server.ts` şemaları, `guide.ts`.
- **web**
  - `labels.tsx` (yeni): `LabelChip`, `LabelList` (arama, işaret, Create, Edit labels, klavye), `LabelPop` (bir düğmenin altında), `LabelsField` (form alanı: kutuda çipler), `LabelSheet` (telefon), `LabelsWindow` ve telefonda `LabelsPage`, `useAtLabels` (başlıkta `@`).
  - Bileşene geçenler: `CardPanel.tsx` (`LabelField`, `LabelPicker`), `PhoneBoard.tsx` (`LabelSheet`), `Collection.tsx` (`ChipsField`), `Grid.tsx` (`ChoicesEditor`), `PhoneCollection.tsx` (çoklu seçim).
  - `Tasks.tsx`: satır çipleri, düğme ve menü, düzenleme kutusunun alt barı, Save'in kalkması, section adında Save'in kalkması, alt görev satırında `@`.
  - `TaskComposer.tsx`: Labels çipi, Attach bara, `@`.
  - `Description.tsx`: `onEnter` (masaüstünde Enter onu çağırır, Ctrl+Enter alt satır, liste devamıyla), `attach={false}` ile kendi Attach'ını göstermez, dışarıya `attach()` verir.
  - `Subtasks.tsx` ve `CardPanel.tsx`: masaüstünde Save'in kalkması.
  - `PhoneTasks.tsx`: sheet'te Labels, QuickAdd'de çip ve `@`.
  - `session.ts`: space başına etiketler (okuma, yazma, `relabel`).
  - `i18n/en.ts`: metinler.

## 7. Testler

- core: `cleanLabels` (kırpma, harf farksız tekrar), görevde etiket yazma/okuma/patch, `relabel` (yeniden adlandırma, birleşme, silme; görev ve kart; başka space'e dokunmaz), `labels.json` okuma ve sync birleştirmesi, aramada etiket.
- agent: `save_task` ile etiket koyma ve kaldırma, `items` ile, `tasks` `label` süzgeci.
- web: tarayıcıda her ekran mockup'la yan yana; `@` akışı, Enter/Ctrl+Enter, dışarı tıklayınca kaydetme, Labels penceresinde yeniden adlandırma ve silme, telefon görünümü.

## 8. Dilimler

1. **Ortak etiket bileşeni ve yönetim:** core `labels.ts`, `labels.json` ve sync'i, `relabel`; web `labels.tsx`; kart ortak seçiciye geçer; Labels penceresi ve telefonda sayfası.
2. **Görevde etiket ve düzenleme kutusu:** satır, düğme ve menü, alt bar, Attach bara, açıklamada Enter, masaüstünde dört yerde Save'in kalkması, yeni görev kutusu, `@`, telefon.
3. **Arama ve ajan.**
4. **Koleksiyonun çoklu seçimi ortak bileşende** (form, tablo hücresi, telefon) ve kullanılan değerlerin önerilmesi.

## 9. Bu işte olmayanlar

- Etikete göre süzme: kullanıcı filtreleri başka oturumda ele alıyor.
- Kart başlığında `@`: istenen görevdeydi; istenirse aynı liste kartın başlığına da gelir.

## 10. PLAN'da değişecekler

- 2 Yapmayacaklarımız: "etiket yönetimi" çıkar.
- 3 Kararlar: Etiketler satırı "görevde ve kartta var, space'te ortak, `.scrawl/labels.json`'da renkleri; notta yok, `#kelime` aramayla bulunur" olur. Todo satırından "Doğal dil ekleme" çıkar (kullanıcının kuralı değildi; kural uygulama içi asistan olmamasıdır).
- 4.1: "Her iş bir düğmeyle biter" maddesi kalkar; yerine "Masaüstünde satır içi düzenleme Enter'la ve dışarı tıklayınca kaydeder, Save yoktur; Cancel ve Esc vazgeçer. Telefonda sheet'lerin kendi düğmeleri vardır (4.9)."
- 4.3: görev alanlarına etiket; açıklamada Enter kaydeder, Ctrl+Enter alt satır; düzenleme kutusunun alt barı; `@`; Labels penceresi.
- 4.4: kartın etiketleri space'te ortak, renkleri `labels.json`'dan; yönetim ekranı var.
- 4.6: çoklu seçim ortak alanla, kullanılan değerler önerilir.
- Aşama satırı ve Roadmap: şimdiki iş olarak.

## 11. Yazılırken: 1. dilim (ortak seçici ve Labels)

- Yeniden adlandırma ve silme core'da saf işlevlerdir (`relabelTasks`, `relabelBoard`, `relabelKnown`); dosyaları uygulama kendi yazma kuyruğuyla yazar, böylece açık listeler ve panolar hemen güncellenir. `updated` ve `workedOn` değişmez.
- Addan gelen renk gri dışındaki sekiz renkten biridir; gri "renksiz" gibi okunuyor. Kullanıcı Labels'ta griyi seçebilir.
- Hiçbir şeyde olmayan ama dosyada duran etiket sayılarla birlikte "not used" görünür.
- Kartın seçicisi artık panonun değil space'in etiketlerini önerir (görevlerinkiler de).
- Telefonda Edit labels, açık sekmenin sayfa yığınına bir sayfa olarak eklenir; geri düğmesi ve kaydırma her sayfadaki gibi.
- Birleştirme sorusu: "“bug” is already a label · The tasks and cards with “urgent” get “bug” instead." (Merge). Silme sorusu: "It comes off 2 tasks and 1 card. They stay where they are."

## 12. Yazılırken: 2. dilim (görevde etiket ve düzenleme kutusu)

- Bardaki çipler değeri hemen yazar (tarih, öncelik, etiket, kişi, kayıt); Cancel yalnız başlıkla açıklamayı geri alır. Bardan açılan seçici açıkken kutu kapanmaz; seçici kapanınca klavye başlığa döner, seçici açıkken kutunun dışına basılmışsa kutu kaydedip kapanır.
- Öncelik çipinin menüsü kutunun kendisinden açılır (satırın ··· menüsü değil), böylece kapanınca kutu nereye döneceğini bilir.
- Satırın düğmelerine Labels simgesi, dokunmatik ekrandaki ··· menüsüne Labels… eklendi; sağ tık menüsü değişmedi.
- `@` yalnız kelime başında açılır; görevde zaten olan etiket listede çıkmaz; seçilen etiketin önündeki boşluk kalır, kaydederken kırpılır.
- `@` listenin satır içi eklemesinde (`+ Add task`, section ve alt görev satırı) seçilen etiketler Cancel ve Add task'ın solunda çip olarak görünür; tıklayınca kalkar.
- Açıklamada Enter, editörün açtığı bir liste (`/` menüsü) varken listenin olur; Shift+Enter editörün kendi alt satırıdır.
- Panoda sütun ve faz adını yerinde değiştirmenin Save'i de masaüstünde kalktı (aynı durum: dışarı tıklamak ve Enter zaten kaydediyordu).

## 13. Yazılırken: 3. dilim (arama ve ajan)

- Arama penceresi görevi etiketinden de bulur; satırda kartlardaki gibi "Labels: …" alanı görünür.
- `tasks` aracının `label` süzgeci büyük-küçük harf farksızdır; `due` ve `assignee` gibi, liste ve space verilmeden bütün space'lerde arar.
- `save_task`'ta `labels` dizinin tamamıdır: verilen, görevdekilerin yerine geçer; `[]` hepsini kaldırır. `items` ile eklerken de olur.
- Rehber, bir space'te görev ve kart etiketlerinin ortak olduğunu ve yeni etiket uydurmadan önce varolanlara bakılacağını söyler; rengi ve yeniden adlandırması kişinindir.

## 14. Yazılırken: 4. dilim (koleksiyonun çoklu seçimi)

- Koleksiyonun ve panonun çoklu seçim alanı ortak seçiciyi kullanır: kayıt formunda (bugünkü yazarak eklenen kutunun yerine), tablo hücresinde, kartın alanlarında ve telefonda (sheet). Arama satırı "Find or add", olmayan değer "Add “…”".
- Listede önce seçili olanlar, sonra alanın seçenekleri şemadaki sırayla, sonra başka kayıtlarda (panoda başka kartlarda) yazılmış değerler, en çok kullanılan önce.
- Renk alanın verdiği; vermediği seçenek bugünkü gibi metninden renk alır, etiketlerin dokuz rengine dönmez.
- Yazılan yeni değer yalnız kayda girer: alanın seçeneklerine eklenmez, space'in etiket dosyasına yazılmaz; seçenekler Fields'ta düzenlenir, Edit labels çıkmaz.
- Tek seçimli alan (select) bugünkü gibi kalır.
