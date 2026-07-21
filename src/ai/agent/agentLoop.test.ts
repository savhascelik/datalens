import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Dashboard, Dataset } from '../../types'

// chatComplete'i mock'la: gerçek LLM yerine senaryoyu tur tur besleriz.
const { chatCompleteMock } = vi.hoisted(() => ({ chatCompleteMock: vi.fn() }))
vi.mock('../llm/chatClient', () => ({
  chatComplete: chatCompleteMock,
  parseToolArgs: (call: any) => { try { return JSON.parse(call.function.arguments || '{}') } catch { return {} } },
  userMessageWithImage: (text: string, image?: string) => image
    ? { role: 'user', content: [{ type: 'text', text }, { type: 'image_url', image_url: { url: image } }] }
    : { role: 'user', content: text },
}))

import { runAgentLoop, resumeAgentLoop } from './agentLoop'
import { publishBridge } from '../appBridge'
import { registerAllCapabilities } from '../capabilities/defs'

const tc = (name: string, args: any) => ({
  id: 'call_' + Math.random().toString(36).slice(2),
  type: 'function' as const,
  function: { name, arguments: JSON.stringify(args) },
})

// Köprü durumu (test boyunca mutasyona uğrar).
let dashboards: Dashboard[]
let activeId: string | null

function baseDashboard(): Dashboard {
  return {
    id: 'd1', name: 'Test', linkedTableNames: ['t1'], activeFilters: {}, filters: [], relationships: [],
    dbBarX: '', dbBarY: '', dbBarType: 'bar', dbLineX: '', dbLineY: '', dbLineType: 'line',
  }
}

const dataset: Dataset = {
  name: 'Test', tableName: 't1', totalRows: 10, headers: ['city'], rows: [],
  columns: [{ name: 'city', kind: 'string', nonEmptyCount: 10, emptyCount: 0, uniqueCount: 5, sample: 'X' }],
}

publishBridge({
  getDatasets: () => [dataset],
  getDashboards: () => dashboards,
  getActiveDashboardId: () => activeId,
  getReports: () => [],
  getActiveReportId: () => null,
  getActiveTab: () => 'dashboard',
  setDatasets: () => {},
  setDashboards: (updater) => { dashboards = updater(dashboards) },
  setActiveDashboardId: (id) => { activeId = id },
  setReports: () => {},
  setActiveReportId: () => {},
  setActiveTab: () => {},
})
registerAllCapabilities()

describe('runAgentLoop (DoD entegrasyon)', () => {
  beforeEach(() => {
    dashboards = [baseDashboard()]
    activeId = 'd1'
    chatCompleteMock.mockReset()
  })

  it('ara → grafik kur → filtre uygula → özetle biter', async () => {
    const responses = [
      { content: null, toolCalls: [tc('search_capabilities', { query: 'bar grafik' })], finishReason: 'tool_calls' },
      { content: null, toolCalls: [tc('call_capability', { id: 'widget.setChartColumns', args: { slot: 'bar', xColumn: 'city' } })], finishReason: 'tool_calls' },
      { content: null, toolCalls: [tc('call_capability', { id: 'filter.apply', args: { column: 'city', value: 'X' } })], finishReason: 'tool_calls' },
      { content: 'Bar grafiği şehir kolonuna göre kuruldu ve X filtresi uygulandı.', toolCalls: [], finishReason: 'stop' },
    ]
    let i = 0
    chatCompleteMock.mockImplementation(async () => responses[i++] ?? { content: '', toolCalls: [], finishReason: 'stop' })

    const finals: string[] = []
    const toolResults: Array<{ summary: string; ok: boolean }> = []
    const res = await runAgentLoop('şehirlere göre bar grafik yap ve X seç', {
      onFinal: (t) => finals.push(t),
      onToolResult: (summary, ok) => toolResults.push({ summary, ok }),
    })

    expect(res.stopReason).toBe('completed')
    expect(finals[0]).toContain('kuruldu')
    // Yan etkiler gerçekten uygulandı mı?
    expect(dashboards[0].dbBarX).toBe('city')
    expect(dashboards[0].filters?.some(f => f.column === 'city' && f.value === 'X')).toBe(true)
    // Araç sonuçları başarılı akmış olmalı
    expect(toolResults.every(r => r.ok)).toBe(true)
    expect(chatCompleteMock).toHaveBeenCalledTimes(4)
  })

  it('geçersiz argümanlı call_capability invalid_args döndürür (yan etki yok)', async () => {
    const responses = [
      // slot enum dışı + xColumn eksik → doğrulama reddeder
      { content: null, toolCalls: [tc('call_capability', { id: 'widget.setChartColumns', args: { slot: 'pie' } })], finishReason: 'tool_calls' },
      { content: 'Tamam.', toolCalls: [], finishReason: 'stop' },
    ]
    let i = 0
    chatCompleteMock.mockImplementation(async () => responses[i++] ?? { content: '', toolCalls: [], finishReason: 'stop' })

    const toolResults: Array<{ summary: string; ok: boolean }> = []
    const res = await runAgentLoop('grafik kur', {
      onFinal: () => {},
      onToolResult: (summary, ok) => toolResults.push({ summary, ok }),
    })

    expect(res.stopReason).toBe('completed')
    expect(toolResults[0].ok).toBe(false)
    expect(dashboards[0].dbBarX).toBe('') // yan etki uygulanmadı
  })

  it('maxRounds sınırına ulaşınca durur', async () => {
    // Her turda tool call döndür → asla final vermez → max_rounds
    chatCompleteMock.mockImplementation(async () => ({
      content: null, toolCalls: [tc('search_capabilities', { query: 'x' })], finishReason: 'tool_calls',
    }))
    const res = await runAgentLoop('sonsuz', { onFinal: () => {} })
    expect(res.stopReason).toBe('max_rounds')
  })

  it('doğrudan capability adıyla çağrı otomatik call_capability olarak çalışır', async () => {
    const responses = [
      { content: null, toolCalls: [tc('dashboard.create', { name: 'merhaba dünya' })], finishReason: 'tool_calls' },
      { content: 'Oluşturuldu.', toolCalls: [], finishReason: 'stop' },
    ]
    let i = 0
    chatCompleteMock.mockImplementation(async () => responses[i++] ?? { content: '', toolCalls: [], finishReason: 'stop' })

    const res = await runAgentLoop('merhaba dünya panosu oluştur', { onFinal: () => {} })
    expect(res.stopReason).toBe('completed')
    expect(dashboards.some(d => d.name === 'merhaba dünya')).toBe(true)
  })

  it('ask_user ile durur (awaiting_user) ve yanıtla sürüp tamamlanır', async () => {
    const responses = [
      { content: null, toolCalls: [tc('ask_user', { question: 'Hangi şehir?' })], finishReason: 'tool_calls' },
      { content: 'Tamamlandı.', toolCalls: [], finishReason: 'stop' },
    ]
    let i = 0
    chatCompleteMock.mockImplementation(async () => responses[i++] ?? { content: '', toolCalls: [], finishReason: 'stop' })

    const questions: string[] = []
    const res = await runAgentLoop('grafik yap', { onFinal: () => {}, onQuestion: (q) => questions.push(q) })
    expect(res.stopReason).toBe('awaiting_user')
    expect(questions[0]).toBe('Hangi şehir?')
    expect(res.pending).toBeTruthy()

    const res2 = await resumeAgentLoop(res.pending!, 'İstanbul', { onFinal: () => {} })
    expect(res2.stopReason).toBe('completed')
  })

  it('priorHistory ile turlar arası hafıza taşınır', async () => {
    chatCompleteMock.mockImplementation(async () => ({ content: 'Merhaba', toolCalls: [], finishReason: 'stop' }))
    const r1 = await runAgentLoop('adım ne?', { onFinal: () => {} })
    const history = r1.messages.filter(m => m.role !== 'system')

    let seen: any[] = []
    chatCompleteMock.mockImplementation(async (params: any) => { seen = params.messages; return { content: 'ok', toolCalls: [], finishReason: 'stop' } })
    await runAgentLoop('peki soyadım?', { onFinal: () => {} }, history)

    const contents = seen.map((m: any) => m.content)
    expect(contents).toContain('adım ne?')     // önceki tur user mesajı
    expect(contents).toContain('Merhaba')       // önceki tur assistant yanıtı
    expect(contents).toContain('peki soyadım?') // yeni mesaj
  })
})
