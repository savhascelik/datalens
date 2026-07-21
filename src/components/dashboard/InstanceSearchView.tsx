// components/dashboard/InstanceSearchView.tsx
// Kontrol widget'ı: bir kolonda metin araması → 'contains' çapraz filtre uygular.
// Yazılan değer panodaki tüm widget'ları filtreler (ilişki üzerinden diğer tablolara da).

import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import type { WidgetContext } from './types'
import type { WidgetInstance } from '../../types'

export function InstanceSearchView({ context, instance }: { context: WidgetContext; instance: WidgetInstance }) {
  const { toggleStructuredFilter, filters, t } = context
  const baseTable = instance.sourceTable
  const column = instance.config.column || ''

  // Aktif filtreden mevcut değeri yansıt (senkron kalması için).
  const existing = filters.find(f => f.tableName === baseTable && f.column === column && f.op === 'contains')
  const [text, setText] = useState(existing?.value || '')
  useEffect(() => { setText(existing?.value || '') }, [existing?.value])

  const apply = (v: string) => {
    setText(v)
    if (column) toggleStructuredFilter(baseTable, column, v.trim(), 'contains')
  }

  if (!column) return <div className="empty-chart">{t('dashboard.noData', { defaultValue: 'Veri yok' })}</div>

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '8px', padding: '4px' }} onClick={(e) => e.stopPropagation()}>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>{column}</div>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <Search size={14} style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)' }} />
        <input
          value={text}
          onChange={(e) => apply(e.target.value)}
          placeholder={t('dashboard.searchPlaceholder', { defaultValue: 'Tabloda ara...' })}
          style={{ width: '100%', padding: '8px 10px 8px 30px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' }}
        />
      </div>
    </div>
  )
}

export default InstanceSearchView
