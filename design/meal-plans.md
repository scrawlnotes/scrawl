# Tarifler ve beslenme programı

28 Ekim 2026. Kullanıcının Recipes denemesinden: günlük yemek planı kullanışsız; yemek listesi bir programa göre yapılır (diyet gibi), plan ekranı o programı takip etmek için. Gym'in program ve antrenman düzeni (`design/gym.md`) örnek alınır. Mockup: `design/mockups.html` › Beslenme programı.

## 1. Ne değişir

- **Recipes**'e **Link** gelir: tarifin olduğu sayfa. Gerisi aynı (tür, süre, kaç kişilik, etiketler, malzemeler).
- **Meal plan** (her güne bir yemek) kalkar. Yerine iki ekran:
  - **Plans:** bir diyet ya da beslenme programı, öğün öğün maddeleriyle.
  - **Days:** programın her günü, yenenler işaretli.
- **Shopping list** kalır; bir tariften Add to shopping list kalır. "Shop for the week" kalkar (günlük plandan çalışıyordu).
- Önceden kurulmuş Recipes app'leri olduğu gibi kalır.

## 2. Plans

- Bir programın adı, **Days** (hangi günler: Mon … Sun; her gün için hepsi), **From** (başladığı gün), **Until** (bittiği gün, boş olabilir) ve notları: diyetisyenin listesi PDF olarak eklenir.
- Programın maddeleri sağda tek tabloda, öğün öğün gruplu (Breakfast, Snack, Lunch, Dinner; öğünler sihirbazda değişir).
- Bir madde: ne yeneceği ("2 yumurta, 30 g beyaz peynir, 5 zeytin"), **On** (Every day ya da Mon … Sun: o günlere özel), isteğe bağlı **Recipe**.
- **Aynı öğündeki maddeler alternatiftir**: "2 yumurta…" ya da "1 kase yulaf…". Tabloda ikincisinden başlayarak satırın başında "or" yazar.
- Bir öğünün bazı maddeleri belli günlere özel olabilir: Dinner, Mon ve Thu: fırında balık; Every day: tavuk sote. O gün ikisi de alternatif olur.
- Programın günleri Today ve Upcoming'e gelir (Gym'deki gibi): **Start** o günü açar, **Skip** "uyulmadı" diye kapatır. Yazılmamış geçmiş gün Overdue'da kalır. Until'den sonra gelmez.

## 3. Days

- Bir gün: tarih, program, durumu (**Followed** ya da **Skipped**), notları.
- Program seçilince (Start ya da elle) o günün maddeleri gelir, hiçbiri işaretsiz, öğün öğün; alternatifler alt alta.
- Yenen işaretlenir; listede olmayan bir şey yendiyse **+ Add** ile eklenir, **Off plan** olarak görünür.
- Başlıkta "3 of 4 meals": işaretli maddesi olan öğünler / o gün programda olan öğünler. Off plan olanlar ayrıca sayılır: "1 off plan".
- Listesi This week, This month ve Calendar ile; takvimde günler Followed, Skipped ya da yazılmamış olarak.

## 4. Veri modeli

Parçalar (rol → ad): `recipes` Recipes, `ingredients` Ingredients, `meal-plans` Plans, `plan-items` Plan items (Plans'ın satırları), `meal-days` Days, `day-items` Day items (Days'in satırları), `shopping` Shopping list.

- `recipes`: + `link` (url).
- `meal-plans`: `name`, `days` (multi, Mon … Sun), `from` (date, zorunlu, bugün), `until` (date), `items` (rollup count), `followed` (rollup count, Days Followed), `last` (rollup max day). Görünüm **Plan days**: takvim, `repeat: { days, from, until, closedBy: { Days, plan, day }, start: 'Start', skip: { label: 'Skip', set: { status: 'Skipped' } } }`.
- `plan-items`: `name` (ne yeneceği), `plan` (link, zorunlu), `meal` (select, sihirbazın öğünleri), `on` (select: Every day, Mon … Sun; varsayılan Every day), `order` (number), `recipe` (link, isteğe bağlı).
- `meal-days`: `name` (program · gün), `day` (date, zorunlu, bugün), `plan` (link), `status` (Followed, Skipped; varsayılan Followed), her öğün için sırasıyla iki gizli rollup: `has_N` (o öğünün plandan maddesi) ve `ate_N` (işaretli olanı), en çok 8 öğün; `meals` ve `eaten` (formula: maddesi ya da işaretlisi olan öğün sayısı), `off` (rollup count: Off plan), `summary` (formula: "3 of 4"), `this_week`, `this_month`.
- `day-items`: `name`, `day_of` (link Days, zorunlu), `meal` (select), `order`, `done` (checkbox, varsayılan işaretsiz), `off_plan` (checkbox, varsayılan işaretli: elle eklenen Off plan, plandan gelen değil), `recipe` (link), `day` (date, gününden).
- **Doldurma** (`onChange("plan")`, Gym'deki gibi): programın maddelerinden `on` Every day ya da günün haftagünü olanlar `day-items` olarak eklenir, işaretsiz ve Off plan değil.
- **Yenen öğün sayısı:** bir öğünde iki alternatif işaretlenirse iki sayılmasın diye öğün başına rollup sayılır, formül her öğünü bir kez sayar. Kural yazmadığı için tabloda tik atınca da, yeni günün penceresinde taslak satırlarla da doğru.
- **Alternatifler tabloda:** bağlı tabloya `choose` (bir grubun satırları alternatif: ikinciden başlayarak "or", işaretsiz satır soluk ya da çizili değil, grup başlığında "eaten" ya da "2 to choose from", tablonun başında "3 of 4 meals") ve `apart` (onu işaretli satır alternatif sayılmaz, adının yanında alanın adı: Off plan; başlıkta "· 1 off plan"). Fields'ta değişmez, şablon verir; telefonda da aynı.
- **Takvim tekrarında bitiş:** `RepeatSettings`'e `until?: string` (date alanı) eklenir; o günden sonra gün üretilmez. Gym etkilenmez.
- Kontroller: Skipped bir günde işaretli madde varsa işaretlenir; aynı programın aynı günde iki günü işaretlenir.

## 5. Sihirbaz

- Öğünler (liste): Breakfast, Snack, Lunch, Dinner.
- Alışveriş listesi tutulsun mu (evet/hayır).
- Hazır program yok: diyet kişiye özel, boş başlar. About notu nasıl yazılacağını anlatır.

## 6. Telefonda

- Today'de programın günü: Start ve Skip.
- Gün açılınca öğün öğün maddeler, dokununca işaretlenir; + Add ile listede olmayan.

## 7. Testler

- Core: şablonun parçaları ve alanları; doldurmanın haftagününe göre maddeleri seçmesi; `meals` ve `eaten` (iki alternatif işaretli bir öğün bir sayılır); Until'den sonra gün gelmemesi.
- Ajan: program ve maddeler yazma, günü başlatma, işaretleme, Off plan ekleme; tarifin Link'i.
- Web: tarayıcıda programın penceresi, günün penceresi, Today'de Start ve Skip; telefonda gün.
