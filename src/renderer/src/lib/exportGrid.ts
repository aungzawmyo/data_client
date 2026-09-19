export function formatExportValue(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function toCsv(fields: string[], rows: Record<string, unknown>[]): string {
  const header = fields.map(csvEscape).join(',')
  const body = rows.map((row) => fields.map((field) => csvEscape(formatExportValue(row[field]))).join(','))
  return [header, ...body].join('\n')
}

export function toTsv(fields: string[], rows: Record<string, unknown>[]): string {
  const header = fields.join('\t')
  const body = rows.map((row) => fields.map((field) => formatExportValue(row[field]).replace(/\t/g, ' ')).join('\t'))
  return [header, ...body].join('\n')
}

export function toJson(fields: string[], rows: Record<string, unknown>[]): string {
  return JSON.stringify(
    rows.map((row) => {
      const next: Record<string, unknown> = {}
      for (const field of fields) next[field] = row[field] ?? null
      return next
    }),
    null,
    2
  )
}

function sqlLiteral(value: unknown): string {
  if (value == null) return 'null'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'`
  return `'${String(value).replace(/'/g, "''")}'`
}

export function toInsertSql(table: string, fields: string[], rows: Record<string, unknown>[]): string {
  if (!rows.length) return `-- no rows`
  return rows
    .map((row) => {
      const values = fields.map((field) => sqlLiteral(row[field])).join(', ')
      return `insert into ${table} (${fields.map((field) => `"${field.replace(/"/g, '""')}"`).join(', ')}) values (${values});`
    })
    .join('\n')
}

export function downloadText(filename: string, text: string, mime: string): void {
  downloadBlob(filename, new Blob([text], { type: mime }))
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
