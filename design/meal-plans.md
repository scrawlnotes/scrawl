# Tarifler ve beslenme programı

28 Ekim 2026. Kullanıcının Recipes denemesinden: yemek listesi bir programa göre yapılır (diyet gibi), takibi en az girişle. Mockup: `design/mockups.html` › Tarifler ve beslenme programı.

İlk hâli (commit 1375390) Gym gibiydi: programın günü Today'de Start ve Skip, her gün pencere açıp işaretleme, Overdue. Kullanıcı: kimse her gün her öğünü tek tek girmez; en az kayıt, en çok otomasyon. Bu doküman ondan sonraki hâli.

## 1. Akış

- **Plans:** bir diyet; günleri (Mon … Sun), From ve Until, notlarda diyetisyenin listesi. Maddeler öğün öğün; aynı öğündekiler alternatif ("or"); bir madde belli günlere özel olabilir (On); isteğe bağlı bir tarife bağlı.
- **Program kaydedilince her günü kendiliğinden Days'te bir kayıt olur**, o günün maddeleriyle. Kimse gün açmaz.
- **Days** bugünden sonrasını gösterir (From today); geçen günler gizli, All ve Calendar'da durur.
- Bugünün günü **Today**'de görünür; **Upcoming'e gelmez**. Start, Skip, Overdue yok.
- **Güne basınca** pencere: her maddenin başında checkbox (yendi), yanında **Instead** kutusu (yerine ne yendi). **Didn't follow** günü komple "uyulmadı" yapar.
- Hiçbir şey girilmeyen gün olduğu gibi kalır; zorunlu bir giriş yok.
- **Recipes**'e **Link** (tarifin sayfası). Shopping list ve tariften Add to shopping list kalır.
- Önceden kurulmuş Recipes app'leri olduğu gibi kalır.

## 2. Programın günleri

- Kaydedilince From ile Until arasındaki, programın günlerine düşen her gün için Days'te bir kayıt ve maddeleri (o günün haftagününe göre) yazılır; olan gün yeniden yazılmaz.
- Until zorunlu, varsayılanı From'dan 4 hafta sonra. Until uzatılırsa yeni günler eklenir; kısaltılırsa sonrasındaki dokunulmamış günler çöpe gider.
- Programın maddesi eklenir, değişir ya da silinirse **bugünden sonraki, dokunulmamış** günlerin maddeleri yeniden yazılır. İşaretlenmiş ya da Instead yazılmış güne dokunulmaz.

## 3. Gün

- Alanlar: Day, Plan, Status (Followed, varsayılan; Didn't follow), Notes.
- Maddeler sağda öğün öğün; alternatiflerde "or", işaretsiz satır soluk ya da çizili değil.
- Öğün başlığı: "2 to choose from", birinde işaret varsa "eaten", Instead yazılmışsa "changed".
- Tablonun başında: "2 of 4 meals · 1 changed".
- Didn't follow: düğme; Status'u Didn't follow yapar. İşaretli madde varken Didn't follow işaretlenir (uyarı).

## 4. Veri modeli

Parçalar (rol → ad): `recipes` Recipes, `ingredients` Ingredients, `meal-plans` Plans, `plan-items` Plan items, `meal-days` Days, `day-items` Day items, `shopping` Shopping list. Menü: Days, Plans, Recipes, Shopping list.

- `meal-plans`: `name`, `days` (multi, hepsi), `from` (date, zorunlu, bugün), `until` (date, zorunlu, `=today() + 27`), `items`, `followed` (rollup: Days Followed ve işaretli), `notes`. Plan days takvimi kalkar (günler Days'te kayıt).
- `plan-items`: `name`, `plan`, `meal`, `on`, `order`, `recipe`. Tablo `choose: true`.
- `meal-days`: `name`, `day`, `plan`, `status` (Followed, Didn't follow), öğün başına gizli rollup'lar: `has_N` (maddesi), `ate_N` (işaretli), `chg_N` (Instead yazılı), en çok 8 öğün; `meals`, `eaten` (bir öğün bir kez: işaretli ya da değişmiş), `changed` (rollup: Instead yazılı), `summary` ("2 of 4"), `ahead` (formula: `day >= today()`). Görünümler: From today (`ahead`, varsayılan, gün sırasıyla), All, Calendar. Takvim Today'e gelir, Upcoming'e gelmez.
- `day-items`: `name`, `day_of`, `meal`, `order`, `done` (checkbox), `instead` (text), `recipe`, `day`. Tablo `choose: true`, `edit: ['done', 'instead']`.
- **Programın kuralları** (`_rules.js`):
  - `onSave` (Plans): eksik günleri ve maddelerini yazar; Until'den sonraki dokunulmamış günleri çöpe gönderir.
  - `onSave` (Plan items): planın bugünden sonraki dokunulmamış günlerinin maddelerini yeniden yazar.
  - `action("Didn't follow")` (Days): Status'u Didn't follow yapar.
- **Genel değişiklikler** (bütün koleksiyonlar):
  - Tabloda değişen alan (`edit`) metin olabilir: hücrede küçük bir kutu, yazılınca kaydedilir. Bugün yalnız onay kutusu ve seçim.
  - Takvim görünümüne "yalnız Today" seçeneği: `upcoming: 'today'`.
  - Bağlı tabloya `instead` (onu yazılı satırın grubu seçilmiş ve "changed" sayılır).
  - Kural dilinde `dates(a, b)`: iki gün arası her gün.
  - Formdan kaydedilen kaydın onSave'i formun birlikte yazacağı satırları görür: yeni programın penceresinde yazılan maddeler günlerine gelir.
  - Önceki hâlden kalan bağlı tablo `apart` ayarı kalır, bu şablon kullanmaz; takvim tekrarındaki `until` kalır, bu şablon kullanmaz.
  - Günün adı: program · haftagünü · tarih; Days tablosu Status, Meals, Changed ile.

## 5. Ajan

- "Bugün öğlen ne yiyorum": Days'ten bugünün kaydı ve maddeleri.
- "Kahvaltıda yulaf yedim": o maddeye `done: true`. "Akşam tavuk yerine pizza": `instead: "pizza"`. "Dün uymadım": `action: "Didn't follow"`.
- Rehbere iki cümle: programın günleri kendiliğinden yazılır; gün açma, yalnız işaretle ya da Instead yaz.

## 6. Telefonda

- Today'de bugünün günü; basınca gün: öğün öğün maddeler, dokununca yendi; maddeye uzun basınca Eaten ve Instead; en altta Didn't follow.

## 7. Testler

- Core: program kaydedilince günlerin ve maddelerin yazılması (haftagünü, On, Until); Until uzayınca eklenmesi, kısalınca dokunulmamışların gitmesi; madde değişince dokunulmamış gelecek günlerin güncellenmesi, dokunulmuşların kalması; `eaten` ve `changed` sayımı; metin `edit`.
- Ajan: program yazınca günler; işaretleme, Instead, Didn't follow; Today'de bugünün günü, Upcoming'de yok.
- Web: Days'te From today; gün penceresinde işaret ve Instead kutusu; telefonda gün.
