// ai/capabilities/registry.ts
// Capability kayıt + arama. LLM'e tüm yetenekler verilmez; search ile ilk N imza döner.

import type { Capability, CapabilityContext, CapabilityResult, CapabilitySignature } from './types'
import { getBridge } from '../appBridge'
import { validateArgs } from './validate'
import { pushSnapshot } from '../history'

const registry = new Map<string, Capability>()

// Yalnızca pano durumunu değiştiren kategoriler geri alınabilir (undo pano snapshot'ı geri yükler).
const UNDOABLE_CATEGORIES = new Set(['dashboard', 'widget', 'filter', 'relationship'])

export function registerCapability(cap: Capability): void {
  if (registry.has(cap.id)) {
    console.warn(`Capability zaten kayıtlı, üzerine yazılıyor: ${cap.id}`)
  }
  registry.set(cap.id, cap)
}

export function registerCapabilities(caps: Capability[]): void {
  caps.forEach(registerCapability)
}

export function getCapability(id: string): Capability | undefined {
  return registry.get(id)
}

export function getAllCapabilities(): Capability[] {
  return Array.from(registry.values())
}

export function clearCapabilities(): void {
  registry.clear()
}

function toSignature(cap: Capability): CapabilitySignature {
  return {
    id: cap.id,
    title: cap.title,
    description: cap.description,
    category: cap.category,
    argsSchema: cap.argsSchema,
    sideEffect: cap.sideEffect,
  }
}

// --- Basit token-overlap + alan ağırlıklı skorlama (bağımlılıksız, hafif) ---
function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

function scoreCapability(cap: Capability, queryTokens: string[]): number {
  if (queryTokens.length === 0) return 0
  const idTokens = tokenize(cap.id)
  const titleTokens = tokenize(cap.title)
  const kwTokens = cap.keywords.flatMap(tokenize)
  const catTokens = tokenize(cap.category)
  const descTokens = tokenize(cap.description)

  let score = 0
  for (const qt of queryTokens) {
    if (idTokens.includes(qt)) score += 5
    if (kwTokens.includes(qt)) score += 4
    if (titleTokens.includes(qt)) score += 3
    if (catTokens.includes(qt)) score += 2
    if (descTokens.includes(qt)) score += 1
    // kısmi eşleşme (ör. "filtr" -> "filter/filtre")
    else if (
      idTokens.some(t => t.includes(qt)) ||
      kwTokens.some(t => t.includes(qt)) ||
      titleTokens.some(t => t.includes(qt))
    ) score += 1
  }
  return score
}

// LLM'in çağıracağı arama. query boşsa tüm kategorilerden temsili set döner.
export function searchCapabilities(query: string, limit = 5): CapabilitySignature[] {
  const all = getAllCapabilities()
  const qTokens = tokenize(query || '')

  if (qTokens.length === 0) {
    return all.slice(0, limit).map(toSignature)
  }

  const scored = all
    .map(cap => ({ cap, score: scoreCapability(cap, qTokens) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  return scored.map(x => toSignature(x.cap))
}

// Bir yeteneği doğrulayıp çalıştırır. code mode ve agent buradan çağırır.
export async function executeCapability(id: string, args: any): Promise<CapabilityResult> {
  const cap = registry.get(id)
  if (!cap) {
    return { success: false, message: `Bilinmeyen yetenek: ${id}`, error: 'unknown_capability' }
  }

  // Argümanları şemaya karşı doğrula (eksik/yanlış tip/enum). Geçerse coerce edilmiş
  // ve default'ları doldurulmuş argümanlarla çalıştır.
  const validation = validateArgs(cap.argsSchema, args ?? {})
  if (!validation.ok) {
    return {
      success: false,
      message: `Geçersiz argümanlar (${id}): ${validation.errors.join('; ')}`,
      error: 'invalid_args',
    }
  }

  const bridge = getBridge()
  const ctx: CapabilityContext = {
    bridge,
    call: (capId, capArgs) => executeCapability(capId, capArgs),
  }

  // Geri alınabilir (sideEffect) yetenekler için: durumu DEĞİŞTİRMEDEN önceki
  // Geri alınabilir (sideEffect) yetenekler için: durumu DEĞİŞTİRMEDEN önceki
  // pano anlık görüntüsünü sakla. Undo yalnızca PANO durumunu geri yükleyebildiğinden,
  // yalnızca pano-etkileyen kategoriler geçmişe yazılır (report/app/query/data hariç).
  const isUndoable = cap.sideEffect && UNDOABLE_CATEGORIES.has(cap.category)
  const preDashboards = isUndoable ? bridge.getDashboards() : null
  const preActiveId = isUndoable ? bridge.getActiveDashboardId() : null

  try {
    const result = await cap.run(validation.value, ctx)
    if (isUndoable && result.success && preDashboards) {
      pushSnapshot({
        capabilityId: cap.id,
        label: result.message,
        dashboards: preDashboards,
        activeDashboardId: preActiveId,
      })
    }
    return result
  } catch (err: any) {
    return {
      success: false,
      message: `Yetenek çalıştırılamadı (${id}): ${err?.message ?? err}`,
      error: String(err?.message ?? err),
    }
  }
}
