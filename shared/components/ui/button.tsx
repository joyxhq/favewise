import { forwardRef } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '~/shared/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 rounded-[var(--fw-radius-md)] text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklch,var(--fw-accent)_55%,transparent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--fw-bg)] disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--fw-accent)] text-[var(--fw-accent-fg)] hover:bg-[color-mix(in_oklch,var(--fw-accent)_90%,black)] active:bg-[color-mix(in_oklch,var(--fw-accent)_82%,black)]',
        destructive:
          'bg-[var(--fw-danger)] text-white hover:bg-[color-mix(in_oklch,var(--fw-danger)_88%,black)] active:bg-[color-mix(in_oklch,var(--fw-danger)_80%,black)]',
        success:
          'bg-[var(--fw-success)] text-white hover:bg-[color-mix(in_oklch,var(--fw-success)_88%,black)] active:bg-[color-mix(in_oklch,var(--fw-success)_80%,black)]',
        outline:
          'border border-[var(--fw-border-strong)] bg-[var(--fw-surface)] hover:bg-[var(--fw-bg-subtle)] text-[var(--fw-text)]',
        secondary:
          'bg-[var(--fw-surface-2)] text-[var(--fw-text)] hover:bg-[var(--fw-bg-subtle)] border border-[var(--fw-border)]',
        ghost:
          'text-[var(--fw-text-muted)] hover:bg-[var(--fw-bg-subtle)] hover:text-[var(--fw-text)]',
        link: 'text-[var(--fw-accent-text)] underline-offset-4 hover:underline h-auto p-0',
      },
      size: {
        default: 'h-7 px-3 py-1.5',
        sm: 'h-6 px-2',
        lg: 'h-8 px-4',
        xl: 'h-9 px-5 text-sm',
        icon: 'h-7 w-7 p-0',
        'icon-sm': 'h-6 w-6 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    )
  },
)
Button.displayName = 'Button'

export { buttonVariants }
