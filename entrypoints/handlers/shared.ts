import { expandProtectedSubtree } from '~/shared/lib/protected-folders'
import { getSettings } from '~/shared/storage'

interface ErrorEntry { at: number; message: string }

const ERROR_BUFFER: ErrorEntry[] = []
const ERROR_BUFFER_MAX = 50

export function recordError(context: string, err: unknown) {
  const message = err instanceof Error ? `${context}: ${err.message}` : `${context}: ${String(err)}`
  ERROR_BUFFER.push({ at: Date.now(), message })
  while (ERROR_BUFFER.length > ERROR_BUFFER_MAX) ERROR_BUFFER.shift()
  console.error('[Favewise]', message)
}

export function getRecentErrors(): ErrorEntry[] {
  return [...ERROR_BUFFER].reverse()
}

export function opId(): string {
  return `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

export const BULK_CONCURRENCY = 4

export async function getProtectedBookmarkIds(
  records: Array<{ id: string; url?: string; parentId?: string }>,
): Promise<Set<string>> {
  const settings = await getSettings()
  const protectedFolders = expandProtectedSubtree(
    records,
    settings.protectedFolderIds ?? [],
  )
  const bookmarkIds = new Set<string>()
  for (const r of records) {
    if (r.url && r.parentId && protectedFolders.has(r.parentId)) {
      bookmarkIds.add(r.id)
    }
  }
  return bookmarkIds
}

export async function syncScanAfterMutation(
  updater: (scan: import('~/shared/types').ScanResult) => import('~/shared/types').ScanResult,
): Promise<void> {
  const { getLatestScan, saveLatestScan } = await import('~/shared/storage')
  const scan = await getLatestScan()
  if (!scan) return
  await saveLatestScan(updater(scan), { updateHistory: false })
}

export function pruneSnapshot(
  snapshot: Record<string, unknown> | undefined,
  removeIds: Iterable<string>,
): Record<string, unknown> {
  const next = { ...(snapshot ?? {}) }
  for (const id of removeIds) delete next[id]
  return next
}

export async function folderSubtreeHasBookmark(folderId: string): Promise<boolean> {
  const [root] = await chrome.bookmarks.getSubTree(folderId)
  if (!root) return false
  const stack = [root]
  while (stack.length) {
    const node = stack.pop()!
    if (node.url) return true
    for (const child of node.children ?? []) stack.push(child)
  }
  return false
}

export function isSameScannedUrl(
  currentUrl: string | undefined,
  scannedUrl: string | undefined,
): boolean {
  return !!currentUrl && !!scannedUrl && currentUrl === scannedUrl
}

export function isStillInDuplicateGroup(
  currentUrl: string | undefined,
  canonicalUrl: string | undefined,
): boolean {
  if (!currentUrl || !canonicalUrl) return false
  return currentUrl === canonicalUrl
}

export function hasValidDuplicateKeep(
  keepBookmarkIds: string[],
  expectedGroup: { bookmarkIds: string[]; canonicalUrl: string },
  bookmarkMap: Map<string, { url?: string }>,
): boolean {
  return keepBookmarkIds.some((id) =>
    expectedGroup.bookmarkIds.includes(id) &&
    isStillInDuplicateGroup(bookmarkMap.get(id)?.url, expectedGroup.canonicalUrl),
  )
}

export const isAsciiOnly = (s: string): boolean => !/[^\x00-\x7F]/.test(s)

export function containsFind(text: string, find: string, caseSensitive: boolean): boolean {
  if (!text || !find) return false
  if (caseSensitive) return text.includes(find)
  return text.toLowerCase().includes(find.toLowerCase())
}

export function applyReplace(text: string, find: string, replace: string, caseSensitive: boolean): string {
  if (!text || !find) return text
  if (caseSensitive) {
    return text.split(find).join(replace)
  }
  const regex = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
  return text.replace(regex, replace)
}

export function matchesRule(
  bm: { id: string; url?: string; title?: string; parentId?: string; dateAdded?: number; dateLastUsed?: number },
  rule: import('~/shared/storage/schema').SmartFolderRule,
  bookmarkTagsMap: Record<string, string[]>,
): boolean {
  let fieldValue = ''

  switch (rule.field) {
    case 'domain':
      try {
        fieldValue = bm.url ? new URL(bm.url).hostname.replace(/^www\./, '') : ''
      } catch { fieldValue = '' }
      break
    case 'url':
      fieldValue = bm.url ?? ''
      break
    case 'title':
      fieldValue = bm.title ?? ''
      break
    case 'tag':
      fieldValue = (bookmarkTagsMap[bm.id] ?? []).join(' ')
      break
    case 'dateAdded':
      fieldValue = String(bm.dateAdded ?? '')
      break
    case 'lastUsed':
      fieldValue = String(bm.dateLastUsed ?? '')
      break
    case 'parentFolder':
      fieldValue = bm.parentId ?? ''
      break
  }

  const v = rule.value
  switch (rule.operator) {
    case 'contains': return fieldValue.toLowerCase().includes(v.toLowerCase())
    case 'equals': return fieldValue.toLowerCase() === v.toLowerCase()
    case 'startsWith': return fieldValue.toLowerCase().startsWith(v.toLowerCase())
    case 'endsWith': return fieldValue.toLowerCase().endsWith(v.toLowerCase())
    case 'notContains': return !fieldValue.toLowerCase().includes(v.toLowerCase())
  }
}
