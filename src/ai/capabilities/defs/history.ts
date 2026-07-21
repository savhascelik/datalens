// ai/capabilities/defs/history.ts
// Geri alma (undo) ve işlem geçmişi yetenekleri. sideEffect capability'ler
// çalışmadan önce registry bir snapshot alır; undo son snapshot'ı geri yükler.

import type { Capability } from '../types'
import { popSnapshot, listHistory, clearHistory } from '../../history'
import i18n from '../../../i18n'

const undo: Capability = {
  id: 'history.undo',
  title: 'Undo last action',
  description: 'Undoes the most recent state-changing action (restores dashboards to their previous state).',
  keywords: ['undo', 'revert', 'back', 'cancel', 'previous'],
  category: 'history',
  sideEffect: false, // kendisi geçmişe yazılmaz
  argsSchema: { type: 'object', properties: {} },
  async run(_args, ctx) {
    const snap = popSnapshot()
    if (!snap) return { success: false, message: i18n.t('ai.cap.nothingToUndo'), error: 'empty_history' }
    ctx.bridge.setDashboards(() => snap.dashboards)
    ctx.bridge.setActiveDashboardId(snap.activeDashboardId)
    return { success: true, message: i18n.t('ai.cap.undone', { label: snap.label || snap.capabilityId }) }
  },
}

const list: Capability = {
  id: 'history.list',
  title: 'List action history',
  description: 'Lists the recent undoable actions (oldest to newest).',
  keywords: ['history', 'actions', 'list', 'log', 'undo'],
  category: 'history',
  sideEffect: false,
  argsSchema: { type: 'object', properties: {} },
  async run() {
    const items = listHistory()
    return { success: true, message: i18n.t('ai.cap.historyCount', { count: items.length }), data: items }
  },
}

const clear: Capability = {
  id: 'history.clear',
  title: 'Clear action history',
  description: 'Clears the undo history (undo points are removed).',
  keywords: ['history', 'clear', 'reset'],
  category: 'history',
  sideEffect: false,
  argsSchema: { type: 'object', properties: {} },
  async run() {
    clearHistory()
    return { success: true, message: i18n.t('ai.cap.historyCleared') }
  },
}

export const historyCapabilities: Capability[] = [undo, list, clear]
