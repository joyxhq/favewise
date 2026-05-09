import { describe, it, expect } from 'vitest'
import { escapeMarkdownText, formatMarkdownLink } from '~/shared/lib/markdown'

describe('escapeMarkdownText', () => {
  it('escapes markdown and raw HTML delimiters', () => {
    const escaped = escapeMarkdownText('# [x](<script>alert(1)</script>)')
    expect(escaped).toContain('\\#')
    expect(escaped).toContain('\\[')
    expect(escaped).toContain('&lt;script\\&gt;')
    expect(escaped).not.toContain('<script>')
  })

  it('removes control characters and newlines', () => {
    expect(escapeMarkdownText('hello\nworld\u0000')).toBe('hello world')
  })
})

describe('formatMarkdownLink', () => {
  it('encodes unsafe URL delimiters in markdown links', () => {
    const md = formatMarkdownLink('Example [site]', 'https://example.com/a(b)<c>')
    expect(md).toContain('Example \\[site\\]')
    expect(md).toContain('a%28b%29%3Cc%3E')
    expect(md).not.toContain('<c>')
  })
})
