# Sunucuda dosya ve klasör yetkisi (taslak)

Durum: 24 Ekim 2026, onaylı. Kararların hepsi konuşularak verildi (11. bölüm); 12. bölümdeki dört karar önerildiği gibi onaylandı. PLAN'a 20. aşama olarak işlendi (13. bölüm); Dropbox, S3 ve GitHub 21, Google Drive 22, Mobil 23 oldu. Roadmap'te faz 20, kartlar ROA-256–260. Mockup 24 Ekim'de onaylandı (`design/mockups.html`, Dosya ve klasör yetkisi); 2.4, 2.6 ve 3. bölüm ona göre. Kodda bir şey yazılmadı; kod kullanıcı söyleyince başlar. PLAN'ın Sonraya kalanlarındaki "sunucuda ince yetkiler" maddesinin klasöre göre yetki kısmıdır. Salt okunur hiç olmayacak; PLAN'dan da çıkarıldı (11. bölüm, 9. karar).

## 1. Kapsam

Sunucudaki paylaşılan bir space'te bir dosya ya da klasör yalnız seçilen kişilere görünür. Örnek (mockup'takiyle aynı): Acme space'inde Finance klasörünü yalnız Deniz ve Mert görür; Elif ve Jonas için Finance hiç yoktur. Kaan sunucunun Owner'ı, Lena Admin'i; ikisi de her zaman görür.

- Yetki dosyaya da klasöre de verilir: not, görev listesi, pano, koleksiyon, keys dosyası, klasör.
- Pano ve görev listesi tek dosyadır. Kart ya da görev tek başına kısıtlanmaz; bütün pano ya da liste kısıtlanır.
- Koleksiyonun içindeki tek bir kayıt kısıtlanmaz; koleksiyonun tamamı kısıtlanır (PLAN 4.6, kayıt bazında yetki yok).
- Tek tür yetki vardır: gören düzenler.
- Yalnız sunucudaki paylaşılan space'lerde. Kişisel space'te başka kimse yoktur; OneDrive'daki bir space'te yetki OneDrive'ındır (PLAN, Çok kullanıcı).

## 2. Kurallar

### 2.1 Kim görür

- Kısıtlanmamış her şeyi space'teki herkes görür, bugünkü gibi.
- Kısıtlanmış bir dosyayı ya da klasörü yalnız listesindekiler görür. Listede olmayan onu hiç görmez: adını, içini, çöpteki kopyasını, eklerini.
- Kısıtlı bir klasörün içindeki her şey aynı kısıtı taşır. İçerideki bir şey ayrıca kısıtlanırsa onu iki listede de olanlar görür. Bu yüzden listeye yalnız onun bulunduğu yeri gören kişiler eklenebilir.
- Sunucunun Owner'ı ve Admin'leri, üyesi oldukları space'lerde kısıtlı her şeyi her zaman görür; listede ayrıca yazılmazlar. Üyesi olmadıkları bir space'e bugünkü gibi girmezler, kişisel space'leri görmezler. "Herkes yalnız davet edildiği space'leri görür" kuralı (`design/server.md` 11, 2. karar) aynen kalır.

### 2.2 Kim düzenler

- Bir dosyayı ya da klasörü gören herkes onu kısıtlayabilir. Kısıtlayan kişi "kuran"dır ve listede kendisi de vardır.
- Sonra listeyi onu gören herkes düzenler: kişi ekler, kişi çıkarır. Owner ve Admin de düzenler.
- Kuranı listeden yalnız Owner ve Admin çıkarır. "Yalnız ben değiştireyim" diye bir kilit yoktur. Bu Google Drive'ın varsayılanıdır: düzenleyen paylaşımı da değiştirir ama owner'ı çıkaramaz.
- Owner ya da Admin kuranı listeden çıkarırsa, ya da kuran space'ten çıkarılırsa listede korunan kimse kalmaz.
- Kısıtı kaldırmak, yani yeniden herkese açmak, yalnız kuranın, Owner'ın ve Admin'lerin işidir. Listeyi düzenleyen biri, kuranın kurduğunu tek hareketle bozamaz. Google Drive'da da bir klasörü kısıtlamak My Drive'da owner'ın, shared drive'da Manager'ın işidir.

### 2.3 Taşıma: yetki öğeyle gider

- Taşımak bir şeyi daha görünür yapmaz. Kısıtlı bir dosya kısıtsız bir klasöre taşınırsa kısıtı onunla gider. Herkese açmak için kısıtı değiştirmek gerekir.
- Daha kısıtlı bir yere taşınan şey oranın kısıtını da alır: iki listede de olanlar görür.
- Ad değiştirmek de bir taşımadır; kısıt yeni adla sürer.
- Çöpe atmak da bir taşımadır. Finance'tan silinen bir not çöpte de yalnız Finance'ı görenlere görünür; çöpten geri alınınca yerine kısıtıyla döner.

### 2.4 Görmesi bitince

- Bir kişinin bir şeyi görmesi bittiğinde (listeden çıkarıldı, kısıt kuruldu, kısıtlı bir yere taşındı) o şey kişinin bütün cihazlarından doğrudan silinir, çöpe gitmez.
- Cihazda yapılmış ama henüz gönderilmemiş değişiklik de onunla gider. Klasörse, içinde bu cihazda açılıp gönderilmemiş dosyalar da klasörle gider.
- Sync paneli bunu söyler: space'in Done sekmesinin başında **Removed from this device** grubu, altında "You no longer have access to these." ve silinenler; bir klasör tek satırdır ("Finance · 2 items"). Son turun özetinde de yazar: "1 removed from this device". Silinenlerden biri açık bir sekmedeyse sekme kapanır.
- Kapalı bir cihazdaki kopya, cihaz sunucuya ilk bağlandığında silinir. O zamana kadar cihazda durur; bütün sync araçlarında böyledir.

### 2.5 Ekler

Resim ve PDF gibi ekler space'in en üstündeki ortak `_attachments/` klasöründe durur. Finance'taki bir notun faturası da oradadır. Bir ek, onu kullanan notun, kartın, görevin ya da kaydın yetkisini alır ve bunu sunucu kendisi çıkarır (4.2):

- Ek, onu kullananlardan en az birini görene görünür; çöpteki kullananlar da sayılır. Hem kısıtlı bir notta hem herkese açık bir notta kullanılan ek herkese görünür.
- Kullanıcının bir şey yapması gerekmez. Ajanın ya da başka bir programın eklediği ek de aynı kurala uyar.
- Henüz hiçbir yerde kullanılmayan yeni bir ek yalnız yükleyene, Owner ve Admin'e görünür. Uygulama eki nottan önce gönderir; ek arada bir başkasının cihazına inmemelidir.
- Bugün kullanılmayan ekler geçişte herkese açık kalır, kimsenin cihazından bir şey silinmez. Böyle bir ek ilk kez bir yerde kullanılınca bu kurala girer.

### 2.6 Aynı ad

Yollar büyük-küçük harfe bakmadan tek sayılır. Bir kişi, göremediği bir dosyayla aynı yerde aynı adı kullanırsa dosyası gönderilmez ve cihazında kalır. Sync panelinin Not synced sekmesinde dosyanın altında: "Acme has something by this name that you can’t see. Rename it; until then it stays on this device." Bu, orada göremediği bir şey olduğunu söyler; yollarla tutan bir depoda bundan kaçınılamaz. Çöpteki ve eklerdeki adlar saat taşıdığı için orada neredeyse hiç olmaz.

## 3. Ekranda

Mockup: `design/mockups.html`, Dosya ve klasör yetkisi (24 Ekim'de onaylandı). Masaüstünde Menu, Restrict, As a member, As the owner, A note, Files, Search, Sync; telefonda iki sayfa.

### 3.1 Access penceresi

- **Nerede:** yalnız sunucudaki paylaşılan space'lerde, dosyanın ve klasörün menüsünde, Move to… ve Rename'den sonra **Access…**; kenar çubuğundaki satırın ve sekmenin menüsünde. Telefonda satır basılı tutulunca ya da sayfanın ··· menüsünde açılan action sheet'te, yanında listedeki kişi sayısıyla ("2 people").
- **Başı:** öğenin simgesi, adı ve yeri ("Folder in Acme", "Note in Acme › Sales").
- **Who can see it:** iki seçenek, **Everyone in Acme** ("All 6 people in Acme.") ve **Only these people** ("No one else in Acme sees it, not even its name."). Herkese açamayan biri için ilki soluk ve kapalıdır, altında: "Only Deniz Ak, who set this up, and the server’s owner and admins open it to everyone." (2.2)
- **People:** o şeyin bulunduğu yeri görenler, her biri bir kutuyla. Sıra pencere açıldığındaki haldir: kuran, listedekiler, sonra diğerleri; işaretlendikçe satırlar yer değiştirmez. Kişi kendi satırında "you" görür. Kuranın satırında **Set this up**; bir üyeye kutusu soluk ve kapalıdır, Owner ve Admin'e açıktır.
- **Değişen satır:** eklenenin sağında **Gets access**, çıkanın sağında **Loses access**.
- **Owner ve Admin:** listenin altında adlarıyla, yüzleriyle: "Kaan Arslan, the server’s owner, and Lena Hartmann, an admin, always see it." Pencereyi Owner açtıysa "You, the server’s owner, …".
- **Uyarı:** biri erişimi kaybedecekse (listeden çıkıyor ya da öğe ilk kez kısıtlanıyor) Save'in üstünde: "Elif Demir and Jonas Weber will no longer see Finance. It is deleted from their devices, with anything not sent yet." Kimse kaybetmiyorsa uyarı yoktur.
- **Kaydetmek:** **Cancel** ve **Save**. Dışarı tıklamak kaydetmez, çünkü birini çıkarmak o şeyi onun cihazlarından siler.
- **Telefonda:** aynısı büyük bir sheet'te. Üstte Cancel, Access ve Save; seçenekler, People'da kutu yerine sağda işaret; uyarı listenin altında, Owner ve Admin satırı en altta.

### 3.2 Kilit

Kısıtlı dosya ve klasörlerin adının yanında, onları görenlere küçük bir kilit: kenar çubuğunda, Files'ta, aramanın sonuçlarında ve telefonda Browse'da. Bir ek, onu kullanan kısıtlıysa Files'ta kilitle görünür (2.5).

### 3.3 Sync paneli

- **Done:** başında Removed from this device grubu (2.4), sonra turun geri kalanı.
- **Not synced:** göremediği bir şeyle aynı adı taşıyan dosya, nedeniyle (2.6).
- Telefonda space'in Sync sayfasında aynısı.

## 4. Sunucu

### 4.1 Tablolar (6. göç)

```sql
access        (space_id, key TEXT,          -- kısıtlanan dosya ya da klasör, keyOf(path)
               path TEXT,
               set_by TEXT,                 -- kuran
               set_at INTEGER,
               gone_at INTEGER,             -- silinen ya da taşınan öğenin eski yolu (4.3)
               PK (space_id, key))

access_people (space_id, key, account_id, added_by, added_at,
               PK (space_id, key, account_id))

hidden        (space_id, account_id, seq INTEGER, path TEXT)   -- bir kişinin görmesi biten yollar
               INDEX (space_id, account_id, seq)

attachment_uses (space_id, attachment_key,   -- _attachments/ altındaki ek
                 file_key,                   -- onu kullanan not, liste, pano ya da kayıt; '' = geçişte herkese açık bırakılan
                 PK (space_id, attachment_key, file_key))
```

### 4.2 Görünürlük

`View`, bir kişinin bir space'te neyi gördüğünü söyler: `sees(path)`. Owner ve Admin her şeyi görür. Diğerleri, yolun kendisinin ve üst klasörlerinin `access` satırlarının hepsinde listede olmalıdır. Bir space'in kuralları azdır; istek başında bir kez okunur.

`_attachments/` altındaki bir ek için `sees`, `attachment_uses`'a bakar (2.5):

- `file_key`'i boş bir satırı varsa herkes görür.
- Yoksa kullananlardan birini gören görür.
- Hiç satırı yoksa yalnız yükleyen (`entries.author_id`), Owner ve Admin görür.

Sunucu bir not, görev listesi, pano ya da koleksiyon kaydı yazılınca, taşınınca ya da silinince içindeki `_attachments/` linklerini okur ve o dosyanın satırlarını yeniler. Linkleri Files ekranının baktığı yerlerden alır: notun ve kaydın metni, kartın açıklaması ve yorumları, görevin açıklaması (core'daki `filesIn`). Yalnız içinde `_attachments` geçen dosyalar okunur. 6. göçte o an hiçbir yerde kullanılmayan her ek için `file_key`'i boş bir satır yazılır; ek bir yerde kullanılınca bu satır silinir.

Görünürlüğü değiştiren bir şey olunca (liste, kısıt, taşıma, ekin kullanıldığı yer) etkilenen yollar için kimin gördüğü önce ve sonra hesaplanır:

- Görmesi biten her kişi için `hidden`'a yolun bir satırı yazılır, space'in yeni `seq`'iyle. Klasörse tek satırdır, klasörün yolu.
- Görmeye başlayanlar için o yolun `entries` satırları yeni `seq` alır (klasörse içindeki her şeyinki), böylece değişiklik listelerine yeniden girer. Zaten görenlerin cihazı aynı etiketi görür ve hiçbir şey indirmez.
- Bir yol bir kişiye yeniden gösterilince o kişinin bu yoldaki eski `hidden` satırları silinir.
- `hidden` satırları başka türlü silinmez. Küçüktürler ve uzun süre sonra dönen bir cihaz da onları almalıdır.

### 4.3 Değişiklik listesi

`changes` kişiye göre süzülür:

- `changed` ve `removed`'da yalnız kişinin gördükleri yer alır. Sayfa süzülmeden önce dolar ve imleç süzülmemiş satırlarla ilerler; bu yüzden bir sayfa boş gelebilir, `more` ile devam edilir.
- Yeni bir alan, `hidden: string[]`: kişinin imleçten sonraki `hidden` satırları. Aynı yollar eski uygulamalar için `removed`'da da gelir (6. bölüm).
- Kısıtlı bir öğe silinince ya da taşınınca, eski yolundaki `access` satırı silinenlerin izi kadar (90 gün) `gone_at` ile durur. Böylece onu hiç görmemiş olanlara eski yolun "silindi" satırı da gitmez.

### 4.4 Dosya istekleri

| İstek | Görmediği bir yolda |
|---|---|
| `read` | 404 `no-file`, yokmuş gibi |
| `move`'un `from`'u, `remove` | 412, yokmuş gibi |
| `write`, `mkdir`, `move`'un `to`'su | 403 `no-access` kişi o yolu daha önce görüyorduysa (`hidden`'da satırı var), yoksa 403 `taken` |

Taşımada kısıt öğeyle gider (2.3): `access` satırları yeni yola geçer. Üst klasörlerden gelip hedefte olmayan kısıtlar, listelerinin kesişimiyle dosyanın kendi satırı olarak yazılır. Hedefteki kısıtlar zaten en az bu kadar darsa bu satır yazılmaz.

### 4.5 Klasör taşıma

Yeni istek: `POST /spaces/:id/move-dir { from, to }`. Klasör ve içindeki her şey tek işlemde taşınır; `access` satırlarının yolları da değişir.

Bu istek gerekli. Bugün motor bir klasörün adını sunucuda dosya dosya taşıyarak değiştirir. Böyle olunca klasörün kısıtı dosyalara tek tek geçer, ama yeni klasör kısıtsız kalır ve adı herkese görünür. Motor bir klasör taşımasını kendisi anlar (5.3).

### 4.6 Ad taşıyan ortak dosyalar

İki dosya, space'in bütün dosyalarının adlarını taşır:

- `.scrawl/trash/index.json`: çöpteki her şey, adı ve nereden geldiği (`name`, `from`).
- `.scrawl/created/<cihaz>.json`: her şeyin ne zaman açıldığı, küçük harfli yollarıyla.

Sunucu bu dosyaları her kişiye görmediği satırları çıkararak verir: çöp dizininde `.scrawl/trash/<name>`'i görmediği satırlar, `created`'da yolunu görmediği satırlar. Kişi dosyayı geri yazınca sunucu, onun görmediği satırları sakladığı halden alıp yerine koyar. Etiket, kişinin gördüğü halin özetidir; `If-Match` onunla karşılaştırılır. Kişinin görünürlüğü değişince bu iki dosyanın satırları da yeni `seq` alır ve cihaz yeni halini indirir. Çöp dizini kayıt kayıt birleştiği için (`mergeTrash`) motor bunu bugünkü birleştirmeyle alır.

Space'in diğer ortak dosyaları (`people.json`, `labels.json`, `agents.json`, `space.json`) dosya adı taşımaz. `favorites.json` ve `filters.json` kişisel space'tedir ve kişinin kendisinindir.

### 4.7 Yetki istekleri

| İstek | Ne yapar |
|---|---|
| `GET /spaces/:id/access` | Kişinin gördüğü kısıtlı dosya ve klasörler: `[{ path, kind, people, by, at }]` |
| `PUT /spaces/:id/access` `{ path, people }` | Kısıt kurar ya da listeyi değiştirir. Yalnız o şeyi gören, Owner ya da Admin yapabilir. Kuran, kısıtı kuran kişidir ve listede kalır. Listedekiler space'in üyesi olmalı ve o şeyin bulunduğu yeri görmelidir. Kuranı listeden çıkaran Owner ya da Admin değilse 403 `set-by` |
| `DELETE /spaces/:id/access?path=` | Kısıtı kaldırır. Yalnız kuran, Owner ya da Admin; başkası 403 `set-by` |

Kişisel space'te hepsi 403 `personal` döner. Space'ten çıkarılan kişi bütün listelerden de çıkar. `GET /server` yeni `access: true` alanını verir; Access… yalnız bunu söyleyen sunucularda görünür.

### 4.8 Canlı kanal

`changed`, bir değişikliği yalnız değişen yollardan birini gören ya da yeni bir `hidden` satırı alan kişilere söyler; kimse göremediği yerdeki bir değişikliği duymaz. Kısıt değişince onu görenlere `{ type: 'access', space }` gider ve uygulama kilitleri yeniden okur.

### 4.9 Ajan

`ServerFs` kişinin `View`'uyla kurulur: `list`, `stat` ve okuma, kişinin görmediğini yok sayar; görmediği bir ada yazmak "This name is taken in this space" diye reddedilir. Ajan kişinin gördüğünden fazlasını göremez (`design/agent.md`). Kısıtları bilmez ve değiştirmez; yetki için bir aracı yoktur.

## 5. Sync motoru

### 5.1 `hidden`

`RemoteChanges`'e `hidden?: string[]` eklenir. Motor bunları silme gibi işlemez:

- Yereldeki dosya doğrudan silinir, çöpe gitmez. Klasörse altındaki her şey silinir, gönderilmemiş olanlar da.
- Dosyanın kaydı, `sync-base/` kopyası, `sync-away.json` satırı ve `.scrawl/history/` altındaki geçmişi de silinir. Bu cihaza inmemiş büyük bir ekse kaydı düşer.
- Rapora yeni bir liste girer: `hidden`. Sync paneli 2.4'teki satırı buradan yazar.
- Aynı yol `removed`'da da gelirse `hidden` sayılır.

### 5.2 `RemoteForbidden`

Yeni hata `RemoteForbidden(path, why)`: `ServerRemote` 403 `taken`'ı ve `no-access`'i buna çevirir. Bugün `RemoteConflict` dışındaki her hata turu bitirir (`engine.ts`, `attempt`); bu hatayı da turu durdurmadan almak gerekir:

- `taken`: dosya gönderilmez, iş "refused" olur, adıyla rapora girer, dosya cihazda kalır (2.6).
- `no-access`: cihaz, görmesi biten bir yere `hidden` gelmeden yazmaya çalışmıştır. Dosya bu turda bırakılır; sonraki turda `hidden` gelir ve dosya silinir.

### 5.3 Klasör taşıma

`RemoteStore`'a isteğe bağlı `moveDir?(from, to)` eklenir. Motor dosya taşımalarına bakmadan önce şuna bakar: bu cihazda bir klasör gitmiş, yeni bir klasör gelmiş ve eskisindeki her kayıtlı dosya yenisinde aynı göreli yolla duruyorsa bu bir klasör taşımasıdır. Sunucuya tek bir `moveDir` gider; içeriği değişen dosyalar sonra bugünkü gibi yüklenir. Sağlayıcıda `moveDir` yoksa (bugün OneDrive'da yok) dosyalar tek tek taşınır. Öbür cihazlar bunu bugünkü gibi dosya dosya taşıma olarak görür.

## 6. Eski sürümler

- Görmesi biten yollar `removed`'da da gelir. Eski uygulama onları başka bir cihazda silinmiş sayar ve bu cihazın çöpüne taşır; kopya çöpte kalır. Yeni uygulama `hidden`'a bakar ve doğrudan siler. Bu yüzden sunucu, web ve masaüstü aynı gün yayınlanır; web kendiliğinden, masaüstü güncellemeyle yenilenir.
- Eski uygulama 403'te turu durdurur. Bu yalnız ad çakışmasında ve görmesi biten bir yere yazmada olur.

## 7. Güvenlik: ne kapanır, ne kalır

Kapananlar: değişiklik listesi, okuma, yazma, çöp, ortak dosyalar, ekler, canlı kanal, ajan, taşıyarak açığa çıkarma.

Kalanlar:

- Aynı adı kullanmaya çalışan kişi, orada göremediği bir şey olduğunu öğrenir (2.6).
- Kapalı bir cihazdaki kopya, cihaz bağlanana kadar durur (2.4). Erişim varken kopyalanan, dışa aktarılan ya da ekran görüntüsü alınan şey geri alınamaz.
- Herkese açık bir nottaki, kısıtlı bir nota giden link ve link metni görünür; link açılmaz.
- Sunucunun sahibi diskteki her şeye ulaşır (`design/spaces.md`); `scrawl-server export` her şeyi verir.

## 8. Testler

### 8.1 Sunucu

- Süzme: `changes` (imleçli ve tam liste, sayfa sayfa), okuma, `listDir`; iç içe kısıt; Owner ve Admin her şeyi görür.
- `hidden`: listeden çıkarma, kısıt kurma, kısıtlı bir yere taşıma; klasör tek satır olarak gelir; yeniden gösterilince `hidden` satırı düşer; gösterilen satırlar yeni `seq` alır, zaten görenin cihazında indirilecek bir şey çıkmaz.
- Dosya istekleri: görmediği ada yazmak 403 `taken`, görmesi biten yere yazmak 403 `no-access`; okuma ve silme, yol yokmuş gibi davranır.
- Taşıma: kısıt öğeyle gider; daha kısıtlı bir yere taşıma; çöpe atma ve çöpten geri alma; `move-dir` kısıtları taşır; silinen bir öğenin eski yolu 90 gün süzülür.
- Kuran: başkası çıkaramaz, Owner ve Admin çıkarır; listedekiler üye olmalıdır; kişisel space'te 403.
- Ortak dosyalar: çöp dizini ve `created` kişiye göre süzülür; geri yazılınca kişinin görmediği satırlar kalır; `If-Match` kişinin gördüğü halin etiketiyle karşılaştırılır.
- Ekler: kısıtlı bir notun eki onu görmeyene gitmez; herkese açık bir notta da kullanılan ek herkese görünür; kullanılmayan yeni ek yalnız yükleyene görünür; geçişte kullanılmayanlar açık kalır, ilk kullanımda kurala girer; not kısıtlanınca, ek linki eklenince ya da çıkarılınca ekin görünürlüğü değişir; ek, nottan önce gönderilse de arada başkasına inmez.
- Canlı kanal: göremeyen haber almaz.
- Ajan: `ServerFs` kişinin görmediğini görmez, oraya yazamaz.

### 8.2 Motor

- `hidden`: dosya ve klasör doğrudan silinir, çöpe gitmez; değişmiş ve gönderilmemiş olan da silinir; taban, geçmiş ve `away` kaydı gider; `removed`'da da gelen yol `hidden` sayılır.
- `RemoteForbidden`: tur durmaz, dosya cihazda kalır ve raporda görünür.
- Klasör taşıma: tek `moveDir` gider; içinde değişen dosya taşımadan sonra yüklenir; `moveDir`'i olmayan sağlayıcıda dosyalar tek tek taşınır.
- Sözleşme: `ServerRemote`, test içinde açılan bir sunucuya karşı iki hesapla, biri görür öbürü görmez. Kısıt kurulunca, kaldırılınca ve taşınınca iki cihaz da doğru halde kalır.

### 8.3 Elle (bitti ölçütü)

İki hesap, masaüstü ve web: Finance kısıtlanınca öbür hesapta saniyeler içinde kaybolur; kişi listeye geri eklenince gelir; Finance'tan çöpe atılan bir not öbür hesabın çöpünde görünmez; Finance'ın adı değişince kısıt sürer; Finance'taki bir notun eki öbür hesapta görünmez.

## 9. Dilimler

1. **Sunucu:** tablolar, `View`, süzme, `hidden` ve yeniden numaralama, dosya istekleri, taşımada kısıt, `move-dir`, yetki istekleri, canlı kanal, ajan.
2. **Motor:** `hidden`, `RemoteForbidden`, klasör taşıma.
3. **Ortak dosyalar ve ekler.**
4. **Uygulama:** Access penceresi (masaüstü ve telefon), kilit, sync panelindeki satırlar. Mockup 24 Ekim'de onaylandı.

Sunucu, web ve masaüstü birlikte yayınlanır (6. bölüm).

## 10. Bu işte olmayanlar

- Salt okunur; sonra da gelmeyecek (11. bölüm, 9. karar).
- Kartı, görevi ya da koleksiyon kaydını tek başına kısıtlamak (11. bölüm, 2. ve 3. kararlar).
- Kilit, yani "yalnız ben değiştireyim" (11. bölüm, 6. karar).
- OneDrive'daki space'ler ve kişisel space (1. bölüm).
- Ajanın yetki değiştirmesi (12. bölüm, 4. karar).

## 11. Verilen kararlar (24 Ekim 2026)

1. Yetki space'in içinde, yola göre. Yetkili klasörü ayrı bir sync birimi yapmak seçilmedi, çünkü yalnız klasöre yetki verilebiliyordu.
2. Dosyaya ve klasöre yetki verilir; pano ve görev listesi bütün olarak.
3. Koleksiyonda tek bir kayıt kısıtlanmaz.
4. Erişimi olmayan kişi hiçbir şey görmez, adı da.
5. Kısıtı kuran kurar; sonra onu gören herkes ve Owner, Admin düzenler.
6. Kuranı yalnız Owner ve Admin çıkarır; kilit yok.
7. Owner ve Admin kısıtlı her şeyi her zaman görür.
8. Görmesi biten dosya cihazdan doğrudan silinir, gönderilmemiş değişikliğiyle birlikte.
9. Salt okunur yok ve hiç olmayacak; PLAN'ın Sonraya kalanlarından da çıkarıldı.
10. 12. bölümdeki dört karar önerildiği gibi (her birinde a) onaylandı: ekleri sunucu, onları kullananlardan çıkarır; Owner ve Admin üyesi oldukları space'lerde görür; kısıtı kuran, Owner ve Admin kaldırır; ajan yetki değiştirmez.
11. Mockup onaylandı: Access… Move to… ve Rename'den sonra; uyarı yalnız biri erişimi kaybedince, kimin kaybettiğini adıyla söyler; satırlarda Gets access ve Loses access; Owner ve Admin adlarıyla; kişilerin sırası açıldığındaki hal; Cancel ve Save, dışarı tıklamak kaydetmez; ad çakışmasının metni; sync panelinde Removed from this device grubu.

## 12. Onayına sunulan kararlar

24 Ekim 2026: dördü de önerildiği gibi onaylandı.

### 1. Ekler nasıl kısıtlanır

**a) Sunucu, eki kullananlardan çıkarır. (Önerim)** Bir not, görev listesi, pano ya da kayıt yazılınca sunucu içindeki `_attachments/` linklerini okur (core'daki `filesIn`, Files ekranının kullandığı) ve `attachment_uses (space_id, attachment_key, file_key)` tablosunu günceller. Ek, onu kullananlardan en az birini görene görünür; çöpteki kullananlar da sayılır. Henüz hiçbir yerde kullanılmayan yeni bir ek yalnız yükleyene ve Owner, Admin'e görünür, çünkü uygulama eki nottan önce gönderir ve arada bir başkasının cihazına inmemelidir. Bugün kullanılmayan ekler geçişte herkese açık kalır; kimsenin cihazından bir şey silinmez.

- Artısı: kullanıcının bir şey yapması gerekmez. Ajanın ya da başka bir programın eklediği ek de doğru kısıtlanır. Kural tek yerde, sunucuda.
- Eksisi: sunucu yazılan her notu okur. Yalnız `_attachments` geçenleri okur ve bunlar küçük dosyalardır.

**b) Uygulama eki notla birlikte kısıtlar.** Kısıtlı bir nota ek eklenince ya da bir not kısıtlanınca uygulama eklerine de aynı kısıtı kurar.

- Artısı: sunucu dosyaların içini okumaz.
- Eksisi: kural üç istemcide ve ajanda ayrı ayrı yazılır. Ek nottan önce gittiği için kısa bir süre herkese görünür. Başka bir programın eklediği ek açık kalır.

### 2. Owner ve Admin nerede görür

**a) Üyesi oldukları space'lerde. (Önerim)** Owner ve Admin bu space'lerdeki kısıtlı her şeyi görür ve listesini düzenler. Üyesi olmadıkları bir space'e bugünkü gibi girmezler; kişisel space'leri görmezler. "Herkes yalnız davet edildiği space'leri görür" kuralı (`design/server.md` 11, 2. karar) aynen kalır.

**b) Ayrıca sunucunun sayfasında.** a'ya ek olarak, Settings › Servers'taki sunucu sayfasında, üyesi olmadıkları space'lerdeki kısıtlı dosya ve klasörlerin adları ve listeleri de görünür ve oradan düzenlenir; içleri açılmaz.

### 3. Kısıtı kim kaldırır

Kısıtı kaldırmak, o şeyi space'teki herkese açmak demektir.

**a) Kuran, Owner ve Admin. (Önerim)** Kuranın korunmasıyla aynı mantık: listeyi düzenleyen biri, kuranın kurduğunu tek bir hareketle bozamaz. Google Drive'da da bir klasörü kısıtlamak My Drive'da owner'ın, shared drive'da Manager'ın işidir.

**b) Onu gören herkes.**

### 4. Ajan yetki değiştirebilir mi

**a) Bu işte hayır. (Önerim)** Ajan kişinin gördüğünü görür, ama kısıtları bilmez ve değiştirmez. Birinin cihazlarından bir şeyi silecek bir işi bir ajan yanlışlıkla yapmamalı. PLAN'da "ajan için ince yetkiler" de sonraya kalanlar arasında.

**b) Evet.** `save_access` gibi yeni bir araçla. Araç sayısı artar; ajan tasarımında araç sayısının az kalması isteniyor.

## 13. PLAN'da değişenler (24 Ekim 2026)

- 6. Aşamalar: yeni **20 Dosya ve klasör yetkisi**, Mesajlaşma 19'da kaldı (o sırada başlamıştı); Dropbox, S3 ve GitHub 21, Google Drive 22, Mobil 23 oldu. Sync sağlayıcıları satırı ve native iOS'un geçtiği iki yer de buna göre.
- 5.5, Roller: dosya ve klasör yetkisinin kuralları eklendi; "Salt okunur üye yoktur." cümlesi kaldı. Ücretli özellik yok maddesinde ince yetkilerin yerine 20. aşama.
- Sonraya kalanlar: "sunucuda ince yetkiler" maddesi çıktı; salt okunur üye hiç olmayacak.
- `design/server.md` 1 ve `design/collection-apps.md` 1 bu belgeyi gösterir.
