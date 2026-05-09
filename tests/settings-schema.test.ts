import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, normalizeUserSettings } from '~/shared/storage/schema'

describe('normalizeUserSettings', () => {
  it('fills defaults and accepts valid imported settings', () => {
    expect(normalizeUserSettings({ maxConcurrentChecks: 3 })).toEqual({
      ...DEFAULT_SETTINGS,
      maxConcurrentChecks: 3,
    })
  })

  it('rejects settings that can break dead-link batching', () => {
    expect(() => normalizeUserSettings({ maxConcurrentChecks: 0 })).toThrow(/maxConcurrentChecks/)
    expect(() => normalizeUserSettings({ maxConcurrentChecks: -1 })).toThrow(/maxConcurrentChecks/)
    expect(() => normalizeUserSettings({ scanTimeoutMs: 999 })).toThrow(/scanTimeoutMs/)
  })

  it('rejects unknown keys and invalid enums', () => {
    expect(() => normalizeUserSettings({ unknown: true })).toThrow(/Unknown setting/)
    expect(() => normalizeUserSettings({ scheduleFrequency: 'hourly' })).toThrow(/scheduleFrequency/)
    expect(() => normalizeUserSettings({ theme: 'sepia' })).toThrow(/theme/)
    expect(() => normalizeUserSettings({ locale: 'fr' })).toThrow(/locale/)
  })
})
