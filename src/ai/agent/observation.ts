// ai/agent/observation.ts
// Araç çağrılarının sonuçlarını LLM'e geri beslenecek `tool` mesajlarına çevirir.
// OpenAI function-calling protokolünde her tool_call'a karşılık bir tool mesajı gerekir.

import type { ChatMessage, ToolCall } from '../llm/chatClient'
import i18n from '../../i18n'

export interface ExecutedTool {
  call: ToolCall
  result: any            // JSON-serileştirilebilir sonuç
}

// Tek bir araç sonucunu tool mesajına çevir.
export function toToolMessage(exec: ExecutedTool): ChatMessage {
  let content: string
  try {
    content = JSON.stringify(exec.result)
  } catch {
    content = String(exec.result)
  }
  // Çok büyük sonuçları kırp (token koruması)
  if (content.length > 6000) {
    content = content.slice(0, 6000) + '…(kırpıldı)'
  }
  return {
    role: 'tool',
    tool_call_id: exec.call.id,
    name: exec.call.function.name,
    content,
  }
}

// Kullanıcıya/akışa gösterilecek kısa, insan-okur özet (durum satırı).
export function humanSummary(exec: ExecutedTool): string {
  const name = exec.call.function.name
  const r = exec.result
  if (name === 'search_capabilities') {
    const n = Array.isArray(r?.results) ? r.results.length : 0
    return i18n.t('ai.tool.searched', { count: n })
  }
  if (name === 'call_capability') {
    return r?.success
      ? (r.message || i18n.t('ai.tool.done'))
      : i18n.t('ai.tool.failed', { msg: r?.message || r?.error || i18n.t('ai.tool.unknownError', { defaultValue: 'bilinmiyor' }) })
  }
  if (name === 'execute_code') {
    return r?.success
      ? i18n.t('ai.tool.codeRan')
      : i18n.t('ai.tool.codeMode', { msg: r?.message || i18n.t('ai.tool.codeDisabled') })
  }
  // Doğrudan çağrılan capability'ler (call_capability sarmalayıcısı olmadan): sonuç
  // CapabilityResult şeklindedir → mesajını göster.
  if (r && typeof r === 'object' && 'success' in r) {
    return r.success
      ? (r.message || i18n.t('ai.tool.done'))
      : i18n.t('ai.tool.failed', { msg: r.message || r.error || i18n.t('ai.tool.unknownError', { defaultValue: 'bilinmiyor' }) })
  }
  return name
}
