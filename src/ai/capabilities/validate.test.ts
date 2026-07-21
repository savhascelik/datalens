import { describe, it, expect } from 'vitest'
import { validateArgs } from './validate'
import type { JSONSchema } from './types'

describe('validateArgs', () => {
  it('şemasız çağrıda args aynen geçer', () => {
    const r = validateArgs(undefined, { a: 1 })
    expect(r.ok).toBe(true)
    expect(r.value).toEqual({ a: 1 })
  })

  it('zorunlu alan eksikse hata verir', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: { column: { type: 'string' }, value: { type: 'string' } },
      required: ['column', 'value'],
    }
    const r = validateArgs(schema, { column: 'city' })
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toContain('value')
  })

  it('boş string zorunlu alanı eksik sayar', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    }
    expect(validateArgs(schema, { name: '' }).ok).toBe(false)
  })

  it('enum dışı değeri reddeder', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: { slot: { type: 'string', enum: ['bar', 'line'] } },
      required: ['slot'],
    }
    const r = validateArgs(schema, { slot: 'pie' })
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toContain('slot')
  })

  it('enum içi değeri kabul eder', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: { slot: { type: 'string', enum: ['bar', 'line'] } },
      required: ['slot'],
    }
    expect(validateArgs(schema, { slot: 'bar' }).ok).toBe(true)
  })

  it('sayısal string değeri number tipine coerce eder', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: { limit: { type: 'integer' } },
    }
    const r = validateArgs(schema, { limit: '10' })
    expect(r.ok).toBe(true)
    expect(r.value.limit).toBe(10)
  })

  it('integer için ondalık sayı hata verir', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: { limit: { type: 'integer' } },
    }
    expect(validateArgs(schema, { limit: 3.5 }).ok).toBe(false)
  })

  it('eksik opsiyonel alana default doldurur', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: { limit: { type: 'integer', default: 10 } },
    }
    const r = validateArgs(schema, {})
    expect(r.ok).toBe(true)
    expect(r.value.limit).toBe(10)
  })

  it('boolean string coerce eder', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: { flag: { type: 'boolean' } },
    }
    const r = validateArgs(schema, { flag: 'true' })
    expect(r.ok).toBe(true)
    expect(r.value.flag).toBe(true)
  })

  it('array items doğrular', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: { tableNames: { type: 'array', items: { type: 'string' } } },
      required: ['tableNames'],
    }
    expect(validateArgs(schema, { tableNames: ['a', 'b'] }).ok).toBe(true)
    expect(validateArgs(schema, { tableNames: 'a' }).ok).toBe(false)
  })

  it('fazladan alanlara izin verir (LLM hoşgörüsü)', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: { column: { type: 'string' } },
      required: ['column'],
    }
    const r = validateArgs(schema, { column: 'city', extra: 'ignored' })
    expect(r.ok).toBe(true)
    expect(r.value.extra).toBe('ignored')
  })
})
