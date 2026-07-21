# Data Lens — AI Mode Spec & Görev Planı

> Durum: Taslak v1
> Hedef: Kullanıcının doğal dille (tek prompt) neredeyse arayüzdeki her işi yaptırabildiği,
> goal-loop tabanlı, token-ekonomik bir AI asistanı.

## 0. Tasarım ilkeleri

1. **Tek doğruluk kaynağı = Capability Registry.** Arayüzdeki her yetenek (dashboard,
   widget, filtre, ilişki, rapor, KPI…) tek bir kayıt dosyasında tanımlanır. Yeni bir
   yetenek eklendiğinde AI onu otomatik kullanabilir; ayrıca kod yazmaya gerek kalmaz.
2. **Token ekonomisi.** LLM'e tüm fonksiyonlar tek tek verilmez. Yalnızca 2 araç verilir:
   `search_capabilities` (yetenek arama) ve `execute_code` (code mode). LLM önce arar,
   ilk ~5 sonuçtan ilgili olanları kullanır.
3. **Goal loop.** LLM, kullanıcının hedefine ulaşana kadar (veya bütçe/tur sınırına kadar)
   döngüde çalışır: gözlem → düşün → araç çağır → gözlem… Ayarlardan sınırlanabilir.
4. **Browser-first, güvenli.** Analiz tarayıcıda (DuckDB). LLM ham veri değil, şema/profil
   ve yetenek imzaları görür. Code mode gerçek bir sandbox'ta çalışır (aşağıya bkz.).
5. **Deterministik yan etki yok.** LLM yalnızca kayıtlı yetenekleri çağırır; serbest DOM
   erişimi, ağ, dosya, eval yoktur.

---

## 1. Mimari katmanlar (yeni)

```
src/ai/
├── capabilities/
│   ├── types.ts            # Capability, CapabilityResult tipleri
│   ├── registry.ts         # registerCapability, searchCapabilities, getCapability
│   └── defs/               # Yetenek tanımları (alan bazlı, otomatik toplanır)
│       ├── dashboard.ts    # createDashboard, listDashboards, setActiveDashboard...
│       ├── widget.ts       # addWidget, removeWidget, configureKpi, setChartColumns...
│       ├── filter.ts       # applyFilter, clearFilters, listActiveFilters
│       ├── relationship.ts # detectRelationships, addRelationship, listRelationships
│       ├── data.ts         # runSql (read-only), getSchema, getColumnStats, sampleRows
│       └── report.ts       # addReportBlock, ... (rapor aşamasında dolar)
├── agent/
│   ├── agentLoop.ts        # goal loop orkestratörü (Flownie deseni sadeleştirilmiş)
│   ├── budgetGuard.ts      # tur/tekrar/bütçe sınırı, graceful stop
│   ├── tools.ts            # search_capabilities + execute_code tool şemaları
│   └── observation.ts      # araç sonuçlarını LLM'e geri besleme metni
├── codeMode/
│   ├── sdk.ts              # LLM koduna sunulan flownie/datalens objesi (whitelist)
│   ├── executor.ts         # kodu güvenli çalıştırır (Web Worker sandbox)
│   └── sandbox.worker.ts   # izole worker; sadece SDK köprüsü üzerinden çağrı
└── llm/
    └── chatClient.ts       # provider'a mesaj + function-calling (ai-client refactor)
```

Not: `services/widgetData.ts`, `dashboard-engine.ts`, `data-engine.ts` mevcut ve
capability'ler bunların üzerine kurulur (yeniden SQL yazılmaz).

---

## 2. Capability Registry (kalp)

### 2.1 Tip
```ts
interface Capability<Args = any, Result = any> {
  id: string                     // 'widget.add', 'filter.apply'
  title: string                  // insan-okur
  description: string            // LLM aramasında eşleşen açıklama
  keywords: string[]             // arama isabetini artırır
  category: string               // 'dashboard' | 'widget' | 'filter' | ...
  argsSchema: JSONSchema         // LLM ve doğrulama için
  sideEffect: boolean            // true ise durum değiştirir (loglanır)
  run(args: Args, ctx: CapabilityContext): Promise<CapabilityResult<Result>>
}
interface CapabilityResult<T> { success: boolean; data?: T; message: string; error?: string }
```

### 2.2 Kayıt + arama
- `registerCapability(cap)` — defs/*'tan uygulama açılışında toplanır.
- `searchCapabilities(query, limit=5)` — keyword + başlık + açıklama üzerinde
  hafif skorlama (BM25-benzeri veya basit token overlap). LLM'e yalnızca
  `{id, title, description, argsSchema}` döner (imza), gövde dönmez → az token.
- `getCapability(id)` — code mode / doğrudan çağrı için.

### 2.3 İlk kapsam (mevcut arayüzden türetilir)
| id | işlev |
| --- | --- |
| dashboard.create / .list / .setActive / .delete | pano yönetimi |
| dashboard.linkTables | panoya dosya bağla |
| widget.add / .remove / .restore / .list | widget yönetimi (kpi/table/bar/line/pie) |
| widget.setChartColumns | bar/line X/Y + tip |
| kpi.addCard / .updateCard / .removeCard | KPI kartları |
| filter.apply / .clear / .list | çapraz filtre (structured) |
| relationship.detect / .add / .list / .remove | ilişki (JOIN) |
| data.getSchema / .sampleRows / .getColumnStats / .runSql | keşif (read-only) |

> Yeni widget tipleri eklendikçe `widget.add` enum'u ve `widget.*` defs otomatik büyür.

---

## 3. Agent (goal loop)

Flownie'deki `runAgentLoop` sadeleştirilir. Her tur:
1. LLM'e mesaj + 2 tool (`search_capabilities`, `execute_code`) gönder.
2. Dönen tool çağrılarını çalıştır:
   - `search_capabilities(query)` → ilk 5 yetenek imzası.
   - `execute_code(code)` → code mode executor (aşağıda).
3. Sonuçları `observation` metnine çevir, sıradaki tura besle.
4. LLM tool çağırmadan yanıt verirse → hedef tamam (final).
5. `budgetGuard`: `maxRounds` (ayar), tekrar tespiti, hata serisi → graceful stop.

Ayar (Settings): `aiMaxRounds` (vars. 8), `aiMaxCodeCalls` (vars. 5), timeout.

---

## 4. Code Mode (güvenli)

LLM tarayıcı JS'i yazar; SDK üzerinden birden çok yetenek çağırabilir.

```js
const dashId = await datalens.getActiveDashboard()
await datalens.call('widget.add', { dashboardId: dashId, type: 'bar' })
const cols = await datalens.call('data.getSchema', {})
// ... koşullu, döngülü çok adımlı iş
```

### Güvenlik (Flownie'deki eksiği düzelterek)
- **Web Worker sandbox**: kod ana thread'de `new Function` ile DEĞİL, izole bir
  worker içinde çalışır. Worker'da `window/document/fetch/eval` yok.
- Worker yalnızca `datalens.call(capabilityId, args)` köprüsüyle ana thread'e
  postMessage atar; ana thread capability'yi registry'den doğrular ve çalıştırır.
- Zaman aşımı + çağrı sayısı limiti; sonsuz döngüde worker terminate edilir.
- `data.runSql` yalnızca SELECT/WITH (mevcut `isSafeSelect`).

---

## 5. Chat UI

- Varsayılan: ekranın ortasında, yazınca yukarı kayıp küçülen bir **komut girişi**
  (Spotlight/Raycast hissi). İstenirse **sol sidebar** moduna geçilebilir (ayar).
- Akış: kullanıcı promptu → tur tur "durum" satırları (arıyor / kod çalıştırıyor /
  X widget eklendi) → final özet. Her `sideEffect` capability sonucu mini bir
  "yapıldı" kartı olarak akışta görünür.
- İptal (abort) butonu; goal loop güvenle durur.
- i18n: tüm metinler tr/en.

---

## 6. Fazlar ve görevler

### Faz 1 — Capability Registry omurgası
- [ ] `ai/capabilities/types.ts` + `registry.ts` (register/search/get)
- [ ] `searchCapabilities` skorlama + limit
- [ ] `defs/data.ts` (getSchema, sampleRows, getColumnStats, runSql) — mevcut motorlar üstüne
- [ ] `defs/dashboard.ts`, `defs/widget.ts`, `defs/filter.ts`, `defs/relationship.ts`
- [ ] Registry birim testleri (arama isabeti, argsSchema doğrulama)

### Faz 2 — LLM tool katmanı + chat client
- [ ] `llm/chatClient.ts`: `ai-client` refactor, function-calling destekli mesaj döngüsü
- [ ] `agent/tools.ts`: `search_capabilities` + `execute_code` şemaları
- [ ] `agent/observation.ts`, `agent/budgetGuard.ts`
- [ ] `agent/agentLoop.ts`: goal loop (abort + graceful stop)
- [ ] Ayarlar: maxRounds / maxCodeCalls / timeout (localStorage + Settings UI)

### Faz 3 — Code Mode (Web Worker sandbox)
- [ ] `codeMode/sandbox.worker.ts` (izole worker + köprü protokolü)
- [ ] `codeMode/executor.ts` (timeout, çağrı limiti, terminate)
- [ ] `codeMode/sdk.ts` (`datalens.call`, read-only yardımcılar)
- [ ] Güvenlik testleri (globals engeli, timeout, çağrı limiti)

### Faz 4 — Chat UI
- [ ] Merkez komut girişi (fade/scale) + sidebar modu toggle
- [ ] Tur/durum akışı, sideEffect "yapıldı" kartları, abort
- [ ] i18n tr/en
- [ ] Uçtan uca senaryo: "Bölgelere göre satış grafiği ekle ve en düşük bölgeyi filtrele"

### Faz 5 — Genişletme (AI destekli, artık ucuz)
- [ ] Yeni ECharts widget tipleri (treemap/gauge/funnel/heatmap/radar) → `widget.*` otomatik büyür
- [ ] Rapor yeteneği (`defs/report.ts`) → AI rapor da üretebilir

---

## 7. Riskler / açık kararlar

- **LLM anahtarı**: şu an tarayıcıda (localStorage). Yerel-öncelikli, kullanıcının kendi
  anahtarı için kabul edilebilir; ama üretimde küçük bir backend proxy önerilir
  (LLM_API_CONTRACT.md ile uyumlu). Karar: MVP'de browser, GA'da proxy.
- **Code mode sandbox**: Web Worker şart (ana thread `new Function` güvensiz).
- **Belirsiz prompt**: agent önce `data.getSchema`/`sampleRows` ile keşfetmeli;
  emin olamazsa kullanıcıya tek soru sorup devam etmeli (sonsuz loop değil).
- **Geri alma (undo)**: sideEffect capability'ler için ileride bir işlem geçmişi.

---

## 8. İlk somut hedef (Definition of Done — MVP)

Kullanıcı ortadaki girişe şunu yazar:
> "kırklareli raporundan şehirlere göre başvuru sayısını bar grafik yap, en çoğu seç"

AI: schema'yı keşfeder → uygun bir dashboard/widget kurar (`widget.add`,
`widget.setChartColumns`) → en yüksek kategoriye çapraz filtre uygular
(`filter.apply`) → kısa bir özetle biter. Tümü goal loop içinde, 2 tool ile,
kullanıcı tek cümle yazarak.
