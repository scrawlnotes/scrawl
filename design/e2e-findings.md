# E2E ve UX taraması: bulgular

Plan: `design/e2e.md`. Hatalar sormadan düzeltilir ve burada kaydı tutulur; UI/UX bulguları ve özellik önerileri karar bekler.

## Hatalar

| # | Alan | Ne oldu | Düzeltme | Durum |
|---|---|---|---|---|
| H1 | B Notlar | Yazdıktan sonraki ~400 ms içinde sekme kapanır ya da yenilenirse son yazılanlar kayboluyordu: kaydetme 400 ms sonra başlıyor, `pagehide`'da başlatılan yazma sayfa giderken bitmiyor. Duman testi ilk koşuda yakaladı (iki boyutta da not boş açıldı, durum çubuğu "Saved"). | `session.ts`: sayfa giderken yazılmamış ve yazılmakta olan notlar `localStorage`'a hemen konur, açılışta ilk not okunmadan önce dosyaya yazılır, her tam kayıttan sonra silinir; telefonda uygulama arka plana geçince kayıt 400 ms beklemeden başlar. | Düzeltildi, `smoke.spec.ts` |
| H2 | B Notlar | Masaüstündeki biçim çubuğunda bazı düğmelerin erişilebilir adı yok ya da yalnız simge: `B`, `I`, `S`, `</>` (telefonda Bold, Italic… adları var). Ekran okuyucu ve klavyeyle kullanan biri ne olduğunu duyamaz. | 2. dilimde | Sırada |
| H3 | B Notlar | Notun içindeki tabloda satır ve sütun silme düğmelerinin adı yalnız `×`. | 2. dilimde | Sırada |
| H4 | B Notlar | New note penceresindeki ad kutusunun etiketi yok, yalnız yer tutucu metni var. | 2. dilimde | Sırada |

## UI/UX bulguları (kararını bekliyor)

Henüz yok: tarama 2. dilimde başlıyor.

## Özellik önerileri (kararını bekliyor)

Henüz yok.
