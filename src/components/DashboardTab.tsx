import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, Plus, X, LoaderCircle, Maximize2, Trash2, Link, Columns, GripVertical, LayoutGrid, Sliders, Printer } from 'lucide-react'
import { buildWhereClause, detectRelationships } from '../dashboard-engine'
import type { Dataset, Dashboard, ActiveFilter, Relationship, RelationshipSuggestion, WidgetInstance } from '../types'
// react-grid-layout v2, düz (flat) v1 prop API'sini yalnızca /legacy alt yolundan sunar.
// Default export (v2 GridLayout) cols/rowHeight/draggableHandle gibi prop'ları yok sayar;
// bu da sürükleme + boyutlandırmanın çalışmamasına ve satır yüksekliğinin (varsayılan 150px)
// widget içeriğinden çok daha büyük hesaplanmasına yol açıyordu.
import GridLayout from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { ALL_WIDGETS, instanceToWidget } from './dashboard/WidgetRegistry'
import { WidgetShell } from './dashboard/WidgetShell'
import { AddWidgetModal } from './dashboard/AddWidgetModal'
import { buildDefaultInstanceWidgets } from './dashboard/defaultWidgets'
import type { WidgetContext } from './dashboard/types'

const Grid: any = GridLayout


interface DashboardTabProps {
  datasets: Dataset[]
  isDbReady: boolean
  addChartToReport: (type: string, title: string, data: any[], xAxisKey: string, yAxisKey: string) => void
  addInsightToReport?: (title: string, html: string) => void
  dashboards: Dashboard[]
  setDashboards: React.Dispatch<React.SetStateAction<Dashboard[]>>
  activeDashboardId: string | null
  setActiveDashboardId: (id: string | null) => void
}

export function DashboardTab({
  datasets,
  isDbReady,
  addChartToReport,
  addInsightToReport,
  dashboards,
  setDashboards,
  activeDashboardId,
  setActiveDashboardId
}: DashboardTabProps) {
  const { t } = useTranslation()

  // Find active dashboard object
  const activeDashboard = dashboards.find(d => d.id === activeDashboardId)

  // Container sizing state for responsive react-grid-layout
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(1200)

  // Ortak "rapora ekle" kabuk butonu için: grafik view'ları o anki verilerini rapora
  // ekleyecek fonksiyonu widget id'siyle bu map'e kaydeder; WidgetShell başlığındaki buton
  // çağırır. Ref map olduğu için yeniden render tetiklemez (BUG-1 chrome birleşimi).
  const reportActionsRef = useRef<Map<string, () => void>>(new Map())

  useEffect(() => {
    if (!containerRef.current) return
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setContainerWidth(entry.contentRect.width)
        }
      }
    })
    resizeObserver.observe(containerRef.current)
    return () => resizeObserver.disconnect()
  }, [activeDashboardId])

  // Primary linked table selector for current dashboard analysis
  const [activeLinkedTable, setActiveLinkedTable] = useState<string>('')

  // Create Dashboard Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [newDashName, setNewDashName] = useState('')
  const [selectedTablesToLink, setSelectedTableNames] = useState<string[]>([])

  // Drag and drop widget state for custom dashboard layout
  const [draggedWidget, setDraggedWidget] = useState<string | null>(null)

  const handleDragStart = (e: React.DragEvent, widgetKey: string) => {
    setDraggedWidget(widgetKey)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragEnd = () => {
    setDraggedWidget(null)
  }

  const handleDragOver = (e: React.DragEvent, targetWidgetKey: string) => {
    e.preventDefault()
    if (!draggedWidget || draggedWidget === targetWidgetKey) return

    const currentOrder = activeDashboard?.layoutOrder || ['kpis', 'chartBar', 'chartLine', 'table']
    const nextOrder = [...currentOrder]
    const draggedIndex = nextOrder.indexOf(draggedWidget)
    const targetIndex = nextOrder.indexOf(targetWidgetKey)

    if (draggedIndex !== -1 && targetIndex !== -1) {
      nextOrder.splice(draggedIndex, 1)
      nextOrder.splice(targetIndex, 0, draggedWidget)

      setDashboards(prev => prev.map(d => {
        if (d.id === activeDashboard?.id) {
          return { ...d, layoutOrder: nextOrder }
        }
        return d
      }))
    }
  }

  // Pre-made templates applier
  const applyLayoutTemplate = (templateType: 'balanced' | 'charts' | 'compact') => {
    if (!activeDashboard) return

    let nextLayout: Array<{ i: string; x: number; y: number; w: number; h: number }> = []

    if (templateType === 'balanced') {
      nextLayout = [
        { i: 'kpis', x: 0, y: 0, w: 12, h: 2 },
        { i: 'chartBar', x: 0, y: 2, w: 6, h: 7 },
        { i: 'chartLine', x: 6, y: 2, w: 6, h: 7 },
        { i: 'table', x: 0, y: 9, w: 12, h: 8 }
      ]
    } else if (templateType === 'charts') {
      nextLayout = [
        { i: 'chartBar', x: 0, y: 0, w: 12, h: 8 },
        { i: 'chartLine', x: 0, y: 8, w: 12, h: 8 },
        { i: 'kpis', x: 0, y: 16, w: 12, h: 2 },
        { i: 'table', x: 0, y: 18, w: 12, h: 8 }
      ]
    } else if (templateType === 'compact') {
      nextLayout = [
        { i: 'kpis', x: 0, y: 0, w: 12, h: 2 },
        { i: 'chartBar', x: 0, y: 2, w: 4, h: 6 },
        { i: 'chartLine', x: 4, y: 2, w: 4, h: 6 },
        { i: 'table', x: 8, y: 2, w: 4, h: 6 }
      ]
    }

    setDashboards(prev => prev.map(d => {
      if (d.id === activeDashboard.id) {
        return { ...d, rglLayout: nextLayout }
      }
      return d
    }))
  }

  // Collateral dynamic data state
  const [detectedColumns, setDetectedColumns] = useState<{
    numericCol: string
    categoricCol: string
    secCategoricCol: string
    dateCol: string
  } | null>(null)

  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false)

  // Büyütülmüş (maximize) widget id — organizer tam ekran overlay'de render eder.
  const [maximizedWidgetId, setMaximizedWidgetId] = useState<string | null>(null)

  // Çapraz filtrenin (çoklu dosya) ilişki yolu bulunamadığı için atlanan filtreleri say.
  const [skippedFilterCount, setSkippedFilterCount] = useState(0)

  // İlişki önerileri (otomatik FK tespiti) ve panel görünürlüğü.
  const [relationshipSuggestions, setRelationshipSuggestions] = useState<RelationshipSuggestion[]>([])
  const [isDetectingRelationships, setIsDetectingRelationships] = useState(false)
  const [showRelationshipPanel, setShowRelationshipPanel] = useState(false)

  // Manuel ilişki tanımlama formu state'i.
  const [manualRel, setManualRel] = useState<{ fromTable: string; fromColumn: string; toTable: string; toColumn: string }>({
    fromTable: '', fromColumn: '', toTable: '', toColumn: ''
  })

  // Gelişmiş araçlar (layout şablonları + ilişki paneli) varsayılan gizli.
  // AI modu odaklı sade arayüz; kullanıcı isteyince açar.
  const [showAdvancedTools, setShowAdvancedTools] = useState(false)
  const [showAddWidget, setShowAddWidget] = useState(false)

  // Dashboard'ın onaylı ilişkileri (buildWidgetQuery bunları kullanır).
  const relationships: Relationship[] = activeDashboard?.relationships ?? []

  // Legacy activeFilters (Record) veya yeni structured filters'ı tek bir ActiveFilter[]'e çevir.
  // Legacy kayıtlar activeLinkedTable'a ait varsayılır (tek dosya davranışıyla uyumlu).
  const getActiveFilters = (): ActiveFilter[] => {
    if (!activeDashboard) return []
    if (activeDashboard.filters && activeDashboard.filters.length > 0) {
      return activeDashboard.filters
    }
    // legacy fallback
    return Object.entries(activeDashboard.activeFilters || {}).map(([column, value]) => ({
      tableName: activeLinkedTable,
      column,
      value: String(value),
    }))
  }











  // Ensure activeLinkedTable points to a valid table in the current dashboard
  useEffect(() => {
    if (activeDashboard) {
      // If previous table is still in linkedTables, keep it; otherwise fall back to first linked table
      if (activeDashboard.linkedTableNames.includes(activeLinkedTable)) {
        // keep it
      } else {
        setActiveLinkedTable(activeDashboard.linkedTableNames[0] || '')
      }
    }
  }, [activeDashboard, activeLinkedTable])

  // Get active dataset object
  const activeDataset = datasets.find(d => d.tableName === activeLinkedTable)

  // Auto detect columns on active dataset/table change
  useEffect(() => {
    if (isDbReady && activeDataset) {
      const numericCol = activeDataset.columns.find(c => c.kind === 'number')?.name || ''
      const categoricCol = activeDataset.columns.find(c => c.kind === 'string' && c.uniqueCount > 1 && c.uniqueCount < 100)?.name || 
                            activeDataset.columns.find(c => c.kind === 'string')?.name || ''
      const secCategoricCol = activeDataset.columns.find(c => c.kind === 'string' && c.name !== categoricCol)?.name || ''
      const dateCol = activeDataset.columns.find(c => {
        const n = c.name.toLowerCase()
        return n.includes('date') || n.includes('year') || n.includes('month') || n.includes('tarih') || n.includes('time')
      })?.name || ''

      setDetectedColumns({ numericCol, categoricCol, secCategoricCol, dateCol })
      
      // Initialize customizable chart options on dashboard object if not set
      if (activeDashboard) {
        setDashboards(prev => prev.map(d => {
          if (d.id === activeDashboard.id) {
            return {
              ...d,
              dbBarX: d.dbBarX || categoricCol,
              dbBarY: d.dbBarY || numericCol,
              dbLineX: d.dbLineX || dateCol || secCategoricCol || categoricCol,
              dbLineY: d.dbLineY || numericCol
            }
          }
          return d
        }))
      }
    }
  }, [isDbReady, activeDataset, activeDashboardId])

  // Çapraz filtrelerin aktif tabloya (ilişki yolu üzerinden) uygulanıp uygulanamadığını
  // hesapla. Artık burada veri çekmiyoruz — her widget kendi verisini kendi çeker (organizer).
  useEffect(() => {
    if (!activeDataset) { setSkippedFilterCount(0); return }
    const { skippedFilters } = buildWhereClause(activeDataset.tableName, getActiveFilters(), relationships)
    setSkippedFilterCount(skippedFilters.length)
  }, [activeDataset, activeDashboard?.filters, activeDashboard?.activeFilters, activeDashboard?.relationships])

  // Structured filtreyi aç/kapa (toggle). tableName+column+value üçlüsüyle çalışır.
  // Aynı üçlü zaten varsa kaldırır (geri al), yoksa aynı kolonun eski değerini değiştirir.
  const toggleStructuredFilter = (tableName: string, column: string, value: string, op: 'eq' | 'contains' = 'eq') => {
    if (!activeDashboard) return
    setDashboards(prev => prev.map(d => {
      if (d.id !== activeDashboard.id) return d
      const current: ActiveFilter[] = d.filters && d.filters.length > 0
        ? d.filters
        : Object.entries(d.activeFilters || {}).map(([col, val]) => ({ tableName, column: col, value: String(val) }))

      const existing = current.find(f => f.tableName === tableName && f.column === column)
      let next: ActiveFilter[]
      if ((existing && existing.value === value) || value === '') {
        // aynı değere tekrar tıklandı ya da boş değer -> filtreyi kaldır
        next = current.filter(f => !(f.tableName === tableName && f.column === column))
      } else {
        // farklı değer -> aynı kolonun filtresini güncelle/ekle
        next = [...current.filter(f => !(f.tableName === tableName && f.column === column)), { tableName, column, value, op }]
      }
      // legacy activeFilters'ı da senkron tut (geriye dönük UI/rapor uyumu için)
      const legacy: Record<string, string> = {}
      next.forEach(f => { legacy[f.column] = f.value })
      return { ...d, filters: next, activeFilters: legacy }
    }))
  }

  // Tek bir structured filtreyi kaldır (tableName+column). Hem yeni `filters[]`
  // hem de geriye dönük `activeFilters` (legacy) senkron güncellenir. Rozet (chip)
  // X butonu bunu kullanır → önceden yalnız legacy silindiği için öksüz filtre kalıyordu.
  const removeStructuredFilter = (tableName: string, column: string) => {
    if (!activeDashboard) return
    setDashboards(prev => prev.map(d => {
      if (d.id !== activeDashboard.id) return d
      const current: ActiveFilter[] = d.filters && d.filters.length > 0
        ? d.filters
        : Object.entries(d.activeFilters || {}).map(([col, val]) => ({ tableName: activeLinkedTable, column: col, value: String(val) }))
      const next = current.filter(f => !(f.tableName === tableName && f.column === column))
      const legacy: Record<string, string> = {}
      next.forEach(f => { legacy[f.column] = f.value })
      return { ...d, filters: next, activeFilters: legacy }
    }))
  }

  // Click handler for interactive chart filtering (bar) — çapraf filtre için structured.
  const handleClearFilters = () => {
    if (!activeDashboard) return
    setDashboards(prev => prev.map(d => {
      if (d.id === activeDashboard.id) {
        return { ...d, activeFilters: {}, filters: [] }
      }
      return d
    }))
  }

  // Bağlı dosyalar arasında olası FK ilişkilerini otomatik tespit et.
  const handleDetectRelationships = async () => {
    if (!activeDashboard) return
    const linkedDatasets = datasets.filter(d => activeDashboard.linkedTableNames.includes(d.tableName))
    if (linkedDatasets.length < 2) {
      alert(t('dashboard.needTwoTablesForRelations', { defaultValue: 'İlişki tespiti için panoya en az iki dosya bağlı olmalı.' }))
      return
    }
    setIsDetectingRelationships(true)
    setShowRelationshipPanel(true)
    try {
      const suggestions = await detectRelationships(linkedDatasets)
      // Zaten onaylanmış ilişkileri öneri listesinden çıkar
      const confirmed = activeDashboard.relationships ?? []
      const filtered = suggestions.filter(s =>
        !confirmed.some(r => r.fromTable === s.fromTable && r.fromColumn === s.fromColumn && r.toTable === s.toTable && r.toColumn === s.toColumn)
      )
      setRelationshipSuggestions(filtered)
    } catch (err) {
      console.error('İlişki tespiti hatası:', err)
      setRelationshipSuggestions([])
    } finally {
      setIsDetectingRelationships(false)
    }
  }

  // Bir öneriyi onayla → dashboard.relationships'e ekle.
  const handleConfirmRelationship = (sug: RelationshipSuggestion) => {
    if (!activeDashboard) return
    const rel: Relationship = {
      id: sug.id,
      fromTable: sug.fromTable,
      fromColumn: sug.fromColumn,
      toTable: sug.toTable,
      toColumn: sug.toColumn,
      cardinality: sug.cardinality,
      confidence: sug.confidence,
      confirmed: true,
    }
    setDashboards(prev => prev.map(d =>
      d.id === activeDashboard.id
        ? { ...d, relationships: [...(d.relationships ?? []), rel] }
        : d
    ))
    setRelationshipSuggestions(prev => prev.filter(s => s.id !== sug.id))
  }

  // Onaylı ilişkiyi kaldır.
  const handleRemoveRelationship = (relId: string) => {
    if (!activeDashboard) return
    setDashboards(prev => prev.map(d =>
      d.id === activeDashboard.id
        ? { ...d, relationships: (d.relationships ?? []).filter(r => r.id !== relId) }
        : d
    ))
  }

  // Elle ilişki ekle (otomatik tespit bulamadığında).
  const handleAddManualRelationship = () => {
    if (!activeDashboard) return
    const { fromTable, fromColumn, toTable, toColumn } = manualRel
    if (!fromTable || !fromColumn || !toTable || !toColumn) {
      alert(t('dashboard.relationIncomplete', { defaultValue: 'Lütfen tüm alanları seçin.' }))
      return
    }
    if (fromTable === toTable) {
      alert(t('dashboard.relationSameTable', { defaultValue: 'Kaynak ve hedef dosya farklı olmalı.' }))
      return
    }
    const existing = activeDashboard.relationships ?? []
    const dupe = existing.some(r =>
      r.fromTable === fromTable && r.fromColumn === fromColumn && r.toTable === toTable && r.toColumn === toColumn
    )
    if (dupe) {
      alert(t('dashboard.relationExists', { defaultValue: 'Bu ilişki zaten tanımlı.' }))
      return
    }
    const rel: Relationship = {
      id: `rel_manual_${fromTable}.${fromColumn}->${toTable}.${toColumn}`,
      fromTable, fromColumn, toTable, toColumn,
      cardinality: 'many-to-one',
      confidence: 1,
      confirmed: true,
    }
    setDashboards(prev => prev.map(d =>
      d.id === activeDashboard.id
        ? { ...d, relationships: [...existing, rel] }
        : d
    ))
    setManualRel({ fromTable: '', fromColumn: '', toTable: '', toColumn: '' })
  }

  // Manuel form için kolon listeleri (seçili tabloya göre).
  const manualFromColumns = datasets.find(d => d.tableName === manualRel.fromTable)?.columns ?? []
  const manualToColumns = datasets.find(d => d.tableName === manualRel.toTable)?.columns ?? []
  const linkedDatasetsForManual = activeDashboard
    ? datasets.filter(d => activeDashboard.linkedTableNames.includes(d.tableName))
    : []

  const handleDeleteDashboard = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (dashboards.length <= 1) {
      alert(t('cannotDeleteLastDashboard', { defaultValue: 'Son kalan panoyu silemezsiniz!' }))
      return
    }
    if (confirm(t('confirmDeleteDashboard', { defaultValue: 'Bu panoyu silmek istediğinize emin misiniz?' }))) {
      const remaining = dashboards.filter(d => d.id !== id)
      setDashboards(remaining)
      if (activeDashboardId === id) {
        setActiveDashboardId(remaining[0].id)
      }
    }
  }

  const handleCreateDashboard = () => {
    const name = newDashName.trim()
    if (!name) return
    if (selectedTablesToLink.length === 0) {
      alert(t('mustLinkAtLeastOneFile', { defaultValue: 'En az bir dosya seçmelisiniz!' }))
      return
    }

    const primaryDataset = datasets.find(d => d.tableName === selectedTablesToLink[0])
    const { widgets, rglLayout } = primaryDataset
      ? buildDefaultInstanceWidgets(primaryDataset)
      : { widgets: [], rglLayout: [] }

    const newDash: Dashboard = {
      id: 'dash_' + crypto.randomUUID(),
      name,
      linkedTableNames: selectedTablesToLink,
      activeFilters: {},
      // Yeni model: hazır instance widget'larıyla gel (KPI/bar/line/tablo), legacy gizli.
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

    setDashboards(prev => [...prev, newDash])
    setActiveDashboardId(newDash.id)
    setIsCreateModalOpen(false)
    setNewDashName('')
    setSelectedTableNames([])
  }

  if (!activeDashboard) {
    return (
      <div style={{ animation: 'fadeIn 0.4s', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Workspace Title Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <p className="eyebrow">{t('dashboard.eyebrow', { defaultValue: 'PANOLAR' })}</p>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>{t('dashboard.library', { defaultValue: 'Dashboard Kütüphanesi' })}</h2>
          </div>
          
          <button 
            className="secondary"
            onClick={() => {
              setIsCreateModalOpen(true)
              setSelectedTableNames(datasets[0] ? [datasets[0].tableName] : [])
            }}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px', 
              cursor: 'pointer', 
              background: 'var(--color-primary)', 
              color: 'var(--color-primary-dark)', 
              border: 0,
              padding: '10px 16px',
              borderRadius: '8px',
              fontWeight: 'bold',
              fontSize: '12px'
            }}
          >
            <Plus size={14} /> {t('createDashboardButton', { defaultValue: 'Yeni Pano Oluştur' })}
          </button>
        </div>

        {/* Dashboards Cards Grid */}
        {dashboards.length === 0 ? (
          <div className="card" style={{ height: '200px', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--border-color)', borderRadius: '16px' }}>
            <Columns size={32} style={{ color: 'var(--text-muted)' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', fontWeight: 600 }}>{t('noDashboardsYet', { defaultValue: 'Henüz bir pano oluşturulmadı. Yeni pano oluştur butonuyla başlayın!' })}</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', marginTop: '10px' }}>
            {dashboards.map((d) => (
              <div
                key={d.id}
                onClick={() => setActiveDashboardId(d.id)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  padding: '18px',
                  background: 'var(--bg-secondary)',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  position: 'relative'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-primary)'
                  e.currentTarget.style.boxShadow = '0 8px 24px rgba(99, 102, 241, 0.08)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-color)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                {/* Header row inside dashboard card */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                    <div style={{ 
                      padding: '8px', 
                      background: 'var(--bg-tertiary)', 
                      borderRadius: '8px',
                      color: 'var(--color-primary)',
                      display: 'grid',
                      placeItems: 'center'
                    }}>
                      <Columns size={16} />
                    </div>
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ 
                        fontSize: '14px', 
                        fontWeight: 'bold', 
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {d.name}
                      </div>
                      <small style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                        {t('dashboard.linkedFilesCount', { count: d.linkedTableNames.length, defaultValue: `${d.linkedTableNames.length} Dosya Bağlı` })}
                      </small>
                    </div>
                  </div>

                  {dashboards.length > 1 && (
                    <button
                      onClick={(e) => handleDeleteDashboard(d.id, e)}
                      style={{
                        background: 'transparent',
                        border: 0,
                        padding: '6px',
                        color: 'var(--text-muted)',
                        display: 'grid',
                        placeItems: 'center',
                        cursor: 'pointer',
                        borderRadius: '6px',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#ff6b6b')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                      title={t('dashboard.delete', { defaultValue: 'Panoyu Sil' })}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>

                {/* Linked datasets tags inside dashboard card */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                  {d.linkedTableNames.map((tbl) => {
                    const dsName = datasets.find(x => x.tableName === tbl)?.name || tbl
                    return (
                      <span 
                        key={tbl}
                        style={{ 
                          fontSize: '10px', 
                          fontWeight: 600, 
                          padding: '2px 6px', 
                          background: 'var(--bg-tertiary)', 
                          border: '1px solid var(--border-color)', 
                          borderRadius: '4px',
                          color: 'var(--text-secondary)',
                          maxWidth: '120px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {dsName}
                      </span>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Dashboard Modal dialog */}
        {isCreateModalOpen && (
          <div className="modal-overlay" style={{ display: 'grid', placeItems: 'center', zIndex: 1100 }}>
            <div className="modal-card" style={{ maxWidth: '420px', width: '100%', padding: '24px', animation: 'scaleUp 0.2s', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>{t('createDashboardModalTitle', { defaultValue: 'Yeni Pano Oluştur' })}</h3>
                <button onClick={() => setIsCreateModalOpen(false)} style={{ background: 'transparent', border: 0, color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                    {t('dashboardNameLabel', { defaultValue: 'Pano Adı' })}
                  </label>
                  <input
                    type="text"
                    placeholder={t('dashboardNamePlaceholder', { defaultValue: 'örn. Finansal Özet' })}
                    value={newDashName}
                    onChange={(e) => setNewDashName(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                    {t('selectFilesToLink', { defaultValue: 'Bağlanacak Dosyaları Seçin' })}
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '160px', overflowY: 'auto', padding: '4px' }}>
                    {datasets.map((d) => (
                      <label key={d.tableName} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        <input
                          type="checkbox"
                          checked={selectedTablesToLink.includes(d.tableName)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTableNames(prev => [...prev, d.tableName])
                            } else {
                              setSelectedTableNames(prev => prev.filter(t => t !== d.tableName))
                            }
                          }}
                          style={{ accentColor: 'var(--color-primary)' }}
                        />
                        {d.name}
                      </label>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '10px', justifyContent: 'flex-end' }}>
                  <button className="secondary" onClick={() => setIsCreateModalOpen(false)} style={{ padding: '8px 16px', fontSize: '12px', cursor: 'pointer' }}>{t('cancel', { defaultValue: 'İptal' })}</button>
                  <button
                    onClick={handleCreateDashboard}
                    disabled={!newDashName.trim() || selectedTablesToLink.length === 0}
                    style={{
                      background: 'var(--color-primary)',
                      color: 'var(--color-primary-dark)',
                      border: 0,
                      borderRadius: '8px',
                      padding: '8px 16px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      opacity: (newDashName.trim() && selectedTablesToLink.length > 0) ? 1 : 0.5
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

   const context: WidgetContext = {
    t,
    activeDataset,
    datasets,
    detectedColumns,
    activeDashboard,
    setDashboards,
    addChartToReport,
    addInsightToReport,
    onMaximizeWidget: (widgetId: string) => setMaximizedWidgetId(widgetId),
    filters: getActiveFilters(),
    relationships,
    toggleStructuredFilter,
    isDbReady,
    reportActions: reportActionsRef,
  };

  const hiddenWidgets = activeDashboard?.hiddenWidgets ?? []
  // Yeni model panolar (instancesOnly) YALNIZCA instance widget'ları render eder; legacy sabit
  // widget'lar gizlenir. Eski panolar (bayrak yoksa) hibrit davranışı korur.
  const instancesOnly = !!activeDashboard?.instancesOnly
  const visibleWidgets = instancesOnly ? [] : ALL_WIDGETS.filter(w => w.isVisible(context) && !hiddenWidgets.includes(w.id));
  // Kaldırılmış ama tekrar eklenebilecek widget'lar (isVisible koşulunu sağlayanlar).
  const removableHiddenWidgets = instancesOnly ? [] : ALL_WIDGETS.filter(w => w.isVisible(context) && hiddenWidgets.includes(w.id));

  // Kullanıcının eklediği çoklu grafik widget'ları (WidgetInstance) → adaptörle IDashboardWidget.
  const instanceWidgets = (activeDashboard?.widgets ?? []).map(instanceToWidget)
  const renderedWidgets = [...visibleWidgets, ...instanceWidgets]
  const instanceIds = new Set((activeDashboard?.widgets ?? []).map(w => w.id))

  // Grid layout'u render edilen TÜM widget'ları kapsayacak şekilde hesapla (instance dahil).
  const computeLayout = (): any[] => {
    const base = (activeDashboard?.rglLayout && activeDashboard.rglLayout.length)
      ? activeDashboard.rglLayout
      : [
          { i: 'kpis', x: 0, y: 0, w: 12, h: 2, minW: 3, minH: 1 },
          { i: 'chartBar', x: 0, y: 2, w: 6, h: 7, minW: 3, minH: 3 },
          { i: 'chartLine', x: 6, y: 2, w: 6, h: 7, minW: 3, minH: 3 },
          { i: 'table', x: 0, y: 9, w: 12, h: 8, minW: 4, minH: 4 },
        ]
    const ids = renderedWidgets.map(w => w.id)
    const known = new Set(base.map((l: any) => l.i))
    const kept = base.filter((l: any) => ids.includes(l.i))
    const extra = ids.filter(id => !known.has(id)).map((id, i) => ({ i: id, x: (i % 2) * 6, y: 1000 + i * 7, w: 6, h: 7, minW: 3, minH: 3 }))
    return [...kept, ...extra]
  }

  // Widget'ı panodan kaldır: instance ise widgets[]'ten sil, değilse gizle.
  const handleRemoveWidget = (widgetId: string) => {
    if (!activeDashboard) return
    const removed = (activeDashboard.widgets ?? []).find(w => w.id === widgetId)
    const isControl = removed && (removed.type === 'search' || removed.type === 'slicer')
    setDashboards(prev => prev.map(d => {
      if (d.id !== activeDashboard.id) return d
      if (instanceIds.has(widgetId)) {
        // Kontrol widget'ı siliniyorsa uyguladığı öksüz filtreyi de temizle.
        let nextFilters = d.filters ?? []
        if (isControl && removed) {
          nextFilters = nextFilters.filter(f => !(f.tableName === removed.sourceTable && f.column === removed.config.column))
        }
        const legacy: Record<string, string> = {}
        nextFilters.forEach(f => { legacy[f.column] = f.value })
        return {
          ...d,
          widgets: (d.widgets ?? []).filter(w => w.id !== widgetId),
          rglLayout: (d.rglLayout ?? []).filter((l: any) => l.i !== widgetId),
          filters: nextFilters,
          activeFilters: legacy,
        }
      }
      return { ...d, hiddenWidgets: [...(d.hiddenWidgets ?? []), widgetId] }
    }))
  }

  // Yeni instance widget ekle (modal'dan).
  const handleAddInstanceWidget = (instance: WidgetInstance) => {
    if (!activeDashboard) return
    setDashboards(prev => prev.map(d => d.id === activeDashboard.id
      ? { ...d, widgets: [...(d.widgets ?? []), instance] }
      : d))
  }

  // Gizlenen widget'ı geri getir.
  const handleRestoreWidget = (widgetId: string) => {
    if (!activeDashboard) return
    setDashboards(prev => prev.map(d =>
      d.id === activeDashboard.id
        ? { ...d, hiddenWidgets: (d.hiddenWidgets ?? []).filter(id => id !== widgetId) }
        : d
    ))
  }

  return (
    <div ref={containerRef} style={{ animation: 'fadeIn 0.4s', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Header row with back button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--bg-secondary)', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
        <button
          onClick={() => setActiveDashboardId(null)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 12px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            color: 'var(--text-secondary)',
            fontWeight: 'bold',
            fontSize: '12px',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--color-primary)'}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
        >
          {t('dashboard.back', { defaultValue: '◀ Geri' })}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Columns size={16} style={{ color: 'var(--color-primary)' }} />
          <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: 0, color: 'var(--text-primary)' }}>{activeDashboard.name}</h2>
        </div>

        <button
          onClick={() => setShowAddWidget(true)}
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 12px',
            background: 'var(--color-primary)',
            border: 0,
            borderRadius: '8px',
            color: 'var(--color-primary-dark)',
            fontWeight: 'bold',
            fontSize: '12px',
            cursor: 'pointer',
          }}
          title={t('dashboard.addWidget', { defaultValue: 'Widget Ekle' })}
        >
          <Plus size={14} />
          {t('dashboard.addWidget', { defaultValue: 'Widget Ekle' })}
        </button>

        <button
          onClick={() => window.print()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 12px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            fontWeight: 'bold',
            fontSize: '12px',
            cursor: 'pointer',
          }}
          title={t('dashboard.printDashboard', { defaultValue: 'Panoyu Yazdır / PDF' })}
        >
          <Printer size={14} />
          {t('dashboard.print', { defaultValue: 'Yazdır' })}
        </button>

        <button
          onClick={() => setShowAdvancedTools(v => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 12px',
            background: showAdvancedTools ? 'var(--color-primary)' : 'var(--bg-tertiary)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            color: showAdvancedTools ? 'var(--color-primary-dark)' : 'var(--text-secondary)',
            fontWeight: 'bold',
            fontSize: '12px',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          title={t('dashboard.advancedTools', { defaultValue: 'Düzen & İlişki Araçları' })}
        >
          <Sliders size={14} />
          {t('dashboard.advancedTools', { defaultValue: 'Düzen & İlişki Araçları' })}
        </button>
      </div>

      {/* Active linked tables pills selector inside selected dashboard */}
      {activeDashboard && activeDashboard.linkedTableNames.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <Link size={12} /> {t('linkedFilesLabel', { defaultValue: 'Bağlı Dosyalar:' })}
          </span>
          {activeDashboard.linkedTableNames.map((tblName) => {
            const origDataset = datasets.find(d => d.tableName === tblName)
            if (!origDataset) return null
            return (
              <button
                key={tblName}
                onClick={() => setActiveLinkedTable(tblName)}
                style={{
                  background: activeLinkedTable === tblName ? 'var(--color-primary)' : 'var(--bg-secondary)',
                  color: activeLinkedTable === tblName ? 'var(--color-primary-dark)' : 'var(--text-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {origDataset.name}
              </button>
            )
          })}
        </div>
      )}

      {/* Dynamic Grid Layout Presets Selector Bar */}
      {showAdvancedTools && (
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'var(--bg-secondary)',
        padding: '12px 18px',
        borderRadius: '12px',
        border: '1px solid var(--border-color)',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <LayoutGrid size={16} style={{ color: 'var(--color-primary)' }} />
          <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
            {t('layoutPresetsTitle', { defaultValue: 'Pano Şablonları / Hazır Düzenler' })}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => applyLayoutTemplate('balanced')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              fontSize: '11px',
              fontWeight: 'bold',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--color-primary)'}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
          >
            📊 {t('layoutBalanced', { defaultValue: 'Dengeli Düzen' })}
          </button>
          <button
            onClick={() => applyLayoutTemplate('charts')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              fontSize: '11px',
              fontWeight: 'bold',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--color-primary)'}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
          >
            📈 {t('layoutChartsFocused', { defaultValue: 'Grafik Odaklı' })}
          </button>
          <button
            onClick={() => applyLayoutTemplate('compact')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              fontSize: '11px',
              fontWeight: 'bold',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--color-primary)'}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
          >
            🖥️ {t('layoutCompact', { defaultValue: 'Kompakt Sütunlar' })}
          </button>
        </div>
      </div>
      )}

      {/* Çoklu dosya: İlişki (JOIN) yönetimi — yalnızca 2+ dosya bağlıysa ve araçlar açıkken */}
      {showAdvancedTools && activeDashboard && activeDashboard.linkedTableNames.length > 1 && (
        <div style={{ background: 'var(--bg-secondary)', padding: '12px 18px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Link size={16} style={{ color: 'var(--color-primary)' }} />
              <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                {t('dashboard.relationships', { defaultValue: 'Dosya İlişkileri (JOIN)' })}
              </span>
              {relationships.length > 0 && (
                <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', background: 'var(--bg-tertiary)', borderRadius: '10px', color: 'var(--color-primary)' }}>
                  {relationships.length} {t('dashboard.confirmedRelations', { defaultValue: 'onaylı' })}
                </span>
              )}
            </div>
            <button
              onClick={handleDetectRelationships}
              disabled={isDetectingRelationships}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
                background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '8px',
                fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)', cursor: 'pointer'
              }}
            >
              {isDetectingRelationships
                ? <><LoaderCircle className="spin" size={13} /> {t('dashboard.detecting', { defaultValue: 'Taranıyor...' })}</>
                : <><Sparkles size={13} /> {t('dashboard.detectRelations', { defaultValue: 'İlişkileri Otomatik Tespit Et' })}</>}
            </button>
          </div>

          {/* Onaylı ilişkiler */}
          {relationships.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
              {relationships.map(r => {
                const fromName = datasets.find(d => d.tableName === r.fromTable)?.name || r.fromTable
                const toName = datasets.find(d => d.tableName === r.toTable)?.name || r.toTable
                return (
                  <span key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 600, padding: '4px 8px', background: 'var(--bg-primary)', border: '1px solid var(--color-primary)', borderRadius: '6px', color: 'var(--text-primary)' }}>
                    {fromName}.{r.fromColumn} → {toName}.{r.toColumn}
                    <button onClick={() => handleRemoveRelationship(r.id)} style={{ background: 'transparent', border: 0, padding: 0, display: 'grid', placeItems: 'center', color: 'var(--text-muted)', cursor: 'pointer' }}>
                      <X size={10} />
                    </button>
                  </span>
                )
              })}
            </div>
          )}

          {/* Öneri paneli */}
          {showRelationshipPanel && (
            <div style={{ marginTop: '12px', borderTop: '1px dashed var(--border-color)', paddingTop: '12px' }}>
              {isDetectingRelationships ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '12px' }}>
                  <LoaderCircle className="spin" size={14} /> {t('dashboard.detectingRelations', { defaultValue: 'Dosyalar arasında ilişki aranıyor...' })}
                </div>
              ) : relationshipSuggestions.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {t('dashboard.noRelationsFound', { defaultValue: 'Otomatik ilişki bulunamadı. Aşağıdan elle ilişki tanımlayabilirsiniz.' })}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                    {t('dashboard.suggestedRelations', { defaultValue: 'Önerilen İlişkiler' })}
                  </span>
                  {relationshipSuggestions.map(sug => {
                    const fromName = datasets.find(d => d.tableName === sug.fromTable)?.name || sug.fromTable
                    const toName = datasets.find(d => d.tableName === sug.toTable)?.name || sug.toTable
                    return (
                      <div key={sug.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', padding: '8px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {fromName}.{sug.fromColumn} → {toName}.{sug.toColumn}
                          </span>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                            {sug.reason} · {t('dashboard.matchRatio', { defaultValue: 'eşleşme' })} %{Math.round(sug.matchRatio * 100)} · {t('dashboard.confidence', { defaultValue: 'güven' })} %{Math.round((sug.confidence ?? 0) * 100)}
                          </span>
                        </div>
                        <button
                          onClick={() => handleConfirmRelationship(sug)}
                          style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', background: 'var(--color-primary)', color: 'var(--color-primary-dark)', border: 0, borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                          <Plus size={12} /> {t('dashboard.confirm', { defaultValue: 'Onayla' })}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Elle ilişki tanımlama formu — her zaman görünür (otomatik bulamadığında da) */}
          <div style={{ marginTop: '12px', borderTop: '1px dashed var(--border-color)', paddingTop: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '8px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                {t('dashboard.manualRelationTitle', { defaultValue: 'Elle İlişki Tanımla' })}
              </span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                {t('dashboard.manualRelationHint', { defaultValue: 'İki dosya arasında ortak alanı (foreign key) seçin.' })}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              {/* Kaynak dosya */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '120px', flex: 1 }}>
                <label style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 700 }}>{t('dashboard.sourceTable', { defaultValue: 'Kaynak Dosya' })}</label>
                <select
                  value={manualRel.fromTable}
                  onChange={(e) => setManualRel(m => ({ ...m, fromTable: e.target.value, fromColumn: '' }))}
                  style={{ padding: '6px 8px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '11px' }}
                >
                  <option value="">{t('dashboard.selectPlaceholder', { defaultValue: 'Seçin...' })}</option>
                  {linkedDatasetsForManual.map(d => <option key={d.tableName} value={d.tableName}>{d.name}</option>)}
                </select>
              </div>
              {/* Kaynak kolon */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '110px', flex: 1 }}>
                <label style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 700 }}>{t('dashboard.sourceColumn', { defaultValue: 'Kaynak Kolon' })}</label>
                <select
                  value={manualRel.fromColumn}
                  onChange={(e) => setManualRel(m => ({ ...m, fromColumn: e.target.value }))}
                  disabled={!manualRel.fromTable}
                  style={{ padding: '6px 8px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '11px' }}
                >
                  <option value="">{t('dashboard.selectPlaceholder', { defaultValue: 'Seçin...' })}</option>
                  {manualFromColumns.map((c: any) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <span style={{ color: 'var(--color-primary)', fontWeight: 700, paddingBottom: '6px' }}>→</span>
              {/* Hedef dosya */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '120px', flex: 1 }}>
                <label style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 700 }}>{t('dashboard.targetTable', { defaultValue: 'Hedef Dosya' })}</label>
                <select
                  value={manualRel.toTable}
                  onChange={(e) => setManualRel(m => ({ ...m, toTable: e.target.value, toColumn: '' }))}
                  style={{ padding: '6px 8px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '11px' }}
                >
                  <option value="">{t('dashboard.selectPlaceholder', { defaultValue: 'Seçin...' })}</option>
                  {linkedDatasetsForManual.map(d => <option key={d.tableName} value={d.tableName}>{d.name}</option>)}
                </select>
              </div>
              {/* Hedef kolon */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '110px', flex: 1 }}>
                <label style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 700 }}>{t('dashboard.targetColumn', { defaultValue: 'Hedef Kolon' })}</label>
                <select
                  value={manualRel.toColumn}
                  onChange={(e) => setManualRel(m => ({ ...m, toColumn: e.target.value }))}
                  disabled={!manualRel.toTable}
                  style={{ padding: '6px 8px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '11px' }}
                >
                  <option value="">{t('dashboard.selectPlaceholder', { defaultValue: 'Seçin...' })}</option>
                  {manualToColumns.map((c: any) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <button
                onClick={handleAddManualRelationship}
                style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '7px 12px', background: 'var(--color-primary)', color: 'var(--color-primary-dark)', border: 0, borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                <Plus size={12} /> {t('dashboard.addRelation', { defaultValue: 'İlişki Ekle' })}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kaldırılmış widget'ları geri getirme (gelişmiş araçlar açıkken) */}
      {showAdvancedTools && removableHiddenWidgets.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', background: 'var(--bg-secondary)', padding: '10px 16px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            {t('dashboard.hiddenWidgets', { defaultValue: 'Kaldırılan Widgetlar' })}:
          </span>
          {removableHiddenWidgets.map(w => (
            <button
              key={w.id}
              onClick={() => handleRestoreWidget(w.id)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 10px', background: 'var(--bg-tertiary)', border: '1px dashed var(--border-color)', borderRadius: '6px', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}
              title={t('dashboard.restoreWidget', { defaultValue: 'Geri Ekle' })}
            >
              <Plus size={12} /> {w.getTitle(context)}
            </button>
          ))}
        </div>
      )}

      {/* Çapraz filtre bazı widget'lara uygulanamadıysa uyarı */}
      {skippedFilterCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-secondary)', padding: '8px 14px', borderRadius: '8px', border: '1px solid #f59e0b', fontSize: '11px', color: '#f59e0b', fontWeight: 600 }}>
          <Sliders size={13} />
          {t('dashboard.someFiltersSkipped', { count: skippedFilterCount, defaultValue: `${skippedFilterCount} filtre bu tabloya uygulanamadı (ilişki tanımlı değil). Dosya ilişkisi ekleyin.` })}
        </div>
      )}

      {/* Active filters ribbon — YENİ: structured filters[] tek doğruluk kaynağı.
          Önceden legacy activeFilters Record'undan render ediliyordu; chip X yalnızca
          legacy'yi siliyordu → filters[] öksüz kalıp pano kalıcı filtreli takılıyordu. */}
      {activeDashboard && getActiveFilters().length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--border-strong)', padding: '10px 16px', borderRadius: '10px', border: '1px solid var(--color-primary)' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--color-primary)' }}>{t('dashboard.activeFilters')}:</span>
            {getActiveFilters().map((f) => (
              <span key={`${f.tableName}::${f.column}`} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', color: 'var(--text-primary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <b>{f.column}{f.op === 'contains' ? ' ⊃' : ':'}</b> {f.value}
                <button
                  onClick={() => removeStructuredFilter(f.tableName, f.column)}
                  style={{ background: 'transparent', border: 0, padding: 0, display: 'grid', placeItems: 'center', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
          <button className="secondary" onClick={handleClearFilters} style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>{t('dashboard.clearFilters')}</button>
        </div>
      )}

      {(!activeDataset || !detectedColumns || !activeDashboard) ? (
        <div className="card" style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
          {t('dashboard.noLinkedTables', { defaultValue: 'Bu panoya bağlı aktif bir veri tablosu bulunamadı.' })}
        </div>
      ) : (
        // Veri hazır: Grid'i HER ZAMAN mount tut. Filtre/yenileme sırasında
        // grid'i söküp spinner koymak yerine üstüne yarı saydam overlay bindir.
        // Bu, unmount kaynaklı sayfa zıplaması / scroll sıfırlanması sorununu önler.
        <div className="print-area" style={{ position: 'relative' }}>
          {isLoadingDashboard && (
            <div style={{
              position: 'absolute',
              inset: 0,
              zIndex: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--bg-primary)',
              opacity: 0.35,
              backdropFilter: 'blur(1px)',
              borderRadius: '12px',
              pointerEvents: 'none'
            }}>
              <LoaderCircle className="spin" size={28} style={{ color: 'var(--color-primary)' }} />
            </div>
          )}
        <Grid
          className="layout"
          layout={computeLayout()}
          cols={12}
          rowHeight={50}
          width={containerWidth}
          onLayoutChange={(newLayout: any) => {
            setDashboards(prev => prev.map(d => {
              if (d.id === activeDashboard.id) {
                return { ...d, rglLayout: newLayout }
              }
              return d
            }))
          }}
          isDraggable
          isResizable
          draggableHandle=".drag-handle"
          resizeHandles={['se']}
          compactType="vertical"
          margin={[16, 16]}
          containerPadding={[0, 0]}
          style={{ marginTop: '20px' }}
        >
          {renderedWidgets.map(w => (
            <div key={w.id}>
              <WidgetShell widget={w} context={context} onRemove={handleRemoveWidget} />
            </div>
          ))}
        </Grid>
        </div>
      )}

      {/* WIDGET MAXIMIZE OVERLAY - organizer widget'i buyuk render eder */}
      {maximizedWidgetId && (() => {
        const mw = renderedWidgets.find(w => w.id === maximizedWidgetId)
        if (!mw) return null
        const maxContext = { ...context, isMaximized: true }
        return (
          <div className="modal-overlay" style={{ display: 'grid', placeItems: 'center', zIndex: 1100 }}>
            <div className="modal-card" style={{ maxWidth: '90vw', width: '100%', height: '80vh', padding: '20px', animation: 'scaleUp 0.25s', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '16px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {mw.getIcon(maxContext)} {mw.getTitle(maxContext)}
                </h3>
                <button onClick={() => setMaximizedWidgetId(null)} style={{ background: 'transparent', border: 0, color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
              </div>
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {mw.renderContent(maxContext)}
              </div>
            </div>
          </div>
        )
      })()}

      {/* WIDGET EKLE MODAL (kategorili galeri + canlı önizleme) */}
      {showAddWidget && (
        <AddWidgetModal
          dataset={activeDataset ?? null}
          isDbReady={isDbReady}
          onClose={() => setShowAddWidget(false)}
          onAdd={handleAddInstanceWidget}
        />
      )}

      {/* CREATE DASHBOARD MODAL */}
      {isCreateModalOpen && (        <div className="modal-overlay" style={{ display: 'grid', placeItems: 'center', zIndex: 1100 }}>
          <div className="modal-card" style={{ maxWidth: '420px', width: '100%', padding: '24px', animation: 'scaleUp 0.2s', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>{t('createDashboardModalTitle', { defaultValue: 'Yeni Pano Oluştur' })}</h3>
              <button onClick={() => setIsCreateModalOpen(false)} style={{ background: 'transparent', border: 0, color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                  {t('dashboardNameLabel', { defaultValue: 'Pano Adı' })}
                </label>
                <input
                  type="text"
                  placeholder={t('dashboardNamePlaceholder', { defaultValue: 'örn. Finansal Özet' })}
                  value={newDashName}
                  onChange={(e) => setNewDashName(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                  {t('selectFilesToLink', { defaultValue: 'Bağlanacak Dosyaları Seçin' })}
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '160px', overflowY: 'auto', padding: '4px' }}>
                  {datasets.map((d) => (
                    <label key={d.tableName} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-secondary)' }}>
                      <input
                        type="checkbox"
                        checked={selectedTablesToLink.includes(d.tableName)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedTableNames(prev => [...prev, d.tableName])
                          } else {
                            setSelectedTableNames(prev => prev.filter(t => t !== d.tableName))
                          }
                        }}
                        style={{ accentColor: 'var(--color-primary)' }}
                      />
                      {d.name}
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px', justifyContent: 'flex-end' }}>
                <button className="secondary" onClick={() => setIsCreateModalOpen(false)} style={{ padding: '8px 16px', fontSize: '12px', cursor: 'pointer' }}>{t('cancel', { defaultValue: 'İptal' })}</button>
                <button
                  onClick={handleCreateDashboard}
                  disabled={!newDashName.trim() || selectedTablesToLink.length === 0}
                  style={{
                    background: 'var(--color-primary)',
                    color: 'var(--color-primary-dark)',
                    border: 0,
                    borderRadius: '8px',
                    padding: '8px 16px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    opacity: (newDashName.trim() && selectedTablesToLink.length > 0) ? 1 : 0.5
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
