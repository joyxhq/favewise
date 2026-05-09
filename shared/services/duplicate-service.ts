import type { BookmarkRecord, DuplicateGroup } from '~/shared/types'
import { hashStr } from '~/shared/lib/protected-folders'

/**
 * Normalize a URL for comparison.
 */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.toLowerCase())
    u.pathname = u.pathname.replace(/\/$/, '') || '/'
    u.hostname = u.hostname.replace(/^www\./, '')
    const utmParams = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
    ]
    utmParams.forEach((p) => u.searchParams.delete(p))
    u.searchParams.sort()
    return u.toString()
  } catch {
    return url.toLowerCase().trim()
  }
}

/**
 * Find exact URL duplicates among bookmark records.
 */
export function findExactDuplicates(bookmarks: BookmarkRecord[]): DuplicateGroup[] {
  const urlMap = new Map<string, BookmarkRecord[]>()

  for (const bookmark of bookmarks) {
    if (!bookmark.url) continue
    const normalized = normalizeUrl(bookmark.url)
    const group = urlMap.get(normalized) ?? []
    group.push(bookmark)
    urlMap.set(normalized, group)
  }

  const groups: DuplicateGroup[] = []

  for (const [normalizedUrl, members] of urlMap) {
    if (members.length < 2) continue
    groups.push({
      id: `dup_${hashStr(normalizedUrl)}`,
      canonicalUrl: normalizedUrl,
      bookmarkIds: members.map((m) => m.id),
    })
  }

  return groups
}

/**
 * Pick the most recently added bookmark from a duplicate group.
 */
export function pickNewest(
  group: DuplicateGroup,
  bookmarkMap: Map<string, BookmarkRecord>,
): string | null {
  let newest: BookmarkRecord | null = null
  for (const id of group.bookmarkIds) {
    const bm = bookmarkMap.get(id)
    if (!bm) continue
    if (!newest || (bm.dateAdded ?? 0) > (newest.dateAdded ?? 0)) {
      newest = bm
    }
  }
  return newest?.id ?? null
}

/**
 * Pick the oldest bookmark from a duplicate group.
 */
export function pickOldest(
  group: DuplicateGroup,
  bookmarkMap: Map<string, BookmarkRecord>,
): string | null {
  let oldest: BookmarkRecord | null = null
  for (const id of group.bookmarkIds) {
    const bm = bookmarkMap.get(id)
    if (!bm) continue
    if (!oldest || (bm.dateAdded ?? Infinity) < (oldest.dateAdded ?? Infinity)) {
      oldest = bm
    }
  }
  return oldest?.id ?? null
}
