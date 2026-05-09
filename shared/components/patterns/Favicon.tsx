import { useState, type ComponentType } from 'react'
import { Globe } from 'lucide-react'
import { cn } from '~/shared/lib/utils'
import { supportsFaviconEndpoint } from '~/shared/lib/webext'

export interface FaviconProps {
  url: string | undefined
  size?: number
  className?: string
  FallbackIcon?: ComponentType<{ className?: string }>
  framed?: boolean
}

function faviconUrl(pageUrl: string, size: number): string | null {
  try {
    const u = new URL(pageUrl)
    if (!u.hostname) return null
    if (supportsFaviconEndpoint()) {
      const runtime = (globalThis as { chrome?: typeof chrome }).chrome
      if (!runtime?.runtime?.getURL) return null
      const href = runtime.runtime.getURL('/_favicon/')
      return `${href}?pageUrl=${encodeURIComponent(pageUrl)}&size=${size}`
    }
    return null
  } catch {
    return null
  }
}

export function Favicon({
  url,
  size = 16,
  className,
  FallbackIcon = Globe,
  framed,
}: FaviconProps) {
  const [failed, setFailed] = useState(false)
  const src = url ? faviconUrl(url, size * 2) : null
  const pixel = `${size}px`

  if (!src || failed) {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center flex-shrink-0',
          framed &&
            'rounded-[var(--fw-radius-sm)] bg-[var(--fw-bg-subtle)] border border-[var(--fw-border)]',
          className,
        )}
        style={{ width: pixel, height: pixel }}
        aria-hidden
      >
        <FallbackIcon
          className={cn('text-[var(--fw-text-subtle)]')}
        />
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center flex-shrink-0 overflow-hidden',
        framed &&
          'rounded-[var(--fw-radius-sm)] bg-[var(--fw-bg-subtle)] border border-[var(--fw-border)]',
        className,
      )}
      style={{ width: pixel, height: pixel }}
      aria-hidden
    >
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
        style={{ width: pixel, height: pixel, objectFit: 'contain' }}
      />
    </span>
  )
}
