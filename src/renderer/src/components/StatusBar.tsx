import { useEffect, useState } from 'react'
import { useAppStore } from '../store'

export function StatusBar() {
  const connected = useAppStore((s) => s.connected)
  const busy = useAppStore((s) => s.busy)
  const status = useAppStore((s) => s.status)
  const error = useAppStore((s) => s.error)
  const version = useAppStore((s) => s.version)
  const currentDatabase = useAppStore((s) => s.currentDatabase)
  const connectedAt = useAppStore((s) => s.connectedAt)
  const serverStatus = useAppStore((s) => s.serverStatus)
  const activeConnection = useAppStore((s) => s.activeConnection)
  const setServerStatus = useAppStore((s) => s.setServerStatus)
  const [, setTick] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!connected || !activeConnection) {
      setServerStatus(undefined)
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const next = await window.api.pg.serverStatus(activeConnection.id)
        if (!cancelled) setServerStatus(next)
      } catch {
        if (!cancelled) setServerStatus(undefined)
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), 10000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [activeConnection, connected, setServerStatus])

  const connectedFor = connectedAt ? formatHours(Date.now() - connectedAt) : '—'
  const uptime = serverStatus ? formatHours(serverStatus.uptimeSec * 1000) : '—'
  const serverTime = serverStatus?.serverTime ? new Date(serverStatus.serverTime).toLocaleTimeString() : '—'
  const pgVersion = (serverStatus?.version || version.split(' on ')[0] || 'PostgreSQL').replace(/^PostgreSQL /, '')

  return (
    <footer className="status">
      <span className="status-cluster">
        <span className={`dot ${connected ? 'on' : ''}`} />
        <span>{busy ? 'Running' : connected ? 'Idle' : 'Disconnected'}</span>
        {error ? <span className="error">{error}</span> : <span className="muted">{status}</span>}
      </span>
      <span className="status-cluster">
        <span>Connected: {connected ? connectedFor : '—'}</span>
        <span>PostgreSQL {pgVersion}</span>
        <span>Uptime: {uptime}</span>
        <span>Server time: {serverTime}</span>
        <span>{currentDatabase || 'No database'}</span>
      </span>
    </footer>
  )
}

function formatHours(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} h`
}
