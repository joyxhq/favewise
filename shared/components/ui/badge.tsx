import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '~/shared/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-[var(--fw-radius-sm)] px-1.5 py-0.5 text-[10.5px] font-semibold transition-colors leading-none tracking-wide uppercase',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--fw-surface-2)] text-[var(--fw-text-muted)] border border-[var(--fw-border)]',
        primary: 'bg-[var(--fw-accent-soft)] text-[var(--fw-accent-text)]',
        destructive: 'bg-[var(--fw-danger-soft)] text-[var(--fw-danger-text)]',
        warning: 'bg-[var(--fw-warning-soft)] text-[var(--fw-warning-text)]',
        success: 'bg-[var(--fw-success-soft)] text-[var(--fw-success-text)]',
        info: 'bg-[var(--fw-info-soft)] text-[var(--fw-info-text)]',
        purple: 'bg-[var(--fw-violet-soft)] text-[var(--fw-violet-text)]',
        orange: 'bg-[var(--fw-warning-soft)] text-[var(--fw-warning-text)]',
        outline:
          'border border-[var(--fw-border-strong)] text-[var(--fw-text-muted)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { badgeVariants }
