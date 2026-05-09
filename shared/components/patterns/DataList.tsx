import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '~/shared/components/ui/input'
import { Checkbox } from '~/shared/components/ui/checkbox'
import { cn } from '~/shared/lib/utils'
import { useT } from '~/shared/lib/i18n'

interface DataListProps<T> {
  items: readonly T[]
  getId: (item: T) => string
  /** Optional: supply a search predicate to enable the search box */
  searchFields?: (item: T) => string
  searchPlaceholder?: string
  /** Provide to enable multi-select */
  selected?: Set<string>
  onSelectedChange?: (next: Set<string>) => void
  /** Row renderer. Receives helpers for selection */
  renderRow: (args: {
    item: T
    id: string
    selected: boolean
    toggle: () => void
  }) => ReactNode
  /** Rendered when the list is empty (before filtering) */
  empty?: ReactNode
  /** Rendered when filter yields zero results */
  noResults?: ReactNode
  /** Optional sticky header above the list (rendered inside DataList) */
  header?: ReactNode
  /** Rendered when there is a selection (sticky bottom bar) */
  footerBar?: (args: {
    selectedCount: number
    clear: () => void
    selectedIds: string[]
  }) => ReactNode
  /** Keyboard handlers for selection */
  onDelete?: (ids: string[]) => void
  className?: string
}

/**
 * Shared list component: integrated search, select-all, per-row selection,
 * keyboard shortcuts (Esc clear, Delete triggers `onDelete`).
 */
export function DataList<T>({
  items,
  getId,
  searchFields,
  searchPlaceholder,
  selected,
  onSelectedChange,
  renderRow,
  empty,
  noResults,
  header,
  footerBar,
  onDelete,
  className,
}: DataListProps<T>) {
  const { t } = useT()
  const resolvedSearchPlaceholder = searchPlaceholder ?? t('lib.searchPlaceholder')
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement | null>(null)

  const filtered = useMemo(() => {
    if (!searchFields || !search.trim()) return items
    const q = search.trim().toLowerCase()
    return items.filter((it) => searchFields(it).toLowerCase().includes(q))
  }, [items, search, searchFields])

  const selectable = !!selected && !!onSelectedChange
  const visibleIds = useMemo(() => filtered.map((it) => getId(it)), [filtered, getId])
  const allVisibleSelected =
    selectable && visibleIds.length > 0 && visibleIds.every((id) => selected!.has(id))

  const toggle = useCallback(
    (id: string) => {
      if (!selectable) return
      const next = new Set(selected!)
      next.has(id) ? next.delete(id) : next.add(id)
      onSelectedChange!(next)
    },
    [selectable, selected, onSelectedChange],
  )

  const toggleAll = useCallback(() => {
    if (!selectable) return
    if (allVisibleSelected) {
      const next = new Set(selected!)
      visibleIds.forEach((id) => next.delete(id))
      onSelectedChange!(next)
    } else {
      const next = new Set(selected!)
      visibleIds.forEach((id) => next.add(id))
      onSelectedChange!(next)
    }
  }, [selectable, allVisibleSelected, selected, onSelectedChange, visibleIds])

  const clear = useCallback(() => {
    if (selectable) onSelectedChange!(new Set())
  }, [selectable, onSelectedChange])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: KeyboardEvent) => {
      if (!selectable || (selected?.size ?? 0) === 0) return
      if (e.target && (e.target as HTMLElement).matches('input, textarea')) return
      if (e.key === 'Escape') {
        e.preventDefault()
        clear()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (onDelete) {
          e.preventDefault()
          onDelete(Array.from(selected!))
        }
      }
    }
    el.addEventListener('keydown', handler)
    return () => el.removeEventListener('keydown', handler)
  }, [selectable, selected, clear, onDelete])

  const selectedArr = selected ? Array.from(selected) : []

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className={cn('flex flex-col flex-1 min-h-0 focus:outline-none', className)}
    >
      {/* Search */}
      {searchFields && (
        <div className="px-3 pt-2.5 pb-2 border-b border-[var(--fw-border)] flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--fw-text-subtle)]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={resolvedSearchPlaceholder}
              className="pl-7 pr-7 h-7"
              aria-label={resolvedSearchPlaceholder}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                aria-label={t('common.clear')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--fw-text-subtle)] hover:text-[var(--fw-text)]"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Custom header */}
      {header}

      {/* Select-all + counts */}
      {selectable && filtered.length > 0 && (
        <div className="px-3 py-1.5 border-b border-[var(--fw-border)] flex items-center gap-2 flex-shrink-0 bg-[var(--fw-bg-subtle)]">
          <Checkbox
            checked={allVisibleSelected}
            onCheckedChange={toggleAll}
            aria-label={allVisibleSelected ? t('dup.deselectAll') : t('dup.selectAll')}
            id="dl-select-all"
          />
          <label
            htmlFor="dl-select-all"
            className="text-xs text-[var(--fw-text-muted)] cursor-pointer select-none"
          >
            {allVisibleSelected
              ? t('dup.deselectAll')
              : `${t('dup.selectAll')} (${filtered.length})`}
          </label>
          {(selected?.size ?? 0) > 0 && (selected?.size ?? 0) !== visibleIds.length && (
            <span className="ml-auto text-xs text-[var(--fw-text-subtle)]">
              {t('common.selected', { count: selected!.size })}
            </span>
          )}
        </div>
      )}

      {/* List body */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          empty
        ) : filtered.length === 0 ? (
          noResults ?? (
            <div className="flex items-center justify-center h-24 text-xs text-[var(--fw-text-subtle)]">
              {t('common.noResults')}
            </div>
          )
        ) : (
          <div className="divide-y divide-[var(--fw-border)]">
            {filtered.map((item) => {
              const id = getId(item)
              return (
                <div key={id}>
                  {renderRow({
                    item,
                    id,
                    selected: selected?.has(id) ?? false,
                    toggle: () => toggle(id),
                  })}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer action bar */}
      {footerBar && selectable && (selected?.size ?? 0) > 0 && (
        <div className="border-t border-[var(--fw-border)] bg-[var(--fw-surface)] flex-shrink-0">
          {footerBar({
            selectedCount: selected!.size,
            clear,
            selectedIds: selectedArr,
          })}
        </div>
      )}
    </div>
  )
}
