// components/dashboard/ChartWidgetView.tsx
// Kendi verisini çeken grafik widget'ı (bar/line/pie). KpiView/DataTableView ile
// aynı desen: kolon seçici + çapraz filtre + kendi lazy sorgusu. DashboardTab'in
// artık grafik SQL'i çalıştırmasına gerek yok.

import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, Shuffle, FilePlus } from 'lucide-react'
import { ChartView } from '../ChartView'
import { fetchCategoryData } from '../../services/widgetData'
import type { WidgetContext } from './types'
import type { ChartKind } from '../../types'

// Sihirli "tür değiştir" butonunun döngüsü.
const CHART_CYCLE: ChartKind[] = ['bar', 'line', 'pie', 'scatter', 'treemap', 'funnel', 'radar']

// 'bar' slotu dbBarX/dbBarY/dbBarType; 'line' slotu dbLineX/dbLineY/dbLineType kullanır.
type Slot = 'bar' | 'line'

export function ChartWidgetView({ context, slot }: { context: WidgetContext; slot: Slot }) {
  const { activeDataset, activeDashboard, filters, relationships, isDbReady, setDashboards, toggleStructuredFilter, addChartToReport, t } = context

  const [rows, setRows] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const baseTable: string | undefined = activeDataset?.tableName
  const columns = activeDataset?.columns ?? []

  const xKey = slot === 'bar' ? 'dbBarX' : 'dbLineX'
  const yKey = slot === 'bar' ? 'dbBarY' : 'dbLineY'
  const typeKey = slot === 'bar' ? 'dbBarType' : 'dbLineType'

  const xColumn: string = activeDashboard?.[xKey] || ''
  const yColumn: string = activeDashboard?.[yKey] || ''
  const chartType: ChartKind = activeDashboard?.[typeKey] || (slot === 'bar' ? 'bar' : 'line')

  const reqRef = useRef(0)
  useEffect(() => {
    if (!isDbReady || !baseTable || !xColumn) { setRows([]); return }
    const reqId = ++reqRef.current
    setIsLoading(true)
    ;(async () => {
      try {
        const res = await fetchCategoryData({
          baseTable,
          xColumn,
          yColumn: yColumn || undefined,
          aggregation: 'sum',
          limit: slot === 'bar' ? 8 : 15,
          orderByValueDesc: slot === 'bar',
          filters,
          relationships,
        })
        if (reqId === reqRef.current) setRows(res.rows)
      } catch (err) {
        console.error('Grafik sorgu hatası:', err)
        if (reqId === reqRef.current) setRows([])
      } finally {
        if (reqId === reqRef.current) setIsLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDbReady, baseTable, xColumn, yColumn, JSON.stringify(filters), relationships, slot])

  const updateDashboard = (patch: Record<string, any>) => {
    if (!activeDashboard) return
    setDashboards(prev => prev.map(d => d.id === activeDashboard.id ? { ...d, ...patch } : d))
  }

  // Sihirli tür değiştirme: grafik tipleri arasında sırayla döner.
  const cycleChartType = () => {
    const idx = CHART_CYCLE.indexOf(chartType)
    const next = CHART_CYCLE[(idx + 1) % CHART_CYCLE.length]
    updateDashboard({ [typeKey]: next })
  }

  // Grafiği rapora ekle (o anki veriyle anlık görüntü).
  const handleAddToReport = () => {
    if (!rows.length || !xColumn) return
    const title = yColumn ? `${xColumn} / ${yColumn}` : xColumn
    addChartToReport(chartType, title, rows, xColumn, 'value')
  }

  // Tıklama TEK merkezi çapraz filtreyi uygular (üst şerit + tüm widget'lar). Aynı değere
  // tekrar tıklamak filtreyi kaldırır (toggle). Ayrı yerel drill mekanizması yok.
  const handlePointClick = (value: string) => {
    if (!baseTable || !xColumn) return
    toggleStructuredFilter(baseTable, xColumn, value)
  }

  if (!baseTable) return <div className="empty-chart">{t('dashboard.noData', { defaultValue: 'Veri yok' })}</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, minHeight: 0 }}>
      {/* Kolon seçiciler */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '2px' }} onClick={(e) => e.stopPropagation()}>
        <select
          value={xColumn}
          onChange={(e) => updateDashboard({ [xKey]: e.target.value })}
          style={{ flex: 1, padding: '6px 10px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '11px', fontWeight: 'bold' }}
        >
          {columns.map((c: any) => <option key={c.name} value={c.name}>X: {c.name}</option>)}
        </select>
        <select
          value={yColumn}
          onChange={(e) => updateDashboard({ [yKey]: e.target.value })}
          style={{ flex: 1, padding: '6px 10px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '11px', fontWeight: 'bold' }}
        >
          <option value="">Y: {t('dashboard.countRows', { defaultValue: 'Satır Sayısı' })}</option>
          {columns.filter((c: any) => c.kind === 'number').map((c: any) => (
            <option key={c.name} value={c.name}>Y: {c.name}</option>
          ))}
        </select>
        <button
          onClick={cycleChartType}
          title={`${t('dashboard.switchType', { defaultValue: 'Tür Değiştir' })} (${chartType})`}
          style={{ display: 'grid', placeItems: 'center', padding: '0 10px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--color-primary)', cursor: 'pointer', flexShrink: 0 }}
        >
          <Shuffle size={14} />
        </button>
        <button
          onClick={handleAddToReport}
          title={t('dashboard.addToReport', { defaultValue: 'Rapora Ekle' })}
          style={{ display: 'grid', placeItems: 'center', padding: '0 10px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--color-primary)', cursor: 'pointer', flexShrink: 0 }}
        >
          <FilePlus size={14} />
        </button>
      </div>

      {/* Grafik */}
      <div className="chart-wrapper" style={{ flex: 1, minHeight: '100px', overflow: 'hidden', position: 'relative' }}>
        {isLoading && (
          <div style={{ position: 'absolute', top: 6, right: 6, zIndex: 5 }}>
            <LoaderCircle className="spin" size={14} style={{ color: 'var(--color-primary)' }} />
          </div>
        )}
        {rows.length > 0 ? (
          <ChartView
            type={chartType}
            data={rows}
            xAxisKey={xColumn}
            yAxisKey="value"
            onPointClick={handlePointClick}
          />
        ) : (
          <div className="empty-chart">{t('dashboard.noData', { defaultValue: 'Veri yok' })}</div>
        )}
      </div>
    </div>
  )
}

export default ChartWidgetView
