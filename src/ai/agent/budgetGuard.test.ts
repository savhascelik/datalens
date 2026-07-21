import { describe, it, expect } from 'vitest'
import { initGuard, canStartRound, canRunCode, isRepeat, recordOutcome } from './budgetGuard'
import type { AiRuntimeSettings } from '../settings'

const settings: AiRuntimeSettings = { maxRounds: 8, maxCodeCalls: 3, timeoutMs: 5000 }

describe('budgetGuard', () => {
  it('maxRounds aşılınca round başlatılamaz', () => {
    const g = initGuard(settings)
    g.round = 8
    expect(canStartRound(g).ok).toBe(false)
    expect(canStartRound(g).reason).toBe('max_rounds')
  })

  it('errorStreak >= 3 durdurur', () => {
    const g = initGuard(settings)
    g.errorStreak = 3
    expect(canStartRound(g).reason).toBe('error_streak')
  })

  it('canRunCode maxCodeCalls sınırına uyar', () => {
    const g = initGuard(settings)
    g.codeCalls = 3
    expect(canRunCode(g)).toBe(false)
    g.codeCalls = 2
    expect(canRunCode(g)).toBe(true)
  })

  it('başarılı çağrının hemen ardından aynısı tekrar sayılır', () => {
    const g = initGuard(settings)
    const args = { id: 'filter.apply', args: { column: 'city', value: 'x' } }
    expect(isRepeat(g, 'call_capability', args)).toBe(false)
    recordOutcome(g, 'call_capability', args, true)
    expect(isRepeat(g, 'call_capability', args)).toBe(true)
  })

  it('başarısız çağrının ardından aynısı tekrar SAYILMAZ (retry serbest)', () => {
    const g = initGuard(settings)
    const args = { id: 'widget.add', args: { widgetId: 'chartBar' } }
    recordOutcome(g, 'call_capability', args, false)
    expect(isRepeat(g, 'call_capability', args)).toBe(false)
  })

  it('araya farklı çağrı girince aynı işi tekrar serbest', () => {
    const g = initGuard(settings)
    const a = { id: 'filter.apply', args: { column: 'city', value: 'x' } }
    const b = { query: 'bar grafik' }
    recordOutcome(g, 'call_capability', a, true)
    expect(isRepeat(g, 'call_capability', a)).toBe(true)
    // araya bir search girer
    recordOutcome(g, 'search_capabilities', b, true)
    // artık a "ardışık" değil → serbest
    expect(isRepeat(g, 'call_capability', a)).toBe(false)
  })
})
