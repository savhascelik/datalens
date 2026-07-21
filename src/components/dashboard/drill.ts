// components/dashboard/drill.ts
// Drill-down (alt-kırılıma inme) yardımcıları. Bir grafikte bir kategoriye tıklayınca
// bir sonraki kategorik kolona iner (ör. Region → City). Hiyerarşi, veri setindeki
// kategorik (string) kolonların sırasıdır; başlangıç, widget'ın X kolonudur.

import type { ActiveFilter } from '../../types'

export interface DrillStep { column: string; value: string }

interface ColumnLike { name: string; kind: string }

// Drill hiyerarşisi: kategorik kolonlar (veri sırasında), startColumn'dan itibaren.
export function drillLevels(columns: ColumnLike[], startColumn: string): string[] {
  const cats = columns.filter(c => c.kind === 'string').map(c => c.name)
  const start = cats.indexOf(startColumn)
  if (start < 0) return startColumn ? [startColumn] : cats
  return cats.slice(start)
}

// Drill yığınını (baseTable üzerinde) ActiveFilter dizisine çevirir.
export function drillFilters(baseTable: string, stack: DrillStep[]): ActiveFilter[] {
  return stack.map(s => ({ tableName: baseTable, column: s.column, value: s.value }))
}

// Verilen X ve drill yığınına göre o an gösterilecek kolonu belirler.
export function currentDrillColumn(levels: string[], stack: DrillStep[], fallback: string): string {
  if (levels.length === 0) return fallback
  return levels[Math.min(stack.length, levels.length - 1)] || fallback
}

// Bu seviyede daha derine inilebilir mi?
export function canDrillDeeper(levels: string[], stack: DrillStep[]): boolean {
  return stack.length < levels.length - 1
}
