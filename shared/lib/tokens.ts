/**
 * Favewise semantic design tokens.
 *
 * Prefer these class strings over ad-hoc Tailwind color utilities so that
 * theme / accent / dark-mode changes propagate automatically. Backed by the
 * CSS custom properties in `entrypoints/sidepanel/style.css`.
 */

export const tone = {
  /** Canvas — app background */
  bg:        'bg-[var(--fw-bg)]',
  bgSubtle:  'bg-[var(--fw-bg-subtle)]',
  surface:   'bg-[var(--fw-surface)]',
  surface2:  'bg-[var(--fw-surface-2)]',
  border:    'border-[var(--fw-border)]',
  borderStrong: 'border-[var(--fw-border-strong)]',
  text:      'text-[var(--fw-text)]',
  textMuted: 'text-[var(--fw-text-muted)]',
  textSubtle:'text-[var(--fw-text-subtle)]',
} as const

export const status = {
  accent: {
    solid:     'bg-[var(--fw-accent)] text-[var(--fw-accent-fg)]',
    soft:      'bg-[var(--fw-accent-soft)] text-[var(--fw-accent-text)]',
    text:      'text-[var(--fw-accent-text)]',
    icon:      'text-[var(--fw-accent)]',
    border:    'border-[var(--fw-accent)]',
  },
  success: {
    solid:  'bg-[var(--fw-success)] text-white',
    soft:   'bg-[var(--fw-success-soft)] text-[var(--fw-success-text)]',
    text:   'text-[var(--fw-success-text)]',
    icon:   'text-[var(--fw-success)]',
  },
  danger: {
    solid:  'bg-[var(--fw-danger)] text-white',
    soft:   'bg-[var(--fw-danger-soft)] text-[var(--fw-danger-text)]',
    text:   'text-[var(--fw-danger-text)]',
    icon:   'text-[var(--fw-danger)]',
  },
  warning: {
    solid:  'bg-[var(--fw-warning)] text-[var(--fw-accent-fg)]',
    soft:   'bg-[var(--fw-warning-soft)] text-[var(--fw-warning-text)]',
    text:   'text-[var(--fw-warning-text)]',
    icon:   'text-[var(--fw-warning)]',
  },
  info: {
    solid:  'bg-[var(--fw-info)] text-white',
    soft:   'bg-[var(--fw-info-soft)] text-[var(--fw-info-text)]',
    text:   'text-[var(--fw-info-text)]',
    icon:   'text-[var(--fw-info)]',
  },
  violet: {
    soft:   'bg-[var(--fw-violet-soft)] text-[var(--fw-violet-text)]',
    text:   'text-[var(--fw-violet-text)]',
    icon:   'text-[var(--fw-violet)]',
  },
} as const

export type StatusKey = keyof typeof status

export const radii = {
  sm: 'rounded-[var(--fw-radius-sm)]',
  md: 'rounded-[var(--fw-radius-md)]',
  lg: 'rounded-[var(--fw-radius-lg)]',
  xl: 'rounded-[var(--fw-radius-xl)]',
} as const

export const elevation = {
  none: '',
  sm:   'shadow-[var(--fw-shadow-sm)]',
  md:   'shadow-[var(--fw-shadow-md)]',
  lg:   'shadow-[var(--fw-shadow-lg)]',
} as const
