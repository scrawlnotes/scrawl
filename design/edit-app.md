# Edit app: kurulu bir app'in cevaplarını değiştirmek (taslak)

24 Ekim 2026'da onaylandı, açık sorular önerilerle kapandı (6. bölüm). Kod yazılmadı. PLAN'da 21. aşamanın ilk dilimi; Roadmap kartı ROA-277.

## 1. Amaç

Bir app kurulurken her şablon birkaç soru sorar: CRM'de "Will you track deals?", Gym'de "Will you track each set?". Bugün bu cevaplar sonradan değişmiyor. **Add to app** (`design/scrawl-apps.md` 4.2) yalnız yeni şablon ekliyor; kurulu şablonlar soluk geliyor, soruları sorulmuyor (`AppWizard.tsx`, `installed`).

Kişi fikrini değiştirebilmeli: program günlerini artık takip etmek istemiyor, setleri tek tek yazmaya başlıyor, CRM'e aşama ekliyor. 24 Ekim'de kararlaştırıldı: **Edit app…** her app'te olacak.

## 2. Ilke: ayarlar gider, veri kalır

Bir cevap değişince yeni cevapla kurulacak olanla bugün kurulu olan karşılaştırılır.

- **Yeni cevabın getirdiği eklenir:** koleksiyon, pano, alan, ekranda blok, kural, görünüm. Bu Add to app'in bugünkü yoludur.
- **Eski cevabın getirdiği ayarlar kalkar:** kurallar, düğmeler, görünümler (Today'e ve Upcoming'e giren takvim görünümü dahil).
- **Veri hiç silinmez:** koleksiyonlar, panolar, notlar, alanlar ve kayıtlar olduğu gibi kalır. Özet bunu söyler, örneğin "Deals board stays; trash it if you don't need it".
- **Kişinin değiştirdiğine dokunulmaz:** kurulduktan sonra kişinin ya da ajanın değiştirdiği bir kural ya da görünüm kaldırılmaz, özet "changed by you, kept" der. Değişip değişmediği, şablonun ürettiğiyle karşılaştırılarak anlaşılır.
- **Geri dönmek:** cevap eskisine çevrilince kalkan ayarlar yeniden eklenir; kalan veri yerinde bulunur.

Örnekler:

| Değişen cevap | Ne olur |
|---|---|
| Gym · program günleri: Evet → Hayır | Tekrar eden takvim görünümü kalkar: Today, Upcoming ve Overdue'da program günü kalmaz. Days ve From alanları değerleriyle kalır. |
| Gym · program günleri: Hayır → Evet | Days ve From eklenir (From bugün), görünüm eklenir. Geçmiş günler Overdue'ya dolmaz, çünkü günler From'dan sayılır. |
| Gym · setler: Hayır → Evet | Workout items'a Set alanı, gidiş formuna iki seviyeli gruplama, `onChange` kuralının set satırı yazan hâli. Eski gidişler hareket başına kalır: setlere bölmek tahmin olurdu. |
| Gym · setler: Evet → Hayır | Kural hareket başına yazar. Eski set satırları kalır. |
| CRM · deals: Evet → Hayır | Deals panosu kartlarıyla kalır. Kart açan kurallar ve düğmeler kalkar. |
| CRM · aşamalar: Proposal → Quote | Sütun yeniden adlanır; kartlar izler (bugünkü `renames`). |
| CRM · aşamalar: Meeting silinir | Sütun boşsa kalkar. Kart varsa kalır, özet "Meeting has 3 deals, kept" der. |

## 3. Arayüz

- **Yeri:** app klasörünün ··· menüsünde, Add to app…'in altında **Edit app…**. Yalnız `_app.json` olan klasörde görünür. Telefonda klasörün action sheet'inde aynı yerde.
- **Pencere:** sihirbazın kendisi, başlığı "Edit Spare parts".
  - Adımlar: önce **App** sayfası, app kurarkenki gibi bugünkü değerleriyle: Name, In ve (para tutan app'te) Currencies; sonra kurulu her şablonun soru sayfası, sonra **Changes**. Şablonlar adımı yok, şablon eklemek Add to app'in işi.
  - Name app'in adını, klasörünü ve tanıtım notunu ("About …") birlikte değiştirir; In klasörü taşır, yeni klasör de açılabilir. Linkler izler.
  - Currencies: ana para birimi değişir, ikinci bir birim eklenir ya da çıkar. Tutarlar çevrilmez; alanların biçimi, toplamları ve işareti yazan formüller yeni birimle yazılır, kişinin değiştirdiği alan kalır. İkinci birim eklenince kayıtlara Currency alanı gelir, eski kayıtlar eski ana birimle dolar.
  - Changes'te bunların her biri app'in satırıyla Changed altında; Undo hepsini geri alır, açılan klasör çöpe gider.
- **Sorular:** bugünkü cevaplarla gelir. Değiştirilen sorunun başında küçük bir nokta, yanında eski cevabı ("was Yes") görünür. Liste cevabında yeniden adlanan öğe eski adını ("was Proposal"), eklenen "new" der; kaldırılan üstü çizili kalır, **Put back** ile döner; sorunun yanında kaç değişiklik olduğu ("3 changes"). Başka şablona bağlı soru bugünkü gibi nedeniyle gelir.
- **Changes sayfası:** Add to app'in özeti gibi, en çok dört bölüm; yalnız dolu olanlar görünür:
  - **Added:** eklenecekler.
  - **Changed:** yerinde değişenler: yeniden adlanan sütun ve kartları, tanıtım notunun bölümü.
  - **Taken off:** kaldırılacak ayarlar, ne olacağıyla ("Today, Upcoming and Overdue no longer show a program's days").
  - **Kept:** kalan veri ve kişinin değiştirdiği ayarlar, nedeniyle ve ne yapılabileceğiyle.

  En altta "Records are never deleted." yazar. Hiçbir cevap değişmediyse sayfa "Nothing changes" der ve Save kapalıdır.
- **Save:** bir kerede yazar. Toast'ta "Gym: 1 view taken off, 2 fields kept" ve Undo.
- **Tanıtım notu:** değişen şablonun bölümü yeni cevaplarla yeniden yazılır. Kişi o bölümü değiştirdiyse dokunulmaz, özet söyler.
- **Mockup:** `design/mockups.html`, "Edit app" bölümü: klasörün menüsü, CRM'de aşamalar ve Changes, Gym'de program günleri ve Changes, değişen yok, Undo, telefon.

## 4. Teknik tasarım

### 4.1 Core (`packages/core/src/apps/`)

- **`planEditApp(fs, folder, answers)`:**
  - `_app.json`'u okur.
  - Her şablon için iki plan üretir, şablonun bugünkü sürümüyle: eski cevaplarla (`build`) ve yeni cevaplarla.
  - Farkı çıkarır: yeni planda olup eskisinde olmayanlar **eklenecek** (Add to app'in `keepBlocked` ve aynı adlı kural denetimleriyle), eskisinde olup yenisinde olmayanlar **kalkacak ya da kalacak**.
  - Kalkacak bir kural, düğme ya da görünüm diskteki hâliyle eski planın ürettiğine eşitse kalkar, değilse "changed by you" olarak kalır.
  - Koleksiyon, pano, alan, not her zaman kalır.
- **Liste cevapları** (aşamalar, depolar, alışkanlıklar, bölümler): sihirbazın liste kontrolü her öğeye bir kimlik verir. Yeniden adlanan öğe `renames` olur. Silinen öğe, kullanan kayıt ya da kart yoksa kalkar, varsa kalır. Yeni öğe eklenir.
- **`installEditApp(fs, plan)`:** bugünkü `install.ts` yolu. Kalkanlar için de geri alma bilgisi tutar; `undoApp` onları geri yazar. En son `_app.json`'da cevaplar güncellenir; şablonun sürümü değişmez.
- **Şablon sürümü:** iki plan da şablonun bugünkü koduyla üretilir. Böylece yalnız cevabın getirdiği fark uygulanır; şablonun yeni sürümünün getirdikleri uygulanmaz. O ayrı bir iş olarak kalır (`design/scrawl-apps.md` 10).
- **Şablonların işi:** yok. Fark planlardan çıkar; her şablona ayrı "kapat" kodu yazılmaz.

### 4.2 Web ve masaüstü

- `AppWizard.tsx`'e üçüncü kip: `editing?: AppFile`. Adımlar kurulu şablonlar ve Changes. `EditSummary` Add to app'in `AddSummary`'sinin dört bölümlü hâli.
- **Oturum:** `planEditApp`, `installEditApp`; ağacı yeniden okur, Undo verir.
- **Telefonda** sheet, bugünkü sihirbaz gibi.

### 4.3 Ajan (MCP)

- **Araç sayısı değişmez.** `create`'te `kind: "app"` ve `folder` bir app ise:
  - kurulu olmayan şablon eklenir (bugünkü gibi);
  - kurulu bir şablona `answers` verilmişse cevapları değişir.
- **Sonuç:** eklenen, kalkan ve kalan şeyleri söyler.
- **Rehber:** Apps bölümüne Edit app: ayarlar gider, veri kalır.

### 4.4 Sınırlar ve güvenlik

- Kayıt, kart, alan, koleksiyon, pano ve not silinmez. Kalkanlar ayardır ve Undo ile döner.
- Değişiklik `_app.json`'un sync'iyle öbür cihazlara ve kişilere gider. Aynı anda iki kişi değiştirirse bugünkü sync kuralı geçer: son yazan kazanır, iki tarafın eklediği kalır.

## 5. Testler

- **Fark:** her şablonun her evet/hayır sorusunu iki yönde çevirmek; eklenenler ve kalkanlar beklenen; veri hiç silinmiyor; kurallar ve şemalar denetimden geçiyor. Evet → Hayır → Evet ilk kurulumla aynı ayarları veriyor.
- **Kişinin değiştirdiği:** değiştirilmiş kural ve görünüm kalıyor, özette görünüyor.
- **Listeler:** aşama yeniden adlanınca kartların izlemesi; dolu aşamanın kalması; boşun kalkması.
- **Undo:** eklenenler çöpe, kalkanlar geri, `_app.json` eski hâline.
- **Tanıtım notu:** bölümün yeniden yazılması; kişinin değiştirdiği bölüme dokunulmaması.
- **agent:** `create` ile cevap değiştirmek; sonucun söyledikleri.
- **Tarayıcıda:** Edit app… baştan sona, masaüstünde ve telefonda; Gym'de program günlerini kapatıp açmak.

## 6. Kararlar

24 Ekim'de önerilerle kapandı.

1. **Bir cevapla artık gerekmeyen koleksiyon ya da pano:** yerinde kalır, özet söyler; çöpe atmak kişinin işidir.
2. **Dilim:** tek dilim, mockup'la başlar. 21. aşamanın (Gym ve Edit app) ilk dilimidir; Gym'in soruları ilk günden değişebilsin diye Gym'den önce gelir.
