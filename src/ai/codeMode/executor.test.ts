import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runCode, type SandboxTransport, type WorkerToHost, type HostToWorker } from './executor'
import { registerCapability, clearCapabilities } from '../capabilities/registry'
import { publishBridge } from '../appBridge'
import type { Capability } from '../capabilities/types'

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

function makeCap(id: string): Capability {
  return {
    id, title: id, description: id, keywords: [], category: 'test', sideEffect: false,
    argsSchema: { type: 'object', properties: {} },
    async run() { return { success: true, message: 'ok' } },
  }
}

// Gerçek Worker yerine enjekte edilen, script'lenebilir sahte transport.
class FakeTransport implements SandboxTransport {
  handler: (m: WorkerToHost) => void = () => {}
  terminated = false
  constructor(private script: (msg: HostToWorker, self: FakeTransport) => void) {}
  postMessage(msg: HostToWorker) { this.script(msg, this) }
  onMessage(h: (m: WorkerToHost) => void) { this.handler = h }
  terminate() { this.terminated = true }
  emit(m: WorkerToHost) { if (!this.terminated) this.handler(m) }
}

describe('runCode (Code Mode executor)', () => {
  beforeEach(() => clearCapabilities())

  it('çağrı sayısı limitini uygular (fazlası bloklanır)', async () => {
    const onCall = vi.fn(async () => ({ success: true, message: 'ok' }))
    let n = 0
    const fake = new FakeTransport((msg, self) => {
      if (msg.type === 'run') self.emit({ type: 'call', callId: 1, capabilityId: 'x.a', args: {} })
      else if (msg.type === 'callResult') {
        n++
        if (n < 3) self.emit({ type: 'call', callId: n + 1, capabilityId: 'x.a', args: {} })
        else self.emit({ type: 'done', result: { ok: true } })
      }
    })
    const res = await runCode('code', { maxCalls: 2, onCall, createTransport: () => fake })
    expect(res.success).toBe(true)
    expect(onCall).toHaveBeenCalledTimes(2)
    expect(res.calls).toBe(2)
  })

  it('zaman aşımında sonucu timeout olur ve worker terminate edilir', async () => {
    const fake = new FakeTransport(() => { /* run'a hiç yanıt verme → sonsuz döngü taklidi */ })
    const res = await runCode('while(true){}', { timeoutMs: 30, createTransport: () => fake })
    expect(res.success).toBe(false)
    expect(res.error).toBe('timeout')
    expect(fake.terminated).toBe(true)
  })

  it('yalnızca kayıtlı capability çalışır (varsayılan onCall=executeCapability)', async () => {
    registerCapability(makeCap('ok.cap'))
    const received: any[] = []
    const fake = new FakeTransport((msg, self) => {
      if (msg.type === 'run') self.emit({ type: 'call', callId: 1, capabilityId: 'ok.cap', args: {} })
      else if (msg.type === 'callResult') {
        received.push(msg.result)
        if (received.length === 1) self.emit({ type: 'call', callId: 2, capabilityId: 'evil.cap', args: {} })
        else self.emit({ type: 'done', result: null })
      }
    })
    const res = await runCode('code', { createTransport: () => fake })
    expect(res.success).toBe(true)
    expect(received[0].success).toBe(true)
    expect(received[1].error).toBe('unknown_capability')
  })

  it('allowedIds dışındaki yetenek reddedilir ve onCall çağrılmaz', async () => {
    const onCall = vi.fn(async () => ({ success: true, message: 'ok' }))
    const received: any[] = []
    const fake = new FakeTransport((msg, self) => {
      if (msg.type === 'run') self.emit({ type: 'call', callId: 1, capabilityId: 'blocked.x', args: {} })
      else if (msg.type === 'callResult') { received.push(msg.result); self.emit({ type: 'done', result: null }) }
    })
    const res = await runCode('code', { onCall, allowedIds: (id) => id.startsWith('data.'), createTransport: () => fake })
    expect(res.success).toBe(true)
    expect(received[0].error).toBe('forbidden')
    expect(onCall).not.toHaveBeenCalled()
  })

  it('worker error mesajı code_error olarak döner', async () => {
    const fake = new FakeTransport((msg, self) => {
      if (msg.type === 'run') self.emit({ type: 'error', error: 'boom' })
    })
    const res = await runCode('throw 1', { createTransport: () => fake })
    expect(res.success).toBe(false)
    expect(res.error).toBe('code_error')
    expect(res.message).toContain('boom')
  })

  it('log mesajlarını toplar', async () => {
    const fake = new FakeTransport((msg, self) => {
      if (msg.type === 'run') {
        self.emit({ type: 'log', text: 'merhaba' })
        self.emit({ type: 'done', result: 42 })
      }
    })
    const res = await runCode('console.log("merhaba")', { createTransport: () => fake })
    expect(res.logs).toContain('merhaba')
    expect(res.data).toBe(42)
  })
})
