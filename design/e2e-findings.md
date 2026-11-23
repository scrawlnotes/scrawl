# E2E ve UX taraması: bulgular

Plan: `design/e2e.md`. Hatalar sormadan düzeltilir ve burada kaydı tutulur; UI/UX bulguları ve özellik önerileri karar bekler.

## Özet

24 Kasım 2026, yedi dilim bitti (aee3076, c4f4b63, 26ac234, 0ee9b4a, 8e8e302, 4325307 ve f73cf02, 2062a33 ve 7. dilimin son kısmı; hepsi web'de).

- **Hata:** 13 bulundu, 13'ü düzeltildi. En ağırı H1: yazdıktan hemen sonra kapanan ya da yenilenen sekmede son yazılan kayboluyordu. Dördü (H2, H3, H8–H10) ekran okuyucuya adsız düğme ve kutulardı. 7. dilimde üç tane daha: telefonda görev eklerken menüler sayfanın arkasında açılıyordu (H11), CSV içe aktarma hesaplanan alanın adıyla ikinci bir alan açıyordu (H12), taşıma, ad değiştirme, silme ve oluşturma başka cihazlara bir dakikaya kadar geç gidiyordu (H13).
- **UI/UX:** 10 bulgu, 10'u onaylandı ve yapıldı.
- **Özellik önerisi:** yok. Taranan ekranlarda değer katacak, eksik bir şey görmedim; liste doldurmak için uydurmadım.
- **Test takımı:** `pnpm e2e`, 79 test iki boyutta 158 koşu; 121 geçer, 37'si bilerek tek boyutta. GitHub'da her push'ta çalışır (K2). Planda sayılan akışların hepsi testli; birkaçı e2e yerine birim testlerinde (Kapsam).

## Toplu raporun kararları

22 Kasım'da dördü de onaylandı ("önerilerin ok, ücretsizde kesin kalsın ama").

| # | Konu | Durum | Öneri | Karar |
|---|---|---|---|---|
| U9 | Takvim, bilgisayar | U7 telefon için onaylandı. Bilgisayarda Day ve Week bugün açılınca yine 07:00'dan başlıyor; akşam "şu an" görünmüyor. | Telefondaki gibi olsun: bugün şimdiki saatin bir saat üstünden, başka gün ilk işinden, iş yoksa 07:00. Cila. | Yapıldı (`Calendar.tsx`), `f-calendar.spec.ts` iki boyutta |
| K1 | Testi olmayan akışlar | Planın 3. bölümünde sayılan akışların aşağıdaki "Kapsam"da "Testi yok" denenleri. | 7. dilim: hepsine test, aynı yöntemle (önce kullanıcı gibi kullan, hatayı düzelt, UI/UX bulgusunu sor). Planın istediği buydu; önceki dilimlerden büyük, alan grubu grubu ilerler. | Onaylandı, 7. dilim |
| K2 | Her push'ta çalışması (CI) | Planda "takım oturunca karar" denmişti; takım şimdi yerelde kararlı. Bir koşu bu bilgisayarda ~2 dakika. | GitHub Actions'da yalnız `apps/web` veya `e2e/` değişince, Edge yerine Playwright'ın Chromium'uyla. Ücretsiz dakika sınırı doğrulanmadan açılmaz. | Yapıldı: `.github/workflows/web.yml` web'in typecheck'i, birim testleri ve e2e; runner'ın kendi Chrome'uyla. Ücretsiz: GitHub'ın belgesine göre standart runner açık depoda ücretsiz ve sınırsız ("free and unlimited on public repositories"); depo açık, büyük runner yok, hiçbir dosya yüklenmiyor. |
| K3 | Masaüstü uygulamasına özgü olanlar | Tepsi, açılışta başlama, dosya izleme, güncelleme hâlâ elle deneniyor. | Şimdilik elle kalsın; `tauri-driver` kurulumu bu iş için büyük. | Onaylandı, elle kalır |

## Kapsam

Planın 3. bölümündeki akışlar, testi olanlar ve olmayanlar. "Testi yok" çalışmıyor demek değil; testle kilitlenmedi demek.

| Alan | Testli | Testi yok |
|---|---|---|
| A İlk açılış | Welcome notu, başlangıç sayfası, OneDrive'a bağlama, telefonda boş ekran | — |
| B Notlar | Yazınca liste, Bold, Heading 1, kod bloğu, tablo, callout, link, resim, Excel'den tablo yapıştırma, sekmeler, Rename, yeni klasöre taşıma, Trash ve Undo, History, Markdown, PDF ve HTML dışa aktarma, Quick notes | — |
| C Görevler | Ekleme, tamamlama ve Undo, Scheduled, eklemeden sonra tarihin boşalması, öncelik, etiket, alt görev, bölüm, sürükleyerek sıralama, etiketin görünümü, Favorites, Activity | — |
| D Pano | Kart, sürükleme, telefonda Status, yorum, You, Priority ve Due, Software şablonu, sütun ekleme (ad yerinde, Done'dan önce), faz kapatma ve bitmeyen kartın sonraki faza geçmesi, kartı birine verip Remind, yorumda @ ile kişi | Remind ve mention bildiriminin gidişi (push; J'ye bak) |
| E Koleksiyon ve app'ler | CRM kurulumu (iki boyutta), Gym kurulumu, Edit app (değişikliği önce gösterip kaydetme), kayıt formu, tablo, tablo görünümü ekleme, CSV içe aktarma (yeni seçenek, hesaplanan sütun), CSV ve Excel dışa aktarma, Excel'in geri alınması | Kurallar (`_rules.js`) ve alan türüne uymayan değerin işaretlenmesi birim testlerinde (Companies şablonunda tür alanı yok) |
| F Takvim | Outlook ve Google'ın bugünkü işi, görevin takvimde günü, bugün şimdiki saatte açılış, ayda sürükleyip başka güne taşıma | — |
| G Arama | Kelimeyle bulup açma, Recent searches | — |
| H Space ve sync | Davetle katılma, iki cihaz arası sync, telefonda çevrimdışı şeridi, kişisel space'ten paylaşılana taşıma (sunucuya hemen gitmesi), aynı satır iki cihazda değişince çakışma kopyası | — |
| I Chat | #general'da yazışma, mesaj arama, doğrudan mesaj, dosya, @ ile kişi, ajanın kişisine DM'i | — |
| J Bildirimler | Tür kapatma ayarı | Mention, atama, Remind ve son tarih bildiriminin gidişi (sunucu testlerinde, bkz. Notlar) |
| K Ajan | OAuth, `create`, `write`, `save_task` ve arayüzde görünmesi | `tree`, `read`, `save_card`, `save_record` (ajan paketinin ve sunucunun birim testlerinde) |
| L Diğer ekranlar | Settings › Appearance, Help, Files'a yükleme, Keys (değer gizli, Show value, dosyada .env), paylaşılan space'in People'ı | — |
| M Telefon kabuğu | Bütün testler telefon boyutunda da; dokunma alanları ölçüldü | Klavye açıkken düzen (gerçek iPhone'da) |

## Hatalar

| # | Alan | Ne oldu | Düzeltme | Durum |
|---|---|---|---|---|
| H1 | B Notlar | Yazdıktan sonraki ~400 ms içinde sekme kapanır ya da yenilenirse son yazılanlar kayboluyordu: kaydetme 400 ms sonra başlıyor, `pagehide`'da başlatılan yazma sayfa giderken bitmiyor. Duman testi ilk koşuda yakaladı (iki boyutta da not boş açıldı, durum çubuğu "Saved"). | `session.ts`: sayfa giderken yazılmamış ve yazılmakta olan notlar `localStorage`'a hemen konur, açılışta ilk not okunmadan önce dosyaya yazılır, her tam kayıttan sonra silinir; telefonda uygulama arka plana geçince kayıt 400 ms beklemeden başlar. | Düzeltildi (aee3076), `smoke.spec.ts` |
| H2 | B Notlar | Masaüstündeki biçim çubuğunda `B`, `I`, `S`, `</>`, `H1`–`H3` düğmelerinin erişilebilir adı yalnız bu işaretlerdi (telefonda Bold, Italic… adları var). Ekran okuyucu ne olduğunu söyleyemiyordu. | Adları title'larıyla aynı (`FormatBar.tsx`). | Düzeltildi, `b-notes.spec.ts` (Bold) |
| H3 | B Notlar | Notun içindeki tabloda satır ve sütun silme, editörde Find'ı kapatma ve sekme kapatma düğmelerinin adı yalnız `×`. | Adları title'larıyla aynı (`table.ts`, `find.ts`, `App.tsx`). | Düzeltildi |
| H4 | Her yer | Kalın yazılar bulanıktı (başlıklar, düğmeler, Settings'teki Add space…, koyu modda kartların başlıkları): arayüz 132 yerde `font-weight: 600` kullanıyor ama IBM Plex Sans'ın yalnız 400 ve 500'ü yükleniyordu; tarayıcı 600'ü 500'den kendisi kalınlaştırıyordu. | `start.tsx`: 600 de yüklenir. | Düzeltildi |
| H5 | B Notlar | History penceresi Escape ile kapanmıyordu: History notu önce açıyor, notu açmanın ertelenmiş odak vermesi pencere açıldıktan sonra çalışıp odağı arkadaki editöre geri alıyordu (Escape de editöre gidiyordu). | `session.ts`: not açılınca editör, o arada açılmış bir pencere odaktaysa odağı almaz. | Düzeltildi, `b-notes.spec.ts` |
| H6 | C Görevler | Telefonda bir görev tamamlanınca altındaki görev yukarı, parmağın altına kayıyor ve dairesinde onay işareti görünüyordu, tamamlanmış gibi: fareyle üstüne gelince gösterilen önizleme, dokunmatik ekranda dokunulan yerde takılı kalıyor (iPhone da öyle). | `styles.css`: önizleme yalnız fareli cihazlarda (`@media (hover: hover)`). | Düzeltildi |
| H7 | E Koleksiyon | Yeni bir şirket (ve başlığında adı olan her kayıt) Name'de değil, altındaki ilk alanda (Website) açılıyordu: ilk kutu, pencerenin başlığı olarak çizilen adı atlayıp düzendeki ilk alanı alıyordu. | `Collection.tsx`: başlıkta adı olan yeni kayıt adında açılır; satırları bir alandan gelen kayıt (antrenmanın programı) yine o alanda açılır. | Düzeltildi, `e-apps.spec.ts` |
| H8 | D Pano, E Koleksiyon | Kartın ve görevin açıklaması ve kartın yorum kutusu ekran okuyucuya adsız "textbox" olarak görünüyordu. | `Description.tsx`: boşken gösterdiği metin (Write a comment…, Add a description…) adı da olur. | Düzeltildi, `d-boards.spec.ts` |
| H9 | I Chat | Chat'in mesaj kutusu da ekran okuyucuya adsız "textbox" idi. | `Chat.tsx`: "Message #general" gibi yer tutucusu adı da olur. | Düzeltildi, `i-chat.spec.ts` |
| H10 | B Notlar, E Koleksiyon | Notun kendi editörü, Quick note'un gövdesi ve kaydın notları (bilgisayar ve telefon formu) da ekran okuyucuya adsızdı; H8'de kaydın notlarını düzelttim sanmıştım, ayrı bir bileşenmiş. | `session.ts`: notun ve Quick note'un editörü "Note"; `Collection.tsx`: kaydın notları "Add a note…". | Düzeltildi, `b-notes.spec.ts`, `e-apps.spec.ts` |
| H11 | C Görevler, telefon | Telefonda görev eklerken Priority'ye basınca seçenekler ekleme sayfasının arkasında açılıyordu: yalnız Priority 1 görünüyor, 2–4 ve No priority arkada kalıyordu. Aynısı o sayfadan açılan öbür menüler için de (Date, Labels ve Record kendi sayfalarında açıldığı için etkilenmiyordu). Sebep: menüler telefonun çerçevesinin (`position: fixed`) içine çiziliyor, ekleme sayfası çerçevenin yanında; `fixed` kendi katmanını açtığı için menünün z-index'i çerçevenin içinde kalıyordu. | `sheets.tsx`: menüler çerçevenin içine değil yanına çizilir. | Düzeltildi, `c-tasks-more.spec.ts` |
| H12 | E Koleksiyon | CSV içe aktarmada hesaplanan bir alanla (Companies'te Last contact) aynı adı taşıyan sütun, aynı adla ikinci bir metin alanı açıyordu; tabloda iki Last contact. Kendi CSV dışa aktarımımız hesaplanan sütunları da yazdığı için dışa aktarıp geri alan her seferinde bir kopya alan kazanıyordu. | `csv.ts` `guessTargets`: hesaplanan alana denk gelen sütun Nowhere'a gider (içe aktarma penceresinde değiştirilebilir). | Düzeltildi, `csv.test.ts`, `e-apps-more.spec.ts` |
| H13 | H Space ve sync | Taşıma, ad değiştirme, silme, Trash'ten geri alma ve yeni not, liste, pano, koleksiyon ya da klasör başka cihazlara bir dakikaya kadar geç gidiyordu. Eşitleme turu yalnız bir not, görev, kart ya da kayıt kaydedilince hemen geliyordu; bu işlemler kayıt sayılmadığından dakikalık turu bekliyordu. Paralel koşuda taşınan not karşı tarafa 20 saniyede gitmedi; tek başına geçiyordu, çünkü pencerenin odak alması da tur başlatıyor. | `session.ts` `changedHere`: bu işlemlerin sonunda kaydedildi gibi bir tur istenir. | Düzeltildi, `saving.test.ts` (düzeltme olmadan düşer), `h-spaces.spec.ts` |

## UI/UX bulguları

Karar sütunu kullanıcının; onaylananlar aynı dilimde yapıldı.

| # | Alan | Ne görülüyor | Neden sorun | Öneri | Önem | Karar |
|---|---|---|---|---|---|---|
| U1 | C Görevler, telefon | Boş Inbox'ta ve boş Scheduled'da ortada **Add task** düğmesi, köşede **+** var; ikisi aynı işi yapıyor. Liste dolunca yalnız + kalıyor. | Aynı ekranda iki ekleme yeri; ilk görüşte hangisine basılacağı düşündürüyor. (Todoist'in boş ekranı doğrulanmadı.) | Boş durumda ortadaki düğme kalksın, metin ve + kalsın. | Cila | Onaylandı, yapıldı (`Tasks.tsx`, `PhoneUpcoming.tsx`) |
| U2 | B Notlar | Notun menüsünden Delete her seferinde "“Plan” will be moved to the trash." diye onay soruyor. | Not zaten Trash'e gidiyor ve oradan geri geliyor; onay her silmede bir adım daha. Görevlerde Undo'lu bildirim kullanıyoruz (Task completed · Undo); notta da aynısı tutarlı olur. (Notion'da silinen sayfa Trash'e gider; onay sorup sormadığı resmi belgede yok, doğrulanmadı.) | Sormadan Trash'e gitsin, altta "Note moved to Trash · Undo" bildirimi çıksın. Kalıcı silme (Delete forever, Empty trash) onaylı kalır. | Zor | Onaylandı, yapıldı: telefonda ve bilgisayarda “Plan” moved to the trash · Undo (`App.tsx`); `b-notes.spec.ts` |
| U3 | C Görevler, bilgisayar | Listede satır içi Add task'ta bir görev eklenince kutu açık kalıyor ve önceki görevin tarihini (Today) sıradakine de veriyor. Tarih vermediğim ikinci görev Today oldu. Kodda bilinçli: "keeps the row with the same date and list for the next". | Fark edilmeden yanlış tarihli görev oluşuyor; tarih çipi küçük. (Todoist'in bu durumdaki davranışı doğrulanmadı.) | Eklemeden sonra tarih (ve öncelik, etiket) boşalsın, liste ve bölüm kalsın. | Zor | Onaylandı, yapıldı: bilgisayarda ekleme satırı açıldığı yerin varsayılanına döner (Scheduled'da Today, etiket görünümünde o etiket); telefonun ekleme sayfası da aynı sorunu taşıyordu, o da düzeldi (`TaskComposer.tsx`, `PhoneTasks.tsx`); `c-tasks.spec.ts` |
| U4 | D Pano | Ad verilmemiş bir cihazda kendi kartımda "**Unnamed** created this" ve Worked on'da "Unnamed", yanında soru işaretli avatar. | Kişi kendi yaptığını yabancı biri yapmış gibi okuyor; yeni bir kullanıcının ilk gördüğü kartlardan biri. | Kendi işi "You" diye yazılsın (Profile'da ad verilince adı); avatar adın baş harfi ya da kişi simgesi. | Zor | Onaylandı, yapıldı: adsız kişi kendi işinde "You" ve "Y", başkalarında yine Unnamed (`People.tsx`, `App.tsx`); `d-boards.spec.ts` |
| U5 | D Pano, bilgisayar | Kart penceresinin sağında Status özel bir seçici, ama Priority tarayıcının kendi açılır kutusu ve Due tarayıcının "mm/dd/yyyy" tarih kutusu. Görevlerin tarih seçicisi (Today, Tomorrow, takvim) burada yok. | Aynı pencerede üç ayrı görünüm; tarih kutusu bilgisayarın dilinden gelen biçimde ve görevlerdekinden farklı. | Priority görevlerdeki öncelik menüsüyle, Due görevlerdeki tarih seçicisiyle olsun. | Cila | Onaylandı, yapıldı: ikisi de Status gibi alan, bayrak öncelik renginde, tarih Today/Tomorrow/… ile (`CardPanel.tsx`, `styles.css`); `d-boards.spec.ts` |
| U6 | E App'ler, telefon | App kurulunca çıkan bildirim tek satırda kesiliyor: "CRM set up: 3 collections, 1 board, 1 n…". | Ne kurulduğunu söyleyen cümle yarım kalıyor. | Telefonda bildirim metni iki satıra kadar sarsın, Undo yanında kalsın. | Cila | Onaylandı, yapıldı (`phone.css`) |
| U7 | F Takvim, telefon | Scheduled › Day bugün açılınca saat 07:00'dan başlıyor; akşam 18:30'da "şu an" görünmüyor, aşağı kaydırmak gerekiyor. | Bugüne bakan kişi önce şimdiyi ve sıradakini görmek ister. | Bugün açılınca görünüm şimdiki saatin biraz üstünden başlasın; başka bir gün açılınca o günün ilk işinden. | Cila | Onaylandı, yapıldı: iş olmayan gün yine 07:00 (`Calendar.tsx`) |
| U8 | Telefon, boş ekranlar | U1'de boş Inbox ve Scheduled'dan ortadaki düğmeyi kaldırdık; aynı durum başka boş ekranlarda da var: boş koleksiyonda (Companies) "Add record", boş panoda ve sütunda "Add card", boş Keys'te "Add key", boş klasörde "Create" düğmesi köşedeki + ile yan yana. | U1'deki gibi aynı ekranda iki ekleme yeri; görevlerde kalktı, öbürlerinde duruyor: tutarsız. | Bu boş ekranlarda da ortadaki düğme kalksın, metin ve + kalsın. (Boş sütundaki "Add card" o sütuna ekler, + ilk sütuna: o düğme kalsın.) | Cila | Onaylandı, yapıldı: dördünde de + olduğu doğrulandı (klasör, alanı olan koleksiyon, pano, tablo görünümündeki Keys); sütunun Add card'ı ve alanı olmayan koleksiyonun Fields'ı kaldı (`Phone.tsx`, `PhoneCollection.tsx`, `Board.tsx`, `PhoneKeys.tsx`); `e-apps.spec.ts` |
| U10 | D Pano, bilgisayar | Panoda + Column adı sormadan "New column" ekliyor ve onu Done'ın sağına, en sona koyuyor. Adı vermek için başlığa ayrıca tıklamak gerekiyor. | İki adım; yeni sütun çoğunlukla Done'dan önce olmalı (iş Done'da biter). Trello'nun ve Jira'nın sütun ekleme alanının adı önce sorduğu kanısındayım, ama doğrulamadım. | + Column'a basınca yerinde ad alanı açılsın (Enter ekler, Esc vazgeçer); yeni sütun Done'dan önce gelsin. | Cila | Onaylandı, yapıldı: + Column ve panonun menüsündeki Add column yerinde ad sorar (Enter ekler, Esc vazgeçer); yer verilmeden eklenen açık sütun ilk Done ya da Dropped sütunundan önce girer, Done ya da Dropped türündeki en sona (`board.ts`, `Board.tsx`, `styles.css`); `board.test.ts`, `d-boards-more.spec.ts` |

## Özellik önerileri (kararını bekliyor)

2.–7. dilimde (ilk açılış, notlar, görevler, arama, Settings, Help, pano, app'ler, takvim, space ve sync, Chat, bildirim ayarları, ajan, telefon kabuğu, Files, Keys) değer katacak bir eksik görmedim; uydurmadım.

## Notlar

- **Telefonda yazma:** Chromium'da iPhone kullanıcı ajanıyla editör iOS'un tuş yolunu seçiyor, Playwright'ın tuşları o yola uymuyor ve sahte hatalar çıkıyor (liste bozuluyor, karakter düşüyor). Telefon projesi iPhone boyutu ve dokunmayla ama bilgisayarın kullanıcı ajanıyla çalışır; uygulama telefonu dokunma ve boyuttan tanıdığı için düzen aynıdır. iOS klavyesinin kendisi gerçek iPhone'da denenir.
- **GitHub'da telefon testleri:** ilk koşuda telefonda yedi test düştü. Boş editöre dokununca iPhone klavyesi büyük harfle başlasın diye gizli bir alan odağı bir anlığına alıp geri veriyor (`packages/editor` `handKeyboard`); yavaş makinede test o anda yazınca ilk harfler oraya gidiyordu. Kişi o anda yazamaz, klavye daha açılmamıştır: uygulama hatası değil. Testler alan odağı aldıktan sonra yazar (`typeInto`). Telefonda app sihirbazında da test, kayarak gelen adımı beklemeden Next arıyordu; artık adım yerine oturunca okur.
- **Telefonda dokunma alanları:** Browse, not, Inbox, ekleme sayfası, Scheduled, Search ve Settings ölçüldü; görünen her dokunma alanı 44 px ya da üstü. Tek istisna Search'teki All · Notes · Tasks… sekmeleri (32 px), iPhone'un segmentli seçicileri gibi.
- **Test sunucusu:** her koşu boş bir klasörle başlar; sahibi `global-setup.ts` API'yle kurar. Her test kendi space'ini açar, her kişi kendi davetiyle (davet linki tek kullanımlık) ve kendi e-postasıyla katılır (aynı e-postayla dakikada 5 giriş sınırı). Test hesapları `e2e/server.ts`'te, yalnız bu yerel sunucu için.
- **Bildirimlerin gidişi:** tarayıcı ve telefonda Web Push ile, tarayıcının dış servisi üzerinden gider; bu bilgisayardaki test oraya ulaşmaz. Gidişi sunucunun testleri (`notices.test.ts`, `push.test.ts`) ve gerçek cihaz denemesi kapsar; e2e ayarları kapsar.
- **Geliştirme sunucusunda ağır paketler:** PDF (`pdfmake`) ve Excel (`xlsx`) yalnız kullanılınca yükleniyor; geliştirme sunucusu onları ilk kullanıldıklarında paketleyip açık sayfaları yeniden yüklüyordu, o anda açılan testler başlangıç ekranında kalıyordu. `vite.config.ts` `optimizeDeps` ile açılışta paketlenir; yayındaki uygulamayı etkilemez.
- **Yazılan Markdown:** `#`, `**` gibi yazılanlar biçime dönmez, dosyada kaçırılır (PLAN 4.2); testler buna göre.

## Testler

`pnpm e2e`: masaüstü ve telefon boyutunda 158 koşu (121 geçer, 37'si bilerek yalnız bir boyuta ait: bilgisayarda sürükle-bırak, dosya indirme ve yükleme, içe aktarma, sekmeler, sütun ve faz, History, iki kişili kart ve Chat; telefonda Browse, Status'tan taşıma, çevrimdışı şeridi). Her test sonunda sayfada yakalanmamış hata olmaması da denetlenir. Ayrıca `h-spaces.spec.ts` taşımayı ve çakışmayı, `f-calendar.spec.ts` Google'ı ve takvimde taşımayı, `k-agent.spec.ts` ajanın DM'ini, `c-tasks-more.spec.ts` Activity'yi, `e-apps-more.spec.ts` Edit app'i ve Excel'i de kapsar.

| Dosya | Ne |
|---|---|
| `smoke.spec.ts` | Not yazıp hemen yenileyince yazılan duruyor; test sunucusu cevap veriyor |
| `a-first-run.spec.ts` | Welcome notu, başlangıç sayfası, telefonda Browse; Personal'ı (sahte) OneDrive'a bağlayınca önceki not gidiyor |
| `b-notes.spec.ts` | Yazılan yazıldığı gibi, liste istisnası; Bold; Rename; sormadan silme ve Undo; Trash ve geri alma; History'nin Escape'i; Markdown dışa aktarma; Quick notes |
| `c-tasks.spec.ts` | Görev ekleme ve yenileme; tamamlama ve Undo; bugünkü görev Scheduled'da; tarihli görevden sonra eklenen tarihsiz |
| `g-search.spec.ts` | Bir kelimeyle bulup açma (Ctrl+K, telefonda Search) |
| `l-screens.spec.ts` | Dark hemen uygulanıyor; Help'te konuya gitme |
| `b-notes-blocks.spec.ts` | Heading 1, kod bloğu, tablo, callout, link, resim, Excel'den yapıştırma, PDF ve HTML, taşıma, sekmeler |
| `c-tasks-more.spec.ts` | Öncelik, etiket, alt görev, bölüm, sürükleyerek sıralama, etiketin görünümü ve Favorites |
| `d-boards-more.spec.ts` | Software şablonu, sütun ekleme, faz kapatma |
| `e-apps-more.spec.ts` | CSV içe ve dışa aktarma, tablo görünümü, Gym |
| `h-together.spec.ts` | Doğrudan mesaj, telefonda çevrimdışı şeridi |
| `l-screens-more.spec.ts` | Recent searches, Files'a yükleme, Keys |
| `h-team.spec.ts` | Kartı birine verip Remind, kartta ve Chat'te @ ile kişi, Chat'te dosya, paylaşılan space'in People'ı |
| `d-boards.spec.ts` | Kart ekleme ve yenileme; sürükleyerek Doing'e; telefonda Status'tan Doing'e; yorum; adsız kişinin kartında You; kartın Priority ve Due seçicileri |
| `e-apps.spec.ts` | CRM New app'ten kurulup Home'da açılıyor; şirket formu Name'de açılıyor, kayıt tabloda ve yenilemeden sonra |
| `f-calendar.spec.ts` | Outlook ve Google bağlanınca bugünkü işleri Scheduled'da; bugünkü görev takvimde; takvim bugün şimdiki saatte açılıyor |
| `h-spaces.spec.ts` | İki kişi iki cihazda: birinin yazdığı not öbüründe açılıyor, öbürünün eklediği geri geliyor |
| `i-chat.spec.ts` | #general'da iki kişi yazışıyor; mesaj aramayla bulunuyor |
| `j-notifications.spec.ts` | Kapatılan bildirim türü yenilemeden sonra kapalı |
| `k-agent.spec.ts` | Ajan OAuth'la bağlanıp MCP'yle not yazıyor ve görev ekliyor; açık uygulamada saniyeler içinde görünüyor |
