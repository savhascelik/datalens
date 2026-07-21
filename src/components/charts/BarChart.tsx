import * as echarts from 'echarts'
import type { BaseChartProps } from './types'
import { useEChart } from '../../hooks/useEChart'

export default function BarChart({ title, data, xAxisKey, yAxisKey, theme, onPointClick }: BaseChartProps) {
  const chartRef = useEChart({
    theme,
    onPointClick,
    deps: [title, data, xAxisKey, yAxisKey, theme],
    buildOption: () => {
      const xValues = data.map((row) => String(row[xAxisKey] ?? ''))
      const yValues = data.map((row) => {
        const val = row[yAxisKey]
        return typeof val === 'number' ? val : Number(val) || 0
      })
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
          type: 'category',
          data: xValues,
          axisLine: { lineStyle: { color: isDark ? '#ffffff14' : '#cbd5e1' } },
          axisLabel: { color: isDark ? '#cbd7ed' : '#475569', fontSize: 11, fontFamily: 'Manrope, sans-serif' },
        },
        yAxis: {
          type: 'value',
          axisLine: { lineStyle: { color: isDark ? '#ffffff14' : '#cbd5e1' } },
          splitLine: { lineStyle: { color: isDark ? '#ffffff08' : '#f1f5f9' } },
          axisLabel: { color: isDark ? '#cbd7ed' : '#475569', fontSize: 11, fontFamily: 'Manrope, sans-serif' },
        },
        series: [
          {
            data: yValues,
            type: 'bar',
            large: isLargeData,
            largeThreshold: 2000,
            progressive: isLargeData ? 3000 : 0,
            itemStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: '#65e7bc' },
                { offset: 1, color: '#153f4b' },
              ]),
              borderRadius: [4, 4, 0, 0],
            },
          },
        ],
      }
    },
  })

  return <div ref={chartRef} style={{ width: '100%', height: '100%' }} />
}
