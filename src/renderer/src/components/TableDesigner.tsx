import { useEffect, useMemo, useState } from 'react'
import type { DesignerColumn, DesignerForeignKey, DesignerIndex } from '@shared/types'
import { PG_TYPES } from '@shared/types'
import { useAppStore } from '../store'
import { buildAlterTableSql, buildCreateTableSql, newId } from '../lib/sql'

const emptyColumn = (): DesignerColumn => ({
  id: newId(),
  name: '',
  type: 'text',
  length: '',
  nullable: true,
  defaultValue: '',
  primaryKey: false,
  unique: false,
  comment: ''
})

export function TableDesigner({ schema, table }: { schema: string; table?: string }) {
  const { activeConnection, schemas, runSql, openTab } = useAppStore()
  const [targetSchema, setTargetSchema] = useState(schema)
  const [name, setName] = useState(table ?? '')
  const [columns, setColumns] = useState<DesignerColumn[]>([emptyColumn()])
  const [indexes, setIndexes] = useState<DesignerIndex[]>([])
  const [foreignKeys, setForeignKeys] = useState<DesignerForeignKey[]>([])
  const [original, setOriginal] = useState<DesignerColumn[]>([])
  const [originalIndexes, setOriginalIndexes] = useState<DesignerIndex[]>([])
  const [originalFks, setOriginalFks] = useState<DesignerForeignKey[]>([])
  const [comment, setComment] = useState('')
  const [section, setSection] = useState<'columns' | 'indexes' | 'fks'>('columns')
  const [error, setError] = useState('')
  const isNew = !table

  useEffect(() => {
    if (!activeConnection || !table) return
    void window.api.pg.tableDetails(activeConnection.id, schema, table).then((details) => {
      const mapped = details.columns.map((column) => ({
        id: newId(),
        name: column.name,
        type: column.udtName === 'int4' ? 'integer' : column.udtName === 'int8' ? 'bigint' : column.dataType.replace(/\(.*\)/, ''),
        length: column.maxLength ? String(column.maxLength) : column.numericPrecision
          ? `${column.numericPrecision}${column.numericScale ? `,${column.numericScale}` : ''}`
          : '',
        nullable: column.nullable,
        defaultValue: column.defaultValue ?? '',
        primaryKey: column.isPrimaryKey,
        unique: column.isUnique,
        comment: column.comment ?? ''
      }))
      const mappedIndexes: DesignerIndex[] = details.indexes.map((index) => ({
        id: newId(),
        name: index.name,
        unique: index.unique,
        primary: index.primary,
        method: index.method,
        columns: index.columns
      }))
      const mappedFks: DesignerForeignKey[] = details.foreignKeys.map((fk) => ({
        id: newId(),
        name: fk.name,
        columns: fk.columns,
        refSchema: fk.refSchema,
        refTable: fk.refTable,
        refColumns: fk.refColumns,
        onDelete: fk.onDelete,
        onUpdate: fk.onUpdate
      }))
      setName(details.name)
      setColumns(mapped)
      setIndexes(mappedIndexes)
      setForeignKeys(mappedFks)
      setOriginal(mapped)
      setOriginalIndexes(mappedIndexes)
      setOriginalFks(mappedFks)
      setComment(details.comment ?? '')
    })
  }, [activeConnection, schema, table])

  const sql = useMemo(() => {
    if (!name.trim()) return '-- Enter a table name'
    if (isNew) return buildCreateTableSql(targetSchema, name, columns, indexes, foreignKeys, comment)
    return buildAlterTableSql(targetSchema, table!, name, original, columns, originalIndexes, indexes, originalFks, foreignKeys)
  }, [comment, columns, foreignKeys, indexes, isNew, name, original, originalFks, originalIndexes, table, targetSchema])

  const apply = async () => {
    setError('')
    const trimmed = sql.trim()
    if (!trimmed || trimmed.startsWith('--')) {
      setError('Nothing to apply. Enter a table name and at least one column.')
      return
    }
    try {
      await runSql(sql)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const updateColumn = (id: string, patch: Partial<DesignerColumn>) => {
    setColumns((current) => current.map((column) => (column.id === id ? { ...column, ...patch } : column)))
  }

  return (
    <div className="designer">
      <div className="toolbar">
        <label className="field" style={{ minWidth: 140 }}>
          Schema
          <select value={targetSchema} onChange={(e) => setTargetSchema(e.target.value)}>
            {schemas.map((item) => (
              <option key={item.name}>{item.name}</option>
            ))}
          </select>
        </label>
        <label className="field" style={{ minWidth: 180 }}>
          Table
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="table_name" />
        </label>
        <button className="btn-primary" onClick={() => void apply()}>
          Apply to database
        </button>
        <button className="btn" onClick={() => openTab({ type: 'query', title: `SQL ${name || 'table'}`, sql })}>
          Open SQL
        </button>
        <button className="btn" onClick={() => setColumns([...columns, emptyColumn()])}>
          Add column
        </button>
      </div>
      {error && <div className="error tiny" style={{ padding: '6px 12px' }}>{error}</div>}
      <div className="designer-body">
        <div className="panel">
          <div className="section-tabs">
            <button className={section === 'columns' ? 'btn active' : 'btn'} onClick={() => setSection('columns')}>
              Columns
            </button>
            <button className={section === 'indexes' ? 'btn active' : 'btn'} onClick={() => setSection('indexes')}>
              Indexes
            </button>
            <button className={section === 'fks' ? 'btn active' : 'btn'} onClick={() => setSection('fks')}>
              Foreign keys
            </button>
          </div>
          {section === 'columns' && (
            <div className="grid-wrap">
              <table className="data-grid">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Length</th>
                    <th>PK</th>
                    <th>Nullable</th>
                    <th>Unique</th>
                    <th>Default</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {columns.map((column) => (
                    <tr key={column.id}>
                      <td>
                        <input value={column.name} onChange={(e) => updateColumn(column.id, { name: e.target.value })} />
                      </td>
                      <td>
                        <select value={column.type} onChange={(e) => updateColumn(column.id, { type: e.target.value })}>
                          {!PG_TYPES.includes(column.type as (typeof PG_TYPES)[number]) && (
                            <option value={column.type}>{column.type}</option>
                          )}
                          {PG_TYPES.map((type) => (
                            <option key={type}>{type}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          value={column.length}
                          placeholder="255 or 12,2"
                          onChange={(e) => updateColumn(column.id, { length: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={column.primaryKey}
                          onChange={(e) => updateColumn(column.id, { primaryKey: e.target.checked, nullable: e.target.checked ? false : column.nullable })}
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={column.nullable}
                          onChange={(e) => updateColumn(column.id, { nullable: e.target.checked })}
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={column.unique}
                          onChange={(e) => updateColumn(column.id, { unique: e.target.checked })}
                        />
                      </td>
                      <td>
                        <input
                          value={column.defaultValue}
                          onChange={(e) => updateColumn(column.id, { defaultValue: e.target.value })}
                        />
                      </td>
                      <td>
                        <button className="btn-ghost" onClick={() => setColumns(columns.filter((item) => item.id !== column.id))}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {section === 'indexes' && (
            <IndexEditor columns={columns} indexes={indexes} onChange={setIndexes} />
          )}
          {section === 'fks' && (
            <ForeignKeyEditor schema={targetSchema} columns={columns} foreignKeys={foreignKeys} onChange={setForeignKeys} />
          )}
        </div>
        <div className="designer-side">
          <div className="panel-head">
            <strong>Generated SQL</strong>
            <span className="badge">{isNew ? 'CREATE' : 'ALTER'}</span>
          </div>
          <pre className="sql-preview">{sql}</pre>
        </div>
      </div>
    </div>
  )
}

function IndexEditor({
  columns,
  indexes,
  onChange
}: {
  columns: DesignerColumn[]
  indexes: DesignerIndex[]
  onChange: (indexes: DesignerIndex[]) => void
}) {
  return (
    <div className="grid-wrap" style={{ padding: 12, display: 'grid', gap: 10 }}>
      <button
        className="btn"
        onClick={() =>
          onChange([
            ...indexes,
            { id: newId(), name: '', unique: false, method: 'btree', columns: [] }
          ])
        }
      >
        Add index
      </button>
      {indexes.map((index) => (
        <div key={index.id} className="connection-item" style={{ display: 'grid', gap: 8 }}>
          <div className="grid-3">
            <input
              className="input"
              placeholder="index name"
              value={index.name}
              onChange={(e) => onChange(indexes.map((item) => (item.id === index.id ? { ...item, name: e.target.value } : item)))}
            />
            <select
              className="input"
              value={index.method}
              onChange={(e) => onChange(indexes.map((item) => (item.id === index.id ? { ...item, method: e.target.value } : item)))}
            >
              <option>btree</option>
              <option>hash</option>
              <option>gin</option>
              <option>gist</option>
            </select>
            <label className="tiny">
              <input
                type="checkbox"
                checked={index.unique}
                onChange={(e) => onChange(indexes.map((item) => (item.id === index.id ? { ...item, unique: e.target.checked } : item)))}
              />{' '}
              Unique
            </label>
          </div>
          <select
            className="input"
            multiple
            value={index.columns}
            onChange={(e) =>
              onChange(
                indexes.map((item) =>
                  item.id === index.id ? { ...item, columns: [...e.target.selectedOptions].map((option) => option.value) } : item
                )
              )
            }
          >
            {columns.filter((column) => column.name).map((column) => (
              <option key={column.id}>{column.name}</option>
            ))}
          </select>
          <button className="btn-ghost" onClick={() => onChange(indexes.filter((item) => item.id !== index.id))}>
            Remove
          </button>
        </div>
      ))}
    </div>
  )
}

function ForeignKeyEditor({
  schema,
  columns,
  foreignKeys,
  onChange
}: {
  schema: string
  columns: DesignerColumn[]
  foreignKeys: DesignerForeignKey[]
  onChange: (foreignKeys: DesignerForeignKey[]) => void
}) {
  return (
    <div className="grid-wrap" style={{ padding: 12, display: 'grid', gap: 10 }}>
      <button
        className="btn"
        onClick={() =>
          onChange([
            ...foreignKeys,
            {
              id: newId(),
              name: '',
              columns: [],
              refSchema: schema,
              refTable: '',
              refColumns: [],
              onDelete: 'NO ACTION',
              onUpdate: 'NO ACTION'
            }
          ])
        }
      >
        Add foreign key
      </button>
      {foreignKeys.map((fk) => (
        <div key={fk.id} className="connection-item" style={{ display: 'grid', gap: 8 }}>
          <div className="grid-2">
            <input
              className="input"
              placeholder="constraint name"
              value={fk.name}
              onChange={(e) => onChange(foreignKeys.map((item) => (item.id === fk.id ? { ...item, name: e.target.value } : item)))}
            />
            <input
              className="input"
              placeholder="ref schema.table"
              value={`${fk.refSchema}.${fk.refTable}`}
              onChange={(e) => {
                const [refSchema, refTable] = e.target.value.split('.')
                onChange(
                  foreignKeys.map((item) =>
                    item.id === fk.id ? { ...item, refSchema: refSchema || schema, refTable: refTable || '' } : item
                  )
                )
              }}
            />
          </div>
          <div className="grid-2">
            <input
              className="input"
              placeholder="local columns, comma separated"
              value={fk.columns.join(',')}
              onChange={(e) =>
                onChange(
                  foreignKeys.map((item) =>
                    item.id === fk.id ? { ...item, columns: e.target.value.split(',').map((part) => part.trim()).filter(Boolean) } : item
                  )
                )
              }
            />
            <input
              className="input"
              placeholder="referenced columns"
              value={fk.refColumns.join(',')}
              onChange={(e) =>
                onChange(
                  foreignKeys.map((item) =>
                    item.id === fk.id
                      ? { ...item, refColumns: e.target.value.split(',').map((part) => part.trim()).filter(Boolean) }
                      : item
                  )
                )
              }
            />
          </div>
          <div className="grid-2">
            <select
              className="input"
              value={fk.onUpdate}
              onChange={(e) => onChange(foreignKeys.map((item) => (item.id === fk.id ? { ...item, onUpdate: e.target.value } : item)))}
            >
              <option>NO ACTION</option>
              <option>CASCADE</option>
              <option>SET NULL</option>
              <option>RESTRICT</option>
            </select>
            <select
              className="input"
              value={fk.onDelete}
              onChange={(e) => onChange(foreignKeys.map((item) => (item.id === fk.id ? { ...item, onDelete: e.target.value } : item)))}
            >
              <option>NO ACTION</option>
              <option>CASCADE</option>
              <option>SET NULL</option>
              <option>RESTRICT</option>
            </select>
          </div>
          <div className="tiny muted">Columns: {columns.map((c) => c.name).filter(Boolean).join(', ') || 'none yet'}</div>
          <button className="btn-ghost" onClick={() => onChange(foreignKeys.filter((item) => item.id !== fk.id))}>
            Remove
          </button>
        </div>
      ))}
    </div>
  )
}
