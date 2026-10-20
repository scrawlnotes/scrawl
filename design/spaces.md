# Space'ler: kişisel ve paylaşılan (taslak)

8. ve 11. aşama. PLAN 4.1 (Ayarlar), 4.8, 4.9, 5.3, 5.4 ve 5.5'in bu işle ilgili kısmının teknik karşılığıdır. Durum: kararlar verildi (16 Ekim 2026, 9. bölüm); ekranlar `design/mockups.html`'de, "Kişisel ve paylaşılan space'ler" bölümünde ve güncellenen Spaces ve Sunucu görünümlerinde; dört dilim de yazıldı (ayrım, tek pencere, sunucuda kişisel space, taşıma), 5. bölümde yazılırken değişenler.

## 1. Kapsam

İki şey: kişisel space ile paylaşılan space'ler ekranda keskin ayrılır, ve kişisel space'in nerede sync olduğu tek bir akıştan seçilir. Kişisel space cihazda kalabilir, OneDrive'da ya da bir Scrawl sunucusunda sync olabilir; yeri sonradan değişebilir.

**Değişmeyenler:**
- Kişisel space tektir. İlk açılış hiçbir şey sormaz, kişisel space cihazda kurulur (PLAN 4.1).
- Paylaşılan space bir bulut klasöründe ya da bir sunucudadır; sync'siz açılmaz, yeri sonradan değişmez.
- Ad ve e-posta yalnız başkalarının seni gördüğü yerde sorulur: paylaşılan space'i OneDrive'da eklerken. Kişisel space'i bağlarken sorulmaz.
- Sync motorunun birleştirme kuralları, sunucunun dosya API'si ve canlı kanalı.

**Sonra:** Google Drive (15. aşama) iki akışta da bir yer daha olur.

## 2. Ekranlar

### 2.1 Settings › Spaces

İki bölüm, sonra bugünkü gibi Servers ve This device:

- **Personal:** tek satır. Altında nerede sync olduğu: "Not synced · only on this device", "OneDrive · My files › Scrawl" ya da sunucunun adresi. Menüsü yoktur. Notu: "Only yours; nobody else is in it. Sync it to your OneDrive or your Scrawl server to have it on your other devices too."
- **Shared:** başkalarıyla çalışılan space'ler, kenar çubuğu sırasıyla. Her satırın ··· menüsü bugünkü gibidir (Settings…, Move up, Move down, Remove from this device). Altında Add space… ("A OneDrive folder, or a space on a Scrawl server."). Notu: "The spaces you work in with others, in a OneDrive folder or on a Scrawl server. The sidebar shows them under Personal, in this order."

### 2.2 Kişisel space'in sayfası

Etiketi "Only you". Satırlar: Name, Folder (bu cihazdaki kopya, Change… ve Use default bugünkü gibi), Sync. People yoktur.

Sync bölümü üç halde:
- **Sync olmuyor:** "Not synced · only on this device", altında "Sync it to have Personal on your other devices, in your OneDrive or on a Scrawl server." ve Sync…
- **Sync oluyor:** yer ve hesap, durum, Sync now ve Change…
- **Başka cihaz taşıdı (2.7):** eski yer, sarı "Moved to <yer> on <cihaz> · syncing here stopped", Move this device too.

Sync… ve Change… aynı pencereyi açar (2.4). Disconnect yoktur; sync'i bırakmak pencerede Not synced'i seçmektir.

### 2.3 Paylaşılan space'in sayfası

Etiketi "Shared". Bugünkü gibi: Name, Folder, Sync (yer, durum, Sync now; Change… yoktur), People, sunucuda Invite…, en altta Remove from this device.

### 2.4 Tek pencere

Bir pencere, iki kip. İkisinde de önce yer, sonra o yerde klasör ya da space:

| | Sync Personal | Add space |
|---|---|---|
| Başlık | Sync Personal | Add space, sağında "Shared with others" |
| Name | yok | var |
| Location | Not synced, OneDrive, bağlı her sunucu, Connect a server… | OneDrive, bağlı her sunucu, Connect a server… |
| Şimdiki yer | "Now" etiketli | — |
| OneDrive'da | Folder: Choose folder… | Folder: Choose folder…, gerekirse Your name ve Your email |
| Sunucuda | Space on <adres>: New space "Personal" ya da o hesabın oradaki kişisel space'i ("Personal · yours") | Space on <adres>: New space ya da davet edilip bu cihazda olmayan paylaşılan space'ler |
| Başkasının sunucusu | "Not your server: The owner of <adres> can reach what is stored on it." | — |
| Eski yerden ayrılırken | "Delete the copy in OneDrive" kutusu, kapalı | — |
| Düğme | Sync with <yer>, Move to <yer>, Stop syncing | Add "<ad>" |

- **Not:** ilk kez bağlarken "On your other devices, choose this same folder (space): what each has is put together, and nothing is lost."; taşırken "Your other devices go on syncing with <eski yer> until each is changed to this same space."
- **Not synced seçilince** yalnız bu cihaz sync'i bırakır: bulut kopyası ve diğer cihazlar bugünkü gibi devam eder. Kutu ve taşındı işareti yoktur.
- **Sunucunun "senin" olması** o sunucuda Owner olmaktır; Admin ve Member için uyarı çıkar. Rol cihazdaki sunucu kaydında zaten durur (`KnownServer.role`).

### 2.5 Connect a server…, pencerenin bir adımı

Bugün Connect a server… Add space'in üstünde ayrı bir pencere açar; kurulum, katılma ve giriş de öyle. Artık aynı pencerenin bir adımıdır: üstte "‹ Location", adres alanı, sunucu cevap verince ne istediği (giriş, kurulum ya da katılma) aynı adımda açılır; Sign in, Set up ya da Join'den sonra pencere Location'a döner ve sunucu seçili gelir. Sync Personal'da alan yalnız adres alır ("Server address"); davet linki paylaşılan bir space'e çağırır, kişisel space'te yeri yoktur. Telefonda bu zaten sheet'lerin içinde bir sayfadır, aynı kalır.

### 2.6 Telefon

- Settings › Spaces: Personal ve Shared bölümleri; Reorder yalnız Shared'ı sıralar.
- Kişisel space'in sayfası: Name, Location (sheet'i açar), sync oluyorken Sync (sync sayfasını açar); ayrı bölümde This device.
- Sync Personal bir sheet'tir: Cancel, başlık, sağda Sync ya da Move; Location ve Space on <adres> bölümleri; eski kopya için bir anahtar, kapalı. Uyarı ve notlar masaüstündekiyle aynı.
- Sync sayfasında Connect OneDrive ve Disconnect kalkar; yer Location'dan seçilir.

### 2.7 Personal moved

Kişisel space başka bir cihazda taşındıysa bu cihaz eski yerle sync'i durdurur. Durum çubuğunda sarı "Personal moved", telefonda Sync satırında uyarı işaretiyle "Moved". Kişisel space'in sayfasında ve sync sayfasında açıklama: "<Cihaz> moved it to <yer> on <gün>, and syncing here stopped." ve Move this device too (telefonda Move this phone too). Düğme 2.4'teki pencereyi yeni yer ve oradaki space seçili açar; bu cihaz o hesapta değilse önce giriş adımı gelir. Not: "What is on this device and not there yet goes with it." Eski kopyanın kutusu burada yoktur; o karar taşıyan cihazındı.

## 3. Veri

### 3.1 Cihazda

Kişisel space'in bağlantısı bugünkü gibi `scrawl.sync`'tedir (`Connection`): `provider` `'onedrive' | 'server'`. Sunucuda `folder.id` space'in id'si, `server` adresi. `since`: cihazın bu yere ne zamandan beri bağlı olduğu; izlerken izlenen işaretin zamanı. Taşınınca yeni bağlantı eskisinin yerine yazılır, eski yerin sync durumu (`.scrawl/sync-state.json`, `.scrawl/sync-base`) silinir; yeni yerde ilk tur iki tarafı birleştirir.

### 3.2 Taşındı işareti: `.scrawl/moved/<zaman>.json`

Eski yere yazılır, her taşımada yeni bir dosya, adı taşındığı an (milisaniye). Böylece bir işaretin üstüne yazılmaz, aynı yere geri taşınınca eskisiyle yenisi karışmaz. İşaretler sync'lenmez (`isSynced` dışında); motor onları turdan önce okur:

```json
{
  "to": { "provider": "server", "account": "kaan@outlook.com", "place": { "url": "https://kaan.scrawlnotes.com", "space": "sp-3k9x2m7q" } },
  "by": "Desktop PC",
  "at": 1792165695349
}
```

`to` bir `SpaceSource`'tur (OneDrive'da `place: { item, path, drive? }`). İçinde sır yoktur; okuyan yalnız aynı kişinin diğer cihazlarıdır.

### 3.3 Sunucuda

`spaces` tablosuna bir sütun, yeni bir şema sürümüyle:

```sql
ALTER TABLE spaces ADD COLUMN personal_of TEXT REFERENCES accounts (id);
CREATE UNIQUE INDEX spaces_personal ON spaces (personal_of) WHERE personal_of IS NOT NULL;
```

Kişisel space'in tek üyesi sahibidir (`members`'ta `manager`). Bir hesabın bir sunucuda en çok bir kişisel space'i olur.

## 4. Sunucu

| İstek | Değişen |
|---|---|
| `GET /server` | `personal: true`: sunucu kişisel space tutar. Bunu söylemeyen eski bir sunucu `personal`'ı tanımaz ve paylaşılan bir space açardı; uygulama onu Sync Personal'da seçtirmez, "{host} does not keep personal spaces yet. Its owner updates it first." der |
| `POST /spaces` `{ id, name, personal: true }` | herkese açık (Member dahil); hesabın orada kişisel space'i varsa 409 `personal-exists`. `personal` yoksa bugünkü gibi yalnız Owner ve Admin |
| `GET /spaces` | her satırda `personal: boolean` |
| `POST /spaces/:id/invites` | kişisel space'te 403 `personal` |
| `PATCH` ve `DELETE /spaces/:id/members/:account` | kişisel space'te 403 `personal` |
| `GET /accounts` | "kaç space'te" sayısına kişisel space girmez |
| `DELETE /accounts/:id` | hesap paylaşılan space'lerden çıkar, kişisel space'indeki üyeliği kalır. Anahtarları geri alındığı için kimse açamaz; kişi aynı e-postayla davetle döndüğünde (`joining`, var olan satırı açar) kişisel space'ine yeniden ulaşır |

- **Görünürlük:** bir hesap yalnız üyesi olduğu space'leri görür (`spaces.of`); kişisel space'in tek üyesi sahibi olduğu için Owner ve Admin onu görmez, açamaz, içinden kimseyi çıkaramaz. Yeni bir yetki kuralı gerekmez; yukarıdaki retler yalnız sahibin kendi kişisel space'ine birini çağırmasını engeller.
- **Diskte, yedekte, dışa aktarmada:** sunucunun sahibi makineye ulaşır; kişisel space yedeğe ve `scrawl-server export`'a girer. Pencere bunu "Not your server" uyarısıyla söyler.
- **Ajan (`/mcp`):** `spaces` aracı kişisel space'i `personal: true` ile listeler. `save_task`'te `list` verilmezse görev hesabın o sunucudaki kişisel space'inin Inbox'ına gider; kişisel space o sunucuda değilse `list` bugünkü gibi zorunludur. `design/agent.md` 7.2 ve 7.3 bu dilimde buna göre düzeltilir.

## 5. İstemci

- **core, sunucu:** `ServerAccount.openSpace(id, name, { personal })`; `ServerSpace`'e `personal`.
- **core, motor:** yeni hata `RemoteMoved` (işaretin içeriğiyle) ve `SyncOptions.movedSince`. Motor değişiklik listesini aldıktan sonra, hiçbir şey uygulamadan önce bakar: listede `movedSince`'ten sonra bırakılmış bir işaret varsa en yenisini okur ve `RemoteMoved` atar. Daha eskisi, cihazın izlediği ya da bilerek geçtiği bir taşımanındır ve atlanır. `movedSince` yalnız kişisel space'e verilir; paylaşılan space işarete bakmaz. Eski kopyayı silmek `clearLeftPlace`'tir (core, `moved.ts`). Uygulamadan önce durmak şart: taşıyan cihaz eski kopyayı silmişse, işareti görmeden uygulanan bir tur bu cihazdaki notları da silerdi.
- **Sync servisi** (`apps/web/src/sync.ts`):
  - `connect(connection)` OneDrive'ın yanında sunucuyu da kurar.
  - `move(to, deleteLeft)`: (1) eski yere işareti yazar; (2) bağlantıyı değiştirir (`since` işaretin zamanı), eski durumu siler, yeni yerde ilk turu başlatır; (3) kutu işaretliyse ilk tur durmadan bitince eski yerde kökteki her şeyi siler, `.scrawl/moved/` kalır. Silme turdan önce yapılmaz, böylece bir şey yolda kaybolmaz. Silinecek yer cihazda `scrawl.syncClear`'da durur; silme yarıda kalırsa bir sonraki turdan sonra sürer.
  - Yeni durum `SyncPhase` `'moved'`; `SpaceSync`'e `moved: { to, by, at }`. Bu durumda tur çalışmaz. Durum çubuğu "Personal moved", telefonun Sync satırı "Moved" der. İzlemek `connect` ya da `connectServer`'dır, `since` izlenen işaretin zamanı: yeni yerde ondan sonra bırakılmış bir işaret varsa cihaz onu da izler.
  - Not synced: bugünkü `disconnect()`.
- **Pencere:** Sync Personal'ın kendi hook'u var (`useSyncPersonal`), masaüstündeki `SyncPersonalDialog` ve telefondaki sheet onu kullanır; Add space `useAddSpace`'te kalır. `ServerConnect.tsx`'teki ayrı pencere ve sheet bir adım bileşenine döner (`ConnectStep`), pencerenin içinde çizilir.
- **Ekranlar:** `Settings.tsx` (iki bölüm, `PersonalPage`'in Sync bölümü, `SpacePage`'in etiketi), `SyncViews.tsx` (Sync satırının halleri, durum çubuğu), `PhoneSpaces.tsx`, `PhoneSync.tsx`; metinler `packages/i18n/src/en.ts`.

## 6. Güvenlik

- Kişisel space'e yalnız sahibinin cihaz anahtarı ve ajanı ulaşır; davet ve üye işlemleri sunucuda reddedilir, istemcinin göstermemesine güvenilmez.
- Sunucunun sahibi diskteki her şeye ulaşabilir; bu bir yetki açığı değil, kendi kurduğu makinenin gerçeğidir ve pencere söyler. Uçtan uca şifreleme bu işte yoktur.
- İşareti okuyan cihaz yalnız kendi hesabıyla ulaşabildiği yere gider; işaretteki adres giriş istemeden hiçbir şey açmaz.

## 7. Testler

- **Sunucu:** Member'ın kişisel space açması; ikincisinin reddi; kişisel space'te davet ve üye işlemlerinin reddi; başkasının `GET /spaces`'inde görünmemesi; hesap sayısına girmemesi; hesap çıkarılınca kişisel üyeliğin kalması, davetle dönünce ulaşılması; ajanın listesiz görevi kişisel Inbox'a koyması.
- **Motor:** listede işaret varken hiçbir şeyin uygulanmaması (aynı listede silmeler de olsa yerel dosyalar yerinde); tam listede işaret; işaretin silinmiş olarak gelmesinin durdurmaması.
- **Sync servisi:** taşımada sıra (önce işaret, sonra yeni yer, en son eski kopyanın silinmesi); ilk tur durursa eski kopyanın silinmemesi; Not synced'in uzak tarafa dokunmaması; Move this device too'nun işaretteki yeri seçmesi.
- **Elle:** web'de ve telefon boyutunda her ekran; iki cihazla OneDrive'dan sunucuya taşıma ve diğer cihazın izlemesi; masaüstü uygulamasında aynısı; iPhone.

## 8. Dilimler

1. **Ayrım:** Settings › Spaces'te iki bölüm, kişisel ve paylaşılan space'in sayfaları, telefonda aynısı. Davranış değişmez.
2. **Tek pencere:** iki kipli hook, Sync Personal (Not synced, OneDrive), Connect a server… pencerenin bir adımı (iki kipte de), sync servisinde sunucuyu da kuran `connect`.
3. **Sunucuda kişisel space:** şema, API ve retler, ajanın varsayılan listesi, istemcide sunucu seçeneği ve "Not your server"; sunucunun yeni sürümü.
4. **Taşıma:** işaret, motorun durması, `move`, eski kopyanın silinmesi, Personal moved ve Move this device too.

Her dilim bitince commit sorulur; 3. dilim sunucunun yeni sürümünü ister, onun yayını ayrıca sorulur.

## 9. Kararlar (16 Ekim 2026)

1. Kişisel space tektir ve cihazda, OneDrive'da ya da bir Scrawl sunucusunda durabilir.
2. Kişisel ve paylaşılan space'ler Settings › Spaces'te ve space'in sayfasında keskin ayrılır: Personal ve Shared; kişiselde People yok, yer değiştirme var; paylaşılanda People var, yer değiştirme yok.
3. Not synced ve yer değiştirme yalnız kişisel space'tedir; paylaşılan space sync'siz açılmaz.
4. Yer değişince eski kopya pencerede bir kutuyla sorulur, kutu kapalı gelir. Eski yerde her durumda taşındı işareti kalır; kutu işaretliyse yalnız o kalır. Diğer cihazlar işareti görünce durur, Move this device too ile izler.
5. Not synced seçilince yalnız o cihaz durur; bulut kopyası ve diğer cihazlar devam eder.
6. Sunucudaki kişisel space'i yalnız sahibi görür; Owner ve Admin göremez, açamaz. Başkasının sunucusu seçilince pencere sahibinin oradakilere ulaşabileceğini söyler.
7. Sunucuda hesabı olan herkes, Member da, orada bir kişisel space açabilir.
8. Sunucudan çıkarılan hesabın kişisel space'i kalır; kimse açamaz, kişi geri gelince ona yeniden ulaşır.
9. Sunucudaki ajan listesi verilmeyen görevi kişisel space'in Inbox'ına koyar; kişisel space o sunucuda değilse liste zorunlu kalır.
10. Ekranda Personal ve Shared adları, "Only you" ve "Shared" etiketleri; pencerenin adı Sync Personal, şimdiki yer "Now" etiketli; Connect a server… pencerenin bir adımı ve giriş de o adımda; kişisel space'te davet linki yok; taşıma diğer cihazları kendiliğinden geçirmez; telefonda Location satırı.
