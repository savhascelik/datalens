import type { EChartsOption } from 'echarts'
import type { BaseChartProps } from './types'
import { useEChart } from '../../hooks/useEChart'

export default function ScatterChart({ title, data, xAxisKey, yAxisKey, theme, onPointClick }: BaseChartProps) {
  const chartRef = useEChart({
    theme,
    onPointClick,
    deps: [title, data, xAxisKey, yAxisKey, theme],
    buildOption: (): EChartsOption => {
      const seriesData = data.map((row) => [Number(row[xAxisKey]) || 0, Number(row[yAxisKey]) || 0])
      const isLargeData = data.length > 2000
      const isDark = theme === 'dark'

      return {
        backgroundColor: 'transparent',
        title: {
          text: title,
          textStyle: { color: isDark ? '#e9eeff' : '#0f172a', fontSize: 13, fontWeight: 'bold', fontFamily: 'Manrope, sans-serif' },
        },
        tooltip: {
          trigger: 'axis',
          backgroundColor: isDark ? '#10192c' : '#ffffff',
          borderColor: isDark ? '#ffffff1a' : '#cbd5e1',
          textStyle: { color: isDark ? '#e9eeff' : '#0f172a', fontFamily: 'Manrope, sans-serif' },
        },
        grid: { left: '4%', right: '4%', bottom: '12%', top: '18%', containLabel: true },
        xAxis: {
          type: 'value',
          axisLine: { lineStyle: { color: isDark ? '#ffffff14' : '#cbd5e1' } },
          axisLabel: { color: isDark ? '#cbd7ed' : '#475569', fontSize: 11, fontFamily: 'Manrope, sans-serif' },
          splitLine: { lineStyle: { color: isDark ? '#ffffff08' : '#f1f5f9' } },
        },
        yAxis: {
          type: 'value',
          axisLine: { lineStyle: { color: isDark ? '#ffffff14' : '#cbd5e1' } },
          splitLine: { lineStyle: { color: isDark ? '#ffffff08' : '#f1f5f9' } },
          axisLabel: { color: isDark ? '#cbd7ed' : '#475569', fontSize: 11, fontFamily: 'Manrope, sans-serif' },
        },
        series: [
          {
            data: seriesData,
            type: 'scatter',
            large: isLargeData,
            largeThreshold: 2000,
            progressive: isLargeData ? 3000 : 0,
            itemStyle: { color: '#65e7bc' },
          },
        ],
      }
    },
  })

  return <div ref={chartRef} style={{ width: '100%', height: '100%' }} />
}
