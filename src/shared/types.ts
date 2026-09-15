export type SslMode = 'disable' | 'prefer' | 'require'

export interface ConnectionConfig {
  id: string
  name: string
  host: string
  port: number
  user: string
  password?: string
  database: string
  ssl: SslMode
  savePassword: boolean
  color?: string
  queryTimeoutMs?: number
  sshEnabled?: boolean
  sshHost?: string
  sshPort?: number
  sshUser?: string
  sshPassword?: string
  sshPrivateKey?: string
  sshPassphrase?: string
}

export interface QueryColumn {
  name: string
  dataTypeId: number
}

export interface QueryResult {
  command: string
  rowCount: number
  fields: QueryColumn[]
  rows: Record<string, unknown>[]
  durationMs: number
}

export interface QueryHistoryEntry {
  id: string
  sql: string
  durationMs: number
  ok: boolean
  error?: string
  at: string
  connectionId?: string
}

export interface ServerStatus {
  serverTime: string
  uptimeSec: number
  version: string
}

export interface DatabaseInfo {
  name: string
  owner: string
  encoding: string
  size: string
}

export interface SchemaInfo {
  name: string
  owner: string
  size: string
  tableCount: number
  viewCount: number
  sequenceCount?: number
  functionCount?: number
}

export type SchemaObjectKind = 'sequence' | 'function' | 'trigger' | 'type'

export interface SchemaObjectInfo {
  schema: string
  name: string
  kind: SchemaObjectKind
  extra: string
  identity: string
}

export interface TableInfo {
  schema: string
  name: string
  type: 'table' | 'view'
  typeLabel: string
  estimatedRows: number
  size: string
  created: string | null
  updated: string | null
  engine: string
  comment: string | null
}

export interface ColumnInfo {
  name: string
  dataType: string
  udtName: string
  maxLength: number | null
  numericPrecision: number | null
  numericScale: number | null
  nullable: boolean
  defaultValue: string | null
  isPrimaryKey: boolean
  isUnique: boolean
  identity: string | null
  comment: string | null
  ordinal: number
}

export interface IndexInfo {
  name: string
  unique: boolean
  primary: boolean
  method: string
  columns: string[]
  definition: string
}

export interface ForeignKeyInfo {
  name: string
  columns: string[]
  refSchema: string
  refTable: string
  refColumns: string[]
  onUpdate: string
  onDelete: string
}

export interface TableDetails {
  schema: string
  name: string
  columns: ColumnInfo[]
  indexes: IndexInfo[]
  foreignKeys: ForeignKeyInfo[]
  comment: string | null
}

export interface TableDataPage {
  columns: ColumnInfo[]
  fields: QueryColumn[]
  rows: Record<string, unknown>[]
  total: number
  page: number
  pageSize: number
  primaryKey: string[]
}

export interface ViewDetails {
  schema: string
  name: string
  definition: string
  columns: ColumnInfo[]
}

export interface DesignerColumn {
  id: string
  name: string
  type: string
  length: string
  nullable: boolean
  defaultValue: string
  primaryKey: boolean
  unique: boolean
  comment: string
}

export interface DesignerIndex {
  id: string
  name: string
  unique: boolean
  primary?: boolean
  method: string
  columns: string[]
}

export interface DesignerForeignKey {
  id: string
  name: string
  columns: string[]
  refSchema: string
  refTable: string
  refColumns: string[]
  onDelete: string
  onUpdate: string
}

export interface Snippet {
  id: string
  name: string
  sql: string
  updatedAt: string
}

export const SESSION_COLORS = ['#3b82f6', '#22c55e', '#eab308', '#f97316', '#ef4444', '#a855f7', '#14b8a6']

export const PG_TYPES = [
  'bigint',
  'bigserial',
  'boolean',
  'bytea',
  'char',
  'cidr',
  'date',
  'double precision',
  'inet',
  'integer',
  'interval',
  'json',
  'jsonb',
  'macaddr',
  'money',
  'numeric',
  'real',
  'serial',
  'smallint',
  'text',
  'time',
  'timestamp',
  'timestamptz',
  'uuid',
  'varchar',
  'xml'
] as const
