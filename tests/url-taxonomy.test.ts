import { describe, it, expect } from 'vitest'
import { categorizeUrl, getTaxonomySize } from '~/shared/lib/url-taxonomy'

describe('url-taxonomy › exact host match', () => {
  it('labels GitHub as Code', () => {
    const r = categorizeUrl('https://github.com/facebook/react')
    expect(r?.label).toBe('Code')
    expect(r?.confidence).toBeGreaterThanOrEqual(0.9)
  })

  it('strips www. and still matches', () => {
    const r = categorizeUrl('https://www.medium.com/@dan/foo')
    expect(r?.label).toBe('Articles')
  })

  it('labels Code4rena as Security Audits', () => {
    expect(categorizeUrl('https://code4rena.com/audits/123')?.label).toBe(
      'Security Audits',
    )
  })

  it('labels Uniswap as DeFi', () => {
    expect(categorizeUrl('https://uniswap.org/swap')?.label).toBe('DeFi')
  })
})

describe('url-taxonomy › path patterns', () => {
  it('GitHub /issues/ → Issues (more specific than Code)', () => {
    const r = categorizeUrl('https://github.com/facebook/react/issues/12345')
    expect(r?.label).toBe('Issues')
  })

  it('GitHub /pulls → Pull Requests', () => {
    expect(categorizeUrl('https://github.com/owner/repo/pull/1')?.label).toBe(
      'Pull Requests',
    )
  })

  it('YouTube /@channel → Channels', () => {
    expect(categorizeUrl('https://youtube.com/@techchannel')?.label).toBe(
      'Channels',
    )
  })
})

describe('url-taxonomy › parent-domain fallback', () => {
  it('docs.python.org matches under exact host', () => {
    expect(categorizeUrl('https://docs.python.org/3/tutorial/')?.label).toBe(
      'Docs',
    )
  })

  it('unknown subdomain of a known root uses parent', () => {
    const r = categorizeUrl('https://foo.github.com/bar')
    expect(r?.label).toBe('Code')
  })

  it('subdomain "docs." of unknown root → Docs via subdomain hint', () => {
    const r = categorizeUrl('https://docs.some-unknown-site.com/guide')
    expect(r?.label).toBe('Docs')
    expect(r?.confidence).toBeLessThanOrEqual(0.9)
  })
})

describe('url-taxonomy › path-only heuristics for unknown domains', () => {
  it('/blog/ path → Blog', () => {
    expect(categorizeUrl('https://random-company.tld/blog/post-1')?.label).toBe(
      'Blog',
    )
  })

  it('/api/ path → API Reference', () => {
    expect(categorizeUrl('https://foo.tld/api/v1/users')?.label).toBe(
      'API Reference',
    )
  })

  it('unknown domain with no path hint → null', () => {
    expect(categorizeUrl('https://just-some-random-site.tld/')).toBeNull()
  })
})

describe('url-taxonomy › edge cases', () => {
  it('malformed URL returns null', () => {
    expect(categorizeUrl('not a url')).toBeNull()
    expect(categorizeUrl('')).toBeNull()
  })

  it('javascript: / chrome:// returns null (no hostname)', () => {
    expect(categorizeUrl('javascript:void(0)')).toBeNull()
  })

  it('getTaxonomySize returns a positive count', () => {
    expect(getTaxonomySize()).toBeGreaterThan(100)
  })
})
