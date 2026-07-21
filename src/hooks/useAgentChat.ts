// hooks/useAgentChat.ts
// AI chat durumunu yönetir: mesaj listesi, canlı durum satırı, abort, isRunning.
// runAgentLoop'u sarar ve callback'leri React state'e bağlar.

import { useCallback, useRef, useState } from 'react'
import { runAgentLoop, resumeAgentLoop, type AgentPending } from '../ai/agent/agentLoop'
import type { StopReason } from '../ai/agent/budgetGuard'
import type { ChatMessage } from '../ai/llm/chatClient'
import { executeCapability } from '../ai/capabilities/registry'
import { getAiSettings } from '../ai-client'
import i18n from '../i18n'

export interface ChatEntry {
  id: string
  role: 'user' | 'assistant' | 'status' | 'tool'
  text: string
  success?: boolean       // tool sonuçları için
  table?: { columns: string[]; rows: any[] }  // sorgu sonucu önizlemesi
  image?: string          // kullanıcı mesajına eklenen ekran görüntüsü (thumbnail)
}

const uid = () => Math.random().toString(36).slice(2)

// LLM'e taşınan konuşma geçmişi penceresi (system hariç). Küçük modelin context'ini
// korumak için son N mesajla sınırlanır; pencere temiz bir 'user' sınırından başlar
// ki tool-call/tool eşleşmesi bozulmasın.
const MAX_HISTORY_MESSAGES = 16
function trimHistory(history: ChatMessage[]): ChatMessage[] {
  if (history.length <= MAX_HISTORY_MESSAGES) return history
  let start = history.length - MAX_HISTORY_MESSAGES
  while (start < history.length && history[start].role !== 'user') start++
  return history.slice(start)
}
function stripSystem(messages: ChatMessage[]): ChatMessage[] {
  // System mesajını çıkar VE çok-kipli (görselli) user içeriğini düz metne indir.
  // Böylece büyük base64 görsel her turda tekrar tekrar modele gönderilmez
  // (görsel yalnızca ilk gönderimde iletilir; sonraki turlarda bağlamda metin kalır).
  return messages
    .filter(m => m.role !== 'system')
    .map(m => {
      if (Array.isArray(m.content)) {
        const text = m.content.filter(p => p.type === 'text').map((p: any) => p.text).join(' ').trim()
        return { ...m, content: text || '[görsel]' }
      }
      return m
    })
}

// Tool sonucundan (varsa) küçük bir tablo önizlemesi çıkarır (ilk 10 satır).
function extractTable(result: any): { columns: string[]; rows: any[] } | undefined {
  const rows = result?.data?.rows
  if (!Array.isArray(rows) || rows.length === 0) return undefined
  const columns = Array.isArray(result.data.columns) && result.data.columns.length
    ? result.data.columns
    : Object.keys(rows[0])
  return { columns, rows: rows.slice(0, 10) }
}

export function useAgentChat() {
  const [entries, setEntries] = useState<ChatEntry[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const pendingRef = useRef<AgentPending | null>(null)
  const historyRef = useRef<ChatMessage[]>([])
  const [awaitingAnswer, setAwaitingAnswer] = useState(false)

  const push = useCallback((e: Omit<ChatEntry, 'id'>) => {
    setEntries(prev => [...prev, { ...e, id: uid() }])
  }, [])

  const send = useCallback(async (prompt: string, image?: string) => {
    const text = prompt.trim()
    if ((!text && !image) || isRunning) return

    push({ role: 'user', text: text || '', image })
    setIsRunning(true)
    setStatus(null)

    const controller = new AbortController()
    abortRef.current = controller

    const callbacks = {
      signal: controller.signal,
      isAborted: () => controller.signal.aborted,
      onStatus: (s: string) => setStatus(s),
      onToolResult: (summary: string, success: boolean, result?: any) => push({ role: 'tool' as const, text: summary, success, table: extractTable(result), image: result?.data?.isImage ? result.data.image : undefined }),
      onQuestion: (question: string) => push({ role: 'assistant' as const, text: question }),
      onFinal: (finalText: string) => {
        if (finalText && finalText.trim()) push({ role: 'assistant' as const, text: finalText })
      },
      onStop: (reason: StopReason) => {
        if (reason !== 'completed' && reason !== 'aborted' && reason !== 'awaiting_user') {
          push({ role: 'status' as const, text: i18n.t('ai.stopped', { reason }) })
        }
        if (reason === 'aborted') push({ role: 'status' as const, text: i18n.t('ai.canceled') })
      },
    }

    try {
      // Bekleyen bir soru varsa bu mesaj onun YANITIDIR → döngüyü sürdür.
      const wasPending = pendingRef.current
      // Yalnızca görsel eklenip metin yazılmadıysa modele mantıklı bir varsayılan istem ver.
      const effectivePrompt = text || (image
        ? i18n.t('ai.analyzeImage', { defaultValue: 'Bu ekran görüntüsünü analiz et ve kısaca yorumla.' })
        : text)
      const result = wasPending
        ? await resumeAgentLoop(wasPending, effectivePrompt, callbacks)
        : await runAgentLoop(effectivePrompt, callbacks, trimHistory(historyRef.current), image)

      // Konuşma geçmişini kalıcı tut (system hariç) — turlar arası hafıza.
      historyRef.current = stripSystem(result.messages)

      if (result.stopReason === 'awaiting_user' && result.pending) {
        pendingRef.current = result.pending
        setAwaitingAnswer(true)
      } else {
        pendingRef.current = null
        setAwaitingAnswer(false)
      }
    } catch (err: any) {
      pendingRef.current = null
      setAwaitingAnswer(false)
      const raw = String(err?.message ?? err)
      const isNetwork = /failed to fetch|networkerror|load failed|err_failed/i.test(raw)
      let text: string
      if (isNetwork) {
        text = getAiSettings().provider === 'ollama'
          ? i18n.t('ai.ollamaUnreachable', { defaultValue: "Ollama'ya erişilemedi. Barındırılan (https) bir sitede yerel Ollama'yı kullanmak için Ollama tarafında OLLAMA_ORIGINS değerini bu siteye (veya *) ayarlayıp yeniden başlatın; ya da Ayarlar'dan bir bulut modeli (OpenAI/Gemini) seçin." })
          : i18n.t('ai.networkError', { defaultValue: "Modele erişilemedi (ağ/CORS). Ayarlar'daki uç nokta (base URL), anahtar ve sağlayıcıyı kontrol edin." })
      } else {
        text = i18n.t('ai.error', { msg: raw })
      }
      push({ role: 'status', text })
    } finally {
      setIsRunning(false)
      setStatus(null)
      abortRef.current = null
    }
  }, [isRunning, push])

  const abort = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const clear = useCallback(() => {
    if (isRunning) return
    pendingRef.current = null
    historyRef.current = []
    setAwaitingAnswer(false)
    setEntries([])
  }, [isRunning])

  // Son durum-değiştiren işlemi geri al (history.undo yeteneği).
  const undo = useCallback(async () => {
    if (isRunning) return
    try {
      const res = await executeCapability('history.undo', {})
      push({ role: 'status', text: res.message })
    } catch (err: any) {
      push({ role: 'status', text: i18n.t('ai.error', { msg: err?.message ?? err }) })
    }
  }, [isRunning, push])

  return { entries, isRunning, status, awaitingAnswer, send, abort, clear, undo }
}
