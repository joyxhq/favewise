import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/shared/components/ui/alert-dialog'
import { cn } from '~/shared/lib/utils'
import { status, type StatusKey } from '~/shared/lib/tokens'
import { useT } from '~/shared/lib/i18n'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  /** Rich preview slot shown between description and actions */
  preview?: ReactNode
  confirmLabel: string
  ConfirmIcon?: LucideIcon
  cancelLabel?: string
  /** Visual tone for the confirm action */
  tone?: 'danger' | 'accent' | 'success' | 'info'
  onConfirm: () => void | Promise<void>
  busy?: boolean
  footerNote?: ReactNode
}

const TONE_BUTTON: Record<NonNullable<ConfirmDialogProps['tone']>, string> = {
  danger:  'bg-[var(--fw-danger)] text-white hover:bg-[color-mix(in_oklch,var(--fw-danger)_88%,black)]',
  accent:  'bg-[var(--fw-accent)] text-[var(--fw-accent-fg)] hover:bg-[color-mix(in_oklch,var(--fw-accent)_90%,black)]',
  success: 'bg-[var(--fw-success)] text-white hover:bg-[color-mix(in_oklch,var(--fw-success)_88%,black)]',
  info:    'bg-[var(--fw-info)] text-white hover:bg-[color-mix(in_oklch,var(--fw-info)_88%,black)]',
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  preview,
  confirmLabel,
  ConfirmIcon,
  cancelLabel,
  tone = 'accent',
  onConfirm,
  busy,
  footerNote,
}: ConfirmDialogProps) {
  const { t } = useT()
  const resolvedCancel = cancelLabel ?? t('common.cancel')
  const handleConfirm = async () => {
    await onConfirm()
  }
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description
            ? <AlertDialogDescription>{description}</AlertDialogDescription>
            : <AlertDialogDescription className="sr-only">{title}</AlertDialogDescription>}
        </AlertDialogHeader>
        {preview && (
          <div className="mt-2 space-y-1">
            {preview}
          </div>
        )}
        {footerNote && (
          <div className={cn('mt-3 px-2.5 py-1.5 rounded-[var(--fw-radius-md)] text-xs', status.warning.soft)}>
            {footerNote}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{resolvedCancel}</AlertDialogCancel>
          <AlertDialogAction
            className={cn('gap-1.5', TONE_BUTTON[tone])}
            onClick={handleConfirm}
            disabled={busy}
          >
            {ConfirmIcon && <ConfirmIcon className="h-3 w-3" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

interface PreviewListProps {
  items: ReactNode[]
  max?: number
  emptyText?: string
  className?: string
}

/** Compact preview list used inside ConfirmDialog preview slot. */
export function PreviewList({ items, max = 5, emptyText, className }: PreviewListProps) {
  const { t } = useT()
  if (items.length === 0) {
    return emptyText ? (
      <p className="text-xs text-[var(--fw-text-muted)] italic">{emptyText}</p>
    ) : null
  }
  const visible = items.slice(0, max)
  const hidden = items.length - visible.length
  return (
    <div className={cn('rounded-[var(--fw-radius-md)] border border-[var(--fw-border)] bg-[var(--fw-surface-2)] divide-y divide-[var(--fw-border)]', className)}>
      {visible.map((item, i) => (
        <div key={i} className="px-2.5 py-1.5 text-xs truncate">
          {item}
        </div>
      ))}
      {hidden > 0 && (
        <div className="px-2.5 py-1.5 text-xs text-[var(--fw-text-muted)]">
          {t('common.nMore', { count: hidden })}
        </div>
      )}
    </div>
  )
}
