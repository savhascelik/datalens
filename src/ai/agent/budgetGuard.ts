// ai/agent/budgetGuard.ts
// Goal loop için sınırlar: tur sayısı, code mode çağrı sayısı, tekrar tespiti,
// hata serisi. Amaç: sonsuz döngü / token israfı olmadan graceful stop.

import type { AiRuntimeSettings } from '../settings'

export type StopReason =
  | 'completed'        // model final yanıt verdi
  | 'aborted'          // kullanıcı iptal etti
  | 'awaiting_user'    // agent kullanıcıya soru sordu, yanıt bekliyor
  | 'max_rounds'       // tur limiti
  | 'max_code_calls'   // code mode limiti
  | 'repetition'       // aynı çağrı tekrarlanıyor
  | 'error_streak'     // arka arkaya hata

export interface Guard {
  round: number
  codeCalls: number
  errorStreak: number
  // Ardışıklık takibi: en son çalıştırılan araç imzası ve başarılı olup olmadığı.
  lastSignature: string | null
  lastSucceeded: boolean
  settings: AiRuntimeSettings
}

export function initGuard(settings: AiRuntimeSettings): Guard {
  return { round: 0, codeCalls: 0, errorStreak: 0, lastSignature: null, lastSucceeded: false, settings }
}

export function canStartRound(g: Guard): { ok: boolean; reason?: StopReason } {
  if (g.round >= g.settings.maxRounds) return { ok: false, reason: 'max_rounds' }
  if (g.errorStreak >= 3) return { ok: false, reason: 'error_streak' }
  return { ok: true }
}

export function canRunCode(g: Guard): boolean {
  return g.codeCalls < g.settings.maxCodeCalls
}

function signatureOf(name: string, args: any): string {
  try { return `${name}:${JSON.stringify(args)}` } catch { return `${name}:?` }
}

// Tekrar (anlamsız döngü) tespiti — SADECE bir önceki araç çağrısıyla AYNI ve
// o çağrı BAŞARILI olduğunda tekrar sayılır. Böylece:
//  - başarısız bir çağrıyı düzeltip yeniden denemek serbest,
//  - araya farklı bir çağrı girdiğinde aynı işi bilinçli tekrarlamak serbest,
//  - yalnızca "başarılı işi arka arkaya boşuna yinele" döngüsü engellenir.
export function isRepeat(g: Guard, name: string, args: any): boolean {
  return g.lastSucceeded && signatureOf(name, args) === g.lastSignature
}

// Her (bloklanmamış) araç çalıştırmasından sonra çağrılır; ardışıklık durumunu günceller.
export function recordOutcome(g: Guard, name: string, args: any, success: boolean): void {
  g.lastSignature = signatureOf(name, args)
  g.lastSucceeded = success
}
