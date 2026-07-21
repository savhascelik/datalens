// components/dashboard/widgetTypes.ts
// MERKEZI widget tip registry'si. Tüm widget türleri (kpi/chart/data/control) burada
// tek yerde tanımlanır: kategori, ikon, başlık anahtarı ve config ihtiyaçları. Galeri,
// varsayılan config üretimi ve (ileride) AI yetenekleri hep buradan beslenir.
// Yeni bir tip eklemek = buraya bir kayıt + bir renderer (WidgetRegistry.instanceToWidget).

import {
  Hash, BarChart3, LineChart, PieChart, ScatterChart, LayoutGrid, Filter, Radar, Table2,
  Search, SlidersHorizontal, Gauge, Sparkles,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { WidgetInstance } from '../../types'

export type WidgetCategory = 'kpi' | 'chart' | 'data' | 'control'

export interface WidgetTypeMeta {
  type: string
  category: WidgetCategory
  titleKey: string
  defaultTitle: string
  icon: LucideIcon
  // Galeri config panelinin hangi alanları göstereceği.
  needs: { x?: boolean; y?: boolean; column?: boolean; aggregation?: boolean }
}

export const WIDGET_TYPES: WidgetTypeMeta[] = [
  { type: 'kpi', category: 'kpi', titleKey: 'dashboard.widgetTypes.kpi', defaultTitle: 'KPI', icon: Hash, needs: { column: true, aggregation: true } },
  { type: 'bar', category: 'chart', titleKey: 'dashboard.chartTypes.bar', defaultTitle: 'Bar', icon: BarChart3, needs: { x: true, y: true } },
  { type: 'line', category: 'chart', titleKey: 'dashboard.chartTypes.line', defaultTitle: 'Çizgi', icon: LineChart, needs: { x: true, y: true } },
  { type: 'pie', category: 'chart', titleKey: 'dashboard.chartTypes.pie', defaultTitle: 'Pasta', icon: PieChart, needs: { x: true, y: true } },
  { type: 'scatter', category: 'chart', titleKey: 'dashboard.chartTypes.scatter', defaultTitle: 'Dağılım', icon: ScatterChart, needs: { x: true, y: true } },
  { type: 'treemap', category: 'chart', titleKey: 'dashboard.chartTypes.treemap', defaultTitle: 'Ağaç Harita', icon: LayoutGrid, needs: { x: true, y: true } },
  { type: 'funnel', category: 'chart', titleKey: 'dashboard.chartTypes.funnel', defaultTitle: 'Huni', icon: Filter, needs: { x: true, y: true } },
  { type: 'radar', category: 'chart', titleKey: 'dashboard.chartTypes.radar', defaultTitle: 'Radar', icon: Radar, needs: { x: true, y: true } },
  { type: 'gauge', category: 'kpi', titleKey: 'dashboard.chartTypes.gauge', defaultTitle: 'Gösterge', icon: Gauge, needs: { column: true, aggregation: true } },
  { type: 'table', category: 'data', titleKey: 'dashboard.widgetTypes.table', defaultTitle: 'Tablo', icon: Table2, needs: {} },
  { type: 'aiInsight', category: 'data', titleKey: 'dashboard.widgetTypes.aiInsight', defaultTitle: 'AI İçgörü', icon: Sparkles, needs: {} },
  { type: 'search', category: 'control', titleKey: 'dashboard.widgetTypes.search', defaultTitle: 'Arama', icon: Search, needs: { column: true } },
  { type: 'slicer', category: 'control', titleKey: 'dashboard.widgetTypes.slicer', defaultTitle: 'Dilimleyici', icon: SlidersHorizontal, needs: { column: true } },
]

export const CHART_KINDS_IN_REGISTRY = ['bar', 'line', 'pie', 'scatter', 'treemap', 'funnel', 'radar'] as const

export function getWidgetType(type: string): WidgetTypeMeta | undefined {
  return WIDGET_TYPES.find(w => w.type === type)
}

// Galeri için kategoriye göre grupla (kayıt sırasını korur).
export function widgetTypesByCategory(): { category: WidgetCategory; items: WidgetTypeMeta[] }[] {
  const order: WidgetCategory[] = ['kpi', 'chart', 'control', 'data']
  return order
    .map(category => ({ category, items: WIDGET_TYPES.filter(w => w.category === category) }))
    .filter(g => g.items.length > 0)
}

// Bir tip için makul varsayılan config üretir (galeri/AI için).
export function defaultConfigFor(type: string, columns: { name: string; kind: string }[]): WidgetInstance['config'] {
  const meta = getWidgetType(type)
  const firstCat = columns.find(c => c.kind === 'string')?.name || columns[0]?.name || ''
  const firstNum = columns.find(c => c.kind === 'number')?.name || ''
  if (!meta) return {}
  if (meta.category === 'kpi' || type === 'gauge') return { column: firstNum || firstCat, aggregation: firstNum ? 'sum' : 'count', format: 'number' }
  if (meta.category === 'control') return { column: firstCat }
  if (meta.category === 'data') return {}
  // chart
  return { xColumn: firstCat, yColumn: firstNum || undefined, aggregation: 'sum' }
}
