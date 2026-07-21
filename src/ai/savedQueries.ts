// ai/savedQueries.ts
// Kayıtlı sorgular: kullanıcı/agent bir SQL'i adıyla kaydeder, listeler, yeniden çalıştırır.
// localStorage'da kalıcı; bağımsız ve saf (kolay test).

export interface SavedQuery {
  id: string
  name: string
  sql: string
  createdAt: number
}

const KEY = 'data-lens-saved-queries'

function load(): SavedQuery[] {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function persist(list: SavedQuery[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* yoksay */ }
}

export function listSavedQueries(): SavedQuery[] {
  return load()
}

// Aynı ada sahip varsa üzerine yazar (upsert).
export function saveQuery(name: string, sql: string): SavedQuery {
  const list = load()
  const existing = list.find(q => q.name === name)
  if (existing) {
    existing.sql = sql
    persist(list)
    return existing
  }
  const q: SavedQuery = {
    id: 'q_' + (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)),
    name,
    sql,
    createdAt: Date.now(),
  }
  list.push(q)
  persist(list)
  return q
}

export function getSavedQuery(idOrName: string): SavedQuery | undefined {
  const list = load()
  return list.find(q => q.id === idOrName || q.name === idOrName)
}

export function removeSavedQuery(idOrName: string): boolean {
  const list = load()
  const next = list.filter(q => q.id !== idOrName && q.name !== idOrName)
  if (next.length === list.length) return false
  persist(next)
  return true
}
