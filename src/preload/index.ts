import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppPrefs,
  CatalogSchema,
  ConnectionConfig,
  DatabaseInfo,
  DumpResult,
  QueryResult,
  RoleGrant,
  RoleInfo,
  SchemaInfo,
  SchemaLayoutState,
  SchemaObjectInfo,
  TableDataPage,
  TableDetails,
  TableInfo,
  ViewDetails
} from '@shared/types'

const api = {
  app: {
    version: () => ipcRenderer.invoke('app:version') as Promise<string>
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize') as Promise<boolean>,
    close: () => ipcRenderer.invoke('window:close')
  },
  connections: {
    list: () => ipcRenderer.invoke('connections:list') as Promise<ConnectionConfig[]>,
    save: (config: ConnectionConfig) =>
      ipcRenderer.invoke('connections:save', config) as Promise<ConnectionConfig[]>,
    delete: (id: string) => ipcRenderer.invoke('connections:delete', id) as Promise<ConnectionConfig[]>
  },
  prefs: {
    load: () => ipcRenderer.invoke('prefs:load') as Promise<AppPrefs>,
    patch: (partial: Partial<AppPrefs>) => ipcRenderer.invoke('prefs:patch', partial) as Promise<AppPrefs>,
    getSchemaLayout: (key: string) =>
      ipcRenderer.invoke('prefs:getSchemaLayout', key) as Promise<SchemaLayoutState | null>,
    setSchemaLayout: (key: string, layout: SchemaLayoutState) =>
      ipcRenderer.invoke('prefs:setSchemaLayout', key, layout) as Promise<void>
  },
  pg: {
    test: (config: ConnectionConfig) => ipcRenderer.invoke('pg:test', config) as Promise<string>,
    connect: (config: ConnectionConfig) => ipcRenderer.invoke('pg:connect', config) as Promise<string>,
    disconnect: (id: string) => ipcRenderer.invoke('pg:disconnect', id) as Promise<void>,
    switchDatabase: (id: string, database: string) =>
      ipcRenderer.invoke('pg:switchDatabase', id, database) as Promise<string>,
    query: (id: string, sql: string, params: unknown[] = [], timeoutMs = 0) =>
      ipcRenderer.invoke('pg:query', id, sql, params, timeoutMs) as Promise<QueryResult[]>,
    cancel: (id: string) => ipcRenderer.invoke('pg:cancel', id) as Promise<void>,
    listDatabases: (id: string) => ipcRenderer.invoke('pg:listDatabases', id) as Promise<DatabaseInfo[]>,
    listSchemas: (id: string) => ipcRenderer.invoke('pg:listSchemas', id) as Promise<SchemaInfo[]>,
    listTables: (id: string, schema: string) =>
      ipcRenderer.invoke('pg:listTables', id, schema) as Promise<TableInfo[]>,
    tableDetails: (id: string, schema: string, table: string) =>
      ipcRenderer.invoke('pg:tableDetails', id, schema, table) as Promise<TableDetails>,
    tableData: (id: string, schema: string, table: string, page: number, pageSize: number, filterSql: string) =>
      ipcRenderer.invoke('pg:tableData', id, schema, table, page, pageSize, filterSql) as Promise<TableDataPage>,
    saveRow: (
      id: string,
      schema: string,
      table: string,
      values: Record<string, unknown>,
      ctid?: string | null
    ) => ipcRenderer.invoke('pg:saveRow', id, schema, table, values, ctid) as Promise<void>,
    deleteRows: (id: string, schema: string, table: string, ctids: string[]) =>
      ipcRenderer.invoke('pg:deleteRows', id, schema, table, ctids) as Promise<void>,
    viewDetails: (id: string, schema: string, name: string) =>
      ipcRenderer.invoke('pg:viewDetails', id, schema, name) as Promise<ViewDetails>,
    currentDatabase: (id: string) => ipcRenderer.invoke('pg:currentDatabase', id) as Promise<string>,
    serverStatus: (id: string) =>
      ipcRenderer.invoke('pg:serverStatus', id) as Promise<{ serverTime: string; uptimeSec: number; version: string }>,
    listSchemaObjects: (id: string, schema: string) =>
      ipcRenderer.invoke('pg:listSchemaObjects', id, schema) as Promise<SchemaObjectInfo[]>,
    objectDefinition: (id: string, kind: SchemaObjectInfo['kind'], schema: string, name: string, extra = '') =>
      ipcRenderer.invoke('pg:objectDefinition', id, kind, schema, name, extra) as Promise<string>,
    importRows: (id: string, schema: string, table: string, columns: string[], rows: unknown[][]) =>
      ipcRenderer.invoke('pg:importRows', id, schema, table, columns, rows) as Promise<number>,
    begin: (id: string) => ipcRenderer.invoke('pg:begin', id) as Promise<void>,
    commit: (id: string) => ipcRenderer.invoke('pg:commit', id) as Promise<void>,
    rollback: (id: string) => ipcRenderer.invoke('pg:rollback', id) as Promise<void>,
    txOpen: (id: string) => ipcRenderer.invoke('pg:txOpen', id) as Promise<boolean>,
    listRoles: (id: string) => ipcRenderer.invoke('pg:listRoles', id) as Promise<RoleInfo[]>,
    listRoleGrants: (id: string, role: string) =>
      ipcRenderer.invoke('pg:listRoleGrants', id, role) as Promise<RoleGrant[]>,
    catalogSchema: (id: string) => ipcRenderer.invoke('pg:catalogSchema', id) as Promise<CatalogSchema>,
    dump: (id: string) => ipcRenderer.invoke('pg:dump', id) as Promise<DumpResult>,
    restore: (id: string) => ipcRenderer.invoke('pg:restore', id) as Promise<DumpResult>,
    onHistory: (callback: (entry: import('@shared/types').QueryHistoryEntry) => void) => {
      const listener = (_event: unknown, entry: import('@shared/types').QueryHistoryEntry) => callback(entry)
      ipcRenderer.on('pg:history', listener)
      return () => ipcRenderer.removeListener('pg:history', listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)

export type DataClientApi = typeof api
