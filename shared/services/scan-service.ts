import { getAllBookmarks } from './bookmark-service'
import { checkUrls, getDeadLinkSkipReason } from './dead-link-service'
import { findExactDuplicates } from './duplicate-service'
import { generateRediscoverItems } from './rediscover-service'
import { generateOrganizeSuggestions } from './organize-service'
import {
  getLatestScan,
  getSettings,
  getIgnoredSuggestions,
  getIgnoredDeadLinks,
  getRediscoverHistory,
  getOrganizeAntiMoves,
  reconcileOrganizePlacements,
  saveLatestScan,
} from '~/shared/storage'
import { buildBookmarkMap, getBookmarkLinks } from '~/shared/utils/bookmark-tree'
import type {
  BookmarkRecord,
  EmptyFolder,
  ScanResult,
  ScanProgressEvent,
} from '~/shared/types'

type ProgressCallback = (event: ScanProgressEvent['payload']) => void
type DeadLinksProgressCallback = (event: {
  taskId: string
  processed: number
  total: number
  status: 'checking' | 'paused' | 'completed'
}) => void

/** Chrome system folder IDs that should never be reported as empty */
const SYSTEM_FOLDER_IDS = new Set(['0', '1', '2', '3'])

/**
 * Detect empty folders (including "deep empty" folders — a folder whose
 * entire subtree contains zero bookmark links, regardless of sub-folder
 * depth). Returns the top-most empty folder in each branch so the user
 * can collapse a whole empty subtree with one action.
 */
function findEmptyFolders(allRecords: BookmarkRecord[]): EmptyFolder[] {
  // Group children by parentId
  const childrenOf = new Map<string, BookmarkRecord[]>()
  for (const r of allRecords) {
    if (!r.parentId) continue
    const list = childrenOf.get(r.parentId) ?? []
    list.push(r)
    childrenOf.set(r.parentId, list)
  }

  // Memoized "does subtree have any link?" — dead-simple recursion with cache
  const cache = new Map<string, boolean>()
  const hasLink = (id: string): boolean => {
    if (cache.has(id)) return cache.get(id)!
    const kids = childrenOf.get(id) ?? []
    for (const k of kids) {
      if (k.url) { cache.set(id, true); return true }
      if (hasLink(k.id)) { cache.set(id, true); return true }
    }
    cache.set(id, false)
    return false
  }

  const emptyIds = new Set<string>()
  for (const r of allRecords) {
    if (r.url) continue
    if (SYSTEM_FOLDER_IDS.has(r.id)) continue
    if (r.title === 'Favewise Trash') continue
    if (!hasLink(r.id)) emptyIds.add(r.id)
  }

  // Keep only top-most empty ancestors (if parent is empty, skip its children)
  const topMostEmpty = new Set<string>()
  for (const id of emptyIds) {
    const rec = allRecords.find((r) => r.id === id)
    if (!rec) continue
    let hasEmptyAncestor = false
    let parentId = rec.parentId
    while (parentId) {
      if (emptyIds.has(parentId)) { hasEmptyAncestor = true; break }
      const parent = allRecords.find((r) => r.id === parentId)
      parentId = parent?.parentId
    }
    if (!hasEmptyAncestor) topMostEmpty.add(id)
  }

  return allRecords
    .filter((r) => topMostEmpty.has(r.id))
    .map((r) => ({ id: r.id, title: r.title, folderPath: r.folderPath }))
}

/**
 * Expand a set of excluded folder IDs to include all their descendants
 * using a single iterative DFS (O(n), not O(n²) like before).
 */
function expandExcludedFolderIds(
  allRecords: BookmarkRecord[],
  excludedFolderIds: string[],
): Set<string> {
  const childrenOf = new Map<string, string[]>()
  for (const r of allRecords) {
    if (r.url || !r.parentId) continue
    const list = childrenOf.get(r.parentId) ?? []
    list.push(r.id)
    childrenOf.set(r.parentId, list)
  }
  const excluded = new Set<string>()
  const stack = [...excludedFolderIds]
  while (stack.length > 0) {
    const id = stack.pop()!
    if (excluded.has(id)) continue
    excluded.add(id)
    const kids = childrenOf.get(id) ?? []
    for (const k of kids) stack.push(k)
  }
  return excluded
}

let activeScanId: string | null = null
let activeDeadLinksTaskId: string | null = null
let deadLinksCancelRequested = false
let scanCancelRequested = false

export function isScanning(): boolean {
  return activeScanId !== null
}

export function isDeadLinksChecking(): boolean {
  return activeDeadLinksTaskId !== null
}

export function cancelDeadLinksCheck(): boolean {
  if (!activeDeadLinksTaskId) return false
  deadLinksCancelRequested = true
  return true
}

export function cancelScan(): boolean {
  if (!activeScanId) return false
  scanCancelRequested = true
  return true
}

function buildBookmarkUrlMap(bookmarks: BookmarkRecord[]): Record<string, string> {
  return Object.fromEntries(bookmarks.filter((b) => b.url).map((b) => [b.id, b.url!]))
}

function getReferencedSnapshot(
  bookmarks: BookmarkRecord[],
  problemLinks: ScanResult['deadLinks'],
  duplicateGroups: ScanResult['duplicateGroups'],
  rediscoverItems: ScanResult['rediscoverItems'],
  organizeSuggestions: ScanResult['organizeSuggestions'] = [],
): Record<string, BookmarkRecord> {
  const bookmarkMap = buildBookmarkMap(bookmarks)
  const referencedIds = new Set<string>([
    ...problemLinks.map((d) => d.bookmarkId),
    ...duplicateGroups.flatMap((g) => g.bookmarkIds),
    ...rediscoverItems.map((r) => r.bookmarkId),
    ...organizeSuggestions.map((s) => s.bookmarkId),
  ])
  const bookmarkSnapshot: Record<string, BookmarkRecord> = {}
  for (const id of referencedIds) {
    const bm = bookmarkMap.get(id)
    if (bm) bookmarkSnapshot[id] = bm
  }
  return bookmarkSnapshot
}

function rebuildDeadLinks(scan: ScanResult): ScanResult['deadLinks'] {
  return Object.values(scan.deadLinkCache ?? {}).filter((d) => d.status !== 'valid')
}

function makeSkippedDeadLinkResult(bookmarkId: string, url: string, reason: string): ScanResult['deadLinks'][number] {
  return {
    bookmarkId,
    url,
    status: 'suspicious',
    checkedAt: Date.now(),
    reason,
    skipped: true,
  }
}

export async function runScan(
  taskId: string,
  onProgress?: ProgressCallback,
): Promise<ScanResult> {
  activeScanId = taskId
  scanCancelRequested = false
  const startedAt = Date.now()

  try {
    onProgress?.({ taskId, stage: 'snapshotting' })
    const allRecords = await getAllBookmarks()
    const settings = await getSettings()
    const previous = await getLatestScan()
    const ignoredDeadLinks = await getIgnoredDeadLinks()
    const rediscoverHistory = await getRediscoverHistory()

    const excludedIds = expandExcludedFolderIds(allRecords, settings.excludedFolderIds)
    const bookmarks = getBookmarkLinks(allRecords)
    const filtered = bookmarks.filter((b) => !excludedIds.has(b.parentId ?? ''))
    const bookmarkUrlMap = buildBookmarkUrlMap(filtered)
    const previousCache = previous?.deadLinkCache ?? {}
    const previousUrlMap = previous?.bookmarkUrlMap ?? {}
    const deadLinkCache: Record<string, NonNullable<ScanResult['deadLinkCache']>[string]> = {}

    for (const bookmark of filtered) {
      const url = bookmark.url
      if (!url) continue
      const skipReason = getDeadLinkSkipReason(url)
      if (skipReason) {
        deadLinkCache[bookmark.id] = makeSkippedDeadLinkResult(bookmark.id, url, skipReason)
        continue
      }
      const cached = previousCache[bookmark.id]
      if (cached && previousUrlMap[bookmark.id] === url) {
        deadLinkCache[bookmark.id] = cached
      }
    }

    onProgress?.({ taskId, stage: 'detecting_duplicates' })
    const duplicateGroups = findExactDuplicates(filtered)

    onProgress?.({ taskId, stage: 'generating_organize_suggestions' })
    // Reconcile placements first: detect any user-driven reversals and update
    // the anti-move list before generating fresh suggestions.
    const currentParentById = new Map<string, string>()
    for (const r of allRecords) if (r.parentId) currentParentById.set(r.id, r.parentId)
    await reconcileOrganizePlacements(currentParentById)

    const ignoredSuggestions = await getIgnoredSuggestions()
    const antiMoves = await getOrganizeAntiMoves()

    const organizeSuggestions = generateOrganizeSuggestions(filtered, {
      ignoredSuggestionIds: ignoredSuggestions,
      antiMoves,
      scopeFolderId: settings.organizeScopeFolderId ?? null,
      protectedFolderIds: settings.protectedFolderIds ?? [],
    })

    onProgress?.({ taskId, stage: 'generating_rediscover' })
    const dismissedSet = new Set<string>(
      rediscoverHistory
        .filter((h) => h.action !== 'opened')
        .map((h) => h.bookmarkId),
    )
    const rediscoverItems = generateRediscoverItems(filtered, dismissedSet)

    onProgress?.({ taskId, stage: 'detecting_empty_folders' })
    const emptyFolders = findEmptyFolders(allRecords)

    const ignoredSet = new Set(ignoredDeadLinks)
    const problemLinks = Object.values(deadLinkCache).filter(
      (d) => d.status !== 'valid' && !ignoredSet.has(d.bookmarkId),
    )
    const bookmarkSnapshot = getReferencedSnapshot(
      filtered,
      problemLinks,
      duplicateGroups,
      rediscoverItems,
      organizeSuggestions,
    )
    const totalDeadLinkTargets = filtered.length
    const checkedCount = Object.keys(deadLinkCache).length

    const result: ScanResult = {
      id: taskId,
      startedAt,
      completedAt: Date.now(),
      status: 'completed',
      totalBookmarks: bookmarks.length,
      deadLinksChecked: totalDeadLinkTargets > 0 && checkedCount === totalDeadLinkTargets,
      deadLinkState: {
        status: previous?.deadLinkState?.status === 'paused' ? 'paused' : 'idle',
        processed: checkedCount,
        total: totalDeadLinkTargets,
        lastRunAt: previous?.deadLinkState?.lastRunAt,
      },
      deadLinks: problemLinks,
      deadLinkCache,
      bookmarkUrlMap,
      duplicateGroups,
      organizeSuggestions,
      rediscoverItems,
      emptyFolders,
      bookmarkSnapshot,
    }

    await saveLatestScan(result)
    return result
  } catch (err) {
    const failed: ScanResult = {
      id: taskId,
      startedAt,
      completedAt: Date.now(),
      status: 'failed',
      totalBookmarks: 0,
      deadLinksChecked: false,
      deadLinkState: {
        status: 'idle',
        processed: 0,
        total: 0,
      },
      deadLinks: [],
      deadLinkCache: {},
      bookmarkUrlMap: {},
      duplicateGroups: [],
      organizeSuggestions: [],
      rediscoverItems: [],
      emptyFolders: [],
      bookmarkSnapshot: {},
    }
    await saveLatestScan(failed)
    throw err
  } finally {
    activeScanId = null
    scanCancelRequested = false
  }
}

export async function runDeadLinksCheck(
  taskId: string,
  options: { forceFull?: boolean } = {},
  onProgress?: DeadLinksProgressCallback,
): Promise<ScanResult> {
  if (activeDeadLinksTaskId) {
    throw new Error('A dead-link check is already in progress')
  }

  activeDeadLinksTaskId = taskId
  deadLinksCancelRequested = false

  try {
    const current = await getLatestScan()
    const settings = await getSettings()
    const allRecords = await getAllBookmarks()
    const ignoredDeadLinks = await getIgnoredDeadLinks()
    const ignoredSet = new Set(ignoredDeadLinks)
    const excludedIds = expandExcludedFolderIds(allRecords, settings.excludedFolderIds)
    const bookmarks = getBookmarkLinks(allRecords)
    const filtered = bookmarks
      .filter((b) => !excludedIds.has(b.parentId ?? ''))
      .filter((b) => !ignoredSet.has(b.id))
    const bookmarkUrlMap = buildBookmarkUrlMap(filtered)
    const existingCache = options.forceFull ? {} : { ...(current?.deadLinkCache ?? {}) }

    for (const bookmarkId of Object.keys(existingCache)) {
      if (bookmarkUrlMap[bookmarkId] !== existingCache[bookmarkId]?.url) {
        delete existingCache[bookmarkId]
      }
    }

    const pending = filtered.filter((bookmark) => {
      if (!bookmark.url) return false
      const skipReason = getDeadLinkSkipReason(bookmark.url)
      if (skipReason) {
        existingCache[bookmark.id] = makeSkippedDeadLinkResult(bookmark.id, bookmark.url, skipReason)
        return false
      }
      if (options.forceFull) return true
      const cached = existingCache[bookmark.id]
      return !cached || cached.url !== bookmark.url
    })

    const total = filtered.length
    let processed = total - pending.length

    const baseScan: ScanResult = current ?? {
      id: taskId,
      startedAt: Date.now(),
      completedAt: Date.now(),
      status: 'completed',
      totalBookmarks: bookmarks.length,
      deadLinksChecked: false,
      deadLinkState: { status: 'idle', processed: 0, total },
      deadLinks: [],
      deadLinkCache: {},
      bookmarkUrlMap,
      duplicateGroups: [],
      organizeSuggestions: [],
      rediscoverItems: [],
      emptyFolders: [],
      bookmarkSnapshot: {},
    }

    let workingScan: ScanResult = {
      ...baseScan,
      bookmarkUrlMap,
      deadLinkCache: existingCache,
      deadLinkState: {
        status: 'checking',
        processed,
        total,
        lastRunAt: Date.now(),
      },
      completedAt: Date.now(),
    }

    onProgress?.({ taskId, processed, total, status: 'checking' })
    await saveLatestScan(workingScan, { updateHistory: false })

    for (let i = 0; i < pending.length; i += settings.maxConcurrentChecks) {
      if (deadLinksCancelRequested) {
        workingScan = {
          ...workingScan,
          deadLinksChecked: false,
          deadLinkState: {
            status: 'paused',
            processed,
            total,
            lastRunAt: workingScan.deadLinkState?.lastRunAt,
          },
          deadLinks: rebuildDeadLinks(workingScan),
          bookmarkSnapshot: getReferencedSnapshot(
            filtered,
            rebuildDeadLinks(workingScan),
            workingScan.duplicateGroups,
            workingScan.rediscoverItems,
          ),
          completedAt: Date.now(),
        }
        await saveLatestScan(workingScan)
        onProgress?.({ taskId, processed, total, status: 'paused' })
        return workingScan
      }

      const batch = pending.slice(i, i + settings.maxConcurrentChecks)
      const batchResults = await checkUrls(
        batch.map((bookmark) => ({ id: bookmark.id, url: bookmark.url! })),
        {
          timeoutMs: settings.scanTimeoutMs,
          maxConcurrent: settings.maxConcurrentChecks,
        },
      )

      for (const result of batchResults) {
        existingCache[result.bookmarkId] = result
      }

      processed += batch.length
      workingScan = {
        ...workingScan,
        deadLinkCache: { ...existingCache },
        deadLinksChecked: processed === total,
        deadLinkState: {
          status: processed === total ? 'completed' : 'checking',
          processed,
          total,
          lastRunAt: workingScan.deadLinkState?.lastRunAt,
        },
        deadLinks: Object.values(existingCache).filter((d) => d.status !== 'valid'),
        bookmarkSnapshot: getReferencedSnapshot(
          filtered,
          Object.values(existingCache).filter((d) => d.status !== 'valid'),
          workingScan.duplicateGroups,
          workingScan.rediscoverItems,
        ),
        completedAt: Date.now(),
      }

      await saveLatestScan(workingScan, { updateHistory: false })
      onProgress?.({
        taskId,
        processed,
        total,
        status: processed === total ? 'completed' : 'checking',
      })
    }

    const completedScan: ScanResult = {
      ...workingScan,
      deadLinksChecked: true,
      deadLinkState: {
        status: 'completed' as const,
        processed: total,
        total,
        lastRunAt: workingScan.deadLinkState?.lastRunAt,
      },
      deadLinks: rebuildDeadLinks(workingScan),
      bookmarkSnapshot: getReferencedSnapshot(
        filtered,
        rebuildDeadLinks(workingScan),
        workingScan.duplicateGroups,
        workingScan.rediscoverItems,
      ),
      completedAt: Date.now(),
    }

    await saveLatestScan(completedScan)
    onProgress?.({ taskId, processed: total, total, status: 'completed' })
    return completedScan
  } finally {
    activeDeadLinksTaskId = null
    deadLinksCancelRequested = false
  }
}
