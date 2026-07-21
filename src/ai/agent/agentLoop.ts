// ai/agent/agentLoop.ts
// Goal loop orkestratörü. Kullanıcının promptunu, hedefe ulaşana (veya bütçe
// sınırına) kadar tur tur çalıştırır:
//   LLM'e mesaj + tools gönder -> tool_calls'ı çalıştır -> sonuçları geri besle -> tekrar.
// Model tool çağırmadan yanıt verince hedef tamamlanmış sayılır.

import { chatComplete, parseToolArgs, userMessageWithImage, type ChatMessage } from '../llm/chatClient'
import { getBridge } from '../appBridge'
import { getAiRuntimeSettings } from '../settings'
import {
  TOOL_DEFS,
  runSearchCapabilities,
  runCallCapability,
  runExecuteCode,
  isCapabilityId,
  runDirectCapability,
} from './tools'
import { toToolMessage, humanSummary, type ExecutedTool } from './observation'
import {
  initGuard,
  canStartRound,
  canRunCode,
  isRepeat,
  recordOutcome,
  type StopReason,
} from './budgetGuard'
import i18n from '../../i18n'

export interface AgentCallbacks {
  onStatus?: (text: string) => void          // "arıyor", "widget ekleniyor" gibi
  onAssistantText?: (text: string) => void    // ara düşünce/metin (varsa)
  onToolResult?: (summary: string, success: boolean, result?: any) => void
  onFinal: (text: string) => void             // hedef tamam, final yanıt
  onQuestion?: (question: string) => void      // agent kullanıcıya soru sordu (round-trip)
  onStop?: (reason: StopReason) => void
  isAborted?: () => boolean
  signal?: AbortSignal
}

// Agent kullanıcıya soru sorduğunda dönen "beklemede" durumu. Kullanıcı yanıtlayınca
// resumeAgentLoop bu state ile döngüyü kaldığı yerden sürdürür.
export interface AgentPending {
  question: string
  messages: ChatMessage[]
  answerCallId: string
}

export interface AgentRunResult {
  rounds: number
  stopReason: StopReason
  finalText: string | null
  pending?: AgentPending
  messages: ChatMessage[]  // güncellenmiş tam konuşma (system dahil) — kalıcı hafıza için
}

function buildSystemPrompt(): string {
  const bridge = getBridge()
  const datasets = bridge.getDatasets()
  const dashboards = bridge.getDashboards()
  const activeId = bridge.getActiveDashboardId()
  const userLang = i18n.language || 'tr'

  const activeTab = bridge.getActiveTab()
  const activeDash = dashboards.find(d => d.id === activeId)
  const reports = bridge.getReports()
  const activeReport = reports.find(r => r.id === bridge.getActiveReportId())
  const tabLabel: Record<string, string> = { files: 'Files', dashboard: 'Dashboard', sqllab: 'SQL Lab', reports: 'Reports' }
  let currentView = `Current screen: ${tabLabel[activeTab] ?? activeTab}`
  if (activeTab === 'dashboard' && activeDash) currentView += ` (active dashboard: "${activeDash.name}", linked: ${activeDash.linkedTableNames.join(', ') || 'none'})`
  if (activeTab === 'reports' && activeReport) currentView += ` (active report: "${activeReport.name}", ${activeReport.blocks.length} blocks)`

  const dataSummary = datasets.map(d =>
    `- ${d.name} (table: ${d.tableName}, ${d.totalRows} rows, columns: ${d.columns.map(c => `${c.name}:${c.kind}`).join(', ')})`
  ).join('\n') || '(no data loaded yet)'

  const dashSummary = dashboards.map(d =>
    `- ${d.name} (id: ${d.id}${d.id === activeId ? ', ACTIVE' : ''}, linked: ${d.linkedTableNames.join(', ')})`
  ).join('\n') || '(no dashboards)'

  return `You are the AI assistant of "Data Lens", an in-browser data analysis app.
You fulfill the user's natural-language request STEP BY STEP using the provided tools.

WORKING STYLE:
1. If you are unsure what you can do, FIRST use "search_capabilities" (search in ENGLISH, e.g. "bar chart", "cross filter", "create dashboard", "column schema").
2. Run a discovered capability with "call_capability" by giving its id and arguments.
   Capabilities are NOT directly callable functions. NEVER call a name like "dashboard.create" directly — always wrap it, e.g. call_capability({ id: "dashboard.create", args: { name: "hello world" } }).
3. If a capability appears in search results, it EXISTS — do NOT claim you lack the capability. Call it.
4. For conditional/looping multi-capability work, use "execute_code" (inside the code: \`await datalens.call(id, args)\`).
5. Use data.getSchema / data.sampleRows / data.runSql to understand the data when needed.
6. When the goal is achieved, reply WITHOUT calling any tool, with a SHORT summary.
7. If the request is genuinely ambiguous and the schema cannot resolve it, use "ask_user" to ask ONE short question (alone), then stop.
8. You know where the user currently is (see CURRENT VIEW). Interpret words like "here"/"this" relative to that screen. Use "app.navigate" to move the user between screens/dashboards/reports when it helps — the user sees the navigation. Use "app.getContext" if you need fresh context mid-task.
9. To add a paragraph, summary or commentary to a report: WRITE the text yourself and call report.addText with it (as markdown). If a report already exists it is used; if none exists, pass a sensible reportName (derived from the user's request) so it is created with a proper name — or call report.create first. NEVER say editing report text "cannot be done with a tool".

LANGUAGE:
- Tool names, capability ids, descriptions and your search_capabilities queries are ALWAYS in English, regardless of the user's language.
- The user's language code is "${userLang}". ALWAYS write your questions and final answers to the USER in that language.

RULES:
- If unsure, inspect the schema first; never invent column names.
- Use ask_user only when truly necessary and on its own (not alongside other tools).
- Don't assume too much at once; take small steps and observe the result.

SURFACES YOU CONTROL (know these well — the user often just says "here"/"this"):
- DASHBOARD: a grid of instance widgets. Each is a WidgetInstance { type, sourceTable, config }. Types: kpi, gauge, bar, line, pie, scatter, treemap, funnel, radar, table, search, slicer, and "aiInsight". Create → widget.create; edit → widget.configure; delete → widget.delete; list → widget.list. Cross-filter → filter.apply / filter.clear (clicking a chart also cross-filters every widget).
- AI INSIGHT WIDGET ("aiInsight"): a FREE-FORM, filter-aware card. Create it with call_capability({ id: "widget.create", args: { type: "aiInsight", prompt: "<what the card should show>" } }). The app then writes SQL + an HTML template that renders live and reacts to the dashboard filter. PREFER aiInsight whenever the user wants a custom "card", "summary card", "smart card", "insight", or KPI-style HTML that plain charts can't express.
- REPORT: a document of blocks. Narrative → report.addText (markdown; "#/##/###" headings and "---" divider render). Chart → report.addChartFromQuery. Table → report.addTableFromQuery. RICH HTML insight card → report.addInsightCard({ htmlTemplate, queries, title }) where each query reads FROM a table named "data". Use report.addInsightCard for KPI/summary cards inside reports. (An "AI Writer" block also exists that the user can add from the UI.)
- SQL LAB: natural-language → multi-table SQL; query results can host widgets (including aiInsight).

INSIGHT RULE: if the user asks for an "insight", "smart/summary card", or a rich visual beyond a basic chart → on the DASHBOARD use widget.create type "aiInsight" (+ a clear prompt); in a REPORT use report.addInsightCard. NEVER claim this is impossible — these capabilities exist (verify via search_capabilities with "aiInsight" or "insight card").

CURRENT VIEW:
${currentView}

CURRENT DATA:
${dataSummary}

DASHBOARDS:
${dashSummary}`
}

export async function runAgentLoop(prompt: string, callbacks: AgentCallbacks, priorHistory: ChatMessage[] = [], image?: string): Promise<AgentRunResult> {
  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt() },
    ...priorHistory,
    // Görsel varsa ilk kullanıcı mesajı çok-kipli (metin + ekran görüntüsü) olur.
    userMessageWithImage(prompt, image),
  ]
  return runLoop(messages, callbacks)
}

// Agent bir soru sorup durduğunda (awaiting_user), kullanıcının yanıtıyla döngüyü sürdürür.
// Yanıt hem ask_user'ın tool cevabı (protokol) hem de bir user mesajı olarak eklenir
// (zayıf modellerin "kullanıcı cevap verdi"yi net görmesi için).
export async function resumeAgentLoop(pending: AgentPending, answer: string, callbacks: AgentCallbacks): Promise<AgentRunResult> {
  const prev = pending.messages[0]?.role === 'system' ? pending.messages.slice(1) : pending.messages
  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt() },
    ...prev,
    { role: 'tool', tool_call_id: pending.answerCallId, name: 'ask_user', content: answer },
    { role: 'user', content: answer },
  ]
  return runLoop(messages, callbacks)
}

async function runLoop(messages: ChatMessage[], callbacks: AgentCallbacks): Promise<AgentRunResult> {
  const settings = getAiRuntimeSettings()
  const guard = initGuard(settings)

  let finalText: string | null = null
  let pending: AgentPending | undefined

  const finish = (reason: StopReason): AgentRunResult => {
    callbacks.onStop?.(reason)
    return { rounds: guard.round, stopReason: reason, finalText, pending, messages }
  }

  while (true) {
    if (callbacks.isAborted?.()) return finish('aborted')

    const gate = canStartRound(guard)
    if (!gate.ok) return finish(gate.reason!)

    guard.round++
    callbacks.onStatus?.(i18n.t('ai.status.thinking', { round: guard.round }))

    let resp
    try {
      resp = await chatComplete({ messages, tools: TOOL_DEFS, signal: callbacks.signal })
    } catch (err: any) {
      if (err?.name === 'AbortError' || callbacks.isAborted?.()) return finish('aborted')
      guard.errorStreak++
      callbacks.onToolResult?.(i18n.t('ai.tool.llmError', { msg: err?.message ?? err }), false)
      continue
    }

    // Model tool çağırmadıysa: final yanıt.
    if (!resp.toolCalls || resp.toolCalls.length === 0) {
      finalText = resp.content ?? ''
      messages.push({ role: 'assistant', content: finalText })
      callbacks.onFinal(finalText)
      return finish('completed')
    }

    // Assistant turunu (tool_calls ile) geçmişe ekle.
    messages.push({ role: 'assistant', content: resp.content ?? null, tool_calls: resp.toolCalls })

    let roundHadError = false
    let pendingCall: typeof resp.toolCalls[number] | null = null
    // Bu turda bir yetenek ekran görüntüsü ürettiyse, tool cevaplarından SONRA modele
    // çok-kipli kullanıcı mesajı olarak eklenir (tool cevaplarının bitişikliğini bozmadan).
    const roundImages: { label: string; image: string }[] = []

    for (const call of resp.toolCalls) {
      if (callbacks.isAborted?.()) return finish('aborted')

      const name = call.function.name
      const args = parseToolArgs(call)

      // Kullanıcıya soru: burada YANITLAMAYIZ; round bitince awaiting_user ile döneriz,
      // ask_user'ın tool cevabı kullanıcı yanıt verince resumeAgentLoop'ta eklenir.
      if (name === 'ask_user') {
        if (!pendingCall) {
          pendingCall = call
          callbacks.onQuestion?.(String(args?.question ?? ''))
        }
        continue
      }

      // Tekrar tespiti (yalnızca yan etkili çağrılar için katı olalım).
      // Bloklanan çağrıda recordOutcome ÇAĞIRMAYIZ; böylece son başarılı imza korunur
      // ve arka arkaya gelen aynı çağrılar da bloklanmaya devam eder.
      // call_capability veya doğrudan-capability çağrısı için tekrar kontrolü uygula.
      const isDirectCap = name !== 'call_capability' && name !== 'search_capabilities'
        && name !== 'execute_code' && isCapabilityId(name)
      if ((name === 'call_capability' || isDirectCap) && isRepeat(guard, name, args)) {
        const repeatMsg = { success: false, message: i18n.t('ai.tool.repeatBlocked'), error: 'repetition' }
        messages.push(toToolMessage({ call, result: repeatMsg }))
        callbacks.onToolResult?.(repeatMsg.message, false)
        continue
      }

      let result: any
      if (name === 'search_capabilities') {
        callbacks.onStatus?.(i18n.t('ai.status.searching'))
        result = runSearchCapabilities(args)
      } else if (name === 'call_capability') {
        callbacks.onStatus?.(i18n.t('ai.status.applying'))
        result = await runCallCapability(args)
      } else if (name === 'execute_code') {
        if (!canRunCode(guard)) {
          result = { success: false, message: i18n.t('ai.tool.codeLimit'), error: 'max_code_calls' }
        } else {
          guard.codeCalls++
          callbacks.onStatus?.(i18n.t('ai.status.runningCode'))
          result = await runExecuteCode(args)
        }
      } else if (isDirectCap) {
        // Model, keşfettiği yeteneği call_capability'ye sarmalamadan doğrudan çağırdı.
        // Argümanlar ya doğrudan (ör. {name:'...'}) ya da {id?, args?} biçiminde gelebilir.
        callbacks.onStatus?.(i18n.t('ai.status.applying'))
        const directArgs = (args && typeof args === 'object' && 'args' in args && Object.keys(args).length <= 2)
          ? (args.args ?? {})
          : args
        result = await runDirectCapability(name, directArgs)
      } else {
        result = { success: false, message: i18n.t('ai.tool.unknownTool', { name }), error: 'unknown_tool' }
      }

      const exec: ExecutedTool = { call, result }
      messages.push(toToolMessage(exec))
      // Yakalanan ekran görüntüsünü topla (modele sonra görsel olarak verilecek).
      if (result?.data?.isImage && typeof result.data.image === 'string') {
        roundImages.push({ label: String(result.data.label ?? ''), image: result.data.image })
      }
      const summary = humanSummary(exec)
      const ok = result?.ok === true || result?.success === true
      recordOutcome(guard, name, args, ok)
      callbacks.onToolResult?.(summary, ok, result)
      if (!ok && name !== 'search_capabilities') roundHadError = true
    }

    // Yakalanan ekran görüntülerini modele görsel olarak ver (tool cevaplarından SONRA,
    // birden fazla ardışık user mesajı OpenAI/Ollama'da geçerlidir).
    for (const img of roundImages) {
      const caption = i18n.t('ai.screenshotForModel', { label: img.label, defaultValue: `İstediğin ekran görüntüsü (${img.label}). Bu görseli analiz et.` })
      messages.push(userMessageWithImage(caption, img.image))
    }

    // Bu round bir soru içeriyorsa: diğer çağrılar yanıtlandı, kullanıcı yanıtını bekle.
    if (pendingCall) {
      pending = { question: String(parseToolArgs(pendingCall)?.question ?? ''), messages: [...messages], answerCallId: pendingCall.id }
      return finish('awaiting_user')
    }

    guard.errorStreak = roundHadError ? guard.errorStreak + 1 : 0
  }
}
