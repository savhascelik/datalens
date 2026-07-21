// sql-safety.ts
// Tarayıcı-içi DuckDB için SQL kapısı. Felsefe: kullanıcının kendi makinesi ve kendi
// (geçici, bellek-içi) verisi olduğu için SELECT/INSERT/UPDATE/CREATE/ALTER/DROP ve
// çoklu statement SERBEST. Engellenen TEK sınıf: AĞ/DOSYA erişimi (egress) — çünkü
// prompt-injection ile üretilmiş bir sorgu, tarayıcıda bile kullanıcının verisini bir
// üçüncü tarafa SIZDIRABİLİR. Bu koruma meşru analiz/dönüşümde hiçbir şeyi kısıtlamaz.

// Dosyaya/ağ'a yazan veya uzaktan yükleyen statement'lar.
const FORBIDDEN_IO_STATEMENTS =
  /\b(attach|detach|install|load|copy|export|import)\b/

// Dosya sistemine veya ağa erişebilen tablo/skalar fonksiyonlar (çağrı biçimiyle).
const FORBIDDEN_IO_FUNCTIONS =
  /\b(read_csv|read_csv_auto|read_parquet|parquet_scan|read_json|read_json_auto|read_json_objects|read_ndjson|read_ndjson_auto|read_text|read_blob|glob|sniff_csv|csv_scan|delta_scan|iceberg_scan|read_arrow|scan_arrow|arrow_scan)\s*\(/

// Anahtar kelime taramasından önce string literal ('...') ve çift-tırnaklı
// identifier ("...") içeriklerini boşaltır → içlerindeki kelimeler yanlış-pozitif yapmaz.
function stripLiterals(normalized: string): string {
  return normalized
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""')
}

// Serbest ama egress-güvenli. true = çalıştırılabilir.
export function isAllowedSql(sql: string): boolean {
  const normalized = sql.trim().replace(/\s+/g, ' ').toLowerCase()
  if (!normalized) return false
  const stripped = stripLiterals(normalized)
  if (FORBIDDEN_IO_STATEMENTS.test(stripped)) return false
  if (FORBIDDEN_IO_FUNCTIONS.test(stripped)) return false
  return true
}
