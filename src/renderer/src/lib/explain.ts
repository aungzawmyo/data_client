import type { ExplainNode, ExplainPlan, QueryResult } from '@shared/types'

interface RawPlan {
  'Node Type'?: string
  'Relation Name'?: string
  Alias?: string
  'Actual Total Time'?: number
  'Actual Rows'?: number
  'Plan Rows'?: number
  'Total Cost'?: number
  'Startup Cost'?: number
  Plans?: RawPlan[]
}

interface RawExplain {
  Plan?: RawPlan
  'Planning Time'?: number
  'Execution Time'?: number
}

function mapNode(raw: RawPlan): ExplainNode {
  return {
    nodeType: String(raw['Node Type'] ?? 'Plan'),
    relation: raw['Relation Name'] ? String(raw['Relation Name']) : undefined,
    alias: raw.Alias ? String(raw.Alias) : undefined,
    actualTime: raw['Actual Total Time'],
    actualRows: raw['Actual Rows'],
    planRows: raw['Plan Rows'],
    totalCost: raw['Total Cost'],
    startupCost: raw['Startup Cost'],
    children: (raw.Plans ?? []).map(mapNode)
  }
}

function parsePayload(value: unknown): ExplainPlan | null {
  let parsed = value
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      return null
    }
  }
  const root = Array.isArray(parsed) ? parsed[0] : parsed
  if (!root || typeof root !== 'object') return null
  const explain = root as RawExplain
  if (!explain.Plan) return null
  return {
    planningTime: explain['Planning Time'],
    executionTime: explain['Execution Time'],
    root: mapNode(explain.Plan)
  }
}

export function parseExplainResult(result?: QueryResult): ExplainPlan | null {
  if (!result?.rows.length) return null
  const row = result.rows[0]
  const first = Object.values(row)[0]
  return parsePayload(first)
}

export function looksLikeExplainJson(sql: string): boolean {
  return /^\s*explain\b[\s\S]*\bformat\s+json\b/i.test(sql)
}
