// ai/capabilities/defs/widget.ts
// Widget yönetimi: ekle/çıkar/geri getir, grafik kolonları, KPI kartları.
// Not: mevcut model tek dashboard'da sabit widget slotları (kpis/chartBar/chartLine/table)
// + hiddenWidgets ile gizleme kullanıyor. AI de aynı modeli kullanır.

import type { Capability } from '../types'
import type { Dashboard, KpiCardConfig, WidgetInstance } from '../../../types'
import type { AppBridge } from '../../appBridge'
import i18n from '../../../i18n'

const INSTANCE_TYPES = ['kpi', 'bar', 'line', 'pie', 'scatter', 'treemap', 'funnel', 'radar', 'table', 'search', 'slicer', 'aiInsight']
const CHART_KINDS = ['bar', 'line', 'pie', 'scatter', 'treemap', 'funnel', 'radar']
const newWidgetId = () => 'w_' + (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2))

const WIDGET_IDS = ['kpis', 'chartBar', 'chartLine', 'table'] as const

function updateActive(bridge: AppBridge, patch: (d: Dashboard) => Dashboard): boolean {
  const activeId = bridge.getActiveDashboardId()
  if (!activeId) return false
  bridge.setDashboards(prev => prev.map(d => (d.id === activeId ? patch(d) : d)))
  return true
}

const listWidgets: Capability = {
  id: 'widget.list',
  title: 'List widgets',
  description: 'Lists visible and hidden widgets on the active dashboard. Widget ids: kpis, chartBar, chartLine, table.',
  keywords: ['widget', 'list', 'chart', 'card', 'show'],
  category: 'widget',
  sideEffect: false,
  argsSchema: { type: 'object', properties: {} },
  async run(_args, ctx) {
    const d = ctx.bridge.getDashboards().find(x => x.id === ctx.bridge.getActiveDashboardId())
    if (!d) return { success: false, message: i18n.t('ai.cap.noActiveDashboard'), error: 'no_active_dashboard' }
    const hidden = d.hiddenWidgets ?? []
    return {
      success: true,
      message: i18n.t('ai.cap.widgetStatus'),
      data: {
        all: WIDGET_IDS,
        visible: WIDGET_IDS.filter(id => !hidden.includes(id)),
        hidden,
        instances: (d.widgets ?? []).map(w => ({ id: w.id, type: w.type, sourceTable: w.sourceTable, config: w.config })),
      },
    }
  },
}

const removeWidget: Capability = {
  id: 'widget.remove',
  title: 'Remove widget',
  description: 'Removes (hides) a widget from the active dashboard. widgetId: kpis | chartBar | chartLine | table.',
  keywords: ['widget', 'remove', 'delete', 'hide'],
  category: 'widget',
  sideEffect: true,
  argsSchema: {
    type: 'object',
    properties: { widgetId: { type: 'string', enum: [...WIDGET_IDS], description: 'Widget to remove' } },
    required: ['widgetId'],
  },
  async run(args, ctx) {
    const id = String(args?.widgetId)
    if (!WIDGET_IDS.includes(id as any)) return { success: false, message: i18n.t('ai.cap.invalidWidget', { id }), error: 'invalid_widget' }
    const ok = updateActive(ctx.bridge, d => ({ ...d, hiddenWidgets: Array.from(new Set([...(d.hiddenWidgets ?? []), id])) }))
    return ok ? { success: true, message: i18n.t('ai.cap.widgetRemoved', { id }) } : { success: false, message: i18n.t('ai.cap.noActiveDashboard'), error: 'no_active_dashboard' }
  },
}

const addWidget: Capability = {
  id: 'widget.add',
  title: 'Add widget (restore)',
  description: 'Shows a previously hidden widget on the active dashboard again. widgetId: kpis | chartBar | chartLine | table.',
  keywords: ['widget', 'add', 'show', 'restore', 'chart'],
  category: 'widget',
  sideEffect: true,
  argsSchema: {
    type: 'object',
    properties: { widgetId: { type: 'string', enum: [...WIDGET_IDS], description: 'Widget to show' } },
    required: ['widgetId'],
  },
  async run(args, ctx) {
    const id = String(args?.widgetId)
    if (!WIDGET_IDS.includes(id as any)) return { success: false, message: i18n.t('ai.cap.invalidWidget', { id }), error: 'invalid_widget' }
    const ok = updateActive(ctx.bridge, d => ({ ...d, hiddenWidgets: (d.hiddenWidgets ?? []).filter(w => w !== id) }))
    return ok ? { success: true, message: i18n.t('ai.cap.widgetShown', { id }) } : { success: false, message: i18n.t('ai.cap.noActiveDashboard'), error: 'no_active_dashboard' }
  },
}

const setChartColumns: Capability = {
  id: 'widget.setChartColumns',
  title: 'Set chart columns',
  description: 'Sets the X (category) and Y (numeric) columns and type of the bar or line chart. slot: bar | line, chartType: bar | line | pie | scatter | treemap | funnel | radar. If Y is empty, row count is used.',
  keywords: ['chart', 'graph', 'column', 'axis', 'x', 'y', 'bar', 'line', 'pie', 'scatter', 'treemap', 'funnel', 'radar', 'type'],
  category: 'widget',
  sideEffect: true,
  argsSchema: {
    type: 'object',
    properties: {
      slot: { type: 'string', enum: ['bar', 'line'], description: 'Which chart slot' },
      xColumn: { type: 'string', description: 'X axis (category) column' },
      yColumn: { type: 'string', description: 'Y axis (numeric) column; row count if empty' },
      chartType: { type: 'string', enum: ['bar', 'line', 'pie', 'scatter', 'treemap', 'funnel', 'radar'], description: 'Chart type' },
    },
    required: ['slot', 'xColumn'],
  },
  async run(args, ctx) {
    const slot = args?.slot === 'line' ? 'line' : 'bar'
    const patch: Partial<Dashboard> = slot === 'bar'
      ? { dbBarX: String(args.xColumn), dbBarY: args?.yColumn ? String(args.yColumn) : '', ...(args?.chartType ? { dbBarType: args.chartType } : {}) }
      : { dbLineX: String(args.xColumn), dbLineY: args?.yColumn ? String(args.yColumn) : '', ...(args?.chartType ? { dbLineType: args.chartType } : {}) }
    const ok = updateActive(ctx.bridge, d => ({ ...d, ...patch }))
    return ok ? { success: true, message: i18n.t('ai.cap.chartUpdated', { slot }), data: patch } : { success: false, message: i18n.t('ai.cap.noActiveDashboard'), error: 'no_active_dashboard' }
  },
}

const addKpiCard: Capability = {
  id: 'kpi.addCard',
  title: 'Add KPI card',
  description: 'Adds a configurable KPI card to the active dashboard. aggregation: count | count-distinct | sum | avg | min | max. A column is required except for count.',
  keywords: ['kpi', 'card', 'metric', 'summary', 'total', 'average', 'count', 'sum'],
  category: 'widget',
  sideEffect: true,
  argsSchema: {
    type: 'object',
    properties: {
      label: { type: 'string', description: 'Card label (auto if empty)' },
      column: { type: 'string', description: 'Column (can be empty for count)' },
      aggregation: { type: 'string', enum: ['count', 'count-distinct', 'sum', 'avg', 'min', 'max'], description: 'Aggregation type' },
      format: { type: 'string', enum: ['number', 'currency', 'compact', 'percent'], description: 'Display format' },
    },
    required: ['aggregation'],
  },
  async run(args, ctx) {
    const card: KpiCardConfig = {
      id: 'kpi_' + crypto.randomUUID(),
      label: args?.label ? String(args.label) : '',
      column: args?.column ? String(args.column) : '',
      aggregation: (args?.aggregation ?? 'count'),
      format: (args?.format ?? 'number'),
    }
    const ok = updateActive(ctx.bridge, d => ({ ...d, kpiCards: [...(d.kpiCards ?? []), card] }))
    return ok ? { success: true, message: i18n.t('ai.cap.kpiAdded'), data: { id: card.id } } : { success: false, message: i18n.t('ai.cap.noActiveDashboard'), error: 'no_active_dashboard' }
  },
}

const removeKpiCard: Capability = {
  id: 'kpi.removeCard',
  title: 'Remove KPI card',
  description: 'Removes the KPI card with the given id from the active dashboard.',
  keywords: ['kpi', 'card', 'remove', 'delete'],
  category: 'widget',
  sideEffect: true,
  argsSchema: {
    type: 'object',
    properties: { cardId: { type: 'string', description: 'KPI card id' } },
    required: ['cardId'],
  },
  async run(args, ctx) {
    const ok = updateActive(ctx.bridge, d => ({ ...d, kpiCards: (d.kpiCards ?? []).filter(c => c.id !== args.cardId) }))
    return ok ? { success: true, message: i18n.t('ai.cap.kpiRemoved') } : { success: false, message: i18n.t('ai.cap.noActiveDashboard'), error: 'no_active_dashboard' }
  },
}

// --- Birleşik (instance) widget yetenekleri: dashboard.widgets[] üzerinde ---

const createWidget: Capability = {
  id: 'widget.create',
  title: 'Create a widget',
  description: 'Creates a new widget on the active dashboard. type: kpi | bar | line | pie | scatter | treemap | funnel | radar | table | search | slicer | aiInsight. Charts need xColumn (+ optional yColumn); kpi needs column + aggregation; search/slicer need column; aiInsight needs a natural-language prompt (it generates a filter-aware HTML card).',
  keywords: ['widget', 'create', 'add', 'new', 'kpi', 'chart', 'bar', 'search', 'slicer', 'table', 'insight', 'html', 'card'],
  category: 'widget',
  sideEffect: true,
  argsSchema: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: [...INSTANCE_TYPES], description: 'Widget type' },
      tableName: { type: 'string', description: 'Source table (defaults to first linked table)' },
      xColumn: { type: 'string', description: 'Category column (charts)' },
      yColumn: { type: 'string', description: 'Numeric column (charts); row count if empty' },
      column: { type: 'string', description: 'Column (kpi/search/slicer)' },
      aggregation: { type: 'string', enum: ['count', 'count-distinct', 'sum', 'avg', 'min', 'max'], description: 'Aggregation (kpi)' },
      format: { type: 'string', enum: ['number', 'currency', 'compact', 'percent'], description: 'Display format (kpi)' },
      prompt: { type: 'string', description: 'Natural-language design prompt (aiInsight)' },
      title: { type: 'string', description: 'Widget title (optional)' },
    },
    required: ['type'],
  },
  async run(args, ctx) {
    const type = String(args.type)
    if (!INSTANCE_TYPES.includes(type)) return { success: false, message: i18n.t('ai.cap.invalidWidgetType', { type }), error: 'invalid_type' }
    const dash = ctx.bridge.getDashboards().find(d => d.id === ctx.bridge.getActiveDashboardId())
    if (!dash) return { success: false, message: i18n.t('ai.cap.noActiveDashboard'), error: 'no_active_dashboard' }
    const datasets = ctx.bridge.getDatasets()
    const tableName = args?.tableName ? String(args.tableName) : (dash.linkedTableNames[0] || datasets[0]?.tableName)
    if (!tableName) return { success: false, message: i18n.t('ai.cap.noData'), error: 'no_data' }

    const config: WidgetInstance['config'] = { title: args?.title ? String(args.title) : undefined }
    if (CHART_KINDS.includes(type)) {
      config.xColumn = args?.xColumn ? String(args.xColumn) : undefined
      config.yColumn = args?.yColumn ? String(args.yColumn) : undefined
      config.aggregation = 'sum'
    } else if (type === 'kpi') {
      config.column = args?.column ? String(args.column) : ''
      config.aggregation = (args?.aggregation ?? 'count') as any
      config.format = (args?.format ?? 'number') as any
    } else if (type === 'search' || type === 'slicer') {
      config.column = args?.column ? String(args.column) : ''
    } else if (type === 'aiInsight') {
      // Serbest AI içgörü kartı: prompt'tan htmlTemplate + queries lazy üretilir.
      config.prompt = args?.prompt ? String(args.prompt) : ''
    }

    const instance: WidgetInstance = { id: newWidgetId(), type, sourceTable: tableName, config }
    updateActive(ctx.bridge, d => ({ ...d, widgets: [...(d.widgets ?? []), instance] }))
    return { success: true, message: i18n.t('ai.cap.widgetCreated', { type }), data: { id: instance.id } }
  },
}

const configureWidget: Capability = {
  id: 'widget.configure',
  title: 'Configure a widget',
  description: 'Updates an existing widget (by id) on the active dashboard: change its type and/or columns/aggregation/title.',
  keywords: ['widget', 'configure', 'update', 'edit', 'change', 'column', 'type'],
  category: 'widget',
  sideEffect: true,
  argsSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Widget id (from widget.list)' },
      type: { type: 'string', enum: [...INSTANCE_TYPES], description: 'New widget type' },
      xColumn: { type: 'string' },
      yColumn: { type: 'string' },
      column: { type: 'string' },
      aggregation: { type: 'string', enum: ['count', 'count-distinct', 'sum', 'avg', 'min', 'max'] },
      format: { type: 'string', enum: ['number', 'currency', 'compact', 'percent'] },
      title: { type: 'string' },
    },
    required: ['id'],
  },
  async run(args, ctx) {
    const id = String(args.id)
    const dash = ctx.bridge.getDashboards().find(d => d.id === ctx.bridge.getActiveDashboardId())
    if (!dash) return { success: false, message: i18n.t('ai.cap.noActiveDashboard'), error: 'no_active_dashboard' }
    const w = (dash.widgets ?? []).find(x => x.id === id)
    if (!w) return { success: false, message: i18n.t('ai.cap.widgetNotFound'), error: 'widget_not_found' }
    const patch: any = {}
    for (const k of ['xColumn', 'yColumn', 'column', 'aggregation', 'format', 'title'] as const) {
      if (args?.[k] !== undefined) patch[k] = args[k]
    }
    updateActive(ctx.bridge, d => ({
      ...d,
      widgets: (d.widgets ?? []).map(x => x.id === id ? { ...x, type: args?.type ? String(args.type) : x.type, config: { ...x.config, ...patch } } : x),
    }))
    return { success: true, message: i18n.t('ai.cap.widgetConfigured') }
  },
}

const deleteWidget: Capability = {
  id: 'widget.delete',
  title: 'Delete a widget',
  description: 'Removes a widget (by id) from the active dashboard. Use widget.list to find ids.',
  keywords: ['widget', 'delete', 'remove'],
  category: 'widget',
  sideEffect: true,
  argsSchema: {
    type: 'object',
    properties: { id: { type: 'string', description: 'Widget id' } },
    required: ['id'],
  },
  async run(args, ctx) {
    const id = String(args.id)
    const dash = ctx.bridge.getDashboards().find(d => d.id === ctx.bridge.getActiveDashboardId())
    if (!dash) return { success: false, message: i18n.t('ai.cap.noActiveDashboard'), error: 'no_active_dashboard' }
    const removed = (dash.widgets ?? []).find(x => x.id === id)
    if (!removed) return { success: false, message: i18n.t('ai.cap.widgetNotFound'), error: 'widget_not_found' }
    // Kontrol widget'ı (search/slicer) siliniyorsa uyguladığı öksüz çapraz filtreyi de
    // temizle; aksi halde filtre panoda kalır ve onu temizleyecek bir UI kalmaz (BUG-2).
    const isControl = removed.type === 'search' || removed.type === 'slicer'
    updateActive(ctx.bridge, d => {
      const widgets = (d.widgets ?? []).filter(x => x.id !== id)
      if (!isControl) return { ...d, widgets }
      const nextFilters = (d.filters ?? []).filter(f => !(f.tableName === removed.sourceTable && f.column === removed.config.column))
      const legacy: Record<string, string> = {}
      nextFilters.forEach(f => { legacy[f.column] = f.value })
      return { ...d, widgets, filters: nextFilters, activeFilters: legacy }
    })
    return { success: true, message: i18n.t('ai.cap.widgetDeleted') }
  },
}

export const widgetCapabilities: Capability[] = [
  listWidgets,
  addWidget,
  removeWidget,
  setChartColumns,
  addKpiCard,
  removeKpiCard,
  createWidget,
  configureWidget,
  deleteWidget,
]
