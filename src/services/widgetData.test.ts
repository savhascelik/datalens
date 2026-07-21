import { describe, it, expect } from 'vitest'
import { buildInsightSql } from './widgetData'

describe('buildInsightSql — filtreli data CTE sarmalayıcı', () => {
  it('LLM sorgusunu filtresiz data CTE ile sarar', () => {
    const sql = buildInsightSql('sales_x', 'SELECT COUNT(*) AS n FROM data', '')
    expect(sql).toContain('WITH "data" AS (SELECT * FROM "sales_x")')
    expect(sql).toContain('SELECT COUNT(*) AS n FROM data')
  })

  it('WHERE cümlesini data CTE içine gömer (filtre-duyarlı)', () => {
    const where = ` WHERE CAST("city" AS VARCHAR) = 'Izmir'`
    const sql = buildInsightSql('sales_x', 'SELECT "city", SUM("amt") AS total FROM data GROUP BY 1', where)
    expect(sql).toContain(`WITH "data" AS (SELECT * FROM "sales_x" WHERE CAST("city" AS VARCHAR) = 'Izmir')`)
    // Kullanıcı sorgusu `data` tablosuna yazdığı için filtreyi otomatik alır.
    expect(sql).toContain('FROM data GROUP BY 1')
  })
})
