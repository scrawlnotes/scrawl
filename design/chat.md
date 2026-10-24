# Mesajlaşma (taslak)

Durum: 24 Ekim 2026, onaylı. Kapsam sohbette konuşuldu ve şunlara karar verildi:

- Mesajlar sunucunun veritabanında durur, dosya değildir. PLAN 5.5'e istisnadır (1.3).
- Room bir space'e, DM sunucuya aittir.
- Thread yok; WhatsApp'taki gibi alıntılı cevap var.
- Arayüzde A yönü: kenar çubuğunda tek Chat satırı, tek Chat sekmesi. Telefonda tab bar'da Chat sekmesi.
- Bildirim varsayılanları 6.1'deki gibidir.
- Önerilen eklerin hepsi girer: tepki, To task ve To card ile Scrawl çipleri, ajan araçları (DM'ler dahil), room'un medya listesi, dışa aktarma, grup DM.
- Yok: thread, workflow, zamanlanmış mesaj, hatırlatma, durum emojisi, dış link önizlemesi, uçtan uca şifreleme, misafir hesap, mesaj sabitleme ve kaydetme.
- Belki ileride: bot, sesli ve görüntülü arama.

Aynı gün 5. bölümdeki çevrimiçi, yazıyor ve okundu önerisi, 15. bölümdeki kararlar ve mockup (`design/mockups.html`, Mesajlaşma bölümü) olduğu gibi onaylandı. PLAN'a 19. aşama olarak işlendi (16. bölüm); Dropbox, S3 ve GitHub 20, Google Drive 21, Mobil 22 oldu. Roadmap'te faz 19, kartlar ROA-243–252. Kod yazılmadı.

## 1. Kapsam

### 1.1 Ne için

Ekip Slack yerine Scrawl'da konuşur: room'lar ve DM'ler; resim, dosya, kod ve ses kaydı; arama, cevap ve forward. Slack'in yorduğu yerler bilerek yoktur:

- Geçmiş hiç silinmez.
- Özellik azdır; her şey günlük işte karşılığını verir.
- Her şey ekibin kendi sunucusundadır.

Scrawl'ın farkı işle bağıdır: mesajdan görev ya da kart açılır, mesajda not, görev ve kart çip olarak durur, ajan konuşmayı okur ve yazar.

### 1.2 Yalnız sunucuda

OneDrive'la iyi çalışmaz:

- OneDrive tarayıcıya "değişti" demez. Mesaj 30 saniye ve üstü gecikmeyle gelir.
- Uygulama kapalıyken bildirim gönderecek bir şey yoktur.
- Klasöre erişimi olan herkes her dosyayı görür. Private room ve DM olmaz.

Chat yalnız sunucuda paylaşılan bir space'i olan kişide görünür. OneDrive space'lerinde konuşma kartın yorumlarında kalır. Sunucu sohbeti bilmeyen eski bir sürümse Chat görünmez: yeni sunucu `GET /server`'da `chat: true` der.

### 1.3 Mesajlar dosya değil

PLAN 5.5 "Doğrudan API'ye bağlı ayrı bir istemci yolu açılmaz" der. Sohbet bunun tek istisnasıdır:

- Space'in her dosyası her üyeye iner. Private room ve DM dosya olursa herkes görür.
- Okunmamışlar, okundu ve bildirim seçimi kişiye özeldir.
- Bildirim göndermek için sunucu mesajı anlamalıdır: kime, hangi room'da, kimin adı geçiyor.
- Yıllarca birikmiş mesaj ve ek her cihaza inmez. Cihazda yalnız son sayfalar önbellekte durur.

Notlar, görevler, panolar ve koleksiyonlar bugünkü gibi dosya kalır; sohbet onlara dokunmaz. Bedeli:

- Ajan mesajlara yalnız sunucunun `/mcp`'sinden ulaşır. Bilgisayardaki `scrawl-mcp` mesajları görmez.
- Dosya biçimi olmadığı için dışa aktarma ayrıca yazılır (10).

### 1.4 Ne yapmaz

- Thread. Yerine alıntılı cevap vardır (3.3).
- Workflow, zamanlanmış mesaj, hatırlatma, durum emojisi.
- Dış link önizlemesi.
- Uçtan uca şifreleme: sunucu ekibin kendisinindir, arama da sunucuda çalışır.
- Misafir hesap: sunucuda hesabı olmayan kimse konuşmaz.
- Mesaj sabitleme ve kaydetme.

**Belki ileride:** bot ile sesli ve görüntülü arama. Bu tasarımda yerleri yoktur; gelirse ayrı bir tasarımla gelir.

## 2. Kavramlar

### 2.1 Room

- Bir space'e aittir. Yalnız sunucudaki paylaşılan space'lerde vardır; kişisel space'te yoktur.
- **Public:** space'in herkesi görür. Browse rooms'ta bulur, katılmadan okur, Join ile katılır.
- **Private:** yalnız üyeleri görür. Üyelerden biri başkasını ekler.
- Her space'in bir `general` room'u vardır: sunucu space'i açınca oluşur, space'e katılan herkes içindedir, ondan çıkılmaz. Adı değişir, arşivlenmez.
- Room'u space'in her üyesi açar. Adını ve konusunu, room'u açan kişi ve space'in Manager'ları değiştirir. Room'u da onlar arşivler.
- Arşivlenen room okunur, yazılmaz. Listeden kalkar, Browse rooms'ta Archived altında durur. Room silinmez.
- Ad space içinde tektir, en çok 40 karakterdir, yazıldığı gibi kalır. Slack gibi küçük harfe çevrilmez.
- Space'ten çıkarılan kişi o space'in room'larından da çıkar.

### 2.2 DM

- Sunucuya aittir, bir space'e değil.
- İki ya da daha çok kişi arasındadır: grup DM'de sen dahil en çok 9 kişi.
- O sunucuda en az bir paylaşılan space'i paylaştığın herkesle DM açılır.
- Aynı kişilerle tek DM vardır. Mert'le bir DM, Mert ve Elif'le bir grup DM.
- Grup DM'ye sonradan kişi eklenmez. Yeni kişiyle yeni bir grup DM açılır; eski konuşma oraya taşınmaz. Grup büyüyecekse private room açılır.
- DM'den çıkılmaz. Listeden gizlenir (Hide); yeni mesaj gelince geri gelir.
- Biri sunucudan çıkarılınca DM okunur kalır, yazılmaz. Yazma kutusunun yerinde: "Mert Kaya is no longer on this server."

### 2.3 Birden çok sunucu

Chat sekmesi bütün sunucuları birlikte gösterir: önce her sunucunun space'leri, sonra DM'ler. İki sunucu varken DM başlığında sunucu da yazar: "Direct · scrawl.kaanarslan.dev". Forward ve çip yalnız aynı sunucunun içinde çalışır.

## 3. Mesaj

### 3.1 Yazmak

- Mesaj markdown'dır: kalın, italik, üstü çizili, kod, kod bloğu, link, liste, alıntı. Kod bloğunun dili seçilir; renklenir ve kopyalanır.
- Yazma kutusu kart yorumlarının editörüdür. Live preview ve "yazılan yazıldığı gibi kalır" kuralı burada da geçerlidir. Biçim çubuğu Aa düğmesiyle açılır.
- Masaüstünde Enter gönderir, Shift+Enter alt satıra geçer; kod bloğunda Enter alt satıra geçer. Telefonda Enter alt satıra geçer, Send düğmesi gönderir. Arayüzde kısayol anlatılmaz.
- Yazılıp gönderilmeyen metin konuşmada taslak olarak kalır, bu cihazda. Listede konuşmanın altında "Draft" yazar.
- 20 satırdan uzun mesaj katlanır, altında "Show more".
- Gönderilirken saatin yerinde soluk bir saat simgesi durur. İnternet yoksa mesaj kuyrukta bekler, bağlanınca gider. Gidemezse "Not sent", yanında Retry ve Delete.

### 3.2 Düzenleme ve silme

- Kendi mesajını her zaman düzenlersin. Mesajın yanında "edited" yazar; eski hali tutulmaz.
- Kendi mesajını silersin. Metni ve ekleri sunucudan silinir, yerinde "This message was deleted." kalır, cevaplar boşa düşmesin diye.
- Space'in Manager'ları room'larda başkasının mesajını da siler. DM'de yalnız yazan siler.

### 3.3 Cevap

- Mesajın Reply'ı yazma kutusunun üstünde "Replying to Mert Kaya" ve mesajın ilk satırını açar; × ile vazgeçilir.
- Gönderilen cevabın üstünde alıntı durur: kimin olduğu ve ilk satırı, ya da ekin türü ("Photo", "Voice message · 0:14").
- Alıntıya tıklayınca asıl mesaja kayılır, mesaj bir an işaretlenir. Asıl mesaj silinmişse alıntıda "Message deleted" yazar.
- Telefonda mesajı sağa kaydırmak da cevaplar.

### 3.4 Forward

- Forward… penceresinin üstünde mesaj durur. Altında arama ve konuşmalar vardır, son konuşulanlar önce. En çok 5 konuşma seçilir. "Add a message" isteğe bağlıdır; düğme Forward'dır.
- Giden mesajın üstünde "Forwarded from #dev · Mert Kaya" yazar. DM'den gelende room adı yerine "a direct message" yazar.
- Ekler aynı içerikle gider, yeniden yüklenmez.
- Yalnız aynı sunucudaki konuşmalara forward edilir.

### 3.5 Mention

- @ yazınca konuşmadaki kişiler listelenir; seçilen ad mesajda çip olur. Mesajda bir linktir: `[@Mert Kaya](scrawl:person/<id>)`, `@room` için `[@room](scrawl:room)`.
- Room'da listenin sonunda `@room` vardır: "Notify everyone in #dev". DM'de yoktur.
- Ajanlar listede yoktur, çünkü bot yok; ajan mesajı okuyunca bir şey yapmaz.

### 3.6 Tepki

- Üstüne gelince çıkan ilk düğmedir. Altı hızlı tepki vardır (👍 ❤️ 😂 🎉 👀 ✅), sonra aramalı tam liste.
- Mesajın altında çip olarak durur: emoji ve sayı. Üstüne gelince kimlerin bıraktığı görünür. Kendi tepkin vurguludur, tıklayınca kalkar.
- Tepki bildirim vermez.

### 3.7 Scrawl'la bağ

- Yazma kutusunun + menüsünde "Note, task or card…" vardır. Arama penceresi seçme kipiyle açılır; seçilen şey mesaja çip olarak girer: simgesi, adı, yeri. Masaüstünde kenar çubuğundaki bir satırı yazma kutusuna sürüklemek de çip ekler.
- Çipe tıklamak onu sekmede açar, telefonda sayfada. Space'in üyesi değilsen çip soluktur ve "No access" der. Şey bulunamazsa "Moved or deleted" der.
- Kart, görev ve kayıt çipte kimliğiyle durur, taşınınca da bulunur. Not, pano, görev listesi ve koleksiyon yoluyla durur; taşınırsa bulunamaz.
- Çip yalnız aynı sunucudaki space'lerin şeylerini gösterir.
- Mesajın ··· menüsünde To task ve To card vardır. Nottaki To task ve To card penceresi mesajın metniyle açılır; liste ya da pano herhangi bir space'ten seçilir. Görevin ya da kartın açıklamasının sonuna mesaja giden bir link girer: "From #dev · Mert Kaya, Oct 24". Linke tıklayınca Chat o mesajda açılır.

## 4. Ekler

- Yazma kutusunun + menüsü: Photos and files, Code block, Note, task or card. Telefonda Photo library, Camera, File. Masaüstünde dosya sürüklenir ya da yapıştırılır (ekran görüntüsü dahil).
- Gönderilmeden önce ekler yazma kutusunun üstünde küçük resim ya da satır olarak durur, × ile çıkar. Mesaj başına en çok 10 ek.
- **Resim:** mesajda küçük resim olarak durur. Dörde kadar ızgaradır, fazlası "+3". Tıklayınca ortada büyük açılır; oklarla aynı mesajın diğer resimlerine geçilir; Download.
- **Video:** ilk karesiyle durur, mesajın içinde oynatılır.
- **Dosya:** simge, ad, boyut ve tür; Open ve Download, telefonda Share.
- **Ses:** masaüstünde mikrofon düğmesi kaydı başlatır. Yazma kutusunun yerinde kayıt çubuğu açılır: kırmızı nokta, süre, dalga, Cancel ve Send. Telefonda basılı tutunca kaydeder, bırakınca gönderir. Sola kaydırınca vazgeçer, yukarı kaydırınca kayıt kilitlenir ve Send'e basılana kadar sürer. Kayıt en çok 15 dakikadır. Oynatıcıda oynat düğmesi, dalganın üstünde sürüklenen ilerleme, süre ve hız (1x, 1.5x, 2x) vardır. Kayıt nottaki kaydedicinin biçimindedir: `audio/webm;codecs=opus`, Safari'de `audio/mp4`.
- **Kod:** kod bloğudur, dili seçilir. 15 satırdan uzunsa katlıdır, altında "Show all 48 lines". Copy vardır.
- Yükleme sırasında ilerleme görünür, iptal edilir. Sınır sunucunun `SCRAWL_MAX_FILE_MB`'ıdır. Aşan dosya eklenmez: "Larger than this server takes (1 GB)."

## 5. Çevrimiçi, yazıyor, okundu

Ölçü: konuşmayı kolaylaştırsın, baskı kurmasın.

- **Çevrimiçi:** kişinin bir cihazında Scrawl açıksa ve kullanılıyorsa yüzünün köşesinde yeşil nokta durur. Kullanılıyor demek: pencere önde ya da son 5 dakikada dokunulmuş. Nokta DM listesinde, DM'nin başlığında ("Active") ve room'un kişilerinde görünür. "Last seen" yoktur; nokta yoksa bir şey yazmaz. Tepside gizli duran masaüstü uygulaması çevrimiçi saymaz. Ajanlarda nokta yoktur.
- **Yazıyor:** yazma kutusunun üstünde "Mert Kaya is typing…" yazar. İki kişi yazıyorsa "Mert and Elif are typing…", daha çoksa "Several people are typing…". DM'de ve room'da vardır. Hiçbir yere kaydedilmez; 5 saniye yazılmazsa kalkar.
- **Okundu:** yalnız iki kişilik DM'de vardır. Karşı tarafın okuduğu son mesajının altında soluk "Seen" yazar. WhatsApp'taki gibi her mesajda tik yoktur; tek satır vardır. Grup DM'de ve room'da yoktur. Kapatma ayarı yoktur. Okundu, sunucunun zaten tuttuğu "son okunan"dan gelir; ayrıca bir şey tutulmaz.

## 6. Bildirimler

### 6.1 Ne zaman

- DM'de her mesaj ve mention her zaman bildirim verir.
- Private room'da her mesaj bildirim verir.
- Public room'da yalnız mention bildirim verir; `general` da public'tir.
- `@room` room'daki herkese bildirim verir.
- Her konuşmada üç seçim vardır: All, Mentions, Off. Off'ta bildirim yoktur, okunmamışlar sayıya girmez, ad soluk durur.
- Kendi mesajın ve tepkiler bildirim vermez. Ajanın mesajı insanınki gibi bildirim verir.

### 6.2 Nereye

| Nerede | Nasıl |
|---|---|
| Masaüstü uygulaması | Uygulama tepsideyken de çalışır (`design/background.md`). Canlı kanaldan gelen mesajı Windows ya da macOS bildirimi olarak gösterir. Web Push kullanmaz. Uygulamadan Quit ile çıkılmışsa bildirim gelmez. |
| Telefon | Web Push. iOS 16.4'ten beri ana ekrana eklenmiş web uygulamasına gelir, uygulama kapalıyken de. Safari'de sekme olarak açık Scrawl'a gelmez; orada "Add Scrawl to your Home Screen to get notifications" yazar. Android'de Chrome'da gelir. |
| Tarayıcı | Web Push. Tarayıcı açıksa sekme kapalıyken de gelir. |

Bizim tarafımızda hiçbir şey çalışmaz. Sunucu kendi anahtarını üretir ve bildirimi doğrudan tarayıcının push servisine (Apple, Google, Mozilla) gönderir. İçerik şifreli gider; o servisler okuyamaz.

### 6.3 Aynı bildirim iki kez gelmesin

- Bir konuşma ekranda açıksa ve pencere öndeyse o konuşmanın bildirimi hiçbir cihaza gitmez.
- Kişi bir cihazda kullanıyorsa (5. bölümdeki anlamıyla) diğer cihazlarına gidecek bildirim 60 saniye bekler. Bu arada okursa gitmez.
- Bir cihazda okunan konuşmanın bildirimleri masaüstünden hemen kalkar. Telefonda Scrawl açılınca kalkar, çünkü iPhone sessiz bildirim almaz.
- Sayı her cihazda aynıdır.

### 6.4 İçerik ve tıklama

- Başlık: DM'de kişinin adı, room'da "Mert Kaya · #dev", grup DM'de "Mert Kaya · Mert, Elif".
- Gövde: mesajın ilk 140 karakteri, markdown işaretleri olmadan. Resimde "Photo", seste "Voice message · 0:14", dosyada "File: release-notes.pdf".
- Aynı konuşmadan gelenler tek bildirimde toplanır: sonuncusu görünür, altında "3 new messages".
- Bildirime tıklamak Chat'i o mesajda açar.

### 6.5 Sayı

- Sayı okunmamış ve bildirim veren mesajların sayısıdır. Kenar çubuğundaki Chat satırında, telefonda Chat sekmesinde ve uygulama simgesinde görünür.
- iPhone'da ana ekrandaki simgede rozet olarak, Windows'ta görev çubuğundaki simgede, macOS'ta Dock'ta.
- Listede room'un okunmamışı varsa adı kalındır. Sayı yalnız bildirim verenler içindir: DM'de her mesaj, Mentions'ta mention'lar, All'da her mesaj.

### 6.6 Ayarlar

- Konuşmanın başlığındaki zil: All, Mentions, Off, her birinin altında ne demek olduğu.
- **Settings › Notifications** yeni bir bölümdür, her istemcide vardır:
  - "Notifications on this device", açık ya da kapalı. Tarayıcı izin vermemişse yanında Turn on; izin tarayıcının penceresiyle istenir.
  - iPhone'da Scrawl ana ekranda değilse bunun açıklaması.
  - Send a test notification.
  - Varsayılanlar burada değişmez; seçim konuşma başınadır.
- Chat listesinin üstünde, bu cihazda bildirim kapalıysa: "Get notified of new messages." yanında Turn on ve ×. × ile bu cihazda bir daha çıkmaz.

### 6.7 Native iOS riski

Native iOS uygulaması gelince (Mobil aşaması) web push WKWebView içinde çalışmaz, APNs gerekir. APNs'in anahtarı uygulamayı yayınlayanındır; her ekibin kendi sunucusu onu tutamaz. Mattermost gibi ürünler bunu kendi röle sunucusuyla çözer; bizim sunucumuzda bir şey çalışmaması kararı (PLAN 5.5) bunu dışarıda bırakır. O aşamada karar gerekir; o zamana kadar PWA bildirimi yeter. PLAN 7. bölüme risk olarak girer.

## 7. Arama

- Chat listesinin üstündeki kutu bütün konuşmalarda arar. Sonuçlar konuşmanın yerinde açılır, en yeni üstte.
- Her sonuç: konuşma, yazan, gün ve mesaj; bulunan kelimeler işaretli.
- Sonuçların üstünde filtre çipleri: From, In, Has (Photos, Files, Voice, Code, Links), Date (Today, Last 7 days, Last 30 days).
- Sonuca tıklamak konuşmayı o mesajda açar, mesaj işaretlidir.
- Konuşmanın başlığındaki büyüteç aramayı In o konuşma seçili açar.
- Eşleşme bugünkü aramanın kuralıyla yapılır: kelimenin başından, büyük küçük harf ve aksan farkı gözetilmez, ı ve İ i sayılır. Eklerin adları da aranır.
- Ctrl+K penceresine Messages sekmesi gelir; mesajlar All'da da çıkar, satırda "Message" yazar.
- Telefonda Search sekmesinde Messages, Chat sayfasında arama kutusu vardır.

## 8. Ekranlar

Mockup: `design/mockups.html`, Mesajlaşma.

### 8.1 Masaüstü ve web

- Kenar çubuğunda Upcoming'in altında Chat satırı durur, sayısıyla. Sunucu space'i olmayan kişide yoktur.
- Chat tek sekmedir, Today gibi. Solda konuşmalar, sağda seçili konuşma. Son açılan konuşma bu cihazda hatırlanır.
- **Liste:**
  - En üstte arama kutusu.
  - Her sunucu space'i katlanır bir başlıktır. Üstüne gelince + çıkar: New room… ve Browse rooms….
  - Başlığın altında room'lar ada göre sıralıdır; private room'un yanında kilit vardır.
  - Sonra Direct gelir, + ile New message…. Son konuşulan üsttedir; yüz ve çevrimiçi noktasıyla.
  - Okunmamış konuşmanın adı kalındır, sayısı sağdadır. Off konuşma soluktur.
- **Konuşma:**
  - Başlıkta ad, konu, kişi sayısı, Search, zil ve Info.
  - Mesajlar arasında gün ayırıcıları (Today, Yesterday, Thursday, Oct 22) ve "New" çizgisi.
  - Aynı kişinin beş dakika içindeki mesajları başlıksız, alt alta durur.
  - Mesajın üstüne gelince sağda düğmeler: React, Reply, Forward, ···. ··· menüsünde Edit, Copy text, Copy link, To task, To card ve Delete.
  - Altta yazma kutusu: "Message #dev", +, Aa, @, emoji, mikrofon ve Send.
- **Info penceresi** ortada açılır. Bölümleri: About (ad, konu, açan ve ne zaman), People (private'ta Add people…), Media, Files, Voice, Links. Altta bildirim seçimi, Export…, Leave room ve Archive room.
- New room, Browse rooms, New message ve Forward ortada açılan pencerelerdir.
- 640 pikselden dar pencerede liste ve konuşma ayrı ayrı görünür, telefondaki gibi; konuşmanın başında geri oku vardır.

### 8.2 Telefon

- Tab bar'da beş sekme: Recent, Browse, Today, Search, Chat. Chat'te rozet. Sunucu space'i yoksa Chat sekmesi yoktur.
- Chat sayfası: büyük başlık, arama, bildirim şeridi, space'ler ve Direct. + düğmesi New message ve New room'u açar.
- Konuşma bir sayfadır. Başlığa dokununca Info sayfası açılır.
- Mesaja basılı tutunca mesaj öne çıkar; üstte tepkiler, altta işlemler. Sağa kaydırmak cevaplar.
- Ses kaydı: basılı tut, sola kaydır, yukarı kaydır (4).
- Forward bir sheet'tir.

## 9. Ajan

- Sunucunun `/mcp`'sine iki araç eklenir. Araç sayısı az kalır.
  - `messages`: konuşmaları okunmamışlarıyla verir. Bir konuşmanın mesajlarını `since` ve `limit` ile verir. `query`, `from`, `in`, `has` ve `since` ile arar. Eklerin adını, türünü ve boyutunu verir.
  - `send_message`: bir room'a ya da DM'e (kişinin adıyla) markdown bir mesaj yazar, `replyTo` ile cevaplar. Ek gönderemez.
- Ajan kişinin gördüğünü görür, DM'ler dahil. Ajanın okuması okundu sayılmaz.
- Ajanın mesajı kendi kimliğiyle görünür: kare yüz, "Claude Code (Laptop) · Kaan".
- Bilgisayardaki `scrawl-mcp`'de bu araçlar yoktur (1.3).
- Rehbere (`scrawl://guide`) bir bölüm girer: ne zaman yazılır (iş bitti, soru), ne zaman yazılmaz.

## 10. Dışa aktarma ve yedek

- Sunucunun yedeği sohbeti zaten kapsar (`scrawl.db` ve `blobs/`).
- Konuşmanın Info penceresinde Export…: konuşma markdown olarak, ekleriyle bir zip'tir. Her konuşmada vardır, DM'de de; herkes kendi konuşmalarını alır.
- Biçim: her ay bir dosya, `2026-10.md`. Gün başlıkları, her mesaj `**Mert Kaya** 10:12` satırı ve gövdesi. Cevap alıntıyla, forward "Forwarded from" satırıyla yazılır; ekler `_attachments/`'e linktir.
- `scrawl-server export <space>` zip'e `Chat/<room>/2026-10.md` ve `Chat/_attachments/` ekler, private room'lar dahil; bu, sunucu sahibinin komutudur. DM'ler girmez.

## 11. Teknik

### 11.1 Tablolar

Sunucunun SQLite'ına (`node:sqlite`) yeni bir göç (`db.ts`, `MIGRATIONS`):

```sql
chats (id TEXT PK,                  -- ch-xxxxxxxx
       kind TEXT,                   -- 'public' | 'private' | 'direct'
       space_id TEXT,               -- room'da; DM'de NULL
       name TEXT, topic TEXT,
       general INTEGER DEFAULT 0,   -- space'in general'ı
       created_by, created_at, archived_at,
       last_seq INTEGER,            -- son mesajın sırası
       rev INTEGER)                 -- değişiklik akışındaki yeri
       UNIQUE (space_id, name COLLATE NOCASE) room'larda

chat_members (chat_id, account_id, added_by, joined_at, left_at,
              read_seq INTEGER,     -- son okunan mesajın sırası
              notify TEXT,          -- 'all' | 'mentions' | 'off'; NULL türün varsayılanı
              hidden INTEGER,       -- DM listeden gizlendi
              rev INTEGER, PK (chat_id, account_id))

messages (id TEXT PK,               -- istemcinin ürettiği; aynı id ikinci kez gelirse aynı mesaj döner
          chat_id, seq INTEGER,     -- konuşmada 1, 2, 3…
          author_id, agent_id,      -- agent_identities'ten; insan yazdıysa NULL
          body TEXT,                -- markdown; mention ve çip birer link
          mentions_room INTEGER,    -- @room
          reply_to TEXT,
          forward_of TEXT, forward_from TEXT,  -- kaynak mesaj; o anki konuşma ve yazan adı (JSON)
          created_at, edited_at, deleted_at,
          rev INTEGER, UNIQUE (chat_id, seq))
          INDEX (chat_id, rev)

message_files (message_id, n, hash, name, type, size,
               width, height, duration, thumb,   -- thumb: küçük resmin hash'i
               PK (message_id, n))

mentions (message_id, account_id, PK (message_id, account_id))

reactions (message_id, account_id, emoji, at, PK (message_id, account_id, emoji))

push_subscriptions (endpoint TEXT PK, account_id, device_id,
                    p256dh, auth, created_at, failed_at)

messages_fts  FTS5, içeriksiz (content=''), rowid = messages.rowid,
              tokenize 'unicode61 remove_diacritics 2'
```

- `rev` sunucuda tek bir sayaçtır. Konuşmayı, üyeliği ya da mesajı değiştiren her yazma onu bir artırır ve satıra yazar: yeni mesaj, düzenleme, silme, tepki, okundu, ad. Dosyalardaki `seq`'in sohbetteki karşılığıdır.
- Silinen mesajın `body`'si boşalır, `message_files` ve `mentions` satırları ve arama satırı silinir. `blobs/`'taki içerik kullanılmayan içeriklerin temizliği gelene kadar durur (`design/server.md` 4.3).

### 11.2 API

`/api/v1` altında, bugünkü cihaz anahtarıyla:

| İstek | Ne yapar |
|---|---|
| `GET /chat` | konuşmalar: tür, ad, space, üyeler, son mesaj, `readSeq`, okunmamış ve bildirimli sayısı, `notify`; ayrıca `cursor` |
| `GET /chat/:id` | tek konuşma |
| `GET /spaces/:id/rooms` | Browse rooms: space'in public room'ları, kişinin içinde olduğu private'lar ve arşivlenenler |
| `GET /chat/changes?cursor=N` | o imleçten sonra değişen konuşmalar, üyelikler ve mesajlar (yeni, düzenlenen, silinen, tepkisi değişen); konuşma başına en çok 100 yeni mesaj, fazlası `more` |
| `GET /chat/:id/messages?before=&after=&around=&limit=` | mesajlar; `around` bir mesajın çevresi (arama, cevap, bildirim) |
| `POST /chat/rooms` `{ space, name, topic, kind, members }` | yeni room; ad varsa 409 |
| `POST /chat/direct` `{ people }` | o kişilerle DM: varsa o, yoksa yenisi |
| `PATCH /chat/:id` `{ name, topic, archived }` | açan ya da space'in Manager'ı |
| `POST /chat/:id/join` | public room'a katılmak |
| `POST /chat/:id/members` `{ accounts }`, `DELETE /chat/:id/members/:account` | private'a eklemek; Leave (kendin) |
| `PATCH /chat/:id/me` `{ notify, hidden }` | bildirim seçimi, Hide |
| `POST /chat/:id/read` `{ seq }` | okundu; geri gitmez |
| `POST /chat/:id/messages` `{ id, body, replyTo, files, forwardOf }` | gönder; `{ seq, rev, at }` |
| `PATCH /chat/messages/:id` `{ body }`, `DELETE /chat/messages/:id` | düzenle, sil |
| `PUT` / `DELETE /chat/messages/:id/reactions/:emoji` | tepki |
| `POST /chat/files` (gövde dosya) | `{ hash, size }` |
| `GET /chat/files/:hash` | içerik; yalnız o içeriği taşıyan bir mesajın konuşmasındaysan |
| `GET /chat/search?q=&from=&in=&has=&since=&until=&before=` | sonuçlar, sayfa sayfa |
| `GET /chat/:id/export` | zip (10) |
| `GET /push/key`, `POST /push/subscriptions`, `DELETE /push/subscriptions`, `POST /push/test` | push |

Hatalar: 403 konuşmanın üyesi değil, 404 yok, 409 ad alınmış, 410 room arşivli (yazarken), 413 sınırdan büyük, 422 sınır aşıldı (uzunluk, ek sayısı, kişi sayısı).

### 11.3 Canlı kanal

Bugünkü `/api/v1/live` kullanılır (`live.ts`). Sunucudan:

- `{ type: "message", chat, message }`: yeni mesajın kendisi; istemci bir istek daha atmadan gösterir.
- `{ type: "chat", cursor }`: başka bir değişiklik var; istemci `changes`'i çeker.
- `{ type: "typing", chat, account }`.
- `{ type: "presence", active: [...] }` bağlanınca, `{ type: "presence", account, active }` değişince; yalnız space paylaşılan kişiler için.

İstemciden:

- `{ type: "active", active, viewing }`: pencere öne gelince, arkaya gidince, konuşma değişince.
- `{ type: "typing", chat }`: yazarken en çok 3 saniyede bir.

Olaylar yalnız o konuşmanın üyelerine gider. Bağlantı koparsa istemci yeniden bağlanınca `changes`'i çeker.

### 11.4 Push

- Sunucuda `web-push` paketi (saf JS, yerel derleme yok). Şifreleme RFC 8291, sunucunun kimliği VAPID (RFC 8292).
- VAPID anahtarı ilk açılışta üretilir, `/data/vapid.json`'da durur, yedekte vardır.
- Gönderilen: `{ chat, message, title, body, badge, tag }`. TTL bir gün; DM ve mention için yüksek öncelik. Push servisi 404 ya da 410 dönerse abonelik silinir.
- Karar sunucudadır. Yeni bir mesajda yazan dışındaki her üye için, kural tutuyorsa (6.1):
  1. Bir cihazında o konuşma ekranda ve önde ise kimseye gitmez.
  2. Kişi bir cihazda kullanıyorsa 60 saniye bekler, yoksa hemen gider.
  3. Gitmeden önce `read_seq` mesaja ulaşmışsa gitmez.
  4. O an kullanılan cihaza push gitmez; ona canlı kanal yeter.
- Bekleyenler süreçte durur; sunucu yeniden başlarsa düşer. Kabul edilebilir: mesaj kaybolmaz, yalnız bildirimi gitmez.
- Service worker (`apps/web/sw/sw.js`): `push` bildirimi gösterir (`tag` konuşmanın kimliği, `renotify`) ve `navigator.setAppBadge(badge)` yapar. `notificationclick` uygulamayı açar ya da öne getirir, Chat'i o mesajda açar.
- Masaüstü: `tauri-plugin-notification`. Canlı kanaldan gelen mesaj, konuşma önde değilse bildirim olur. Tıklayınca pencere açılır, mesaj gösterilir. Sayı Windows'ta görev çubuğu simgesinin üstünde (`set_overlay_icon`), macOS'ta Dock'ta (`set_badge_count`).

### 11.5 İstemci

- `packages/core/src/chat/`: türler, API istemcisi (`ChatClient`), değişiklik akışını önbelleğe işleyen birim, mention ve çip linklerinin okunması ve yazılması, export'un markdown'ı.
- Önbellek: IndexedDB, sunucu ve hesap başına bir veritabanı: konuşmalar, mesajlar (konuşma ve `seq` dizini), kuyruk. Konuşma başına son 500 mesaj; daha eskisi kaydırınca sunucudan gelir. Masaüstü de aynı IndexedDB'yi kullanır (WebView).
- Ekler: Cache Storage'da hash ile. Küçük resimler hep, büyük dosyalar açılınca iner. Resim `fetch` ile anahtar başlığıyla alınır, blob URL'le gösterilir; `<img src>` başlık taşıyamaz.
- Kuyruk: mesaj gönderilmeden önce istemcinin ürettiği kimlikle yazılır. Bağlanınca sırayla gider; sunucu aynı kimliği ikinci kez yazmaz.
- Taslaklar: konuşma başına, bu cihazda (`localStorage`).
- Gönderilmeden önce küçük resim istemcide üretilir (en çok 640 piksel, WebP, Safari'de JPEG); videonun ilk karesi ve sesin süresi de istemcide ölçülür. Sunucu medya işlemez, yerel bağımlılık gelmez.

### 11.6 Arama

- `messages_fts` içeriksizdir. Satırı core'un `fold`'undan geçmiş metindir: büyük küçük harf, aksan, ı ve İ (`packages/core/src/search.ts`); markdown işaretleri atılmış gövde ve eklerin adları.
- Sorgu: her kelime `"kelime"*` ve VE ile. Sonuç üyelikle (`chat_members`) ve filtrelerle birleşir. En yeni üstte, sayfa başına 50.
- İşaretleme sunucuda değil, uygulamada yapılır; bugünkü aramanın eşleştiricisiyle.
- Bu bilgisayardaki Node 24.14'te `node:sqlite` FTS5'i taşıyor ve `remove_diacritics` çalışıyor: "musteri*" "Müşteri"yi buluyor.

### 11.7 Güvenlik

- Her istek konuşmanın üyeliğini denetler. Public room'u space'in üyesi katılmadan okur.
- Dosya yalnız o içeriği taşıyan, silinmemiş bir mesajın konuşmasındaki kişiye verilir.
- Markdown uygulamada bugünkü güvenli çiziciyle gösterilir, ham HTML yoktur. Dış link tarayıcıda açılır; `scrawl:` linkleri (mention, çip, mesaj) uygulamanın içinde açılır.
- Sınırlama: hesap başına 10 saniyede 30 mesaj; yazıyor olayı 3 saniyede bir.
- Space'ten çıkarılan kişinin canlı kanalı o space'in konuşmalarından olay almaz.

### 11.8 Sınırlar

Mesaj 40.000 karakter; mesaj başına 10 ek; ses kaydı 15 dakika; grup DM 9 kişi; forward 5 konuşma; room adı 40 karakter; dosya `SCRAWL_MAX_FILE_MB`.

## 12. Kodda

- **Sunucu:** `apps/server/src/chat.ts` (konuşmalar, mesajlar, okundu, değişiklik akışı), `chatsearch.ts`, `push.ts`, `live.ts` (yeni olaylar), `db.ts` (göç), `app.ts` (yollar), `export.ts` (Chat klasörü), `agent.ts` (iki araç; dosyalara dayanmadığı için `packages/agent`'ta değil, sunucuda).
- **Core:** `packages/core/src/chat/` (11.5).
- **Web:** `Chat.tsx` (sekme, liste, konuşma), `ChatMessage.tsx`, `ChatComposer.tsx`, `ChatInfo.tsx` (Info, New room, Browse rooms, New message, Forward), `PhoneChat.tsx`, `chat.ts` (önbellek ve canlı kanal), `notify.ts`; `Sidebar.tsx` (Chat satırı), `Settings.tsx` (Notifications), `Search.tsx` (Messages), `Phone.tsx` (beşinci sekme), `sw/sw.js`.
- **Masaüstü:** `apps/desktop/src-tauri`: bildirim eklentisi ve simgedeki sayı.
- **Metinler:** `packages/i18n`.

## 13. Testler

- **Sunucu:**
  - Üyelik: private room ve DM'in mesajı, dosyası, araması ve canlı olayı başka kimseye gitmez. Space'ten çıkan erişimini kaybeder.
  - Aynı kimlikle ikinci gönderim tek mesaj olur. `seq` sırası doğrudur.
  - `changes` ve `rev`: düzenleme, silme, tepki ve okundu akışa girer.
  - Silinen mesajın metni, ekleri ve arama satırı gider.
  - `general`: oluşur, herkes içindedir, çıkılmaz.
  - Grup DM: aynı kişilerle tek DM, 9 kişi sınırı.
  - Arşivli room'a yazılmaz.
  - Bildirim kararı: kurallar, ekranda olan konuşma, 60 saniye ve okunursa gitmemesi, ölü abonelik.
  - Arama: aksan, ı ve İ, kelime başı, filtreler, üyelik.
  - Export: biçim ve DM'lerin girmemesi.
  - Ajanın iki aracı.
- **Core:** değişiklik akışının önbelleğe işlenmesi, kuyruk, mention ve çip linkleri, export markdown'ı.
- **Elle (bitti ölçütü):** ekip bir hafta Slack yerine Scrawl'da konuşuyor: masaüstünde, web'de ve iPhone'da. Telefon kilitliyken DM bildirimi geliyor; masaüstünde okununca telefona gelmiyor. Bir ses kaydı iPhone'dan gidip Windows'ta çalınıyor. Geçen haftanın bir mesajı aranıp bulunuyor.

## 14. Dilimler

1. **Sunucu:** tablolar; room, `general`, DM ve grup DM; mesaj (gönder, düzenle, sil, cevap, forward, tepki); okundu; ekler; değişiklik akışı; canlı olaylar (mesaj, yazıyor, çevrimiçi); testler.
2. **Masaüstü ve web, konuşma:** Chat satırı ve sekmesi, liste, konuşma, yazma kutusu, cevap, mention, tepki, düzenleme ve silme, okunmamış ve New çizgisi, yazıyor, çevrimiçi ve Seen, önbellek ve kuyruk, taslak.
3. **Ekler ve bağ:** resim, video, dosya, ses kaydı ve oynatıcı, kod bloğu, Forward, Scrawl çipleri, To task ve To card.
4. **Room'lar:** New room, Browse rooms, New message (grup DM dahil), Info (People, Media, Files, Voice, Links), arşiv, Leave, Hide, Export.
5. **Telefon:** Chat sekmesi ve sayfaları, basılı tutma, kaydırarak cevap, basılı tutarak ses kaydı, Forward sheet'i.
6. **Bildirimler:** push ve service worker, masaüstü bildirimi, sayı ve rozet, zil, Settings › Notifications, iki kez gelmemesi.
7. **Arama:** FTS, Chat'te arama ve filtreler, Ctrl+K'da ve telefonda Messages.
8. **Ajan ve sunucunun export'u:** `messages`, `send_message`, rehber, `scrawl-server export`'ta Chat.

## 15. Kararlar (24 Ekim'de onaylandı)

1. Çevrimiçi, yazıyor ve okundu 5. bölümdeki gibi olsun: yeşil nokta, "Last seen" yok; yazıyor DM'de ve room'da; Seen yalnız iki kişilik DM'de, kapatma ayarı yok.
2. Her space'in kendiliğinden bir `general` room'u olsun; herkes içinde, çıkılmaz, arşivlenmez (2.1).
3. Room'u space'in her üyesi açsın. Adını, konusunu ve arşivi açan kişi ve space'in Manager'ları değiştirsin. Private room'a üyelerden biri eklesin (2.1).
4. Room adı yazıldığı gibi kalsın, en çok 40 karakter olsun (2.1).
5. Grup DM en çok 9 kişi olsun, sonradan kişi eklenmesin (2.2).
6. DM'den çıkılmasın, Hide ile gizlensin (2.2).
7. Silinen mesajın yerinde "This message was deleted." kalsın. Space Manager'ları room'larda başkasının mesajını silebilsin (3.2).
8. `@room` olsun, `@here` olmasın; ajanlar anılmasın (3.5).
9. Tepki: altı hızlı tepki ve aramalı tam liste; tepki bildirim vermesin (3.6).
10. Çip: kart, görev ve kayıt kimlikle, diğerleri yolla dursun. To task ve To card herhangi bir space'e gitsin (3.7).
11. Forward en çok 5 konuşmaya, yalnız aynı sunucuda olsun (3.4).
12. Sınırlar 11.8'deki gibi olsun.
13. Bildirim: başka cihazda kullanılırken 60 saniye beklesin; Off sayıya girmesin; varsayılanlar değiştirilmesin, seçim konuşma başına olsun (6).
14. Settings'te yeni Notifications bölümü ve "Send a test notification" olsun (6.6).
15. Mesajlar Ctrl+K'da hem Messages sekmesinde hem All'da çıksın (7).
16. Ajan ek gönderemesin; ajanın okuması okundu sayılmasın (9).
17. Export her konuşmada olsun. Sunucunun export'u private room'ları da alsın, DM'leri almasın (10).
18. Public room katılmadan okunabilsin (2.1).
19. Mesaj sabitleme ve kaydetme yok (1.4).

## 16. PLAN'da değişenler

24 Ekim'de, onayla birlikte:

- **3 Verilen kararlar:** "Mesajlaşma" satırı; Sync sağlayıcılarındaki aşama numaraları.
- **4. bölüm:** yeni "4.10 Mesajlaşma"; 4.1'de kenar çubuğunda Chat, 4.9'da tab bar'da Chat.
- **5.5:** sunucuda yaşayanlar arasında mesajlaşma; sohbetin "ayrı istemci yolu yok" kuralına istisna olduğu.
- **6 Aşamalar:** 19 Mesajlaşma. Dropbox, S3 ve GitHub 20, Google Drive 21, Mobil 22. Sonraya kalanlara bot ile sesli ve görüntülü arama.
- **7 Riskler:** native iOS'ta bildirim (6.7).
- **Roadmap:** faz 19, planın kartı ve dilim başına bir kart (ROA-243–250, 5. dilim ROA-252); bot ile sesli ve görüntülü arama Backlog'da "Sonra:" kartı (ROA-251).

## 17. Yazılırken: 1. dilim (Sunucu)

24 Ekim. Kodda: `apps/server/src/chat.ts` (konuşmalar, mesajlar, okundu, ekler, değişiklik akışı), `db.ts` (göç), `live.ts` (yazıyor ve çevrimiçi), `app.ts` (yollar), `server.ts`; testler `chat.test.ts` (23 test, sunucu 65). Push ve bildirim tabloları (`push_subscriptions`) 6. dilimle, arama tablosu (`messages_fts`) 7. dilimle gelir.

Kodda netleşenler:

- **Değişiklik akışı:** her yazma `meta` tablosundaki `chat_rev` sayacını bir artırır ve satıra yazar. `changes` her seferinde kişinin bütün konuşmalarını o anki haliyle verir (listede olmayan bırakılmıştır), mesajlardan yalnız imleçten sonra değişenleri, en çok 500'er. İmleçsiz istek yalnız konuşmaları verir; mesajlar sayfa sayfa gelir.
- **Görünmeyen konuşma yoktur:** private room ve DM'in dışındakine 404 döner, 403 değil; var olduğu da belli olmaz.
- **Public room'a katılmadan:** okunur; yazılmaz, tepki konmaz, bildirim seçimi yapılmaz (403), okunmamış sayılmaz.
- **Space'ten çıkarılan** o space'in room'larından da çıkar; davetle dönünce yalnız `general`'a döner, eski private room'larına değil. Sunucudan çıkarılan için de öyle.
- **DM'de biri sunucudan çıkınca:** iki kişilik DM okunur, yazılmaz (410 `gone`). Grup DM'de en az bir kişi kaldıkça yazılır.
- **Forward:** gövdeyi ve ekleri kaynak mesajdan sunucu alır; "Add a message" uygulamanın ayrıca gönderdiği bir mesajdır. Forward edilen mesaj düzenlenmez (409 `forwarded`).
- **Ajanın mesajı:** sahibi siler, düzenleyemez; düzenlemek mesajı yazanın işidir.
- **Ekler:** dosya önce `POST /chat/files` ile gider, sonra mesaja hash'iyle eklenir. Bir hash'i yalnız onu yükleyen ya da onu taşıyan bir mesajı gören ekler; böylece başka bir space'teki dosyanın hash'ini bilen onu sohbetten alamaz. Yükleyen, mesaja eklemeden önce de dosyasını alır. Mesaj silinince dosya artık verilmez.
- **`general`'ın adı:** space'te zaten `general` adında bir room varsa (sonradan açılmış, eskisinin adı değiştirilmiş) yenisi `general room` adını alır.
- **Çevrimiçi:** uygulama canlı kanaldan `{ type: "active", active, viewing }` der; kişinin bir cihazı kullanılıyorsa kişi çevrimiçidir. Haber, kişiyle bir space'i paylaşanlara gider; bağlanan cihaz o an çevrimiçi olanları alır. "Kullanılıyor" demeyi (pencere önde, son 5 dakikada dokunulmuş) uygulama yapar (2. dilim).
- **Yazıyor:** aynı kişi aynı konuşmada 2,5 saniyede en çok bir kez duyurulur; kaydedilmez.
- **Uygulamanın eski sürümleri** canlı kanalın yeni olaylarını tanımaz ve yok sayar; sync bugünkü gibi çalışır.


## 18. Yazılırken: 2. dilim (Masaüstü ve web, konuşma)

24 Ekim. Kodda: core'da `packages/core/src/sync/chat.ts` (`ChatClient`, mention linki, düz metin, aynı yüzün altında akan mesajlar, değişikliklerin önbelleğe işlenmesi; 6 test) ve canlı kanal istemcisinin olayları geçirmesi ve söylemesi (`ServerLive` `onEvent` ve `send`); editörde `message.ts` (mesajın HTML'i; 3 test); web'de `chatStore.ts` (sunucu başına konuşmalar ve mesajlar, önbellek, kuyruk, yazıyor, çevrimiçi, taslak), `Chat.tsx` (sekme, liste, konuşma, mesaj, yazma kutusu), `Sidebar.tsx` (Chat satırı), `App.tsx`, `items.ts`, `Icon.tsx`, stiller ve metinler. Sunucu konuşmada space'in adını da verir (`spaceName`). Tarayıcıda yerel sunucuda iki kişiyle denendi: mesaj, alıntılı cevap, mention, tepki, düzenleme, silme, New çizgisi, yazıyor, Active, Seen, taslak, sunucu kapalıyken yazılan mesajın sonradan gitmesi.

Kodda netleşenler:

- **Ayrı canlı bağlantı:** Chat sunucuya sync'inkinden ayrı bir canlı bağlantı açar; sync'in koduna dokunulmaz. Kullanılıyor bilgisini yalnız Chat'in bağlantısı söyler.
- **Önbellek:** IndexedDB'de sunucu başına bir kayıt: konuşmalar, konuşma başına son 500 mesaj, imleç ve gönderilmeyi bekleyenler; değişince bir saniye içinde yazılır.
- **Kuyruk:** mesaj yazıldığı anda konuşmada soluk ve "Sending" ile görünür. Sunucuya ulaşılamıyorsa canlı bağlantı geri gelince sırayla gider; sunucu reddederse "Not sent", yanında Retry ve Delete.
- **Okundu:** konuşma ekranda, pencere önde ve en alttayken okunmuş sayılır; konuşmaya tıklamak, bir tuşa basmak ya da pencereye dönmek de okutur.
- **New çizgisi** konuşma açıldığı andaki ilk okunmamışın üstünde durur, konuşma açık kaldıkça kalır.
- **Kullanılıyor:** pencere görünür, önde ve son 5 dakikada dokunulmuşsa. Uygulama bunu değişince ve 30 saniyede bir söyler.
- **Yazma kutusu:** Enter gönderir, kod bloğunda alt satıra geçer. Aa satırı: kalın, italik, üstü çizili, kod, liste, alıntı, kod bloğu. @ ve emoji düğmeleri. + (ekler) ve mikrofon 3. dilimde.
- **Emoji:** altı hızlı tepki; tam liste `emojibase-data` (MIT) ile, ilk açılışta yüklenir (ayrı parça, sıkıştırılmış 83 KB), adı ve etiketleriyle aranır. Yazma kutusundaki emoji düğmesi aynı listeyi açar.
- **Silmek sorar:** "Delete this message?" penceresi; mesaj herkes için silinir.
- **Alıntı:** cevaplanan mesaj ekrandaysa alıntı onun şimdiki halini gösterir, düzenlenmiş ya da silinmiş.
- **Bu dilimde mesajın menüsü:** Edit, Copy text, Delete. Copy link, To task, To card ve Forward 3. dilimle gelir. Başlıktaki arama 7., zil 6., Info 4. dilimle; listedeki arama kutusu 7., başlıkların +'sı 4. dilimle.
- **Dar Chat:** Chat'in kendi genişliği 600 pikselin altındaysa liste ve konuşma sırayla görünür. Pencere değil Chat ölçülür, çünkü kenar çubuğu açıkken 800 piksellik pencerede de konuşma sıkışıyordu.
- **Saat** cihazın dilinin biçiminde, başında sıfır olmadan: 3:30 PM, 15:30.
- **Telefonda** Chat bu dilimde yoktur (5. dilim).
- **Çevrimdışı açılış** (24 Ekim, sonradan): uygulama açılırken sunucuya ulaşamazsa Chat, cihazda o sunucudan tutulanla açılır (konuşmalar, son mesajlar, en büyük dosya ve bildirim bilgisi de tutulur); yazılan Sending olarak bekler. Canlı kanal sunucuya ulaşınca sunucunun durumu yeniden sorulur ve iş kaldığı yerden sürer; sunucunun artık mesajlaşması yoksa ya da hesap değiştiyse o sunucunun Chat'i kapanır. Cihazda hiçbir şey tutulmuyorsa Chat görünmez; sunucu dakikada bir ve cihaz yeniden internete bağlanınca denenir. Cihazdaki depo beş saniyede açılmazsa (tarayıcıda takılabiliyor) o seferlik hiçbir şey tutulmamış sayılır. Sunucu bağlantısı hiç yoksa Chat zaten yoktur.

## 19. Yazılırken: 3. dilim (Ekler ve bağ)

24 Ekim. Kodda: core'da çip ve mesaj linkleri (`itemLink`, `parseItemLink`, `itemChip`, `chatLink`, `parseChatLink`; 2 test); editörde `message.ts` çipleri, mesaj linkini ve kod kutusunu çizer, `highlightCodeBlocks` kodu renklendirir (4 test); web'de `ChatParts.tsx` (ekler, ışık kutusu, video, ses oynatıcısı, dosya satırı, yükleme tepsisi, kayıt çubuğu, Forward penceresi), `chatMedia.ts` (ölçme, küçük resim, kaydedici), `chatStore.ts` (yükleme, dosyaların cihazda tutulması, forward), `Chat.tsx`, `App.tsx` (çip seçici, çiplerin açılması, To task, To card, mesaj linki), `Search.tsx`, `Sidebar.tsx`, `Icon.tsx`, stiller ve metinler. Sunucu `GET /server`'da `maxFileMb`'ı da verir. Tarayıcıda yerel sunucuda iki kişiyle denendi: resim, metin dosyası, ses, video ve ses kaydı gönderme; ışık kutusu; oynatıcı ve hız; Forward; kod bloğu, renk ve Copy; üç çip türü, sürükleyerek çip; çipin açılması ve cihazda olmayan space; To task, To card, Copy link ve linkten mesaja dönüş; 10 dosya sınırı.

Kodda netleşenler:

- **Resimler:** tek resim kendi oranında, en çok 360 × 260; iki ve dört resim 150 piksellik kareler; üçte ilki iki sütun boyunca; dörtten fazlasında dördüncünün üstünde "+3". Dar konuşmada ızgara küçülür. Işık kutusu mesajın bütün resimlerini dolaşır: oklar, ok tuşları, Download, Esc.
- **Küçük resim:** 640 pikselden büyük resmin ve videonun ilk karesinin küçüğü ayrı bir dosya olarak yüklenir, mesajda onunla görünür; büyüğü tıklayınca iner. Video yarım saniyedeki karesiyle durur, tıklayınca yerinde oynar.
- **Ses oynatıcısı:** dalga çubukları kaydın sesinden değil, dosyanın özetinden çıkar: aynı kayıt her yerde aynı görünür, ama sesin gerçek dalgası değildir. Çubuklarda sürüklemek ve ok tuşları ileri geri götürür. Hız 1x, 1.5x, 2x.
- **Ses kaydı:** mikrofon düğmesi kaydı başlatır, kayıt çubuğu yazma kutusunun yerine geçer; Send klavyeyi alır, Esc vazgeçer. 15 dakikada durur, Send'i bekler. Dosyanın adı "Voice message 2026-10-24 16.26.webm". Mikrofon kullanılamazsa çubuk bunu söyler, Cancel ile kapanır.
- **Dosya satırı:** satıra tıklamak tarayıcıda PDF'i ve metni yeni sekmede açar; masaüstünde ve öbür türlerde kaydeder. Sağdaki düğme her zaman kaydeder.
- **Yükleme:** dosya eklenince hemen yüklenir, tepside ilerlemesiyle durur. Yüklenirken Send kapalıdır. Yüklenemeyen kırmızı kalır ve mesajla gitmez; × ile çıkar. Sunucunun sınırını aşan hiç eklenmez, "Larger than this server takes (1 GB)." der; 10'dan fazlası "A message takes 10 files at most." der.
- **Dosya bırakmak:** yazma kutusuna ve konuşmanın her yerine bırakılır, yapıştırılır; masaüstünde Explorer'dan kopyalanan dosya da notlardaki gibi gelir.
- **Kod bloğu:** + menüsündeki Code block ve Aa'daki düğme açar; dili, notlardaki gibi açılış satırına yazılır. Elle yazılan ``` editörün kuralıyla yazıldığı gibi kalır, kod bloğu açmaz. Copy önce kopyalama komutunu dener, olmazsa pano API'sini.
- **Forward:** üstüne gelince çıkan düğmelerde, Reply'dan sonra. Listede katılınan room'lar ve DM'ler, arşivli olmayan; herkesin gittiği DM yok. Yazılan not önce kendi mesajı olarak gider. Bitince "Forwarded" ya da "Forwarded to 2 conversations".
- **Copy link:** düz metin olarak mesajın adresi, Markdown olarak "From #dev · Mert Kaya, Oct 24" linki gider; nota ya da mesaja yapıştırınca link olur. "Link copied" der.
- **To task ve To card:** başlık mesajın ilk satırı (en çok 200 karakter), açıklama mesajın metni ve altında mesaja giden link. Pencere nottakidir, "Links back to #dev · Mert Kaya" der; görev için Inbox, kart için sıradaki ilk pano seçili gelir. Mesajın dosyaları göreve kopyalanmaz, link mesaja götürür. Görev satırındaki açıklama önizlemesi linkleri yalnız yazısıyla gösterir; bu, mesajdan gelen link için değil bütün linkler için geçerli (kullanıcı onayladı).
- **Çip eklemek:** + › Note, task or card… arama penceresini "Find a note, task or card to put in the message" ile açar; yalnız o sunucudaki space'lerin notları, listeleri, görevleri, panoları, kartları, koleksiyonları ve kayıtları çıkar. Kenar çubuğundan not, liste, pano ve koleksiyon sürüklenir; klasör ya da başka yerdeki şey "Only what is in this server’s spaces goes in its messages." der. Çipin yeri arama satırındaki yerin son iki parçasıdır: kartta pano ve sütun, görevde space ve liste.
- **Çipin durumu:** dört tane. Açılır; "Not on this device": space'in üyesisin ama space bu cihazda değil, tıklayınca "Acme is not on this device. Add it in Settings › Spaces to open this." der (tasarımda yoktu, yazılırken eklendi; yoksa üye olan kişi "No access" görüyordu); "No access"; "Moved or deleted". Soluk çip kesik çizgilidir.
- **Mesaj linki:** notta ve açıklamada, öbür linkler gibi Ctrl+tıklayınca açılır; Chat o konuşmada mesaja kayar ve onu bir an işaretler. Kişinin görmediği konuşmaysa "That message is not there for you." der. Telefonda Chat 5. dilimle gelir; o zamana kadar telefonda mesaj linki bir şey açmaz.

## 20. Yazılırken: 4. dilim (Room'lar)

24 Ekim. Kodda: sunucuda `chat.ts` (kimin yönettiği, Info'nun dosyaları ve linkleri, konuşmanın export'u), `export.ts` (zip'i bir akışa da yazmak), `app.ts` (`GET /chat/:id/shared`, `GET /chat/:id/export`); 4 test (sunucu 69). Core'da `ChatInfo.manage`, `ChatClient.shared` ve `export`. Web'de `ChatRooms.tsx` (New room, Browse rooms, New message, Info), `ChatFaces.tsx` (yüz, konuşmanın adı ve başındaki işaret; `Chat.tsx`'ten taşındı), `chatStore.ts` (room işleri), `Chat.tsx` (listenin başlıkları, katılmadan okunan room, Info ve Join), `ChatParts.tsx` (ışık kutusunda Show in chat), `Icon.tsx`, stiller ve metinler. Tarayıcıda yerel sunucuda iki kişiyle denendi: public ve private room açmak, kişi seçmek, Browse rooms, katılmadan okuyup Join, Info'nun bütün sekmeleri, konuyu değiştirmek, bildirim seçimi, Export'un zip'i, private room'dan ayrılmak ve Add people…, arşivlemek ve geri açmak, DM'i gizleyip New message ile geri açmak.

Kodda netleşenler:

- **Listenin başlıkları:** space başlığının + düğmesi New room… ve Browse rooms… menüsünü açar; Direct başlığınınki doğrudan New message'ı açar. Direct başlığı DM yokken de durur, yoksa ilk DM açılamazdı.
- **Kim yönetir:** konuşmada `manage` gelir: room'u açan ve space'in Manager'ları (sunucunun sahibi ve adminleri dahil). About'ta ad ve konu yalnız onlarda yazılabilir, öbürlerinde düz yazıdır; Archive room da yalnız onlarda görünür.
- **New room:** space (birden çoksa), ad (# ile, en çok 40 karakter), konu, Public ya da Private ve People. People ikisinde de vardır; public room'a eklenenler de içinde başlar. Ad alınmışsa alanın altında "Acme already has a room by this name." Açılan room hemen açılır.
- **Kişi seçici:** ada göre bulur, seçilen çip olur; Backspace sonuncuyu çıkarır. New message'da en çok 8 kişi (sen dahil 9).
- **Browse rooms:** space seçimi, arama, room'lar adıyla, kişi sayısı ve konusuyla; katılınanlarda "Joined", öbür public'lerde Join. Arşivliler altta Archived başlığında. Satıra tıklamak room'u açar.
- **Katılmadan okumak:** listede yalnız açıkken, italik durur. Yazma kutusunun yerinde "You are reading #design." ve Join. Okundu sayılmaz. Başka konuşma açılınca bırakılır.
- **New message:** tek kişiyle o kişinin DM'i, birden çok kişiyle grup DM; zaten varsa (gizli de olsa) o açılır. Altında: "Pick more than one for a group." ya da birden çok seçilince "No one is added to a group later; a private room takes more people."
- **Info:** başlıktaki ⓘ ve kişi sayısı açar; room'da About, People, Media, Files, Voice, Links; DM'de About yoktur. Dosyalar ve linkler sunucudan gelir (`GET /chat/:id/shared`): silinmemiş mesajlarınkiler, en yeni üstte, her birinden en çok 500. Media aylara göre ızgaradır; resim büyük açılır ve "Show in chat" ile mesajına gider, video mesajına gider. Files ve Voice satırlarında, Links'te kimin ve ne zaman paylaştığı yazar; ona tıklamak mesaja gider.
- **Bildirim seçimi:** Info'nun altında All, Mentions, Off (taslaktaki gibi). Zil düğmesi ve bildirimlerin kendisi 6. dilimde.
- **Export…:** zip, her ay bir `2026-10.md`: başta `# #general · October 2026` ve konu, gün başlıkları (`## Saturday, October 24, 2026`), her mesaj `**Mert** 13:05` satırı ve gövdesi; cevap alıntıyla, forward "Forwarded from" satırıyla, silinen "*This message was deleted.*" ile, düzenlenen "(edited)" ile. Mention `@Ad` olur; çip ve mesaj linki yalnız yazısıyla kalır. Ekler `_attachments/`'te, özetin ilk 8 harfi ve adıyla, linkli; resim `![]` ile. Günler ve saatler kişinin cihazının saat diliminde (`?tz=`). Zip, sunucuda dosyalar okundukça gönderilir, belleğe toplanmaz.
- **Leave room:** private room'da önce sorar ("Leave #founders?"), public'te sormaz; general'da ve DM'de yoktur. DM'de yerinde Hide vardır.
- **Archive room:** önce sorar. Arşivlenen room listeden kalkar ama arşivleyende açık kalır, okunur, yazılmaz. Arşivli room'un Info'sunda Unarchive room vardır (tasarımda yoktu; yanlışlıkla arşivleneni geri almak için eklendi), About'ta ne zaman arşivlendiği yazar.
- **Grup DM** yerelde üç kişi olmadığı için tarayıcıda denenmedi; sunucusu 1. dilimin testlerinde.

## 21. Yazılırken: 5. dilim (Telefon)

24 Ekim. Kodda: `PhoneChat.tsx` (liste, konuşma sayfası, Info sayfası ve bölümleri), `Phone.tsx` (beşinci sekme, sayfalar, + ve rozet), `Chat.tsx` (konuşmanın telefon kipi: üst çubuk, basılı tutma, sağa çekerek cevap, telefonun yazma kutusu, basılı tutarak ses kaydı), `ChatRooms.tsx` (Info'nun işleri `useChatInfo` ve `InfoBody` olarak bilgisayar penceresiyle telefon sayfasında ortak), `ChatParts.tsx` (kayıt çubuğu başlamış bir kaydı da alır), `App.tsx`, `phone.css` ve metinler. Tarayıcıda telefon boyutunda (Android kimliğiyle) iki kişiyle denendi: liste, konuşma, basılı tutup tepki, sağa çekip cevap, Send, + menüsü, basılı tutarak kayıt (bırakınca gider, sola çekince vazgeçer, yukarı çekince kilitlenir, kısa dokunuş uyarır), Info ve bölümleri, bölümden mesaja dönüş, FAB, Browse rooms ve Forward sheet'leri, mesajın içindeki mesaj linki, sekmedeki rozet.

Kodda netleşenler:

- **Sekme:** sunucu Chat veriyorsa beşinci sekme Chat'tir; rozeti bildirim veren okunmamışların sayısıdır (99'dan sonra 99+). Bilgisayarda açılmış Chat sekmesi telefonda Recent'te öğe olarak görünmez.
- **Liste:** önce her space'in room'ları ada göre, sonra Direct (en yeni üstte), arşivliler ve gizliler yok. Satırda son mesaj: "Kaan: …", kendininki "You: …", iki kişilik DM'de yalnız metin, taslak varsa "Draft: …" (vurgulu). Dosya için "Photo", "Video", "Voice message · 0:14" ya da dosyanın adı. Saat bugünse saat, bu hafta gün kısaltması, öncesi tarih. Bildirim veren okunmamış varsa sayı rozeti, Off'ta zil işareti.
- **+ (FAB):** listede New message, New room, Browse rooms (birden çok sunucuda her biri sunucusuyla). Tasarımda New message ve New room vardı; telefonda public room'a katılmanın başka yolu olmadığı için Browse rooms da eklendi. Pencereler telefonda sheet olarak açılır.
- **Konuşma sayfası:** altında tab bar yoktur; yazma kutusu oradadır. Üst çubukta geri, ortada ad ve kişi sayısı (DM'de Active), sağda ⓘ; ada dokunmak da Info'yu açar.
- **Basılı tutmak:** mesaj 450 ms sonra öne çıkar, cihaz titreşimi destekliyorsa kısa titrer. Üstte altı tepki ve + (tam liste), altta Reply, Forward, Copy text, Copy link, To task, To card, (kendininkinde) Edit ve Delete. Parmağı kaldırınca gelen dokunuş altındakini açmaz. Mesajlarda yazı seçilmez; kopyalamak Copy text'le.
- **Sağa çekmek:** 56 pikselden sonra bırakınca cevaplar; çekilirken solda cevap oku belirir. Yukarı aşağı kaydırma çekmeyi bırakır.
- **Yazma kutusu:** solda + (Photo library, Camera, File…), ortada yazı, sağda yazı ya da ek varken Send, yokken mikrofon. Return alt satıra geçer. Mention listesi bilgisayardaki gibi; Aa, @ ve emoji düğmeleri yoktur (klavyede var). Not, görev ve kart çipi telefonda eklenmez (+ menüsü tasarımdaki gibi).
- **Basılı tutarak ses kaydı:** kırmızı nokta, süre, "Slide to cancel" ve parmağın altında büyük mikrofon; üstte kilit. 110 piksel sola çekmek vazgeçer, 80 piksel yukarı çekmek kilitler ve bilgisayardaki kayıt çubuğu (Cancel, Send) açılır; bırakınca gider. 0,6 saniyeden kısa dokunuş göndermez, "Hold to record a voice message" der.
- **Info sayfası:** taslaktaki gibi; room'da About satırı da var (ad ve konu, açan ve yöneticiler değiştirir). People, About, Media (See all), Files, Voice ve Links birer sayfa açar; bölümlerde kimin ne zaman paylaştığına dokunmak konuşmaya, o mesaja döner. Leave room kırmızı ve en altta.
- **Mesaj linki:** bir notta ya da açıklamada Chat sekmesini o konuşmada, mesajda açar; bir mesajın içindeki mesaj linki yeni konuşmayı öncekinin üstüne açar.
- **Denenmeyen:** öykünmede Return tuşu Android kimliği yüzünden editöre ulaşmadı (CodeMirror Enter'ı orada klavyenin kendi girişinden alır); gerçek telefonda denenecek. Gerçek mikrofon, kamera ve dokunmatik hareketler iPhone'da denenecek.

## 22. Yazılırken: 6. dilim (Bildirimler)

24 Ekim. Kodda: sunucuda `push.ts` (VAPID anahtarı, abonelik, karar, gönderme), `chat.ts` (kime gider `alertsFor`, ne der `pushContent`), `live.ts` (`isDeviceActive`), `db.ts` (`push_subscriptions`), `app.ts` (`/push/key`, `/push/subscriptions`, `/push/test`), `web-push` paketi; webde `public/push-sw.js`, `notify.ts`, `Settings.tsx` (Notifications), `ChatParts.tsx` (zil ve şerit), `chatStore.ts`, `App.tsx`; masaüstünde `alerts.rs` (bildirimi gösterip kaldıran komutlar), `windows` paketi ve simgedeki sayının izinleri. 4 sunucu testi (73).

Tarayıcıda denendi: zil (All, Mentions, Off; ok tuşları, Escape), Settings › Notifications (tarayıcı engellemiş, izin sorulmamış, iPhone'da Safari sekmesi; telefon sayfası da), şerit (masaüstü listesi, telefon, iPhone metni, ×), Turn on'un başarısız olduğu yol, uygulamanın istemcisiyle sunucunun push uçları (anahtar, abonelik, test, silme), bildirime tıklamak (açık uygulamaya gelen mesaj ve kapalıyken açılan `?chat=` adresi), masaüstünün kararını veren kanca (yeni mesajda bir kez, sayılar geldikten sonra; tepkide hiç).

Kodda netleşenler:

- **Her sunucuya bir service worker:** tarayıcı bir service worker kaydına tek push aboneliği verir, abonelik de tek sunucunun anahtarına bağlıdır. Birden çok sunucuda (2.3) her biri bildirim gönderebilsin diye her sunucunun `/push/<sunucu>/` altında kendi küçük worker'ı (`push-sw.js`) var; uygulamanın kendi worker'ı (`sw.js`) push'a karışmaz. Bu worker geliştirmede de çalışır.
- **Gönderilen:** 11.4'tekilere `server` ve `count` eklendi. `count` o konuşmada okunmamış ve bildirim verenlerin sayısıdır; bildirimin altındaki "3 new messages" ondan yazılır (6.4). Sunucunun yazdıkları (Photo, Voice message…) ve worker'ın "new messages"ı İngilizce; uygulama başka dil alınca bunlar da çevrilecek.
- **Masaüstünün kararı uygulamada:** canlı kanaldan gelen yeni mesaj (konuşmanın son sırasından sonraki; düzenleme ve tepki değil) sayılar geldikten sonra bakılır: kişinin o konuşmada bildirim veren okunmamışı varsa, mesaj okunmamışsa, konuşma ekranda ve pencere önde değilse bildirim olur. Kişi başka cihazında kullanıyorsa 60 saniye bekler; bu arada okunursa gösterilmez (6.3). Başka cihazın ekranında açık konuşmayı masaüstü bilmez; orada okununca masaüstündeki bildirim kalkar.
- **Windows'ta bildirim kendimizin:** Tauri'nin bildirim eklentisi Windows'ta bildirime etiket koyamıyor ve gösterileni kaldıramıyor. Konuşma başına tek bildirim (6.4) ve okununca kalkması (6.3) için Windows'ta bildirimi `windows` paketinin toast API'siyle kendimiz gösteriyoruz: etiketi konuşma, grubu sunucu; aynı konuşmanın yenisi eskisinin yerine geçer, okununca kalkar. macOS ve Linux'ta eklenti kullanılır; orada bildirimler toplanmaz ve okununca kalkmaz. Kurulmamış (geliştirilen) uygulamada Windows bildirimi eklentinin yaptığı gibi PowerShell'in adıyla gösterir, kurulu uygulamada Scrawl'ın adıyla.
- **Sayı simgede:** Windows'ta görev çubuğundaki simgenin üstünde kırmızı daire içinde sayı (99'dan sonra 99+), macOS'ta Dock'ta. Web'de ve ana ekrana eklenmiş uygulamada `setAppBadge`: push gelince worker, uygulama açıkken uygulama yazar.
- **Okunanlar kalkar:** masaüstünde (Windows) okunduğu anda; telefonda ve tarayıcıda Scrawl açık ve görünürken okunmuş konuşmaların bildirimleri kapanır.
- **Settings › Notifications:** Chat'i olan bir sunucuya bağlıyken görünür; bildirim yalnız oradan gelir. Masaüstünde "On this computer" altında Show notifications (varsayılan açık; Windows izin istemez). Web'de ve telefonda "Notifications on this device" (varsayılan kapalı; açınca tarayıcı kendi penceresiyle sorar). Tasarımdaki "yanında Turn on" ayrı düğme olmadı: kutuyu işaretlemek Turn on'dur. Tarayıcı engellemişse kutu kapalı ve altında nasıl açılacağı yazar; iPhone'da Safari sekmesindeyse Home Screen'e ekleme anlatılır. Send a test notification bildirim açıkken çalışır, sonucu yanında yazar: masaüstünde uygulama gösterir, web'de sunucu push'la gönderir. Telefonda zil yok, "In each conversation" notu Info sayfasındaki Notifications satırını söyler.
- **Zil:** konuşmanın başlığında, ⓘ'nin solunda, katılınmış konuşmalarda. "Notify me about" altında All messages, Mentions, Off ve ne demek oldukları: room'da "Every new message in #dev.", "When someone writes @Kaan or @room.", "Nothing, and #dev is shown faint."; DM'de "Every new message here." ve "When someone writes @Kaan.". Seçili olan işaretli; ok tuşları ve Escape çalışır; Off'ta zilin üstü çizili.
- **Şerit:** bu cihazda bildirim kapalıysa Chat listesinin üstünde "Get notified of new messages." ile Turn on ve ×; × bu cihazda bir daha göstermez. Turn on başarısız olursa şerit bunu söyler. Tarayıcı engellemişse şerit çıkmaz, çünkü Turn on işe yaramaz; Settings anlatır. iPhone'da Safari sekmesinde "Add Scrawl to your Home Screen to get notifications" ve × (Turn on yok).
- **Bildirime tıklamak:** açık Scrawl öne gelir, Chat o mesajda açılır; kapalıysa `/?chat=<link>` adresiyle açılır ve adres hemen temizlenir. Bir mesajda açılan konuşma, açılışta yeni mesajlar gelince sona atlıyordu; artık mesajda kalır.
- **Denenmeyen:** Claude'un tarayıcısı bildirim iznini kendiliğinden reddediyor. Gerçek push (abonelik, bildirimin gelmesi, konuşma başına toplanması, tıklama, simgedeki sayı) Chrome'da, Android'de ve iPhone'da (Home Screen) denenecek. Masaüstü bildirimi (Windows bildirimi, tıklama, okununca kalkma, görev çubuğundaki sayı) masaüstü uygulamasında denenecek; Rust derleniyor ve clippy temiz, ama uygulama çalıştırılmadı. Action Center'a düşmüş bildirime tıklamanın Chat'i açıp açmadığı da orada görülecek.

## 23. Yazılırken: 7. dilim (Arama)

24 Ekim. Kodda: sunucuda `chat.ts` (`search`, `index`, `indexMessages`), `db.ts` (`messages_fts`), `app.ts` (`GET /chat/search`), `server.ts`; core'da `ChatClient.search` ve `markedText`; webde `messageSearch.ts` (sunucularda arayan kanca, sonucun satırı), `ChatSearch.tsx` (sonuçlar, filtre çipleri, telefonun arama sayfası), `Chat.tsx` (listenin kutusu, başlıktaki büyüteç), `Search.tsx` (Messages sekmesi), `Phone.tsx`, `PhoneChat.tsx`, `App.tsx`. 5 sunucu testi (78), 1 core testi (561).

Tarayıcıda denendi: listenin kutusuyla arama, sonuç sayısı, From, In, Has (Photos, Files, Voice, Code, Links), Date, ok tuşları ve Enter, Escape, ×, sonuçtan konuşmayı mesajda açmak, başlıktaki büyüteç, dar pencere; Ctrl+K'da All ve Messages, mesajı açmak; telefonda Chat sayfasının kutusu, arama sayfası ve filtreleri, sonuçtan konuşma, Search sekmesinde Messages. Eski mesajların bir kez dizine girmesi.

Kodda netleşenler:

- **Dizin:** `messages_fts` FTS5, içeriksiz ve `contentless_delete = 1`: düzenlenen mesajın eski kelimeleri ve silinen mesajın satırı ancak böyle silinir (11.6'da yalnız `content=''` vardı). Satırda gövdenin markdown'sız hali ve dosya adları, core'un `fold`'undan geçmiş olarak. Arama gelmeden yazılmış mesajlar sunucu ilk açıldığında bir kez dizine girer.
- **Neye göre arar:** her kelime kelimenin başından, hepsi birden (`"kelime"*` VE). Yalnız işaretten oluşan kelime (`#`, `-`) aranmaz; `#dev` "dev" diye aranır. Mention'da kişinin adı, çipte ve linkte yazısı aranır; linkin adresi aranmaz, düz yazılmış adres aranır.
- **Ne zaman arar:** bir kelime yazılınca ya da From veya Has seçilince. Yalnız In ya da Date seçiliyken aramaz, ne yazılacağını söyler ("Type the words of a message in #dev.").
- **Nerede arar:** kişinin içinde olduğu konuşmalar: room'lar, DM'ler, arşivlenmiş room'lar ve gizlenmiş DM'ler. In, kişinin katılmadan gördüğü bir public room'u da gösterebilir (başlıktaki büyüteçten). Arşivli room'daki ya da gizli DM'deki sonuç açılınca konuşma, Browse rooms'tan açılan room gibi okunur.
- **Filtreler:** From konuşmalardaki kişiler; In konuşmalar (önce room'lar, sonra DM'ler; birden çok space varsa room'un yanında space'in adı, birden çok sunucuda sunucunun adı); Has tek seçim: Photos fotoğraf ve videodur, Files öbür dosyalar, Voice ses kaydı, Code kod bloğu ya da kod işaretli kelime, Links http(s) adresi; Date: Today (bugünün başından), Last 7 days, Last 30 days. Seçilen çip vurgulanır; menünün ilk satırı (Anyone, Anywhere, Anything, Any time) filtreyi kaldırır.
- **Sonuçlar:** en yeni üstte, sayfa başına 30; aşağı kaydırınca sıradaki sayfa gelir, daha varsa sayı "30+ results" der. Birden çok sunucu varsa her birinin sayfası gelir ve zamana göre birleşir.
- **Bilgisayarda:** listenin üstündeki kutuya yazınca sonuçlar konuşmanın yerinde açılır; ok tuşları satır seçer, Enter açar. Escape önce sonuçları kapatır, sonra yazılanı siler; × ikisini birden yapar. Sonuçtan açılan mesaj işaretlenir ve kelimeler kutuda kalır; kutuya dönünce sonuçlar yeniden açılır. Başlıktaki büyüteç zilin solundadır; aramayı In o konuşma seçili açar, kutuda "Search #dev" yazar. Liste sığmayan dar pencerede kutu sonuçların üstüne geçer, geri oku listeye döner.
- **Ctrl+K:** Messages en sondaki sekmedir; All'da diğer sonuçların altında en çok beş mesaj ve "More in Messages" vardır. Satırda üstte space ve room (DM'de Direct ve kişi), yazan, zaman, "Message" ve kelimeleri işaretli metin. Mesaja çip seçilen pencerede Messages yoktur.
- **Telefonda:** Chat sayfasının üstünde "Search messages" kutusu, dokununca kendi sayfası açılır: kutu, yana kayan filtre çipleri (menüleri sheet), sonuçlar. Sonuca dokunmak konuşmayı arama sayfasının üstünde açar, geri aramaya döner. Search sekmesindeki Messages Ctrl+K'daki gibidir; oradan açılan konuşma Chat sekmesinde açılır.
- **Denenmeyen:** çok sayıda mesajda hız; birden çok sunucuda sonuçların birlikte sıralanması (yerel ortamda tek sunucu var).

## 24. Yazılırken: 8. dilim (Ajan ve sunucunun export'u)

24 Ekim. Kodda: ajan paketinde `chat.ts` (`messages`, `send_message`, `@Ad`ı mention'a çeviren `withMentions`), `server.ts` (araçlar yalnız kapı sohbet verince), `guide.ts` (araç tablosunda iki satır ve Messages bölümü), `space.ts` (`Agent.chat`); sunucuda `agent.ts` (kapının sohbeti), `chat.ts` (`recent`, mesajda `agentName`, ajan yazınca okundu yerinin ilerlememesi, döküm `transcriptOf` olarak ayrıldı), `export.ts` (Chat klasörü); core'da `ChatMessage.agentName`; webde `Chat.tsx` ve `ChatFaces.tsx` (ajanın mesajı). 2 sunucu testi (80), 2 ajan testi (92).

Denendi: ajan /mcp üzerinden konuşmaları okunmamışlarıyla listeledi, bir room'un son mesajlarını kişinin saatiyle okudu, kelimeyle ve yazanla buldu, cevap yazdı (alıntılı, mention'lı), kişinin adıyla DM açıp yazdı; okumak hiçbir şeyi okundu yapmadı. `scrawl-server export` room'ları Chat klasörüne yazdı, private ve arşivli room'lar dahil, DM'ler hariç. Webde ajanın mesajı kare yüzle ve "Claude Code (Laptop) · Kaan Arslan" adıyla göründü.

Kodda netleşenler:

- **Araçlar yalnız sunucuda:** `messages` ve `send_message` sunucunun `/mcp`'sinde vardır (sunucuda 17 araç); bilgisayardaki `scrawl-mcp`'de yoktur (15). Rehberin araç tablosunda iki satır "On a Scrawl server" diye başlar.
- **`messages`:** hiçbir şey verilmezse konuşmalar: ad (`#dev`, private room'un adı, DM'de kişiler), tür, space, kişiler (room'da değil), okunmamış sayısı, son mesajın zamanı; arşivliler yok, en yeni üstte. `in` ile konuşmanın son mesajları (`limit`, varsayılan 30, en çok 100) ya da `since` gününden başlayanlar, eskiden yeniye; daha fazlası varsa `more` ne yapılacağını söyler. `query`, `from` ya da `has` ile arama, en yeni üstte, her sonuçta konuşmanın adı. Mesajda id, zaman (kişinin saat diliminde, `2026-10-24 14:05`), yazan (ajansa "Claude Code (Laptop) · Kaan"), Markdown metin, cevapladığı mesaj, forward'un nereden geldiği, eklerin adı, türü ve boyutu, tepkiler ("👍 2"), düzenlendi ve silindi.
- **Konuşmayı adlandırmak:** id, room'un adı (`#dev` ya da `dev`), DM'in listedeki adı ya da iki kişilik DM'de kişinin tam adı veya ilk adı. Aynı ad birden çok space'te varsa (`general`) araç yazmaz, adayları space'leriyle verir; `space` ile seçilir. Ajan katılmadığı public room'u okumaz; arşivli room'u `in` ile okuyamaz (listede yok).
- **`send_message`:** `to` bir room ya da bir kişi; kişiyle DM yoksa açılır. `@Ad Soyad`, tek kişide geçen ilk ad ve room'da `@room` mention'a çevrilir; yazılmış mention'a, adrese ve kelimenin içindeki ada dokunulmaz. Arşivli room'a yazılmaz. Mesaj ajanın kimliğiyle gider ve ajan o space'in kişilerine yazılır (diğer araçlar gibi).
- **Ajan yazınca okundu ilerlemez:** kişi kendi yazdığında konuşma o mesaja kadar okunmuş sayılır; ajanı yazınca sayılmaz. Kişinin okumadıkları okunmamış kalır; ajanın mesajı kişinin kendi mesajı olduğu için okunmamışa girmez, kişiye bildirim de gitmez.
- **Ajanın mesajı uygulamada:** sunucu mesajla birlikte ajanın adını da gönderir (`agentName`). Yüz kare ve vurgu renginde, ajanın baş harfi; adın yanında soluk " · Kaan Arslan". Aynı kişinin elle yazdığı mesajla ajanın mesajı birbirinin altına toplanmaz.
- **Sunucunun export'u:** `Chat/<room>/2026-10.md`, room'un mesajı yoksa dosyası da yok; ekler bir kez `Chat/_attachments/`'te, aylık dosyadan `../_attachments/` ile. Günler ve saatler sunucu sahibinin saat diliminde (uygulamanın bildirdiği), yoksa UTC. Konuşmanın Export…'u ile sunucunun export'u aynı dökümü kullanır.
- **Denenmeyen:** gerçek bir ajanla (Claude, ChatGPT) canlı sunucuda deneme; space'te "Chat" adlı bir klasör varsa export'ta aynı klasöre karışır.

## 25. Boş hâller ve telefonun yazma kutusu (24 Ekim, sonradan)

Kullanıcı iPhone'da denedi: ekran klavyeyle bozuluyordu, boş hâller (her space'te boş bir #general, hiç DM yok) ne taslağa ne kullanışlı bir sohbete benziyordu; masaüstü de boşken aynıydı. Taslak yalnız dolu hâli çizmişti. Yeni görünümler `design/mockups.html` Mesajlaşma bölümünde: **Boş**, **Boş DM**, **Telefon boş**, **Telefon yazarken**; aynı gün onaylandı. Kodda: `ChatStart.tsx` (konuşmanın başı, yazılabilecek kişiler), `Chat.tsx` (liste, yazma kutusu, katlanan mesaj), `PhoneChat.tsx`, `Phone.tsx`, `App.tsx` (Invite people), `ChatFaces.tsx`, `Sidebar.tsx`, stiller ve metinler.

- **iPhone'da büyüme:** telefonda yazma kutusunun editörü 13 piksellik yazıyla çiziliyordu; iOS 16 pikselden küçük bir alana odaklanınca sayfayı büyütüyor, ekran iki yandan kesiliyor, + ve mikrofon kayboluyordu. Yazma kutusu ve telefonda mesaj düzenleme kutusu 16 pikseldir.
- **Konuşmanın başı:** ilk mesajın üstünde, Slack'in kanal girişi gibi: room'un işareti (# ya da kilit) ya da kişinin büyük yüzü, adı, varsa konusu, ne olduğu ("This is the start of #general. Everyone in Klinitra is in this room, and everyone who joins Klinitra later."; public room'da herkesin bulup katılabildiği, private room'da yalnız içindekilerin gördüğü; DM'de yalnız ikinizin gördüğü), ne zaman açıldığı ya da DM'de kişinin sizinle hangi space'lerde olduğu. Altında ilk işler: general'da **Invite people to Klinitra** (telefonda Invite people), private room'da **Add people**, konusu yoksa **Add a topic**; Invite ve Add a topic yalnız room'u değiştirebilenlere (`manage`) görünür, Add people içindekilere. Invite people Settings › Spaces'i o space'in sayfasında açar (space bu cihazda değilse Spaces'te); Add a topic ve Add people Info'yu açar (bilgisayarda About ve People'da). Telefonda iş kartları yan yana, ikonu üstte.
- **Liste, Slack'teki gibi** (kullanıcı Slack'in masaüstü ve telefon ekranlarını gösterdi; taslaktaki liste görünümlerinin yerine geçer): her space bir bölüm, Direct messages hep bir bölüm; bölümlerin arasında ince bir çizgi; başlıkta ▾ (telefonda sağda ok) ile bölüm katlanır, katlıyken yalnız açık konuşma ve okunmamışlar görünür, katlananlar cihazda hatırlanır. Bilgisayarda listede ekleme satırı yoktur, ekleme başlığın +'sıyla (space'te New room… ve Browse rooms…, Direct messages'ta New message…); başlıklar normal harfle. Telefonda satır tek satırdır: işareti (#, kilit ya da yüz) ve adı, okunmamışken kalın ve parlak, sayısı, taslakta kalem; son mesajın önizlemesi ve saati yoktur. Telefonda bir space'in sonunda **+ Add room** (o space seçili New room), Direct messages'ın sonunda **+ Start a new message**, kimseyle space paylaşılmıyorsa **+ Invite people**. DM'lerin altında henüz yazılmamış kişiler, en çok beş, yalnız yüz ve adla; dokununca DM açılır.
- **Telefonda oda açmak ve yeni mesaj, Slack'teki gibi** (kullanıcı Slack'in Add channel, Create a Channel ve New Message ekranlarını gösterdi): bunlar ekranın boyu kadar sheet'lerdir, başlıkta Cancel, ad ve sağda iş (uygulamanın telefondaki sheet'leri gibi). **+ Add room** bir menü açar: **Create room** ve **Browse rooms** (o space'te). **Create a room** üç adımdır: (1) Name: büyük "# ad" satırı ve altında room'un ne olduğunu söyleyen kutu, + bir space'in altında değilse (Chat'in + düğmesi) space'ler üstte seçilir; Next. (2) Visibility: Public ya da Private, açıklamalarıyla; Create room'u açar; ad alınmışsa ya da geçersizse ilk adıma döner ve hata adın altında yazar. (3) Add people: space'in kişileri, arama alanı ve seçilen her biri için üstte bir çip; Add ya da Skip; room artık açık olduğundan kapatmak da room'u açar. Space'te başka kimse yoksa üçüncü adım yoktur. Konu sorulmaz, room'un girişindeki Add a topic'le eklenir. **Browse rooms**: birden çok space varsa üstte space'ler hap olarak, "Find a room" araması, room'lar adı, kişi sayısı ve konusuyla, katılınmışsa "Joined", altta Archived; dokunulan room açılır (katılmadan okunur, Join oradadır). **New message**: "To:" satırında seçilenler çip olarak ve "Find a room or person" alanı, boşken Backspace son çipi çıkarır, çipe dokununca çıkar; listede kişinin içinde olduğu room'lar ve space paylaştığı kişiler, en son yazışılan üstte, her satırda seçme dairesi; birden çok space varsa room'un altında space'i (iki general karışmasın). Room tek başına seçilir; kişi seçilince room'lar listeden kalkar, en çok sekiz kişi (dokuz kişilik grup). Altta konuşmadaki yazma kutusu: "Write a message", seçilince "Message Mert Kaya" ya da "Message #general"; Send konuşmayı açar (DM yoksa oluşturur, varsa onu kullanır) ve mesajı oraya gönderir; room'a ya da var olan DM'e giden mesaj sunucu yokken de kuyruğa girer. Yazılan, gönderilene kadar cihazda ayrı bir taslak olarak kalır.
- **Telefonda yazma kutusu, Slack'teki gibi:** kullanılmıyorken bir hap: solda + (yuvarlak), ortada "Message #general", sağda mikrofon. Kullanılırken (odakta, içinde yazı, ek ya da cevap varken) kart: yazı üstte; altta +, Aa, emoji, @ ve sağda Send. Aa biçim satırını kutunun üstünde açar, emoji tam listeyi kutunun üstünde tam genişlikte açar, @ mention listesini açar. Kutu en çok altı satır büyür, sonra içinde kayar (eskiden ekranın %30'u). Telefonda konuşma açılınca klavye kendiliğinden açılmaz. Ses kaydı hâlâ mikrofonu basılı tutarak, haptayken.
- **Uzun mesaj:** telefonda on iki satırı geçen mesaj katlanır, altında Show more; açılınca Show less. Gönderilmeyi bekleyen mesaj da katlanır. Bilgisayarda katlanmaz.
- **Kenar çubuğu:** Upcoming'in altında bir ayırıcı çizgi var; Chat ve altındakiler ondan sonra.
- **Denenmeyen:** gerçek iPhone'da klavye, odak ve büyümenin gittiği; denemede tarayıcı odağı bildirmediği için kart hâli yazı varken görüldü. Yalnız olunan bir sunucuda Invite people satırı bu ortamda görülmedi (denemede herkesin bir arkadaşı var).
