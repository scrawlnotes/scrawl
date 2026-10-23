# Etkinlik ve ajanın kimliği (taslak)

Durum: 23 Ekim 2026. İlk taslak, yani birden çok atanan ve ajanın kendini ataması, kullanıcının geri bildirimiyle bırakıldı. Atama "kimin işi" sorusunu cevaplar, "kim ne yaptı"yı değil. Bir kartta birden çok ajan birden çok iş yapabilir. Kod yazılmadı; PLAN'a ve Roadmap'e işlenmedi. Aynı gün 9. bölümdeki dört karar verildi: önerilerin hepsi (atama tek kişi, iş ajana verilebilir, ajanlar bağlantıya göre ayrılır, kapsam görev ve kart). Sonra kullanıcı kayıtların kartın içinde kalmasını, ama her değişikliğin tek tek değil yalnız önemli olayların, en az metinle yazılmasını istedi. 1.2'deki olay listesi aynı gün onaylandı. Mockup (4. bölüm) onaylandı. PLAN'a 17. aşama olarak işlendi (Dropbox 18, Google Drive 19, Mobil 20); Roadmap'te faz 17, kartlar ROA-218–223.

## 1. Kapsam

### 1.1 İki ayrı soru

- **Kimin işi?** Atama (Given to) cevaplar. İleriye bakar.
- **Kim ne yaptı?** Etkinlik cevaplar. Geriye bakar; bu taslağın konusu bu.

Bugün ikinci sorunun cevabı neredeyse yok:
- Kartın zaman çizgisinde yalnız taşımalar ve yorumlar var.
- Kartı ve görevi kimin açtığı dosyada yazıyor (`author`), ama ekranda hiçbir yerde görünmüyor. Yalnız açılırken yazılıyor; sonraki değişiklikler hiçbir yerde yok.
- Görevin zaman çizgisi hiç yok.
- Ajanın yaptığı iş ya hiç görünmüyor ya da ajan işi kişiye atadığı için kişi yapmış gibi duruyor.

### 1.2 Etkinlik

Her değişiklik tek tek yazılmaz. Yalnız önemli olaylar, kısa bir satırla ve onu kimin yaptığıyla yazılır.

| Olay | Kart | Görev |
|---|---|---|
| Açıldı | `author`'dan gösterilir, kayıt yazılmaz | aynı |
| Sütun değişti (bitti, vazgeçildi dahil) | bugün de yazılıyor | yok |
| Yorum | bugün de yazılıyor | yok |
| Birine ya da bir ajana verildi, atama kalktı | yeni | yeni |
| Alt görev bitti | yeni | görev listesinde alt görev de görevdir; "bitti" yazar |
| Bitti, yeniden açıldı | sütunla yazılıyor | yeni |

**Yazılmayanlar:** başlık, açıklama, tarih, öncelik, etiket, alanlar, faz, not bağı, alt görev ekleme ve silme, görevin başka listeye taşınması.

- **Üzerinde çalışanlar (Worked on):** olaylar az olduğu için ayrıca tutulur. Kartta ya da görevde bir şey değiştiren her insan ve ajan bir kez yazılır, yanında son değişikliğinin zamanı. Açıklamayı yeniden yazan ajan olay bırakmaz ama burada görünür. Liste kişi sayısını geçmez, büyümez.
- **`author` kalır** ve akışın ilk satırı olur: "Kaan created this · 3 Oct". Eski kartlarda da böyle görünür; dosyaya bir şey yazılmaz.
- **Ajan ayrıca bir şey yapmaz.** Yaptığı olaylar ve üzerinde çalıştığı iş kendi kimliğiyle yazılır. "Şunu yaptım, şu kaldı" yine yorumla söylenir.

### 1.3 Ajanın kimliği

- Her ajanın kendi kimliği vardır ve bütün işini onunla yapar. Kimliği yoksa ilk yazışında yenisini oluşturur. Kimse ajanı elle eklemez.
- Ajan hep birinin ajanıdır ve öbürlerinden ayrılır. Kaan'ın bilgisayarındaki Claude Code, Kaan'ın Mac mini'sindeki Claude Code, Kaan'ın ChatGPT'si ve Mert'in Cursor'ı dört ayrı ajandır (9.3).
- **Ekranda:** "Claude Code · Kaan". Bir kişinin aynı adlı iki ajanı varsa yeri de yazılır: "Claude Code (Mac mini) · Kaan". Ad Settings › Agents'tan değişir.
- Ajan space'in kişilerinde de görünür: space sayfasında People altında, sahibinin altında. İnsanlar gibi pasife alınabilir.
- Ajan bir hesap değildir. Sunucuda hesap sayısına ve lisansa girmez; girişi, rolü, daveti yoktur.

### 1.4 Atama

- Bugünkü gibi kalır (9.1). Ajan bir kişi olduğu için işi ajana vermek de mümkün olur (9.2).

### 1.5 Ne yapmaz

- Bir değişiklik geçmişi değildir: eski değerleri ve metinleri tutmaz. Notlardaki History gibi bir sürüm de değildir.
- Okumayı kaydetmez; bir şeye bakmak etkinlik değildir.
- Notlar ve kayıtlar bu işte yok (9.4).

## 2. Kimlik

### 2.1 Ajanın kimliği nerede doğar

- **Sunucuda (`/mcp`):** kimliğin anahtarı hesap ve OAuth istemcisi (`client_id`). Claude Code her makinede kendi kaydını açar; bu yüzden iki makinedeki Claude Code iki ayrı ajandır. claude.ai'nin kaydı herkes için tektir, ama hesapla birleşince her kişinin kendi ajanı olur. Token yenilenip yeniden girilince kayıt aynı kaldığı için kimlik de aynı kalır. Kimlik ilk yazışta oluşur ve sunucuda saklanır: yeni `agent_ids` tablosu (hesap, `client_id`, kimlik, ad, oluşturulma).
- **Bilgisayarda (`scrawl-mcp`):** anahtar kişi, istemcinin adı ve makinenin adı. Kimlik ilk yazışta kişinin kişisel space'inde `.scrawl/agents.json`'a yazılır. Kişisel space başka cihazlara sync olsa da makinenin adı kimlikleri ayırır.
- **Neden modelin hafızasında değil:** model unutabilir, başka bir oturum da yanlış kimliği verebilir. Kimlik bağlantıda durunca her oturum aynı kimliği kendiliğinden kullanır; ajanın bir şey hatırlaması gerekmez.

### 2.2 Kimliğin biçimi

- **id:** `<kişinin id'si>:<ajanın id'si>`, örneğin `69167c7c-2d99-4368-b6d1-8c17e61c8968:4f2a9c1e`. Kişilerin id'si GUID'dir ve `:` taşımaz; `:` hem ajan olduğunu hem kimin ajanı olduğunu söyler. Eski bir uygulama satırın ek alanlarını düşürse bile sahibi kaybolmaz.
- **Ad:** istemcinin adı: "Claude Code", "ChatGPT", "Claude", "Cursor". İstemci adını vermezse "Agent". Gerekirse yanına makinenin adı.
- **Sahibi bilinmeyen ajan:** bilgisayarda `me.json` bulunamazsa ajan "Claude Code (KAAN-PC)" diye sahipsiz bir kimlikle yazar.

### 2.3 Space'teki satır

```json
{ "id": "69167c7c-…:4f2a9c1e", "name": "Claude Code", "agent": { "client": "Claude Code", "place": "Mac mini", "owner": "Kaan Arslan" }, "seen": "2026-10-23T14:02:11.000Z", "active": true }
```

- Ajan bir space'e ilk yazdığında bu satırı `.scrawl/people.json`'a yazar. `seen` günde en çok bir kez güncellenir. Pasife alınan ajan bir sonraki yazışında yeniden aktif olur, insanın space'i yeniden açması gibi.
- `parsePeople` bundan sonra bilmediği alanları korur. Bugün düşürüyor: eski uygulama `agent` alanını silerse, ajanın bir sonraki yazışı onu geri yazar.
- Kişisel space'te kişi listesi yok; etkinlikteki ad yeter. Sahibi hep sensin, ajan yalnız adıyla görünür: "Claude Code".

### 2.4 İnsanların kimliği

- Bugün zaman çizgisine yalnız ad yazılıyor (`by: "Kaan Arslan"`). Bundan sonra kayıtta kimlik de olur (`byId`). Kişi adını değiştirince eski kayıtlar da yeni adı gösterir.

## 3. Dosyada

### 3.1 Kayıt

Kayıtlar kartın `timeline`'ında, bugünkü taşımaların ve yorumların yanında durur. Görevde yeni bir `timeline` alanı olur.

```json
{ "id": "…", "at": "2026-10-23T14:02:11.000Z", "by": "Claude Code · Kaan", "byId": "69167c7c-…:4f2a9c1e", "kind": "assign", "given": { "id": "8d1e…", "name": "Mert Kaya" } }
{ "id": "…", "at": "2026-10-23T14:05:40.000Z", "by": "Claude Code · Kaan", "byId": "69167c7c-…:4f2a9c1e", "kind": "tick", "subtasks": ["a1…", "b2…"] }
```

- **Türler:** `move` ve `comment` bugünkü gibi kalır. Yeniler: `assign` (kime verildiği; atama kalktıysa `given` yok), `tick` (biten alt görevler), görevde `done` ve `reopen`.
- **En az metin:** yalnız olayın kendisi yazılır; eski değer, alan listesi ya da metin yok. Alt görevin adı yazılmaz, kimliği yazılır; ekranda bugünkü adıyla görünür.
- **`by`** bugünkü gibi o anki ad; eski uygulamalar onu okur. **`byId`** yeni: kişinin ya da ajanın kimliği. Yeni uygulama adı ondan, bugünkü haliyle gösterir. `move` ve `comment`'e de eklenir.
- **Birleşen kayıt:** aynı kişinin on dakika içinde art arda bitirdiği alt görevler tek bir `tick` kaydı olur.
- Görev başka listeye taşınınca kayıtları da onunla gider.

```json
"workedOn": [
  { "id": "69167c7c-…", "name": "Kaan Arslan", "at": "2026-10-23T13:40:02.000Z" },
  { "id": "69167c7c-…:4f2a9c1e", "name": "Claude Code", "at": "2026-10-23T14:05:40.000Z" }
]
```

- **`workedOn`:** kartta ve görevde. Kartı ya da görevi değiştiren kişi ya da ajan listede yoksa eklenir, varsa zamanı güncellenir. Kart zaten kaydedilirken yazılır; ayrı bir yazma yok.

### 3.2 Eski dosya, eski uygulama

- Kaydı olmayan eski kartta ve görevde akış `author` ve `created` ile başlar; dosyaya bir şey yazılmaz.
- Masaüstü 0.1.13 ve öncesi, zaman çizgisinde yalnız taşımayı ve yorumu tanır. Böyle bir sürüm panoyu yeniden yazarsa yeni kayıtları ve `byId`'yi düşürür; `workedOn`'u korur. Bu sürümden sonra bilinmeyen kayıtlar korunur. Masaüstü kendini güncellediği için bu boşluk kısa sürer.

### 3.3 Birleştirme (sync)

- Kartın zaman çizgisi bugün kayıtların kimliğine göre birleşiyor; iki tarafın kayıtları da kalıyor. Görevin `timeline`'ı da aynı yolla birleşir. Bugün görevin alanları tek değer gibi birleşiyor; `timeline` için ayrı bir birleşme yazılır. `workedOn` kişiye göre birleşir; iki taraftaki zamanlardan sonuncusu kalır.

### 3.4 Boyut

- Kart, zaman çizgisiyle birlikte panonun dosyasının (`Roadmap.board.json`) içinde durur. Bugün oraya yalnız taşıma ve yorum yazılıyor. Bu taslak oraya az sayıda olay ekler: kartta atama ve biten alt görevler, görevde bitirme, yeniden açma ve atama. Değişikliklerin çoğu (yazı, tarih, öncelik) kayıt bırakmaz.
- `workedOn` kartta çalışan kişi sayısını geçmez, büyümez.
- Bu yüzden pano dosyası bugünkü hızına yakın büyür; belirgin bir fark beklenmez. Kayıtlar kartın içinde kaldığı için kart nereye giderse (başka space, çöp, geri alma) onunla gider; sync onları bugünkü yorumlar gibi birleştirir.

## 4. Ekranda

Mockup: `design/mockups.html`, "Kim ne yaptı, ajanlar dahil" bölümü (23 Ekim, onaylı).

- **Ajan ve insan:** ajan kare içinde istemcisinin baş harfiyle, insan yuvarlakla görünür; aynı harfle başlayan bir insanla karışmaz. Sahibinin adı ajanın adından sonra soluk ve küçük durur: "Claude Code (Mac mini) · Kaan". Dar yerlerde de (görev satırı, telefon) böyledir; sahibinin adı ajanın adına yazılmaz, her yerde yanında gösterilir (23 Ekim, kullanıcının kararı).
- **Kart penceresi:** zaman çizgisinde her olay tek kısa satır: "Kaan created this", "Kaan gave it to Claude Code (Mac mini) · Kaan", "Claude Code (Mac mini) · Kaan Todo → Doing", "… ticked 3 subtasks". Olayı yapan koyu, sahibi soluk, olay ikisinin arası renkte.
- **Worked on:** kart penceresinde sağda, alanların altında; en son çalışan üstte, yanında zamanı.
- **Atama:** Assignee'de seçici: Nobody, People in Scrawl, sonra Agents; her ajanın yanında kimin olduğu ("yours", "Mert's").
- **Kart yüzü:** atananın solunda, üzerinde çalışmış ajanlar küçük ve soluk karelerle.
- **Görev:** satırın ··· menüsünde Delete'ten önce Activity…; küçük pencerede Worked on ve olaylar, Close ile. Telefonda görev sheet'inin altında Activity.
- **Settings › Agents:** bilgisayarın bloğunda bu bilgisayardaki ajanlar, sunucunun bloğunda bağlı ajanlar, adlarıyla. Menüde Rename (yerinde, Cancel ve Save ile) ve sunucudakilerde Disconnect.
- **Space sayfası:** People'ın altında Agents: her ajan, kimin ajanı olduğu ve son görülme; menüde Make inactive.
- **Telefon:** kart sayfasında Assignee ve Worked on, aşağıda aynı akış; atama sheet'inde insanlar ve ajanlar; görev sheet'inde Activity.

## 5. Ajan

- **Kimlik:** kapı, yani bilgisayardaki `scrawl-mcp` ya da sunucudaki `/mcp`, ilk yazışta kimliği bulur ya da oluşturur. Yazan her araç onu kullanır, yorum da. Modelin bir şey vermesi gerekmez.
- **`spaces`:** `you` alanında ajanın adı ve kimliği; her space'te `people` yanında `agents`.
- **`cards` ve `tasks`:** tam halde `activity` (olaylar, son 20, adlarla) ve `workedOn`. Kısa listede `workedOn`, yalnız adlar. Yeni süzgeç `by`: `workedOn`'a göre kimin çalıştığı; `"self"` ajanın kendisi, `"me"` kişi, ya da bir ad. Bir de `since`: o kişinin o günden sonra çalıştıkları.
- **Atama** 9.2'ye bağlı. Evet denirse `assignee: "self"` işi ajana verir; `cards` ve `tasks`'ta `assignee: "self"` ajana verilenleri getirir.
- **Rehber:** "Değiştirdiğin her şey kendi kimliğinle kaydedilir; ayrıca yazman gerekmez. Ne yaptığını ve ne kaldığını yorumla söyle. Dün ne yaptığını `by: "self"` ve `since` ile bulursun."

## 6. Kodda

**core**
- `people.ts`: `Actor` (`by` ve `byId`), ajan kimliği yardımcıları, ajanın satırı; `parsePeople` bilinmeyen alanları korur.
- `board.ts`: `TimelineEntry`'ye `assign` ve `tick`, kayıtlara `byId`; kartta `workedOn`. `addCard`, `updateCard`, alt görev işlemleri, `moveCard` ve yorum bugünkü `by` adı yerine `Actor` alır; birleşen `tick`.
- `tasks.ts`: `timeline` (`done`, `reopen`, `assign`) ve `workedOn`; `addTask`, `updateTask`, bitirme ve taşıma `Actor` alır.
- `sync/merge-files.ts`: görevin `timeline`'ı.
- Çöpten dönüş ve Copy as brief.

**agent**
- `space.ts`: `actorOf` kimliği verir; `Agent` arayüzüne kimliği bulan ya da oluşturan bir işlev; space'te satırı yazan `meet`.
- Araçlar, `read.ts` (`spaces`), `guide.ts`, `server.ts` (şemalar ve açıklamalar).

**apps/mcp**
- `.scrawl/agents.json` ve makinenin adı.

**apps/server**
- `agent_ids` tablosu: hesap ve `client_id`'den kimliğe ve ada. Settings › Agents API'sinde ad ve Rename. `/mcp` kimliği araçlara verir.

**web**
- `session.ts` (bugün `by` yalnız adı veriyor; `Actor` olur), `CardPanel.tsx` (akış), `Tasks.tsx` (Activity), `Agents.tsx` (Rename), People listesi, telefon ekranları, `styles.css`, `phone.css`, `packages/i18n/src/en.ts`.

**Belgeler**
- PLAN 4.3 (son madde eskimiş), 4.4 (zaman çizgisi; kartta "atanan (kişi ya da ajan adı)"), 4.8.
- `design/agent.md` 5. bölüm (Aktör ve iz) yeniden yazılır. "Atama için ajan bir kişi değildir; `people.json`'a girmez" satırı kullanıcının kararı değildi, çıkar.

## 7. Testler

- **core:** önemli olaylar kayıt yazar, öbür değişiklikler yazmaz ama `workedOn`'u günceller; birleşen `tick` (on dakika, araya başkası girince ayrı); `workedOn` iki tarafta birleşir; yalnız `by`'ı olan eski kayıt okunur; bilinmeyen kayıt korunur; görev taşınınca kayıtları gider; görevin `timeline`'ı birleşir; `parsePeople` bilinmeyen alanı korur.
- **agent:** ilk yazış kimliği oluşturur, ikincisi aynısını kullanır; okuyan araç oluşturmaz; iki istemci iki kimlik; aynı istemci iki makinede iki kimlik; `by: "self"` ve `since`; `spaces` çıktısı; space'teki satır günde bir kez.
- **server:** aynı hesap ve `client_id` aynı kimlik; yeniden girişte aynı kimlik; başka hesap başka kimlik; Rename; `/mcp` kayıtlarında kimlik.
- **mcp:** `agents.json` oluşur, makinenin adı doğru.
- **Tarayıcıda** (localhost:5173): akış, Worked on, Activity penceresi, Settings › Agents, telefon öykünmesi.
- **Kullanıcının denemesi:** Roadmap'te PC'deki ve Mac mini'deki Claude Code aynı kartta çalışır ve ayrı görünür; ChatGPT ile bir görev değiştirilir.

## 8. Dilimler

0. Mockup, onay.
1. Kimlik: sunucuda ve bilgisayarda ajanın kimliği, space'teki satır, Settings › Agents'ta ad.
2. Kartın etkinliği (core + web).
3. Görevin etkinliği.
4. Ajanın araçları ve rehber (`by`, `activity`, `workedOn`).
5. Telefon.

Sonra yayın; kararı kullanıcının. Her dilimden sonra commit sorulur. Aşama tablosundaki yeri ve dilimlerin sırası kavram onaylanınca sorulur.

## 9. Onay bekleyen kararlar

1. **Atama**
   - a) Bugünkü gibi tek kişi kalır ve "kimin işi" demektir. Öneri: birden çok kişinin ve ajanın çalıştığı etkinlikte görünür.
   - b) Çok kişili atama da yapılır (ilk istek).
2. **İş ajana verilebilsin mi?**
   - a) Evet: atama seçicisinde ajanlar da olur, ajan kendisine verilenleri bulur. Öneri.
   - b) Hayır: ajan yalnız etkinlikte görünür.
3. **Ajanlar nasıl ayrılır?**
   - a) Bağlantıya göre. Öneri. Sunucuda istemcinin her kaydı ayrı bir ajandır; Claude Code'un her makinedeki kaydı ve ChatGPT'nin bağlantısı gibi. Bilgisayarda istemci ve makine birlikte bir ajandır. Aynı makinede açılan iki Claude Code oturumu tek ajandır.
   - b) a'ya ek olarak ajan kendine ayrı bir kimlik de açabilir, örneğin bir iş için "Reviewer". Ama ajan o kimliği unutursa her oturumda yenisi açılabilir.
   - c) Her oturum ayrı bir ajan olur. İstemciler bugün oturumu Scrawl'a söylemiyor; bu ancak ajan kendisi söylerse olur ve güvenilmez.
4. **Kapsam**
   - a) Görev ve kart. Öneri.
   - b) Notlar ve kayıtlar da: notun History'sinde her sürümün kimden geldiği, kaydın da kendi etkinliği.

## 10. Yazılırken: 1. dilim (Kimlik)

23 Ekim. Kodda; Roadmap ROA-219, deneme ROA-224.

- **Varsayılan ad.** Bilgisayardaki ajanın adında makinenin adı hep var: "Claude Code (KAAN-PC)". Makinenin adı masaüstü uygulamasının aldığı gibi `COMPUTERNAME`, `HOSTNAME`, yoksa bilgisayarın adı; alan adı atılır. Sunucu ajanın hangi makinede olduğunu bilmez: orada ad yalnız istemcinin adıdır, aynı hesabın aynı istemciden ikinci ajanı "Claude Code (2)" olur. Ad Settings › Agents'tan değişir. Sahibinin adı ada yazılmaz; ekranda her yerde yanında durur (4. bölüm). Makinenin adı bilgisayardaki ajanda kalır: aynı kişinin iki bilgisayardaki ajanını o ayırır, olmasa sunucudaki aynı istemciyle de aynı adı alırdı.
- **Sunucuda anahtar.** Hesap ve OAuth istemcisi (`agent_identities` tablosu). Aynı istemci yeniden girince aynı kimliği alır. Kimlik ajanın ilk yazışında açılır; ondan önce listede istemcinin adı görünür. Rename henüz yazmamış bir bağlantının kimliğini o adla açar. `PATCH /api/v1/agents/:id` `{ name }`.
- **Bilgisayarda** `.scrawl/agents.json` kişisel space'te; sync'te kayıt kayıt birleşir (`agents` türü). İki oturum aynı anda açarsa önce açılanı kullanılır. `seen` günde en çok bir kez yazılır; listede son görülme ondan.
- **Space'e yazılması.** Yazan sekiz aracın (`write`, `create`, `trash`, `move`, `save_record`, `save_card`, `comment`, `save_task`) sonucu hangi space'i söylüyorsa ajan oraya yazılır; tek bir sarmalayıcıda. `people.json`'da `agent: { client, place, owner }` alanıyla; `owner` sahibinin o anki adıdır. Ekran sahibin adını önce space'in kişilerinden alır, orada yoksa (sahibi space'i uygulamadan hiç açmamışsa) `owner`'dan; sahibi adını değiştirince ajanın bir sonraki yazışında satır da değişir. `parsePeople` artık bilinmeyen alanları korur.
- **`author`.** Ajanın açtığı görev ve kart `{ id, name }` taşır. Kimliği bilinmeyen kapıda (kişisi olmayan klasör) eskisi gibi "Claude Code · Kaan".
- **2. dilime kadar.** Ajanlar atama seçicilerinde ve People listesinde yok; space sayfasında yalnız Agents altında. `spaces` aracının `people`'ında da yok, kişi adıyla atamada da aranmaz.
- **Ekranda.** Settings › Agents'ta bilgisayarın bloğunda bu bilgisayarın ajanları (masaüstünün bilgisayar adıyla süzülür; ad bilinmezse hepsi), sunucunun bloğunda bağlı ajanlar adlarıyla; menüde Rename (yerinde, Cancel ve Save), sunucudakilerde Disconnect. Telefonda adlar görünür, Rename yok (taslakta yoktu). Ajanın karesi uygulamada da kare: masaüstünde 5, telefonda 8 piksel köşe.
- **Denenmedi.** Masaüstü uygulamasında bilgisayarın bloğu ve gerçek istemcilerle (Claude Code stdio, claude.ai, ChatGPT) yazış.
