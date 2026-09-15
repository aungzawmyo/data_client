import { useEffect, useMemo, useState } from 'react'
import { LayoutGrid, RefreshCw, Table2 } from 'lucide-react'
import type { TableInfo } from '@shared/types'
import { useAppStore } from '../store'

type SortKey = 'name' | 'estimatedRows' | 'size' | 'created' | 'updated' | 'engine' | 'comment' | 'typeLabel'

function formatDate(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function formatRows(value: number): string {
  return new Intl.NumberFormat().format(Math.max(0, Math.round(value)))
}

export function SchemaTableList({ schema }: { schema: string }) {
  const { activeConnection, openTab } = useAppStore()
  const [tables, setTables] = useState<TableInfo[]>([])
  const [filter, setFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [selected, setSelected] = useState<string>()
  const [error, setError] = useState('')

  const load = async () => {
    if (!activeConnection) return
    setError('')
    try {
      const list = await window.api.pg.listTables(activeConnection.id, schema)
      setTables(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConnection?.id, schema])

  const rows = useMemo(() => {
    const query = filter.trim().toLowerCase()
    const filtered = query
      ? tables.filter((table) =>
          `${table.schema}.${table.name} ${table.typeLabel} ${table.comment ?? ''}`.toLowerCase().includes(query)
        )
      : tables
    const sorted = [...filtered].sort((a, b) => {
      const left = sortValue(a, sortKey)
      const right = sortValue(b, sortKey)
      if (left < right) return sortDir === 'asc' ? -1 : 1
      if (left > right) return sortDir === 'asc' ? 1 : -1
      return a.name.localeCompare(b.name)
    })
    return sorted
  }, [filter, sortDir, sortKey, tables])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'estimatedRows' || key === 'size' ? 'desc' : 'asc')
    }
  }

  const openSelected = (table: TableInfo) => {
    if (table.type === 'view') {
      openTab({ type: 'view-design', title: `View ${table.name}`, schema, name: table.name })
      return
    }
    openTab({ type: 'data', title: `${schema}.${table.name}`, schema, name: table.name })
  }

  const current = tables.find((table) => table.name === selected)

  return (
    <div className="panel">
      <div className="toolbar">
        <strong>{schema}</strong>
        <span className="muted tiny">{rows.length} objects</span>
        <input
          className="input"
          style={{ width: 220 }}
          placeholder="Filter tables"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <button className="btn" onClick={() => void load()}>
          <RefreshCw size={14} /> Refresh
        </button>
        <button
          className="btn"
          onClick={() => openTab({ type: 'schema-overview', title: `${schema} diagram`, schema, name: `${schema}-diagram` })}
        >
          <LayoutGrid size={14} /> Visual overview
        </button>
        <button className="btn" onClick={() => openTab({ type: 'table-design', title: 'New table', schema, name: '' })}>
          New table
        </button>
        <button
          className="btn-primary"
          disabled={!current}
          onClick={() => current && openSelected(current)}
        >
          Open
        </button>
        <button
          className="btn"
          disabled={!current}
          onClick={() =>
            current &&
            openTab({
              type: current.type === 'view' ? 'view-design' : 'table-design',
              title: current.name,
              schema,
              name: current.name
            })
          }
        >
          Design
        </button>
      </div>
      {error && <div className="error tiny" style={{ padding: '6px 12px' }}>{error}</div>}
      <div className="grid-wrap">
        <table className="data-grid schema-table-list">
          <thead>
            <tr>
              <Header label="Name" active={sortKey === 'name'} dir={sortDir} onClick={() => toggleSort('name')} />
              <Header label="Rows" active={sortKey === 'estimatedRows'} dir={sortDir} onClick={() => toggleSort('estimatedRows')} />
              <Header label="Size" active={sortKey === 'size'} dir={sortDir} onClick={() => toggleSort('size')} />
              <Header label="Created" active={sortKey === 'created'} dir={sortDir} onClick={() => toggleSort('created')} />
              <Header label="Updated" active={sortKey === 'updated'} dir={sortDir} onClick={() => toggleSort('updated')} />
              <Header label="Engine" active={sortKey === 'engine'} dir={sortDir} onClick={() => toggleSort('engine')} />
              <Header label="Comment" active={sortKey === 'comment'} dir={sortDir} onClick={() => toggleSort('comment')} />
              <Header label="Type" active={sortKey === 'typeLabel'} dir={sortDir} onClick={() => toggleSort('typeLabel')} />
            </tr>
          </thead>
          <tbody>
            {rows.map((table) => (
              <tr
                key={table.name}
                className={selected === table.name ? 'selected' : ''}
                onClick={() => setSelected(table.name)}
                onDoubleClick={() => openSelected(table)}
              >
                <td>
                  <span className="table-name-cell">
                    <Table2 size={13} className="tree-icon" />
                    {table.schema}.{table.name}
                  </span>
                </td>
                <td className="num">{formatRows(table.estimatedRows)}</td>
                <td>{table.size}</td>
                <td className="muted">{formatDate(table.created)}</td>
                <td>{formatDate(table.updated)}</td>
                <td>{table.engine}</td>
                <td className="muted">{table.comment ?? ''}</td>
                <td>{table.typeLabel}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 24 }}>
                  No tables or views in this schema.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Header({
  label,
  active,
  dir,
  onClick
}: {
  label: string
  active: boolean
  dir: 'asc' | 'desc'
  onClick: () => void
}) {
  return (
    <th onClick={onClick} className={active ? 'sorted' : ''}>
      {label}
      {active ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  )
}

function sortValue(table: TableInfo, key: SortKey): string | number {
  if (key === 'estimatedRows') return table.estimatedRows
  if (key === 'size') return table.size
  if (key === 'created') return table.created ?? ''
  if (key === 'updated') return table.updated ?? ''
  if (key === 'comment') return table.comment ?? ''
  if (key === 'engine') return table.engine
  if (key === 'typeLabel') return table.typeLabel
  return `${table.schema}.${table.name}`.toLowerCase()
}
