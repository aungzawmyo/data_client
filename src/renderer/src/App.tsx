import { useEffect } from 'react'
import { TitleBar } from './components/TitleBar'
import { MenuBar } from './components/MenuBar'
import { Sidebar } from './components/Sidebar'
import { Workspace } from './components/Workspace'
import { HistoryPane } from './components/HistoryPane'
import { StatusBar } from './components/StatusBar'
import { ContextMenu, Dialogs } from './components/Dialogs'
import { CommandPalette } from './components/CommandPalette'
import { useAppStore } from './store'

export default function App() {
  const loadConnections = useAppStore((s) => s.loadConnections)
  const loadAppVersion = useAppStore((s) => s.loadAppVersion)
  const loadPrefs = useAppStore((s) => s.loadPrefs)
  const addHistory = useAppStore((s) => s.addHistory)
  const sidebarVisible = useAppStore((s) => s.sidebarVisible)
  const historyVisible = useAppStore((s) => s.historyVisible)
  const statusBarVisible = useAppStore((s) => s.statusBarVisible)
  const theme = useAppStore((s) => s.theme)
  const density = useAppStore((s) => s.density)

  useEffect(() => {
    void loadConnections()
    void loadAppVersion()
    void loadPrefs()
  }, [loadConnections, loadAppVersion, loadPrefs])

  useEffect(() => {
    return window.api.pg.onHistory((entry) => addHistory(entry))
  }, [addHistory])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement)?.tagName)) return
      const store = useAppStore.getState()
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        store.openConnectionDialog()
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        if (store.connected) store.openTab({ type: 'query', title: 'Query', sql: '' })
        else store.openConnectionDialog()
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        if (store.connected) store.setSearchOpen(true)
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'r') {
        event.preventDefault()
        if (store.connected) void store.refreshTree()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div
      className="app"
      data-theme={theme}
      data-density={density}
      data-history={historyVisible ? 'true' : 'false'}
      data-statusbar={statusBarVisible ? 'true' : 'false'}
    >
      <TitleBar />
      <MenuBar />
      <div className={`workspace ${sidebarVisible ? '' : 'sidebar-hidden'}`}>
        {sidebarVisible && <Sidebar />}
        <Workspace />
      </div>
      {historyVisible && <HistoryPane />}
      {statusBarVisible && <StatusBar />}
      <Dialogs />
      <CommandPalette />
      <ContextMenu />
    </div>
  )
}
