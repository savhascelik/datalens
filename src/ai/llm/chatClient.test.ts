import { describe, it, expect } from 'vitest'
import { toOllamaNativeMessages, userMessageWithImage, type ChatMessage } from './chatClient'

const DATA_URL = 'data:image/png;base64,AAAA'

describe('chatClient — çok-kipli görsel + Ollama native biçim', () => {
  it('userMessageWithImage görselsiz düz metin, görselli parça dizisi üretir', () => {
    expect(userMessageWithImage('merhaba')).toEqual({ role: 'user', content: 'merhaba' })
    const withImg = userMessageWithImage('bak', DATA_URL)
    expect(withImg.content).toEqual([
      { type: 'text', text: 'bak' },
      { type: 'image_url', image_url: { url: DATA_URL } },
    ])
  })

  it('Ollama native: görsel data-URL öneki soyulmuş HAM base64 olarak images dizisine geçer', () => {
    const msgs: ChatMessage[] = [userMessageWithImage('bu grafiği yorumla', DATA_URL)]
    const out = toOllamaNativeMessages(msgs)
    expect(out[0].content).toBe('bu grafiği yorumla')
    expect(out[0].images).toEqual(['AAAA']) // "data:image/png;base64," öneki yok
  })

  it('Ollama native: assistant tool_calls arguments STRING → OBJE olur', () => {
    const msgs: ChatMessage[] = [{
      role: 'assistant', content: null,
      tool_calls: [{ id: 'c1', type: 'function', function: { name: 'widget.list', arguments: '{"x":1}' } }],
    }]
    const out = toOllamaNativeMessages(msgs)
    expect(out[0].tool_calls[0].function).toEqual({ name: 'widget.list', arguments: { x: 1 } })
  })

  it('Ollama native: düz metin mesajlar dokunulmaz, tool rolü tool_name taşır', () => {
    const msgs: ChatMessage[] = [
      { role: 'user', content: 'selam' },
      { role: 'tool', content: 'sonuç', name: 'widget.list', tool_call_id: 'c1' },
    ]
    const out = toOllamaNativeMessages(msgs)
    expect(out[0]).toEqual({ role: 'user', content: 'selam' })
    expect(out[1].role).toBe('tool')
    expect(out[1].content).toBe('sonuç')
    expect(out[1].tool_name).toBe('widget.list')
    expect(out[1].images).toBeUndefined()
  })
})
