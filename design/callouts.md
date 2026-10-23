# Notta callout (taslak)

Durum: 20 Ekim 2026'da Alexandrie karşılaştırmasından çıktı; taslak ilk başta Mermaid diyagramlarını da kapsıyordu. 23 Ekim'de kullanıcı diyagramı taslaktan çıkardı; yalnız callout kaldı. Aynı gün 9. bölümdeki iki karar verildi. Kod yazılmadı, PLAN'a işlenmedi.

## 1. Neden

- Ajan (Claude Code) önemli notları GitHub'ın uyarı bloklarıyla (`> [!WARNING]`) yazıyor. Scrawl'da bugün bunlar başında `[!WARNING]` yazan bir alıntı olarak görünüyor.
- Biçim yerleşik bir markdown uzantısı: GitHub, GitLab ve Obsidian aynı dosyayı çiziyor. Dosya her yerde okunur kalır, yeni bir biçim uydurulmaz.
- Sunucu istemez; masaüstünde, web'de ve telefonda aynı çalışır (entegrasyon kuralı).
- Kart açıklaması, yorum ve kayıt gövdesi notun editörünü kullandığı için callout oralarda da çalışır.

## 2. Dosyada

```
> [!WARNING]
> Yedek almadan güncelleme.
```

- Beş tür, GitHub'ınkiler: `NOTE`, `TIP`, `IMPORTANT`, `WARNING`, `CAUTION`. Büyük küçük harf fark etmez; Obsidian `[!note]` diye yazar, o da olur.
- İşaret ilk satırda tek başınadır. Yanında yazı olan (`> [!NOTE] Başlık`, Obsidian'ın özel başlığı) ya da bu beşinin dışındaki bir tür (`[!INFO]`) bugünkü gibi alıntı kalır; GitHub da onları alıntı olarak gösterir.
- Yalnız en üst düzeyde olur; liste ya da başka bir alıntı içindeki callout alıntı kalır. GitHub da iç içe callout çizmez.

## 3. Ekranda

- Sol kenarda türün renginde bir çizgi ve hafif renkli zemin. İlk satırda türün simgesi ve adı: Note, Tip, Important, Warning, Caution. `>` işaretleri bugünkü alıntıdaki gibi gizlidir.
- Renkler temadan gelir: Note mavi, Tip yeşil, Important mor, Warning sarı, Caution kırmızı; her tema kendi tonunu verir.
- Başlık satırına yazılmaz: imleç o satıra girmez, yukarıdan gelen imleç bir sonraki satıra geçer. Böylece yazılan şey işaretin yanına düşüp callout'u bozmaz.
- İçinde liste, kod bloğu, link ve resim olabilir; alıntı gibi davranır.
- Markdown görünümünde dosya olduğu gibi görünür.

## 4. Ekleme ve değiştirme

- Biçim çubuğunda Quote'un yanında Callout düğmesi. Basınca beş türün listesi açılır; seçilen satırlar o türde bir callout olur. Seçim yoksa imlecin satırı olur; boş satırda boş bir callout açılır ve imleç içine geçer.
- `/` menüsünde Callout: Note türünde açar.
- Başlığa tıklamak aynı listeyi açar: tür değişir. Listenin en altında Remove callout vardır; satırlar düz metne döner, işaret satırı ve `> `'ler kalkar.
- İmleç bir callout'tayken düğme seçili görünür, listede şimdiki tür işaretlidir.
- Enter bugünkü alıntıdaki gibidir: satır callout içinde devam eder, boş satırda Enter callout'tan çıkar.
- Klavyeden yazılan `[!NOTE]` callout yapmaz: yazılan yazıldığı gibi kalır, köşeli parantezler kaçırılır. Callout düğmeden ya da dışarıdan (ajan, GitHub'dan gelen dosya) gelir.
- Telefonda format bar'da Callout simgesi; sheet'te beş tür, callout içindeyken Remove callout da. Başlığa dokunmak aynı sheet'i açar.

## 5. Dışa aktarma, kopyalama ve ajan

| | Callout |
|---|---|
| HTML | Renkli kenarlı kutu, başlığı simge ve adıyla |
| PDF | Renkli sol çizgili, başlıklı kutu (bugünkü alıntı kutusu gibi) |
| MD + ekler | Dosya olduğu gibi |
| Panoya HTML (Word, mail) | Kalın başlıklı bir alıntı |
| Panoya markdown ve düz metin | Olduğu gibi |

- **Ajan:** `scrawl://guide`'ın Notes bölümüne bir cümle: callout için GitHub'ın beş türü yazılır, uygulama onları çizer. Böylece ajan başka biçimler (Obsidian'ın diğer türleri, `:::` blokları) yazmaz. Araçlar değişmez.

## 6. Teknik

- **Algılama:** `packages/editor/src/callout.ts`. Belgenin en üst düzeyindeki bir `Blockquote` düğümünün ilk satırı `/^>\s?\[!(note|tip|important|warning|caution)\]\s*$/i` ise callout'tur. Lezer'ın markdown ayrıştırıcısında böyle bir düğüm yoktur; ağaç değişmez, karar satırın metninden verilir.
- **Çizim:** başlık satırı tablolar gibi bir blok widget'tır (`StateField`, `Decoration.replace({ block: true })`), bu yüzden imleç o satıra giremez. Diğer satırlar bugünkü `cm-sl-quote`'a ek olarak `cm-sl-callout cm-sl-callout-<tür>` satır sınıfını alır. `[!NOTE]` lezer'da Link olarak ayrışabildiği için `livePreview.ts`'teki link işlemi işaret satırını atlar.
- **Komutlar:** `commands.ts`'e `setCallout(type)` (satırları sarar ya da türü değiştirir) ve `removeCallout`; `formatState`'e `callout: CalloutType | null`. Enter, markdown keymap'inin satır devamı ve `cursor.ts`'teki `leaveEmptyBlock` ile bugünkü gibi çalışır.
- **Arayüz:** `FormatBar.tsx`'te Quote'un yanında açılır liste; `PhoneNote.tsx`'te `PhoneFormatBar` simgesi ve sheet; `index.ts`'teki `/` menüsüne Callout.
- **Renk:** `theme.ts`'e ve uygulamanın temalarına `callout.note` … `callout.caution` belirteçleri.
- **Dışa aktarma:** `export.ts` ve `render.ts`'e küçük bir marked uzantısı: blockquote token'ının ilk satırına bakar; yeni bağımlılık yok. PDF'te `blockquote` dalı türün rengini ve başlığını alır.

## 7. Testler

- **Editör** (vitest, `editor.test.ts` gibi):
  - Beş tür ve küçük harfli yazılışları callout olur; `[!INFO]`, işaretin yanında yazı ve liste içindeki alıntı olmaz.
  - Başlık satırı blok widget'tır; yukarıdan inen imleç onu atlar.
  - `setCallout`: seçili satırlar sarılır, tür değişir; `removeCallout` düz metne döndürür; boş satırda boş callout açılır, imleç içindedir.
  - Klavyeden yazılan `[!NOTE]` kaçırılır, callout olmaz.
  - Markdown görünümünde çizilmez.
- **Dışa aktarma** (`export.test.ts`): callout'un HTML'i ve PDF düğümü; MD değişmez.
- **Ajan:** rehberde callout biçimi yazıyor.
- **Elle,** tarayıcıda ve masaüstünde: beş tür, temalar ve koyu mod, telefon düzeni, PDF ve HTML çıktısı.

Tek dilimdir.

## 8. PLAN'a işlenecekler (onaydan sonra)

- 4.2: Biçimlendirme'ye Callout düğmesi; `/` menüsüne Callout; Callout için yeni bir madde.
- 4.7: dışa aktarmada nasıl çıktığı.
- 4.8: rehberde callout biçimi.
- 4.9: telefon format bar'ına Callout simgesi.

## 9. Kararlar (23 Ekim)

1. **Ekrandaki ad:** Callout.
2. **Türler:** yalnız GitHub'ın beşi çizilir; Obsidian'ın diğer türleri (`[!info]`, `[!danger]`…) ve başlıklı callout alıntı kalır. Böylece dosya GitHub'da da aynı görünür.

## 10. Yazarken çıkanlar (23 Ekim)

- **Backspace, metnin başında:** callout'u kaldırır, metin kalır (kelime işlemcide kutunun kalkması gibi). Yoksa metin işaret satırına yapışır ve callout dağılırdı. İçi boş callout Backspace'te de, Enter'da da bütünüyle gider, yerinde boş bir satır kalır.
- **Delete, callout'un üstündeki satırın sonunda:** bir şey yapmaz; işaret satırı yukarı çekilmez (tablodaki gibi).
- **Başlığın kenarı:** callout'la başlayan bir not açılınca imleç işaret satırının başında durur. Orada imleç çizilmez; yazılan ya da yapıştırılan şey callout'un metninin başına gider.
- **Yalnız işaret satırı:** içinde başka satır olmayan alıntı callout değildir; GitHub'daki gibi en az bir satırı olmalı.
- **Important'ın rengi:** temalarda mor yoktu, anahtar kelime rengi de her temada mor değil (Paper'da kırmızı, Sand'de yeşil). Temalara `purple` eklendi, her biri kendi kaynağından: Scrawl, Harbor ve Clay'in anahtar kelime moru, Paper'da GitHub'ın Important rengi, Sand'de Solarized'ın violet'i, Pastel'de Catppuccin'in mauve'u, Midnight'ta Tokyo Night'ın moru, Frost'ta Nord'un aurora moru. Diğer dört tür var olan renkleri kullanır: Note sütunların active mavisi, Tip done yeşili, Warning p2 turuncusu, Caution dropped kırmızısı.
- **Menüler:** biçim çubuğunun Callout'u da başlık da uygulamanın sağ tık menüsünü açar; telefonda bu bir sheet'tir. Türler kendi renkli simgeleriyle bilgisayarda da görünür.
- **Düz metin olarak:** kopyalanan ve sayılan metinde işaret satırı türün adı olarak okunur ("Warning"), ekrandaki gibi.
- **Kart açıklaması, yorum ve kayıt gövdesi:** callout orada da çizilir ve başlığı menüsünü açar; biçim çubukları olmadığı için orada `/` menüsünden eklenir.
