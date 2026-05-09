import { describe, it, expect } from 'vitest'
import { getDeadLinkSkipReason } from '~/shared/services/dead-link-service'

describe('getDeadLinkSkipReason', () => {
  it('allows public http and https URLs', () => {
    expect(getDeadLinkSkipReason('https://example.com/page')).toBeNull()
    expect(getDeadLinkSkipReason('http://example.com/page')).toBeNull()
  })

  it('skips non-http schemes', () => {
    expect(getDeadLinkSkipReason('file:///Users/me/bookmarks.html')).toContain('file')
    expect(getDeadLinkSkipReason('chrome://extensions')).toContain('chrome')
    expect(getDeadLinkSkipReason('javascript:alert(1)')).toContain('javascript')
    expect(getDeadLinkSkipReason('data:text/html,hi')).toContain('data')
  })

  it('skips localhost, private IPv4, and local domains', () => {
    expect(getDeadLinkSkipReason('http://localhost:3000')).toContain('local')
    expect(getDeadLinkSkipReason('http://127.0.0.1:3000')).toContain('local')
    expect(getDeadLinkSkipReason('https://192.168.1.1/admin')).toContain('local')
    expect(getDeadLinkSkipReason('https://10.0.0.2/admin')).toContain('local')
    expect(getDeadLinkSkipReason('https://printer.local/status')).toContain('local')
  })

  it('skips special-use IPv4 and mapped local IPv6 addresses', () => {
    expect(getDeadLinkSkipReason('http://0.0.0.0')).toContain('local')
    expect(getDeadLinkSkipReason('http://100.64.0.1')).toContain('local')
    expect(getDeadLinkSkipReason('http://198.18.0.1')).toContain('local')
    expect(getDeadLinkSkipReason('http://[::ffff:127.0.0.1]/')).toContain('local')
    expect(getDeadLinkSkipReason('http://[fd00::1]/')).toContain('local')
  })
})
