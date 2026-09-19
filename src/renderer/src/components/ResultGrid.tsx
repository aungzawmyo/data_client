import type { QueryResult } from '@shared/types'
import { useEffect, useMemo, useState } from 'react'
import { Copy, Download } from 'lucide-react'
import { downloadText, formatExportValue, toCsv, toInsertSql, toJson, toTsv } from '../lib/exportGrid'
import { parseExplainResult } from '../lib/explain'
import { isJsonValue, labelColumn, numericColumns, parseJsonValue } from '../lib/resultChart'
import { ExplainTree } from './ExplainTree'

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
  const [view, setView] = useState<'table' | 'chart' | 'plan'>('table')
  const [inspect, setInspect] = useState<{ field: string; value: unknown }>()
  const fields = result.fields.map((field) => field.name)
  const plan = useMemo(() => parseExplainResult(result), [result])
  useEffect(() => {
    setView(plan ? 'plan' : 'table')
  }, [plan, result])
  const numeric = useMemo(() => numericColumns(result.fields, result.rows), [result])
  const category = labelColumn(result.fields, numeric)
  const [metric, setMetric] = useState(numeric[0] ?? '')

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
        <button className={view === 'table' ? 'btn active' : 'btn'} onClick={() => setView('table')}>
          Table
        </button>
        {numeric.length > 0 && (
          <button className={view === 'chart' ? 'btn active' : 'btn'} onClick={() => setView('chart')}>
            Chart
          </button>
        )}
        {plan && (
          <button className={view === 'plan' ? 'btn active' : 'btn'} onClick={() => setView('plan')}>
            Plan
          </button>
        )}
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
      {view === 'plan' && plan ? (
        <ExplainTree plan={plan} />
      ) : view === 'chart' && numeric.length ? (
        <ResultChart
          rows={rows}
          category={category}
          metric={metric || numeric[0]}
          metrics={numeric}
          onMetric={setMetric}
        />
      ) : (
        <div className="grid-wrap">
          <table className="data-grid">
            <thead>
              <tr>
                <th>#</th>
                {result.fields.map((field) => (
                  <th key={field.name} className="sortable" onClick={() => toggleSort(field.name)}>
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
                    const json = isJsonValue(value, field.dataTypeId)
                    return (
                      <td
                        key={field.name}
                        title={formatCell(value)}
                        className={json ? 'json-cell' : undefined}
                        onClick={() => json && setInspect({ field: field.name, value })}
                      >
                        {value == null ? <span className="null">NULL</span> : formatCell(value)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {inspect && <JsonInspector field={inspect.field} value={inspect.value} onClose={() => setInspect(undefined)} />}
    </div>
  )
}

function ResultChart({
  rows,
  category,
  metric,
  metrics,
  onMetric
}: {
  rows: Record<string, unknown>[]
  category?: string
  metric: string
  metrics: string[]
  onMetric: (name: string) => void
}) {
  const points = rows.slice(0, 40).map((row) => ({
    label: String(row[category ?? metric] ?? ''),
    value: Number(row[metric] ?? 0)
  }))
  const max = Math.max(1, ...points.map((point) => point.value))
  return (
    <div className="result-chart">
      <div className="toolbar">
        <label className="tiny muted">
          Value
          <select className="input" value={metric} onChange={(event) => onMetric(event.target.value)}>
            {metrics.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <span className="tiny muted">{points.length} points · {category ?? 'row'}</span>
      </div>
      <div className="chart-bars">
        {points.map((point, index) => (
          <div key={`${point.label}-${index}`} className="chart-row">
            <span className="chart-label" title={point.label}>
              {point.label || `#${index + 1}`}
            </span>
            <span className="chart-track">
              <span style={{ width: `${(point.value / max) * 100}%` }} />
            </span>
            <span className="tiny muted">{point.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function JsonInspector({ field, value, onClose }: { field: string; value: unknown; onClose: () => void }) {
  const parsed = parseJsonValue(value)
  const pretty = parsed ? JSON.stringify(parsed, null, 2) : formatCell(value)
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog" onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-head">
          <strong>JSON · {field}</strong>
        </div>
        <div className="dialog-body">
          <pre className="sql-preview" style={{ minHeight: 220 }}>
            {pretty}
          </pre>
        </div>
        <div className="dialog-foot">
          <button className="btn" onClick={() => void navigator.clipboard.writeText(pretty)}>
            Copy
          </button>
          <button className="btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

