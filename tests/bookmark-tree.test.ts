import { describe, it, expect } from 'vitest'
import { flattenBookmarkTree, getBookmarkLinks, buildBookmarkMap, formatFolderPath } from '~/shared/utils/bookmark-tree'
import type { BookmarkRecord } from '~/shared/types'

const makeNode = (overrides: Record<string, unknown> = {}): chrome.bookmarks.BookmarkTreeNode => {
  return {
    id: '1',
    title: 'Test',
    syncing: false,
    ...overrides,
  } as chrome.bookmarks.BookmarkTreeNode
}

describe('flattenBookmarkTree', () => {
  it('flattens a single node', () => {
    const nodes = [makeNode({ id: '1', title: 'Root' })]
    const result = flattenBookmarkTree(nodes)
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('1')
  })

  it('flattens nested children', () => {
    const nodes = [
      makeNode({
        id: '1',
        title: 'Root',
        children: [
          makeNode({ id: '2', title: 'Child', url: 'https://example.com', parentId: '1' }),
        ],
      }),
    ]
    const result = flattenBookmarkTree(nodes)
    expect(result).toHaveLength(2)
    expect(result[1]!.folderPath).toEqual(['Root'])
  })

  it('preserves folderPath for deeply nested nodes', () => {
    const nodes = [
      makeNode({
        id: '1',
        title: 'Root',
        children: [
          makeNode({
            id: '2',
            title: 'Sub',
            parentId: '1',
            children: [
              makeNode({ id: '3', title: 'Link', url: 'https://x.com', parentId: '2' }),
            ],
          }),
        ],
      }),
    ]
    const result = flattenBookmarkTree(nodes)
    const link = result.find((r) => r.id === '3')
    expect(link?.folderPath).toEqual(['Root', 'Sub'])
  })
})

describe('getBookmarkLinks', () => {
  it('filters out folders', () => {
    const records: BookmarkRecord[] = [
      { id: '1', title: 'Folder', url: undefined, parentId: '0', folderPath: [], dateAdded: undefined, dateLastUsed: undefined, index: 0 },
      { id: '2', title: 'Link', url: 'https://example.com', parentId: '1', folderPath: [], dateAdded: undefined, dateLastUsed: undefined, index: 0 },
    ]
    expect(getBookmarkLinks(records)).toHaveLength(1)
  })
})

describe('buildBookmarkMap', () => {
  it('builds a map from records', () => {
    const records: BookmarkRecord[] = [
      { id: '1', title: 'A', url: 'https://a.com', parentId: '0', folderPath: [], dateAdded: undefined, dateLastUsed: undefined, index: 0 },
      { id: '2', title: 'B', url: 'https://b.com', parentId: '0', folderPath: [], dateAdded: undefined, dateLastUsed: undefined, index: 0 },
    ]
    const map = buildBookmarkMap(records)
    expect(map.get('1')!.title).toBe('A')
    expect(map.get('2')!.title).toBe('B')
  })
})

describe('formatFolderPath', () => {
  it('joins path with separator', () => {
    expect(formatFolderPath(['Bookmarks Bar', 'Dev', 'React'])).toBe('Bookmarks Bar / Dev / React')
  })
})
