# Dosya adlarında Unicode biçimi (taslak)

Aynı harf iki biçimde yazılabiliyor: tek parça (NFC) ya da harf ve işareti ayrı (NFD). `İ` NFC'de bir harf (U+0130), NFD'de iki: `I` ve üstündeki nokta (U+0307). Ekranda ikisi aynı görünüyor ama metin olarak farklılar. Bu taslak, Scrawl'ın içinde her yolun tek biçimde, NFC'de olmasını anlatıyor.

Bu Türkçeye özgü değil. Rusçada `й`, `ё`, Japoncada `が`, `ぱ`, Korecede her hece, Vietnamca ve Avrupa dillerinde aksanlı harfler de böyle. Aksansız Latin harfleri ve Çince karakterler etkilenmiyor. NFC bütün diller için tek kural.

## 1. Sorun

### 1.1 Ne oldu

21 Kasım: Eren'in telefonunda Favorites'te dört favoriden üçü çıktı. OzBI'daki Eren İş Takibi ve Ahmet İş Takibi göründü, Kaan İş Takibi görünmedi. Eren'in bilgisayarında dördü de görünüyordu.

Üç panonun adında `İ` ve `ş` var. Sunucuda Eren'in ve Ahmet'in panolarının adı NFD, Kaan'ınki NFC. Favori dosyası Eren'in iki cihazında aynı. Telefon panonun yolunu favorideki yazımdan başka biçimde gördü; favoriyi pano silinmiş gibi gizledi.

Favoriler `62a8a34` ile iki biçimi bir sayıyor (`favoriteKey`, `favoriteRows`). Bu yalnız favorileri kapattı. Yolu harfi harfine karşılaştıran her yer aynı sorunu yaşayabilir: notlar arası linkler, görevin ve kartın bağlı notu, Chat'teki öğe linkleri, açık sekmeler, ajanın bir şeyi adıyla bulması.

### 1.2 Ne kadar yaygın

21 Kasım'da, Kaan'ın bilgisayarındaki kopyalara göre:

| Space | NFD adlar |
|---|---|
| Personal (OneDrive) | Yok (562 addan 0) |
| OzBI | `Ahmet İş Takibi.board.json`, `Eren İş Takibi.board.json`, `ozbiapp-cc/nasıl çalışıyoruz.md` |
| Klinitra | `İşler.tasks.json`, `Hasta için mobil app.md` |
| Game Development | `Oyun fikirleri/Çiftler için AI oyunu.md`, `Oyun fikirleri/İsimisiz oyun fikri arkaplan.md` |
| Scrawl | Çöpte 151 dosya: 7 Kasım 21:50'den sonra çöpe atılan deneme kartları |

Paylaşılan dosyaların içinde (panolar, listeler, notlar, `people.json`) hiç NFD yok. İçeride yazılan her şey NFC. NFD yalnız dosya adlarında ve cihazın bu adlardan çıkardığı kendi önbelleklerinde var (`.scrawl/index/_titles.json`, `.scrawl/sync-state.json`). Yani içerikteki linkler ve bağlar NFC; bozulan, onları dosya adıyla eşlemek.

### 1.3 NFD nereden geliyor

Kodumuz NFD üretmiyor. Windows (masaüstü), Linux (sunucu) ve OneDrive adı geldiği gibi tutuyor. Geriye büyük ihtimalle bir Apple cihazı kalıyor: iPhone'daki Safari'nin dosya deposu (OPFS) ya da bir Mac. Kesin cevap sunucunun yazma kaydında (`versions`: kim, hangi cihazla, ne zaman). Bu taslak yazılırken o kayda bakılamadı (bkz. 7). Çözüm, adı kimin NFD yazdığına bağlı değil.

### 1.4 Neden yayılıyor

- **Sunucu son yazımı tutuyor.** Anahtar NFC ve küçük harf (`keyOf`), yani iki biçim aynı dosya. Ama görünen ad, son yazan cihazın yazımı (`files.ts` `write`, `move`).
- **Sync, biçim farkını yeniden adlandırma sayıyor.** `engine.ts` 535: bir dosyanın adı bu cihazda kayıttakinden başka yazılmışsa sunucuda taşınıyor (`remote.move`). Sunucuda başka yazılmışsa bu cihazda taşınıyor (`fs.move`). Adı NFD gören bir cihaz, herkesin dosyasının adını NFD'ye çevirebilir; öbür cihazlar da onu izler.

## 2. Kural

Scrawl'ın içinde her yol NFC. Dosya katmanından çıkan her ad, sunucuda saklanan her ad, sync kaydındaki her yol NFC. Diskte bir dosyanın adı NFD durabilir; Scrawl onu NFC görür ve NFC yolla ona ulaşır.

Büyük-küçük harf bu kuralın dışında: `plan.md` → `Plan.md` gerçek bir yeniden adlandırma olarak kalıyor. Yalnız biçim farkı yeniden adlandırma sayılmıyor.

## 3. Çözüm

### 3.1 Dosya katmanı: `NfcFs`

`packages/core/src/fs.ts`'e her `VaultFs`'i saran bir sınıf, `NfcFs`:

- `list(dir)`: içteki listeyi alır, her girdinin `name` ve `path`'ini NFC'ye çevirir. Gördüğü her klasör için NFC addan diskteki ada bir eşleme tutar.
- Okuma, yazma, taşıma, silme, `stat`, `mkdir`: verilen NFC yolu her parçasında diskteki ada çevirir. Klasörün eşlemesi yoksa o klasörü bir kez listeler. Diskte NFC karşılığı olmayan yeni bir ad NFC yazılır.
- Yazma, aynı adın NFD'si diskte varsa onun üstüne yazar; yanına ikinci bir dosya açmaz. NTFS'te iki biçim iki ayrı ad, bunu önlemek gerekiyor.
- Taşıma, silme ve yazma eşlemeyi günceller. Kendi dışında değişen bir klasör (başka uygulama, dosya izleme) bir sonraki `list`'te yeniden okunur.
- Diskteki adlara dokunmaz, yeniden adlandırmaz. Adı kendi çeviren bir depoda (varsa Safari) yeniden adlandırma döngüye girebilir; eşleme her depoda aynı çalışır.

Sarıldığı yerler:

| Nerede | Hangi depo |
|---|---|
| Web, telefon ve masaüstü | `openVault`, `openSpaceVault` (`storage.ts`): tarayıcının deposu da, masaüstünün `TauriFs`'i de |
| Ajan, kendi bilgisayarında | `spacesOf` (`apps/mcp/src/vaults.ts`): araçların her space'i |
| Ajan, sunucuda | Sarılmaz: sunucu adları NFC saklıyor (3.3), `ServerFs` onları veriyor. |

Maliyet: ASCII yollarda çeviri yok. Ötekilerde klasör başına bir listeleme, o da uygulama ağacı okurken zaten listelediği için çoğu zaman eşlemede hazır.

### 3.2 Sync

- Yalnız biçimi farklı iki yazım yeniden adlandırma sayılmaz (`engine.ts` 535–559). Karşılaştırma NFC'de yapılır; büyük-küçük harf farkı yine yeniden adlandırma.
- Sunucudaki yazım bu cihazınkinden yalnız biçimde farklıysa kayıt (`record.path`) sunucununkini alır; burada ya da orada hiçbir şey taşınmaz.
- Yazımlar NFC'de karşılaştırılır (`samePath`): dosyanın değişip değişmediğine bakarken de, yeniden adlandırmada da. Bu yüzden `sync-state.json`'daki eski NFD yazımlar dönüştürülmez; olduğu gibi kalabilirler.
- Uzaktaki çağrılar (`read`, `move`, `remove`) kayıttaki, yani uzaktaki yazımla yapılır. OneDrive adı nasıl tutuyorsa öyle kalır, sunucu iki biçimi bir sayıyor.

### 3.3 Sunucu

- `files.ts`: `write`, `move`, `mkdir` ve `makeParents` adı saklamadan önce NFC'ye çevirir (`checkPath` NFC yolu döndürür). Anahtar zaten NFC.
- Bir kerelik geçiş: sunucu açılırken `meta` tablosunda `nfc-paths` yoksa `entries`'te adı NFC olmayan her satırın `path`'i NFC'ye çevrilir ve yeni bir `seq` alır. Cihazlar bunu sync'le "yalnız biçim değişti" olarak alır (3.2) ve hiçbir şey taşımaz. `versions` geçmiş olduğu için olduğu gibi kalır. SQLite'ta NFC işlevi olmadığı için bu, `MIGRATIONS`'a SQL olarak değil, `migrate`'ten sonra çalışan bir işlev olarak yazılır.
- Güvenlik: değişen bir şey yok. `..`, `/` ve denetim karakterleri NFC'den sonra da aynı denetimden geçiyor.

### 3.4 Uygulama

Kaynakların hepsi NFC verince karşılaştırmalar kendiliğinden düzelir. Ayrıca:

- `workspace.json` (açık sekmeler, pano ve liste görünümleri) ve Recent listesi okunurken metinleri NFC'ye çevrilir. Eski bir oturum NFD yol tutuyor olabilir.
- Not başlıklarının önbelleği (`.scrawl/index/_titles.json`) yalnız görülen notları tutuyor. Eski NFD girdiler bir sonraki kayıtta kendiliğinden gider, o notlar bir kez yeniden okunur.
- Masaüstünde yolu doğrudan diske veren üç yer de diskteki yazımı kullanır: notta resim (`fileUrl`), Open ve Show in folder (`storage.ts`).
- Favorilerdeki `62a8a34` düzeltmesi kalır; artık gerekmese de zararı yok.
- Not içindeki linkler, görevin ve kartın `note`'u, Chat'teki `scrawl:item` linkleri zaten NFC (1.2). Bir şey değişmez.

## 4. Kapsam dışı

- **Diskteki adları düzeltmek.** Masaüstünün diskinde NFD adlar NFD kalır; `NfcFs` onları NFC gösterir. Başka bir editörde açan kişi farkı görmez.
- **Tam genişlik ve yarım genişlik harfler (NFKC).** Japoncadaki `ｶ` ile `カ` farklı karakterler; kişi hangisini yazdıysa o kalır.
- **Büyük-küçük harf.** Sync bunu zaten her cihazda aynı kuralla eşliyor (`keyOf`). Türkçedeki `I`/`ı` ayrımı da her cihazda aynı sonucu veriyor, sorun çıkarmıyor.

## 5. Yayın sırası

1. **core + web (telefon dahil):** `NfcFs` ve sync kuralı. Telefon artık sunucudaki adı NFD'ye çeviremez.
2. **Sunucu:** NFC saklama ve geçiş. Web'den sonra çıkmalı. Eski bir telefon sürümü, sunucunun NFC'ye çevirdiği adı tekrar NFD'ye taşıyabilir; PWA'lar yeni sürümü açılışta alıyor.
3. **Masaüstü:** Kullanıcı söyleyince. Eski masaüstü sürümü geçişten sonra dosyayı diskte NFC adla yeniden adlandırır; Windows'ta bu zararsız.
4. **MCP (npm):** `NodeFs`'i saran sürüm.

## 6. Testler

- **core, `NfcFs`:** NFD adları saklayan bir `MemoryFs` üstünde liste NFC dönüyor. Okuma, yazma, taşıma, silme ve `stat` NFC yolla NFD dosyaya ulaşıyor. Var olan NFD dosyanın NFC adına yazmak ikinci dosya açmıyor. Yeni dosya NFC yazılıyor.
- **core, sync:** Listesi NFD veren bir cihaz sunucuda hiçbir şey taşımıyor. Sunucuda yalnız biçimi değişen ad bu cihazda bir şey taşımıyor, kayıt sunucunun yazımını alıyor. Büyük-küçük harf değişikliği yine taşınıyor. NFD yollu eski bir `sync-state.json` NFC okunuyor.
- **Sunucu:** NFD yazılan ve NFD'ye taşınan dosya listede NFC çıkıyor. Geçiş NFD satırları NFC'ye çeviriyor, yeni `seq` veriyor ve ikinci kez çalışmıyor.
- **MCP:** Diskte NFD duran dosya `tree`'de NFC görünüyor, NFC adıyla okunup yazılabiliyor.
- **Tarayıcı:** NFD adlı bir pano, NFC linkli bir not ve bir favoriyle telefon genişliğinde: hepsi açılıyor, sync sunucuda adı değiştirmiyor.

## 7. Açık soru

Hangi cihaz adları NFD yazıyor? Sunucunun `versions` kaydında NFD yazılmış her adın ilk yazanı (`device_id` → `devices.name`, `agents.client_name`) bunu söyler. Bu taslak yazılırken sunucu veritabanına bakma izni yoktu. Cevap çözümü değiştirmiyor ama aynı cihazın başka neyi farklı yazdığını görmek için bakmaya değer.
