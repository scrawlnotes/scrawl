# Bildirimler

Durum: 8 Kasım 2026'da onaylandı; PLAN'da 4.12 ve 22. aşama, Roadmap fazı 22 (ROA-364–370). Mockup: `design/mockups.html` › Bildirimler. Aynı gün: Today'e konan For you bölümü ve görevlere yorum kullanıcının isteğiyle çıkarıldı; kaçırılan bildirim için liste yok.

Neden: Eren kart yorumunda birini anamadığını, atanınca da haber gelmediğini yazdı. Bugün yalnız Chat bildirim veriyor. Kartta ve görevde biri seni anınca, sana bir iş verince ya da bir işin günü gelince hiçbir şey söylenmiyor.

## 1. Kapsam

### 1.0 Piyasada

8 Kasım'da Todoist, Linear, Trello, Asana ve ClickUp'ın yardım sayfalarına bakıldı:

- **Mention:** Linear, Asana ve ClickUp'ta açıklamadaki mention da bildirir; Trello ve Todoist yorumda. Liste @ ile açılır. Linear ajanları da listeler; biz Chat'teki gibi listelemeyiz.
- **Kendi yaptığın:** Trello ve Asana'da kişinin kendi yaptığı bildirim vermez ("only sent out for actions and changes performed by others").
- **Son tarih:** Todoist'te telefonda sabah "Morning overview" (bugün kalan iş sayısı), e-postada "Daily digest". Asana'nın günlük özeti yaklaşan, sana verilen ve senin verdiğin işleri gösterir; gecikenler orada yoktur, haftada bir ayrı gelir.
- **Başkasına hatırlatma:** yalnız ClickUp'ta (Delegate reminders, Assign comment) ve Todoist'te (paylaşılan projede başkasına hatırlatıcı) var; Linear'ın "Remind me" kişinin kendisine. Sınır yazılı değil.
- **Kaçırılan:** hepsinde ayrı bir kutu var (Inbox, bildirim çekmecesi). Bizde yok (1.3).

Kaynaklar: todoist.com/help (Comments & File Uploads, Manage your notifications, Introduction to reminders), linear.app/docs (Editor, Notifications), support.atlassian.com/trello (Commenting on cards, Adding dates to cards), help.asana.com (Email notifications, Task comments), help.clickup.com (Use mentions, Delegate reminders, Assign comments).

### 1.1 Ne bildirir

| Ne | Ne zaman | Kime |
|---|---|---|
| **Mention** | Biri bir kartın açıklamasında ya da yorumunda, bir görevin açıklamasında seni anınca | Anılan kişiye |
| **Atama** | Biri bir kartı ya da görevi sana verince | Verilen kişiye |
| **Hatırlatma (Remind)** | Biri sana verilmiş bir iş için Remind'a basınca | İşin verildiği kişiye |
| **Son tarih** | Her sabah 09:00'da, bugün ya da yarın bitmesi gereken iş varsa | İşin sahibine |

Chat'in bildirimleri bugünkü gibi kalır (`design/chat.md` 6).

### 1.2 Nerede çalışır

- **Sunucudaki space'lerde.** Kişisel space de sunucuya sync ediliyorsa dahil.
- OneDrive'daki ve yalnız cihazdaki space'lerde bildirim yok; Chat'teki gibi. Orada da @ yazılır ve çip olur, ama kimseye bir şey gitmez.
- Bildirim telefonda ve tarayıcıda Web Push, masaüstünde sistem bildirimidir; Chat'in bugünkü yolu (`design/chat.md` 6.3).

### 1.3 Kaçırılan bildirim

- Liste, zil ya da kutu yok. Kaçırılan bildirim kaçar.
- Sana verilen iş zaten Today'de, Upcoming'de ve filtrelerde görünür; son tarihler Today'de; mesajların Chat'te kendi okunmamışı var.

### 1.4 Ne yapmaz

- E-posta göndermez.
- Bir kartı "izlemek" (Trello'daki Watch, Jira'daki Watcher) yok: anılmadığın, sana verilmemiş işteki yorum bildirim vermez.
- Geciken iş için her gün yeniden bildirim yok.
- Başlıkta mention yok. Notlarda ve kayıtlarda mention yok.
- Görevlerde yorum yok; görevde mention yalnız açıklamada.
- Ajana bildirim gitmez; ajanlar @ listesinde de yok (Chat'teki gibi).

## 2. Mention

- **Nerede:** kartın açıklaması ve yorumları; görevin açıklaması. Başlıkta yok.
- **@ listesi:** Chat'teki liste. @ yazınca space'in kişileri çıkar, kendin hariç; yazdıkça süzülür, ok tuşları ve Enter ile seçilir. Ajanlar ve pasif kişiler yok.
- **Dosyada:** Chat'teki link: `[@Mert Kaya](scrawl:person/<id>)`. Okunurken ve editörde çip olarak görünür; kişi space'ten çıkmışsa çip soluk durur.
- **Kime gider:**
  - Yeni yorumda anılan herkese.
  - Düzenlenen yorumda yalnız yeni anılanlara; zaten anılmış olana yeniden gitmez.
  - Açıklamada, açıklamanın önceki hâlinde anılmamış olanlara.
  - Yazan kişiye gitmez; space'in üyesi olmayana gitmez.
- **Ne der:**
  - Yorumda: başlık "Mert mentioned you on SCR-12", altında yorumun ilk satırı.
  - Kartın açıklamasında: "Mert mentioned you on SCR-12", altında kartın başlığı.
  - Görevde anahtar olmadığı için görevin adı: "Mert mentioned you on Fix the login", altında listesi ("Tasks · Scrawl").

## 3. Atama

- Kart ya da görev sana verilince, veren sen değilsen bildirim gider. Açılırken sana verilen de sayılır.
- "Kaan assigned you SCR-12", altında başlık. Ajan verdiyse "Claude Code · Kaan assigned you SCR-12".
- Ajana verilen iş bildirim vermez. Senden alınan iş bildirim vermez.

## 4. Hatırlatma (Remind)

- Başkasına verilmiş, bitmemiş bir kartta ve görevde **Remind Mert**:
  - Bilgisayarda kartın penceresinde Assignee'nin altında; görevde ··· menüsünde.
  - Telefonda kartın sayfasında Assignee satırının altında; görevin sheet'inde Given to'nun altında.
- Basınca Mert'e "Kaan reminded you about SCR-12" gider, altında başlık ve varsa günü ("Due Nov 10").
- Kartın zaman çizgisine, görevin Activity'sine "Kaan reminded Mert" yazılır.
- Aynı kişi aynı iş için saatte bir kez basabilir. Sonra "Reminded 12 min ago" der ve basılmaz.
- Remind'ın metni yok; kartta söylenecek bir şey varsa yorumda mention kullanılır.
- Kendine verilmiş, kimseye verilmemiş, ajana verilmiş ya da bitmiş işte yok.

## 5. Son tarih

- Her sabah **09:00'da**, kişinin saatiyle, tek bildirim.
- Bugün ya da yarın bitmesi gereken, bitmemiş işler sayılır: başlıkta "2 due today, 1 due tomorrow", altında adları ("Fix the login, SCR-12 and 1 more"). Yalnız yarınki varsa "1 due tomorrow".
- Hiçbir şey yoksa bildirim gitmez. Geciken iş sayılmaz.
- **Kimin işi:** Today'deki kural: sana verilmiş olanlar; kimseye verilmemişse senin açtıkların; senin ajanına verilmiş olanlar.
- Görevler ve kartlar sayılır; koleksiyon kayıtları sayılmaz (kimseye verilmezler).

## 6. Dokununca nereye

Her bildirim tam yerini açar. Bilgisayarda, tarayıcıda ve telefonda aynı.

| Ne | Açılan |
|---|---|
| Kart yorumunda mention | Kart açılır, o yoruma kayar ve yorum bir an işaretlenir (Chat'te mesaja gitmek gibi). Telefonda kartın zaman çizgisi, o yorumda. |
| Açıklamada mention | Kart ya da görev açılır, açıklaması görünür. |
| Atama, hatırlatma | Kart ya da görev açılır. |
| Son tarih | Today açılır. |

- İş, bildirimden sonra başka sütuna, listeye, panoya ya da klasöre taşındıysa yine bulunur: yol değil, işin id'si aranır.
- Silindiyse ya da artık görülemiyorsa Chat'teki çip gibi söylenir: "It was moved or deleted."
- Space bu cihazda değilse, bugünkü "Not on this device" gibi söylenir.
- Uygulama kapalıyken dokunulursa önce uygulama açılır, sonra iş (Chat'teki gibi, `design/chat.md` 6.4).
- Yorum silindiyse kart yine açılır, kaydırılmaz.

## 7. Settings › Notifications

- Bugünkü **On this computer / On this device** kalır; metni "New messages" yerine "Messages, mentions and the rest" der.
- Altında yeni bölüm **Notify me about**, dört seçim, hepsi açık başlar:
  - **Mentions** — When someone writes @Kaan on a card or a task.
  - **Assignments** — When someone gives you a card or a task.
  - **Reminders** — When someone reminds you of a card or a task given to you.
  - **Due dates** — At 9:00, what is due today and tomorrow.
- Seçimler hesabındır, bütün cihazlarında geçerli. Yalnız sunucuya bağlıyken görünür.
- **In each conversation** bugünkü gibi kalır.

## 8. Ajan

- `comment` ile kart yorumunda, `save_card` ve `save_task` ile açıklamada `@Ad Soyad` ya da tek kişide geçen ilk ad mention'a çevrilir; Chat'teki `send_message` kuralı (`design/chat.md` 24).
- `save_card` ve `save_task`'ta `remind: true`: işin verildiği kişiye hatırlatma; saatte bir sınırı ajan için de geçerli.
- Ajanın yaptığı atama ve mention bildirim verir; ajan kendisi bildirim almaz.
- Rehbere (`guide.ts`) iki satır: mention nasıl yazılır, remind ne yapar.

## 9. Kodda

### 9.1 Dosya

- `TimelineEntry` (kart) ve `TaskEntry` (görev): yeni `{ kind: 'remind', to: PersonRef }`. Eski uygulama bilmediği kaydı `unknown` olarak saklar, silmez (bugünkü kural).
- Mention, yorumun ve açıklamanın metnindeki link; ayrı alan yok.

### 9.2 Core

- `withMentions` ajandan core'a taşınır; `mentionsOf(markdown)` link'lerdeki kişileri verir.
- `noticesFrom(path, before, after)`: pano ya da görev listesinin eski ve yeni hâlinden bildirimleri çıkarır: tür (`mention`, `assign`, `remind`), iş (id, anahtar, başlık), kime, kim, metin, açılacak adres.
- `dueOf(path, file)`: dosyadaki bitmemiş, günü olan işler; sahibiyle (Today'in `isMine` kuralı).
- `remindCard` ve `remindTask`, saatte bir sınırıyla.

### 9.3 Sunucu

- `PUT /spaces/:id/files/*` bir pano ya da görev listesi yazınca eski ve yeni hâli `noticesFrom`'a verir. Ajanın yazdıkları da aynı yoldan geçer.
- Bildirim yalnız o space'in üyesi olan, aktif, yazan olmayan ve o türü kapatmamış hesaplara.
- Bildirimler saklanmaz; gönderilir ve biter.
- Yeni tablolar:
  - `due_items (space, path, item, title, due, owner)` — her yazmada, silmede ve taşımada güncellenir.
  - `digests (account, day)` — sabah bildirimi günde bir kez.
  - `accounts.notify` — dört seçim (JSON).
- Yeni yollar: `PATCH /me` `notify` ile; `POST /opened` (space, yol, iş): bekleyen bildirimi düşürmek için (aşağıda).
- **Push:** `push.ts`'in yükü Chat'ten ayrılır: `{ kind: 'notice' | 'due', url, title, body, tag }`. Chat'teki kural: kişi başka bir cihazda kullanıyorsa öbürlerine giden bildirim bir dakika bekler; bu arada işi açarsa (`POST /opened`) gitmez. Bekleyenler bellekte durur.
- **Sabah:** dakikada bir, saati 09:00'u geçmiş ve o gün özeti gitmemiş hesaplar için `due_items`'tan bugün ve yarın. Saat dilimi hesabın (`accounts.timeZoneOf`); yoksa sunucunun.
- **Canlı kanal:** `notice` olayı; masaüstü sistem bildirimi gösterir (`alerts.rs`).

### 9.4 Web, telefon, masaüstü

- Chat'in @ listesi `Chat.tsx`'ten ortak bir parçaya (`Mentions.tsx`: hook ve liste) taşınır; Chat, açıklamalar ve kart yorumları onu kullanır.
- Açıklama editörüne mention çipi ve @ listesi; yalnız kartın ve görevin açıklamasında açık, notlarda ve kayıtlarda değil.
- Kartın yorum kutusu ve yorum düzenleme düz textarea'dan Chat'in editörüne geçer (çip görünsün diye); görünüşü değişmez.
- Remind ve Settings'te Notify me about; telefonda karşılıkları.
- Kart ya da görev açılınca `POST /opened`.
- `push-sw.js`: bildirime dokununca `url`'yi açar (iş ya da Today).
- Masaüstü: `notice` olayını mevcut `chat_notify` komutuyla gösterir; etiket işin kendisi.

### 9.5 Güvenlik

- Bildirim, kartın başlığını ve yorumu yalnız o space'in üyesine götürür.
- Remind'ın saatte bir sınırı sunucuda da uygulanır; dosyaya elle yazılan `remind` kaydı sınırı aşıyorsa bildirim vermez.
- Push içeriği bugünkü gibi şifreli gider; sunucu dışında hiçbir şey çalışmaz.

## 10. Testler

- **Core:** yeni yorumda, düzenlenen yorumda, kartın ve görevin açıklamasında mention; silinen mention; kendini anma; atama (açılırken, sonradan, ajana); remind ve saatte bir; `dueOf`'ta bitmiş ve kimin işi.
- **Sunucu:** kime gider, kime gitmez (yazan, üye olmayan, pasif, türü kapatan); başka cihazda kullanırken bekleyip iş açılınca düşmesi; sabah özetinin saat dilimine göre ve günde bir kez gitmesi; bitmiş işin sayılmaması; ajan yazınca da gitmesi.
- **Dokununca nereye (6):** her tür için ayrı test.
  - Core: her bildirimin `url`'si doğru işi, doğru yorumu gösteriyor.
  - Web: `url` açılınca doğru kart ya da görev, doğru yorum açılıyor; taşınmış işte, silinmiş işte, başka space'teki işte ve bu cihazda olmayan space'te.
  - `push-sw.js`: `notificationclick` olayı test içinde verilir; açık pencere varsa ona, yoksa yeni pencereye doğru adres gidiyor.
  - Masaüstü: sistem bildiriminin tıklaması pencereye doğru adresi veriyor.
- **Tarayıcıda:** iki hesapla (Kaan ve Mert): kartta ve görevde mention, atama, Remind, Settings; telefon görünümünde de. Her türün adresi açılıp doğru yerin geldiği denenir.
- **Benim tarayıcımda denenemeyen:** Claude'un tarayıcısı bildirim iznini reddediyor. Gerçek push'a dokunmak (Chrome, Windows masaüstü uygulaması, iPhone ana ekranı) senin denemen; her tür için ne açılması gerektiği 6'daki tabloda.

## 11. Dilimler

1. **Temel:** core'da `noticesFrom`, sunucuda yazınca bildirim; mention (yazılmış linkle) ve atama bildirimi; push, canlı kanal, masaüstü; dokununca açılma.
2. **@ listesi:** ortak liste; kart ve görev açıklamaları; kart yorum kutusu Chat'in editörüne.
3. **Remind.**
4. **Son tarih:** `due_items` ve sabah bildirimi.
5. **Settings:** Notify me about.
6. **Ajan ve Help** (`boards.md`, `tasks.md`, `working-together.md`, `settings.md`).

Yayın: web ve sunucu; masaüstü kullanıcı söyleyince.

## 12. Onay bekleyen kararlar

1. Remind'ın yeri: kartta Assignee'nin altında, görevde ··· menüsünde; metni yok; saatte bir.
2. Sabah bildirimi 09:00'da sabit; saatini seçmek yok.
3. Son tarihte koleksiyon kayıtları sayılmaz.
4. OneDrive'da ve yalnız cihazdaki space'lerde bildirim yok.

## 13. Yazılırken: 1. dilim (Temel)

8 Kasım 2026. ROA-365.

- **Nerede çıkar:** sunucuda `SpaceFiles.onWrite`; uygulamanın da ajanın da yazdığı oradan geçer. Dosya sunucuya ilk kez geliyorsa (önceki hâli yoksa) ya da eski ya da yeni hâli okunamıyorsa bildirim çıkmaz: içindeki her şey yeni görünürdü.
- **Kim yaptı:** yorumda yorumun damgası, atamada `assign` kaydının damgası, açıklamada kartın ya da görevin son `workedOn`'u, o da yoksa dosyayı yazan hesap. Kişi ilk adıyla, ajan adı ve sahibinin ilk adıyla ("Claude Code (Laptop) · Kaan") yazılır.
- **Gösterme:** masaüstü canlı kanaldan gelen `notice`'i kendi bildirimiyle gösterir; tarayıcı yalnız o an kullanılıyorsa gösterir (kullanılmayan cihaza push gider; ikisi birden olmasın diye).
- **Açılma:** bildirimle açılan uygulamada kart ya da görev, space'i okunana kadar en çok 20 saniye beklenir; gelmezse çipin sözü söylenir. Kartın yorumu 2 saniye işaretlenir; telefonda kart sayfası otururken (üstteki açıklama sonradan büyüyor) yorum görünür tutulur.
- **Görev:** bilgisayarda listesi açılır ve görev gösterilir; telefonda sheet'i açılır.
- **Testler:** core `notices.test.ts` (9), sunucu `notices.test.ts` (4), web `pushWorker.test.ts` (3: servis worker'ın tıklaması).
- **Tarayıcıda denendi (yerel sunucu, Kaan ve Mert):** Kaan'ın ROA-3'e yazdığı `@Mert` yorumu Mert'in canlı kanalına "Kaan mentioned you on ROA-3" olarak geldi; linki bilgisayarda ve telefon görünümünde kartı o yorumda işaretli açtı; görev linki listeyi açıp görevi gösterdi; olmayan kartın linki 20 saniye sonra "It was moved or deleted." dedi.
- **Denenmeyen:** gerçek push'a ve Windows bildirimine dokunmak (Claude'un tarayıcısı bildirim iznini reddediyor). @ listesi henüz yok (2. dilim); denemede mention linki elle yazıldı.

## 14. Yazılırken: 2. dilim (@ listesi)

8 Kasım 2026. ROA-366.

- **Tek liste:** Chat'in @ listesi ortak parçada (`Mentions.tsx`, seçenekleri `mentionChoices.ts`); Chat, kartın ve görevin açıklaması ve kartın yorumu onu kullanır. Görev eklenirken de açıklamada vardır; koleksiyon kayıtlarının notlarında yoktur.
- **Yorum kutusu:** Chat'in kutusu da açıklamalar da aynı editörle (`createEditor`) yazılıyor; kart yorumu ve yorumun düzenlenmesi açıklamanın alanıyla (`DescriptionField`, Attach'sız) yazılır. Görünüşü aynı kaldı: bilgisayarda kutu, telefonda alttaki hap.
- **Liste nerede:** @'in altında, yer yoksa üstünde (telefonda klavye ve kutu); telefonda ekran genişliğinde, satırlar 44 px.
- **Kimler:** kendin, ajanlar ve pasif kişiler yok. Sunucudaki space'te yalnız sunucuda o space'in üyesi olanlar (Chat'in general room'u herkesi tutar): space'in kişilerinde aynı kişinin eski bir kaydı kalabiliyor, yerel denemede Mert iki kez çıktı; eskisi anılsa bildirim gitmezdi.
- **Çip:** mention linki editörde ve yorum okunurken Chat'teki gibi çip (`cm-sl-mention`); eski yorumlardaki elle yazılmış linkler de.
- **Testler:** web `mentionChoices.test.ts` (2).
- **Tarayıcıda denendi:** kart yorumunda @Me → Mert Kaya, Enter ile seçildi, çip oldu, gönderilince kutu boşaldı ve yorum çiple göründü; görevin açıklamasında Enter görevi kaydetmeden adı koydu, Escape listeyi kapattı; telefon görünümünde liste kutunun üstünde açıldı; Chat'te liste eskisi gibi ("In #general", @room).
- **Görülen ama dokunulmayan:** kişi seçicide (Assignee) de aynı eski kayıt duruyor; eskisi seçilirse atama bildirimi gitmez.

## 15. Yazılırken: 3. dilim (Remind)

8 Kasım 2026. ROA-367.

- **Dosyada:** kartın ve görevin zaman çizgisinde `{ kind: 'remind', to }` (`remindCard`, `remindTask`). Hatırlatma işin içeriğini değiştirmediği için Worked on'a yazılmaz; `updated` ilerler ki sync'te kaybolmasın.
- **Kimde görünür:** başkasına (ajana değil) verilmiş, bitmemiş işte ve yalnız sunucudaki space'te. OneDrive'da ve yalnız cihazdaki space'te görünmez: kimseye bir şey gitmezdi.
- **Saatte bir:** aynı kişi aynı işi aynı kişiye saatte bir hatırlatır; arada düğme "Reminded just now" / "Reminded 12 min ago" der ve basılmaz, görevin menüsünde soluk durur ("Once an hour for the same task."). Sunucu da elle yazılmış bir kaydı bu sınıra göre süzer.
- **Bildirim:** "Kaan reminded you about ROA-3", altında başlık (görevde listesi) ve günü varsa "· Due Nov 10".
- **Testler:** core `notices.test.ts`'e 3 (kayıt ve sınır, bildirim ve metin, görev), sunucu `notices.test.ts`'e 1.
- **Tarayıcıda denendi:** ROA-3 Mert'e verilince Mert'e "Kaan assigned you ROA-3" gitti; Remind Mert'e basınca "Kaan reminded you about ROA-3" gitti, düğme "Reminded just now" olup soldu, zaman çizgisine "Kaan reminded Mert" yazıldı; telefonda Assignee'nin altında soluk satır; Launch'taki görev Mert'e verilince menüde Remind Mert çıktı, basınca bildirim gitti ve öğe soldu.

## 16. Yazılırken: 4. dilim (Son tarih)

8 Kasım 2026. ROA-368.

- **Okunduğu yer:** 9.3'teki `due_items` tablosu tutulmadı. Sunucu kişinin sabahı gelince onun space'lerindeki (kişisel space'i dahil) pano ve listeleri o an okur (`Due.workOf`, core'da `dueWorkIn`); hiç eskimez, taşıma ve silmede güncellenecek bir şey yoktur. `.scrawl/` altındaki dosyalar (çöp) okunmaz. Tek tablo `digests (account_id, day)`: günde bir kez, gönderilmeden önce yazılır.
- **Ne zaman:** dakikada bir bakılır; kişinin saati 09:00'u geçmiş ve o gün gönderilmemişse. Saat dilimi uygulamanın açılışta söylediği (`PATCH /me`), yoksa sunucununki. Sunucu sabah kapalıydıysa 12:00'den sonra o günün bildirimi gönderilmez: öğleden sonra gelen bir "bugün" bildirimi tuhaf olurdu.
- **Ne sayılır:** bugün ve yarın bitmesi gereken, bitmemiş görevler ve kartlar, Today'in kuralıyla (`isMyWork`). Kartların alt görevleri sayılmaz.
- **Ne der:** "2 due today, 1 due tomorrow"; altında üçe kadar ad ("ROA-1 and Call the dentist"), fazlası "Fix the login, SCR-12 and 2 more". Kart anahtarıyla, görev adıyla.
- **Dokununca:** `scrawl:today`; bilgisayarda Today sekmesi, telefonda Today sekmesi.
- **Testler:** core 2 (kimin işi, metin), sunucu `due.test.ts` 2 (09:00'da bir kez, bitmiş ve çöpteki sayılmaz; hiçbir şey yoksa ve öğleden sonra gitmez), web 1 (servis worker Today'i açar).
- **Tarayıcıda denendi:** `/?chat=scrawl:today` bilgisayarda ve telefon görünümünde Today'i açtı. Gerçek sabah bildirimi, sunucunun saatine bağlı olduğu için yerelde beklenmedi; testte saat ilerletilerek denendi.

## 17. Yazılırken: 5. dilim (Settings)

8 Kasım 2026. ROA-369.

- **Sunucuda:** `accounts.notify` (JSON); boşsa dördü de açık. `GET /me` seçimleri verir; `PATCH /me` `notify` ile yalnız verilenleri değiştirir (`{ "mentions": false }`); bilinmeyen ad ya da true/false olmayan değer 400 döner. Kapatılan türde bildirim gitmez: mention, atama ve Remind yazılırken süzülür; Due dates kapalıysa sabah bildirimi hazırlanmaz, o sabah sonradan açılırsa öğlene kadar gider.
- **Uygulamada:** Settings › Notifications'ta cihazın seçiminin altında **Notify me about**, altında "For the spaces on localhost:8080, on every device you use." Bağlı her sunucu için ayrı bölüm. Seçim basılınca sunucuya yazılır; yazılamazsa geri döner ve "It could not be changed. Try again in a moment." der. Eski ya da ulaşılamayan sunucuda bölüm görünmez. Mention'ın açıklamasında kişinin kendi ilk adı: "When someone writes @Kaan …".
- **Telefonda:** taslaktaki gibi: her seçim bir grubun satırı, sağında switch (cihazın seçimi de); başlık "On this phone", satır "Notifications on this phone"; sunucu cümlesi grubun altında.
- **Cihazın metni:** "New messages show …" yerine "Messages, mentions and the rest show …" (bilgisayar, tarayıcı, telefon).
- **Testler:** sunucu 2 (Mert mention'ı kapatınca yalnız atama gider, her cihazında; yanlış seçim 400; Due dates kapalıysa sabah bildirimi gitmez); `/me` testi seçimlerle.
- **Tarayıcıda denendi:** bilgisayarda ve telefon görünümünde dört seçim; Mentions kapatılıp sayfa yenilenince kapalı kaldı, sunucuda da kapalıydı; telefonda switch'le geri açıldı.

## 18. Yazılırken: 6. dilim (Ajan ve Help)

8 Kasım 2026. ROA-370.

- **Mention:** `withMentions` core'a taşındı (`sync/chat.ts`, kişiler ve `room` alır); `send_message` de onu kullanır. Ajan `comment` metninde, `save_card` ve `save_task` açıklamasında `@Ad Soyad` ya da tek kişide geçen ilk adı space'in aktif kişilerinden mention'a çevirir (`mentionsMade`); ajanlar ve pasif kişiler yok. Araçların açıklamasında bir cümle.
- **Remind:** `save_card` ve `save_task`'ta `id` ile `remind: true`; sonuçta `reminded: "Mert Kaya"`. Yapılamıyorsa hiçbir şey yazılmaz ve nedeni söylenir: kimliği bilinmiyor, bitmiş, kimseye verilmemiş, ajana verilmiş, ajanın çalıştığı kişiye verilmiş (kendisine söylesin), ya da bir saat dolmadı ("You reminded Mert Kaya of it 20 min ago; once an hour"). Yeni kartta ve görevde yok.
- **Rehber:** "Who did what" bölümüne bir paragraf: mention nasıl yazılır, remind ne zaman.
- **Düzeltme:** ajanın kaydındaki ad zaten kimin olduğunu taşıyor ("Claude Code · Kaan Arslan"); bildirim başlığı "Claude Code · Kaan Arslan · Kaan" oluyordu. Artık adın yalnız ajan kısmı alınır: "Claude Code · Kaan assigned you SCR-1".
- **Help:** Working together'a "Mentions and notifications" bölümü (dört tür, ajan, Settings, kaçan bildirim tutulmaz); Boards ve Task lists'e (telefon sayfaları dahil) @ ile mention cümlesi; Settings'e (telefon dahil) Notify me about.
- **Testler:** ajan 2 (açıklama ve yorumda mention, pasif kişi ve ajan hariç; remind ve beş ret), sunucu 1 (`/mcp` üzerinden ajan atar, yorumda @Mert yazar, hatırlatır: Mert'e üç push gider).
- **Tarayıcıda:** Help penceresinde Working together'ın yeni bölümü.
