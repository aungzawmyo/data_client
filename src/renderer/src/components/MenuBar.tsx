import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useAppStore } from '../store'
import { emitAppCommand } from '../lib/commands'

type MenuId = 'file' | 'view' | 'appearance' | 'tools'

export function MenuBar() {
  const [open, setOpen] = useState<MenuId>()
  const {
    connected,
    schemas,
    sidebarVisible,
    historyVisible,
    statusBarVisible,
    theme,
    density,
    openConnectionDialog,
    openTab,
    disconnect,
    refreshTree,
    setDatabaseDialog,
    setSchemaDialog,
    setAboutDialog,
    setSearchOpen,
    toggleSidebar,
    toggleHistory,
    toggleStatusBar,
    setTheme,
    setDensity
  } = useAppStore()

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(undefined)
    const timer = window.setTimeout(() => window.addEventListener('click', close), 0)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('click', close)
    }
  }, [open])

  const schema = schemas[0]?.name ?? 'public'
  const run = (fn: () => void) => {
    fn()
    setOpen(undefined)
  }
  const needConnection = (fn: () => void) => {
    run(() => {
      if (!connected) {
        openConnectionDialog()
        return
      }
      fn()
    })
  }

  return (
    <nav className="menubar" onClick={(event) => event.stopPropagation()}>
      <Menu label="File" id="file" open={open} setOpen={setOpen}>
        <Item label="New connection" shortcut="Ctrl+Shift+N" onClick={() => run(() => openConnectionDialog())} />
        <Item
          label="New query"
          shortcut="Ctrl+N"
          disabled={!connected}
          onClick={() => needConnection(() => openTab({ type: 'query', title: 'Query', sql: '' }))}
        />
        <hr />
        <Item label="New database" disabled={!connected} onClick={() => needConnection(() => setDatabaseDialog(true))} />
        <Item label="New schema" disabled={!connected} onClick={() => needConnection(() => setSchemaDialog(true))} />
        <hr />
        <Item label="Disconnect" disabled={!connected} onClick={() => run(() => void disconnect())} />
        <hr />
        <Item
          label="Dump database…"
          disabled={!connected}
          onClick={() => needConnection(() => void useAppStore.getState().dumpDatabase())}
        />
        <Item
          label="Restore…"
          disabled={!connected}
          onClick={() => needConnection(() => void useAppStore.getState().restoreDatabase())}
        />
        <hr />
        <Item label="About Data Client" onClick={() => run(() => setAboutDialog(true))} />
        <Item label="Exit" shortcut="Alt+F4" onClick={() => run(() => void window.api.window.close())} />
      </Menu>
      <Menu label="View" id="view" open={open} setOpen={setOpen}>
        <Item
          label="Object explorer"
          checked={sidebarVisible}
          onClick={() => run(() => toggleSidebar())}
        />
        <Item
          label="History pane"
          checked={historyVisible}
          onClick={() => run(() => toggleHistory())}
        />
        <Item
          label="Status bar"
          checked={statusBarVisible}
          onClick={() => run(() => toggleStatusBar())}
        />
        <Item
          label="Search objects"
          shortcut="Ctrl+P"
          disabled={!connected}
          onClick={() => needConnection(() => setSearchOpen(true))}
        />
        <Item label="Refresh explorer" shortcut="Ctrl+R" disabled={!connected} onClick={() => run(() => void refreshTree())} />
        <hr />
        <Item label="Zoom in" shortcut="Ctrl++" onClick={() => run(() => emitAppCommand('zoom-in'))} />
        <Item label="Zoom out" shortcut="Ctrl+-" onClick={() => run(() => emitAppCommand('zoom-out'))} />
        <Item label="Reset zoom" shortcut="Ctrl+0" onClick={() => run(() => emitAppCommand('zoom-100'))} />
        <Item label="Fit schema" shortcut="Ctrl+1" onClick={() => run(() => emitAppCommand('fit-schema'))} />
      </Menu>
      <Menu label="Appearance" id="appearance" open={open} setOpen={setOpen}>
        <Item label="Dark" checked={theme === 'dark'} onClick={() => run(() => setTheme('dark'))} />
        <Item label="Midnight" checked={theme === 'midnight'} onClick={() => run(() => setTheme('midnight'))} />
        <Item label="Light" checked={theme === 'light'} onClick={() => run(() => setTheme('light'))} />
        <hr />
        <Item label="Comfortable" checked={density === 'comfortable'} onClick={() => run(() => setDensity('comfortable'))} />
        <Item label="Compact" checked={density === 'compact'} onClick={() => run(() => setDensity('compact'))} />
      </Menu>
      <Menu label="Tools" id="tools" open={open} setOpen={setOpen}>
        <Item
          label="SQL editor"
          disabled={!connected}
          onClick={() => needConnection(() => openTab({ type: 'query', title: 'Query', sql: '' }))}
        />
        <Item
          label="Table designer"
          disabled={!connected}
          onClick={() =>
            needConnection(() => openTab({ type: 'table-design', title: 'New table', schema, name: '' }))
          }
        />
        <Item
          label="View designer"
          disabled={!connected}
          onClick={() =>
            needConnection(() => openTab({ type: 'view-design', title: 'New view', schema, name: '' }))
          }
        />
        <Item
          label="Schema table list"
          disabled={!connected}
          onClick={() =>
            needConnection(() => openTab({ type: 'schema-tables', title: schema, schema, name: schema }))
          }
        />
        <Item
          label="Schema designer"
          disabled={!connected}
          onClick={() =>
            needConnection(() =>
              openTab({ type: 'schema-overview', title: `${schema} diagram`, schema, name: `${schema}-diagram` })
            )
          }
        />
        <Item
          label="Schema diff"
          disabled={!connected}
          onClick={() =>
            needConnection(() =>
              openTab({ type: 'schema-diff', title: 'Schema diff', schema, name: schemas[1]?.name ?? schema })
            )
          }
        />
        <Item
          label="Roles and grants"
          disabled={!connected}
          onClick={() => needConnection(() => openTab({ type: 'roles', title: 'Roles', name: 'roles' }))}
        />
        <hr />
        <Item label="Auto layout · vertical" onClick={() => run(() => emitAppCommand('layout-vertical'))} />
        <Item label="Auto layout · square" onClick={() => run(() => emitAppCommand('layout-square'))} />
        <Item label="Auto layout · advanced" onClick={() => run(() => emitAppCommand('layout-radial'))} />
      </Menu>
    </nav>
  )
}

function Menu({
  id,
  label,
  open,
  setOpen,
  children
}: {
  id: MenuId
  label: string
  open?: MenuId
  setOpen: (id?: MenuId) => void
  children: ReactNode
}) {
  return (
    <div
      className={`menu-root ${open === id ? 'open' : ''}`}
      onMouseEnter={() => {
        if (open) setOpen(id)
      }}
    >
      <button
        className="menu-trigger"
        onClick={() => setOpen(open === id ? undefined : id)}
      >
        {label}
      </button>
      {open === id && <div className="menu-dropdown">{children}</div>}
    </div>
  )
}

function Item({
  label,
  shortcut,
  disabled,
  checked,
  onClick
}: {
  label: string
  shortcut?: string
  disabled?: boolean
  checked?: boolean
  onClick: () => void
}) {
  return (
    <button
      className="menu-item"
      disabled={disabled}
      onClick={onClick}
    >
      <span className="menu-check">{checked ? '✓' : ''}</span>
      <span>{label}</span>
      {shortcut && <span className="menu-shortcut">{shortcut}</span>}
    </button>
  )
}
