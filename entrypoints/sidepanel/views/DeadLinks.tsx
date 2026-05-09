import { useMemo, useState, useCallback } from 'react'
import {
  Link2Off,
  RefreshCw,
  Trash2,
  EyeOff,
  ExternalLink,
  RotateCcw,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import type { DeadLinkResult } from '~/shared/types'
import type { ViewProps } from '../App'
import { Button } from '~/shared/components/ui/button'
import { Badge } from '~/shared/components/ui/badge'
import { Checkbox } from '~/shared/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger } from '~/shared/components/ui/tabs'
import { EmptyState } from '~/shared/components/patterns/EmptyState'
import { ConfirmDialog, PreviewList } from '~/shared/components/patterns/ConfirmDialog'
import { DataList } from '~/shared/components/patterns/DataList'
import { StatusBar } from '~/shared/components/patterns/StatusBar'
import { Favicon } from '~/shared/components/patterns/Favicon'
import { showUndoToast } from '~/shared/components/patterns/undo'
import { cn } from '~/shared/lib/utils'
import { send } from '~/shared/lib/messaging'
import {
  hasDeadLinkHostPermission,
  requestDeadLinkHostPermission,
} from '~/shared/lib/webext'
import { formatFolderPath } from '~/shared/utils/bookmark-tree'
import { useT } from '~/shared/lib/i18n'

type FilterStatus = 'all' | 'invalid' | 'suspicious' | 'retry'

const STATUS_META: Record<
  DeadLinkResult['status'],
  { labelKey: string; variant: React.ComponentProps<typeof Badge>['variant'] }
> = {
  invalid:    { labelKey: 'deadlinks.status.dead',       variant: 'destructive' },
  suspicious: { labelKey: 'deadlinks.status.suspicious', variant: 'warning' },
  retry:      { labelKey: 'deadlinks.status.timeout',    variant: 'info' },
  valid:      { labelKey: 'deadlinks.status.valid',      variant: 'success' },
}

const HTTP_STATUS: Record<number, string> = {
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found',
  405: 'Method Not Allowed', 408: 'Request Timeout', 410: 'Gone',
  429: 'Rate Limited', 500: 'Server Error', 502: 'Bad Gateway',
  503: 'Unavailable', 504: 'Gateway Timeout',
}

function httpLabel(code?: number): string | null {
  if (!code) return null
  const name = HTTP_STATUS[code]
  return name ? `${code} ${name}` : String(code)
}

export default function DeadLinks({
  scanResult,
  isCheckingDeadLinks,
  startScan,
  startDeadLinksCheck,
  refreshScanResult,
}: ViewProps) {
  const { t } = useT()
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmTrash, setConfirmTrash] = useState<string[] | null>(null)
  const [recheckingIds, setRecheckingIds] = useState<Set<string>>(new Set())
  const [bulkRechecking, setBulkRechecking] = useState(false)
  // Optimistically hidden IDs (pending undo)
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())

  const deadLinks = scanResult?.deadLinks ?? []
  const deadLinkState = scanResult?.deadLinkState
  const snapshot = scanResult?.bookmarkSnapshot ?? {}

  const visible = useMemo(
    () => deadLinks.filter((d) => !hiddenIds.has(d.bookmarkId)),
    [deadLinks, hiddenIds],
  )

  const counts = {
    all: visible.length,
    invalid: visible.filter((d) => d.status === 'invalid').length,
    suspicious: visible.filter((d) => d.status === 'suspicious').length,
    retry: visible.filter((d) => d.status === 'retry').length,
  }

  const filtered = useMemo(
    () => (filter === 'all' ? visible : visible.filter((d) => d.status === filter)),
    [visible, filter],
  )

  const hide = useCallback((ids: string[]) => {
    setHiddenIds((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => next.add(id))
      return next
    })
    setSelected((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => next.delete(id))
      return next
    })
  }, [])

  const unhide = useCallback((ids: string[]) => {
    setHiddenIds((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => next.delete(id))
      return next
    })
  }, [])

  /* ---------- Actions ---------- */

  const commitIgnore = async (ids: string[]) => {
    const res = await send('deadLinks.ignore', { bookmarkIds: ids })
    if (res.ok) {
      await refreshScanResult()
      setHiddenIds((prev) => {
        const next = new Set(prev)
        ids.forEach((id) => next.delete(id))
        return next
      })
    } else {
      toast.error(res.error.message)
      unhide(ids)
    }
  }

  const handleIgnoreBulk = (ids: string[]) => {
    if (ids.length === 0) return
    hide(ids)
    showUndoToast({
      message: t('toast.ignoredLinksN', { count: ids.length }),
      onCommit: () => commitIgnore(ids),
      onUndo: () => unhide(ids),
    })
  }

  const commitTrash = async (ids: string[]) => {
    const res = await send('deadLinks.trash', { bookmarkIds: ids })
    if (res.ok) {
      await refreshScanResult()
      setHiddenIds((prev) => {
        const next = new Set(prev)
        ids.forEach((id) => next.delete(id))
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
      }
    } else {
      toast.error(res.error.message)
      unhide(ids)
    }
  }

  const handleConfirmedTrash = () => {
    const ids = confirmTrash ?? []
    setConfirmTrash(null)
    if (ids.length === 0) return
    hide(ids)
    showUndoToast({
      message: t('toast.trashedN', { count: ids.length }),
      onCommit: () => commitTrash(ids),
      onUndo: () => unhide(ids),
    })
  }

  const handleRecheck = async (ids: string[]) => {
    const rechable = ids.filter((id) => {
      const link = deadLinks.find((d) => d.bookmarkId === id)
      return link?.status === 'suspicious' || link?.status === 'retry' || link?.status === 'invalid'
    })
    if (rechable.length === 0) {
      toast.info(t('deadlinks.noRecheckable'))
      return
    }
    const stats = await send('deadLinks.checkableCount', { bookmarkIds: rechable })
    if (stats.ok && stats.data.checkableCount === 0) {
      toast.info(t('deadlinks.noRecheckable'))
      return
    }
    const hasPermission = await hasDeadLinkHostPermission()
    if (!hasPermission) {
      const granted = await requestDeadLinkHostPermission()
      if (!granted) {
        toast.error(t('deadlinks.permissionRequired'))
        return
      }
    }
    if (rechable.length === 1) {
      setRecheckingIds((prev) => new Set([...prev, rechable[0]]))
    } else {
      setBulkRechecking(true)
    }
    try {
      const res = await send('deadLinks.recheck', { bookmarkIds: rechable })
      if (res.ok) {
        await refreshScanResult()
        setSelected((prev) => {
          const next = new Set(prev)
          rechable.forEach((id) => next.delete(id))
          return next
        })
        const still = res.data.stillDeadCount
        const checked = res.data.checkedCount
        if (still === 0) toast.success(t('deadlinks.allReachable', { count: checked }))
        else toast.info(t('deadlinks.recheckedResult', { count: checked, still, fixed: checked - still }))
      } else {
        toast.error(res.error.message)
      }
    } finally {
      setRecheckingIds((prev) => {
        const next = new Set(prev)
        rechable.forEach((id) => next.delete(id))
        return next
      })
      setBulkRechecking(false)
    }
  }

  /* ---------- Early returns ---------- */

  if (!scanResult) {
    return (
      <EmptyState
        Icon={Link2Off}
        tone="accent"
        title={t('common.noScanDataYet')}
        description={t('common.syncFirst')}
        action={
          <Button onClick={startScan} size="sm" className="gap-1.5">
            <RefreshCw className="h-3 w-3" />
            {t('common.syncBookmarks')}
          </Button>
        }
      />
    )
  }

  if (
    !isCheckingDeadLinks &&
    scanResult.deadLinksChecked === false &&
    deadLinks.length === 0
  ) {
    return (
      <EmptyState
        Icon={Link2Off}
        tone="info"
        title={t('deadlinks.empty.notChecked.title')}
        description={t('deadlinks.empty.notChecked.desc')}
        action={
          <Button onClick={() => startDeadLinksCheck()} size="sm" className="gap-1.5">
            <RefreshCw className="h-3 w-3" />
            {t('deadlinks.checkLinks')}
          </Button>
        }
      />
    )
  }

  if (deadLinks.length === 0) {
    return (
      <EmptyState
        Icon={Sparkles}
        tone="success"
        title={t('deadlinks.empty.healthy.title')}
        description={t('deadlinks.empty.healthy.desc')}
      />
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Resume banner (in-view, persists even without active task) */}
      {deadLinkState && deadLinkState.status === 'paused' && (
        <StatusBar
          tone="warning"
          label={t('deadlinks.pausedAt', { processed: deadLinkState.processed, total: deadLinkState.total })}
          trailing={
            <button
              onClick={() => startDeadLinksCheck()}
              className="text-xs font-medium underline-offset-2 hover:underline"
            >
              {t('common.resume')}
            </button>
          }
        />
      )}
      {deadLinkState && deadLinkState.status === 'completed' && (
        <StatusBar
          tone="success"
          label={t('deadlinks.checkedN', { count: deadLinkState.total })}
          hint={
            deadLinkState.lastRunAt
              ? t('deadlinks.lastRun', { time: new Date(deadLinkState.lastRunAt).toLocaleString() })
              : undefined
          }
        />
      )}

      {/* Filter tabs */}
      <div className="px-3 py-2 border-b border-[var(--fw-border)] flex-shrink-0">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterStatus)}>
          <TabsList className="w-full grid grid-cols-2 h-auto gap-1" data-fw-deadlink-filter-tabs>
            <TabsTrigger value="all" className="h-7 px-1.5">{t('deadlinks.tab.all', { count: counts.all })}</TabsTrigger>
            <TabsTrigger value="invalid" className="h-7 px-1.5">{t('deadlinks.tab.dead', { count: counts.invalid })}</TabsTrigger>
            <TabsTrigger value="suspicious" className="h-7 px-1.5">{t('deadlinks.tab.suspicious', { count: counts.suspicious })}</TabsTrigger>
            <TabsTrigger value="retry" className="h-7 px-1.5">{t('deadlinks.tab.timeout', { count: counts.retry })}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <DataList
        items={filtered}
        getId={(d) => d.bookmarkId}
        searchFields={(d) => {
          const bm = snapshot[d.bookmarkId]
          return `${bm?.title ?? ''} ${d.url} ${bm?.folderPath?.join(' / ') ?? ''}`
        }}
        searchPlaceholder={t('deadlinks.searchPlaceholder')}
        selected={selected}
        onSelectedChange={setSelected}
        onDelete={(ids) => setConfirmTrash(ids)}
        renderRow={({ item: link, selected: isSelected, toggle }) => {
          const meta = STATUS_META[link.status]
          const bm = snapshot[link.bookmarkId]
          const title = bm?.title || link.url
          const path = bm ? formatFolderPath(bm.folderPath) : ''
          const httpText = httpLabel(link.statusCode)
          const isRechecking = recheckingIds.has(link.bookmarkId)
          return (
            <div
              onClick={toggle}
              className={cn(
                'px-3 py-2.5 flex gap-2.5 items-start cursor-pointer transition-colors group',
                isSelected
                  ? 'bg-[var(--fw-accent-soft)]'
                  : 'hover:bg-[var(--fw-bg-subtle)]',
              )}
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={toggle}
                onClick={(e) => e.stopPropagation()}
                aria-label={t('common.selectItem', { name: title })}
                className="mt-0.5 flex-shrink-0"
              />
              <Favicon url={link.url} size={16} framed className="mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant={meta.variant}>{t(meta.labelKey)}</Badge>
                  {httpText && (
                    <span className="text-[10.5px] text-[var(--fw-text-subtle)] font-mono">
                      {httpText}
                    </span>
                  )}
                </div>
                <p className="text-xs font-semibold truncate mt-1">{title}</p>
                {path && (
                  <p className="text-[11px] text-[var(--fw-text-subtle)] truncate mt-0.5">
                    <span className="opacity-50">›</span> {path}
                  </p>
                )}
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-[11px] text-[var(--fw-accent-text)] hover:underline font-mono truncate mt-0.5 block"
                >
                  {link.url}
                </a>
                {link.reason && (
                  <p className="text-[11px] text-[var(--fw-text-muted)] mt-1 italic">
                    {link.reason}
                  </p>
                )}
              </div>
              <div
                className={cn(
                  'flex items-center gap-0.5 flex-shrink-0 transition-opacity',
                  isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                )}
                onClick={(e) => e.stopPropagation()}
              >
                <RowIconButton
                  label={t('common.openInNewTab')}
                  Icon={ExternalLink}
                  href={link.url}
                />
                {(link.status === 'suspicious' || link.status === 'retry') && (
                  <RowIconButton
                    label={t('deadlinks.recheck')}
                    Icon={RotateCcw}
                    onClick={() => handleRecheck([link.bookmarkId])}
                    disabled={isRechecking}
                    spin={isRechecking}
                  />
                )}
                <RowIconButton
                  label={t('common.ignore')}
                  Icon={EyeOff}
                  onClick={() => handleIgnoreBulk([link.bookmarkId])}
                />
                <RowIconButton
                  label={t('common.moveToTrash')}
                  Icon={Trash2}
                  danger
                  onClick={() => setConfirmTrash([link.bookmarkId])}
                />
              </div>
            </div>
          )
        }}
        footerBar={({ selectedCount, clear, selectedIds }) => (
          <div className="px-3 py-2 flex items-center justify-between gap-2">
            <span className="text-xs text-[var(--fw-text-muted)] font-medium">
              {t('common.selected', { count: selectedCount })}
            </span>
            <div className="flex gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRecheck(selectedIds)}
                disabled={bulkRechecking}
                className="gap-1"
              >
                <RotateCcw className={cn('h-3 w-3', bulkRechecking && 'animate-spin')} />
                {t('deadlinks.recheck')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleIgnoreBulk(selectedIds)}
                className="gap-1"
              >
                <EyeOff className="h-3 w-3" />
                {t('common.ignore')}
              </Button>
              <Button variant="ghost" size="sm" onClick={clear}>
                {t('common.clear')}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmTrash(selectedIds)}
                className="gap-1"
              >
                <Trash2 className="h-3 w-3" />
                {t('common.trash')}
              </Button>
            </div>
          </div>
        )}
      />

      <ConfirmDialog
        open={!!confirmTrash}
        onOpenChange={(o) => !o && setConfirmTrash(null)}
        title={t('deadlinks.confirmTrashTitle', { count: confirmTrash?.length ?? 0 })}
        description={t('deadlinks.confirmTrashDesc')}
        preview={
          confirmTrash && (
            <PreviewList
              items={confirmTrash.map((id) => {
                const link = deadLinks.find((d) => d.bookmarkId === id)
                const bm = snapshot[id]
                return (
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-medium flex-1">{bm?.title || link?.url}</span>
                    <span className="text-[var(--fw-text-subtle)] text-[10.5px] font-mono">
                      {link?.statusCode ?? ''}
                    </span>
                  </span>
                )
              })}
            />
          )
        }
        confirmLabel={t('deadlinks.confirmTrashLabel')}
        ConfirmIcon={Trash2}
        tone="danger"
        onConfirm={handleConfirmedTrash}
      />
    </div>
  )
}

function RowIconButton({
  label,
  Icon,
  onClick,
  href,
  disabled,
  danger,
  spin,
}: {
  label: string
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  onClick?: () => void
  href?: string
  disabled?: boolean
  danger?: boolean
  spin?: boolean
}) {
  const className = cn(
    'h-6 w-6 flex items-center justify-center rounded-[var(--fw-radius-sm)] text-[var(--fw-text-subtle)] transition-colors disabled:opacity-40',
    danger
      ? 'hover:bg-[var(--fw-danger-soft)] hover:text-[var(--fw-danger-text)]'
      : 'hover:bg-[var(--fw-bg-subtle)] hover:text-[var(--fw-text)]',
  )
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        aria-label={label}
        title={label}
        className={className}
      >
        <Icon className="h-3 w-3" />
      </a>
    )
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={className}
    >
      <Icon className={cn('h-3 w-3', spin && 'animate-spin')} />
    </button>
  )
}
