// ai/capabilities/defs/relationship.ts
// Tablolar arası ilişki (JOIN) yetenekleri — çoklu dosya çapraz filtre için.

import type { Capability } from '../types'
import type { Dashboard, Relationship } from '../../../types'
import type { AppBridge } from '../../appBridge'
import { detectRelationships } from '../../../dashboard-engine'
import i18n from '../../../i18n'

function updateActive(bridge: AppBridge, patch: (d: Dashboard) => Dashboard): boolean {
  const activeId = bridge.getActiveDashboardId()
  if (!activeId) return false
  bridge.setDashboards(prev => prev.map(d => (d.id === activeId ? patch(d) : d)))
  return true
}

const detect: Capability = {
  id: 'relationship.detect',
  title: 'Auto-detect relationships',
  description: 'Detects likely foreign-key relationships (as suggestions) between files linked to the active dashboard. Needs at least 2 linked files.',
  keywords: ['relationship', 'join', 'foreign key', 'fk', 'detect', 'link'],
  category: 'relationship',
  sideEffect: false,
  argsSchema: { type: 'object', properties: {} },
  async run(_args, ctx) {
    const dash = ctx.bridge.getDashboards().find(d => d.id === ctx.bridge.getActiveDashboardId())
    if (!dash) return { success: false, message: i18n.t('ai.cap.noActiveDashboard'), error: 'no_active_dashboard' }
    const datasets = ctx.bridge.getDatasets().filter(d => dash.linkedTableNames.includes(d.tableName))
    if (datasets.length < 2) return { success: false, message: i18n.t('ai.cap.needTwoTables'), error: 'need_two_tables' }
    const suggestions = await detectRelationships(datasets)
    return { success: true, message: i18n.t('ai.cap.relSuggestions', { count: suggestions.length }), data: suggestions }
  },
}

const addRelationship: Capability = {
  id: 'relationship.add',
  title: 'Add relationship',
  description: 'Manually adds a relationship (JOIN) to the active dashboard: fromTable.fromColumn -> toTable.toColumn.',
  keywords: ['relationship', 'join', 'add', 'link', 'foreign key'],
  category: 'relationship',
  sideEffect: true,
  argsSchema: {
    type: 'object',
    properties: {
      fromTable: { type: 'string', description: 'Source table' },
      fromColumn: { type: 'string', description: 'Source column' },
      toTable: { type: 'string', description: 'Target table' },
      toColumn: { type: 'string', description: 'Target column' },
    },
    required: ['fromTable', 'fromColumn', 'toTable', 'toColumn'],
  },
  async run(args, ctx) {
    const rel: Relationship = {
      id: `rel_${args.fromTable}.${args.fromColumn}->${args.toTable}.${args.toColumn}`,
      fromTable: String(args.fromTable),
      fromColumn: String(args.fromColumn),
      toTable: String(args.toTable),
      toColumn: String(args.toColumn),
      cardinality: 'many-to-one',
      confidence: 1,
      confirmed: true,
    }
    const ok = updateActive(ctx.bridge, d => {
      const exists = (d.relationships ?? []).some(r =>
        r.fromTable === rel.fromTable && r.fromColumn === rel.fromColumn && r.toTable === rel.toTable && r.toColumn === rel.toColumn)
      if (exists) return d
      return { ...d, relationships: [...(d.relationships ?? []), rel] }
    })
    return ok ? { success: true, message: i18n.t('ai.cap.relAdded'), data: { id: rel.id } } : { success: false, message: i18n.t('ai.cap.noActiveDashboard'), error: 'no_active_dashboard' }
  },
}

const listRelationships: Capability = {
  id: 'relationship.list',
  title: 'List relationships',
  description: 'Returns the defined (confirmed) relationships on the active dashboard.',
  keywords: ['relationship', 'join', 'list'],
  category: 'relationship',
  sideEffect: false,
  argsSchema: { type: 'object', properties: {} },
  async run(_args, ctx) {
    const dash = ctx.bridge.getDashboards().find(d => d.id === ctx.bridge.getActiveDashboardId())
    if (!dash) return { success: false, message: i18n.t('ai.cap.noActiveDashboard'), error: 'no_active_dashboard' }
    return { success: true, message: i18n.t('ai.cap.relList', { count: (dash.relationships ?? []).length }), data: dash.relationships ?? [] }
  },
}

export const relationshipCapabilities: Capability[] = [detect, addRelationship, listRelationships]
