import type { LucideIcon } from 'lucide-react'
import { cn } from '~/shared/lib/utils'
import { status, type StatusKey } from '~/shared/lib/tokens'

interface IconBoxProps {
  Icon: LucideIcon
  tone?: StatusKey
  size?: 'sm' | 'md' | 'lg'
  className?: string
  iconClassName?: string
}

const SIZE: Record<NonNullable<IconBoxProps['size']>, { box: string; icon: string }> = {
  sm: { box: 'w-6 h-6 rounded-lg',   icon: 'h-3 w-3' },
  md: { box: 'w-8 h-8 rounded-lg',   icon: 'h-4 w-4' },
  lg: { box: 'w-10 h-10 rounded-xl', icon: 'h-5 w-5' },
}

export function IconBox({ Icon, tone = 'accent', size = 'md', className, iconClassName }: IconBoxProps) {
  const s = SIZE[size]
  const t = status[tone]
  return (
    <div className={cn('flex items-center justify-center flex-shrink-0', s.box, t.soft, className)}>
      <Icon className={cn(s.icon, t.icon, iconClassName)} />
    </div>
  )
}
