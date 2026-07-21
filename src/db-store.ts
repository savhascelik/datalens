import type { Dataset } from './types'

export interface SavedDataset {
  id: string; // matches tableName
  fileName: string;
  tableName: string;
  totalRows: number;
  headers: string[];
  columns: any[];
  rows: string[][];
  parquetBytes: Uint8Array;
  uploadedAt: string;
}

const DB_NAME = 'datalens_workspace_db'
const DB_VERSION = 1
const STORE_NAME = 'datasets'

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
  })
}

export async function saveDatasetToLocal(dataset: Dataset, parquetBytes: Uint8Array): Promise<void> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    const saved: SavedDataset = {
      id: dataset.tableName,
      fileName: dataset.name,
      tableName: dataset.tableName,
      totalRows: dataset.totalRows,
      headers: dataset.headers,
      columns: dataset.columns,
      rows: dataset.rows,
      parquetBytes,
      uploadedAt: new Date().toISOString()
    }

    const request = store.put(saved)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

export async function getAllLocalDatasets(): Promise<SavedDataset[]> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.getAll()

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result || [])
  })
}

export async function deleteLocalDataset(id: string): Promise<void> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.delete(id)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}
