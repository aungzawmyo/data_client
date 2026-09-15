import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, PointerEvent as ReactPointerEvent } from 'react'
import { Circle, Columns3, Download, GripVertical, LayoutGrid, Maximize2, Rows3, Square, ZoomIn, ZoomOut } from 'lucide-react'
import type { ColumnInfo, ForeignKeyInfo, TableInfo } from '@shared/types'
import { autoLayout, type LayoutMode } from '../lib/schemaLayout'
import { onAppCommand } from '../lib/commands'
import { useAppStore } from '../store'
import { downloadBlob, downloadText } from '../lib/exportGrid'

const CARD_W = 248
const SNAP = 16
const HEADER_H = 38
const ROW_H = 22
const FOOTER_H = 40
const ZOOM_MIN = 0.05
const ZOOM_MAX = 2.5
const ZOOM_PRESETS = [0.05, 0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]

type Pos = { x: number; y: number }
type NodeModel = {
  info: TableInfo
  columns: ColumnInfo[]
  foreignKeys: ForeignKeyInfo[]
}

type LayoutState = {
  positions: Record<string, Pos>
  hidden: string[]
  pan: Pos
  zoom: number
}

function layoutKey(connectionId: string, schema: string): string {
  return `data-client:schema-layout:${connectionId}:${schema}`
}

function snap(value: number): number {
  return Math.round(value / SNAP) * SNAP
}

function clampZoom(value: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 100) / 100))
}

function cardHeight(columnCount: number): number {
  return HEADER_H + 8 + Math.max(columnCount, 1) * ROW_H + FOOTER_H
}

export function SchemaOverview({ schema }: { schema: string }) {
  const { activeConnection, openTab, toggleExpand } = useAppStore()
  const viewportRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    kind: 'table' | 'pan'
    name?: string
    pointer: number
    start: Pos
    origin: Pos
  } | null>(null)

  const [tables, setTables] = useState<TableInfo[]>([])
  const [nodes, setNodes] = useState<Record<string, NodeModel>>({})
  const [positions, setPositions] = useState<Record<string, Pos>>({})
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [pan, setPan] = useState<Pos>({ x: 24, y: 24 })
  const [zoom, setZoom] = useState(1)
  const [selected, setSelected] = useState<string>()
  const [dragging, setDragging] = useState<string>()
  const [dropHover, setDropHover] = useState(false)
  const [error, setError] = useState('')
  const [layoutMenu, setLayoutMenu] = useState(false)
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('horizontal')
  const [customRows, setCustomRows] = useState(3)
  const [customCols, setCustomCols] = useState(4)
  const positionsRef = useRef(positions)
  const panRef = useRef(pan)
  const zoomRef = useRef(zoom)
  const hiddenRef = useRef(hidden)
  positionsRef.current = positions
  panRef.current = pan
  zoomRef.current = zoom
  hiddenRef.current = hidden

  const persist = useCallback(
    (next: Partial<Omit<LayoutState, 'hidden'>> & { hidden?: string[] | Set<string> } = {}) => {
      if (!activeConnection) return
      const payload: LayoutState = {
        positions: next.positions ?? positionsRef.current,
        hidden: next.hidden ? Array.from(next.hidden) : Array.from(hiddenRef.current),
        pan: next.pan ?? panRef.current,
        zoom: next.zoom ?? zoomRef.current
      }
      localStorage.setItem(layoutKey(activeConnection.id, schema), JSON.stringify(payload))
    },
    [activeConnection, schema]
  )

  const applyZoom = useCallback(
    (nextRaw: number, client?: Pos) => {
      const viewport = viewportRef.current
      const rect = viewport?.getBoundingClientRect()
      const current = zoomRef.current
      const next = clampZoom(nextRaw)
      if (!rect) {
        zoomRef.current = next
        setZoom(next)
        persist({ zoom: next })
        return
      }
      const ax = (client?.x ?? rect.left + rect.width / 2) - rect.left
      const ay = (client?.y ?? rect.top + rect.height / 2) - rect.top
      const nextPan = {
        x: ax - ((ax - panRef.current.x) / current) * next,
        y: ay - ((ay - panRef.current.y) / current) * next
      }
      zoomRef.current = next
      panRef.current = nextPan
      setZoom(next)
      setPan(nextPan)
      persist({ zoom: next, pan: nextPan })
    },
    [persist]
  )

  useEffect(() => {
    if (!activeConnection) return
    let cancelled = false
    void (async () => {
      try {
        await toggleExpand(`schema:${schema}`)
        const list = await window.api.pg.listTables(activeConnection.id, schema)
        const nextNodes: Record<string, NodeModel> = {}
        await Promise.all(
          list.map(async (table) => {
            const details = await window.api.pg.tableDetails(activeConnection.id, schema, table.name)
            nextNodes[table.name] = {
              info: table,
              columns: details.columns,
              foreignKeys: details.foreignKeys
            }
          })
        )
        if (cancelled) return
        const savedRaw = localStorage.getItem(layoutKey(activeConnection.id, schema))
        const saved = savedRaw ? (JSON.parse(savedRaw) as LayoutState) : null
        setTables(list)
        setNodes(nextNodes)
        setPositions(
          saved?.positions && Object.keys(saved.positions).length
            ? saved.positions
            : autoLayout(list, nextNodes, {
                mode: 'horizontal',
                schema,
                viewportWidth: 1600,
                cardWidth: CARD_W,
                heightOf: cardHeight
              })
        )
        setHidden(new Set(saved?.hidden ?? []))
        setPan(saved?.pan ?? { x: 24, y: 24 })
        setZoom(saved?.zoom ?? 1)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeConnection, schema, toggleExpand])

  useEffect(() => {
    if (!layoutMenu) return
    const close = () => setLayoutMenu(false)
    const timer = window.setTimeout(() => window.addEventListener('click', close), 0)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('click', close)
    }
  }, [layoutMenu])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      if (event.shiftKey) {
        const next = {
          x: panRef.current.x - event.deltaX - event.deltaY,
          y: panRef.current.y - event.deltaY
        }
        panRef.current = next
        setPan(next)
        persist({ pan: next })
        return
      }
      applyZoom(zoomRef.current * (event.deltaY > 0 ? 0.92 : 1.08), {
        x: event.clientX,
        y: event.clientY
      })
    }
    viewport.addEventListener('wheel', onWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', onWheel)
  }, [applyZoom, persist])

  const visibleTables = tables.filter((table) => !hidden.has(table.name))

  const links = useMemo(() => {
    const lines: {
      key: string
      from: string
      to: string
      path: string
      label: string
    }[] = []
    for (const table of visibleTables) {
      const source = nodes[table.name]
      const fromPos = positions[table.name]
      if (!source || !fromPos) continue
      for (const fk of source.foreignKeys) {
        if (fk.refSchema !== schema || hidden.has(fk.refTable) || !positions[fk.refTable]) continue
        const toPos = positions[fk.refTable]
        const fromIndex = Math.max(
          0,
          source.columns.findIndex((column) => column.name === fk.columns[0])
        )
        const targetCols = nodes[fk.refTable]?.columns ?? []
        const toIndex = Math.max(
          0,
          targetCols.findIndex((column) => column.name === fk.refColumns[0])
        )
        const x1 = fromPos.x + CARD_W
        const y1 = fromPos.y + HEADER_H + 10 + fromIndex * ROW_H + ROW_H / 2
        const x2 = toPos.x
        const y2 = toPos.y + HEADER_H + 10 + toIndex * ROW_H + ROW_H / 2
        const mid = (x1 + x2) / 2
        lines.push({
          key: `${table.name}.${fk.name}`,
          from: table.name,
          to: fk.refTable,
          path: `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`,
          label: `${fk.columns.join(', ')} → ${fk.refTable}.${fk.refColumns.join(', ')}`
        })
      }
    }
    return lines
  }, [hidden, nodes, positions, schema, visibleTables])

  const worldToLocal = (clientX: number, clientY: number): Pos => {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: (clientX - rect.left - panRef.current.x) / zoomRef.current,
      y: (clientY - rect.top - panRef.current.y) / zoomRef.current
    }
  }

  const onPointerMove = (event: ReactPointerEvent) => {
    const drag = dragRef.current
    if (!drag || drag.pointer !== event.pointerId) return
    if (drag.kind === 'pan') {
      const next = {
        x: drag.origin.x + (event.clientX - drag.start.x),
        y: drag.origin.y + (event.clientY - drag.start.y)
      }
      panRef.current = next
      setPan(next)
      return
    }
    if (!drag.name) return
    const point = worldToLocal(event.clientX, event.clientY)
    const nextPos = {
      x: snap(point.x - drag.origin.x),
      y: snap(point.y - drag.origin.y)
    }
    const next = { ...positionsRef.current, [drag.name]: nextPos }
    positionsRef.current = next
    setPositions(next)
  }

  const endDrag = (event: ReactPointerEvent) => {
    const drag = dragRef.current
    if (!drag || drag.pointer !== event.pointerId) return
    dragRef.current = null
    setDragging(undefined)
    persist()
  }

  const startTableDrag = (name: string, event: ReactPointerEvent) => {
    event.stopPropagation()
    if ((event.target as HTMLElement).closest('button')) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const pos = positionsRef.current[name] ?? { x: 0, y: 0 }
    const point = worldToLocal(event.clientX, event.clientY)
    dragRef.current = {
      kind: 'table',
      name,
      pointer: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      origin: { x: point.x - pos.x, y: point.y - pos.y }
    }
    setSelected(name)
    setDragging(name)
  }

  const startPan = (event: ReactPointerEvent) => {
    if (event.button !== 0 && event.button !== 1) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      kind: 'pan',
      pointer: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      origin: panRef.current
    }
    setSelected(undefined)
  }

  const placeTable = (name: string, point?: Pos) => {
    const nextHidden = new Set(hiddenRef.current)
    nextHidden.delete(name)
    hiddenRef.current = nextHidden
    const nextPositions = {
      ...positionsRef.current,
      [name]: point ?? positionsRef.current[name] ?? { x: 48, y: 48 }
    }
    positionsRef.current = nextPositions
    setHidden(nextHidden)
    setPositions(nextPositions)
    setSelected(name)
    persist({ positions: nextPositions, hidden: nextHidden })
  }

  const onDropOnCanvas = (event: DragEvent) => {
    event.preventDefault()
    setDropHover(false)
    const name = event.dataTransfer.getData('application/x-table') || event.dataTransfer.getData('text/plain')
    if (!name) return
    const point = worldToLocal(event.clientX, event.clientY)
    placeTable(name, { x: snap(point.x - CARD_W / 2), y: snap(point.y - 16) })
  }

  const fitToContent = () => {
    const viewport = viewportRef.current
    if (!viewport || !visibleTables.length) {
      applyZoom(1)
      return
    }
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const table of visibleTables) {
      const pos = positionsRef.current[table.name]
      if (!pos) continue
      const height = cardHeight(nodes[table.name]?.columns.length ?? 1)
      minX = Math.min(minX, pos.x)
      minY = Math.min(minY, pos.y)
      maxX = Math.max(maxX, pos.x + CARD_W)
      maxY = Math.max(maxY, pos.y + height)
    }
    const pad = 56
    const boundsW = Math.max(1, maxX - minX + pad * 2)
    const boundsH = Math.max(1, maxY - minY + pad * 2)
    const { width, height } = viewport.getBoundingClientRect()
    const nextZoom = clampZoom(Math.min(width / boundsW, height / boundsH, 1.25))
    const nextPan = {
      x: (width - boundsW * nextZoom) / 2 - (minX - pad) * nextZoom,
      y: (height - boundsH * nextZoom) / 2 - (minY - pad) * nextZoom
    }
    zoomRef.current = nextZoom
    panRef.current = nextPan
    setZoom(nextZoom)
    setPan(nextPan)
    persist({ zoom: nextZoom, pan: nextPan })
  }

  const arrange = (mode = layoutMode) => {
    const visible = tables.filter((table) => !hidden.has(table.name))
    const next = autoLayout(visible, nodes, {
      mode,
      rows: customRows,
      cols: customCols,
      schema,
      viewportWidth: viewportRef.current?.clientWidth || 1600,
      cardWidth: CARD_W,
      heightOf: cardHeight
    })
    const merged = { ...positionsRef.current, ...next }
    positionsRef.current = merged
    setPositions(merged)
    persist({ positions: merged })
    setLayoutMode(mode)
    setLayoutMenu(false)
    requestAnimationFrame(() => fitToContent())
  }

  const diagramSvg = () => {
    let minX = 0
    let minY = 0
    let maxX = 400
    let maxY = 300
    for (const table of visibleTables) {
      const pos = positions[table.name]
      if (!pos) continue
      const height = cardHeight(nodes[table.name]?.columns.length ?? 1)
      minX = Math.min(minX, pos.x)
      minY = Math.min(minY, pos.y)
      maxX = Math.max(maxX, pos.x + CARD_W)
      maxY = Math.max(maxY, pos.y + height)
    }
    const pad = 32
    const width = Math.max(1, maxX - minX + pad * 2)
    const height = Math.max(1, maxY - minY + pad * 2)
    const cards = visibleTables
      .map((table) => {
        const pos = positions[table.name]
        if (!pos) return ''
        const cols = nodes[table.name]?.columns ?? []
        const h = cardHeight(cols.length)
        const colText = cols
          .slice(0, 24)
          .map(
            (column, index) =>
              `<text x="${pos.x + 12}" y="${pos.y + HEADER_H + 18 + index * ROW_H}" fill="#93a0b5" font-size="11">${escapeXml(column.name)}</text>`
          )
          .join('')
        return `<g>
          <rect x="${pos.x}" y="${pos.y}" width="${CARD_W}" height="${h}" rx="10" fill="#1b2330" stroke="#3b4c66"/>
          <text x="${pos.x + 12}" y="${pos.y + 24}" fill="#e7edf7" font-size="13" font-weight="600">${escapeXml(table.name)}</text>
          ${colText}
        </g>`
      })
      .join('')
    const paths = links
      .map((link) => `<path d="${link.path}" fill="none" stroke="#4c8dff" stroke-width="1.4"/>`)
      .join('')
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX - pad} ${minY - pad} ${width} ${height}" font-family="Segoe UI, sans-serif">
  <rect x="${minX - pad}" y="${minY - pad}" width="${width}" height="${height}" fill="#10141c"/>
  ${paths}
  ${cards}
</svg>`
  }

  const exportSvg = () => downloadText(`${schema}-diagram.svg`, diagramSvg(), 'image/svg+xml')

  const exportPng = () => {
    const svg = diagramSvg()
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, image.width)
      canvas.height = Math.max(1, image.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = '#10141c'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(image, 0, 0)
      canvas.toBlob((png) => {
        if (png) downloadBlob(`${schema}-diagram.png`, png)
        URL.revokeObjectURL(url)
      }, 'image/png')
    }
    image.src = url
  }

  useEffect(() => {
    return onAppCommand((action) => {
      if (action === 'zoom-in') applyZoom(zoomRef.current + 0.1)
      if (action === 'zoom-out') applyZoom(zoomRef.current - 0.1)
      if (action === 'zoom-100') applyZoom(1)
      if (action === 'fit-schema') fitToContent()
      if (action === 'layout-horizontal') arrange('horizontal')
      if (action === 'layout-vertical') arrange('vertical')
      if (action === 'layout-square') arrange('square')
      if (action === 'layout-custom') arrange('custom')
      if (action === 'layout-radial') arrange('radial')
    })
  })

  const resetZoom = () => applyZoom(1)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.repeat) return
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement)?.tagName)) return
      if (event.key === '=' || event.key === '+') {
        event.preventDefault()
        applyZoom(zoomRef.current + 0.1)
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault()
        applyZoom(zoomRef.current - 0.1)
      } else if (event.key === '0') {
        event.preventDefault()
        applyZoom(1)
      } else if (event.key === '1') {
        event.preventDefault()
        fitToContent()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const zoomPct = Math.round(zoom * 100)
  const zoomPreset = ZOOM_PRESETS.find((value) => Math.round(value * 100) === zoomPct)

  return (
    <div className="schema-designer">
      <div className="toolbar">
        <strong>Schema designer · {schema}</strong>
        <div className="layout-tools">
          <button className="btn" onClick={() => setLayoutMenu((open) => !open)}>
            <LayoutGrid size={14} /> Auto layout
          </button>
          {layoutMenu && (
            <div className="layout-menu" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
              <button className={layoutMode === 'horizontal' ? 'active' : ''} onClick={() => arrange('horizontal')}>
                <Rows3 size={14} /> More horizontal
                <span className="tiny muted">3+ rows, wide</span>
              </button>
              <button className={layoutMode === 'vertical' ? 'active' : ''} onClick={() => arrange('vertical')}>
                <Columns3 size={14} /> More vertical
                <span className="tiny muted">3 columns</span>
              </button>
              <button className={layoutMode === 'square' ? 'active' : ''} onClick={() => arrange('square')}>
                <Square size={14} /> Square
                <span className="tiny muted">Balanced grid</span>
              </button>
              <div className={`layout-custom ${layoutMode === 'custom' ? 'active' : ''}`}>
                <button onClick={() => arrange('custom')}>
                  <LayoutGrid size={14} /> Custom grid
                </button>
                <div className="layout-custom-fields">
                  <label>
                    Rows
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={customRows}
                      onChange={(event) => setCustomRows(Math.max(1, Number(event.target.value) || 1))}
                    />
                  </label>
                  <label>
                    Cols
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={customCols}
                      onChange={(event) => setCustomCols(Math.max(1, Number(event.target.value) || 1))}
                    />
                  </label>
                  <button className="btn-primary" onClick={() => arrange('custom')}>
                    Apply
                  </button>
                </div>
              </div>
              <button className={layoutMode === 'radial' ? 'active' : ''} onClick={() => arrange('radial')}>
                <Circle size={14} /> Advanced
                <span className="tiny muted">Relations in center, circular</span>
              </button>
            </div>
          )}
        </div>
        <button className="btn" onClick={fitToContent}>
          <Maximize2 size={14} /> Fit
        </button>
        <button className="btn" onClick={exportSvg}>
          <Download size={14} /> SVG
        </button>
        <button className="btn" onClick={exportPng}>
          PNG
        </button>
        <button className="btn" onClick={() => openTab({ type: 'table-design', title: 'New table', schema, name: '' })}>
          New table
        </button>
        <button className="btn" onClick={() => openTab({ type: 'view-design', title: 'New view', schema, name: '' })}>
          New view
        </button>
        <div className="zoom-cluster" title="Zoom tool">
          <button
            className="icon-btn"
            title="Zoom out (Ctrl+-)"
            disabled={zoom <= ZOOM_MIN}
            onClick={() => applyZoom(zoom - 0.1)}
          >
            <ZoomOut size={14} />
          </button>
          <input
            type="range"
            min={ZOOM_MIN * 100}
            max={ZOOM_MAX * 100}
            step={1}
            value={zoomPct}
            onChange={(event) => applyZoom(Number(event.target.value) / 100)}
            title="Zoom"
          />
          <select
            className="zoom-select"
            value={zoomPreset ? String(zoomPreset) : 'custom'}
            onChange={(event) => {
              if (event.target.value !== 'custom') applyZoom(Number(event.target.value))
            }}
          >
            {!zoomPreset && <option value="custom">{zoomPct}%</option>}
            {ZOOM_PRESETS.map((value) => (
              <option key={value} value={value}>
                {Math.round(value * 100)}%
              </option>
            ))}
          </select>
          <button className="icon-btn" title="Zoom in (Ctrl++)" disabled={zoom >= ZOOM_MAX} onClick={() => applyZoom(zoom + 0.1)}>
            <ZoomIn size={14} />
          </button>
          <button className="btn-ghost" title="Reset to 100% (Ctrl+0)" onClick={resetZoom}>
            100%
          </button>
        </div>
      </div>
      {error && <div className="error tiny" style={{ padding: '6px 12px' }}>{error}</div>}
      <div className="schema-shell">
        <aside className="schema-palette">
          <div className="tiny muted" style={{ padding: '8px 10px' }}>
            Drag onto canvas
          </div>
          {tables.map((table) => (
            <div
              key={table.name}
              className={`palette-item ${selected === table.name ? 'active' : ''} ${hidden.has(table.name) ? 'hidden-item' : ''}`}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData('application/x-table', table.name)
                event.dataTransfer.setData('text/plain', table.name)
                event.dataTransfer.effectAllowed = 'copyMove'
              }}
              onClick={() => {
                if (hidden.has(table.name)) placeTable(table.name)
                else setSelected(table.name)
              }}
            >
              <GripVertical size={12} />
              <span>{table.name}</span>
              <span className="badge">{table.type}</span>
            </div>
          ))}
          {!tables.length && <div className="tiny muted" style={{ padding: 10 }}>No tables yet</div>}
        </aside>
        <div className="schema-canvas-wrap">
        <div
          ref={viewportRef}
          className={`schema-viewport ${dropHover ? 'drop-target' : ''} ${dragging ? 'is-dragging' : ''}`}
          onPointerDown={startPan}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDragOver={(event) => {
            event.preventDefault()
            setDropHover(true)
          }}
          onDragLeave={() => setDropHover(false)}
          onDrop={onDropOnCanvas}
        >
          <div
            className="schema-world"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          >
            <svg className="schema-links" width="4000" height="3000">
              <defs>
                <marker id="fk-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#4c8dff" />
                </marker>
              </defs>
              {links.map((link) => (
                <g key={link.key}>
                  <path
                    d={link.path}
                    className={`fk-line ${selected === link.from || selected === link.to ? 'active' : ''}`}
                    markerEnd="url(#fk-arrow)"
                  >
                    <title>{link.label}</title>
                  </path>
                </g>
              ))}
            </svg>
            {visibleTables.map((table) => {
              const node = nodes[table.name]
              const pos = positions[table.name] ?? { x: 40, y: 40 }
              return (
                <article
                  key={table.name}
                  className={`schema-card ${selected === table.name ? 'selected' : ''} ${dragging === table.name ? 'dragging' : ''}`}
                  style={{
                    left: pos.x,
                    top: pos.y,
                    width: CARD_W,
                    zIndex: dragging === table.name ? 5 : selected === table.name ? 4 : 2
                  }}
                  onPointerDown={(event) => startTableDrag(table.name, event)}
                  onDoubleClick={() =>
                    openTab({
                      type: table.type === 'view' ? 'view-design' : 'table-design',
                      title: table.name,
                      schema,
                      name: table.name
                    })
                  }
                >
                  <h3>
                    <GripVertical size={14} />
                    <span className="tree-label">
                      {table.type === 'view' ? 'VIEW' : 'TABLE'} · {table.name}
                    </span>
                    <button
                      className="btn-ghost"
                      onClick={() => {
                        const next = new Set(hiddenRef.current)
                        next.add(table.name)
                        hiddenRef.current = next
                        setHidden(next)
                        persist({ hidden: next })
                      }}
                    >
                      Hide
                    </button>
                  </h3>
                  <ul style={{ minHeight: cardHeight((node?.columns.length ?? 0)) - HEADER_H - FOOTER_H }}>
                    {(node?.columns ?? []).map((column) => (
                      <li key={column.name}>
                        <span>
                          {column.isPrimaryKey && <span className="pk">PK</span>}
                          {column.name}
                        </span>
                        <span className="muted">{column.dataType}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="row-actions" style={{ padding: 8 }}>
                    <button
                      className="btn"
                      onClick={() =>
                        openTab({ type: 'data', title: `${schema}.${table.name}`, schema, name: table.name })
                      }
                    >
                      Data
                    </button>
                    <button
                      className="btn"
                      onClick={() =>
                        openTab({
                          type: table.type === 'view' ? 'view-design' : 'table-design',
                          title: table.name,
                          schema,
                          name: table.name
                        })
                      }
                    >
                      Edit
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
          {!tables.length && <div className="empty">No tables or views in this schema yet.</div>}
          {!!tables.length && !visibleTables.length && (
            <div className="empty">Drag a table from the left onto the canvas.</div>
          )}
        </div>
        <div className="zoom-hud" onPointerDown={(event) => event.stopPropagation()}>
          <button className="icon-btn" title="Zoom out" disabled={zoom <= ZOOM_MIN} onClick={() => applyZoom(zoom - 0.1)}>
            <ZoomOut size={14} />
          </button>
          <button className="zoom-pct" title="Reset to 100%" onClick={resetZoom}>
            {zoomPct}%
          </button>
          <button className="icon-btn" title="Zoom in" disabled={zoom >= ZOOM_MAX} onClick={() => applyZoom(zoom + 0.1)}>
            <ZoomIn size={14} />
          </button>
          <button className="icon-btn" title="Fit all tables" onClick={fitToContent}>
            <Maximize2 size={14} />
          </button>
        </div>
        </div>
      </div>
    </div>
  )
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
