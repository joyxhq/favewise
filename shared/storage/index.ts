import {
  STORAGE_KEYS,
  DEFAULT_SETTINGS,
  normalizeUserSettings,
  SYNC_KEYS,
  CURRENT_SCHEMA_VERSION,
  type NewBookmarkInboxEntry,
  type TagDef,
} from './schema'
import type {
  ScanResult,
  ScanSummary,
  UserSettings,
  TrashEntry,
  OperationLogEntry,
} from '../types'

type RediscoverHistoryEntry = {
  bookmarkId: string
  action: 'dismissed' | 'save_for_later' | 'opened'
  at: number
}

const OPERATION_LOG_MAX = 1000
const REDISCOVER_HISTORY_MAX = 500
const SCAN_HISTORY_MAX = 20
const INBOX_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // auto-expire inbox entries > 30d
const INBOX_MAX_ENTRIES = 200

/**
 * Backend-aware get: checks `chrome.storage.sync` first for sync-eligible
 * keys, then falls back to `chrome.storage.local`. If sync is empty but
 * local has a value, the next set() call will promote it to sync.
 */
async function get<T>(key: string): Promise<T | undefined> {
  if (SYNC_KEYS.has(key)) {
    try {
      const syncRes = await chrome.storage.sync.get(key)
      if (syncRes[key] !== undefined) return syncRes[key] as T
    } catch {
      /* sync may not be available — fall through */
    }
  }
  const localRes = await chrome.storage.local.get(key)
  return localRes[key] as T | undefined
}

/**
 * Backend-aware set: writes sync-eligible keys to `chrome.storage.sync` when
 * possible (so prefs follow the user across devices). Falls back to local on
 * quota-exceeded or API errors. Large data always stays local.
 */
async function set(key: string, value: unknown): Promise<void> {
  if (SYNC_KEYS.has(key)) {
    try {
      await chrome.storage.sync.set({ [key]: value })
      // Clean up any stale local copy so reads don't diverge.
      try { await chrome.storage.local.remove(key) } catch { /* ignore */ }
      return
    } catch (err) {
      console.warn('[Favewise] sync write failed — falling back to local:', key, err)
    }
  }
  await chrome.storage.local.set({ [key]: value })
}

// Settings
export async function getSettings(): Promise<UserSettings> {
  const stored = await get<Partial<UserSettings>>(STORAGE_KEYS.SETTINGS)
  try {
    return normalizeUserSettings(stored)
  } catch (err) {
    console.warn('[Favewise] invalid settings ignored:', err)
    return { ...DEFAULT_SETTINGS }
  }
}

export async function updateSettings(patch: Partial<UserSettings>): Promise<UserSettings> {
  const current = await getSettings()
  const updated = normalizeUserSettings({ ...current, ...patch })
  await set(STORAGE_KEYS.SETTINGS, updated)
  return updated
}

// Latest scan
export async function getLatestScan(): Promise<ScanResult | null> {
  return (await get<ScanResult>(STORAGE_KEYS.LATEST_SCAN)) ?? null
}

export async function saveLatestScan(
  scan: ScanResult,
  options: { updateHistory?: boolean } = {},
): Promise<void> {
  const { updateHistory = true } = options
  await set(STORAGE_KEYS.LATEST_SCAN, scan)
  if (!updateHistory) return
  const summary: ScanSummary = {
    id: scan.id,
    startedAt: scan.startedAt,
    completedAt: scan.completedAt,
    status: scan.status,
    totalBookmarks: scan.totalBookmarks,
    invalidCount: scan.deadLinks.filter((d) => d.status === 'invalid').length,
    suspiciousCount: scan.deadLinks.filter((d) => d.status === 'suspicious').length,
    duplicateGroupCount: scan.duplicateGroups.length,
    organizeSuggestionCount: scan.organizeSuggestions.length,
  }
  const history = await getScanHistory()
  await set(STORAGE_KEYS.SCAN_HISTORY, [summary, ...history].slice(0, SCAN_HISTORY_MAX))
}

export async function getScanHistory(): Promise<ScanSummary[]> {
  return (await get<ScanSummary[]>(STORAGE_KEYS.SCAN_HISTORY)) ?? []
}

// Ignored dead links
export async function getIgnoredDeadLinks(): Promise<string[]> {
  return (await get<string[]>(STORAGE_KEYS.IGNORED_DEAD_LINKS)) ?? []
}

export async function addIgnoredDeadLinks(bookmarkIds: string[]): Promise<void> {
  const current = await getIgnoredDeadLinks()
  await set(
    STORAGE_KEYS.IGNORED_DEAD_LINKS,
    Array.from(new Set([...current, ...bookmarkIds])),
  )
}

export async function clearIgnoredDeadLinks(): Promise<void> {
  await set(STORAGE_KEYS.IGNORED_DEAD_LINKS, [])
}

// Ignored organize suggestions
export async function getIgnoredSuggestions(): Promise<string[]> {
  return (await get<string[]>(STORAGE_KEYS.IGNORED_SUGGESTIONS)) ?? []
}

export async function addIgnoredSuggestions(suggestionIds: string[]): Promise<void> {
  const current = await getIgnoredSuggestions()
  await set(
    STORAGE_KEYS.IGNORED_SUGGESTIONS,
    Array.from(new Set([...current, ...suggestionIds])),
  )
}

export async function clearIgnoredSuggestions(): Promise<void> {
  await set(STORAGE_KEYS.IGNORED_SUGGESTIONS, [])
}

// Trash
export async function getTrashItems(): Promise<TrashEntry[]> {
  return (await get<TrashEntry[]>(STORAGE_KEYS.TRASH_ITEMS)) ?? []
}

export async function addTrashItems(items: TrashEntry[]): Promise<void> {
  const current = await getTrashItems()
  await set(STORAGE_KEYS.TRASH_ITEMS, [...current, ...items])
}

export async function removeTrashItems(bookmarkIds: string[]): Promise<void> {
  const current = await getTrashItems()
  await set(
    STORAGE_KEYS.TRASH_ITEMS,
    current.filter((t) => !bookmarkIds.includes(t.bookmarkId)),
  )
}

export async function clearTrash(): Promise<void> {
  await set(STORAGE_KEYS.TRASH_ITEMS, [])
}

// Operation log (with rotation)
export async function getOperationLog(): Promise<OperationLogEntry[]> {
  return (await get<OperationLogEntry[]>(STORAGE_KEYS.OPERATION_LOG)) ?? []
}

export async function appendOperationLog(entry: OperationLogEntry): Promise<void> {
  const current = await getOperationLog()
  await set(STORAGE_KEYS.OPERATION_LOG, [entry, ...current].slice(0, OPERATION_LOG_MAX))
}

export async function clearOperationLog(): Promise<void> {
  await set(STORAGE_KEYS.OPERATION_LOG, [])
}

// Organize placements & anti-moves
export async function getOrganizePlacements(): Promise<Record<string, string>> {
  return (await get<Record<string, string>>(STORAGE_KEYS.ORGANIZE_PLACEMENTS)) ?? {}
}

export async function recordOrganizePlacements(pairs: Record<string, string>): Promise<void> {
  const current = await getOrganizePlacements()
  await set(STORAGE_KEYS.ORGANIZE_PLACEMENTS, { ...current, ...pairs })
}

export async function getOrganizeAntiMoves(): Promise<string[]> {
  return (await get<string[]>(STORAGE_KEYS.ORGANIZE_ANTI_MOVES)) ?? []
}

export async function addOrganizeAntiMoves(pairs: string[]): Promise<void> {
  const current = await getOrganizeAntiMoves()
  await set(
    STORAGE_KEYS.ORGANIZE_ANTI_MOVES,
    Array.from(new Set([...current, ...pairs])).slice(0, 5000),
  )
}

export async function clearOrganizeAntiMoves(): Promise<void> {
  await set(STORAGE_KEYS.ORGANIZE_ANTI_MOVES, [])
}

/* ---------- New-bookmark inbox ---------- */

export async function getNewBookmarkInbox(): Promise<NewBookmarkInboxEntry[]> {
  const raw = (await get<NewBookmarkInboxEntry[]>(STORAGE_KEYS.NEW_BOOKMARK_INBOX)) ?? []
  // Prune expired entries on read.
  const cutoff = Date.now() - INBOX_MAX_AGE_MS
  return raw.filter((e) => e.createdAt >= cutoff)
}

export async function appendNewBookmarkInbox(entry: NewBookmarkInboxEntry): Promise<void> {
  const current = await getNewBookmarkInbox()
  // Dedupe by bookmarkId
  const filtered = current.filter((e) => e.bookmarkId !== entry.bookmarkId)
  const next = [entry, ...filtered].slice(0, INBOX_MAX_ENTRIES)
  await set(STORAGE_KEYS.NEW_BOOKMARK_INBOX, next)
}

export async function removeFromNewBookmarkInbox(bookmarkIds: string[]): Promise<void> {
  if (bookmarkIds.length === 0) return
  const current = await getNewBookmarkInbox()
  const ids = new Set(bookmarkIds)
  await set(
    STORAGE_KEYS.NEW_BOOKMARK_INBOX,
    current.filter((e) => !ids.has(e.bookmarkId)),
  )
}

export async function markInboxDismissed(bookmarkIds: string[]): Promise<void> {
  if (bookmarkIds.length === 0) return
  const current = await getNewBookmarkInbox()
  const ids = new Set(bookmarkIds)
  const now = Date.now()
  await set(
    STORAGE_KEYS.NEW_BOOKMARK_INBOX,
    current.map((e) => (ids.has(e.bookmarkId) ? { ...e, dismissedAt: now } : e)),
  )
}

/* ---------- Onboarding ---------- */

export async function getOnboardingSeen(): Promise<boolean> {
  return (await get<boolean>(STORAGE_KEYS.ONBOARDING_SEEN)) ?? false
}

export async function markOnboardingSeen(): Promise<void> {
  await set(STORAGE_KEYS.ONBOARDING_SEEN, true)
}

/* ---------- Protection advisor dismissals ---------- */

export async function getProtectionDismissals(): Promise<string[]> {
  return (await get<string[]>(STORAGE_KEYS.PROTECTION_DISMISSALS)) ?? []
}

export async function addProtectionDismissal(folderId: string): Promise<void> {
  const current = await getProtectionDismissals()
  if (current.includes(folderId)) return
  await set(STORAGE_KEYS.PROTECTION_DISMISSALS, [...current, folderId].slice(-500))
}

/* ---------- Tree-dirty flag (incremental scan optimization) ---------- */

export async function isBookmarkTreeDirty(): Promise<boolean> {
  // Default true when unset — first-time scan always runs.
  const stored = await get<boolean>(STORAGE_KEYS.BOOKMARK_TREE_DIRTY)
  return stored ?? true
}

export async function markBookmarkTreeDirty(): Promise<void> {
  await set(STORAGE_KEYS.BOOKMARK_TREE_DIRTY, true)
}

export async function markBookmarkTreeClean(): Promise<void> {
  await set(STORAGE_KEYS.BOOKMARK_TREE_DIRTY, false)
}

/* ---------- Schema migrations ---------- */

/**
 * Idempotent migration runner. Called on background service-worker startup.
 * Each version bump adds a new block. Never mutate existing blocks — once
 * a user is at version N they won't re-run block N on next launch.
 */
export async function runStorageMigrations(): Promise<void> {
  const storedVersion =
    (await get<number>(STORAGE_KEYS.SCHEMA_VERSION)) ?? 1

  if (storedVersion === CURRENT_SCHEMA_VERSION) return

  // v1 → v2: promote small prefs from local → sync.
  if (storedVersion < 2) {
    try {
      for (const key of SYNC_KEYS) {
        const localRes = await chrome.storage.local.get(key)
        if (localRes[key] !== undefined) {
          await chrome.storage.sync.set({ [key]: localRes[key] })
          await chrome.storage.local.remove(key)
        }
      }
    } catch (err) {
      console.warn('[Favewise] Sync migration partial — keeping local copies.', err)
    }
  }

  await set(STORAGE_KEYS.SCHEMA_VERSION, CURRENT_SCHEMA_VERSION)
}

/* ---------- Reactive state reconciliation on Chrome bookmark events ---------- */

/**
 * Remove bookmarks from storage-held state when they vanish (user deletion
 * outside Favewise, or cascading folder remove). Keeps placements, scan
 * snapshot and inbox in sync with reality so we don't display stale refs.
 */
export async function pruneStateForRemovedBookmarks(
  removedIds: Iterable<string>,
): Promise<void> {
  const ids = new Set(removedIds)
  if (ids.size === 0) return

  // Placements
  const placements = await getOrganizePlacements()
  let placementsChanged = false
  const nextPlacements: Record<string, string> = {}
  for (const [id, parent] of Object.entries(placements)) {
    if (ids.has(id)) { placementsChanged = true; continue }
    nextPlacements[id] = parent
  }
  if (placementsChanged) await set(STORAGE_KEYS.ORGANIZE_PLACEMENTS, nextPlacements)

  // Inbox
  await removeFromNewBookmarkInbox([...ids])

  // Latest scan
  const scan = await getLatestScan()
  if (scan) {
    let changed = false
    const next = { ...scan } as ScanResult
    const prunedSnapshot = { ...(next.bookmarkSnapshot ?? {}) }
    for (const id of ids) {
      if (prunedSnapshot[id]) { delete prunedSnapshot[id]; changed = true }
    }
    if (next.deadLinks) {
      const before = next.deadLinks.length
      next.deadLinks = next.deadLinks.filter((d) => !ids.has(d.bookmarkId))
      if (next.deadLinks.length !== before) changed = true
    }
    if (next.deadLinkCache) {
      const cache = { ...next.deadLinkCache }
      for (const id of ids) {
        if (cache[id]) { delete cache[id]; changed = true }
      }
      next.deadLinkCache = cache
    }
    if (next.duplicateGroups) {
      const before = next.duplicateGroups.length
      next.duplicateGroups = next.duplicateGroups
        .map((g) => ({ ...g, bookmarkIds: g.bookmarkIds.filter((id) => !ids.has(id)) }))
        .filter((g) => g.bookmarkIds.length >= 2)
      if (next.duplicateGroups.length !== before) changed = true
    }
    if (next.organizeSuggestions) {
      const before = next.organizeSuggestions.length
      next.organizeSuggestions = next.organizeSuggestions.filter(
        (s) => !ids.has(s.bookmarkId) &&
          !(s.memberIds ?? []).some((id) => ids.has(id)),
      )
      if (next.organizeSuggestions.length !== before) changed = true
    }
    if (next.rediscoverItems) {
      const before = next.rediscoverItems.length
      next.rediscoverItems = next.rediscoverItems.filter((r) => !ids.has(r.bookmarkId))
      if (next.rediscoverItems.length !== before) changed = true
    }
    if (changed) {
      next.bookmarkSnapshot = prunedSnapshot
      await saveLatestScan(next, { updateHistory: false })
    }
  }
}

/**
 * Reconcile stored placements with current tree state. If a previously-placed
 * bookmark now lives somewhere else, the user moved it manually — record the
 * rejected pair in anti-moves so we stop resuggesting it. Mutates storage.
 */
export async function reconcileOrganizePlacements(
  currentParentById: Map<string, string>,
): Promise<void> {
  const placements = await getOrganizePlacements()
  const newPlacements: Record<string, string> = {}
  const newAntiMoves: string[] = []
  for (const [bookmarkId, placedAt] of Object.entries(placements)) {
    const currentParent = currentParentById.get(bookmarkId)
    if (currentParent === placedAt) {
      // Still where we placed it
      newPlacements[bookmarkId] = placedAt
    } else if (currentParent) {
      // User moved it — mark rejected
      newAntiMoves.push(`${bookmarkId}::${placedAt}`)
    }
    // If currentParent is undefined, bookmark was deleted — drop silently.
  }
  await set(STORAGE_KEYS.ORGANIZE_PLACEMENTS, newPlacements)
  if (newAntiMoves.length > 0) await addOrganizeAntiMoves(newAntiMoves)
}

// Rediscover history
export async function getRediscoverHistory(): Promise<RediscoverHistoryEntry[]> {
  return (await get<RediscoverHistoryEntry[]>(STORAGE_KEYS.REDISCOVER_HISTORY)) ?? []
}

export async function appendRediscoverHistory(
  bookmarkId: string,
  action: RediscoverHistoryEntry['action'],
): Promise<void> {
  const current = await getRediscoverHistory()
  await set(
    STORAGE_KEYS.REDISCOVER_HISTORY,
    [{ bookmarkId, action, at: Date.now() }, ...current].slice(0, REDISCOVER_HISTORY_MAX),
  )
}

/* ---------- Tags ---------- */

const TAG_COLORS = [
  '#CC785C', // copper (accent)
  '#E57373', // red
  '#F06292', // pink
  '#BA68C8', // purple
  '#7986CB', // indigo
  '#64B5F6', // blue
  '#4FC3F7', // light blue
  '#4DB6AC', // teal
  '#81C784', // green
  '#AED581', // light green
  '#DCE775', // lime
  '#FFF176', // yellow
  '#FFD54F', // amber
  '#FFB74D', // orange
  '#A1887F', // brown
  '#90A4AE', // blue grey
]

export function tagId(): string {
  return `tag_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

export function tagColor(): string {
  return TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]
}

export async function getTags(): Promise<TagDef[]> {
  return (await get<TagDef[]>(STORAGE_KEYS.TAGS)) ?? []
}

export async function getTag(id: string): Promise<TagDef | undefined> {
  const tags = await getTags()
  return tags.find((t) => t.id === id)
}

export async function createTag(name: string, color?: string): Promise<TagDef> {
  const tags = await getTags()
  const tag: TagDef = {
    id: tagId(),
    name: name.trim(),
    color: color ?? tagColor(),
    createdAt: Date.now(),
  }
  await set(STORAGE_KEYS.TAGS, [...tags, tag])
  return tag
}

export async function updateTag(id: string, patch: Partial<Pick<TagDef, 'name' | 'color'>>): Promise<TagDef | null> {
  const tags = await getTags()
  const idx = tags.findIndex((t) => t.id === id)
  if (idx === -1) return null
  tags[idx] = { ...tags[idx], ...patch }
  await set(STORAGE_KEYS.TAGS, tags)
  return tags[idx]
}

export async function deleteTag(id: string): Promise<void> {
  const tags = await getTags()
  await set(STORAGE_KEYS.TAGS, tags.filter((t) => t.id !== id))
  // Also remove tag from all bookmarks
  const bookmarkTags = await getBookmarkTagsMap()
  const updated: Record<string, string[]> = {}
  let changed = false
  for (const [bmId, tagIds] of Object.entries(bookmarkTags)) {
    const filtered = tagIds.filter((t) => t !== id)
    if (filtered.length !== tagIds.length) {
      changed = true
      if (filtered.length > 0) updated[bmId] = filtered
    } else {
      updated[bmId] = tagIds
    }
  }
  if (changed) await set(STORAGE_KEYS.BOOKMARK_TAGS, updated)
}

export async function getBookmarkTagsMap(): Promise<Record<string, string[]>> {
  return (await get<Record<string, string[]>>(STORAGE_KEYS.BOOKMARK_TAGS)) ?? {}
}

export async function getTagsForBookmark(bookmarkId: string): Promise<TagDef[]> {
  const [tags, map] = await Promise.all([getTags(), getBookmarkTagsMap()])
  const tagIds = map[bookmarkId] ?? []
  return tags.filter((t) => tagIds.includes(t.id))
}

export async function setTagsForBookmark(bookmarkId: string, tagIds: string[]): Promise<void> {
  const map = await getBookmarkTagsMap()
  const filtered = [...new Set(tagIds)]
  if (filtered.length === 0) {
    delete map[bookmarkId]
  } else {
    map[bookmarkId] = filtered
  }
  await set(STORAGE_KEYS.BOOKMARK_TAGS, map)
}

export async function addTagsToBookmark(bookmarkId: string, tagIdsToAdd: string[]): Promise<void> {
  const map = await getBookmarkTagsMap()
  const current = new Set(map[bookmarkId] ?? [])
  for (const t of tagIdsToAdd) current.add(t)
  map[bookmarkId] = [...current]
  await set(STORAGE_KEYS.BOOKMARK_TAGS, map)
}

export async function removeTagsFromBookmark(bookmarkId: string, tagIdsToRemove: string[]): Promise<void> {
  const map = await getBookmarkTagsMap()
  const removeSet = new Set(tagIdsToRemove)
  const current = (map[bookmarkId] ?? []).filter((t) => !removeSet.has(t))
  if (current.length === 0) delete map[bookmarkId]
  else map[bookmarkId] = current
  await set(STORAGE_KEYS.BOOKMARK_TAGS, map)
}

export async function searchTags(query: string): Promise<TagDef[]> {
  const tags = await getTags()
  if (!query.trim()) return tags.slice(0, 20)
  const q = query.toLowerCase()
  return tags.filter((t) => t.name.toLowerCase().includes(q)).slice(0, 20)
}

export async function getBookmarkIdsWithTags(tagIds: string[]): Promise<string[]> {
  const map = await getBookmarkTagsMap()
  const tagSet = new Set(tagIds)
  const result: string[] = []
  for (const [bmId, bmTags] of Object.entries(map)) {
    if (bmTags.some((t) => tagSet.has(t))) result.push(bmId)
  }
  return result
}

/* ---------- Smart folders ---------- */

export function smartFolderId(): string {
  return `sf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

export async function getSmartFolders(): Promise<import('./schema').SmartFolder[]> {
  return (await get<import('./schema').SmartFolder[]>(STORAGE_KEYS.SMART_FOLDERS)) ?? []
}

export async function getSmartFolder(id: string): Promise<import('./schema').SmartFolder | undefined> {
  const folders = await getSmartFolders()
  return folders.find((f) => f.id === id)
}

export async function createSmartFolder(
  name: string,
  rules: import('./schema').SmartFolderRule[],
  sortBy: import('./schema').SmartFolderSortBy = 'added',
  sortOrder: 'asc' | 'desc' = 'desc',
): Promise<import('./schema').SmartFolder> {
  const folders = await getSmartFolders()
  const folder: import('./schema').SmartFolder = {
    id: smartFolderId(),
    name: name.trim(),
    rules,
    sortBy,
    sortOrder,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  await set(STORAGE_KEYS.SMART_FOLDERS, [...folders, folder])
  return folder
}

export async function updateSmartFolder(
  id: string,
  patch: Partial<Pick<import('./schema').SmartFolder, 'name' | 'rules' | 'sortBy' | 'sortOrder'>>,
): Promise<import('./schema').SmartFolder | null> {
  const folders = await getSmartFolders()
  const idx = folders.findIndex((f) => f.id === id)
  if (idx === -1) return null
  folders[idx] = { ...folders[idx], ...patch, updatedAt: Date.now() }
  await set(STORAGE_KEYS.SMART_FOLDERS, folders)
  return folders[idx]
}

export async function deleteSmartFolder(id: string): Promise<void> {
  const folders = await getSmartFolders()
  await set(STORAGE_KEYS.SMART_FOLDERS, folders.filter((f) => f.id !== id))
}
