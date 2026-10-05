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

- **Tek ağaç.** Üstte tüm klasörleri kapsayan görünümler (Inbox, Today, Upcoming), altında klasörler. Bir klasör açıldığında görev listesi, panoları, notları ve alt klasörleri aynı yerde durur.
- **Her şey sekmedir.** Sekme not, görev listesi veya pano taşır; baştaki simge türünü gösterir. Bölünmüş görünümde farklı türler yan yana açılır.
- **Yeni modül** = klasörün içinde yeni bir öğe türü + yeni bir sekme türü. İskelet değişmez.

### 4.2 Not editörü

- **Scratch sekmeler:** Ctrl+N anında kalıcı bir not açar. Başlık ilk satırdan türetilir. Dosyalanmamış notlar Inbox'ta durur.
- **Hızlı yakalama:** masaüstünde global kısayolla küçük bir pencere; yaz, Esc, not Inbox'a düşer.
- **Inbox bakımı:** her öğe için tek tuşla dosyala, göreve çevir veya arşivle. Uzun süre dokunulmayanlar arşive iner, silinmez.
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
- **Oluşturma penceresi:** "+" ve Ctrl+N ortada küçük bir pencere açar: 1 Note, 2 Task list, 3 Board. Açık sekme yokken uygulama da bu pencereyle açılır.
- **Not adı:** adlandırılmamış not ilk satırıyla, adlandırılmış not dosya adıyla görünür.
- **Sağ tık:** notta Move to…, Rename, Delete; klasörde New note here. Sürükle-bırak ek yol olarak kalır.
- **Tablo kenarı:** imleç tablonun kenarında duramaz; tablonun hemen altına yazılan metin araya boş satır konarak tablodan ayrılır.
- **Medya:** panodan resim yapıştırma, sürükle-bırak dosya, satır içi ses kaydı ve oynatıcı, yapıştırılan linkin başlığını çekme.
- **Sürüm geçmişi:** not başına yerel anlık görüntüler.
- **Dark mode:** sistemle uyumlu, elle değiştirilebilir.

### 4.3 Görevler

- Klasör başına bir görev listesi: bölüm > görev > alt görev.
- Görev alanları: başlık, açıklama, öncelik (p1-p4), tarih, tamamlanma.
- Tüm klasörleri kapsayan görünümler: Inbox, Today, Upcoming, kayıtlı filtreler (ör. "bu hafta ve p1").
- Klavye öncelikli hızlı ekleme (düz alanlarla).
- Notla tek bağlantı: notta metni seçip "göreve çevir". Görev listede oluşur, nota geri link taşır; notun içine bir şey yazılmaz.
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
apps/web            web kabuğu
packages/core       veri modeli, vault, görevler, sync motoru, adaptörler (arayüzden bağımsız)
packages/editor     CodeMirror 6 live preview eklentileri
packages/ui         React arayüzü (sekmeler, kenar çubuğu, görev görünümleri)
services/publish    Cloudflare Worker (paylaşım linki)
design/             arayüz taslakları
```

### 5.3 Veri (vault)

```
vault/
  Inbox/                     dosyalanmamış notlar
  <klasör>/
    <not>.md                 düz markdown
    tasks.json               klasörün görev listesi (kayıt başına id, updatedAt, author)
    <ad>.board.json          pano (sonra)
  _attachments/              resim, ses, dosya (şimdilik kökte tek klasör; not taşınınca link bozulmaz)
  .scrawl/
    trash/                   silinen notlar
    inbox-tasks.json         klasörsüz görevler
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
| 1 | Masaüstü editör | Sekmeler, scratch notlar, kenar çubuğu, medya, dark mode, kurulabilir sürüm; yerel klasörle günlük kullanımda Notepad'in yerini alıyor |
| 2 | Görevler | Klasör görev listeleri, alt görevler, filtreler, Today/Upcoming, "göreve çevir" |
| 3 | Sync + web | OneDrive adaptörü, çakışma çözümü; web sürümü yayında ve telefonda PWA olarak kullanılabilir |
| 4 | Paylaşım | PDF/HTML/MD dışa aktarma; yayın servisi ve "link olarak paylaş" |
| 5 | Mobil | Native iOS uygulaması (sonra Android) |
| 6 | Sonrası | Her yerde arama (Spotlight/Rider tarzı), hızlı yakalama, bölünmüş görünüm, Pano, Google Drive adaptörü, klasör paylaşımıyla çok kullanıcı, komut satırı aracı ve MCP sunucusu, ek diller |

## 7. Riskler

- **Kapsam:** her aşama günlük kullanılır hale gelmeden sonrakine geçilmez.
- **Live preview editör:** en zor arayüz parçası; Aşama 0'da prototiple doğrulanır. Tutmazsa geri dönüş, işaretlerin hep göründüğü renklendirilmiş düz metindir (aynı editör, gizleme kapalı).
- **Sync doğruluğu:** veri kullanıcının diskinde olsa da onu bizim kodumuz taşır. Motor, sahte adaptörle çakışma senaryolarını kapsayan testlerle yazılır.
- **Google Drive, tarayıcıda:** Google, sunucusuz web uygulamasına uzun ömürlü oturum vermez; web'de sık yeniden onay gerekebilir. İlk adaptör bu yüzden OneDrive.
- **Paylaşılan klasörler:** OneDrive'da uygulamaya özel klasör izni başkasının paylaştığı klasörü kapsamaz; çok kullanıcı aşamasında daha geniş izin gerekir.
- **OAuth uygulama kaydı:** Microsoft ve Google'da birer kayıt gerekir. Kullanıcılar kendi istemci kimliğini girebilmelidir.
