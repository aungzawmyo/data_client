import type { AppearancePrefs, SchemaLayoutState, Snippet } from '@shared/types'

const SNIPPETS_KEY = 'data-client:snippets'
const APPEARANCE_KEY = 'data-client:appearance'
const LAYOUT_PREFIX = 'data-client:schema-layout:'
const TIMEOUT_KEY = 'data-client:query-timeout'

export function loadLocalSnippets(): Snippet[] {
  return readJson<Snippet[]>(SNIPPETS_KEY, [])
}

export function loadLocalAppearance(): Partial<AppearancePrefs> | null {
  return readJson<Partial<AppearancePrefs> | null>(APPEARANCE_KEY, null)
}

export function loadLocalTimeout(): number {
  const raw = localStorage.getItem(TIMEOUT_KEY)
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : 0
}

export function collectLocalLayouts(): Record<string, SchemaLayoutState> {
  const layouts: Record<string, SchemaLayoutState> = {}
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (!key?.startsWith(LAYOUT_PREFIX)) continue
    try {
      const parsed = JSON.parse(localStorage.getItem(key) ?? '') as SchemaLayoutState
      if (parsed && typeof parsed === 'object' && parsed.positions) {
        layouts[key.slice(LAYOUT_PREFIX.length)] = parsed
      }
    } catch {
      // ignore a single bad layout entry
    }
  }
  return layouts
}

export function cacheAppearance(state: AppearancePrefs): void {
  localStorage.setItem(APPEARANCE_KEY, JSON.stringify(state))
}

export function writeLocalLayout(keys: string[], layout: SchemaLayoutState): void {
  const raw = JSON.stringify(layout)
  for (const key of keys) {
    localStorage.setItem(`${LAYOUT_PREFIX}${key}`, raw)
  }
}

export function readLocalLayout(keys: string[]): SchemaLayoutState | null {
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(`${LAYOUT_PREFIX}${key}`)
      if (!raw) continue
      const parsed = JSON.parse(raw) as SchemaLayoutState
      if (parsed?.positions && Object.keys(parsed.positions).length) return parsed
    } catch {
      // try the next key
    }
  }
  return null
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}
