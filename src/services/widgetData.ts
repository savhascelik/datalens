// services/widgetData.ts
// Widget veri servisi — SQL üretimi (dashboard-engine) ile sorgu çalıştırmayı
// (data-engine) birleştiren ince katman. Bileşenler doğrudan SQL yazmaz;
// yalnızca "ne istediğini" (spec) söyler. Tek sorumluluk: veri getirmek.

import { runSafeQuery, sqlName } from '../data-engine'
import {
  buildWidgetQuery,
  buildTableQuery,
  buildTableCountQuery,
  buildCountQuery,
  buildScalarQuery,
  buildWhereClause,
} from '../dashboard-engine'
import type { ActiveFilter, Relationship } from '../types'

export interface WidgetDataResult<T = any> {
  rows: T[]
  skippedFilters: ActiveFilter[]
}

// Kategori bazlı grafik verisi (bar/line/pie) — {label, value} satırları.
export async function fetchCategoryData(params: {
  baseTable: string
  xColumn: string
  yColumn?: string
  aggregation?: 'sum' | 'count' | 'avg' | 'min' | 'max'
  limit?: number
  orderByValueDesc?: boolean
  filters: ActiveFilter[]
  relationships: Relationship[]
}): Promise<WidgetDataResult> {
  const { baseTable, xColumn, yColumn, aggregation = 'sum', limit = 15, orderByValueDesc, filters, relationships } = params
  const q = buildWidgetQuery(
    { baseTable, xColumn, yColumn, aggregation, limit, orderByValueDesc },
    filters, relationships
  )
  const rows = await runSafeQuery(q.sql)
  return { rows, skippedFilters: q.skippedFilters }
}

// Sayfalı + aranabilir detay tablo verisi.
export async function fetchTablePage(params: {
  baseTable: string
  columns: string[]
  search?: string
  limit: number
  offset: number
  filters: ActiveFilter[]
  relationships: Relationship[]
}): Promise<WidgetDataResult & { total: number }> {
  const { baseTable, columns, search, limit, offset, filters, relationships } = params
  const dataQ = buildTableQuery({ baseTable, columns, search, limit, offset }, filters, relationships)
  const countQ = buildTableCountQuery({ baseTable, columns, search }, filters, relationships)
  // Kuyruk sıralı olduğundan Promise.all yine tek tek çalışır ama kod sade kalır.
  const [rows, countRows] = await Promise.all([
    runSafeQuery(dataQ.sql),
    runSafeQuery(countQ.sql),
  ])
  return { rows, total: Number(countRows[0]?.value ?? 0), skippedFilters: dataQ.skippedFilters }
}

// Tek bir KPI skaler değeri.
export async function fetchScalar(params: {
  baseTable: string
  column: string
  aggregation: 'count' | 'count-distinct' | 'sum' | 'avg' | 'min' | 'max'
  filters: ActiveFilter[]
  relationships: Relationship[]
}): Promise<number> {
  const { baseTable, column, aggregation, filters, relationships } = params
  const q = (aggregation === 'count' || !column)
    ? buildCountQuery(baseTable, filters, relationships)
    : buildScalarQuery(baseTable, column, aggregation as any, filters, relationships)
  const rows = await runSafeQuery(q.sql)
  return Number(rows[0]?.value ?? 0)
}


// ==================== AI INSIGHT (özgür/yaratıcı widget) ====================
// LLM tarafından üretilen SQL sorgularını çalıştırır. Filtre-duyarlılık için tüm sorgular
// FILTRELİ bir `data` CTE'si üzerinden koşar: LLM her zaman `data` tablosuna yazar; biz onu
// `SELECT * FROM <gerçekTablo> WHERE <merkezi filtreler>` ile besleriz. Böylece filtre
// tetiklenince sorgu tekrar çalışır ve HTML içeriği de filtreye uyar

export interface InsightQuery { sql: string; type: 'single' | 'array' }

// LLM sorgusunu filtreli `data` CTE'siyle sarar (saf/test edilebilir).
export function buildInsightSql(baseTable: string, userSql: string, whereClause: string): string {
  return `WITH ${sqlName('data')} AS (SELECT * FROM ${sqlName(baseTable)}${whereClause})\n${userSql}`
}

export interface InsightResult {
  variables: Record<string, any>
  stats: Record<string, { success: boolean; rowCount: number; error?: string }>
  skippedFilters: ActiveFilter[]
}

// Adlandırılmış sorguları çalıştırıp şablon değişkenlerini üretir.
// type 'single' → ilk satır (obje); 'array' → tüm satırlar.
export async function fetchInsightVariables(params: {
  baseTable: string
  queries: Record<string, InsightQuery>
  filters: ActiveFilter[]
  relationships: Relationship[]
}): Promise<InsightResult> {
  const { baseTable, queries, filters, relationships } = params
  const { whereClause, skippedFilters } = buildWhereClause(baseTable, filters, relationships)
  const variables: Record<string, any> = {}
  const stats: InsightResult['stats'] = {}

  for (const [name, q] of Object.entries(queries || {})) {
    try {
      const sql = buildInsightSql(baseTable, q.sql, whereClause)
      const rows = await runSafeQuery(sql)
      variables[name] = q.type === 'single' ? (rows[0] ?? {}) : rows
      stats[name] = { success: true, rowCount: rows.length }
    } catch (err: any) {
      variables[name] = q.type === 'single' ? {} : []
      stats[name] = { success: false, rowCount: 0, error: String(err?.message ?? err) }
    }
  }

  return { variables, stats, skippedFilters }
}
