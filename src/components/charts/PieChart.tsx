import type { EChartsOption } from 'echarts'
import type { BaseChartProps } from './types'
import { useEChart } from '../../hooks/useEChart'

export default function PieChart({ title, data, xAxisKey, yAxisKey, theme, onPointClick }: BaseChartProps) {
  const chartRef = useEChart({
    theme,
    onPointClick,
    deps: [title, data, xAxisKey, yAxisKey, theme],
    buildOption: (): EChartsOption => {
      const pieData = data.map((row) => ({
        name: String(row[xAxisKey] ?? ''),
        value: Number(row[yAxisKey]) || 0,
      }))
      const isDark = theme === 'dark'

      return {
        backgroundColor: 'transparent',
        title: {
          text: title,
          textStyle: { color: isDark ? '#e9eeff' : '#0f172a', fontSize: 13, fontWeight: 'bold', fontFamily: 'Manrope, sans-serif' },
        },
        tooltip: {
          trigger: 'item',
          backgroundColor: isDark ? '#10192c' : '#ffffff',
          borderColor: isDark ? '#ffffff1a' : '#cbd5e1',
          textStyle: { color: isDark ? '#e9eeff' : '#0f172a', fontFamily: 'Manrope, sans-serif' },
        },
        legend: {
          orient: 'horizontal',
          bottom: '0%',
          textStyle: { color: isDark ? '#a8b8d0' : '#475569', fontSize: 10, fontFamily: 'Manrope, sans-serif' },
          itemWidth: 12,
          itemHeight: 10,
        },
        series: [
          {
            type: 'pie',
            radius: ['35%', '65%'],
            center: ['50%', '45%'],
            avoidLabelOverlap: false,
            itemStyle: {
              borderRadius: 6,
              borderColor: isDark ? '#10192c' : '#ffffff',
              borderWidth: 2,
            },
            label: { show: false },
            emphasis: {
              label: { show: true, fontSize: 11, fontWeight: 'bold', color: isDark ? '#e9eeff' : '#0f172a' },
            },
            data: pieData,
            color: ['#65e7bc', '#78a8ff', '#ffb078', '#ff78a8', '#d678ff'],
          },
        ],
      }
    },
  })

  return <div ref={chartRef} style={{ width: '100%', height: '100%' }} />
}
