import { create } from 'zustand'
import type {
  ConnectionConfig,
  DatabaseInfo,
  QueryHistoryEntry,
  QueryResult,
  SchemaInfo,
  SchemaObjectInfo,
  ServerStatus,
  Snippet,
  TableInfo
} from '@shared/types'
import { newId } from './lib/sql'
import { loadSnippets, saveSnippets } from './lib/snippets'

export type TabType =
  | 'query'
  | 'data'
  | 'table-design'
  | 'view-design'
  | 'schema-overview'
  | 'schema-tables'
  | 'schema-diff'
export type ThemeName = 'dark' | 'midnight' | 'light'
export type Density = 'comfortable' | 'compact'

export interface Tab {
  id: string
  type: TabType
  title: string
  schema?: string
  name?: string
  sql?: string
  filter?: string
  extra?: string
}

export interface Session {
  connection: ConnectionConfig
  version: string
  currentDatabase: string
  databases: DatabaseInfo[]
  schemas: SchemaInfo[]
  tablesBySchema: Record<string, TableInfo[]>
  objectsBySchema: Record<string, SchemaObjectInfo[]>
  expanded: Record<string, boolean>
  tabs: Tab[]
  activeTabId?: string
  queryHistory: QueryHistoryEntry[]
  connectedAt: number
  serverStatus?: ServerStatus
  status: string
  error?: string
}

interface ContextMenuState {
  x: number
  y: number
  kind: 'database' | 'schema' | 'table' | 'view' | 'root' | 'sequence' | 'function' | 'trigger' | 'type'
  schema?: string
  name?: string
  extra?: string
}

interface AppState {
  connections: ConnectionConfig[]
  sessions: Session[]
  activeSessionId?: string
  activeConnection?: ConnectionConfig
  connected: boolean
  version: string
  currentDatabase: string
  databases: DatabaseInfo[]
  schemas: SchemaInfo[]
  tablesBySchema: Record<string, TableInfo[]>
  objectsBySchema: Record<string, SchemaObjectInfo[]>
  expanded: Record<string, boolean>
  tabs: Tab[]
  activeTabId?: string
  status: string
  error?: string
  busy: boolean
  connectionDialog: boolean
  editingConnection?: ConnectionConfig
  databaseDialog: boolean
  schemaDialog: boolean
  aboutDialog: boolean
  searchOpen: boolean
  importDialog?: { schema: string; table: string }
  appVersion: string
  sidebarVisible: boolean
  historyVisible: boolean
  statusBarVisible: boolean
  theme: ThemeName
  density: Density
  queryHistory: QueryHistoryEntry[]
  snippets: Snippet[]
  queryTimeoutMs: number
  connectedAt?: number
  serverStatus?: ServerStatus
  confirm?: { title: string; message: string; danger?: boolean; sql?: string; onConfirm: () => Promise<void> | void }
  contextMenu?: ContextMenuState
  loadConnections: () => Promise<void>
  loadAppVersion: () => Promise<void>
  openConnectionDialog: (connection?: ConnectionConfig) => void
  closeDialogs: () => void
  connect: (connection: ConnectionConfig, password?: string) => Promise<void>
  disconnect: (id?: string) => Promise<void>
  switchSession: (id: string) => void
  refreshTree: () => Promise<void>
  switchDatabase: (name: string) => Promise<void>
  toggleExpand: (key: string) => Promise<void>
  openTab: (tab: Omit<Tab, 'id'> & { id?: string }) => void
  closeTab: (id: string) => void
  setTabSql: (id: string, sql: string) => void
  runSql: (sql: string, timeoutMs?: number) => Promise<QueryResult[]>
  cancelQuery: () => Promise<void>
  setStatus: (status: string, error?: string) => void
  setContextMenu: (menu?: ContextMenuState) => void
  setConfirm: (confirm?: AppState['confirm']) => void
  setDatabaseDialog: (open: boolean) => void
  setSchemaDialog: (open: boolean) => void
  setAboutDialog: (open: boolean) => void
  setSearchOpen: (open: boolean) => void
  setImportDialog: (value?: { schema: string; table: string }) => void
  setQueryTimeoutMs: (ms: number) => void
  toggleSidebar: () => void
  toggleHistory: () => void
  toggleStatusBar: () => void
  setTheme: (theme: ThemeName) => void
  setDensity: (density: Density) => void
  addHistory: (entry: QueryHistoryEntry) => void
  clearHistory: () => void
  setServerStatus: (status?: ServerStatus) => void
  addSnippet: (name: string, sql: string) => void
  deleteSnippet: (id: string) => void
}

const APPEARANCE_KEY = 'data-client:appearance'

type AppearanceState = {
  sidebarVisible: boolean
  historyVisible: boolean
  statusBarVisible: boolean
  theme: ThemeName
  density: Density
}

function loadAppearance(): AppearanceState {
  try {
    const raw = localStorage.getItem(APPEARANCE_KEY)
    if (!raw) {
      return { sidebarVisible: true, historyVisible: true, statusBarVisible: true, theme: 'dark', density: 'comfortable' }
    }
    const parsed = JSON.parse(raw) as Partial<AppearanceState>
    return {
      sidebarVisible: parsed.sidebarVisible !== false,
      historyVisible: parsed.historyVisible !== false,
      statusBarVisible: parsed.statusBarVisible !== false,
      theme: parsed.theme === 'light' || parsed.theme === 'midnight' ? parsed.theme : 'dark',
      density: parsed.density === 'compact' ? 'compact' : 'comfortable'
    }
  } catch {
    return { sidebarVisible: true, historyVisible: true, statusBarVisible: true, theme: 'dark', density: 'comfortable' }
  }
}

function saveAppearance(state: AppearanceState): void {
  localStorage.setItem(APPEARANCE_KEY, JSON.stringify(state))
}

function isSchemaChanging(sql: string): boolean {
  return /^\s*(create|alter|drop|truncate|comment|grant|revoke|reindex|cluster|refresh)\b/im.test(sql)
}

function uiState(get: () => AppState): AppearanceState {
  return {
    sidebarVisible: get().sidebarVisible,
    historyVisible: get().historyVisible,
    statusBarVisible: get().statusBarVisible,
    theme: get().theme,
    density: get().density
  }
}

const emptyMirror = {
  connected: false,
  activeConnection: undefined as ConnectionConfig | undefined,
  version: '',
  currentDatabase: '',
  databases: [] as DatabaseInfo[],
  schemas: [] as SchemaInfo[],
  tablesBySchema: {} as Record<string, TableInfo[]>,
  objectsBySchema: {} as Record<string, SchemaObjectInfo[]>,
  expanded: {} as Record<string, boolean>,
  tabs: [] as Tab[],
  activeTabId: undefined as string | undefined,
  queryHistory: [] as QueryHistoryEntry[],
  connectedAt: undefined as number | undefined,
  serverStatus: undefined as ServerStatus | undefined,
  status: 'Disconnected',
  error: undefined as string | undefined
}

function mirror(session?: Session): typeof emptyMirror {
  if (!session) return { ...emptyMirror }
  return {
    connected: true,
    activeConnection: session.connection,
    version: session.version,
    currentDatabase: session.currentDatabase,
    databases: session.databases,
    schemas: session.schemas,
    tablesBySchema: session.tablesBySchema,
    objectsBySchema: session.objectsBySchema,
    expanded: session.expanded,
    tabs: session.tabs,
    activeTabId: session.activeTabId,
    queryHistory: session.queryHistory,
    connectedAt: session.connectedAt,
    serverStatus: session.serverStatus,
    status: session.status,
    error: session.error
  }
}

function nextColor(sessions: Session[]): string {
  const colors = ['#3b82f6', '#22c55e', '#eab308', '#f97316', '#ef4444', '#a855f7', '#14b8a6']
  return colors[sessions.length % colors.length]
}

export const useAppStore = create<AppState>((set, get) => {
  const patchActive = (patch: Partial<Session>) => {
    const id = get().activeSessionId
    if (!id) return
    const sessions = get().sessions.map((session) =>
      session.connection.id === id ? { ...session, ...patch } : session
    )
    const active = sessions.find((session) => session.connection.id === id)
    set({ sessions, ...mirror(active) })
  }

  return {
    connections: [],
    sessions: [],
    ...emptyMirror,
    busy: false,
    connectionDialog: false,
    databaseDialog: false,
    schemaDialog: false,
    aboutDialog: false,
    searchOpen: false,
    appVersion: '0.1.0-beta.1',
    snippets: loadSnippets(),
    queryTimeoutMs: 0,
    ...loadAppearance(),

    loadConnections: async () => {
      const connections = await window.api.connections.list()
      set({ connections })
    },
    loadAppVersion: async () => {
      try {
        const appVersion = await window.api.app.version()
        set({ appVersion })
      } catch {
        set({ appVersion: '0.1.0-beta.1' })
      }
    },
    openConnectionDialog: (connection) => set({ connectionDialog: true, editingConnection: connection }),
    closeDialogs: () =>
      set({
        connectionDialog: false,
        databaseDialog: false,
        schemaDialog: false,
        aboutDialog: false,
        searchOpen: false,
        importDialog: undefined,
        editingConnection: undefined,
        confirm: undefined
      }),
    connect: async (connection, password) => {
      set({ busy: true, error: undefined, status: 'Connecting…' })
      try {
        const color = connection.color || nextColor(get().sessions.filter((s) => s.connection.id !== connection.id))
        const config = { ...connection, password: password ?? connection.password ?? '', color }
        const version = await window.api.pg.connect(config)
        const currentDatabase = await window.api.pg.currentDatabase(config.id)
        const session: Session = {
          connection: config,
          version,
          currentDatabase,
          databases: [],
          schemas: [],
          tablesBySchema: {},
          objectsBySchema: {},
          expanded: { databases: true, schemas: true },
          tabs: [{ id: newId(), type: 'query', title: 'Query 1', sql: 'select now();' }],
          queryHistory: [],
          connectedAt: Date.now(),
          status: `Connected to ${currentDatabase}`
        }
        session.activeTabId = session.tabs[0]?.id
        const sessions = [...get().sessions.filter((item) => item.connection.id !== config.id), session]
        set({
          sessions,
          activeSessionId: config.id,
          busy: false,
          ...mirror(session)
        })
        await get().refreshTree()
      } catch (error) {
        set({ error: error instanceof Error ? error.message : String(error), status: 'Connection failed', busy: false })
        throw error
      }
    },
    disconnect: async (id) => {
      const target = id ?? get().activeSessionId
      if (!target) return
      await window.api.pg.disconnect(target)
      const sessions = get().sessions.filter((session) => session.connection.id !== target)
      const next = sessions.at(-1)
      set({
        sessions,
        activeSessionId: next?.connection.id,
        ...mirror(next)
      })
    },
    switchSession: (id) => {
      const session = get().sessions.find((item) => item.connection.id === id)
      if (!session) return
      set({ activeSessionId: id, ...mirror(session) })
    },
    refreshTree: async () => {
      const id = get().activeConnection?.id
      if (!id) return
      const [databases, schemas] = await Promise.all([
        window.api.pg.listDatabases(id),
        window.api.pg.listSchemas(id)
      ])
      const tablesBySchema: Record<string, TableInfo[]> = { ...get().tablesBySchema }
      const objectsBySchema: Record<string, SchemaObjectInfo[]> = { ...get().objectsBySchema }
      for (const schema of schemas) {
        if (get().expanded[`schema:${schema.name}`]) {
          tablesBySchema[schema.name] = await window.api.pg.listTables(id, schema.name)
          objectsBySchema[schema.name] = await window.api.pg.listSchemaObjects(id, schema.name)
        }
      }
      patchActive({ databases, schemas, tablesBySchema, objectsBySchema })
    },
    switchDatabase: async (name) => {
      const connection = get().activeConnection
      if (!connection) return
      set({ busy: true, status: `Opening ${name}…` })
      try {
        const version = await window.api.pg.switchDatabase(connection.id, name)
        patchActive({
          currentDatabase: name,
          version,
          connection: { ...connection, database: name },
          expanded: { databases: true, schemas: true },
          tablesBySchema: {},
          objectsBySchema: {},
          status: `Connected to ${name}`
        })
        await get().refreshTree()
      } catch (error) {
        patchActive({ error: error instanceof Error ? error.message : String(error) })
      } finally {
        set({ busy: false })
      }
    },
    toggleExpand: async (key) => {
      const expanded = { ...get().expanded, [key]: !get().expanded[key] }
      patchActive({ expanded })
      const id = get().activeConnection?.id
      if (!id || !expanded[key] || !key.startsWith('schema:')) return
      const schema = key.slice(7)
      const [tables, objects] = await Promise.all([
        window.api.pg.listTables(id, schema),
        window.api.pg.listSchemaObjects(id, schema)
      ])
      patchActive({
        tablesBySchema: { ...get().tablesBySchema, [schema]: tables },
        objectsBySchema: { ...get().objectsBySchema, [schema]: objects }
      })
    },
    openTab: (tab) => {
      const existing = get().tabs.find(
        (item) => item.type === tab.type && item.schema === tab.schema && item.name === tab.name && item.type !== 'query'
      )
      if (existing) {
        const tabs = get().tabs.map((item) =>
          item.id === existing.id
            ? { ...item, filter: tab.filter ?? item.filter, sql: tab.sql ?? item.sql, extra: tab.extra ?? item.extra }
            : item
        )
        patchActive({ tabs, activeTabId: existing.id })
        return
      }
      const id = tab.id ?? newId()
      patchActive({ tabs: [...get().tabs, { ...tab, id }], activeTabId: id })
    },
    closeTab: (id) => {
      const tabs = get().tabs.filter((tab) => tab.id !== id)
      const activeTabId = get().activeTabId === id ? tabs.at(-1)?.id : get().activeTabId
      patchActive({ tabs, activeTabId })
    },
    setTabSql: (id, sql) => {
      patchActive({
        tabs: get().tabs.map((tab) => (tab.id === id ? { ...tab, sql } : tab))
      })
    },
    runSql: async (sql, timeoutMs) => {
      const id = get().activeConnection?.id
      if (!id) throw new Error('Not connected')
      const trimmed = sql.trim()
      if (!trimmed || trimmed.startsWith('--')) {
        throw new Error('Nothing to execute')
      }
      set({ busy: true, error: undefined, status: 'Running…' })
      try {
        const results = await window.api.pg.query(id, sql, [], timeoutMs ?? get().queryTimeoutMs)
        const last = results[results.length - 1]
        patchActive({ status: `${last.command} · ${last.rowCount} rows · ${last.durationMs} ms`, error: undefined })
        if (isSchemaChanging(trimmed)) {
          await get().refreshTree()
        }
        return results
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        patchActive({ error: message, status: 'Query failed' })
        throw error
      } finally {
        set({ busy: false })
      }
    },
    cancelQuery: async () => {
      const id = get().activeConnection?.id
      if (!id) return
      await window.api.pg.cancel(id)
    },
    setStatus: (status, error) => patchActive({ status, error }),
    setContextMenu: (contextMenu) => set({ contextMenu }),
    setConfirm: (confirm) => set({ confirm }),
    setDatabaseDialog: (databaseDialog) => set({ databaseDialog }),
    setSchemaDialog: (schemaDialog) => set({ schemaDialog }),
    setAboutDialog: (aboutDialog) => set({ aboutDialog }),
    setSearchOpen: (searchOpen) => set({ searchOpen }),
    setImportDialog: (importDialog) => set({ importDialog }),
    setQueryTimeoutMs: (queryTimeoutMs) => set({ queryTimeoutMs }),
    toggleSidebar: () => {
      set({ sidebarVisible: !get().sidebarVisible })
      saveAppearance(uiState(get))
    },
    toggleHistory: () => {
      set({ historyVisible: !get().historyVisible })
      saveAppearance(uiState(get))
    },
    toggleStatusBar: () => {
      set({ statusBarVisible: !get().statusBarVisible })
      saveAppearance(uiState(get))
    },
    setTheme: (theme) => {
      set({ theme })
      saveAppearance(uiState(get))
    },
    setDensity: (density) => {
      set({ density })
      saveAppearance(uiState(get))
    },
    addHistory: (entry) => {
      const targetId = entry.connectionId ?? get().activeSessionId
      const sessions = get().sessions.map((session) =>
        session.connection.id === targetId
          ? { ...session, queryHistory: [...session.queryHistory, entry].slice(-300) }
          : session
      )
      const active = sessions.find((session) => session.connection.id === get().activeSessionId)
      set({ sessions, queryHistory: active?.queryHistory ?? get().queryHistory })
    },
    clearHistory: () => patchActive({ queryHistory: [] }),
    setServerStatus: (serverStatus) => patchActive({ serverStatus }),
    addSnippet: (name, sql) => {
      const snippets = [
        ...get().snippets.filter((item) => item.name !== name),
        { id: newId(), name, sql, updatedAt: new Date().toISOString() }
      ]
      saveSnippets(snippets)
      set({ snippets })
    },
    deleteSnippet: (id) => {
      const snippets = get().snippets.filter((item) => item.id !== id)
      saveSnippets(snippets)
      set({ snippets })
    }
  }
})
