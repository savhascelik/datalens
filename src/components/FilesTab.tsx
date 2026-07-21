import React, { useState } from 'react'
import { Database, Trash2, Upload, BarChart3 } from 'lucide-react'
import type { Dataset } from '../types'
import { ProfileTab } from './ProfileTab'

interface FilesTabProps {
  datasets: Dataset[]
  activeDataset: Dataset | null
  setActiveDataset: (ds: Dataset | null) => void
  handleDeleteDataset: (tableName: string, e: React.MouseEvent) => Promise<void>
  inputRef: React.RefObject<HTMLInputElement>
  dragging: boolean
  setDragging: (b: boolean) => void
  loadFile: (file?: File) => Promise<void>
  sheetUrl: string
  setSheetUrl: (url: string) => void
  handleLoadGoogleSheet: () => Promise<void>
  showImportBox: boolean
  setShowImportBox: (show: boolean) => void
  t: (key: string, options?: any) => string
  setDatasets: (datasets: Dataset[]) => void
  setIsDbReady: (ready: boolean) => void
  deleteLocalDataset: (id: string) => Promise<void>
}

export function FilesTab({
  datasets,
  activeDataset,
  setActiveDataset,
  handleDeleteDataset,
  inputRef,
  dragging,
  setDragging,
  loadFile,
  sheetUrl,
  setSheetUrl,
  handleLoadGoogleSheet,
  showImportBox,
  setShowImportBox,
  t,
  setDatasets,
  setIsDbReady,
  deleteLocalDataset
}: FilesTabProps) {
  const [showProfile, setShowProfile] = useState(false)

  return (
    <div style={{ animation: 'fadeIn 0.4s', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Workspace Title Header */}
      <div className="dataset-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p className="eyebrow">{t('fileReady', { defaultValue: 'YÜKLENEN VERİLER' })}</p>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>{t('workspaceFiles', { defaultValue: 'Veri Kütüphanesi' })}</h2>
        </div>
        
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            className="secondary" 
            onClick={() => {
              if (confirm(t('confirmResetWorkspace', { defaultValue: 'Tüm çalışma alanını sıfırlamak istediğinize emin misiniz?' }))) {
                setDatasets([])
                setActiveDataset(null)
                setIsDbReady(false)
                // Clear IndexedDB store
                import('../db-store').then(({ getAllLocalDatasets, deleteLocalDataset }) => {
                  getAllLocalDatasets().then(list => {
                    list.forEach(item => deleteLocalDataset(item.id))
                  })
                })
              }
            }}
            style={{ cursor: 'pointer' }}
          >
            {t('resetWorkspace', { defaultValue: 'Temizle' })}
          </button>
        </div>
      </div>

      {/* Dataset Cards Grid */}
      <div style={{ marginBottom: '10px' }}>
        {datasets.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', background: 'var(--bg-secondary)', borderRadius: '12px', border: '2px dashed var(--border-color)', color: 'var(--text-muted)' }}>
            <Database size={32} style={{ marginBottom: '10px', opacity: 0.5 }} />
            <p style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>{t('noDatasetsYet', { defaultValue: 'Henüz bir dosya yüklemediniz. Aşağıdaki panelden başlayabilirsiniz!' })}</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
            {datasets.map((ds) => {
              const isActive = activeDataset?.tableName === ds.tableName
              const hasProfileOpen = isActive && showProfile

              return (
                <div 
                  key={ds.tableName} 
                  onClick={() => {
                    setActiveDataset(ds)
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    padding: '16px',
                    background: isActive ? 'var(--border-strong)' : 'var(--bg-secondary)',
                    borderRadius: '12px',
                    border: isActive ? '2px solid var(--color-primary)' : '1px solid var(--border-color)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: isActive ? '0 8px 24px rgba(99, 102, 241, 0.12)' : 'none',
                    position: 'relative'
                  }}
                >
                  {/* Header row inside card */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                      <div style={{ 
                        padding: '8px', 
                        background: isActive ? 'var(--color-primary)' : 'var(--bg-tertiary)', 
                        borderRadius: '8px',
                        color: isActive ? 'var(--color-primary-dark)' : 'var(--text-secondary)',
                        display: 'grid',
                        placeItems: 'center'
                      }}>
                        <Database size={16} />
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
                          {ds.name}
                        </div>
                        <small style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginTop: '2px' }}>
                          {ds.name.toLowerCase().endsWith('.csv') ? 'CSV' : 
                           ds.name.toLowerCase().endsWith('.parquet') ? 'Parquet' : 
                           ds.name.toLowerCase().endsWith('.json') ? 'JSON' : 
                           ds.tableName.startsWith('sheet_') ? 'Google Sheets' : 'Excel'}
                        </small>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '4px' }}>
                      {/* Toggle profile icon */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setActiveDataset(ds)
                          setShowProfile(prev => isActive ? !prev : true)
                        }}
                        title={hasProfileOpen ? t('hideDataProfile', { defaultValue: 'Veri Profilini Gizle' }) : t('showDataProfile', { defaultValue: 'Veri Profilini Göster' })}
                        style={{
                          background: 'transparent',
                          border: 0,
                          padding: '6px',
                          color: hasProfileOpen ? 'var(--color-primary)' : 'var(--text-muted)',
                          display: 'grid',
                          placeItems: 'center',
                          cursor: 'pointer',
                          borderRadius: '6px',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-primary)')}
                        onMouseLeave={(e) => {
                          if (!hasProfileOpen) {
                            e.currentTarget.style.color = 'var(--text-muted)'
                          }
                        }}
                      >
                        <BarChart3 size={15} />
                      </button>

                      {/* Delete icon */}
                      <button
                        onClick={(e) => handleDeleteDataset(ds.tableName, e)}
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
                        title={t('deleteDataset', { defaultValue: 'Veri Setini Sil' })}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Summary counts row inside card */}
                  <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                    <span style={{ 
                      fontSize: '11px', 
                      fontWeight: 'bold', 
                      padding: '3px 8px', 
                      background: 'var(--bg-tertiary)', 
                      border: '1px solid var(--border-color)', 
                      borderRadius: '6px',
                      color: 'var(--text-secondary)'
                    }}>
                      {t('rows_count', { count: ds.totalRows, defaultValue: `${ds.totalRows} Satır` })}
                    </span>
                    <span style={{ 
                      fontSize: '11px', 
                      fontWeight: 'bold', 
                      padding: '3px 8px', 
                      background: 'var(--bg-tertiary)', 
                      border: '1px solid var(--border-color)', 
                      borderRadius: '6px',
                      color: 'var(--text-secondary)'
                    }}>
                      {t('columns_count', { count: ds.columns.length, defaultValue: `${ds.columns.length} Sütun` })}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <p className="excel-note" style={{ color: 'var(--text-muted)', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '5px', marginTop: '12px' }}>
          <Database size={12} /> {t('excelInfo')}
        </p>
      </div>

      {/* Collapsible Import Drawer / Card inside Files tab */}
      <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setShowImportBox(!showImportBox)}>
          <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Upload size={16} style={{ color: 'var(--color-primary)' }} />
            {t('importNewDataset', { defaultValue: 'Yeni Veri Kümesi İçe Aktar' })}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>{showImportBox ? t('collapse', { defaultValue: 'Gizle' }) : t('expand', { defaultValue: 'Göster' })}</span>
        </div>
        
        {showImportBox && (
          <div style={{ marginTop: '16px', animation: 'fadeIn 0.2s' }}>
            <div 
              className={`upload-zone-compact ${dragging ? 'dragging' : ''}`}
              onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => { event.preventDefault(); setDragging(false); void loadFile(event.dataTransfer.files[0]) }}
              style={{
                border: '2px dashed var(--border-color)',
                background: 'var(--bg-tertiary)',
                borderRadius: '10px',
                padding: '24px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s',
                position: 'relative'
              }}
              onClick={() => inputRef.current?.click()}
            >
              <Upload size={24} style={{ color: 'var(--text-muted)', marginBottom: '8px' }} />
              <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>{t('uploadTitleCompact', { defaultValue: 'Dosyayı buraya sürükleyin veya seçmek için tıklayın' })}</p>
              <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>CSV, Excel, Parquet, JSON</small>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '14px 0', justifyContent: 'center' }}>
              <span style={{ flex: 1, height: '1px', background: 'var(--border-color)' }}></span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>{t('orText')}</span>
              <span style={{ flex: 1, height: '1px', background: 'var(--border-color)' }}></span>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <input 
                type="text" 
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                placeholder={t('gSheetPlaceholder')}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  outline: 'none'
                }}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && sheetUrl.trim()) {
                    void handleLoadGoogleSheet()
                  }
                }}
              />
              <button 
                onClick={(e) => { e.stopPropagation(); void handleLoadGoogleSheet() }}
                disabled={!sheetUrl.trim()}
                style={{
                  background: 'var(--color-primary)',
                  color: 'var(--color-primary-dark)',
                  border: 0,
                  borderRadius: '8px',
                  padding: '10px 16px',
                  fontWeight: 'bold',
                  fontSize: '12px',
                  cursor: 'pointer',
                  transition: 'opacity 0.2s',
                  opacity: sheetUrl.trim() ? 1 : 0.5
                }}
              >
                {t('importGSheet')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Embedded File Profiler details */}
      {activeDataset && showProfile && (
        <div style={{ marginTop: '10px', animation: 'fadeIn 0.3s ease-out' }}>
          <ProfileTab datasets={datasets} activeDataset={activeDataset} />
        </div>
      )}
    </div>
  )
}
