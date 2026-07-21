// ai/capabilities/defs/app.ts
// Uygulama gezinme + bağlam yetenekleri (state-aware agent).
// Ajan kullanıcının hangi ekranda olduğunu bilir ve ekranlar/panolar/raporlar
// arasında kullanıcının gözü önünde geçiş yapabilir.

import type { Capability } from '../types'
import type { WorkspaceTab } from '../../../types'
import i18n from '../../../i18n'

const TABS: WorkspaceTab[] = ['files', 'dashboard', 'sqllab', 'reports']

const navigate: Capability = {
  id: 'app.navigate',
  title: 'Navigate the app',
  description: 'Switches the active screen so the user sees it. view: files | dashboard | sqllab | reports. Optionally open a specific dashboard (dashboardId) or report (reportId).',
  keywords: ['navigate', 'go', 'open', 'switch', 'screen', 'tab', 'view', 'dashboard', 'report', 'show'],
  category: 'app',
  sideEffect: true,
  argsSchema: {
    type: 'object',
    properties: {
      view: { type: 'string', enum: [...TABS], description: 'Target screen' },
      dashboardId: { type: 'string', description: 'Open this dashboard (id or name) and go to the dashboard screen' },
      reportId: { type: 'string', description: 'Open this report (id or name) and go to the reports screen' },
    },
  },
  async run(args, ctx) {
    if (args?.dashboardId) {
      const d = ctx.bridge.getDashboards().find(x => x.id === args.dashboardId || x.name === args.dashboardId)
      if (d) ctx.bridge.setActiveDashboardId(d.id)
      ctx.bridge.setActiveTab('dashboard')
      return { success: true, message: i18n.t('ai.cap.navigated', { view: 'dashboard' }) }
    }
    if (args?.reportId) {
      const r = ctx.bridge.getReports().find(x => x.id === args.reportId || x.name === args.reportId)
      if (r) ctx.bridge.setActiveReportId(r.id)
      ctx.bridge.setActiveTab('reports')
      return { success: true, message: i18n.t('ai.cap.navigated', { view: 'reports' }) }
    }
    const view = args?.view as WorkspaceTab | undefined
    if (!view || !TABS.includes(view)) return { success: false, message: i18n.t('ai.cap.invalidView'), error: 'invalid_view' }
    ctx.bridge.setActiveTab(view)
    return { success: true, message: i18n.t('ai.cap.navigated', { view }) }
  },
}

const getContext: Capability = {
  id: 'app.getContext',
  title: 'Get current app context',
  description: 'Returns where the user currently is: active screen, active dashboard and report (if any), and counts. Use to resolve words like "here".',
  keywords: ['context', 'current', 'screen', 'where', 'active', 'state', 'view'],
  category: 'app',
  sideEffect: false,
  argsSchema: { type: 'object', properties: {} },
  async run(_args, ctx) {
    const tab = ctx.bridge.getActiveTab()
    const dashboards = ctx.bridge.getDashboards()
    const reports = ctx.bridge.getReports()
    const activeDash = dashboards.find(d => d.id === ctx.bridge.getActiveDashboardId())
    const activeReport = reports.find(r => r.id === ctx.bridge.getActiveReportId())
    return {
      success: true,
      message: i18n.t('ai.cap.contextSummary', { tab }),
      data: {
        tab,
        activeDashboard: activeDash ? { id: activeDash.id, name: activeDash.name, linkedTableNames: activeDash.linkedTableNames } : null,
        activeReport: activeReport ? { id: activeReport.id, name: activeReport.name, blocks: activeReport.blocks.length } : null,
        dashboardCount: dashboards.length,
        reportCount: reports.length,
      },
    }
  },
}

export const appCapabilities: Capability[] = [navigate, getContext]
