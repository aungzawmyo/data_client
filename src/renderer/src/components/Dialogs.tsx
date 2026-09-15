import { useEffect, useState } from 'react'
import type { ConnectionConfig, SslMode } from '@shared/types'
import { useAppStore } from '../store'
import { newId, quoteIdent, qualify } from '../lib/sql'
import { ImportCsvDialog } from './ImportCsvDialog'

const emptyConnection = (): ConnectionConfig => ({
  id: newId(),
  name: 'Local PostgreSQL',
  host: '127.0.0.1',
  port: 5432,
  user: 'postgres',
  password: '',
  database: 'postgres',
  ssl: 'disable',
  savePassword: true
})

export function Dialogs() {
  const store = useAppStore()
  return (
    <>
      {store.connectionDialog && <ConnectionDialog />}
      {store.databaseDialog && <CreateDatabaseDialog />}
      {store.schemaDialog && <CreateSchemaDialog />}
      {store.aboutDialog && <AboutDialog />}
      {store.confirm && <ConfirmDialog />}
      {store.importDialog && <ImportCsvDialog />}
    </>
  )
}

function ConnectionDialog() {
  const { editingConnection, closeDialogs, connect, loadConnections, setStatus } = useAppStore()
  const [form, setForm] = useState<ConnectionConfig>(editingConnection ?? emptyConnection())
  const [testing, setTesting] = useState('')
  const [error, setError] = useState('')

  const update = <K extends keyof ConnectionConfig>(key: K, value: ConnectionConfig[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const test = async () => {
    setError('')
    setTesting('Testing…')
    try {
      const version = await window.api.pg.test(form)
      setTesting(version)
    } catch (err) {
      setTesting('')
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const saveAndConnect = async () => {
    setError('')
    try {
      await window.api.connections.save(form)
      await loadConnections()
      await connect(form)
      closeDialogs()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('Connection failed', err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="overlay" onMouseDown={closeDialogs}>
      <div className="dialog" onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-head">
          <strong>{editingConnection ? 'Edit connection' : 'New PostgreSQL connection'}</strong>
        </div>
        <div className="dialog-body">
          <label className="field">
            Display name
            <input value={form.name} onChange={(e) => update('name', e.target.value)} />
          </label>
          <div className="grid-2">
            <label className="field">
              Host
              <input value={form.host} onChange={(e) => update('host', e.target.value)} />
            </label>
            <label className="field">
              Port
              <input
                type="number"
                value={form.port}
                onChange={(e) => update('port', Number(e.target.value) || 5432)}
              />
            </label>
          </div>
          <div className="grid-2">
            <label className="field">
              User
              <input value={form.user} onChange={(e) => update('user', e.target.value)} />
            </label>
            <label className="field">
              Password
              <input
                type="password"
                value={form.password ?? ''}
                onChange={(e) => update('password', e.target.value)}
              />
            </label>
          </div>
          <div className="grid-2">
            <label className="field">
              Database
              <input value={form.database} onChange={(e) => update('database', e.target.value)} />
            </label>
            <label className="field">
              SSL
              <select value={form.ssl} onChange={(e) => update('ssl', e.target.value as SslMode)}>
                <option value="disable">Disable</option>
                <option value="prefer">Prefer</option>
                <option value="require">Require</option>
              </select>
            </label>
          </div>
          <label className="tiny" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={form.savePassword}
              onChange={(e) => update('savePassword', e.target.checked)}
            />
            Save password in OS-encrypted local store
          </label>
          <label className="tiny" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={Boolean(form.sshEnabled)}
              onChange={(e) => update('sshEnabled', e.target.checked)}
            />
            Connect through SSH tunnel
          </label>
          {form.sshEnabled && (
            <>
              <div className="grid-2">
                <label className="field">
                  SSH host
                  <input value={form.sshHost ?? ''} onChange={(e) => update('sshHost', e.target.value)} />
                </label>
                <label className="field">
                  SSH port
                  <input
                    type="number"
                    value={form.sshPort ?? 22}
                    onChange={(e) => update('sshPort', Number(e.target.value) || 22)}
                  />
                </label>
              </div>
              <div className="grid-2">
                <label className="field">
                  SSH user
                  <input value={form.sshUser ?? ''} onChange={(e) => update('sshUser', e.target.value)} />
                </label>
                <label className="field">
                  SSH password
                  <input
                    type="password"
                    value={form.sshPassword ?? ''}
                    onChange={(e) => update('sshPassword', e.target.value)}
                  />
                </label>
              </div>
              <label className="field">
                SSH private key
                <textarea
                  rows={3}
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                  value={form.sshPrivateKey ?? ''}
                  onChange={(e) => update('sshPrivateKey', e.target.value)}
                />
              </label>
              <label className="field">
                Key passphrase
                <input
                  type="password"
                  value={form.sshPassphrase ?? ''}
                  onChange={(e) => update('sshPassphrase', e.target.value)}
                />
              </label>
            </>
          )}
          {testing && <div className="ok tiny">{testing}</div>}
          {error && <div className="error tiny">{error}</div>}
        </div>
        <div className="dialog-foot">
          <button className="btn-ghost" onClick={closeDialogs}>
            Cancel
          </button>
          <button className="btn" onClick={() => void test()}>
            Test
          </button>
          <button className="btn-primary" onClick={() => void saveAndConnect()}>
            Save & Connect
          </button>
        </div>
      </div>
    </div>
  )
}

function CreateDatabaseDialog() {
  const { closeDialogs, runSql, setStatus } = useAppStore()
  const [name, setName] = useState('')
  const [encoding, setEncoding] = useState('UTF8')
  const [error, setError] = useState('')

  const create = async () => {
    if (!name.trim()) return
    try {
      await runSql(`create database "${name.replace(/"/g, '""')}" with encoding '${encoding}';`)
      closeDialogs()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('Create database failed', err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="overlay" onMouseDown={closeDialogs}>
      <div className="dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <strong>Create database</strong>
        </div>
        <div className="dialog-body">
          <label className="field">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <label className="field">
            Encoding
            <select value={encoding} onChange={(e) => setEncoding(e.target.value)}>
              <option>UTF8</option>
              <option>SQL_ASCII</option>
              <option>LATIN1</option>
            </select>
          </label>
          {error && <div className="error tiny">{error}</div>}
        </div>
        <div className="dialog-foot">
          <button className="btn-ghost" onClick={closeDialogs}>
            Cancel
          </button>
          <button className="btn-primary" onClick={() => void create()}>
            Create
          </button>
        </div>
      </div>
    </div>
  )
}

function CreateSchemaDialog() {
  const { closeDialogs, runSql } = useAppStore()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const create = async () => {
    if (!name.trim()) return
    try {
      await runSql(`create schema "${name.replace(/"/g, '""')}";`)
      closeDialogs()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  return (
    <div className="overlay" onMouseDown={closeDialogs}>
      <div className="dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <strong>Create schema</strong>
        </div>
        <div className="dialog-body">
          <label className="field">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          {error && <div className="error tiny">{error}</div>}
        </div>
        <div className="dialog-foot">
          <button className="btn-ghost" onClick={closeDialogs}>
            Cancel
          </button>
          <button className="btn-primary" onClick={() => void create()}>
            Create
          </button>
        </div>
      </div>
    </div>
  )
}

function AboutDialog() {
  const closeDialogs = useAppStore((s) => s.closeDialogs)
  const appVersion = useAppStore((s) => s.appVersion)
  return (
    <div className="overlay" onMouseDown={closeDialogs}>
      <div className="dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <strong>About Data Client</strong>
        </div>
        <div className="dialog-body">
          <p>
            <strong>Data Client</strong> {appVersion}
          </p>
          <p className="muted">
            Windows PostgreSQL manager with visual tools for databases, schemas, tables, views, and data.
          </p>
          <p className="tiny muted">MIT License · AOS 2026 · This is a beta release.</p>
        </div>
        <div className="dialog-foot">
          <button className="btn-primary" onClick={closeDialogs}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function ConfirmDialog() {
  const confirm = useAppStore((s) => s.confirm)
  const closeDialogs = useAppStore((s) => s.closeDialogs)
  const [error, setError] = useState('')
  if (!confirm) return null
  return (
    <div className="overlay" onMouseDown={closeDialogs}>
      <div className="dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <strong>{confirm.title}</strong>
        </div>
        <div className="dialog-body">
          <div>{confirm.message}</div>
          {confirm.sql && <pre className="sql-preview" style={{ minHeight: 80 }}>{confirm.sql}</pre>}
          {error && <div className="error tiny">{error}</div>}
        </div>
        <div className="dialog-foot">
          <button className="btn-ghost" onClick={closeDialogs}>
            Cancel
          </button>
          <button
            className={confirm.danger ? 'btn-danger' : 'btn-primary'}
            onClick={async () => {
              try {
                await confirm.onConfirm()
                closeDialogs()
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err))
              }
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}

export function ContextMenu() {
  const menu = useAppStore((s) => s.contextMenu)
  const setContextMenu = useAppStore((s) => s.setContextMenu)
  const openTab = useAppStore((s) => s.openTab)
  const runSql = useAppStore((s) => s.runSql)
  const setConfirm = useAppStore((s) => s.setConfirm)
  const setDatabaseDialog = useAppStore((s) => s.setDatabaseDialog)
  const setSchemaDialog = useAppStore((s) => s.setSchemaDialog)
  const switchDatabase = useAppStore((s) => s.switchDatabase)
  const refreshTree = useAppStore((s) => s.refreshTree)
  const currentDatabase = useAppStore((s) => s.currentDatabase)
  const activeConnection = useAppStore((s) => s.activeConnection)
  const setImportDialog = useAppStore((s) => s.setImportDialog)

  useEffect(() => {
    const close = () => setContextMenu(undefined)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [setContextMenu])

  if (!menu) return null

  const objectName = menu.name ?? ''
  const objectSchema = menu.schema ?? ''

  const drop = (title: string, sql: string) => {
    setConfirm({
      title,
      message: 'This cannot be undone.',
      danger: true,
      sql,
      onConfirm: async () => {
        await runSql(sql)
      }
    })
  }

  return (
    <div className="menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
      {menu.kind === 'root' && (
        <>
          <button onClick={() => setDatabaseDialog(true)}>New database</button>
          <button onClick={() => setSchemaDialog(true)}>New schema</button>
          <button onClick={() => void refreshTree()}>Refresh</button>
        </>
      )}
      {menu.kind === 'database' && menu.name && (
        <>
          <button onClick={() => void switchDatabase(menu.name!)}>Open database</button>
          <button onClick={() => setSchemaDialog(true)}>New schema</button>
          {menu.name !== currentDatabase && (
            <button onClick={() => drop(`Drop database ${objectName}`, `drop database ${quoteIdent(objectName)};`)}>
              Drop database
            </button>
          )}
        </>
      )}
      {menu.kind === 'schema' && menu.schema && (
        <>
          <button onClick={() => openTab({ type: 'schema-tables', title: menu.schema!, schema: menu.schema, name: menu.schema })}>
            Open table list
          </button>
          <button onClick={() => openTab({ type: 'schema-overview', title: `${menu.schema} diagram`, schema: menu.schema, name: `${menu.schema}-diagram` })}>
            Visual overview
          </button>
          <button onClick={() => openTab({ type: 'schema-diff', title: 'Schema diff', schema: menu.schema, name: objectSchema })}>
            Schema diff
          </button>
          <button onClick={() => openTab({ type: 'table-design', title: 'New table', schema: menu.schema, name: '' })}>
            New table
          </button>
          <button onClick={() => openTab({ type: 'view-design', title: 'New view', schema: menu.schema, name: '' })}>
            New view
          </button>
          <button onClick={() => drop(`Drop schema ${objectSchema}`, `drop schema ${quoteIdent(objectSchema)} cascade;`)}>
            Drop schema
          </button>
        </>
      )}
      {menu.kind === 'table' && menu.schema && menu.name && (
        <>
          <button onClick={() => openTab({ type: 'data', title: `${menu.schema}.${menu.name}`, schema: menu.schema, name: menu.name })}>
            Browse data
          </button>
          <button onClick={() => openTab({ type: 'table-design', title: `Design ${menu.name}`, schema: menu.schema, name: menu.name })}>
            Visual designer
          </button>
          <button
            onClick={() =>
              openTab({
                type: 'query',
                title: menu.name!,
                sql: `select * from ${qualify(menu.schema!, menu.name!)} limit 100;`
              })
            }
          >
            Query table
          </button>
          <hr />
          <button onClick={() => drop(`Drop table ${objectName}`, `drop table ${qualify(objectSchema, objectName)};`)}>
            Drop table
          </button>
          <button onClick={() => setImportDialog({ schema: objectSchema, table: objectName })}>
            Import CSV
          </button>
        </>
      )}
      {menu.kind === 'view' && menu.schema && menu.name && (
        <>
          <button onClick={() => openTab({ type: 'data', title: `${menu.schema}.${menu.name}`, schema: menu.schema, name: menu.name })}>
            Browse data
          </button>
          <button onClick={() => openTab({ type: 'view-design', title: `View ${menu.name}`, schema: menu.schema, name: menu.name })}>
            Edit view
          </button>
          <button onClick={() => drop(`Drop view ${objectName}`, `drop view ${qualify(objectSchema, objectName)};`)}>
            Drop view
          </button>
        </>
      )}
      {(menu.kind === 'sequence' || menu.kind === 'function' || menu.kind === 'trigger' || menu.kind === 'type') &&
        menu.schema &&
        menu.name && (
          <button
            onClick={async () => {
              if (!activeConnection) return
              const sql = await window.api.pg.objectDefinition(
                activeConnection.id,
                menu.kind as 'sequence' | 'function' | 'trigger' | 'type',
                menu.schema!,
                menu.name!,
                menu.extra ?? ''
              )
              openTab({ type: 'query', title: menu.name!, sql })
            }}
          >
            Open definition
          </button>
        )}
    </div>
  )
}
