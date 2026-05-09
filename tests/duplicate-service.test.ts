import { describe, it, expect } from 'vitest'
import {
  findExactDuplicates,
  pickNewest,
  pickOldest,
} from '~/shared/services/duplicate-service'
import type { BookmarkRecord } from '~/shared/types'

function bm(
  id: string,
  url: string,
  opts: Partial<BookmarkRecord> = {},
): BookmarkRecord {
  return {
    id,
    title: opts.title ?? `Bookmark ${id}`,
    url,
    parentId: opts.parentId ?? 'root',
    folderPath: opts.folderPath ?? [],
    dateAdded: opts.dateAdded,
  }
}

describe('duplicate-service › URL normalization', () => {
  it('treats http and query ordering as equivalent', () => {
    const groups = findExactDuplicates([
      bm('1', 'https://example.com/foo?a=1&b=2'),
      bm('2', 'https://example.com/foo?b=2&a=1'),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].bookmarkIds.sort()).toEqual(['1', '2'])
  })

  it('strips UTM parameters', () => {
    const groups = findExactDuplicates([
      bm('1', 'https://example.com/x?utm_source=twitter'),
      bm('2', 'https://example.com/x'),
    ])
    expect(groups).toHaveLength(1)
  })

  it('strips www prefix', () => {
    const groups = findExactDuplicates([
      bm('1', 'https://www.example.com/x'),
      bm('2', 'https://example.com/x'),
    ])
    expect(groups).toHaveLength(1)
  })

  it('strips trailing slash', () => {
    const groups = findExactDuplicates([
      bm('1', 'https://example.com/x/'),
      bm('2', 'https://example.com/x'),
    ])
    expect(groups).toHaveLength(1)
  })

  it('different paths are NOT duplicates', () => {
    const groups = findExactDuplicates([
      bm('1', 'https://example.com/a'),
      bm('2', 'https://example.com/b'),
    ])
    expect(groups).toHaveLength(0)
  })

  it('unique bookmarks produce no groups', () => {
    const groups = findExactDuplicates([
      bm('1', 'https://a.com/'),
      bm('2', 'https://b.com/'),
      bm('3', 'https://c.com/'),
    ])
    expect(groups).toHaveLength(0)
  })

  it('ignores bookmarks without a URL', () => {
    const groups = findExactDuplicates([
      bm('1', 'https://example.com/'),
      { id: 'f', title: 'folder', folderPath: [] } as BookmarkRecord,
    ])
    expect(groups).toHaveLength(0)
  })

  it('falls back to raw URL when URL parse fails', () => {
    const groups = findExactDuplicates([
      bm('1', 'not-a-url'),
      bm('2', 'not-a-url'),
    ])
    expect(groups).toHaveLength(1)
  })
})

describe('duplicate-service › pick helpers', () => {
  const now = Date.now()
  const map = new Map<string, BookmarkRecord>([
    ['a', bm('a', 'https://x.com/', { dateAdded: now - 100 })],
    ['b', bm('b', 'https://x.com/', { dateAdded: now })],
    ['c', bm('c', 'https://x.com/', { dateAdded: now - 200 })],
  ])
  const group = {
    id: 'g1',
    canonicalUrl: 'https://x.com/',
    bookmarkIds: ['a', 'b', 'c'],
  }

  it('pickNewest returns the most recent dateAdded', () => {
    expect(pickNewest(group, map)).toBe('b')
  })

  it('pickOldest returns the oldest dateAdded', () => {
    expect(pickOldest(group, map)).toBe('c')
  })
})
