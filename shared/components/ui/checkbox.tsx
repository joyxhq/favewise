import { forwardRef } from 'react'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { Check } from 'lucide-react'
import { cn } from '~/shared/lib/utils'

export const Checkbox = forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'peer h-4 w-4 shrink-0 rounded-[var(--fw-radius-sm)] border border-[var(--fw-border-strong)] bg-[var(--fw-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklch,var(--fw-accent)_55%,transparent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--fw-bg)] disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-[var(--fw-accent)] data-[state=checked]:border-[var(--fw-accent)] transition-colors cursor-pointer',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-[var(--fw-accent-fg)]">
      <Check className="h-2.5 w-2.5" strokeWidth={3.2} />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName
