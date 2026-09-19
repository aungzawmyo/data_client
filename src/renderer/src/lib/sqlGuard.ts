export type SqlRiskLevel = 'none' | 'caution' | 'danger'

export interface SqlRisk {
  level: SqlRiskLevel
  reason: string
}

function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ')
}

function statements(sql: string): string[] {
  return stripComments(sql)
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
}

function hasWhere(sql: string): boolean {
  return /\bwhere\b/i.test(sql)
}

export function inspectSqlRisk(sql: string): SqlRisk {
  const list = statements(sql)
  for (const statement of list) {
    if (/^\s*(drop|truncate)\b/i.test(statement)) {
      return { level: 'danger', reason: 'This statement drops or truncates database objects.' }
    }
    if (/^\s*alter\s+database\b/i.test(statement) || /^\s*alter\s+system\b/i.test(statement)) {
      return { level: 'danger', reason: 'This statement changes the database or server configuration.' }
    }
    if (/^\s*(update|delete)\b/i.test(statement) && !hasWhere(statement)) {
      return { level: 'danger', reason: 'UPDATE/DELETE without WHERE can change every row.' }
    }
    if (/^\s*(grant|revoke|alter\s+role|create\s+role|drop\s+role)\b/i.test(statement)) {
      return { level: 'caution', reason: 'This statement changes roles or privileges.' }
    }
    if (/^\s*(alter|create|drop)\b/i.test(statement)) {
      return { level: 'caution', reason: 'This statement changes schema objects.' }
    }
  }
  return { level: 'none', reason: '' }
}

export function connectionIsGuarded(connection?: {
  environment?: string
  safeMode?: boolean
} | null): boolean {
  if (!connection) return false
  if (connection.safeMode === false) return false
  return connection.environment === 'production' || connection.safeMode === true
}
