# Gym: programlar ve gidişler (taslak)

24 Ekim 2026'da onaylandı, açık sorular önerilerle kapandı (8. bölüm). Mockup: `design/mockups.html`, "Gym: programlar ve gidişler" bölümü. Kod yazılmadı. PLAN'da 21. aşama; Roadmap fazı 21, kartlar ROA-277–280.

## 1. Amaç

Kişi salondaki programını bir kez yazar: hangi gün, hangi hareketler, kaç set, kaç tekrar. Her gidişte programı seçer; maddelerin hepsi işaretli gelir. Yapmadığının işaretini kaldırır, değişeni yazar ve kaydeder. Gitmediği günü "gitmedim" diye işaretler. Ne zaman ve ne kadar gittiğini, hangi hareketi ne kadar düzenli yaptığını ve kilonun nasıl arttığını görür.

- Bugünkü **Spor ve antrenman** şablonu (`sport.ts`, `design/more-apps.md` 4.10) olduğu gibi kalır. Gym ayrı bir şablondur.
- Kişisel taraf, **Health** grubu, Spor ve antrenmanın ardından. Adı **Gym**.

24 Ekim'de verilen kararlar:

- Program maddeleri bölüm bölüm yazılır: Warm-up, Workout, Cool-down, Cardio. Isınma, esneme ve kardiyo da maddedir.
- New workout'ta program seçilince maddeler formda hemen, işaretli dolar; tek Save ile yazılır.
- İki soru sorulur: setler tek tek takip edilsin mi (varsayılan Hayır) ve program günleri takip edilsin mi (varsayılan Evet).
- Program günleri Today ve Upcoming'e gelir. O gün **Start** ya da **Didn't go** denir.
- Yazılmamış geçmiş program günü Overdue'da kalır.
- Cevaplar sonradan Edit app… ile değişir (`design/edit-app.md`).

## 2. Sorular

| Anahtar | Soru | Tür | Varsayılan | Etkisi |
|---|---|---|---|---|
| `days` | Will you track your program days? | evet/hayır | Evet | Evet: Programs'ta Days ve From alanları, tekrar eden takvim görünümü; program günleri Today ve Upcoming'de, yazılmayan geçmiş gün Overdue'da. Hayır: hiçbiri; program yalnız gidişte seçilir. |
| `sets` | Will you track each set? | evet/hayır | Hayır | Hayır: gidişte her hareket bir satır (3 × 12, 45 kg). Evet: her set bir satır, kendi tekrarı ve kilosuyla. |

Soru sayfası bugünkü sihirbazın sayfasıdır; yeni ekran yok.

## 3. Parçalar

Beş koleksiyon ve tanıtım notu. Roller (`design/scrawl-apps.md` 4.1): `programs`, `program-items`, `gym-workouts`, `workout-items`, `exercises`.

### 3.1 Programs

| Alan | Tür | Not |
|---|---|---|
| Name | ad | "3 Gün Full Body" |
| Days | çoklu seçim | Mon … Sun; yalnız `days` Evet ise |
| From | tarih | yalnız `days` Evet ise; varsayılan kurulduğu gün; günler bu günden sayılır |
| Duration | süre | 60 min |
| Notes | gövde | yoğunluk, ilerleme kuralı, boş gün kardiyosu: düz metin |
| Items | rollup | Program items sayısı |
| Done | rollup | Done durumundaki gidiş sayısı |
| Last | rollup | son gidişin günü |

Ekranında solda alanlar ve not, sağda **Items** tablosu bölümlerine göre gruplu (4.2).

### 3.2 Program items

| Alan | Tür | Not |
|---|---|---|
| Program | link · Programs | zorunlu |
| Part | seçim | Warm-up, Workout, Cool-down, Cardio |
| Order | sayı | bölüm içindeki sıra; tabloda sürükleyince değişir |
| Exercise | link · Exercises | zorunlu; yazılan ad yoksa Exercises'e eklenir |
| Sets | sayı | 3 |
| Reps | sayı | 12; iki yana yapılan hareketin notunda "Each side" |
| Time | süre | 5 min, 30 s |
| Rest | süre | 1 min 30 s, 2 min |
| Note | metin | "Göğüs seviyesinde itin" |

Hepsi tek sayıdır, aralık yazılmaz: gidiş onları olduğu gibi alır, hesaba katılır ve sıralanır (25 Ekim). Süre saniyeyle de yazılır: "90 s", "1 min 30 s".

### 3.3 Workouts

| Alan | Tür | Not |
|---|---|---|
| Name | ad | kaydederken "3 Gün Full Body · Oct 23" |
| Day | tarih | zorunlu, varsayılan bugün |
| Program | link · Programs | seçilince maddeler dolar (4.1) |
| Status | seçim | Done, Didn't go; varsayılan Done |
| Duration | sayı · süre | |
| Moves | formül | Workout bölümünde "7 of 8" |
| Notes | gövde | "Hastaydım" |

Görünümler: **This month**, **This week**, **All**, **Calendar** (ay; Done yeşil, Didn't go gri, yazılmamış program günü kırmızı, gelecek günler çerçeveli). Tablonun altında Done ve Didn't go sayıları ve toplam süre.

Kontroller:

- Aynı programın aynı güne iki gidişi işaretlenir: iki cihazdan iki kez Didn't go'ya basılabilir.
- Didn't go olan gidişte işaretli madde varsa işaretlenir.

### 3.4 Workout items

| Alan | Tür | Not |
|---|---|---|
| Workout | link · Workouts | zorunlu |
| Exercise | link · Exercises | zorunlu |
| Part, Order | programdaki gibi | |
| Done | onay kutusu | varsayılan işaretli |
| Set | sayı | yalnız `sets` Evet ise: 1, 2, 3 |
| Sets | sayı | yalnız `sets` Hayır ise |
| Reps | sayı | |
| Kg | sayı | |
| Time | süre | |
| Last time | metin | doldururken yazılır: "42,5 kg · 3 × 12" |
| Day | tarih | gidişin gününü alır (Spor'daki Sets gibi) |

### 3.5 Exercises

| Alan | Tür | Not |
|---|---|---|
| Name | ad | "Chest Press Machine", "Göğüs (kapı eşiği) esnetme" |
| Muscle | seçim | Chest, Back, Legs, Shoulders, Arms, Core, Full body |
| Best | rollup | işaretli satırlarda en büyük Kg |
| Last done | rollup | işaretli satırlarda en son gün |
| Last 4 weeks | formül | son 28 günde kaç gidişte yapıldığı, kaç gidişte programda olduğu: "4 of 8" |
| Regular | formül | ikisinin oranı, yüzde; %70'in altı kırmızı |
| Notes | gövde | "Koltuk 4. delikte" |

Ekranında sağda **Done** tablosu: her gidiş, set, tekrar, kilo; en yeni üstte. Görünümler: **Weights** (Best'i olanlar), **Warm-up and stretches**, **All**.

"Last 4 weeks" iki rollup'tan çıkar: koşulu son 28 gün olan Workout items satırları, biri yalnız işaretliler. `sets` Evet ise yalnız `set` 1 olan satırlar sayılır; böylece bir gidiş bir kez sayılır.

## 4. Motora eklenenler

Gym'in istedikleri, başka şablonların da kullanabileceği biçimde.

### 4.1 Alan değişince çalışan kural: `onChange`

Program seçilince maddelerin formda, kaydetmeden önce dolması için.

```js
onChange("program", "Fill from the program", () => {
  for (const i of find("Program items", { program: program })) {
    const before = find("Workout items", { exercise: i.exercise, done: true }).filter((w) => w.day < day)
    const last = before.find((w) => w.day == max(before.map((b) => b.day)))
    add("Workout items", { exercise: i.exercise, part: i.part, order: i.order, done: true,
      sets: i.sets, reps: i.reps, time: i.time,
      kg: empty(last) ? null : last.kg, last_time: empty(last) ? "" : text(last.kg) + " kg · " + text(last.sets) + " × " + text(last.reps) })
  }
})
```

- **Formda:** alan değişince kural çalışır, ama 13. aşamadaki gibi önce yalnız değişiklik listesini çıkarır. Bu kayda bağlı eklenecekler formun bağlı tablosunda **taslak satır** olarak görünür: düzenlenir, işareti kaldırılır, sırası değişir. Save kayıtla birlikte bir kerede yazar, Cancel hepsini bırakır. Alan yeniden değişirse kuralın önceki taslak satırları kalkar, yenileri gelir.
- **Başka yerden:** tablodaki hücre, içe aktarma, ajanın `save_record`'u alanı değiştirirse kural kaydederken çalışır, `onSave` gibi.
- **`number("12")`:** dile eklenen yeni işlev; metni sayıya çevirir, sayı yoksa boş verir. Aralıkta üst sınırı verir: `number("8–12")` 12 (8. bölüm).
- **Uygulama:** `rules.ts`'e dördüncü çağrı `onChange(field, name, body)`; `run.ts` aynı `runRule`. Formun taslağı web'de `RecordForm`'un durumunda tutulur: `pending: Change[]`. Kaydederken `applyChanges` kayıtla birlikte yazar.

### 4.2 Bağlı tabloda gruplama

- Bağlı tablo bloğuna `group: ["part"]` ya da `group: ["part", "exercise"]`.
- Grup başlığı alanın değeri ve sayısıdır: "Workout 8". Başlıkta **Untick all**, grubun onay kutularının hepsini kaldırır. İkinci seviyenin başlığında kendi onay kutusu vardır: setlerin hepsini işaretler ya da kaldırır.
- Her grubun sonunda "+ Add to Warm-up": eklenen satır o grubun değeriyle gelir.
- Telefonda liste, başlıklar bölüm başlığı olarak.

### 4.3 Tekrar eden takvim günleri

Program günlerinin Today'de, Upcoming'de ve Overdue'da görünmesi için. Bugün takvime giren kayıt bir günde durur; burada bir kayıt (program) her hafta belli günlerde görünür ve o günü başka bir kayıt (gidiş) kapatır.

```json
{ "kind": "calendar", "calendar": { "repeat": { "days": "days", "from": "from",
  "closedBy": { "collection": "Workouts", "link": "program", "day": "day" },
  "start": "Start", "skip": { "label": "Didn't go", "set": { "status": "Didn't go" } } }, "upcoming": true } }
```

- **Gün:** `days` alanındaki her hafta günü, `from`'dan sonra. Dosyaya hiçbir şey yazılmaz; günler okurken hesaplanır. Bu yüzden sync'te çakışma da olmaz.
- **Kapanış:** `closedBy` koleksiyonunda bu kayda bağlı ve günü o gün olan bir kayıt varsa gün kapanmıştır; durumu ne olursa olsun.
- **Today:** bugünün kapanmamış günü, kaydın satırı gibi (renk çizgisi, adı, koleksiyonu); altında **Start** ve **Didn't go**.
- **Overdue:** kapanmamış geçmiş günler, `from`'dan sonra, eskisi altta. 13. aşamadaki "geçmiş kayıt geç kalmış sayılmaz" kuralının tek istisnası budur.
- **Upcoming:** gelecek günler, düğmesiz.
- **Start:** `closedBy` koleksiyonunda yeni kayıt formu açar: gün o gün, link bu kayıt. Link değiştiği için `onChange` çalışır, maddeler dolar.
- **Didn't go:** `skip.set` değerleriyle o güne bir kayıt yazar. Toast'ta "Wed, Oct 21: didn't go" ve Undo.
- **Reschedule:** Overdue'nun Reschedule'ı bu günlere dokunmaz.
- **Sayılar:** kenar çubuğundaki Today ve Upcoming sayılarına girer.
- **Telefonda:** aynı satır ve düğmeler. Gidiş formunda bir satıra dokununca sheet açılır: Done, Sets, Reps, Kg; − ve + ile.
- **Uygulama:** core'da takvim görünümünün okuyucusu (`calendar` ayarları) `repeat`'i okur. Today ve Upcoming'in kayıt toplayıcısı, görünümün koşullarına uyan kayıtlardan günleri üretir ve `closedBy` koleksiyonunu bir kez okur.

## 5. Tanıtım notu

"About Gym". Bölümleri öbür şablonlardaki gibi:

- **What's in it:** Programs, Workouts, Exercises; program ve gidiş maddeleri.
- **How to use it:**
  - Programını yaz: günleri, maddeleri bölüm bölüm.
  - Salonda Start'a bas; yapmadığının işaretini kaldır, değişeni yaz, Save.
  - Gitmediğin gün Didn't go.
- **By itself:**
  - Program seçilince maddeleri işaretli gelir, kilo son seferden.
  - Program günleri Today ve Upcoming'de, yazılmayan Overdue'da.
  - Her hareketin düzenliliği ve en iyi kilosu.

Cevaba göre değişir: `days` Hayır ise Today satırları yok, `sets` Evet ise set satırları anlatılır.

## 6. Ajan

- `create` ile `kind: "app"`, `templates: ["gym"]`, `answers: { gym: { days, sets } }`.
- **Gidiş:** `save_record` Workouts'a `program` ile; `onChange` kaydederken maddeleri yazar. Ajan ardından Workout items'ı düzeltir.
- **Gitmedim:** `save_record` Workouts'a `status: "Didn't go"` ile.
- **Rehber:** Gym bölümü; tekrar eden takvim günlerinin dosyada değil hesapta olduğu, gitmedim ve gidiş kaydının nasıl yazıldığı.

## 7. Testler

- **core apps:** Gym tek başına ve dört cevap birleşimiyle kurulur; şemalar ve kurallar denetimden geçer. Bütün kişisel şablonlarla birleşimler bugünkü testin içinde.
- **`onChange`:** formda taslak satırlar, alan yeniden değişince taslağın yenilenmesi, Cancel'ın hiçbir şey yazmaması, Save'in bir kerede yazması; hücreden ve ajandan değişince kaydederken çalışması; son seferin kilosu; `number()` ve aralıklar.
- **Gruplama:** iki seviye, Untick all, gruba ekleme.
- **Tekrar eden günler:** `from`'dan önce gün yok; kapanan gün kalkar; Didn't go kaydı ve Undo; Overdue sırası; Upcoming'de düğmesiz; aynı güne iki kayıt kontrolü; `days` boş program hiçbir yerde görünmez.
- **Exercises'in formülleri:** set takibi açıkken bir gidişin bir kez sayılması.
- **agent:** Gym'i kurmak, gidiş ve gitmedim yazmak.
- **Tarayıcıda:** mockup'taki akış baştan sona, masaüstünde ve telefonda.

## 8. Kararlar

24 Ekim'de önerilerle kapandı.

1. **Spor ve Gym aynı app'te:** Exercises ortak olur (rol `exercises`), ikisinin alanları birleşir. Spor da kuruluysa Gym'in gidiş koleksiyonu "Gym workouts" adını alır.
2. **Programda aralıkla yazılan tekrar ("8–12"):** gidişe üst sınır gelir; ilerleme kuralı üst sınırı hedef alır. `number("8–12")` 12 verir. 25 Ekim: programda aralık kalktı, Sets ve Reps sayı, Time ve Rest saniyeli süre; hazır programda aralığın üstü yazıldı.
3. **Overdue:** `from`'dan bu yana yazılmayan bütün program günleri durur.
4. **Dilimler:** her biri ayrı kart.
   1. `onChange` ve taslak satırlar, bağlı tabloda gruplama.
   2. Tekrar eden takvim günleri: Today, Upcoming ve Overdue.
   3. Gym şablonu, tanıtım notu, ajan, telefon.
5. **PLAN'daki yeri:** 21. aşama "Gym ve Edit app"; Dropbox 22, Google Drive 23, Mobil 24 olur. Edit app (`design/edit-app.md`) aşamanın ilk dilimidir.
