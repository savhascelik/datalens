// components/dashboard/KpiView.tsx
// Yapılandırılabilir KPI kartları: istenilen kadar kart eklenebilir.
// Her kart {kolon, aggregation, etiket, format} taşır ve DuckDB'de çapraz filtreye
// duyarlı olarak hesaplanır. Düzen modunda kart ekle/çıkar/güncelle yapılabilir.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2, Settings2, LoaderCircle, Check } from 'lucide-react'
import { fetchScalar } from '../../services/widgetData'
import type { WidgetContext } from './types'
import type { KpiCardConfig } from '../../types'

const DEFAULT_COLORS = ['var(--color-primary)', 'var(--color-secondary)', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6']

function formatValue(v: number, format?: string): string {
  if (v === null || v === undefined || isNaN(v)) return '—'
  switch (format) {
    case 'currency': return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)
    case 'compact': return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(v)
    case 'percent': return `${(v * 100).toFixed(1)}%`
    default: return v.toLocaleString(undefined, { maximumFractionDigits: 1 })
  }
}

// Kolon + aggregation'a göre otomatik etiket üret
function autoLabel(t: WidgetContext['t'], card: KpiCardConfig): string {
  if (card.label) return card.label
  const aggLabels: Record<string, string> = {
    'count': t('dashboard.aggCount', { defaultValue: 'Satır Sayısı' }),
    'count-distinct': t('dashboard.aggDistinct', { defaultValue: 'Benzersiz' }),
    'sum': t('dashboard.aggSum', { defaultValue: 'Toplam' }),
    'avg': t('dashboard.aggAvg', { defaultValue: 'Ortalama' }),
    'min': t('dashboard.aggMin', { defaultValue: 'Min' }),
    'max': t('dashboard.aggMax', { defaultValue: 'Maks' }),
  }
  if (card.aggregation === 'count') return aggLabels.count
  return `${aggLabels[card.aggregation]} · ${card.column}`
}

// Varsayılan KPI kartları (kullanıcı özelleştirmediyse) — otomatik algılanan kolonlara göre.
function defaultCards(detectedColumns: any): KpiCardConfig[] {
  const cards: KpiCardConfig[] = [
    { id: 'kpi_count', label: '', column: '', aggregation: 'count', format: 'number', color: DEFAULT_COLORS[0] },
  ]
  if (detectedColumns?.numericCol) {
    cards.push({ id: 'kpi_sum', label: '', column: detectedColumns.numericCol, aggregation: 'sum', format: 'number', color: DEFAULT_COLORS[1] })
  }
  if (detectedColumns?.categoricCol) {
    cards.push({ id: 'kpi_distinct', label: '', column: detectedColumns.categoricCol, aggregation: 'count-distinct', format: 'number', color: DEFAULT_COLORS[2] })
  }
  return cards
}

export function KpiView({ context }: { context: WidgetContext }) {
  const { activeDataset, activeDashboard, detectedColumns, filters, relationships, isDbReady, setDashboards, t } = context

  const [editMode, setEditMode] = useState(false)
  const [values, setValues] = useState<Record<string, number>>({})
  const [isLoading, setIsLoading] = useState(false)

  const baseTable: string | undefined = activeDataset?.tableName
  const numericColumns = (activeDataset?.columns ?? []).filter((c: any) => c.kind === 'number')
  const allColumns = activeDataset?.columns ?? []

  // Kullanıcı kartları tanımladıysa onları, yoksa varsayılanları kullan.
  const cards: KpiCardConfig[] = useMemo(
    () => (activeDashboard?.kpiCards && activeDashboard.kpiCards.length > 0)
      ? activeDashboard.kpiCards
      : defaultCards(detectedColumns),
    [activeDashboard?.kpiCards, detectedColumns]
  )

  const cardsKey = useMemo(() => JSON.stringify(cards), [cards])
  const filtersKey = useMemo(() => JSON.stringify(filters), [filters])

  // Her kartın değerini çapraz filtreye duyarlı olarak hesapla.
  const reqRef = useRef(0)
  useEffect(() => {
    if (!isDbReady || !baseTable) return
    const reqId = ++reqRef.current
    setIsLoading(true)
    ;(async () => {
      const next: Record<string, number> = {}
      try {
        for (const card of cards) {
          next[card.id] = await fetchScalar({
            baseTable,
            column: card.column,
            aggregation: card.aggregation,
            filters,
            relationships,
          })
        }
        if (reqId === reqRef.current) setValues(next)
      } catch (err) {
        console.error('KPI hesaplama hatası:', err)
      } finally {
        if (reqId === reqRef.current) setIsLoading(false)
      }
    })()
  }, [isDbReady, baseTable, cardsKey, filtersKey, relationships])

  // Kart config'ini dashboard'a yaz (kalıcı).
  const persistCards = (next: KpiCardConfig[]) => {
    if (!activeDashboard) return
    setDashboards(prev => prev.map(d => d.id === activeDashboard.id ? { ...d, kpiCards: next } : d))
  }

  const addCard = () => {
    const next: KpiCardConfig = {
      id: `kpi_${crypto.randomUUID()}`,
      label: '',
      column: numericColumns[0]?.name || '',
      aggregation: numericColumns[0] ? 'sum' : 'count',
      format: 'number',
      color: DEFAULT_COLORS[cards.length % DEFAULT_COLORS.length],
    }
    persistCards([...cards, next])
  }

  const updateCard = (id: string, patch: Partial<KpiCardConfig>) => {
    persistCards(cards.map(c => c.id === id ? { ...c, ...patch } : c))
  }

  const removeCard = (id: string) => {
    persistCards(cards.filter(c => c.id !== id))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: '8px' }}>
      {/* Düzen modu geçişi */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
        {isLoading && <LoaderCircle className="spin" size={13} style={{ color: 'var(--color-primary)' }} />}
        <button
          className="icon-button"
          onClick={() => setEditMode(m => !m)}
          title={t('dashboard.configureKpi', { defaultValue: 'KPI Düzenle' })}
          style={{ color: editMode ? 'var(--color-primary)' : 'var(--text-muted)' }}
        >
          {editMode ? <Check size={14} /> : <Settings2 size={14} />}
        </button>
      </div>

      {/* Kart ızgarası */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', flex: 1, overflow: 'auto', padding: '2px' }}>
        {cards.map((card) => (
          <div key={card.id} style={{ padding: '12px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '10px', position: 'relative' }}>
            {editMode ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  value={card.label}
                  onChange={(e) => updateCard(card.id, { label: e.target.value })}
                  placeholder={t('dashboard.kpiLabelPlaceholder', { defaultValue: 'Etiket (otomatik)' })}
                  style={{ padding: '4px 6px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '10px' }}
                />
                <select
                  value={card.aggregation}
                  onChange={(e) => updateCard(card.id, { aggregation: e.target.value as KpiCardConfig['aggregation'] })}
                  style={{ padding: '4px 6px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '10px' }}
                >
                  <option value="count">{t('dashboard.aggCount', { defaultValue: 'Satır Sayısı' })}</option>
                  <option value="count-distinct">{t('dashboard.aggDistinct', { defaultValue: 'Benzersiz' })}</option>
                  <option value="sum">{t('dashboard.aggSum', { defaultValue: 'Toplam' })}</option>
                  <option value="avg">{t('dashboard.aggAvg', { defaultValue: 'Ortalama' })}</option>
                  <option value="min">{t('dashboard.aggMin', { defaultValue: 'Min' })}</option>
                  <option value="max">{t('dashboard.aggMax', { defaultValue: 'Maks' })}</option>
                </select>
                {card.aggregation !== 'count' && (
                  <select
                    value={card.column}
                    onChange={(e) => updateCard(card.id, { column: e.target.value })}
                    style={{ padding: '4px 6px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '10px' }}
                  >
                    <option value="">{t('dashboard.selectPlaceholder', { defaultValue: 'Seçin...' })}</option>
                    {(card.aggregation === 'count-distinct' ? allColumns : numericColumns).map((c: any) => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                )}
                <select
                  value={card.format}
                  onChange={(e) => updateCard(card.id, { format: e.target.value as KpiCardConfig['format'] })}
                  style={{ padding: '4px 6px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '10px' }}
                >
                  <option value="number">{t('dashboard.fmtNumber', { defaultValue: 'Sayı' })}</option>
                  <option value="currency">{t('dashboard.fmtCurrency', { defaultValue: 'Para' })}</option>
                  <option value="compact">{t('dashboard.fmtCompact', { defaultValue: 'Kısa (1.2K)' })}</option>
                  <option value="percent">{t('dashboard.fmtPercent', { defaultValue: 'Yüzde' })}</option>
                </select>
                <button
                  onClick={() => removeCard(card.id)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', padding: '4px', background: 'transparent', border: '1px dashed #ef4444', borderRadius: '4px', color: '#ef4444', fontSize: '10px', cursor: 'pointer' }}
                >
                  <Trash2 size={11} /> {t('dashboard.removeCard', { defaultValue: 'Kaldır' })}
                </button>
              </div>
            ) : (
              <>
                <div style={{ fontSize: '22px', fontWeight: 800, color: card.color || 'var(--color-primary)' }}>
                  {formatValue(values[card.id], card.format)}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {autoLabel(t, card)}
                </div>
              </>
            )}
          </div>
        ))}

        {/* Kart ekle (düzen modunda) */}
        {editMode && (
          <button
            onClick={(e) => { e.stopPropagation(); addCard() }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', padding: '12px', background: 'transparent', border: '1px dashed var(--border-color)', borderRadius: '10px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '11px', minHeight: '80px' }}
          >
            <Plus size={18} />
            {t('dashboard.addKpiCard', { defaultValue: 'KPI Ekle' })}
          </button>
        )}
      </div>
    </div>
  )
}

export default KpiView
