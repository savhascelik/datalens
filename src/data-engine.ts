import * as duckdb from '@duckdb/duckdb-wasm'
import duckdbWasmUrl from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'
import duckdbWorkerUrl from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'
import * as XLSX from 'xlsx'
import type { AiDashboardPlan, ColumnKind, ColumnProfile, DashboardModel, Dataset, ExecutedAiComponent, ImportProgress, QueryRow } from './types'
import { isAllowedSql } from './sql-safety'

let database: duckdb.AsyncDuckDB | undefined
let initPromise: Promise<duckdb.AsyncDuckDB> | undefined

export const sqlName = (value: string) => `"${value.replaceAll('"', '""')}"`
const safeName = (value: string) => {
  const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase()
  return normalized || 'veri'
}

const uniqueTableName = (fileName: string, sheetName?: string) =>
  `${safeName(fileName.replace(/\.[^.]+$/, ''))}${sheetName ? `_${safeName(sheetName)}` : ''}_${Date.now().toString(36)}`

async function getDatabase() {
  if (database) return database
  if (initPromise) return initPromise

  initPromise = (async () => {
    const worker = new Worker(duckdbWorkerUrl)
    const instance = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker)
    await instance.instantiate(duckdbWasmUrl)
    database = instance
    return instance
  })()

  return initPromise
}

// ==================== SIRALI SORGU KUYRUĞU (MUTEX) ====================
// DuckDB-WASM tek bir worker üzerinde çalışır. Aynı anda birden fazla sorgu/
// bağlantı gönderildiğinde Emscripten runtime'da "_setThrew is not defined"
// gibi yarış (race) hataları oluşur. Bu yüzden TÜM sorguları tek paylaşımlı
// bağlantı üzerinden ve sırayla (kuyrukta) çalıştırıyoruz.

let sharedConnection: duckdb.AsyncDuckDBConnection | undefined
let queryChain: Promise<unknown> = Promise.resolve()

async function getConnection(): Promise<duckdb.AsyncDuckDBConnection> {
  if (sharedConnection) return sharedConnection
  const db = await getDatabase()
  sharedConnection = await db.connect()
  return sharedConnection
}

// Verilen işi kuyruğa ekler; önceki iş bitmeden başlamaz (serialization).
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queryChain.then(task, task)
  // Zincirin kopmaması için hatayı yut (her çağıran kendi sonucunu ayrıca alır)
  queryChain = run.then(() => undefined, () => undefined)
  return run
}

const rowsFromResult = (result: { toArray: () => unknown[] }): QueryRow[] => result.toArray().map((row) => {
  const object = row as Record<string, unknown>
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, typeof value === 'bigint' ? Number(value) : value === null ? null : String(value)]))
})

export async function runSafeQuery(sql: string): Promise<QueryRow[]> {
  if (!isAllowedSql(sql)) throw new Error('Bu sorgu ag/dosya erisimi (read_csv, httpfs, attach, copy vb.) icerdigi icin guvenlik nedeniyle engellendi.')
  // Sıralı kuyruk: aynı anda tek sorgu çalışır (DuckDB-WASM race'ini önler).
  return enqueue(async () => {
    const connection = await getConnection()
    return rowsFromResult(await connection.query(sql))
  })
}

export async function executeDashboardPlan(plan: AiDashboardPlan): Promise<ExecutedAiComponent[]> {
  return Promise.all(plan.components.map(async (component: any) => ({ ...component, rows: await runSafeQuery(component.sql) })))
}

export async function createDashboard(dataset: Dataset, filter?: string): Promise<DashboardModel> {
  const category = dataset.columns.find((column) => column.kind === 'string' && column.uniqueCount > 1 && column.uniqueCount <= 30)
  const numeric = dataset.columns.find((column) => column.kind === 'number')
  const where = category && filter ? ` WHERE CAST(${sqlName(category.name)} AS VARCHAR) = '${filter.replaceAll("'", "''")}'` : ''
  const countRows = await runSafeQuery(`SELECT COUNT(*) AS total_rows FROM ${sqlName(dataset.tableName)}${where}`)
  const totalRows = Number(countRows[0]?.total_rows ?? 0)
  const categoryOptions = category
    ? (await runSafeQuery(`SELECT DISTINCT CAST(${sqlName(category.name)} AS VARCHAR) AS value FROM ${sqlName(dataset.tableName)} WHERE ${sqlName(category.name)} IS NOT NULL ORDER BY value LIMIT 30`)).map((row) => String(row.value))
    : []
  if (!category) return { totalRows, categoryOptions: [], categoryRows: [] }
  const aggregation = numeric ? `SUM(${sqlName(numeric.name)})` : 'COUNT(*)'
  const categoryRows = await runSafeQuery(`SELECT CAST(${sqlName(category.name)} AS VARCHAR) AS label, ${aggregation} AS value FROM ${sqlName(dataset.tableName)}${where} GROUP BY 1 ORDER BY 2 DESC LIMIT 12`)
  const totalValue = numeric ? Number((await runSafeQuery(`SELECT COALESCE(SUM(${sqlName(numeric.name)}), 0) AS total_value FROM ${sqlName(dataset.tableName)}${where}`))[0]?.total_value ?? 0) : undefined
  return { totalRows, totalValue, numericColumn: numeric?.name, categoryColumn: category.name, categoryOptions, categoryRows }
}

function asCsv(rows: unknown[][]) {
  return rows.map((row) => row.map((value) => {
    const text = value === null || value === undefined ? '' : String(value)
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
  }).join(',')).join('\n')
}

async function profileTable(tableName: string, displayName: string): Promise<Dataset> {
  const db = await getDatabase()
  const connection = await db.connect()
  try {
    const rowsResult = await connection.query(`SELECT * FROM ${sqlName(tableName)} LIMIT 50`)
    const preview = rowsResult.toArray().map((row) => Object.values(row).map((value) => value === null ? '' : String(value)))
    const schema = await connection.query(`DESCRIBE ${sqlName(tableName)}`)
    const fields = schema.toArray().map((row) => ({ name: String(row.column_name), dbType: String(row.column_type) }))
    const countResult = await connection.query(`SELECT COUNT(*) AS count FROM ${sqlName(tableName)}`)
    const totalRows = Number(countResult.toArray()[0]?.count ?? 0)

    // Parallelized Single-Scan Statistics Query
    const isLargeData = totalRows > 100000
    const selectParts = fields.map(field => {
      const colName = sqlName(field.name)
      const uniqueCountSql = isLargeData 
        ? `approx_count_distinct(${colName})` 
        : `COUNT(DISTINCT ${colName})`
      return `COUNT(${colName}) AS "filled_${field.name.replaceAll('"', '""')}", ${uniqueCountSql} AS "unique_${field.name.replaceAll('"', '""')}"`
    })

    const statsResult = await connection.query(`SELECT ${selectParts.join(', ')} FROM ${sqlName(tableName)}`)
    const statsRow = statsResult.toArray()[0] as Record<string, any>

    // Fetch pre-selected rows for sample extraction
    const sampleRowsResult = await connection.query(`SELECT * FROM ${sqlName(tableName)} LIMIT 20`)
    const sampleRows = sampleRowsResult.toArray() as Record<string, any>[]

    const columns: ColumnProfile[] = []
    for (const field of fields) {
      const filled = Number(statsRow[`filled_${field.name}`] ?? 0)
      const uniqueCount = Number(statsRow[`unique_${field.name}`] ?? 0)

      // Get samples from the pre-fetched 20 rows
      const nonNullSamples = sampleRows
        .map(row => row[field.name])
        .filter(val => val !== null && val !== undefined && val !== '')
        .slice(0, 3)
        .map(val => String(val))
      
      const sample = nonNullSamples.join(', ') || '—'

      columns.push({
        name: field.name,
        kind: mapType(field.dbType),
        nonEmptyCount: filled,
        emptyCount: totalRows - filled,
        uniqueCount,
        sample,
      })
    }

    return { name: displayName, tableName, totalRows, headers: fields.map((field) => field.name), rows: preview, columns }
  } finally {
    await connection.close()
  }
}

function mapType(dbType: string): ColumnKind {
  const type = dbType.toUpperCase()
  if (type.includes('DATE') || type.includes('TIME')) return 'date'
  if (/(INT|DECIMAL|DOUBLE|FLOAT|NUMERIC|REAL)/.test(type)) return 'number'
  if (type.includes('BOOL')) return 'boolean'
  return 'string'
}

async function loadCsvTable(tableName: string, csv: string) {
  const db = await getDatabase()
  const connection = await db.connect()
  try {
    const sourceFile = `/imports/${tableName}.csv`
    await db.registerFileText(sourceFile, csv)
    await connection.query(`CREATE OR REPLACE TABLE ${sqlName(tableName)} AS SELECT * FROM read_csv_auto('${sourceFile}', header = true, all_varchar = false)`)
    await connection.query(`COPY ${sqlName(tableName)} TO '/imports/${tableName}.parquet' (FORMAT PARQUET)`)
  } finally {
    await connection.close()
  }
}

async function loadParquetTable(tableName: string, buffer: ArrayBuffer) {
  const db = await getDatabase()
  const connection = await db.connect()
  try {
    const sourceFile = `/imports/${tableName}.parquet`
    await db.registerFileBuffer(sourceFile, new Uint8Array(buffer))
    await connection.query(`CREATE OR REPLACE TABLE ${sqlName(tableName)} AS SELECT * FROM read_parquet('${sourceFile}')`)
  } finally {
    await connection.close()
  }
}

async function loadJsonTable(tableName: string, jsonText: string) {
  const db = await getDatabase()
  const connection = await db.connect()
  try {
    const sourceFile = `/imports/${tableName}.json`
    await db.registerFileText(sourceFile, jsonText)
    await connection.query(`CREATE OR REPLACE TABLE ${sqlName(tableName)} AS SELECT * FROM read_json_auto('${sourceFile}')`)
    await connection.query(`COPY ${sqlName(tableName)} TO '/imports/${tableName}.parquet' (FORMAT PARQUET)`)
  } finally {
    await connection.close()
  }
}

export async function getVirtualFileBytes(path: string): Promise<Uint8Array> {
  const db = await getDatabase()
  return await db.copyFileToBuffer(path)
}

export async function rehydrateLocalDataset(tableName: string, bytes: Uint8Array): Promise<void> {
  const db = await getDatabase()
  const connection = await db.connect()
  try {
    const path = `/imports/${tableName}.parquet`
    await db.registerFileBuffer(path, bytes)
    await connection.query(`CREATE OR REPLACE TABLE ${sqlName(tableName)} AS SELECT * FROM read_parquet('${path}')`)
  } finally {
    await connection.close()
  }
}


export async function importFile(
  file: File, 
  t: (key: string, options?: any) => string,
  onProgress: (progress: ImportProgress) => void
): Promise<Dataset[]> {
  onProgress({ value: 8, message: t('importing.preparing') })
  await getDatabase()
  const extension = file.name.split('.').pop()?.toLowerCase()
  
  if (extension === 'csv') {
    onProgress({ value: 25, message: t('importing.readingCsv') })
    const tableName = uniqueTableName(file.name)
    await loadCsvTable(tableName, await file.text())
    onProgress({ value: 75, message: t('importing.profiling') })
    const dataset = await profileTable(tableName, file.name)
    onProgress({ value: 100, message: t('importing.ready') })
    return [dataset]
  }

  if (extension === 'parquet') {
    onProgress({ value: 25, message: t('importing.readingParquet') })
    const tableName = uniqueTableName(file.name)
    await loadParquetTable(tableName, await file.arrayBuffer())
    onProgress({ value: 75, message: t('importing.profiling') })
    const dataset = await profileTable(tableName, file.name)
    onProgress({ value: 100, message: t('importing.ready') })
    return [dataset]
  }

  if (extension === 'json') {
    onProgress({ value: 25, message: t('importing.readingJson') })
    const tableName = uniqueTableName(file.name)
    await loadJsonTable(tableName, await file.text())
    onProgress({ value: 75, message: t('importing.profiling') })
    const dataset = await profileTable(tableName, file.name)
    onProgress({ value: 100, message: t('importing.ready') })
    return [dataset]
  }
  
  if (extension !== 'xlsx' && extension !== 'xls') {
    throw new Error('UNSUPPORTED_FORMAT')
  }
  
  onProgress({ value: 20, message: t('importing.readingExcel') })
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
  const datasets: Dataset[] = []
  for (const [index, sheetName] of workbook.SheetNames.entries()) {
    onProgress({ value: 25 + Math.round((index / workbook.SheetNames.length) * 55), message: t('importing.preparingSheet', { name: sheetName }) })
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: false })
    if (rows.length < 2) continue
    const tableName = uniqueTableName(file.name, sheetName)
    await loadCsvTable(tableName, asCsv(rows))
    datasets.push(await profileTable(tableName, sheetName))
  }
  if (!datasets.length) throw new Error('EMPTY_DOCUMENT')
  onProgress({ value: 100, message: t('importing.allReady') })
  return datasets
}

export async function importGoogleSheet(
  url: string, 
  t: (key: string, options?: any) => string,
  onProgress: (progress: ImportProgress) => void
): Promise<Dataset[]> {
  let downloadUrl = ''
  let cleanUrl = url.trim()

  // Replace pubhtml with pub for published sheets to fetch raw xlsx data
  if (cleanUrl.includes('/pubhtml')) {
    cleanUrl = cleanUrl.replace('/pubhtml', '/pub')
  }

  if (cleanUrl.includes('/pub')) {
    // Web Published Sheets
    const parsedUrl = new URL(cleanUrl)
    parsedUrl.searchParams.set('output', 'xlsx')
    downloadUrl = parsedUrl.toString()
  } else {
    // Standard Share Sheets
    const matches = cleanUrl.match(/\/d\/([a-zA-Z0-9-_]+)/)
    if (!matches) {
      throw new Error('INVALID_URL')
    }
    const spreadsheetId = matches[1]
    downloadUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`
  }
  
  onProgress({ value: 10, message: t('gsheet.connecting') })
  await getDatabase()
  
  const response = await fetch(downloadUrl)
  if (!response.ok) {
    throw new Error('FETCH_FAILED')
  }
  
  onProgress({ value: 30, message: t('gsheet.downloading') })
  const buffer = await response.arrayBuffer()
  
  onProgress({ value: 50, message: t('gsheet.parsing') })
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const datasets: Dataset[] = []
  
  for (const [index, sheetName] of workbook.SheetNames.entries()) {
    onProgress({
      value: 55 + Math.round((index / workbook.SheetNames.length) * 35),
      message: t('gsheet.importing', { name: sheetName }),
    })
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: false })
    if (rows.length < 2) continue
    const tableName = uniqueTableName(`gsheet_${sheetName}`)
    await loadCsvTable(tableName, asCsv(rows))
    datasets.push(await profileTable(tableName, sheetName))
  }
  
  if (!datasets.length) {
    throw new Error('EMPTY_DOCUMENT')
  }
  
  onProgress({ value: 100, message: t('importing.allReady') })
  return datasets
}
export async function dropTable(tableName: string): Promise<void> {
  const db = await getDatabase()
  const connection = await db.connect()
  try {
    await connection.query(`DROP TABLE IF EXISTS ${sqlName(tableName)}`)
  } finally {
    await connection.close()
  }
}

export { uniqueTableName, asCsv, loadCsvTable, profileTable }

