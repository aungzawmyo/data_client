import type { DesignerColumn, DesignerForeignKey, DesignerIndex } from '@shared/types'

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

export function qualify(schema: string, name: string): string {
  return `${quoteIdent(schema)}.${quoteIdent(name)}`
}

export function columnSqlType(column: DesignerColumn): string {
  const type = column.type.trim() || 'text'
  const length = column.length.trim()
  if (length && ['varchar', 'char', 'character varying', 'character', 'numeric', 'decimal'].includes(type)) {
    return `${type}(${length})`
  }
  return type
}

function columnLine(column: DesignerColumn): string {
  const parts = [quoteIdent(column.name), columnSqlType(column)]
  if (column.primaryKey) {
    parts.push('not null')
  } else if (!column.nullable) {
    parts.push('not null')
  }
  if (column.defaultValue.trim()) {
    parts.push(`default ${column.defaultValue.trim()}`)
  }
  return parts.join(' ')
}

export function buildCreateTableSql(
  schema: string,
  table: string,
  columns: DesignerColumn[],
  indexes: DesignerIndex[],
  foreignKeys: DesignerForeignKey[],
  comment = ''
): string {
  const lines = columns.filter((column) => column.name.trim()).map(columnLine)
  const pk = columns.filter((column) => column.primaryKey).map((column) => quoteIdent(column.name))
  if (pk.length) {
    lines.push(`constraint ${quoteIdent(`${table}_pkey`)} primary key (${pk.join(', ')})`)
  }
  for (const column of columns) {
    if (column.unique && column.name.trim() && !column.primaryKey) {
      lines.push(`constraint ${quoteIdent(`${table}_${column.name}_key`)} unique (${quoteIdent(column.name)})`)
    }
  }
  for (const fk of foreignKeys) {
    if (!fk.columns.length || !fk.refTable) continue
    const name = fk.name.trim() || `${table}_${fk.columns.join('_')}_fkey`
    lines.push(
      `constraint ${quoteIdent(name)} foreign key (${fk.columns.map(quoteIdent).join(', ')}) ` +
        `references ${qualify(fk.refSchema || schema, fk.refTable)} (${fk.refColumns.map(quoteIdent).join(', ')}) ` +
        `on update ${fk.onUpdate} on delete ${fk.onDelete}`
    )
  }

  const statements = [
    `create table ${qualify(schema, table)} (\n  ${lines.join(',\n  ')}\n);`
  ]

  for (const index of indexes) {
    if (!index.columns.length || index.name.trim().endsWith('_pkey')) continue
    const unique = index.unique ? ' unique' : ''
    const method = index.method ? ` using ${index.method}` : ''
    statements.push(
      `create${unique} index ${quoteIdent(index.name || `${table}_${index.columns.join('_')}_idx`)} ` +
        `on ${qualify(schema, table)}${method} (${index.columns.map(quoteIdent).join(', ')});`
    )
  }

  if (comment.trim()) {
    statements.push(`comment on table ${qualify(schema, table)} is ${literal(comment)};`)
  }
  for (const column of columns) {
    if (column.comment.trim()) {
      statements.push(
        `comment on column ${qualify(schema, table)}.${quoteIdent(column.name)} is ${literal(column.comment)};`
      )
    }
  }
  return statements.join('\n\n')
}

export function buildAlterTableSql(
  schema: string,
  originalName: string,
  table: string,
  original: DesignerColumn[],
  columns: DesignerColumn[],
  originalIndexes: DesignerIndex[],
  indexes: DesignerIndex[],
  originalFks: DesignerForeignKey[],
  foreignKeys: DesignerForeignKey[]
): string {
  const statements: string[] = []
  const target = qualify(schema, originalName)

  if (table !== originalName) {
    statements.push(`alter table ${target} rename to ${quoteIdent(table)};`)
  }
  const qualified = qualify(schema, table)
  const originalById = new Map(original.map((column) => [column.id, column]))
  const nextIds = new Set(columns.map((column) => column.id))

  for (const column of original) {
    if (!nextIds.has(column.id)) {
      statements.push(`alter table ${qualified} drop column ${quoteIdent(column.name)};`)
    }
  }
  for (const column of columns) {
    const prev = originalById.get(column.id)
    if (!prev) {
      statements.push(`alter table ${qualified} add column ${columnLine(column)};`)
      continue
    }
    if (prev.name !== column.name) {
      statements.push(
        `alter table ${qualified} rename column ${quoteIdent(prev.name)} to ${quoteIdent(column.name)};`
      )
    }
    if (columnSqlType(prev) !== columnSqlType(column)) {
      statements.push(
        `alter table ${qualified} alter column ${quoteIdent(column.name)} type ${columnSqlType(column)};`
      )
    }
    if (prev.nullable !== column.nullable) {
      statements.push(
        `alter table ${qualified} alter column ${quoteIdent(column.name)} ${column.nullable ? 'drop not null' : 'set not null'};`
      )
    }
    if (prev.defaultValue.trim() !== column.defaultValue.trim()) {
      statements.push(
        column.defaultValue.trim()
          ? `alter table ${qualified} alter column ${quoteIdent(column.name)} set default ${column.defaultValue.trim()};`
          : `alter table ${qualified} alter column ${quoteIdent(column.name)} drop default;`
      )
    }
  }

  const origPk = original.filter((column) => column.primaryKey).map((column) => column.name).join(',')
  const nextPk = columns.filter((column) => column.primaryKey).map((column) => column.name).join(',')
  if (origPk !== nextPk) {
    if (origPk) statements.push(`alter table ${qualified} drop constraint if exists ${quoteIdent(`${originalName}_pkey`)};`)
    if (nextPk) {
      statements.push(
        `alter table ${qualified} add constraint ${quoteIdent(`${table}_pkey`)} primary key (${columns
          .filter((column) => column.primaryKey)
          .map((column) => quoteIdent(column.name))
          .join(', ')});`
      )
    }
  }

  const origIndexNames = new Set(originalIndexes.map((index) => index.name))
  const nextIndexNames = new Set(indexes.map((index) => index.name))
  for (const index of originalIndexes) {
    if (!index.primary && !nextIndexNames.has(index.name)) {
      statements.push(`drop index if exists ${qualify(schema, index.name)};`)
    }
  }
  for (const index of indexes) {
    if (!index.primary && !origIndexNames.has(index.name) && index.columns.length) {
      const unique = index.unique ? ' unique' : ''
      statements.push(
        `create${unique} index ${quoteIdent(index.name)} on ${qualified} using ${index.method || 'btree'} (${index.columns.map(quoteIdent).join(', ')});`
      )
    }
  }

  const origFkNames = new Set(originalFks.map((fk) => fk.name))
  const nextFkNames = new Set(foreignKeys.map((fk) => fk.name))
  for (const fk of originalFks) {
    if (!nextFkNames.has(fk.name)) {
      statements.push(`alter table ${qualified} drop constraint if exists ${quoteIdent(fk.name)};`)
    }
  }
  for (const fk of foreignKeys) {
    if (!origFkNames.has(fk.name) && fk.columns.length && fk.refTable) {
      statements.push(
        `alter table ${qualified} add constraint ${quoteIdent(fk.name)} foreign key (${fk.columns.map(quoteIdent).join(', ')}) ` +
          `references ${qualify(fk.refSchema || schema, fk.refTable)} (${fk.refColumns.map(quoteIdent).join(', ')}) ` +
          `on update ${fk.onUpdate} on delete ${fk.onDelete};`
      )
    }
  }

  return statements.join('\n')
}

export function buildCreateViewSql(schema: string, name: string, definition: string, replace = true): string {
  const body = definition.trim().replace(/;+$/, '')
  return `${replace ? 'create or replace' : 'create'} view ${qualify(schema, name)} as\n${body};`
}

export function buildCreateSchemaSql(name: string, owner = ''): string {
  return owner.trim()
    ? `create schema ${quoteIdent(name)} authorization ${quoteIdent(owner)};`
    : `create schema ${quoteIdent(name)};`
}

export function buildCreateDatabaseSql(name: string, encoding = 'UTF8'): string {
  return `create database ${quoteIdent(name)} with encoding ${literal(encoding)};`
}

export function literal(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

export function newId(): string {
  return crypto.randomUUID()
}
