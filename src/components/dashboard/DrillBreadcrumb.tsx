// components/dashboard/DrillBreadcrumb.tsx
// Drill-down navigasyon çubuğu: "Tümü > Region: East > City: X". Bir segmente
// tıklayınca o seviyeye geri çıkılır (üstündeki drill'ler bırakılır).

import { ChevronRight, Layers } from 'lucide-react'
import type { DrillStep } from './drill'

interface DrillBreadcrumbProps {
  steps: DrillStep[]
  onJump: (keep: number) => void  // keep = tutulacak adım sayısı (0 = köke dön)
  allLabel: string
}

export function DrillBreadcrumb({ steps, onJump, allLabel }: DrillBreadcrumbProps) {
  if (steps.length === 0) return null
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', fontSize: '11px', color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 8px' }}
    >
      <Layers size={12} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
      <button onClick={() => onJump(0)} style={linkStyle}>{allLabel}</button>
      {steps.map((s, i) => (
        <span key={`${s.column}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <ChevronRight size={11} style={{ color: 'var(--text-muted)' }} />
          <button
            onClick={() => onJump(i + 1)}
            style={{ ...linkStyle, color: i === steps.length - 1 ? 'var(--color-primary)' : 'var(--text-secondary)', fontWeight: i === steps.length - 1 ? 700 : 600 }}
          >
            {s.column}: {s.value}
          </button>
        </span>
      ))}
    </div>
  )
}

const linkStyle: React.CSSProperties = { background: 'transparent', border: 0, padding: 0, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }

export default DrillBreadcrumb
