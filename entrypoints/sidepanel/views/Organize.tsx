import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FolderOpen,
  RefreshCw,
  ArrowRight,
  CheckCircle2,
  EyeOff,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  Folder,
  FolderPlus,
  Target,
  X,
  Wand2,
  ShieldCheck,
  Shield,
} from 'lucide-react'
import { toast } from 'sonner'
import type { BookmarkRecord, OrganizeSuggestion } from '~/shared/types'
import type { FolderSummary } from '~/shared/types/messages'
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
import { ConfirmDialog } from '~/shared/components/patterns/ConfirmDialog'
import { FolderPickerDialog } from '~/shared/components/patterns/FolderPickerDialog'
import { DataList } from '~/shared/components/patterns/DataList'
import { IconBox } from '~/shared/components/patterns/IconBox'
import { showUndoToast } from '~/shared/components/patterns/undo'
import { cn } from '~/shared/lib/utils'
import { status } from '~/shared/lib/tokens'
import { send } from '~/shared/lib/messaging'
import { formatFolderPath } from '~/shared/utils/bookmark-tree'
import { useT } from '~/shared/lib/i18n'

type Tier = 'high' | 'medium' | 'low'

function tier(conf: number): Tier {
  if (conf >= 0.7) return 'high'
  if (conf >= 0.5) return 'medium'
  return 'low'
}

const TIER_META: Record<
  Tier,
  { badge: React.ComponentProps<typeof Badge>['variant']; labelKey: string; hintKey: string }
> = {
  high:   { badge: 'success',     labelKey: 'organize.tier.strong', hintKey: 'organize.tier.strongHint' },
  medium: { badge: 'warning',     labelKey: 'organize.tier.likely', hintKey: 'organize.tier.likelyHint' },
  low:    { badge: 'destructive', labelKey: 'organize.tier.weak',   hintKey: 'organize.tier.weakHint' },
}

export default function Organize({
  scanResult,
  scanVersion,
  startScan,
  refreshScanResult,
}: ViewProps) {
  const { t } = useT()
  /* ---------- State ---------- */
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expandedCluster, setExpandedCluster] = useState<Set<string>>(new Set())
  const [expandedAlt, setExpandedAlt] = useState<Set<string>>(new Set())
  const [confirmApply, setConfirmApply] = useState<string[] | null>(null)
  const [applying, setApplying] = useState(false)
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())

  const [scopeFolderId, setScopeFolderId] = useState<string | null>(null)
  const [scopePath, setScopePath] = useState<string[] | null>(null)
  const [scopeSuggestions, setScopeSuggestions] = useState<OrganizeSuggestion[] | null>(null)
  const [scopeSnapshot, setScopeSnapshot] = useState<Record<string, BookmarkRecord>>({})
  const [scopeStats, setScopeStats] = useState<{
    links: number
    subfolders: number
  } | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [folders, setFolders] = useState<FolderSummary[]>([])
  // Live-fetched bookmarks — fallback when scan snapshot is stale
  const [liveSnapshot, setLiveSnapshot] = useState<Record<string, BookmarkRecord>>({})

  const [protectedIds, setProtectedIds] = useState<string[]>([])

  /* ---------- Load scope from settings + folder list ---------- */

  useEffect(() => {
    send('settings.get').then((res) => {
      if (res.ok) {
        setScopeFolderId(res.data.organizeScopeFolderId ?? null)
        setProtectedIds(res.data.protectedFolderIds ?? [])
      }
    })
  }, [])

  // Reload folder list whenever the library changes (scan / apply / create).
  useEffect(() => {
    send('folders.get').then((res) => {
      if (res.ok) setFolders(res.data)
    })
  }, [scanVersion])

  /* ---------- Re-analyze when scope or scanVersion changes ---------- */

  const analyzeScope = useCallback(async (folderId: string | null) => {
    setAnalyzing(true)
    setHiddenIds(new Set())
    setSelected(new Set())
    try {
      const res = await send('organize.analyze', { scopeFolderId: folderId })
      if (res.ok) {
        setScopeSuggestions(res.data.suggestions)
        setScopePath(res.data.scopePath)
        setScopeSnapshot(res.data.bookmarkSnapshot)
        setScopeStats({
          links: res.data.directChildLinkCount,
          subfolders: res.data.directSubfolderCount,
        })
      } else {
        toast.error(res.error.message)
        setScopeSuggestions([])
        setScopeSnapshot({})
      }
    } finally {
      setAnalyzing(false)
    }
  }, [])

  const toggleProtected = useCallback(async (folderId: string) => {
    const isProtected = protectedIds.includes(folderId)
    const next = isProtected
      ? protectedIds.filter((id) => id !== folderId)
      : [...protectedIds, folderId]
    setProtectedIds(next)
    const res = await send('settings.update', { protectedFolderIds: next })
    if (!res.ok) {
      setProtectedIds(protectedIds) // revert
      toast.error(t('organize.protectionFailed'))
      return
    }
    const folderName = scopePath && scopePath[scopePath.length - 1] ? scopePath[scopePath.length - 1] : ''
    toast.success(
      isProtected
        ? t('organize.folderOpen', { name: folderName })
        : t('organize.folderProtected', { name: folderName }),
    )
    // If we just protected the current scope, clear it.
    if (!isProtected && folderId === scopeFolderId) {
      setScopeFolderId(null)
      await send('settings.update', { organizeScopeFolderId: null })
    }
  }, [protectedIds, scopeFolderId])

  useEffect(() => {
    if (scopeFolderId) analyzeScope(scopeFolderId)
    else {
      setScopeSuggestions(null)
      setScopePath(null)
      setScopeStats(null)
      setScopeSnapshot({})
    }
  }, [scopeFolderId, analyzeScope, scanVersion])

  const handleScopeChange = async (ids: string[]) => {
    const id = ids[0] ?? null
    setScopeFolderId(id)
    await send('settings.update', { organizeScopeFolderId: id })
  }

  const clearScope = async () => {
    setScopeFolderId(null)
    await send('settings.update', { organizeScopeFolderId: null })
  }

  /* ---------- Which suggestions to show ---------- */

  const allSuggestions = useMemo<OrganizeSuggestion[]>(() => {
    if (scopeFolderId) return scopeSuggestions ?? []
    return scanResult?.organizeSuggestions ?? []
  }, [scopeFolderId, scopeSuggestions, scanResult])

  // Merge sources: scan snapshot ← analyze snapshot ← live-fetched fallbacks.
  // Later sources override earlier ones so freshest data wins.
  const snapshot = useMemo<Record<string, BookmarkRecord | { title?: string; url?: string; folderPath?: string[] }>>(() => ({
    ...(scanResult?.bookmarkSnapshot ?? {}),
    ...scopeSnapshot,
    ...liveSnapshot,
  }), [scanResult, scopeSnapshot, liveSnapshot])

  const visible = useMemo(
    () => allSuggestions.filter((s) => !hiddenIds.has(s.id)),
    [allSuggestions, hiddenIds],
  )

  // Top messy folders: at least 10 direct links and more links than subfolders × 2
  const topMessyFolders = useMemo(() => {
    return folders
      .filter((f) => (f.directLinkCount ?? 0) >= 10)
      .map((f) => ({
        ...f,
        messiness: (f.directLinkCount ?? 0) - (f.directSubfolderCount ?? 0) * 2,
      }))
      .filter((f) => f.messiness >= 10)
      .sort((a, b) => b.messiness - a.messiness)
      .slice(0, 3)
  }, [folders])

  // Enrich any bookmark IDs referenced by visible suggestions but missing
  // from every snapshot source — happens when the scan snapshot is stale
  // (bookmarks added/renamed after the last sync).
  useEffect(() => {
    const missing = new Set<string>()
    for (const s of visible) {
      const ids = s.memberIds?.length ? s.memberIds : [s.bookmarkId]
      for (const id of ids) {
        if (!snapshot[id]) missing.add(id)
      }
    }
    if (missing.size === 0) return
    let cancelled = false
    const ids = Array.from(missing) as [string, ...string[]]
    chrome.bookmarks
      .get(ids)
      .then((nodes) => {
        if (cancelled) return
        const patch: Record<string, BookmarkRecord> = {}
        for (const n of nodes) {
          patch[n.id] = {
            id: n.id,
            title: n.title ?? '',
            url: n.url,
            parentId: n.parentId,
            folderPath: [],
            dateAdded: n.dateAdded,
            index: n.index,
          }
        }
        setLiveSnapshot((prev) => ({ ...prev, ...patch }))
      })
      .catch(() => {
        /* bookmark may have been deleted — no-op */
      })
    return () => {
      cancelled = true
    }
  }, [visible, snapshot])

  // Compute how many of the loose bookmarks the current suggestions cover —
  // declared here (before any early return) so hook order is stable regardless
  // of whether scanResult is populated yet.
  const coveredByClusters = useMemo(() => {
    if (!scopeSuggestions) return 0
    const ids = new Set<string>()
    for (const s of scopeSuggestions) {
      if (s.kind === 'create_and_move') {
        for (const m of s.memberIds ?? []) ids.add(m)
      } else {
        ids.add(s.bookmarkId)
      }
    }
    return ids.size
  }, [scopeSuggestions])

  /* ---------- Early returns ---------- */

  if (!scanResult) {
    return (
      <EmptyState
        Icon={FolderOpen}
        tone="info"
        title={t('common.noScanData')}
        description={t('organize.empty.noScanDesc')}
        action={
          <Button onClick={startScan} size="sm" className="gap-1.5">
            <RefreshCw className="h-3 w-3" />
            {t('common.syncBookmarks')}
          </Button>
        }
      />
    )
  }

  const hide = (ids: string[]) => {
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
  }
  const unhide = (ids: string[]) => {
    setHiddenIds((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => next.delete(id))
      return next
    })
  }

  /* ---------- Actions ---------- */

  const commitApply = async (ids: string[]) => {
    const res = await send('organize.apply', { suggestionIds: ids })
    if (res.ok) {
      await refreshScanResult()
      // The scanVersion bump from refreshScanResult will auto-trigger
      // analyzeScope via the effect — no need to call it here explicitly.
      unhide(ids)
      const { movedCount, failedCount, createdFolders, protectedSkipped } = res.data
      const otherFailed = failedCount - (protectedSkipped ?? 0)
      if (protectedSkipped > 0 && otherFailed > 0) {
        toast.warning(
          t('organize.skippedAndFailed', { moved: t('organize.movedN', { count: movedCount }), skipped: protectedSkipped, failed: otherFailed }),
        )
      } else if (protectedSkipped > 0) {
        toast.warning(
          t('organize.skippedProtected', { moved: t('organize.movedN', { count: movedCount }), skipped: protectedSkipped }),
        )
      } else if (otherFailed > 0) {
        toast.warning(
          t('organize.someFailed', { moved: t('organize.movedN', { count: movedCount }), failed: otherFailed }),
        )
      } else if (createdFolders > 0) {
        toast.success(
          t('organize.createdFolders', { folders: createdFolders, moved: movedCount }),
        )
      }
    } else {
      toast.error(res.error.message)
      unhide(ids)
    }
  }

  const handleApplyWithUndo = (ids: string[]) => {
    if (ids.length === 0) return
    hide(ids)
    const affectedCount = ids.reduce((acc, id) => {
      const s = allSuggestions.find((x) => x.id === id)
      return acc + (s?.memberIds?.length ?? 1)
    }, 0)
    showUndoToast({
      message: `${t('organize.applying', { count: ids.length })} · ${affectedCount}`,
      onCommit: () => commitApply(ids),
      onUndo: () => unhide(ids),
    })
  }

  const handleIgnore = async (ids: string[]) => {
    if (ids.length === 0) return
    hide(ids)
    const res = await send('organize.ignore', { suggestionIds: ids })
    if (res.ok) {
      await refreshScanResult()
      toast.success(t('organize.ignoredN', { count: ids.length }))
    } else {
      toast.error(res.error.message)
      unhide(ids)
    }
  }

  /* ---------- Render ---------- */

  const isScopeProtected = scopeFolderId ? protectedIds.includes(scopeFolderId) : false
  const scopeChip = scopeFolderId ? (
    <div
      className={cn(
        'px-3 py-2 border-b border-[var(--fw-border)] flex flex-col gap-1.5 flex-shrink-0',
        isScopeProtected ? status.success.soft : status.accent.soft,
      )}
    >
      <div className="flex items-start gap-2">
        {isScopeProtected ? (
          <ShieldCheck className={cn('h-3.5 w-3.5 flex-shrink-0 mt-0.5', status.success.icon)} />
        ) : (
          <Target className={cn('h-3.5 w-3.5 flex-shrink-0 mt-0.5', status.accent.icon)} />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider opacity-70">
            {isScopeProtected ? t('organize.protect') : t('organize.analyze')}
          </p>
          <p className="text-xs font-semibold truncate" title={scopePath?.join(' / ')}>
            {scopePath ? formatFolderPath(scopePath) : t('common.loading')}
          </p>
          {scopeStats && (
            <p className="text-[10.5px] mt-0.5 opacity-70">
              {scopeStats.links} {t('organize.looseBookmarks')} · {scopeStats.subfolders} {t('organize.subfolders')}
              {coveredByClusters > 0 && scopeStats.links > 0 && !isScopeProtected && (
                <>
                  {' · '}
                  <strong>{coveredByClusters}</strong> {t('organize.willBeGrouped')}
                  {scopeStats.links - coveredByClusters > 0 && (
                    <>, {scopeStats.links - coveredByClusters} {t('organize.staysLoose')}</>
                  )}
                </>
              )}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={clearScope}
          aria-label={t('organize.clearScope')}
          className="flex-shrink-0"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>

      {!isScopeProtected ? (
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button
            variant="default"
            size="sm"
            onClick={() => analyzeScope(scopeFolderId)}
            disabled={analyzing}
            className="gap-1 h-6 px-2 text-[11px]"
            aria-label={t('organize.reanalyze')}
          >
            <Wand2 className={cn('h-3 w-3', analyzing && 'animate-pulse')} />
            {t('organize.analyze')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => scopeFolderId && void toggleProtected(scopeFolderId)}
            className="gap-1 h-6 px-2 text-[11px] ml-auto"
            aria-label={t('organize.protectBtnAria')}
            title={t('organize.protectBtnTip')}
          >
            <Shield className="h-3 w-3" />
            {t('organize.protect')}
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] flex-1">
            {t('organize.protectedNotice')}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => scopeFolderId && void toggleProtected(scopeFolderId)}
            className="gap-1 h-6 px-2 text-[11px]"
          >
            <Shield className="h-3 w-3" />
            {t('organize.unprotect')}
          </Button>
        </div>
      )}
    </div>
  ) : (
    <div className="border-b border-[var(--fw-border)] flex-shrink-0">
      <div className="px-3 py-2 flex items-center justify-between gap-2">
        <p className="min-w-0 text-[11px] leading-snug text-[var(--fw-text-muted)]">
          {t('organize.wholeLibrary')}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPickerOpen(true)}
          className="max-w-[150px] flex-shrink-0 gap-1 h-7 px-2 text-[11px]"
          title={t('organize.tidySpecificFolder')}
          data-fw-organize-scope-button
        >
          <Target className="h-3 w-3 flex-shrink-0" />
          <span className="min-w-0 truncate">{t('organize.tidyOneFolder')}</span>
        </Button>
      </div>
      {topMessyFolders.length > 0 && (
        <div className="px-3 pb-2 flex items-start gap-1.5 flex-wrap">
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--fw-text-subtle)] flex-shrink-0 pt-0.5">
            {t('organize.quickPick')}
          </span>
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            {topMessyFolders.map((f) => (
              <button
                key={f.id}
                onClick={() => void handleScopeChange([f.id])}
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-[var(--fw-radius-sm)] text-[11px] font-medium transition-colors max-w-full',
                  status.accent.soft,
                  'hover:brightness-95',
                )}
                title={[...f.folderPath, f.title].join(' / ')}
                aria-label={f.title}
              >
                <Target className="h-2.5 w-2.5 flex-shrink-0" />
                <span className="truncate">{f.title}</span>
                <span className="opacity-70 flex-shrink-0 tabular-nums">
                  · {f.directLinkCount}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  /* Empty states — but keep scope chip visible so user can change scope */
  const listBody = (() => {
    if (analyzing && visible.length === 0) {
      return (
        <div className="p-4 text-xs text-[var(--fw-text-subtle)]">{t('organize.analyzing')}</div>
      )
    }
    if (visible.length === 0) {
      if (scopeFolderId) {
        return (
          <EmptyState
            Icon={Sparkles}
            tone="success"
            title={t('organize.empty.nothingInFolder')}
            description={t('organize.empty.noCluster')}
            action={
              <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)} className="gap-1.5">
                <Target className="h-3 w-3" />
                {t('organize.pickAnotherFolder')}
              </Button>
            }
          />
        )
      }
      return (
        <EmptyState
          Icon={Sparkles}
          tone="success"
          title={t('organize.empty.wellOrganized')}
          description={t('organize.empty.noSuggestions')}
          action={
            <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)} className="gap-1.5">
              <Target className="h-3 w-3" />
              {t('organize.tidySpecificFolder')}
            </Button>
          }
        />
      )
    }

    return (
      <DataList
        items={visible}
        getId={(s) => s.id}
        searchFields={(s) => {
          const bm = snapshot[s.bookmarkId]
          return `${bm?.title ?? ''} ${bm?.url ?? ''} ${formatFolderPath(s.suggestedPath)} ${s.newFolderName ?? ''}`
        }}
        searchPlaceholder={t('organize.searchPlaceholder')}
        selected={selected}
        onSelectedChange={setSelected}
        onDelete={(ids) => setConfirmApply(ids)}
        renderRow={({ item: suggestion, selected: isSelected, toggle }) => {
          if (suggestion.kind === 'create_and_move') {
            return (
              <ClusterRow
                suggestion={suggestion}
                isSelected={isSelected}
                toggle={toggle}
                snapshot={snapshot}
                expanded={expandedCluster.has(suggestion.id)}
                onToggleExpand={() =>
                  setExpandedCluster((prev) => {
                    const next = new Set(prev)
                    next.has(suggestion.id) ? next.delete(suggestion.id) : next.add(suggestion.id)
                    return next
                  })
                }
                onApply={() => handleApplyWithUndo([suggestion.id])}
                onIgnore={() => handleIgnore([suggestion.id])}
                applying={applying}
              />
            )
          }
          return (
            <MoveRow
              suggestion={suggestion}
              isSelected={isSelected}
              toggle={toggle}
              snapshot={snapshot}
              altOpen={expandedAlt.has(suggestion.id)}
              onToggleAlt={() =>
                setExpandedAlt((prev) => {
                  const next = new Set(prev)
                  next.has(suggestion.id) ? next.delete(suggestion.id) : next.add(suggestion.id)
                  return next
                })
              }
              onApply={() => handleApplyWithUndo([suggestion.id])}
              onIgnore={() => handleIgnore([suggestion.id])}
              applying={applying}
            />
          )
        }}
        footerBar={({ selectedCount, clear, selectedIds }) => (
          <div className="px-3 py-2 flex items-center justify-between gap-2">
            <span className="text-xs text-[var(--fw-text-muted)] font-medium">
              {t('common.selected', { count: selectedCount })}
            </span>
            <div className="flex gap-1.5">
              <Button variant="ghost" size="sm" onClick={() => handleIgnore(selectedIds)} className="gap-1">
                <EyeOff className="h-3 w-3" />
                {t('common.ignore')}
              </Button>
              <Button variant="ghost" size="sm" onClick={clear}>
                {t('common.clear')}
              </Button>
              <Button
                size="sm"
                onClick={() => setConfirmApply(selectedIds)}
                disabled={applying}
                className="gap-1"
              >
                <CheckCircle2 className="h-3 w-3" />
                {t('organize.applyN', { count: selectedCount })}
              </Button>
            </div>
          </div>
        )}
      />
    )
  })()

  return (
    <div className="flex flex-col h-full">
      {scopeChip}
      {listBody}

      <ConfirmDialog
        open={!!confirmApply}
        onOpenChange={(o) => !o && setConfirmApply(null)}
        title={t('organize.confirmApply', { count: confirmApply?.length ?? 0 })}
        description={t('organize.confirmApplyDesc')}
        preview={
          confirmApply && (
            <OrganizePreview
              suggestions={confirmApply
                .map((id) => allSuggestions.find((s) => s.id === id))
                .filter((s): s is OrganizeSuggestion => !!s)}
              snapshot={snapshot}
            />
          )
        }
        confirmLabel={t('common.apply')}
        ConfirmIcon={CheckCircle2}
        tone="accent"
        onConfirm={async () => {
          const ids = confirmApply ?? []
          setConfirmApply(null)
          setApplying(true)
          try {
            handleApplyWithUndo(ids)
          } finally {
            setApplying(false)
          }
        }}
      />

      <FolderPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title={t('organize.tidySpecificFolder')}
        description={t('organize.empty.noCluster')}
        value={scopeFolderId ? [scopeFolderId] : []}
        onChange={handleScopeChange}
        valueKey="id"
        multiple={false}
        confirmLabel={t('organize.analyze')}
        folders={folders}
        sortByMessiness
      />
    </div>
  )
}

/* ---------- Row: regular move suggestion ---------- */

function MoveRow({
  suggestion,
  isSelected,
  toggle,
  snapshot,
  altOpen,
  onToggleAlt,
  onApply,
  onIgnore,
  applying,
}: {
  suggestion: OrganizeSuggestion
  isSelected: boolean
  toggle: () => void
  snapshot: Record<string, { title?: string; url?: string; folderPath?: string[] }>
  altOpen: boolean
  onToggleAlt: () => void
  onApply: () => void
  onIgnore: () => void
  applying: boolean
}) {
  const { t } = useT()
  const bm = snapshot[suggestion.bookmarkId]
  const title = bm?.title || bm?.url || suggestion.bookmarkId
  const tierKey = tier(suggestion.confidence)
  const meta = TIER_META[tierKey]
  const hasAlternatives = (suggestion.alternatives?.length ?? 0) > 0

  return (
    <div
      className={cn(
        'fw-row-enter p-3 flex items-start gap-2.5 transition-colors',
        isSelected
          ? 'bg-[var(--fw-accent-soft)]'
          : 'hover:bg-[var(--fw-bg-subtle)]',
      )}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={toggle}
        aria-label={t('organize.selectSuggestionAria', { title })}
        className="mt-0.5 flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-semibold truncate flex-1">{title}</p>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Badge variant={meta.badge}>
                  {Math.round(suggestion.confidence * 100)}%
                </Badge>
              </span>
            </TooltipTrigger>
            <TooltipContent side="left">
              <strong>{t(meta.labelKey)}.</strong> {t(meta.hintKey)}
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="mt-2 space-y-0.5 text-[11px]">
          <div className="flex items-center gap-1 text-[var(--fw-text-subtle)]">
            <span className="opacity-60 flex-shrink-0">{t('lib.from')}</span>
            <span className="truncate" title={formatFolderPath(suggestion.currentPath) || t('common.rootFolder')}>
              {formatFolderPath(suggestion.currentPath) || t('common.rootFolder')}
            </span>
          </div>
          <div className={cn('flex items-center gap-1', status.info.text)}>
            <ArrowRight className={cn('h-3 w-3 flex-shrink-0', status.info.icon)} />
            <span className="font-semibold truncate" title={formatFolderPath(suggestion.suggestedPath)}>
              {formatFolderPath(suggestion.suggestedPath)}
            </span>
          </div>
        </div>

        {suggestion.reason && (
          <p className="flex items-start gap-1 text-[11px] text-[var(--fw-text-muted)] mt-1.5 leading-snug">
            <Lightbulb className="h-3 w-3 flex-shrink-0 mt-0.5 text-[var(--fw-accent)]" />
            <span>{suggestion.reason}</span>
          </p>
        )}

        {hasAlternatives && (
          <button
            onClick={onToggleAlt}
            className="mt-1.5 flex items-center gap-1 text-[11px] text-[var(--fw-text-muted)] hover:text-[var(--fw-text)]"
            aria-expanded={altOpen}
          >
            {altOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {altOpen ? t('common.hideAlternatives') : t('common.altFoldersMatch', { count: suggestion.alternatives!.length })}
          </button>
        )}

        {altOpen && suggestion.alternatives && (
          <div className="mt-1.5 space-y-1">
            {suggestion.alternatives.map((alt, i) => (
              <div
                key={i}
                className="rounded-[var(--fw-radius-sm)] border border-[var(--fw-border)] bg-[var(--fw-surface-2)] px-2 py-1.5 flex items-center gap-2"
              >
                <FolderOpen className="h-3 w-3 text-[var(--fw-text-subtle)] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium truncate">
                    {formatFolderPath(alt.suggestedPath)}
                  </p>
                  <p className="text-[10.5px] text-[var(--fw-text-subtle)] truncate">
                    {alt.reason}
                  </p>
                </div>
                <Badge variant={TIER_META[tier(alt.confidence)].badge}>
                  {Math.round(alt.confidence * 100)}%
                </Badge>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-1.5 mt-2.5">
          <Button size="sm" onClick={onApply} disabled={applying} className="gap-1 h-6 px-2">
            <CheckCircle2 className="h-3 w-3" />
            {t('common.apply')}
          </Button>
          <Button variant="ghost" size="sm" onClick={onIgnore} className="gap-1 h-6 px-2">
            <EyeOff className="h-3 w-3" />
            {t('common.ignore')}
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ---------- Row: create-and-move cluster ---------- */

function ClusterRow({
  suggestion,
  isSelected,
  toggle,
  snapshot,
  expanded,
  onToggleExpand,
  onApply,
  onIgnore,
  applying,
}: {
  suggestion: OrganizeSuggestion
  isSelected: boolean
  toggle: () => void
  snapshot: Record<string, { title?: string; url?: string; folderPath?: string[] }>
  expanded: boolean
  onToggleExpand: () => void
  onApply: () => void
  onIgnore: () => void
  applying: boolean
}) {
  const { t } = useT()
  const members = suggestion.memberIds ?? [suggestion.bookmarkId]
  const tierKey = tier(suggestion.confidence)
  const meta = TIER_META[tierKey]

  return (
    <div
      className={cn(
        'fw-row-enter p-3 transition-colors',
        isSelected
          ? 'bg-[var(--fw-accent-soft)]'
          : 'hover:bg-[var(--fw-bg-subtle)]',
      )}
    >
      <div className="flex items-start gap-2.5">
        <Checkbox
          checked={isSelected}
          onCheckedChange={toggle}
          aria-label={t('organize.selectClusterAria', { name: suggestion.newFolderName ?? '' })}
          className="mt-0.5 flex-shrink-0"
        />
        <IconBox Icon={FolderPlus} tone="accent" size="md" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                <p className="text-xs font-semibold truncate">
                  {t('organize.createFolder', { name: suggestion.newFolderName ?? '' })}
                </p>
                <Badge variant="primary" className="flex-shrink-0">
                  {members.length}
                </Badge>
              </div>
              <p className="text-[11px] text-[var(--fw-text-subtle)] mt-0.5 truncate" title={formatFolderPath(suggestion.currentPath)}>
                {t('organize.insideFolder', { folder: formatFolderPath(suggestion.currentPath) || t('common.rootFolder') })}
              </p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Badge variant={meta.badge}>
                    {Math.round(suggestion.confidence * 100)}%
                  </Badge>
                </span>
              </TooltipTrigger>
              <TooltipContent side="left">
                <strong>{t(meta.labelKey)}.</strong> {t(meta.hintKey)}
              </TooltipContent>
            </Tooltip>
          </div>

          {suggestion.reason && (
            <p className="flex items-start gap-1 text-[11px] text-[var(--fw-text-muted)] mt-1.5 leading-snug">
              <Lightbulb className="h-3 w-3 flex-shrink-0 mt-0.5 text-[var(--fw-accent)]" />
              <span>{suggestion.reason}</span>
            </p>
          )}

          <button
            onClick={onToggleExpand}
            className="mt-1.5 flex items-center gap-1 text-[11px] text-[var(--fw-text-muted)] hover:text-[var(--fw-text)]"
            aria-expanded={expanded}
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {expanded ? t('common.hideBookmarks') : (members.length !== 1 ? t('common.showBookmarks.plural', { count: members.length }) : t('common.showBookmarks', { count: members.length }))}
          </button>

          {expanded && (
            <div className="mt-1.5 rounded-[var(--fw-radius-md)] border border-[var(--fw-border)] bg-[var(--fw-surface-2)] divide-y divide-[var(--fw-border)] max-h-[200px] overflow-y-auto">
              {members.slice(0, 20).map((id) => {
                const bm = snapshot[id]
                let domain = ''
                try {
                  if (bm?.url) domain = new URL(bm.url).hostname.replace(/^www\./, '')
                } catch { /* noop */ }
                return (
                  <div key={id} className="px-2 py-1.5 text-[11px]">
                    <p className="font-medium truncate">
                      {bm?.title || bm?.url || id}
                    </p>
                    {domain && (
                      <p className="text-[10.5px] text-[var(--fw-text-subtle)] mt-0.5">
                        {domain}
                      </p>
                    )}
                  </div>
                )
              })}
              {members.length > 20 && (
                <p className="px-2 py-1.5 text-[10.5px] text-[var(--fw-text-subtle)] italic">
                  {t('common.nMore', { count: members.length - 20 })}
                </p>
              )}
            </div>
          )}

          <div className="flex gap-1.5 mt-2.5">
            <Button size="sm" onClick={onApply} disabled={applying} className="gap-1 h-6 px-2">
              <FolderPlus className="h-3 w-3" />
              {t('organize.createAndMove')}
            </Button>
            <Button variant="ghost" size="sm" onClick={onIgnore} className="gap-1 h-6 px-2">
              <EyeOff className="h-3 w-3" />
              {t('common.ignore')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------- Preview used in bulk confirm ---------- */

function OrganizePreview({
  suggestions,
  snapshot,
}: {
  suggestions: OrganizeSuggestion[]
  snapshot: Record<string, { title?: string; url?: string; folderPath?: string[] }>
}) {
  const { t } = useT()
  const groups = useMemo(() => {
    const m = new Map<string, { path: string[]; kind: OrganizeSuggestion['kind']; folderName?: string; items: OrganizeSuggestion[] }>()
    for (const s of suggestions) {
      const key = s.kind === 'create_and_move'
        ? `new:${s.targetFolderId}:${s.newFolderName}`
        : `mv:${s.targetFolderId}`
      const entry = m.get(key) ?? {
        path: s.suggestedPath,
        kind: s.kind,
        folderName: s.newFolderName,
        items: [],
      }
      entry.items.push(s)
      m.set(key, entry)
    }
    return Array.from(m.values()).sort((a, b) => b.items.length - a.items.length)
  }, [suggestions])

  return (
    <div className="space-y-1.5 max-h-[240px] overflow-y-auto rounded-[var(--fw-radius-md)] border border-[var(--fw-border)] bg-[var(--fw-surface-2)] p-2">
      {groups.map((g, i) => {
        const totalMembers = g.items.reduce(
          (acc, s) => acc + (s.memberIds?.length ?? 1),
          0,
        )
        return (
          <div key={i} className="space-y-0.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold">
              <IconBox
                Icon={g.kind === 'create_and_move' ? FolderPlus : Folder}
                tone={g.kind === 'create_and_move' ? 'accent' : 'info'}
                size="sm"
              />
              <span className="truncate flex-1">
                {g.kind === 'create_and_move' ? t('organize.newFolderPrefix') : ''}
                {formatFolderPath(g.path)}
              </span>
              <Badge variant={g.kind === 'create_and_move' ? 'primary' : 'info'}>
                {totalMembers}
              </Badge>
            </div>
            <div className="pl-7 space-y-0.5">
              {g.items.slice(0, 3).flatMap((s, j) =>
                (s.memberIds ?? [s.bookmarkId]).slice(0, 2).map((id, k) => {
                  const bm = snapshot[id]
                  return (
                    <p
                      key={`${j}-${k}`}
                      className="text-[11px] truncate text-[var(--fw-text-muted)]"
                    >
                      · {bm?.title || bm?.url || id}
                    </p>
                  )
                }),
              )}
              {totalMembers > 6 && (
                <p className="text-[10.5px] text-[var(--fw-text-subtle)] italic">
                  {t('common.nMore', { count: totalMembers - 6 })}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
