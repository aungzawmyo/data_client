import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../store'

export function CommandPalette() {
  const {
    searchOpen,
    setSearchOpen,
    databases,
    schemas,
    tablesBySchema,
    objectsBySchema,
    openTab,
    switchDatabase,
    connected
  } = useAppStore()
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (!searchOpen) {
      setQuery('')
      setIndex(0)
    }
  }, [searchOpen])

  const items = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const hits: { id: string; label: string; hint: string; run: () => void }[] = []
    for (const database of databases) {
      hits.push({
        id: `db:${database.name}`,
        label: database.name,
        hint: `database · ${database.size}`,
        run: () => void switchDatabase(database.name)
      })
    }
    for (const schema of schemas) {
      hits.push({
        id: `schema:${schema.name}`,
        label: schema.name,
        hint: 'schema',
        run: () => openTab({ type: 'schema-tables', title: schema.name, schema: schema.name, name: schema.name })
      })
      for (const table of tablesBySchema[schema.name] ?? []) {
        hits.push({
          id: `${schema.name}.${table.name}`,
          label: `${schema.name}.${table.name}`,
          hint: table.typeLabel,
          run: () =>
            table.type === 'view'
              ? openTab({ type: 'view-design', title: `View ${table.name}`, schema: schema.name, name: table.name })
              : openTab({ type: 'data', title: `${schema.name}.${table.name}`, schema: schema.name, name: table.name })
        })
      }
      for (const object of objectsBySchema[schema.name] ?? []) {
        hits.push({
          id: `${object.kind}:${schema.name}.${object.name}:${object.extra}`,
          label: `${schema.name}.${object.name}`,
          hint: object.kind,
          run: () => {
            const id = useAppStore.getState().activeConnection?.id
            if (!id) return
            void window.api.pg
              .objectDefinition(id, object.kind, schema.name, object.name, object.extra)
              .then((sql) => openTab({ type: 'query', title: object.name, sql }))
          }
        })
      }
    }
    if (!needle) return hits.slice(0, 40)
    return hits.filter((item) => `${item.label} ${item.hint}`.toLowerCase().includes(needle)).slice(0, 40)
  }, [databases, objectsBySchema, openTab, query, schemas, switchDatabase, tablesBySchema])

  useEffect(() => {
    setIndex(0)
  }, [query])

  if (!searchOpen || !connected) return null

  const choose = (item = items[index]) => {
    if (!item) return
    item.run()
    setSearchOpen(false)
  }

  return (
    <div className="overlay" onMouseDown={() => setSearchOpen(false)}>
      <div className="dialog" style={{ width: 640 }} onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-body" style={{ padding: 10 }}>
          <input
            className="input"
            autoFocus
            placeholder="Search databases, schemas, tables, views, functions…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setIndex((value) => Math.min(items.length - 1, value + 1))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setIndex((value) => Math.max(0, value - 1))
              } else if (event.key === 'Enter') {
                event.preventDefault()
                choose()
              } else if (event.key === 'Escape') {
                setSearchOpen(false)
              }
            }}
          />
          <div className="search-list">
            {items.map((item, itemIndex) => (
              <button
                key={item.id}
                className={`search-item ${itemIndex === index ? 'active' : ''}`}
                onMouseEnter={() => setIndex(itemIndex)}
                onClick={() => choose(item)}
              >
                <span>{item.label}</span>
                <span className="muted tiny">{item.hint}</span>
              </button>
            ))}
            {!items.length && <div className="muted tiny" style={{ padding: 10 }}>No matches. Expand schemas in the explorer to index tables.</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
