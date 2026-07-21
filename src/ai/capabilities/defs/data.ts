// ai/capabilities/defs/data.ts
// Veri keşfi yetenekleri (read-only). AI önce bunlarla şemayı/örnekleri anlar.

import type { Capability } from '../types'
import type { ColumnKind } from '../../../types'
import { runSafeQuery, sqlName } from '../../../data-engine'
import i18n from '../../../i18n'

// Aktif ya da adı verilen dataset'i bulur.
function resolveTable(bridge: import('../../appBridge').AppBridge, tableName?: string) {
  const datasets = bridge.getDatasets()
  if (tableName) {
    return datasets.find(d => d.tableName === tableName || d.name === tableName)
  }
  // tableName verilmediyse aktif dashboard'un ilk bağlı tablosu, o da yoksa ilk dataset
  const dash = bridge.getDashboards().find(d => d.id === bridge.getActiveDashboardId())
  const linked = dash?.linkedTableNames?.[0]
  return datasets.find(d => d.tableName === linked) || datasets[0]
}

const listTables: Capability = {
  id: 'data.listTables',
  title: 'List loaded files',
  description: 'Returns all data tables (loaded files) in the workspace and their row counts.',
  keywords: ['table', 'file', 'dataset', 'list', 'files', 'tables', 'data'],
  category: 'data',
  sideEffect: false,
  argsSchema: { type: 'object', properties: {} },
  async run(_args, ctx) {
    const datasets = ctx.bridge.getDatasets()
    return {
      success: true,
      message: i18n.t('ai.cap.tablesFound', { count: datasets.length }),
      data: datasets.map(d => ({ tableName: d.tableName, name: d.name, rowCount: d.totalRows, columnCount: d.columns.length })),
    }
  },
}

const getSchema: Capability = {
  id: 'data.getSchema',
  title: 'Get table schema',
  description: "Returns a table's columns, data types (number/string/date/boolean), distinct value counts and samples.",
  keywords: ['schema', 'columns', 'column', 'field', 'type', 'types', 'structure'],
  category: 'data',
  sideEffect: false,
  argsSchema: {
    type: 'object',
    properties: {
      tableName: { type: 'string', description: 'Table name (defaults to active table)' },
    },
  },
  async run(args, ctx) {
    const ds = resolveTable(ctx.bridge, args?.tableName)
    if (!ds) return { success: false, message: i18n.t('ai.cap.tableNotFound'), error: 'table_not_found' }
    return {
      success: true,
      message: i18n.t('ai.cap.schema', { name: ds.name, cols: ds.columns.length, rows: ds.totalRows }),
      data: {
        tableName: ds.tableName,
        name: ds.name,
        rowCount: ds.totalRows,
        columns: ds.columns.map(c => ({
          name: c.name,
          type: c.kind,
          uniqueCount: c.uniqueCount,
          sample: c.sample,
        })),
      },
    }
  },
}

const sampleRows: Capability = {
  id: 'data.sampleRows',
  title: 'Get sample rows',
  description: 'Returns a few sample rows from a table (default 10, max 50).',
  keywords: ['sample', 'rows', 'preview', 'head', 'example', 'peek'],
  category: 'data',
  sideEffect: false,
  argsSchema: {
    type: 'object',
    properties: {
      tableName: { type: 'string', description: 'Table name (defaults to active table)' },
      limit: { type: 'integer', description: 'Number of rows (1-50)', default: 10 },
    },
  },
  async run(args, ctx) {
    const ds = resolveTable(ctx.bridge, args?.tableName)
    if (!ds) return { success: false, message: i18n.t('ai.cap.tableNotFound'), error: 'table_not_found' }
    const limit = Math.min(Math.max(1, Number(args?.limit) || 10), 50)
    const rows = await runSafeQuery(`SELECT * FROM ${sqlName(ds.tableName)} LIMIT ${limit}`)
    return { success: true, message: i18n.t('ai.cap.sampleRows', { count: rows.length }), data: { columns: ds.headers, rows } }
  },
}

const getColumnStats: Capability = {
  id: 'data.getColumnStats',
  title: 'Column statistics',
  description: 'Returns N, mean, standard deviation, min, max and missing count for a numeric column.',
  keywords: ['statistics', 'stats', 'mean', 'average', 'min', 'max', 'missing', 'std', 'summary'],
  category: 'data',
  sideEffect: false,
  argsSchema: {
    type: 'object',
    properties: {
      column: { type: 'string', description: 'Column name' },
      tableName: { type: 'string', description: 'Table name (defaults to active table)' },
    },
    required: ['column'],
  },
  async run(args, ctx) {
    const ds = resolveTable(ctx.bridge, args?.tableName)
    if (!ds) return { success: false, message: i18n.t('ai.cap.tableNotFound'), error: 'table_not_found' }
    const col = sqlName(String(args.column))
    const tbl = sqlName(ds.tableName)
    const rows = await runSafeQuery(`
      SELECT
        COUNT(*) AS n,
        COUNT(TRY_CAST(${col} AS DOUBLE)) AS valid,
        COUNT(*) - COUNT(TRY_CAST(${col} AS DOUBLE)) AS missing,
        ROUND(AVG(TRY_CAST(${col} AS DOUBLE)), 4) AS mean,
        ROUND(STDDEV(TRY_CAST(${col} AS DOUBLE)), 4) AS std,
        MIN(TRY_CAST(${col} AS DOUBLE)) AS min,
        MAX(TRY_CAST(${col} AS DOUBLE)) AS max
      FROM ${tbl}
    `)
    return { success: true, message: i18n.t('ai.cap.colStats', { column: args.column }), data: rows[0] ?? {} }
  },
}

const runSql: Capability = {
  id: 'data.runSql',
  title: 'Run SQL query (read-only)',
  description: 'Runs a read-only (SELECT/WITH) query on DuckDB. Quote column/table names with double quotes. For exploration/analysis only.',
  keywords: ['sql', 'query', 'select', 'duckdb', 'group by', 'aggregate', 'sum', 'count', 'where'],
  category: 'data',
  sideEffect: false,
  argsSchema: {
    type: 'object',
    properties: {
      sql: { type: 'string', description: 'Read-only query starting with SELECT or WITH.' },
    },
    required: ['sql'],
  },
  async run(args, _ctx) {
    const sql = String(args?.sql ?? '')
    try {
      const rows = await runSafeQuery(sql)
      const limited = rows.slice(0, 100)
      return {
        success: true,
        message: rows.length > 100
          ? i18n.t('ai.cap.sqlRowsCapped', { count: rows.length })
          : i18n.t('ai.cap.sqlRows', { count: rows.length }),
        data: { rows: limited, rowCount: rows.length, columns: rows[0] ? Object.keys(rows[0]) : [] },
      }
    } catch (err: any) {
      return { success: false, message: i18n.t('ai.cap.sqlError', { msg: err?.message ?? err }), error: String(err?.message ?? err) }
    }
  },
}

const addComputedColumn: Capability = {
  id: 'data.addComputedColumn',
  title: 'Add a computed column',
  description: 'Adds a new column to a table computed from an SQL expression over existing columns (e.g. "UnitPrice" * "Quantity"). Becomes available in dashboards and reports afterwards.',
  keywords: ['computed', 'derived', 'column', 'calculate', 'formula', 'expression', 'new column', 'add column'],
  category: 'data',
  sideEffect: true,
  argsSchema: {
    type: 'object',
    properties: {
      newColumn: { type: 'string', description: 'Name of the new column' },
      expression: { type: 'string', description: 'SQL expression over existing columns, e.g. "UnitPrice" * "Quantity"' },
      tableName: { type: 'string', description: 'Table name (defaults to active table)' },
    },
    required: ['newColumn', 'expression'],
  },
  async run(args, ctx) {
    const ds = resolveTable(ctx.bridge, args?.tableName)
    if (!ds) return { success: false, message: i18n.t('ai.cap.tableNotFound'), error: 'table_not_found' }
    const col = String(args.newColumn)
    const expr = String(args.expression)
    const tbl = sqlName(ds.tableName)
    const newCol = sqlName(col)

    try {
      // Yeni kolonu ekleyerek tabloyu yeniden oluştur (DuckDB tipini otomatik çıkarır).
      await runSafeQuery(`CREATE OR REPLACE TABLE ${tbl} AS SELECT *, (${expr}) AS ${newCol} FROM ${tbl}`)
    } catch (err: any) {
      return { success: false, message: i18n.t('ai.cap.computeFailed', { msg: err?.message ?? err }), error: 'compute_failed' }
    }

    // Yeni kolonu best-effort profille (kind + uniqueCount + örnek).
    let kind: ColumnKind = 'string'
    let uniqueCount = 0
    let sample = ''
    try {
      const stat = await runSafeQuery(`SELECT COUNT(*) AS n, COUNT(TRY_CAST(${newCol} AS DOUBLE)) AS num, COUNT(DISTINCT ${newCol}) AS uniq FROM ${tbl}`)
      const s: any = stat[0] || {}
      const n = Number(s.n) || 0
      const num = Number(s.num) || 0
      kind = n > 0 && num === n ? 'number' : 'string'
      uniqueCount = Number(s.uniq) || 0
      const sr = await runSafeQuery(`SELECT ${newCol} AS v FROM ${tbl} WHERE ${newCol} IS NOT NULL LIMIT 1`)
      sample = sr[0] ? String((sr[0] as any).v ?? '') : ''
    } catch { /* profil best-effort */ }

    // Dataset profilini güncelle ki dashboard/rapor yeni kolonu görebilsin.
    ctx.bridge.setDatasets(prev => prev.map(d => d.tableName === ds.tableName
      ? {
          ...d,
          headers: d.headers.includes(col) ? d.headers : [...d.headers, col],
          columns: d.columns.some(c => c.name === col)
            ? d.columns
            : [...d.columns, { name: col, kind, nonEmptyCount: d.totalRows, emptyCount: 0, uniqueCount, sample }],
        }
      : d))

    return { success: true, message: i18n.t('ai.cap.computedColumnAdded', { column: col }), data: { column: col, kind } }
  },
}

export const dataCapabilities: Capability[] = [
  listTables,
  getSchema,
  sampleRows,
  getColumnStats,
  runSql,
  addComputedColumn,
]
