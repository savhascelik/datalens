export interface BaseChartProps {
  title: string
  data: Record<string, any>[]
  xAxisKey: string
  yAxisKey: string
  theme: 'dark' | 'light'
  onPointClick?: (category: string) => void
}
