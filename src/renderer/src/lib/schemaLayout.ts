import type { ColumnInfo, ForeignKeyInfo, TableInfo } from '@shared/types'

export type LayoutPos = { x: number; y: number }
export type LayoutMode = 'horizontal' | 'vertical' | 'square' | 'custom' | 'radial'

export type LayoutNode = {
  columns: ColumnInfo[]
  foreignKeys: ForeignKeyInfo[]
}

export interface AutoLayoutOptions {
  mode: LayoutMode
  rows?: number
  cols?: number
  schema: string
  viewportWidth: number
  cardWidth: number
  heightOf: (columnCount: number) => number
}

const SNAP = 16
const ORIGIN_X = 48
const ORIGIN_Y = 48
const GAP_X = 48
const GAP_Y = 28

function snap(value: number): number {
  return Math.round(value / SNAP) * SNAP
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

export function autoLayout(
  tables: TableInfo[],
  nodes: Record<string, LayoutNode>,
  options: AutoLayoutOptions
): Record<string, LayoutPos> {
  const names = tables.map((table) => table.name)
  if (!names.length) return {}
  const graph = buildGraph(tables, nodes, options.schema)
  const ordered = relationOrder(names, graph)

  if (options.mode === 'radial') {
    return radialLayout(ordered, nodes, graph, options.cardWidth, options.heightOf)
  }

  const { rows, cols } = gridSize(ordered.length, options)
  return gridLayout(ordered, nodes, cols, rows, options.cardWidth, options.heightOf)
}

function gridSize(count: number, options: AutoLayoutOptions): { rows: number; cols: number } {
  if (count <= 0) return { rows: 1, cols: 1 }

  if (options.mode === 'vertical') {
    return { cols: 3, rows: Math.max(1, Math.ceil(count / 3)) }
  }

  if (options.mode === 'square') {
    const cols = Math.max(1, Math.ceil(Math.sqrt(count)))
    return { cols, rows: Math.max(1, Math.ceil(count / cols)) }
  }

  if (options.mode === 'custom') {
    const rows = Math.max(1, Math.round(options.rows || 3))
    const cols = Math.max(1, Math.round(options.cols || Math.ceil(count / rows)))
    return { rows, cols }
  }

  const rows = count >= 3 ? 3 : Math.max(2, count)
  const cols = Math.max(1, Math.ceil(count / rows))
  return { rows, cols }
}

function gridLayout(
  names: string[],
  nodes: Record<string, LayoutNode>,
  cols: number,
  _rows: number,
  cardWidth: number,
  heightOf: (columnCount: number) => number
): Record<string, LayoutPos> {
  const positions: Record<string, LayoutPos> = {}
  const columns = Math.max(1, cols)
  const rows: string[][] = []
  names.forEach((name, index) => {
    const row = Math.floor(index / columns)
    rows[row] ??= []
    rows[row].push(name)
  })

  let y = ORIGIN_Y
  for (const row of rows) {
    let x = ORIGIN_X
    let rowHeight = 0
    for (const name of row) {
      positions[name] = { x: snap(x), y: snap(y) }
      x += cardWidth + GAP_X
      rowHeight = Math.max(rowHeight, heightOf(nodes[name]?.columns.length ?? 1))
    }
    y += rowHeight + GAP_Y
  }
  return positions
}

type Graph = {
  neighbors: Map<string, string[]>
  degree: Map<string, number>
}

function buildGraph(tables: TableInfo[], nodes: Record<string, LayoutNode>, schema: string): Graph {
  const neighbors = new Map<string, string[]>()
  for (const table of tables) neighbors.set(table.name, [])

  for (const table of tables) {
    for (const fk of nodes[table.name]?.foreignKeys ?? []) {
      if (fk.refSchema !== schema || fk.refTable === table.name || !neighbors.has(fk.refTable)) continue
      neighbors.get(table.name)!.push(fk.refTable)
      neighbors.get(fk.refTable)!.push(table.name)
    }
  }

  const degree = new Map<string, number>()
  for (const [name, list] of neighbors) {
    const links = unique(list)
    neighbors.set(name, links)
    degree.set(name, links.length)
  }
  return { neighbors, degree }
}

function relationOrder(names: string[], graph: Graph): string[] {
  const remaining = new Set(names)
  const ordered: string[] = []

  while (remaining.size) {
    let hub = ''
    let best = -1
    for (const name of remaining) {
      const score = graph.degree.get(name) ?? 0
      if (score > best || (score === best && name < hub)) {
        hub = name
        best = score
      }
    }
    const queue = [hub]
    remaining.delete(hub)
    ordered.push(hub)
    while (queue.length) {
      const current = queue.shift()!
      const next = (graph.neighbors.get(current) ?? [])
        .filter((name) => remaining.has(name))
        .sort((a, b) => (graph.degree.get(b) ?? 0) - (graph.degree.get(a) ?? 0) || a.localeCompare(b))
      for (const name of next) {
        remaining.delete(name)
        ordered.push(name)
        queue.push(name)
      }
    }
  }
  return ordered
}

function radialLayout(
  names: string[],
  nodes: Record<string, LayoutNode>,
  graph: Graph,
  cardWidth: number,
  heightOf: (columnCount: number) => number
): Record<string, LayoutPos> {
  if (names.length === 1) {
    return { [names[0]]: { x: ORIGIN_X, y: ORIGIN_Y } }
  }

  const hub = [...names].sort(
    (a, b) => (graph.degree.get(b) ?? 0) - (graph.degree.get(a) ?? 0) || a.localeCompare(b)
  )[0]

  const distance = new Map<string, number>([[hub, 0]])
  const queue = [hub]
  while (queue.length) {
    const current = queue.shift()!
    const depth = distance.get(current) ?? 0
    for (const next of graph.neighbors.get(current) ?? []) {
      if (distance.has(next)) continue
      distance.set(next, depth + 1)
      queue.push(next)
    }
  }

  const rings = new Map<number, string[]>()
  for (const name of names) {
    const ring = distance.has(name) ? (distance.get(name) as number) : Math.max(1, ...distance.values()) + 1
    const list = rings.get(ring) ?? []
    list.push(name)
    rings.set(ring, list)
  }
  for (const list of rings.values()) {
    list.sort((a, b) => (graph.degree.get(b) ?? 0) - (graph.degree.get(a) ?? 0) || a.localeCompare(b))
  }

  const avgHeight =
    names.reduce((sum, name) => sum + heightOf(nodes[name]?.columns.length ?? 1), 0) / names.length
  const placedAngle = new Map<string, number>([[hub, -Math.PI / 2]])
  const polar: { name: string; radius: number; angle: number }[] = [{ name: hub, radius: 0, angle: -Math.PI / 2 }]
  let maxRadius = 0

  const ringKeys = [...rings.keys()].sort((a, b) => a - b)
  for (const ring of ringKeys) {
    if (ring === 0) continue
    const group = rings.get(ring) ?? []
    const minRadius = ring * (Math.max(cardWidth, avgHeight) + 64)
    const needRadius = (group.length * (cardWidth + 40)) / (2 * Math.PI)
    const radius = Math.max(minRadius, needRadius)
    maxRadius = Math.max(maxRadius, radius)

    const starts = group.map((name) => {
      const linked = (graph.neighbors.get(name) ?? [])
        .map((item) => placedAngle.get(item))
        .filter((value): value is number => value != null)
      const seed = linked.length
        ? linked.reduce((sum, value) => sum + value, 0) / linked.length
        : -Math.PI / 2
      return { name, seed }
    })
    starts.sort((a, b) => a.seed - b.seed || a.name.localeCompare(b.name))

    const start = -Math.PI / 2
    starts.forEach((item, index) => {
      const angle = start + (2 * Math.PI * index) / Math.max(starts.length, 1)
      placedAngle.set(item.name, angle)
      polar.push({ name: item.name, radius, angle })
    })
  }

  const originX = 80 + maxRadius + cardWidth / 2
  const originY = 80 + maxRadius + avgHeight / 2
  const positions: Record<string, LayoutPos> = {}
  for (const item of polar) {
    const height = heightOf(nodes[item.name]?.columns.length ?? 1)
    positions[item.name] = {
      x: snap(originX + Math.cos(item.angle) * item.radius - cardWidth / 2),
      y: snap(originY + Math.sin(item.angle) * item.radius - height / 2)
    }
  }
  return positions
}
