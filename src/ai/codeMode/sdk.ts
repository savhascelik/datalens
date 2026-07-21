// ai/codeMode/sdk.ts
// LLM'in yazdığı koda sunulan `datalens` nesnesi. SADECE kayıtlı capability'lere
// köprü kurar; DOM/ağ/dosya erişimi yoktur. Worker içinde de, testte de aynı
// saf fabrikayla kurulur — bu yüzden bağımlılıksız ve deterministik.

export type CapabilityCaller = (capabilityId: string, args?: any) => Promise<any>

export interface DatalensSdk {
  // Genel köprü: kayıtlı herhangi bir yeteneği çağırır.
  call: CapabilityCaller
  // Sık kullanılan salt-okunur kısayollar (hepsi call üzerinden gider).
  listTables: () => Promise<any>
  getSchema: (tableName?: string) => Promise<any>
  sampleRows: (tableName?: string, limit?: number) => Promise<any>
  sql: (query: string) => Promise<any>
  getActiveDashboardId: () => Promise<string | null>
}

export function createDatalensSdk(call: CapabilityCaller): DatalensSdk {
  return {
    call: (capabilityId: string, args?: any) => call(capabilityId, args ?? {}),
    listTables: () => call('data.listTables', {}),
    getSchema: (tableName?: string) => call('data.getSchema', tableName ? { tableName } : {}),
    sampleRows: (tableName?: string, limit?: number) =>
      call('data.sampleRows', { ...(tableName ? { tableName } : {}), ...(limit ? { limit } : {}) }),
    sql: (query: string) => call('data.runSql', { sql: query }),
    async getActiveDashboardId() {
      const res = await call('dashboard.list', {})
      const active = res?.data?.find?.((d: any) => d.active)
      return active?.id ?? null
    },
  }
}
