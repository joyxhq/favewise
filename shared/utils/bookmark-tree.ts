import type { BookmarkRecord } from '../types'

/**
 * Recursively flatten a Chrome bookmark tree node into BookmarkRecord array.
 * Folders (nodes without URL) are included as records with url = undefined.
 */
export function flattenBookmarkTree(
  nodes: chrome.bookmarks.BookmarkTreeNode[],
  parentPath: string[] = [],
): BookmarkRecord[] {
  const records: BookmarkRecord[] = []

  for (const node of nodes) {
    const folderPath = node.title ? [...parentPath, node.title] : parentPath

    const record: BookmarkRecord = {
      id: node.id,
      title: node.title ?? '',
      url: node.url,
      parentId: node.parentId,
      folderPath: parentPath,
      dateAdded: node.dateAdded,
      dateLastUsed: 'dateLastUsed' in node ? (node as unknown as Record<string, unknown>).dateLastUsed as number | undefined : undefined,
      index: node.index,
    }

    records.push(record)

    if (node.children) {
      records.push(...flattenBookmarkTree(node.children, folderPath))
    }
  }

  return records
}

/**
 * Filter out bookmark records that are folders (no URL).
 */
export function getBookmarkLinks(records: BookmarkRecord[]): BookmarkRecord[] {
  return records.filter((r) => r.url != null && r.url !== '')
}

/**
 * Build a map of bookmark ID -> BookmarkRecord for quick lookups.
 */
export function buildBookmarkMap(
  records: BookmarkRecord[],
): Map<string, BookmarkRecord> {
  return new Map(records.map((r) => [r.id, r]))
}

/**
 * Format a folder path array into a human-readable string.
 */
export function formatFolderPath(path: string[]): string {
  return path.join(' / ')
}

/**
 * Get the root-level bookmark folders (first-level children of the root).
 */
export async function getRootFolders(): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
  const tree = await chrome.bookmarks.getTree()
  const root = tree[0]
  return root?.children ?? []
}
