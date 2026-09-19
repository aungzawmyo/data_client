import type { QueryColumn } from '@shared/types'

const JSON_OIDS = new Set([114, 3802])

export function isJsonValue(value: unknown, dataTypeId?: number): boolean {
  if (dataTypeId != null && JSON_OIDS.has(dataTypeId)) return true
  if (value && typeof value === 'object') return true
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  return (trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length > 1
}

export function parseJsonValue(value: unknown): unknown | null {
  if (value && typeof value === 'object') return value
  if (typeof value !== 'string') return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export function numericColumns(fields: QueryColumn[], rows: Record<string, unknown>[]): string[] {
  return fields
    .map((field) => field.name)
    .filter((name) => rows.some((row) => Number.isFinite(Number(row[name]))))
}

export function labelColumn(fields: QueryColumn[], numeric: string[]): string | undefined {
  return fields.map((field) => field.name).find((name) => !numeric.includes(name)) ?? numeric[0]
}
