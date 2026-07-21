// ai/codeMode/sandbox.worker.ts
// İZOLE WORKER. LLM kodu burada çalışır; ana thread'in DOM/state'ine ERİŞEMEZ.
// Worker'da zaten window/document yoktur; ek olarak ağ/dosya API'lerini de kapatırız.
// Dış dünyaya tek kapı: datalens.call → postMessage köprüsü (ana thread doğrular).

import { createDatalensSdk } from './sdk'
import type { HostToWorker, WorkerToHost } from './executor'

// Ağ ve dinamik-yükleme API'lerini kapat (worker scope).
const g = self as any
for (const key of ['fetch', 'XMLHttpRequest', 'importScripts', 'WebSocket', 'EventSource', 'indexedDB']) {
  try { g[key] = undefined } catch { /* yoksay */ }
}

const post = (msg: WorkerToHost) => g.postMessage(msg)

// call köprüsü: her çağrıya benzersiz id ver, sonucu ana thread'den bekle.
const pending = new Map<number, (result: any) => void>()
let callSeq = 0

function postCall(capabilityId: string, args: any): Promise<any> {
  return new Promise((resolve) => {
    const callId = ++callSeq
    pending.set(callId, resolve)
    post({ type: 'call', callId, capabilityId, args })
  })
}

const datalens = createDatalensSdk(postCall)
const sandboxConsole = {
  log: (...a: any[]) => post({ type: 'log', text: a.map((x) => safeStr(x)).join(' ') }),
}

g.onmessage = async (e: MessageEvent<HostToWorker>) => {
  const msg = e.data
  if (!msg) return

  if (msg.type === 'run') {
    try {
      // Kullanıcı kodu yalnızca `datalens` ve `console` görür.
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const fn = new Function('datalens', 'console', `"use strict"; return (async () => {\n${msg.code}\n})()`)
      const result = await fn(datalens, sandboxConsole)
      post({ type: 'done', result: safeClone(result) })
    } catch (err: any) {
      post({ type: 'error', error: String(err?.message ?? err) })
    }
    return
  }

  if (msg.type === 'callResult') {
    const resolve = pending.get(msg.callId)
    if (resolve) { pending.delete(msg.callId); resolve(msg.result) }
  }
}

function safeStr(v: any): string {
  if (typeof v === 'string') return v
  try { return JSON.stringify(v) } catch { return String(v) }
}

function safeClone(v: any): any {
  try { return JSON.parse(JSON.stringify(v)) } catch { return undefined }
}
