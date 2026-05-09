import { useEffect, useState, useCallback } from 'react'
import {
  Link2Off,
  Copy,
  FolderOpen,
  Sparkles,
  BookMarked,
  ArrowRight,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  History,
  Leaf,
  FolderX,
  Inbox,
  X,
  FolderInput,
  Shield,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import type { ScanResult, OperationLogEntry } from '~/shared/types'
import type { NewBookmarkInboxEntry } from '~/shared/storage/schema'
import type { ViewProps } from '../App'
import { Button } from '~/shared/components/ui/button'
import { Badge } from '~/shared/components/ui/badge'
import { SectionHeading } from '~/shared/components/patterns/SectionHeading'
import { IconBox } from '~/shared/components/patterns/IconBox'
import { Favicon } from '~/shared/components/patterns/Favicon'
import { SkeletonList } from '~/shared/components/patterns/Skeleton'
import { cn } from '~/shared/lib/utils'
import { status, type StatusKey } from '~/shared/lib/tokens'
import { send, onBroadcast } from '~/shared/lib/messaging'
import { useT } from '~/shared/lib/i18n'

const ACTION_LABEL_KEYS: Record<OperationLogEntry['actionType'], string> = {
  trash:   'dash.action.trash',
  delete:  'dash.action.delete',
  restore: 'dash.action.restore',
  move:    'dash.action.move',
  ignore:  'dash.action.ignore',
}

const ACTION_TONE: Record<OperationLogEntry['actionType'], StatusKey> = {
  trash: 'warning',
  delete: 'danger',
  restore: 'success',
  move: 'info',
  ignore: 'accent',
}

interface StatCardProps {
  label: string
  value: number | string
  hint?: string
  Icon: LucideIcon
  tone: StatusKey
  onClick?: () => void
  disabled?: boolean
  disabledReason?: string
}

function StatCard({ label, value, hint, Icon, tone, onClick, disabled, disabledReason }: StatCardProps) {
  const t = status[tone]
  const clickable = !!onClick && !disabled
  const Wrapper = clickable ? 'button' : ('div' as const)
  return (
    <Wrapper
      onClick={clickable ? onClick : undefined}
      title={disabled ? disabledReason : undefined}
      className={cn(
        'group flex items-center gap-3 p-3 rounded-[var(--fw-radius-lg)] border border-[var(--fw-border)] bg-[var(--fw-surface)] transition-all text-left w-full',
        clickable &&
          'hover:border-[var(--fw-border-strong)] hover:bg-[var(--fw-surface-2)] active:scale-[0.995] cursor-pointer',
        disabled && 'opacity-60 cursor-default',
      )}
      aria-disabled={disabled}
    >
      <IconBox Icon={Icon} tone={tone} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-lg font-bold tabular-nums leading-none">{value}</span>
          {hint && (
            <span className={cn('text-[11px] font-medium truncate', t.text)}>
              {hint}
            </span>
          )}
        </div>
        <div className="text-xs text-[var(--fw-text-muted)] mt-0.5">{label}</div>
      </div>
      {clickable && (
        <ArrowRight className="h-3.5 w-3.5 text-[var(--fw-text-subtle)] flex-shrink-0 transition-transform group-hover:translate-x-0.5" />
      )}
    </Wrapper>
  )
}

function formatRelative(
  ts: number,
  t: (key: string, args?: Record<string, string | number>) => string,
): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return t('dash.justNow')
  if (min < 60) return t('dash.minutesAgo', { count: min })
  const hr = Math.floor(min / 60)
  if (hr < 24) return t('dash.hoursAgo', { count: hr })
  return t('dash.daysAgo', { count: Math.floor(hr / 24) })
}

function formatOpTime(ts: number): string {
  const d = new Date(ts)
  const today = d.toDateString() === new Date().toDateString()
  return today
    ? d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
}

/* ---------- Welcome (first-run) ---------- */

const WELCOME_FEATURES: Array<{
  Icon: LucideIcon
  tone: StatusKey
  titleKey: string
  descKey: string
}> = [
  { Icon: Link2Off,   tone: 'danger',  titleKey: 'dash.feat.broken.title', descKey: 'dash.feat.broken.desc' },
  { Icon: Copy,       tone: 'warning', titleKey: 'dash.feat.dup.title',    descKey: 'dash.feat.dup.desc' },
  { Icon: FolderOpen, tone: 'info',    titleKey: 'dash.feat.org.title',    descKey: 'dash.feat.org.desc' },
  { Icon: Sparkles,   tone: 'violet',  titleKey: 'dash.feat.gems.title',   descKey: 'dash.feat.gems.desc' },
]

function Welcome({ onStart, isScanning }: { onStart: () => void; isScanning: boolean }) {
  const { t } = useT()
  return (
    <div className="flex flex-col h-full overflow-y-auto px-5 py-8 gap-6">
      <div className="flex flex-col items-center text-center gap-3">
        <div className="w-16 h-16 rounded-[var(--fw-radius-xl)] bg-[var(--fw-accent)] text-[var(--fw-accent-fg)] flex items-center justify-center shadow-[var(--fw-shadow-md)]">
          <BookMarked className="h-8 w-8" strokeWidth={2.2} />
        </div>
        <div>
          <p className="font-bold text-base tracking-tight">{t('dash.welcomeTitle')}</p>
          <p className="text-xs text-[var(--fw-text-muted)] mt-1">
            {t('dash.welcomeBody')}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {WELCOME_FEATURES.map(({ Icon, tone, titleKey, descKey }) => (
          <div
            key={titleKey}
            className="flex items-start gap-3 p-3 rounded-[var(--fw-radius-lg)] bg-[var(--fw-surface)] border border-[var(--fw-border)]"
          >
            <IconBox Icon={Icon} tone={tone} size="sm" />
            <div>
              <p className="text-xs font-semibold">{t(titleKey)}</p>
              <p className="text-xs text-[var(--fw-text-muted)] mt-0.5 leading-relaxed">
                {t(descKey)}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className={cn('flex items-start gap-2.5 px-3 py-2.5 rounded-[var(--fw-radius-lg)] border', status.success.soft, 'border-transparent')}>
        <ShieldCheck className={cn('h-3.5 w-3.5 flex-shrink-0 mt-0.5', status.success.icon)} />
        <p className="text-xs leading-relaxed">
          {t('dash.welcomeSafety')}
        </p>
      </div>

      <Button onClick={onStart} disabled={isScanning} size="lg" className="w-full gap-2">
        <RefreshCw className={cn('h-3.5 w-3.5', isScanning && 'animate-spin')} />
        {isScanning ? t('app.syncing') : t('dash.startFirstSync')}
      </Button>
    </div>
  )
}

/* ---------- Dashboard ---------- */

interface ProtectionCandidate {
  id: string
  title: string
  folderPath: string[]
  directLinkCount: number
  directSubfolderCount: number
  totalLinks: number
  score: number
}

export default function Dashboard({
  scanResult,
  isScanning,
  scanVersion,
  startScan,
  setActiveView,
}: ViewProps) {
  const { t } = useT()
  const [recentOps, setRecentOps] = useState<OperationLogEntry[] | null>(null)
  const [inboxEntries, setInboxEntries] = useState<NewBookmarkInboxEntry[]>([])
  const [protCandidates, setProtCandidates] = useState<ProtectionCandidate[]>([])

  const loadRecent = useCallback(async () => {
    const res = await send('operationLog.get')
    setRecentOps(res.ok ? res.data.slice(0, 4) : [])
  }, [])

  const loadInbox = useCallback(async () => {
    const res = await send('inbox.get')
    setInboxEntries(res.ok ? res.data.entries : [])
  }, [])

  const loadProtectionCandidates = useCallback(async () => {
    const res = await send('protection.candidates.get')
    setProtCandidates(res.ok ? res.data.candidates : [])
  }, [])

  useEffect(() => {
    loadRecent()
    loadInbox()
    loadProtectionCandidates()
  }, [loadRecent, loadInbox, loadProtectionCandidates, scanVersion])

  useEffect(() => {
    return onBroadcast((event) => {
      if (event.type === 'inbox.updated') loadInbox()
    })
  }, [loadInbox])

  if (!scanResult && !isScanning) {
    return <Welcome onStart={startScan} isScanning={isScanning} />
  }

  if (isScanning && !scanResult) {
    return (
      <div className="p-3 space-y-4">
        <SectionHeading>{t('dash.loadingBookmarks')}</SectionHeading>
        <SkeletonList count={4} />
      </div>
    )
  }

  const scan = scanResult as ScanResult
  const snapshot = scan.bookmarkSnapshot ?? {}
  const deadLinksChecked = scan.deadLinksChecked ?? false
  const invalidCount = scan.deadLinks.filter((d) => d.status === 'invalid').length
  const suspiciousCount = scan.deadLinks.filter((d) => d.status === 'suspicious').length
  const dupGroups = scan.duplicateGroups.length
  const orgCount = scan.organizeSuggestions.length
  const emptyCount = scan.emptyFolders?.length ?? 0
  const rediscover = scan.rediscoverItems

  const totalIssues = invalidCount + dupGroups + orgCount + emptyCount
  const isAllClean = deadLinksChecked && totalIssues === 0

  return (
    <div className="p-3 space-y-4">
      {/* Inbox — fresh bookmarks awaiting categorization */}
      {inboxEntries.length > 0 && (
        <InboxSection
          entries={inboxEntries}
          onRefresh={loadInbox}
          onNavigateOrganize={() => setActiveView('organize')}
        />
      )}

      {/* Protection advisor — surface folders that look already-organized */}
      {protCandidates.length > 0 && (
        <ProtectionSuggestion
          candidates={protCandidates}
          onRefresh={loadProtectionCandidates}
        />
      )}

      {/* Header strip — last sync */}
      <div className="flex items-center justify-between px-1">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--fw-text-subtle)]">
            {t('dash.library')}
          </p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold tabular-nums leading-none">
              {scan.totalBookmarks.toLocaleString()}
            </span>
            <span className="text-xs text-[var(--fw-text-muted)]">{t('dash.bookmarks')}</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-[var(--fw-text-subtle)]">{t('dash.lastSynced')}</p>
          <p className="text-xs font-medium mt-0.5">
            {scan.completedAt ? formatRelative(scan.completedAt, t) : t('dash.inProgress')}
          </p>
        </div>
      </div>

      {isAllClean && (
        <div
          className={cn(
            'flex items-start gap-3 p-3 rounded-[var(--fw-radius-lg)] border border-transparent',
            status.success.soft,
          )}
        >
          <IconBox Icon={Leaf} tone="success" size="sm" />
          <div>
            <p className="text-xs font-semibold">{t('dash.everythingTidy')}</p>
            <p className="text-xs mt-0.5 opacity-80 leading-relaxed">
              {t('dash.everythingTidyBody')}
            </p>
          </div>
        </div>
      )}

      {/* Actionable cards */}
      {(!isAllClean || !deadLinksChecked) && (
        <div className="space-y-2">
          <SectionHeading>{t('dash.needsAttention')}</SectionHeading>
          <div className="space-y-1.5">
            <StatCard
              label={t('dash.deadLinks')}
              value={deadLinksChecked ? invalidCount : '—'}
              hint={
                !deadLinksChecked
                  ? t('dash.notCheckedYet')
                  : suspiciousCount > 0
                    ? t('dash.nSuspicious', { count: suspiciousCount })
                    : invalidCount === 0
                      ? t('dash.allHealthy')
                      : undefined
              }
              Icon={Link2Off}
              tone={!deadLinksChecked ? 'accent' : invalidCount > 0 ? 'danger' : 'success'}
              onClick={() => setActiveView('dead-links')}
            />
            <StatCard
              label={t('dash.duplicateGroups')}
              value={dupGroups}
              hint={dupGroups === 0 ? t('dash.noneFound') : t('dash.groups')}
              Icon={Copy}
              tone={dupGroups > 0 ? 'warning' : 'success'}
              onClick={() => setActiveView('duplicates')}
              disabled={dupGroups === 0}
              disabledReason={t('common.syncFirst')}
            />
            <StatCard
              label={t('dash.organizeSuggestions')}
              value={orgCount}
              hint={orgCount === 0 ? t('dash.wellOrganized') : t('dash.moves')}
              Icon={FolderOpen}
              tone={orgCount > 0 ? 'info' : 'success'}
              onClick={() => setActiveView('organize')}
              disabled={orgCount === 0}
              disabledReason={t('common.syncFirst')}
            />
            {emptyCount > 0 && (
              <StatCard
                label={t('dash.emptyFolders')}
                value={emptyCount}
                hint={t('dash.cleanup')}
                Icon={FolderX}
                tone="accent"
                onClick={() => setActiveView('empty-folders')}
              />
            )}
          </div>
        </div>
      )}

      {/* Rediscover preview */}
      {rediscover.length > 0 && (
        <div className="space-y-2">
          <SectionHeading
            Icon={Sparkles}
            iconClassName="text-[var(--fw-violet)]"
            trailing={
              <button
                onClick={() => setActiveView('rediscover')}
                className="text-xs text-[var(--fw-accent-text)] hover:underline font-medium"
              >
                {t('dash.seeAll')} {rediscover.length > 0 ? `(${rediscover.length})` : ''}
              </button>
            }
          >
            {t('dash.rediscover')}
          </SectionHeading>
          <div className="space-y-1.5">
            {rediscover.slice(0, 3).map((item) => {
              const bm = snapshot[item.bookmarkId]
              const title = bm?.title || bm?.url || `Bookmark ${item.bookmarkId}`
              let domain = ''
              try {
                if (bm?.url) domain = new URL(bm.url).hostname.replace(/^www\./, '')
              } catch { /* ignore */ }
              return (
                <div
                  key={item.bookmarkId}
                  className="p-2.5 bg-[var(--fw-surface)] rounded-[var(--fw-radius-lg)] border border-[var(--fw-border)] flex items-start gap-2.5"
                >
                  <Favicon
                    url={bm?.url}
                    size={20}
                    framed
                    FallbackIcon={Sparkles}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{title}</p>
                    {domain && (
                      <p className="text-[11px] text-[var(--fw-text-subtle)] mt-0.5">
                        {domain}
                      </p>
                    )}
                    <p className={cn('text-[11px] mt-0.5 leading-snug', status.violet.text)}>
                      {item.reasonParts
                        ? item.reasonParts.map((p) => t(p.key, p.args)).join(' · ')
                        : item.reason}
                    </p>
                  </div>
                  {bm?.url && (
                    <button
                      onClick={() => chrome.tabs.create({ url: bm.url! })}
                      aria-label={t('common.open')}
                      title={t('common.open')}
                      className="h-6 w-6 flex items-center justify-center rounded-[var(--fw-radius-sm)] text-[var(--fw-text-subtle)] hover:text-[var(--fw-accent-text)] hover:bg-[var(--fw-bg-subtle)] transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Recent activity */}
      {recentOps !== null && recentOps.length > 0 && (
        <div className="space-y-2">
          <SectionHeading
            Icon={History}
            trailing={
              <button
                onClick={() => setActiveView('settings')}
                className="text-xs text-[var(--fw-accent-text)] hover:underline font-medium"
              >
                {t('dash.viewLog')}
              </button>
            }
          >
            {t('dash.recentActivity')}
          </SectionHeading>
          <div className="rounded-[var(--fw-radius-lg)] border border-[var(--fw-border)] bg-[var(--fw-surface)] divide-y divide-[var(--fw-border)] overflow-hidden">
            {recentOps.map((op) => (
              <div
                key={op.operationId}
                className="flex items-center gap-2 px-2.5 py-1.5 text-xs"
              >
                <Badge variant={badgeForAction(op.actionType)}>
                  {t(ACTION_LABEL_KEYS[op.actionType])}
                </Badge>
                <span className="text-[var(--fw-text-muted)] flex-1 truncate">
                  {t('common.nItems', { count: op.bookmarkIds.length })}
                  {op.note ? ` · ${op.note}` : ''}
                </span>
                <span className="text-[var(--fw-text-subtle)] flex-shrink-0 tabular-nums">
                  {formatOpTime(op.timestamp)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function badgeForAction(
  action: OperationLogEntry['actionType'],
): React.ComponentProps<typeof Badge>['variant'] {
  switch (ACTION_TONE[action]) {
    case 'danger':  return 'destructive'
    case 'warning': return 'warning'
    case 'success': return 'success'
    case 'info':    return 'info'
    case 'accent':
    default:        return 'primary'
  }
}

/* ---------- Protection Suggestion — nudge users to protect organized folders ---------- */

function ProtectionSuggestion({
  candidates,
  onRefresh,
}: {
  candidates: ProtectionCandidate[]
  onRefresh: () => Promise<void>
}) {
  const { t } = useT()
  const [busy, setBusy] = useState<Set<string>>(new Set())

  const mark = (id: string, v: boolean) =>
    setBusy((prev) => {
      const next = new Set(prev)
      v ? next.add(id) : next.delete(id)
      return next
    })

  const protect = async (c: ProtectionCandidate) => {
    mark(c.id, true)
    try {
      const cur = await send('settings.get')
      if (!cur.ok) return
      const current = cur.data.protectedFolderIds ?? []
      if (current.includes(c.id)) {
        await onRefresh()
        return
      }
      const res = await send('settings.update', {
        protectedFolderIds: [...current, c.id],
      })
      if (res.ok) {
        toast.success(t('protect.toastProtected', { folder: c.title }))
        await onRefresh()
      } else {
        toast.error(res.error.message)
      }
    } finally {
      mark(c.id, false)
    }
  }

  const dismiss = async (c: ProtectionCandidate) => {
    mark(c.id, true)
    try {
      const res = await send('protection.candidates.dismiss', { folderId: c.id })
      if (res.ok) await onRefresh()
    } finally {
      mark(c.id, false)
    }
  }

  return (
    <div className="space-y-2">
      <SectionHeading Icon={Shield} iconClassName={status.success.icon}>
        {t('dash.looksOrganized')}
      </SectionHeading>
      <div className="space-y-1.5">
        {candidates.slice(0, 3).map((c) => {
          const isBusy = busy.has(c.id)
          const statsLabel = t('protect.card.subfoldersLoose', {
            subfolders: c.directSubfolderCount,
            total: c.totalLinks.toLocaleString(),
            loose: c.directLinkCount,
          })
          return (
            <div
              key={c.id}
              className={cn(
                'fw-row-enter rounded-[var(--fw-radius-lg)] border border-transparent p-2.5 flex items-start gap-2.5',
                status.success.soft,
              )}
            >
              <IconBox Icon={FolderOpen} tone="success" size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate" title={c.title}>
                  {c.title}
                </p>
                <p
                  className="text-[11px] opacity-80 mt-0.5 truncate whitespace-nowrap"
                  title={statsLabel}
                  data-fw-protection-stats
                >
                  {statsLabel}
                </p>
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => void protect(c)}
                  disabled={isBusy}
                  className="gap-1 h-6 px-2 text-[11px]"
                  aria-label={`${t('protect.protect')} ${c.title}`}
                >
                  <Shield className="h-3 w-3" />
                  {t('protect.protect')}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => void dismiss(c)}
                  disabled={isBusy}
                  aria-label={t('common.dismiss')}
                  title={t('common.dismiss')}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ---------- Inbox — fresh bookmarks auto-categorization ---------- */

function InboxSection({
  entries,
  onRefresh,
  onNavigateOrganize,
}: {
  entries: NewBookmarkInboxEntry[]
  onRefresh: () => Promise<void>
  onNavigateOrganize: () => void
}) {
  const { t } = useT()
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())

  const mark = (id: string, busy: boolean) =>
    setBusyIds((prev) => {
      const next = new Set(prev)
      busy ? next.add(id) : next.delete(id)
      return next
    })

  const handleApply = async (entry: NewBookmarkInboxEntry) => {
    if (!entry.suggestedFolderId) {
      onNavigateOrganize()
      return
    }
    mark(entry.bookmarkId, true)
    try {
      const res = await send('inbox.apply', {
        bookmarkId: entry.bookmarkId,
        targetFolderId: entry.suggestedFolderId,
      })
      if (res.ok) {
        if (res.data.ok) {
          toast.success(t('dash.moveTo', { folder: entry.suggestedFolderTitle ?? '' }))
          await onRefresh()
        } else {
          toast.error(res.data.reason)
        }
      } else {
        toast.error(res.error.message)
      }
    } finally {
      mark(entry.bookmarkId, false)
    }
  }

  const handleDismiss = async (bookmarkId: string) => {
    mark(bookmarkId, true)
    try {
      const res = await send('inbox.dismiss', { bookmarkIds: [bookmarkId] })
      if (res.ok) await onRefresh()
    } finally {
      mark(bookmarkId, false)
    }
  }

  const handleDismissAll = async () => {
    const ids = entries.map((e) => e.bookmarkId)
    await send('inbox.dismiss', { bookmarkIds: ids })
    await onRefresh()
  }

  return (
    <div className="space-y-2">
      <SectionHeading
        Icon={Inbox}
        iconClassName={status.accent.icon}
        trailing={
          entries.length > 1 && (
            <button
              onClick={handleDismissAll}
              className="text-[11px] text-[var(--fw-text-muted)] hover:text-[var(--fw-text)] font-medium"
            >
              {t('common.dismissAll')}
            </button>
          )
        }
      >
        {entries.length !== 1 ? t('dash.newBookmarks.plural', { count: entries.length }) : t('dash.newBookmarks', { count: entries.length })}
      </SectionHeading>

      <div className="space-y-1.5">
        {entries.slice(0, 4).map((entry) => {
          const busy = busyIds.has(entry.bookmarkId)
          let domain = ''
          try {
            domain = new URL(entry.url).hostname.replace(/^www\./, '')
          } catch { /* noop */ }

          return (
            <div
              key={entry.bookmarkId}
              className="fw-row-enter rounded-[var(--fw-radius-lg)] border border-[var(--fw-border)] bg-[var(--fw-surface)] p-2.5 flex items-start gap-2.5"
            >
              <Favicon
                url={entry.url}
                size={20}
                framed
                FallbackIcon={BookMarked}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-xs font-semibold truncate flex-1">
                    {entry.title || entry.url}
                  </p>
                  {entry.suggestedLabel && (
                    <Badge variant="primary" className="flex-shrink-0">
                      {entry.suggestedLabel}
                    </Badge>
                  )}
                </div>
                {domain && (
                  <p className="text-[10.5px] text-[var(--fw-text-subtle)] truncate mt-0.5">
                    {domain}
                  </p>
                )}
                <div className="flex items-center gap-1.5 mt-2">
                  {entry.suggestedFolderId ? (
                    <Button
                      size="sm"
                      onClick={() => void handleApply(entry)}
                      disabled={busy}
                      className="gap-1 h-6 px-2 text-[11px] flex-1"
                      aria-label={t('dash.moveTo', { folder: entry.suggestedFolderTitle ?? '' })}
                    >
                      <FolderInput className="h-3 w-3" />
                      {t('dash.moveTo', { folder: entry.suggestedFolderTitle ?? '' })}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={onNavigateOrganize}
                      disabled={busy}
                      className="gap-1 h-6 px-2 text-[11px] flex-1"
                    >
                      <FolderOpen className="h-3 w-3" />
                      {t('common.pickFolder')}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => void handleDismiss(entry.bookmarkId)}
                    disabled={busy}
                    aria-label={t('common.dismiss')}
                    title={t('common.dismiss')}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
        {entries.length > 4 && (
          <p className="text-[11px] text-[var(--fw-text-subtle)] text-center pt-1">
            {t('dash.moreNewBookmarks', { count: entries.length - 4 })}
          </p>
        )}
      </div>
    </div>
  )
}
