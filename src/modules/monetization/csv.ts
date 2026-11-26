/**
 * RC3-CE CSV core for the generic external-revenue import (CE-04) and
 * statement exports (CE-03).
 *
 * Parsing is deliberately small and strict: RFC 4180 quoting, a hard
 * row/byte ceiling enforced before any row is materialized, and no
 * spreadsheet-formula interpretation anywhere. Export escapes every
 * cell that a spreadsheet would treat as a formula (`=`, `+`, `-`,
 * `@`, tab/CR prefixes) so a provider-supplied string can never
 * become a formula in the creator's spreadsheet (CE-T31).
 */

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024
export const MAX_IMPORT_ROWS = 10_000

export type CsvTable = Readonly<{
  headers: readonly string[]
  rows: readonly Readonly<Record<string, string>>[]
}>

export function parseCsv(input: string): CsvTable {
  if (input.length > MAX_IMPORT_BYTES)
    throw new Error(`Import exceeds the ${MAX_IMPORT_BYTES}-byte limit.`)
  const records: string[][] = []
  let field = ''
  let record: string[] = []
  let inQuotes = false
  let sawAny = false
  const pushField = () => {
    record.push(field)
    field = ''
  }
  const pushRecord = () => {
    pushField()
    records.push(record)
    record = []
    if (records.length > MAX_IMPORT_ROWS + 1)
      throw new Error(`Import exceeds the ${MAX_IMPORT_ROWS}-row limit.`)
  }
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    sawAny = true
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += ch
      continue
    }
    if (ch === '"') inQuotes = true
    else if (ch === ',') pushField()
    else if (ch === '\n') pushRecord()
    else if (ch === '\r') {
      if (input[i + 1] === '\n') i++
      pushRecord()
    } else field += ch
  }
  if (inQuotes) throw new Error('Import has an unterminated quoted field.')
  if (sawAny && (field !== '' || record.length > 0)) pushRecord()
  const nonEmpty = records.filter((r) => !(r.length === 1 && r[0].trim() === ''))
  if (nonEmpty.length === 0) throw new Error('Import is empty.')
  const headers = nonEmpty[0].map((h) => h.trim())
  if (headers.some((h) => h === '')) throw new Error('Import has an empty column header.')
  if (new Set(headers).size !== headers.length)
    throw new Error('Import has duplicate column headers.')
  const rows = nonEmpty.slice(1).map((cells, index) => {
    if (cells.length !== headers.length)
      throw new Error(`Row ${index + 2} has ${cells.length} cells; expected ${headers.length}.`)
    const row: Record<string, string> = {}
    headers.forEach((header, i) => {
      row[header] = cells[i]
    })
    return row
  })
  return { headers, rows }
}

/** Escape one cell for export: formula-injection safe and RFC 4180 quoted when needed. */
export function escapeCsvCell(value: string): string {
  let cell = value
  if (/^[=+\-@\t\r]/.test(cell)) cell = `'${cell}`
  if (/[",\n\r]/.test(cell)) cell = `"${cell.replace(/"/g, '""')}"`
  return cell
}

export function renderCsv(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  const lines = [headers.map(escapeCsvCell).join(',')]
  for (const row of rows) lines.push(row.map(escapeCsvCell).join(','))
  return lines.join('\r\n') + '\r\n'
}
