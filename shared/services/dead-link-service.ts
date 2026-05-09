import type { DeadLinkResult } from '~/shared/types'

export interface DeadLinkCheckOptions {
  timeoutMs?: number
}

const AUTH_PATH_PATTERN = /(?:^|\/)(login|signin|sign-in|auth|oauth|sso|cas|webvpn)(?:\/|$|\?)/i
const SKIP_HOSTS = new Set(['localhost', 'localhost.localdomain'])
const PRIVATE_IPV4_RANGES = [
  [0, 0, 0, 0, 8],
  [10, 0, 0, 0, 8],
  [100, 64, 0, 0, 10],
  [127, 0, 0, 0, 8],
  [169, 254, 0, 0, 16],
  [172, 16, 0, 0, 12],
  [192, 0, 0, 0, 24],
  [192, 0, 2, 0, 24],
  [192, 168, 0, 0, 16],
  [198, 18, 0, 0, 15],
  [198, 51, 100, 0, 24],
  [203, 0, 113, 0, 24],
  [224, 0, 0, 0, 4],
  [240, 0, 0, 0, 4],
] as const

function ipv4ToNumber(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  const nums = parts.map((p) => Number(p))
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null
  return (((nums[0] * 256 + nums[1]) * 256 + nums[2]) * 256 + nums[3]) >>> 0
}

function cidrMatch(ip: number, a: number, b: number, c: number, d: number, bits: number): boolean {
  const base = (((a * 256 + b) * 256 + c) * 256 + d) >>> 0
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  return (ip & mask) === (base & mask)
}

function parseMappedIpv4(hostname: string): string | null {
  const dotted = hostname.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1]
  if (dotted) return dotted
  const hex = hostname.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i)
  if (!hex) return null
  const high = Number.parseInt(hex[1], 16)
  const low = Number.parseInt(hex[2], 16)
  if (!Number.isFinite(high) || !Number.isFinite(low)) return null
  return [
    (high >> 8) & 255,
    high & 255,
    (low >> 8) & 255,
    low & 255,
  ].join('.')
}

export function getDeadLinkSkipReason(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return 'Skipped: URL is malformed'
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return `Skipped: ${parsed.protocol.replace(':', '') || 'unsupported'} URLs cannot be checked safely`
  }

  const hostname = parsed.hostname.toLowerCase()
  if (!hostname) return 'Skipped: URL has no hostname'
  if (SKIP_HOSTS.has(hostname) || hostname.endsWith('.local')) {
    return 'Skipped: local or private host'
  }
  const bareHostname = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname
  if (bareHostname === '::1') {
    return 'Skipped: local or private host'
  }
  if (
    bareHostname.startsWith('fc') ||
    bareHostname.startsWith('fd') ||
    bareHostname.startsWith('fe80')
  ) {
    return 'Skipped: local or private host'
  }

  const mappedIpv4 = parseMappedIpv4(bareHostname)
  const ip = ipv4ToNumber(mappedIpv4 ?? bareHostname)
  if (ip !== null) {
    const isPrivate = PRIVATE_IPV4_RANGES.some(([a, b, c, d, bits]) =>
      cidrMatch(ip, a, b, c, d, bits),
    )
    if (isPrivate) return 'Skipped: local or private host'
  }

  return null
}

function isMethodFallbackStatus(statusCode: number): boolean {
  return [400, 403, 404, 405, 406, 410, 429, 451, 500, 501, 502, 503].includes(statusCode)
}

/**
 * Classify an HTTP status code into a dead link status.
 */
function classifyStatus(statusCode: number): DeadLinkResult['status'] {
  if ([200, 201, 301, 302, 303, 307, 308].includes(statusCode)) return 'valid'
  if ([404, 410, 451].includes(statusCode)) return 'invalid'
  if ([400, 401, 403, 429, 500, 503].includes(statusCode)) return 'suspicious'
  return 'suspicious'
}

function getReason(
  status: DeadLinkResult['status'],
  statusCode?: number,
  errorMsg?: string,
): string {
  switch (status) {
    case 'valid':
      return statusCode === 200
        ? 'Page is accessible'
        : `Redirects to another location (${statusCode})`
    case 'invalid':
      if (statusCode === 404) return 'Page not found (404)'
      if (statusCode === 410) return 'Page permanently removed (410)'
      return `Page unavailable (${statusCode})`
    case 'suspicious':
      if (statusCode === 403) return 'Access denied (403) — may require login'
      if (statusCode === 429) return 'Rate limited (429) — try again later'
      return `Server issue (${statusCode})`
    case 'retry':
      return errorMsg ? `Network error: ${errorMsg}` : 'Connection timed out or unreachable'
    default:
      return 'Unknown status'
  }
}

function isAuthUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    const query = parsed.searchParams.toString()
    return AUTH_PATH_PATTERN.test(parsed.pathname) || /service=|ticket=|redirect=|callback=/i.test(query)
  } catch {
    return AUTH_PATH_PATTERN.test(url)
  }
}

function classifyResponse(
  originalUrl: string,
  response: Response,
): Pick<DeadLinkResult, 'status' | 'reason'> {
  const finalUrl = response.url || originalUrl
  const finalIsAuth = isAuthUrl(finalUrl)
  const redirectedToDifferentUrl = response.redirected && finalUrl !== originalUrl

  if (finalIsAuth || (redirectedToDifferentUrl && isAuthUrl(finalUrl))) {
    return {
      status: 'suspicious',
      reason: 'Redirected to an authentication page',
    }
  }

  if ([401, 403, 407, 412].includes(response.status)) {
    return {
      status: 'suspicious',
      reason: `Authentication or access control required (${response.status})`,
    }
  }

  const status = classifyStatus(response.status)
  return {
    status,
    reason: getReason(status, response.status),
  }
}

/**
 * Check a single URL and return a dead link result.
 */
export async function checkUrl(
  bookmarkId: string,
  url: string,
  options: DeadLinkCheckOptions = {},
): Promise<DeadLinkResult> {
  const skipReason = getDeadLinkSkipReason(url)
  if (skipReason) {
    return {
      bookmarkId,
      url,
      status: 'suspicious',
      checkedAt: Date.now(),
      reason: skipReason,
      skipped: true,
    }
  }

  const timeoutMs = options.timeoutMs ?? 10000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    let response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
      cache: 'no-store',
    })

    if (isMethodFallbackStatus(response.status)) {
      response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'follow',
        cache: 'no-store',
      })
    }

    clearTimeout(timer)
    const { status, reason } = classifyResponse(url, response)
    return {
      bookmarkId,
      url,
      status,
      statusCode: response.status,
      checkedAt: Date.now(),
      reason,
    }
  } catch (err) {
    clearTimeout(timer)
    const isAborted = err instanceof Error && err.name === 'AbortError'
    const message = err instanceof Error ? err.message : 'Unknown error'
    const isCorsBlocked =
      err instanceof TypeError &&
      /Failed to fetch|fetch/i.test(message)

    return {
      bookmarkId,
      url,
      status: 'retry',
      checkedAt: Date.now(),
      reason: isAborted
        ? 'Connection timed out'
        : isCorsBlocked
          ? 'Request blocked before the site could be checked'
          : getReason('retry', undefined, message),
    }
  }
}

/**
 * Check multiple URLs with concurrency control.
 */
export async function checkUrls(
  bookmarks: Array<{ id: string; url: string }>,
  options: DeadLinkCheckOptions & {
    maxConcurrent?: number
    onProgress?: (processed: number, total: number) => void
  } = {},
): Promise<DeadLinkResult[]> {
  const { maxConcurrent = 5, onProgress, ...checkOpts } = options
  const batchSize = Number.isInteger(maxConcurrent) && maxConcurrent > 0
    ? maxConcurrent
    : 1
  const results: DeadLinkResult[] = []
  let processed = 0

  for (let i = 0; i < bookmarks.length; i += batchSize) {
    const batch = bookmarks.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      batch.map((b) => checkUrl(b.id, b.url, checkOpts)),
    )
    results.push(...batchResults)
    processed += batch.length
    onProgress?.(processed, bookmarks.length)
  }

  return results
}
