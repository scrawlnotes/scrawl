# App şablonu yazma kuralları

28 Ekim'de kişisel şablonları (Home, Recipes, Health, Habits and goals) tek tek yeniden yaparken kullanıcıyla netleşen kurallar. Yeni bir şablon önerirken, var olanı düzeltirken ya da ileride bunun için bir skill yazarken buradan başlanır.

## Amaç

Scrawl düz kayıt tutma aracı değil; insanların işlerini ve kişisel şeylerini yönettiği bir platform. Şablonlar hem insanlar hem ajanlar için. Ama yalnız ajan kullanacak diye, her gün açılıp kayıt girilen şablon yapılmaz. Ölçüt, bir insanın telefondan ya da bilgisayardan açıp en az eforla kullanabilmesi.

## Ölçüt: kullanım, alan sayısı değil

- Alanlar gerekebilir. Sorun, işi yapmanın önüne çıkan engeller: kaç ekran, kaç tıklama, önceden ne girilmiş olmalı.
- Bir iş için başka bir kaydın önceden girilmesi şart koşulmaz. Health'te randevudan önce doktor kaydı istemek yanlıştı; doktor randevunun içinde yazılır.
- Her öneride akış adım adım yürütülür: kullanıcı ne açar, ne görür, ne yazar, kaç tıklar; ajan aynı işi hangi araçla, kaç çağrıyla yapar.

## Ayrı ekran ne zaman

- Ayrı ekran yalnız gerçekten gerekiyorsa ya da fayda sağlıyorsa olur. Az değişmesi tek başına yetmez.
- Doğru örnek: Products ve Orders ayrı. Ürün tanımı az değişir ve siparişten başka bir sürü yerde kullanılır. Ama siparişin ürünleri (satırları) siparişin içinde girilir; sipariş girmek için başka ekran açılmaz.
- Yanlış örnek: Doctors. Her seferinde başka doktora gidilebilir, kime gidildiği önemli bile olmayabilir.
- Ayrı ekran yerine: yazarken önceki değerleri önermek (`suggest`), yerinde küçük pencereyle hızlı ekleme, ya da hiç sormamak.
- Arkada tutulan koleksiyonlar (satırlar, işaretlemeler, günler) menüde ana ekran olarak görünmez.

## Belli olan otomatik

- Kullanıcının bir kez söylediği şey yeniden girdirilmez. Diyet programı bir kez yazılır, günleri kendiliğinden oluşur; insan yalnız uyup uymadığını işaretler.
- Hesaplanabilen her şey hesaplanır: ilacın bitişi, hedefin ilerlemesi ve durumu, alışkanlığın serisi.
- Varsayılan, "hiçbir şey girmeden doğru" olmaktır. Giriş yalnız istisnada.

## Hazır veri

- Fayda sağlayacak hazır veri varsa yeterli miktarda üretilir ve app kurulurken gelir: Gym'de hareketler, tariflerde malzemeler, filmlerde türler. Kişi bunları tek tek girmekle uğraşmaz.
- Hazır gelen her kayıt sıradan bir kayıttır: kullanıcı yenisini ekler, değiştirir, siler.
- Yeterli miktar, insanın çoğu zaman aradığını hazır bulacağı kadar (Gym'de 72 hareket gibi). Göstermelik üç kayıt değil.

## Uygulamanın geri kalanıyla

Her öneride ayrı bir bölüm: bu işin uygulamanın başka hangi yerinde daha kısa yapıldığı. Fırsat varsa sunulur, yoksa zorlanmaz.

- **Today:** günlük işin yapıldığı yer. Satırında işin düğmesi olur (Refilled, Done) ve gerekli bilgi yazar (takvimde `button` ve `words`).
- **Upcoming:** her gün tekrar eden şeyler oraya konmaz, gürültü olur (alışkanlık, diyet günü).
- **Overdue:** düğmesi olan ve düğmeyle ileri giden kayıt (kontrol, ilaç) günü geçince Overdue'da kalır. Kaçan alışkanlık günü kalmaz, birikmez.
- **Alt görevler:** bir şeyin adımları alt görev olarak yazılırsa tarihli olanlar Today ve Upcoming'e kendiliğinden gelir (hedefin adımları).
- **Chat, takvim, arama, Quick notes:** gerçek bir ortak kullanım varsa.

## Ekranlar

- Piyasadaki benzer uygulamalar örnek alınır (Medisafe, Streaks, Loop, Strides, MyFitnessPal…) ve en kısa akışları baz alınır.
- Kayıt penceresinde yalnız insanın yazdığı alanlar görünür; hesaplananlar gizlenir (PIECES `hidden`) ya da tabloda gösterilir.
- Bir alan ya da blok yalnız gerektiğinde görünür (`when`): garantide mağaza, adımlı hedefte Steps.
- Tablonun açıldığı sütunlar şablonla verilir (`tableColumns`); anlamsız toplam ya da tekrar eden sütun olmaz.
- Değerler okunacak biçimde yazılır: "5 days left", "7 of 24 books", "🔥 12 days"; durumlar renkli çip.
- Kayıt pencerelerinde Save yok: var olan kayıt bırakılınca kaydedilir.
- Telefonda da aynı işler aynı kısalıkta yapılır.

## Altyapı

Scrawl'ın elindeki parçalarla doğru ekran kurulamıyorsa altyapı genişletilir; elindekiyle yetinilmez. 28 Ekim'e kadar bu yolla eklenenler:

- Alanda `when` (yalnız koşul tutunca görünür), `suggest` (önceden yazılanı öner).
- Pencere bloğunda `when`; blokları gizlenen sütun da gider.
- Takvimde `button` (Today satırındaki düğme), `words` (satırın söyledikleri), `upcoming: 'today'`.
- Tekrar eden takvimde `start: false` (tek düğmeli gün), `late: false`, `perWeek`, `strip` (tabloda son günler).
- Pencerede `days` bloğu (ay takvimi), alt görev bloğuna başka ad (`title`, `add`).
- Kural dilinde `dates`, `streak`, `best`, `week`, `steps`; rollup'ta `list`.
- Yüzdeyi çubuk olarak gösterme (`bar`, `caption`), formül sonucunu renkli çip yapma (`colors`), düz tablonun varsayılan sütunları (`columns`).

## Süreç

1. Şablonu bir kullanıcı ve bir ajan gözüyle baştan sona kullanarak eksikleri bul.
2. Tek, bitmiş bir öneri getir: ekranlar, alanlar, uygulamanın geri kalanıyla ilişkisi, gereken altyapı ve mockup (`design/mockups.html`). Parça parça sorma.
3. Onay gelmeden kod yazma.
4. `design/more-apps.md`'deki bölümü, PLAN.md satırını ve Roadmap kartlarını (iş ve deneme) güncelle.
5. Yaz, test et, tarayıcıda masaüstünde ve telefonda dene; mockup'tan farkı söyle.
6. "Commit at" gelince commit et ve sormadan web'e yayınla. Yayın notu yalnız Roadmap kartına yazılır, PLAN.md'ye değil. Masaüstü, sunucu ve push ayrıca sorulur.
7. Önceden kurulmuş app'ler olduğu gibi kalır; şablonun sürümü artırılır.
