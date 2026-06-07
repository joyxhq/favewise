import type { BookmarkRecord, DuplicateGroup } from '~/shared/types'
import { hashStr } from '~/shared/lib/protected-folders'

export type DuplicateFolderRuleMode = 'keep' | 'trash'

export interface DuplicateFolderResolution {
  groupId: string
  keepBookmarkIds: string[]
  trashBookmarkIds: string[]
}

export interface DuplicateFolderPreviewItem {
  id: string
  title: string
  path: string
}

export interface DuplicateFolderResolutionPreview {
  groupCount: number
  keepCount: number
  trashCount: number
  items: DuplicateFolderPreviewItem[]
}

export type DuplicateDateStrategy = 'oldest' | 'newest'

export interface DuplicateDatePick {
  id: string | null
  ambiguous: boolean
  tiedIds: string[]
}

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

export function isStillDuplicateUrl(
  currentUrl: string | undefined,
  canonicalUrl: string | undefined,
): boolean {
  if (!currentUrl || !canonicalUrl) return false
  return normalizeUrl(currentUrl) === canonicalUrl
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

export function folderPathKey(bookmark: Pick<BookmarkRecord, 'folderPath'> | undefined): string {
  return bookmark?.folderPath?.filter(Boolean).join('/') ?? ''
}

export function buildFolderPathResolutions(
  groups: DuplicateGroup[],
  bookmarkSnapshot: Record<string, BookmarkRecord | undefined>,
  selectedPathKeys: Iterable<string>,
  mode: DuplicateFolderRuleMode,
): DuplicateFolderResolution[] {
  const selected = new Set(selectedPathKeys)
  if (selected.size === 0) return []

  return groups
    .map((group) => {
      const keep: string[] = []
      const trash: string[] = []

      for (const id of group.bookmarkIds) {
        const matchesSelectedPath = selected.has(folderPathKey(bookmarkSnapshot[id]))
        if (mode === 'keep') {
          if (matchesSelectedPath) keep.push(id)
          else trash.push(id)
        } else {
          if (matchesSelectedPath) trash.push(id)
          else keep.push(id)
        }
      }

      if (keep.length === 0 || trash.length === 0) return null
      return { groupId: group.id, keepBookmarkIds: keep, trashBookmarkIds: trash }
    })
    .filter((r): r is DuplicateFolderResolution => r !== null)
}

export function buildFolderPathResolutionPreview(
  resolutions: DuplicateFolderResolution[],
  bookmarkSnapshot: Record<string, BookmarkRecord | undefined>,
  maxItems = 4,
): DuplicateFolderResolutionPreview {
  const keepIds = resolutions.flatMap((resolution) => resolution.keepBookmarkIds)
  const trashIds = resolutions.flatMap((resolution) => resolution.trashBookmarkIds)

  return {
    groupCount: resolutions.length,
    keepCount: keepIds.length,
    trashCount: trashIds.length,
    items: trashIds.slice(0, maxItems).map((id) => {
      const bm = bookmarkSnapshot[id]
      return {
        id,
        title: bm?.title || bm?.url || id,
        path: bm?.folderPath?.join(' / ') || '',
      }
    }),
  }
}

export function pickUniqueByDate(
  group: DuplicateGroup,
  bookmarkMap: Map<string, BookmarkRecord>,
  strategy: DuplicateDateStrategy,
): DuplicateDatePick {
  const scored = group.bookmarkIds
    .map((id) => {
      const bm = bookmarkMap.get(id)
      if (!bm) return null
      return {
        id,
        value: bm.dateAdded ?? (strategy === 'newest' ? 0 : Infinity),
      }
    })
    .filter((item): item is { id: string; value: number } => item !== null)

  if (scored.length === 0) {
    return { id: null, ambiguous: true, tiedIds: [] }
  }

  const target = strategy === 'newest'
    ? Math.max(...scored.map((item) => item.value))
    : Math.min(...scored.map((item) => item.value))
  const tiedIds = scored.filter((item) => item.value === target).map((item) => item.id)

  return {
    id: tiedIds.length === 1 ? tiedIds[0] : null,
    ambiguous: tiedIds.length !== 1,
    tiedIds,
  }
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
