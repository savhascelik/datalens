import { describe, it, expect } from 'vitest'
import { buildDefaultInstanceWidgets } from './defaultWidgets'
import type { Dataset } from '../../types'

function dataset(cols: Array<{ name: string; kind: string; uniqueCount?: number }>): Dataset {
  return {
    name: 'DS', tableName: 't1', totalRows: 10, headers: cols.map(c => c.name), rows: [],
    columns: cols.map(c => ({ name: c.name, kind: c.kind as any, nonEmptyCount: 10, emptyCount: 0, uniqueCount: c.uniqueCount ?? 5, sample: '' })),
  }
}

describe('buildDefaultInstanceWidgets (yeni model hazır dashboard)', () => {
  it('tam veri seti: KPI(sayaç+toplam+benzersiz) + bar + line + tablo üretir, hepsi t1', () => {
    const ds = dataset([
      { name: 'city', kind: 'string', uniqueCount: 12 },
      { name: 'revenue', kind: 'number' },
      { name: 'order_date', kind: 'string', uniqueCount: 30 },
    ])
    const { widgets, rglLayout } = buildDefaultInstanceWidgets(ds)
    const byId = Object.fromEntries(widgets.map(w => [w.id, w]))
    expect(byId['kpi_count'].config.aggregation).toBe('count')
    expect(byId['kpi_sum'].config).toMatchObject({ column: 'revenue', aggregation: 'sum' })
    expect(byId['kpi_distinct'].config).toMatchObject({ column: 'city', aggregation: 'count-distinct' })
    expect(byId['chartBar']).toMatchObject({ type: 'bar', config: { xColumn: 'city', yColumn: 'revenue' } })
    // line X, tarih benzeri kolonu tercih eder
    expect(byId['chartLine']).toMatchObject({ type: 'line', config: { xColumn: 'order_date', yColumn: 'revenue' } })
    expect(byId['table']).toMatchObject({ type: 'table' })
    expect(widgets.every(w => w.sourceTable === 't1')).toBe(true)
    // her widget'ın bir layout girdisi var
    expect(rglLayout.map(l => l.i).sort()).toEqual(widgets.map(w => w.id).sort())
  })

  it('sayısal kolon yoksa: kpi_sum atlanır, bar yColumn count (undefined) olur', () => {
    const ds = dataset([{ name: 'category', kind: 'string', uniqueCount: 6 }])
    const { widgets } = buildDefaultInstanceWidgets(ds)
    const ids = widgets.map(w => w.id)
    expect(ids).not.toContain('kpi_sum')
    expect(ids).toContain('kpi_distinct')
    const bar = widgets.find(w => w.id === 'chartBar')!
    expect(bar.config.xColumn).toBe('category')
    expect(bar.config.yColumn).toBeUndefined()
  })

  it('kategorik kolon yoksa: yalnızca sayaç KPI + tablo (grafik yok)', () => {
    const ds = dataset([{ name: 'amount', kind: 'number' }])
    const { widgets } = buildDefaultInstanceWidgets(ds)
    const ids = widgets.map(w => w.id)
    expect(ids).toContain('kpi_count')
    expect(ids).toContain('kpi_sum')
    expect(ids).toContain('table')
    expect(ids).not.toContain('chartBar')
    expect(ids).not.toContain('chartLine')
  })

  it('kolon hiç yoksa: sayaç KPI + tablo döner', () => {
    const ds = dataset([])
    const { widgets } = buildDefaultInstanceWidgets(ds)
    expect(widgets.map(w => w.id).sort()).toEqual(['kpi_count', 'table'])
  })
})
