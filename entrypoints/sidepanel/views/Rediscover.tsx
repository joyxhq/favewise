import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Sparkles,
  RefreshCw,
  ExternalLink,
  Clock,
  X,
  Bookmark,
  BookmarkCheck,
  ArrowUpDown,
} from 'lucide-react'
import { toast } from 'sonner'
import type { RediscoverItem } from '~/shared/types'
import type { ViewProps } from '../App'
import { Button } from '~/shared/components/ui/button'
import { Badge } from '~/shared/components/ui/badge'
import { EmptyState } from '~/shared/components/patterns/EmptyState'
import { IconBox } from '~/shared/components/patterns/IconBox'
import { Favicon } from '~/shared/components/patterns/Favicon'
import { SectionHeading } from '~/shared/components/patterns/SectionHeading'
import { cn } from '~/shared/lib/utils'
import { status } from '~/shared/lib/tokens'
import { send } from '~/shared/lib/messaging'
import { useT } from '~/shared/lib/i18n'

type Tab = 'discover' | 'saved'
type SortKey = 'score' | 'age' | 'domain'

type SavedEntry = { bookmarkId: string; at: number }
type BookmarkInfo = { title?: string; url?: string }

function domainOf(url: string | undefined): string {
  if (!url) return ''
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

function ageLabel(ts: number | undefined): string | null {
  if (!ts) return null
  const diff = Date.now() - ts
  const years = Math.floor(diff / (365 * 86_400_000))
  const months = Math.floor(diff / (30 * 86_400_000))
  if (years >= 1) return `${years}y`
  if (months >= 1) return `${months}mo`
  return null
}

export default function Rediscover({
  scanResult,
  scanVersion,
  startScan,
  refreshScanResult,
}: ViewProps) {
  const { t } = useT()
  const [tab, setTab] = useState<Tab>('discover')
  const [sortBy, setSortBy] = useState<SortKey>('score')
  const [savedItems, setSavedItems] = useState<SavedEntry[] | null>(null)
  const [savedBookmarks, setSavedBookmarks] = useState<Record<string, BookmarkInfo>>({})

  /* ---------- Saved tab data ---------- */

  const loadSaved = useCallback(async () => {
    const res = await send('savedForLater.get')
    if (!res.ok) {
      setSavedItems([])
      return
    }
    const entries = res.data
    setSavedItems(entries)
    const details: Record<string, BookmarkInfo> = {}
    await Promise.all(
      entries.map(async ({ bookmarkId }) => {
        try {
          const [bm] = await chrome.bookmarks.get(bookmarkId)
          if (bm) details[bookmarkId] = { title: bm.title, url: bm.url }
        } catch { /* bookmark gone */ }
      }),
    )
    setSavedBookmarks(details)
  }, [])

  useEffect(() => {
    if (tab === 'saved') loadSaved()
  }, [tab, loadSaved, scanVersion])

  /* ---------- Discover tab data ---------- */

  const snapshot = scanResult?.bookmarkSnapshot ?? {}
  const items = scanResult?.rediscoverItems ?? []

  const sorted = useMemo(() => {
    const list = [...items]
    switch (sortBy) {
      case 'age':
        list.sort((a, b) => (snapshot[a.bookmarkId]?.dateAdded ?? 0) - (snapshot[b.bookmarkId]?.dateAdded ?? 0))
        break
      case 'domain':
        list.sort((a, b) =>
          domainOf(snapshot[a.bookmarkId]?.url).localeCompare(
            domainOf(snapshot[b.bookmarkId]?.url),
          ),
        )
        break
      case 'score':
      default:
        list.sort((a, b) => b.score - a.score)
    }
    return list
  }, [items, sortBy, snapshot])

  if (!scanResult) {
    return (
      <EmptyState
        Icon={Sparkles}
        tone="violet"
        title={t('rediscover.empty.title')}
        description={t('rediscover.empty.desc')}
        action={
          <Button onClick={startScan} size="sm" className="gap-1.5">
            <RefreshCw className="h-3 w-3" />
            {t('common.syncBookmarks')}
          </Button>
        }
      />
    )
  }

  /* ---------- Actions ---------- */

  const handleDismiss = async (bookmarkId: string) => {
    await send('rediscover.dismiss', { bookmarkId })
    await refreshScanResult()
  }

  const handleSave = async (bookmarkId: string) => {
    await send('rediscover.saveForLater', { bookmarkId })
    await refreshScanResult()
    toast.success(t('rediscover.saveForLater'), {
      action: { label: t('rediscover.tab.saved'), onClick: () => setTab('saved') },
    })
  }

  const handleOpen = async (item: RediscoverItem) => {
    const bm = snapshot[item.bookmarkId]
    if (!bm?.url) return
    chrome.tabs.create({ url: bm.url })
    await handleDismiss(item.bookmarkId)
  }

  const handleOpenSaved = (id: string) => {
    const bm = savedBookmarks[id]
    if (bm?.url) chrome.tabs.create({ url: bm.url })
  }

  const handleDismissSaved = async (id: string) => {
    await send('savedForLater.dismiss', { bookmarkId: id })
    setSavedItems((prev) => (prev ?? []).filter((e) => e.bookmarkId !== id))
    toast.success(t('rediscover.removeFromSaved'))
  }

  /* ---------- Render ---------- */

  return (
    <div className="flex flex-col h-full">
      {/* Pill tabs */}
      <div className="px-3 py-2 border-b border-[var(--fw-border)] flex-shrink-0 space-y-2">
        <div className="inline-flex max-w-full rounded-[var(--fw-radius-md)] bg-[var(--fw-bg-subtle)] p-0.5 border border-[var(--fw-border)] overflow-x-auto">
          <button
            onClick={() => setTab('discover')}
            className={cn(
              'px-2.5 py-1 text-xs font-medium rounded-[var(--fw-radius-sm)] flex items-center gap-1.5 transition-colors',
              tab === 'discover'
                ? 'bg-[var(--fw-surface)] text-[var(--fw-text)] shadow-[var(--fw-shadow-sm)]'
                : 'text-[var(--fw-text-muted)] hover:text-[var(--fw-text)]',
            )}
            aria-pressed={tab === 'discover'}
          >
            <Sparkles className="h-3 w-3" />
            {t('rediscover.tab.discover')}
            {items.length > 0 && (
              <Badge variant="purple" className="ml-0.5 px-1 py-0 h-3.5 text-[9px]">
                {items.length}
              </Badge>
            )}
          </button>
          <button
            onClick={() => setTab('saved')}
            className={cn(
              'px-2.5 py-1 text-xs font-medium rounded-[var(--fw-radius-sm)] flex items-center gap-1.5 transition-colors',
              tab === 'saved'
                ? 'bg-[var(--fw-surface)] text-[var(--fw-text)] shadow-[var(--fw-shadow-sm)]'
                : 'text-[var(--fw-text-muted)] hover:text-[var(--fw-text)]',
            )}
            aria-pressed={tab === 'saved'}
          >
            <BookmarkCheck className="h-3 w-3" />
            {t('rediscover.tab.saved')}
            {savedItems && savedItems.length > 0 && (
              <span className="ml-0.5 text-[10.5px] text-[var(--fw-text-subtle)]">
                ({savedItems.length})
              </span>
            )}
          </button>
        </div>

        {tab === 'discover' && items.length > 1 && (
          <label
            className="ml-auto flex h-7 max-w-full items-center gap-1.5 rounded-[var(--fw-radius-sm)] border border-[var(--fw-border)] bg-[var(--fw-surface)] px-2 text-[11px] text-[var(--fw-text-subtle)]"
            data-fw-rediscover-sort
          >
            <ArrowUpDown className="h-3 w-3 flex-shrink-0" />
            <span className="flex-shrink-0">{t('rediscover.sort.label')}</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="min-w-0 max-w-[150px] bg-transparent border-none outline-none text-xs font-medium cursor-pointer pr-5"
              aria-label={t('rediscover.sort.relevance')}
            >
              <option value="score">{t('rediscover.sort.relevance')}</option>
              <option value="age">{t('rediscover.sort.age')}</option>
              <option value="domain">{t('rediscover.sort.domain')}</option>
            </select>
          </label>
        )}
      </div>

      {/* Discover */}
      {tab === 'discover' && (
        <div className="flex-1 overflow-y-auto">
          {sorted.length === 0 ? (
            <EmptyState
              Icon={Sparkles}
              tone="violet"
              title={t('rediscover.empty.noGems')}
              description={t('rediscover.empty.saveMore')}
            />
          ) : (
            <div className="p-3 space-y-2">
              <SectionHeading>
                {t('rediscover.forgottenN', { count: sorted.length })}
              </SectionHeading>
              {sorted.map((item) => {
                const bm = snapshot[item.bookmarkId]
                const title = bm?.title || bm?.url || item.bookmarkId
                const domain = domainOf(bm?.url)
                const age = ageLabel(bm?.dateAdded)
                return (
                  <div
                    key={item.bookmarkId}
                    className="rounded-[var(--fw-radius-lg)] border border-[var(--fw-border)] bg-[var(--fw-surface)] p-3"
                  >
                    <div className="flex items-start gap-2.5">
                      <Favicon
                        url={bm?.url}
                        size={20}
                        framed
                        FallbackIcon={Bookmark}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">{title}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap text-[11px] text-[var(--fw-text-subtle)]">
                          {domain && <span>{domain}</span>}
                          {age && (
                            <span className="flex items-center gap-0.5">
                              <Clock className="h-2.5 w-2.5" />
                              {age}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDismiss(item.bookmarkId)}
                        aria-label={t('common.dismiss')}
                        title={t('common.dismiss')}
                        className="flex-shrink-0 text-[var(--fw-text-subtle)] hover:text-[var(--fw-text)] transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <p className={cn('text-[11px] mt-2 leading-snug', status.violet.text)}>
                      {item.reasonParts
                        ? item.reasonParts.map((p) => t(p.key, p.args)).join(' · ')
                        : item.reason}
                    </p>

                    <div className="flex gap-1.5 mt-2.5">
                      <Button
                        size="sm"
                        onClick={() => handleOpen(item)}
                        disabled={!bm?.url}
                        aria-label={t('common.open')}
                        className="flex-1 gap-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {t('common.open')}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleSave(item.bookmarkId)}
                        aria-label={t('rediscover.saveForLater')}
                        className="flex-1 gap-1"
                      >
                        <Clock className="h-3 w-3" />
                        {t('rediscover.saveForLater')}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Saved */}
      {tab === 'saved' && (
        <div className="flex-1 overflow-y-auto">
          {savedItems === null ? (
            <div className="p-3">
              <p className="text-xs text-[var(--fw-text-subtle)]">{t('rediscover.loadingSaved')}</p>
            </div>
          ) : savedItems.length === 0 ? (
            <EmptyState
              Icon={BookmarkCheck}
              tone="violet"
              title={t('rediscover.empty.noSaved')}
              description={t('rediscover.empty.savedDesc')}
            />
          ) : (
            <div className="p-3 space-y-1.5">
              <SectionHeading>
                {t('rediscover.savedN', { count: savedItems.length })}
              </SectionHeading>
              {savedItems.map((entry) => {
                const bm = savedBookmarks[entry.bookmarkId]
                const title = bm?.title || bm?.url || `(deleted) ${entry.bookmarkId}`
                const isDeleted = !bm
                const savedDate = new Date(entry.at).toLocaleDateString('en', {
                  month: 'short', day: 'numeric',
                })
                return (
                  <div
                    key={entry.bookmarkId}
                    className={cn(
                      'rounded-[var(--fw-radius-lg)] border border-[var(--fw-border)] bg-[var(--fw-surface)] px-3 py-2.5 flex items-start gap-2',
                      isDeleted && 'opacity-70',
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-xs font-medium truncate', isDeleted && 'italic')}>
                        {title}
                      </p>
                      {bm?.url && (
                        <p className="text-[11px] text-[var(--fw-text-subtle)] truncate mt-0.5 font-mono">
                          {bm.url}
                        </p>
                      )}
                      <p className="text-[10.5px] text-[var(--fw-text-subtle)] mt-0.5 flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        {t('rediscover.saved', { date: savedDate })}
                        {isDeleted && ` · ${t('rediscover.bookmarkDeleted')}`}
                      </p>
                    </div>
                    <div className="flex gap-0.5 flex-shrink-0">
                      {bm?.url && (
                        <button
                          onClick={() => handleOpenSaved(entry.bookmarkId)}
                          aria-label={t('common.open')}
                          title={t('common.open')}
                          className="h-6 w-6 flex items-center justify-center rounded-[var(--fw-radius-sm)] text-[var(--fw-text-subtle)] hover:text-[var(--fw-accent-text)] hover:bg-[var(--fw-bg-subtle)] transition-colors"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDismissSaved(entry.bookmarkId)}
                        aria-label={t('rediscover.removeFromSaved')}
                        title={t('rediscover.removeFromSaved')}
                        className="h-6 w-6 flex items-center justify-center rounded-[var(--fw-radius-sm)] text-[var(--fw-text-subtle)] hover:text-[var(--fw-danger-text)] hover:bg-[var(--fw-danger-soft)] transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
