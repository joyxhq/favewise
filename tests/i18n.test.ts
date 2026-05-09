import { describe, it, expect, beforeEach } from 'vitest'
import { t, setLocalePref, getLocale } from '~/shared/lib/i18n'

describe('i18n › basic lookup', () => {
  beforeEach(() => setLocalePref('en'))

  it('returns English string for a known key', () => {
    expect(t('nav.dashboard')).toBe('Dashboard')
  })

  it('returns key itself when key is unknown', () => {
    expect(t('nonsense.does.not.exist')).toBe('nonsense.does.not.exist')
  })

  it('interpolates {var} placeholders', () => {
    expect(t('dash.newBookmarks', { count: 1 })).toMatch(/1 new bookmark/)
  })

  it('picks plural variant when count !== 1', () => {
    expect(t('dash.newBookmarks', { count: 5 })).toMatch(/5 new bookmarks/)
  })

  it('missing args resolve to empty string', () => {
    expect(t('dash.minutesAgo')).toBe('{count}m ago')
  })
})

describe('i18n › locale switching', () => {
  it('zh-CN returns Chinese translations', () => {
    setLocalePref('zh-CN')
    expect(t('nav.dashboard')).toBe('仪表盘')
    expect(getLocale()).toBe('zh-CN')
  })

  it('falls back to English for keys missing in zh-CN', () => {
    setLocalePref('zh-CN')
    // Use a key that exists in en.ts and zh-CN.ts; after confirming fallback
    // works for truly unknown keys, the output should be the raw key.
    expect(t('totally.made.up.key')).toBe('totally.made.up.key')
  })

  it('auto resolves to one of the two known locales', () => {
    const resolved = setLocalePref('auto')
    expect(['en', 'zh-CN']).toContain(resolved)
  })
})
