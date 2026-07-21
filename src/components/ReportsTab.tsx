import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Sparkles, Printer, Trash2, LoaderCircle, FileText, X, ChevronUp, ChevronDown, Pencil, RefreshCw } from 'lucide-react'
import { ChartView } from './ChartView'
import { getAiSettings } from '../ai-client'
import { chatComplete } from '../ai/llm/chatClient'
import { runSafeQuery } from '../data-engine'
import type { Dataset, Report, ReportBlock } from '../types'

interface ReportsTabProps {
  activeDataset: Dataset | null
  reports: Report[]
  setReports: React.Dispatch<React.SetStateAction<Report[]>>
  activeReportId: string | null
  setActiveReportId: (id: string | null) => void
}

// Basit markdown satır render'ı (# / ## / ### / --- / paragraf). markdown + aiText blokları paylaşır.
function renderMarkdownLines(content?: string) {
  return (content || '').split('\n').map((line, lIdx) => {
    if (line.trim() === '---') return <hr key={lIdx} style={{ border: 0, borderTop: '1px solid var(--border-color)', margin: '14px 0' }} />
    if (line.startsWith('# ')) return <h1 key={lIdx} style={{ fontSize: '26px', color: 'var(--color-primary)', fontWeight: 800, margin: '20px 0 10px', letterSpacing: '-0.03em' }}>{line.slice(2)}</h1>
    if (line.startsWith('## ')) return <h2 key={lIdx} style={{ fontSize: '20px', color: 'var(--text-primary)', fontWeight: 700, margin: '18px 0 8px', letterSpacing: '-0.02em' }}>{line.slice(3)}</h2>
    if (line.startsWith('### ')) return <h3 key={lIdx} style={{ fontSize: '16px', color: 'var(--text-secondary)', fontWeight: 600, margin: '14px 0 6px' }}>{line.slice(4)}</h3>
    return <p key={lIdx} style={{ margin: '0 0 10px' }}>{line}</p>
  })
}

type AddBlockType = 'paragraph' | 'heading' | 'divider' | 'aiText'

// Bloklar arasına/başına/sonuna blok eklemek için hover'lı "+ Blok ekle" çubuğu + menü (baskıda gizli).
function AddBlockBar({ open, onToggle, onAdd, t }: { open: boolean; onToggle: () => void; onAdd: (type: AddBlockType) => void; t: (k: string, o?: any) => string }) {
  const items: { type: AddBlockType; icon: string; label: string }[] = [
    { type: 'paragraph', icon: '¶', label: t('reports.paragraph', { defaultValue: 'Paragraf' }) },
    { type: 'heading', icon: 'H', label: t('reports.heading', { defaultValue: 'Başlık' }) },
    { type: 'aiText', icon: '✨', label: t('reports.aiWriter', { defaultValue: 'AI Yazar' }) },
    { type: 'divider', icon: '—', label: t('reports.divider', { defaultValue: 'Ayraç' }) },
  ]
  return (
    <div className="no-print" style={{ position: 'relative', display: 'flex', justifyContent: 'center', padding: '2px 0' }}>
      <button onClick={onToggle} title={t('reports.addBlock', { defaultValue: 'Blok ekle' })}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 12px', fontSize: '11px', color: 'var(--text-muted)', background: 'transparent', border: '1px dashed var(--border-color)', borderRadius: '999px', cursor: 'pointer', opacity: open ? 1 : 0.6 }}>
        <Plus size={12} /> {t('reports.addBlock', { defaultValue: 'Blok ekle' })}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '28px', zIndex: 20, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '6px', display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '160px', boxShadow: '0 10px 24px rgba(0,0,0,0.3)' }}>
          {items.map(it => (
            <button key={it.type} onClick={() => onAdd(it.type)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 9px', borderRadius: '6px', background: 'transparent', border: 0, color: 'var(--text-primary)', fontSize: '12px', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ width: '20px', textAlign: 'center' }}>{it.icon}</span> {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// HTML (insight) bloğunu İÇERİĞE GÖRE otomatik yükseklikle gösteren iframe.
// iframe içine küçük bir "yükseklik bildirici" script enjekte edilir; iframe kendi
// scrollHeight'ını postMessage ile ebeveyne yollar, ebeveyn de yüksekliği ayarlar.
// sandbox="allow-scripts" (same-origin YOK) altında postMessage çalışır → güvenli + otomatik boyut.
function injectHeightReporter(html: string, frameId: string): string {
  const script = `<script>(function(){function r(){try{var h=Math.max(document.documentElement.scrollHeight||0,document.body?document.body.scrollHeight:0);parent.postMessage({__insightHeight:h,id:${JSON.stringify(frameId)}},'*')}catch(e){}}window.addEventListener('load',r);try{new ResizeObserver(r).observe(document.body)}catch(e){}[150,500,1200].forEach(function(ms){setTimeout(r,ms)})})();<\/script>`
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, script + '</body>')
  if (/<\/html>/i.test(html)) return html.replace(/<\/html>/i, script + '</html>')
  return html + script
}

function AutoHeightHtmlFrame({ html, title, minHeight = 120 }: { html: string; title: string; minHeight?: number }) {
  const [height, setHeight] = useState(minHeight)
  const ref = useRef<HTMLIFrameElement>(null)
  const idRef = useRef('if_' + Math.random().toString(36).slice(2))
  const frameId = idRef.current

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d: any = e.data
      if (!d || d.id !== frameId || typeof d.__insightHeight !== 'number') return
      if (ref.current && e.source && e.source !== ref.current.contentWindow) return // yalnız bu iframe'den
      setHeight(Math.max(minHeight, Math.ceil(d.__insightHeight) + 8))
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [frameId, minHeight])

  return (
    <iframe
      ref={ref}
      title={title}
      sandbox="allow-scripts"
      srcDoc={injectHeightReporter(html, frameId)}
      scrolling="no"
      style={{ width: '100%', height: `${height}px`, border: '1px solid var(--border-color)', borderRadius: '10px', background: 'transparent', display: 'block' }}
    />
  )
}

export function ReportsTab({
  activeDataset,
  reports,
  setReports,
  activeReportId,
  setActiveReportId
}: ReportsTabProps) {
  const { t } = useTranslation()
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [isGeneratingReportSummary, setIsGeneratingReportSummary] = useState(false)
  // Blok ekleme menüsünün nerede açık olduğu ('start' | blok id | null) ve hangi aiText bloğunun üretimde olduğu.
  const [addMenuAt, setAddMenuAt] = useState<string | null>(null)
  const [aiGenBlockId, setAiGenBlockId] = useState<string | null>(null)

  // Report creation modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [newReportName, setNewReportName] = useState('')

  // Aktif rapor yoksa (id null) kütüphane görünümü gösterilir.
  const activeReport = reports.find(r => r.id === activeReportId)

  const handleAddTextBlock = () => {
    if (!activeReport) return
    const newBlock: ReportBlock = {
      id: `text_${Date.now()}`,
      type: 'markdown',
      content: t('reports.newReportParagraph', { defaultValue: 'Rapor paragraf metniniz...' })
    }
    setReports(prev => prev.map(r => 
      r.id === activeReport.id ? { ...r, blocks: [...r.blocks, newBlock] } : r
    ))
  }

  const handleSaveTextBlock = (id: string) => {
    if (!activeReport) return
    setReports(prev => prev.map(r => {
      if (r.id === activeReport.id) {
        return {
          ...r,
          blocks: r.blocks.map(b => b.id === id ? { ...b, content: editingText } : b)
        }
      }
      return r
    }))
    setEditingBlockId(null)
  }

  const handleDeleteBlock = (id: string) => {
    if (!activeReport) return
    setReports(prev => prev.map(r => {
      if (r.id === activeReport.id) {
        return {
          ...r,
          blocks: r.blocks.filter(b => b.id !== id)
        }
      }
      return r
    }))
  }

  // Bloğu yukarı/aşağı taşı (dir: -1 yukarı, +1 aşağı).
  const moveBlock = (id: string, dir: -1 | 1) => {
    if (!activeReport) return
    setReports(prev => prev.map(r => {
      if (r.id !== activeReport.id) return r
      const idx = r.blocks.findIndex(b => b.id === id)
      const to = idx + dir
      if (idx < 0 || to < 0 || to >= r.blocks.length) return r
      const blocks = [...r.blocks]
      const [moved] = blocks.splice(idx, 1)
      blocks.splice(to, 0, moved)
      return { ...r, blocks }
    }))
  }

  // Verilen index'ten SONRA (afterIndex=-1 → başa) tipe göre yeni blok ekle.
  const addBlockAt = (afterIndex: number, type: 'paragraph' | 'heading' | 'divider' | 'aiText') => {
    if (!activeReport) return
    const id = `${type}_${Date.now()}`
    let block: ReportBlock
    if (type === 'heading') block = { id, type: 'markdown', content: '## ' + t('reports.newHeading', { defaultValue: 'Başlık' }) }
    else if (type === 'divider') block = { id, type: 'markdown', content: '---' }
    else if (type === 'aiText') block = { id, type: 'aiText', prompt: '', content: '' }
    else block = { id, type: 'markdown', content: t('reports.newReportParagraph', { defaultValue: 'Rapor paragraf metniniz...' }) }
    setReports(prev => prev.map(r => {
      if (r.id !== activeReport.id) return r
      const blocks = [...r.blocks]
      blocks.splice(afterIndex + 1, 0, block)
      return { ...r, blocks }
    }))
    setAddMenuAt(null)
    if (type === 'aiText') { setEditingBlockId(id); setEditingText('') }
  }

  const updateBlockPrompt = (id: string, prompt: string) => {
    if (!activeReport) return
    setReports(prev => prev.map(r => r.id === activeReport.id
      ? { ...r, blocks: r.blocks.map(b => b.id === id ? { ...b, prompt } : b) }
      : r))
  }

  // Bir aiText bloğu için LLM'den markdown metin üret (rapor/veri bağlamıyla).
  const generateAiTextBlock = async (block: ReportBlock) => {
    if (!activeReport || !block.prompt?.trim()) return
    setAiGenBlockId(block.id)
    try {
      let dataContext = ''
      if (activeDataset) {
        const sample = await runSafeQuery(`SELECT * FROM "${activeDataset.tableName}" LIMIT 3`).catch(() => [])
        const cols = activeDataset.columns.map(c => `${c.name}:${c.kind}`).join(', ')
        dataContext = `\n\nActive table "${activeDataset.name}" columns: ${cols}. Sample rows: ${JSON.stringify(sample)}.`
      }
      const userLang = (typeof navigator !== 'undefined' && navigator.language) || 'tr'
      const resp = await chatComplete({
        messages: [
          { role: 'system', content: `You are a professional data/report analyst. Write clear, well-structured MARKDOWN prose for a report section. Respond in the user's language ("${userLang}"). Return ONLY markdown (no code fences).` },
          { role: 'user', content: `${block.prompt}${dataContext}` },
        ],
        temperature: 0.6,
      })
      let md = (resp.content ?? '').trim()
      if (md.startsWith('```')) md = md.replace(/^```(markdown)?/i, '').replace(/```$/, '').trim()
      setReports(prev => prev.map(r => r.id === activeReport.id
        ? { ...r, blocks: r.blocks.map(b => b.id === block.id ? { ...b, content: md } : b) }
        : r))
    } catch (err: any) {
      setReports(prev => prev.map(r => r.id === activeReport.id
        ? { ...r, blocks: r.blocks.map(b => b.id === block.id ? { ...b, content: `⚠️ ${String(err?.message ?? err)}` } : b) }
        : r))
    } finally {
      setAiGenBlockId(null)
    }
  }

  const handleDeleteReport = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (reports.length <= 1) {
      alert(t('cannotDeleteLastReport', { defaultValue: 'Son kalan raporu silemezsiniz!' }))
      return
    }
    if (confirm(t('confirmDeleteReport', { defaultValue: 'Bu raporu silmek istediğinize emin misiniz?' }))) {
      const remaining = reports.filter(r => r.id !== id)
      setReports(remaining)
      if (activeReportId === id) {
        setActiveReportId(remaining[0].id)
      }
    }
  }

  const handleCreateReport = () => {
    const name = newReportName.trim()
    if (!name) return

    const newReport: Report = {
      id: 'report_' + Date.now(),
      name,
      blocks: [],
      createdAt: new Date().toISOString()
    }

    setReports(prev => [...prev, newReport])
    setActiveReportId(newReport.id)
    setIsCreateModalOpen(false)
    setNewReportName('')
  }

  const handlePrint = () => {
    window.print()
  }

  const handleAiCoWriteReport = async () => {
    if (!activeReport) return
    if (!activeDataset) {
      alert(t('noActiveDatasetForAi', { defaultValue: 'Yapay zeka özeti için önce bir dosya yüklemiş olmalısınız!' }))
      return
    }
    setIsGeneratingReportSummary(true)
    try {
      const chartsInReport = activeReport.blocks
        .filter(b => b.type === 'chart')
        .map(b => b.chart?.title || '')
        .join(', ')

      const dataSampleRows = await runSafeQuery(`SELECT * FROM "${activeDataset.tableName}" LIMIT 3`)
      const dataSample = JSON.stringify(dataSampleRows)

      const prompt = `Lütfen şu anda üzerinde çalıştığım "${activeDataset.name}" tablosu ve rapor içeriği için profesyonel, akıcı ve dikkat çekici bir yönetici özeti (Executive Summary) yaz. 
      Rapordaki aktif grafikler şunlar: ${chartsInReport}.
      Veriden küçük bir örnek satır kümesi: ${dataSample}.
      Raporu hazırlayan şirketin CEO'suna sunulacakmış gibi resmi, analitik ve aksiyona dönüştürülebilir tavsiyeler içeren bir Türkçe rapor paragrafı üret. Sadece markdown metni döndür.`

      const settings = getAiSettings()
      let baseUrl = settings.baseUrl.trim()
      let model = settings.model.trim()
      
      if (settings.provider === 'openai') {
        if (!baseUrl) baseUrl = 'https://api.openai.com/v1'
        if (!model) model = 'gpt-4o-mini'
      } else {
        if (!baseUrl) baseUrl = 'http://localhost:11434'
        if (!model) model = 'llama3'
      }
      
      if (settings.provider === 'openai' || settings.provider === 'ollama') {
        baseUrl = baseUrl.replace(/\/+$/, '')
        if (settings.provider === 'openai') {
          if (!baseUrl.endsWith('/v1')) {
            baseUrl = `${baseUrl}/v1`
          }
        }
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (settings.provider === 'openai' && settings.apiKey) {
        headers['Authorization'] = `Bearer ${settings.apiKey}`
      }

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'Sen profesyonel bir iş analistisin. Sadece markdown dilinde profesyonel rapor metinleri üretirsin.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
        })
      })

      if (!response.ok) {
        throw new Error(`API hatası: ${response.status}`)
      }

      const res = await response.json()
      let summary = res.choices?.[0]?.message?.content || ''
      summary = summary.trim()
      if (summary.startsWith('```')) {
        summary = summary.replace(/^```(markdown)?/, '').replace(/```$/, '').trim()
      }

      setReports(prev => prev.map(r => {
        if (r.id === activeReport.id) {
          return {
            ...r,
            blocks: [
              ...r.blocks,
              {
                id: `ai_${Date.now()}`,
                type: 'markdown',
                content: `${t('reports.aiSummaryTitle', { defaultValue: '🤖 AI Co-Pilot Analiz Raporu\n' })}${summary}`
              }
            ]
          }
        }
        return r
      }))
    } catch (err: any) {
      console.error(err)
      alert((t('reports.aiSummaryFailed', { defaultValue: 'Yapay zeka rapor yazımı başarısız oldu: ' })) + (err.message || String(err)))
    } finally {
      setIsGeneratingReportSummary(false)
    }
  }

  // ---- LIBRARY VIEW: rapor kartları (tıklayınca açılır) ----
  if (!activeReport) {
    return (
      <div style={{ animation: 'fadeIn 0.4s', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <p className="eyebrow">{t('reports.eyebrow', { defaultValue: 'RAPORLAR' })}</p>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>{t('reports.library', { defaultValue: 'Rapor Kütüphanesi' })}</h2>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', background: 'var(--color-primary)', color: 'var(--color-primary-dark)', border: 0, padding: '10px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize: '12px' }}
          >
            <Plus size={14} /> {t('createReportButton', { defaultValue: 'Rapor Oluştur' })}
          </button>
        </div>

        {reports.length === 0 ? (
          <div className="card" style={{ height: '200px', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--border-color)', borderRadius: '16px' }}>
            <FileText size={32} style={{ color: 'var(--text-muted)' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', fontWeight: 600 }}>{t('noReportsYet', { defaultValue: 'Henüz bir rapor oluşturulmadı. Rapor oluştur butonuyla başlayın!' })}</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', marginTop: '10px' }}>
            {reports.map((r) => (
              <div
                key={r.id}
                onClick={() => setActiveReportId(r.id)}
                style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '18px', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-color)', cursor: 'pointer', transition: 'all 0.2s', position: 'relative' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(99, 102, 241, 0.08)' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.boxShadow = 'none' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                    <div style={{ padding: '8px', background: 'var(--bg-tertiary)', borderRadius: '8px', color: 'var(--color-primary)', display: 'grid', placeItems: 'center' }}>
                      <FileText size={16} />
                    </div>
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                      <small style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{t('reports.blocksCount', { count: r.blocks.length, defaultValue: `${r.blocks.length} blok` })}</small>
                    </div>
                  </div>
                  {reports.length > 1 && (
                    <button
                      onClick={(e) => handleDeleteReport(r.id, e)}
                      style={{ background: 'transparent', border: 0, padding: '6px', color: 'var(--text-muted)', display: 'grid', placeItems: 'center', cursor: 'pointer', borderRadius: '6px', transition: 'all 0.2s' }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#ff6b6b')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                      title={t('reports.deleteReport', { defaultValue: 'Raporu Sil' })}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
                <small style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                  {t('reportCreatedOn', { defaultValue: 'Oluşturulma Tarihi:' })} {new Date(r.createdAt).toLocaleDateString()}
                </small>
              </div>
            ))}
          </div>
        )}

        {/* CREATE REPORT MODAL */}
        {isCreateModalOpen && (
          <div className="modal-overlay" style={{ display: 'grid', placeItems: 'center', zIndex: 1100 }}>
            <div className="modal-card" style={{ maxWidth: '420px', width: '100%', padding: '24px', animation: 'scaleUp 0.2s', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>{t('createReportModalTitle', { defaultValue: 'Yeni Rapor Oluştur' })}</h3>
                <button onClick={() => setIsCreateModalOpen(false)} style={{ background: 'transparent', border: 0, color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>{t('reportNameLabel', { defaultValue: 'Rapor Adı' })}</label>
                  <input
                    type="text"
                    placeholder={t('reportNamePlaceholder', { defaultValue: 'örn. Çeyrek Analiz Raporu' })}
                    value={newReportName}
                    onChange={(e) => setNewReportName(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '10px', justifyContent: 'flex-end' }}>
                  <button className="secondary" onClick={() => setIsCreateModalOpen(false)} style={{ padding: '8px 16px', fontSize: '12px', cursor: 'pointer' }}>{t('cancel', { defaultValue: 'İptal' })}</button>
                  <button onClick={handleCreateReport} disabled={!newReportName.trim()} style={{ background: 'var(--color-primary)', color: 'var(--color-primary-dark)', border: 0, borderRadius: '8px', padding: '8px 16px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', opacity: newReportName.trim() ? 1 : 0.5 }}>{t('create', { defaultValue: 'Oluştur' })}</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ---- REPORT VIEW: seçili rapor açık ----
  return (
    <div style={{ animation: 'fadeIn 0.4s' }} className="print-area">
      {/* Geri: rapor kütüphanesine dön */}
      <div className="no-print" style={{ marginBottom: '16px' }}>
        <button
          onClick={() => setActiveReportId(null)}
          className="secondary"
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', margin: 0 }}
        >
          {t('reports.back', { defaultValue: '◀ Geri' })}
        </button>
      </div>

      {/* Report Controls Panel (Hidden in printing) */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', padding: '14px', borderRadius: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button 
            onClick={handleAddTextBlock}
            style={{ background: 'var(--border-strong)', border: 0, padding: '10px 14px', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0 }}
          >
            <Plus size={14} /> {t('reports.addTextBlock')}
          </button>
          <button 
            onClick={() => addBlockAt((activeReport?.blocks.length ?? 1) - 1, 'aiText')}
            style={{ background: 'var(--border-strong)', border: 0, padding: '10px 14px', borderRadius: '8px', color: 'var(--color-primary)', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0 }}
          >
            <Sparkles size={14} /> {t('reports.aiWriter', { defaultValue: 'AI Yazar' })}
          </button>
          <button 
            onClick={handleAiCoWriteReport}
            disabled={isGeneratingReportSummary || !activeDataset}
            style={{ background: 'linear-gradient(135deg, var(--color-primary-dark, #1f42aa), var(--color-secondary, #2c1a8f))', border: 0, padding: '10px 14px', borderRadius: '8px', color: '#65e7bc', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0, opacity: activeDataset ? 1 : 0.5 }}
          >
            {isGeneratingReportSummary ? <LoaderCircle className="spin" size={14} /> : <Sparkles size={14} />}
            {t('reports.aiCoWriteReport')}
          </button>
        </div>
        
        <button 
          onClick={handlePrint}
          style={{ background: 'var(--color-primary)', color: 'var(--color-primary-dark)', border: 0, padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0 }}
        >
          <Printer size={14} /> {t('reports.printOrSavePdf')}
        </button>
      </div>

      {/* Rapor Döküman Gövdesi */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '40px', minHeight: '600px', boxShadow: '0 10px 30px rgba(0, 0, 0, 0.15)' }}>
        <h2 style={{ fontSize: '28px', color: 'var(--text-primary)', fontWeight: 'bold', marginBottom: '8px' }}>{activeReport?.name}</h2>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '30px' }}>
          {t('reportCreatedOn', { defaultValue: 'Oluşturulma Tarihi:' })} {new Date(activeReport?.createdAt).toLocaleDateString()}
        </p>

        {activeReport?.blocks.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)', border: '2px dashed var(--border-color)', borderRadius: '12px', background: 'var(--bg-tertiary)' }}>
            <FileText size={40} style={{ color: 'var(--text-muted)', marginBottom: '12px', opacity: 0.5 }} />
            <p style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>{t('emptyReportMessage', { defaultValue: 'Bu rapor henüz boş. Yukarıdan metin paragrafı ekleyebilir veya panolardan grafik ilave edebilirsiniz!' })}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <AddBlockBar open={addMenuAt === 'start'} onToggle={() => setAddMenuAt(addMenuAt === 'start' ? null : 'start')} onAdd={(ty) => addBlockAt(-1, ty)} t={t} />
            {activeReport?.blocks.map((block, index) => (
              <div 
                key={block.id} 
                style={{ 
                  position: 'relative', 
                  padding: '16px', 
                  borderRadius: '10px', 
                  background: 'var(--bg-tertiary)', 
                  border: '1px solid var(--border-color)',
                  transition: 'border-color 0.2s'
                }}
                className="report-block-card"
              >
                {/* Hover controls for blocks (hidden in print) */}
                <div className="no-print" style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: '6px', zIndex: 10 }}>
                  <button
                    onClick={() => moveBlock(block.id, -1)}
                    disabled={index === 0}
                    title={t('reports.moveUp', { defaultValue: 'Yukarı taşı' })}
                    style={{ background: 'var(--border-strong)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', padding: '4px', cursor: index === 0 ? 'not-allowed' : 'pointer', opacity: index === 0 ? 0.4 : 1, display: 'grid', placeItems: 'center' }}
                  >
                    <ChevronUp size={12} />
                  </button>
                  <button
                    onClick={() => moveBlock(block.id, 1)}
                    disabled={index === (activeReport?.blocks.length ?? 0) - 1}
                    title={t('reports.moveDown', { defaultValue: 'Aşağı taşı' })}
                    style={{ background: 'var(--border-strong)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', padding: '4px', cursor: index === (activeReport?.blocks.length ?? 0) - 1 ? 'not-allowed' : 'pointer', opacity: index === (activeReport?.blocks.length ?? 0) - 1 ? 0.4 : 1, display: 'grid', placeItems: 'center' }}
                  >
                    <ChevronDown size={12} />
                  </button>
                  {(block.type === 'markdown' || block.type === 'aiText') && editingBlockId !== block.id && (
                    <button 
                      onClick={() => { setEditingBlockId(block.id); setEditingText(block.type === 'aiText' ? (block.prompt || '') : (block.content || '')); }}
                      title={t('reports.edit')}
                      style={{ background: 'var(--border-strong)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', padding: '4px', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
                    >
                      <Pencil size={12} />
                    </button>
                  )}
                  <button 
                    onClick={() => handleDeleteBlock(block.id)}
                    title={t('reports.deleteBlock', { defaultValue: 'Bloğu sil' })}
                    style={{ background: '#441d24', border: '1px solid #ff7b8233', borderRadius: '6px', color: '#ffcbd0', padding: '4px', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                {block.type === 'markdown' ? (
                  <div>
                    {editingBlockId === block.id ? (
                      <div>
                        <textarea 
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          style={{ width: '100%', minHeight: '140px', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', padding: '12px', borderRadius: '8px', fontSize: '13px', fontFamily: 'monospace' }}
                        />
                        <div style={{ display: 'flex', gap: '8px', marginTop: '10px', justifyContent: 'flex-end' }}>
                          <button 
                            onClick={() => setEditingBlockId(null)}
                            className="secondary" 
                            style={{ padding: '6px 12px', fontSize: '11px', margin: 0, cursor: 'pointer' }}
                          >
                            {t('reports.cancel')}
                          </button>
                          <button 
                            onClick={() => handleSaveTextBlock(block.id)}
                            style={{ background: 'var(--color-primary)', border: 0, padding: '6px 12px', fontSize: '11px', borderRadius: '6px', color: 'var(--color-primary-dark)', fontWeight: 'bold', margin: 0, cursor: 'pointer' }}
                          >
                            {t('reports.save')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div 
                        onDoubleClick={() => { setEditingBlockId(block.id); setEditingText(block.content || ''); }}
                        style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}
                      >
                        {renderMarkdownLines(block.content)}
                      </div>
                    )}
                  </div>
                ) : block.type === 'insight' ? (
                  <div>
                    {block.title && <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-primary)', marginBottom: '8px' }}><span className="no-print">✨ </span>{block.title}</div>}
                    <AutoHeightHtmlFrame html={block.html || ''} title={block.title || 'AI Insight'} minHeight={140} />
                  </div>
                ) : block.type === 'aiText' ? (
                  <div>
                    {editingBlockId === block.id ? (
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-primary)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}><Sparkles size={13} /> {t('reports.aiWriter', { defaultValue: 'AI Yazar' })}</div>
                        <textarea
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          placeholder={t('reports.aiWriterPrompt', { defaultValue: 'Ne yazmamı istersiniz? (örn. bu rapor için yönetici özeti)' })}
                          style={{ width: '100%', minHeight: '90px', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', padding: '12px', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' }}
                        />
                        <div style={{ display: 'flex', gap: '8px', marginTop: '10px', justifyContent: 'flex-end' }}>
                          <button onClick={() => setEditingBlockId(null)} className="secondary" style={{ padding: '6px 12px', fontSize: '11px', margin: 0, cursor: 'pointer' }}>{t('reports.cancel')}</button>
                          <button
                            onClick={() => { const p = editingText.trim(); updateBlockPrompt(block.id, p); setEditingBlockId(null); if (p) generateAiTextBlock({ ...block, prompt: p }) }}
                            disabled={aiGenBlockId === block.id}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--color-primary)', border: 0, padding: '6px 12px', fontSize: '11px', borderRadius: '6px', color: 'var(--color-primary-dark)', fontWeight: 'bold', margin: 0, cursor: 'pointer' }}
                          >
                            {aiGenBlockId === block.id ? <LoaderCircle className="spin" size={12} /> : <Sparkles size={12} />} {t('reports.generate', { defaultValue: 'Üret' })}
                          </button>
                        </div>
                      </div>
                    ) : aiGenBlockId === block.id ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '12px' }}><LoaderCircle className="spin" size={14} style={{ color: 'var(--color-primary)' }} /> {t('reports.aiWriterWorking', { defaultValue: 'AI yazıyor…' })}</div>
                    ) : block.content ? (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }} className="no-print">
                          <Sparkles size={12} style={{ color: 'var(--color-primary)' }} />
                          <button onClick={() => generateAiTextBlock(block)} title={t('reports.aiWriterRegenerate', { defaultValue: 'Yeniden üret' })} style={{ background: 'transparent', border: 0, color: 'var(--text-muted)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}><RefreshCw size={12} /></button>
                        </div>
                        <div onDoubleClick={() => { setEditingBlockId(block.id); setEditingText(block.prompt || '') }} style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.6 }}>
                          {renderMarkdownLines(block.content)}
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { setEditingBlockId(block.id); setEditingText(block.prompt || '') }} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: 'var(--bg-secondary)', border: '1px dashed var(--border-color)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer' }}>
                        <Sparkles size={14} style={{ color: 'var(--color-primary)' }} /> {t('reports.aiWriterEmpty', { defaultValue: 'İstem girip AI ile yazın' })}
                      </button>
                    )}
                  </div>
                ) : (
                  block.chart && (
                    <div style={{ background: 'var(--bg-tertiary)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                      {block.chart.type === 'kpis' ? (
                        <div style={{ padding: '4px' }}>
                          <h4 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '14px', color: 'var(--text-primary)' }}>{block.chart.title}</h4>
                          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                            {block.chart.data.map((item: any, i: number) => (
                              <div key={i} style={{ display: 'flex', gap: '12px', width: '100%', flexWrap: 'wrap' }}>
                                <div style={{ flex: 1, minWidth: '150px', padding: '12px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
                                  <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--color-primary)' }}>{item.totalRows?.toLocaleString()}</div>
                                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{t('dashboard.totalRows', { defaultValue: 'Toplam Satır' })}</div>
                                </div>
                                {item.numericSum !== undefined && item.numericSum !== null && (
                                  <div style={{ flex: 1, minWidth: '150px', padding: '12px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
                                    <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--color-secondary)' }}>{item.numericSum?.toLocaleString(undefined, { maximumFractionDigits: 1 })}</div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{item.numericSumLabel}</div>
                                  </div>
                                )}
                                {item.uniqueCategories !== undefined && item.uniqueCategories !== null && (
                                  <div style={{ flex: 1, minWidth: '150px', padding: '12px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
                                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#f59e0b' }}>{item.uniqueCategories?.toLocaleString()}</div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{item.uniqueCategoriesLabel}</div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : block.chart.type === 'table' ? (
                        <div style={{ padding: '4px' }}>
                          <h4 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '14px', color: 'var(--text-primary)' }}>{block.chart.title}</h4>
                          <div style={{ maxHeight: '350px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                              <thead>
                                <tr style={{ background: 'var(--bg-secondary)', borderBottom: '2px solid var(--border-color)', position: 'sticky', top: 0, zIndex: 1 }}>
                                  {Object.keys(block.chart.data[0] || {}).map((col) => (
                                    <th key={col} style={{ padding: '10px 14px', fontWeight: 'bold', color: 'var(--text-primary)', background: 'var(--bg-secondary)' }}>{col}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {block.chart.data.map((row: any, rIdx: number) => (
                                  <tr key={rIdx} style={{ borderBottom: '1px solid var(--border-color)', background: rIdx % 2 === 0 ? 'transparent' : 'var(--bg-secondary)' }}>
                                    {Object.keys(row).map((col) => (
                                      <td key={col} style={{ padding: '8px 14px', color: 'var(--text-secondary)' }}>{row[col] !== null ? String(row[col]) : ''}</td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : (
                        <div style={{ height: '360px', minHeight: '360px' }}>
                          <ChartView 
                            type={block.chart.type as any}
                            title={block.chart.title}
                            data={block.chart.data}
                            xAxisKey={block.chart.xAxisKey}
                            yAxisKey={block.chart.yAxisKey}
                          />
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>
            ))}
            <AddBlockBar open={addMenuAt === '__end__'} onToggle={() => setAddMenuAt(addMenuAt === '__end__' ? null : '__end__')} onAdd={(ty) => addBlockAt((activeReport?.blocks.length ?? 1) - 1, ty)} t={t} />
          </div>
        )}
      </div>

      {/* CREATE REPORT MODAL */}
      {isCreateModalOpen && (
        <div className="modal-overlay" style={{ display: 'grid', placeItems: 'center', zIndex: 1100 }}>
          <div className="modal-card" style={{ maxWidth: '420px', width: '100%', padding: '24px', animation: 'scaleUp 0.2s', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>{t('createReportModalTitle', { defaultValue: 'Yeni Rapor Oluştur' })}</h3>
              <button onClick={() => setIsCreateModalOpen(false)} style={{ background: 'transparent', border: 0, color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                  {t('reportNameLabel', { defaultValue: 'Rapor Adı' })}
                </label>
                <input
                  type="text"
                  placeholder={t('reportNamePlaceholder', { defaultValue: 'örn. Çeyrek Analiz Raporu' })}
                  value={newReportName}
                  onChange={(e) => setNewReportName(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px', justifyContent: 'flex-end' }}>
                <button className="secondary" onClick={() => setIsCreateModalOpen(false)} style={{ padding: '8px 16px', fontSize: '12px', cursor: 'pointer' }}>{t('cancel', { defaultValue: 'İptal' })}</button>
                <button
                  onClick={handleCreateReport}
                  disabled={!newReportName.trim()}
                  style={{
                    background: 'var(--color-primary)',
                    color: 'var(--color-primary-dark)',
                    border: 0,
                    borderRadius: '8px',
                    padding: '8px 16px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    opacity: newReportName.trim() ? 1 : 0.5
                  }}
                >
                  {t('create', { defaultValue: 'Oluştur' })}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
