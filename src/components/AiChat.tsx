// components/AiChat.tsx
// AI komut arayüzü. İki mod:
//  - dock: ekranın ALT-ORTASINDA küçük bir input; gönderilen prompt ve AI yanıtı
//          input'un üstünde, yukarı doğru AZALARAK (fade) gösterilir. Ekranı kaplamaz.
//  - sidebar: sağda dikey tam panel; tüm konuşma geçmişi + akış.
// Kullanıcı dock <-> sidebar geçişini toggle ile yapar.

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, X, Send, Square, Trash2, PanelRight, ChevronDown, Undo2, Paperclip, LayoutGrid, Mic } from 'lucide-react'
import { useAgentChat, type ChatEntry } from '../hooks/useAgentChat'
import type { ChatAttachment } from '../ai/attachmentBus'
import { captureWidgetAsImage, captureDashboardAsImage, listCapturableWidgets } from '../utils/widgetCapture'

interface AiChatProps {
  open: boolean
  onClose: () => void
  // Widget/pano kabuğundan iletilen bekleyen ekran görüntüsü eki.
  pendingAttachment?: ChatAttachment | null
  onConsumePending?: () => void
}

export function AiChat({ open, onClose, pendingAttachment, onConsumePending }: AiChatProps) {
  const { t, i18n } = useTranslation()
  const { entries, isRunning, status, awaitingAnswer, send, abort, clear, undo } = useAgentChat()
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<'dock' | 'sidebar'>('dock')
  // Eklenen ekran görüntüsü (base64) + kaynağı; ataç menüsü açık mı; yakalama sürüyor mu.
  const [attachedImage, setAttachedImage] = useState<string | null>(null)
  const [attachedLabel, setAttachedLabel] = useState<string>('')
  const [attachMenuOpen, setAttachMenuOpen] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Mikrofonla konuşma → metin (tarayıcı-yerel Web Speech API). Ek bağımlılık yok.
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<any>(null)
  const speechSupported = typeof window !== 'undefined' && (('SpeechRecognition' in window) || ('webkitSpeechRecognition' in window))

  const stopListening = () => { try { recognitionRef.current?.stop() } catch { /* noop */ } }

  const toggleListening = () => {
    if (!speechSupported) return
    if (listening) { stopListening(); return }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const rec = new SR()
    rec.lang = (i18n.language || 'tr').toLowerCase().startsWith('tr') ? 'tr-TR' : 'en-US'
    rec.interimResults = true
    rec.continuous = false
    const base = input ? input.trimEnd() + ' ' : ''
    rec.onresult = (e: any) => {
      let text = ''
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript
      setInput((base + text).replace(/\s+/g, ' ').trimStart())
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => { setListening(false); recognitionRef.current = null; setTimeout(() => inputRef.current?.focus(), 30) }
    recognitionRef.current = rec
    setListening(true)
    try { rec.start() } catch { setListening(false) }
  }

  // Bileşen kapanınca dinlemeyi durdur.
  useEffect(() => () => stopListening(), [])

  // Widget/pano kabuğundan gelen bekleyen eki tüket: input'a iliştir.
  useEffect(() => {
    if (pendingAttachment) {
      setAttachedImage(pendingAttachment.dataUrl)
      setAttachedLabel(pendingAttachment.label || '')
      onConsumePending?.()
      setTimeout(() => inputRef.current?.focus(), 50)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAttachment])

  // Ataç menüsünden bir widget/pano seç → ekran görüntüsü al → ekle.
  const captureAndAttach = async (kind: 'dashboard' | 'widget', widgetId?: string, label?: string) => {
    setAttachMenuOpen(false)
    if (capturing) return
    setCapturing(true)
    try {
      const img = kind === 'dashboard'
        ? await captureDashboardAsImage()
        : await captureWidgetAsImage(widgetId!)
      if (img) {
        setAttachedImage(img)
        setAttachedLabel(kind === 'dashboard' ? t('ai.wholeDashboard', { defaultValue: 'Tüm pano' }) : (label || ''))
      }
    } finally {
      setCapturing(false)
    }
  }

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open, mode])

  useEffect(() => {
    if (mode === 'sidebar') {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [entries, status, mode])

  if (!open) return null

  const submit = () => {
    const text = input.trim()
    if ((!text && !attachedImage) || isRunning) return
    stopListening()
    const image = attachedImage || undefined
    setInput('')
    setAttachedImage(null)
    setAttachedLabel('')
    void send(text, image)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
    if (e.key === 'Escape') onClose()
  }

  const canSend = (!!input.trim() || !!attachedImage) && !isRunning

  const InputBar = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {/* Eklenen ekran görüntüsü önizlemesi */}
      {attachedImage && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
          <img src={attachedImage} alt="ek" style={{ height: '40px', width: '56px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border-color)' }} />
          <span style={{ flex: 1, fontSize: '11px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {attachedLabel || t('ai.attachedImage', { defaultValue: 'Ekran görüntüsü' })}
          </span>
          <button onClick={() => { setAttachedImage(null); setAttachedLabel('') }} title={t('ai.removeAttachment', { defaultValue: 'Eki kaldır' })} className="icon-button"><X size={13} /></button>
        </div>
      )}

      {/* Ataç menüsü: hangi widget / tüm pano */}
      {attachMenuOpen && (
        <div style={{ maxHeight: '190px', overflowY: 'auto', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <button
            onClick={() => captureAndAttach('dashboard')}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 9px', borderRadius: '6px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
          >
            <LayoutGrid size={14} /> {t('ai.wholeDashboard', { defaultValue: 'Tüm pano' })}
          </button>
          {listCapturableWidgets().map(w => (
            <button
              key={w.id}
              onClick={() => captureAndAttach('widget', w.id, w.label)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 9px', borderRadius: '6px', background: 'transparent', border: '1px solid transparent', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              <Paperclip size={13} /> {w.label}
            </button>
          ))}
          {listCapturableWidgets().length === 0 && (
            <div style={{ padding: '8px', fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>
              {t('ai.noWidgetsToAttach', { defaultValue: 'Panoda eklenebilecek widget yok' })}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
        <button
          onClick={() => setAttachMenuOpen(v => !v)}
          disabled={isRunning || capturing}
          title={t('ai.attach', { defaultValue: 'Widget/pano ekran görüntüsü ekle' })}
          className="icon-button"
          style={{ padding: '10px', borderRadius: '10px', border: '1px solid var(--border-color)', background: attachMenuOpen ? 'var(--border-strong)' : 'var(--bg-tertiary)', color: 'var(--color-primary)', cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }}
        >
          <Paperclip size={16} />
        </button>
        {speechSupported && (
          <button
            onClick={toggleListening}
            disabled={isRunning}
            title={listening ? t('ai.micStop', { defaultValue: 'Dinlemeyi durdur' }) : t('ai.micStart', { defaultValue: 'Mikrofonla yaz (sesle)' })}
            className="icon-button"
            style={{ padding: '10px', borderRadius: '10px', border: '1px solid var(--border-color)', background: listening ? '#ef4444' : 'var(--bg-tertiary)', color: listening ? '#fff' : 'var(--color-primary)', cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }}
          >
            <Mic size={16} />
          </button>
        )}
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={awaitingAnswer
            ? t('ai.answerPlaceholder', { defaultValue: 'Yanıtınızı yazın…' })
            : t('ai.placeholder', { defaultValue: 'Ne yapmak istersiniz? Örn. şehirlere göre başvuru sayısını bar grafik yap' })}
          disabled={isRunning}
          style={{
            flex: 1, resize: 'none', padding: '10px 12px', borderRadius: '10px',
            background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
            color: 'var(--text-primary)', fontSize: '13px', outline: 'none', fontFamily: 'inherit',
            maxHeight: '96px',
          }}
        />
        {isRunning ? (
          <button onClick={abort} title={t('ai.stop', { defaultValue: 'Durdur' })}
            style={{ padding: '10px', borderRadius: '10px', border: 0, background: '#ef4444', color: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
            <Square size={16} />
          </button>
        ) : (
          <button onClick={submit} disabled={!canSend} title={t('ai.send', { defaultValue: 'Gönder' })}
            style={{ padding: '10px', borderRadius: '10px', border: 0, background: 'var(--color-primary)', color: 'var(--color-primary-dark)', cursor: canSend ? 'pointer' : 'not-allowed', opacity: canSend ? 1 : 0.5, display: 'grid', placeItems: 'center' }}>
            <Send size={16} />
          </button>
        )}
      </div>
    </div>
  )

  // ---- DOCK MODE: alt-orta küçük input + yukarı doğru azalan (fade) mesajlar ----
  if (mode === 'dock') {
    // Son birkaç mesajı göster; en yeniler altta, yukarı çıktıkça saydamlaşır.
    const recent = entries.slice(-4)
    return (
      <div className="ai-dock">
        {/* Fade mesaj alanı (input'un üstünde) */}
        {(recent.length > 0 || status) && (
          <div className="ai-dock-stream">
            {recent.map((e, i) => {
              // en eski (üstte) daha soluk; en yeni (altta) net
              const depth = recent.length - 1 - i // 0 = en yeni
              const opacity = Math.max(0.28, 1 - depth * 0.26)
              return <DockLine key={e.id} entry={e} opacity={opacity} />
            })}
            {status && (
              <div className="ai-status" style={{ opacity: 0.9 }}>
                <span className="ai-dot" /> {status}
              </div>
            )}
          </div>
        )}

        {/* Alt-orta input kartı */}
        <div className="ai-dock-bar">
          <div className="ai-dock-head">
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: 'var(--color-primary)' }}>
              <Sparkles size={14} /> {t('ai.title', { defaultValue: 'Data Lens AI' })}
            </span>
            <div style={{ display: 'flex', gap: '2px' }}>
              <button onClick={undo} disabled={isRunning} title={t('ai.undo', { defaultValue: 'Son işlemi geri al' })} className="icon-button"><Undo2 size={14} /></button>
              {entries.length > 0 && (
                <button onClick={clear} disabled={isRunning} title={t('ai.clear', { defaultValue: 'Temizle' })} className="icon-button"><Trash2 size={14} /></button>
              )}
              <button onClick={() => setMode('sidebar')} title={t('ai.toSidebar', { defaultValue: 'Yan panele al' })} className="icon-button"><PanelRight size={14} /></button>
              <button onClick={onClose} title={t('ai.close', { defaultValue: 'Kapat' })} className="icon-button"><X size={15} /></button>
            </div>
          </div>
          {InputBar}
        </div>
      </div>
    )
  }

  // ---- SIDEBAR MODE: sağda dikey panel ----
  return (
    <div className="ai-sidebar">
      <div className="ai-sidebar-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={16} style={{ color: 'var(--color-primary)' }} />
          <span style={{ fontSize: '13px', fontWeight: 700 }}>{t('ai.title', { defaultValue: 'Data Lens AI' })}</span>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button onClick={undo} disabled={isRunning} title={t('ai.undo', { defaultValue: 'Son işlemi geri al' })} className="icon-button"><Undo2 size={15} /></button>
          <button onClick={clear} disabled={isRunning} title={t('ai.clear', { defaultValue: 'Temizle' })} className="icon-button"><Trash2 size={15} /></button>
          <button onClick={() => setMode('dock')} title={t('ai.toDock', { defaultValue: 'Alta al' })} className="icon-button"><ChevronDown size={15} /></button>
          <button onClick={onClose} title={t('ai.close', { defaultValue: 'Kapat' })} className="icon-button"><X size={16} /></button>
        </div>
      </div>

      <div ref={scrollRef} className="ai-sidebar-body">
        {entries.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center', marginTop: '20px' }}>
            {t('ai.empty', { defaultValue: 'Bir istek yazın; asistan panoyu sizin için düzenlesin.' })}
          </div>
        )}
        {entries.map((e) => <ChatBubble key={e.id} entry={e} />)}
        {status && (
          <div className="ai-status">
            <span className="ai-dot" /> {status}
          </div>
        )}
      </div>

      <div className="ai-sidebar-input">{InputBar}</div>
    </div>
  )
}

// Dock modundaki tek satır (fade'li). user/assistant/tool/status.
function DockLine({ entry, opacity }: { entry: ChatEntry; opacity: number }) {
  const base: React.CSSProperties = {
    opacity, transition: 'opacity 0.3s', fontSize: '12px', lineHeight: 1.45,
    padding: '2px 4px', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis',
  }
  if (entry.role === 'user') {
    return (
      <div style={{ ...base, color: 'var(--color-primary)', fontWeight: 700 }}>
        {entry.image && <img src={entry.image} alt="ek" style={{ display: 'block', maxHeight: '56px', borderRadius: '4px', border: '1px solid var(--border-color)', marginBottom: '3px' }} />}
        › {entry.text}
      </div>
    )
  }
  if (entry.role === 'assistant') {
    return <div style={{ ...base, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{entry.text}</div>
  }
  if (entry.role === 'tool') {
    return (
      <div style={{ ...base, color: entry.success ? '#10b981' : '#f59e0b' }}>
        <div>{entry.success ? '✓' : '•'} {entry.text}</div>
        {entry.image && <img src={entry.image} alt="ek" style={{ display: 'block', maxHeight: '70px', borderRadius: '4px', border: '1px solid var(--border-color)', marginTop: '3px' }} />}
        {entry.table && <MiniTable table={entry.table} />}
      </div>
    )
  }
  return <div style={{ ...base, color: 'var(--text-muted)', fontStyle: 'italic' }}>{entry.text}</div>
}

// Sorgu sonucu için kompakt tablo önizlemesi (ilk 10 satır).
function MiniTable({ table }: { table: { columns: string[]; rows: any[] } }) {
  return (
    <div style={{ overflowX: 'auto', marginTop: '4px', border: '1px solid var(--border-color)', borderRadius: '6px', maxHeight: '180px', overflowY: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: '10px', width: '100%' }}>
        <thead>
          <tr>
            {table.columns.map((c) => (
              <th key={c} style={{ textAlign: 'left', padding: '3px 6px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', whiteSpace: 'nowrap', position: 'sticky', top: 0, background: 'var(--bg-tertiary)' }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, i) => (
            <tr key={i}>
              {table.columns.map((c) => (
                <td key={c} style={{ padding: '3px 6px', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{String(r[c] ?? '')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ChatBubble({ entry }: { entry: ChatEntry }) {
  if (entry.role === 'user') {
    return (
      <div style={{ alignSelf: 'flex-end', maxWidth: '85%', background: 'var(--color-primary)', color: 'var(--color-primary-dark)', padding: '8px 12px', borderRadius: '12px 12px 2px 12px', fontSize: '12px', fontWeight: 600 }}>
        {entry.image && <img src={entry.image} alt="ek" style={{ display: 'block', maxWidth: '100%', maxHeight: '120px', borderRadius: '6px', marginBottom: '6px' }} />}
        {entry.text}
      </div>
    )
  }
  if (entry.role === 'assistant') {
    return (
      <div style={{ alignSelf: 'flex-start', maxWidth: '90%', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', padding: '10px 12px', borderRadius: '12px 12px 12px 2px', fontSize: '12px', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
        {entry.text}
      </div>
    )
  }
  if (entry.role === 'tool') {
    return (
      <div style={{ alignSelf: 'flex-start', maxWidth: '95%', paddingLeft: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: entry.success ? '#10b981' : '#f59e0b' }}>
          <span>{entry.success ? '✓' : '•'}</span> {entry.text}
        </div>
        {entry.image && <img src={entry.image} alt="ek" style={{ display: 'block', maxWidth: '100%', maxHeight: '140px', borderRadius: '6px', border: '1px solid var(--border-color)', marginTop: '4px' }} />}
        {entry.table && <MiniTable table={entry.table} />}
      </div>
    )
  }
  return (
    <div style={{ alignSelf: 'center', fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>{entry.text}</div>
  )
}

export default AiChat
