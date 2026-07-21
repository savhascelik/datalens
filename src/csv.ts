import type { ColumnKind, ColumnProfile, Dataset } from './types'

const splitCsvLine = (line: string, separator: string) => {
  const fields: string[] = []
  let field = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"'
        index += 1
      } else quoted = !quoted
    } else if (char === separator && !quoted) {
      fields.push(field.trim())
      field = ''
    } else field += char
  }
  fields.push(field.trim())
  return fields
}

const inferKind = (values: string[]): ColumnKind => {
  const usable = values.filter(Boolean)
  if (!usable.length) return 'unknown'
  const numeric = usable.every((value) => /^[-+]?\d{1,3}([.,]\d{3})*([.,]\d+)?$/.test(value.replace(/\s/g, '')))
  if (numeric) return 'number'
  const dates = usable.every((value) => !Number.isNaN(Date.parse(value)))
  if (dates) return 'date'
  const boolean = usable.every((value) => /^(true|false|evet|hayır|0|1)$/i.test(value))
  if (boolean) return 'boolean'
  return 'string'
}

export const parseCsv = (name: string, raw: string): Dataset => {
  const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim())
  const separator = lines[0]?.split(';').length > lines[0]?.split(',').length ? ';' : ','
  const headers = splitCsvLine(lines[0] ?? '', separator).map((header, index) => header || `Sütun ${index + 1}`)
  const rows = lines.slice(1).map((line) => splitCsvLine(line, separator))
  const columns: ColumnProfile[] = headers.map((header, columnIndex) => {
    const values = rows.map((row) => row[columnIndex] ?? '')
    const nonEmpty = values.filter(Boolean)
    return {
      name: header,
      kind: inferKind(values),
      nonEmptyCount: nonEmpty.length,
      emptyCount: values.length - nonEmpty.length,
      uniqueCount: new Set(nonEmpty).size,
      sample: nonEmpty.slice(0, 3).join(', ') || '—',
    }
  })
  return { name, tableName: 'csv_preview', totalRows: rows.length, headers, rows, columns }
}
