import { useMemo, useState } from 'react'
import {
  Copy,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Check,
  Clock,
  ShieldCheck,
  Layers,
  FolderOpen,
  Sparkles,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'
import { toast } from 'sonner'
import type { DuplicateGroup, BookmarkRecord } from '~/shared/types'
import type { ViewProps } from '../App'
import { Button } from '~/shared/components/ui/button'
import { Badge } from '~/shared/components/ui/badge'
import { Checkbox } from '~/shared/components/ui/checkbox'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '~/shared/components/ui/tooltip'
import { EmptyState } from '~/shared/components/patterns/EmptyState'
import { ConfirmDialog, PreviewList } from '~/shared/components/patterns/ConfirmDialog'
import { FolderPickerDialog } from '~/shared/components/patterns/FolderPickerDialog'
import { IconBox } from '~/shared/components/patterns/IconBox'
import { Favicon } from '~/shared/components/patterns/Favicon'
import { cn } from '~/shared/lib/utils'
import { status } from '~/shared/lib/tokens'
import { send } from '~/shared/lib/messaging'
import { useT } from '~/shared/lib/i18n'
import { formatFolderPath } from '~/shared/utils/bookmark-tree'
import type { FolderSummary } from '~/shared/types/messages'

function formatDate(ts: number | undefined): string | null {
  if (!ts) return null
  return new Date(ts).toLocaleDateString('en', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

function BookmarkRow({
  bm,
  index,
  isSafe,
  onKeep,
}: {
  bm: BookmarkRecord | undefined
  index: number
  isSafe: boolean
  onKeep: () => void
}) {
  const { t } = useT()
  const title = bm?.title || bm?.url || `Bookmark #${index + 1}`
  const path = bm ? formatFolderPath(bm.folderPath) : '—'
  const added = formatDate(bm?.dateAdded)
  return (
    <div
      className={cn(
        'px-3 py-2 flex items-center justify-between gap-2 border-b last:border-b-0 border-[var(--fw-border)]',
        isSafe && status.success.soft,
      )}
    >
      <Favicon url={bm?.url} size={16} framed className="flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-medium truncate">{title}</p>
          {isSafe && <ShieldCheck className={cn('h-3 w-3 flex-shrink-0', status.success.icon)} />}
        </div>
        {path && (
          <p className={cn(
            'text-[11px] mt-0.5 truncate',
            isSafe ? status.success.text : 'text-[var(--fw-text-subtle)]',
          )}>
            <span className="opacity-60">›</span> {path}
          </p>
        )}
        {added && (
          <p className="text-[10.5px] text-[var(--fw-text-subtle)] mt-0.5 flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />
            {t('dup.addedOn', { date: added })}
          </p>
        )}
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onKeep}
        aria-label={t('common.keepItem', { name: title })}
        className={cn('flex-shrink-0 gap-1 h-6 px-2', status.success.text, 'border-transparent hover:bg-[var(--fw-success-soft)]')}
      >
        <Check className="h-3 w-3" />
        {t('common.keep')}
      </Button>
    </div>
  )
}

export default function Duplicates({ scanResult, startScan, refreshScanResult }: ViewProps) {
  const { t } = useT()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set())

  const [pendingSingle, setPendingSingle] = useState<
    | { group: DuplicateGroup; keepIds: string[]; label: string }
    | null
  >(null)
  const [bulkResolving, setBulkResolving] = useState(false)

  // Folder-mode state
  const [folderPickerOpen, setFolderPickerOpen] = useState(false)
  const [safeFolderKeys, setSafeFolderKeys] = useState<string[]>([])
  const [confirmFolderBulk, setConfirmFolderBulk] = useState(false)

  const groups = scanResult?.duplicateGroups ?? []
  const snapshot = scanResult?.bookmarkSnapshot ?? {}

  // Available folders across all groups — fed to the picker
  const folderOptions = useMemo<FolderSummary[]>(() => {
    const seen = new Map<string, FolderSummary>()
    for (const g of groups) {
      for (const id of g.bookmarkIds) {
        const bm = snapshot[id]
        if (!bm?.folderPath || bm.folderPath.length === 0) continue
        const path = bm.folderPath
        const key = path.join('/')
        if (!seen.has(key)) {
          // The folder picker expects folder records; we synthesize one.
          // Use the joined path as a synthetic id since we only need it
          // for visual uniqueness — the actual resolution uses the path key.
          seen.set(key, {
            id: key,
            title: path[path.length - 1] ?? key,
            folderPath: path.slice(0, -1),
          })
        }
      }
    }
    return Array.from(seen.values())
  }, [groups, snapshot])

  const safeSet = useMemo(() => new Set(safeFolderKeys), [safeFolderKeys])

  const folderResolutions = useMemo(() => {
    if (safeSet.size === 0) return []
    return groups
      .map((group) => {
        const keep: string[] = []
        const trash: string[] = []
        for (const id of group.bookmarkIds) {
          const bm = snapshot[id]
          const key = bm?.folderPath?.join('/') ?? ''
          if (key && safeSet.has(key)) keep.push(id)
          else trash.push(id)
        }
        if (keep.length === 0 || trash.length === 0) return null
        return { groupId: group.id, keepBookmarkIds: keep, trashBookmarkIds: trash }
      })
      .filter(Boolean) as Array<{
        groupId: string
        keepBookmarkIds: string[]
        trashBookmarkIds: string[]
      }>
  }, [groups, snapshot, safeSet])

  const skippedCount = groups.length - folderResolutions.length

  if (!scanResult) {
    return (
      <EmptyState
        Icon={Copy}
        tone="accent"
        title={t('common.noScanData')}
        description={t('dup.empty.noScanDesc')}
        action={
          <Button onClick={startScan} size="sm" className="gap-1.5">
            <RefreshCw className="h-3 w-3" />
            {t('common.syncBookmarks')}
          </Button>
        }
      />
    )
  }

  if (groups.length === 0) {
    return (
      <EmptyState
        Icon={Sparkles}
        tone="success"
        title={t('dup.empty.title')}
        description={t('dup.empty.desc')}
      />
    )
  }

  /* ---------- Actions ---------- */

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const toggleGroupSelect = (id: string) =>
    setSelectedGroups((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const pickByDate = (group: DuplicateGroup, dir: 'oldest' | 'newest') => {
    const sorted = [...group.bookmarkIds].sort((a, b) => {
      const ta = snapshot[a]?.dateAdded ?? 0
      const tb = snapshot[b]?.dateAdded ?? 0
      return dir === 'oldest' ? ta - tb : tb - ta
    })
    return sorted[0]
  }

  const queueSingle = (group: DuplicateGroup, keepId: string, label: string) => {
    setPendingSingle({ group, keepIds: [keepId], label })
  }

  const handleConfirmSingle = async () => {
    if (!pendingSingle) return
    const { group, keepIds } = pendingSingle
    const trashIds = group.bookmarkIds.filter((id) => !keepIds.includes(id))
    setPendingSingle(null)
    const res = await send('duplicates.resolve', {
      groupId: group.id,
      keepBookmarkIds: keepIds,
      trashBookmarkIds: trashIds,
    })
    if (res.ok) {
      await refreshScanResult()
      setSelectedGroups((prev) => {
        const next = new Set(prev)
        next.delete(group.id)
        return next
      })
      const { trashedCount, protectedSkipped, staleSkipped, failedCount } = res.data
      const otherFailed = failedCount - (protectedSkipped ?? 0) - (staleSkipped ?? 0)
      if (protectedSkipped > 0 || staleSkipped > 0 || otherFailed > 0) {
        const parts = [t('toast.trashedN', { count: trashedCount })]
        if (protectedSkipped > 0) parts.push(t('common.protectedSkippedN', { count: protectedSkipped }))
        if (staleSkipped > 0) parts.push(t('common.changedSinceScanN', { count: staleSkipped }))
        if (otherFailed > 0) parts.push(t('common.failedN', { count: otherFailed }))
        toast.warning(parts.join(' · '))
      } else {
        toast.success(t('toast.keptMovedCopies', { count: trashedCount }))
      }
    } else {
      toast.error(res.error.message)
    }
  }

  const runBulkByStrategy = async (dir: 'oldest' | 'newest') => {
    const ids = Array.from(selectedGroups)
    if (ids.length === 0) return
    const resolutions = ids
      .map((id) => groups.find((g) => g.id === id))
      .filter((g): g is DuplicateGroup => !!g)
      .map((g) => {
        const keep = pickByDate(g, dir)
        return {
          groupId: g.id,
          keepBookmarkIds: [keep],
          trashBookmarkIds: g.bookmarkIds.filter((id) => id !== keep),
        }
      })
    setBulkResolving(true)
    try {
      const res = await send('duplicates.resolveBulk', { resolutions })
      if (res.ok) {
        await refreshScanResult()
        setSelectedGroups(new Set())
        const { resolvedCount, protectedSkipped, staleSkipped, failedCount } = res.data
        const msg = t('toast.resolvedGroupsBy', {
          count: resolvedCount,
          strategy: dir === 'newest' ? t('dup.newest') : t('dup.oldest'),
        })
        const otherFailed = failedCount - (protectedSkipped ?? 0) - (staleSkipped ?? 0)
        if (protectedSkipped > 0 || staleSkipped > 0 || otherFailed > 0) {
          const parts = [msg]
          if (protectedSkipped > 0) parts.push(t('common.protectedSkippedN', { count: protectedSkipped }))
          if (staleSkipped > 0) parts.push(t('common.changedSinceScanN', { count: staleSkipped }))
          if (otherFailed > 0) parts.push(t('common.failedN', { count: otherFailed }))
          toast.warning(parts.join(' · '))
        } else {
          toast.success(msg)
        }
      } else toast.error(res.error.message)
    } finally {
      setBulkResolving(false)
    }
  }

  const handleConfirmFolderBulk = async () => {
    setConfirmFolderBulk(false)
    setBulkResolving(true)
    try {
      const res = await send('duplicates.resolveBulk', { resolutions: folderResolutions })
      if (res.ok) {
        await refreshScanResult()
        setSafeFolderKeys([])
        const { resolvedCount, trashedCount, protectedSkipped, staleSkipped, failedCount } = res.data
        const msg = `${t('toast.resolvedGroups', { count: resolvedCount })} · ${t('toast.trashedN', { count: trashedCount })}`
        const otherFailed = failedCount - (protectedSkipped ?? 0) - (staleSkipped ?? 0)
        if (protectedSkipped > 0 || staleSkipped > 0 || otherFailed > 0) {
          const parts = [msg]
          if (protectedSkipped > 0) parts.push(t('common.protectedSkippedN', { count: protectedSkipped }))
          if (staleSkipped > 0) parts.push(t('common.changedSinceScanN', { count: staleSkipped }))
          if (otherFailed > 0) parts.push(t('common.failedN', { count: otherFailed }))
          toast.warning(parts.join(' · '))
        } else {
          toast.success(msg)
        }
      } else toast.error(res.error.message)
    } finally {
      setBulkResolving(false)
    }
  }

  const allGroupsSelected =
    groups.length > 0 && groups.every((g) => selectedGroups.has(g.id))
  const toggleAll = () => {
    if (allGroupsSelected) setSelectedGroups(new Set())
    else setSelectedGroups(new Set(groups.map((g) => g.id)))
  }

  const summaryCopies = groups.reduce((acc, g) => acc + g.bookmarkIds.length, 0)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-[var(--fw-border)] flex items-center justify-between gap-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={allGroupsSelected}
            onCheckedChange={toggleAll}
            id="dup-select-all"
            aria-label={allGroupsSelected ? t('dup.deselectAll') : t('dup.selectAll')}
          />
          <label htmlFor="dup-select-all" className="text-xs text-[var(--fw-text-muted)] cursor-pointer select-none">
            {allGroupsSelected ? t('dup.deselectAll') : t('common.nItems', { count: groups.length })}
          </label>
          <Badge variant="warning" className="ml-1">{t('dup.copiesN', { count: summaryCopies })}</Badge>
        </div>
        <Button
          variant={safeFolderKeys.length > 0 ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFolderPickerOpen(true)}
          aria-label={t('dup.byFolder')}
          className="gap-1 h-7 px-2 text-xs"
        >
          <Layers className="h-3 w-3" />
          {t('dup.byFolder')} {safeFolderKeys.length > 0 ? `(${safeFolderKeys.length})` : ''}
        </Button>
      </div>

      {/* Folder-mode resolution preview */}
      {safeFolderKeys.length > 0 && (
        <div
          className={cn(
            'px-3 py-2 border-b border-[var(--fw-border)]',
            status.success.soft,
          )}
        >
          <div className="flex items-start gap-2">
            <IconBox Icon={ShieldCheck} tone="success" size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold">
                {t('dup.safeFolders')} · {safeFolderKeys.length}
              </p>
              <p className="text-[11px] mt-0.5 opacity-80">
                {folderResolutions.length > 0 ? (
                  <>
                    <strong>{folderResolutions.length}</strong> {t('common.nItems', { count: folderResolutions.length })}
                    {skippedCount > 0 && <span> · {t('common.skippedN', { count: skippedCount })}</span>}
                  </>
                ) : (
                  <span>{t('dup.noSafeMatch')}</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSafeFolderKeys([])}
                className="h-6 px-2 text-[11px]"
              >
                {t('common.clear')}
              </Button>
              {folderResolutions.length > 0 && (
                <Button
                  size="sm"
                  onClick={() => setConfirmFolderBulk(true)}
                  disabled={bulkResolving}
                  className="gap-1 h-6 px-2 text-[11px]"
                >
                  <Check className="h-3 w-3" />
                  {t('dup.resolve', { count: folderResolutions.length })}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Groups */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-3 space-y-1.5">
          {groups.map((group) => {
            const firstBm = snapshot[group.bookmarkIds[0]]
            const groupLabel = firstBm?.title || group.canonicalUrl
            const isOpen = expanded.has(group.id)
            const isSelected = selectedGroups.has(group.id)
            const resolution = folderResolutions.find((r) => r.groupId === group.id)
            const wouldResolve = !!resolution
            return (
              <div
                key={group.id}
                className={cn(
                  'rounded-[var(--fw-radius-lg)] border overflow-hidden transition-colors bg-[var(--fw-surface)]',
                  wouldResolve
                    ? 'border-[color-mix(in_oklch,var(--fw-success)_60%,transparent)]'
                    : isSelected
                      ? 'border-[color-mix(in_oklch,var(--fw-accent)_60%,transparent)]'
                      : 'border-[var(--fw-border)]',
                )}
              >
                {/* Header — title/URL row gets full width */}
                <div className="flex items-center">
                  <div
                    className="pl-3 pr-1 py-2.5 flex items-center flex-shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleGroupSelect(group.id)}
                      aria-label={t('dup.selectGroup')}
                    />
                  </div>
                  <button
                    onClick={() => toggleExpand(group.id)}
                    className="flex-1 min-w-0 pl-1 pr-2 py-2.5 flex items-center gap-2 text-left hover:bg-[var(--fw-bg-subtle)] transition-colors"
                    aria-expanded={isOpen}
                  >
                    <IconBox Icon={Copy} tone={wouldResolve ? 'success' : 'warning'} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate">{groupLabel}</p>
                      <p className="text-[10.5px] text-[var(--fw-text-subtle)] truncate mt-0.5 font-mono">
                        {group.canonicalUrl}
                      </p>
                    </div>
                    <Badge variant={wouldResolve ? 'success' : 'warning'} className="flex-shrink-0">
                      {group.bookmarkIds.length}
                    </Badge>
                    {isOpen ? (
                      <ChevronDown className="h-3.5 w-3.5 text-[var(--fw-text-subtle)] flex-shrink-0" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-[var(--fw-text-subtle)] flex-shrink-0" />
                    )}
                  </button>
                </div>
                {/* Quick-pick strip — always visible, right-aligned */}
                <div className="flex items-center justify-end gap-1 px-2 pb-1.5 -mt-0.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          queueSingle(group, pickByDate(group, 'newest'), t('dup.keepNewest'))
                        }
                        className="h-5 px-1.5 text-[10.5px] gap-0.5"
                        aria-label={t('dup.keepNewestHint')}
                      >
                        <ArrowUp className="h-2.5 w-2.5" />
                        {t('dup.newest')}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {t('dup.keepNewestTip')}
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          queueSingle(group, pickByDate(group, 'oldest'), t('dup.keepOldest'))
                        }
                        className="h-5 px-1.5 text-[10.5px] gap-0.5"
                        aria-label={t('dup.keepOldestHint')}
                      >
                        <ArrowDown className="h-2.5 w-2.5" />
                        {t('dup.oldest')}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {t('dup.keepOldestTip')}
                    </TooltipContent>
                  </Tooltip>
                </div>

                {isOpen && (
                  <div className="border-t border-[var(--fw-border)]">
                    {group.bookmarkIds.map((id, i) => {
                      const bm = snapshot[id]
                      const isSafe =
                        safeSet.size > 0 && !!bm?.folderPath &&
                        safeSet.has(bm.folderPath.join('/'))
                      return (
                        <BookmarkRow
                          key={id}
                          bm={bm}
                          index={i}
                          isSafe={isSafe}
                          onKeep={() => queueSingle(group, id, t('dup.keepThisCopy'))}
                        />
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Bulk bar */}
      {selectedGroups.size > 0 && (
        <div className="px-3 py-2 bg-[var(--fw-surface)] border-t border-[var(--fw-border)] flex items-center justify-between gap-2 flex-shrink-0">
          <span className="text-xs text-[var(--fw-text-muted)] font-medium">
            {t('common.selected', { count: selectedGroups.size })}
          </span>
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => runBulkByStrategy('newest')}
              disabled={bulkResolving}
              className="gap-1"
            >
              <ArrowUp className="h-3 w-3" />
              {t('dup.keepNewest')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => runBulkByStrategy('oldest')}
              disabled={bulkResolving}
              className="gap-1"
            >
              <ArrowDown className="h-3 w-3" />
              {t('dup.keepOldest')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedGroups(new Set())}>
              {t('common.clear')}
            </Button>
          </div>
        </div>
      )}

      {/* Single-group confirm */}
      <ConfirmDialog
        open={!!pendingSingle}
        onOpenChange={(o) => !o && setPendingSingle(null)}
        title={
          pendingSingle
            ? t('dup.confirmKeepTitle', { count: pendingSingle.group.bookmarkIds.length - 1 })
            : ''
        }
        description={t('dup.confirmKeepDesc')}
        preview={
          pendingSingle && (
            <PreviewList
              items={pendingSingle.group.bookmarkIds
                .filter((id) => !pendingSingle.keepIds.includes(id))
                .map((id) => {
                  const bm = snapshot[id]
                  return (
                    <span className="flex items-center gap-1.5">
                      <span className="text-[var(--fw-text-subtle)] text-[10.5px] flex-shrink-0">
                        →
                      </span>
                      <span className="flex-1 truncate">
                        {bm?.folderPath ? formatFolderPath(bm.folderPath) : '—'}
                      </span>
                    </span>
                  )
                })}
            />
          )
        }
        confirmLabel={t('dup.confirmKeepLabel')}
        ConfirmIcon={Check}
        tone="success"
        onConfirm={handleConfirmSingle}
      />

      {/* Folder picker */}
      <FolderPickerDialog
        open={folderPickerOpen}
        onOpenChange={setFolderPickerOpen}
        title={t('dup.pickSafeFolders')}
        description={t('dup.safeFolders')}
        value={safeFolderKeys}
        onChange={setSafeFolderKeys}
        valueKey="path"
        multiple
        confirmLabel={t('common.apply')}
        folders={folderOptions}
      />

      {/* Folder bulk confirm */}
      <ConfirmDialog
        open={confirmFolderBulk}
        onOpenChange={(o) => !o && setConfirmFolderBulk(false)}
        title={t('dup.confirmFolderTitle', { count: folderResolutions.length })}
        description={t('dup.confirmFolderDesc')}
        preview={
          <PreviewList
            items={safeFolderKeys.map((k) => (
              <span className="flex items-center gap-1.5">
                <FolderOpen className={cn('h-3 w-3 flex-shrink-0', status.success.icon)} />
                <span className="truncate">{k.replaceAll('/', ' / ')}</span>
              </span>
            ))}
          />
        }
        footerNote={
          skippedCount > 0
            ? t('dup.groupsSkippedNoSafe', { count: skippedCount })
            : undefined
        }
        confirmLabel={t('dup.confirmFolderLabel')}
        ConfirmIcon={ShieldCheck}
        tone="success"
        onConfirm={handleConfirmFolderBulk}
      />
    </div>
  )
}
