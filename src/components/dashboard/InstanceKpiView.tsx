// components/dashboard/InstanceKpiView.tsx
// WidgetInstance config'ine göre tek bir KPI skaler değeri gösterir (filtre-duyarlı).

import { useEffect, useMemo, useRef, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { fetchScalar } from '../../services/widgetData'
import type { WidgetContext } from './types'
import type { WidgetInstance } from '../../types'

type Agg = 'count' | 'count-distinct' | 'sum' | 'avg' | 'min' | 'max'

function formatValue(v: number, fmt?: string): string {
  if (fmt === 'currency') return v.toLocaleString(undefined, { maximumFractionDigits: 1 })
  if (fmt === 'percent') return `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`
  if (fmt === 'compact') return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(v)
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

export function InstanceKpiView({ context, instance }: { context: WidgetContext; instance: WidgetInstance }) {
  const { filters, relationships, isDbReady, t } = context
  const baseTable = instance.sourceTable
  const column = instance.config.column || ''
  const aggregation = (instance.config.aggregation as Agg) || 'count'
  const format = instance.config.format as string | undefined

  const [value, setValue] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const filtersKey = useMemo(() => JSON.stringify(filters), [filters])
  const reqRef = useRef(0)

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

  const label = instance.config.title || instance.config.label || (column ? `${aggregation} · ${column}` : aggregation)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '6px', padding: '8px' }}>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</div>
      <div style={{ fontSize: '34px', fontWeight: 800, color: 'var(--color-primary)', lineHeight: 1.1 }}>
        {loading ? <LoaderCircle className="spin" size={22} /> : (value === null ? t('dashboard.noData', { defaultValue: 'Veri yok' }) : formatValue(value, format))}
      </div>
    </div>
  )
}

export default InstanceKpiView
