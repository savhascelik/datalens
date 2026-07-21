// components/dashboard/InstanceAiInsightView.tsx
// "AI İçgörü" widget'ı: LLM'in ürettiği htmlTemplate + queries ile FİLTRE-DUYARLI, serbest
// tasarımlı bir kart/panel gösterir. Sorgular merkezi filtreyle beslenen `data` tablosu
// üzerinden koşar → filtre değişince içerik otomatik güncellenir 
//
// GÜVENLİK: Model üretimi HTML, sandbox'lı bir iframe içinde render edilir
// (sandbox="allow-scripts", allow-same-origin YOK) → script'ler çalışır (Tailwind CDN) ama
// ana sayfaya / localStorage'a / çerezlere erişemez. Untrusted içerik için güvenli kalıp.

import { useEffect, useMemo, useRef, useState } from 'react'
import { LoaderCircle, Sparkles, RefreshCw } from 'lucide-react'
import { fetchInsightVariables, type InsightQuery } from '../../services/widgetData'
import { renderTemplate } from '../../utils/templateEngine'
import { requestAiInsight } from '../../ai/insight'
import type { WidgetContext } from './types'
import type { WidgetInstance } from '../../types'

// Tailwind Play CDN + tema ile eksiksiz iframe belgesi kur.
function buildInsightDocument(content: string, dark: boolean): string {
  return `<!DOCTYPE html>
<html class="${dark ? 'dark' : ''}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config={darkMode:'class'}</script>
<style>body{margin:0;padding:12px;background:transparent;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}</style>
</head>
<body class="${dark ? 'text-slate-100' : 'text-slate-900'}">
${content}
</body>
</html>`
}

export function InstanceAiInsightView({ context, instance }: { context: WidgetContext; instance: WidgetInstance }) {
  const { filters, relationships, isDbReady, t, activeDashboard, setDashboards, datasets, addInsightToReport, reportActions } = context
  const baseTable = instance.sourceTable
  const prompt: string = instance.config.prompt || ''
  const htmlTemplate: string = instance.config.htmlTemplate || ''
  const queries: Record<string, InsightQuery> = instance.config.queries || {}

  const [html, setHtml] = useState('')
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filtersKey = useMemo(() => JSON.stringify(filters), [filters])
  const queriesKey = useMemo(() => JSON.stringify(queries), [queries])
  const reqRef = useRef(0)

  const dark = (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') !== 'light')

  // Instance config'ini widgets[] üzerinde güncelle (üretilen şablonu kalıcılaştırmak için).
  const patchConfig = (patch: Record<string, any>) => {
    if (!activeDashboard) return
    setDashboards((prev: any[]) => prev.map((d: any) => d.id === activeDashboard.id
      ? { ...d, widgets: (d.widgets ?? []).map((w: WidgetInstance) => w.id === instance.id ? { ...w, config: { ...w.config, ...patch } } : w) }
      : d))
  }

  // LLM'den htmlTemplate + queries üret (prompt'a göre) ve kalıcılaştır.
  const generate = async () => {
    if (!prompt || generating) return
    const ds = (datasets ?? []).find((d: any) => d.tableName === baseTable)
    if (!ds) { setError(t('dashboard.insightNoData', { defaultValue: 'Kaynak tablo bulunamadı.' })); return }
    setGenerating(true)
    setError(null)
    try {
      const spec = await requestAiInsight(prompt, ds)
      patchConfig({ htmlTemplate: spec.htmlTemplate, queries: spec.queries })
    } catch (err: any) {
      setError(String(err?.message ?? err))
    } finally {
      setGenerating(false)
    }
  }

  // Şablon yoksa ama prompt varsa bir kez otomatik üret.
  useEffect(() => {
    if (!htmlTemplate && prompt && !generating && !error) void generate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [htmlTemplate, prompt])

  // Şablon + filtreler değişince sorguları çalıştır ve HTML'i render et (filtre-duyarlı).
  useEffect(() => {
    if (!isDbReady || !baseTable || !htmlTemplate) { setHtml(''); return }
    const reqId = ++reqRef.current
    setLoading(true)
    ;(async () => {
      try {
        const { variables } = await fetchInsightVariables({ baseTable, queries, filters, relationships })
        if (reqId === reqRef.current) setHtml(renderTemplate(htmlTemplate, variables))
      } catch (err: any) {
        if (reqId === reqRef.current) setError(String(err?.message ?? err))
      } finally {
        if (reqId === reqRef.current) setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDbReady, baseTable, htmlTemplate, queriesKey, filtersKey, relationships])

  const spinner = (
    <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--text-muted)', gap: '8px' }}>
      <LoaderCircle className="spin" size={20} style={{ color: 'var(--color-primary)' }} />
    </div>
  )

  // "Rapora ekle" (WidgetShell başlığı) için o anki render edilmiş HTML'i snapshot olarak kaydet.
  useEffect(() => {
    const map = reportActions?.current
    if (!map) return
    const handler = () => {
      if (!html) return
      const title = instance.config.title || 'AI Insight'
      addInsightToReport?.(title, buildInsightDocument(html, dark))
    }
    map.set(instance.id, handler)
    return () => { map.delete(instance.id) }
  })

  if (generating) {
    return (
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--text-muted)', textAlign: 'center', gap: '8px', padding: '12px' }}>
        <Sparkles size={22} style={{ color: 'var(--color-primary)' }} className="spin" />
        <div style={{ fontSize: '12px' }}>{t('dashboard.insightGenerating', { defaultValue: 'AI içgörü üretiliyor…' })}</div>
      </div>
    )
  }

  if (!prompt && !htmlTemplate) {
    return <div className="empty-chart">{t('dashboard.insightNeedPrompt', { defaultValue: 'Bir istem (prompt) girin — ayarlardan.' })}</div>
  }

  if (error) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px' }}>
        <div style={{ fontSize: '12px', color: '#f59e0b' }}>{error}</div>
        <button onClick={generate} className="secondary" style={{ alignSelf: 'flex-start', padding: '6px 12px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <RefreshCw size={12} /> {t('dashboard.insightRetry', { defaultValue: 'Yeniden üret' })}
        </button>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex' }}>
      {loading && (
        <div style={{ position: 'absolute', top: 6, right: 6, zIndex: 5 }}>
          <LoaderCircle className="spin" size={14} style={{ color: 'var(--color-primary)' }} />
        </div>
      )}
      {/* Yeniden üret butonu (istem değişmese de içeriği tazelemek için) */}
      <button
        onClick={generate}
        title={t('dashboard.insightRegenerate', { defaultValue: 'AI içgörüyü yeniden üret' })}
        className="capture-exclude icon-button"
        style={{ position: 'absolute', top: 4, left: 4, zIndex: 5, background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '6px' }}
      >
        <Sparkles size={13} />
      </button>
      {html ? (
        <iframe
          title={instance.config.title || 'AI Insight'}
          sandbox="allow-scripts"
          srcDoc={buildInsightDocument(html, dark)}
          style={{ width: '100%', height: '100%', border: 0, background: 'transparent', flex: 1 }}
        />
      ) : spinner}
    </div>
  )
}

export default InstanceAiInsightView
