# Yerinde süzme, Filters & Labels ve Favorites

Durum: 23 Ekim 2026'da kullanıcı filtrelerin yalnız kayıtlı filtre olarak yapılmasını saçma buldu: basit bir şeye bakmak için bile Create'ten kalıcı bir öğe açmak gerekiyor, kimse kullanmıyor. Aynı gün kararlar: liste ve panodaki süzme bu cihazda kalır; her yerde birden süzmek Todoist'teki gibi bir Filters & Labels sayfasından olur; altı hazır filtre gelir; her şey yıldızlanıp kenar çubuğuna çıkar; etiketler sayfada space'e göre gruplu durur; Create'teki Filter tamamen kalkar. Listede ve panoda kaydetmenin iki yolu mockup'ta ayrı çizildi; kullanıcı Todoist'inkini seçti, listede ve panoda Save yok (bölüm 3). Aynı gün taslak ve mockup (Filtreler bölümü) onaylandı: klasör ve space yıldızlanmaz, koleksiyon bu işin dışında kalır.

## 1. Kapsam

### 1.1 Bugün

- Süzmenin tek yolu Create → Filter: ad, klasör, Save filter; kenar çubuğunda kalıcı bir öğe olur (`.scrawl/filters.json`). Bir kere bakmak için bile.
- Görev listesinde ve panoda yerinde süzme yok. Panoda yalnız faz şeridi var.
- Koleksiyonda doğru yol zaten var: Filter penceresinde Apply hemen süzer, Save as view isteğe bağlı.

### 1.2 Ne değişir

- **Liste ve pano:** başlıkta Search ve Filter. Seçtiğin an süzülür, dosya oluşmaz. Süzme bu cihazda kalır.
- **Filters & Labels:** kenar çubuğunda hep vardır. Filtreler (hazırlar ve seninkiler) ve space'lerin etiketleri alt alta durur; tıklayınca açılır. + Add filter boş bir filtre açar; Save etmezsen dosya oluşmaz.
- **Kayıtlı filtre:** kendi sekmesinde, aynı çubukla düzenlenir. Filter penceresi kalkar.
- **Favorites:** her şey yıldızlanır ve kenar çubuğunda Favorites altına çıkar.
- **Create:** Filter türü her yerden kalkar (bölüm 6).

### 1.3 Ölçüt

- Todoist: projede View › Filter ile yerinde süzülür; Filters & Labels sayfası hazır filtrelerle gelir, eklenen filtreler ve etiketler orada durur; Favorites kenar çubuğundadır.
- Çubuğun görünüşü Linear ve HubSpot'taki gibi: seçilen her ölçüt bir çip, her çipte ×.

### 1.4 Ne yapmaz

- Today ve Upcoming değişmez.
- Koleksiyon değişmez: Filter penceresi, Apply ve Save as view bugünkü gibi.
- Notta süzme yok. Arama penceresi bugünkü gibi yalnız bulur ve açar.
- Sorgu dili yok (Todoist'teki `@bug & p1` gibi). Seçimler çiplerle yapılır.

## 2. Süzme çubuğu (ortak)

Listede, panoda, kayıtlı filtrede, yeni filtrede ve etiket görünümünde aynı çubuk.

### 2.1 Ölçütler

| Ölçüt | Seçenekler | Nerede |
|---|---|---|
| Labels | space'in etiketleri, birden çok | hepsi |
| Priority | p1, p2, p3, None, birden çok | hepsi |
| Due | Overdue, Today, This week, Next 7 days, No date; biri | hepsi |
| Given to | Me, Others, space'in kişileri, ajanları, Nobody; birden çok | kişili space'te; filtrelerde hep |
| Panonun alanları | koşul: alan, koşul, değer | pano; filtrelerde kartlar için |
| In | space'ler ve klasörler, içindekilerle | yalnız filtrelerde |

- **Search:** başlıktaki kutu. Başlıkta ya da açıklamada geçen yazı (bugünkü Contains); yazdıkça süzer.
- **Birden çok seçilince:** bir ölçütün içinde biri yeter (`bug` ya da `waiting`); ölçütler birlikte geçerlidir (`bug` ve `p1`).
- **Due:** Today, This week ve Next 7 days gecikmişleri de kapsar, bugünkü gibi.
- **Others:** kullanıcıdan başka birine ya da bir ajana verilmiş olan.
- **Panonun alanları:** koşulları bugünkü filtredeki gibidir (Area is Editor, Estimate is more than 3); koşul satırı koleksiyonun Filter'ındakiyle aynı.

### 2.2 Düğme ve menü

- Başlıkta Search… kutusu ve Filter düğmesi. Listede Add task'ın solunda; panoda Fields'ın solunda.
- Filter menüsü: Labels, Priority, Due, Given to. Panoda çizgiyle ayrı panonun alanları.
- Ölçüte tıklayınca menünün yerine değerleri gelir: Labels'ta ve Given to'da üstte arama, altta işaretli satırlar. Tıklamak işaret koyar ya da kaldırır; menü açık kalır, liste arkada hemen süzülür.
- Esc ya da dışarı tıklamak kapatır. ← değerlerden menüye döner.
- Labels'ın listesi etiket seçicinin listesidir (design/labels.md 3.2): renk noktası ve ad. Burada Create ve Edit labels yoktur.

### 2.3 Çipler

- Bir şey seçilince başlığın altında çubuk açılır. Her ölçüt bir çiptir: `Labels: bug, waiting ×`.
- Çipe tıklamak o ölçütün değerlerini açar; × onu kaldırır. Sonda `+ Filter` (aynı menü) ve `Clear`.
- Durum çubuğu süzülmüşü söyler: `4 of 10 tasks`.
- Hiçbir şey uymazsa: "No tasks match the filter." ve altında Clear filter.

### 2.4 Süzülmüş listede iş

- **Ekleme:** yeni görev süzmenin seçtiklerini alır: etiketleri; tek seçilmişse önceliği ve kişiyi; Due Today ise bugünü. Composer'da çip olarak görünürler, kaldırılabilirler.
- **Uymayan ekleme:** görev eklenir, toast der: "Added to Tasks. The filter hides it." Yanında Clear filter.
- **Bölümler:** içinde uyan görev olmayan bölüm süzülürken görünmez.
- **Alt görevler:** uyan alt görev üst görevinin altında durur; üst görev uymuyorsa soluk görünür.
- **Sürükleme:** çalışır. Bırakılan görev, üstündeki görünen görevin arkasına girer.
- **Tamamlananlar:** bugünkü gibi; Show completed açıksa onlar da süzülür.
- **Panoda:** kartlar sütunlarında kalır, sütunun sayısı süzülmüşü sayar. Faz şeridi ayrı bir süzgeçtir, ikisi birlikte geçerli. List ve Calendar görünümleri de süzülür.

### 2.5 Bu cihazda kalır

- Her liste ve pano kendi süzmesini bu cihazda hatırlar, bakışı gibi (`.scrawl/workspace.json`, sync dışı). Kapatıp açınca çipleri yerindedir.
- Başka cihazda ve space'in öbür kişilerinde liste süzülmemiş açılır.
- Search'e yazılan kalmaz: kapatınca gider.

## 3. Listede ve panoda kaydetmek yok

Todoist gibi. HubSpot gibi görünüm sekmeleri de mockup'ta çizilmişti; seçilmedi.

- Liste ve panoda Save yok. Süzme bu cihazda kalır, o kadar.
- Adı olan, her yerden açılan filtre Filters & Labels'ta yapılır (4.4). Etiket görünümünden de kaydedilir (4.6).

## 4. Filters & Labels

### 4.1 Yeri

- Kenar çubuğunda Today ve Upcoming'in altında Filters & Labels satırı, hep orada. Altında Favorites (bölüm 5).
- Kayıtlı filtreler artık kenar çubuğunda kendi başına durmaz; sayfadadır, yıldızlanırsa Favorites'tadır.
- Bugünkü filtrelerin `folder`'ı dosyada kalır, kullanılmaz.

### 4.2 Sayfa

- Bir sekmede açılır; başlık Filters & Labels. İki bölüm, başlıklarından katlanır.
- **Filters:** her satırda süzgeç simgesi, ad ve uyan açık görev ve kart sayısı. Üstüne gelince yıldız ve ···. Bölüm başlığının sağında + (Add filter).
- **Labels:** space'e göre gruplu, her grup kendi başlığıyla: `Labels · Scrawl`. Satırda renk noktası, ad, kaç görevde ve kaç kartta olduğu. Üstüne gelince yıldız. Grup başlığının sağında Edit labels: o space'in Labels penceresini açar (design/labels.md 3.5). Etiketi olmayan space'in grubu yok.
- ··· menüsü (filtrede): Add to favorites, Rename, Delete (onaylı; görevler yerinde kalır).
- Satıra tıklamak o filtreyi ya da etiketi kendi sekmesinde açar.

### 4.3 Hazır filtreler

- Priority 1, Priority 2, Priority 3, Given to me, Given to others, No date.
- Sıradan filtrelerdir: değiştirilir, yeniden adlandırılır, silinir.
- Her kişiye bir kez eklenir: `.scrawl/filters.json` varsa da, içinde kişinin kendi filtreleri varsa da. Kişide olmayanlar onunkilerin önüne girer; dosyaya verildikleri yazılır (`presets`), silinen hazır filtre bir daha gelmez. İleride yeni bir hazır filtre çıkarsa o da bir kez eklenir.
- Sabit kimlikleri vardır (`p1`, `p2`, `p3`, `given-me`, `given-others`, `no-date`); iki cihaz ikisini de eklese sync tek kopya bırakır.
- Personal space sync'liyse personal space'in ilk sync'i bittikten sonra eklenir, başka cihazda verildiyse eklenmez.
- 24 Ekim: ilk kural dosya yoksa yazmaktı; bir kullanıcıda 19 Ekim'den kalma boş bir `filters.json` olduğu için hazır filtreler hiç gelmedi, kural bununla değişti.

### 4.4 Yeni filtre

- + Add filter bir sekme açar: New filter. Search ve çubuk; ilk anda her yerdeki açık görevler ve bitmemiş kartlar, listelerine ve panolarına göre gruplu. Grupta önce tarih, sonra öncelik; bugünkü filtre görünümü gibi.
- Seçtikçe süzülür. Bir şey seçiliyken çubuğun sonunda Save as filter.
- Save as filter küçük bir pencere açar: Name, seçimlerden üretilmiş olarak dolu (`bug · Scrawl`); Add to favorites onay kutusu; Cancel ve Save.
- Kaydedilen filtre sayfaya girer, sekme onun olur.
- Kaydedilmeden kapanan yeni filtre gider; sormaz.

### 4.5 Kayıtlı filtre

- Kendi sekmesi: başlıkta adı, altında aynı çubuk, seçimleri çipte.
- Bir çip değişince çubuğun sonunda Save ve Revert çıkar. Kaydetmeden kapatılırsa değişiklik gider.
- ··· ve sağ tık: Add to favorites, Rename, Delete. Edit filter ve Filter penceresi kalkar.
- Sekmeye çift tıklamak Rename penceresini açar.
- Kişiseldir: `.scrawl/filters.json`, bugünkü gibi.

### 4.6 Etiket görünümü

- Etikete tıklayınca sekme: başlıkta renk noktası ve ad, yanında space'in adı.
- O space'te o etiketi taşıyan açık görevler ve bitmemiş kartlar, listelerine ve panolarına göre gruplu.
- Çubukla daha da süzülür (Priority, Due…); bu süzme bu cihazda kalır, liste gibi. Bir şey seçiliyken çubuğun sonunda Save as filter: kaydedilen filtre `In` ve `Labels` ile birlikte gelir.

## 5. Favorites

- **Ne yıldızlanır:** not, görev listesi, pano, koleksiyon, keys dosyası, filtre, etiket.
- **Nasıl:** sağ tık (kenar çubuğunda ve sekmede) ve Filters & Labels'ta satırın yıldızı: Add to favorites, Remove from favorites. Telefonda ··· menüsünde.
- **Kenar çubuğunda:** Today, Upcoming ve Filters & Labels'ın altında Favorites başlığı. Yıldızlananlar eklendikleri sırayla, türünün simgesiyle; etiket renk noktasıyla. Personal space'te olmayanın adının yanında soluk space adı. Sürükleyerek sıralanır. Boşsa başlık görünmez.
- **İzler:** taşınan ya da adı değişen şeyin yıldızı onunla gider. Çöpe giden favoride görünmez; geri gelince yine görünür.
- **Kişiseldir:** `.scrawl/favorites.json`, personal space'te; kişinin cihazlarında sync ile.

## 6. Create'ten kalkanlar

- Create penceresi ve Ctrl+N: Filter türü.
- Başlangıç sayfası: türler sırasında Filter.
- Klasörün ve space başlığının + menüsü: New filter here…. Sağ tıktaki Add new: Filter….
- Telefonda Create sheet'i: Filter.

## 7. Telefon

- **Liste ve pano:** üstteki düğmelerde süzme simgesi, ···'nin solunda. Süzme açıkken simge dolu.
- **Filter sheet'i:** satırlar Labels, Priority, Due, Given to; seçilenler sağda. Panoda ayrıca panonun alanları. Satıra dokununca o ölçütün sheet'i açılır: işaretli satırlar, liste arkada süzülür.
- **Çipler:** başlığın altında yana kayan bir satır, her çipte ×, sonda Clear.
- **Browse:** en üstte Favorites, altında Filters & Labels satırı; sonra space'ler, bugünkü gibi. Kayıtlı filtreler klasörlerde görünmez.
- **Filters & Labels:** aynı iki bölüm, satırlar telefon satırı. Bir filtrenin sayfasında çip satırı; değişince üst barda Save.

## 8. Dosyada

### 8.1 Süzme

```ts
interface FilterChoices {
  due: DueRule;
  priorities: Priority[];
  text: string;
  /** Yeni. Biri yeter; büyük-küçük harf farksız. */
  labels?: string[];
  /** Yeni. Kişinin ya da ajanın id'si; 'me' kullanıcı, 'others' başkası, 'none' kimseye verilmemiş. */
  assignees?: string[];
  fields?: Condition[];
  /** Yalnız filtrelerde. */
  folders: string[];
}
```

- Eski filtredeki `mine: true`, `assignees: ['me']` okunur. `assignees` yalnız `['me']` iken `mine: true` da yazılır; eski sürüm onu anlar.

### 8.2 Bu cihazda: `.scrawl/workspace.json`

- `BoardLook.filter?: FilterChoices` (folders boş).
- Yeni `lists: Record<string, ListLook>`, `ListLook { filter?: FilterChoices }`.
- Yeni `labelLooks: Record<string, FilterChoices>`: etiket görünümünde eklenen süzme, `space/etiket` ile.

### 8.3 Kayıtlı: `.scrawl/filters.json`

- Biçim aynı; `labels` ve `assignees` eklenir. `folder` okunur, kullanılmaz.
- Hazır filtreler sabit kimlikleriyle (4.3). `presets`: kişiye verilen hazır filtre takımı, `1`; yoksa henüz verilmemiş. Sync iki taraftan büyüğünü tutar.

### 8.4 Favoriler: `.scrawl/favorites.json`

```json
{ "version": 1, "favorites": [ { "item": "Scrawl/Roadmap.board.json" }, { "filter": "p1" }, { "label": "bug", "space": "Scrawl" } ] }
```

- `item` sekmelerin tuttuğu yoldur (space'in önekiyle). `space`, etiketin space'i, aynı biçimde.
- Sync `filters.json` gibi birleştirir; kimlik `item`, `filter` ya da `label` + `space`.
- Liste ve pano dosyaları değişmez.

## 9. Ajan

- Değişmez. `tasks` ve `cards` zaten etikete, kişiye ve tarihe göre süzüyor; `.scrawl/` ajana kapalı.

## 10. Kodda

- **core**
  - `filters.ts`: `labels`, `assignees` (`others` dahil); `matchesFilter`, `matchesFilterCard`, `filterName` bunları da tanır. Yerinde süzme için `matchesChoices` (klasörsüz). `parseFilters`: `mine` → `assignees`. `PRESET_FILTERS`.
  - `favorites.ts` (yeni): okuma, yazma; taşıma ve yeniden adlandırmada yolun izlemesi (`move`'un linkleri izlettiği yerden).
  - `vault.ts`: `ListLook`, `BoardLook.filter`, `labelLooks`.
  - `sync/merge-files.ts`: `favorites.json` birleştirme türü.
- **web**
  - `FilterBar.tsx` (yeni): `FilterButton`, `FilterMenu` (ölçütler ve değerleri, ← ile dönüş), `FilterChips`, `SaveFilterDialog` (ad ve Add to favorites); telefonda `TaskFilterSheet` (koleksiyonun `FilterSheet`'inden ayrı).
  - `FiltersAndLabels.tsx` (yeni): sayfa, iki bölüm, yıldız ve ···; New filter, kayıtlı filtre ve etiket görünümü sekmeleri (bugünkü `FilterView` buraya taşınır).
  - `Tasks.tsx`: başlıkta Search ve Filter; süzülmüş satırlar, bölümün gizlenmesi, soluk üst görev, boş durum; composer'ın önceden dolması ve toast.
  - `Board.tsx`: başlıkta Search ve Filter; `visible` süzmeyi de katar; List ve Calendar.
  - `App.tsx`: kenar çubuğunda Filters & Labels ve Favorites; sağ tıkta ve sekmede Add to favorites; Create, Ctrl+N, başlangıç sayfası, + menüsü ve Add new'den Filter çıkar.
  - `dialogs.tsx`: `FilterDialog` kalkar.
  - `PhoneTasks.tsx`, `PhoneBoard.tsx`, `Phone.tsx` (Browse: Favorites, Filters & Labels), `PhoneCreate.tsx`.
  - `session.ts`: `lookAtList`, `lookAtBoard`'da süzme, etiket görünümünün bakışı; favoriler; hazır filtrelerin yazılması.
  - `i18n/en.ts`: metinler.

## 11. Testler

- **core:** `matchesFilter` ve `matchesFilterCard`'da etiket (harf farksız, biri yeter) ve kişi (`me`, `others`, `none`, ajan); eski `mine`'ın okunması ve yazılması; `filterName`'de etiket ve kişi; hazır filtrelerin iki cihazdan yazılıp birleşince tek kalması; favorinin taşımada ve yeniden adlandırmada izlemesi, çöpte görünmemesi; `favorites.json` birleştirmesi; workspace'te `lists`, `BoardLook.filter` ve `labelLooks`.
- **web:** tarayıcıda her ekran mockup'la yan yana. Filter › Labels › bug üç tıklamada süzer; kapatıp açınca süzme yerinde; süzülmüş listede ekleme ve toast; panoda sütun sayıları; Filters & Labels'ta hazır filtreler; New filter ve Save as filter; kayıtlı filtrede Save ve Revert; etiket görünümü; yıldızlanan şeyin Favorites'a gelmesi ve taşınınca izlemesi; Create'te Filter yok; telefon görünümü.

## 12. Dilimler

1. **Ortak çubuk ve görev listesi:** core'da `labels` ve `assignees`, workspace; `FilterBar.tsx`; `Tasks.tsx`; telefonda liste.
2. **Pano:** alanlar dahil, List ve Calendar; telefonda pano.
3. **Filters & Labels:** sayfa, hazır filtreler, New filter, Save as filter, kayıtlı filtre, etiket görünümü; Filter penceresi ve Create'teki Filter kalkar; telefon.
4. **Favorites:** `favorites.json`, kenar çubuğu, sağ tık ve yıldız, izleme; telefonda Browse.

- Görevde Labels ölçütü ve sayfadaki etiket sayıları, görev etiketinin geldiği işe bağlı (design/labels.md, 2. dilim). Kartta etiket bugün de var.

## 13. Bu işte olmayanlar

- Today ve Upcoming'de süzme.
- Klasörü ve space'i yıldızlamak.
- Koleksiyonda değişiklik. Düz tabloya Apply ile verilen koşulların hatırlanmaması da bugünkü gibi kalır.
- Satırdaki etiket çipine tıklayınca süzmek: çip seçiciyi açıyor (design/labels.md 3.1).

## 14. PLAN'da değişecekler

- 4.1 kenar çubuğu: Today ve Upcoming'in altında Filters & Labels ve Favorites; kayıtlı filtreler klasörde durmaz.
- 4.1 sekme maddesi: "filtrede Filter penceresi açılır" yerine Rename.
- 4.1 başlangıç sayfası: Create türleri sırasından Filter çıkar.
- 4.1 sağ tık: + menüsünden ve Add new'den Filter çıkar; Add to favorites girer.
- 4.3 Kayıtlı filtreler maddesi baştan: yerinde süzme, çipler, bu cihazda kalması, Filters & Labels, hazır filtreler, New filter, kayıtlı filtre, etiket görünümü.
- 4.4: panoda süzme.
- Keys ve koleksiyon bölümlerindeki "Filter'dan önce" sıra ifadeleri.
- 4.9 telefon: listede ve panoda süzme, Browse'ta Favorites ve Filters & Labels.
- design/labels.md 1.1'deki "Kenar çubuğunda etiket listesi yok" yerinde kalır; etiket yalnız yıldızlanınca Favorites'a çıkar.
- Aşama tablosu değişmez. Roadmap'te etiket işi gibi fazsız tek kart, ROA-230; dilimler alt görevleri.
