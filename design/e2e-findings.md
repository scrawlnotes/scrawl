# E2E ve UX taraması: bulgular

Plan: `design/e2e.md`. Hatalar sormadan düzeltilir ve burada kaydı tutulur; UI/UX bulguları ve özellik önerileri karar bekler.

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
| H8 | D Pano, E Koleksiyon | Kartın ve görevin açıklaması, kartın yorum kutusu ve kaydın notları ekran okuyucuya adsız "textbox" olarak görünüyordu. | `Description.tsx`: boşken gösterdiği metin (Write a comment…, Add a description…) adı da olur. | Düzeltildi, `d-boards.spec.ts` |

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

## Özellik önerileri (kararını bekliyor)

2. ve 3. dilimde (ilk açılış, notlar, görevler, arama, Settings, Help, pano, app'ler, takvim) değer katacak bir eksik görmedim; uydurmadım.

## Notlar

- **Telefonda yazma:** Chromium'da iPhone kullanıcı ajanıyla editör iOS'un tuş yolunu seçiyor, Playwright'ın tuşları o yola uymuyor ve sahte hatalar çıkıyor (liste bozuluyor, karakter düşüyor). Telefon projesi iPhone boyutu ve dokunmayla ama bilgisayarın kullanıcı ajanıyla çalışır; uygulama telefonu dokunma ve boyuttan tanıdığı için düzen aynıdır. iOS klavyesinin kendisi gerçek iPhone'da denenir.
- **Yazılan Markdown:** `#`, `**` gibi yazılanlar biçime dönmez, dosyada kaçırılır (PLAN 4.2); testler buna göre.

## Testler

`pnpm e2e`: masaüstü ve telefon boyutunda 60 koşu (49 geçer, 11'i yalnız bir boyuta ait). Her test sonunda sayfada yakalanmamış hata olmaması da denetlenir.

| Dosya | Ne |
|---|---|
| `smoke.spec.ts` | Not yazıp hemen yenileyince yazılan duruyor; test sunucusu cevap veriyor |
| `a-first-run.spec.ts` | Welcome notu, başlangıç sayfası, telefonda Browse; Personal'ı (sahte) OneDrive'a bağlayınca önceki not gidiyor |
| `b-notes.spec.ts` | Yazılan yazıldığı gibi, liste istisnası; Bold; Rename; sormadan silme ve Undo; Trash ve geri alma; History'nin Escape'i; Markdown dışa aktarma; Quick notes |
| `c-tasks.spec.ts` | Görev ekleme ve yenileme; tamamlama ve Undo; bugünkü görev Scheduled'da; tarihli görevden sonra eklenen tarihsiz |
| `g-search.spec.ts` | Bir kelimeyle bulup açma (Ctrl+K, telefonda Search) |
| `l-screens.spec.ts` | Dark hemen uygulanıyor; Help'te konuya gitme |
| `d-boards.spec.ts` | Kart ekleme ve yenileme; sürükleyerek Doing'e; telefonda Status'tan Doing'e; yorum; adsız kişinin kartında You; kartın Priority ve Due seçicileri |
| `e-apps.spec.ts` | CRM New app'ten kurulup Home'da açılıyor; şirket formu Name'de açılıyor, kayıt tabloda ve yenilemeden sonra |
| `f-calendar.spec.ts` | Outlook bağlanınca bugünkü toplantı Scheduled'da; bugünkü görev takvimde |
