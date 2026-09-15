import { BrowserWindow } from 'electron'
import { Pool, types, type PoolClient } from 'pg'
import type {
  ColumnInfo,
  ConnectionConfig,
  DatabaseInfo,
  ForeignKeyInfo,
  IndexInfo,
  QueryHistoryEntry,
  QueryResult,
  SchemaInfo,
  SchemaObjectInfo,
  SslMode,
  TableDataPage,
  TableDetails,
  TableInfo,
  ViewDetails
} from '@shared/types'
import { openSshTunnel, type SshTunnel } from './ssh'

types.setTypeParser(types.builtins.INT8, (v) => v)
types.setTypeParser(types.builtins.NUMERIC, (v) => v)
types.setTypeParser(1700, (v) => v)

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

export function qualify(schema: string, name: string): string {
  return `${quoteIdent(schema)}.${quoteIdent(name)}`
}

function emitHistory(entry: QueryHistoryEntry): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('pg:history', entry)
  }
}

function sslOption(mode: SslMode): false | { rejectUnauthorized: boolean } {
  if (mode === 'disable') return false
  return { rejectUnauthorized: mode === 'require' }
}

function serialize(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (Buffer.isBuffer(value)) return `\\x${value.toString('hex')}`
  return value
}

function serializeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    out[key] = serialize(value)
  }
  return out
}

export class PostgresManager {
  private pools = new Map<string, Pool>()
  private configs = new Map<string, ConnectionConfig>()
  private tunnels = new Map<string, SshTunnel>()
  private running = new Map<string, { pid: number; client: PoolClient }>()
  private cancelReason = new Map<string, 'user' | 'timeout'>()

  async test(config: ConnectionConfig): Promise<string> {
    const resolved = await this.resolveTarget(config)
    const pool = this.createPool(config, resolved.host, resolved.port)
    try {
      const result = await pool.query('select version() as version')
      return String(result.rows[0]?.version ?? 'Connected')
    } finally {
      await pool.end()
      await resolved.close?.()
    }
  }

  async connect(config: ConnectionConfig): Promise<string> {
    await this.disconnect(config.id)
    const resolved = await this.resolveTarget(config)
    if (resolved.close) this.tunnels.set(config.id, { port: resolved.port, close: resolved.close })
    const pool = this.createPool(config, resolved.host, resolved.port)
    const client = await pool.connect()
    try {
      const result = await client.query('select current_database() as db, version() as version')
      this.pools.set(config.id, pool)
      this.configs.set(config.id, config)
      return String(result.rows[0]?.version ?? 'Connected')
    } catch (error) {
      await pool.end()
      await this.closeTunnel(config.id)
      throw error
    } finally {
      client.release()
    }
  }

  async disconnect(id: string): Promise<void> {
    this.running.delete(id)
    this.cancelReason.delete(id)
    const pool = this.pools.get(id)
    if (pool) {
      this.pools.delete(id)
      this.configs.delete(id)
      await pool.end().catch(() => undefined)
    }
    await this.closeTunnel(id)
  }

  async disconnectAll(): Promise<void> {
    await Promise.all([...this.pools.keys()].map((id) => this.disconnect(id)))
  }

  async switchDatabase(id: string, database: string): Promise<string> {
    const config = this.configs.get(id)
    if (!config) throw new Error('Not connected')
    return this.connect({ ...config, database })
  }

  async query(
    id: string,
    sql: string,
    params: unknown[] = [],
    silent = false,
    timeoutMs = 0
  ): Promise<QueryResult[]> {
    const pool = this.requirePool(id)
    const started = Date.now()
    const client = await pool.connect()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const pidResult = await client.query('select pg_backend_pid() as pid')
      const pid = Number(pidResult.rows[0]?.pid ?? 0)
      this.running.set(id, { pid, client })
      this.cancelReason.delete(id)
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          this.cancelReason.set(id, 'timeout')
          void this.cancel(id)
        }, timeoutMs)
      }
      const results: QueryResult[] = []
      const statements = splitStatements(sql)
      for (const statement of statements) {
        const result = params.length
          ? await client.query(statement, params)
          : await client.query(statement)
        results.push({
          command: result.command,
          rowCount: result.rowCount ?? result.rows.length,
          fields: (result.fields ?? []).map((field) => ({
            name: field.name,
            dataTypeId: field.dataTypeID
          })),
          rows: result.rows.map((row) => serializeRow(row as Record<string, unknown>)),
          durationMs: Date.now() - started
        })
      }
      if (results.length === 0) {
        results.push({
          command: 'EMPTY',
          rowCount: 0,
          fields: [],
          rows: [],
          durationMs: Date.now() - started
        })
      }
      if (!silent) {
        emitHistory({
          id: `${started}-${Math.random().toString(36).slice(2, 8)}`,
          sql: statements.join(';\n'),
          durationMs: Date.now() - started,
          ok: true,
          at: new Date().toISOString(),
          connectionId: id
        })
      }
      return results
    } catch (error) {
      const reason = this.cancelReason.get(id)
      const message =
        reason === 'timeout'
          ? `Query timed out after ${timeoutMs} ms`
          : reason === 'user'
            ? 'Query cancelled'
            : error instanceof Error
              ? error.message
              : String(error)
      if (!silent) {
        emitHistory({
          id: `${started}-${Math.random().toString(36).slice(2, 8)}`,
          sql,
          durationMs: Date.now() - started,
          ok: false,
          error: message,
          at: new Date().toISOString(),
          connectionId: id
        })
      }
      throw new Error(message)
    } finally {
      if (timer) clearTimeout(timer)
      this.running.delete(id)
      this.cancelReason.delete(id)
      client.release()
    }
  }

  async cancel(id: string): Promise<void> {
    const running = this.running.get(id)
    if (!running) return
    if (!this.cancelReason.has(id)) this.cancelReason.set(id, 'user')
    const pool = this.pools.get(id)
    if (!pool) return
    await pool.query('select pg_cancel_backend($1)', [running.pid]).catch(() => undefined)
  }

  async serverStatus(id: string): Promise<{ serverTime: string; uptimeSec: number; version: string }> {
    const result = await this.query(
      id,
      `select now() as "serverTime",
              extract(epoch from now() - pg_postmaster_start_time())::int as "uptimeSec",
              current_setting('server_version') as version`,
      [],
      true
    )
    const row = result[0].rows[0] ?? {}
    return {
      serverTime: String(row.serverTime ?? ''),
      uptimeSec: Number(row.uptimeSec ?? 0),
      version: String(row.version ?? '')
    }
  }

  async listDatabases(id: string): Promise<DatabaseInfo[]> {
    const result = await this.query(
      id,
      `select d.datname as name,
              pg_get_userbyid(d.datdba) as owner,
              pg_encoding_to_char(d.encoding) as encoding,
              pg_size_pretty(pg_database_size(d.datname)) as size
         from pg_database d
        where d.datistemplate = false
        order by d.datname`,
      [],
      true
    )
    return result[0].rows as unknown as DatabaseInfo[]
  }

  async listSchemas(id: string): Promise<SchemaInfo[]> {
    const result = await this.query(
      id,
      `select n.nspname as name,
              pg_get_userbyid(n.nspowner) as owner,
              coalesce(pg_size_pretty(coalesce(sum(pg_total_relation_size(c.oid)), 0)::bigint), '0 bytes') as size,
              count(*) filter (where c.relkind in ('r', 'p'))::int as "tableCount",
              count(*) filter (where c.relkind in ('v', 'm'))::int as "viewCount",
              count(*) filter (where c.relkind = 'S')::int as "sequenceCount"
         from pg_namespace n
         left join pg_class c
           on c.relnamespace = n.oid
          and c.relkind in ('r', 'p', 'v', 'm', 'S')
        where n.nspname not like 'pg\\_%' escape '\\'
          and n.nspname <> 'information_schema'
        group by n.nspname, n.nspowner
        order by n.nspname`,
      [],
      true
    )
    return result[0].rows.map((row) => ({
      name: String(row.name),
      owner: String(row.owner),
      size: String(row.size ?? '0 bytes'),
      tableCount: Number(row.tableCount ?? 0),
      viewCount: Number(row.viewCount ?? 0),
      sequenceCount: Number(row.sequenceCount ?? 0)
    }))
  }

  async listTables(id: string, schema: string): Promise<TableInfo[]> {
    const result = await this.query(
      id,
      `select n.nspname as schema,
              c.relname as name,
              case c.relkind when 'v' then 'view' when 'm' then 'view' else 'table' end as type,
              case c.relkind
                when 'r' then 'Table'
                when 'p' then 'Partitioned table'
                when 'v' then 'View'
                when 'm' then 'Materialized view'
                else 'Table'
              end as "typeLabel",
              coalesce(s.n_live_tup, c.reltuples, 0)::bigint as "estimatedRows",
              pg_size_pretty(pg_total_relation_size(c.oid)) as size,
              null as created,
              greatest(s.last_vacuum, s.last_autovacuum, s.last_analyze, s.last_autoanalyze) as updated,
              coalesce(am.amname, case c.relkind when 'v' then 'view' when 'm' then 'view' else 'heap' end) as engine,
              obj_description(c.oid) as comment
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         left join pg_am am on am.oid = c.relam
         left join pg_stat_all_tables s on s.relid = c.oid
        where n.nspname = $1
          and c.relkind in ('r', 'p', 'v', 'm')
        order by c.relkind, c.relname`,
      [schema],
      true
    )
    return result[0].rows.map((row) => ({
      schema: String(row.schema),
      name: String(row.name),
      type: row.type === 'view' ? 'view' : 'table',
      typeLabel: String(row.typeLabel ?? 'Table'),
      estimatedRows: Number(row.estimatedRows ?? 0),
      size: String(row.size ?? '0 bytes'),
      created: row.created == null ? null : String(row.created),
      updated: row.updated == null ? null : String(row.updated),
      engine: String(row.engine ?? 'heap'),
      comment: (row.comment as string | null) ?? null
    }))
  }

  async listViews(id: string, schema: string): Promise<TableInfo[]> {
    const tables = await this.listTables(id, schema)
    return tables.filter((item) => item.type === 'view')
  }

  async tableDetails(id: string, schema: string, table: string): Promise<TableDetails> {
    const columns = await this.listColumns(id, schema, table)
    const indexes = await this.listIndexes(id, schema, table)
    const foreignKeys = await this.listForeignKeys(id, schema, table)
    const commentResult = await this.query(
      id,
      `select obj_description(c.oid) as comment
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = $1 and c.relname = $2
        limit 1`,
      [schema, table],
      true
    )
    return {
      schema,
      name: table,
      columns,
      indexes,
      foreignKeys,
      comment: (commentResult[0].rows[0]?.comment as string | null) ?? null
    }
  }

  async listColumns(id: string, schema: string, table: string): Promise<ColumnInfo[]> {
    const result = await this.query(
      id,
      `select
          a.attname as name,
          format_type(a.atttypid, a.atttypmod) as "dataType",
          t.typname as "udtName",
          case
            when t.typname in ('varchar', 'bpchar', 'char') and a.atttypmod > 4
              then a.atttypmod - 4
            else null
          end as "maxLength",
          case
            when t.typname in ('numeric', 'decimal') and a.atttypmod > 0
              then ((a.atttypmod - 4) >> 16) & 65535
            else null
          end as "numericPrecision",
          case
            when t.typname in ('numeric', 'decimal') and a.atttypmod > 0
              then (a.atttypmod - 4) & 65535
            else null
          end as "numericScale",
          not a.attnotnull as nullable,
          pg_get_expr(ad.adbin, ad.adrelid) as "defaultValue",
          exists (
            select 1
              from pg_index i
             where i.indrelid = c.oid
               and i.indisprimary
               and a.attnum = any(i.indkey)
          ) as "isPrimaryKey",
          exists (
            select 1
              from pg_index i
             where i.indrelid = c.oid
               and i.indisunique
               and not i.indisprimary
               and i.indnkeyatts = 1
               and a.attnum = any(i.indkey)
          ) as "isUnique",
          case
            when a.attidentity = 'a' then 'always'
            when a.attidentity = 'd' then 'by default'
            else null
          end as identity,
          col_description(c.oid, a.attnum) as comment,
          a.attnum as ordinal
        from pg_attribute a
        join pg_class c on c.oid = a.attrelid
        join pg_namespace n on n.oid = c.relnamespace
        join pg_type t on t.oid = a.atttypid
        left join pg_attrdef ad on ad.adrelid = c.oid and ad.adnum = a.attnum
       where n.nspname = $1
         and c.relname = $2
         and a.attnum > 0
         and not a.attisdropped
       order by a.attnum`,
      [schema, table],
      true
    )

    return result[0].rows.map((row) => ({
      name: String(row.name),
      dataType: String(row.dataType),
      udtName: String(row.udtName),
      maxLength: row.maxLength == null ? null : Number(row.maxLength),
      numericPrecision: row.numericPrecision == null ? null : Number(row.numericPrecision),
      numericScale: row.numericScale == null ? null : Number(row.numericScale),
      nullable: Boolean(row.nullable),
      defaultValue: (row.defaultValue as string | null) ?? null,
      isPrimaryKey: Boolean(row.isPrimaryKey),
      isUnique: Boolean(row.isUnique),
      identity: (row.identity as string | null) ?? null,
      comment: (row.comment as string | null) ?? null,
      ordinal: Number(row.ordinal)
    }))
  }

  async listIndexes(id: string, schema: string, table: string): Promise<IndexInfo[]> {
    const result = await this.query(
      id,
      `select
          i.relname as name,
          ix.indisunique as unique,
          ix.indisprimary as primary,
          am.amname as method,
          pg_get_indexdef(ix.indexrelid) as definition,
          array(
            select att.attname
              from unnest(ix.indkey) with ordinality as k(attnum, ord)
              join pg_attribute att
                on att.attrelid = ix.indrelid and att.attnum = k.attnum
             order by k.ord
          ) as columns
        from pg_index ix
        join pg_class t on t.oid = ix.indrelid
        join pg_class i on i.oid = ix.indexrelid
        join pg_namespace n on n.oid = t.relnamespace
        join pg_am am on am.oid = i.relam
       where n.nspname = $1
         and t.relname = $2
       order by ix.indisprimary desc, i.relname`,
      [schema, table],
      true
    )

    return result[0].rows.map((row) => ({
      name: String(row.name),
      unique: Boolean(row.unique),
      primary: Boolean(row.primary),
      method: String(row.method),
      columns: Array.isArray(row.columns) ? (row.columns as string[]) : [],
      definition: String(row.definition)
    }))
  }

  async listForeignKeys(id: string, schema: string, table: string): Promise<ForeignKeyInfo[]> {
    const result = await this.query(
      id,
      `select
          con.conname as name,
          array(
            select att.attname
              from unnest(con.conkey) with ordinality as k(attnum, ord)
              join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum
             order by k.ord
          ) as columns,
          fn.nspname as "refSchema",
          ft.relname as "refTable",
          array(
            select att.attname
              from unnest(con.confkey) with ordinality as k(attnum, ord)
              join pg_attribute att on att.attrelid = con.confrelid and att.attnum = k.attnum
             order by k.ord
          ) as "refColumns",
          case con.confupdtype
            when 'a' then 'NO ACTION' when 'r' then 'RESTRICT'
            when 'c' then 'CASCADE' when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT'
            else 'NO ACTION'
          end as "onUpdate",
          case con.confdeltype
            when 'a' then 'NO ACTION' when 'r' then 'RESTRICT'
            when 'c' then 'CASCADE' when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT'
            else 'NO ACTION'
          end as "onDelete"
        from pg_constraint con
        join pg_class rel on rel.oid = con.conrelid
        join pg_namespace nsp on nsp.oid = rel.relnamespace
        join pg_class ft on ft.oid = con.confrelid
        join pg_namespace fn on fn.oid = ft.relnamespace
       where nsp.nspname = $1
         and rel.relname = $2
         and con.contype = 'f'
       order by con.conname`,
      [schema, table],
      true
    )

    return result[0].rows.map((row) => ({
      name: String(row.name),
      columns: Array.isArray(row.columns) ? (row.columns as string[]) : [],
      refSchema: String(row.refSchema),
      refTable: String(row.refTable),
      refColumns: Array.isArray(row.refColumns) ? (row.refColumns as string[]) : [],
      onUpdate: String(row.onUpdate),
      onDelete: String(row.onDelete)
    }))
  }

  async tableData(
    id: string,
    schema: string,
    table: string,
    page: number,
    pageSize: number,
    filterSql: string
  ): Promise<TableDataPage> {
    const columns = await this.listColumns(id, schema, table)
    const primaryKey = columns.filter((column) => column.isPrimaryKey).map((column) => column.name)
    const filter = filterSql.trim()
    if (/;|--|\/\*|\*\//.test(filter)) {
      throw new Error('Filter cannot contain comments or extra statements')
    }
    const where = filter ? ` where ${filter}` : ''
    const qualified = qualify(schema, table)
    const count = await this.query(id, `select count(*)::bigint as total from ${qualified}${where}`, [], true)
    const offset = Math.max(0, (page - 1) * pageSize)
    const data = await this.query(
      id,
      `select ctid::text as __ctid, * from ${qualified}${where} order by ctid limit ${Number(pageSize)} offset ${Number(offset)}`,
      [],
      true
    )
    return {
      columns,
      fields: data[0].fields.filter((field) => field.name !== '__ctid'),
      rows: data[0].rows,
      total: Number(count[0].rows[0]?.total ?? 0),
      page,
      pageSize,
      primaryKey
    }
  }

  async saveRow(
    id: string,
    schema: string,
    table: string,
    values: Record<string, unknown>,
    ctid?: string | null
  ): Promise<void> {
    const columns = Object.keys(values).filter((column) => column !== '__ctid')
    const qualified = qualify(schema, table)
    if (ctid) {
      if (!columns.length) return
      const assignments = columns.map((column, index) => `${quoteIdent(column)} = $${index + 1}`)
      await this.query(
        id,
        `update ${qualified} set ${assignments.join(', ')} where ctid = $` + (columns.length + 1) + '::tid',
        [...columns.map((column) => values[column]), ctid]
      )
      return
    }
    const insertColumns = columns.filter((column) => values[column] !== null && values[column] !== undefined && values[column] !== '')
    if (!insertColumns.length) {
      await this.query(id, `insert into ${qualified} default values`)
      return
    }
    const placeholders = insertColumns.map((_, index) => `$${index + 1}`)
    await this.query(
      id,
      `insert into ${qualified} (${insertColumns.map(quoteIdent).join(', ')}) values (${placeholders.join(', ')})`,
      insertColumns.map((column) => values[column])
    )
  }

  async deleteRows(id: string, schema: string, table: string, ctids: string[]): Promise<void> {
    if (ctids.length === 0) return
    const qualified = qualify(schema, table)
    const placeholders = ctids.map((_, index) => `$${index + 1}::tid`)
    await this.query(id, `delete from ${qualified} where ctid in (${placeholders.join(', ')})`, ctids)
  }

  async viewDetails(id: string, schema: string, name: string): Promise<ViewDetails> {
    const result = await this.query(
      id,
      `select pg_get_viewdef($1::regclass, true) as definition`,
      [qualify(schema, name)],
      true
    )
    const columns = await this.listColumns(id, schema, name)
    return {
      schema,
      name,
      definition: String(result[0].rows[0]?.definition ?? ''),
      columns
    }
  }

  async currentDatabase(id: string): Promise<string> {
    const result = await this.query(id, 'select current_database() as name', [], true)
    return String(result[0].rows[0]?.name ?? '')
  }

  async listSchemaObjects(id: string, schema: string): Promise<SchemaObjectInfo[]> {
    const [sequences, functions, triggers, types] = await Promise.all([
      this.query(
        id,
        `select n.nspname as schema, c.relname as name, 'sequence' as kind, '' as extra, '' as identity
           from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = $1 and c.relkind = 'S'
          order by c.relname`,
        [schema],
        true
      ),
      this.query(
        id,
        `select n.nspname as schema,
                p.proname as name,
                'function' as kind,
                pg_get_function_identity_arguments(p.oid) as extra,
                pg_get_function_identity_arguments(p.oid) as identity
           from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = $1
            and p.prokind in ('f', 'p', 'w')
          order by p.proname`,
        [schema],
        true
      ),
      this.query(
        id,
        `select n.nspname as schema,
                t.tgname as name,
                'trigger' as kind,
                c.relname as extra,
                c.relname as identity
           from pg_trigger t
           join pg_class c on c.oid = t.tgrelid
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = $1
            and not t.tgisinternal
          order by t.tgname`,
        [schema],
        true
      ),
      this.query(
        id,
        `select n.nspname as schema,
                t.typname as name,
                'type' as kind,
                case t.typtype when 'e' then 'enum' when 'c' then 'composite' when 'd' then 'domain' else 'type' end as extra,
                t.typname as identity
           from pg_type t
           join pg_namespace n on n.oid = t.typnamespace
          where n.nspname = $1
            and t.typtype in ('e', 'd', 'c')
            and not exists (
              select 1 from pg_class c
               where c.reltype = t.oid and c.relkind in ('r', 'v', 'm', 'S', 'p')
            )
          order by t.typname`,
        [schema],
        true
      )
    ])
    const mapRows = (rows: Record<string, unknown>[], kind: SchemaObjectInfo['kind']): SchemaObjectInfo[] =>
      rows.map((row) => ({
        schema: String(row.schema),
        name: String(row.name),
        kind,
        extra: String(row.extra ?? ''),
        identity: String(row.identity ?? row.extra ?? '')
      }))
    return [
      ...mapRows(sequences[0].rows, 'sequence'),
      ...mapRows(functions[0].rows, 'function'),
      ...mapRows(triggers[0].rows, 'trigger'),
      ...mapRows(types[0].rows, 'type')
    ]
  }

  async objectDefinition(
    id: string,
    kind: SchemaObjectInfo['kind'],
    schema: string,
    name: string,
    extra = ''
  ): Promise<string> {
    if (kind === 'function') {
      const result = await this.query(
        id,
        `select pg_get_functiondef(p.oid) as definition
           from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = $1
            and p.proname = $2
            and pg_get_function_identity_arguments(p.oid) = $3
          limit 1`,
        [schema, name, extra],
        true
      )
      return String(result[0].rows[0]?.definition ?? `-- function ${qualify(schema, name)}`)
    }
    if (kind === 'trigger') {
      const result = await this.query(
        id,
        `select pg_get_triggerdef(t.oid, true) as definition
           from pg_trigger t
           join pg_class c on c.oid = t.tgrelid
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = $1 and t.tgname = $2 and c.relname = $3
          limit 1`,
        [schema, name, extra],
        true
      )
      return String(result[0].rows[0]?.definition ?? `-- trigger ${name}`)
    }
    if (kind === 'sequence') {
      return `select * from ${qualify(schema, name)};`
    }
    const result = await this.query(
      id,
      `select format_type(t.oid, null) as definition
         from pg_type t
         join pg_namespace n on n.oid = t.typnamespace
        where n.nspname = $1 and t.typname = $2
        limit 1`,
      [schema, name],
      true
    )
    return `-- type ${qualify(schema, name)}\n-- ${String(result[0].rows[0]?.definition ?? '')}`
  }

  async importRows(
    id: string,
    schema: string,
    table: string,
    columns: string[],
    rows: unknown[][]
  ): Promise<number> {
    if (!columns.length || !rows.length) return 0
    const qualified = qualify(schema, table)
    const colSql = columns.map(quoteIdent).join(', ')
    let inserted = 0
    const batchSize = 50
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize)
      const values: unknown[] = []
      const tuples = batch.map((row, rowIndex) => {
        const placeholders = columns.map((_, colIndex) => {
          values.push(row[colIndex] ?? null)
          return `$${rowIndex * columns.length + colIndex + 1}`
        })
        return `(${placeholders.join(', ')})`
      })
      await this.query(
        id,
        `insert into ${qualified} (${colSql}) values ${tuples.join(', ')}`,
        values
      )
      inserted += batch.length
    }
    return inserted
  }

  private requirePool(id: string): Pool {
    const pool = this.pools.get(id)
    if (!pool) throw new Error('Not connected')
    return pool
  }

  private async resolveTarget(
    config: ConnectionConfig
  ): Promise<{ host: string; port: number; close?: () => Promise<void> }> {
    if (!config.sshEnabled || !config.sshHost) {
      return { host: config.host, port: config.port }
    }
    const tunnel = await openSshTunnel(config)
    return { host: '127.0.0.1', port: tunnel.port, close: tunnel.close }
  }

  private async closeTunnel(id: string): Promise<void> {
    const tunnel = this.tunnels.get(id)
    if (!tunnel) return
    this.tunnels.delete(id)
    await tunnel.close().catch(() => undefined)
  }

  private createPool(config: ConnectionConfig, host = config.host, port = config.port): Pool {
    return new Pool({
      host,
      port,
      user: config.user,
      password: config.password ?? '',
      database: config.database || 'postgres',
      ssl: sslOption(config.ssl),
      max: 8,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000
    })
  }
}

function splitStatements(sql: string): string[] {
  const statements: string[] = []
  let current = ''
  let dollar: string | null = null
  let quote: string | null = null
  let lineComment = false
  let blockComment = false

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i]
    const next = sql[i + 1]

    if (lineComment) {
      current += ch
      if (ch === '\n') lineComment = false
      continue
    }
    if (blockComment) {
      current += ch
      if (ch === '*' && next === '/') {
        current += next
        i += 1
        blockComment = false
      }
      continue
    }
    if (quote) {
      current += ch
      if (ch === quote && sql[i - 1] !== '\\') quote = null
      continue
    }
    if (dollar) {
      current += ch
      if (sql.slice(i).startsWith(dollar) && ch === '$') {
        const tag = sql.slice(i, i + dollar.length)
        if (tag === dollar) {
          current += dollar.slice(1)
          i += dollar.length - 1
          dollar = null
        }
      }
      continue
    }
    if (ch === '-' && next === '-') {
      current += ch
      lineComment = true
      continue
    }
    if (ch === '/' && next === '*') {
      current += ch
      blockComment = true
      continue
    }
    if (ch === "'" || ch === '"') {
      quote = ch
      current += ch
      continue
    }
    if (ch === '$') {
      const match = sql.slice(i).match(/^\$[A-Za-z0-9_]*\$/)
      if (match) {
        dollar = match[0]
        current += ch
        continue
      }
    }
    if (ch === ';') {
      const trimmed = current.trim()
      if (trimmed) statements.push(trimmed)
      current = ''
      continue
    }
    current += ch
  }

  const trimmed = current.trim()
  if (trimmed) statements.push(trimmed)
  return statements
}

export const postgres = new PostgresManager()
