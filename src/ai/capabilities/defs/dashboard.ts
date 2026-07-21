// ai/capabilities/defs/dashboard.ts
// Pano (dashboard) yönetimi yetenekleri.

import type { Capability } from '../types'
import type { Dashboard } from '../../../types'
import { buildDefaultInstanceWidgets } from '../../../components/dashboard/defaultWidgets'
import i18n from '../../../i18n'

function newDashboard(name: string, linkedTableNames: string[]): Dashboard {
  return {
    id: 'dash_' + crypto.randomUUID(),
    name,
    linkedTableNames,
    activeFilters: {},
    filters: [],
    relationships: [],
    dbBarX: '', dbBarY: '', dbBarType: 'bar',
    dbLineX: '', dbLineY: '', dbLineType: 'line',
  }
}

const listDashboards: Capability = {
  id: 'dashboard.list',
  title: 'List dashboards',
  description: 'Returns all existing dashboards and which files they are linked to.',
  keywords: ['dashboard', 'panel', 'list', 'boards'],
  category: 'dashboard',
  sideEffect: false,
  argsSchema: { type: 'object', properties: {} },
  async run(_args, ctx) {
    const dashboards = ctx.bridge.getDashboards()
    const activeId = ctx.bridge.getActiveDashboardId()
    return {
      success: true,
      message: i18n.t('ai.cap.dashCount', { count: dashboards.length }),
      data: dashboards.map(d => ({ id: d.id, name: d.name, linkedTableNames: d.linkedTableNames, active: d.id === activeId })),
    }
  },
}

const createDashboard: Capability = {
  id: 'dashboard.create',
  title: 'Create dashboard',
  description: 'Creates a new dashboard with the given name and linked files, and makes it active.',
  keywords: ['dashboard', 'create', 'new', 'add', 'panel', 'make'],
  category: 'dashboard',
  sideEffect: true,
  argsSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Dashboard name' },
      tableNames: { type: 'array', items: { type: 'string' }, description: 'Table names to link (defaults to first dataset)' },
    },
    required: ['name'],
  },
  async run(args, ctx) {
    const datasets = ctx.bridge.getDatasets()
    if (datasets.length === 0) return { success: false, message: i18n.t('ai.cap.noData'), error: 'no_data' }
    let tables: string[] = Array.isArray(args?.tableNames) ? args.tableNames : []
    // İsimle verilmiş olabilir → tableName'e çevir
    tables = tables
      .map((t: string) => datasets.find(d => d.tableName === t || d.name === t)?.tableName)
      .filter((x): x is string => !!x)
    if (tables.length === 0) tables = [datasets[0].tableName]

    const dash = newDashboard(String(args.name), tables)
    // Yeni model: hazır instance widget'larıyla (KPI/bar/line/tablo) gel.
    const primary = datasets.find(d => d.tableName === tables[0])
    if (primary) {
      const { widgets, rglLayout } = buildDefaultInstanceWidgets(primary)
      dash.instancesOnly = true
      dash.widgets = widgets
      dash.rglLayout = rglLayout
    }
    ctx.bridge.setDashboards(prev => [...prev, dash])
    ctx.bridge.setActiveDashboardId(dash.id)
    return { success: true, message: i18n.t('ai.cap.dashCreated', { name: dash.name }), data: { id: dash.id } }
  },
}

const setActiveDashboard: Capability = {
  id: 'dashboard.setActive',
  title: 'Set active dashboard',
  description: 'Makes a dashboard active by its id (or name).',
  keywords: ['dashboard', 'active', 'select', 'switch', 'open', 'set'],
  category: 'dashboard',
  sideEffect: true,
  argsSchema: {
    type: 'object',
    properties: { dashboardId: { type: 'string', description: 'Dashboard id or name' } },
    required: ['dashboardId'],
  },
  async run(args, ctx) {
    const dashboards = ctx.bridge.getDashboards()
    const dash = dashboards.find(d => d.id === args.dashboardId || d.name === args.dashboardId)
    if (!dash) return { success: false, message: i18n.t('ai.cap.dashNotFound'), error: 'dashboard_not_found' }
    ctx.bridge.setActiveDashboardId(dash.id)
    return { success: true, message: i18n.t('ai.cap.dashActive', { name: dash.name }), data: { id: dash.id } }
  },
}

const linkTables: Capability = {
  id: 'dashboard.linkTables',
  title: 'Link files to dashboard',
  description: 'Links one or more data files (tables) to the active dashboard. Needed for multi-file analysis.',
  keywords: ['link', 'file', 'table', 'attach', 'add', 'join', 'multi'],
  category: 'dashboard',
  sideEffect: true,
  argsSchema: {
    type: 'object',
    properties: { tableNames: { type: 'array', items: { type: 'string' }, description: 'Table names to link' } },
    required: ['tableNames'],
  },
  async run(args, ctx) {
    const activeId = ctx.bridge.getActiveDashboardId()
    if (!activeId) return { success: false, message: i18n.t('ai.cap.noActiveDashboard'), error: 'no_active_dashboard' }
    const datasets = ctx.bridge.getDatasets()
    const toLink = (args?.tableNames as string[] || [])
      .map(t => datasets.find(d => d.tableName === t || d.name === t)?.tableName)
      .filter((x): x is string => !!x)
    ctx.bridge.setDashboards(prev => prev.map(d =>
      d.id === activeId
        ? { ...d, linkedTableNames: Array.from(new Set([...d.linkedTableNames, ...toLink])) }
        : d
    ))
    return { success: true, message: i18n.t('ai.cap.filesLinked', { count: toLink.length }), data: { linked: toLink } }
  },
}

export const dashboardCapabilities: Capability[] = [
  listDashboards,
  createDashboard,
  setActiveDashboard,
  linkTables,
]
