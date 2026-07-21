// ai/capabilities/defs/screenshot.ts
// LLM'in kendi isteğiyle ekran görüntüsü alması için yetenek. Model bir widget'ı, tüm
// panoyu veya aktif raporu "görsel olarak görmek" istediğinde bunu çağırır; sonuç görsel
// bir sonraki turda modele çok-kipli (multimodal) bir kullanıcı mesajı olarak geri verilir
// (agentLoop bunu yapar). Böylece model grafiği gerçekten görüp yorumlayabilir.
//
// Not: html-to-image tarayıcı bağımlılığı yalnızca çağrı anında dinamik import edilir;
// böylece yetenek registry'si (ve testler) bu bağımlılığı statik olarak yüklemez.

import type { Capability } from '../types'
import i18n from '../../../i18n'

const captureScreenshot: Capability = {
  id: 'ui.screenshot',
  title: 'Capture a screenshot',
  description: 'Captures a screenshot IMAGE of a widget, the whole dashboard, or the active report, so you can SEE it and analyze it visually. The captured image is shown back to you on the next turn. target: "widget" (needs widgetId from widget.list) | "dashboard" | "report".',
  keywords: ['screenshot', 'capture', 'image', 'see', 'look', 'visual', 'chart', 'widget', 'dashboard', 'report', 'snapshot'],
  category: 'ui',
  sideEffect: false,
  argsSchema: {
    type: 'object',
    properties: {
      target: { type: 'string', enum: ['widget', 'dashboard', 'report'], description: 'What to capture' },
      widgetId: { type: 'string', description: 'Widget id (required when target=widget; get it from widget.list)' },
    },
    required: ['target'],
  },
  async run(args) {
    const target = String(args?.target || 'widget')
    // Tarayıcı yakalama modülünü yalnızca burada yükle.
    const cap = await import('../../../utils/widgetCapture')

    let image: string | null = null
    let label = ''
    if (target === 'dashboard') {
      image = await cap.captureDashboardAsImage()
      label = i18n.t('ai.cap.screenshotDashboard', { defaultValue: 'Pano' })
    } else if (target === 'report') {
      image = await cap.captureReportAsImage()
      label = i18n.t('ai.cap.screenshotReport', { defaultValue: 'Rapor' })
    } else {
      const widgetId = args?.widgetId ? String(args.widgetId) : ''
      if (!widgetId) {
        return { success: false, message: i18n.t('ai.cap.screenshotNeedWidgetId', { defaultValue: 'target=widget için widgetId gerekli (widget.list ile bulun).' }), error: 'need_widget_id' }
      }
      image = await cap.captureWidgetAsImage(widgetId)
      label = widgetId
    }

    if (!image) {
      return { success: false, message: i18n.t('ai.cap.screenshotFailed', { defaultValue: 'Ekran görüntüsü alınamadı (öğe ekranda görünür olmalı).' }), error: 'capture_failed' }
    }

    // isImage: agentLoop bu görseli bir sonraki tura multimodal kullanıcı mesajı olarak ekler.
    return {
      success: true,
      message: i18n.t('ai.cap.screenshotTaken', { defaultValue: 'Ekran görüntüsü alındı.' }),
      data: { isImage: true, image, label },
    }
  },
}

export const screenshotCapabilities: Capability[] = [captureScreenshot]
