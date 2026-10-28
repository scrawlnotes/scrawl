# App şablonu yazma kuralları

Bir app şablonu önerirken, var olanı düzeltirken ya da bunun için bir skill yazarken bu kurallara uyulur. Hepsi kullanıcıyla netleşti.

## Amaç

Şablonlar kayıt tutmak için değil, insanların işlerini ve kişisel şeylerini yönetmesi için. Hem insanlar hem ajanlar kullanır, ama ölçü insandır: telefondan ya da bilgisayardan açıp en az eforla kullanabilmeli. Her gün açılıp elle kayıt girilen, ne olduğu anlaşılmayan ekranlar kimse tarafından kullanılmaz. Ajan için de fazladan adım kafa karıştırır.

## Ölçüt: işin kaç adımda yapıldığı

- Alan sayısı değil, kullanım ölçülür. Bir işi yapmak için kaç ekran, kaç tıklama gerekiyor; önceden ne girilmiş olmalı?
- Bir iş için başka bir kaydın önceden girilmesi yalnız gerçekten gerekiyorsa şarttır. Siparişte ürün şarttır, ürünsüz sipariş olmaz. Randevuda doktor şart değildir; önceden doktor kaydı istemek işi iki ekrana böler.
- Her öneride akış adım adım yürütülür: kullanıcı ne açar, ne görür, ne yazar; ajan aynı işi kaç araç çağrısıyla yapar.

## Ayrı ekran

- Ayrı ekran ancak gerçekten gerekiyorsa ya da fayda sağlıyorsa olur. Products ayrı ekrandır: az değişir, birçok yerde kullanılır. Doctors ayrı ekran olmaz: her seferinde değişebilir, önemsenmeyebilir.
- Bir kaydın satırları (siparişin kalemleri, programın maddeleri) o kaydın penceresinde girilir. Kendi başına yaşayan kayıtlar (ürünler) satır olmaz, kendi penceresinde açılır.
- Ayrı ekran yerine: yazarken önceki değerleri önermek, aynı ekranda küçük pencereyle hızlı ekleme ya da hiç sormamak.
- Aynı işi gören iki ekran birleştirilir.
- Arkada tutulan koleksiyonlar (satırlar, işaretlemeler, günler) menüde görünmez.

## En az giriş, en çok otomatik

- Belli olan şey yeniden girdirilmez. Diyet programı bir kez yazılır, günleri kendiliğinden oluşur; kullanıcı yalnız uyup uymadığını işaretler.
- Hesaplanabilen her şey hesaplanır: ilacın bitişi, hedefin ilerlemesi ve durumu, alışkanlığın serisi.
- Seçimler hazır kalıplarla gelir (Weekly, Monthly, Every 3 months…); gerekirse Custom.
- Kayıt penceresi tek seferde doldurulur; "önce adını yaz, sonra açıp detay gir" olmaz.
- Bir seçim formu doldurur: Gym'de program seçilince maddeleri işaretli gelir.

## Hazır veri

- Kullanıcının tek tek girmekle uğraşacağı ama önceden bilinebilen veriler (Gym'deki hareketler, tariflerdeki malzemeler, film türleri) yeterli miktarda üretilip app kurulurken gelir.
- Yeterli miktar, kullanıcının aradığını çoğu zaman bulacağı kadardır (Gym'de 72 hareket); göstermelik birkaç kayıt değil.
- Hazır gelenler sıradan kayıttır: eklenir, değiştirilir, silinir.

## Piyasadaki uygulamalar

- Her şablonda benzer uygulamalara bakılır (en az iki üç tane): işi nasıl en kısa yoldan yaptırıyorlar, neyi kendiliğinden yapıyorlar, ana ekranlarında ne var.
- Öneride hangi uygulamalardan ne alındığı söylenir.

## Uygulamanın geri kalanıyla

- Her öneride işin Scrawl'ın başka hangi yerinde daha kısa yapılacağına bakılır: Today, Upcoming, takvim, görevler, chat. Fırsat varsa sunulur, yoksa zorlanmaz.
- Günlük iş Today'de yapılır: satırında işin düğmesi (Done, Refilled) ve gereken bilgi ("5 days left") olur.
- Her gün tekrar eden şeyler Upcoming'e konmaz, gürültü olur.
- Düğmeyle ileri giden kayıt (kontrol, ilaç) günü geçince Overdue'da kalır; kaçan alışkanlık ya da diyet günü birikmez.
- Tarihli adımlar alt görev olursa Today ve Upcoming'e kendiliğinden gelir.
- Geçmiş listelerinde her kayıt görünür, bitenler gizlenir.

## Altyapı

Scrawl'ın elindeki parçalarla doğru ekran kurulamıyorsa altyapı genişletilir; elindekiyle yetinilmez. Bugüne kadar eklenenler:

- Alanda `when` (yalnız koşul tutunca görünür) ve `suggest` (önceden yazılanı öner).
- Pencere bloğunda `when`; blokları gizlenen sütun da gider.
- Takvimde `button` (Today satırındaki düğme), `words` (satırın söyledikleri), `upcoming: 'today'`.
- Tekrar eden takvimde `start: false`, `late: false`, `perWeek`, `strip`.
- Pencerede `days` bloğu (ay takvimi); alt görev bloğuna başka ad (`title`, `add`).
- Kural dilinde `dates`, `streak`, `best`, `week`, `steps`; rollup'ta `list`.
- Yüzde çubuğu (`bar`, `caption`), renkli formül sonucu (`colors`), düz tablonun varsayılan sütunları (`columns`).

## Ekranlar

- Pencereler ortada modal; yan panel yok. İçi o ekranın işine göre tasarlanır.
- Bırakınca kaydedilen yerde Save yok, Cancel var. Yeni kayıt Create ile oluşur.
- Tablolar standart: satıra tıklayınca pencere açılır, hücreye yazılmaz; tabloda yalnız seçilen tik ve seçimler değişir; silme satırın ··· menüsünden.
- Sayılar sayı, süreler süredir; "2–3 min" gibi metin değer olmaz. Değerler okunur biçimde yazılır ("7 of 24 books"); durumlar renkli çip.
- Hesaplanan alanlar formda kutusuz ya da gizli; yeni kayıtta boşken görünmez.
- Gereksiz ya da ne olduğu anlaşılmayan alan olmaz (odalar, "No" gibi). Türe göre değişen alanlar türe göre görünür.
- Adlar kullanıcının anlayacağı kelimelerdir (Upkeep değil Reminders, What değil Description). Alanın ya da düğmenin adı tek başına yetmiyorsa altına kısa bir açıklama yazılır: içine ne yazılır, boş kalırsa ne olur ("Left empty, its category's name").
- Bir iş yapılınca toast ve Undo çıkar.
- Okunamayan değer sessizce atlanmaz; neden hatalı olduğu görünür.
- Kurulum sorularında yapısı olan bilgi (ad, tutar, gün) serbest metinden okunmaz, sütunlu satırlarla sorulur; bilinen satırlar hazır gelir. Listede boş satır kalmaz.
- Onaylı mockup'a birebir uyulur; boş, seyrek ve dolu hâller düşünülür; telefonda da aynı kısalıkta çalışır.

## App'ler

- App dosya değil uygulamadır: kenar çubuğunda tek satır, Home'u, modülleri ve menüsü var; menüde yalnız ana ekranlar.
- İş şablonları bir app'te birleşebilir. Kişisel şablonlar yalnız veri paylaştıklarıyla birleşir; uymayan seçenek soluk durur ve nedenini söyler.
- Kişisel app'ler şablonun tam adıyla gelir.
- Birden fazla ev, araba gibi durumlar baştan düşünülür.
- Önceden kurulmuş app'ler olduğu gibi kalır; şablonun sürümü artırılır.

Şablonların bugünkü hâlleri `design/more-apps.md`'de. Habits and goals (Today'de Done, tabloda şerit, pencerede ay) iyi bir örnektir.

## Süreç

1. Şablonu bir kullanıcı ve bir ajan gözüyle baştan sona kullan, eksikleri bul.
2. Benzer uygulamalara bak.
3. Önce ne değişeceğini sun: tek, bitmiş bir öneri; hangi uygulamalardan ne alındığı, ekranlar, alanlar, uygulamanın geri kalanıyla ilişkisi, gereken altyapı. Parça parça sorma.
4. Öneri onaylanınca mockup'ı çiz; mockup da onaylanınca kod. Onaylanan öneriden sapma. Sıra sorma, istenen iş şimdi yapılır.
5. `design/more-apps.md`, PLAN.md ve Roadmap kartlarını (iş ve deneme) güncelle.
6. Yaz, test et, tarayıcıda masaüstünde ve telefonda dene; mockup'tan farkı söyle.
7. "Commit at" gelince tek commit, ardından sormadan web yayını; kullanıcı canlıda dener. Yayın notu yalnız Roadmap kartına. Masaüstü, sunucu ve push ayrıca sorulur.
