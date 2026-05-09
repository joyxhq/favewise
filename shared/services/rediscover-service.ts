import type { BookmarkRecord, RediscoverItem } from '~/shared/types'

const DAY_MS = 86_400_000
const YEAR_MS = 365 * DAY_MS

function extractDomain(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

interface Context {
  /** Count of bookmarks per domain across the entire collection */
  domainFrequency: Map<string, number>
  /** IDs the user has previously dismissed / opened / saved */
  dismissed: Set<string>
}

type ReasonPart = { key: string; args?: Record<string, string | number> }

/** English-only renderer — used to fill the legacy `reason` string field. */
function renderFallback(parts: ReasonPart[]): string {
  const EN: Record<string, string> = {
    'rediscover.reason.neverVisited': 'Saved but never visited',
    'rediscover.reason.savedNLinks':  "You've saved {count} links from {domain}",
    'rediscover.reason.savedYearsAgo':'Saved {count} years ago',
    'rediscover.reason.savedOverYear':'Saved over a year ago',
    'rediscover.reason.savedMonthsAgo':'Saved {count} months ago',
    'rediscover.reason.forgotten':    'An older bookmark you may have forgotten',
    'rediscover.reason.yearsOld':     '{count}y old',
    'rediscover.reason.monthsOld':    '{count}mo old',
  }
  return parts
    .map(({ key, args }) => {
      const tpl = EN[key] ?? key
      if (!args) return tpl
      return tpl.replace(/\{(\w+)\}/g, (_, n) => String(args[n] ?? ''))
    })
    .join(' · ')
}

function scoreBookmark(
  bookmark: BookmarkRecord,
  ctx: Context,
): { score: number; reason: string; reasonParts: ReasonPart[]; reasonType: RediscoverItem['reasonType'] } | null {
  if (ctx.dismissed.has(bookmark.id)) return null
  if (!bookmark.url) return null

  const now = Date.now()
  const age = now - (bookmark.dateAdded ?? now)
  if (age < 7 * DAY_MS) return null

  let score = 0
  const parts: ReasonPart[] = []
  let reasonType: RediscoverItem['reasonType'] = 'stale'

  // Age signal: up to 50 pts for ≥1 year old
  const ageRatio = Math.min(age / YEAR_MS, 1.0)
  score += ageRatio * 50

  // "Never opened" signal via dateLastUsed
  if (!bookmark.dateLastUsed || bookmark.dateLastUsed < (bookmark.dateAdded ?? 0) + DAY_MS) {
    score += 15
    parts.push({ key: 'rediscover.reason.neverVisited' })
    reasonType = 'stale'
  }

  // Domain frequency: collections with ≥3 bookmarks show engagement
  const domain = extractDomain(bookmark.url)
  if (domain) {
    const freq = ctx.domainFrequency.get(domain) ?? 0
    if (freq >= 3) {
      score += 10
      parts.push({ key: 'rediscover.reason.savedNLinks', args: { count: freq, domain } })
      reasonType = 'source_quality'
    }
  }

  // Real title (not URL-as-title) — stronger signal of intent
  if (bookmark.title && bookmark.title !== bookmark.url) score += 5

  // Age phrasing
  const years = Math.floor(age / YEAR_MS)
  const months = Math.floor(age / (30 * DAY_MS))
  if (parts.length === 0) {
    if (years >= 2) parts.push({ key: 'rediscover.reason.savedYearsAgo', args: { count: years } })
    else if (years >= 1) parts.push({ key: 'rediscover.reason.savedOverYear' })
    else if (months >= 6) parts.push({ key: 'rediscover.reason.savedMonthsAgo', args: { count: months } })
    else parts.push({ key: 'rediscover.reason.forgotten' })
  } else if (years >= 1) {
    parts.unshift({ key: 'rediscover.reason.yearsOld', args: { count: years } })
  } else if (months >= 6) {
    parts.unshift({ key: 'rediscover.reason.monthsOld', args: { count: months } })
  }

  return {
    score: Math.round(score),
    reason: renderFallback(parts),
    reasonParts: parts,
    reasonType,
  }
}

export function generateRediscoverItems(
  bookmarks: BookmarkRecord[],
  dismissedIds: Set<string> = new Set(),
  limit = 20,
): RediscoverItem[] {
  const links = bookmarks.filter((b) => b.url)
  if (links.length === 0) return []

  const domainFrequency = new Map<string, number>()
  for (const bm of links) {
    const d = extractDomain(bm.url)
    if (d) domainFrequency.set(d, (domainFrequency.get(d) ?? 0) + 1)
  }

  const ctx: Context = { domainFrequency, dismissed: dismissedIds }
  const now = Date.now()

  const scored = links
    .map((b) => {
      const res = scoreBookmark(b, ctx)
      return res ? { bookmark: b, ...res } : null
    })
    .filter(Boolean) as Array<{
      bookmark: BookmarkRecord
      score: number
      reason: string
      reasonParts: ReasonPart[]
      reasonType: RediscoverItem['reasonType']
    }>

  scored.sort((a, b) => b.score - a.score)

  return scored.slice(0, limit).map(({ bookmark, score, reason, reasonParts, reasonType }) => ({
    bookmarkId: bookmark.id,
    score,
    reason,
    reasonParts,
    reasonType,
    surfacedAt: now,
  }))
}
