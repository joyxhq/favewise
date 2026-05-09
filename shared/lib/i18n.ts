/**
 * Favewise i18n — minimal, zero-dep string dictionary.
 *
 * Usage:
 *   t('nav.dashboard')             → "Dashboard" / "仪表盘"
 *   t('inbox.moved', { count: 3 }) → "Moved 3 bookmarks" / "已移动 3 个书签"
 *
 * Locale resolution order:
 *   1. User override from Settings (via `setLocale()`)
 *   2. `chrome.i18n.getUILanguage()`
 *   3. `navigator.language`
 *   4. 'en' fallback
 */

import { useEffect, useReducer } from 'react'
import { en } from './locale/en'
import { zhCN } from './locale/zh-CN'

export type Locale = 'en' | 'zh-CN'
export type LocalePref = 'auto' | Locale

export type TranslationDict = typeof en

const DICTIONARIES: Record<Locale, TranslationDict> = {
  'en': en,
  'zh-CN': zhCN,
}

let currentLocale: Locale = autoDetectLocale()
const listeners = new Set<() => void>()

export function autoDetectLocale(): Locale {
  try {
    const raw =
      (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage?.()) ||
      (typeof navigator !== 'undefined' && navigator.language) ||
      'en'
    const lower = raw.toLowerCase()
    if (lower.startsWith('zh')) return 'zh-CN'
    return 'en'
  } catch {
    return 'en'
  }
}

export function getLocale(): Locale {
  return currentLocale
}

export function setLocalePref(pref: LocalePref): Locale {
  const next: Locale = pref === 'auto' ? autoDetectLocale() : pref
  if (next !== currentLocale) {
    currentLocale = next
    for (const fn of listeners) {
      try { fn() } catch { /* ignore */ }
    }
  }
  return currentLocale
}

/** Subscribe to locale changes — returns an unsubscribe. */
export function onLocaleChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

type Args = Record<string, string | number>

/**
 * Look up a translation by key. Missing keys fall back to English, then to
 * the raw key itself. `{var}` placeholders are interpolated from `args`.
 * Plural handling: if the key has a `.plural` variant and `args.count !== 1`,
 * the plural entry is chosen automatically — e.g. `t('trash.count', {count: 3})`
 * will prefer `trash.count.plural` when present.
 */
export function t(key: keyof TranslationDict | string, args?: Args): string {
  const k = key as keyof TranslationDict
  const dict = DICTIONARIES[currentLocale]
  const fallback = DICTIONARIES.en

  // Plural resolution
  if (args && typeof args.count === 'number' && args.count !== 1) {
    const pluralKey = (k + '.plural') as keyof TranslationDict
    const pluralEntry = (dict[pluralKey] ?? fallback[pluralKey]) as string | undefined
    if (pluralEntry) return interpolate(pluralEntry, args)
  }

  const entry = (dict[k] ?? fallback[k]) as string | undefined
  if (!entry) return String(key)
  return args ? interpolate(entry, args) : entry
}

function interpolate(template: string, args: Args): string {
  return template.replace(/\{(\w+)\}/g, (_, name) => {
    const v = args[name]
    return v === undefined ? '' : String(v)
  })
}

/**
 * React hook: returns `t` and re-renders the caller on locale changes.
 */
export function useT(): {
  t: typeof t
  locale: Locale
} {
  const [, force] = useReducer((x: number) => x + 1, 0)
  useEffect(() => onLocaleChange(() => force()), [])
  return { t, locale: currentLocale }
}
