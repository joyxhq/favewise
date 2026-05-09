import { describe, it, expect } from 'vitest'
import { hashStr, expandProtectedSubtree, buildChildrenOf } from '~/shared/lib/protected-folders'

describe('hashStr', () => {
  it('produces a deterministic hash for the same input', () => {
    expect(hashStr('hello')).toBe(hashStr('hello'))
  })

  it('produces different hashes for different inputs', () => {
    expect(hashStr('hello')).not.toBe(hashStr('world'))
  })

  it('handles empty string', () => {
    expect(hashStr('')).toBe(hashStr(''))
    expect(typeof hashStr('')).toBe('string')
  })

  it('handles unicode strings', () => {
    expect(hashStr('你好世界')).toBe(hashStr('你好世界'))
    expect(typeof hashStr('你好世界')).toBe('string')
  })

  it('returns a base-36 string', () => {
    const result = hashStr('test')
    expect(result).toMatch(/^[0-9a-z]+$/)
  })
})

describe('buildChildrenOf', () => {
  it('returns empty map for empty records', () => {
    const result = buildChildrenOf([])
    expect(result.size).toBe(0)
  })

  it('skips records with URLs', () => {
    const records = [
      { id: '1', url: 'https://example.com', parentId: '0' },
    ]
    const result = buildChildrenOf(records)
    expect(result.size).toBe(0)
  })

  it('builds correct children map for folders', () => {
    const records = [
      { id: '1', parentId: '0' },
      { id: '2', parentId: '0' },
      { id: '3', parentId: '1' },
    ]
    const result = buildChildrenOf(records)
    expect(result.get('0')).toEqual(['1', '2'])
    expect(result.get('1')).toEqual(['3'])
  })
})

describe('expandProtectedSubtree', () => {
  it('returns empty set for no protected folders', () => {
    const records = [{ id: '1', parentId: '0' }]
    expect(expandProtectedSubtree(records, []).size).toBe(0)
  })

  it('includes the protected folder itself', () => {
    const records = [{ id: '1', parentId: '0' }]
    const result = expandProtectedSubtree(records, ['1'])
    expect(result.has('1')).toBe(true)
  })

  it('expands to all descendants', () => {
    const records = [
      { id: '1', parentId: '0' },
      { id: '2', parentId: '1' },
      { id: '3', parentId: '2' },
      { id: '4', parentId: '0' },
    ]
    const result = expandProtectedSubtree(records, ['1'])
    expect(result.has('1')).toBe(true)
    expect(result.has('2')).toBe(true)
    expect(result.has('3')).toBe(true)
    expect(result.has('4')).toBe(false)
  })

  it('handles multiple protected roots', () => {
    const records = [
      { id: '1', parentId: '0' },
      { id: '2', parentId: '1' },
      { id: '3', parentId: '0' },
      { id: '4', parentId: '3' },
    ]
    const result = expandProtectedSubtree(records, ['1', '3'])
    expect(result.has('1')).toBe(true)
    expect(result.has('2')).toBe(true)
    expect(result.has('3')).toBe(true)
    expect(result.has('4')).toBe(true)
  })
})
