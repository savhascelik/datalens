import { useRef, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, ShieldCheck, Settings, LayoutGrid, MessageSquareText, Database, FileText, Upload, FileUp, LoaderCircle, Sun, Moon, Trash2, Plus, X } from 'lucide-react'

// Modular components imports
import { FilesTab } from './components/FilesTab'
import { DashboardTab } from './components/DashboardTab'
import { SqlLabTab } from './components/SqlLabTab'
import { ReportsTab } from './components/ReportsTab'
import { SettingsModal } from './components/SettingsModal'
import { AiChat } from './components/AiChat'
import { IntroJourney } from './components/IntroJourney'
import { buildDefaultInstanceWidgets } from './components/dashboard/defaultWidgets'
import { onChatAttachment, type ChatAttachment } from './ai/attachmentBus'
import { importFile, importGoogleSheet, getVirtualFileBytes, rehydrateLocalDataset, dropTable } from './data-engine'
import { saveDatasetToLocal, getAllLocalDatasets, deleteLocalDataset } from './db-store'
import type { Dataset, ImportProgress, Dashboard, Report, ReportBlock, SqlCard } from './types'
import { publishBridge } from './ai/appBridge'
import { registerAllCapabilities } from './ai/capabilities/defs'

function App() {
  const { t, i18n } = useTranslation()
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [activeDataset, setActiveDataset] = useState<Dataset | null>(null)
  const [dragging, setDragging] = useState(false)
  const [message, setMessage] = useState('')
  
  // DuckDB & Import States
  const [isDbReady, setIsDbReady] = useState(false)
  const [dbLoading, setDbLoading] = useState(false)
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null)
  
  // Google Sheets URL State
  const [sheetUrl, setSheetUrl] = useState('')
  
  // Collapsible Upload drawer state in active workspace
  const [showImportBox, setShowImportBox] = useState(false)

  // Workspace Navigation Tab State
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<'files' | 'dashboard' | 'sqllab' | 'reports'>('files')

  // Global Named Reports and Dashboards State
  // Kalıcılık: tarayıcıda localStorage'da saklanır (dataset'ler IndexedDB'de).
  const [reports, setReports] = useState<Report[]>(() => {
    try {
      const saved = localStorage.getItem('data-lens-reports')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  // SQL Lab sorgu kartları (oturum-içi kalıcı; sekmeler arası korunur).
  const [sqlCards, setSqlCards] = useState<SqlCard[]>([])
  const [activeReportId, setActiveReportId] = useState<string | null>(
    () => localStorage.getItem('data-lens-active-report') || null
  )

  const [dashboards, setDashboards] = useState<Dashboard[]>(() => {
    try {
      const saved = localStorage.getItem('data-lens-dashboards')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [activeDashboardId, setActiveDashboardId] = useState<string | null>(
    () => localStorage.getItem('data-lens-active-dashboard') || null
  )

  // Workspace (dataset'ler) IndexedDB'den yüklendi mi? Yüklenene kadar
  // dashboard/rapor temizleme mantığı çalışmamalı (aksi halde kalıcı panolar silinir).
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false)

  const [pendingChartToAdd, setPendingChartToAddToReport] = useState<
    | { kind: 'chart'; type: string; title: string; data: any[]; xAxisKey: string; yAxisKey: string }
    | { kind: 'insight'; title: string; html: string }
    | null
  >(null)

  // Settings Modal state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  // AI chat açık mı
  const [isAiOpen, setIsAiOpen] = useState(false)
  // Widget/pano ekran görüntüsü sohbete iletilince: sohbeti aç + AiChat'e bekleyen ek olarak ver.
  const [pendingAttachment, setPendingAttachment] = useState<ChatAttachment | null>(null)
  useEffect(() => onChatAttachment((a) => {
    setPendingAttachment(a)
    setIsAiOpen(true)
  }), [])

  // Light/Dark Theme Switcher State
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('theme') as 'dark' | 'light'
    return saved || 'dark'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  // --- AI Capability köprüsü ---
  // Güncel state'i her zaman okuyabilmek için ref'lerde tut (bridge closure eskimesin).
  const datasetsRef = useRef(datasets)
  const dashboardsRef = useRef(dashboards)
  const activeDashboardIdRef = useRef(activeDashboardId)
  const reportsRef = useRef(reports)
  const activeReportIdRef = useRef(activeReportId)
  const activeTabRef = useRef(activeWorkspaceTab)
  useEffect(() => { datasetsRef.current = datasets }, [datasets])
  useEffect(() => { dashboardsRef.current = dashboards }, [dashboards])
  useEffect(() => { activeDashboardIdRef.current = activeDashboardId }, [activeDashboardId])
  useEffect(() => { reportsRef.current = reports }, [reports])
  useEffect(() => { activeReportIdRef.current = activeReportId }, [activeReportId])
  useEffect(() => { activeTabRef.current = activeWorkspaceTab }, [activeWorkspaceTab])

  // Köprüyü yayınla + yetenekleri kaydet (bir kez).
  useEffect(() => {
    publishBridge({
      getDatasets: () => datasetsRef.current,
      getDashboards: () => dashboardsRef.current,
      getActiveDashboardId: () => activeDashboardIdRef.current,
      getReports: () => reportsRef.current,
      getActiveReportId: () => activeReportIdRef.current,
      getActiveTab: () => activeTabRef.current,
      setDatasets: (updater) => setDatasets(prev => updater(prev)),
      setDashboards: (updater) => setDashboards(prev => updater(prev)),
      setActiveDashboardId: (id) => setActiveDashboardId(id),
      setReports: (updater) => setReports(prev => updater(prev)),
      setActiveReportId: (id) => setActiveReportId(id),
      setActiveTab: (tab) => setActiveWorkspaceTab(tab),
    })
    registerAllCapabilities()
  }, [])

  // Cmd/Ctrl+K ile AI komut arayüzünü aç/kapat
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setIsAiOpen(v => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Dashboard ve rapor durumunu localStorage'a kaydet (kalıcılık).
  useEffect(() => {
    try { localStorage.setItem('data-lens-dashboards', JSON.stringify(dashboards)) } catch (e) { console.warn('Dashboard kaydedilemedi', e) }
  }, [dashboards])

  useEffect(() => {
    if (activeDashboardId) localStorage.setItem('data-lens-active-dashboard', activeDashboardId)
    else localStorage.removeItem('data-lens-active-dashboard')
  }, [activeDashboardId])

  useEffect(() => {
    try { localStorage.setItem('data-lens-reports', JSON.stringify(reports)) } catch (e) { console.warn('Rapor kaydedilemedi', e) }
  }, [reports])

  useEffect(() => {
    if (activeReportId) localStorage.setItem('data-lens-active-report', activeReportId)
    else localStorage.removeItem('data-lens-active-report')
  }, [activeReportId])

  // On App startup, initialize database and load any locally saved datasets
  useEffect(() => {
    const initWorkspace = async () => {
      try {
        setDbLoading(true)
        const saved = await getAllLocalDatasets()
        if (saved.length > 0) {
          for (const item of saved) {
            await rehydrateLocalDataset(item.tableName, item.parquetBytes)
          }
          const activeDSList = saved.map(item => ({
            name: item.fileName,
            tableName: item.tableName,
            totalRows: item.totalRows,
            headers: item.headers,
            columns: item.columns,
            rows: item.rows
          }))
          setDatasets(activeDSList)
          setActiveDataset(activeDSList[0])
          setIsDbReady(true)
        }
      } catch (err) {
        console.error('Error rehydrating workspace:', err)
      } finally {
        setDbLoading(false)
        setWorkspaceLoaded(true)
      }
    }
    initWorkspace()
  }, [])

  const handleDeleteDataset = async (tableName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(t('confirmDeleteDataset', { defaultValue: 'Bu veri setini kalıcı olarak silmek istediğinize emin misiniz?' }))) {
      return
    }
    try {
      setDbLoading(true)
      await deleteLocalDataset(tableName)
      await dropTable(tableName)
      const remaining = datasets.filter(d => d.tableName !== tableName)
      setDatasets(remaining)
      if (activeDataset?.tableName === tableName) {
        setActiveDataset(remaining[0] || null)
      }
    } catch (err) {
      console.error('Error deleting dataset:', err)
    } finally {
      setDbLoading(false)
    }
  }

  const inputRef = useRef<HTMLInputElement>(null)

  // Load dynamically translated steps array
  const steps = t('steps', { returnObjects: true }) as string[]

  // Sync / Initialize default dashboard and default report when datasets are available
  useEffect(() => {
    if (datasets.length > 0) {
      if (dashboards.length === 0) {
        const { widgets, rglLayout } = buildDefaultInstanceWidgets(datasets[0])
        const defaultDash: Dashboard = {
          id: 'default_dash',
          name: t('defaultDashboard', { defaultValue: 'Genel Bakış Panosu' }),
          linkedTableNames: [datasets[0].tableName],
          activeFilters: {},
          // Yeni model: hazır dashboard artık instance widget'larıyla (KPI/bar/line/tablo) gelir.
          instancesOnly: true,
          widgets,
          rglLayout,
          dbBarX: '',
          dbBarY: '',
          dbBarType: 'bar',
          dbLineX: '',
          dbLineY: '',
          dbLineType: 'line'
        }
        setDashboards([defaultDash])
        setActiveDashboardId('default_dash')
      }
      
      if (reports.length === 0) {
        const defaultReport: Report = {
          id: 'default_report',
          name: t('defaultReport', { defaultValue: 'Genel Analiz Raporu' }),
          blocks: [
            {
              id: 'welcome_block',
              type: 'markdown',
              content: t('reports.welcomeContent', { defaultValue: '# Veri Analiz Raporu\nYapay Zeka destekli Data Lens AI ile oluşturulmuş profesyonel analiz belgesi.' })
            }
          ],
          createdAt: new Date().toISOString()
        }
        setReports([defaultReport])
        setActiveReportId('default_report')
      }
    } else if (workspaceLoaded) {
      // Yalnızca workspace yüklendikten sonra ve gerçekten dataset yoksa temizle.
      setDashboards([])
      setActiveDashboardId(null)
      setReports([])
      setActiveReportId(null)
    }
  }, [datasets, workspaceLoaded])

  const addChartToReport = (type: string, title: string, data: any[], xAxisKey: string, yAxisKey: string) => {
    setPendingChartToAddToReport({ kind: 'chart', type, title, data, xAxisKey, yAxisKey })
  }

  // AI İçgörü kartının o anki render edilmiş HTML'ini rapora ekle (snapshot).
  const addInsightToReport = (title: string, html: string) => {
    setPendingChartToAddToReport({ kind: 'insight', title, html })
  }

  // Bekleyen ödeme (chart|insight) → eklenecek ReportBlock üret.
  const buildPendingReportBlock = (): ReportBlock | null => {
    const p = pendingChartToAdd
    if (!p) return null
    if (p.kind === 'insight') {
      return { id: `insight_block_${Date.now()}`, type: 'insight', content: '', title: p.title, html: p.html }
    }
    return {
      id: `chart_block_${Date.now()}`,
      type: 'chart',
      content: '',
      chart: { type: p.type, title: p.title, data: p.data, xAxisKey: p.xAxisKey, yAxisKey: p.yAxisKey },
    }
  }

  const loadFile = async (file?: File) => {
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext !== 'csv' && ext !== 'xlsx' && ext !== 'xls' && ext !== 'parquet' && ext !== 'json') {
      setMessage(t('errors.unsupportedFormat'))
      return
    }
    
    try {
      setDbLoading(true)
      setIsDbReady(false)
      setMessage('')
      
      const results = await importFile(file, t, (progress) => {
        setImportProgress(progress)
      })
      
      const updatedDatasets = [...datasets]
      for (const ds of results) {
        const bytes = await getVirtualFileBytes(`/imports/${ds.tableName}.parquet`)
        await saveDatasetToLocal(ds, bytes)
        if (!updatedDatasets.some(x => x.tableName === ds.tableName)) {
          updatedDatasets.push(ds)
        }
      }
      
      setDatasets(updatedDatasets)
      setActiveDataset(results[0] || activeDataset || null)
      setIsDbReady(true)
    } catch (err: any) {
      console.error(err)
      let errorMsg = ''
      if (err.message === 'UNSUPPORTED_FORMAT') {
        errorMsg = t('errors.unsupportedFormat')
      } else if (err.message === 'EMPTY_DOCUMENT') {
        errorMsg = t('errors.emptyDocument')
      } else {
        errorMsg = t('errors.generalError', { error: err.message || String(err) })
      }
      setMessage(errorMsg)
    } finally {
      setDbLoading(false)
      setImportProgress(null)
    }
  }

  const handleLoadGoogleSheet = async () => {
    if (!sheetUrl.trim()) return
    try {
      setDbLoading(true)
      setIsDbReady(false)
      setMessage('')
      
      const results = await importGoogleSheet(sheetUrl, t, (progress) => {
        setImportProgress(progress)
      })
      
      const updatedDatasets = [...datasets]
      for (const ds of results) {
        const bytes = await getVirtualFileBytes(`/imports/${ds.tableName}.parquet`)
        await saveDatasetToLocal(ds, bytes)
        if (!updatedDatasets.some(x => x.tableName === ds.tableName)) {
          updatedDatasets.push(ds)
        }
      }
      
      setDatasets(updatedDatasets)
      setActiveDataset(results[0] || activeDataset || null)
      setIsDbReady(true)
      setSheetUrl('')
    } catch (err: any) {
      console.error(err)
      let errorMsg = ''
      if (err.message === 'INVALID_URL') {
        errorMsg = t('errors.invalidUrl')
      } else if (err.message === 'FETCH_FAILED') {
        errorMsg = t('errors.fetchFailed')
      } else if (err.message === 'EMPTY_DOCUMENT') {
        errorMsg = t('errors.emptyDocument')
      } else {
        errorMsg = t('errors.generalError', { error: err.message || String(err) })
      }
      setMessage(errorMsg)
    } finally {
      setDbLoading(false)
      setImportProgress(null)
    }
  }

  return (
    <main>
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><Sparkles size={16} /></span> Data Lens <b>AI</b></div>
        
        <div className="topbar-right">
          <div className="privacy">
            {dbLoading ? (
              <span className="loading-badge"><LoaderCircle className="spin" size={14} /> DuckDB...</span>
            ) : isDbReady ? (
              <span className="ready-badge" style={{ color: '#65e7bc', display: 'flex', gap: '6px', alignItems: 'center' }}><ShieldCheck size={16} /> DuckDB WASM</span>
            ) : (
              <span><ShieldCheck size={16} /> {t('brandPrivacy')}</span>
            )}
          </div>

          <button
            className="icon-button"
            onClick={() => setIsAiOpen(true)}
            title={t('ai.open', { defaultValue: 'AI Asistan (Ctrl+K)' })}
            style={{ color: 'var(--color-primary)' }}
          >
            <Sparkles size={18} />
          </button>

          <button className="icon-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title={theme === 'dark' ? t('lightTheme', { defaultValue: 'Açık Tema' }) : t('darkTheme', { defaultValue: 'Karanlık Tema' })}>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <button className="icon-button" onClick={() => setIsSettingsOpen(true)}>
            <Settings size={18} />
          </button>

          <div className="language-switcher">
            <button className={i18n.language === 'tr' ? 'active' : ''} onClick={() => void i18n.changeLanguage('tr')}>TR</button>
            <button className={i18n.language === 'en' ? 'active' : ''} onClick={() => void i18n.changeLanguage('en')}>EN</button>
          </div>
        </div>
      </header>

      {/* Hero section is only visible when no active dataset is loaded */}
      {!activeDataset && (
        <section className="hero">
          <p className="eyebrow">{t('eyebrow')}</p>
          <h1>{t('heroA')}<br />{t('heroB')} <em>{t('heroC')}</em></h1>
          <p className="hero-copy">{t('heroCopy')}</p>
        </section>
      )}

      {!activeDataset ? (
        <section
          className={`upload-zone ${dragging ? 'dragging' : ''}`}
          onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); void loadFile(event.dataTransfer.files[0]) }}
        >
          <IntroJourney t={t} compact />
          <div className="upload-icon">
            {dbLoading ? <LoaderCircle className="spin" size={28} /> : <Upload size={28} />}
          </div>
          <h2>{dbLoading ? 'DuckDB...' : t('uploadTitle')}</h2>
          <p>{t('uploadCopy')}</p>
          
          {importProgress ? (
            <div className="progress" style={{ margin: '20px auto 0' }}>
              <span style={{ width: `${importProgress.value}%` }} />
              <small>{importProgress.message}</small>
            </div>
          ) : (
            <>
              <button onClick={() => inputRef.current?.click()} disabled={dbLoading}>
                {dbLoading ? <LoaderCircle className="spin" size={18} /> : <FileUp size={18} />} {t('chooseFile')}
              </button>
              
              <div className="upload-divider" style={{ margin: '16px 0', color: '#91a6c4', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', width: '100%', maxWidth: '300px' }}>
                <span style={{ flex: 1, height: '1px', background: '#ffffff0a' }}></span>
                {t('orText')}
                <span style={{ flex: 1, height: '1px', background: '#ffffff0a' }}></span>
              </div>

              <div className="sheet-input-box" style={{ width: '100%', maxWidth: '360px', display: 'flex', gap: '8px' }}>
                <input 
                  type="text" 
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  placeholder={t('gSheetPlaceholder')}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    background: '#09111f',
                    border: '1px solid #ffffff14',
                    borderRadius: '8px',
                    color: '#e9eeff',
                    fontSize: '12px',
                    outline: 'none'
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && sheetUrl.trim()) {
                      void handleLoadGoogleSheet()
                    }
                  }}
                />
                <button 
                  className="sheet-btn" 
                  onClick={handleLoadGoogleSheet}
                  disabled={!sheetUrl.trim()}
                  style={{
                    background: '#65e7bc',
                    color: '#08201f',
                    border: 0,
                    borderRadius: '8px',
                    padding: '10px 16px',
                    fontWeight: 'bold',
                    fontSize: '12px',
                    cursor: 'pointer',
                    margin: 0,
                    transition: 'opacity 0.2s',
                    opacity: sheetUrl.trim() ? 1 : 0.5
                  }}
                >
                  {t('importGSheet')}
                </button>
              </div>
            </>
          )}
          
          <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls,.parquet,.json" hidden onChange={(event) => void loadFile(event.target.files?.[0])} />
          {message && <p className="notice" style={{ marginTop: '20px' }}>{message}</p>}
        </section>
      ) : (
        <section className="workspace" style={{ marginTop: '20px' }}>
          {/* MAIN WORKSPACE TABS */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', background: 'var(--bg-secondary)', padding: '6px', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '24px' }}>
            <button 
              onClick={() => setActiveWorkspaceTab('files')}
              style={{
                flex: '1 1 130px',
                padding: '12px',
                background: activeWorkspaceTab === 'files' ? 'var(--border-strong)' : 'transparent',
                border: 0,
                borderRadius: '8px',
                color: activeWorkspaceTab === 'files' ? 'var(--color-primary)' : 'var(--text-secondary)',
                fontWeight: 'bold',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <Database size={16} />
              {t('tabs.files', { defaultValue: 'Dosyalar' })}
            </button>
            <button 
              onClick={() => setActiveWorkspaceTab('dashboard')}
              style={{
                flex: '1 1 130px',
                padding: '12px',
                background: activeWorkspaceTab === 'dashboard' ? 'var(--border-strong)' : 'transparent',
                border: 0,
                borderRadius: '8px',
                color: activeWorkspaceTab === 'dashboard' ? 'var(--color-primary)' : 'var(--text-secondary)',
                fontWeight: 'bold',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <LayoutGrid size={16} />
              {t('tabs.dashboard')}
            </button>
            <button 
              onClick={() => setActiveWorkspaceTab('reports')}
              style={{
                flex: '1 1 130px',
                padding: '12px',
                background: activeWorkspaceTab === 'reports' ? 'var(--border-strong)' : 'transparent',
                border: 0,
                borderRadius: '8px',
                color: activeWorkspaceTab === 'reports' ? 'var(--color-primary)' : 'var(--text-secondary)',
                fontWeight: 'bold',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <FileText size={16} />
              {t('tabs.reports')}
            </button>
            <button 
              onClick={() => setActiveWorkspaceTab('sqllab')}
              style={{
                flex: '1 1 130px',
                padding: '12px',
                background: activeWorkspaceTab === 'sqllab' ? 'var(--border-strong)' : 'transparent',
                border: 0,
                borderRadius: '8px',
                color: activeWorkspaceTab === 'sqllab' ? 'var(--color-primary)' : 'var(--text-secondary)',
                fontWeight: 'bold',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <MessageSquareText size={16} />
              {t('tabs.sqllab')}
            </button>
          </div>

          {/* Render Active Tab Component */}
          {activeWorkspaceTab === 'files' && (
            <FilesTab
              datasets={datasets}
              activeDataset={activeDataset}
              setActiveDataset={setActiveDataset}
              handleDeleteDataset={handleDeleteDataset}
              inputRef={inputRef}
              dragging={dragging}
              setDragging={setDragging}
              loadFile={loadFile}
              sheetUrl={sheetUrl}
              setSheetUrl={setSheetUrl}
              handleLoadGoogleSheet={handleLoadGoogleSheet}
              showImportBox={showImportBox}
              setShowImportBox={setShowImportBox}
              t={t}
              setDatasets={setDatasets}
              setIsDbReady={setIsDbReady}
              deleteLocalDataset={deleteLocalDataset}
            />
          )}

          {activeWorkspaceTab === 'dashboard' && (
            <DashboardTab 
              datasets={datasets}
              isDbReady={isDbReady} 
              addChartToReport={addChartToReport} 
              addInsightToReport={addInsightToReport}
              dashboards={dashboards}
              setDashboards={setDashboards}
              activeDashboardId={activeDashboardId}
              setActiveDashboardId={setActiveDashboardId}
            />
          )}

          {activeWorkspaceTab === 'sqllab' && (
            <SqlLabTab 
              activeDataset={activeDataset} 
              datasets={datasets}
              isDbReady={isDbReady} 
              addChartToReport={addChartToReport} 
              addInsightToReport={addInsightToReport}
              sqlCards={sqlCards}
              setSqlCards={setSqlCards}
            />
          )}

          {activeWorkspaceTab === 'reports' && (
            <ReportsTab 
              activeDataset={activeDataset} 
              reports={reports}
              setReports={setReports}
              activeReportId={activeReportId}
              setActiveReportId={setActiveReportId}
            />
          )}
        </section>
      )}

      {/* ADD TO REPORT SELECTION MODAL */}
      {pendingChartToAdd && (
        <div className="modal-overlay" style={{ display: 'grid', placeItems: 'center', zIndex: 1200 }}>
          <div className="modal-card" style={{ maxWidth: '440px', width: '100%', padding: '24px', animation: 'scaleUp 0.2s', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>{t('addToReportModalTitle', { defaultValue: 'Grafiği Rapora Ekle' })}</h3>
              <button onClick={() => setPendingChartToAddToReport(null)} style={{ background: 'transparent', border: 0, color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              {t('addToReportModalSub', { defaultValue: 'Seçilen grafiği eklemek istediğiniz raporu seçin veya yeni bir rapor oluşturun:' })}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto', marginBottom: '18px', paddingRight: '4px' }} className="custom-scrollbar">
              {reports.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    const newBlock = buildPendingReportBlock()
                    if (!newBlock) return
                    setReports(prev => prev.map(report => report.id === r.id ? { ...report, blocks: [...report.blocks, newBlock] } : report))
                    setPendingChartToAddToReport(null)
                    alert(t('chartAddedToReportSuccess', { defaultValue: 'Grafik başarıyla rapora eklendi!' }))
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 500,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-primary)'
                    e.currentTarget.style.background = 'var(--border-strong)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-color)'
                    e.currentTarget.style.background = 'var(--bg-tertiary)'
                  }}
                >
                  <span>{r.name}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{r.blocks.length} {t('blocks', { defaultValue: 'blok' })}</span>
                </button>
              ))}
            </div>

            <div style={{ flex: 1, height: '1px', background: 'var(--border-color)', margin: '14px 0' }}></div>

            <div>
              <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                {t('orCreateAndAddTitle', { defaultValue: 'Veya Yeni Rapor Oluşturup Ekle' })}
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder={t('reportNamePlaceholder', { defaultValue: 'örn. Çeyrek Analiz Raporu' })}
                  id="quick-report-input"
                  style={{ flex: 1, padding: '10px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const inputVal = (e.target as HTMLInputElement).value.trim()
                      if (!inputVal) return
                      
                      const newBlock = buildPendingReportBlock()
                      if (!newBlock) return

                      const newReport: Report = {
                        id: 'report_' + Date.now(),
                        name: inputVal,
                        blocks: [newBlock],
                        createdAt: new Date().toISOString()
                      }

                      setReports(prev => [...prev, newReport])
                      setActiveReportId(newReport.id)
                      setPendingChartToAddToReport(null)
                      alert(t('chartAddedToReportSuccess', { defaultValue: 'Grafik başarıyla rapora eklendi!' }))
                    }
                  }}
                />
                <button
                  onClick={() => {
                    const inputEl = document.getElementById('quick-report-input') as HTMLInputElement | null
                    const inputVal = inputEl?.value.trim()
                    if (!inputVal) return
                    
                    const newBlock = buildPendingReportBlock()
                    if (!newBlock) return

                    const newReport: Report = {
                      id: 'report_' + Date.now(),
                      name: inputVal,
                      blocks: [newBlock],
                      createdAt: new Date().toISOString()
                    }

                    setReports(prev => [...prev, newReport])
                    setActiveReportId(newReport.id)
                    setPendingChartToAddToReport(null)
                    alert(t('chartAddedToReportSuccess', { defaultValue: 'Grafik başarıyla rapora eklendi!' }))
                  }}
                  style={{
                    background: 'var(--color-primary)',
                    color: 'var(--color-primary-dark)',
                    border: 0,
                    borderRadius: '8px',
                    padding: '10px 16px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  {t('createAndAdd', { defaultValue: 'Oluştur ve Ekle' })}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal Overlay */}
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />

      <AiChat open={isAiOpen} onClose={() => setIsAiOpen(false)} pendingAttachment={pendingAttachment} onConsumePending={() => setPendingAttachment(null)} />

      {/* Görünür yüzen AI butonu (kapalıyken) */}
      {!isAiOpen && (
        <button
          className="ai-fab"
          onClick={() => setIsAiOpen(true)}
          title={t('ai.open', { defaultValue: 'AI Asistan (Ctrl+K)' })}
        >
          <Sparkles size={20} />
          <span>{t('ai.fab', { defaultValue: 'AI ile sor' })}</span>
        </button>
      )}
    </main>
  )
}

export default App
