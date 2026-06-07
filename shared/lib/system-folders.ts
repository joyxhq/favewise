import type { BookmarkRecord } from '~/shared/types'

const CHROME_SYSTEM_FOLDER_IDS = ['0', '1', '2', '3']

const ROOT_SYSTEM_FOLDER_TITLES = new Set([
  'Bookmarks Bar',
  'Other Bookmarks',
  'Mobile Bookmarks',
  'Bookmarks Menu',
  'Bookmarks Toolbar',
  'Unsorted Bookmarks',
])

type BookmarkFolderLike = Pick<BookmarkRecord, 'id' | 'title' | 'parentId' | 'url' | 'folderPath'>

/**
 * Browser bookmark roots are containers, not user folders. Chrome uses stable
 * numeric ids, while Firefox/other browsers use namespaced ids, so detect both
 * the root node and its direct folder children from the full tree shape.
 */
export function getBrowserSystemFolderIds(records: BookmarkFolderLike[]): Set<string> {
  const systemIds = new Set<string>(CHROME_SYSTEM_FOLDER_IDS)
  const rootIds = new Set<string>()

  for (const record of records) {
    if (record.url) continue
    if (!record.parentId) {
      rootIds.add(record.id)
      systemIds.add(record.id)
    }
  }

  for (const record of records) {
    if (record.url) continue
    if (record.parentId && rootIds.has(record.parentId)) {
      systemIds.add(record.id)
      continue
    }
    if (record.folderPath.length === 0 && ROOT_SYSTEM_FOLDER_TITLES.has(record.title)) {
      systemIds.add(record.id)
    }
  }

  return systemIds
}
