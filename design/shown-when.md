# Türe göre alanlar: Shown when

28 Ekim 2026. Kullanıcının Home, car and documents denemesinden: garantiler ve belgeler tek ekran olunca her türün kendi alanları olsun istendi. Mockup: `design/mockups.html` › Türe göre alanlar.

## 1. Ne

- Bir alan, aynı kaydın başka bir alanı bir değeri tutunca formda görünür: "Store, Type Warranty olduğunda".
- Bütün koleksiyonlarda kullanılır; şablonlar da kullanır.
- Birden fazla koşul varsa hepsi tutunca görünür.
- Gizlenen alanın değeri silinmez: tabloda, görünümlerde, dosyada ve koşul yeniden tutunca formda durur.

## 2. Fields'ta

- Alan açılınca **Shown when** satırı: alan, `is` ve değerler; `+ Add condition`. Koşulsuz alan için satırda yalnız `+ Add condition` görünür.
- Koşul alanı olarak seçilebilenler: seçim, çoklu seçim, onay kutusu, bağlantı ve metin alanları; alanın kendisi ve hesaplanan alanlar yok.
- İşlemler görünümlerin koşullarıyla aynı: seçimde `is` / `is not`, onay kutusunda `is ticked` / `is not ticked`, metinde `is` / `is empty` / `is not empty`.
- Koşulu olan alan listede küçük bir etiketle görünür: `Type is Warranty`.
- Altında iki satır not: alanın ne zaman göründüğü ve değerinin silinmediği.

## 3. Kayıt penceresinde ve telefonda

- Form açılırken ve koşuldaki alan değişince alanlar hemen açılır ya da kapanır.
- Yeni kayıtta da aynı; varsayılan değerler koşulu tutturuyorsa alan baştan görünür.
- Zorunlu bir alan gizliyken zorunlu sayılmaz.
- Tablo, görünümler ve dışa aktarma değişmez: sütun durur, koşul tutmayan satırda değer ne ise o.

## 4. Veri modeli

- `Field.when?: Condition[]`, görünümlerin `Condition`'ı (`{ field, op, value }`). `_collection.json`'da alanın içinde yazılır:

```json
{ "key": "store", "label": "Store", "type": "text", "when": [{ "field": "type", "op": "is", "value": ["Warranty"] }] }
```

- Karar `shownOnForm(field, record, schema, today)`: `when` yoksa ya da her koşulu `matchesCondition` tutuyorsa görünür.
- Koşuldaki alan silinince koşul da gider; anahtarı değişince koşul onu izler; seçimin adı değişince (`renames`) koşuldaki değer de değişir.
- Okurken bozuk koşul (alan yok, işlem yok) atılmaz: Fields'ta kırmızı yazılır, formda koşul tutmuyor sayılmaz, alan görünür.

## 5. Ajan

- `read`/`write` `part: "fields"` alanı `when` ile okur ve yazar; şema açıklaması `when`'i anlatır.
- `save_record` gizli alanı da yazar; gizli olması değeri reddetmez.
- Rehbere bir cümle: alan bir koşulla gizlenebilir, ne zaman görüneceği `when`'de.

## 6. Home, car and documents

- İlk kullanan Reminders: Every Custom olunca sayı ve birim alanları görünür (`design/more-apps.md` 4.2).
- Belgeler türe ayrılmaz; önce düşünülen garanti ve sigorta türleri, Store, Bought, Insurer 28 Ekim'de kalktı.

## 7. Testler

- Core: `when`'in okunup yazılması; `shownOnForm`; koşuldaki alanın silinmesi, anahtarının ve seçimin adının değişmesi; bozuk koşul.
- Web: Fields'ta koşul ekleme ve silme; kayıt penceresinde Type değişince alanların açılıp kapanması; gizli zorunlu alanla kaydetme.
- Ajan: `when` ile alan yazma ve okuma; Home şablonunun Documents'ı.
