import type { LucideIcon } from 'lucide-react'
import {
  Command,
  Search,
  LayoutDashboard,
  Link2Off,
  Copy,
  FolderOpen,
  Sparkles,
  BarChart3,
  Settings2,
  Shield,
  RefreshCw,
  Trash2,
  Inbox,
  ExternalLink,
} from 'lucide-react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/shared/components/ui/alert-dialog'
import { Button } from '~/shared/components/ui/button'
import { cn } from '~/shared/lib/utils'
import { status } from '~/shared/lib/tokens'
import { useT } from '~/shared/lib/i18n'

interface ShortcutRow {
  keys: string[]
  labelKey: string
  Icon?: LucideIcon
}

const SHORTCUTS: Array<{ groupKey: string; rows: ShortcutRow[] }> = [
  {
    groupKey: 'help.group.open',
    rows: [
      { keys: ['⌘ / Ctrl', 'K'], labelKey: 'help.open.palette', Icon: Command },
      { keys: ['fave', '__SPACE__', 'query'], labelKey: 'help.open.search', Icon: Search },
      { keys: ['fave', '__SPACE__', ':dashboard'], labelKey: 'help.open.jump', Icon: LayoutDashboard },
    ],
  },
  {
    groupKey: 'help.group.list',
    rows: [
      { keys: ['Esc'], labelKey: 'help.list.clear' },
      { keys: ['Delete / Backspace'], labelKey: 'help.list.trash' },
    ],
  },
  {
    groupKey: 'help.group.palette',
    rows: [
      { keys: ['↑', '↓'], labelKey: 'help.palette.nav' },
      { keys: ['Enter'], labelKey: 'help.palette.run' },
      { keys: ['Esc'], labelKey: 'help.palette.close' },
    ],
  },
]

const CONCEPTS: Array<{ Icon: LucideIcon; titleKey: string; bodyKey: string; tone: 'accent' | 'success' | 'info' | 'violet' | 'warning' }> = [
  { Icon: Shield,    tone: 'success', titleKey: 'help.concept.protected.title', bodyKey: 'help.concept.protected.body' },
  { Icon: Inbox,     tone: 'accent',  titleKey: 'help.concept.inbox.title',     bodyKey: 'help.concept.inbox.body' },
  { Icon: Trash2,    tone: 'warning', titleKey: 'help.concept.trash.title',     bodyKey: 'help.concept.trash.body' },
  { Icon: RefreshCw, tone: 'info',    titleKey: 'help.concept.scan.title',      bodyKey: 'help.concept.scan.body' },
]

const VIEW_PAIRS: Array<{ Icon: LucideIcon; nameKey: string; descKey: string }> = [
  { Icon: LayoutDashboard, nameKey: 'nav.dashboard',    descKey: 'help.view.dashboard' },
  { Icon: Link2Off,        nameKey: 'nav.deadLinks',    descKey: 'help.view.deadLinks' },
  { Icon: Copy,            nameKey: 'nav.duplicates',   descKey: 'help.view.duplicates' },
  { Icon: FolderOpen,      nameKey: 'nav.organize',     descKey: 'help.view.organize' },
  { Icon: Sparkles,        nameKey: 'nav.rediscover',   descKey: 'help.view.rediscover' },
  { Icon: BarChart3,       nameKey: 'nav.insights',     descKey: 'help.view.insights' },
  { Icon: Settings2,       nameKey: 'nav.settings',     descKey: 'help.view.settings' },
]

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function HelpDialog({ open, onOpenChange }: Props) {
  const { t } = useT()
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[480px] p-0 overflow-hidden">
        <div className="px-5 pt-5 pb-3">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('help.title')}</AlertDialogTitle>
            <AlertDialogDescription className="sr-only">
              {t('help.footNote')}
            </AlertDialogDescription>
          </AlertDialogHeader>
        </div>

        <div className="max-h-[460px] overflow-y-auto px-5 pb-4 space-y-5">
          {/* Shortcuts */}
          {SHORTCUTS.map((group) => (
            <section key={group.groupKey} className="space-y-1.5">
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--fw-text-subtle)]">
                {t(group.groupKey)}
              </p>
              <div className="rounded-[var(--fw-radius-md)] border border-[var(--fw-border)] bg-[var(--fw-surface)] divide-y divide-[var(--fw-border)]">
                {group.rows.map((row, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="flex items-center gap-2 text-xs min-w-0 flex-1">
                      {row.Icon && (
                        <row.Icon className="h-3 w-3 text-[var(--fw-text-muted)] flex-shrink-0" />
                      )}
                      <span>{t(row.labelKey)}</span>
                    </span>
                    <span className="flex items-center gap-1 flex-shrink-0">
                      {row.keys.map((k, j) => (
                        <kbd
                          key={j}
                          className="font-mono text-[10.5px] px-1.5 py-0.5 rounded bg-[var(--fw-bg-subtle)] border border-[var(--fw-border)] text-[var(--fw-text)]"
                        >
                          {k === '__SPACE__' ? t('help.key.space') : k}
                        </kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}

          {/* Concepts */}
          <section className="space-y-1.5">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--fw-text-subtle)]">
              {t('help.group.concepts')}
            </p>
            <div className="space-y-1.5">
              {CONCEPTS.map((c) => (
                <div
                  key={c.titleKey}
                  className={cn(
                    'flex items-start gap-2.5 p-3 rounded-[var(--fw-radius-md)] border border-transparent',
                    status[c.tone].soft,
                  )}
                >
                  <c.Icon className={cn('h-3.5 w-3.5 flex-shrink-0 mt-0.5', status[c.tone].icon)} />
                  <div>
                    <p className="text-xs font-semibold">{t(c.titleKey)}</p>
                    <p className="text-[11px] opacity-85 mt-0.5 leading-relaxed">{t(c.bodyKey)}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Views overview */}
          <section className="space-y-1.5">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--fw-text-subtle)]">
              {t('help.group.views')}
            </p>
            <div className="rounded-[var(--fw-radius-md)] border border-[var(--fw-border)] bg-[var(--fw-surface)] divide-y divide-[var(--fw-border)]">
              {VIEW_PAIRS.map((v) => (
                <div key={v.nameKey} className="flex items-start gap-2.5 px-3 py-2">
                  <v.Icon className="h-3.5 w-3.5 text-[var(--fw-text-muted)] flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">{t(v.nameKey)}</p>
                    <p className="text-[11px] text-[var(--fw-text-muted)] mt-0.5">{t(v.descKey)}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <p className="text-[10.5px] text-[var(--fw-text-subtle)] flex items-center gap-1">
            <ExternalLink className="h-2.5 w-2.5" />
            {t('help.footNote')}
          </p>
        </div>

        <AlertDialogFooter className="border-t border-[var(--fw-border)] bg-[var(--fw-bg-subtle)] px-4 py-3">
          <Button size="sm" onClick={() => onOpenChange(false)}>
            {t('common.gotIt')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
