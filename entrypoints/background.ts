import '~/shared/lib/webext'
import {
  runScan,
  runDeadLinksCheck,
  cancelDeadLinksCheck,
  cancelScan,
  isScanning,
  isDeadLinksChecking,
} from '~/shared/services/scan-service'
import { checkUrls, getDeadLinkSkipReason } from '~/shared/services/dead-link-service'
import { normalizeUrl } from '~/shared/services/duplicate-service'
import { analyzeFolder } from '~/shared/services/organize-service'
import {
  configurePrimaryPanelBehavior,
  hasDeadLinkHostPermission,
  openPrimaryPanel,
  requestDeadLinkHostPermission,
  setToolbarBadgeText,
  setToolbarTitle,
} from '~/shared/lib/webext'
import {
  getLatestScan,
  saveLatestScan,
  getSettings,
  updateSettings,
  getTrashItems,
  addTrashItems,
  removeTrashItems,
  clearTrash,
  addIgnoredDeadLinks,
  getIgnoredDeadLinks,
  clearIgnoredDeadLinks,
  addIgnoredSuggestions,
  getIgnoredSuggestions,
  clearIgnoredSuggestions,
  appendRediscoverHistory,
  getRediscoverHistory,
  appendOperationLog,
  getOperationLog,
  clearOperationLog,
  getOrganizeAntiMoves,
  addOrganizeAntiMoves,
  clearOrganizeAntiMoves,
  recordOrganizePlacements,
  reconcileOrganizePlacements,
  runStorageMigrations,
  getNewBookmarkInbox,
  appendNewBookmarkInbox,
  removeFromNewBookmarkInbox,
  markInboxDismissed,
  pruneStateForRemovedBookmarks,
  getOnboardingSeen,
  markOnboardingSeen,
  getProtectionDismissals,
  addProtectionDismissal,
  isBookmarkTreeDirty,
  markBookmarkTreeDirty,
  markBookmarkTreeClean,
  getTags,
  createTag,
  updateTag,
  deleteTag,
  getTagsForBookmark,
  setTagsForBookmark,
  addTagsToBookmark,
  removeTagsFromBookmark,
  searchTags,
  getBookmarkTagsMap,
  getSmartFolders,
  getSmartFolder,
  createSmartFolder,
  updateSmartFolder,
  deleteSmartFolder,
} from '~/shared/storage'
import { categorizeUrl } from '~/shared/lib/url-taxonomy'
import { formatMarkdownLink, escapeMarkdownText } from '~/shared/lib/markdown'
import {
  CURRENT_SCHEMA_VERSION,
  STORAGE_KEYS,
  SYNC_KEYS,
  normalizeUserSettings,
} from '~/shared/storage/schema'
import {
  trashBookmark,
  restoreBookmark,
  moveBookmark,
  getAllBookmarkLinks,
  getAllBookmarks,
} from '~/shared/services/bookmark-service'
import { buildBookmarkMap, flattenBookmarkTree } from '~/shared/utils/bookmark-tree'
import { mapLimit } from '~/shared/lib/concurrency'
import { createDispatcher, ok, err, broadcast, type HandlerMap } from '~/shared/lib/messaging'
import { ERROR_CODES } from '~/shared/types/messages'
import type { TrashEntry, OperationLogEntry, ScanResult } from '~/shared/types'
import { hashStr, expandProtectedSubtree } from '~/shared/lib/protected-folders'
import {
  recordError,
  getRecentErrors,
  opId,
  BULK_CONCURRENCY,
  getProtectedBookmarkIds,
  syncScanAfterMutation,
  pruneSnapshot,
  folderSubtreeHasBookmark,
  isSameScannedUrl,
  isStillInDuplicateGroup,
  hasValidDuplicateKeep,
  containsFind,
  applyReplace,
  matchesRule,
} from './handlers/shared'
import { wireBookmarkListeners } from './handlers/listeners'
import { wireAlarms, refreshBadge, refreshScheduleAlarm } from './handlers/alarms'
import { wireOmnibox } from './handlers/omnibox'

let smartFolderCache = new Map<string, { ids: string[]; at: number }>()
const SMART_FOLDER_CACHE_TTL = 30_000
const BACKUP_IMPORT_MAX_BYTES = 5 * 1024 * 1024
const STORAGE_KEY_VALUES = new Set<string>(Object.values(STORAGE_KEYS))
const ARRAY_KEYS = new Set<string>([
  STORAGE_KEYS.SCAN_HISTORY,
  STORAGE_KEYS.IGNORED_DEAD_LINKS,
  STORAGE_KEYS.IGNORED_SUGGESTIONS,
  STORAGE_KEYS.REDISCOVER_HISTORY,
  STORAGE_KEYS.TRASH_ITEMS,
  STORAGE_KEYS.OPERATION_LOG,
  STORAGE_KEYS.ORGANIZE_ANTI_MOVES,
  STORAGE_KEYS.NEW_BOOKMARK_INBOX,
  STORAGE_KEYS.PROTECTION_DISMISSALS,
  STORAGE_KEYS.TAGS,
  STORAGE_KEYS.SMART_FOLDERS,
])
const RECORD_KEYS = new Set<string>([
  STORAGE_KEYS.SETTINGS,
  STORAGE_KEYS.LATEST_SCAN,
  STORAGE_KEYS.ORGANIZE_PLACEMENTS,
  STORAGE_KEYS.BOOKMARK_TAGS,
])

function byteSize(value: unknown): number {
  return new Blob([typeof value === 'string' ? value : JSON.stringify(value ?? null)]).size
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function validateBackupArea(
  raw: unknown,
  opts: { syncOnly: boolean },
): Record<string, unknown> {
  if (!isPlainRecord(raw)) throw new Error('Backup storage area must be an object')
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!STORAGE_KEY_VALUES.has(key)) throw new Error(`Unknown storage key: ${key}`)
    if (opts.syncOnly && !SYNC_KEYS.has(key)) throw new Error(`Key is not sync-safe: ${key}`)
    if (byteSize(value) > 2 * 1024 * 1024) throw new Error(`Storage value is too large: ${key}`)

    if (ARRAY_KEYS.has(key) && !Array.isArray(value)) throw new Error(`Expected array for ${key}`)
    if (RECORD_KEYS.has(key) && value !== null && !isPlainRecord(value)) throw new Error(`Expected object for ${key}`)
    if (key === STORAGE_KEYS.SCHEMA_VERSION && typeof value !== 'number') throw new Error('Invalid schema version')
    if (key === STORAGE_KEYS.ONBOARDING_SEEN && typeof value !== 'boolean') throw new Error('Invalid onboarding marker')
    if (key === STORAGE_KEYS.BOOKMARK_TREE_DIRTY && typeof value !== 'boolean') throw new Error('Invalid dirty marker')

    out[key] = key === STORAGE_KEYS.SETTINGS ? normalizeUserSettings(value) : value
  }
  return out
}

async function restoreStorageSnapshot(
  localSnapshot: Record<string, unknown>,
  syncSnapshot: Record<string, unknown>,
): Promise<void> {
  try {
    await chrome.storage.local.clear()
    if (Object.keys(localSnapshot).length > 0) {
      await chrome.storage.local.set(localSnapshot)
    }
  } catch {
    /* best effort */
  }
  try {
    await chrome.storage.sync.clear()
    if (Object.keys(syncSnapshot).length > 0) {
      await chrome.storage.sync.set(syncSnapshot)
    }
  } catch {
    /* best effort */
  }
}

async function getDeadLinkCheckableStats(bookmarkIds?: string[]): Promise<{
  checkableCount: number
  skippedCount: number
}> {
  const records = await getAllBookmarkLinks()
  const selected = bookmarkIds ? new Set(bookmarkIds) : null
  let checkableCount = 0
  let skippedCount = 0
  for (const bookmark of records) {
    if (selected && !selected.has(bookmark.id)) continue
    if (!bookmark.url) continue
    if (getDeadLinkSkipReason(bookmark.url)) skippedCount++
    else checkableCount++
  }
  return { checkableCount, skippedCount }
}

const handlers: HandlerMap = {
  /* ----- Scan lifecycle ----- */

  'scan.start': async (payload) => {
    if (isScanning()) {
      return err(ERROR_CODES.SCAN_ALREADY_RUNNING, 'A scan is already in progress')
    }
    const taskId = `scan_${Date.now()}`

    // Fast-path: bookmark tree hasn't changed since the last successful scan.
    // Bypass the whole pipeline and broadcast the cached result as completed
    // so the UI refreshes without the user waiting for a no-op scan.
    if (!payload?.force) {
      const dirty = await isBookmarkTreeDirty()
      const cached = await getLatestScan()
      if (!dirty && cached && cached.status === 'completed') {
        // Fire-and-forget broadcast so sidepanel updates its state.
        setTimeout(() => {
          broadcast({ type: 'scan.completed', payload: cached })
        }, 0)
        return ok({ taskId: cached.id, status: 'unchanged' })
      }
    }

    runScan(taskId, (event) => broadcast({ type: 'scan.progress', payload: event }))
      .then((result) => {
        markBookmarkTreeClean().catch(() => {})
        broadcast({ type: 'scan.completed', payload: result })
        refreshBadge().catch(() => {})
      })
      .catch((e) =>
        broadcast({
          type: 'scan.failed',
          payload: { taskId, error: e instanceof Error ? e.message : String(e) },
        }),
      )
    return ok({ taskId, status: 'started' })
  },

  'scan.status.get': async () =>
    ok({ isScanning: isScanning(), isCheckingDeadLinks: isDeadLinksChecking() }),

  'scan.latest.get': async () => ok(await getLatestScan()),

  /* ----- Dead-links task ----- */

  'deadLinks.start': async (payload) => {
    if (isDeadLinksChecking()) {
      return err(
        ERROR_CODES.SCAN_ALREADY_RUNNING,
        'A dead-link check is already in progress',
      )
    }
    const stats = await getDeadLinkCheckableStats()
    if (stats.checkableCount > 0 && !(await hasDeadLinkHostPermission())) {
      const granted = await requestDeadLinkHostPermission()
      if (!granted) {
        return err(
          ERROR_CODES.PERMISSION_MISSING,
          'Favewise needs permission to request bookmarked URLs before it can check dead links.',
        )
      }
    }
    const taskId = `deadlinks_${Date.now()}`
    const forceFull = payload?.forceFull ?? false
    runDeadLinksCheck(taskId, { forceFull }, (event) =>
      broadcast({ type: 'deadLinks.progress', payload: event }),
    )
      .then((result) => broadcast({ type: 'scan.completed', payload: result }))
      .catch((e) =>
        broadcast({
          type: 'scan.failed',
          payload: { taskId, error: e instanceof Error ? e.message : String(e) },
        }),
      )
    return ok({ taskId, status: 'started' })
  },

  'deadLinks.stop': async () => ok({ stopped: cancelDeadLinksCheck() }),

  'deadLinks.checkableCount': async (payload) =>
    ok(await getDeadLinkCheckableStats(payload?.bookmarkIds)),

  'deadLinks.recheck': async (payload) => {
    const { bookmarkIds } = payload
    if (isDeadLinksChecking()) {
      return err(
        ERROR_CODES.SCAN_ALREADY_RUNNING,
        'A dead-link check is already in progress',
      )
    }
    const scan = await getLatestScan()
    const settings = await getSettings()
    if (!scan) return err(ERROR_CODES.SCAN_NOT_FOUND, 'No scan result')

    const allBookmarks = await getAllBookmarkLinks()
    const bookmarkMap = buildBookmarkMap(allBookmarks)
    const targets = bookmarkIds
      .map((id) => bookmarkMap.get(id))
      .filter((b): b is NonNullable<typeof b> => !!b && !!b.url)
      .map((b) => ({ id: b.id, url: b.url! }))
    const checkableTargets = targets.filter((target) => !getDeadLinkSkipReason(target.url))
    if (checkableTargets.length === 0) return ok({ checkedCount: 0, stillDeadCount: 0 })
    if (!(await hasDeadLinkHostPermission())) {
      const granted = await requestDeadLinkHostPermission()
      if (!granted) {
        return err(
          ERROR_CODES.PERMISSION_MISSING,
          'Favewise needs permission to request bookmarked URLs before it can re-check dead links.',
        )
      }
    }

    const results = await checkUrls(checkableTargets, {
      timeoutMs: settings.scanTimeoutMs,
      maxConcurrent: settings.maxConcurrentChecks,
    })

    const updatedCache = { ...(scan.deadLinkCache ?? {}) }
    for (const r of results) updatedCache[r.bookmarkId] = r

    const updatedDeadLinks = Object.values(updatedCache).filter(
      (d) => d.status !== 'valid',
    )
    const validIds = results.filter((r) => r.status === 'valid').map((r) => r.bookmarkId)
    const updatedScan: ScanResult = {
      ...scan,
      deadLinkCache: updatedCache,
      deadLinks: updatedDeadLinks,
      bookmarkSnapshot: pruneSnapshot(scan.bookmarkSnapshot, validIds) as ScanResult['bookmarkSnapshot'],
    }
    await saveLatestScan(updatedScan, { updateHistory: false })

    const stillDeadCount = results.filter((r) => r.status !== 'valid').length
    return ok({ checkedCount: results.length, stillDeadCount, scan: updatedScan })
  },

  'deadLinks.ignore': async (payload) => {
    const { bookmarkIds } = payload
    await addIgnoredDeadLinks(bookmarkIds)
    await syncScanAfterMutation((scan) => ({
      ...scan,
      deadLinks: scan.deadLinks.filter((d) => !bookmarkIds.includes(d.bookmarkId)),
    }))
    await appendOperationLog({
      operationId: opId(),
      timestamp: Date.now(),
      actionType: 'ignore',
      bookmarkIds,
      note: `Ignored ${bookmarkIds.length} link${bookmarkIds.length !== 1 ? 's' : ''}`,
    })
    return ok({ ignoredCount: bookmarkIds.length })
  },

  'deadLinks.trash': async (payload) => {
    const { bookmarkIds } = payload
    const scan = await getLatestScan()
    const expectedById = new Map((scan?.deadLinks ?? []).map((d) => [d.bookmarkId, d]))
    const allBookmarks = await getAllBookmarkLinks()
    const bookmarkMap = buildBookmarkMap(allBookmarks)
    const protectedBookmarks = await getProtectedBookmarkIds(allBookmarks)
    const allowedIds = bookmarkIds.filter((id) => !protectedBookmarks.has(id))
    const protectedSkipped = bookmarkIds.length - allowedIds.length
    let staleSkipped = 0
    const freshIds = allowedIds.filter((id) => {
      const bm = bookmarkMap.get(id)
      const expected = expectedById.get(id)
      if (!bm || !isSameScannedUrl(bm.url, expected?.url)) {
        staleSkipped++
        return false
      }
      return true
    })
    const operationId = opId()
    const trashEntries: TrashEntry[] = []
    const errors: string[] = []

    const results = await mapLimit(freshIds, BULK_CONCURRENCY, async (id) => {
      const bm = bookmarkMap.get(id)
      if (!bm) throw new Error('Bookmark not found')
      await trashBookmark(bm)
      return bm
    })

    for (const r of results) {
      if (!r.ok) { errors.push(r.input); continue }
      const bm = r.value
      trashEntries.push({
        bookmarkId: bm.id,
        title: bm.title,
        url: bm.url,
        originalPath: bm.folderPath,
        trashedAt: Date.now(),
        operationId,
      })
    }

    if (trashEntries.length > 0) {
      await addTrashItems(trashEntries)
      await appendOperationLog({
        operationId,
        timestamp: Date.now(),
        actionType: 'trash',
        bookmarkIds: trashEntries.map((t) => t.bookmarkId),
        previousFolderPaths: trashEntries.map((t) => t.originalPath),
        targetFolderPath: ['Favewise Trash'],
        note: 'Dead links trashed',
      })

      const trashedSet = new Set(trashEntries.map((t) => t.bookmarkId))
      await syncScanAfterMutation((scan) => ({
        ...scan,
        deadLinks: scan.deadLinks.filter((d) => !trashedSet.has(d.bookmarkId)),
        deadLinkCache: Object.fromEntries(
          Object.entries(scan.deadLinkCache ?? {}).filter(([id]) => !trashedSet.has(id)),
        ),
        bookmarkSnapshot: pruneSnapshot(scan.bookmarkSnapshot, trashedSet) as ScanResult['bookmarkSnapshot'],
      }))
    }

    if (errors.length > 0 && trashEntries.length === 0 && protectedSkipped === 0) {
      return err(ERROR_CODES.PARTIAL_FAILURE, `Failed to trash ${errors.length} bookmark(s)`, true)
    }
    return ok({
      trashedCount: trashEntries.length,
      failedCount: errors.length + protectedSkipped + staleSkipped,
      protectedSkipped,
      staleSkipped,
    })
  },

  /* ----- Duplicates ----- */

  'duplicates.resolve': async (payload) => {
    const { groupId, keepBookmarkIds, trashBookmarkIds } = payload
    const scan = await getLatestScan()
    const expectedGroup = scan?.duplicateGroups.find((g) => g.id === groupId)
    if (!expectedGroup) return err(ERROR_CODES.SCAN_NOT_FOUND, 'Duplicate group is stale — rescan and retry')

    const allBookmarks = await getAllBookmarkLinks()
    const bookmarkMap = buildBookmarkMap(allBookmarks)
    const protectedBookmarks = await getProtectedBookmarkIds(allBookmarks)
    let protectedSkipped = 0
    let staleSkipped = 0
    if (!hasValidDuplicateKeep(keepBookmarkIds, expectedGroup, bookmarkMap)) {
      return ok({
        trashedCount: 0,
        failedCount: trashBookmarkIds.length,
        protectedSkipped: 0,
        staleSkipped: trashBookmarkIds.length,
        reason: 'keep_candidates_stale',
      })
    }
    const allowedTrashIds = trashBookmarkIds.filter((id) => {
      if (protectedBookmarks.has(id)) {
        protectedSkipped++
        return false
      }
      const bm = bookmarkMap.get(id)
      if (
        !expectedGroup.bookmarkIds.includes(id) ||
        !isStillInDuplicateGroup(bm?.url, expectedGroup.canonicalUrl)
      ) {
        staleSkipped++
        return false
      }
      return true
    })
    const operationId = opId()
    const trashEntries: TrashEntry[] = []
    const errors: string[] = []

    const results = await mapLimit(allowedTrashIds, BULK_CONCURRENCY, async (id) => {
      const bm = bookmarkMap.get(id)
      if (!bm) throw new Error('Bookmark not found')
      await trashBookmark(bm)
      return bm
    })

    for (const r of results) {
      if (!r.ok) { errors.push(r.input); continue }
      const bm = r.value
      trashEntries.push({
        bookmarkId: bm.id,
        title: bm.title,
        url: bm.url,
        originalPath: bm.folderPath,
        trashedAt: Date.now(),
        operationId,
      })
    }

    if (trashEntries.length > 0) {
      await addTrashItems(trashEntries)
      await appendOperationLog({
        operationId,
        timestamp: Date.now(),
        actionType: 'trash',
        bookmarkIds: trashEntries.map((t) => t.bookmarkId),
        previousFolderPaths: trashEntries.map((t) => t.originalPath),
        targetFolderPath: ['Favewise Trash'],
        note: `Resolved duplicate group (kept ${keepBookmarkIds.length}, trashed ${trashEntries.length})`,
      })
    }

    const trashedSet = new Set(trashEntries.map((t) => t.bookmarkId))
    await syncScanAfterMutation((scan) => ({
      ...scan,
      duplicateGroups: scan.duplicateGroups
        .map((g) =>
          g.id === groupId
            ? { ...g, bookmarkIds: g.bookmarkIds.filter((id) => !trashedSet.has(id)) }
            : g,
        )
        .filter((g) => g.bookmarkIds.length >= 2),
      bookmarkSnapshot: pruneSnapshot(scan.bookmarkSnapshot, trashedSet) as ScanResult['bookmarkSnapshot'],
    }))

    return ok({
      trashedCount: trashEntries.length,
      failedCount: errors.length + protectedSkipped + staleSkipped,
      protectedSkipped,
      staleSkipped,
    })
  },

  'duplicates.resolveBulk': async (payload) => {
    const { resolutions } = payload
    const scan = await getLatestScan()
    if (!scan) return err(ERROR_CODES.SCAN_NOT_FOUND, 'No scan result')

    const allBookmarks = await getAllBookmarkLinks()
    const bookmarkMap = buildBookmarkMap(allBookmarks)
    const protectedBookmarks = await getProtectedBookmarkIds(allBookmarks)
    const operationId = opId()
    const allTrashEntries: TrashEntry[] = []
    const errors: string[] = []

    const groupById = new Map(scan.duplicateGroups.map((g) => [g.id, g]))

    const allTrashIds: Array<{ groupId: string; id: string }> = []
    let protectedSkipped = 0
    let staleSkipped = 0
    for (const r of resolutions) {
      const group = groupById.get(r.groupId)
      if (!group) {
        staleSkipped += r.trashBookmarkIds.length
        continue
      }
      if (!hasValidDuplicateKeep(r.keepBookmarkIds, group, bookmarkMap)) {
        staleSkipped += r.trashBookmarkIds.length
        continue
      }
      for (const id of r.trashBookmarkIds) {
        if (protectedBookmarks.has(id)) { protectedSkipped++; continue }
        const bm = bookmarkMap.get(id)
        if (
          !group.bookmarkIds.includes(id) ||
          !isStillInDuplicateGroup(bm?.url, group.canonicalUrl)
        ) {
          staleSkipped++
          continue
        }
        allTrashIds.push({ groupId: r.groupId, id })
      }
    }

    const results = await mapLimit(allTrashIds, BULK_CONCURRENCY, async (pair) => {
      const bm = bookmarkMap.get(pair.id)
      if (!bm) throw new Error('Bookmark not found')
      await trashBookmark(bm)
      return { bm, groupId: pair.groupId }
    })

    for (const r of results) {
      if (!r.ok) { errors.push(r.input.id); continue }
      const { bm } = r.value
      allTrashEntries.push({
        bookmarkId: bm.id,
        title: bm.title,
        url: bm.url,
        originalPath: bm.folderPath,
        trashedAt: Date.now(),
        operationId,
      })
    }

    const trashedSet = new Set(allTrashEntries.map((t) => t.bookmarkId))
    const resolvedGroupIds = scan.duplicateGroups
      .filter((g) => {
        const remaining = g.bookmarkIds.filter((id) => !trashedSet.has(id))
        return remaining.length < 2 && remaining.length !== g.bookmarkIds.length
      })
      .map((g) => g.id)

    if (allTrashEntries.length > 0) {
      await addTrashItems(allTrashEntries)
      await appendOperationLog({
        operationId,
        timestamp: Date.now(),
        actionType: 'trash',
        bookmarkIds: allTrashEntries.map((t) => t.bookmarkId),
        note: `Bulk resolved ${resolvedGroupIds.length} duplicate group(s)`,
      })
    }

    await syncScanAfterMutation((current) => ({
      ...current,
      duplicateGroups: current.duplicateGroups
        .map((g) => ({ ...g, bookmarkIds: g.bookmarkIds.filter((id) => !trashedSet.has(id)) }))
        .filter((g) => g.bookmarkIds.length >= 2),
      bookmarkSnapshot: pruneSnapshot(current.bookmarkSnapshot, trashedSet) as ScanResult['bookmarkSnapshot'],
    }))

    return ok({
      resolvedCount: resolvedGroupIds.length,
      trashedCount: allTrashEntries.length,
      protectedSkipped,
      staleSkipped,
      failedCount: errors.length + protectedSkipped + staleSkipped,
    })
  },

  /* ----- Organize ----- */

  'organize.apply': async (payload) => {
    const { suggestionIds } = payload
    const scan = await getLatestScan()

    // Build a merged map of suggestions from scan + any recent scoped analysis.
    // The view is expected to pass suggestion IDs it currently sees; for
    // scoped analyses (not persisted in scan) we fall back to re-running
    // analysis on the same scope to recover the suggestion details.
    const suggestionMap = new Map<string, import('~/shared/types').OrganizeSuggestion>()
    for (const s of scan?.organizeSuggestions ?? []) suggestionMap.set(s.id, s)

    // If any requested ID isn't in scan, try re-running scoped analysis.
    const missing = suggestionIds.filter((id) => !suggestionMap.has(id))
    if (missing.length > 0) {
      const settings = await getSettings()
      if (settings.organizeScopeFolderId) {
        const records = await getAllBookmarks()
        const ignored = await getIgnoredSuggestions()
        const anti = await getOrganizeAntiMoves()
        const fresh = analyzeFolder(records, settings.organizeScopeFolderId, {
          ignoredSuggestionIds: ignored,
          antiMoves: anti,
          protectedFolderIds: settings.protectedFolderIds ?? [],
        })
        for (const s of fresh) if (!suggestionMap.has(s.id)) suggestionMap.set(s.id, s)
      }
    }

    const allBookmarks = await getAllBookmarks()
    const protectedSubtree = expandProtectedSubtree(
      allBookmarks,
      (await getSettings()).protectedFolderIds ?? [],
    )

    const rawWork = suggestionIds
      .map((id) => suggestionMap.get(id))
      .filter((s): s is NonNullable<typeof s> => !!s)

    // Belt & suspenders: if the user added a folder to "protected" between
    // suggestion generation and applying, drop any suggestion touching it.
    const work = rawWork.filter((s) => {
      if (protectedSubtree.has(s.targetFolderId)) return false
      const members = s.memberIds?.length ? s.memberIds : [s.bookmarkId]
      for (const id of members) {
        const bm = allBookmarks.find((r) => r.id === id)
        if (bm?.parentId && protectedSubtree.has(bm.parentId)) return false
      }
      return true
    })
    const protectedSkipped = rawWork.length - work.length

    if (work.length === 0) {
      if (protectedSkipped > 0) {
        return err(
          ERROR_CODES.INVALID_PAYLOAD,
          'All selected suggestions touch protected folders — nothing applied.',
        )
      }
      return err(ERROR_CODES.SCAN_NOT_FOUND, 'Suggestion not found — rescan and retry')
    }

    const operationId = opId()
    const movedIds: string[] = []
    const errors: string[] = []
    const placements: Record<string, string> = {}
    // antiMoves: remembering "this bookmark was explicitly moved OUT of old
    // parent" — without this the next scan can propose the reverse move because
    // the source folder still has many similar items (ping-pong loop).
    const reverseAntiMoves: string[] = []
    const parentById = new Map<string, string>()
    for (const r of allBookmarks) if (r.parentId) parentById.set(r.id, r.parentId)
    let createdFolders = 0
    const appliedSuggestionIds = new Set<string>()

    for (const suggestion of work) {
      try {
        let destinationFolderId = suggestion.targetFolderId
        if (suggestion.kind === 'create_and_move') {
          if (!suggestion.newFolderName) throw new Error('Missing folder name')
          const created = await chrome.bookmarks.create({
            parentId: suggestion.targetFolderId,
            title: suggestion.newFolderName,
          })
          destinationFolderId = created.id
          createdFolders++
        }

        const memberIds = suggestion.memberIds?.length
          ? suggestion.memberIds
          : [suggestion.bookmarkId]
        const batch = await mapLimit(memberIds, BULK_CONCURRENCY, async (bookmarkId) => {
          await moveBookmark(bookmarkId, destinationFolderId)
          return bookmarkId
        })
        for (const b of batch) {
          if (b.ok) {
            movedIds.push(b.value)
            placements[b.value] = destinationFolderId
            const prevParent = parentById.get(b.value)
            if (prevParent && prevParent !== destinationFolderId) {
              reverseAntiMoves.push(`${b.value}::${prevParent}`)
            }
          } else {
            errors.push(b.input)
          }
        }
        appliedSuggestionIds.add(suggestion.id)
      } catch (e) {
        console.error('[Favewise] organize.apply error:', e)
        errors.push(suggestion.bookmarkId)
      }
    }

    if (movedIds.length > 0) {
      await recordOrganizePlacements(placements)
      if (reverseAntiMoves.length > 0) {
        await addOrganizeAntiMoves(reverseAntiMoves)
      }
      await appendOperationLog({
        operationId,
        timestamp: Date.now(),
        actionType: 'move',
        bookmarkIds: movedIds,
        note:
          createdFolders > 0
            ? `Applied ${appliedSuggestionIds.size} organize suggestion(s) · created ${createdFolders} folder(s)`
            : `Applied ${appliedSuggestionIds.size} organize suggestion(s)`,
      })
      await syncScanAfterMutation((s) => ({
        ...s,
        organizeSuggestions: s.organizeSuggestions.filter((sg) => !appliedSuggestionIds.has(sg.id)),
      }))
    }

    return ok({
      movedCount: movedIds.length,
      failedCount: errors.length + protectedSkipped,
      createdFolders,
      protectedSkipped,
    })
  },

  'organize.ignore': async (payload) => {
    const { suggestionIds } = payload
    await addIgnoredSuggestions(suggestionIds)
    await syncScanAfterMutation((s) => ({
      ...s,
      organizeSuggestions: s.organizeSuggestions.filter(
        (sg) => !suggestionIds.includes(sg.id),
      ),
    }))
    return ok({ ignoredCount: suggestionIds.length })
  },

  'organize.analyze': async (payload) => {
    const { scopeFolderId } = payload
    const records = await getAllBookmarks()

    // Reconcile placements on every analyze: pick up any user reversals
    // immediately rather than waiting for the next full scan.
    const parentById = new Map<string, string>()
    for (const r of records) if (r.parentId) parentById.set(r.id, r.parentId)
    await reconcileOrganizePlacements(parentById)

    const ignored = await getIgnoredSuggestions()
    const anti = await getOrganizeAntiMoves()

    const recordById = new Map(records.map((r) => [r.id, r]))

    const buildSnapshot = (suggestions: import('~/shared/types').OrganizeSuggestion[]) => {
      const snap: Record<string, import('~/shared/types').BookmarkRecord> = {}
      for (const s of suggestions) {
        const ids = s.memberIds?.length ? s.memberIds : [s.bookmarkId]
        for (const id of ids) {
          const rec = recordById.get(id)
          if (rec) snap[id] = rec
        }
      }
      return snap
    }

    if (!scopeFolderId) {
      const scan = await getLatestScan()
      const suggestions = scan?.organizeSuggestions ?? []
      return ok({
        scopeFolderId: null,
        scopePath: null,
        suggestions,
        directChildLinkCount: 0,
        directSubfolderCount: 0,
        bookmarkSnapshot: buildSnapshot(suggestions),
      })
    }

    const parent = records.find((r) => r.id === scopeFolderId)
    if (!parent) {
      return err(ERROR_CODES.BOOKMARK_NOT_FOUND, 'Folder not found — it may have been deleted')
    }

    const settings = await getSettings()
    const suggestions = analyzeFolder(records, scopeFolderId, {
      ignoredSuggestionIds: ignored,
      antiMoves: anti,
      protectedFolderIds: settings.protectedFolderIds ?? [],
    })

    const directChildLinkCount = records.filter(
      (r) => r.parentId === scopeFolderId && r.url,
    ).length
    const directSubfolderCount = records.filter(
      (r) => r.parentId === scopeFolderId && !r.url,
    ).length

    return ok({
      scopeFolderId,
      scopePath: [...parent.folderPath, parent.title].filter(Boolean),
      suggestions,
      directChildLinkCount,
      directSubfolderCount,
      bookmarkSnapshot: buildSnapshot(suggestions),
    })
  },

  'organize.antiMoves.clear': async () => {
    await clearOrganizeAntiMoves()
    return ok(null)
  },

  /* ----- Rediscover ----- */

  'rediscover.dismiss': async (payload) => {
    await appendRediscoverHistory(payload.bookmarkId, 'dismissed')
    await syncScanAfterMutation((s) => ({
      ...s,
      rediscoverItems: s.rediscoverItems.filter((r) => r.bookmarkId !== payload.bookmarkId),
    }))
    return ok(null)
  },

  'rediscover.saveForLater': async (payload) => {
    await appendRediscoverHistory(payload.bookmarkId, 'save_for_later')
    await syncScanAfterMutation((s) => ({
      ...s,
      rediscoverItems: s.rediscoverItems.filter((r) => r.bookmarkId !== payload.bookmarkId),
    }))
    return ok(null)
  },

  'savedForLater.get': async () => {
    const history = await getRediscoverHistory()
    const latestByBookmark = new Map<string, { action: string; at: number }>()
    for (const entry of history) {
      const existing = latestByBookmark.get(entry.bookmarkId)
      if (!existing || entry.at > existing.at) {
        latestByBookmark.set(entry.bookmarkId, entry)
      }
    }
    const saved = Array.from(latestByBookmark.entries())
      .filter(([, e]) => e.action === 'save_for_later')
      .map(([bookmarkId, e]) => ({ bookmarkId, at: e.at }))
    return ok(saved)
  },

  'savedForLater.dismiss': async (payload) => {
    await appendRediscoverHistory(payload.bookmarkId, 'dismissed')
    return ok(null)
  },

  /* ----- Trash ----- */

  'trash.get': async () => ok(await getTrashItems()),

  'trash.restore': async (payload) => {
    const { bookmarkIds } = payload
    const trashItems = await getTrashItems()
    const entries = bookmarkIds
      .map((id) => trashItems.find((t) => t.bookmarkId === id))
      .filter((e): e is NonNullable<typeof e> => !!e && !!e.url)

    const operationId = opId()
    let fallbackCount = 0
    const restoredIds: string[] = []
    const errors: string[] = []

    const results = await mapLimit(entries, BULK_CONCURRENCY, async (entry) => {
      const r = await restoreBookmark(entry.title, entry.url!, entry.originalPath)
      if (!r) throw new Error('Restore failed')
      return { id: entry.bookmarkId, usedFallback: r.usedFallback }
    })
    for (const r of results) {
      if (!r.ok) { errors.push(r.input.bookmarkId); continue }
      restoredIds.push(r.value.id)
      if (r.value.usedFallback) fallbackCount++
    }

    if (restoredIds.length > 0) {
      await removeTrashItems(restoredIds)
      await appendOperationLog({
        operationId,
        timestamp: Date.now(),
        actionType: 'restore',
        bookmarkIds: restoredIds,
        note:
          fallbackCount > 0
            ? `Restored ${restoredIds.length} bookmark(s); ${fallbackCount} placed in Other Bookmarks (original folder missing)`
            : `Restored ${restoredIds.length} bookmark(s) from trash`,
      })
    }

    return ok({ restoredCount: restoredIds.length, failedCount: errors.length, fallbackCount })
  },

  'trash.empty': async () => {
    const items = await getTrashItems()
    await clearTrash()
    await appendOperationLog({
      operationId: opId(),
      timestamp: Date.now(),
      actionType: 'delete',
      bookmarkIds: items.map((t) => t.bookmarkId),
      note: `Permanently deleted ${items.length} item(s) from trash`,
    })
    return ok({ deletedCount: items.length })
  },

  /* ----- Ignored lists ----- */

  'ignoredDeadLinks.get':   async () => ok(await getIgnoredDeadLinks()),
  'ignoredDeadLinks.clear': async () => { await clearIgnoredDeadLinks(); return ok(null) },
  'ignoredSuggestions.get': async () => ok(await getIgnoredSuggestions()),
  'ignoredSuggestions.clear':async () => { await clearIgnoredSuggestions(); return ok(null) },

  /* ----- Empty folders ----- */

  'emptyFolders.get': async () => {
    const scan = await getLatestScan()
    return ok(scan?.emptyFolders ?? [])
  },

  'emptyFolders.delete': async (payload) => {
    const { folderIds } = payload
    const scan = await getLatestScan()
    const folderMap = new Map((scan?.emptyFolders ?? []).map((f) => [f.id, f]))

    // Refuse to delete any folder inside a protected subtree, or any folder
    // that IS protected itself.
    const allRecords = await getAllBookmarks()
    const settings = await getSettings()
    const protectedSubtree = expandProtectedSubtree(
      allRecords,
      settings.protectedFolderIds ?? [],
    )
    const allowedFolderIds: string[] = []
    let protectedSkipped = 0
    let staleSkipped = 0
    let nonEmptySkipped = 0
    for (const id of folderIds) {
      if (protectedSubtree.has(id)) {
        protectedSkipped++
        continue
      }
      if (!folderMap.has(id)) {
        staleSkipped++
        continue
      }
      allowedFolderIds.push(id)
    }

    const operationId = opId()
    const errors: string[] = []
    const deletedIds: string[] = []

    const results = await mapLimit(allowedFolderIds, BULK_CONCURRENCY, async (id) => {
      const hasBookmarks = await folderSubtreeHasBookmark(id)
      if (hasBookmarks) return { id, deleted: false as const }
      await chrome.bookmarks.removeTree(id)
      return { id, deleted: true as const }
    })
    for (const r of results) {
      if (!r.ok) { errors.push(r.input); continue }
      if (r.value.deleted) deletedIds.push(r.value.id)
      else nonEmptySkipped++
    }

    if (deletedIds.length > 0) {
      await appendOperationLog({
        operationId,
        timestamp: Date.now(),
        actionType: 'delete',
        bookmarkIds: deletedIds,
        previousFolderPaths: deletedIds.map((id) => {
          const f = folderMap.get(id)
          return f ? [...f.folderPath, f.title] : []
        }),
        note: `Deleted ${deletedIds.length} empty folder${deletedIds.length !== 1 ? 's' : ''}`,
      })

      if (scan) {
        const deletedSet = new Set(deletedIds)
        await syncScanAfterMutation((s) => ({
          ...s,
          emptyFolders: (s.emptyFolders ?? []).filter((f) => !deletedSet.has(f.id)),
        }))
      }
    }

    if (errors.length > 0 && deletedIds.length === 0 && protectedSkipped === 0) {
      return err(ERROR_CODES.PARTIAL_FAILURE, `Failed to delete ${errors.length} folder(s)`, true)
    }
    return ok({
      deletedCount: deletedIds.length,
      failedCount: errors.length + protectedSkipped + staleSkipped + nonEmptySkipped,
      protectedSkipped,
      staleSkipped,
      nonEmptySkipped,
    })
  },

  /* ----- Settings ----- */

  'settings.get':    async () => ok(await getSettings()),
  'settings.update': async (payload) => {
    const updated = await updateSettings(payload)
    // Reflect schedule / theme changes immediately
    if (Object.prototype.hasOwnProperty.call(payload, 'scheduleFrequency')) {
      await refreshScheduleAlarm()
    }
    return ok(updated)
  },

  /* ----- Operation log ----- */

  'operationLog.get':   async () => ok(await getOperationLog()),
  'operationLog.clear': async () => { await clearOperationLog(); return ok(null) },

  /* ----- Folder picker ----- */

  'folders.get': async () => {
    const tree = await chrome.bookmarks.getTree()
    const all = flattenBookmarkTree(tree)
    const linkCountByParent = new Map<string, number>()
    const folderCountByParent = new Map<string, number>()
    for (const n of all) {
      if (!n.parentId) continue
      if (n.url) {
        linkCountByParent.set(n.parentId, (linkCountByParent.get(n.parentId) ?? 0) + 1)
      } else {
        folderCountByParent.set(n.parentId, (folderCountByParent.get(n.parentId) ?? 0) + 1)
      }
    }
    const folders = all
      .filter((b) => !b.url && b.id !== '0')
      .map((b) => ({
        id: b.id,
        title: b.title,
        folderPath: b.folderPath,
        directLinkCount: linkCountByParent.get(b.id) ?? 0,
        directSubfolderCount: folderCountByParent.get(b.id) ?? 0,
      }))
    return ok(folders)
  },

  /* ----- Undo (deferred trash commit) ----- */

  'undo.trash': async (payload) => {
    // Placeholder for symmetrical typing; undo is handled client-side by
    // simply not firing the trash action. Returned for future use.
    return ok({ restoredCount: payload.bookmarkIds.length })
  },

  /* ----- New-bookmark inbox ----- */

  'inbox.get': async () => {
    const entries = (await getNewBookmarkInbox()).filter((e) => !e.dismissedAt)
    return ok({ entries })
  },

  'inbox.dismiss': async (payload) => {
    await markInboxDismissed(payload.bookmarkIds)
    await refreshBadge()
    return ok(null)
  },

  'inbox.apply': async (payload) => {
    try {
      // Verify target folder still exists
      const [target] = await chrome.bookmarks.get(payload.targetFolderId)
      if (!target || target.url) {
        return ok({ ok: false as const, reason: 'Target folder no longer exists' })
      }
      await chrome.bookmarks.move(payload.bookmarkId, {
        parentId: payload.targetFolderId,
      })
      await recordOrganizePlacements({ [payload.bookmarkId]: payload.targetFolderId })
      await removeFromNewBookmarkInbox([payload.bookmarkId])
      await appendOperationLog({
        operationId: opId(),
        timestamp: Date.now(),
        actionType: 'move',
        bookmarkIds: [payload.bookmarkId],
        targetFolderPath: [target.title],
        note: `Quick-categorized new bookmark into "${target.title}"`,
      })
      await refreshBadge()
      return ok({ ok: true as const })
    } catch (e) {
      return ok({
        ok: false as const,
        reason: e instanceof Error ? e.message : 'Move failed',
      })
    }
  },

  /* ----- Onboarding ----- */

  'onboarding.seen.get': async () => ok({ seen: await getOnboardingSeen() }),
  'onboarding.seen.set': async () => { await markOnboardingSeen(); return ok(null) },

  /* ----- Library (manual move / trash) ----- */

  'library.move': async (payload) => {
    const { bookmarkIds, targetFolderId, targetIndex } = payload
    // Include folders too — Library drag-and-drop reorders folders as well.
    const allNodes = await getAllBookmarks()
    const bookmarkMap = buildBookmarkMap(allNodes)
    const settings = await getSettings()
    const protectedSubtree = expandProtectedSubtree(
      allNodes,
      settings.protectedFolderIds ?? [],
    )
    if (protectedSubtree.has(targetFolderId)) {
      return err(
        ERROR_CODES.INVALID_PAYLOAD,
        "Can't move into a protected folder — unprotect it first.",
      )
    }

    const allowedIds = bookmarkIds.filter((id) => !protectedSubtree.has(id))
    const protectedSkipped = bookmarkIds.length - allowedIds.length
    const operationId = opId()
    const movedIds: string[] = []
    const errors: string[] = []

    // When reordering to a specific index, move sequentially with incrementing
    // index so the relative order of the moved batch is preserved. Concurrent
    // writes would race and produce nondeterministic order.
    const reordering = typeof targetIndex === 'number'
    const results = reordering
      ? await (async () => {
          const out: Array<{ ok: true; input: string; value: string } | { ok: false; input: string; error: unknown }> = []
          let idx = targetIndex!
          for (const id of allowedIds) {
            try {
              const bm = bookmarkMap.get(id)
              if (!bm) throw new Error('Bookmark not found')
              await moveBookmark(id, targetFolderId, idx)
              out.push({ ok: true, input: id, value: id })
              idx += 1
            } catch (e) {
              out.push({ ok: false, input: id, error: e })
            }
          }
          return out
        })()
      : await mapLimit(allowedIds, BULK_CONCURRENCY, async (id) => {
          const bm = bookmarkMap.get(id)
          if (!bm) throw new Error('Bookmark not found')
          await moveBookmark(id, targetFolderId)
          return id
        })
    for (const r of results) {
      if (r.ok) movedIds.push(r.value)
      else errors.push(r.input)
    }

    if (movedIds.length > 0) {
      const placements: Record<string, string> = {}
      for (const id of movedIds) placements[id] = targetFolderId
      await recordOrganizePlacements(placements)
      await appendOperationLog({
        operationId,
        timestamp: Date.now(),
        actionType: 'move',
        bookmarkIds: movedIds,
        note: `Manual move of ${movedIds.length} bookmark(s) from Library`,
      })
    }

    return ok({
      movedCount: movedIds.length,
      failedCount: errors.length + protectedSkipped,
      protectedSkipped,
    })
  },

  'library.trash': async (payload) => {
    const { bookmarkIds } = payload
    const allBookmarks = await getAllBookmarkLinks()
    const bookmarkMap = buildBookmarkMap(allBookmarks)
    const protectedBookmarks = await getProtectedBookmarkIds(allBookmarks)
    const allowedIds = bookmarkIds.filter((id) => !protectedBookmarks.has(id))
    const protectedSkipped = bookmarkIds.length - allowedIds.length
    const operationId = opId()
    const trashEntries: TrashEntry[] = []
    const errors: string[] = []

    const results = await mapLimit(allowedIds, BULK_CONCURRENCY, async (id) => {
      const bm = bookmarkMap.get(id)
      if (!bm) throw new Error('Bookmark not found')
      await trashBookmark(bm)
      return bm
    })
    for (const r of results) {
      if (!r.ok) { errors.push(r.input); continue }
      const bm = r.value
      trashEntries.push({
        bookmarkId: bm.id,
        title: bm.title,
        url: bm.url,
        originalPath: bm.folderPath,
        trashedAt: Date.now(),
        operationId,
      })
    }

    if (trashEntries.length > 0) {
      await addTrashItems(trashEntries)
      await appendOperationLog({
        operationId,
        timestamp: Date.now(),
        actionType: 'trash',
        bookmarkIds: trashEntries.map((t) => t.bookmarkId),
        previousFolderPaths: trashEntries.map((t) => t.originalPath),
        targetFolderPath: ['Favewise Trash'],
        note: `Manually trashed ${trashEntries.length} bookmark(s) from Library`,
      })
    }

    return ok({
      trashedCount: trashEntries.length,
      failedCount: errors.length + protectedSkipped,
      protectedSkipped,
    })
  },

  /* ----- Share / Export folder ----- */

  'share.exportFolder': async (payload) => {
    const { folderId, format, includeSubfolders = true } = payload
    const tree = await chrome.bookmarks.getSubTree(folderId)
    const root = tree[0]
    if (!root) return err(ERROR_CODES.BOOKMARK_NOT_FOUND, 'Folder not found')

    const timestamp = new Date().toISOString()
    const safeName = (root.title || 'favewise').replace(/[^a-zA-Z0-9_\-]+/g, '-').slice(0, 60)
    const ts = timestamp.replace(/[:.]/g, '-').slice(0, 19)

    const walkToJson = (node: chrome.bookmarks.BookmarkTreeNode): unknown => {
      if (node.url) return { title: node.title, url: node.url, dateAdded: node.dateAdded }
      if (!includeSubfolders) return null
      return {
        folder: node.title,
        children: (node.children ?? []).map(walkToJson).filter((c) => c !== null),
      }
    }

    const countBookmarks = (node: chrome.bookmarks.BookmarkTreeNode): number => {
      if (node.url) return 1
      if (!includeSubfolders) return 0
      return (node.children ?? []).reduce((a, c) => a + countBookmarks(c), 0)
    }
    const bookmarkCount = countBookmarks(root)

    let content = ''
    let filename = ''

    if (format === 'json') {
      const payload = {
        app: 'favewise',
        exportedAt: timestamp,
        folder: root.title,
        tree: walkToJson(root),
      }
      content = JSON.stringify(payload, null, 2)
      filename = `${safeName}-${ts}.json`
    } else if (format === 'md') {
      const lines: string[] = [`# ${escapeMarkdownText(root.title || 'Bookmarks')}`, '', `Exported from Favewise · ${timestamp}`, '']
      const walkMd = (node: chrome.bookmarks.BookmarkTreeNode, depth: number) => {
        if (node.url) {
          lines.push(`${'  '.repeat(depth)}- ${formatMarkdownLink(node.title || node.url, node.url)}`)
          return
        }
        if (!includeSubfolders && depth > 0) return
        if (depth > 0) {
          lines.push('')
          lines.push(`${'#'.repeat(Math.min(depth + 1, 6))} ${escapeMarkdownText(node.title || 'Untitled folder')}`)
          lines.push('')
        }
        for (const c of node.children ?? []) walkMd(c, depth + 1)
      }
      for (const c of root.children ?? []) walkMd(c, 1)
      content = lines.join('\n')
      filename = `${safeName}-${ts}.md`
    } else {
      // Netscape bookmarks HTML — the portable format every browser imports.
      const esc = (s: string) =>
        s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      const lines: string[] = []
      lines.push('<!DOCTYPE NETSCAPE-Bookmark-file-1>')
      lines.push('<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">')
      lines.push(`<TITLE>${esc(root.title)} · Favewise export</TITLE>`)
      lines.push(`<H1>${esc(root.title)}</H1>`)
      lines.push('<DL><p>')
      const walkHtml = (node: chrome.bookmarks.BookmarkTreeNode, depth: number) => {
        const pad = '    '.repeat(depth + 1)
        if (node.url) {
          const addDate = node.dateAdded ? ` ADD_DATE="${Math.floor(node.dateAdded / 1000)}"` : ''
          lines.push(`${pad}<DT><A HREF="${esc(node.url)}"${addDate}>${esc(node.title || node.url)}</A>`)
          return
        }
        if (!includeSubfolders && depth > 0) return
        if (depth > 0) {
          lines.push(`${pad}<DT><H3>${esc(node.title)}</H3>`)
          lines.push(`${pad}<DL><p>`)
        }
        for (const c of node.children ?? []) walkHtml(c, depth + 1)
        if (depth > 0) lines.push(`${pad}</DL><p>`)
      }
      for (const c of root.children ?? []) walkHtml(c, 0)
      lines.push('</DL><p>')
      content = lines.join('\n')
      filename = `${safeName}-${ts}.html`
    }

    return ok({
      content,
      filename,
      byteSize: new Blob([content]).size,
      bookmarkCount,
    })
  },

  /* ----- Protection advisor ----- */

  'protection.candidates.get': async () => {
    const [records, settings, dismissed] = await Promise.all([
      getAllBookmarks(),
      getSettings(),
      getProtectionDismissals(),
    ])
    const dismissedSet = new Set(dismissed)
    const protectedSet = expandProtectedSubtree(
      records,
      settings.protectedFolderIds ?? [],
    )
    const excludedSet = new Set(settings.excludedFolderIds ?? [])

    // Pre-compute per-folder tallies (recursive for subtree link count).
    const byParent = new Map<string, { links: number; folders: number }>()
    const childFoldersOf = new Map<string, string[]>()
    for (const r of records) {
      if (!r.parentId) continue
      const prev = byParent.get(r.parentId) ?? { links: 0, folders: 0 }
      if (r.url) prev.links++
      else {
        prev.folders++
        const list = childFoldersOf.get(r.parentId) ?? []
        list.push(r.id)
        childFoldersOf.set(r.parentId, list)
      }
      byParent.set(r.parentId, prev)
    }

    const subtreeLinks = new Map<string, number>()
    const computeSubtree = (id: string): number => {
      const cached = subtreeLinks.get(id)
      if (cached !== undefined) return cached
      const direct = byParent.get(id)?.links ?? 0
      const subs = childFoldersOf.get(id) ?? []
      let total = direct
      for (const s of subs) total += computeSubtree(s)
      subtreeLinks.set(id, total)
      return total
    }

    const candidates: Array<{
      id: string
      title: string
      folderPath: string[]
      directLinkCount: number
      directSubfolderCount: number
      totalLinks: number
      score: number
    }> = []

    // System folder IDs — never propose these; they're top-level virtual nodes.
    const systemIds = new Set(['0', '1', '2', '3'])

    for (const r of records) {
      if (r.url) continue
      if (systemIds.has(r.id)) continue
      if (protectedSet.has(r.id)) continue
      if (excludedSet.has(r.id)) continue
      if (dismissedSet.has(r.id)) continue
      if (r.title === 'Favewise Trash') continue

      const counts = byParent.get(r.id) ?? { links: 0, folders: 0 }
      const total = computeSubtree(r.id)
      // Heuristic thresholds:
      //   ≥3 subfolders, total ≥10 links, loose ratio ≤30%
      if (counts.folders < 3) continue
      if (total < 10) continue
      const looseRatio = total > 0 ? counts.links / total : 1
      if (looseRatio > 0.3) continue

      const score = Math.round(
        (1 - looseRatio) * 70 + Math.min(Math.log10(total + 1) * 12, 30),
      )

      candidates.push({
        id: r.id,
        title: r.title,
        folderPath: r.folderPath,
        directLinkCount: counts.links,
        directSubfolderCount: counts.folders,
        totalLinks: total,
        score,
      })
    }

    candidates.sort((a, b) => b.score - a.score)
    return ok({ candidates: candidates.slice(0, 5) })
  },

  'protection.candidates.dismiss': async (payload) => {
    await addProtectionDismissal(payload.folderId)
    return ok(null)
  },

  /* ----- Backup: export / import ----- */

  'backup.export': async () => {
    try {
      const [local, sync] = await Promise.all([
        chrome.storage.local.get(null),
        chrome.storage.sync.get(null).catch(() => ({})),
      ])
      // Exclude volatile caches that bloat exports and contain no settings
      const EXCLUDED_KEYS = new Set([
        'favewise:deadLinkCache',
        'favewise:operationLog',
      ])
      const filterStorage = (data: Record<string, unknown>) => {
        const filtered: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(data)) {
          if (!EXCLUDED_KEYS.has(k)) filtered[k] = v
        }
        return filtered
      }
      const payload = {
        app: 'favewise',
        exportedAt: new Date().toISOString(),
        manifestVersion: chrome.runtime.getManifest().version,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        local: filterStorage(local),
        sync,
      }
      const json = JSON.stringify(payload, null, 2)
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      return ok({
        json,
        filename: `favewise-backup-${ts}.json`,
        byteSize: new Blob([json]).size,
      })
    } catch (e) {
      recordError('backup.export', e)
      return err(ERROR_CODES.UNKNOWN, 'Export failed')
    }
  },

  'backup.import': async (payload) => {
    try {
      if (byteSize(payload.json) > BACKUP_IMPORT_MAX_BYTES) {
        return err(ERROR_CODES.INVALID_PAYLOAD, 'Backup file is too large')
      }
      const parsed = JSON.parse(payload.json)
      if (!parsed || parsed.app !== 'favewise' || !parsed.local) {
        return err(ERROR_CODES.INVALID_PAYLOAD, 'Not a Favewise backup file')
      }
      const schemaVersion = parsed.schemaVersion ?? 1
      if (typeof schemaVersion !== 'number' || schemaVersion < 1 || schemaVersion > CURRENT_SCHEMA_VERSION) {
        return err(ERROR_CODES.INVALID_PAYLOAD, 'Unsupported Favewise backup schema')
      }
      const local = validateBackupArea(parsed.local, { syncOnly: false })
      const sync = parsed.sync === undefined
        ? {}
        : validateBackupArea(parsed.sync, { syncOnly: true })

      // Snapshot current data before importing so we can rollback on failure.
      const snapshot = await chrome.storage.local.get(null)
      let syncSnapshot: Record<string, unknown> = {}
      try { syncSnapshot = await chrome.storage.sync.get(null) } catch { /* ignore */ }

      try {
        // Wipe existing; a subsequent write replaces everything. Users have
        // already confirmed via the UI dialog.
        await chrome.storage.local.clear()
        await chrome.storage.sync.clear()
        await chrome.storage.local.set(local)
        if (Object.keys(sync).length > 0) await chrome.storage.sync.set(sync)

        // Force-write schema version so migrations don't re-run on partial imports
        await chrome.storage.local.set({
          'favewise:schemaVersion': CURRENT_SCHEMA_VERSION,
        })
      } catch (writeError) {
        // Rollback: restore the snapshot we took before clearing.
        recordError('backup.import:write', writeError)
        await restoreStorageSnapshot(snapshot, syncSnapshot)
        return err(ERROR_CODES.UNKNOWN, 'Import failed — your previous data has been restored.')
      }

      return ok({
        keysRestored:
          Object.keys(local).length +
          Object.keys(sync).length,
        schemaVersion,
      })
    } catch (e) {
      recordError('backup.import', e)
      return err(
        ERROR_CODES.INVALID_PAYLOAD,
        e instanceof Error ? e.message : 'Invalid backup file',
      )
    }
  },

  /* ----- Diagnostics ----- */

  'diagnostics.get': async () => {
    const manifest = chrome.runtime.getManifest()
    const [local, sync] = await Promise.all([
      chrome.storage.local.get(null),
      chrome.storage.sync.get(null).catch(() => ({})),
    ])
    const schemaVersion = (local['favewise:schemaVersion'] as number | undefined) ?? 1

    const sizeOf = (v: unknown) => new Blob([JSON.stringify(v ?? null)]).size
    const storageKeys: Array<{ key: string; bytes: number; area: 'local' | 'sync' }> = []
    for (const [k, v] of Object.entries(local)) {
      storageKeys.push({ key: k, bytes: sizeOf(v), area: 'local' })
    }
    for (const [k, v] of Object.entries(sync)) {
      storageKeys.push({ key: k, bytes: sizeOf(v), area: 'sync' })
    }
    storageKeys.sort((a, b) => b.bytes - a.bytes)

    const records = await getAllBookmarks()
    const folders = records.filter((r) => !r.url).length
    const links = records.length - folders

    const scan = await getLatestScan()
    const scanSummary = {
      completedAt: scan?.completedAt ?? null,
      totalBookmarks: scan?.totalBookmarks ?? 0,
      deadLinksChecked: !!scan?.deadLinksChecked,
    }

    const recentErrors = getRecentErrors()

    // Build copy-friendly report
    const formatBytes = (b: number) =>
      b < 1024 ? `${b} B` :
        b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` :
          `${(b / 1024 / 1024).toFixed(2)} MB`
    const lines: string[] = []
    lines.push(`Favewise Diagnostic Report`)
    lines.push(`────────────────────────────`)
    lines.push(`Version: ${manifest.version}`)
    lines.push(`Schema: v${schemaVersion}`)
    lines.push(`User-Agent: ${navigator.userAgent}`)
    lines.push(``)
    lines.push(`Library`)
    lines.push(`  Total records: ${records.length.toLocaleString()}`)
    lines.push(`  Folders: ${folders.toLocaleString()}`)
    lines.push(`  Bookmarks: ${links.toLocaleString()}`)
    lines.push(``)
    lines.push(`Last scan`)
    lines.push(
      `  Completed: ${scanSummary.completedAt ? new Date(scanSummary.completedAt).toISOString() : 'never'}`,
    )
    lines.push(`  Total at scan: ${scanSummary.totalBookmarks.toLocaleString()}`)
    lines.push(`  Dead-link check: ${scanSummary.deadLinksChecked ? 'done' : 'pending'}`)
    lines.push(``)
    lines.push(`Storage (top 10)`)
    for (const k of storageKeys.slice(0, 10)) {
      lines.push(`  [${k.area}] ${k.key}: ${formatBytes(k.bytes)}`)
    }
    if (recentErrors.length > 0) {
      lines.push(``)
      lines.push(`Recent errors (${recentErrors.length})`)
      for (const e of recentErrors.slice(0, 20)) {
        lines.push(`  ${new Date(e.at).toISOString()} — ${e.message}`)
      }
    }

    return ok({
      version: manifest.version,
      userAgent: navigator.userAgent,
      schemaVersion,
      storageKeys: storageKeys.slice(0, 30),
      bookmarks: { total: records.length, folders, links },
      scan: scanSummary,
      recentErrors,
      report: lines.join('\n'),
    })
  },

  /* ----- Tags ----- */

  'tags.get': async () => {
    const tags = await getTags()
    return ok(tags)
  },

  'tags.create': async (payload) => {
    if (!payload.name?.trim()) return err(ERROR_CODES.INVALID_PAYLOAD, 'Tag name is required')
    const tag = await createTag(payload.name, payload.color)
    return ok(tag)
  },

  'tags.update': async (payload) => {
    const tag = await updateTag(payload.id, payload)
    if (!tag) return err(ERROR_CODES.INVALID_PAYLOAD, 'Tag not found')
    return ok(tag)
  },

  'tags.delete': async (payload) => {
    await deleteTag(payload.id)
    return ok(null)
  },

  'tags.assign': async (payload) => {
    await addTagsToBookmark(payload.bookmarkId, payload.tagIds)
    return ok(null)
  },

  'tags.unassign': async (payload) => {
    await removeTagsFromBookmark(payload.bookmarkId, payload.tagIds)
    return ok(null)
  },

  'tags.getForBookmark': async (payload) => {
    const tags = await getTagsForBookmark(payload.bookmarkId)
    return ok(tags)
  },

  'tags.search': async (payload) => {
    const tags = await searchTags(payload.query)
    return ok(tags)
  },

  'tags.findByBookmarkIds': async (payload) => {
    const allTags = await getTags()
    const tagMap = new Map(allTags.map((t) => [t.id, t]))
    const result: Record<string, typeof allTags> = {}
    for (const bmId of payload.bookmarkIds) {
      const tags = await getTagsForBookmark(bmId)
      if (tags.length > 0) result[bmId] = tags
    }
    return ok(result)
  },

  'tags.getBookmarkTagsMap': async () => {
    const { getBookmarkTagsMap } = await import('~/shared/storage')
    const map = await getBookmarkTagsMap()
    return ok(map)
  },

  /* ----- Smart folders ----- */

  'smartFolders.get': async () => {
    const folders = await getSmartFolders()
    return ok(folders)
  },

  'smartFolders.create': async (payload) => {
    if (!payload.name?.trim()) return err(ERROR_CODES.INVALID_PAYLOAD, 'Smart folder name is required')
    if (!payload.rules?.length) return err(ERROR_CODES.INVALID_PAYLOAD, 'At least one rule is required')
    const folder = await createSmartFolder(payload.name, payload.rules, payload.sortBy, payload.sortOrder)
    return ok(folder)
  },

  'smartFolders.update': async (payload) => {
    const folder = await updateSmartFolder(payload.id, payload)
    if (!folder) return err(ERROR_CODES.INVALID_PAYLOAD, 'Smart folder not found')
    return ok(folder)
  },

  'smartFolders.delete': async (payload) => {
    await deleteSmartFolder(payload.id)
    return ok(null)
  },

  'smartFolders.evaluate': async (payload) => {
    const sf = await getSmartFolder(payload.id)
    if (!sf) return err(ERROR_CODES.INVALID_PAYLOAD, 'Smart folder not found')

    const cached = smartFolderCache.get(payload.id)
    if (cached && Date.now() - cached.at < SMART_FOLDER_CACHE_TTL) {
      return ok({ bookmarkIds: cached.ids })
    }

    const allBookmarks = await getAllBookmarks()
    const bookmarkTagsMap = await getBookmarkTagsMap()
    const matchingIds: string[] = []

    for (const bm of allBookmarks) {
      if (!bm.url) continue
      let matches = true
      for (const rule of sf.rules) {
        if (!matchesRule(bm, rule, bookmarkTagsMap)) {
          matches = false
          break
        }
      }
      if (matches) matchingIds.push(bm.id)
    }

    smartFolderCache.set(payload.id, { ids: matchingIds, at: Date.now() })
    return ok({ bookmarkIds: matchingIds })
  },

  /* ----- Find & Replace ----- */

  'findReplace.preview': async (payload) => {
    if (!payload.find?.trim()) return ok({ matches: [] })

    const allBookmarks = await getAllBookmarks()
    const targetIds = payload.bookmarkIds ? new Set(payload.bookmarkIds) : null
    const matches: Array<{
      id: string
      title: string
      url: string
      titleBefore?: string
      titleAfter?: string
      urlBefore?: string
      urlAfter?: string
    }> = []

    for (const bm of allBookmarks) {
      if (!bm.url) continue
      if (targetIds && !targetIds.has(bm.id)) continue

      let titleBefore: string | undefined
      let titleAfter: string | undefined
      let urlBefore: string | undefined
      let urlAfter: string | undefined

      if (payload.findIn.includes('title')) {
        titleBefore = bm.title ?? ''
        if (containsFind(titleBefore, payload.find, payload.caseSensitive)) {
          titleAfter = applyReplace(titleBefore, payload.find, payload.replace, payload.caseSensitive)
        }
      }

      if (payload.findIn.includes('url')) {
        urlBefore = bm.url
        if (containsFind(urlBefore, payload.find, payload.caseSensitive)) {
          urlAfter = applyReplace(urlBefore, payload.find, payload.replace, payload.caseSensitive)
        }
      }

      if (titleAfter || urlAfter) {
        matches.push({
          id: bm.id,
          title: bm.title ?? '',
          url: bm.url,
          titleBefore,
          titleAfter,
          urlBefore,
          urlAfter,
        })
      }

      if (matches.length >= 50) break
    }

    return ok({ matches, totalCount: matches.length >= 50 ? allBookmarks.filter((bm) => bm.url && (!targetIds || targetIds.has(bm.id))).length : undefined })
  },

  'findReplace.execute': async (payload) => {
    if (!payload.find?.trim()) return ok({ updatedCount: 0 })

    const allBookmarks = await getAllBookmarks()
    const targetIds = new Set(payload.bookmarkIds)
    let updatedCount = 0

    for (const bm of allBookmarks) {
      if (!bm.id || !bm.url || !targetIds.has(bm.id)) continue

      const newTitle = payload.replaceIn.includes('title')
        ? applyReplace(bm.title ?? '', payload.find, payload.replace, payload.caseSensitive)
        : bm.title
      const newUrl = payload.replaceIn.includes('url')
        ? applyReplace(bm.url, payload.find, payload.replace, payload.caseSensitive)
        : bm.url

      if (newTitle !== bm.title || newUrl !== bm.url) {
        if (newUrl !== bm.url) {
          try { new URL(newUrl) } catch { continue }
        }
        try {
          await chrome.bookmarks.update(bm.id, { title: newTitle, url: newUrl })
          updatedCount++
        } catch (e) {
          recordError('findReplace.execute', e)
        }
      }
    }

    if (updatedCount > 0) {
      markBookmarkTreeDirty().catch(() => {})
    }

    return ok({ updatedCount })
  },

  /* ----- Quick save ----- */

  'quickSave.getState': async () => {
    const settings = await getSettings()
    let lastFolderTitle: string | undefined
    if (settings.lastSaveFolderId) {
      try {
        const [node] = await chrome.bookmarks.get(settings.lastSaveFolderId)
        if (node?.title) lastFolderTitle = node.title
      } catch { /* folder may have been deleted */ }
    }
    return ok({
      lastFolderId: settings.lastSaveFolderId,
      lastFolderTitle,
    })
  },

  'quickSave.execute': async (payload) => {
    const { url, title, folderId, tagIds } = payload

    const created = await chrome.bookmarks.create({
      parentId: folderId,
      title,
      url,
    })

    if (tagIds?.length) {
      await addTagsToBookmark(created.id, tagIds)
    }

    await updateSettings({ lastSaveFolderId: folderId })
    markBookmarkTreeDirty().catch(() => {})

    return ok({ bookmarkId: created.id })
  },

  'quickSave.getFolders': async () => {
    const records = await getAllBookmarks()
    const folders = records
      .filter((r) => !r.url && r.id !== '0' && r.id !== '3')
      .map((r) => ({
        id: r.id,
        title: r.title || '(untitled)',
        path: r.folderPath ?? [],
      }))
      .sort((a, b) => a.title.localeCompare(b.title))
    return ok(folders)
  },
}

const dispatch = createDispatcher(handlers)

/* ============================================================
 * Chrome bookmark event listeners — keep Favewise state in sync with
 * the browser in real time, without requiring the user to hit Sync.
 *
 *   onCreated  → run URL taxonomy, queue into new-bookmark inbox
 *   onRemoved  → prune placements / scan cache / inbox
 *   onChanged  → invalidate dead-link cache for title/URL edits
 *   onMoved    → reconcile placements; if source or dest is protected,
 *                surface nothing automatic (user intent is manual)
 * ============================================================ */

async function handleBookmarkCreated(
  id: string,
  node: chrome.bookmarks.BookmarkTreeNode,
): Promise<void> {
  // Any tree change invalidates the scan cache — mark dirty.
  markBookmarkTreeDirty().catch(() => {})
  if (!node.url || !node.parentId) return // folders get skipped
  try {
    const category = categorizeUrl(node.url)

    // Try to find a sibling folder whose name matches the suggested label
    let suggestedFolderId: string | undefined
    let suggestedFolderTitle: string | undefined
    if (category && category.confidence >= 0.7) {
      try {
        const siblings = await chrome.bookmarks.getChildren(node.parentId)
        for (const s of siblings) {
          if (s.url) continue
          if (s.title.toLowerCase() === category.label.toLowerCase()) {
            suggestedFolderId = s.id
            suggestedFolderTitle = s.title
            break
          }
        }
      } catch { /* ignore */ }
    }

    await appendNewBookmarkInbox({
      bookmarkId: id,
      createdAt: Date.now(),
      title: node.title ?? '',
      url: node.url,
      parentId: node.parentId,
      suggestedLabel: category?.label,
      suggestedFolderId,
      suggestedFolderTitle,
    })
    broadcast({
      type: 'inbox.updated',
      payload: { count: 1 },
    })
  } catch (e) {
    console.warn('[Favewise] onCreated handler failed:', e)
  }
}

async function handleBookmarkRemoved(
  id: string,
  info: {
    parentId?: string
    index?: number
    node?: chrome.bookmarks.BookmarkTreeNode
  },
): Promise<void> {
  markBookmarkTreeDirty().catch(() => {})
  // Collect every descendant id of the removed subtree via the info blob,
  // which includes the full removed tree.
  const toRemove = new Set<string>([id])
  const walk = (n: chrome.bookmarks.BookmarkTreeNode) => {
    toRemove.add(n.id)
    if (n.children) for (const c of n.children) walk(c)
  }
  if (info.node) walk(info.node)
  await pruneStateForRemovedBookmarks(toRemove)
}

async function handleBookmarkChanged(
  id: string,
  info: { title?: string; url?: string },
): Promise<void> {
  markBookmarkTreeDirty().catch(() => {})
  // Invalidate cached dead-link result when the URL changes — title-only
  // edits don't need to touch the cache, just the snapshot.
  if (info.url) {
    const scan = await getLatestScan()
    if (scan?.deadLinkCache?.[id]) {
      const cache = { ...scan.deadLinkCache }
      delete cache[id]
      await saveLatestScan(
        {
          ...scan,
          deadLinkCache: cache,
          deadLinks: (scan.deadLinks ?? []).filter((d) => d.bookmarkId !== id),
          bookmarkUrlMap: scan.bookmarkUrlMap
            ? { ...scan.bookmarkUrlMap, [id]: info.url }
            : scan.bookmarkUrlMap,
        },
        { updateHistory: false },
      )
    }
  }
}

async function handleBookmarkMoved(
  id: string,
  info: { parentId: string; index: number; oldParentId: string; oldIndex: number },
): Promise<void> {
  markBookmarkTreeDirty().catch(() => {})
  // If Favewise had previously placed this bookmark and the user moved it
  // elsewhere, treat that as a rejection and record an anti-move so we never
  // suggest that destination again.
  const placements = await (async () => {
    const raw = await chrome.storage.local.get('favewise:organizePlacements')
    return (raw['favewise:organizePlacements'] as Record<string, string> | undefined) ?? {}
  })()
  const placedAt = placements[id]
  if (placedAt && info.oldParentId === placedAt) {
    await addOrganizeAntiMoves([`${id}::${placedAt}`])
    const { [id]: _removed, ...rest } = placements
    void _removed
    await chrome.storage.local.set({ 'favewise:organizePlacements': rest })
  }
}

export default defineBackground(() => {
  configurePrimaryPanelBehavior().catch(() => {})

  // Run any pending storage migrations, then wire up listeners. Both are safe
  // to run multiple times (idempotent).
  runStorageMigrations()
    .catch((e) => console.warn('[Favewise] migration error:', e))
    .finally(() => {
      wireBookmarkListeners()
      wireOmnibox()
      wireAlarms()
      refreshScheduleAlarm().catch(() => {})
      refreshBadge().catch(() => {})
    })

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message !== 'object' || !('type' in message)) {
      sendResponse(err(ERROR_CODES.INVALID_PAYLOAD, 'Message must have a `type` field'))
      return false
    }
    dispatch(message as { type: string; payload?: unknown; requestId?: string })
      .then(sendResponse)
      .catch((e) => {
        console.error('[Favewise] Dispatch error:', e)
        sendResponse(err(ERROR_CODES.UNKNOWN, e instanceof Error ? e.message : String(e)))
      })
    return true
  })
})
