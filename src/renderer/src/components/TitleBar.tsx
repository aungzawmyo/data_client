import { Minus, Square, X } from 'lucide-react'
import { useAppStore } from '../store'

export function TitleBar() {
  const { currentDatabase, activeConnection, connected, sessions, activeSessionId, switchSession, disconnect } =
    useAppStore()
  return (
    <header className="titlebar">
      <div className="titlebar-left">
        <div className="brand">
          <span className="brand-mark" />
          Data Client
          <span className="tiny muted" style={{ marginLeft: 8, fontWeight: 500 }}>
            beta
          </span>
        </div>
      </div>
      <div className="titlebar-center">
        {sessions.length > 0 ? (
          <div className="session-pills">
            {sessions.map((session) => (
              <button
                key={session.connection.id}
                className={`session-pill ${session.connection.id === activeSessionId ? 'active' : ''}`}
                style={{ borderColor: session.connection.color || '#3b82f6' }}
                onClick={() => switchSession(session.connection.id)}
                title={`${session.connection.user}@${session.connection.host}/${session.currentDatabase}`}
              >
                <span className="session-dot" style={{ background: session.connection.color || '#3b82f6' }} />
                {session.connection.name}
                <span
                  className="session-close"
                  onClick={(event) => {
                    event.stopPropagation()
                    void disconnect(session.connection.id)
                  }}
                >
                  ×
                </span>
              </button>
            ))}
          </div>
        ) : (
          <span>PostgreSQL manager</span>
        )}
        {connected && (
          <span className="tiny muted">
            {activeConnection?.host}:{activeConnection?.port} / {currentDatabase}
            {activeConnection?.sshEnabled ? ' · SSH' : ''}
          </span>
        )}
      </div>
      <div className="titlebar-right">
        <button className="window-btn" onClick={() => window.api.window.minimize()}>
          <Minus size={14} />
        </button>
        <button className="window-btn" onClick={() => window.api.window.maximize()}>
          <Square size={12} />
        </button>
        <button className="window-btn close" onClick={() => window.api.window.close()}>
          <X size={14} />
        </button>
      </div>
    </header>
  )
}
