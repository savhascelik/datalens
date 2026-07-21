// ai/codeMode/executor.ts
// Code Mode ANA THREAD tarafı (host). İzole worker'ı kurar, worker'dan gelen
// `call` isteklerini registry üzerinden DOĞRULAYIP çalıştırır, sonucu geri yollar.
// Güvenlik/dayanıklılık:
//  - Zaman aşımı → worker terminate (sonsuz döngü koruması).
//  - Çağrı sayısı limiti (tek kod çalıştırmasında en fazla N yetenek çağrısı).
//  - Yalnızca kayıtlı capability'ler çalışır (executeCapability zaten doğrular).
//
// Transport (worker) enjekte edilebilir; böylece gerçek Worker olmadan test edilir.

import { executeCapability } from '../capabilities/registry'

// worker <-> host mesaj protokolü
export type HostToWorker =
  | { type: 'run'; code: string }
  | { type: 'callResult'; callId: number; result: any }

export type WorkerToHost =
  | { type: 'call'; callId: number; capabilityId: string; args: any }
  | { type: 'log'; text: string }
  | { type: 'done'; result: any }
  | { type: 'error'; error: string }

export interface SandboxTransport {
  postMessage(msg: HostToWorker): void
  onMessage(handler: (msg: WorkerToHost) => void): void
  terminate(): void
}
export type TransportFactory = () => SandboxTransport

export interface CodeRunResult {
  success: boolean
  message: string
  calls: number
  logs: string[]
  data?: any
  error?: string
}

export interface RunCodeOptions {
  timeoutMs?: number
  maxCalls?: number
  onCall?: (capabilityId: string, args: any) => Promise<any>
  createTransport?: TransportFactory
  allowedIds?: (id: string) => boolean
}

const DEFAULT_TIMEOUT = 5000
const DEFAULT_MAX_CALLS = 25

function defaultTransport(): SandboxTransport {
  const worker = new Worker(new URL('./sandbox.worker.ts', import.meta.url), { type: 'module' })
  return {
    postMessage: (m) => worker.postMessage(m),
    onMessage: (h) => { worker.onmessage = (e: MessageEvent) => h(e.data) },
    terminate: () => worker.terminate(),
  }
}

export async function runCode(code: string, opts: RunCodeOptions = {}): Promise<CodeRunResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT
  const maxCalls = opts.maxCalls ?? DEFAULT_MAX_CALLS
  const onCall = opts.onCall ?? ((id, args) => executeCapability(id, args))
  const transport = (opts.createTransport ?? defaultTransport)()

  return new Promise<CodeRunResult>((resolve) => {
    let calls = 0
    let settled = false
    const logs: string[] = []

    const finish = (r: CodeRunResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { transport.terminate() } catch { /* yoksay */ }
      resolve(r)
    }

    const timer = setTimeout(() => {
      finish({ success: false, message: 'Kod zaman aşımına uğradı ve durduruldu.', error: 'timeout', calls, logs })
    }, timeoutMs)

    transport.onMessage(async (msg) => {
      if (!msg || settled) return

      if (msg.type === 'call') {
        if (calls >= maxCalls) {
          transport.postMessage({
            type: 'callResult',
            callId: msg.callId,
            result: { success: false, message: 'Code mode çağrı limiti aşıldı.', error: 'max_calls' },
          })
          return
        }
        calls++
        let result: any
        try {
          if (opts.allowedIds && !opts.allowedIds(msg.capabilityId)) {
            result = { success: false, message: `İzin verilmeyen yetenek: ${msg.capabilityId}`, error: 'forbidden' }
          } else {
            result = await onCall(msg.capabilityId, msg.args ?? {})
          }
        } catch (err: any) {
          result = { success: false, message: String(err?.message ?? err), error: 'call_failed' }
        }
        transport.postMessage({ type: 'callResult', callId: msg.callId, result })
        return
      }

      if (msg.type === 'log') {
        if (logs.length < 100) logs.push(String(msg.text))
        return
      }

      if (msg.type === 'done') {
        finish({ success: true, message: 'Kod çalıştı.', calls, logs, data: msg.result })
        return
      }

      if (msg.type === 'error') {
        finish({ success: false, message: msg.error || 'Kod hatası', error: 'code_error', calls, logs })
        return
      }
    })

    transport.postMessage({ type: 'run', code })
  })
}
