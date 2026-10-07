# Scrawl: plan

Ürün adı **Scrawl**; GitHub, npm ve alan adında `scrawlnotes`. Açık kaynak (MIT), ticari hedef yok.

## 1. Amaç

Sublime/Notepad'de kapatılmayan sekmelerin yerini alacak bir çalışma notu uygulaması:

- Açılır açılmaz yazılır; isim, klasör, kaydetme sorulmaz.
- Yazılan şey kaybolmaz ve her cihazda görünür.
- Todo, notlardan ayrı ve Todoist kalitesinde bir modüldür.
- Sync kullanıcının kendi OneDrive / Google Drive hesabına yapılır; bizim sunucumuz yoktur ve olmayacaktır.

**Hedef kitle:** geliştiriciler ve bir şey üreten insanlar; hem iş hem kişisel kullanım (hızlı not, alışveriş listesi gibi şeyler düz not olarak tutulur). Uluslararası; isim, arayüz ve dokümantasyon İngilizce.

## 2. İlkeler

1. **Her parça basit ve işe yarar.** Bir özellik günlük kullanımda karşılığını vermiyorsa eklenmez.
2. **Modüller bağımsızdır.** Not, görev listesi ve pano birbirinin içine gömülmez; yalnızca birbirine link verir. Her biri tek başına kullanılabilir.
3. **Veri kullanıcınındır.** Düz dosyalar, kullanıcının kendi diski ve kendi bulutu.
4. **Sürtünme yok.** Yazmaya başlamak için hiçbir karar gerekmez.

**Yapmayacaklarımız:** eklenti sistemi, graph görünümü, not içi veritabanı, şablon motoru, not içi checkbox tabanlı todo, gerçek zamanlı ortak düzenleme, kendi sunucumuz, etiket yönetimi.

## 3. Verilen kararlar

| Konu | Karar |
|---|---|
| Editör | Live preview markdown; dosyalar düz `.md` |
| Tasarım | A yönü (Buffer): sıkı, monospace, kutu sekmeler, durum çubuğu; tek ağaçlı kenar çubuğu |
| Düzenleme birimi | Klasör. "Proje" ayrı bir kavram değil; içinde görev listesi veya pano olan klasördür |
| Etiketler | Yok. Metindeki `#kelime` yalnızca aramayla bulunur |
| Todo | Alt görevler ve filtreler şart. Doğal dil ekleme, tekrar ve hatırlatma v1'de yok |
| Paylaşım | Herkese açık salt-okunur link + dosya olarak dışa aktarma (PDF/HTML/MD) |
| Çok kullanıcı | Sonra; klasörü bulut sağlayıcısında paylaşarak. Gerçek zamanlı düzenleme yok |
| Mobil | Önce web sürümü telefonda PWA olarak; Apple geliştirici hesabından sonra native iOS |
| İlk sync sağlayıcısı | OneDrive |
| Arayüz dili | İngilizce; çeviri altyapısı baştan kurulur, diller sonra eklenir |
| Lisans | MIT |

## 4. Özellikler

### 4.1 Kenar çubuğu ve sekmeler

- **Tek ağaç.** Üstte tüm klasörleri kapsayan görünümler (Today, Upcoming), altlarında Inbox, en altta klasörler. Bir klasör açıldığında görev listeleri, panoları, notları ve alt klasörleri aynı yerde durur.
- **Her şey sekmedir.** Sekme not, görev listesi veya pano taşır; baştaki simge türünü gösterir. Bölünmüş görünümde farklı türler yan yana açılır.
- **Yeni modül** = klasörün içinde yeni bir öğe türü + yeni bir sekme türü. İskelet değişmez.
- **Dar pencere ve telefon:** 640 pikselin altında kenar çubuğu, sekmelerin solundaki ☰ ile açılan bir çekmecedir; bir şey seçince, dışarıya dokununca ya da Esc ile kapanır. Sekmeler okunacak genişlikte kalır ve sığmayınca yana kayar; biçim çubuğu tek satırda kalır ve kayar; satır numaraları gizlenir. Dokunmatik ekranda üstüne gelinince çıkanlar hep görünür; görev satırı, düğmeleri yerine tüm işlemleri açan tek bir `···` gösterir. Dokunmatikte sürükleyerek sıralama 4. aşamaya kalır.

### 4.2 Not editörü

- **Scratch sekmeler:** Ctrl+N, 1, Enter kalıcı bir not açar. Başlık ilk satırdan türetilir. Dosyalanmamış notlar Inbox'ta durur. Adı verilmemiş not boş kapatılırsa iz bırakmaz.
- **Hızlı yakalama:** şimdilik yok. Her yerde arama penceresi yapılınca onun içine alınabilir.
- **Sekmeler:** sürüklenerek sıralanır; sıra bir sonraki açılışta korunur.
- **Gezinme ve arama:** ayrı bir aşamada; Spotlight veya Rider'daki "her yerde ara" tarzında tek bir arama penceresi (nota git, tam metin, komutlar).
- **Düzenleme:** çoklu imleç, satır taşıma/çoğaltma, bul-değiştir. Enter tek satır iner.
- **Live preview:** başlık, kalın/italik, liste, kod bloğu (renklendirme ve kopyala düğmesi), tablo, alıntı yerinde biçimlenir.
- **Markdown işaretleri görünmez:** kullanıcı notundadır, markdown'da değil. İşaretler imleçle de açılmaz; imleç gizli işaretlerin üstünden atlar, bu yüzden metin hiç kaymaz. Notun ham markdown hali durum çubuğundaki Markdown düğmesiyle açılır.
- **Seçim Sublime gibi çizilir:** yalnızca seçili karakterler ve satır sonları boyanır; boş satır boş görünür. Durum çubuğu seçili karakter sayısını gösterir.
- **Yazılan yazıldığı gibi kalır:** klavyeden veya yapıştırarak giren `*`, `_`, `#`, `-` gibi karakterler biçime dönüşmez (dosyada ters eğik çizgiyle kaçırılır, ekranda çizgi görünmez). Biçim yalnızca biçim çubuğundan gelir.
- **Biçimlendirme:** sekmelerin altında sabit biçim çubuğu (seçim üstünde açılan menü yok). Kısayollar vardır ama hiçbir işlem kısayol bilmeyi gerektirmez.
- **Kopyalama:** panoya üç sürüm konur: düz metin (işaretsiz), biçimli HTML (Word, mail) ve nottan nota yapıştırma için markdown. Dışarıdan yapıştırılan şey düz metin olarak girer.
- **Sayım:** karakter sayıları ve sütun, ekranda görünen metne göre hesaplanır.
- **Tablolar:** ızgara olarak çizilir ve yerinde düzenlenir: hücreye tıklayıp yazma, Tab ve Enter ile gezinme, satır/sütun ekleme ve silme. Hücreler düz metindir.
- **`/` menüsü:** satır başında veya boşluktan sonra `/` yazınca eklenebilecekler listelenir (başlık, liste, alıntı, kod bloğu, tablo, ayırıcı, resim).
- **Çoklu imleç çubukta:** sonraki eşleşme, tüm eşleşmeler, alt satıra imleç.
- **Bul/değiştir:** editörün altında tek satırlık çubuk; ekranda görünen metni arar.
- **Masaüstü:** Tauri kabuğu; notlar seçilen klasörde `.md` dosyalarıdır, klasör seçimi kabuğun ayar dosyasında tutulur.
- **Oluşturma penceresi:** "+" ve Ctrl+N ortada küçük bir pencere açar: 1 Note, 2 Task list, 3 Board. Açık sekme yokken uygulama da bu pencereyle açılır. Not ve görev listesi için ikinci adımda ad ve klasör sorulur: ad boş kalabilir (not ilk satırından, liste `Tasks` adını alır); klasör açık sekmenin klasörüyle başlar, sekme yoksa Inbox. Klasör listesi Move to penceresindekiyle aynıdır; olmayan bir ad yazılırsa klasör oluşturulur. Enter oluşturur, Esc ilk adıma döner.
- **Not adı:** adlandırılmamış not ilk satırıyla, adlandırılmış not dosya adıyla görünür.
- **Sağ tık:** notta ve görev listesinde Move to…, Rename, Delete; klasörde New note here ve Delete folder (Inbox'ta yok). Sürükle-bırak ek yol olarak kalır.
- **Silme:** not, görev listesi, klasör ve görev silinmeden önce onay sorulur. Not, liste ve klasör (içindekilerle) `.scrawl/trash`'e gider; silinen görev geri gelmez.
- **Tablo kenarı:** imleç tablonun kenarında duramaz; tablonun hemen altına yazılan metin araya boş satır konarak tablodan ayrılır.
- **Medya:** panodan resim yapıştırma; resim dışı dosyaları bırakma (`_attachments`'a kendi adıyla kopyalanır, notta dosya linki olur, sistemdeki programıyla açılır); biçim çubuğundan veya `/` menüsünden ses kaydı, notta kendi tasarımımız olan oynatıcı; resim, dosya ve kayıt not içinde sürüklenerek taşınır. Tek tıkla seçilir; tek başına seçiliyken yanında `Open · Show in folder · Delete` çubuğu çıkar (resimde sağ üst köşede), sağ tık aynı menüyü açar, çift tık doğrudan açar. Show in folder yalnızca masaüstünde; kayıtta Open yok, oynatma düğmesi var. Delete öğeyi nottan kaldırır, onay sormaz (Ctrl+Z geri getirir). Tek başına yapıştırılan URL, metni adresin kendisi olan bir link olarak girer; sayfa başlığı çekilmez. Linkler Ctrl+tıkla varsayılan tarayıcıda açılır.
- **Sürüm geçmişi:** not başına yerel anlık görüntüler, `.scrawl/history/` içinde. Kayıtta en fazla 10 dakikada bir alınır; not uygulama dışında değişirse eski hali de saklanır. Son 24 saatin hepsi, sonrasında günde bir tane tutulur, 60 günden eskiler silinir. Not taşınınca veya adı değişince geçmişi de gider. Sağ tık → History…: zamanlar, önizleme ve Restore (restore öncesi şimdiki hal de saklanır).
- **Çöp kutusu:** kenar çubuğunun en altında Trash; silinen not, liste ve klasörler silinme zamanı ve eski yeriyle listelenir. Restore eski yerine döndürür, Delete forever ve Empty trash onay ister. Bir resim, dosya veya kayıt nottan kaldırılınca, not kaydedilir kaydedilmez başka hiçbir not (kaydedilmemiş açık notlar ve çöptekiler dahil) onu kullanmıyorsa dosya çöpe taşınır. Ctrl+Z, yapıştırma veya geçmişten geri yükleme linki geri getirirse dosya da çöpten kendiliğinden döner; kes-yapıştır bu yüzden bozulmaz. Uygulama açılırken yapılan temizlik, başka bir programla düzenlenen notlar için yedek olarak kalır. Geçmişten veya çöpten geri gelen not, çöpe gitmiş dosyalarını da geri getirir; çöpten kalıcı silinen not, başka hiçbir notun kullanmadığı dosyalarını da aynı onayla siler.
- **Dark mode:** sistemle uyumlu, elle değiştirilebilir; ayarlar ekranıyla birlikte gelir.

### 4.3 Görevler

- Bir klasörde istenen sayıda görev listesi; her liste kendi adıyla ayrı bir dosyadır. Liste yalnızca oluşturma penceresinden açılır, klasörle birlikte kendiliğinden gelmez. Yapı: bölüm > görev > alt görev.
- Inbox'ın kendi görev listesi her zaman vardır; Today'den eklenen görevler oraya gider.
- Görev alanları: başlık, açıklama, öncelik (p1-p4), tarih, tamamlanma.
- Bölümler: bölümsüz görevler en üstte başlıksız durur, ardından bölümler gelir. Bölüm başlığı katlanır (katlı hali dosyada saklanır), adına tıklayınca yerinde düzenlenir, `···` ve sağ tık menüsünde Rename, Add task, Delete section vardır. Bölüm silinince görevleri de onayla kalıcı olarak silinir (Todoist gibi). Listenin sonunda "Add section" satırı vardır.
- Sürükleme: görevin üstüne gelince solunda tutamaç çıkar; görev alt görevleriyle birlikte aynı bölümde, başka bölüme ya da en üste sürüklenir. Bırakılacak yeri turuncu bir çizgi gösterir; çizginin başladığı yer seviyedir: imleci sağa kaydırmak görevi üstündekinin alt görevi yapar (en fazla 4 seviye), sola kaydırmak bir seviye çıkarır. Katlı bir bölümün başlığına bırakılan görev o bölümün sonuna girer. Bölüm başlıkları da sürüklenir. Esc iptal eder. Today ve Upcoming tarihe göre sıralıdır, orada sürükleme yoktur.
- Taşıma: görevin satırındaki simgeden ya da sağ tık menüsünden Move to… açılır; tüm listeler klasörleriyle, bölümleri altlarında listelenir, görevin şu anki yeri işaretli ve seçilemez. Görev alt görevleriyle seçilen liste ya da bölümün sonuna en üst seviye görev olarak gider; tarih, öncelik ve açıklama kalır. Today ve Upcoming'de de çalışır.
- Açıklama düz metindir; listede başlığın altında en fazla iki satır görünür. Başlığa tıklayınca satır, başlık ve açıklamanın birlikte düzenlendiği bir kutuya döner: başlıkta Enter, açıklamada Ctrl+Enter kaydeder, Esc vazgeçer, kutunun dışına tıklamak kaydeder. Yeni görev satırı yalnızca başlık alır.
- Tüm listeleri kapsayan görünümler: Today, Upcoming, kayıtlı filtreler (ör. "bu hafta ve p1").
- Kayıtlı filtreler: kenar çubuğunda Today ve Upcoming'in altında durur; Ctrl+N penceresindeki Filter ile yapılır. Filter penceresinde ad (boşsa seçimlerden üretilir), Due (Any, Overdue, Today, This week, Next 7 days, No date; Today/This week/Next 7 days gecikmişleri de kapsar), Priority (birden çok), In (tüm listeler ya da üst klasörler, içlerindekilerle) ve Contains (başlık ya da açıklamada) seçilir; uyan açık görev sayısı canlı görünür, Save filter kaydeder. Filtre görünümü açık görevleri listelerine göre gruplar, tarih sonra önceliğe göre sıralar. Sağ tık: Edit filter, Delete (onaylı; görevler yerinde kalır). Filtreler `.scrawl/filters.json` dosyasında durur.
- Klavye öncelikli hızlı ekleme (düz alanlarla).
- Notla tek bağlantı: notta metni seçip "göreve çevir". Görev listede oluşur, nota geri link taşır; notun içine bir şey yazılmaz. Biçim çubuğundaki To task düğmesi (Ctrl+T, web'de Alt+T) seçimi, seçim yoksa imlecin satırını alır; ilk satır başlık, kalanı açıklama olur, liste/alıntı/başlık işaretleri alınmaz. New task penceresinde başlık düzenlenir ve liste ya da bölüm seçilir; başlangıçta notun klasöründeki ilk liste, yoksa Inbox seçilidir. Görevin altında "from: <not adı>" linki notu açar; not taşınır ya da adı değişirse link takip eder, not silinirse soluk görünür.
- Veri modelinde `recurrence`, `reminder`, `assignee` ve `author` alanları ayrılır ama v1'de kullanılmaz.

### 4.4 Paylaşım

- **Dışa aktarma:** PDF, tek dosya HTML (resimler gömülü), `.md` + ekler (zip).
- **Herkese açık link:** not statik HTML'e çevrilip küçük bir yayın servisine (kullanıcının kendi Cloudflare hesabı) yüklenir, tahmin edilemez bir URL döner. İsteğe bağlıdır; uygulama onsuz da çalışır.

### 4.5 Sonraki modüller ve yönler

- **Pano (Kanban):** klasör içinde bir öğe türü. Kartların görevlerle aynı kayıt mı, ayrı mı olacağı o aşamada kararlaştırılır.
- **Çok kullanıcı:** klasörü OneDrive/Drive üzerinden paylaşmak. Çakışmalar mevcut birleştirme mantığıyla çözülür.
- **Agent-first:** vault'u açan bir komut satırı aracı ve MCP sunucusu. `packages/core` arayüzden bağımsız tutulduğu için aynı kodu kullanırlar.

## 5. Mimari

### 5.1 Teknoloji

| Katman | Seçim |
|---|---|
| Dil, derleme | TypeScript, Vite, pnpm monorepo |
| Arayüz | React |
| Editör | CodeMirror 6 + kendi live preview eklentimiz |
| Masaüstü | Tauri 2 (Windows öncelikli) |
| Web | Tarayıcı uygulaması, telefonda ana ekrana eklenebilir (PWA); statik hosting |
| Mobil (sonra) | Native kabuk içinde aynı arayüz kodu (Capacitor veya Tauri mobile) |
| Arama | Web worker içinde bellek içi indeks; yetmezse SQLite FTS |
| Yayın servisi | Cloudflare Worker + R2 |

Arayüz web-first yazılır; Tauri aynı uygulamayı sarar. Platform farkı yalnızca depolama ve OAuth katmanındadır. Düzen baştan dar ekrana uyumlu tutulur.

### 5.2 Depo yapısı

```
apps/desktop        Tauri kabuğu
apps/web            React arayüzü (sekmeler, kenar çubuğu, görev görünümleri) ve tarayıcı depolaması
packages/core       veri modeli, vault, görevler, çöp kutusu, geçmiş, sync motoru, adaptörler (arayüzden bağımsız)
packages/editor     CodeMirror 6 live preview eklentileri
packages/i18n       arayüz metinleri; dil başına bir sözlük
services/publish    Cloudflare Worker (paylaşım linki)
design/             arayüz taslakları
```

### 5.3 Veri (vault)

```
vault/
  Inbox/                     dosyalanmamış notlar
    tasks.json               Inbox'ın görev listesi
  <klasör>/
    <not>.md                 düz markdown
    <ad>.tasks.json          görev listesi, bir klasörde istenen sayıda; ağaç yapısı `parent` alanıyla
    <ad>.board.json          pano (sonra)
  _attachments/              resim, ses, dosya (şimdilik kökte tek klasör; not taşınınca link bozulmaz)
  .scrawl/
    trash/                   silinen notlar, görev listeleri ve klasörler; eski yerleri bir dizinde tutulur
    history/                 notların yerel anlık görüntüleri, cihaza özel
    sync-state.json          cihaza özel, sync edilmez
    workspace.json           açık sekmeler ve düzen, cihaza özel
```

- Klasör kendi içinde eksiksizdir; taşımak veya paylaşmak tek bir klasörle olur.
- Notlar düz dosyadır; başka bir editörle, grep veya git ile kullanılabilir.
- Depolama soyutlaması: masaüstünde gerçek dosya sistemi, web'de OPFS.
- Kesin dosya biçimleri ilgili aşamada sabitlenir.

### 5.4 Sync

- Her platformda aynı motor: yerel durum, uzak durum ve son eşitlenen taban karşılaştırılır.
- Adaptörler: OneDrive (Microsoft Graph), Google Drive, yerel klasör.
- Çakışma: notlarda 3-yollu metin birleştirme, birleşmezse çakışma kopyası. Görevlerde kayıt bazında birleştirme.
- Güvenlik ağı: sync'in sildiği her şey önce çöp klasörüne gider; notların yerel anlık görüntüleri tutulur.
- Kimlik doğrulama: OAuth PKCE; web'de tarayıcı içinde, masaüstünde sistem tarayıcısı ile.

## 6. Aşamalar

| # | Aşama | Bitti sayılır |
|---|---|---|
| 0 | İskelet ve editör denemesi | Monorepo kurulu; live preview prototipi başlık, vurgu, liste, link, resim ve kod bloğuyla tarayıcıda denenebiliyor |
| 1 | Masaüstü editör | Yerel klasörle günlük kullanımda Notepad'in yerini alıyor. **Bitti:** editör, sekmeler (sürükleyerek sıralama dahil), scratch notlar, kenar çubuğu, resim, biçim çubuğunda çoklu imleç, kod bloğunda kopyala, çöp kutusu ekranı, sürüm geçmişi, dosya bırakma, ses kaydı ve oynatıcı, resim/dosya/kayıt menüsü, kullanılmayan eklerin temizliği, çeviri altyapısı (`packages/i18n`, şimdilik İngilizce), kurulabilir sürüm. **Kalan:** masaüstünde deneme (Show in folder, linki tarayıcıda açma) |
| 2 | Görevler | **Bitti:** klasörde adlı, birden çok görev listesi, dört seviyeye kadar alt görev, öncelik, tarih, Today/Upcoming, Inbox görevleri, açıklama, bölümler, sürükleyerek sıralama, başka listeye taşıma, notu göreve çevirme, kayıtlı filtreler |
| 3 | Ayarlar | Ayarlar ekranı: tema ve dark mode (sistemle uyumlu, seçim hatırlanır), not klasörü, dil |
| 4 | Sync + web | OneDrive adaptörü, çakışma çözümü; web sürümü yayında ve telefonda PWA olarak kullanılabilir |
| 5 | Paylaşım | PDF/HTML/MD dışa aktarma; yayın servisi ve "link olarak paylaş" |
| 6 | Mobil | Native iOS uygulaması (sonra Android) |
| 7 | Sonrası | Her yerde arama (Spotlight/Rider tarzı; hızlı yakalama belki bunun içinde), bölünmüş görünüm, Pano, Google Drive adaptörü, klasör paylaşımıyla çok kullanıcı, komut satırı aracı ve MCP sunucusu, ek diller |

## 7. Riskler

- **Kapsam:** her aşama günlük kullanılır hale gelmeden sonrakine geçilmez.
- **Live preview editör:** en zor arayüz parçası; Aşama 0'da prototiple doğrulanır. Tutmazsa geri dönüş, işaretlerin hep göründüğü renklendirilmiş düz metindir (aynı editör, gizleme kapalı).
- **Sync doğruluğu:** veri kullanıcının diskinde olsa da onu bizim kodumuz taşır. Motor, sahte adaptörle çakışma senaryolarını kapsayan testlerle yazılır.
- **Google Drive, tarayıcıda:** Google, sunucusuz web uygulamasına uzun ömürlü oturum vermez; web'de sık yeniden onay gerekebilir. İlk adaptör bu yüzden OneDrive.
- **Paylaşılan klasörler:** OneDrive'da uygulamaya özel klasör izni başkasının paylaştığı klasörü kapsamaz; çok kullanıcı aşamasında daha geniş izin gerekir.
- **OAuth uygulama kaydı:** Microsoft ve Google'da birer kayıt gerekir. Kullanıcılar kendi istemci kimliğini girebilmelidir.
