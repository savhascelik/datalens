// ai/llm/chatClient.ts
// OpenAI/Ollama uyumlu, function-calling (tools) destekli sohbet istemcisi.
// Browser-first: doğrudan sağlayıcıya çağrı yapar (kullanıcının kendi anahtarı).
// İleride backend proxy eklenirse yalnızca bu dosyadaki fetch hedefi değişir.

import { resolveLlmEndpoint } from '../../ai-client'

// --- OpenAI chat mesaj tipleri (tools dahil) ---

// Çok-kipli (multimodal) içerik parçası. OpenAI-uyumlu /chat/completions bir user
// mesajının content'ini metin + görsel parçalarının dizisi olarak kabul eder. Görsel,
// data URL (base64 PNG) olarak image_url ile gönderilir. Vision destekli modeller
// (gpt-4o, gpt-4o-mini, veya Ollama'da llava vb.) bunu işler.
export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | ChatContentPart[] | null
  // assistant turlarında modelin istediği araç çağrıları
  tool_calls?: ToolCall[]
  // tool turlarında hangi çağrıya yanıt verildiği
  tool_call_id?: string
  name?: string
}

// İsteğe bağlı görselle bir 'user' mesajı üretir. Görsel yoksa düz metin döner
// (geriye dönük uyumluluk). Görsel varsa metin + image_url parçaları dizisi olur.
export function userMessageWithImage(text: string, imageDataUrl?: string): ChatMessage {
  if (!imageDataUrl) return { role: 'user', content: text }
  return {
    role: 'user',
    content: [
      { type: 'text', text: text || '' },
      { type: 'image_url', image_url: { url: imageDataUrl } },
    ],
  }
}

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string } // arguments: JSON string
}

// OpenAI tool tanımı (function schema)
export interface ToolDef {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, any> // JSON Schema
  }
}

export interface ChatResponse {
  content: string | null
  toolCalls: ToolCall[]
  finishReason: string | null
  raw?: any
}

function resolveEndpoint() {
  return resolveLlmEndpoint()
}

// data URL önekini soyar → Ollama native `images` dizisi ham base64 ister (öneksiz).
function stripDataUrlPrefix(url: string): string {
  return (url || '').replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')
}

// OpenAI-şekilli mesajları Ollama NATIVE /api/chat biçimine çevirir.
// - Çok-kipli içerik: metin → content (string); görseller → images (ham base64 dizisi).
// - assistant tool_calls: arguments STRING → OBJE (Ollama native beklentisi).
// Google'ın Gemma+Ollama dokümanı görseli `images` dizisiyle önerir; OpenAI-uyumlu
// image_url yolundan daha güvenilirdir (özellikle Gemma vision için).
export function toOllamaNativeMessages(messages: ChatMessage[]): any[] {
  return messages.map(m => {
    const out: any = { role: m.role }
    if (Array.isArray(m.content)) {
      out.content = m.content.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('\n')
      const imgs = m.content
        .filter((p: any) => p.type === 'image_url')
        .map((p: any) => stripDataUrlPrefix(typeof p.image_url === 'string' ? p.image_url : p.image_url?.url))
        .filter(Boolean)
      if (imgs.length) out.images = imgs
    } else {
      out.content = m.content ?? ''
    }
    if (m.tool_calls && m.tool_calls.length) {
      out.tool_calls = m.tool_calls.map(tc => ({
        function: {
          name: tc.function.name,
          arguments: (() => { try { return JSON.parse(tc.function.arguments || '{}') } catch { return {} } })(),
        },
      }))
    }
    if (m.role === 'tool' && m.name) out.tool_name = m.name
    return out
  })
}

export interface ChatParams {
  messages: ChatMessage[]
  tools?: ToolDef[]
  temperature?: number
  signal?: AbortSignal
}

// Ollama NATIVE /api/chat çağrısı (yerel Gemma vision + tools için önerilen yol).
async function ollamaNativeChat(params: ChatParams, model: string, baseUrl: string): Promise<ChatResponse> {
  const host = baseUrl.replace(/\/v1$/, '') // /api/chat, /v1 altında değil
  const body: Record<string, any> = {
    model,
    messages: toOllamaNativeMessages(params.messages),
    stream: false,
    options: { temperature: params.temperature ?? 0.1 },
  }
  if (params.tools && params.tools.length > 0) body.tools = params.tools

  const response = await fetch(`${host}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: params.signal,
  })
  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`LLM hatası: ${response.status} ${response.statusText}\n${errText || ''}`)
  }
  const json = await response.json()
  const msg = json.message ?? {}
  // Native tool_calls: { function: { name, arguments: <obje> } } → OpenAI şekli (id + string args).
  const toolCalls: ToolCall[] = Array.isArray(msg.tool_calls)
    ? msg.tool_calls.map((tc: any, i: number) => ({
        id: `call_${Date.now()}_${i}`,
        type: 'function' as const,
        function: {
          name: tc.function?.name ?? '',
          arguments: typeof tc.function?.arguments === 'string'
            ? tc.function.arguments
            : JSON.stringify(tc.function?.arguments ?? {}),
        },
      }))
    : []
  return {
    content: msg.content ?? null,
    toolCalls,
    finishReason: json.done ? 'stop' : null,
    raw: json,
  }
}

// Tek turluk chat çağrısı. Modelin tool çağrıları varsa toolCalls'ta döner.
export async function chatComplete(params: ChatParams): Promise<ChatResponse> {
  const { baseUrl, model, headers, provider } = resolveEndpoint()

  // Ollama → NATIVE /api/chat (images dizisi ile güvenilir vision + tools).
  if (provider === 'ollama') {
    return ollamaNativeChat(params, model, baseUrl)
  }

  // OpenAI / Gemini / Vertex → OpenAI-uyumlu /chat/completions (image_url objesi).
  const body: Record<string, any> = {
    model,
    messages: params.messages,
    temperature: params.temperature ?? 0.1,
  }
  if (params.tools && params.tools.length > 0) {
    body.tools = params.tools
    body.tool_choice = 'auto'
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: params.signal,
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`LLM hatası: ${response.status} ${response.statusText}\n${errText || ''}`)
  }

  const json = await response.json()
  const choice = json.choices?.[0]
  const msg = choice?.message ?? {}

  return {
    content: msg.content ?? null,
    toolCalls: Array.isArray(msg.tool_calls) ? msg.tool_calls : [],
    finishReason: choice?.finish_reason ?? null,
    raw: json,
  }
}

// tool_calls argümanlarını güvenle parse et (bazı modeller bozuk JSON döndürebilir).
export function parseToolArgs(call: ToolCall): Record<string, any> {
  try {
    return JSON.parse(call.function.arguments || '{}')
  } catch {
    // Kaba kurtarma: tek tırnak / trailing virgül temizle
    try {
      const fixed = call.function.arguments
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
      return JSON.parse(fixed)
    } catch {
      return {}
    }
  }
}
