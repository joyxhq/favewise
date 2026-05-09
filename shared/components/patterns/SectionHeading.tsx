import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '~/shared/lib/utils'

interface SectionHeadingProps {
  children: ReactNode
  Icon?: LucideIcon
  iconClassName?: string
  trailing?: ReactNode
  className?: string
}

export function SectionHeading({
  children,
  Icon,
  iconClassName,
  trailing,
  className,
}: SectionHeadingProps) {
  return (
    <div className={cn('flex items-center justify-between px-0.5', className)}>
      <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--fw-text-subtle)] flex items-center gap-1.5">
        {Icon && <Icon className={cn('h-3 w-3', iconClassName)} />}
        {children}
      </h3>
      {trailing}
    </div>
  )
}
