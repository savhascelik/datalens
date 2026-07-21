import { describe, it, expect, vi } from 'vitest'
import { createDatalensSdk } from './sdk'

describe('createDatalensSdk', () => {
  it('call doğrudan capability id + args iletir', async () => {
    const call = vi.fn(async () => ({ success: true }))
    const sdk = createDatalensSdk(call)
    await sdk.call('widget.add', { widgetId: 'chartBar' })
    expect(call).toHaveBeenCalledWith('widget.add', { widgetId: 'chartBar' })
  })

  it('kısayollar doğru capability id\'lerine bağlanır', async () => {
    const call = vi.fn(async () => ({ success: true, data: [] }))
    const sdk = createDatalensSdk(call)
    await sdk.listTables()
    await sdk.getSchema('t1')
    await sdk.sampleRows('t1', 5)
    await sdk.sql('SELECT 1')
    expect(call).toHaveBeenCalledWith('data.listTables', {})
    expect(call).toHaveBeenCalledWith('data.getSchema', { tableName: 't1' })
    expect(call).toHaveBeenCalledWith('data.sampleRows', { tableName: 't1', limit: 5 })
    expect(call).toHaveBeenCalledWith('data.runSql', { sql: 'SELECT 1' })
  })

  it('getActiveDashboardId aktif panoyu bulur', async () => {
    const call = vi.fn(async () => ({ success: true, data: [{ id: 'd1', active: false }, { id: 'd2', active: true }] }))
    const sdk = createDatalensSdk(call)
    expect(await sdk.getActiveDashboardId()).toBe('d2')
  })
})
