// ai/history.ts
// sideEffect capability'ler için basit anlık-görüntü (snapshot) tabanlı işlem geçmişi.
// Bir yetenek durumu değiştirmeden ÖNCEKİ pano durumu yığına yazılır; undo son
// snapshot'ı geri yükler. Bağımlılıksız ve saf → kolay test edilir.

import type { Dashboard } from '../types'

export interface HistorySnapshot {
  id: string
  capabilityId: string
  label: string
  dashboards: Dashboard[]
  activeDashboardId: string | null
  at: number
}

const MAX_HISTORY = 25
let stack: HistorySnapshot[] = []

function clone<T>(v: T): T {
  try { return JSON.parse(JSON.stringify(v)) } catch { return v }
}

// Bir eylemden önceki durumu kaydet.
export function pushSnapshot(entry: {
  capabilityId: string
  label: string
  dashboards: Dashboard[]
  activeDashboardId: string | null
}): void {
  stack.push({
    id: 'h_' + (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)),
    capabilityId: entry.capabilityId,
    label: entry.label,
    dashboards: clone(entry.dashboards),
    activeDashboardId: entry.activeDashboardId,
    at: Date.now(),
  })
  if (stack.length > MAX_HISTORY) stack = stack.slice(-MAX_HISTORY)
}

// Son snapshot'ı çıkar (undo için).
export function popSnapshot(): HistorySnapshot | undefined {
  return stack.pop()
}

export function listHistory(): Array<{ capabilityId: string; label: string; at: number }> {
  return stack.map(s => ({ capabilityId: s.capabilityId, label: s.label, at: s.at }))
}

export function clearHistory(): void { stack = [] }
export function historyDepth(): number { return stack.length }
