import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { AppPrefs, SchemaLayoutState } from '@shared/types'
import { DEFAULT_PREFS } from '@shared/types'

let cache: AppPrefs | null = null
let writeTimer: ReturnType<typeof setTimeout> | undefined

function prefsPath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'prefs.json')
}

function mergePrefs(raw: Partial<AppPrefs> | null | undefined): AppPrefs {
  const appearance = { ...DEFAULT_PREFS.appearance, ...(raw?.appearance ?? {}) }
  return {
    appearance: {
      sidebarVisible: appearance.sidebarVisible !== false,
      historyVisible: appearance.historyVisible !== false,
      statusBarVisible: appearance.statusBarVisible !== false,
      theme: appearance.theme === 'light' || appearance.theme === 'midnight' ? appearance.theme : 'dark',
      density: appearance.density === 'compact' ? 'compact' : 'comfortable'
    },
    queryTimeoutMs: Number(raw?.queryTimeoutMs ?? 0) || 0,
    snippets: Array.isArray(raw?.snippets) ? raw.snippets : [],
    schemaLayouts: raw?.schemaLayouts && typeof raw.schemaLayouts === 'object' ? raw.schemaLayouts : {},
    queryHistoryByConnection:
      raw?.queryHistoryByConnection && typeof raw.queryHistoryByConnection === 'object'
        ? raw.queryHistoryByConnection
        : {},
    migratedFromLocal: Boolean(raw?.migratedFromLocal)
  }
}

export function loadPrefs(): AppPrefs {
  if (cache) return cache
  const file = prefsPath()
  if (!existsSync(file)) {
    cache = {
      ...DEFAULT_PREFS,
      appearance: { ...DEFAULT_PREFS.appearance },
      schemaLayouts: {},
      queryHistoryByConnection: {}
    }
    return cache
  }
  try {
    cache = mergePrefs(JSON.parse(readFileSync(file, 'utf8')) as Partial<AppPrefs>)
  } catch {
    cache = {
      ...DEFAULT_PREFS,
      appearance: { ...DEFAULT_PREFS.appearance },
      schemaLayouts: {},
      queryHistoryByConnection: {}
    }
  }
  return cache
}

function scheduleWrite(): void {
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = setTimeout(() => {
    writeTimer = undefined
    flushPrefs()
  }, 300)
}

export function flushPrefs(): void {
  if (writeTimer) {
    clearTimeout(writeTimer)
    writeTimer = undefined
  }
  if (!cache) return
  writeFileSync(prefsPath(), JSON.stringify(cache, null, 2), 'utf8')
}

export function patchPrefs(partial: Partial<AppPrefs>): AppPrefs {
  const current = loadPrefs()
  cache = mergePrefs({
    ...current,
    ...partial,
    appearance: { ...current.appearance, ...(partial.appearance ?? {}) },
    schemaLayouts: partial.schemaLayouts
      ? { ...current.schemaLayouts, ...partial.schemaLayouts }
      : current.schemaLayouts,
    queryHistoryByConnection: partial.queryHistoryByConnection
      ? { ...current.queryHistoryByConnection, ...partial.queryHistoryByConnection }
      : current.queryHistoryByConnection
  })
  scheduleWrite()
  return cache
}

export function getSchemaLayout(key: string): SchemaLayoutState | undefined {
  return loadPrefs().schemaLayouts[key]
}

export function setSchemaLayout(key: string, layout: SchemaLayoutState): void {
  const current = loadPrefs()
  cache = {
    ...current,
    schemaLayouts: { ...current.schemaLayouts, [key]: layout }
  }
  flushPrefs()
}
