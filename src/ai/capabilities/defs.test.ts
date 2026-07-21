import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Dashboard, Report, Dataset } from '../../types'

// data-engine'i mock'la (DuckDB-wasm yüklenmesin); report.addChartFromQuery bunu kullanır.
vi.mock('../../data-engine', () => ({
  runSafeQuery: vi.fn(async () => [{ label: 'A', value: 3 }, { label: 'B', value: 5 }]),
  sqlName: (s: string) => `"${s}"`,
}))

import { publishBridge } from '../appBridge'
import { registerAllCapabilities } from './defs'
import { executeCapability } from './registry'
import { clearHistory } from '../history'

let datasets: Dataset[]
let dashboards: Dashboard[]
let activeId: string | null
let reports: Report[]
let activeReportId: string | null

function baseDash(): Dashboard {
  return {
    id: 'd1', name: 'Test', linkedTableNames: ['t1'], activeFilters: {}, filters: [], relationships: [],
    dbBarX: '', dbBarY: '', dbBarType: 'bar', dbLineX: '', dbLineY: '', dbLineType: 'line',
  }
}

function sampleDataset(): Dataset {
  return {
    name: 'Sales', tableName: 't1', totalRows: 3, headers: ['city', 'revenue'], rows: [],
    columns: [
      { name: 'city', kind: 'string', nonEmptyCount: 3, emptyCount: 0, uniqueCount: 3, sample: 'A' },
      { name: 'revenue', kind: 'number', nonEmptyCount: 3, emptyCount: 0, uniqueCount: 3, sample: '10' },
    ],
  }
}

publishBridge({
  getDatasets: () => datasets,
  getDashboards: () => dashboards,
  getActiveDashboardId: () => activeId,
  getReports: () => reports,
  getActiveReportId: () => activeReportId,
  getActiveTab: () => 'dashboard',
  setDatasets: (updater) => { datasets = updater(datasets) },
  setDashboards: (updater) => { dashboards = updater(dashboards) },
  setActiveDashboardId: (id) => { activeId = id },
  setReports: (updater) => { reports = updater(reports) },
  setActiveReportId: (id) => { activeReportId = id },
  setActiveTab: () => {},
})
registerAllCapabilities()

describe('defs entegrasyon (undo / chart tipi / rapor)', () => {
  beforeEach(() => {
    datasets = [sampleDataset()]
    dashboards = [baseDash()]
    activeId = 'd1'
    reports = []
    activeReportId = null
    clearHistory()
  })

  it('history.undo son sideEffect işlemi geri alır', async () => {
    const applied = await executeCapability('filter.apply', { column: 'city', value: 'X' })
    expect(applied.success).toBe(true)
    expect(dashboards[0].filters?.length).toBe(1)

    const undone = await executeCapability('history.undo', {})
    expect(undone.success).toBe(true)
    expect(dashboards[0].filters?.length ?? 0).toBe(0)
  })

  it('geçmiş boşken undo nazikçe başarısız olur', async () => {
    const r = await executeCapability('history.undo', {})
    expect(r.success).toBe(false)
    expect(r.error).toBe('empty_history')
  })

  it('widget.setChartColumns yeni tipi (treemap) kabul eder', async () => {
    const r = await executeCapability('widget.setChartColumns', { slot: 'bar', xColumn: 'city', chartType: 'treemap' })
    expect(r.success).toBe(true)
    expect(dashboards[0].dbBarType).toBe('treemap')
  })

  it('widget.setChartColumns geçersiz tipi reddeder', async () => {
    const r = await executeCapability('widget.setChartColumns', { slot: 'bar', xColumn: 'city', chartType: 'sankey' })
    expect(r.success).toBe(false)
    expect(r.error).toBe('invalid_args')
  })

  it('report.create + addText markdown bloğu ekler', async () => {
    const c = await executeCapability('report.create', { name: 'R1' })
    expect(c.success).toBe(true)
    expect(reports.length).toBe(1)
    const t = await executeCapability('report.addText', { markdown: '# Başlık' })
    expect(t.success).toBe(true)
    expect(reports[0].blocks.length).toBe(1)
    expect(reports[0].blocks[0].type).toBe('markdown')
  })

  it('report.addChartFromQuery SQL sonucundan grafik bloğu ekler', async () => {
    await executeCapability('report.create', { name: 'R2' })
    const r = await executeCapability('report.addChartFromQuery', { sql: 'SELECT city AS label, COUNT(*) AS value FROM t GROUP BY 1', chartType: 'pie', title: 'Dağılım' })
    expect(r.success).toBe(true)
    const active = reports.find(x => x.id === activeReportId)!
    const chartBlock = active.blocks.find(b => b.type === 'chart')!
    expect(chartBlock.chart?.type).toBe('pie')
    expect(chartBlock.chart?.data.length).toBe(2)
  })

  it('rapor yokken reportName ile oluşturur, isimsizde reddeder (B)', async () => {
    expect(reports.length).toBe(0)
    // İsimsiz → çöp/yanlış-isim rapor üretmez, isim ister
    const noName = await executeCapability('report.addText', { markdown: 'x' })
    expect(noName.success).toBe(false)
    expect(noName.error).toBe('need_report_name')
    expect(reports.length).toBe(0)
    // İsimli → oluşturur ve ekler
    const ok = await executeCapability('report.addText', { markdown: 'Müdür özeti.', reportName: 'Satış Raporu' })
    expect(ok.success).toBe(true)
    expect(reports.length).toBe(1)
    expect(reports[0].name).toBe('Satış Raporu')
    expect(reports[0].blocks[0].type).toBe('markdown')
  })

  it('app.navigate geçerli ekrana geçer, geçersizde hata verir', async () => {
    expect((await executeCapability('app.navigate', { view: 'reports' })).success).toBe(true)
    const bad = await executeCapability('app.navigate', { view: 'space' })
    expect(bad.success).toBe(false)
    expect(bad.error).toBe('invalid_args') // enum dışı → argsSchema reddeder
  })

  it('app.getContext aktif ekranı döndürür', async () => {
    const r = await executeCapability('app.getContext', {})
    expect(r.success).toBe(true)
    expect(r.data.tab).toBe('dashboard')
  })

  it('data.addComputedColumn yeni kolonu dataset profiline ekler', async () => {
    const r = await executeCapability('data.addComputedColumn', { tableName: 't1', newColumn: 'margin', expression: '"revenue" * 0.2' })
    expect(r.success).toBe(true)
    expect(datasets[0].headers).toContain('margin')
    expect(datasets[0].columns.some(c => c.name === 'margin')).toBe(true)
  })

  it('kayıtlı sorgu: save → list → run', async () => {
    const s = await executeCapability('query.save', { name: 'aylik', sql: 'SELECT 1' })
    expect(s.success).toBe(true)
    const l = await executeCapability('query.list', {})
    expect(l.data.some((q: any) => q.name === 'aylik')).toBe(true)
    const run = await executeCapability('query.run', { idOrName: 'aylik' })
    expect(run.success).toBe(true)
    expect(run.data.rowCount).toBe(2)
  })

  it('report.addTableFromQuery aktif rapora markdown tablo ekler', async () => {
    await executeCapability('report.create', { name: 'R3' })
    const r = await executeCapability('report.addTableFromQuery', { sql: 'SELECT * FROM t', title: 'Sonuç' })
    expect(r.success).toBe(true)
    const active = reports.find(x => x.id === activeReportId)!
    expect(active.blocks.some(b => b.type === 'markdown' && (b.content || '').includes('|'))).toBe(true)
  })

  it('widget.create instance ekler, widget.list gösterir, widget.delete siler', async () => {
    const c = await executeCapability('widget.create', { type: 'kpi', column: 'revenue', aggregation: 'sum' })
    expect(c.success).toBe(true)
    expect(dashboards[0].widgets?.length).toBe(1)
    const id = c.data.id
    const l = await executeCapability('widget.list', {})
    expect(l.data.instances.some((w: any) => w.id === id)).toBe(true)
    const del = await executeCapability('widget.delete', { id })
    expect(del.success).toBe(true)
    expect(dashboards[0].widgets?.length).toBe(0)
  })

  it('widget.create geçersiz tipi reddeder', async () => {
    const r = await executeCapability('widget.create', { type: 'sankey' })
    expect(r.success).toBe(false)
    expect(r.error).toBe('invalid_args')
  })

  it('BUG-2: slicer/search widget silinince uyguladığı öksüz filtre de temizlenir', async () => {
    // Bir slicer kontrol widget'ı oluştur (city kolonu üzerinde).
    const c = await executeCapability('widget.create', { type: 'slicer', column: 'city' })
    expect(c.success).toBe(true)
    const id = c.data.id
    // Bu slicer'ın uyguladığı çapraz filtreyi ekle (kullanıcı bir değer seçti).
    const applied = await executeCapability('filter.apply', { column: 'city', value: 'A' })
    expect(applied.success).toBe(true)
    expect(dashboards[0].filters?.length).toBe(1)
    // Kontrol widget'ını sil → filtre öksüz kalmamalı, otomatik temizlenmeli.
    const del = await executeCapability('widget.delete', { id })
    expect(del.success).toBe(true)
    expect(dashboards[0].widgets?.length).toBe(0)
    expect(dashboards[0].filters?.length ?? 0).toBe(0)
    expect(Object.keys(dashboards[0].activeFilters ?? {}).length).toBe(0)
  })

  it('BUG-2: grafik (kontrol olmayan) widget silinince filtreler korunur', async () => {
    // KPI widget'ı ekle + city üzerinde bir filtre uygula.
    const c = await executeCapability('widget.create', { type: 'kpi', column: 'revenue', aggregation: 'sum' })
    const id = c.data.id
    await executeCapability('filter.apply', { column: 'city', value: 'A' })
    expect(dashboards[0].filters?.length).toBe(1)
    // KPI kontrol widget'ı değil → silince filtre KORUNMALI (öksüz değil).
    const del = await executeCapability('widget.delete', { id })
    expect(del.success).toBe(true)
    expect(dashboards[0].filters?.length).toBe(1)
  })
})
