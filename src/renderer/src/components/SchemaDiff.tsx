import { useEffect, useState } from 'react'
import { useAppStore } from '../store'
import { diffSchemas } from '../lib/schemaDiff'
import { SqlEditor } from './SqlEditor'

export function SchemaDiff({ leftSchema, rightSchema }: { leftSchema?: string; rightSchema?: string }) {
  const { activeConnection, schemas, runSql } = useAppStore()
  const [fromSchema, setFromSchema] = useState(leftSchema || schemas[0]?.name || 'public')
  const [toSchema, setToSchema] = useState(rightSchema || schemas[1]?.name || schemas[0]?.name || 'public')
  const [sql, setSql] = useState('-- Choose two schemas and compare')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (leftSchema) setFromSchema(leftSchema)
    if (rightSchema) setToSchema(rightSchema)
  }, [leftSchema, rightSchema])

  const compare = async () => {
    if (!activeConnection) return
    setBusy(true)
    setError('')
    try {
      const [fromTables, toTables] = await Promise.all([
        window.api.pg.listTables(activeConnection.id, fromSchema),
        window.api.pg.listTables(activeConnection.id, toSchema)
      ])
      const [fromDetails, toDetails] = await Promise.all([
        Promise.all(fromTables.filter((item) => item.type === 'table').map((table) => window.api.pg.tableDetails(activeConnection.id, fromSchema, table.name))),
        Promise.all(toTables.filter((item) => item.type === 'table').map((table) => window.api.pg.tableDetails(activeConnection.id, toSchema, table.name)))
      ])
      setSql(diffSchemas(fromSchema, toSchema, fromDetails, toDetails))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel">
      <div className="toolbar">
        <label className="field" style={{ minWidth: 140 }}>
          From
          <select value={fromSchema} onChange={(event) => setFromSchema(event.target.value)}>
            {schemas.map((schema) => (
              <option key={schema.name}>{schema.name}</option>
            ))}
          </select>
        </label>
        <label className="field" style={{ minWidth: 140 }}>
          To
          <select value={toSchema} onChange={(event) => setToSchema(event.target.value)}>
            {schemas.map((schema) => (
              <option key={schema.name}>{schema.name}</option>
            ))}
          </select>
        </label>
        <button className="btn-primary" disabled={busy} onClick={() => void compare()}>
          Compare
        </button>
        <button className="btn" disabled={busy || sql.startsWith('--')} onClick={() => void runSql(sql)}>
          Apply SQL
        </button>
        <span className="muted tiny">SQL transforms From so it matches To</span>
      </div>
      {error && <div className="error tiny" style={{ padding: '6px 12px' }}>{error}</div>}
      <div style={{ flex: 1, minHeight: 0 }}>
        <SqlEditor value={sql} onChange={setSql} />
      </div>
    </div>
  )
}
