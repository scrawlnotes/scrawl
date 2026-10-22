# Sync motoru: tasarım

Faz 5'in ilk adımı. Motor `packages/core/src/sync/` altında, arayüzden ve sağlayıcıdan bağımsız yazılır; bu adımda arayüz ve OneDrive yoktur. Doğruluğu sahte bir uzak depoyla, çakışma senaryolarını kapsayan testlerle kanıtlanır (PLAN 7. Riskler).

## 1. Kavramlar

- **Yerel:** space'in bu cihazdaki kopyası; bugünkü `VaultFs` (masaüstünde klasör, web'de OPFS).
- **Uzak:** space'in kaynağı (OneDrive; sonra sunucu, Dropbox, S3 uyumlu depolama, GitHub, Google Drive). Motor onu yalnızca aşağıdaki `RemoteStore` arayüzüyle tanır.
- **Taban:** her dosyanın son eşitlendiği haldeki kaydı. Yerel ve uzak, tabana göre "değişti" ya da "değişmedi" diye okunur; ikisi birden değiştiyse birleştirilir.

```ts
interface RemoteStore {
  /** İmleçten beri değişenler; imleç yoksa her şey. Sonunda yeni imleç. */
  changes(cursor: string | null): Promise<{ changed: RemoteEntry[]; removed: string[]; cursor: string }>;
  read(path: string): Promise<Blob>;
  /** Boş bir klasör; varsa bir şey yapmaz. */
  mkdir(path: string): Promise<void>;
  /**
   * `ifMatch` bir etiketse yalnızca uzaktaki dosya hâlâ o etiketteyse yazar; `null` ise yalnızca
   * orada dosya yoksa yazar. Tutmazsa yazmaz, Conflict hatası atar.
   */
  write(path: string, data: Blob, ifMatch: string | null): Promise<RemoteFile>;
  move(from: string, to: string, ifMatch: string | null): Promise<RemoteFile>;
  remove(path: string, ifMatch: string | null): Promise<void>;
  /** Sağlayıcının özetini yereldeki bir içerik için hesaplar; `RemoteFile.hash` ile karşılaştırılır. */
  hashOf?(data: Blob): Promise<string>;
}

interface RemoteFile {
  path: string;
  kind: 'file';
  /** Sağlayıcının içerik etiketi: yalnızca içerik değişince değişir (OneDrive'da `cTag`; `eTag` ad değişince de değişir). */
  tag: string;
  size: number;
  /** Sağlayıcının verdiği içerik özeti (OneDrive'da quickXorHash), varsa. */
  hash?: string;
}

/** Klasörler de listelenir; yoksa boş klasörler eşitlenemezdi. */
type RemoteEntry = RemoteFile | { path: string; kind: 'dir' };
```

İki tarafın içeriği karşılaştırılacağı zaman (5. bölümün başı, 6. bölüm) önce sağlayıcının özetine bakılır: uzak dosyanın `hash`'i varsa yereldeki içerik `hashOf` ile aynı yöntemle özetlenir ve karşılaştırılır. Özet yoksa uzaktaki dosya indirilip karşılaştırılır. Böylece zaten aynı olan bir klasör ilk kez eşitlenirken hiçbir şey indirilmez.

Motor cihazı `device: { id, name }` ile tanır. `id` durum dosyasındaki kimliktir; `name` çakışma kopyalarının adına girer ve kullanıcının Settings'te verdiği cihaz adıdır (arayüz adımında, Spaces bölümüne eklenir). Ad verilmemişse işletim sisteminin verdiği bilgisayar adı kullanılır.

## 2. Ne eşitlenir, ne eşitlenmez

| Eşitlenir | Eşitlenmez (cihaza özel ya da geçici) |
|---|---|
| Notlar, görev listeleri, panolar, klasörler (boşları da) | `.scrawl/history/` (sürüm geçmişi cihaza özel) |
| `_attachments/` | `.scrawl/workspace.json` (açık sekmeler) |
| `.scrawl/trash/` ve dizini (silinen her cihazdan geri alınabilsin), yalnız bu cihazın çöpündekiler hariç (6. bölüm) | `.scrawl/sync-state.json`, `.scrawl/sync-base/`, `.scrawl/trash-here.json` |
| `.scrawl/filters.json`, `.scrawl/space.json` | yarım kalmış yazımlar: `.<ad>.tmp`, `.<ad>.part` |
| | sistem dosyaları: `desktop.ini`, `Thumbs.db`, `.DS_Store` |

## 3. Durum dosyası

`.scrawl/sync-state.json`, cihaza özel:

```json
{
  "version": 1,
  "device": "c1f0…",
  "cursor": "…",
  "files": {
    "Scrawl/Plan.md": { "tag": "…", "size": 812, "modified": 1791380000000, "hash": "sha256:…" }
  }
}
```

- `tag`: dosya son eşitlendiğinde uzaktaki etiketi. Uzak değişikliği bununla anlaşılır.
- `size`, `modified`, `hash`: dosya son eşitlendiğinde yereldeki hali. Boyut ya da değişme zamanı farklıysa içerik okunup özeti (SHA-256) karşılaştırılır; yalnızca zamanı değişmiş ama içeriği aynı olan dosya değişmiş sayılmaz.
- Birleştirilebilen dosyaların (notlar ve JSON dosyaları) taban içeriği `.scrawl/sync-base/<yol>` altında saklanır. 3-yollu birleştirme bu içeriğe dayanır. Ekler için içerik saklanmaz.
- Durum tur sonunda ve tur sürerken en çok birkaç saniyede bir yazılır; her dosya işleminden sonra yazmak binlerce dosyalı ilk eşitlemeyi O(n²) yapardı. Sync yarıda kesilirse (uygulama kapandı, bağlantı gitti) bir sonraki tur kaldığı yerden sürer. Durum yazılmadan kesilen bir yükleme sonraki turda "ikisi de değişti" görünür; 4. bölümdeki özet karşılaştırması bunu birleştirmeye sokmadan bağlar, böylece hiçbir şey iki kez yüklenmez ya da silinmez.

Bunun için `VaultFs`'in listesine dosyaların değişme zamanı eklenir (`Entry.modified`); masaüstü de OPFS de bunu ucuza verir. Motorla birlikte OPFS ve bellekteki depo bunu veriyor; masaüstünün listesi (Rust tarafı) OneDrive adımında eklenecek, o zamana kadar motor masaüstünde her turda dosyaları okuyup özetler. Bir turda indirilen dosyanın zamanı o turda değil, bir sonraki turda bir kez okunarak öğrenilir; her indirmeden sonra klasörü yeniden listelemek büyük ilk eşitlemeyi O(n²) yapardı.

## 4. Bir tur

1. Uzak değişiklikler imleçten itibaren çekilir; yerel dosyalar listelenir.
2. Her yol için yerel (Y), uzak (U) ve taban (T) karşılaştırılır:

| Y | U | Yapılan |
|---|---|---|
| değişmedi | değişmedi | hiçbir şey |
| değişti | değişmedi | yüklenir (`ifMatch` = tabandaki etiket) |
| değişmedi | değişti | indirilir |
| değişti | değişti | özetleri eşitse yalnızca bağlanır; değilse türüne göre birleştirilir (5. bölüm) |
| silindi | değişmedi | uzakta silinir |
| değişmedi | silindi | yerelde silinir (6. bölüm) |
| silindi | değişti | **değişiklik kazanır:** uzaktaki hali indirilir |
| değişti | silindi | **değişiklik kazanır:** yereldeki hali yüklenir |
| silindi | silindi | taban kaydı düşer |
| yeni | yeni | aynıysa yalnızca bağlanır; farklıysa boş tabanla birleştirilir |

3. İşlemler bu sırayla yapılır: önce taşımalar ve ad değiştirmeler, sonra uzaktan gelen eklemeler ve değişiklikler (çöpe düşenler dahil), sonra yereldeki değişikliklerin yüklenmesi, en son silmeler (önce uzaktan gelenler, sonra yerelden gidenler). Silmeler sona kalır ki 6. bölümdeki "zaten çöpte mi?" sorusu, aynı turda gelen çöp dosyaları yerine yazıldıktan sonra sorulsun.
4. Yükleme sırasında uzaktaki dosya araya girip değişmişse (`ifMatch` tutmaz), o dosya bu turda bırakılır ve bir sonraki turda yeniden değerlendirilir; hiçbir şeyin üstüne körlemesine yazılmaz. Bırakılan dosya sonraki turun listesinde yeniden görünsün diye imleç ilerlemez.
   - Uzak, listenin hiç söz etmediği bir dosyayı reddederse cihazın kaydı uzaktakine uymuyordur: dosya orada yoktur ya da başka bir sürümü vardır. İmleçten okunan hiçbir liste bunu söylemez; bekleyen tur her seferinde aynı retle biterdi. Bu yüzden imleç boşaltılır ve sonraki tur her şeyi baştan listeler. Dosya gerçek haline göre değerlendirilir: burada silinmiş ve orada yoksa kaydı düşer; burada değişmiş ve orada yoksa yüklenir; orada başka sürümü varsa birleşir. Bekleyen bir ekin taşınması ya da silinmesi reddedilir ve liste de ondan söz etmezse aynısı yapılır.
5. İndirilen dosya, açık bir notsa uygulama onu bugünkü "dışarıda değişti" yoluyla editöre alır; kaydedilmemiş yazı varsa önce kaydedilir, sonra sync o dosyaya bakar.

**Taşıma ve ad değiştirme** bir silme ve bir ekleme olarak görünür. Eklenen dosyanın özeti silinenin tabandaki özetine eşitse bu bir taşımadır ve uzakta da taşıma yapılır; özellikle büyük eklerin yeniden yüklenmesi böyle önlenir.

**Büyük-küçük harf ve Unicode:** OneDrive ve Windows büyük-küçük harfe duyarsız, OPFS duyarlıdır; macOS ve iOS dosya adlarını NFD, OneDrive NFC biçiminde tutabilir. Yollar karşılaştırılırken NFC'ye çevrilir ve küçük harfe indirilir; yalnızca harfi ya da normalizasyonu değişen ad bir ad değiştirme olarak yapılır, iki ayrı dosya sanılmaz.

## 5. İkisi birden değiştiyse

**Notlar (`.md`):** satır bazında 3-yollu birleştirme.
- Değişiklikler farklı satırlardaysa birleşir, satırlar yan yana olsa da; sonuç iki tarafa da yazılır.
- İki taraf da aynı yere satır eklediyse ikisi de kalır: önce öbür taraftan gelen, sonra bu cihazınki. Bir tarafın eklediği öbürünün eklediğinin başında ya da sonunda zaten varsa (buradan gönderilen gitmiş, yanıtı gelmemiş, üstüne yazılmış) yalnız uzun olan kalır, hiçbir satır iki kez yazılmaz. Taban boşsa (ilk sync) bu kural uygulanmaz; iki bütün not alt alta konmaz.
- İki taraf aynı satırları değiştirdiyse o satırlarda kelime kelime birleştirilir; farklı kelimelerdeki değişiklikler ikisi de alınır.
- Aynı kelimelerde farklı değişiklik varsa not **bu cihazdaki haliyle kalır** (editördeki yazı kaymaz), diğer cihazın hali yanına bir çakışma kopyası olarak konur: `Plan (conflict, Kaan's laptop, 2026-10-07 1432).md`. Addaki cihaz, çakışmayı bulan ve kopyayı yapan bu cihazdır; kopyanın içindeki metin öbür taraftan gelendir (bir not, onu hangi cihazın yazdığını taşımaz). Notun içine `<<<<<<<` gibi işaretler yazılmaz.
- Bu, yalnızca çakışmayı ilk çözen cihaz için geçerlidir: öbür cihaz bir sonraki turda ana dosyanın yeni halini indirir ve kendi metnini çakışma kopyasında bulur. Tek kullanıcı için makul, çünkü başında oturulan cihaz odaklanınca ve 30 saniyede bir eşitlendiğinden çakışmayı çözen genellikle odur.

**İşlem sırası.** Birleştirmenin sonucu önce uzağa yüklenir (`ifMatch` ile); yükleme başarılıysa yerele yazılır ve çakışma kopyası oluşturulur. Yükleme araya giren bir değişikliğe takılırsa bu turda yerelde hiçbir şey değişmez, dosya sonraki turda yeni uzak hale göre yeniden değerlendirilir. Tersi sırada iki cihaz aynı çakışmayı aynı anda çözerdi, biri yüklemeyi kaybeder, sonraki turda aynı çakışmayı yeniden görür ve ikinci bir çakışma kopyası daha üretirdi. Yine de özeti var olan bir çakışma kopyasına eşit olan yeni bir kopya hiç oluşturulmaz.

**Belirlenimcilik.** Aynı üç hali birleştiren iki cihaz aynı sonuca varmalıdır; yoksa iki cihaz sırayla birbirinin sonucunu düzeltip durur. Bu yüzden her eşitlik, hangi cihaz birleştirirse birleştirsin aynı hesaplanan bir kuralla bozulur. Cihaz kimliği bunun için kullanılamaz: motor uzaktaki hali hangi cihazın yazdığını bilmez. Kurallar:
- Aynı alan iki tarafta farklı değiştiyse `updated` zamanı sonra olan kazanır; zamanlar eşitse ya da kaydın `updated` alanı yoksa (sütunlar, fazlar, bölümler, filtreler) iki değerin JSON yazımından sözlük sırasında büyük olanı kazanır.
- Bir listenin sırası (bölümler, sütunlar, fazlar) yalnızca bir tarafta değiştiyse o tarafınki alınır. İki tarafta da değiştiyse JSON yazımı sözlük sırasında büyük olan sıra alınır; o sırada bulunmayan, öbür tarafta eklenmiş kayıtlar öbür taraftaki sıralarıyla sona eklenir.
- Eklenerek birleşen listeler (zaman çizgisi) zaman, sonra `id` ile sıralanır. Cihazların saatleri farklıysa "sonra değiştiren kazanır" kuralı yanlış tarafı seçebilir; bu bilinçli bir kabuldür, saat farkı dakikaları aşmadıkça günlük kullanımda fark edilmez.

**Görev listeleri (`.tasks.json`):** kayıt bazında, görevin `id`'siyle.
- Bir tarafta eklenen görev kalır.
- Bir tarafta silinip öbür tarafta değişmeyen görev silinir; bir tarafta silinip öbür tarafta değişen görev kalır.
- İki tarafta da değişen görevde alan alan bakılır: yalnızca bir tarafta değişen alan o taraftan alınır; aynı alan iki tarafta farklı değiştiyse `updated` zamanı sonra olan kazanır.
- Bölümler `id`'leriyle aynı kurala göre; sıraları da yukarıdaki sıra kuralına uyar.
- Birleştirmeden sonra sıra numaraları (`order`) yeniden dağıtılır, iki görev aynı yere düşmez.

**Panolar (`.board.json`):**
- Kartlar görevler gibi, `id`'leriyle ve alan alan.
- Zaman çizgisi **eklenerek** birleşir: iki taraftaki hareketler ve yorumlar kaybolmaz, zamanlarına göre sıralanır. Düzenlenen yorumda `edited` zamanı sonra olan kazanır.
- Sütunlar ve fazlar `id`'leriyle; `updated` alanları olmadığı için aynı alan iki tarafta değiştiyse yukarıdaki kuralla JSON yazımı büyük olan değer kalır, "bu cihazınki" değil. Sıraları da yukarıdaki kurala uyar.
- `nextKey` iki tarafın büyüğüdür. İki cihaz aynı kimliği (`SCR-12`) ayrı kartlara verdiyse **daha sonra oluşturulan** kart (`created` eşitse `id`'si büyük olan) sıradaki numarayı alır; hangi cihaz birleştirirse birleştirsin aynı kart. Kartın gerçek kimliği `id`'dir, link bozulmaz.

**Diğer JSON dosyaları:** `filters.json` kayıt bazında (`id`), `space.json` alan bazında, çöpün dizini kayıtların birleşimi olarak.

**Ekler ve diğer dosyalar:** birleştirilemez. Ekler oluşturulurken benzersiz ad aldığı için bu nadirdir; olursa uzaktaki hal adı korur, yereldeki hal yanına çakışma kopyası olarak konur.

## 6. Silmeler ve çöp

PLAN'daki güvenlik ağı: sync'in sildiği her şey önce çöpe gider.

- Uygulamada silinen bir şey zaten `.scrawl/trash/`'e taşınır; sync bunu bir taşıma olarak görür (eski yol gitti, çöpte aynı özetli yeni bir dosya var) ve uzakta da taşır, içerik yeniden yüklenmez. Öbür cihaz da kendi dosyasını çöpe taşır; çöpün dizini ayrıca gelir.
- Uzaktan bir silme gelince, dosya zaten çöpteyse yereldeki kopyası doğrudan kaldırılır. Zaten çöpte demek iki şeyden biridir: gelen çöp dosyalarında içeriği aynı (özeti eşit) bir dosya vardır, ya da çöpün dizini bu dosyanın ya da içinde olduğu bir klasörün, dosya burada son değiştikten sonra silindiğini söyler. İkincisi uzun süre sonra dönen cihaz içindir (19 Ekim): çöpteki kopya başka bir sürüm olabilir ya da büyük olduğu için inmemiş olabilir; eski kopya çöpe ikinci kez konup yeniden yüklenmez. Listeden ya da panodan silinen görev, bölüm ve kartın satırı listeyi ya da panoyu silinmiş saymaz. Bunların dışında (kalıcı silinmiş ya da başka bir programla silinmişse) yereldeki dosya bu cihazın çöpüne taşınır ve orada kalır (19 Ekim): yalnız burada bulunan bir dosya yüklenmez, öbür cihazlar onu görmez. Adı cihazın kendi listesine (`.scrawl/trash-here.json`) yazılır, motor listedeki çöp dosyalarını yerel taramada atlar; çöpün dizinindeki satırı yine gider, geri alırken nereye döneceği oradan okunur. Geri alınan dosya normal dosya olur ve senkronlanır; kalıcı silinince ya da çöp boşaltılınca listeden de düşer, dosyası kalmamış adlar her turda atılır. Trash'te satırında "Only on this device" yazar.
- Klasör silmeleri içindekilerle birlikte aynı kurala uyar. Bir cihazda silinen klasörün içindeki bir not öbür cihazda değiştirildiyse klasör yalnızca o notla geri gelir; klasörün geri kalanı çöpte durur ve çöpteki kopya kalır. Bu bilinçli bir kabuldür: değişiklik kaybolmaz, silinen de çöpten geri alınabilir. Diskte klasör, içindekiler gidince kalır; öbür cihazda kalan boş alt klasörler, kendileri de öbür tarafta silindiyse klasörü tutmaz, onunla birlikte giderler (22 Ekim). Önceden üst klasör içindeki boş klasörü dolu sayıp uzakta yeniden açıyordu; her silişte yalnız en alttaki kat gidiyordu.
- Uzakta silinen dosya sağlayıcının kendi çöp kutusuna da gider (OneDrive'da Recycle bin).

**Çift eşitleme.** Masaüstünde vault, kullanıcının kurulu OneDrive istemcisinin zaten eşitlediği bir klasördeyse (PLAN'daki ara yol) ve motor da aynı klasörü eşitlerse iki motor birbirinin yazdığını değişiklik sanır. Motorun işi değildir; klasör seçilirken uyarılır (19 Ekim). Masaüstünde Settings › Spaces'te kişisel space'in ya da bir space'in klasörü Change… ile seçildiğinde yol OneDrive'ın içindeyse (`inOneDrive`: yolda `OneDrive` ya da iş hesabının `OneDrive - <kurum>` klasörü, macOS'ta `Library/CloudStorage/OneDrive-…`) klasör kaydedilmeden önce sorulur: "This folder is in OneDrive", OneDrive uygulamasının da eşitleyeceği, her şeyin iki kez gideceği söylenir; **Choose another** klasör penceresini yeniden açar, **Use it anyway** klasörü kullanır. Yalnız yola bakılır, istemcinin çalışıp çalışmadığına bakılmaz: Windows Belgeler yedeklemesi kapatıldıktan sonra da Belgeler'i `OneDrive\Belgeler` altında bırakabilir; istemcisi kapalı olan Use it anyway ile geçer.

## 7. Ne zaman çalışır

- Uygulama açılınca.
- Bir kayıttan 5 saniye sonra; telefonda 1,5 saniye sonra, çünkü telefon bir şey yazıldıktan hemen sonra kapatılır.
- Açıkken 30 saniyede bir (OneDrive'ın değişiklik listesi ucuzdur).
- Pencereye dönülünce.
- Uygulama arka plana geçince (yazılan beklemeden gönderilir; telefon sayfayı az sonra durdurur) ve geri gelince (öbür cihazdan gelen, üstüne yazılmadan önce gelir). Telefon bunları focus ile söylemez.
- Aynı space için aynı anda tek tur çalışır.

## 8. Testler (sahte uzak depoyla)

Bellekte çalışan bir `MemoryRemote` (her yazımda etiketi değişen) ve iki ayrı `MemoryFs` ile iki cihaz kurulur:

1. İlk sync: boş uzağa her şey yüklenir; dolu uzaktan boş cihaza her şey iner.
2. İki tarafta da dosyalar varken ilk sync: aynı olanlar bağlanır, farklı olanlar boş tabanla birleşir.
3. Yalnızca yerelde, yalnızca uzakta düzenleme.
4. Bir not iki cihazda farklı satırlarda düzenlenir: birleşir.
5. Aynı satır iki cihazda farklı düzenlenir: not bu cihazdaki haliyle kalır, çakışma kopyası oluşur, hiçbir yazı kaybolmaz. İki cihaz aynı çakışmayı aynı anda çözer: yalnızca biri yazar, öbürü o turda hiçbir şeye dokunmaz; sonunda üç sürümün (iki cihazınki ve uzaktaki) hiçbiri kaybolmaz, aynı içerikte iki kopya oluşmaz ve iki cihaz aynı dosyalarla kalır.
6. Görev listesinde farklı görevler, aynı görevin farklı alanları, aynı alanı iki cihazda değiştirme. Aynı üç hal iki cihazda birleştirilince (yerel ve uzak yer değiştirse de) sonuç bayt bayt aynıdır; `updated` eşitken, sütun adı iki tarafta değişmişken ve bölümlerin sırası iki tarafta değişmişken de.
7. Bir cihazda silinen, öbüründe değiştirilen görev ve dosya: değişiklik kazanır.
8. Uygulamadan silme: uzakta ve öbür cihazda bir taşıma olarak yapılır, içerik yeniden yüklenmez; öbür cihazın çöpünde tek kayıt vardır.
9. Başka bir programla silme: dosya bu cihazın çöpüne gider.
10. Taşıma ve ad değiştirme: içerik yeniden yüklenmez; yalnızca harf değiştiren ad; NFC ve NFD yazılmış aynı ad tek dosya sayılır. Boş klasör uzağa çıkar ve öbür cihaza iner.
11. Panoda iki cihazdan yorum: ikisi de kalır; aynı kimliği alan iki kart: daha sonra oluşturulan yeniden numaralanır, iki cihazda da aynısı.
12. Yükleme sırasında uzak değişir: üstüne yazılmaz, sonraki turda birleşir.
13. Tur yarıda kesilir: sonraki tur kaldığı yerden sürer, iki kez yükleme ya da silme olmaz. Yükleme bitip durum yazılamadan kesilince dosya birleştirmeye girmeden bağlanır.
14. Eşitlenmeyen yollar (geçmiş, açık sekmeler, geçici dosyalar) hiç uzağa çıkmaz.
15. Bir cihazda silinen klasörün içindeki bir not öbüründe değişir: klasör yalnızca o notla geri gelir, çöpteki kopya durur.
16. Uzak, özet veren bir sağlayıcıysa zaten aynı olan iki taraf ilk sync'te hiçbir şey indirmeden bağlanır.
17. Başka bir programın yaptığı bir silme ve aynı turda gelen çöp kopyası: dosya yerelde doğrudan kalkar, çöpte tek kayıt olur.
18. Tur sürerken bu cihazda kaydedilen not: indirilen sürüm üstüne yazılmaz, sonraki turda ikisi birleşir.
19. Öbür tarafta silinen bir not tur sürerken burada kaydedilir: çöpe gitmez; değişiklik silmeye üstün gelir.
20. Uzak, imleçten beri neyin değiştiğini söyleyemeyip her şeyi yeniden listelerse (çok eski imleç): listede olmayanlar gitmiş sayılır, aynı olanlar yeniden inmez.
21. Uzağın kabul etmediği bir ad: dosya bu cihazda kalır, gönderilmez, raporda gösterilir.
22. Listelenip okunmadan önce uzakta silinen bir dosya: tur durmaz, dosya sonraki tura kalır.
26. Cihazın kaydı uzaktakine uymaz ve liste ondan söz etmez (dosya orada yok ya da başka sürümü var): uzak dosyayı bir kez reddeder, sonraki tur her şeyi baştan listeler. Burada silinen unutulur, burada değişen yüklenir, iki tarafta değişen birleşir; dosya her turda yeniden reddedilmez.
27. Uzun süre sonra dönen cihaz: öbür tarafta notu değişip klasörüyle silinen dosya burada doğrudan kalkar, çöpte klasörün tek kaydı olur, hiçbir şey yüklenmez; çöpteki kopyası büyük olduğu için inmeyen ek de öyle. Silinmiş bir klasörle aynı adı taşıyan ve sonradan yazılmış bir notu başka bir program silerse not yine bu cihazın çöpüne gider; listeden bir görevin silinmiş olması, liste başka bir programla silinince listeyi çöpe gitmekten alıkoymaz.
28. Yalnız bu cihazda bulunan, öbür tarafta çöpte izi olmadan silinen dosya: bu cihazın çöpüne gider, yüklenmez, öbür cihazın çöpünde görünmez; geri alınınca yüklenir; kalıcı silinince ya da çöp boşaltılınca listeden düşer, hiçbir şey yüklenmez.
29. İçinde klasörler olan bir klasör bir cihazda silinir, öbür cihazın diskinde boş klasörleri kalır: hiçbiri geri gelmez, ne uzakta ne iki cihazda; çöpten kalıcı silinince çöpteki boş klasörleri de geri gelmez. O arada öbür cihazda içine yeni bir klasör açıldıysa klasör onunla kalır.

Hepsi `packages/core/src/sync/engine.test.ts` içinde; birleştirme kuralları ayrıca `merge.test.ts` içinde, her biri iki yönde (yerel ve uzak yer değiştirerek) aynı sonucu verdiği sınanarak.

## 9. Bu adımda olmayanlar

Arayüz (durum çubuğundaki "Synced…", hata ve çakışma bildirimleri, Settings'te cihaz adı, sağlayıcı istemcisinin altındaki klasör için uyarı), birden çok space, OneDrive adaptörü ve girişi sonraki adımlardır. Motor bitince uygulama onu henüz çağırmaz; yalnızca testlerle doğrulanır.

## 10. Bu cihaza inmeyen büyük ekler

Telefonda ve tarayıcıda bir ek sınırın üstündeyse (varsayılan 10 MB, cihazın ayarı; masaüstünde sınır yok) kendiliğinden inmez, bulutta bekler (PLAN 4.2 Büyük dosyalar).

- Yalnız ekler bekler: `_attachments/` altındaki dosyalar ve çöpte uygulamanın metni olmayan (`.md`, `.json`, `.env` dışındaki) dosyalar. Notlar, listeler ve panolar ne kadar büyük olursa olsun iner.
- Böyle bir dosya durum dosyasında `away: true` ile tutulur: uzaktaki etiketi ve boyutu bilinir, yerelde özeti yoktur; sağlayıcı veriyorsa kendi özeti (`remoteHash`) saklanır. Yerelde olmaması silinmiş sayılmaz, uzaktan hiç silinmez; sonraki turlar ona dokunmaz.
- Uzakta silinirse kaydı düşer. Uzakta taşınırsa (öbür cihaz çöpe attı) yeni yerinde yine bekler; çöpte görünür.
- Sınır büyütülünce sınırın altına düşenler sonraki turda iner. Dosya istenince (`fetchAway`) iner ve sıradan bir dosya olur; aynı space'in turuyla aynı anda çalışmaz, ikisi de durum dosyasını yazar.
- Bekleyen bir dosya cihazda olmadığı için taşınamaz ve silinemez: çöpe atma, çöpten geri alma ve kalıcı silme `.scrawl/sync-away.json`'a (cihaza özel) yazılır, sonraki tur bunları listeyi okumadan önce uzakta yapar (taşıma ya da silme). O zamana kadar çöp, Files ve yeni ad seçimi bu işleri yapılmış sayar.
- Yeni bir ek bekleyen bir dosyanın adını almaz. Yine de o yolda yerelde bir dosya belirirse içeriği uzaktakiyle aynıysa (sağlayıcının özetiyle) o dosya sayılır; değilse çakışma kopyası olarak yanına konur, bekleyen dosya bekler.
- Başka bir space'e taşınan bir şeyin bekleyen ekleri önce iner (`copyToSpace` onları bulursa durur).

Testler `packages/core/src/sync/away.test.ts` içinde.
