// components/dashboard/WidgetShell.tsx
// Her widget'ı saran ORTAK kabuk. Yeni widget eklendiğinde başlık, sürükleme
// tutamacı, maximize/kaldır butonları ve RESPONSIVE içerik konteyneri
// otomatik gelir — widget'ın kendisi yalnızca renderContent döndürür.
//
// Responsive içerik: içerik alanı flex ile hücreyi doldurur (minHeight:0),
// grid item yeniden boyutlandığında chart'lar useEChart'taki ResizeObserver
// sayesinde otomatik uyum sağlar.

import { ReactNode, useState } from 'react'
import { GripVertical, Maximize2, Trash2, Settings2, Shuffle, FilePlus, Camera } from 'lucide-react'
import type { IDashboardWidget, WidgetContext } from './types'
import type { ChartKind, WidgetInstance } from '../../types'
import { getWidgetType, CHART_KINDS_IN_REGISTRY } from './widgetTypes'
import { WidgetConfigPopover } from './WidgetConfigPopover'
import { captureWidgetAsImage } from '../../utils/widgetCapture'
import { publishChatAttachment } from '../../ai/attachmentBus'

interface WidgetShellProps {
  widget: IDashboardWidget
  context: WidgetContext
  onRemove: (widgetId: string) => void
}

export function WidgetShell({ widget, context, onRemove }: WidgetShellProps) {
  const { t } = context
  const [showConfig, setShowConfig] = useState(false)

  // Instance (çoklu) widget ise ortak kontroller (ayarlar / tür değiştir / rapora ekle)
  // başlıkta gösterilir; böylece tüm widget tipleri tutarlı bir "chrome" paylaşır (BUG-1).
  const instance = widget.instance
  const meta = instance ? getWidgetType(instance.type) : undefined
  const isChart = meta?.category === 'chart'
  const isInsight = instance?.type === 'aiInsight'
  // Rapora ekle TÜM instance widget'larında var: grafik o anki verisini, insight o anki HTML'ini,
  // diğerleri (KPI/gösterge/tablo/kontrol) ise bir ekran görüntüsü snapshot'ı olarak ekler.
  const canAddToReport = !!instance

  // Grafik türünü döngüsel değiştir (shuffle) — widgets[] üzerinde, kabuk seviyesinde.
  const cycleChartType = () => {
    if (!instance || !context.activeDashboard) return
    const cycle = CHART_KINDS_IN_REGISTRY as readonly ChartKind[]
    const idx = cycle.indexOf(instance.type as ChartKind)
    const next = cycle[(idx + 1) % cycle.length]
    context.setDashboards((prev: any[]) => prev.map((d: any) => d.id === context.activeDashboard.id
      ? { ...d, widgets: (d.widgets ?? []).map((w: WidgetInstance) => w.id === instance.id ? { ...w, type: next } : w) }
      : d))
  }

  const [addingReport, setAddingReport] = useState(false)
  const handleAddToReport = async () => {
    // Grafik/insight: kayıtlı zengin handler (canlı veri / HTML) varsa onu kullan.
    const handler = context.reportActions?.current.get(widget.id)
    if (handler) { handler(); return }
    // Diğer widget'lar: ekran görüntüsü snapshot'ı olarak rapora ekle (insight bloğu içinde görsel).
    if (addingReport || !context.addInsightToReport) return
    setAddingReport(true)
    try {
      const img = await captureWidgetAsImage(widget.id)
      if (img) {
        const title = widget.getTitle(context)
        const doc = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{margin:0;padding:8px;background:#fff}</style></head><body><img src="${img}" style="max-width:100%;display:block" alt="${title}"/></body></html>`
        context.addInsightToReport(title, doc)
      }
    } finally {
      setAddingReport(false)
    }
  }

  // Widget'ın ekran görüntüsünü alıp AI sohbetine ek olarak gönder ("AI'ya sor").
  const [capturing, setCapturing] = useState(false)
  const handleAskAi = async () => {
    if (capturing) return
    setCapturing(true)
    try {
      const img = await captureWidgetAsImage(widget.id)
      if (img) publishChatAttachment(img, widget.getTitle(context))
    } finally {
      setCapturing(false)
    }
  }

  return (
    <div
      className="card"
      data-widget-id={widget.id}
      data-widget-title={widget.getTitle(context)}
      style={{
        height: '100%',
        width: '100%',
        borderRadius: '14px',
        padding: '16px',
        background: 'var(--bg-card)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        border: '1px solid var(--border-color)',
        // Ayarlar popover'ı açıkken kartın taşmasına izin ver (yoksa overflow:hidden kırpar)
        // ve kartı diğer widget'ların üstüne çıkar.
        overflow: showConfig ? 'visible' : 'hidden',
        position: 'relative',
        zIndex: showConfig ? 40 : undefined,
      }}
    >
      {/* Başlık çubuğu (sürükleme tutamacı) */}
      <div
        className="drag-handle card-title"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'grab', flexWrap: 'wrap', gap: '8px', userSelect: 'none' }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
          <GripVertical size={14} style={{ color: 'var(--text-muted)' }} />
          {widget.getIcon(context)}
          <span>{widget.getTitle(context)}</span>
        </span>

        <div className="capture-exclude" style={{ display: 'flex', gap: '6px', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
          <button
            className="icon-button"
            onClick={handleAskAi}
            disabled={capturing}
            title={t('dashboard.askAi', { defaultValue: 'AI\'ya sor (ekran görüntüsü)' })}
          >
            <Camera size={14} />
          </button>
          {isChart && (
            <button
              className="icon-button"
              onClick={cycleChartType}
              title={`${t('dashboard.switchType', { defaultValue: 'Tür Değiştir' })} (${instance?.type})`}
            >
              <Shuffle size={14} />
            </button>
          )}
          {canAddToReport && (
            <button
              className="icon-button"
              onClick={handleAddToReport}
              disabled={addingReport}
              title={t('dashboard.addToReport', { defaultValue: 'Rapora Ekle' })}
            >
              <FilePlus size={14} />
            </button>
          )}
          {instance && (
            <button
              className="icon-button"
              onClick={() => setShowConfig(v => !v)}
              title={t('dashboard.widgetSettings', { defaultValue: 'Widget Ayarları' })}
            >
              <Settings2 size={14} />
            </button>
          )}
          {widget.canMaximize(context) && (
            <button
              className="icon-button"
              onClick={() => context.onMaximizeWidget(widget.id)}
              title={t('dashboard.maximize', { defaultValue: 'Büyüt' })}
            >
              <Maximize2 size={14} />
            </button>
          )}
          <button
            className="icon-button"
            onClick={() => onRemove(widget.id)}
            title={t('dashboard.removeWidget', { defaultValue: 'Widget’ı Kaldır' })}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Ayarlar popover'ı (instance widget'lar için) */}
      {showConfig && instance && (
        <WidgetConfigPopover context={context} instance={instance} onClose={() => setShowConfig(false)} />
      )}

      {/* Responsive içerik konteyneri */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {widget.renderContent(context)}
      </div>
    </div>
  )
}

// Maximize overlay içeriği için de aynı responsive konteyneri kullanan yardımcı.
export function MaximizedWidgetBody({ widget, context }: { widget: IDashboardWidget; context: WidgetContext }): ReactNode {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {widget.renderContent({ ...context, isMaximized: true })}
    </div>
  )
}

export default WidgetShell
