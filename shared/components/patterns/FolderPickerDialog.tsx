import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { FolderOpen, Search, X, Check, Sparkles } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
} from '~/shared/components/ui/alert-dialog'
import { Input } from '~/shared/components/ui/input'
import { Checkbox } from '~/shared/components/ui/checkbox'
import { Button } from '~/shared/components/ui/button'
import { Badge } from '~/shared/components/ui/badge'
import { cn } from '~/shared/lib/utils'
import { send } from '~/shared/lib/messaging'
import type { FolderSummary } from '~/shared/types/messages'
import { useT } from '~/shared/lib/i18n'

interface FolderPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description?: string
  /** Currently-selected folder IDs (for `ids` mode) or folder path keys (for `paths` mode) */
  value: string[]
  onChange: (value: string[]) => void
  /** Which key to use: folder id or joined folderPath. Default: 'id' */
  valueKey?: 'id' | 'path'
  multiple?: boolean
  confirmLabel?: string
  /** Pre-fetched folders. If omitted, will fetch via `folders.get`. */
  folders?: FolderSummary[]
  searchPlaceholder?: string
  topContent?: ReactNode
  /**
   * When true, sort folders by "messiness score" (lots of direct links,
   * few subfolders) descending. Surfaces the folders most worth organizing
   * at the top.
   */
  sortByMessiness?: boolean
}

export function FolderPickerDialog({
  open,
  onOpenChange,
  title,
  description,
  value,
  onChange,
  valueKey = 'id',
  multiple = true,
  confirmLabel,
  folders: foldersProp,
  sortByMessiness = false,
  searchPlaceholder,
  topContent,
}: FolderPickerDialogProps) {
  const { t } = useT()
  const resolvedTitle = title ?? t('inbox.pickFolder')
  const resolvedConfirm = confirmLabel ?? t('common.apply')
  const [fetched, setFetched] = useState<FolderSummary[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [draft, setDraft] = useState<Set<string>>(new Set(value))
  const [search, setSearch] = useState('')
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null)

  // When a list was supplied, always use the freshest prop value.
  // Otherwise fall back to what we lazy-fetched.
  const folders: FolderSummary[] = foldersProp ?? fetched ?? []

  // Load folders the first time the dialog opens without a preloaded list.
  useEffect(() => {
    if (!open || foldersProp || fetched !== null) return
    let cancelled = false
    setLoading(true)
    send('folders.get').then((res) => {
      if (cancelled) return
      setFetched(res.ok ? res.data : [])
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [open, foldersProp, fetched])

  // Sync draft with external value each time dialog opens
  useEffect(() => {
    if (open) {
      setDraft(new Set(value))
      setAnchorIndex(null)
    }
  }, [open, value])

  useEffect(() => {
    setAnchorIndex(null)
  }, [search])

  const filtered = useMemo(() => {
    let all = folders
      .filter((f) => f.id !== '0') // virtual root
      .map((f) => {
        const links = f.directLinkCount ?? 0
        const subs = f.directSubfolderCount ?? 0
        // Messiness: many loose links, few subfolders. Subfolders > 0 damps.
        const messiness = links - subs * 2
        return {
          ...f,
          fullLabel: [...f.folderPath, f.title].filter(Boolean).join(' / '),
          pathKey: [...f.folderPath, f.title].filter(Boolean).join('/'),
          messiness,
        }
      })

    if (sortByMessiness) {
      all = all.sort((a, b) => {
        if (b.messiness !== a.messiness) return b.messiness - a.messiness
        return a.fullLabel.localeCompare(b.fullLabel)
      })
    }

    if (!search.trim()) return all
    const q = search.trim().toLowerCase()
    return all.filter((f) => f.fullLabel.toLowerCase().includes(q))
  }, [folders, search, sortByMessiness])

  const keyOf = (f: { id: string; pathKey: string }) => (valueKey === 'id' ? f.id : f.pathKey)
  const filteredKeys = useMemo(() => filtered.map((f) => keyOf(f)), [filtered, valueKey])
  const selectedFilteredCount = useMemo(
    () => filteredKeys.filter((key) => draft.has(key)).length,
    [draft, filteredKeys],
  )
  const hasSearch = search.trim().length > 0
  const allFilteredSelected =
    multiple && filteredKeys.length > 0 && selectedFilteredCount === filteredKeys.length
  const showSelectionTools = draft.size > 0 || (multiple && hasSearch && filteredKeys.length > 0)

  const selectAt = (
    index: number,
    modifiers: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean } = {},
  ) => {
    const key = filteredKeys[index]
    if (!key) return

    setDraft((prev) => {
      const next = new Set(prev)
      if (!multiple) {
        next.clear()
        next.add(key)
        return next
      }

      if (modifiers.shiftKey && anchorIndex !== null) {
        const start = Math.min(anchorIndex, index)
        const end = Math.max(anchorIndex, index)
        filteredKeys.slice(start, end + 1).forEach((rangeKey) => next.add(rangeKey))
        return next
      }

      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

    if (!modifiers.shiftKey) setAnchorIndex(index)
  }

  const confirm = () => {
    onChange(Array.from(draft))
    onOpenChange(false)
  }

  const toggleFiltered = () => {
    if (!multiple || filteredKeys.length === 0) return
    setDraft((prev) => {
      const next = new Set(prev)
      if (allFilteredSelected) {
        filteredKeys.forEach((key) => next.delete(key))
      } else {
        filteredKeys.forEach((key) => next.add(key))
      }
      return next
    })
  }

  const selectFiltered = () => {
    if (!multiple || filteredKeys.length === 0) return
    setDraft((prev) => {
      const next = new Set(prev)
      filteredKeys.forEach((key) => next.add(key))
      return next
    })
    setAnchorIndex(0)
  }

  const onDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!multiple) return
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault()
      selectFiltered()
    }
  }

  const onRowKeyDown = (index: number, event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    selectAt(index, {
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
    })
  }

  const onRowClick = (index: number, event: MouseEvent<HTMLElement>) => {
    event.preventDefault()
    selectAt(index, {
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md p-0" onKeyDown={onDialogKeyDown}>
        <div className="p-5 pb-3">
          <AlertDialogHeader>
            <AlertDialogTitle>{resolvedTitle}</AlertDialogTitle>
            {description
              ? <AlertDialogDescription>{description}</AlertDialogDescription>
              : <AlertDialogDescription className="sr-only">{resolvedTitle}</AlertDialogDescription>}
          </AlertDialogHeader>
          {topContent}

          {/* Search — sticky at top of dialog */}
          <div className="relative mt-3">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--fw-text-subtle)]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder ?? t('folderPicker.searchPlaceholder')}
              className="pl-7 pr-7 h-7"
              autoFocus
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

          {showSelectionTools && (
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-xs text-[var(--fw-text-muted)]">
                {draft.size > 0 ? t('common.selected', { count: draft.size }) : t('common.nItems', { count: filteredKeys.length })}
              </p>
              {multiple && filteredKeys.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={toggleFiltered}
                  className="h-5 px-1.5 text-[11px]"
                >
                  {allFilteredSelected ? t('common.deselectMatches') : t('common.selectMatches')}
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Scrollable folder list */}
        <div className="mx-5 rounded-[var(--fw-radius-md)] border border-[var(--fw-border)] max-h-[260px] overflow-y-auto">
          {loading ? (
            <div className="p-6 text-xs text-[var(--fw-text-subtle)] text-center">{t('common.loading')}</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-xs text-[var(--fw-text-subtle)] text-center">
              {t('folderPicker.noneMatch', { query: search })}
            </div>
          ) : (
            <div role="listbox" aria-multiselectable={multiple} className="divide-y divide-[var(--fw-border)]">
              {filtered.map((f, idx) => {
                const k = keyOf(f)
                const checked = draft.has(k)
                const messy = sortByMessiness && idx < 5 && f.messiness >= 10
                const parentLabel = f.folderPath.filter(Boolean).join(' / ')
                const countLabel =
                  (f.directLinkCount ?? 0) + (f.directSubfolderCount ?? 0) > 0
                    ? [
                        t('common.linksN', { count: f.directLinkCount ?? 0 }),
                        (f.directSubfolderCount ?? 0) > 0
                          ? t('common.subfoldersN', { count: f.directSubfolderCount ?? 0 })
                          : null,
                      ].filter(Boolean).join(' · ')
                    : ''
                const metaLabel = [parentLabel, countLabel].filter(Boolean).join(' · ')
                return (
                  <div
                    key={k}
                    title={f.fullLabel || f.title}
                    role="option"
                    aria-selected={checked}
                    data-fw-folder-picker-row
                    data-fw-folder-picker-key={k}
                    tabIndex={0}
                    onClick={(event) => onRowClick(idx, event)}
                    onKeyDown={(event) => onRowKeyDown(idx, event)}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors',
                      checked
                        ? 'bg-[var(--fw-accent-soft)]'
                        : 'hover:bg-[var(--fw-bg-subtle)]',
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      tabIndex={-1}
                      onClick={(event) => {
                        event.stopPropagation()
                        onRowClick(idx, event)
                      }}
                      aria-label={t('common.selectItem', { name: f.fullLabel })}
                    />
                    <FolderOpen
                      className={cn(
                        'h-3.5 w-3.5 flex-shrink-0',
                        checked ? 'text-[var(--fw-accent)]' : 'text-[var(--fw-text-subtle)]',
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs truncate">{f.title || f.fullLabel}</p>
                      {metaLabel && (
                        <p className="text-[10.5px] text-[var(--fw-text-subtle)] truncate mt-0.5">
                          {metaLabel}
                        </p>
                      )}
                    </div>
                    {messy && (
                      <Badge variant="warning" className="flex-shrink-0 gap-0.5">
                        <Sparkles className="h-2.5 w-2.5" />
                        {t('common.messy')}
                      </Badge>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <AlertDialogFooter className="p-5 pt-3">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" onClick={confirm} className="gap-1">
            <Check className="h-3 w-3" />
            {resolvedConfirm}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
