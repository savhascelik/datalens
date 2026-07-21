// ai/capabilities/validate.ts
// Capability argümanlarını argsSchema'ya karşı doğrulayan hafif (bağımlılıksız)
// JSON Schema alt-küme doğrulayıcısı. Amaç: LLM yanlış/eksik argüman ürettiğinde
// yeteneğin içinde sessizce bozulmak yerine anlaşılır bir hata döndürmek.
//
// Ek olarak küçük bir "hoşgörü" katmanı: LLM'ler sık sık sayıyı string olarak
// ("5") veya boolean'ı string olarak ("true") gönderir; bunları şemaya göre
// güvenle coerce ederiz ve `default` değerlerini eksik alanlara doldururuz.

import type { JSONSchema } from './types'

export interface ValidationResult {
  ok: boolean
  errors: string[]
  value: any // doğrulanmış + coerce edilmiş + default'lar doldurulmuş argümanlar
}

export function validateArgs(schema: JSONSchema | undefined, args: any): ValidationResult {
  const errors: string[] = []
  if (!schema) return { ok: true, errors, value: args ?? {} }
  const value = validateValue(schema, args ?? {}, '', errors)
  return { ok: errors.length === 0, errors, value }
}

function validateValue(schema: JSONSchema, value: any, path: string, errors: string[]): any {
  // Eksik/boş değere şema default'u uygula.
  if ((value === undefined || value === null) && schema.default !== undefined) {
    value = schema.default
  }

  switch (schema.type) {
    case 'object': {
      const isObj = value != null && typeof value === 'object' && !Array.isArray(value)
      if (value != null && !isObj) {
        errors.push(`${path || 'args'}: nesne (object) bekleniyordu`)
      }
      const obj: Record<string, any> = isObj ? { ...value } : {}

      const required = schema.required ?? []
      for (const key of required) {
        const v = obj[key]
        if (v === undefined || v === null || v === '') {
          errors.push(`${joinPath(path, key)}: zorunlu alan eksik`)
        }
      }

      const props = schema.properties ?? {}
      for (const [key, propSchema] of Object.entries(props)) {
        if (obj[key] !== undefined) {
          obj[key] = validateValue(propSchema, obj[key], joinPath(path, key), errors)
        } else if (propSchema.default !== undefined) {
          obj[key] = propSchema.default
        }
      }
      return obj
    }

    case 'array': {
      if (!Array.isArray(value)) {
        if (value !== undefined) errors.push(`${path}: dizi (array) bekleniyordu`)
        return value
      }
      if (schema.items) {
        return value.map((v, i) => validateValue(schema.items!, v, `${path}[${i}]`, errors))
      }
      return value
    }

    case 'integer':
    case 'number': {
      let n = value
      if (typeof n === 'string' && n.trim() !== '' && Number.isFinite(Number(n))) n = Number(n)
      if (typeof n !== 'number' || !Number.isFinite(n)) {
        errors.push(`${path}: sayı bekleniyordu`)
        return value
      }
      if (schema.type === 'integer' && !Number.isInteger(n)) {
        errors.push(`${path}: tam sayı bekleniyordu`)
      }
      checkEnum(schema, n, path, errors)
      return n
    }

    case 'boolean': {
      let b = value
      if (b === 'true') b = true
      else if (b === 'false') b = false
      if (typeof b !== 'boolean') {
        errors.push(`${path}: mantıksal (boolean) bekleniyordu`)
        return value
      }
      return b
    }

    case 'string': {
      let s = value
      if (typeof s === 'number' || typeof s === 'boolean') s = String(s)
      if (typeof s !== 'string') {
        errors.push(`${path}: metin (string) bekleniyordu`)
        return value
      }
      checkEnum(schema, s, path, errors)
      return s
    }

    default:
      return value
  }
}

function checkEnum(schema: JSONSchema, value: any, path: string, errors: string[]) {
  if (schema.enum && schema.enum.length > 0 && !schema.enum.includes(value)) {
    errors.push(`${path}: geçersiz değer "${value}". İzin verilenler: ${schema.enum.join(', ')}`)
  }
}

function joinPath(base: string, key: string): string {
  return base ? `${base}.${key}` : key
}
