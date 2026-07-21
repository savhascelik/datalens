import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerCapability,
  clearCapabilities,
  searchCapabilities,
  executeCapability,
  getCapability,
} from './registry'
import { publishBridge } from '../appBridge'
import type { Capability } from './types'

function makeCap(over: Partial<Capability>): Capability {
  return {
    id: 'test.cap',
    title: 'Test',
    description: 'test capability',
    keywords: [],
    category: 'test',
    sideEffect: false,
    argsSchema: { type: 'object', properties: {} },
    async run() { return { success: true, message: 'ok' } },
    ...over,
  }
}

// Testler için minimal köprü.
publishBridge({
  getDatasets: () => [],
  getDashboards: () => [],
  getActiveDashboardId: () => null,
  getReports: () => [],
  getActiveReportId: () => null,
  getActiveTab: () => 'dashboard',
  setDatasets: () => {},
  setDashboards: () => {},
  setActiveDashboardId: () => {},
  setReports: () => {},
  setActiveReportId: () => {},
  setActiveTab: () => {},
})

describe('registry.searchCapabilities', () => {
  beforeEach(() => clearCapabilities())

  it('anahtar kelimeye göre en alakalıyı üste koyar', () => {
    registerCapability(makeCap({ id: 'widget.setChartColumns', title: 'Grafik kolonları', keywords: ['bar', 'grafik', 'chart'], category: 'widget' }))
    registerCapability(makeCap({ id: 'filter.apply', title: 'Filtre uygula', keywords: ['filtre', 'çapraz'], category: 'filter' }))
    const res = searchCapabilities('bar grafik', 5)
    expect(res.length).toBeGreaterThan(0)
    expect(res[0].id).toBe('widget.setChartColumns')
  })

  it('limit sonuç sayısını sınırlar', () => {
    for (let i = 0; i < 10; i++) {
      registerCapability(makeCap({ id: `data.cap${i}`, keywords: ['veri', 'data'], category: 'data' }))
    }
    expect(searchCapabilities('veri', 3).length).toBe(3)
  })

  it('imza döner (run/keywords sızmaz)', () => {
    registerCapability(makeCap({ id: 'widget.add', keywords: ['widget'], category: 'widget' }))
    const [sig] = searchCapabilities('widget', 1)
    expect(sig).toHaveProperty('id')
    expect(sig).toHaveProperty('argsSchema')
    expect(sig).not.toHaveProperty('run')
    expect(sig).not.toHaveProperty('keywords')
  })

  it('boş sorguda temsili set döner', () => {
    registerCapability(makeCap({ id: 'a.one' }))
    registerCapability(makeCap({ id: 'a.two' }))
    expect(searchCapabilities('', 5).length).toBe(2)
  })
})

describe('registry.executeCapability', () => {
  beforeEach(() => clearCapabilities())

  it('bilinmeyen yetenekte unknown_capability döner', async () => {
    const r = await executeCapability('yok.bu', {})
    expect(r.success).toBe(false)
    expect(r.error).toBe('unknown_capability')
  })

  it('geçersiz argümanda invalid_args döner ve run çağrılmaz', async () => {
    let ran = false
    registerCapability(makeCap({
      id: 'need.value',
      argsSchema: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] },
      async run() { ran = true; return { success: true, message: 'ok' } },
    }))
    const r = await executeCapability('need.value', {})
    expect(r.success).toBe(false)
    expect(r.error).toBe('invalid_args')
    expect(ran).toBe(false)
  })

  it('geçerli argümanla run çağrılır ve coerce edilmiş değeri alır', async () => {
    let received: any
    registerCapability(makeCap({
      id: 'take.limit',
      argsSchema: { type: 'object', properties: { limit: { type: 'integer', default: 5 } } },
      async run(args) { received = args; return { success: true, message: 'ok' } },
    }))
    const r = await executeCapability('take.limit', { limit: '7' })
    expect(r.success).toBe(true)
    expect(received.limit).toBe(7)
  })

  it('run içindeki hata güvenle yakalanır', async () => {
    registerCapability(makeCap({
      id: 'boom',
      async run() { throw new Error('patladı') },
    }))
    const r = await executeCapability('boom', {})
    expect(r.success).toBe(false)
    expect(r.message).toContain('patladı')
  })

  it('getCapability kayıtlı yeteneği döner', () => {
    registerCapability(makeCap({ id: 'x.y' }))
    expect(getCapability('x.y')?.id).toBe('x.y')
  })
})
