// dashboard-engine.ts
// Çoklu dosya (tablo) çapraz filtre altyapısı:
//   1) İlişki (foreign key) otomatik tespit motoru
//   2) İlişki grafiğinde BFS ile join yolu bulma
//   3) Merkezi buildWidgetQuery: widget tablosu + aktif filtreler + join'ler
//
// kullanıcı onaylasın. buildWidgetQuery yalnızca onaylı/verili ilişkileri kullanır.

import { runSafeQuery, sqlName } from './data-engine'
import type { ActiveFilter, Dataset, Relationship, RelationshipSuggestion } from './types'

// ==================== İSİM NORMALİZASYONU ====================

// Kolon adını FK karşılaştırması için normalize eder.
// "Customer_ID", "customerId", "customer_id" -> "customerid"
function normalizeColumn(name: string): string {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .toLowerCase()
}

// Tablo adının "anlamlı" kısmını çıkarır (uniqueTableName suffix'ini atarak).
// "orders_customers_k3f9a" -> "orders_customers" (kaba); tekil/çoğul için de kullanılır.
function tableStem(tableName: string): string {
  // sondaki _<base36 timestamp> parçasını at
  return tableName.replace(/_[a-z0-9]{6,}$/i, '')
}

// Basit tekil/çoğul eşitleme: "customers" ~ "customer"
function singularize(word: string): string {
  const w = word.toLowerCase()
  if (w.endsWith('ies')) return w.slice(0, -3) + 'y'
  if (w.endsWith('ses')) return w.slice(0, -2)
  if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

// ==================== ADAY ÇİFT ÜRETİMİ ====================

interface Candidate {
  childTable: string
  childColumn: string
  parentTable: string
  parentColumn: string
  reason: string
  nameScore: number // 0-1, isim benzerliği
}

// İki dataset arasında olası FK yönlerini isim heuristiğiyle üretir.
function nameBasedCandidates(a: Dataset, b: Dataset): Candidate[] {
  const out: Candidate[] = []
  const aStem = singularize(tableStem(a.name || a.tableName))
  const bStem = singularize(tableStem(b.name || b.tableName))

  for (const from of [a, b]) {
    const to = from === a ? b : a
    const toStem = to === a ? aStem : bStem

    for (const fromCol of from.columns) {
      const fromNorm = normalizeColumn(fromCol.name)

      for (const toCol of to.columns) {
        const toNorm = normalizeColumn(toCol.name)
        let score = 0
        let reason = ''

        // 1) Birebir aynı kolon adı (ör. her iki tabloda "customer_id")
        if (fromNorm === toNorm && (fromNorm.includes('id') || fromNorm.includes('key') || fromNorm.includes('code'))) {
          score = 0.9
          reason = `Aynı kolon adı: ${fromCol.name}`
        }
        // 2) fromCol "<parentTable>_id" ve toCol parent'ın id'si (ör. customer_id -> customers.id)
        else if (
          (toNorm === 'id' || toNorm === 'key' || toNorm === normalizeColumn(toStem) + 'id') &&
          (fromNorm === normalizeColumn(singularize(toStem)) + 'id' ||
           fromNorm === normalizeColumn(toStem) + 'id')
        ) {
          score = 0.95
          reason = `${fromCol.name} → ${to.name}.${toCol.name}`
        }

        if (score > 0) {
          out.push({
            childTable: from.tableName,
            childColumn: fromCol.name,
            parentTable: to.tableName,
            parentColumn: toCol.name,
            reason,
            nameScore: score,
          })
        }
      }
    }
  }
  return out
}

// ==================== DEĞER KAPSAMA (CONTAINMENT) TESTİ ====================

// child.column değerlerinin parent.column içinde bulunma oranını ölçer.
// Yüksek oran (>= eşik) => gerçek FK. Aynı zamanda kardinalite ipucu verir.
async function containmentTest(
  childTable: string, childColumn: string,
  parentTable: string, parentColumn: string
): Promise<{ matchRatio: number; parentUnique: boolean }> {
  const cc = sqlName(childColumn)
  const pc = sqlName(parentColumn)
  const ct = sqlName(childTable)
  const pt = sqlName(parentTable)

  // child'ın distinct (null olmayan) örneklemi
  const sampleSql = `
    WITH child_vals AS (
      SELECT DISTINCT CAST(${cc} AS VARCHAR) AS v
      FROM ${ct}
      WHERE ${cc} IS NOT NULL
      LIMIT 1000
    ),
    parent_vals AS (
      SELECT DISTINCT CAST(${pc} AS VARCHAR) AS v
      FROM ${pt}
      WHERE ${pc} IS NOT NULL
    )
    SELECT
      (SELECT COUNT(*) FROM child_vals) AS total,
      (SELECT COUNT(*) FROM child_vals c WHERE c.v IN (SELECT v FROM parent_vals)) AS matched
  `
  const rows = await runSafeQuery(sampleSql)
  const total = Number(rows[0]?.total ?? 0)
  const matched = Number(rows[0]?.matched ?? 0)
  const matchRatio = total > 0 ? matched / total : 0

  // parent kolonu benzersiz mi? (one-to-many için parent tarafı tekil olmalı)
  const uniqSql = `
    SELECT COUNT(*) AS cnt, COUNT(DISTINCT ${pc}) AS distinct_cnt
    FROM ${pt}
    WHERE ${pc} IS NOT NULL
  `
  const uniqRows = await runSafeQuery(uniqSql)
  const cnt = Number(uniqRows[0]?.cnt ?? 0)
  const distinctCnt = Number(uniqRows[0]?.distinct_cnt ?? 0)
  const parentUnique = cnt > 0 && distinctCnt / cnt >= 0.98

  return { matchRatio, parentUnique }
}

// ==================== ANA TESPİT FONKSİYONU ====================

const MATCH_THRESHOLD = 0.7 // child değerlerinin en az %70'i parent'ta bulunmalı

// Verilen datasetler arasında olası ilişkileri tespit eder.
// Pahalı olabileceği için yalnızca isim heuristiği geçen adaylara containment testi uygular.
export async function detectRelationships(datasets: Dataset[]): Promise<RelationshipSuggestion[]> {
  const suggestions: RelationshipSuggestion[] = []
  const seen = new Set<string>()

  for (let i = 0; i < datasets.length; i++) {
    for (let j = i + 1; j < datasets.length; j++) {
      const candidates = nameBasedCandidates(datasets[i], datasets[j])

      for (const cand of candidates) {
        const key = `${cand.childTable}.${cand.childColumn}->${cand.parentTable}.${cand.parentColumn}`
        if (seen.has(key)) continue
        seen.add(key)

        try {
          const { matchRatio, parentUnique } = await containmentTest(
            cand.childTable, cand.childColumn, cand.parentTable, cand.parentColumn
          )

          if (matchRatio >= MATCH_THRESHOLD && parentUnique) {
            suggestions.push({
              id: `rel_${key}`,
              fromTable: cand.childTable,
              fromColumn: cand.childColumn,
              toTable: cand.parentTable,
              toColumn: cand.parentColumn,
              cardinality: 'many-to-one',
              confidence: Math.min(1, cand.nameScore * 0.5 + matchRatio * 0.5),
              confirmed: false,
              reason: cand.reason,
              matchRatio,
            })
          }
        } catch (err) {
          console.warn('İlişki tespiti sırasında sorgu hatası:', key, err)
        }
      }
    }
  }

  // En güvenilir öneriler önce
  suggestions.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
  return suggestions
}

// ==================== JOIN YOLU (BFS) ====================

// İlişki grafiğinde fromTable -> toTable arası en kısa join yolunu bulur.
// Yönsüz düşünülür (join her iki yönde de kurulabilir).
export interface JoinStep {
  leftTable: string
  leftColumn: string
  rightTable: string
  rightColumn: string
}

export function findJoinPath(
  fromTable: string,
  toTable: string,
  relationships: Relationship[]
): JoinStep[] | null {
  if (fromTable === toTable) return []

  // komşuluk listesi
  const adj = new Map<string, Array<{ table: string; step: JoinStep }>>()
  const addEdge = (a: string, aCol: string, b: string, bCol: string) => {
    if (!adj.has(a)) adj.set(a, [])
    adj.get(a)!.push({ table: b, step: { leftTable: a, leftColumn: aCol, rightTable: b, rightColumn: bCol } })
  }
  for (const r of relationships) {
    addEdge(r.fromTable, r.fromColumn, r.toTable, r.toColumn)
    addEdge(r.toTable, r.toColumn, r.fromTable, r.fromColumn)
  }

  // BFS
  const queue: Array<{ table: string; path: JoinStep[] }> = [{ table: fromTable, path: [] }]
  const visited = new Set<string>([fromTable])

  while (queue.length > 0) {
    const { table, path } = queue.shift()!
    for (const neighbor of adj.get(table) ?? []) {
      if (visited.has(neighbor.table)) continue
      const newPath = [...path, neighbor.step]
      if (neighbor.table === toTable) return newPath
      visited.add(neighbor.table)
      queue.push({ table: neighbor.table, path: newPath })
    }
  }
  return null // bağlantı yok
}

// ==================== SQL YARDIMCILARI ====================

function escapeValue(v: string): string {
  return v.replaceAll("'", "''")
}

// Bir filtreyi (baseTable perspektifinden) WHERE koşuluna çevirir.
// Filtre baseTable'a aitse doğrudan; değilse join yolu üzerinden EXISTS alt sorgusu kurar.
// Dönen: { clause, applied } — applied=false ise ilişki yolu bulunamadı, filtre atlandı.
function buildFilterClause(
  baseTable: string,
  filter: ActiveFilter,
  relationships: Relationship[]
): { clause: string | null; applied: boolean } {
  const col = sqlName(filter.column)
  const raw = escapeValue(filter.value)
  const isContains = filter.op === 'contains'
  const cmp = (colExpr: string) => isContains
    ? `CAST(${colExpr} AS VARCHAR) ILIKE '%${raw}%'`
    : `CAST(${colExpr} AS VARCHAR) = '${raw}'`
  const val = `'${raw}'`

  // Filtre doğrudan base tabloya aitse
  if (filter.tableName === baseTable) {
    return { clause: cmp(col), applied: true }
  }

  // Farklı tablo: join yolu bul
  const path = findJoinPath(baseTable, filter.tableName, relationships)
  if (!path || path.length === 0) {
    return { clause: null, applied: false }
  }

  // EXISTS alt sorgusu ile ilişkisel filtre kur.
  // base -> ... -> filter.tableName zincirini iç JOIN'lerle bağla.
  const first = path[0]
  const joins: string[] = []
  for (let k = 1; k < path.length; k++) {
    const step = path[k]
    joins.push(
      `JOIN ${sqlName(step.rightTable)} ON ${sqlName(step.leftTable)}.${sqlName(step.leftColumn)} = ${sqlName(step.rightTable)}.${sqlName(step.rightColumn)}`
    )
  }

  const exists = `EXISTS (
    SELECT 1 FROM ${sqlName(first.rightTable)}
    ${joins.join('\n    ')}
    WHERE ${sqlName(first.leftTable)}.${sqlName(first.leftColumn)} = ${sqlName(baseTable)}.${sqlName(first.rightColumn === first.leftColumn ? first.leftColumn : first.rightColumn)}
      AND CAST(${sqlName(filter.tableName)}.${sqlName(filter.column)} AS VARCHAR) = ${val}
  )`
  // Not: base tablo ile ilk adım arasındaki eşleşme için join koşulunu düzeltiyoruz:
  // first.leftTable === baseTable olduğundan first.leftColumn baseTable kolonudur.
  const existsFixed = `EXISTS (
    SELECT 1 FROM ${buildJoinChainFrom(baseTable, path)}
    WHERE ${cmp(`${sqlName(filter.tableName)}.${sqlName(filter.column)}`)}
  )`
  void exists
  return { clause: existsFixed, applied: true }
}

// baseTable'dan başlayıp path boyunca JOIN zinciri kuran FROM ifadesi üretir.
// İlk adımın leftTable'ı baseTable'dır.
function buildJoinChainFrom(baseTable: string, path: JoinStep[]): string {
  let from = sqlName(baseTable)
  for (const step of path) {
    from += `\n      JOIN ${sqlName(step.rightTable)} ON ${sqlName(step.leftTable)}.${sqlName(step.leftColumn)} = ${sqlName(step.rightTable)}.${sqlName(step.rightColumn)}`
  }
  return from
}

// ==================== MERKEZİ WHERE ÜRETİCİ ====================

export interface WhereResult {
  whereClause: string          // "" veya " WHERE ..."
  appliedFilters: ActiveFilter[]
  skippedFilters: ActiveFilter[] // ilişki yolu bulunamadığı için atlananlar
}

// Bir widget'ın base tablosu için aktif filtrelerden WHERE cümlesi üretir.
// Çoklu dosya: farklı tablodan gelen filtreler ilişki yolu üzerinden uygulanır,
// yol yoksa atlanır (ve skippedFilters'ta raporlanır → UI rozet gösterebilir).
export function buildWhereClause(
  baseTable: string,
  filters: ActiveFilter[],
  relationships: Relationship[]
): WhereResult {
  const clauses: string[] = []
  const applied: ActiveFilter[] = []
  const skipped: ActiveFilter[] = []

  for (const f of filters) {
    const { clause, applied: ok } = buildFilterClause(baseTable, f, relationships)
    if (ok && clause) {
      clauses.push(clause)
      applied.push(f)
    } else {
      skipped.push(f)
    }
  }

  return {
    whereClause: clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '',
    appliedFilters: applied,
    skippedFilters: skipped,
  }
}

// ==================== BUILD WIDGET QUERY ====================

export interface WidgetQuerySpec {
  baseTable: string
  xColumn?: string
  yColumn?: string
  aggregation?: 'sum' | 'count' | 'avg' | 'min' | 'max'
  limit?: number
  orderByValueDesc?: boolean
}

export interface BuiltQuery {
  sql: string
  skippedFilters: ActiveFilter[]
}

// Bir kategori/deger grafiği (bar/line/pie) için gruplu sorgu üretir.
export function buildWidgetQuery(
  spec: WidgetQuerySpec,
  filters: ActiveFilter[],
  relationships: Relationship[]
): BuiltQuery {
  const { baseTable, xColumn, yColumn, aggregation = 'sum', limit = 15, orderByValueDesc } = spec
  const { whereClause, skippedFilters } = buildWhereClause(baseTable, filters, relationships)

  const agg = yColumn
    ? `${aggregation.toUpperCase()}(${sqlName(yColumn)})`
    : 'COUNT(*)'

  const orderBy = orderByValueDesc ? 'ORDER BY 2 DESC' : 'ORDER BY 1'

  const sql = xColumn
    ? `SELECT ${sqlName(xColumn)}, ${agg} AS "value" FROM ${sqlName(baseTable)}${whereClause} GROUP BY 1 ${orderBy} LIMIT ${limit}`
    : `SELECT ${agg} AS "value" FROM ${sqlName(baseTable)}${whereClause}`

  return { sql, skippedFilters }
}

// Sayaç (COUNT) sorgusu — KPI için.
export function buildCountQuery(
  baseTable: string,
  filters: ActiveFilter[],
  relationships: Relationship[]
): BuiltQuery {
  const { whereClause, skippedFilters } = buildWhereClause(baseTable, filters, relationships)
  return { sql: `SELECT COUNT(*) AS "value" FROM ${sqlName(baseTable)}${whereClause}`, skippedFilters }
}

// Tekil skaler agregasyon (SUM/AVG...) — KPI için.
export function buildScalarQuery(
  baseTable: string,
  column: string,
  aggregation: 'sum' | 'avg' | 'min' | 'max' | 'count-distinct',
  filters: ActiveFilter[],
  relationships: Relationship[]
): BuiltQuery {
  const { whereClause, skippedFilters } = buildWhereClause(baseTable, filters, relationships)
  const col = sqlName(column)
  const agg = aggregation === 'count-distinct'
    ? `COUNT(DISTINCT ${col})`
    : `${aggregation.toUpperCase()}(${col})`
  return { sql: `SELECT ${agg} AS "value" FROM ${sqlName(baseTable)}${whereClause}`, skippedFilters }
}

// Detay tablo (SELECT *) sorgusu — lazy pagination + serbest metin arama destekli.
export interface TableQuerySpec {
  baseTable: string
  columns: string[]           // aranacak kolonlar (searchable)
  search?: string             // serbest metin arama
  limit?: number
  offset?: number
}

// Arama terimi için tüm kolonlarda OR'lu ILIKE koşulu üretir.
function buildSearchClause(columns: string[], search?: string): string | null {
  const term = (search ?? '').trim()
  if (!term || columns.length === 0) return null
  const escaped = term.replaceAll("'", "''")
  const parts = columns.map(c => `CAST(${sqlName(c)} AS VARCHAR) ILIKE '%${escaped}%'`)
  return `(${parts.join(' OR ')})`
}

export function buildTableQuery(
  spec: TableQuerySpec,
  filters: ActiveFilter[],
  relationships: Relationship[]
): BuiltQuery {
  const { baseTable, columns, search, limit = 25, offset = 0 } = spec
  const { whereClause, skippedFilters } = buildWhereClause(baseTable, filters, relationships)
  const searchClause = buildSearchClause(columns, search)

  // filtre WHERE'i ile arama koşulunu birleştir
  let combinedWhere = whereClause
  if (searchClause) {
    combinedWhere = whereClause
      ? `${whereClause} AND ${searchClause}`
      : ` WHERE ${searchClause}`
  }

  return {
    sql: `SELECT * FROM ${sqlName(baseTable)}${combinedWhere} LIMIT ${limit} OFFSET ${offset}`,
    skippedFilters,
  }
}

// Toplam satır sayısı (arama + filtre uygulanmış) — pagination için.
export function buildTableCountQuery(
  spec: Pick<TableQuerySpec, 'baseTable' | 'columns' | 'search'>,
  filters: ActiveFilter[],
  relationships: Relationship[]
): BuiltQuery {
  const { baseTable, columns, search } = spec
  const { whereClause, skippedFilters } = buildWhereClause(baseTable, filters, relationships)
  const searchClause = buildSearchClause(columns, search)

  let combinedWhere = whereClause
  if (searchClause) {
    combinedWhere = whereClause
      ? `${whereClause} AND ${searchClause}`
      : ` WHERE ${searchClause}`
  }

  return {
    sql: `SELECT COUNT(*) AS "value" FROM ${sqlName(baseTable)}${combinedWhere}`,
    skippedFilters,
  }
}
