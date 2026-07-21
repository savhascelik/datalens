import { describe, it, expect, beforeEach } from 'vitest'
import { resolveLlmEndpoint, saveAiSettings } from './ai-client'

describe('resolveLlmEndpoint — çok sağlayıcılı uç çözümleme', () => {
  beforeEach(() => localStorage.clear())

  it('openai: varsayılan base /v1, Bearer anahtar', () => {
    saveAiSettings({ provider: 'openai', apiKey: 'sk-x', baseUrl: '', model: '' })
    const r = resolveLlmEndpoint()
    expect(r.baseUrl).toBe('https://api.openai.com/v1')
    expect(r.model).toBe('gpt-4o-mini')
    expect(r.headers['Authorization']).toBe('Bearer sk-x')
  })

  it('gemini: OpenAI-uyumlu base (/v1beta/openai, /v1 EKLENMEZ), Bearer anahtar', () => {
    saveAiSettings({ provider: 'gemini', apiKey: 'AIza', baseUrl: '', model: '' })
    const r = resolveLlmEndpoint()
    expect(r.baseUrl).toBe('https://generativelanguage.googleapis.com/v1beta/openai')
    expect(r.model).toBe('gemini-2.0-flash')
    expect(r.headers['Authorization']).toBe('Bearer AIza')
  })

  it('vertex: base proje/bölgeden üretilir, access token Bearer', () => {
    saveAiSettings({ provider: 'vertex', apiKey: 'ya29.token', baseUrl: '', model: '', project: 'proj-1', location: 'europe-west1' })
    const r = resolveLlmEndpoint()
    expect(r.baseUrl).toBe('https://europe-west1-aiplatform.googleapis.com/v1/projects/proj-1/locations/europe-west1/endpoints/openapi')
    expect(r.headers['Authorization']).toBe('Bearer ya29.token')
  })

  it('ollama: yerel base /v1, auth başlığı YOK', () => {
    saveAiSettings({ provider: 'ollama', apiKey: '', baseUrl: '', model: 'gemma3n:e4b' })
    const r = resolveLlmEndpoint()
    expect(r.baseUrl).toBe('http://localhost:11434/v1')
    expect(r.model).toBe('gemma3n:e4b')
    expect(r.headers['Authorization']).toBeUndefined()
  })

  it('openai özel base: /v1 eksikse eklenir', () => {
    saveAiSettings({ provider: 'openai', apiKey: 'k', baseUrl: 'https://proxy.local', model: 'm' })
    expect(resolveLlmEndpoint().baseUrl).toBe('https://proxy.local/v1')
  })
})
