import { useEffect, useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { Play, Plus, Square, X } from 'lucide-react'
import type { QueryResult } from '@shared/types'
import { useAppStore } from '../store'
import { SqlEditor } from './SqlEditor'
import { ResultGrid } from './ResultGrid'
import { DataEditor } from './DataEditor'
import { TableDesigner } from './TableDesigner'
import { ViewDesigner } from './ViewDesigner'
import { SchemaOverview } from './SchemaOverview'
import { SchemaTableList } from './SchemaTableList'
import { SchemaDiff } from './SchemaDiff'
import { looksUnlimitedSelectStar } from '../lib/csv'

export function Workspace() {
  const { tabs, activeTabId, openTab, closeTab, connected, connections } = useAppStore()
  const active = tabs.find((tab) => tab.id === activeTabId)

  if (!connected) return <Welcome connections={connections} />

  return (
    <section className="main">
      <div className="tabbar">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab ${tab.id === activeTabId ? 'active' : ''}`}
            onClick={() => useAppStore.setState({ activeTabId: tab.id })}
          >
            {tab.title}
            <span
              className="close"
              onClick={(event) => {
                event.stopPropagation()
                closeTab(tab.id)
              }}
            >
              <X size={12} />
            </span>
          </button>
        ))}
        <button className="icon-btn" onClick={() => openTab({ type: 'query', title: `Query ${tabs.length + 1}`, sql: '' })}>
          <Plus size={14} />
        </button>
      </div>
      {active?.type === 'query' && <QueryWorkspace tabId={active.id} sql={active.sql ?? ''} title={active.title} />}
      {active?.type === 'data' && active.schema && active.name && (
        <DataEditor schema={active.schema} table={active.name} initialFilter={active.filter} />
      )}
      {active?.type === 'table-design' && active.schema && (
        <TableDesigner schema={active.schema} table={active.name || undefined} />
      )}
      {active?.type === 'view-design' && active.schema && (
        <ViewDesigner schema={active.schema} view={active.name || undefined} />
      )}
      {active?.type === 'schema-overview' && active.schema && <SchemaOverview schema={active.schema} />}
      {active?.type === 'schema-tables' && active.schema && <SchemaTableList schema={active.schema} />}
      {active?.type === 'schema-diff' && (
        <SchemaDiff leftSchema={active.schema} rightSchema={active.name} />
      )}
      {!active && <div className="empty">Open a query, table, view, or schema to start editing.</div>}
    </section>
  )
}

function QueryWorkspace({ tabId, sql, title }: { tabId: string; sql: string; title: string }) {
  const setTabSql = useAppStore((s) => s.setTabSql)
  const runSql = useAppStore((s) => s.runSql)
  const cancelQuery = useAppStore((s) => s.cancelQuery)
  const busy = useAppStore((s) => s.busy)
  const queryTimeoutMs = useAppStore((s) => s.queryTimeoutMs)
  const setQueryTimeoutMs = useAppStore((s) => s.setQueryTimeoutMs)
  const setConfirm = useAppStore((s) => s.setConfirm)
  const [results, setResults] = useState<QueryResult[]>([])
  const [activeResult, setActiveResult] = useState(0)
  const [error, setError] = useState('')

  const execute = async (text: string) => {
    setError('')
    try {
      const next = await runSql(text)
      setResults(next)
      setActiveResult(Math.max(0, next.length - 1))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const run = async () => {
    if (!sql.trim()) {
      setError('Enter a SQL statement to run')
      return
    }
    if (looksUnlimitedSelectStar(sql)) {
      setConfirm({
        title: 'SELECT * without LIMIT',
        message: 'This can return a very large result set. Run anyway, or add LIMIT 1000 first?',
        sql,
        onConfirm: async () => {
          await execute(sql)
        }
      })
      return
    }
    await execute(sql)
  }

  const explain = async () => {
    if (!sql.trim()) return
    const body = sql.trim().replace(/;+$/, '')
    await execute(`explain (analyze, buffers, format text) ${body}`)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'F5' || ((event.ctrlKey || event.metaKey) && event.key === 'Enter')) {
        event.preventDefault()
        void run()
      } else if (event.key === 'Escape' && busy) {
        event.preventDefault()
        void cancelQuery()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sql, busy])

  return (
    <div className="panel">
      <div className="toolbar">
        <button className="btn-primary" onClick={() => void run()} disabled={busy}>
          <Play size={14} /> Run
        </button>
        <button className="btn-danger" onClick={() => void cancelQuery()} disabled={!busy}>
          <Square size={12} /> Cancel
        </button>
        <button className="btn" onClick={() => void explain()} disabled={busy}>
          Explain
        </button>
        <label className="tiny muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          Timeout
          <select
            className="input"
            value={queryTimeoutMs}
            onChange={(event) => setQueryTimeoutMs(Number(event.target.value))}
          >
            <option value={0}>None</option>
            <option value={15000}>15s</option>
            <option value={30000}>30s</option>
            <option value={60000}>60s</option>
            <option value={120000}>120s</option>
          </select>
        </label>
        <span className="muted tiny">{title} · F5 or Ctrl+Enter · Esc cancels</span>
      </div>
      {error && <div className="error tiny" style={{ padding: '6px 12px' }}>{error}</div>}
      <PanelGroup className="split" direction="vertical">
        <Panel defaultSize={55} minSize={20}>
          <SqlEditor value={sql} onChange={(value) => setTabSql(tabId, value)} />
        </Panel>
        <PanelResizeHandle style={{ height: 6, background: '#1b2330' }} />
        <Panel defaultSize={45} minSize={15}>
          <div className="panel">
            <div className="section-tabs">
              {results.map((result, index) => (
                <button
                  key={index}
                  className={index === activeResult ? 'btn active' : 'btn'}
                  onClick={() => setActiveResult(index)}
                >
                  Result {index + 1} ({result.rowCount})
                </button>
              ))}
            </div>
            {results[activeResult] ? (
              <ResultGrid result={results[activeResult]} />
            ) : (
              <div className="empty">Run a statement to see results here.</div>
            )}
          </div>
        </Panel>
      </PanelGroup>
    </div>
  )
}

function Welcome({ connections }: { connections: import('@shared/types').ConnectionConfig[] }) {
  const { openConnectionDialog, connect, loadConnections, appVersion } = useAppStore()
  return (
    <section className="main">
      <div className="welcome">
        <div className="welcome-card">
          <h1>Data Client</h1>
          <p className="muted">
            Windows PostgreSQL manager with visual tools for databases, schemas, tables, views, and data.
          </p>
          <p className="tiny muted">Version {appVersion}</p>
          <div className="row-actions" style={{ marginTop: 16 }}>
            <button className="btn-primary" onClick={() => openConnectionDialog()}>
              New connection
            </button>
          </div>
          <div className="connection-list">
            {connections.map((connection) => (
              <div key={connection.id} className="connection-item">
                <div>
                  <strong>{connection.name}</strong>
                  <div className="tiny muted">
                    {connection.user}@{connection.host}:{connection.port}/{connection.database}
                  </div>
                </div>
                <div className="row-actions">
                  <button
                    className="btn-primary"
                    onClick={() => void connect(connection).catch(() => undefined)}
                  >
                    Connect
                  </button>
                  <button className="btn" onClick={() => openConnectionDialog(connection)}>
                    Edit
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={async () => {
                      await window.api.connections.delete(connection.id)
                      await loadConnections()
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            {!connections.length && <div className="muted">No saved connections yet.</div>}
          </div>
        </div>
      </div>
    </section>
  )
}
