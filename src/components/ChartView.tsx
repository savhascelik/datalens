import { Suspense, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LoaderCircle } from 'lucide-react'
import { BarChart, LineChart, PieChart, ScatterChart, TreemapChart, FunnelChart, RadarChart } from './charts'
import type { ChartKind } from '../types'

interface ChartViewProps {
  type: ChartKind
  title?: string
  data: Record<string, any>[]
  xAxisKey: string
  yAxisKey: string
  onPointClick?: (category: string) => void
}

export function ChartView({ type, title = '', data, xAxisKey, yAxisKey, onPointClick }: ChartViewProps) {
  const { t } = useTranslation()
  const [currentTheme, setCurrentTheme] = useState<'dark' | 'light'>(() => {
    return (document.documentElement.getAttribute('data-theme') as 'dark' | 'light') || 'dark'
  })

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const t = (document.documentElement.getAttribute('data-theme') as 'dark' | 'light') || 'dark'
      setCurrentTheme(t)
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  const renderLazyChart = () => {
    switch (type) {
      case 'bar':
        return <BarChart title={title} data={data} xAxisKey={xAxisKey} yAxisKey={yAxisKey} theme={currentTheme} onPointClick={onPointClick} />
      case 'line':
        return <LineChart title={title} data={data} xAxisKey={xAxisKey} yAxisKey={yAxisKey} theme={currentTheme} onPointClick={onPointClick} />
      case 'pie':
        return <PieChart title={title} data={data} xAxisKey={xAxisKey} yAxisKey={yAxisKey} theme={currentTheme} onPointClick={onPointClick} />
      case 'scatter':
        return <ScatterChart title={title} data={data} xAxisKey={xAxisKey} yAxisKey={yAxisKey} theme={currentTheme} onPointClick={onPointClick} />
      case 'treemap':
        return <TreemapChart title={title} data={data} xAxisKey={xAxisKey} yAxisKey={yAxisKey} theme={currentTheme} onPointClick={onPointClick} />
      case 'funnel':
        return <FunnelChart title={title} data={data} xAxisKey={xAxisKey} yAxisKey={yAxisKey} theme={currentTheme} onPointClick={onPointClick} />
      case 'radar':
        return <RadarChart title={title} data={data} xAxisKey={xAxisKey} yAxisKey={yAxisKey} theme={currentTheme} onPointClick={onPointClick} />
      default:
        return <BarChart title={title} data={data} xAxisKey={xAxisKey} yAxisKey={yAxisKey} theme={currentTheme} onPointClick={onPointClick} />
    }
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        flex: 1,
        minHeight: 0,
        background: 'var(--bg-secondary)',
        borderRadius: '12px',
        padding: '16px',
        border: '1px solid var(--border-color)',
        position: 'relative',
        cursor: onPointClick ? 'pointer' : 'default',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <Suspense fallback={
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          color: 'var(--text-muted)',
          fontSize: '11px',
          fontWeight: 600
        }}>
          <LoaderCircle className="spin" size={24} style={{ color: 'var(--color-primary)' }} />
          <span>{t('chartLoading')}</span>
        </div>
      }>
        {renderLazyChart()}
      </Suspense>
    </div>
  )
}
