import type { QueryResult } from '@shared/types'
import { useMemo, useState } from 'react'
import { Copy, Download } from 'lucide-react'
import { downloadText, formatExportValue, toCsv, toInsertSql, toJson, toTsv } from '../lib/exportGrid'

export function formatCell(value: unknown): string {
  return formatExportValue(value)
}

export function ResultGrid({
  result,
  tableName = 'query_result'
}: {
  result: QueryResult
  tableName?: string
}) {
  const [sortKey, setSortKey] = useState<string>()
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const fields = result.fields.map((field) => field.name)

  const rows = useMemo(() => {
    if (!sortKey) return result.rows
    const copy = [...result.rows]
    copy.sort((left, right) => {
      const a = String(left[sortKey] ?? '')
      const b = String(right[sortKey] ?? '')
      const cmp = a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
      return sortDir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [result.rows, sortDir, sortKey])

  if (!result.fields.length) {
    return (
      <div className="empty">
        {result.command} completed · {result.rowCount} rows affected · {result.durationMs} ms
      </div>
    )
  }

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const exportRows = (kind: 'csv' | 'tsv' | 'json' | 'sql') => {
    if (kind === 'csv') downloadText(`${tableName}.csv`, toCsv(fields, rows), 'text/csv')
    if (kind === 'tsv') downloadText(`${tableName}.tsv`, toTsv(fields, rows), 'text/tab-separated-values')
    if (kind === 'json') downloadText(`${tableName}.json`, toJson(fields, rows), 'application/json')
    if (kind === 'sql') downloadText(`${tableName}.sql`, toInsertSql(tableName, fields, rows), 'text/sql')
  }

  const copy = async (kind: 'csv' | 'tsv' | 'json' | 'sql') => {
    const text =
      kind === 'csv'
        ? toCsv(fields, rows)
        : kind === 'tsv'
          ? toTsv(fields, rows)
          : kind === 'json'
            ? toJson(fields, rows)
            : toInsertSql(tableName, fields, rows)
    await navigator.clipboard.writeText(text)
  }

  return (
    <div className="panel">
      <div className="toolbar" style={{ gap: 6 }}>
        <span className="muted tiny">{rows.length} rows</span>
        <button className="btn" onClick={() => exportRows('csv')}>
          <Download size={12} /> CSV
        </button>
        <button className="btn" onClick={() => exportRows('json')}>
          JSON
        </button>
        <button className="btn" onClick={() => exportRows('tsv')}>
          TSV
        </button>
        <button className="btn" onClick={() => exportRows('sql')}>
          INSERT
        </button>
        <button className="btn-ghost" onClick={() => void copy('csv')}>
          <Copy size={12} /> Copy CSV
        </button>
        <button className="btn-ghost" onClick={() => void copy('tsv')}>
          Copy TSV
        </button>
      </div>
      <div className="grid-wrap">
        <table className="data-grid">
          <thead>
            <tr>
              <th>#</th>
              {result.fields.map((field) => (
                <th
                  key={field.name}
                  className="sortable"
                  onClick={() => toggleSort(field.name)}
                >
                  {field.name}
                  {sortKey === field.name ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                <td className="muted">{index + 1}</td>
                {result.fields.map((field) => {
                  const value = row[field.name]
                  return (
                    <td key={field.name} title={formatCell(value)}>
                      {value == null ? <span className="null">NULL</span> : formatCell(value)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
