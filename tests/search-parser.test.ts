import { describe, it, expect } from 'vitest'
import { parseQuery, matchesFilter, matchesParsedQuery, getFilterSuggestions } from '~/shared/lib/search-parser'

describe('parseQuery', () => {
  it('parses empty query', () => {
    const result = parseQuery('')
    expect(result.filters).toEqual([])
    expect(result.freeText).toEqual([])
  })

  it('parses free text', () => {
    const result = parseQuery('react hooks')
    expect(result.filters).toEqual([])
    expect(result.freeText).toEqual(['react', 'hooks'])
  })

  it('parses domain filter', () => {
    const result = parseQuery('domain:github.com')
    expect(result.filters).toHaveLength(1)
    expect(result.filters[0]).toEqual({ field: 'domain', operator: 'contains', value: 'github.com' })
  })

  it('parses tag filter', () => {
    const result = parseQuery('tag:work')
    expect(result.filters[0]!.field).toBe('tag')
    expect(result.filters[0]!.value).toBe('work')
  })

  it('parses folder filter', () => {
    const result = parseQuery('folder:Projects')
    expect(result.filters[0]!.field).toBe('folder')
  })

  it('parses mixed filters and free text', () => {
    const result = parseQuery('domain:github.com react')
    expect(result.filters).toHaveLength(1)
    expect(result.freeText).toEqual(['react'])
  })

  it('parses quoted free text (single token)', () => {
    const result = parseQuery('"exactphrase"')
    expect(result.freeText).toEqual(['exactphrase'])
  })

  it('parses date filters', () => {
    const result = parseQuery('before:2024-06 after:2023-01')
    expect(result.filters).toHaveLength(2)
    expect(result.filters[0]!.field).toBe('before')
    expect(result.filters[1]!.field).toBe('after')
  })
})

describe('matchesFilter', () => {
  it('matches domain filter', () => {
    expect(matchesFilter(
      { url: 'https://github.com/test' },
      { field: 'domain', operator: 'contains', value: 'github' },
      [],
    )).toBe(true)
  })

  it('rejects domain filter when domain differs', () => {
    expect(matchesFilter(
      { url: 'https://gitlab.com/test' },
      { field: 'domain', operator: 'contains', value: 'github' },
      [],
    )).toBe(false)
  })

  it('matches title filter', () => {
    expect(matchesFilter(
      { title: 'React Hooks Guide' },
      { field: 'title', operator: 'contains', value: 'react' },
      [],
    )).toBe(true)
  })

  it('matches tag filter', () => {
    expect(matchesFilter(
      { title: 'Test' },
      { field: 'tag', operator: 'contains', value: 'work' },
      ['work', 'dev'],
    )).toBe(true)
  })
})

describe('matchesParsedQuery', () => {
  it('matches free text in title or url', () => {
    const query = parseQuery('react')
    expect(matchesParsedQuery({ title: 'React Guide' }, query, [])).toBe(true)
    expect(matchesParsedQuery({ title: 'Vue Guide' }, query, [])).toBe(false)
  })

  it('requires all filters to match', () => {
    const query = parseQuery('domain:github.com react')
    expect(matchesParsedQuery(
      { title: 'React App', url: 'https://github.com/test' },
      query,
      [],
    )).toBe(true)
    expect(matchesParsedQuery(
      { title: 'React App', url: 'https://gitlab.com/test' },
      query,
      [],
    )).toBe(false)
  })
})

describe('getFilterSuggestions', () => {
  it('returns suggestions for unused filters', () => {
    const suggestions = getFilterSuggestions('')
    expect(suggestions.length).toBeGreaterThan(0)
    expect(suggestions).toContain('domain:github.com')
  })

  it('omits already-used filters', () => {
    const suggestions = getFilterSuggestions('domain:github.com')
    expect(suggestions).not.toContain('domain:github.com')
  })
})
