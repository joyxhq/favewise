import { describe, it, expect, vi } from 'vitest'
import { checkUrls } from '~/shared/services/dead-link-service'

function classifyStatus(code: number): 'valid' | 'invalid' | 'suspicious' {
  if ([200, 201, 301, 302, 303, 307, 308].includes(code)) return 'valid'
  if ([404, 410, 451].includes(code)) return 'invalid'
  return 'suspicious'
}

describe('classifyStatus', () => {
  it('classifies 404 as invalid', () => {
    expect(classifyStatus(404)).toBe('invalid')
  })

  it('classifies 410 as invalid', () => {
    expect(classifyStatus(410)).toBe('invalid')
  })

  it('classifies 200 as valid', () => {
    expect(classifyStatus(200)).toBe('valid')
  })

  it('classifies 301 as valid', () => {
    expect(classifyStatus(301)).toBe('valid')
  })

  it('classifies 403 as suspicious', () => {
    expect(classifyStatus(403)).toBe('suspicious')
  })

  it('classifies 500 as suspicious', () => {
    expect(classifyStatus(500)).toBe('suspicious')
  })

  it('classifies 429 as suspicious', () => {
    expect(classifyStatus(429)).toBe('suspicious')
  })
})

describe('checkUrls', () => {
  it('falls back to a safe batch size for invalid concurrency', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () => new Response('', { status: 200 }))
    try {
      const results = await checkUrls([{ id: '1', url: 'https://example.com' }], {
        maxConcurrent: 0,
      })
      expect(results).toHaveLength(1)
      expect(results[0].status).toBe('valid')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
