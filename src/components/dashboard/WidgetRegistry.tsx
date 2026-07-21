import { ReactNode } from 'react'
import { LayoutGrid, AreaChart, Table2, BarChart3 } from 'lucide-react'
import { IDashboardWidget, WidgetContext } from './types'
import { KpiView } from './KpiView'
import { DataTableView } from './DataTableView'
import { ChartWidgetView } from './ChartWidgetView'
import { InstanceChartView } from './InstanceChartView'
import { InstanceKpiView } from './InstanceKpiView'
import { InstanceSearchView } from './InstanceSearchView'
import { InstanceSlicerView } from './InstanceSlicerView'
import { InstanceGaugeView } from './InstanceGaugeView'
import { InstanceAiInsightView } from './InstanceAiInsightView'
import { getWidgetType } from './widgetTypes'
import type { WidgetInstance } from '../../types'

// Her widget yalnızca kimliğini, başlığını, ikonunu ve içerik bileşenini bildirir.
// Tüm veri çekme + etkileşim (çapraz filtre, kolon seçimi, sayfa) ilgili
// View bileşeninin içindedir. DashboardTab bunları yalnızca yerleştirir (organizer).

export class KPIsWidget implements IDashboardWidget {
  id = 'kpis'
  isVisible(): boolean { return true }
  getTitle(context: WidgetContext): string {
    return context.t('dashboard.kpisWidget', { defaultValue: 'Özet Metrikler (KPI)' })
  }
  getIcon(): ReactNode { return <LayoutGrid size={18} /> }
  canMaximize(): boolean { return true }
  renderContent(context: WidgetContext): ReactNode {
    return <KpiView context={context} />
  }
}

export class ChartBarWidget implements IDashboardWidget {
  id = 'chartBar'
  isVisible(context: WidgetContext): boolean {
    return !!(context.detectedColumns?.categoricCol && context.activeDashboard)
  }
  getTitle(context: WidgetContext): string {
    const d = context.activeDashboard
    if (!d) return ''
    return d.dbBarY
      ? context.t('dashboard.distributionBy', { x: d.dbBarX, y: d.dbBarY })
      : context.t('dashboard.distributionOf', { col: d.dbBarX })
  }
  getIcon(): ReactNode { return <AreaChart size={18} /> }
  canMaximize(): boolean { return true }
  renderContent(context: WidgetContext): ReactNode {
    return <ChartWidgetView context={context} slot="bar" />
  }
}

export class ChartLineWidget implements IDashboardWidget {
  id = 'chartLine'
  isVisible(context: WidgetContext): boolean {
    return !!(context.detectedColumns?.categoricCol && context.activeDashboard)
  }
  getTitle(context: WidgetContext): string {
    const d = context.activeDashboard
    if (!d) return ''
    return d.dbLineY
      ? context.t('dashboard.distributionBy', { x: d.dbLineX, y: d.dbLineY })
      : context.t('dashboard.distributionOf', { col: d.dbLineX })
  }
  getIcon(): ReactNode { return <AreaChart size={18} /> }
  canMaximize(): boolean { return true }
  renderContent(context: WidgetContext): ReactNode {
    return <ChartWidgetView context={context} slot="line" />
  }
}

export class TableWidget implements IDashboardWidget {
  id = 'table'
  isVisible(): boolean { return true }
  getTitle(context: WidgetContext): string {
    return context.t('dashboard.detailsTable', { defaultValue: 'Detay Veri Tablosu' })
  }
  getIcon(): ReactNode { return <Table2 size={18} /> }
  canMaximize(): boolean { return true }
  renderContent(context: WidgetContext): ReactNode {
    return <DataTableView context={context} />
  }
}

export const ALL_WIDGETS: IDashboardWidget[] = [
  new KPIsWidget(),
  new ChartBarWidget(),
  new ChartLineWidget(),
  new TableWidget(),
]

// Kullanıcının eklediği çoklu grafik widget'ları (WidgetInstance) için adaptör:
// bir instance'ı, Grid + WidgetShell'in beklediği IDashboardWidget arayüzüne sarar.
export function instanceToWidget(instance: WidgetInstance): IDashboardWidget {
  const meta = getWidgetType(instance.type)
  const Icon = meta?.icon ?? BarChart3
  return {
    id: instance.id,
    instance,
    isVisible: () => true,
    getTitle: () => instance.config.title || instance.config.label || instance.config.xColumn || instance.config.column || meta?.defaultTitle || instance.type,
    getIcon: () => <Icon size={18} />,
    // Tüm instance widget'ları büyütülebilir (tutarlı chrome; BUG-1).
    canMaximize: () => true,
    renderContent: (context: WidgetContext) => {
      if (instance.type === 'kpi') return <InstanceKpiView context={context} instance={instance} />
      if (instance.type === 'gauge') return <InstanceGaugeView context={context} instance={instance} />
      if (instance.type === 'aiInsight') return <InstanceAiInsightView context={context} instance={instance} />
      if (instance.type === 'table') return <DataTableView context={context} />
      if (instance.type === 'search') return <InstanceSearchView context={context} instance={instance} />
      if (instance.type === 'slicer') return <InstanceSlicerView context={context} instance={instance} />
      return <InstanceChartView context={context} instance={instance} />
    },
  }
}
