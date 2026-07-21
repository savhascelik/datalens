// components/charts/GaugeChart.tsx
// Tek değerli ECharts gösterge (gauge). label+value satır verisi değil, tek skaler alır.

import { useEChart } from '../../hooks/useEChart'

export default function GaugeChart({ value, max, title, theme }: { value: number; max: number; title?: string; theme: 'dark' | 'light' }) {
  const chartRef = useEChart({
    theme,
    deps: [value, max, title, theme],
    buildOption: () => {
      const isDark = theme === 'dark'
      return {
        backgroundColor: 'transparent',
        title: title ? { text: title, textStyle: { color: isDark ? '#e9eeff' : '#0f172a', fontSize: 13, fontWeight: 'bold', fontFamily: 'Manrope, sans-serif' } } : undefined,
        series: [
          {
            type: 'gauge',
            min: 0,
            max: max || 1,
            progress: { show: true, width: 14 },
            axisLine: { lineStyle: { width: 14, color: [[1, isDark ? '#ffffff1a' : '#e2e8f0']] } },
            axisLabel: { color: isDark ? '#cbd7ed' : '#475569', fontSize: 9 },
            pointer: { itemStyle: { color: '#65e7bc' } },
            progressStyle: { color: '#65e7bc' },
            detail: { valueAnimation: true, fontSize: 22, color: isDark ? '#e9eeff' : '#0f172a', formatter: (v: number) => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(v) },
            data: [{ value, name: '' }],
          },
        ],
      }
    },
  })
  return <div ref={chartRef} style={{ width: '100%', height: '100%' }} />
}
