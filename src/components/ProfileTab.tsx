import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Table2, Database, Layers } from 'lucide-react'
import type { Dataset } from '../types'

interface ProfileTabProps {
  datasets: Dataset[]
  activeDataset: Dataset
}

export function ProfileTab({ datasets, activeDataset }: ProfileTabProps) {
  const { t } = useTranslation()
  const [selectedDataset, setSelectedDataset] = useState<Dataset>(activeDataset)

  // Sync if activeDataset changes globally
  const handleSelect = (ds: Dataset) => {
    setSelectedDataset(ds)
  }

  const ds = datasets.find(d => d.tableName === selectedDataset.tableName) || selectedDataset

  return (
    <div style={{ animation: 'fadeIn 0.4s', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Dataset Selection cards */}
      <div>
        <h4 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '10px', fontWeight: 700, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Layers size={14} /> {t('profile.selectToProfile', { defaultValue: 'Profilini İncelemek İstediğiniz Dosyayı Seçin' })}
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
          {datasets.map((d) => (
            <div 
              key={d.tableName}
              onClick={() => handleSelect(d)}
              style={{
                background: d.tableName === ds.tableName ? 'var(--border-strong)' : 'var(--bg-secondary)',
                border: d.tableName === ds.tableName ? '1px solid var(--color-primary)' : '1px solid var(--border-color)',
                borderRadius: '10px',
                padding: '12px 16px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}
            >
              <Database size={18} style={{ color: d.tableName === ds.tableName ? 'var(--color-primary)' : 'var(--text-muted)' }} />
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <div style={{ fontSize: '13px', fontWeight: 'bold', color: d.tableName === ds.tableName ? 'var(--text-primary)' : 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
                <small style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{t('rows_count', { defaultValue: '{{count}} satır', count: d.totalRows })}</small>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="content-grid" style={{ gridTemplateColumns: '1fr', gap: '20px' }}>
        {/* Columns profile metadata */}
        <section className="card" style={{ padding: '24px' }}>
          <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Table2 size={20} /> {t('profile')} — {ds.name}</span>
            <span style={{ fontSize: '11px', background: 'var(--border-strong)', color: 'var(--color-primary)', padding: '4px 10px', borderRadius: '6px', fontWeight: 'bold' }}>
              {t('total_columns', { defaultValue: '{{count}} Sütun', count: ds.columns.length })}
            </span>
          </div>

          <div className="profile-list">
            {ds.columns.map((column) => (
              <div className="profile" key={column.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '10px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <b style={{ color: 'var(--text-primary)', fontSize: '14px' }}>{column.name}</b>
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px', fontStyle: 'italic' }}>
                    {t('sample', { defaultValue: 'Örnek: ' })} <span style={{ color: 'var(--text-secondary)' }}>{column.sample}</span>
                  </span>
                </div>
                <div className="badges" style={{ display: 'flex', gap: '8px' }}>
                  <span style={{ background: 'var(--border-strong)', color: 'var(--color-primary)', fontSize: '11px', padding: '4px 8px', borderRadius: '6px', fontWeight: 600 }}>
                    {t(`dataTypes.${column.kind}`)}
                  </span>
                  <span style={{ background: 'var(--bg-primary)', color: 'var(--text-muted)', border: '1px solid var(--border-color)', fontSize: '11px', padding: '4px 8px', borderRadius: '6px', fontWeight: 600 }}>
                    {t('unique', { count: column.uniqueCount })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Dynamic Table Preview */}
        {ds.rows && ds.rows.length > 0 && (
          <section className="card" style={{ padding: '24px', overflow: 'hidden' }}>
            <div className="card-title" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Table2 size={18} /> {t('preview', { defaultValue: 'Veri Önizleme (İlk 15 Satır)' })}
            </div>
            
            <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '2px solid var(--border-color)' }}>
                    {ds.headers.map((header) => (
                      <th key={header} style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ds.rows.slice(0, 15).map((row, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)', background: idx % 2 === 0 ? 'transparent' : 'var(--bg-secondary)' }}>
                      {row.map((val, colIdx) => (
                        <td key={colIdx} style={{ padding: '10px 16px', color: 'var(--text-secondary)', font: typeof val === 'number' ? '12px "DM Mono", monospace' : 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '300px' }}>
                          {val}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
