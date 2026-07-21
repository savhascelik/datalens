// components/dashboard/AddWidgetModal.tsx
// Merkezi registry'den beslenen, kategorili + canlı önizlemeli "Widget Ekle" galerisi.
// KPI / Grafik / Tablo (ve ileride Kontrol) tiplerini tek yerden listeler; seçilen
// tipin ihtiyaçlarına (needs) göre config panelini uyarlar.

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Plus } from 'lucide-react'
import { ChartView } from '../ChartView'
import { fetchCategoryData, fetchScalar } from '../../services/widgetData'
import { widgetTypesByCategory, getWidgetType, type WidgetCategory } from './widgetTypes'
import type { ChartKind, Dataset, WidgetInstance } from '../../types'

interface AddWidgetModalProps {
  dataset: Dataset | null
  isDbReady: boolean
  onClose: () => void
  onAdd: (instance: WidgetInstance) => void
}

const inputStyle: CSSProperties = { width: '100%', padding: '8px 10px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '12px', outline: 'none' }
const AGGS = ['count', 'count-distinct', 'sum', 'avg', 'min', 'max']
const AGG_KEY: Record<string, string> = { count: 'dashboard.aggCount', 'count-distinct': 'dashboard.aggDistinct', sum: 'dashboard.aggSum', avg: 'dashboard.aggAvg', min: 'dashboard.aggMin', max: 'dashboard.aggMax' }
const FMTS = ['number', 'currency', 'compact', 'percent']
const FMT_KEY: Record<string, string> = { number: 'dashboard.fmtNumber', currency: 'dashboard.fmtCurrency', compact: 'dashboard.fmtCompact', percent: 'dashboard.fmtPercent' }
const CAT_KEY: Record<WidgetCategory, string> = { kpi: 'dashboard.categoryKpi', chart: 'dashboard.categoryCharts', control: 'dashboard.categoryControl', data: 'dashboard.categoryData' }

export function AddWidgetModal({ dataset, isDbReady, onClose, onAdd }: AddWidgetModalProps) {
  const { t } = useTranslation()
  const columns = dataset?.columns ?? []
  const numericColumns = columns.filter((c: any) => c.kind === 'number')
  const groups = widgetTypesByCategory()

  const [type, setType] = useState<string>('bar')
  const [xColumn, setXColumn] = useState<string>(columns[0]?.name || '')
  const [yColumn, setYColumn] = useState<string>('')
  const [column, setColumn] = useState<string>(numericColumns[0]?.name || columns[0]?.name || '')
  const [aggregation, setAggregation] = useState<string>('sum')
  const [format, setFormat] = useState<string>('number')
  const [title, setTitle] = useState('')
  const [insightPrompt, setInsightPrompt] = useState('')

  const meta = getWidgetType(type)
  const category: WidgetCategory = meta?.category ?? 'chart'

  const [previewRows, setPreviewRows] = useState<any[]>([])
  const [kpiValue, setKpiValue] = useState<number | null>(null)
  const reqRef = useRef(0)

  useEffect(() => {
    if (!isDbReady || !dataset) { setPreviewRows([]); setKpiValue(null); return }
    const reqId = ++reqRef.current
    ;(async () => {
      try {
        if (category === 'chart' && xColumn) {
          const res = await fetchCategoryData({ baseTable: dataset.tableName, xColumn, yColumn: yColumn || undefined, aggregation: 'sum', limit: 12, orderByValueDesc: true, filters: [], relationships: [] })
          if (reqId === reqRef.current) setPreviewRows(res.rows)
        } else if (category === 'kpi') {
          const v = await fetchScalar({ baseTable: dataset.tableName, column, aggregation: aggregation as any, filters: [], relationships: [] })
          if (reqId === reqRef.current) setKpiValue(v)
        }
      } catch { /* önizleme best-effort */ }
    })()
  }, [isDbReady, dataset, category, xColumn, yColumn, column, aggregation])

  const canAdd = !!dataset && (type === 'aiInsight' ? !!insightPrompt.trim() : (category === 'data' || (category === 'chart' ? !!xColumn : !!column)))

  const handleAdd = () => {
    if (!dataset) return
    let config: WidgetInstance['config']
    if (type === 'aiInsight') config = { prompt: insightPrompt.trim(), title: title.trim() || undefined }
    else if (category === 'chart') config = { xColumn, yColumn: yColumn || undefined, title: title.trim() || undefined, aggregation: 'sum' }
    else if (category === 'kpi') config = { column, aggregation: aggregation as any, format, title: title.trim() || undefined }
    else if (category === 'control') config = { column, title: title.trim() || undefined }
    else config = { title: title.trim() || undefined }
    const instance: WidgetInstance = {
      id: 'w_' + (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)),
      type,
      sourceTable: dataset.tableName,
      config,
    }
    onAdd(instance)
    onClose()
  }

  return (
    <div className="modal-overlay" style={{ display: 'grid', placeItems: 'center', zIndex: 1100 }}>
      <div className="modal-card" style={{ width: 'min(880px, 94vw)', maxHeight: '88vh', overflowY: 'auto', padding: '22px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '16px', animation: 'scaleUp 0.2s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', margin: 0 }}>{t('dashboard.addWidget', { defaultValue: 'Widget Ekle' })}</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 0, color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        {!dataset ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>{t('dashboard.noLinkedTables', { defaultValue: 'Bu panoya bağlı aktif bir veri tablosu bulunamadı.' })}</div>
        ) : (
          <div style={{ display: 'flex', gap: '18px', minHeight: 0, flexWrap: 'wrap' }}>
            {/* Sol: kategorili tip galerisi + config */}
            <div style={{ flex: '1 1 340px', minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {groups.map(g => (
                <div key={g.category} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t(CAT_KEY[g.category], { defaultValue: g.category })}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '8px' }}>
                    {g.items.map(({ type: tp, icon: Icon, titleKey, defaultTitle }) => (
                      <button
                        key={tp}
                        onClick={() => setType(tp)}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', padding: '10px 6px', borderRadius: '10px', cursor: 'pointer', transition: 'all 0.15s', background: type === tp ? 'var(--border-strong)' : 'var(--bg-tertiary)', border: type === tp ? '1px solid var(--color-primary)' : '1px solid var(--border-color)', color: type === tp ? 'var(--color-primary)' : 'var(--text-secondary)' }}
                      >
                        <Icon size={18} />
                        <span style={{ fontSize: '10px', fontWeight: 600, textAlign: 'center' }}>{t(titleKey, { defaultValue: defaultTitle })}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {/* Config: tipe göre */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                {meta?.needs.x && (
                  <>
                    <label style={labelStyle}>{t('xAxis', { defaultValue: 'X EKSENİ (Kategori)' })}</label>
                    <select value={xColumn} onChange={(e) => setXColumn(e.target.value)} style={inputStyle}>
                      {columns.map((c: any) => <option key={c.name} value={c.name}>{c.name}</option>)}
                    </select>
                    <label style={labelStyle}>{t('yAxis', { defaultValue: 'Y EKSENİ (Değer/Sayı)' })}</label>
                    <select value={yColumn} onChange={(e) => setYColumn(e.target.value)} style={inputStyle}>
                      <option value="">{t('dashboard.countRows', { defaultValue: 'Satır Sayısı' })}</option>
                      {numericColumns.map((c: any) => <option key={c.name} value={c.name}>{c.name}</option>)}
                    </select>
                  </>
                )}
                {meta?.needs.column && (
                  <>
                    <label style={labelStyle}>{t('dashboard.columnLabel', { defaultValue: 'Kolon' })}</label>
                    <select value={column} onChange={(e) => setColumn(e.target.value)} style={inputStyle}>
                      {columns.map((c: any) => <option key={c.name} value={c.name}>{c.name}</option>)}
                    </select>
                  </>
                )}
                {meta?.needs.aggregation && (
                  <>
                    <label style={labelStyle}>{t('dashboard.aggregationLabel', { defaultValue: 'Toplama' })}</label>
                    <select value={aggregation} onChange={(e) => setAggregation(e.target.value)} style={inputStyle}>
                      {AGGS.map(a => <option key={a} value={a}>{t(AGG_KEY[a], { defaultValue: a })}</option>)}
                    </select>
                    <label style={labelStyle}>{t('dashboard.formatLabel', { defaultValue: 'Biçim' })}</label>
                    <select value={format} onChange={(e) => setFormat(e.target.value)} style={inputStyle}>
                      {FMTS.map(f => <option key={f} value={f}>{t(FMT_KEY[f], { defaultValue: f })}</option>)}
                    </select>
                  </>
                )}
                {type === 'aiInsight' && (
                  <>
                    <label style={labelStyle}>{t('dashboard.insightPromptLabel', { defaultValue: 'AI İçgörü İstemi' })}</label>
                    <textarea
                      value={insightPrompt}
                      onChange={(e) => setInsightPrompt(e.target.value)}
                      rows={3}
                      placeholder={t('dashboard.insightPromptPlaceholder', { defaultValue: 'Örn. Şehirlere göre toplam satışı özetleyen bir kart tasarla; en yüksek 3 şehri vurgula.' })}
                      style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                    />
                  </>
                )}
                <label style={labelStyle}>{t('dashboard.widgetTitle', { defaultValue: 'Başlık (opsiyonel)' })}</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} placeholder={t('dashboard.widgetTitle', { defaultValue: 'Başlık (opsiyonel)' })} />
              </div>
            </div>

            {/* Sağ: canlı önizleme */}
            <div style={{ flex: '1 1 340px', minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('dashboard.preview', { defaultValue: 'Önizleme' })}</div>
              <div style={{ height: '300px', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '8px', display: 'grid', placeItems: 'center' }}>
                {category === 'chart' && (previewRows.length > 0
                  ? <div style={{ width: '100%', height: '100%' }}><ChartView type={type as ChartKind} title={title} data={previewRows} xAxisKey={xColumn} yAxisKey="value" /></div>
                  : <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{t('dashboard.selectXFirst', { defaultValue: 'Önizleme için bir X kolonu seçin' })}</span>)}
                {category === 'kpi' && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{title || `${aggregation} · ${column}`}</div>
                    <div style={{ fontSize: '40px', fontWeight: 800, color: 'var(--color-primary)' }}>{kpiValue === null ? '—' : kpiValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                  </div>
                )}
                {category === 'data' && type !== 'aiInsight' && <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{t('dashboard.detailsTable', { defaultValue: 'Detay Veri Tablosu' })}</span>}
                {type === 'aiInsight' && (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', padding: '12px' }}>
                    ✨ {t('dashboard.insightPreviewNote', { defaultValue: 'Eklendiğinde AI, isteminize ve filtreye duyarlı bir HTML kart üretecek.' })}
                  </div>
                )}
                {category === 'control' && <span style={{ color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center' }}>{t(meta?.titleKey || '', { defaultValue: meta?.defaultTitle })} · {column}</span>}
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button className="secondary" onClick={onClose} style={{ padding: '8px 16px', fontSize: '12px', cursor: 'pointer' }}>{t('cancel', { defaultValue: 'İptal' })}</button>
          <button onClick={handleAdd} disabled={!canAdd} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--color-primary)', color: 'var(--color-primary-dark)', border: 0, borderRadius: '8px', padding: '8px 16px', fontSize: '12px', fontWeight: 'bold', cursor: canAdd ? 'pointer' : 'not-allowed', opacity: canAdd ? 1 : 0.5 }}>
            <Plus size={14} /> {t('dashboard.add', { defaultValue: 'Ekle' })}
          </button>
        </div>
      </div>
    </div>
  )
}

const labelStyle: CSSProperties = { fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }

export default AddWidgetModal
