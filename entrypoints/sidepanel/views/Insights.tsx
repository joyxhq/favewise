import { useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  RefreshCw,
  Globe,
  Clock,
  EyeOff,
  Link2Off,
  Sparkles,
} from 'lucide-react'
import type { BookmarkRecord } from '~/shared/types'
import type { ViewProps } from '../App'
import { Button } from '~/shared/components/ui/button'
import { SectionHeading } from '~/shared/components/patterns/SectionHeading'
import { IconBox } from '~/shared/components/patterns/IconBox'
import { EmptyState } from '~/shared/components/patterns/EmptyState'
import { cn } from '~/shared/lib/utils'
import { status } from '~/shared/lib/tokens'
import { categorizeUrl } from '~/shared/lib/url-taxonomy'
import { useT } from '~/shared/lib/i18n'

const DAY_MS = 86_400_000

const AGE_BUCKETS: Array<{ label: string; minDays: number; maxDays?: number }> = [
  { label: '< 30d',   minDays: 0,    maxDays: 30 },
  { label: '1–6mo',   minDays: 30,   maxDays: 180 },
  { label: '6–12mo',  minDays: 180,  maxDays: 365 },
  { label: '1–2y',    minDays: 365,  maxDays: 730 },
  { label: '2y+',     minDays: 730 },
]

function domainOf(url: string | undefined): string | null {
  if (!url) return null
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return null }
}

/* Fetch full tree via an existing route — use folders.get which flattens, but we
 * need URL records too. Re-use scan.latest.get + bookmarkSnapshot? Snapshot
 * only includes referenced IDs. Better: add a dedicated helper. Use
 * chrome.bookmarks.getTree directly here to avoid extending the message map. */
async function fetchAllLinks(): Promise<BookmarkRecord[]> {
  const tree = await chrome.bookmarks.getTree()
  const out: BookmarkRecord[] = []
  const walk = (
    nodes: chrome.bookmarks.BookmarkTreeNode[],
    parentPath: string[],
  ) => {
    for (const n of nodes) {
      const folderPath = n.title ? [...parentPath, n.title] : parentPath
      if (n.url) {
        out.push({
          id: n.id,
          title: n.title ?? '',
          url: n.url,
          parentId: n.parentId,
          folderPath: parentPath,
          dateAdded: n.dateAdded,
          dateLastUsed: (n as unknown as { dateLastUsed?: number }).dateLastUsed,
          index: n.index,
        })
      }
      if (n.children) walk(n.children, folderPath)
    }
  }
  walk(tree, [])
  return out
}

export default function Insights({ scanResult, startScan }: ViewProps) {
  const { t } = useT()
  const [links, setLinks] = useState<BookmarkRecord[] | null>(null)

  useEffect(() => {
    fetchAllLinks().then(setLinks).catch(() => setLinks([]))
  }, [])

  const metrics = useMemo(() => {
    if (!links) return null
    const now = Date.now()
    const ageBuckets = AGE_BUCKETS.map((b) => ({ ...b, count: 0 }))
    const byDomain = new Map<string, number>()
    const byCategory = new Map<string, number>()
    let neverOpened = 0
    let realTitleCount = 0

    for (const bm of links) {
      const added = bm.dateAdded ?? now
      const ageDays = Math.max(0, (now - added) / DAY_MS)
      for (const bucket of ageBuckets) {
        if (ageDays >= bucket.minDays && (bucket.maxDays === undefined || ageDays < bucket.maxDays)) {
          bucket.count++
          break
        }
      }

      // Never-opened: dateLastUsed missing or within a day of creation
      if (!bm.dateLastUsed || bm.dateLastUsed < added + DAY_MS) neverOpened++
      if (bm.title && bm.title !== bm.url) realTitleCount++

      const d = domainOf(bm.url)
      if (d) byDomain.set(d, (byDomain.get(d) ?? 0) + 1)

      const c = bm.url ? categorizeUrl(bm.url) : null
      if (c && c.confidence >= 0.7) {
        byCategory.set(c.label, (byCategory.get(c.label) ?? 0) + 1)
      }
    }

    const topDomains = Array.from(byDomain.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([domain, count]) => ({ domain, count }))

    const topCategories = Array.from(byCategory.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, count]) => ({ label, count }))

    const categorizedCount = Array.from(byCategory.values()).reduce((a, b) => a + b, 0)

    return {
      total: links.length,
      ageBuckets,
      topDomains,
      topCategories,
      neverOpened,
      realTitleCount,
      categorizedCount,
      coverage: links.length > 0 ? Math.round((categorizedCount / links.length) * 100) : 0,
    }
  }, [links])

  const deadLinkCount = scanResult?.deadLinks?.length ?? 0
  const deadLinkRate = useMemo(() => {
    if (!metrics || metrics.total === 0) return 0
    return Math.round((deadLinkCount / metrics.total) * 1000) / 10
  }, [deadLinkCount, metrics])

  if (!metrics) {
    return (
      <div className="p-3 space-y-3">
        <p className="text-xs text-[var(--fw-text-subtle)]">{t('common.loading')}</p>
      </div>
    )
  }

  if (metrics.total === 0) {
    return (
      <EmptyState
        Icon={BarChart3}
        tone="accent"
        title={t('insights.empty.title')}
        description={t('insights.empty.desc')}
        action={
          <Button onClick={startScan} size="sm" className="gap-1.5">
            <RefreshCw className="h-3 w-3" />
            {t('common.syncBookmarks')}
          </Button>
        }
      />
    )
  }

  const maxAge = Math.max(...metrics.ageBuckets.map((b) => b.count))
  const maxDomain = metrics.topDomains[0]?.count ?? 1
  const maxCategory = metrics.topCategories[0]?.count ?? 1

  return (
    <div className="p-3 space-y-5">
      {/* Top row: headline metrics */}
      <div className="grid grid-cols-2 gap-1.5">
        <MetricCard
          Icon={BarChart3}
          tone="accent"
          label={t('insights.total')}
          value={metrics.total.toLocaleString()}
          hint={t('insights.realTitles', { count: metrics.realTitleCount })}
        />
        <MetricCard
          Icon={EyeOff}
          tone="warning"
          label={t('insights.neverOpened')}
          value={metrics.neverOpened.toLocaleString()}
          hint={`${Math.round((metrics.neverOpened / metrics.total) * 100)}%`}
        />
        <MetricCard
          Icon={Link2Off}
          tone={deadLinkCount > 0 ? 'danger' : 'success'}
          label={t('insights.deadLinks')}
          value={scanResult?.deadLinksChecked ? deadLinkCount.toLocaleString() : '—'}
          hint={
            scanResult?.deadLinksChecked
              ? `${deadLinkRate}%`
              : t('app.checkLinks')
          }
        />
        <MetricCard
          Icon={Sparkles}
          tone="info"
          label={t('insights.recognized')}
          value={`${metrics.coverage}%`}
          hint={t('insights.taxonomyMatches', { count: metrics.categorizedCount })}
        />
      </div>

      {/* Age histogram */}
      <section className="space-y-2">
        <SectionHeading Icon={Clock}>{t('insights.ageDistribution')}</SectionHeading>
        <div className="rounded-[var(--fw-radius-lg)] border border-[var(--fw-border)] bg-[var(--fw-surface)] p-3 space-y-1.5">
          {metrics.ageBuckets.map((b) => {
            const w = maxAge > 0 ? Math.round((b.count / maxAge) * 100) : 0
            const pct = Math.round((b.count / metrics.total) * 100)
            return (
              <div key={b.label} className="flex items-center gap-2">
                <span className="text-[11px] text-[var(--fw-text-muted)] w-12 tabular-nums flex-shrink-0">
                  {b.label}
                </span>
                <div className="flex-1 h-4 relative">
                  <div
                    className={cn(
                      'h-full rounded-[var(--fw-radius-sm)] transition-all',
                      b.minDays >= 365
                        ? status.warning.icon.replace('text-', 'bg-')
                        : status.accent.icon.replace('text-', 'bg-'),
                    )}
                    style={{ width: `${w}%` }}
                  />
                </div>
                <span className="text-[11px] font-medium tabular-nums w-16 text-right flex-shrink-0">
                  {b.count.toLocaleString()}
                  <span className="text-[var(--fw-text-subtle)] ml-1">({pct}%)</span>
                </span>
              </div>
            )
          })}
        </div>
      </section>

      {/* Top categories */}
      {metrics.topCategories.length > 0 && (
        <section className="space-y-2">
          <SectionHeading Icon={Sparkles}>{t('insights.topCategories')}</SectionHeading>
          <div className="rounded-[var(--fw-radius-lg)] border border-[var(--fw-border)] bg-[var(--fw-surface)] p-3 space-y-1.5">
            {metrics.topCategories.map((c) => {
              const w = Math.round((c.count / maxCategory) * 100)
              return (
                <div key={c.label} className="flex items-center gap-2">
                  <span className="text-[11px] font-medium truncate w-24 flex-shrink-0">
                    {c.label}
                  </span>
                  <div className="flex-1 h-4 relative">
                    <div
                      className={cn(
                        'h-full rounded-[var(--fw-radius-sm)]',
                        status.info.icon.replace('text-', 'bg-'),
                      )}
                      style={{ width: `${w}%` }}
                    />
                  </div>
                  <span className="text-[11px] tabular-nums w-10 text-right">
                    {c.count.toLocaleString()}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Top domains */}
      <section className="space-y-2">
        <SectionHeading Icon={Globe}>{t('insights.topDomains')}</SectionHeading>
        <div className="rounded-[var(--fw-radius-lg)] border border-[var(--fw-border)] bg-[var(--fw-surface)] p-3 space-y-1.5">
          {metrics.topDomains.map((d) => {
            const w = Math.round((d.count / maxDomain) * 100)
            return (
              <div key={d.domain} className="flex items-center gap-2">
                <span className="text-[11px] font-mono truncate w-28 flex-shrink-0" title={d.domain}>
                  {d.domain}
                </span>
                <div className="flex-1 h-4 relative">
                  <div
                    className={cn(
                      'h-full rounded-[var(--fw-radius-sm)]',
                      status.violet.icon.replace('text-', 'bg-'),
                    )}
                    style={{ width: `${w}%` }}
                  />
                </div>
                <span className="text-[11px] tabular-nums w-10 text-right">
                  {d.count.toLocaleString()}
                </span>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function MetricCard({
  Icon,
  tone,
  label,
  value,
  hint,
}: {
  Icon: import('lucide-react').LucideIcon
  tone: 'accent' | 'success' | 'danger' | 'info' | 'warning' | 'violet'
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="p-3 rounded-[var(--fw-radius-lg)] border border-[var(--fw-border)] bg-[var(--fw-surface)] flex items-start gap-2.5">
      <IconBox Icon={Icon} tone={tone} size="sm" />
      <div className="flex-1 min-w-0">
        <p className="text-lg font-bold tabular-nums leading-none">{value}</p>
        <p className="text-[11px] text-[var(--fw-text-muted)] mt-1 truncate">{label}</p>
        {hint && (
          <p className="text-[10.5px] text-[var(--fw-text-subtle)] mt-0.5 truncate">
            {hint}
          </p>
        )}
      </div>
    </div>
  )
}

