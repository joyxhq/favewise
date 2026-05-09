import { forwardRef } from 'react'
import { cn } from '~/shared/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={cn(
        'w-full rounded-[var(--fw-radius-md)] border border-[var(--fw-border)] bg-[var(--fw-surface)] px-3 py-1.5 text-xs text-[var(--fw-text)] placeholder:text-[var(--fw-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_oklch,var(--fw-accent)_55%,transparent)] focus:ring-offset-1 focus:ring-offset-[var(--fw-bg)] focus:border-[var(--fw-accent)] disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
        className,
      )}
      {...props}
    />
  )
})
Input.displayName = 'Input'
