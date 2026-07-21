import type { BaseChartProps } from './types'
import { useEChart } from '../../hooks/useEChart'

export default function FunnelChart({ title, data, xAxisKey, yAxisKey, theme, onPointClick }: BaseChartProps) {
  const chartRef = useEChart({
    theme,
    onPointClick,
    deps: [title, data, xAxisKey, yAxisKey, theme],
    buildOption: () => {
      const isDark = theme === 'dark'
      const seriesData = data.map((row) => ({
        name: String(row[xAxisKey] ?? ''),
        value: typeof row[yAxisKey] === 'number' ? row[yAxisKey] : Number(row[yAxisKey]) || 0,
      }))
      return {
        backgroundColor: 'transparent',
        title: {
          text: title,
          textStyle: { color: isDark ? '#e9eeff' : '#0f172a', fontSize: 13, fontWeight: 'bold', fontFamily: 'Manrope, sans-serif' },
        },
        tooltip: {
          trigger: 'item',
          formatter: '{b}: {c}',
          backgroundColor: isDark ? '#10192c' : '#ffffff',
          borderColor: isDark ? '#ffffff1a' : '#cbd5e1',
          textStyle: { color: isDark ? '#e9eeff' : '#0f172a', fontFamily: 'Manrope, sans-serif' },
        },
        series: [
          {
            type: 'funnel',
            top: title ? 40 : 16,
            bottom: 16,
            left: '8%',
            width: '84%',
            sort: 'descending',
            gap: 2,
            label: { color: isDark ? '#e9eeff' : '#0f172a', fontFamily: 'Manrope, sans-serif', fontSize: 12 },
            labelLine: { length: 8 },
            itemStyle: { borderColor: isDark ? '#0b1120' : '#ffffff', borderWidth: 1 },
            data: seriesData,
          },
        ],
      }
    },
  })

  return <div ref={chartRef} style={{ width: '100%', height: '100%' }} />
}
