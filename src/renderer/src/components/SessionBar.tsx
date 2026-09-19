import { useAppStore } from '../store'

export function SessionBar() {
  const connected = useAppStore((s) => s.connected)
  const activeConnection = useAppStore((s) => s.activeConnection)
  const inTransaction = useAppStore((s) => s.inTransaction)
  const beginTransaction = useAppStore((s) => s.beginTransaction)
  const commitTransaction = useAppStore((s) => s.commitTransaction)
  const rollbackTransaction = useAppStore((s) => s.rollbackTransaction)
  const setStatus = useAppStore((s) => s.setStatus)

  if (!connected || !activeConnection) return null

  const production = activeConnection.environment === 'production'
  const guarded = production || activeConnection.safeMode === true

  return (
    <div className={`session-bar ${production ? 'production' : ''} ${inTransaction ? 'in-tx' : ''}`}>
      <div className="session-bar-left">
        {production && <span className="prod-badge">PRODUCTION</span>}
        {guarded && !production && <span className="guard-badge">Safe mode</span>}
        <span className="tiny muted">
          {inTransaction ? 'Transaction open — edits stay uncommitted until Commit' : 'Autocommit'}
        </span>
      </div>
      <div className="session-bar-right">
        <button
          className="btn"
          disabled={inTransaction}
          onClick={() => void beginTransaction().catch((error) => setStatus('Begin failed', String(error)))}
        >
          Begin
        </button>
        <button
          className="btn-primary"
          disabled={!inTransaction}
          onClick={() => void commitTransaction().catch((error) => setStatus('Commit failed', String(error)))}
        >
          Commit
        </button>
        <button
          className="btn-danger"
          disabled={!inTransaction}
          onClick={() => void rollbackTransaction().catch((error) => setStatus('Rollback failed', String(error)))}
        >
          Rollback
        </button>
      </div>
    </div>
  )
}
