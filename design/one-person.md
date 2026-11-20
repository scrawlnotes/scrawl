# Bir hesap, bir kişi (taslak)

Sunucu space'lerinde aynı hesap kişi listesinde birden çok kez çıkıyor. Bu taslak, bunun bir daha olmamasını ve var olan kopyaların temizlenmesini anlatıyor.

## 1. Sorun

20 Kasım'da OzBI'nin `.scrawl/people.json` dosyasında:

| Kimlik | Ad | E-posta | Son görülme | Ne yapmış |
|---|---|---|---|---|
| `d2820f11…` | Eren | eren@ozbiapp.com.tr | 20 Kasım | Bugünkü kurulum; ajanı (`d2820f11…:1f162483`) da bu kimlikte. Panolarda 400'den fazla izi var. |
| `caf87318…` | Eren | eren@ozbiapp.com.tr | 1 Kasım | Hiçbir şey yazmamış. |
| `e4978ba7…` | Eren | eren@ozbiapp.com.tr | 29 Ekim | İki yorumda `@Eren` olarak anılmış ("Eren İş Takibi" ve "ozbiapp-seo-pipeline"). |
| `ed103627…` | (yok) | (yok) | 19 Ekim | Hiçbir şey yazmamış. |
| `19497c1b…` | (yok) | (yok) | 24 Ekim | Hiçbir şey yazmamış. |

İki Unnamed, Kaan'ın dört space'ini de aynı saniyede açmış. Bunlardan biri yalnız Kaan'ın üyesi olduğu Game Development. Demek ki ikisi de Kaan'ın hesabıyla girilmiş, adı boş kurulumlar.

Bunun zararı yalnız görüntüde değil:

- Atama ve mention listesinde kişi üç kez çıkıyor. Kişiler de ajanlar da yanlış olanı seçiyor.
- Yanlış kimliğe yapılan mention hiçbir hesaba gitmiyor; bildirim ve "For you" çıkmıyor. Sunucu mention'daki kimliği hesap kimliği olarak okuyor (`chat.ts`, `notices`). `e4978ba7` adına yapılan iki mention Eren'e ulaşmadı.
- Eski kimliğe atanan iş Today'de ve Upcoming'de görünmüyor (`isMine`).

## 2. Bugünkü kural ve nerede kaçıyor

`design/server.md` 6: hesabın kimliği, daveti kabul eden cihazdaki `me.json` kimliğidir. Başka bir cihazda girilince o cihaz hesabın kimliğini alır (`session.takeAccount`, `sync.signedInToServer`). Space açılınca satır `me.id` ile yazılır (`session.meetSpaces` → `withPerson`).

Kaçak şurada: satırı yazan `meetSpaces`, sunucu space'inde `me.id`'nin hesabınkiyle aynı olup olmadığına bakmıyor. `takeAccount` yalnız giriş anında çalışıyor. Bir cihazın `me.id`'si başka bir yoldan farklı kalırsa ya da sonradan değişirse, o cihaz space'i her açtığında yeni bir satır yazıyor. Böyle yollar:

- Tarayıcı kişisel space'i (OPFS/IndexedDB) siliyor ama sunucu anahtarı (localStorage) kalıyor. Uygulama yeni bir `me` kuruyor, giriş istemediği için `takeAccount` çalışmıyor. Adsız olduğu için bu yol Unnamed satırlarına uyuyor.
- Kişisel space'i paylaşan iki cihazdan biri eski `me`'yi bellekte tutup geri yazıyor.

Sunucunun kaydı (`versions`: `author_id`, `device_id`, zaman) her satırı ilk yazan yazımı gösteriyor:

| Satır | Yazan hesap | Cihaz | Ne zaman |
|---|---|---|---|
| `d2820f11` (Eren'in hesabı) | Eren | Mac, 21 Ekim 16:31:27'de kayıtlı | 21 Ekim 16:31:28 |
| `caf87318` | Eren | Aynı Mac | 23 Ekim 10:12 |
| `e4978ba7` | Eren | iPhone, 29 Ekim 10:28:13'te kayıtlı | 29 Ekim 10:28:13 |
| `ed103627` | Kaan | KAANMONSTER, 19 Ekim 19:26:38'de kayıtlı | 19 Ekim 19:26:38 |
| `19497c1b` | Kaan | Windows, 24 Ekim 12:39:40'ta kayıtlı | 24 Ekim 12:39:41 |

Bundan iki yol çıkıyor:

- **Girişte yarış (üç satır):** `e4978ba7`, `ed103627` ve `19497c1b`, cihazın sunucuya girdiği saniyede yazılmış. Anahtar kaydedilince (`keepSignIn` → `keepServers`) kişisel space'te taşınan sunucu space'leri hemen açılıyor ve `meetSpaces` satırı cihazın o anki, kendi `me.id`'siyle yazıyor. Hesabın kimliği (`takeAccount`) ancak bir an sonra, `onDone`'da alınıyor. Kaan'ın iki satırının adsız olması da bundan: o anda `me` hesaptan doldurulmamıştı. Kaan'ın dört space'i de aynı saniyede yazılmış.
- **Girişten sonra değişen kimlik (bir satır):** `caf87318`'i, iki gün önce `d2820f11`'i yazan Mac'in kendisi yazmış. O cihazda `me` sonradan yeni bir kimlikle kurulmuş, anahtar ise yerinde kalmış. Bu yüzden giriş istenmemiş ve `takeAccount` çalışmamış. 11 dakika sonra Mac yeniden girmiş (yeni cihaz kaydı, 10:23) ve hesabın kimliğine dönmüş.

Aşağıdaki düzeltme iki yolu da kapatıyor.

## 3. Önleme: sunucu space'inde satır hesabın kimliğiyle yazılır

- `meetSpaces`, sunucu space'i için satırı o sunucudaki hesabın kimliğiyle yazar (`KnownServer.id`). OneDrive ve yerel space'ler bugünkü gibi `me.id` kullanır.
- Açılışta bilinen bir sunucunun hesap kimliği `me.id`'den farklıysa uygulama `takeAccount`'u kendisi çağırır. Böylece `isMine`, Today, Upcoming ve "you" da doğru kimliğe bakar. Bunun için giriş beklenmez.
- Tek sunucumuz var (bkz. `no-outside-servers`). İki sunucuda iki farklı hesap kimliği olma durumu bugün yok. Olursa ilk bilinen sunucunun kimliği kalır; satır her sunucuda o sunucunun hesabıyla yazıldığı için kopya çıkmaz.

Kod: `apps/web/src/session.ts` (`meetSpaces`, açılış), `apps/web/src/sync.ts` (bilinen sunucular). Veri modeli değişmez.

## 4. Var olan kopyaların temizliği

Ürüne kod eklenmez. Tek sunucu bizimki, bu yüzden temizlik bir kerelik bir betikle sunucuda yapılır:

1. Her sunucu space'inin `people.json` dosyasında, hesap kimliği olmayan ve ajan olmayan her satır için hesabı bulunur. Satırı ilk yazan yazımın `author_id`'sine bakılır (`versions`); bulunamazsa aynı e-postalı hesap alınır.
2. Space'in dosyalarında o kimlik hesabınkiyle değiştirilir: kart ve görevlerde `assignee.id`, `byId`, yorumlarda `scrawl:person/<id>` linkleri. Chat mesajlarındaki mention'lar da değişir (`messages`, `mentions`).
3. Kopya satır `people.json`'dan silinir, varsa resmi de (`.scrawl/people/<id>.jpg`).
4. Değişiklikler sunucuya normal bir yazım olarak girer; cihazlar sync'le alır, geçmişte (History) görünür.

Önce aynı betik değiştirmeden çalışır ve ne değişeceğini listeler. Liste onaylanınca yazar.

## 5. Testler

- `session` testi: sunucu space'i açılırken `me.id` hesabınkinden farklı. Satır hesabın kimliğiyle yazılır, `me.id` hesabınkine döner.
- Kişisel space'i silinmiş ama anahtarı duran bir cihaz: açılışta hesabın kimliği alınır, yeni satır çıkmaz.
- OneDrive space'i: davranış değişmez.
- Temizlik betiği, sunucu test veritabanında: önce liste, sonra yazım. Atama, yorum mention'ı ve chat mention'ı yeni kimliğe geçer, kopya satır kalmaz.

## 6. Dilimler

1. Önleme (3. bölüm), testleriyle. Sonra web'e yayın; sunucu değişmediği için sunucu yayını gerekmez.
2. Temizlik (4. bölüm): sunucuda önce listeleme, onaydan sonra yazım.
