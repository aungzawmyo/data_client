import type { ColumnInfo, IndexInfo, TableDetails } from '@shared/types'
import { quoteIdent, qualify } from './sql'

function colType(column: ColumnInfo): string {
  return column.dataType
}

function createTableSql(details: TableDetails): string {
  const lines = details.columns.map((column) => {
    const parts = [`  ${quoteIdent(column.name)} ${colType(column)}`]
    if (!column.nullable) parts.push('not null')
    if (column.defaultValue) parts.push(`default ${column.defaultValue}`)
    return parts.join(' ')
  })
  const pk = details.columns.filter((column) => column.isPrimaryKey).map((column) => quoteIdent(column.name))
  if (pk.length) lines.push(`  primary key (${pk.join(', ')})`)
  const statements = [`create table ${qualify(details.schema, details.name)} (\n${lines.join(',\n')}\n);`]
  for (const index of details.indexes) {
    if (index.primary) continue
    statements.push(index.definition.endsWith(';') ? index.definition : `${index.definition};`)
  }
  for (const fk of details.foreignKeys) {
    statements.push(
      `alter table ${qualify(details.schema, details.name)} add constraint ${quoteIdent(fk.name)} ` +
        `foreign key (${fk.columns.map(quoteIdent).join(', ')}) ` +
        `references ${qualify(fk.refSchema, fk.refTable)} (${fk.refColumns.map(quoteIdent).join(', ')}) ` +
        `on update ${fk.onUpdate} on delete ${fk.onDelete};`
    )
  }
  return statements.join('\n')
}

function sameIndex(left: IndexInfo, right: IndexInfo): boolean {
  return left.definition.replace(/\s+/g, ' ') === right.definition.replace(/\s+/g, ' ')
}

export function diffSchemas(
  fromSchema: string,
  toSchema: string,
  fromTables: TableDetails[],
  toTables: TableDetails[]
): string {
  const fromMap = new Map(fromTables.map((table) => [table.name, table]))
  const toMap = new Map(toTables.map((table) => [table.name, table]))
  const statements: string[] = [
    `-- Schema diff: make ${quoteIdent(fromSchema)} match ${quoteIdent(toSchema)}`,
    `-- Generated ${new Date().toISOString()}`
  ]

  for (const [name, table] of toMap) {
    if (!fromMap.has(name)) {
      statements.push('', `-- create ${name}`, createTableSql({ ...table, schema: fromSchema }))
    }
  }

  for (const [name, fromTable] of fromMap) {
    if (!toMap.has(name)) {
      statements.push('', `-- drop extra table ${name}`, `drop table ${qualify(fromSchema, name)};`)
      continue
    }
    const toTable = toMap.get(name)!
    const fromCols = new Map(fromTable.columns.map((column) => [column.name, column]))
    const toCols = new Map(toTable.columns.map((column) => [column.name, column]))
    const target = qualify(fromSchema, name)

    for (const [colName, column] of toCols) {
      if (!fromCols.has(colName)) {
        const nullSql = column.nullable ? '' : ' not null'
        const defaultSql = column.defaultValue ? ` default ${column.defaultValue}` : ''
        statements.push(`alter table ${target} add column ${quoteIdent(colName)} ${colType(column)}${nullSql}${defaultSql};`)
      }
    }
    for (const [colName, fromCol] of fromCols) {
      if (!toCols.has(colName)) {
        statements.push(`alter table ${target} drop column ${quoteIdent(colName)};`)
        continue
      }
      const toCol = toCols.get(colName)!
      if (colType(fromCol) !== colType(toCol)) {
        statements.push(`alter table ${target} alter column ${quoteIdent(colName)} type ${colType(toCol)};`)
      }
      if (fromCol.nullable !== toCol.nullable) {
        statements.push(
          `alter table ${target} alter column ${quoteIdent(colName)} ${toCol.nullable ? 'drop not null' : 'set not null'};`
        )
      }
    }

    const fromIdx = new Map(fromTable.indexes.filter((index) => !index.primary).map((index) => [index.name, index]))
    const toIdx = new Map(toTable.indexes.filter((index) => !index.primary).map((index) => [index.name, index]))
    for (const [idxName, index] of toIdx) {
      if (!fromIdx.has(idxName) || !sameIndex(fromIdx.get(idxName)!, index)) {
        if (fromIdx.has(idxName)) statements.push(`drop index if exists ${qualify(fromSchema, idxName)};`)
        statements.push(index.definition.endsWith(';') ? index.definition : `${index.definition};`)
      }
    }
    for (const [idxName] of fromIdx) {
      if (!toIdx.has(idxName)) statements.push(`drop index if exists ${qualify(fromSchema, idxName)};`)
    }

    const fromFk = new Map(fromTable.foreignKeys.map((fk) => [fk.name, fk]))
    const toFk = new Map(toTable.foreignKeys.map((fk) => [fk.name, fk]))
    for (const [fkName, fk] of toFk) {
      if (!fromFk.has(fkName)) {
        statements.push(
          `alter table ${target} add constraint ${quoteIdent(fk.name)} foreign key (${fk.columns.map(quoteIdent).join(', ')}) ` +
            `references ${qualify(fk.refSchema === toSchema ? fromSchema : fk.refSchema, fk.refTable)} (${fk.refColumns.map(quoteIdent).join(', ')}) ` +
            `on update ${fk.onUpdate} on delete ${fk.onDelete};`
        )
      }
    }
    for (const [fkName] of fromFk) {
      if (!toFk.has(fkName)) statements.push(`alter table ${target} drop constraint if exists ${quoteIdent(fkName)};`)
    }
  }

  const sql = statements.filter((line, index) => !(index > 1 && line === '' && statements[index - 1] === '')).join('\n')
  return sql.includes('alter table') || sql.includes('create table') || sql.includes('drop table') || sql.includes('drop index')
    ? sql
    : `${sql}\n\n-- No differences found.`
}
