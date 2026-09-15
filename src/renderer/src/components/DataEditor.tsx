import { useEffect, useMemo, useState } from 'react'
import type { ForeignKeyInfo, TableDataPage } from '@shared/types'
import { useAppStore } from '../store'
import { formatCell } from './ResultGrid'
import { downloadText, toCsv, toInsertSql, toJson, toTsv } from '../lib/exportGrid'
import { qualify } from '../lib/sql'

export function DataEditor({
  schema,
  table,
  initialFilter = ''
}: {
  schema: string
  table: string
  initialFilter?: string
}) {
  const activeConnection = useAppStore((s) => s.activeConnection)
  const setStatus = useAppStore((s) => s.setStatus)
  const openTab = useAppStore((s) => s.openTab)
  const setImportDialog = useAppStore((s) => s.setImportDialog)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)
  const [filterSql, setFilterSql] = useState(initialFilter)
  const [appliedFilter, setAppliedFilter] = useState(initialFilter)
  const [data, setData] = useState<TableDataPage | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [drafts, setDrafts] = useState<Record<string, Record<string, unknown>>>({})
  const [error, setError] = useState('')
  const [foreignKeys, setForeignKeys] = useState<ForeignKeyInfo[]>([])
  const [sortKey, setSortKey] = useState<string>()
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const load = async (nextPage = page, nextFilter = appliedFilter) => {
    if (!activeConnection) return
    setError('')
    try {
      const result = await window.api.pg.tableData(
        activeConnection.id,
        schema,
        table,
        nextPage,
        pageSize,
        nextFilter
      )
      setData(result)
      setDrafts({})
      setSelected(new Set())
      setStatus(`${result.total} rows in ${schema}.${table}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    setFilterSql(initialFilter)
    setAppliedFilter(initialFilter)
    setPage(1)
  }, [initialFilter, schema, table])

  useEffect(() => {
    setPage(1)
    void load(1, appliedFilter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConnection?.id, schema, table, pageSize, appliedFilter])

  useEffect(() => {
    if (!activeConnection) return
    void window.api.pg.tableDetails(activeConnection.id, schema, table).then((details) => {
      setForeignKeys(details.foreignKeys)
    })
  }, [activeConnection?.id, schema, table])

  const fkByColumn = useMemo(() => {
    const map = new Map<string, ForeignKeyInfo>()
    for (const fk of foreignKeys) {
      fk.columns.forEach((column, index) => {
        map.set(column, { ...fk, columns: [column], refColumns: [fk.refColumns[index] ?? fk.refColumns[0]] })
      })
    }
    return map
  }, [foreignKeys])

  const rows = useMemo(() => {
    if (!data) return []
    const merged = data.rows.map((row) => {
      const ctid = String(row.__ctid ?? '')
      return { ...row, ...(drafts[ctid] ?? {}) }
    })
    if (!sortKey) return merged
    return [...merged].sort((left, right) => {
      const cmp = String(left[sortKey] ?? '').localeCompare(String(right[sortKey] ?? ''), undefined, {
        numeric: true,
        sensitivity: 'base'
      })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [data, drafts, sortDir, sortKey])

  const changeCell = (ctid: string, column: string, value: string, original: unknown) => {
    const parsed = value === '' && original == null ? null : value
    setDrafts((current) => ({
      ...current,
      [ctid]: { ...(current[ctid] ?? {}), [column]: parsed }
    }))
  }

  const save = async () => {
    if (!activeConnection || !data) return
    try {
      for (const [ctid, values] of Object.entries(drafts)) {
        const payload = { ...values }
        delete payload.__ctid
        await window.api.pg.saveRow(
          activeConnection.id,
          schema,
          table,
          payload,
          ctid.startsWith('new:') ? null : ctid
        )
      }
      await load(page, appliedFilter)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const remove = async () => {
    if (!activeConnection || !selected.size) return
    const ctids = [...selected].filter((id) => !id.startsWith('new:'))
    try {
      await window.api.pg.deleteRows(activeConnection.id, schema, table, ctids)
      await load(page, appliedFilter)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const addRow = () => {
    if (!data) return
    const ctid = `new:${crypto.randomUUID()}`
    const empty: Record<string, unknown> = { __ctid: ctid }
    for (const column of data.columns) empty[column.name] = null
    setData({ ...data, rows: [empty, ...data.rows] })
    setDrafts((current) => ({ ...current, [ctid]: empty }))
  }

  const hop = (column: string, value: unknown) => {
    const fk = fkByColumn.get(column)
    if (!fk || value == null) return
    const literal = typeof value === 'number' ? String(value) : `'${String(value).replace(/'/g, "''")}'`
    const filter = `${quoteBare(fk.refColumns[0])} = ${literal}`
    openTab({
      type: 'data',
      title: `${fk.refSchema}.${fk.refTable}`,
      schema: fk.refSchema,
      name: fk.refTable,
      filter
    })
  }

  const fields = data?.fields.map((field) => field.name) ?? []
  const exportRows = (kind: 'csv' | 'json' | 'tsv' | 'sql') => {
    const qualified = qualify(schema, table)
    if (kind === 'csv') downloadText(`${table}.csv`, toCsv(fields, rows), 'text/csv')
    if (kind === 'json') downloadText(`${table}.json`, toJson(fields, rows), 'application/json')
    if (kind === 'tsv') downloadText(`${table}.tsv`, toTsv(fields, rows), 'text/tab-separated-values')
    if (kind === 'sql') downloadText(`${table}.sql`, toInsertSql(qualified, fields, rows), 'text/sql')
  }

  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize))

  return (
    <div className="panel">
      <div className="toolbar">
        <button className="btn-primary" onClick={() => void save()} disabled={!Object.keys(drafts).length}>
          Save edits
        </button>
        <button className="btn" onClick={addRow}>
          Insert row
        </button>
        <button className="btn-danger" onClick={() => void remove()} disabled={!selected.size}>
          Delete selected
        </button>
        <button className="btn" onClick={() => setImportDialog({ schema, table })}>
          Import CSV
        </button>
        <button className="btn" onClick={() => exportRows('csv')}>
          CSV
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
        <input
          className="input"
          style={{ width: 280 }}
          placeholder="Filter, e.g. status = 'active'"
          value={filterSql}
          onChange={(e) => setFilterSql(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setPage(1)
              setAppliedFilter(filterSql)
            }
          }}
        />
        <button
          className="btn"
          onClick={() => {
            setPage(1)
            setAppliedFilter(filterSql)
          }}
        >
          Apply
        </button>
        <span className="muted tiny">
          Page {page} / {pages} · {data?.total ?? 0} rows
        </span>
        <button className="btn-ghost" disabled={page <= 1} onClick={() => { setPage(page - 1); void load(page - 1) }}>
          Prev
        </button>
        <button className="btn-ghost" disabled={page >= pages} onClick={() => { setPage(page + 1); void load(page + 1) }}>
          Next
        </button>
        <select className="input" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
          <option value={50}>50</option>
          <option value={100}>100</option>
          <option value={200}>200</option>
          <option value={500}>500</option>
        </select>
      </div>
      {error && <div className="error tiny" style={{ padding: '6px 12px' }}>{error}</div>}
      <div className="grid-wrap">
        <table className="data-grid">
          <thead>
            <tr>
              <th />
              {data?.fields.map((field) => (
                <th
                  key={field.name}
                  className="sortable"
                  onClick={() => {
                    if (sortKey === field.name) setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
                    else {
                      setSortKey(field.name)
                      setSortDir('asc')
                    }
                  }}
                >
                  {field.name}
                  {data.columns.find((c) => c.name === field.name)?.isPrimaryKey ? ' PK' : ''}
                  {fkByColumn.has(field.name) ? ' FK' : ''}
                  {sortKey === field.name ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const ctid = String(row.__ctid ?? '')
              const dirty = Boolean(drafts[ctid])
              return (
                <tr key={ctid} className={`${selected.has(ctid) ? 'selected' : ''} ${dirty ? 'dirty' : ''}`}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(ctid)}
                      onChange={(e) => {
                        const next = new Set(selected)
                        if (e.target.checked) next.add(ctid)
                        else next.delete(ctid)
                        setSelected(next)
                      }}
                    />
                  </td>
                  {data?.fields.map((field) => {
                    const value = row[field.name]
                    const fk = fkByColumn.get(field.name)
                    return (
                      <td key={field.name}>
                        <div className="cell-edit">
                          <input
                            value={value == null ? '' : formatCell(value)}
                            placeholder={value == null ? 'NULL' : ''}
                            onChange={(e) => changeCell(ctid, field.name, e.target.value, value)}
                          />
                          {fk && value != null && value !== '' && (
                            <button className="link-btn" title={`Open ${fk.refSchema}.${fk.refTable}`} onClick={() => hop(field.name, value)}>
                              →
                            </button>
                          )}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function quoteBare(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}
