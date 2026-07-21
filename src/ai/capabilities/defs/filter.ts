// ai/capabilities/defs/filter.ts
// Çapraz filtre yetenekleri (structured ActiveFilter modeli).

import type { Capability } from '../types'
import type { ActiveFilter, Dashboard } from '../../../types'
import type { AppBridge } from '../../appBridge'
import i18n from '../../../i18n'

function updateActive(bridge: AppBridge, patch: (d: Dashboard) => Dashboard): boolean {
  const activeId = bridge.getActiveDashboardId()
  if (!activeId) return false
  bridge.setDashboards(prev => prev.map(d => (d.id === activeId ? patch(d) : d)))
  return true
}

function currentFilters(d: Dashboard): ActiveFilter[] {
  if (d.filters && d.filters.length > 0) return d.filters
  return Object.entries(d.activeFilters || {}).map(([column, value]) => ({
    tableName: d.linkedTableNames[0] || '',
    column,
    value: String(value),
  }))
}

const applyFilter: Capability = {
  id: 'filter.apply',
  title: 'Apply cross filter',
  description: 'Applies a cross filter (table + column + value) to the active dashboard. Replaces the previous value of the same column. Propagates to other tables via relationships.',
  keywords: ['filter', 'cross', 'select', 'narrow', 'where', 'apply'],
  category: 'filter',
  sideEffect: true,
  argsSchema: {
    type: 'object',
    properties: {
      tableName: { type: 'string', description: 'Table the filter belongs to (defaults to first linked table)' },
      column: { type: 'string', description: 'Column to filter' },
      value: { type: 'string', description: 'Filter value' },
    },
    required: ['column', 'value'],
  },
  async run(args, ctx) {
    const activeId = ctx.bridge.getActiveDashboardId()
    if (!activeId) return { success: false, message: i18n.t('ai.cap.noActiveDashboard'), error: 'no_active_dashboard' }
    const dash = ctx.bridge.getDashboards().find(d => d.id === activeId)!
    const tableName = args?.tableName ? String(args.tableName) : (dash.linkedTableNames[0] || '')
    const column = String(args.column)
    const value = String(args.value)

    updateActive(ctx.bridge, d => {
      const cur = currentFilters(d).filter(f => !(f.tableName === tableName && f.column === column))
      const next = [...cur, { tableName, column, value }]
      const legacy: Record<string, string> = {}
      next.forEach(f => { legacy[f.column] = f.value })
      return { ...d, filters: next, activeFilters: legacy }
    })
    return { success: true, message: i18n.t('ai.cap.filterApplied', { column, value }) }
  },
}

const clearFilters: Capability = {
  id: 'filter.clear',
  title: 'Clear filters',
  description: 'Removes all cross filters on the active dashboard.',
  keywords: ['filter', 'clear', 'reset', 'remove'],
  category: 'filter',
  sideEffect: true,
  argsSchema: { type: 'object', properties: {} },
  async run(_args, ctx) {
    const ok = updateActive(ctx.bridge, d => ({ ...d, filters: [], activeFilters: {} }))
    return ok ? { success: true, message: i18n.t('ai.cap.filtersCleared') } : { success: false, message: i18n.t('ai.cap.noActiveDashboard'), error: 'no_active_dashboard' }
  },
}

const listFilters: Capability = {
  id: 'filter.list',
  title: 'List active filters',
  description: 'Returns the cross filters (table, column, value) on the active dashboard.',
  keywords: ['filter', 'list', 'active'],
  category: 'filter',
  sideEffect: false,
  argsSchema: { type: 'object', properties: {} },
  async run(_args, ctx) {
    const dash = ctx.bridge.getDashboards().find(d => d.id === ctx.bridge.getActiveDashboardId())
    if (!dash) return { success: false, message: i18n.t('ai.cap.noActiveDashboard'), error: 'no_active_dashboard' }
    return { success: true, message: i18n.t('ai.cap.activeFilters'), data: currentFilters(dash) }
  },
}

export const filterCapabilities: Capability[] = [applyFilter, clearFilters, listFilters]
