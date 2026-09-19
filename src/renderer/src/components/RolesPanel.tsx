import { useEffect, useState } from 'react'
import type { RoleGrant, RoleInfo } from '@shared/types'
import { quoteIdent } from '../lib/sql'
import { useAppStore } from '../store'

export function RolesPanel() {
  const activeConnection = useAppStore((s) => s.activeConnection)
  const currentDatabase = useAppStore((s) => s.currentDatabase)
  const schemas = useAppStore((s) => s.schemas)
  const runSql = useAppStore((s) => s.runSql)
  const setStatus = useAppStore((s) => s.setStatus)
  const [roles, setRoles] = useState<RoleInfo[]>([])
  const [selected, setSelected] = useState<string>()
  const [grants, setGrants] = useState<RoleGrant[]>([])
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [canLogin, setCanLogin] = useState(true)
  const [privilege, setPrivilege] = useState('CONNECT')
  const [targetKind, setTargetKind] = useState<'database' | 'schema' | 'table'>('database')
  const [target, setTarget] = useState(currentDatabase)

  const load = async () => {
    if (!activeConnection) return
    try {
      const list = await window.api.pg.listRoles(activeConnection.id)
      setRoles(list)
      const next = selected && list.some((role) => role.name === selected) ? selected : list[0]?.name
      setSelected(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    void load()
  }, [activeConnection?.id])

  useEffect(() => {
    if (!activeConnection || !selected) return
    void window.api.pg.listRoleGrants(activeConnection.id, selected).then(setGrants).catch(() => setGrants([]))
  }, [activeConnection?.id, selected])

  const role = roles.find((item) => item.name === selected)

  const createRole = async () => {
    if (!name.trim()) return
    const ident = quoteIdent(name.trim())
    const sql = `create role ${ident} ${canLogin ? 'login' : 'nologin'}${
      password ? ` password '${password.replace(/'/g, "''")}'` : ''
    }`
    try {
      await runSql(sql)
      setName('')
      setPassword('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const dropRole = async () => {
    if (!selected) return
    try {
      await runSql(`drop role ${quoteIdent(selected)}`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const applyGrant = async (kind: 'grant' | 'revoke') => {
    if (!selected || !target.trim()) return
    const roleName = quoteIdent(selected)
    const sql =
      targetKind === 'database'
        ? `${kind} ${privilege} on database ${quoteIdent(target)} ${kind === 'grant' ? 'to' : 'from'} ${roleName}`
        : targetKind === 'schema'
          ? `${kind} ${privilege} on schema ${quoteIdent(target)} ${kind === 'grant' ? 'to' : 'from'} ${roleName}`
          : `${kind} ${privilege} on table ${target} ${kind === 'grant' ? 'to' : 'from'} ${roleName}`
    try {
      await runSql(sql)
      if (activeConnection) setGrants(await window.api.pg.listRoleGrants(activeConnection.id, selected))
      setStatus(`${kind} applied`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="panel">
      <div className="toolbar">
        <strong>Roles & grants</strong>
        <span className="tiny muted">{roles.length} roles in {currentDatabase}</span>
      </div>
      {error && <div className="error tiny" style={{ padding: '6px 12px' }}>{error}</div>}
      <div className="roles-layout">
        <aside className="roles-list">
          {roles.map((item) => (
            <button
              key={item.name}
              className={`palette-item ${selected === item.name ? 'active' : ''}`}
              onClick={() => setSelected(item.name)}
            >
              <span>{item.name}</span>
              <span className="badge">{item.canLogin ? 'login' : 'role'}</span>
            </button>
          ))}
        </aside>
        <div className="roles-detail">
          {role && (
            <div className="tiny muted" style={{ padding: '8px 10px' }}>
              {role.superuser ? 'superuser · ' : ''}
              {role.createDb ? 'createdb · ' : ''}
              {role.createRole ? 'createrole · ' : ''}
              {role.memberOf.length ? `member of ${role.memberOf.join(', ')}` : 'no role memberships'}
            </div>
          )}
          <div className="toolbar">
            <input className="input" placeholder="New role name" value={name} onChange={(e) => setName(e.target.value)} />
            <input
              className="input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <label className="tiny">
              <input type="checkbox" checked={canLogin} onChange={(e) => setCanLogin(e.target.checked)} /> Login
            </label>
            <button className="btn-primary" onClick={() => void createRole()}>
              Create
            </button>
            <button className="btn-danger" disabled={!selected} onClick={() => void dropRole()}>
              Drop
            </button>
          </div>
          <div className="toolbar">
            <select className="input" value={targetKind} onChange={(e) => setTargetKind(e.target.value as typeof targetKind)}>
              <option value="database">Database</option>
              <option value="schema">Schema</option>
              <option value="table">Table</option>
            </select>
            {targetKind === 'schema' ? (
              <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
                {schemas.map((schema) => (
                  <option key={schema.name} value={schema.name}>
                    {schema.name}
                  </option>
                ))}
              </select>
            ) : (
              <input className="input" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="target" />
            )}
            <select className="input" value={privilege} onChange={(e) => setPrivilege(e.target.value)}>
              <option>CONNECT</option>
              <option>CREATE</option>
              <option>USAGE</option>
              <option>SELECT</option>
              <option>INSERT</option>
              <option>UPDATE</option>
              <option>DELETE</option>
              <option>ALL</option>
            </select>
            <button className="btn" onClick={() => void applyGrant('grant')}>
              Grant
            </button>
            <button className="btn-ghost" onClick={() => void applyGrant('revoke')}>
              Revoke
            </button>
          </div>
          <div className="grid-wrap">
            <table className="data-grid">
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>Target</th>
                  <th>Privilege</th>
                </tr>
              </thead>
              <tbody>
                {grants.map((grant, index) => (
                  <tr key={`${grant.kind}-${grant.target}-${grant.privilege}-${index}`}>
                    <td>{grant.kind}</td>
                    <td>{grant.target}</td>
                    <td>{grant.privilege}</td>
                  </tr>
                ))}
                {!grants.length && (
                  <tr>
                    <td colSpan={3} className="muted">
                      No grants listed for this role
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
