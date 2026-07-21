import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageSquareText, LoaderCircle, Play, Sparkles, ShieldCheck, Eye, AreaChart, Plus, Trash2, RefreshCw, X, LayoutGrid } from 'lucide-react'
import { ChartView } from './ChartView'
import { runSafeQuery, sqlName } from '../data-engine'
import { requestSqlFromPrompt } from '../ai/sql'
import { WidgetShell, MaximizedWidgetBody } from './dashboard/WidgetShell'
import { instanceToWidget } from './dashboard/WidgetRegistry'
import { AddWidgetModal } from './dashboard/AddWidgetModal'
import type { WidgetContext } from './dashboard/types'
import type { Dataset, SqlCard, WidgetInstance, Dashboard, ColumnProfile } from '../types'

interface SqlLabTabProps {
  activeDataset?: Dataset
  datasets: Dataset[]
  isDbReady: boolean
  addChartToReport: (type: string, title: string, data: any[], xAxisKey: string, yAxisKey: string) => void
  addInsightToReport?: (title: string, html: string) => void
  sqlCards: SqlCard[]
  setSqlCards: React.Dispatch<React.SetStateAction<SqlCard[]>>
}

const uid = () => 'sql_' + (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2))
const viewNameForId = (id: string) => `sqllab_v_${id.replace(/[^a-zA-Z0-9_]/g, '')}`

// Sorgu sonucundan sözde-dataset (widget'ların kaynak "tablo"su = materyalize view) üret.
function inferColumns(rows: any[]): ColumnProfile[] {
  if (!rows[0]) return []
  return Object.keys(rows[0]).map(name => {
    const v = rows.find(r => r[name] !== null && r[name] !== undefined)?.[name]
    const kind = typeof v === 'number' ? 'number' : (typeof v === 'boolean' ? 'boolean' : 'string')
    return { name, kind: kind as any, nonEmptyCount: rows.length, emptyCount: 0, uniqueCount: 0, sample: String(v ?? '') }
  })
}

export function SqlLabTab({ activeDataset, datasets, isDbReady, addChartToReport, addInsightToReport, sqlCards, setSqlCards }: SqlLabTabProps) {
  const { t } = useTranslation()
  const [newPrompt, setNewPrompt] = useState('')
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set())
  const [aiIds, setAiIds] = useState<Set<string>>(new Set())
  const [addWidgetForCard, setAddWidgetForCard] = useState<string | null>(null)
  const [maximized, setMaximized] = useState<{ cardId: string; widgetId: string } | null>(null)
  const reportActionsRef = useRef<Map<string, () => void>>(new Map())

  const table = activeDataset?.tableName || ''

  const patchCard = (id: string, patch: Partial<SqlCard>) => setSqlCards(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)))
  const setBusy = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string, on: boolean) =>
    setter(prev => { const n = new Set(prev); if (on) n.add(id); else n.delete(id); return n })

  // Kartın SQL'ini DuckDB view'ına materyalize et (widget'lar bu view'ı kaynak alır).
  const ensureViewSql = async (cardId: string, sql: string) => {
    if (!sql.trim()) return
    try { await runSafeQuery(`CREATE OR REPLACE VIEW ${sqlName(viewNameForId(cardId))} AS ${sql}`) }
    catch (e) { console.error('SQL Lab view oluşturma hatası:', e) }
  }

  const runSqlText = async (id: string, sqlText: string) => {
    if (!isDbReady || !sqlText.trim()) return
    setBusy(setRunningIds, id, true)
    patchCard(id, { error: null })
    try {
      const rows = await runSafeQuery(sqlText)
      const keys = rows[0] ? Object.keys(rows[0]) : []
      const numeric = keys.find(k => typeof rows[0]?.[k] === 'number')
      // Widget'lı kartlarda view'ı da tazele (yeniden yürütme sonuçları güncellesin).
      let hadWidgets = false
      setSqlCards(prev => prev.map(c => {
        if (c.id !== id) return c
        hadWidgets = !!(c.widgets && c.widgets.length)
        return {
          ...c, results: rows, error: null,
          xKey: c.xKey && keys.includes(c.xKey) ? c.xKey : (keys[0] || ''),
          yKey: c.yKey && keys.includes(c.yKey) ? c.yKey : (numeric || keys[1] || keys[0] || ''),
          runVersion: (c.runVersion || 0) + 1,
        }
      }))
      if (hadWidgets) await ensureViewSql(id, sqlText)
    } catch (err: any) {
      patchCard(id, { results: null, error: err?.message || String(err) })
    } finally {
      setBusy(setRunningIds, id, false)
    }
  }

  const generateForCard = async (card: SqlCard) => {
    if (!card.prompt.trim() || datasets.length === 0) return
    setBusy(setAiIds, card.id, true)
    patchCard(card.id, { error: null })
    try {
      const sql = await requestSqlFromPrompt(card.prompt, datasets, table || undefined)
      patchCard(card.id, { sql })
      await runSqlText(card.id, sql)
    } catch (err: any) {
      patchCard(card.id, { error: err?.message || String(err) })
    } finally {
      setBusy(setAiIds, card.id, false)
    }
  }

  const addCard = async (fromPrompt: boolean) => {
    const p = fromPrompt ? newPrompt.trim() : ''
    const id = uid()
    const card: SqlCard = {
      id, title: p || (activeDataset ? activeDataset.name : 'SQL'), prompt: p,
      sql: activeDataset ? `SELECT * FROM "${table}" LIMIT 100` : '',
      results: null, error: null, view: 'table', chartType: 'bar', xKey: '', yKey: '', widgets: [], runVersion: 0,
    }
    setSqlCards(prev => [card, ...prev])
    if (fromPrompt) setNewPrompt('')
    if (p && datasets.length) await generateForCard({ ...card })
  }

  const deleteCard = (id: string) => setSqlCards(prev => prev.filter(c => c.id !== id))
  const removeWidgetFromCard = (cardId: string, widgetId: string) =>
    setSqlCards(prev => prev.map(c => c.id === cardId ? { ...c, widgets: (c.widgets || []).filter(w => w.id !== widgetId) } : c))

  const openAddWidget = async (card: SqlCard) => {
    await ensureViewSql(card.id, card.sql) // widget'lar sorgulamadan önce view var olmalı
    setAddWidgetForCard(card.id)
  }
  const handleAddWidget = (cardId: string, instance: WidgetInstance) =>
    setSqlCards(prev => prev.map(c => c.id === cardId ? { ...c, widgets: [...(c.widgets || []), instance] } : c))

  // Bir kart için sözde-dataset + widget bağlamı (fake dashboard adaptörü) kur.
  const buildContext = (card: SqlCard): { ctx: WidgetContext; pseudo: Dataset } => {
    const viewName = viewNameForId(card.id)
    const rows = card.results || []
    const pseudo: Dataset = {
      name: card.title || viewName, tableName: viewName, totalRows: rows.length,
      headers: rows[0] ? Object.keys(rows[0]) : [], rows: [], columns: inferColumns(rows),
    }
    const fakeDash: Dashboard = {
      id: card.id, name: card.title, linkedTableNames: [viewName], activeFilters: {}, filters: [], relationships: [],
      widgets: card.widgets || [], instancesOnly: true,
      dbBarX: '', dbBarY: '', dbBarType: 'bar', dbLineX: '', dbLineY: '', dbLineType: 'line',
    }
    const ctx: WidgetContext = {
      t, activeDataset: pseudo, datasets: [pseudo], detectedColumns: {}, activeDashboard: fakeDash,
      setDashboards: ((updater: any) => {
        const next = typeof updater === 'function' ? updater([fakeDash]) : updater
        const nd = Array.isArray(next) ? next.find((d: any) => d.id === card.id) : null
        if (nd) patchCard(card.id, { widgets: nd.widgets ?? [] })
      }) as any,
      addChartToReport, addInsightToReport,
      onMaximizeWidget: (wid: string) => setMaximized({ cardId: card.id, widgetId: wid }),
      filters: [], relationships: [], toggleStructuredFilter: () => {}, isDbReady,
      reportActions: reportActionsRef,
    }
    return { ctx, pseudo }
  }

  const promptDisabled = !isDbReady || datasets.length === 0

  return (
    <div style={{ animation: 'fadeIn 0.4s', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Composer */}
      <section className="card" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MessageSquareText size={18} /> {t('sqlLab', { defaultValue: 'SQL Lab' })}
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
          {t('sqlLab.copy', { defaultValue: 'Doğal dille yazın; AI tüm tablolarınıza göre (gerekirse JOIN ile) SQL yazsın. Sorgular kart olarak saklanır; sonuca widget (KPI, grafik, AI İçgörü) ekleyebilirsiniz.' })}
        </p>
        <textarea
          value={newPrompt}
          onChange={(e) => setNewPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addCard(true) }}
          placeholder={t('sqlLab.promptPlaceholder', { defaultValue: 'Örn. müşterileri siparişleriyle birleştirip şehir başına toplam ciroyu getir' })}
          disabled={promptDisabled}
          style={{ width: '100%', minHeight: '70px', resize: 'vertical', padding: '12px', borderRadius: '10px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none', fontFamily: 'inherit' }}
        />
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button onClick={() => addCard(true)} disabled={promptDisabled || !newPrompt.trim()}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--color-primary)', color: 'var(--color-primary-dark)', border: 0, padding: '10px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', opacity: (promptDisabled || !newPrompt.trim()) ? 0.5 : 1 }}>
            <Sparkles size={16} /> {t('sqlLab.aiWrite', { defaultValue: 'AI ile Sorgu Yaz' })}
          </button>
          <button onClick={() => addCard(false)} disabled={!isDbReady || !activeDataset} className="secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}>
            <Plus size={16} /> {t('sqlLab.blankCard', { defaultValue: 'Boş Sorgu Kartı' })}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
          <ShieldCheck size={14} /> {t('localQueries', { defaultValue: 'Sorgular yalnızca tarayıcınızda (yerel DuckDB) çalışır.' })}
        </div>
      </section>

      {sqlCards.length === 0 && (
        <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border-color)' }}>
          {t('sqlLab.empty', { defaultValue: 'Henüz sorgu kartı yok. Yukarıdan bir istem yazın ya da boş kart ekleyin.' })}
        </div>
      )}

      {sqlCards.map((card) => {
        const running = runningIds.has(card.id)
        const aiBusy = aiIds.has(card.id)
        const cols = card.results && card.results[0] ? Object.keys(card.results[0]) : []
        const ctxObj = (card.widgets && card.widgets.length) ? buildContext(card) : null
        return (
          <section key={card.id} className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                {card.prompt ? <Sparkles size={15} style={{ color: 'var(--color-primary)', flexShrink: 0 }} /> : <MessageSquareText size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.prompt || card.title}</span>
              </div>
              <button onClick={() => deleteCard(card.id)} title={t('delete', { defaultValue: 'Sil' })} className="icon-button" style={{ color: '#ff7b82' }}><Trash2 size={14} /></button>
            </div>

            <textarea value={card.sql} onChange={(e) => patchCard(card.id, { sql: e.target.value })} placeholder={`SELECT * FROM "${table}" LIMIT 100`} disabled={!isDbReady}
              style={{ width: '100%', minHeight: '90px', resize: 'vertical', fontFamily: 'monospace', fontSize: '12px', padding: '12px', borderRadius: '8px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', outline: 'none' }} />

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button onClick={() => runSqlText(card.id, card.sql)} disabled={!isDbReady || running || !card.sql.trim()}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--color-primary)', color: 'var(--color-primary-dark)', border: 0, padding: '8px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
                {running ? <LoaderCircle className="spin" size={14} /> : <Play size={14} />} {card.results ? t('sqlLab.rerun', { defaultValue: 'Yeniden Yürüt' }) : t('runQuery', { defaultValue: 'Çalıştır' })}
              </button>
              {card.prompt && datasets.length > 0 && (
                <button onClick={() => generateForCard(card)} disabled={aiBusy} className="secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
                  {aiBusy ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />} {t('sqlLab.aiRewrite', { defaultValue: 'AI ile Yeniden Yaz' })}
                </button>
              )}
              {card.results && card.results.length > 0 && (
                <button onClick={() => openAddWidget(card)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', background: 'var(--border-strong)', border: '1px solid var(--border-color)', color: 'var(--color-primary)' }}>
                  <LayoutGrid size={14} /> {t('sqlLab.addWidget', { defaultValue: 'Widget Ekle (KPI / grafik / AI İçgörü)' })}
                </button>
              )}
              {card.results && card.results.length > 0 && (
                <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '3px', border: '1px solid var(--border-color)', marginLeft: 'auto' }}>
                  <button onClick={() => patchCard(card.id, { view: 'table' })} style={{ background: card.view === 'table' ? 'var(--border-strong)' : 'transparent', color: card.view === 'table' ? 'var(--color-primary)' : 'var(--text-secondary)', border: 0, padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}><Eye size={13} /> {t('tableView', { defaultValue: 'Tablo' })}</button>
                  <button onClick={() => patchCard(card.id, { view: 'chart' })} style={{ background: card.view === 'chart' ? 'var(--border-strong)' : 'transparent', color: card.view === 'chart' ? 'var(--color-primary)' : 'var(--text-secondary)', border: 0, padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}><AreaChart size={13} /> {t('dynamicChart', { defaultValue: 'Grafik' })}</button>
                </div>
              )}
            </div>

            {card.error && (
              <div style={{ display: 'flex', gap: '10px', background: 'rgba(255,123,130,0.1)', border: '1px solid #ff7b8244', padding: '12px', borderRadius: '10px', color: '#ffcbd0', fontSize: '12px' }}>
                <X size={16} style={{ flexShrink: 0, color: '#ff7b82' }} />
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{card.error}</pre>
              </div>
            )}

            {card.results && card.results.length > 0 && card.view === 'table' && (
              <div style={{ overflowX: 'auto', background: 'var(--bg-input)', borderRadius: '10px', border: '1px solid var(--border-color)', maxHeight: '420px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                  <thead><tr style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-color)', position: 'sticky', top: 0 }}>{cols.map((h) => <th key={h} style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--color-primary)', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {card.results.slice(0, 200).map((row, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)', background: idx % 2 === 0 ? 'transparent' : 'var(--bg-secondary)' }}>
                        {cols.map((c) => <td key={c} style={{ padding: '8px 14px', color: 'var(--text-secondary)' }}>{typeof row[c] === 'object' && row[c] !== null ? JSON.stringify(row[c]) : String(row[c] ?? '—')}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {card.results && card.results.length > 0 && card.view === 'chart' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', background: 'var(--bg-tertiary)', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                  <select value={card.chartType} onChange={(e) => patchCard(card.id, { chartType: e.target.value as any })} style={selStyle}>
                    <option value="bar">{t('barChart', { defaultValue: 'Bar' })}</option>
                    <option value="line">{t('lineChart', { defaultValue: 'Çizgi' })}</option>
                    <option value="pie">{t('pieChart', { defaultValue: 'Pasta' })}</option>
                  </select>
                  <select value={card.xKey} onChange={(e) => patchCard(card.id, { xKey: e.target.value })} style={selStyle}>{cols.map(k => <option key={k} value={k}>X: {k}</option>)}</select>
                  <select value={card.yKey} onChange={(e) => patchCard(card.id, { yKey: e.target.value })} style={selStyle}>{cols.map(k => <option key={k} value={k}>Y: {k}</option>)}</select>
                  <button onClick={() => addChartToReport(card.chartType, card.prompt || card.title, card.results!, card.xKey, card.yKey)} title={t('dashboard.addToReport', { defaultValue: 'Rapora Ekle' })}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', background: 'var(--border-strong)', border: '1px solid var(--border-color)', color: 'var(--color-primary)', fontWeight: 'bold', fontSize: '12px', borderRadius: '6px', cursor: 'pointer' }}>
                    <Plus size={15} /> {t('sqlLab.toReport', { defaultValue: 'Rapora' })}
                  </button>
                </div>
                <div style={{ height: '360px' }}>
                  <ChartView type={card.chartType} title={card.prompt || card.title} data={card.results} xAxisKey={card.xKey} yAxisKey={card.yKey} />
                </div>
              </div>
            )}

            {/* View'a bağlı widget'lar (KPI / grafik / AI İçgörü) */}
            {ctxObj && card.widgets && card.widgets.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '12px', marginTop: '4px' }}>
                {card.widgets.map(inst => (
                  <div key={`${inst.id}_${card.runVersion || 0}`} style={{ height: '280px', display: 'flex' }}>
                    <WidgetShell widget={instanceToWidget(inst)} context={ctxObj.ctx} onRemove={(id) => removeWidgetFromCard(card.id, id)} />
                  </div>
                ))}
              </div>
            )}
          </section>
        )
      })}

      {/* Widget ekleme modalı (view sözde-dataset'i ile) */}
      {addWidgetForCard && (() => {
        const card = sqlCards.find(c => c.id === addWidgetForCard)
        if (!card) return null
        const { pseudo } = buildContext(card)
        return <AddWidgetModal dataset={pseudo} isDbReady={isDbReady} onClose={() => setAddWidgetForCard(null)} onAdd={(inst) => { handleAddWidget(card.id, inst); setAddWidgetForCard(null) }} />
      })()}

      {/* Widget büyüt (maximize) overlay */}
      {maximized && (() => {
        const card = sqlCards.find(c => c.id === maximized.cardId)
        const inst = card?.widgets?.find(w => w.id === maximized.widgetId)
        if (!card || !inst) return null
        const { ctx } = buildContext(card)
        return (
          <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)', display: 'flex', flexDirection: 'column', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
              <button onClick={() => setMaximized(null)} className="icon-button" style={{ color: '#fff' }}><X size={20} /></button>
            </div>
            <div className="card" style={{ flex: 1, minHeight: 0, padding: '16px', display: 'flex', flexDirection: 'column' }}>
              <MaximizedWidgetBody widget={instanceToWidget(inst)} context={ctx} />
            </div>
          </div>
        )
      })()}
    </div>
  )
}

const selStyle: React.CSSProperties = { width: '100%', padding: '8px', background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '12px', outline: 0 }

export default SqlLabTab
