// components/dashboard/WidgetConfigPopover.tsx
// Ortak "widget ayarları" paneli. WidgetShell başlığındaki ⚙ butonu açar.
// AddWidgetModal'ın config alanlarını (X/Y, kolon, toplama, biçim, başlık, grafik türü)
// yeniden kullanır; ancak burada YENİ widget değil, mevcut instance.config düzenlenir.
// Böylece KPI/gauge/search/slicer/chart hepsinde tek tip ayar deneyimi olur (BUG-1).

import { useState, type CSSProperties } from 'react'
import { X } from 'lucide-react'
import type { WidgetContext } from './types'
import type { WidgetInstance } from '../../types'
import { getWidgetType, CHART_KINDS_IN_REGISTRY } from './widgetTypes'

interface Props {
  context: WidgetContext
  instance: WidgetInstance
  onClose: () => void
}

const inputStyle: CSSProperties = { width: '100%', padding: '7px 9px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '12px', outline: 'none' }
const labelStyle: CSSProperties = { fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }
const AGGS = ['count', 'count-distinct', 'sum', 'avg', 'min', 'max']
const AGG_KEY: Record<string, string> = { count: 'dashboard.aggCount', 'count-distinct': 'dashboard.aggDistinct', sum: 'dashboard.aggSum', avg: 'dashboard.aggAvg', min: 'dashboard.aggMin', max: 'dashboard.aggMax' }
const FMTS = ['number', 'currency', 'compact', 'percent']
const FMT_KEY: Record<string, string> = { number: 'dashboard.fmtNumber', currency: 'dashboard.fmtCurrency', compact: 'dashboard.fmtCompact', percent: 'dashboard.fmtPercent' }

export function WidgetConfigPopover({ context, instance, onClose }: Props) {
  const { t, setDashboards, activeDashboard, activeDataset, datasets } = context
  const meta = getWidgetType(instance.type)
  const category = meta?.category ?? 'chart'

  // Widget'ın kendi tablosunun kolonları (aktif tablodan farklı olabilir).
  const ownDataset = (datasets ?? []).find((d: any) => d.tableName === instance.sourceTable)
    || (activeDataset && activeDataset.tableName === instance.sourceTable ? activeDataset : null)
  const columns: any[] = ownDataset?.columns ?? []
  const numericColumns = columns.filter((c: any) => c.kind === 'number')

  const [type, setType] = useState<string>(instance.type)
  const [xColumn, setXColumn] = useState<string>(instance.config.xColumn || columns[0]?.name || '')
  const [yColumn, setYColumn] = useState<string>(instance.config.yColumn || '')
  const [column, setColumn] = useState<string>(instance.config.column || numericColumns[0]?.name || columns[0]?.name || '')
  const [aggregation, setAggregation] = useState<string>((instance.config.aggregation as string) || 'sum')
  const [format, setFormat] = useState<string>((instance.config.format as string) || 'number')
  const [title, setTitle] = useState<string>(instance.config.title || '')
  const [insightPrompt, setInsightPrompt] = useState<string>(instance.config.prompt || '')

  const isChart = category === 'chart'
  const isInsight = instance.type === 'aiInsight'

  const handleSave = () => {
    if (!activeDashboard) { onClose(); return }
    const patch: Record<string, any> = { title: title.trim() || undefined }
    if (isInsight) {
      const newPrompt = insightPrompt.trim()
      patch.prompt = newPrompt
      // İstem değiştiyse şablonu sıfırla → view yeniden üretir.
      if (newPrompt !== (instance.config.prompt || '')) {
        patch.htmlTemplate = ''
        patch.queries = {}
      }
    } else if (isChart) { patch.xColumn = xColumn; patch.yColumn = yColumn || undefined }
    else if (category === 'kpi') { patch.column = column; patch.aggregation = aggregation; patch.format = format }
    else if (category === 'control') { patch.column = column }
    setDashboards((prev: any[]) => prev.map((d: any) => d.id === activeDashboard.id
      ? { ...d, widgets: (d.widgets ?? []).map((w: WidgetInstance) => w.id === instance.id ? { ...w, type, config: { ...w.config, ...patch } } : w) }
      : d))
    onClose()
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{ position: 'absolute', top: '38px', right: '8px', zIndex: 30, width: '260px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '12px', boxShadow: '0 12px 32px rgba(0,0,0,0.35)', padding: '14px', display: 'flex', flexDirection: 'column', gap: '9px', animation: 'scaleUp 0.15s' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', fontWeight: 700 }}>{t('dashboard.widgetSettings', { defaultValue: 'Widget Ayarları' })}</span>
        <button onClick={onClose} style={{ background: 'transparent', border: 0, color: 'var(--text-muted)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}><X size={15} /></button>
      </div>

      {isInsight && (
        <>
          <label style={labelStyle}>{t('dashboard.insightPromptLabel', { defaultValue: 'AI İçgörü İstemi' })}</label>
          <textarea
            value={insightPrompt}
            onChange={(e) => setInsightPrompt(e.target.value)}
            rows={4}
            placeholder={t('dashboard.insightPromptPlaceholder', { defaultValue: 'Kartın neyi göstermesini istersiniz?' })}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </>
      )}

      {isChart && (
        <>
          <label style={labelStyle}>{t('dashboard.chartTypeLabel', { defaultValue: 'Grafik Türü' })}</label>
          <select value={type} onChange={(e) => setType(e.target.value)} style={inputStyle}>
            {CHART_KINDS_IN_REGISTRY.map(k => {
              const m = getWidgetType(k)
              return <option key={k} value={k}>{t(m?.titleKey || '', { defaultValue: m?.defaultTitle || k })}</option>
            })}
          </select>
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

      {(category === 'kpi' || category === 'control') && (
        <>
          <label style={labelStyle}>{t('dashboard.columnLabel', { defaultValue: 'Kolon' })}</label>
          <select value={column} onChange={(e) => setColumn(e.target.value)} style={inputStyle}>
            {columns.map((c: any) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
        </>
      )}

      {category === 'kpi' && (
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

      <label style={labelStyle}>{t('dashboard.widgetTitle', { defaultValue: 'Başlık (opsiyonel)' })}</label>
      <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} placeholder={meta?.defaultTitle || ''} />

      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
        <button className="secondary" onClick={onClose} style={{ padding: '6px 12px', fontSize: '11px', cursor: 'pointer' }}>{t('cancel', { defaultValue: 'İptal' })}</button>
        <button onClick={handleSave} style={{ background: 'var(--color-primary)', color: 'var(--color-primary-dark)', border: 0, borderRadius: '6px', padding: '6px 14px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>{t('save', { defaultValue: 'Kaydet' })}</button>
      </div>
    </div>
  )
}

export default WidgetConfigPopover
