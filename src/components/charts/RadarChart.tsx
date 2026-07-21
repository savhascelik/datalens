import type { BaseChartProps } from './types'
import { useEChart } from '../../hooks/useEChart'

export default function RadarChart({ title, data, xAxisKey, yAxisKey, theme }: BaseChartProps) {
  const chartRef = useEChart({
    theme,
    deps: [title, data, xAxisKey, yAxisKey, theme],
    buildOption: () => {
      const isDark = theme === 'dark'
      const names = data.map((row) => String(row[xAxisKey] ?? ''))
      const values = data.map((row) => (typeof row[yAxisKey] === 'number' ? row[yAxisKey] : Number(row[yAxisKey]) || 0))
      const max = Math.max(1, ...values)
      const indicator = names.map((name) => ({ name, max }))
      return {
        backgroundColor: 'transparent',
        title: {
          text: title,
          textStyle: { color: isDark ? '#e9eeff' : '#0f172a', fontSize: 13, fontWeight: 'bold', fontFamily: 'Manrope, sans-serif' },
        },
        tooltip: {
          backgroundColor: isDark ? '#10192c' : '#ffffff',
          borderColor: isDark ? '#ffffff1a' : '#cbd5e1',
          textStyle: { color: isDark ? '#e9eeff' : '#0f172a', fontFamily: 'Manrope, sans-serif' },
        },
        radar: {
          indicator,
          center: ['50%', title ? '58%' : '52%'],
          radius: '62%',
          axisName: { color: isDark ? '#cbd7ed' : '#475569', fontSize: 11, fontFamily: 'Manrope, sans-serif' },
          splitLine: { lineStyle: { color: isDark ? '#ffffff14' : '#e2e8f0' } },
          splitArea: { areaStyle: { color: isDark ? ['#ffffff05', '#ffffff0a'] : ['#f8fafc', '#f1f5f9'] } },
          axisLine: { lineStyle: { color: isDark ? '#ffffff14' : '#cbd5e1' } },
        },
        series: [
          {
            type: 'radar',
            data: [{ value: values, name: title || 'Değer' }],
            areaStyle: { color: 'rgba(101, 231, 188, 0.25)' },
            lineStyle: { color: '#65e7bc' },
            itemStyle: { color: '#65e7bc' },
          },
        ],
      }
    },
  })

  return <div ref={chartRef} style={{ width: '100%', height: '100%' }} />
}
