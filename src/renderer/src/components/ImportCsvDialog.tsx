import { useState } from 'react'
import { useAppStore } from '../store'
import { parseCsv } from '../lib/csv'

export function ImportCsvDialog() {
  const importDialog = useAppStore((s) => s.importDialog)
  const setImportDialog = useAppStore((s) => s.setImportDialog)
  const activeConnection = useAppStore((s) => s.activeConnection)
  const [header, setHeader] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [skipHeader, setSkipHeader] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  if (!importDialog) return null

  const onFile = async (file?: File) => {
    if (!file) return
    setError('')
    const text = await file.text()
    const parsed = parseCsv(text)
    if (!parsed.length) {
      setError('CSV is empty')
      return
    }
    setHeader(parsed[0] ?? [])
    setRows(parsed)
    setStatus(`${parsed.length} lines`)
  }

  const run = async () => {
    if (!activeConnection || !header.length) return
    setError('')
    try {
      const dataRows = skipHeader ? rows.slice(1) : rows
      const inserted = await window.api.pg.importRows(
        activeConnection.id,
        importDialog.schema,
        importDialog.table,
        header,
        dataRows
      )
      setStatus(`Inserted ${inserted} rows`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="overlay" onMouseDown={() => setImportDialog(undefined)}>
      <div className="dialog wide" onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-head">
          <strong>
            Import CSV into {importDialog.schema}.{importDialog.table}
          </strong>
        </div>
        <div className="dialog-body">
          <input type="file" accept=".csv,text/csv" onChange={(event) => void onFile(event.target.files?.[0])} />
          <label className="tiny" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={skipHeader} onChange={(event) => setSkipHeader(event.target.checked)} />
            First row is column names
          </label>
          {header.length > 0 && (
            <div className="tiny muted">Columns: {header.join(', ')} · {skipHeader ? Math.max(0, rows.length - 1) : rows.length} data rows</div>
          )}
          {status && <div className="ok tiny">{status}</div>}
          {error && <div className="error tiny">{error}</div>}
        </div>
        <div className="dialog-foot">
          <button className="btn-ghost" onClick={() => setImportDialog(undefined)}>
            Close
          </button>
          <button className="btn-primary" disabled={!header.length} onClick={() => void run()}>
            Import
          </button>
        </div>
      </div>
    </div>
  )
}
