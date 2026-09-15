import { useEffect, useRef, useState } from 'react'
import { BookmarkPlus, Copy, Eraser, Play, Trash2 } from 'lucide-react'
import { useAppStore } from '../store'

export function HistoryPane() {
  const queryHistory = useAppStore((s) => s.queryHistory)
  const clearHistory = useAppStore((s) => s.clearHistory)
  const openTab = useAppStore((s) => s.openTab)
  const snippets = useAppStore((s) => s.snippets)
  const addSnippet = useAppStore((s) => s.addSnippet)
  const deleteSnippet = useAppStore((s) => s.deleteSnippet)
  const [selected, setSelected] = useState<string>()
  const [tab, setTab] = useState<'history' | 'snippets'>('history')
  const [snippetName, setSnippetName] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [queryHistory.length])

  const current = queryHistory.find((entry) => entry.id === selected) ?? queryHistory.at(-1)

  return (
    <section className="history-pane">
      <div className="history-tools">
        <button className={tab === 'history' ? 'btn active' : 'btn'} onClick={() => setTab('history')}>
          History
        </button>
        <button className={tab === 'snippets' ? 'btn active' : 'btn'} onClick={() => setTab('snippets')}>
          Snippets
        </button>
        {tab === 'history' ? (
          <>
            <span className="muted tiny">{queryHistory.length} statements</span>
            <button
              className="btn"
              disabled={!current}
              onClick={() => current && openTab({ type: 'query', title: 'History', sql: current.sql })}
            >
              <Play size={12} /> Open
            </button>
            <button
              className="btn"
              disabled={!current}
              onClick={() => current && void navigator.clipboard.writeText(current.sql)}
            >
              <Copy size={12} /> Copy
            </button>
            <button
              className="btn"
              disabled={!current}
              onClick={() => {
                if (!current) return
                addSnippet(snippetName.trim() || compactSql(current.sql).slice(0, 40), current.sql)
                setSnippetName('')
                setTab('snippets')
              }}
            >
              <BookmarkPlus size={12} /> Save snippet
            </button>
            <button className="btn-ghost" onClick={() => clearHistory()}>
              <Eraser size={12} /> Clear
            </button>
          </>
        ) : (
          <span className="muted tiny">{snippets.length} saved</span>
        )}
      </div>
      {tab === 'history' ? (
        <div className="history-list" ref={listRef}>
          {queryHistory.map((entry) => (
            <button
              key={entry.id}
              className={`history-row ${entry.ok ? '' : 'failed'} ${selected === entry.id ? 'active' : ''}`}
              onClick={() => setSelected(entry.id)}
              onDoubleClick={() => openTab({ type: 'query', title: 'History', sql: entry.sql })}
              title={entry.error ?? entry.sql}
            >
              <span className="history-sql">{compactSql(entry.sql)}</span>
              <span className="history-meta">
                {entry.ok ? `${entry.durationMs} ms` : 'error'} · {new Date(entry.at).toLocaleTimeString()}
              </span>
            </button>
          ))}
          {!queryHistory.length && <div className="muted tiny" style={{ padding: 10 }}>Executed SQL will appear here.</div>}
        </div>
      ) : (
        <div className="history-list">
          {snippets.map((snippet) => (
            <div key={snippet.id} className="history-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                className="history-sql"
                style={{ background: 'transparent', border: 0, textAlign: 'left', flex: 1 }}
                onDoubleClick={() => openTab({ type: 'query', title: snippet.name, sql: snippet.sql })}
              >
                {snippet.name}
              </button>
              <button className="btn-ghost" onClick={() => openTab({ type: 'query', title: snippet.name, sql: snippet.sql })}>
                <Play size={12} />
              </button>
              <button className="btn-ghost" onClick={() => deleteSnippet(snippet.id)}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          {!snippets.length && <div className="muted tiny" style={{ padding: 10 }}>Save a history statement as a snippet to reuse it.</div>}
        </div>
      )}
    </section>
  )
}

function compactSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim()
}
