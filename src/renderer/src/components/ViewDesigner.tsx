import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../store'
import { buildCreateViewSql } from '../lib/sql'
import { SqlEditor } from './SqlEditor'

export function ViewDesigner({ schema, view }: { schema: string; view?: string }) {
  const { activeConnection, schemas, runSql } = useAppStore()
  const [targetSchema, setTargetSchema] = useState(schema)
  const [name, setName] = useState(view ?? '')
  const [definition, setDefinition] = useState('select 1 as id')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!activeConnection || !view) return
    void window.api.pg.viewDetails(activeConnection.id, schema, view).then((details) => {
      setName(details.name)
      setDefinition(details.definition.replace(/;+$/, ''))
    })
  }, [activeConnection, schema, view])

  const sql = useMemo(() => buildCreateViewSql(targetSchema, name || 'new_view', definition), [definition, name, targetSchema])

  return (
    <div className="designer">
      <div className="toolbar">
        <label className="field" style={{ minWidth: 140 }}>
          Schema
          <select value={targetSchema} onChange={(e) => setTargetSchema(e.target.value)}>
            {schemas.map((item) => (
              <option key={item.name}>{item.name}</option>
            ))}
          </select>
        </label>
        <label className="field" style={{ minWidth: 180 }}>
          View
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="view_name" />
        </label>
        <button
          className="btn-primary"
          onClick={async () => {
            setError('')
            if (!name.trim()) {
              setError('Enter a view name')
              return
            }
            try {
              await runSql(sql)
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err))
            }
          }}
        >
          Apply view
        </button>
      </div>
      {error && <div className="error tiny" style={{ padding: '6px 12px' }}>{error}</div>}
      <div className="designer-body">
        <div className="panel">
          <div className="panel-head">
            <strong>View definition</strong>
          </div>
          <SqlEditor value={definition} onChange={setDefinition} />
        </div>
        <div className="designer-side">
          <div className="panel-head">
            <strong>Generated SQL</strong>
          </div>
          <pre className="sql-preview">{sql}</pre>
        </div>
      </div>
    </div>
  )
}
