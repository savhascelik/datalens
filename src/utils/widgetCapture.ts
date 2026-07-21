// utils/widgetCapture.ts
// DOM ekran görüntüsü yardımcıları (html-to-image). Bir widget kartını veya tüm panoyu
// PNG'ye çevirir; AiChat'e ek olarak iletilip modele (vision) gönderilir.
// `[data-widget-id]` ile işaretlidir; pano ise react-grid-layout konteyneridir.

import { toPng } from 'html-to-image'

// Yakalarken hariç tutulacak elemanlar (kabuk başlığındaki aksiyon butonları gibi).
// `.capture-exclude` sınıfı verilmiş her şey görüntüye dahil edilmez.
function captureFilter(node: HTMLElement): boolean {
  if (node instanceof Element && node.classList?.contains('capture-exclude')) return false
  return true
}

function backgroundColor(): string {
  const theme = (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme')) || 'dark'
  return theme === 'light' ? '#ffffff' : '#0f172a'
}

async function captureElement(el: HTMLElement): Promise<string | null> {
  try {
    // Elemanı görünür kıl (scroll) ve stil uygulaması için bir kare bekle.
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    await new Promise(r => setTimeout(r, 60))
    return await toPng(el, {
      cacheBust: true,
      backgroundColor: backgroundColor(),
      pixelRatio: 1.5, // AI okunabilirliği için biraz daha yüksek çözünürlük
      filter: captureFilter as any,
    })
  } catch (err) {
    console.error('Ekran görüntüsü alınamadı:', err)
    return null
  }
}

// Bir widget kartını id'sine göre yakalar (WidgetShell kökündeki data-widget-id).
export async function captureWidgetAsImage(widgetId: string): Promise<string | null> {
  const el = document.querySelector(`[data-widget-id="${CSS.escape(widgetId)}"]`) as HTMLElement | null
  if (!el) {
    console.error(`data-widget-id="${widgetId}" DOM'da bulunamadı.`)
    return null
  }
  return captureElement(el)
}

// Tüm panoyu (react-grid-layout konteyneri) yakalar.
export async function captureDashboardAsImage(): Promise<string | null> {
  const el = (document.querySelector('.react-grid-layout') || document.querySelector('.layout')) as HTMLElement | null
  if (!el) {
    console.error('Pano konteyneri (react-grid-layout) DOM\'da bulunamadı.')
    return null
  }
  return captureElement(el)
}

// Aktif raporu yakalar (ReportsTab aktif rapor görünümündeki .print-area konteyneri).
export async function captureReportAsImage(): Promise<string | null> {
  const el = document.querySelector('.print-area') as HTMLElement | null
  if (!el) {
    console.error('Aktif rapor konteyneri (.print-area) DOM\'da bulunamadı.')
    return null
  }
  return captureElement(el)
}

// DOM'daki tüm widget'ların { id, label } listesi (AiChat seçici menüsü için).
export function listCapturableWidgets(): { id: string; label: string }[] {
  const nodes = Array.from(document.querySelectorAll('[data-widget-id]')) as HTMLElement[]
  return nodes.map(n => ({
    id: n.getAttribute('data-widget-id') || '',
    label: n.getAttribute('data-widget-title') || n.getAttribute('data-widget-id') || '',
  })).filter(w => w.id)
}
