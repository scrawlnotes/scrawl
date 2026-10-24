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
