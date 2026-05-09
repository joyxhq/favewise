import { describe, it, expect } from 'vitest'
import { generateRediscoverItems } from '~/shared/services/rediscover-service'
import type { BookmarkRecord } from '~/shared/types'

const now = Date.now()
const DAY = 86_400_000
const YEAR = 365 * DAY

function bm(overrides: Partial<BookmarkRecord> & { id: string }): BookmarkRecord {
  return {
    title: 'Test',
    url: 'https://example.com',
    parentId: '1',
    folderPath: [],
    dateAdded: now - 2 * YEAR,
    ...overrides,
  }
}

describe('generateRediscoverItems', () => {
  it('returns empty for no bookmarks', () => {
    expect(generateRediscoverItems([])).toEqual([])
  })

  it('skips bookmarks less than a week old', () => {
    const bookmarks = [bm({ id: '1', dateAdded: now - 3 * DAY })]
    expect(generateRediscoverItems(bookmarks)).toEqual([])
  })

  it('includes old bookmarks', () => {
    const bookmarks = [bm({ id: '1', dateAdded: now - 2 * YEAR })]
    const result = generateRediscoverItems(bookmarks)
    expect(result.length).toBe(1)
    expect(result[0]!.bookmarkId).toBe('1')
  })

  it('skips folders (no url)', () => {
    const bookmarks = [bm({ id: '1', url: undefined, dateAdded: now - 2 * YEAR })]
    expect(generateRediscoverItems(bookmarks)).toEqual([])
  })

  it('skips dismissed bookmarks', () => {
    const bookmarks = [bm({ id: '1', dateAdded: now - 2 * YEAR })]
    const dismissed = new Set(['1'])
    expect(generateRediscoverItems(bookmarks, dismissed)).toEqual([])
  })

  it('sorts by score descending', () => {
    const bookmarks = [
      bm({ id: '1', dateAdded: now - 2 * YEAR }),
      bm({ id: '2', dateAdded: now - 5 * YEAR }),
    ]
    const result = generateRediscoverItems(bookmarks)
    expect(result.length).toBe(2)
    expect(result[0]!.score).toBeGreaterThanOrEqual(result[1]!.score)
  })

  it('respects the limit parameter', () => {
    const bookmarks = Array.from({ length: 50 }, (_, i) =>
      bm({ id: String(i), dateAdded: now - (i + 1) * YEAR }),
    )
    const result = generateRediscoverItems(bookmarks, new Set(), 5)
    expect(result.length).toBe(5)
  })

  it('gives higher score to never-opened bookmarks', () => {
    const bookmarks = [
      bm({ id: '1', dateAdded: now - 2 * YEAR, dateLastUsed: now - 100 }),
      bm({ id: '2', dateAdded: now - 2 * YEAR, dateLastUsed: undefined }),
    ]
    const result = generateRediscoverItems(bookmarks)
    const byId = new Map(result.map((r) => [r.bookmarkId, r]))
    expect(byId.get('2')!.score).toBeGreaterThan(byId.get('1')!.score)
  })
})
