import type { Snippet } from '@shared/types'

const KEY = 'data-client:snippets'

export function loadSnippets(): Snippet[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Snippet[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveSnippets(snippets: Snippet[]): void {
  localStorage.setItem(KEY, JSON.stringify(snippets))
}
