import * as duckdb from '@duckdb/duckdb-wasm'
import duckdbWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'
import duckdbWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'
import duckdbEHWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import duckdbEHWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'

const bundles: duckdb.DuckDBBundles = {
  mvp: {
    mainModule: duckdbWasm,
    mainWorker: duckdbWorker,
  },
  eh: {
    mainModule: duckdbEHWasm,
    mainWorker: duckdbEHWorker,
  },
}

let db: duckdb.AsyncDuckDB | null = null
let connection: duckdb.AsyncDuckDBConnection | null = null
let initPromise: Promise<duckdb.AsyncDuckDB> | null = null

/**
 * Initializes and returns the cached DuckDB instance.
 * Ensures initialization happens only once.
 */
export async function getDuckDB(): Promise<duckdb.AsyncDuckDB> {
  if (db) return db
  if (initPromise) return initPromise

  initPromise = (async () => {
    const bundle = await duckdb.selectBundle(bundles)
    const worker = new Worker(bundle.mainWorker!)
    const logger = new duckdb.ConsoleLogger()
    const instance = new duckdb.AsyncDuckDB(logger, worker)
    await instance.instantiate(bundle.mainModule, bundle.pthreadWorker)
    db = instance
    return instance
  })()

  return initPromise
}

/**
 * Returns a cached connection to the database.
 */
export async function getDatabaseConnection(): Promise<duckdb.AsyncDuckDBConnection> {
  if (connection) return connection
  const ddb = await getDuckDB()
  connection = await ddb.connect()
  return connection
}

/**
 * Registers a CSV string and imports it into a DuckDB table.
 */
export async function loadCsvToTable(tableName: string, csvContent: string): Promise<void> {
  const ddb = await getDuckDB()
  const conn = await getDatabaseConnection()
  
  // Clean special characters from table name
  const safeTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '_')
  const fileName = `${safeTableName}.csv`
  
  // Register the text file in DuckDB's virtual file system
  await ddb.registerFileText(fileName, csvContent)
  
  // Import the CSV file into a table using DuckDB's auto-csv reader
  await conn.query(`CREATE OR REPLACE TABLE "${safeTableName}" AS SELECT * FROM read_csv_auto('${fileName}')`)
}

/**
 * Runs a query and returns the rows as standard JS objects.
 */
export async function runQuery(sql: string): Promise<Record<string, any>[]> {
  const conn = await getDatabaseConnection()
  const result = await conn.query(sql)
  
  // Convert Arrow table results to standard array of objects
  return result.toArray().map((row) => {
    // some arrow versions/environments might have row.toJSON()
    if (typeof row.toJSON === 'function') {
      return row.toJSON()
    }
    // fallback to manual conversion if needed
    const obj: Record<string, any> = {}
    for (const [key, val] of Object.entries(row)) {
      // Convert BigInts to numbers or strings to avoid serialization issues
      if (typeof val === 'bigint') {
        obj[key] = Number(val)
      } else {
        obj[key] = val
      }
    }
    return obj
  })
}
