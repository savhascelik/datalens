// components/dashboard/migrateLegacy.ts
// Faz 2 — Legacy teardown FOUNDATION (safe, saf/pure).
//
// Eski sabit widget modeli (kpis/chartBar/chartLine/table + dbBarX/Y, dbLineX/Y,
// kpiCards, hiddenWidgets) ile yeni birleşik model (dashboard.widgets: WidgetInstance[])
// arasında köprü. Bu fonksiyon SAF'tır: yan etkisi yok, aynı girdi için aynı çıktı.
// Tek render yoluna (instanceToWidget) geçişte kullanılacak; ancak canlı render'a
// bağlanması RUNTIME QA gerektirir (auto-detect etkisiyle yarış + KPI kart editörü UX'i +
// rglLayout id sürekliliği). Bu yüzden önce migration + testler; cutover ayrı adım.

import type { Dashboard, WidgetInstance, ChartKind } from '../../types'

const CHART_KINDS: ChartKind[] = ['bar', 'line', 'pie', 'scatter', 'treemap', 'funnel', 'radar']

function asChartKind(v: string | undefined, fallback: ChartKind): ChartKind {
  return (v && (CHART_KINDS as string[]).includes(v)) ? (v as ChartKind) : fallback
}

/**
 * Bir dashboard'ın legacy sabit widget yapılandırmasını WidgetInstance[]'e çevirir.
 *
 * Kurallar:
 * - Idempotent: dashboard.widgets zaten doluysa AYNEN döner (yeniden migrate etmez).
 * - hiddenWidgets içindeki legacy id'ler ('kpis'|'chartBar'|'chartLine'|'table') atlanır.
 * - kpis: kpiCards tanımlıysa her kart bir 'kpi' instance olur; değilse tek bir sayaç (count) kartı.
 * - chartBar/chartLine: yalnızca ilgili X kolonu tanımlıysa üretilir (boş grafik üretme).
 *   Chart id'leri KORUNUR ('chartBar'/'chartLine') → mevcut rglLayout konumları korunur.
 * - table: her zaman (gizlenmediyse) üretilir; id 'table' korunur.
 *
 * @param d          Kaynak dashboard.
 * @param primaryTable  Widget'ların bağlanacağı birincil tablo (aktif linked table).
 */
export function migrateLegacyDashboard(d: Dashboard, primaryTable?: string): WidgetInstance[] {
  if (d.widgets && d.widgets.length > 0) return d.widgets

  const table = primaryTable || d.linkedTableNames?.[0] || ''
  const hidden = new Set(d.hiddenWidgets ?? [])
  const out: WidgetInstance[] = []

  // KPI'lar → kpi instance(lar)
  if (!hidden.has('kpis')) {
    const cards = d.kpiCards ?? []
    if (cards.length > 0) {
      for (const c of cards) {
        out.push({
          id: `mig_${c.id}`,
          type: 'kpi',
          sourceTable: table,
          config: {
            column: c.column || '',
            aggregation: c.aggregation as WidgetInstance['config']['aggregation'] | any,
            format: c.format || 'number',
            title: c.label || undefined,
          },
        })
      }
    } else {
      // Varsayılan: satır sayısı kartı (KpiView'in default_count kartına denk).
      out.push({ id: 'mig_kpi_count', type: 'kpi', sourceTable: table, config: { column: '', aggregation: 'count', format: 'number' } })
    }
  }

  // Bar grafiği (yalnızca X kolonu varsa) — id korunur.
  if (!hidden.has('chartBar') && d.dbBarX) {
    out.push({
      id: 'chartBar',
      type: asChartKind(d.dbBarType, 'bar'),
      sourceTable: table,
      config: { xColumn: d.dbBarX, yColumn: d.dbBarY || undefined, aggregation: 'sum' },
    })
  }

  // Çizgi grafiği (yalnızca X kolonu varsa) — id korunur.
  if (!hidden.has('chartLine') && d.dbLineX) {
    out.push({
      id: 'chartLine',
      type: asChartKind(d.dbLineType, 'line'),
      sourceTable: table,
      config: { xColumn: d.dbLineX, yColumn: d.dbLineY || undefined, aggregation: 'sum' },
    })
  }

  // Detay tablosu — id korunur.
  if (!hidden.has('table')) {
    out.push({ id: 'table', type: 'table', sourceTable: table, config: {} })
  }

  return out
}

/**
 * Dashboard'ın legacy modelde olup olmadığını (henüz widgets[] üretilmemiş) döndürür.
 * Cutover sırasında "yükleme anında bir kez migrate et" koşulu için kullanılır.
 */
export function needsMigration(d: Dashboard): boolean {
  return !d.widgets || d.widgets.length === 0
}
