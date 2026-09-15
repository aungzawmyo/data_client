import type { ReactNode } from 'react'
import {
  Binary,
  Braces,
  ChevronDown,
  ChevronRight,
  Database,
  Eye,
  FolderTree,
  Hash,
  Plus,
  RefreshCw,
  Search,
  Table2,
  Zap
} from 'lucide-react'
import { useAppStore } from '../store'

export function Sidebar() {
  const {
    connected,
    databases,
    schemas,
    tablesBySchema,
    objectsBySchema,
    expanded,
    toggleExpand,
    currentDatabase,
    switchDatabase,
    openTab,
    setContextMenu,
    refreshTree,
    setDatabaseDialog,
    setSchemaDialog,
    openConnectionDialog,
    setSearchOpen,
    activeConnection
  } = useAppStore()

  const openDefinition = async (
    schema: string,
    kind: 'sequence' | 'function' | 'trigger' | 'type',
    name: string,
    extra: string
  ) => {
    if (!activeConnection) return
    const sql = await window.api.pg.objectDefinition(activeConnection.id, kind, schema, name, extra)
    openTab({ type: 'query', title: name, sql })
  }

  if (!connected) {
    return (
      <aside className="sidebar">
        <div className="sidebar-head">
          <strong>Explorer</strong>
        </div>
        <div className="empty">Connect to a PostgreSQL server to manage databases, schemas, tables, and views.</div>
      </aside>
    )
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <strong>Object explorer</strong>
        <span className="muted tiny">{currentDatabase}</span>
      </div>
      <div className="sidebar-tools">
        <button className="icon-btn" title="New query" onClick={() => openTab({ type: 'query', title: 'Query', sql: '' })}>
          <Plus size={14} />
        </button>
        <button className="icon-btn" title="New database" onClick={() => setDatabaseDialog(true)}>
          <Database size={14} />
        </button>
        <button className="icon-btn" title="New schema" onClick={() => setSchemaDialog(true)}>
          <FolderTree size={14} />
        </button>
        <button className="icon-btn" title="Search (Ctrl+P)" onClick={() => setSearchOpen(true)}>
          <Search size={14} />
        </button>
        <button className="icon-btn" title="Refresh" onClick={() => void refreshTree()}>
          <RefreshCw size={14} />
        </button>
        <button className="btn-ghost" onClick={() => openConnectionDialog()}>
          New connection
        </button>
      </div>
      <div
        className="tree"
        onContextMenu={(event) => {
          event.preventDefault()
          setContextMenu({ x: event.clientX, y: event.clientY, kind: 'root' })
        }}
      >
        <TreeGroup
          label="Databases"
          count={databases.length}
          open={expanded.databases ?? true}
          onToggle={() => void toggleExpand('databases')}
        >
          {databases.map((database) => (
            <div
              key={database.name}
              className={`tree-node ${database.name === currentDatabase ? 'active' : ''}`}
              onDoubleClick={() => void switchDatabase(database.name)}
              onContextMenu={(event) => {
                event.preventDefault()
                event.stopPropagation()
                setContextMenu({ x: event.clientX, y: event.clientY, kind: 'database', name: database.name })
              }}
            >
              <Database size={14} className="tree-icon" />
              <span className="tree-label">{database.name}</span>
              <span className="tree-size">{database.size}</span>
            </div>
          ))}
        </TreeGroup>
        <TreeGroup
          label="Schemas"
          count={schemas.length}
          open={expanded.schemas ?? true}
          onToggle={() => void toggleExpand('schemas')}
        >
          {schemas.map((schema) => {
            const key = `schema:${schema.name}`
            const open = expanded[key]
            const objects = tablesBySchema[schema.name] ?? []
            const extras = objectsBySchema[schema.name] ?? []
            const tables = objects.filter((item) => item.type === 'table')
            const views = objects.filter((item) => item.type === 'view')
            const sequences = extras.filter((item) => item.kind === 'sequence')
            const functions = extras.filter((item) => item.kind === 'function')
            const triggers = extras.filter((item) => item.kind === 'trigger')
            const types = extras.filter((item) => item.kind === 'type')
            const tableCount = objects.length ? tables.length : schema.tableCount
            return (
              <div key={schema.name}>
                <div
                  className="tree-node"
                  onClick={() => void toggleExpand(key)}
                  onDoubleClick={() =>
                    openTab({ type: 'schema-tables', title: schema.name, schema: schema.name, name: schema.name })
                  }
                  onContextMenu={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setContextMenu({
                      x: event.clientX,
                      y: event.clientY,
                      kind: 'schema',
                      schema: schema.name,
                      name: schema.name
                    })
                  }}
                >
                  {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <FolderTree size={14} className="tree-icon" />
                  <span className="tree-label">{schema.name}</span>
                  <span className="tree-count">{tableCount}</span>
                  <span className="tree-size">{schema.size}</span>
                </div>
                {open && (
                  <div className="tree-children">
                    <div className="tiny muted" style={{ padding: '4px 8px' }}>
                      Tables
                    </div>
                    {tables.map((table) => (
                      <div
                        key={table.name}
                        className="tree-node"
                        onDoubleClick={() =>
                          openTab({
                            type: 'data',
                            title: `${schema.name}.${table.name}`,
                            schema: schema.name,
                            name: table.name
                          })
                        }
                        onContextMenu={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          setContextMenu({
                            x: event.clientX,
                            y: event.clientY,
                            kind: 'table',
                            schema: schema.name,
                            name: table.name
                          })
                        }}
                      >
                        <Table2 size={14} className="tree-icon" />
                        <span className="tree-label">{table.name}</span>
                        <span className="tree-size">{table.size}</span>
                      </div>
                    ))}
                    <div className="tiny muted" style={{ padding: '4px 8px' }}>
                      Views
                    </div>
                    {views.map((view) => (
                      <div
                        key={view.name}
                        className="tree-node"
                        onDoubleClick={() =>
                          openTab({
                            type: 'view-design',
                            title: `View ${view.name}`,
                            schema: schema.name,
                            name: view.name
                          })
                        }
                        onContextMenu={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          setContextMenu({
                            x: event.clientX,
                            y: event.clientY,
                            kind: 'view',
                            schema: schema.name,
                            name: view.name
                          })
                        }}
                      >
                        <Eye size={14} className="tree-icon muted" />
                        <span className="tree-label">{view.name}</span>
                        <span className="tree-size">{view.size}</span>
                      </div>
                    ))}
                    <ObjectGroup
                      label="Sequences"
                      items={sequences.map((item) => ({
                        key: item.name,
                        label: item.name,
                        icon: <Hash size={14} className="tree-icon" />,
                        onOpen: () => void openDefinition(schema.name, item.kind, item.name, item.extra),
                        onMenu: (x, y) => setContextMenu({ x, y, kind: 'sequence', schema: schema.name, name: item.name, extra: item.extra })
                      }))}
                    />
                    <ObjectGroup
                      label="Functions"
                      items={functions.map((item) => ({
                        key: `${item.name}(${item.extra})`,
                        label: `${item.name}(${item.extra})`,
                        icon: <Binary size={14} className="tree-icon" />,
                        onOpen: () => void openDefinition(schema.name, item.kind, item.name, item.extra),
                        onMenu: (x, y) => setContextMenu({ x, y, kind: 'function', schema: schema.name, name: item.name, extra: item.extra })
                      }))}
                    />
                    <ObjectGroup
                      label="Triggers"
                      items={triggers.map((item) => ({
                        key: `${item.extra}.${item.name}`,
                        label: `${item.name} · ${item.extra}`,
                        icon: <Zap size={14} className="tree-icon" />,
                        onOpen: () => void openDefinition(schema.name, item.kind, item.name, item.extra),
                        onMenu: (x, y) => setContextMenu({ x, y, kind: 'trigger', schema: schema.name, name: item.name, extra: item.extra })
                      }))}
                    />
                    <ObjectGroup
                      label="Types"
                      items={types.map((item) => ({
                        key: item.name,
                        label: `${item.name} · ${item.extra}`,
                        icon: <Braces size={14} className="tree-icon" />,
                        onOpen: () => void openDefinition(schema.name, item.kind, item.name, item.extra),
                        onMenu: (x, y) => setContextMenu({ x, y, kind: 'type', schema: schema.name, name: item.name, extra: item.extra })
                      }))}
                    />
                    {!objects.length && !extras.length && <div className="tiny muted" style={{ padding: '4px 8px' }}>Empty</div>}
                  </div>
                )}
              </div>
            )
          })}
        </TreeGroup>
      </div>
    </aside>
  )
}

function ObjectGroup({
  label,
  items
}: {
  label: string
  items: { key: string; label: string; icon: ReactNode; onOpen: () => void; onMenu: (x: number, y: number) => void }[]
}) {
  if (!items.length) return null
  return (
    <>
      <div className="tiny muted" style={{ padding: '4px 8px' }}>
        {label}
      </div>
      {items.map((item) => (
        <div
          key={item.key}
          className="tree-node"
          onDoubleClick={item.onOpen}
          onContextMenu={(event) => {
            event.preventDefault()
            event.stopPropagation()
            item.onMenu(event.clientX, event.clientY)
          }}
        >
          {item.icon}
          <span className="tree-label">{item.label}</span>
        </div>
      ))}
    </>
  )
}

function TreeGroup({
  label,
  count,
  open,
  onToggle,
  children
}: {
  label: string
  count?: number
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div>
      <div className="tree-node" onClick={onToggle}>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <strong className="tree-label">{label}</strong>
        {count != null && <span className="tree-count">{count}</span>}
      </div>
      {open && <div className="tree-children">{children}</div>}
    </div>
  )
}
