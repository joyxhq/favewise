import { describe, expect, it } from 'vitest'
import { findEmptyFolders } from '~/shared/services/scan-service'
import type { BookmarkRecord } from '~/shared/types'

function folder(
  id: string,
  title: string,
  opts: Partial<BookmarkRecord> = {},
): BookmarkRecord {
  return {
    id,
    title,
    parentId: opts.parentId,
    folderPath: opts.folderPath ?? [],
    dateAdded: opts.dateAdded,
    index: opts.index,
  }
}

function bookmark(
  id: string,
  parentId: string,
  opts: Partial<BookmarkRecord> = {},
): BookmarkRecord {
  return {
    id,
    title: opts.title ?? `Bookmark ${id}`,
    url: opts.url ?? 'https://example.com/',
    parentId,
    folderPath: opts.folderPath ?? [],
  }
}

describe('findEmptyFolders', () => {
  it('does not report browser root containers when there are no bookmarks', () => {
    const records: BookmarkRecord[] = [
      folder('root________', ''),
      folder('toolbar_____', 'Bookmarks Bar', { parentId: 'root________' }),
      folder('unfiled_____', 'Other Bookmarks', { parentId: 'root________' }),
      folder('mobile______', 'Mobile Bookmarks', { parentId: 'root________' }),
    ]

    expect(findEmptyFolders(records)).toEqual([])
  })

  it('reports user folders nested below a browser root container', () => {
    const records: BookmarkRecord[] = [
      folder('root________', ''),
      folder('toolbar_____', 'Bookmarks Bar', { parentId: 'root________' }),
      folder('work', 'Work', {
        parentId: 'toolbar_____',
        folderPath: ['Bookmarks Bar'],
      }),
    ]

    expect(findEmptyFolders(records)).toEqual([
      { id: 'work', title: 'Work', folderPath: ['Bookmarks Bar'] },
    ])
  })

  it('returns only the top-most empty user folder in an empty branch', () => {
    const records: BookmarkRecord[] = [
      folder('0', ''),
      folder('1', 'Bookmarks Bar', { parentId: '0' }),
      folder('imported', 'Imported', {
        parentId: '1',
        folderPath: ['Bookmarks Bar'],
      }),
      folder('nested', 'Nested', {
        parentId: 'imported',
        folderPath: ['Bookmarks Bar', 'Imported'],
      }),
    ]

    expect(findEmptyFolders(records)).toEqual([
      { id: 'imported', title: 'Imported', folderPath: ['Bookmarks Bar'] },
    ])
  })

  it('does not report folders whose subtree contains a bookmark', () => {
    const records: BookmarkRecord[] = [
      folder('0', ''),
      folder('1', 'Bookmarks Bar', { parentId: '0' }),
      folder('dev', 'Dev', {
        parentId: '1',
        folderPath: ['Bookmarks Bar'],
      }),
      bookmark('react', 'dev', {
        title: 'React',
        folderPath: ['Bookmarks Bar', 'Dev'],
      }),
    ]

    expect(findEmptyFolders(records)).toEqual([])
  })
})
