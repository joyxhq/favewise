import { cn } from '~/shared/lib/utils'

interface SkeletonProps {
  className?: string
}

/** Shimmer block used while awaiting data. */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'fw-shimmer rounded-[var(--fw-radius-md)] bg-[var(--fw-surface-2)]',
        className,
      )}
    />
  )
}

export function SkeletonRow({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-[var(--fw-radius-lg)] border border-[var(--fw-border)] bg-[var(--fw-surface)]',
        className,
      )}
    >
      <Skeleton className="h-8 w-8 rounded-lg" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3 w-3/5" />
        <Skeleton className="h-2.5 w-2/5" />
      </div>
    </div>
  )
}

export function SkeletonList({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  )
}
