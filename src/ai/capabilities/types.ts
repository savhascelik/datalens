// ai/capabilities/types.ts
// Capability Registry tipleri. Arayüzdeki her yetenek tek bir Capability olarak
// tanımlanır; LLM bunları search_capabilities ile arar, execute_code ile çağırır.

// LLM'e ve doğrulamaya uygun basit JSON Schema alt kümesi.
export interface JSONSchema {
  type: 'object' | 'string' | 'number' | 'integer' | 'boolean' | 'array'
  description?: string
  properties?: Record<string, JSONSchema>
  items?: JSONSchema
  enum?: (string | number)[]
  required?: string[]
  default?: any
}

// Bir yeteneğin çalıştırılmasından dönen standart sonuç.
export interface CapabilityResult<T = any> {
  success: boolean
  message: string
  data?: T
  error?: string
}

// Yetenekler React state'e doğrudan erişemez; köprü (appBridge) üzerinden erişir.
// CapabilityContext, çalıştırma anında güncel köprüyü ve yardımcıları taşır.
export interface CapabilityContext {
  bridge: import('../appBridge').AppBridge
  // İç içe yetenek çağrısı (code mode dışı senaryolarda da kullanışlı).
  call: (capabilityId: string, args: any) => Promise<CapabilityResult>
}

export interface Capability<Args = any, Result = any> {
  id: string                 // 'widget.add', 'filter.apply'
  title: string              // insan-okur başlık
  description: string        // LLM aramasında eşleşen açıklama
  keywords: string[]         // arama isabetini artıran anahtar kelimeler
  category: string           // 'dashboard' | 'widget' | 'filter' | 'relationship' | 'data'
  argsSchema: JSONSchema     // argüman şeması (LLM + doğrulama)
  sideEffect: boolean        // durum değiştiriyor mu (loglama/undo için)
  run: (args: Args, ctx: CapabilityContext) => Promise<CapabilityResult<Result>>
}

// LLM'e arama sonucunda dönen hafif imza (gövde/keyword dönmez → az token).
export interface CapabilitySignature {
  id: string
  title: string
  description: string
  category: string
  argsSchema: JSONSchema
  sideEffect: boolean
}
