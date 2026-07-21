// components/dashboard/DataTableView.tsx
// Lazy-loading + arama + çapraz filtre destekli detay veri tablosu.
//
// - Sunucu tarafı (DuckDB) pagination: LIMIT/OFFSET ile sayfa sayfa çeker
// - Serbest metin arama: tüm kolonlarda ILIKE (debounce'lu)
// - Hücreye tıklayınca o kolon+değer için çapraz filtre uygular (diğer widget'lara yansır)
// - Filtre/arama değişince toplam satır sayısını yeniden hesaplar

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, ChevronLeft, ChevronRight, LoaderCircle } from 'lucide-react'
import { fetchTablePage } from '../../services/widgetData'
import type { WidgetContext } from './types'

const PAGE_SIZE = 25

export function DataTableView({ context }: { context: WidgetContext }) {
  const { activeDataset, filters, relationships, toggleStructuredFilter, isDbReady, t } = context

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState<any[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  const baseTable: string | undefined = activeDataset?.tableName
  const headers: string[] = activeDataset?.headers ?? []

  // Arama debounce (kullanıcı yazarken her tuşta sorgu atmamak için)
  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(0) // arama değişince ilk sayfaya dön
    }, 350)
    return () => clearTimeout(id)
  }, [search])

  // Filtre değişince ilk sayfaya dön
  const filtersKey = useMemo(() => JSON.stringify(filters), [filters])
  useEffect(() => { setPage(0) }, [filtersKey])

  // Veri + toplam sayı çek (lazy)
  const reqRef = useRef(0)
  useEffect(() => {
    if (!isDbReady || !baseTable) return
    const reqId = ++reqRef.current
    setIsLoading(true)

    ;(async () => {
      try {
        const res = await fetchTablePage({
          baseTable,
          columns: headers,
          search: debouncedSearch,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
          filters,
          relationships,
        })
        // Yalnızca en güncel istek sonucunu uygula (yarış durumunu önle)
        if (reqId !== reqRef.current) return
        setTotalRows(res.total)
        setRows(res.rows)
      } catch (err) {
        console.error('Data table sorgu hatası:', err)
        if (reqId === reqRef.current) { setRows([]); setTotalRows(0) }
      } finally {
        if (reqId === reqRef.current) setIsLoading(false)
      }
    })()
  }, [isDbReady, baseTable, headers.length, debouncedSearch, page, filtersKey, relationships])

  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE))
  const fromRow = totalRows === 0 ? 0 : page * PAGE_SIZE + 1
  const toRow = Math.min((page + 1) * PAGE_SIZE, totalRows)

  // Aktif bir hücre filtresi mi? (görsel vurgulamak için)
  const isCellFiltered = (col: string, val: string) =>
    filters.some(f => f.tableName === baseTable && f.column === col && f.value === String(val))

  if (!baseTable) {
    return <div className="empty-chart">{t('dashboard.noData', { defaultValue: 'Veri yok' })}</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: '8px' }}>
      {/* Arama kutusu */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('dashboard.searchPlaceholder', { defaultValue: 'Tabloda ara...' })}
            style={{ width: '100%', padding: '6px 10px 6px 30px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '11px', outline: 'none' }}
          />
        </div>
        {isLoading && <LoaderCircle className="spin" size={14} style={{ color: 'var(--color-primary)' }} />}
      </div>

      {/* Tablo */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
          <thead>
            <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '2px solid var(--border-color)', position: 'sticky', top: 0, zIndex: 1 }}>
              {headers.map((header) => (
                <th key={header} style={{ padding: '10px 12px', fontWeight: 'bold', color: 'var(--text-primary)', background: 'var(--bg-tertiary)', whiteSpace: 'nowrap' }}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} style={{ borderBottom: '1px solid var(--border-color)', background: index % 2 === 0 ? 'transparent' : 'var(--bg-secondary)' }}>
                {headers.map((colName) => {
                  const cellVal = row[colName]
                  const strVal = cellVal !== null && cellVal !== undefined ? String(cellVal) : ''
                  const active = isCellFiltered(colName, strVal)
                  return (
                    <td
                      key={colName}
                      onClick={(e) => { e.stopPropagation(); if (strVal) toggleStructuredFilter(baseTable, colName, strVal) }}
                      title={t('dashboard.clickToCrossFilter', { defaultValue: 'Çapraz filtre için tıklayın' })}
                      style={{
                        padding: '8px 12px',
                        color: active ? 'var(--color-primary-dark)' : 'var(--text-secondary)',
                        background: active ? 'var(--color-primary)' : 'transparent',
                        cursor: 'pointer',
                        maxWidth: '220px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontWeight: active ? 700 : 400,
                      }}
                    >
                      {strVal}
                    </td>
                  )
                })}
              </tr>
            ))}
            {rows.length === 0 && !isLoading && (
              <tr><td colSpan={headers.length} style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)' }}>{t('dashboard.noData', { defaultValue: 'Veri yok' })}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', paddingTop: '4px' }} onClick={(e) => e.stopPropagation()}>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
          {t('dashboard.showingRows', { from: fromRow, to: toRow, total: totalRows.toLocaleString(), defaultValue: `${fromRow}-${toRow} / ${totalRows}` })}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0 || isLoading}
            className="icon-button"
            style={{ opacity: page === 0 ? 0.4 : 1 }}
          >
            <ChevronLeft size={14} />
          </button>
          <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 600, minWidth: '54px', textAlign: 'center' }}>
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1 || isLoading}
            className="icon-button"
            style={{ opacity: page >= totalPages - 1 ? 0.4 : 1 }}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default DataTableView
