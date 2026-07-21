// ai/capabilities/defs/report.ts
// Rapor yetenekleri: AI raporlama panelini de doğal dille yönetebilir.
// Report/ReportBlock modeli (types.ts) üzerine kurulur; grafik blokları runSafeQuery
// (salt-okunur) ile veri çeker.

import type { Capability } from '../types'
import type { Report, ReportBlock, ChartKind } from '../../../types'
import type { AppBridge } from '../../appBridge'
import { runSafeQuery } from '../../../data-engine'
import { fetchInsightVariables, type InsightQuery } from '../../../services/widgetData'
import { renderTemplate } from '../../../utils/templateEngine'
import i18n from '../../../i18n'

const CHART_KINDS: ChartKind[] = ['bar', 'line', 'pie', 'scatter', 'treemap', 'funnel', 'radar']

function newId(prefix: string): string {
  return `${prefix}_` + (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2))
}

// Hedef raporu bulur (verilen id ya da aktif rapor).
function resolveReport(bridge: AppBridge, reportId?: string): Report | undefined {
  const id = reportId || bridge.getActiveReportId()
  if (!id) return undefined
  return bridge.getReports().find(r => r.id === id)
}

// Hedef raporu belirler. Öncelik: reportId → aktif → en son rapor. Hiç rapor yoksa
// yalnızca reportName verildiyse oluşturur; verilmediyse hata döner (çöp/yanlış-isim
// rapor üretmemek için). Böylece model ya isim verir ya da kullanıcıya sorar.
function targetReport(bridge: AppBridge, args?: { reportId?: string; reportName?: string }): { report?: Report; error?: string } {
  const existing = resolveReport(bridge, args?.reportId)
  if (existing) return { report: existing }
  const reports = bridge.getReports()
  if (!args?.reportId && reports.length > 0) {
    const last = reports[reports.length - 1]
    bridge.setActiveReportId(last.id)
    return { report: last }
  }
  if (args?.reportName) {
    const report: Report = {
      id: newId('report'),
      name: String(args.reportName),
      blocks: [],
      createdAt: new Date().toISOString(),
    }
    bridge.setReports(prev => [...prev, report])
    bridge.setActiveReportId(report.id)
    return { report }
  }
  return { error: 'need_report_name' }
}

function appendBlock(bridge: AppBridge, reportId: string, block: ReportBlock): void {
  bridge.setReports(prev => prev.map(r => (r.id === reportId ? { ...r, blocks: [...r.blocks, block] } : r)))
}

const listReports: Capability = {
  id: 'report.list',
  title: 'List reports',
  description: 'Returns all existing reports and their block counts.',
  keywords: ['report', 'reports', 'list'],
  category: 'report',
  sideEffect: false,
  argsSchema: { type: 'object', properties: {} },
  async run(_args, ctx) {
    const reports = ctx.bridge.getReports()
    const activeId = ctx.bridge.getActiveReportId()
    return {
      success: true,
      message: i18n.t('ai.cap.reportCount', { count: reports.length }),
      data: reports.map(r => ({ id: r.id, name: r.name, blocks: r.blocks.length, active: r.id === activeId })),
    }
  },
}

const createReport: Capability = {
  id: 'report.create',
  title: 'Create report',
  description: 'Creates a new report with the given name and makes it active.',
  keywords: ['report', 'create', 'new', 'add'],
  category: 'report',
  sideEffect: true,
  argsSchema: {
    type: 'object',
    properties: { name: { type: 'string', description: 'Report name' } },
    required: ['name'],
  },
  async run(args, ctx) {
    const report: Report = {
      id: newId('report'),
      name: String(args.name),
      blocks: [],
      createdAt: new Date().toISOString(),
    }
    ctx.bridge.setReports(prev => [...prev, report])
    ctx.bridge.setActiveReportId(report.id)
    return { success: true, message: i18n.t('ai.cap.reportCreated', { name: report.name }), data: { id: report.id } }
  },
}

const addTextBlock: Capability = {
  id: 'report.addText',
  title: 'Add text block to report',
  description: 'Adds a markdown text block to a report (executive summary, paragraph, commentary). Generate the text yourself and pass it as markdown. Markdown structure IS rendered: "# / ## / ###" headings and "---" horizontal divider. If no report exists it is created automatically.',
  keywords: ['report', 'text', 'markdown', 'paragraph', 'note', 'summary', 'add', 'write', 'commentary'],
  category: 'report',
  sideEffect: true,
  argsSchema: {
    type: 'object',
    properties: {
      markdown: { type: 'string', description: 'Markdown content (write the paragraph/summary here)' },
      reportId: { type: 'string', description: 'Target report id (defaults to active/most-recent report)' },
      reportName: { type: 'string', description: 'If a new report must be created, use this name' },
    },
    required: ['markdown'],
  },
  async run(args, ctx) {
    const t = targetReport(ctx.bridge, args)
    if (!t.report) return { success: false, message: i18n.t('ai.cap.needReportName'), error: t.error }
    const report = t.report
    const block: ReportBlock = { id: newId('block'), type: 'markdown', content: String(args.markdown) }
    appendBlock(ctx.bridge, report.id, block)
    return { success: true, message: i18n.t('ai.cap.reportTextAdded'), data: { id: block.id, reportId: report.id } }
  },
}

const addChartFromQuery: Capability = {
  id: 'report.addChartFromQuery',
  title: 'Add chart to report (via SQL)',
  description: 'Runs a read-only SQL query and adds a chart block to the active report from its result. The query should return label and value columns.',
  keywords: ['report', 'chart', 'sql', 'add', 'bar', 'pie', 'treemap'],
  category: 'report',
  sideEffect: true,
  argsSchema: {
    type: 'object',
    properties: {
      sql: { type: 'string', description: 'Read-only query starting with SELECT/WITH (label + value columns)' },
      chartType: { type: 'string', enum: [...CHART_KINDS], description: 'Chart type' },
      title: { type: 'string', description: 'Chart title' },
      labelColumn: { type: 'string', description: 'Category column (defaults to first column)' },
      valueColumn: { type: 'string', description: 'Value column (defaults to "value")' },
      reportId: { type: 'string', description: 'Target report id (defaults to active/most-recent report)' },
      reportName: { type: 'string', description: 'If a new report must be created, use this name' },
    },
    required: ['sql'],
  },
  async run(args, ctx) {
    const t = targetReport(ctx.bridge, args)
    if (!t.report) return { success: false, message: i18n.t('ai.cap.needReportName'), error: t.error }
    const report = t.report
    let rows: any[]
    try {
      rows = await runSafeQuery(String(args.sql))
    } catch (err: any) {
      return { success: false, message: i18n.t('ai.cap.sqlError', { msg: err?.message ?? err }), error: 'sql_error' }
    }
    const firstKey = rows[0] ? Object.keys(rows[0])[0] : 'label'
    const xAxisKey = args?.labelColumn ? String(args.labelColumn) : firstKey
    const yAxisKey = args?.valueColumn ? String(args.valueColumn) : 'value'
    const chartType: ChartKind = (CHART_KINDS.includes(args?.chartType) ? args.chartType : 'bar')
    const block: ReportBlock = {
      id: newId('block'),
      type: 'chart',
      chart: { type: chartType, title: args?.title ? String(args.title) : '', data: rows, xAxisKey, yAxisKey },
    }
    appendBlock(ctx.bridge, report.id, block)
    return { success: true, message: i18n.t('ai.cap.reportChartAdded', { count: rows.length }), data: { id: block.id, rowCount: rows.length } }
  },
}

// Sorgu sonucunu markdown tabloya çevirir (rapor markdown blokları zaten render ediliyor).
function rowsToMarkdown(rows: any[], title?: string): string {
  const head = title ? `### ${title}\n\n` : ''
  if (rows.length === 0) return head + '_(no rows)_'
  const cols = Object.keys(rows[0])
  const esc = (v: any) => String(v ?? '').replace(/\|/g, '\\|')
  const header = `| ${cols.join(' | ')} |`
  const sep = `| ${cols.map(() => '---').join(' | ')} |`
  const body = rows.slice(0, 50).map(r => `| ${cols.map(c => esc(r[c])).join(' | ')} |`).join('\n')
  const more = rows.length > 50 ? `\n\n_… ${rows.length - 50} more rows_` : ''
  return head + [header, sep, body].join('\n') + more
}

const addTableFromQuery: Capability = {
  id: 'report.addTableFromQuery',
  title: 'Add table to report (via SQL)',
  description: 'Runs a read-only SQL query and adds its result to the active report as a markdown table (first 50 rows).',
  keywords: ['report', 'table', 'sql', 'add', 'rows', 'result'],
  category: 'report',
  sideEffect: true,
  argsSchema: {
    type: 'object',
    properties: {
      sql: { type: 'string', description: 'Read-only query starting with SELECT/WITH' },
      title: { type: 'string', description: 'Optional heading above the table' },
      reportId: { type: 'string', description: 'Target report id (defaults to active/most-recent report)' },
      reportName: { type: 'string', description: 'If a new report must be created, use this name' },
    },
    required: ['sql'],
  },
  async run(args, ctx) {
    const t = targetReport(ctx.bridge, args)
    if (!t.report) return { success: false, message: i18n.t('ai.cap.needReportName'), error: t.error }
    const report = t.report
    let rows: any[]
    try {
      rows = await runSafeQuery(String(args.sql))
    } catch (err: any) {
      return { success: false, message: i18n.t('ai.cap.sqlError', { msg: err?.message ?? err }), error: 'sql_error' }
    }
    const block: ReportBlock = { id: newId('block'), type: 'markdown', content: rowsToMarkdown(rows, args?.title ? String(args.title) : undefined) }
    appendBlock(ctx.bridge, report.id, block)
    return { success: true, message: i18n.t('ai.cap.reportTableAdded', { count: rows.length }), data: { id: block.id, rowCount: rows.length } }
  },
}

// Rendered HTML'i baskı-dostu, kendi kendine yeten belgeye sarar (Tailwind CDN + tema).
function buildReportInsightDoc(content: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><script src="https://cdn.tailwindcss.com"></script><style>body{margin:0;padding:12px;background:#fff;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}</style></head><body>${content}</body></html>`
}

const addInsightCardBlock: Capability = {
  id: 'report.addInsightCard',
  title: 'Add AI insight card to report (HTML)',
  description: 'Adds a rich, self-designed HTML "insight card" block to a report. You provide an htmlTemplate (using {{placeholders}}, {{#arrays}}, {{value | format}}) and named SQL queries; each query MUST read from a table literally named "data". The queries run against the given table and the rendered HTML is stored as a report snapshot. Great for KPI/summary cards beyond plain charts/tables.',
  keywords: ['report', 'insight', 'html', 'card', 'kpi', 'summary', 'design', 'rich', 'template'],
  category: 'report',
  sideEffect: true,
  argsSchema: {
    type: 'object',
    properties: {
      htmlTemplate: { type: 'string', description: 'HTML fragment with {{variables}} (Tailwind classes available)' },
      queries: { type: 'object', description: 'Map of name -> { sql (reads FROM data), type: "single"|"array" }' },
      title: { type: 'string', description: 'Card title' },
      tableName: { type: 'string', description: 'Source table for the queries (defaults to first dataset)' },
      reportId: { type: 'string', description: 'Target report id (defaults to active/most-recent report)' },
      reportName: { type: 'string', description: 'If a new report must be created, use this name' },
    },
    required: ['htmlTemplate'],
  },
  async run(args, ctx) {
    const t = targetReport(ctx.bridge, args)
    if (!t.report) return { success: false, message: i18n.t('ai.cap.needReportName'), error: t.error }
    const report = t.report
    const datasets = ctx.bridge.getDatasets()
    const tableName = args?.tableName ? String(args.tableName) : (datasets[0]?.tableName || '')
    if (!tableName) return { success: false, message: i18n.t('ai.cap.noData'), error: 'no_data' }

    const queries = (args?.queries && typeof args.queries === 'object' ? args.queries : {}) as Record<string, InsightQuery>
    let html = ''
    try {
      const { variables } = await fetchInsightVariables({ baseTable: tableName, queries, filters: [], relationships: [] })
      html = buildReportInsightDoc(renderTemplate(String(args.htmlTemplate), variables))
    } catch (err: any) {
      return { success: false, message: i18n.t('ai.cap.sqlError', { msg: err?.message ?? err }), error: 'insight_error' }
    }

    const block: ReportBlock = { id: newId('block'), type: 'insight', title: args?.title ? String(args.title) : undefined, html }
    appendBlock(ctx.bridge, report.id, block)
    return { success: true, message: i18n.t('ai.cap.reportInsightAdded', { defaultValue: 'AI içgörü kartı rapora eklendi.' }), data: { id: block.id, reportId: report.id } }
  },
}

export const reportCapabilities: Capability[] = [listReports, createReport, addTextBlock, addChartFromQuery, addTableFromQuery, addInsightCardBlock]
