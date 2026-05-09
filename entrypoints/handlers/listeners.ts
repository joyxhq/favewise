import { categorizeUrl } from '~/shared/lib/url-taxonomy'
import {
  getLatestScan,
  saveLatestScan,
  appendNewBookmarkInbox,
  pruneStateForRemovedBookmarks,
  addOrganizeAntiMoves,
  markBookmarkTreeDirty,
} from '~/shared/storage'
import { broadcast } from '~/shared/lib/messaging'

export function handleBookmarkCreated(
  id: string,
  node: chrome.bookmarks.BookmarkTreeNode,
): Promise<void> {
  markBookmarkTreeDirty().catch(() => {})
  if (!node.url || !node.parentId) return Promise.resolve()
  const nodeUrl = node.url
  const nodeParentId = node.parentId
  return (async () => {
    try {
      const category = categorizeUrl(nodeUrl)

      let suggestedFolderId: string | undefined
      let suggestedFolderTitle: string | undefined
      if (category && category.confidence >= 0.7) {
        try {
          const siblings = await chrome.bookmarks.getChildren(nodeParentId)
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
        url: nodeUrl,
        parentId: nodeParentId,
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
  })()
}

export function handleBookmarkRemoved(
  id: string,
  info: {
    parentId?: string
    index?: number
    node?: chrome.bookmarks.BookmarkTreeNode
  },
): Promise<void> {
  markBookmarkTreeDirty().catch(() => {})
  const toRemove = new Set<string>([id])
  const walk = (n: chrome.bookmarks.BookmarkTreeNode) => {
    toRemove.add(n.id)
    if (n.children) for (const c of n.children) walk(c)
  }
  if (info.node) walk(info.node)
  return pruneStateForRemovedBookmarks(toRemove)
}

export async function handleBookmarkChanged(
  id: string,
  info: { title?: string; url?: string },
): Promise<void> {
  markBookmarkTreeDirty().catch(() => {})
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

export async function handleBookmarkMoved(
  id: string,
  info: { parentId: string; index: number; oldParentId: string; oldIndex: number },
): Promise<void> {
  markBookmarkTreeDirty().catch(() => {})
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

export function wireBookmarkListeners() {
  chrome.bookmarks.onCreated.addListener((id, node) => {
    handleBookmarkCreated(id, node).catch(() => {})
  })
  chrome.bookmarks.onRemoved.addListener((id, info) => {
    handleBookmarkRemoved(id, info).catch(() => {})
  })
  chrome.bookmarks.onChanged.addListener((id, info) => {
    handleBookmarkChanged(id, info).catch(() => {})
  })
  chrome.bookmarks.onMoved.addListener((id, info) => {
    handleBookmarkMoved(id, info).catch(() => {})
  })
}
