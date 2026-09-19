import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { PostgreSQL, sql } from '@codemirror/lang-sql'
import { oneDark } from '@codemirror/theme-one-dark'
import type { CatalogSchema } from '@shared/types'

function toSqlSchema(catalog?: CatalogSchema): Record<string, Record<string, string[]> | string[]> {
  if (!catalog) return {}
  const schema: Record<string, Record<string, string[]>> = {}
  for (const name of catalog.schemas) schema[name] = {}
  for (const table of catalog.tables) {
    schema[table.schema] ??= {}
    schema[table.schema][table.name] = []
  }
  for (const column of catalog.columns) {
    schema[column.schema] ??= {}
    schema[column.schema][column.table] ??= []
    schema[column.schema][column.table].push(column.name)
  }
  const flat: Record<string, string[]> = {}
  for (const column of catalog.columns) {
    flat[column.table] ??= []
    if (!flat[column.table].includes(column.name)) flat[column.table].push(column.name)
  }
  return { ...flat, ...schema }
}

export function SqlEditor({
  value,
  onChange,
  catalog
}: {
  value: string
  onChange: (value: string) => void
  catalog?: CatalogSchema
}) {
  const schema = useMemo(() => toSqlSchema(catalog), [catalog])
  return (
    <div className="cm-wrap">
      <CodeMirror
        value={value}
        height="100%"
        theme={oneDark}
        extensions={[sql({ dialect: PostgreSQL, upperCaseKeywords: true, schema })]}
        onChange={onChange}
        basicSetup={{ autocompletion: true, foldGutter: true, highlightActiveLine: true }}
      />
    </div>
  )
}
