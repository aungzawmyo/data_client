import { app, BrowserWindow, ipcMain } from 'electron'
import type { ConnectionConfig, SchemaObjectInfo } from '@shared/types'
import { deleteConnection, listConnections, saveConnection } from './store'
import { postgres } from './postgres'

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(message)
  })
}

export function registerIpc(): void {
  ipcMain.handle('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })
  ipcMain.handle('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
    return win.isMaximized()
  })
  ipcMain.handle('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })
  ipcMain.handle('app:version', () => app.getVersion())

  ipcMain.handle('connections:list', () => listConnections())
  ipcMain.handle('connections:save', (_event, config: ConnectionConfig) => saveConnection(config))
  ipcMain.handle('connections:delete', (_event, id: string) => deleteConnection(id))

  ipcMain.handle('pg:test', (_event, config: ConnectionConfig) => wrap(() => postgres.test(config)))
  ipcMain.handle('pg:connect', (_event, config: ConnectionConfig) => wrap(() => postgres.connect(config)))
  ipcMain.handle('pg:disconnect', (_event, id: string) => wrap(() => postgres.disconnect(id)))
  ipcMain.handle('pg:switchDatabase', (_event, id: string, database: string) =>
    wrap(() => postgres.switchDatabase(id, database))
  )
  ipcMain.handle('pg:query', (_event, id: string, sql: string, params: unknown[] = [], timeoutMs = 0) =>
    wrap(() => postgres.query(id, sql, params, false, timeoutMs))
  )
  ipcMain.handle('pg:cancel', (_event, id: string) => wrap(() => postgres.cancel(id)))
  ipcMain.handle('pg:listDatabases', (_event, id: string) => wrap(() => postgres.listDatabases(id)))
  ipcMain.handle('pg:listSchemas', (_event, id: string) => wrap(() => postgres.listSchemas(id)))
  ipcMain.handle('pg:listTables', (_event, id: string, schema: string) =>
    wrap(() => postgres.listTables(id, schema))
  )
  ipcMain.handle('pg:tableDetails', (_event, id: string, schema: string, table: string) =>
    wrap(() => postgres.tableDetails(id, schema, table))
  )
  ipcMain.handle('pg:tableData', (_event, id: string, schema: string, table: string, page: number, pageSize: number, filterSql: string) =>
    wrap(() => postgres.tableData(id, schema, table, page, pageSize, filterSql))
  )
  ipcMain.handle(
    'pg:saveRow',
    (_event, id: string, schema: string, table: string, values: Record<string, unknown>, ctid?: string | null) =>
      wrap(() => postgres.saveRow(id, schema, table, values, ctid))
  )
  ipcMain.handle('pg:deleteRows', (_event, id: string, schema: string, table: string, ctids: string[]) =>
    wrap(() => postgres.deleteRows(id, schema, table, ctids))
  )
  ipcMain.handle('pg:viewDetails', (_event, id: string, schema: string, name: string) =>
    wrap(() => postgres.viewDetails(id, schema, name))
  )
  ipcMain.handle('pg:currentDatabase', (_event, id: string) => wrap(() => postgres.currentDatabase(id)))
  ipcMain.handle('pg:serverStatus', (_event, id: string) => wrap(() => postgres.serverStatus(id)))
  ipcMain.handle('pg:listSchemaObjects', (_event, id: string, schema: string) =>
    wrap(() => postgres.listSchemaObjects(id, schema))
  )
  ipcMain.handle(
    'pg:objectDefinition',
    (_event, id: string, kind: SchemaObjectInfo['kind'], schema: string, name: string, extra = '') =>
      wrap(() => postgres.objectDefinition(id, kind, schema, name, extra))
  )
  ipcMain.handle(
    'pg:importRows',
    (_event, id: string, schema: string, table: string, columns: string[], rows: unknown[][]) =>
      wrap(() => postgres.importRows(id, schema, table, columns, rows))
  )
}
