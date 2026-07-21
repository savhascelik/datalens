// components/dashboard/InstanceSlicerView.tsx
// Kontrol widget'ı: bir kolonun benzersiz değerlerini listeler; seçince (eq) çapraz
// filtre uygular. Seçili değere tekrar tıklamak filtreyi kaldırır.

import { useEffect, useMemo, useRef, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { runSafeQuery, sqlName } from '../../data-engine'
import type { WidgetContext } from './types'
import type { WidgetInstance } from '../../types'

export function InstanceSlicerView({ context, instance }: { context: WidgetContext; instance: WidgetInstance }) {
  const { toggleStructuredFilter, filters, isDbReady, t } = context
  const baseTable = instance.sourceTable
  const column = instance.config.column || ''

  const [values, setValues] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const reqRef = useRef(0)

  const selected = useMemo(() => {
    const f = filters.find(x => x.tableName === baseTable && x.column === column && (x.op ?? 'eq') === 'eq')
    return f?.value
  }, [filters, baseTable, column])

  useEffect(() => {
    if (!isDbReady || !baseTable || !column) { setValues([]); return }
    const reqId = ++reqRef.current
    setLoading(true)
    ;(async () => {
      try {
        const rows = await runSafeQuery(`SELECT DISTINCT CAST(${sqlName(column)} AS VARCHAR) AS v FROM ${sqlName(baseTable)} WHERE ${sqlName(column)} IS NOT NULL ORDER BY v LIMIT 100`)
        if (reqId === reqRef.current) setValues(rows.map(r => String((r as any).v)))
      } catch {
        if (reqId === reqRef.current) setValues([])
      } finally {
        if (reqId === reqRef.current) setLoading(false)
      }
    })()
  }, [isDbReady, baseTable, column])

  if (!column) return <div className="empty-chart">{t('dashboard.noData', { defaultValue: 'Veri yok' })}</div>

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>{column}</div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {loading && <LoaderCircle className="spin" size={14} style={{ color: 'var(--color-primary)' }} />}
        {values.map(v => {
          const active = selected === v
          return (
            <button
              key={v}
              onClick={() => toggleStructuredFilter(baseTable, column, v, 'eq')}
              style={{ textAlign: 'left', padding: '5px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', background: active ? 'var(--color-primary)' : 'var(--bg-tertiary)', color: active ? 'var(--color-primary-dark)' : 'var(--text-secondary)', border: active ? '1px solid var(--color-primary)' : '1px solid var(--border-color)', fontWeight: active ? 700 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              {v}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default InstanceSlicerView
