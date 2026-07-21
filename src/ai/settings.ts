// ai/settings.ts
// AI agent çalışma-zamanı ayarları (goal loop sınırları). localStorage'da saklanır.

export interface AiRuntimeSettings {
  maxRounds: number       // goal loop en fazla kaç tur döner
  maxCodeCalls: number    // execute_code toplam kaç kez çağrılabilir
  timeoutMs: number       // tek bir code mode çalıştırması için zaman aşımı
}

export const DEFAULT_AI_RUNTIME: AiRuntimeSettings = {
  maxRounds: 8,
  maxCodeCalls: 5,
  timeoutMs: 5000,
}

const KEY = 'data-lens-ai-runtime'

export function getAiRuntimeSettings(): AiRuntimeSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_AI_RUNTIME }
    const parsed = JSON.parse(raw)
    return {
      maxRounds: clampInt(parsed.maxRounds, 1, 30, DEFAULT_AI_RUNTIME.maxRounds),
      maxCodeCalls: clampInt(parsed.maxCodeCalls, 0, 20, DEFAULT_AI_RUNTIME.maxCodeCalls),
      timeoutMs: clampInt(parsed.timeoutMs, 1000, 30000, DEFAULT_AI_RUNTIME.timeoutMs),
    }
  } catch {
    return { ...DEFAULT_AI_RUNTIME }
  }
}

export function saveAiRuntimeSettings(s: AiRuntimeSettings): void {
  localStorage.setItem(KEY, JSON.stringify(s))
}

function clampInt(v: any, min: number, max: number, fallback: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}
