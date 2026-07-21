// ai/appBridge.ts
// React state dünyası ile capability dünyası arasındaki KÖPRÜ.
//
// Capability'ler React hook'u kullanamaz; bu yüzden App.tsx güncel state'i ve
// setter'ları buraya "yayınlar" (publish). Yetenekler de güncel anlık görüntüyü
// (snapshot) okur ve setter'lar üzerinden değişiklik uygular. Böylece AI, gerçek
// uygulama durumunu okuyup değiştirebilir — arayüzle birebir aynı yollardan.

import type { Dashboard, Dataset, Report, WorkspaceTab } from '../types'

// Köprünün taşıdığı canlı state + eylemler.
export interface AppBridge {
  // --- Anlık okuma (snapshot) ---
  getDatasets: () => Dataset[]
  getDashboards: () => Dashboard[]
  getActiveDashboardId: () => string | null
  getReports: () => Report[]
  getActiveReportId: () => string | null
  getActiveTab: () => WorkspaceTab

  // --- Eylemler (React setter'larına bağlanır) ---
  setDatasets: (updater: (prev: Dataset[]) => Dataset[]) => void
  setDashboards: (updater: (prev: Dashboard[]) => Dashboard[]) => void
  setActiveDashboardId: (id: string | null) => void
  setReports: (updater: (prev: Report[]) => Report[]) => void
  setActiveReportId: (id: string | null) => void
  setActiveTab: (tab: WorkspaceTab) => void
}

// Modül seviyesinde tek köprü örneği. App.tsx bir effect'te publishBridge çağırır.
let current: AppBridge | null = null

export function publishBridge(bridge: AppBridge): void {
  current = bridge
}

export function getBridge(): AppBridge {
  if (!current) {
    throw new Error('AppBridge henüz yayınlanmadı (App.tsx publishBridge çağırmalı).')
  }
  return current
}

export function isBridgeReady(): boolean {
  return current !== null
}
