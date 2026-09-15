export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    const next = text[i + 1]
    if (quoted) {
      if (ch === '"' && next === '"') {
        cell += '"'
        i += 1
      } else if (ch === '"') {
        quoted = false
      } else {
        cell += ch
      }
      continue
    }
    if (ch === '"') {
      quoted = true
      continue
    }
    if (ch === ',') {
      row.push(cell)
      cell = ''
      continue
    }
    if (ch === '\n') {
      row.push(cell)
      if (row.some((value) => value.length)) rows.push(row)
      row = []
      cell = ''
      continue
    }
    if (ch !== '\r') cell += ch
  }
  if (cell.length || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

export function looksUnlimitedSelectStar(sql: string): boolean {
  const stripped = sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ')
    .trim()
  if (!stripped) return false
  const first = stripped.split(';')[0] ?? stripped
  const isSelectStar = /^\s*select\s+\*\s+from\b/i.test(first)
  const hasLimit = /\blimit\s+\d+/i.test(first)
  return isSelectStar && !hasLimit
}
