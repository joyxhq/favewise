import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '~/shared/lib/utils'
import { status, type StatusKey } from '~/shared/lib/tokens'

interface StatusBarProps {
  tone?: StatusKey
  Icon?: LucideIcon
  /** Show pulsing dot to signal live activity */
  live?: boolean
  label: ReactNode
  hint?: ReactNode
  trailing?: ReactNode
  /** Progress bar value 0..100. Omit for indeterminate shimmer. */
  progress?: number | null
  progressLabel?: string
  className?: string
}

/**
 * Inline status bar: live scans, paused check, warnings, etc.
 * Renders as a subtle band — never an interstitial.
 */
export function StatusBar({
  tone = 'info',
  Icon,
  live,
  label,
  hint,
  trailing,
  progress,
  progressLabel,
  className,
}: StatusBarProps) {
  const t = status[tone]
  return (
    <div
      className={cn(
        'px-3 py-1.5 border-b border-[var(--fw-border)]',
        t.soft,
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {live ? (
          <span
            className={cn('w-1.5 h-1.5 rounded-full fw-pulse-dot flex-shrink-0', t.icon.replace('text-', 'bg-'))}
            aria-hidden
          />
        ) : Icon ? (
          <Icon className={cn('h-3 w-3 flex-shrink-0', t.icon)} />
        ) : null}
        <span className={cn('text-xs font-medium flex-1 truncate', t.text)}>{label}</span>
        {progressLabel !== undefined && (
          <span className={cn('text-xs tabular-nums opacity-80', t.text)}>{progressLabel}</span>
        )}
        {trailing}
      </div>
      {progress !== undefined && (
        <div className="mt-1 h-1 w-full rounded-full overflow-hidden bg-[color-mix(in_oklch,var(--fw-border)_50%,transparent)]">
          {progress === null ? (
            <div className={cn('h-full w-full rounded-full animate-pulse', t.icon.replace('text-', 'bg-'))} />
          ) : (
            <div
              className={cn('h-full rounded-full transition-all', t.icon.replace('text-', 'bg-'))}
              style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
            />
          )}
        </div>
      )}
      {hint && <p className={cn('text-xs mt-0.5 opacity-75', t.text)}>{hint}</p>}
    </div>
  )
}
