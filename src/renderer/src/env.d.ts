/// <reference types="vite/client" />

import type {
  ConnectionConfig,
  DatabaseInfo,
  QueryResult,
  SchemaInfo,
  SchemaObjectInfo,
  TableDataPage,
  TableDetails,
  TableInfo,
  ViewDetails
} from '@shared/types'

declare global {
  interface Window {
    api: {
      app: {
        version: () => Promise<string>
      }
      window: {
        minimize: () => Promise<void>
        maximize: () => Promise<boolean>
        close: () => Promise<void>
      }
      connections: {
        list: () => Promise<ConnectionConfig[]>
        save: (config: ConnectionConfig) => Promise<ConnectionConfig[]>
        delete: (id: string) => Promise<ConnectionConfig[]>
      }
      pg: {
        test: (config: ConnectionConfig) => Promise<string>
        connect: (config: ConnectionConfig) => Promise<string>
        disconnect: (id: string) => Promise<void>
        switchDatabase: (id: string, database: string) => Promise<string>
        query: (id: string, sql: string, params?: unknown[], timeoutMs?: number) => Promise<QueryResult[]>
        cancel: (id: string) => Promise<void>
        listDatabases: (id: string) => Promise<DatabaseInfo[]>
        listSchemas: (id: string) => Promise<SchemaInfo[]>
        listTables: (id: string, schema: string) => Promise<TableInfo[]>
        tableDetails: (id: string, schema: string, table: string) => Promise<TableDetails>
        tableData: (
          id: string,
          schema: string,
          table: string,
          page: number,
          pageSize: number,
          filterSql: string
        ) => Promise<TableDataPage>
        saveRow: (
          id: string,
          schema: string,
          table: string,
          values: Record<string, unknown>,
          ctid?: string | null
        ) => Promise<void>
        deleteRows: (id: string, schema: string, table: string, ctids: string[]) => Promise<void>
        viewDetails: (id: string, schema: string, name: string) => Promise<ViewDetails>
        currentDatabase: (id: string) => Promise<string>
        serverStatus: (id: string) => Promise<{ serverTime: string; uptimeSec: number; version: string }>
        listSchemaObjects: (id: string, schema: string) => Promise<SchemaObjectInfo[]>
        objectDefinition: (
          id: string,
          kind: SchemaObjectInfo['kind'],
          schema: string,
          name: string,
          extra?: string
        ) => Promise<string>
        importRows: (
          id: string,
          schema: string,
          table: string,
          columns: string[],
          rows: unknown[][]
        ) => Promise<number>
        onHistory: (callback: (entry: import('@shared/types').QueryHistoryEntry) => void) => () => void
      }
    }
  }
}

export {}
