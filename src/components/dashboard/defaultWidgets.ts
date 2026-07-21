// components/dashboard/defaultWidgets.ts
// Yeni model "hazır dashboard" üretimi. İlk açılışta otomatik oluşturulan (ve kullanıcının
// elle oluşturduğu) panolar, eski sabit widget'lar yerine YENİ instance widget'larıyla
// (WidgetInstance[]) gelsin diye kullanılır. Böylece yeni yapıya uygun araçlar (KPI kartları,
// bar/line grafik, detay tablo) baştan yerleşik olur ve tek render yolu (instanceToWidget) çalışır.

import type { Dataset, WidgetInstance } from '../../types'

interface ColumnLike { name: string; kind: string; uniqueCount?: number }

// DashboardTab'in auto-detect mantığıyla uyumlu kolon seçimi.
function detectColumns(cols: ColumnLike[]) {
  const numericCol = cols.find(c => c.kind === 'number')?.name || ''
  const categoricCol =
    cols.find(c => c.kind === 'string' && (c.uniqueCount ?? 0) > 1 && (c.uniqueCount ?? 0) < 100)?.name ||
    cols.find(c => c.kind === 'string')?.name || ''
  const secCategoricCol = cols.find(c => c.kind === 'string' && c.name !== categoricCol)?.name || ''
  const dateCol = cols.find(c => {
    const n = c.name.toLowerCase()
    return n.includes('date') || n.includes('year') || n.includes('month') || n.includes('tarih') || n.includes('time')
  })?.name || ''
  return { numericCol, categoricCol, secCategoricCol, dateCol }
}

export interface DefaultWidgetsResult {
  widgets: WidgetInstance[]
  rglLayout: Array<{ i: string; x: number; y: number; w: number; h: number }>
}

/**
 * Bir dataset için "hazır" yeni-model widget seti + yerleşim üretir:
 * KPI kartları (sayaç + varsa toplam + varsa benzersiz), bar grafik, çizgi grafik, detay tablo.
 * Kolon yoksa ilgili widget atlanır. İçerik yoksa (kolon hiç yok) yalnızca tablo gelir.
 */
export function buildDefaultInstanceWidgets(dataset: Dataset): DefaultWidgetsResult {
  const table = dataset.tableName
  const { numericCol, categoricCol, secCategoricCol, dateCol } = detectColumns(dataset.columns ?? [])

  const widgets: WidgetInstance[] = []
  const rglLayout: DefaultWidgetsResult['rglLayout'] = []

  // --- Arama kutusu (en üstte, tam genişlik) — kategorik bir kolon varsa ---
  // Panodaki tüm widget'ları 'contains' ile filtreler (ilişki üzerinden diğer tablolara da).
  const hasSearch = Boolean(categoricCol)
  if (hasSearch) {
    widgets.push({ id: 'search_top', type: 'search', sourceTable: table, config: { column: categoricCol } })
    rglLayout.push({ i: 'search_top', x: 0, y: 0, w: 12, h: 2 })
  }

  // Arama varsa KPI'lar bir satır aşağıdan başlar.
  const kpiY = hasSearch ? 2 : 0
  const kpiH = 3 // içerik (etiket + büyük sayı) tam sığsın diye 2 yerine 3

  // --- KPI satırı ---
  widgets.push({ id: 'kpi_count', type: 'kpi', sourceTable: table, config: { column: '', aggregation: 'count', format: 'number' } })
  rglLayout.push({ i: 'kpi_count', x: 0, y: kpiY, w: 4, h: kpiH })

  if (numericCol) {
    widgets.push({ id: 'kpi_sum', type: 'kpi', sourceTable: table, config: { column: numericCol, aggregation: 'sum', format: 'number' } })
    rglLayout.push({ i: 'kpi_sum', x: 4, y: kpiY, w: 4, h: kpiH })
  }
  if (categoricCol) {
    widgets.push({ id: 'kpi_distinct', type: 'kpi', sourceTable: table, config: { column: categoricCol, aggregation: 'count-distinct' as any, format: 'number' } })
    rglLayout.push({ i: 'kpi_distinct', x: 8, y: kpiY, w: 4, h: kpiH })
  }

  // --- Grafikler ---
  const chartY = kpiY + kpiH
  if (categoricCol) {
    widgets.push({ id: 'chartBar', type: 'bar', sourceTable: table, config: { xColumn: categoricCol, yColumn: numericCol || undefined, aggregation: 'sum' } })
    rglLayout.push({ i: 'chartBar', x: 0, y: chartY, w: 6, h: 7 })
  }
  const lineX = dateCol || secCategoricCol || categoricCol
  if (lineX) {
    widgets.push({ id: 'chartLine', type: 'line', sourceTable: table, config: { xColumn: lineX, yColumn: numericCol || undefined, aggregation: 'sum' } })
    rglLayout.push({ i: 'chartLine', x: 6, y: chartY, w: 6, h: 7 })
  }

  // --- Detay tablo (her zaman) ---
  const tableY = chartY + 7
  widgets.push({ id: 'table', type: 'table', sourceTable: table, config: {} })
  rglLayout.push({ i: 'table', x: 0, y: tableY, w: 12, h: 8 })

  return { widgets, rglLayout }
}
