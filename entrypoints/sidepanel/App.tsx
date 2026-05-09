import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  LayoutDashboard,
  Link2Off,
  Copy,
  FolderOpen,
  Sparkles,
  FolderX,
  Settings2,
  RefreshCw,
  Square,
  Play,
  BarChart3,
  Download,
  Eye,
  Keyboard,
  FolderTree,
  Replace,
} from 'lucide-react'
import brandIconUrl from '~/assets/icon.svg'
import { Toaster, toast } from 'sonner'
import type { LucideIcon } from 'lucide-react'
import type { ScanResult } from '~/shared/types'
import { ErrorBoundary } from '~/shared/components/ErrorBoundary'
import { Button } from '~/shared/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/shared/components/ui/tooltip'
import { StatusBar } from '~/shared/components/patterns/StatusBar'
import { OnboardingDialog } from '~/shared/components/patterns/OnboardingDialog'
import { CommandPalette, type CommandAction } from '~/shared/components/patterns/CommandPalette'
import { HelpDialog } from '~/shared/components/patterns/HelpDialog'
import { FindReplaceDialog } from '~/shared/components/patterns/FindReplaceDialog'
import { useT, setLocalePref } from '~/shared/lib/i18n'
import { cn } from '~/shared/lib/utils'
import { send, onBroadcast } from '~/shared/lib/messaging'
import { ERROR_CODES } from '~/shared/types/messages'
import {
  hasDeadLinkHostPermission,
  requestDeadLinkHostPermission,
} from '~/shared/lib/webext'
import Dashboard from './views/Dashboard'
import DeadLinks from './views/DeadLinks'
import Duplicates from './views/Duplicates'
import Organize from './views/Organize'
import Rediscover from './views/Rediscover'
import EmptyFolders from './views/EmptyFolders'
import Insights from './views/Insights'
import Library from './views/Library'
import Settings from './views/Settings'

export type View =
  | 'dashboard'
  | 'dead-links'
  | 'duplicates'
  | 'organize'
  | 'rediscover'
  | 'empty-folders'
  | 'insights'
  | 'library'
  | 'settings'

export interface ViewProps {
  scanResult: ScanResult | null
  isScanning: boolean
  isCheckingDeadLinks: boolean
  scanVersion: number
  startScan: () => void
  startDeadLinksCheck: (options?: { forceFull?: boolean }) => void
  stopDeadLinksCheck: () => void
  setActiveView: (view: View) => void
  refreshScanResult: () => Promise<void>
}

interface NavItem {
  id: View
  labelKey: string
  shortKey: string
  Icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard',     labelKey: 'nav.dashboard',    shortKey: 'nav.short.dashboard',    Icon: LayoutDashboard },
  { id: 'library',       labelKey: 'nav.library',      shortKey: 'nav.short.library',      Icon: FolderTree },
  { id: 'dead-links',    labelKey: 'nav.deadLinks',    shortKey: 'nav.short.deadLinks',    Icon: Link2Off },
  { id: 'duplicates',    labelKey: 'nav.duplicates',   shortKey: 'nav.short.duplicates',   Icon: Copy },
  { id: 'organize',      labelKey: 'nav.organize',     shortKey: 'nav.short.organize',     Icon: FolderOpen },
  { id: 'rediscover',    labelKey: 'nav.rediscover',   shortKey: 'nav.short.rediscover',   Icon: Sparkles },
  { id: 'empty-folders', labelKey: 'nav.emptyFolders', shortKey: 'nav.short.emptyFolders', Icon: FolderX },
  { id: 'insights',      labelKey: 'nav.insights',     shortKey: 'nav.short.insights',     Icon: BarChart3 },
  { id: 'settings',      labelKey: 'nav.settings',     shortKey: 'nav.short.settings',     Icon: Settings2 },
]

function NavBadge({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--fw-danger)] px-1 text-[10px] font-semibold leading-none text-white tabular-nums ring-2 ring-[var(--fw-surface)]">
      {count > 99 ? '99+' : count}
    </span>
  )
}

export default function App() {
  const { t } = useT()
  useSystemThemeListener()
  const [activeView, setActiveView] = useState<View>('dashboard')
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [scanVersion, setScanVersion] = useState(0)
  const [isScanning, setIsScanning] = useState(false)
  const [isCheckingDeadLinks, setIsCheckingDeadLinks] = useState(false)
  const [scanProgress, setScanProgress] = useState('')
  const [deadLinkProgress, setDeadLinkProgress] = useState<{
    processed: number
    total: number
  } | null>(null)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [findReplaceOpen, setFindReplaceOpen] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  const scrollPositions = useRef<Partial<Record<View, number>>>({})

  const commitScan = useCallback((scan: ScanResult | null) => {
    setScanResult(scan)
    setScanVersion((v) => v + 1)
  }, [])
  const activeViewRef = useRef<View>('dashboard')

  // Preserve main scroll position across view switches
  const handleViewChange = useCallback((view: View) => {
    if (mainRef.current) {
      scrollPositions.current[activeViewRef.current] = mainRef.current.scrollTop
    }
    activeViewRef.current = view
    setActiveView(view)
    requestAnimationFrame(() => {
      const saved = scrollPositions.current[view] ?? 0
      if (mainRef.current) {
        mainRef.current.scrollTop = saved
      }
    })
  }, [])
  useEffect(() => {
    send('scan.latest.get').then((res) => {
      if (res.ok) commitScan(res.data)
    })
    send('scan.status.get').then((res) => {
      if (res.ok) {
        if (res.data.isScanning) {
          setIsScanning(true)
          setScanProgress(t('app.syncing'))
        }
        if (res.data.isCheckingDeadLinks) setIsCheckingDeadLinks(true)
      }
    })
    send('onboarding.seen.get').then((res) => {
      if (res.ok && !res.data.seen) setOnboardingOpen(true)
    })

    // Apply theme + locale preferences (sync'd across devices)
    send('settings.get').then((res) => {
      if (!res.ok) return
      applyTheme(res.data.theme ?? 'system')
      setLocalePref(res.data.locale ?? 'auto')
    })

    // Honor omnibox-requested view (from `fave :view` handoff)
    chrome.storage.local
      .get('favewise:pendingView')
      .then(async (result) => {
        const entry = result['favewise:pendingView'] as
          | { view: string; at: number }
          | undefined
        if (!entry) return
        // Only honor if fresh (<15s). Prevents stale intents surviving
        // across panel-close / panel-reopen cycles.
        if (Date.now() - entry.at > 15_000) {
          await chrome.storage.local.remove('favewise:pendingView')
          return
        }
        const validViews: View[] = [
          'dashboard', 'dead-links', 'duplicates',
          'organize', 'rediscover', 'empty-folders',
          'insights', 'library', 'settings',
        ]
        if (validViews.includes(entry.view as View)) {
          setActiveView(entry.view as View)
        }
        await chrome.storage.local.remove('favewise:pendingView')
      })
      .catch(() => {})
  }, [commitScan])

  const finishOnboarding = useCallback(async () => {
    setOnboardingOpen(false)
    await send('onboarding.seen.set')
  }, [])

  // Global ⌘K / Ctrl+K opens the command palette; ? opens help
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
        return
      }
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tgt = e.target as HTMLElement | null
        if (tgt && tgt.matches('input, textarea, [contenteditable]')) return
        e.preventDefault()
        setHelpOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const unsubscribe = onBroadcast((event) => {
      switch (event.type) {
        case 'scan.progress':
          setIsScanning(true)
          setScanProgress(t('app.syncing'))
          break
        case 'deadLinks.progress': {
          const { status, processed, total } = event.payload
          setIsCheckingDeadLinks(status === 'checking')
          setDeadLinkProgress(
            status === 'checking' ? { processed, total } : null,
          )
          break
        }
        case 'scan.completed':
          setIsScanning(false)
          setIsCheckingDeadLinks(false)
          setScanProgress('')
          setDeadLinkProgress(null)
          commitScan(event.payload)
          break
        case 'scan.failed':
          setIsScanning(false)
          setIsCheckingDeadLinks(false)
          setScanProgress('')
          setDeadLinkProgress(null)
          send('scan.latest.get').then((r) => r.ok && commitScan(r.data))
          break
      }
    })
    return unsubscribe
  }, [commitScan])

  const startScan = useCallback(async () => {
    if (isScanning) return
    setIsScanning(true)
    setScanProgress(t('app.syncing'))
    const res = await send('scan.start', { force: true })
    if (!res.ok) {
      setIsScanning(false)
      setScanProgress('')
    }
  }, [isScanning])

  const startDeadLinksCheck = useCallback(
    async (options: { forceFull?: boolean } = {}) => {
      if (isCheckingDeadLinks || isScanning) return
      const stats = await send('deadLinks.checkableCount')
      if (stats.ok && stats.data.checkableCount === 0) {
        await send('deadLinks.start', options)
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
      setIsCheckingDeadLinks(true)
      setDeadLinkProgress(null)
      const res = await send('deadLinks.start', options)
      if (!res.ok) {
        setIsCheckingDeadLinks(false)
        setDeadLinkProgress(null)
        if (res.error.code === ERROR_CODES.PERMISSION_MISSING) {
          setScanProgress('')
          toast.error(t('deadlinks.permissionRequired'))
        }
      }
    },
    [isCheckingDeadLinks, isScanning],
  )

  const stopDeadLinksCheck = useCallback(async () => {
    await send('deadLinks.stop')
    setIsCheckingDeadLinks(false)
    setDeadLinkProgress(null)
  }, [])

  const refreshScanResult = useCallback(async () => {
    const res = await send('scan.latest.get')
    if (res.ok) commitScan(res.data)
  }, [commitScan])

  const sharedProps: ViewProps = useMemo(
    () => ({
      scanResult,
      isScanning,
      isCheckingDeadLinks,
      scanVersion,
      startScan,
      startDeadLinksCheck,
      stopDeadLinksCheck,
      setActiveView,
      refreshScanResult,
    }),
    [
      scanResult,
      isScanning,
      isCheckingDeadLinks,
      scanVersion,
      startScan,
      startDeadLinksCheck,
      stopDeadLinksCheck,
      refreshScanResult,
    ],
  )

  const navCounts: Partial<Record<View, number>> = {
    'dead-links':    scanResult?.deadLinks?.length ?? 0,
    duplicates:      scanResult?.duplicateGroups?.length ?? 0,
    organize:        scanResult?.organizeSuggestions?.length ?? 0,
    rediscover:      scanResult?.rediscoverItems?.length ?? 0,
    'empty-folders': scanResult?.emptyFolders?.length ?? 0,
  }

  const deadLinkState = scanResult?.deadLinkState

  // Header CTA depends on context
  const headerButton = (() => {
    if (activeView === 'dead-links') {
      if (isCheckingDeadLinks)
        return {
          label: t('app.stop'),
          Icon: Square,
          onClick: stopDeadLinksCheck,
          disabled: false,
          variant: 'outline' as const,
        }
      if (deadLinkState?.status === 'paused')
        return {
          label: t('app.resume'),
          Icon: Play,
          onClick: () => startDeadLinksCheck(),
          disabled: isScanning,
          variant: 'default' as const,
        }
      return {
        label: t('app.checkLinks'),
        Icon: RefreshCw,
        onClick: () => startDeadLinksCheck(),
        disabled: isScanning,
        variant: 'default' as const,
      }
    }
    return {
      label: isScanning ? t('app.syncing') : t('app.sync'),
      Icon: RefreshCw,
      onClick: startScan,
      disabled: isScanning,
      variant: isScanning ? ('outline' as const) : ('default' as const),
    }
  })()

  const dlPercent =
    deadLinkProgress && deadLinkProgress.total > 0
      ? Math.round((deadLinkProgress.processed / deadLinkProgress.total) * 100)
      : 0

  const viewOwnsScroll = activeView !== 'dashboard' && activeView !== 'insights'

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex flex-col h-screen bg-[var(--fw-bg)] text-[var(--fw-text)]">
        {/* Header */}
        <header className="flex items-center justify-between px-3 py-2.5 bg-[var(--fw-surface)] border-b border-[var(--fw-border)] flex-shrink-0">
          <div className="flex items-center gap-2">
            <img
              src={brandIconUrl}
              alt=""
              aria-hidden="true"
              className="w-6 h-6 rounded-[var(--fw-radius-md)] shadow-[var(--fw-shadow-sm)]"
            />
            <span className="text-sm font-bold tracking-tight">
              {t('app.name')}<sup className="text-[8px] font-medium text-[var(--fw-text-subtle)] ml-[1px]">™</sup>
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setHelpOpen(true)}
                  aria-label={t('app.help')}
                  className="h-7 w-7 rounded-[var(--fw-radius-md)] text-[var(--fw-text-subtle)] hover:text-[var(--fw-text)] hover:bg-[var(--fw-bg-subtle)] flex items-center justify-center transition-colors"
                >
                  <Keyboard className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t('app.help')}
                <span className="ml-1 opacity-70">?</span>
              </TooltipContent>
            </Tooltip>
            <Button
              variant={headerButton.variant}
              size="sm"
              onClick={headerButton.onClick}
              disabled={headerButton.disabled}
              aria-label={headerButton.label}
              className={cn(
                'gap-1.5 h-7 px-2.5',
                isScanning && activeView !== 'dead-links' && '[&_svg]:animate-spin',
              )}
            >
              <headerButton.Icon className="h-3 w-3" />
              {headerButton.label}
            </Button>
          </div>
        </header>

        {/* Independent status band — only one rendered at a time */}
        {isCheckingDeadLinks ? (
          <StatusBar
            tone="info"
            live
            label={t('app.checkLinks')}
            progress={deadLinkProgress ? dlPercent : null}
            progressLabel={
              deadLinkProgress
                ? `${deadLinkProgress.processed}/${deadLinkProgress.total}`
                : undefined
            }
          />
        ) : isScanning ? (
          <StatusBar tone="accent" live label={scanProgress || t('app.syncing')} progress={null} />
        ) : deadLinkState?.status === 'paused' && activeView !== 'dead-links' ? (
          <StatusBar
            tone="warning"
            label={t('deadlinks.pausedAt', { processed: deadLinkState.processed, total: deadLinkState.total })}
            trailing={
              <button
                onClick={() => setActiveView('dead-links')}
                className="text-xs font-medium underline-offset-2 hover:underline"
              >
                {t('common.resume')}
              </button>
            }
          />
        ) : null}

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar nav */}
          <nav
            className="w-[72px] flex flex-col items-stretch py-2 gap-1 bg-[var(--fw-surface)] border-r border-[var(--fw-border)] flex-shrink-0"
            aria-label={t('app.primaryNav')}
          >
            {NAV_ITEMS.map(({ id, labelKey, shortKey, Icon }) => {
              const active = activeView === id
              const count = navCounts[id] ?? 0
              const label = t(labelKey)
              const short = t(shortKey)
              return (
                <Tooltip key={id}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => handleViewChange(id)}
                      aria-label={label}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'relative mx-1.5 min-h-[54px] px-1 py-1.5 flex flex-col items-center justify-center gap-1 rounded-[var(--fw-radius-md)] overflow-hidden transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklch,var(--fw-accent)_55%,transparent)]',
                        active
                          ? 'bg-[var(--fw-accent-soft)] text-[var(--fw-accent-text)]'
                          : 'text-[var(--fw-text-subtle)] hover:bg-[var(--fw-bg-subtle)] hover:text-[var(--fw-text)]',
                      )}
                    >
                      <div className="relative">
                        <Icon className="h-4 w-4" />
                        <NavBadge count={count} />
                      </div>
                      <span className="w-full min-w-0 text-center text-[9px] font-semibold tracking-tight leading-none truncate">
                        {short}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {label}
                    {count ? ` · ${count}` : ''}
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </nav>

          {/* Main content */}
          <main
            ref={mainRef}
            className={cn(
              'flex-1 min-h-0 bg-[var(--fw-bg)]',
              viewOwnsScroll ? 'overflow-hidden' : 'overflow-y-auto',
            )}
          >
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-1.5 focus:rounded focus:bg-[var(--fw-accent)] focus:text-[var(--fw-accent-fg)] focus:text-xs focus:font-semibold"
            >
              Skip to content
            </a>
            <div
              id="main-content"
              className={cn(viewOwnsScroll && 'h-full min-h-0')}
            >
            <ErrorBoundary key={activeView} className={viewOwnsScroll ? 'h-full min-h-0' : undefined}>
              {activeView === 'dashboard' && <Dashboard {...sharedProps} />}
              {activeView === 'dead-links' && <DeadLinks {...sharedProps} />}
              {activeView === 'duplicates' && <Duplicates {...sharedProps} />}
              {activeView === 'organize' && <Organize {...sharedProps} />}
              {activeView === 'rediscover' && <Rediscover {...sharedProps} />}
              {activeView === 'empty-folders' && <EmptyFolders {...sharedProps} />}
              {activeView === 'insights' && <Insights {...sharedProps} />}
              {activeView === 'library' && <Library {...sharedProps} />}
              {activeView === 'settings' && <Settings />}
            </ErrorBoundary>
            </div>
          </main>
        </div>
      </div>

      <Toaster
        position="bottom-center"
        theme="system"
        richColors
        closeButton
        toastOptions={{
          style: {
            fontSize: '12px',
            background: 'var(--fw-surface)',
            color: 'var(--fw-text)',
            border: '1px solid var(--fw-border)',
            borderRadius: 'var(--fw-radius-lg)',
            boxShadow: 'var(--fw-shadow-md)',
          },
        }}
      />

      <OnboardingDialog open={onboardingOpen} onFinish={finishOnboarding} />
      <FindReplaceDialog open={findReplaceOpen} onOpenChange={setFindReplaceOpen} />

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        commands={buildCommands({
          setActiveView,
          startScan,
          startDeadLinksCheck,
          stopDeadLinksCheck,
          isCheckingDeadLinks,
          openHelp: () => setHelpOpen(true),
          openFindReplace: () => setFindReplaceOpen(true),
          t,
        })}
      />

      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </TooltipProvider>
  )
}

function applyTheme(theme: 'system' | 'light' | 'dark') {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}

function useSystemThemeListener() {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      if (!document.documentElement.hasAttribute('data-theme')) {
        document.documentElement.removeAttribute('data-theme')
      }
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
}

function buildCommands(args: {
  setActiveView: (v: View) => void
  startScan: () => void
  startDeadLinksCheck: (opts?: { forceFull?: boolean }) => void
  stopDeadLinksCheck: () => void
  isCheckingDeadLinks: boolean
  openHelp: () => void
  openFindReplace: () => void
  t: (key: string, a?: Record<string, string | number>) => string
}): CommandAction[] {
  const { t } = args
  const goto = (view: View) => () => args.setActiveView(view)
  const navigate: CommandAction[] = [
    { id: 'go-dashboard',     group: t('cmd.group.goto'), label: t('nav.dashboard'),     Icon: LayoutDashboard, onRun: goto('dashboard') },
    { id: 'go-dead',          group: t('cmd.group.goto'), label: t('nav.deadLinks'),      Icon: Link2Off,        onRun: goto('dead-links') },
    { id: 'go-dup',           group: t('cmd.group.goto'), label: t('nav.duplicates'),     Icon: Copy,            onRun: goto('duplicates') },
    { id: 'go-organize',      group: t('cmd.group.goto'), label: t('nav.organize'),       Icon: FolderOpen,      onRun: goto('organize') },
    { id: 'go-rediscover',    group: t('cmd.group.goto'), label: t('nav.rediscover'),     Icon: Sparkles,        onRun: goto('rediscover') },
    { id: 'go-empty',         group: t('cmd.group.goto'), label: t('nav.emptyFolders'),   Icon: FolderX,         onRun: goto('empty-folders') },
    { id: 'go-insights',      group: t('cmd.group.goto'), label: t('nav.insights'),       Icon: BarChart3,       onRun: goto('insights') },
    { id: 'go-settings',      group: t('cmd.group.goto'), label: t('nav.settings'),       Icon: Settings2,       onRun: goto('settings') },
  ]
  const actions: CommandAction[] = [
    { id: 'act-sync',  group: t('cmd.group.actions'), label: t('common.syncBookmarks'),   Icon: RefreshCw, hint: t('cmd.act.freshScan'),        onRun: args.startScan },
    args.isCheckingDeadLinks
      ? { id: 'act-stop-dead', group: t('cmd.group.actions'), label: t('cmd.act.stopDeadCheck'), Icon: Square, onRun: args.stopDeadLinksCheck }
      : { id: 'act-check-dead', group: t('cmd.group.actions'), label: t('cmd.act.checkDeadLinks'), Icon: Link2Off, onRun: () => args.startDeadLinksCheck() },
    { id: 'act-find-replace', group: t('cmd.group.actions'), label: t('findReplace.title'), Icon: Replace, hint: t('cmd.act.batchUpdate'), onRun: args.openFindReplace },
    { id: 'act-recheck-all', group: t('cmd.group.actions'), label: t('cmd.act.fullRecheck'), Icon: Eye, onRun: () => args.startDeadLinksCheck({ forceFull: true }) },
    { id: 'act-export', group: t('cmd.group.actions'), label: t('cmd.act.exportBackup'),      Icon: Download, hint: t('cmd.act.goSettingsBackup'), onRun: goto('settings') },
    { id: 'act-help',   group: t('cmd.group.actions'), label: t('help.title'), Icon: Keyboard, shortcut: '?', onRun: args.openHelp },
  ]
  return [...navigate, ...actions]
}
