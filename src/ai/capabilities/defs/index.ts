// ai/capabilities/defs/index.ts
// Tüm yetenek tanımlarını toplar ve registry'ye kaydeder.
// Yeni bir defs dosyası eklendiğinde buraya bir satır eklenir; gerisi otomatik.

import { registerCapabilities } from '../registry'
import { dataCapabilities } from './data'
import { dashboardCapabilities } from './dashboard'
import { widgetCapabilities } from './widget'
import { filterCapabilities } from './filter'
import { relationshipCapabilities } from './relationship'
import { historyCapabilities } from './history'
import { reportCapabilities } from './report'
import { appCapabilities } from './app'
import { queryCapabilities } from './query'
import { screenshotCapabilities } from './screenshot'

let registered = false

export function registerAllCapabilities(): void {
  if (registered) return
  registerCapabilities([
    ...dataCapabilities,
    ...dashboardCapabilities,
    ...widgetCapabilities,
    ...filterCapabilities,
    ...relationshipCapabilities,
    ...historyCapabilities,
    ...reportCapabilities,
    ...appCapabilities,
    ...queryCapabilities,
    ...screenshotCapabilities,
  ])
  registered = true
}
