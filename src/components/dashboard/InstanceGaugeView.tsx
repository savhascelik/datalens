// components/dashboard/InstanceGaugeView.tsx
// Gauge widget'ı: tek KPI değeri hesaplar (fetchScalar) ve gösterge olarak çizer.

import { useEffect, useMemo, useRef, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import GaugeChart from '../charts/GaugeChart'
import { fetchScalar } from '../../services/widgetData'
import type { WidgetContext } from './types'
import type { WidgetInstance } from '../../types'

export function InstanceGaugeView({ context, instance }: { context: WidgetContext; instance: WidgetInstance }) {
  const { filters, relationships, isDbReady, t } = context
  const baseTable = instance.sourceTable
  const column = instance.config.column || ''
  const aggregation = (instance.config.aggregation as any) || 'count'
  const target = typeof (instance.config as any).max === 'number' ? (instance.config as any).max : undefined

  const [value, setValue] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const filtersKey = useMemo(() => JSON.stringify(filters), [filters])
  const reqRef = useRef(0)
  const theme = (typeof document !== 'undefined' && (document.documentElement.getAttribute('data-theme') as 'dark' | 'light')) || 'dark'

  useEffect(() => {
    if (!isDbReady || !baseTable) { setValue(null); return }
    const reqId = ++reqRef.current
    setLoading(true)
    ;(async () => {
      try {
        const v = await fetchScalar({ baseTable, column, aggregation, filters, relationships })
        if (reqId === reqRef.current) setValue(v)
      } catch {
        if (reqId === reqRef.current) setValue(null)
      } finally {
        if (reqId === reqRef.current) setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDbReady, baseTable, column, aggregation, filtersKey, relationships])

  if (!baseTable) return <div className="empty-chart">{t('dashboard.noData', { defaultValue: 'Veri yok' })}</div>
  if (loading || value === null) {
    return <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}><LoaderCircle className="spin" size={20} style={{ color: 'var(--color-primary)' }} /></div>
  }
  const max = target ?? Math.max(value * 1.25, 1)
  return (
    <div style={{ flex: 1, minHeight: '120px' }}>
      <GaugeChart value={value} max={max} title={instance.config.title} theme={theme} />
    </div>
  )
}

export default InstanceGaugeView
