import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  Search,
  X,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
  ExternalLink,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from '~/shared/components/ui/alert-dialog'
import { Input } from '~/shared/components/ui/input'
import { Favicon } from './Favicon'
import { cn } from '~/shared/lib/utils'
import { status } from '~/shared/lib/tokens'
import { useT } from '~/shared/lib/i18n'

export interface CommandAction {
  id: string
  label: string
  Icon: LucideIcon
  /** Shown as secondary text next to label */
  hint?: string
  /** Optional keyboard shortcut hint */
  shortcut?: string
  onRun: () => void | Promise<void>
  /** Group header for grouping commands */
  group?: string
}

interface BookmarkItem {
  id: string
  title: string
  url: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  commands: CommandAction[]
}

type Item =
  | ({ kind: 'command' } & CommandAction)
  | { kind: 'bookmark'; id: string; title: string; url: string }

export function CommandPalette({ open, onOpenChange, commands }: Props) {
  const { t } = useT()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([])
  const listRef = useRef<HTMLDivElement | null>(null)

  // Reset on open/close
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelected(0)
    }
  }, [open])

  // Search bookmarks when query changes (debounced)
  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (q.length < 2) {
      setBookmarks([])
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      chrome.bookmarks
        .search(q)
        .then((results) => {
          if (cancelled) return
          setBookmarks(
            results
              .filter((r) => !!r.url)
              .slice(0, 8)
              .map((r) => ({ id: r.id, title: r.title || r.url!, url: r.url! })),
          )
        })
        .catch(() => {
          if (!cancelled) setBookmarks([])
        })
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, open])

  // Build filtered list
  const { commandGroups, items } = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filteredCommands = q
      ? commands.filter(
          (c) =>
            c.label.toLowerCase().includes(q) ||
            (c.hint?.toLowerCase().includes(q) ?? false) ||
            (c.group?.toLowerCase().includes(q) ?? false),
        )
      : commands

    const grouped = new Map<string, CommandAction[]>()
    for (const c of filteredCommands) {
      const g = c.group ?? 'General'
      const list = grouped.get(g) ?? []
      list.push(c)
      grouped.set(g, list)
    }

    const flat: Item[] = []
    for (const [, list] of grouped) {
      for (const c of list) flat.push({ kind: 'command', ...c })
    }
    for (const b of bookmarks) flat.push({ kind: 'bookmark', ...b })
    return { commandGroups: grouped, items: flat }
  }, [query, commands, bookmarks])

  // Clamp selection to list length
  useEffect(() => {
    if (selected >= items.length) setSelected(Math.max(0, items.length - 1))
  }, [items.length, selected])

  const runItem = useCallback(
    async (item: Item) => {
      if (item.kind === 'command') {
        onOpenChange(false)
        await item.onRun()
      } else {
        onOpenChange(false)
        await chrome.tabs.create({ url: item.url })
      }
    },
    [onOpenChange],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelected((s) => Math.min(s + 1, items.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelected((s) => Math.max(s - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const item = items[selected]
        if (item) void runItem(item)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onOpenChange(false)
      }
    },
    [items, selected, runItem, onOpenChange],
  )

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.querySelector(
      `[data-index="${selected}"]`,
    ) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const renderGroups: Array<[string, Array<{ item: Item; flatIndex: number }>]> = []
  let flatIndex = 0
  for (const [group, list] of commandGroups) {
    const entries: Array<{ item: Item; flatIndex: number }> = []
    for (const c of list) {
      entries.push({ item: { kind: 'command', ...c }, flatIndex: flatIndex++ })
    }
    if (entries.length > 0) renderGroups.push([group, entries])
  }
  const bookmarkEntries = bookmarks.map((b) => ({
    item: { kind: 'bookmark' as const, ...b },
    flatIndex: flatIndex++,
  }))

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className="max-w-[440px] p-0 overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        {/* A11y: title & description hidden from sighted users but announced
         * to screen readers. Required by Radix AlertDialog. */}
        <AlertDialogTitle className="sr-only">{t('cmd.title')}</AlertDialogTitle>
        <AlertDialogDescription className="sr-only">
          {t('cmd.placeholder')}
        </AlertDialogDescription>

        {/* Search input */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--fw-border)]">
          <Search className="h-4 w-4 text-[var(--fw-text-subtle)] flex-shrink-0" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('cmd.placeholder')}
            className="border-0 bg-transparent px-0 h-7 text-sm focus:ring-0"
            autoFocus
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label={t('common.clear')}
              className="text-[var(--fw-text-subtle)] hover:text-[var(--fw-text)]"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[360px] overflow-y-auto">
          {renderGroups.length === 0 && bookmarkEntries.length === 0 && (
            <p className="text-xs text-[var(--fw-text-subtle)] text-center py-6">
              {query.trim().length < 2
                ? t('cmd.typeToSearch')
                : t('cmd.noMatches', { query })}
            </p>
          )}

          {renderGroups.map(([group, entries]) => (
            <div key={group}>
              <div className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--fw-text-subtle)]">
                {group}
              </div>
              {entries.map(({ item, flatIndex: idx }) => {
                const isActive = idx === selected
                if (item.kind !== 'command') return null
                return (
                  <CommandRow
                    key={item.id}
                    active={isActive}
                    index={idx}
                    onHover={() => setSelected(idx)}
                    onClick={() => void runItem(item)}
                  >
                    <item.Icon
                      className={cn(
                        'h-3.5 w-3.5 flex-shrink-0',
                        isActive ? status.accent.icon : 'text-[var(--fw-text-muted)]',
                      )}
                    />
                    <span className="text-xs font-medium truncate flex-1">
                      {item.label}
                    </span>
                    {item.hint && (
                      <span className="text-[10.5px] text-[var(--fw-text-subtle)] flex-shrink-0">
                        {item.hint}
                      </span>
                    )}
                    {item.shortcut && (
                      <kbd className="text-[10px] px-1 py-0.5 rounded bg-[var(--fw-bg-subtle)] border border-[var(--fw-border)] font-mono flex-shrink-0">
                        {item.shortcut}
                      </kbd>
                    )}
                  </CommandRow>
                )
              })}
            </div>
          ))}

          {bookmarkEntries.length > 0 && (
            <div>
              <div className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--fw-text-subtle)]">
                {t('cmd.group.bookmarks')}
              </div>
              {bookmarkEntries.map(({ item, flatIndex: idx }) => {
                const isActive = idx === selected
                if (item.kind !== 'bookmark') return null
                return (
                  <CommandRow
                    key={item.id}
                    active={isActive}
                    index={idx}
                    onHover={() => setSelected(idx)}
                    onClick={() => void runItem(item)}
                  >
                    <Favicon url={item.url} size={14} framed className="flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{item.title}</p>
                      <p className="text-[10.5px] text-[var(--fw-text-subtle)] truncate font-mono">
                        {item.url}
                      </p>
                    </div>
                    <ExternalLink className="h-3 w-3 text-[var(--fw-text-subtle)] flex-shrink-0" />
                  </CommandRow>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer key hints */}
        <div className="border-t border-[var(--fw-border)] px-3 py-2 flex items-center gap-3 text-[10.5px] text-[var(--fw-text-subtle)] bg-[var(--fw-bg-subtle)]">
          <span className="flex items-center gap-1">
            <ArrowUp className="h-2.5 w-2.5" />
            <ArrowDown className="h-2.5 w-2.5" />
            {t('cmd.nav')}
          </span>
          <span className="flex items-center gap-1">
            <CornerDownLeft className="h-2.5 w-2.5" />
            {t('cmd.run')}
          </span>
          <span className="flex items-center gap-1">
            <kbd className="font-mono">Esc</kbd>
            {t('cmd.close')}
          </span>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function CommandRow({
  active,
  index,
  onHover,
  onClick,
  children,
}: {
  active: boolean
  index: number
  onHover: () => void
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      data-index={index}
      onMouseEnter={onHover}
      onFocus={onHover}
      onClick={onClick}
      className={cn(
        'w-full px-3 py-1.5 flex items-center gap-2 text-left transition-colors',
        active ? 'bg-[var(--fw-accent-soft)]' : 'hover:bg-[var(--fw-bg-subtle)]',
      )}
    >
      {children}
    </button>
  )
}
