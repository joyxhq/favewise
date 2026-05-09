import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '~/shared/lib/utils'
import { status, type StatusKey } from '~/shared/lib/tokens'

interface EmptyStateProps {
  Icon: LucideIcon
  title: string
  description?: ReactNode
  tone?: StatusKey
  action?: ReactNode
  /** Sub-card below the action, e.g. safety note */
  footer?: ReactNode
  className?: string
}

/**
 * Unified empty state used across all views.
 * Arc / Notion-flavored: big rounded icon pillow, warm copy, optional CTA.
 */
export function EmptyState({
  Icon,
  title,
  description,
  tone = 'accent',
  action,
  footer,
  className,
}: EmptyStateProps) {
  const toneBlock = status[tone]
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center h-full gap-4 px-6 py-12 text-center',
        className,
      )}
    >
      <div
        className={cn(
          'w-14 h-14 rounded-2xl flex items-center justify-center',
          toneBlock.soft,
        )}
      >
        <Icon className={cn('h-6 w-6', toneBlock.icon)} />
      </div>
      <div className="space-y-1">
        <p className="font-semibold text-[var(--fw-text)] text-sm">{title}</p>
        {description && (
          <p className="text-xs text-[var(--fw-text-muted)] leading-relaxed max-w-[280px] mx-auto">
            {description}
          </p>
        )}
      </div>
      {action}
      {footer}
    </div>
  )
}
