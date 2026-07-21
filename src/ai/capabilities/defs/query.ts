// ai/capabilities/defs/query.ts
// Kayıtlı sorgu yetenekleri: kaydet / listele / çalıştır / sil.

import type { Capability } from '../types'
import { listSavedQueries, saveQuery, getSavedQuery, removeSavedQuery } from '../../savedQueries'
import { runSafeQuery } from '../../../data-engine'
import i18n from '../../../i18n'

const save: Capability = {
  id: 'query.save',
  title: 'Save a query',
  description: 'Saves a SQL query under a name for reuse (upserts if the name exists).',
  keywords: ['query', 'save', 'store', 'bookmark', 'sql'],
  category: 'query',
  sideEffect: true,
  argsSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name for the saved query' },
      sql: { type: 'string', description: 'The SQL to save' },
    },
    required: ['name', 'sql'],
  },
  async run(args) {
    const q = saveQuery(String(args.name), String(args.sql))
    return { success: true, message: i18n.t('ai.cap.querySaved', { name: q.name }), data: { id: q.id } }
  },
}

const list: Capability = {
  id: 'query.list',
  title: 'List saved queries',
  description: 'Returns all saved queries (id, name).',
  keywords: ['query', 'list', 'saved', 'bookmarks'],
  category: 'query',
  sideEffect: false,
  argsSchema: { type: 'object', properties: {} },
  async run() {
    const items = listSavedQueries()
    return { success: true, message: i18n.t('ai.cap.queryList', { count: items.length }), data: items.map(q => ({ id: q.id, name: q.name })) }
  },
}

const run: Capability = {
  id: 'query.run',
  title: 'Run a saved query',
  description: 'Runs a saved query by id or name and returns its rows (first 100).',
  keywords: ['query', 'run', 'execute', 'saved', 'rerun'],
  category: 'query',
  sideEffect: false,
  argsSchema: {
    type: 'object',
    properties: { idOrName: { type: 'string', description: 'Saved query id or name' } },
    required: ['idOrName'],
  },
  async run(args) {
    const q = getSavedQuery(String(args.idOrName))
    if (!q) return { success: false, message: i18n.t('ai.cap.queryNotFound'), error: 'query_not_found' }
    try {
      const rows = await runSafeQuery(q.sql)
      const limited = rows.slice(0, 100)
      return {
        success: true,
        message: i18n.t('ai.cap.queryRan', { name: q.name, count: rows.length }),
        data: { rows: limited, rowCount: rows.length, columns: rows[0] ? Object.keys(rows[0]) : [] },
      }
    } catch (err: any) {
      return { success: false, message: i18n.t('ai.cap.sqlError', { msg: err?.message ?? err }), error: 'sql_error' }
    }
  },
}

const remove: Capability = {
  id: 'query.remove',
  title: 'Delete a saved query',
  description: 'Deletes a saved query by id or name.',
  keywords: ['query', 'delete', 'remove', 'saved'],
  category: 'query',
  sideEffect: true,
  argsSchema: {
    type: 'object',
    properties: { idOrName: { type: 'string', description: 'Saved query id or name' } },
    required: ['idOrName'],
  },
  async run(args) {
    const ok = removeSavedQuery(String(args.idOrName))
    return ok
      ? { success: true, message: i18n.t('ai.cap.queryRemoved') }
      : { success: false, message: i18n.t('ai.cap.queryNotFound'), error: 'query_not_found' }
  },
}

export const queryCapabilities: Capability[] = [save, list, run, remove]
