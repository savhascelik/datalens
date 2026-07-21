// components/dashboard/InstanceChartView.tsx
// WidgetInstance config'ine göre kendi verisini çeken grafik widget'ı (çoklu widget).
// Tıklama davranışı: TEK merkezi çapraz filtre (toggleStructuredFilter). Ayrı bir yerel
// drill mekanizması YOK — her tıklama üst şeritte görünen ve tüm widget'ları etkileyen
// merkezi filtreyi uygular. Aynı değere tekrar tıklamak filtreyi kaldırır (toggle).

import { useEffect, useRef, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { ChartView } from '../ChartView'
import { fetchCategoryData } from '../../services/widgetData'
import type { WidgetContext } from './types'
import type { ChartKind, WidgetInstance } from '../../types'

export function InstanceChartView({ context, instance }: { context: WidgetContext; instance: WidgetInstance }) {
  const { filters, relationships, isDbReady, toggleStructuredFilter, addChartToReport, t, reportActions } = context

  const [rows, setRows] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const baseTable = instance.sourceTable
  const xColumn = instance.config.xColumn || ''
  const yColumn = instance.config.yColumn || ''
  const chartType: ChartKind = (instance.type as ChartKind) || 'bar'

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
          aggregation: (instance.config.aggregation as any) || 'sum',
          limit: 12,
          orderByValueDesc: true,
          filters,
          relationships,
        })
        if (reqId === reqRef.current) setRows(res.rows)
      } catch (err) {
        console.error('Instance widget sorgu hatası:', err)
        if (reqId === reqRef.current) setRows([])
      } finally {
        if (reqId === reqRef.current) setIsLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDbReady, baseTable, xColumn, yColumn, JSON.stringify(filters), relationships, instance.config.aggregation])

  // Grafik tıklaması TEK merkezi çapraz filtreyi uygular (üst şeritte görünür, tüm widget'ları
  // etkiler). Aynı değere tekrar tıklamak filtreyi kaldırır (toggle).
  const handlePointClick = (value: string) => {
    if (!baseTable || !xColumn) return
    toggleStructuredFilter(baseTable, xColumn, value)
  }

  const handleAddToReport = () => {
    if (!rows.length || !xColumn) return
    const title = instance.config.title || (yColumn ? `${xColumn} / ${yColumn}` : xColumn)
    addChartToReport(chartType, title, rows, xColumn, 'value')
  }

  // Rapora-ekle fonksiyonunu WidgetShell başlığındaki ortak butona kaydet (BUG-1 chrome birleşimi).
  useEffect(() => {
    const map = reportActions?.current
    if (!map) return
    map.set(instance.id, handleAddToReport)
    return () => { map.delete(instance.id) }
  })

  if (!baseTable || !xColumn) return <div className="empty-chart">{t('dashboard.noData', { defaultValue: 'Veri yok' })}</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minHeight: 0 }}>
      {/* Kontroller (tür değiştir / rapora ekle / ayarlar) WidgetShell başlığında (BUG-1).
          Filtre TEK yol: grafiğe tıkla → merkezi çapraz filtre → üst şerit + tüm widget'lar. */}
      <div className="chart-wrapper" style={{ flex: 1, minHeight: '100px', overflow: 'hidden', position: 'relative' }}>
        {isLoading && (
          <div style={{ position: 'absolute', top: 6, right: 6, zIndex: 5 }}>
            <LoaderCircle className="spin" size={14} style={{ color: 'var(--color-primary)' }} />
          </div>
        )}
        {rows.length > 0 ? (
          <ChartView type={chartType} data={rows} xAxisKey={xColumn} yAxisKey="value" onPointClick={handlePointClick} />
        ) : (
          <div className="empty-chart">{t('dashboard.noData', { defaultValue: 'Veri yok' })}</div>
        )}
      </div>
    </div>
  )
}

export default InstanceChartView
