import { flattenBookmarkTree, getBookmarkLinks } from '~/shared/utils/bookmark-tree'
import type { BookmarkRecord } from '~/shared/types'

/**
 * Read the full bookmark tree from Chrome and flatten to records.
 * Returns ALL nodes including folders.
 */
export async function getAllBookmarks(): Promise<BookmarkRecord[]> {
  const tree = await chrome.bookmarks.getTree()
  return flattenBookmarkTree(tree)
}

/**
 * Get only bookmark links (excluding folders).
 */
export async function getAllBookmarkLinks(): Promise<BookmarkRecord[]> {
  const all = await getAllBookmarks()
  return getBookmarkLinks(all)
}

/**
 * Move a bookmark to a target folder.
 */
export async function moveBookmark(
  bookmarkId: string,
  targetFolderId: string,
  index?: number,
): Promise<void> {
  await chrome.bookmarks.move(bookmarkId, { parentId: targetFolderId, index })
}

/**
 * Delete a bookmark permanently. Use with caution.
 */
export async function deleteBookmark(bookmarkId: string): Promise<void> {
  await chrome.bookmarks.remove(bookmarkId)
}

/**
 * Create a folder bookmark.
 */
export async function createFolder(
  title: string,
  parentId?: string,
): Promise<chrome.bookmarks.BookmarkTreeNode> {
  return chrome.bookmarks.create({ title, parentId })
}

/**
 * Trash a bookmark: delete it from the browser and let the caller persist
 * the record to storage. No visible trash folder is created.
 */
export async function trashBookmark(bookmark: BookmarkRecord): Promise<void> {
  await chrome.bookmarks.remove(bookmark.id)
}

/**
 * Restore a previously trashed bookmark by recreating it at its original path.
 * If the original folder no longer exists, falls back to "Other Bookmarks".
 * Returns { id, usedFallback } on success, or null on failure.
 */
export async function restoreBookmark(
  title: string,
  url: string,
  originalPath: string[],
): Promise<{ id: string; usedFallback: boolean } | null> {
  // Walk the tree to find the folder matching originalPath
  const tree = await chrome.bookmarks.getTree()
  const allNodes = flattenBookmarkTree(tree)

  let parentId: string | undefined
  for (const node of allNodes) {
    if (!node.url) {
      const nodePath = [...node.folderPath, node.title]
      if (nodePath.join('/') === originalPath.join('/')) {
        parentId = node.id
        break
      }
    }
  }

  const usedFallback = !parentId
  // Fallback: "Other Bookmarks" (id=2) or root (id=1)
  if (!parentId) {
    parentId = tree[0]?.children?.find((c) => !c.url && c.id === '2')?.id ?? '1'
  }

  try {
    const created = await chrome.bookmarks.create({ parentId, title, url })
    return { id: created.id, usedFallback }
  } catch {
    return null
  }
}
