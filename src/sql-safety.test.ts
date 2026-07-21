import { describe, it, expect } from 'vitest'
import { isAllowedSql } from './sql-safety'

describe('isAllowedSql (serbest, yalnız egress engelli)', () => {
  it('okuma/analiz sorgularına izin verir', () => {
    expect(isAllowedSql('SELECT * FROM "t" LIMIT 10')).toBe(true)
    expect(isAllowedSql('WITH x AS (SELECT 1) SELECT * FROM x')).toBe(true)
    expect(isAllowedSql("SELECT STRFTIME('%Y-%m', OrderDate) AS m, SUM(TotalPrice) FROM t GROUP BY 1;")).toBe(true)
  })

  it('yazma/DDL/çoklu statement artık serbest (tarayıcı-içi, kendi veri)', () => {
    expect(isAllowedSql('UPDATE t SET a = 1')).toBe(true)
    expect(isAllowedSql('DELETE FROM t WHERE a > 5')).toBe(true)
    expect(isAllowedSql('CREATE TABLE t2 AS SELECT * FROM t')).toBe(true)
    expect(isAllowedSql('ALTER TABLE "t" ADD COLUMN "margin" AS ("revenue" - "cost")')).toBe(true)
    expect(isAllowedSql('DROP TABLE t')).toBe(true)
    expect(isAllowedSql('SELECT 1; SELECT 2')).toBe(true)
  })

  it('ağ/dosya erişim tablo-fonksiyonlarını engeller (egress koruması)', () => {
    expect(isAllowedSql("SELECT * FROM read_csv_auto('/etc/passwd')")).toBe(false)
    expect(isAllowedSql("SELECT * FROM read_parquet('s3://x/y.parquet')")).toBe(false)
    expect(isAllowedSql("SELECT * FROM read_json_auto('http://evil/x.json')")).toBe(false)
    expect(isAllowedSql("SELECT * FROM glob('/**/*')")).toBe(false)
    expect(isAllowedSql("SELECT * FROM read_text('secret.txt')")).toBe(false)
    expect(isAllowedSql("SELECT * FROM read_csv ('a.csv')")).toBe(false)
  })

  it('uzaktan yükleme/attach/copy egress statement\'larını engeller', () => {
    expect(isAllowedSql('INSTALL httpfs')).toBe(false)
    expect(isAllowedSql('LOAD httpfs')).toBe(false)
    expect(isAllowedSql("ATTACH 'http://evil/db.duckdb' AS remote")).toBe(false)
    expect(isAllowedSql("COPY (SELECT * FROM t) TO 'out.csv'")).toBe(false)
    expect(isAllowedSql("EXPORT DATABASE 'dir'")).toBe(false)
  })

  it('string literal / tırnaklı kolon içindeki kelimeyi yanlış-pozitif yapmaz', () => {
    expect(isAllowedSql("SELECT * FROM \"t\" WHERE note = 'please copy this'")).toBe(true)
    expect(isAllowedSql("SELECT * FROM \"t\" WHERE city = 'global market'")).toBe(true)
    expect(isAllowedSql('SELECT "load" FROM "t"')).toBe(true)
  })
})
