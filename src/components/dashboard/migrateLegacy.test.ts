import { describe, it, expect } from 'vitest'
import { migrateLegacyDashboard, needsMigration } from './migrateLegacy'
import type { Dashboard } from '../../types'

function baseDash(overrides: Partial<Dashboard> = {}): Dashboard {
  return {
    id: 'd1', name: 'Test', linkedTableNames: ['t1'], activeFilters: {}, filters: [], relationships: [],
    dbBarX: '', dbBarY: '', dbBarType: 'bar', dbLineX: '', dbLineY: '', dbLineType: 'line',
    ...overrides,
  }
}

describe('migrateLegacyDashboard (Faz 2 foundation)', () => {
  it('idempotent: widgets zaten doluysa aynen döner', () => {
    const existing = [{ id: 'w1', type: 'bar', sourceTable: 't1', config: {} }]
    const d = baseDash({ widgets: existing })
    expect(migrateLegacyDashboard(d, 't1')).toBe(existing)
    expect(needsMigration(d)).toBe(false)
  })

  it('boş legacy dashboard: varsayılan sayaç KPI + tablo üretir (grafikler X yoksa atlanır)', () => {
    const d = baseDash()
    const w = migrateLegacyDashboard(d, 't1')
    const ids = w.map(x => x.id)
    expect(ids).toContain('mig_kpi_count')
    expect(ids).toContain('table')
    expect(ids).not.toContain('chartBar') // dbBarX boş
    expect(ids).not.toContain('chartLine')
    // hepsi birincil tabloya bağlı
    expect(w.every(x => x.sourceTable === 't1')).toBe(true)
    expect(needsMigration(d)).toBe(true)
  })

  it('dbBarX/dbLineX tanımlıysa grafik instance üretir, tür ve kolonları taşır', () => {
    const d = baseDash({ dbBarX: 'city', dbBarY: 'revenue', dbBarType: 'pie', dbLineX: 'date', dbLineType: 'line' })
    const w = migrateLegacyDashboard(d, 't1')
    const bar = w.find(x => x.id === 'chartBar')!
    expect(bar.type).toBe('pie') // dbBarType taşındı
    expect(bar.config.xColumn).toBe('city')
    expect(bar.config.yColumn).toBe('revenue')
    const line = w.find(x => x.id === 'chartLine')!
    expect(line.type).toBe('line')
    expect(line.config.xColumn).toBe('date')
    expect(line.config.yColumn).toBeUndefined() // dbLineY boş → count
  })

  it('kpiCards her biri bir kpi instance olur (kolon/agg/format/etiket taşınır)', () => {
    const d = baseDash({
      kpiCards: [
        { id: 'k1', label: 'Toplam Gelir', column: 'revenue', aggregation: 'sum', format: 'currency' },
        { id: 'k2', label: '', column: '', aggregation: 'count', format: 'number' },
      ],
    })
    const w = migrateLegacyDashboard(d, 't1')
    const kpis = w.filter(x => x.type === 'kpi')
    expect(kpis).toHaveLength(2)
    expect(kpis[0].id).toBe('mig_k1')
    expect(kpis[0].config.title).toBe('Toplam Gelir')
    expect(kpis[0].config.aggregation).toBe('sum')
    expect(kpis[0].config.format).toBe('currency')
    expect(kpis[1].config.title).toBeUndefined() // boş etiket
    // varsayılan sayaç EKLENMEZ (kartlar tanımlı)
    expect(w.find(x => x.id === 'mig_kpi_count')).toBeUndefined()
  })

  it('hiddenWidgets içindeki legacy id atlanır', () => {
    const d = baseDash({ dbBarX: 'city', hiddenWidgets: ['kpis', 'table'] })
    const w = migrateLegacyDashboard(d, 't1')
    const ids = w.map(x => x.id)
    expect(ids).not.toContain('mig_kpi_count') // kpis gizli
    expect(ids).not.toContain('table')          // table gizli
    expect(ids).toContain('chartBar')           // bar görünür
  })

  it('primaryTable verilmezse linkedTableNames[0] kullanılır', () => {
    const d = baseDash({ linkedTableNames: ['orders'] })
    const w = migrateLegacyDashboard(d)
    expect(w.every(x => x.sourceTable === 'orders')).toBe(true)
  })
})
