// hooks/useEChart.ts
// Tüm ECharts widget'ları için ortak yaşam döngüsü + RESPONSIVE davranış.
//
// Bu hook her chart'a otomatik olarak şunları kazandırır:
//   - init/dispose (tema değişiminde yeniden init)
//   - tıklama olayını dışarı iletme (onPointClick)
//   - option değişince setOption
//   - KONTEYNER boyutu değişince (grid item resize dahil) otomatik chart.resize()
//     -> ResizeObserver ile; sadece window.resize değil, hücre büyüyünce de uyar.
//
// Yeni bir ECharts widget'ı eklerken sadece buildOption fonksiyonu yazılır;
// responsive + tema + tıklama davranışı buradan otomatik gelir.

import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'

export interface UseEChartParams {
  // ECharts option'ını üretir. deps değişince yeniden çağrılır.
  buildOption: () => echarts.EChartsOption
  // Yeniden hesaplama tetikleyicileri (data, eksen anahtarları vb.)
  deps: unknown[]
  theme: 'dark' | 'light'
  onPointClick?: (name: string) => void
}

export function useEChart({ buildOption, deps, theme, onPointClick }: UseEChartParams) {
  const chartRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<echarts.ECharts | null>(null)
  const onPointClickRef = useRef(onPointClick)
  const buildOptionRef = useRef(buildOption)

  // En güncel callback/option üreticiyi ref'te tut (yeniden init gerektirmesin)
  useEffect(() => { onPointClickRef.current = onPointClick }, [onPointClick])
  useEffect(() => { buildOptionRef.current = buildOption })

  // Init + resize gözlemi + tıklama (tema değişince yeniden init)
  useEffect(() => {
    if (!chartRef.current) return
    const chart = echarts.init(chartRef.current, theme)
    instanceRef.current = chart

    chart.on('click', (params: any) => {
      if (onPointClickRef.current && params?.name) onPointClickRef.current(params.name)
    })

    // İlk option'ı uygula
    chart.setOption(buildOptionRef.current(), true)

    // Konteyner boyutunu izle -> grid item resize / maximize / kolon açılması hepsinde uyar
    const ro = new ResizeObserver(() => {
      // rAF ile ölçüm sonrası tek sefer resize (layout thrash önlenir)
      requestAnimationFrame(() => {
        if (instanceRef.current && !instanceRef.current.isDisposed()) {
          instanceRef.current.resize()
        }
      })
    })
    ro.observe(chartRef.current)

    // Pencere resize'ı da dinle (breakpoint / zoom vb.)
    const onWinResize = () => chart.resize()
    window.addEventListener('resize', onWinResize)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', onWinResize)
      chart.dispose()
      instanceRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme])

  // Veri/option değişince yeniden çiz
  useEffect(() => {
    const chart = instanceRef.current
    if (!chart || chart.isDisposed()) return
    chart.setOption(buildOptionRef.current(), true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return chartRef
}
