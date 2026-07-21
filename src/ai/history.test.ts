import { describe, it, expect, beforeEach } from 'vitest'
import { pushSnapshot, popSnapshot, listHistory, clearHistory, historyDepth } from './history'
import type { Dashboard } from '../types'

function dash(id: string): Dashboard {
  return {
    id, name: id, linkedTableNames: [], activeFilters: {}, filters: [], relationships: [],
    dbBarX: '', dbBarY: '', dbBarType: 'bar', dbLineX: '', dbLineY: '', dbLineType: 'line',
  }
}

describe('history', () => {
  beforeEach(() => clearHistory())

  it('push/pop LIFO çalışır ve derin kopya tutar', () => {
    const d = [dash('d1')]
    pushSnapshot({ capabilityId: 'filter.apply', label: 'A', dashboards: d, activeDashboardId: 'd1' })
    // sonradan mutasyon snapshot'ı etkilememeli (derin kopya)
    d[0].filters!.push({ tableName: 't', column: 'c', value: 'v' })
    const snap = popSnapshot()
    expect(snap?.label).toBe('A')
    expect(snap?.dashboards[0].filters?.length).toBe(0)
  })

  it('list en eskiden en yeniye sırayı korur', () => {
    pushSnapshot({ capabilityId: 'a', label: 'A', dashboards: [], activeDashboardId: null })
    pushSnapshot({ capabilityId: 'b', label: 'B', dashboards: [], activeDashboardId: null })
    const items = listHistory()
    expect(items.map(i => i.label)).toEqual(['A', 'B'])
  })

  it('clear geçmişi boşaltır', () => {
    pushSnapshot({ capabilityId: 'a', label: 'A', dashboards: [], activeDashboardId: null })
    clearHistory()
    expect(historyDepth()).toBe(0)
    expect(popSnapshot()).toBeUndefined()
  })

  it('MAX_HISTORY sınırını aşınca en eskiyi düşürür', () => {
    for (let i = 0; i < 30; i++) {
      pushSnapshot({ capabilityId: 'c', label: `L${i}`, dashboards: [], activeDashboardId: null })
    }
    expect(historyDepth()).toBe(25)
    const items = listHistory()
    expect(items[0].label).toBe('L5') // ilk 5 düştü
  })
})
