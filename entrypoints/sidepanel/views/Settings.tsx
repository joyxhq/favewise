import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import {
  Settings2,
  Trash2,
  History,
  RotateCcw,
  Info,
  FolderOpen,
  FolderClosed,
  X,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Shield,
  Download,
  Upload,
  ClipboardCopy,
  Share2,
} from 'lucide-react'
import { toast } from 'sonner'
import type {
  UserSettings,
  TrashEntry,
  OperationLogEntry,
} from '~/shared/types'
import type { FolderSummary } from '~/shared/types/messages'
import { formatFolderPath } from '~/shared/utils/bookmark-tree'
import { Button } from '~/shared/components/ui/button'
import { Badge } from '~/shared/components/ui/badge'
import { Input } from '~/shared/components/ui/input'
import { Label } from '~/shared/components/ui/label'
import { Switch } from '~/shared/components/ui/switch'
import { Separator } from '~/shared/components/ui/separator'
import { Tabs, TabsList, TabsTrigger } from '~/shared/components/ui/tabs'
import { EmptyState } from '~/shared/components/patterns/EmptyState'
import { ConfirmDialog } from '~/shared/components/patterns/ConfirmDialog'
import { FolderPickerDialog } from '~/shared/components/patterns/FolderPickerDialog'
import { Favicon } from '~/shared/components/patterns/Favicon'
import { SectionHeading } from '~/shared/components/patterns/SectionHeading'
import { cn } from '~/shared/lib/utils'
import { status } from '~/shared/lib/tokens'
import { send } from '~/shared/lib/messaging'
import { setLocalePref, useT } from '~/shared/lib/i18n'

type Tab = 'general' | 'trash' | 'log'

const ACTION_LABEL_KEYS: Record<OperationLogEntry['actionType'], string> = {
  trash:   'dash.action.trash',
  delete:  'dash.action.delete',
  restore: 'dash.action.restore',
  move:    'dash.action.move',
  ignore:  'dash.action.ignore',
}

const ACTION_BADGE: Record<
  OperationLogEntry['actionType'],
  React.ComponentProps<typeof Badge>['variant']
> = {
  trash: 'warning',
  delete: 'destructive',
  restore: 'success',
  move: 'info',
  ignore: 'primary',
}

const LOG_PAGE_SIZE = 30

export default function Settings() {
  const { t } = useT()
  const [tab, setTab] = useState<Tab>('general')
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [trashItems, setTrashItems] = useState<TrashEntry[] | null>(null)
  const [opLog, setOpLog] = useState<OperationLogEntry[] | null>(null)
  const [logPage, setLogPage] = useState(0)
  const [confirmEmptyTrash, setConfirmEmptyTrash] = useState(false)
  const [folders, setFolders] = useState<FolderSummary[]>([])
  const [folderPickerOpen, setFolderPickerOpen] = useState(false)
  const [protectedPickerOpen, setProtectedPickerOpen] = useState(false)
  const [backupBusy, setBackupBusy] = useState(false)
  const [confirmImport, setConfirmImport] = useState<string | null>(null)
  const [diagnostics, setDiagnostics] = useState<{ report: string } | null>(null)
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false)
  const [sharePickerOpen, setSharePickerOpen] = useState(false)
  const [shareFolderId, setShareFolderId] = useState<string | null>(null)
  const [shareFormat, setShareFormat] = useState<'html' | 'md' | 'json'>('html')
  const [shareBusy, setShareBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [ignoredDeadLinksCount, setIgnoredDeadLinksCount] = useState<number | null>(null)
  const [ignoredSuggestionsCount, setIgnoredSuggestionsCount] = useState<number | null>(null)
  const [timeoutInput, setTimeoutInput] = useState('')
  const [concurrentInput, setConcurrentInput] = useState('')

  /* ---------- Data ---------- */

  const loadSettings = useCallback(async () => {
    const res = await send('settings.get')
    if (!res.ok) return
    setSettings(res.data)
    setTimeoutInput(String(res.data.scanTimeoutMs))
    setConcurrentInput(String(res.data.maxConcurrentChecks))
  }, [])

  const loadIgnoredCounts = useCallback(async () => {
    const [dead, sugg] = await Promise.all([
      send('ignoredDeadLinks.get'),
      send('ignoredSuggestions.get'),
    ])
    setIgnoredDeadLinksCount(dead.ok ? dead.data.length : 0)
    setIgnoredSuggestionsCount(sugg.ok ? sugg.data.length : 0)
  }, [])

  const loadFolders = useCallback(async () => {
    const res = await send('folders.get')
    if (res.ok) setFolders(res.data)
  }, [])

  const loadTrash = useCallback(async () => {
    const res = await send('trash.get')
    setTrashItems(res.ok ? res.data : [])
  }, [])

  const loadLog = useCallback(async () => {
    const res = await send('operationLog.get')
    setOpLog(res.ok ? res.data : [])
  }, [])

  const loadDiagnostics = useCallback(async () => {
    const res = await send('diagnostics.get')
    if (res.ok) setDiagnostics({ report: res.data.report })
  }, [])

  useEffect(() => {
    loadSettings()
    loadIgnoredCounts()
    loadFolders()
    loadDiagnostics()
  }, [loadSettings, loadIgnoredCounts, loadFolders, loadDiagnostics])

  useEffect(() => {
    if (tab === 'trash' && trashItems === null) loadTrash()
    if (tab === 'log' && opLog === null) loadLog()
  }, [tab, trashItems, opLog, loadTrash, loadLog])

  /* ---------- Derived state ---------- */

  const excludedFolderLabels = useMemo(() => {
    if (!settings) return []
    return settings.excludedFolderIds.map((id) => {
      const f = folders.find((fo) => fo.id === id)
      return f
        ? formatFolderPath([...f.folderPath, f.title])
        : `Folder ${id}`
    })
  }, [settings, folders])

  const pagedLog = useMemo(() => {
    if (!opLog) return { page: [], totalPages: 0 }
    const start = logPage * LOG_PAGE_SIZE
    return {
      page: opLog.slice(start, start + LOG_PAGE_SIZE),
      totalPages: Math.max(1, Math.ceil(opLog.length / LOG_PAGE_SIZE)),
    }
  }, [opLog, logPage])

  /* ---------- Mutations ---------- */

  const update = async (patch: Partial<UserSettings>) => {
    if (!settings) return
    const prev = settings
    setSettings({ ...settings, ...patch })

    // Apply theme immediately for a responsive feel; the backend update
    // below just persists the choice.
    if (patch.theme) {
      const root = document.documentElement
      if (patch.theme === 'system') root.removeAttribute('data-theme')
      else root.setAttribute('data-theme', patch.theme)
    }

    // Apply locale immediately — subscribers (useT) re-render automatically.
    if (patch.locale) setLocalePref(patch.locale)

    const res = await send('settings.update', patch)
    if (res.ok) setSettings(res.data)
    else {
      setSettings(prev)
      toast.error(t('settings.saveError'))
    }
  }

  const handleTimeoutBlur = () => {
    if (!settings) return
    const v = Number(timeoutInput)
    if (!isNaN(v) && v >= 1000 && v <= 30000) {
      if (v !== settings.scanTimeoutMs) update({ scanTimeoutMs: v })
    } else setTimeoutInput(String(settings.scanTimeoutMs))
  }
  const handleConcurrentBlur = () => {
    if (!settings) return
    const v = Number(concurrentInput)
    if (!isNaN(v) && v >= 1 && v <= 20) {
      if (v !== settings.maxConcurrentChecks) update({ maxConcurrentChecks: v })
    } else setConcurrentInput(String(settings.maxConcurrentChecks))
  }

  const handleRestore = async (bookmarkIds: string[]) => {
    const res = await send('trash.restore', { bookmarkIds })
    if (res.ok) {
      await loadTrash()
      const { restoredCount, fallbackCount } = res.data
      if (fallbackCount > 0) {
        toast.warning(
          `${t('settings.toast.restoredN', { count: restoredCount })} · ${fallbackCount} → Other Bookmarks`,
        )
      } else {
        toast.success(t('settings.toast.restoredN', { count: restoredCount }))
      }
    } else toast.error(res.error.message)
  }

  const handleEmptyTrash = async () => {
    setConfirmEmptyTrash(false)
    const res = await send('trash.empty')
    if (res.ok) {
      setTrashItems([])
      toast.success(t('settings.toast.trashEmptied'))
    } else toast.error(res.error.message)
  }

  const handleClearIgnoredDeadLinks = async () => {
    const res = await send('ignoredDeadLinks.clear')
    if (res.ok) {
      setIgnoredDeadLinksCount(0)
      toast.success(t('settings.toast.clearedDead'))
    }
  }

  const handleClearIgnoredSuggestions = async () => {
    const res = await send('ignoredSuggestions.clear')
    if (res.ok) {
      setIgnoredSuggestionsCount(0)
      toast.success(t('settings.toast.clearedOrg'))
    }
  }

  const handleResetOrganizeMemory = async () => {
    const res = await send('organize.antiMoves.clear')
    if (res.ok) {
      toast.success(t('settings.toast.orgReset'))
    }
  }

  const handleExportBackup = async () => {
    setBackupBusy(true)
    try {
      const res = await send('backup.export')
      if (!res.ok) {
        toast.error(t('settings.toast.exportFailed'))
        return
      }
      const blob = new Blob([res.data.json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.data.filename
      a.click()
      URL.revokeObjectURL(url)
      toast.success(
        t('settings.toast.exported', { size: (res.data.byteSize / 1024).toFixed(1), filename: res.data.filename }),
      )
    } finally {
      setBackupBusy(false)
    }
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      setConfirmImport(text)
    } catch {
      toast.error(t('settings.toast.readFailed'))
    } finally {
      e.target.value = '' // reset so user can pick same file again
    }
  }

  const handleConfirmImport = async () => {
    if (!confirmImport) return
    setBackupBusy(true)
    try {
      const res = await send('backup.import', { json: confirmImport })
      setConfirmImport(null)
      if (res.ok) {
        toast.success(t('settings.toast.restoredKeys', { count: res.data.keysRestored }))
        // Tiny delay so user sees the toast
        setTimeout(() => location.reload(), 800)
      } else {
        toast.error(res.error.message)
      }
    } finally {
      setBackupBusy(false)
    }
  }

  const handleCopyDiagnostics = async () => {
    setDiagnosticsBusy(true)
    try {
      await loadDiagnostics()
      const res = await send('diagnostics.get')
      if (!res.ok) return
      try {
        await navigator.clipboard.writeText(res.data.report)
        toast.success(t('settings.toast.diagCopied'))
      } catch {
        toast.error(t('settings.toast.clipDenied'))
      }
    } finally {
      setDiagnosticsBusy(false)
    }
  }

  const handleShareExport = async () => {
    if (!shareFolderId) {
      setSharePickerOpen(true)
      return
    }
    setShareBusy(true)
    try {
      const res = await send('share.exportFolder', {
        folderId: shareFolderId,
        format: shareFormat,
      })
      if (!res.ok) {
        toast.error(res.error.message)
        return
      }
      const mime =
        shareFormat === 'html'
          ? 'text/html'
          : shareFormat === 'md'
            ? 'text/markdown'
            : 'application/json'
      const blob = new Blob([res.data.content], { type: mime })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.data.filename
      a.click()
      URL.revokeObjectURL(url)
      toast.success(
        t('settings.toast.shareExported', { count: res.data.bookmarkCount, size: (res.data.byteSize / 1024).toFixed(1) }),
      )
    } finally {
      setShareBusy(false)
    }
  }

  const shareFolderLabel = useMemo(() => {
    if (!shareFolderId) return null
    const f = folders.find((fo) => fo.id === shareFolderId)
    return f ? formatFolderPath([...f.folderPath, f.title]) : t('settings.folderFallback', { id: shareFolderId })
  }, [shareFolderId, folders, t])

  if (!settings) {
    return (
      <div className="p-4">
        <p className="text-xs text-[var(--fw-text-subtle)]">{t('settings.loading')}</p>
      </div>
    )
  }

  /* ---------- Render ---------- */

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-[var(--fw-border)] flex-shrink-0">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList className="w-full grid grid-cols-3 h-7">
            <TabsTrigger value="general">
              <Settings2 className="h-3 w-3 mr-1" />
              {t('settings.general')}
            </TabsTrigger>
            <TabsTrigger value="trash">
              <Trash2 className="h-3 w-3 mr-1" />
              {t('settings.trash')}
              {trashItems && trashItems.length > 0 && (
                <span className="ml-1 text-[10.5px] text-[var(--fw-text-muted)]">
                  ({trashItems.length})
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="log">
              <History className="h-3 w-3 mr-1" />
              {t('settings.activity')}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'general' && (
          <div className="p-3 space-y-5">
            {/* ---- Scan section ---- */}
            <section className="space-y-3">
              <SectionHeading Icon={Settings2}>{t('settings.section.scan')}</SectionHeading>

              <Field
                label={t('settings.scan.timeoutLabel')}
                hint={t('settings.scan.timeoutHint')}
              >
                <Input
                  id="timeout"
                  type="number"
                  value={timeoutInput}
                  onChange={(e) => setTimeoutInput(e.target.value)}
                  onBlur={handleTimeoutBlur}
                  min={1000}
                  max={30000}
                  step={1000}
                  className="w-24"
                />
                <span className="text-[11px] text-[var(--fw-text-subtle)]">ms</span>
              </Field>

              <Field label={t('settings.scan.concurrentLabel')} hint={t('settings.scan.concurrentHint')}>
                <Input
                  id="concurrent"
                  type="number"
                  value={concurrentInput}
                  onChange={(e) => setConcurrentInput(e.target.value)}
                  onBlur={handleConcurrentBlur}
                  min={1}
                  max={20}
                  className="w-20"
                />
              </Field>

              <Field label={t('settings.scan.retryLabel')} hint={t('settings.scan.retryHint')}>
                <Switch
                  checked={settings.retrySuspiciousLinks}
                  onCheckedChange={(v) => update({ retrySuspiciousLinks: v })}
                  aria-label={t('settings.scan.retryLabel')}
                />
              </Field>

              <Field
                label={t('settings.scan.autoLabel')}
                hint={t('settings.scan.autoHint')}
              >
                <Segmented
                  value={settings.scheduleFrequency ?? 'off'}
                  onChange={(v) => update({ scheduleFrequency: v as UserSettings['scheduleFrequency'] })}
                  options={[
                    { value: 'off',     label: t('settings.scheduleOff') },
                    { value: 'daily',   label: t('settings.scheduleDaily') },
                    { value: 'weekly',  label: t('settings.scheduleWeekly') },
                    { value: 'monthly', label: t('settings.scheduleMonthly') },
                  ]}
                  ariaLabel={t('settings.scan.autoLabel')}
                />
              </Field>

              <Field
                label={t('settings.appearance')}
                hint={t('settings.themeHint')}
              >
                <Segmented
                  value={settings.theme ?? 'system'}
                  onChange={(v) => update({ theme: v as UserSettings['theme'] })}
                  options={[
                    { value: 'system', label: t('settings.themeAuto') },
                    { value: 'light',  label: t('settings.themeLight') },
                    { value: 'dark',   label: t('settings.themeDark') },
                  ]}
                  ariaLabel={t('settings.theme')}
                />
              </Field>

              <Field
                label={t('settings.language')}
                hint={t('settings.localeHint')}
              >
                <Segmented
                  value={settings.locale ?? 'auto'}
                  onChange={(v) => update({ locale: v as UserSettings['locale'] })}
                  options={[
                    { value: 'auto',  label: t('settings.localeAuto') },
                    { value: 'en',    label: t('settings.localeEn') },
                    { value: 'zh-CN', label: t('settings.localeZh') },
                  ]}
                  ariaLabel={t('settings.language')}
                />
              </Field>

              {/* Excluded folders */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>{t('settings.excludedFolders')}</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFolderPickerOpen(true)}
                    className="h-6 px-2 text-[11px] gap-1"
                  >
                    <FolderOpen className="h-3 w-3" />
                    {settings.excludedFolderIds.length === 0
                      ? t('settings.addFolders')
                      : t('common.edit')}
                  </Button>
                </div>
                <p className="text-[11px] text-[var(--fw-text-muted)]">
                  {t('settings.excludedFoldersHint')}
                </p>
                {excludedFolderLabels.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {excludedFolderLabels.map((label, i) => {
                      const id = settings.excludedFolderIds[i]
                      return (
                        <span
                          key={id}
                          className={cn(
                            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[var(--fw-radius-sm)] text-[11px]',
                            status.info.soft,
                          )}
                        >
                          <FolderClosed className="h-2.5 w-2.5" />
                          <span className="truncate max-w-[140px]">{label}</span>
                          <button
                            aria-label={t('common.removeItem', { name: label })}
                            onClick={() =>
                              update({
                                excludedFolderIds: settings.excludedFolderIds.filter(
                                  (x) => x !== id,
                                ),
                              })
                            }
                            className="ml-0.5 opacity-70 hover:opacity-100"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            </section>

            <Separator />

            {/* ---- Safety ---- */}
            <section className="space-y-3">
              <SectionHeading Icon={ShieldCheck}>{t('settings.section.safety')}</SectionHeading>
              <Field
                label={t('settings.enableTrash')}
                hint={t('settings.enableTrashHint')}
              >
                <Switch
                  checked={settings.enableTrashFolder}
                  onCheckedChange={(v) => update({ enableTrashFolder: v })}
                  aria-label={t('settings.enableTrash')}
                />
              </Field>

              {/* Protected folders */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <Label>{t('settings.protectedFolders')}</Label>
                    <p className="text-[11px] text-[var(--fw-text-muted)] mt-0.5">
                      {t('settings.protectedFoldersHint')}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setProtectedPickerOpen(true)}
                    className="h-6 px-2 text-[11px] gap-1 flex-shrink-0"
                  >
                    <Shield className="h-3 w-3" />
                    {(settings.protectedFolderIds?.length ?? 0) === 0 ? t('settings.addFolders') : t('common.edit')}
                  </Button>
                </div>
                {(settings.protectedFolderIds?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {settings.protectedFolderIds!.map((id) => {
                      const f = folders.find((fo) => fo.id === id)
                      const label = f ? formatFolderPath([...f.folderPath, f.title]) : `Folder ${id}`
                      return (
                        <span
                          key={id}
                          className={cn(
                            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[var(--fw-radius-sm)] text-[11px]',
                            status.success.soft,
                          )}
                        >
                          <ShieldCheck className="h-2.5 w-2.5" />
                          <span className="truncate max-w-[160px]" title={label}>{label}</span>
                          <button
                            aria-label={t('common.unprotectItem', { name: label })}
                            onClick={() =>
                              update({
                                protectedFolderIds: (settings.protectedFolderIds ?? []).filter(
                                  (x) => x !== id,
                                ),
                              })
                            }
                            className="ml-0.5 opacity-70 hover:opacity-100"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <IgnoredRow
                  title={t('settings.ignoredDeadLinks')}
                  count={ignoredDeadLinksCount}
                  onClear={handleClearIgnoredDeadLinks}
                />
                <IgnoredRow
                  title={t('settings.ignoredSuggestions')}
                  count={ignoredSuggestionsCount}
                  onClear={handleClearIgnoredSuggestions}
                />
                <div className="flex items-center justify-between gap-3 py-1">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium">{t('settings.organizeMemoryShort')}</p>
                    <p className="text-[11px] text-[var(--fw-text-muted)] leading-relaxed">
                      {t('settings.organizeMemoryShortHint')}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResetOrganizeMemory}
                    className="gap-1 h-6 px-2 text-[11px] flex-shrink-0"
                  >
                    <RotateCcw className="h-3 w-3" />
                    {t('settings.reset')}
                  </Button>
                </div>
              </div>
            </section>

            <Separator />

            {/* ---- Share ---- */}
            <section className="space-y-2">
              <SectionHeading Icon={Share2}>{t('settings.section.share')}</SectionHeading>
              <p className="text-[11px] text-[var(--fw-text-muted)] leading-relaxed">
                {t('settings.shareTagline')}
              </p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSharePickerOpen(true)}
                  className="gap-1 h-7 px-2.5 text-[11px]"
                >
                  <FolderOpen className="h-3 w-3" />
                  {shareFolderLabel ? (
                    <span className="truncate max-w-[160px]">{shareFolderLabel}</span>
                  ) : (
                    <>{t('settings.pickFolder')}</>
                  )}
                </Button>
                <Segmented
                  value={shareFormat}
                  onChange={(v) => setShareFormat(v as 'html' | 'md' | 'json')}
                  options={[
                    { value: 'html', label: 'HTML' },
                    { value: 'md',   label: 'MD' },
                    { value: 'json', label: 'JSON' },
                  ]}
                  ariaLabel={t('settings.section.share')}
                />
                <Button
                  size="sm"
                  onClick={handleShareExport}
                  disabled={!shareFolderId || shareBusy}
                  className="gap-1 h-7 px-2.5 text-[11px]"
                >
                  <Download className="h-3 w-3" />
                  {t('common.export')}
                </Button>
              </div>
            </section>

            <Separator />

            {/* ---- Backup ---- */}
            <section className="space-y-2">
              <SectionHeading Icon={Download}>{t('settings.section.backup')}</SectionHeading>
              <p className="text-[11px] text-[var(--fw-text-muted)] leading-relaxed">
                {t('settings.backupTagline')}
              </p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportBackup}
                  disabled={backupBusy}
                  className="gap-1 h-7 px-2.5 text-[11px]"
                >
                  <Download className="h-3 w-3" />
                  {t('common.export')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={backupBusy}
                  className="gap-1 h-7 px-2.5 text-[11px]"
                >
                  <Upload className="h-3 w-3" />
                  {t('common.import')}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleImportFile}
                  className="hidden"
                />
              </div>
            </section>

            <Separator />

            {/* ---- Diagnostics ---- */}
            <section className="space-y-2">
              <SectionHeading
                Icon={Info}
                trailing={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyDiagnostics}
                    className="gap-1 h-6 px-2 text-[11px]"
                    disabled={diagnosticsBusy}
                  >
                    <ClipboardCopy className="h-3 w-3" />
                    {t('common.copy')}
                  </Button>
                }
              >
                {t('settings.diagnostics')}
              </SectionHeading>
              {diagnostics ? (
                <div className="rounded-[var(--fw-radius-md)] border border-[var(--fw-border)] bg-[var(--fw-bg-subtle)] p-2 font-mono text-[10.5px] whitespace-pre-wrap max-h-[200px] overflow-y-auto leading-snug">
                  {diagnostics.report}
                </div>
              ) : (
                <p className="text-[11px] text-[var(--fw-text-subtle)]">{t('common.loading')}</p>
              )}
              <p className="text-[10.5px] text-[var(--fw-text-subtle)] leading-relaxed">
                {t('settings.diagnosticsNote')}
              </p>
            </section>
          </div>
        )}

        {tab === 'trash' && (
          <TrashPanel
            items={trashItems}
            onRestore={handleRestore}
            onEmpty={() => setConfirmEmptyTrash(true)}
          />
        )}

        {tab === 'log' && (
          <LogPanel
            entries={opLog}
            pageEntries={pagedLog.page}
            page={logPage}
            totalPages={pagedLog.totalPages}
            onPage={setLogPage}
          />
        )}
      </div>

      {/* Modal: folder picker */}
      <FolderPickerDialog
        open={folderPickerOpen}
        onOpenChange={setFolderPickerOpen}
        title={t('settings.excludeFolders.title')}
        description={t('settings.excludeFolders.desc')}
        value={settings.excludedFolderIds}
        onChange={(ids) => update({ excludedFolderIds: ids })}
        valueKey="id"
        multiple
        confirmLabel={t('common.save')}
        folders={folders}
      />

      <FolderPickerDialog
        open={protectedPickerOpen}
        onOpenChange={setProtectedPickerOpen}
        title={t('settings.protectFolders.title')}
        description={t('settings.protectFolders.desc')}
        value={settings.protectedFolderIds ?? []}
        onChange={(ids) => update({ protectedFolderIds: ids })}
        valueKey="id"
        multiple
        confirmLabel={t('common.save')}
        folders={folders}
      />

      <FolderPickerDialog
        open={sharePickerOpen}
        onOpenChange={setSharePickerOpen}
        title={t('settings.pickExport.title')}
        description={t('settings.pickExport.desc')}
        value={shareFolderId ? [shareFolderId] : []}
        onChange={(ids) => setShareFolderId(ids[0] ?? null)}
        valueKey="id"
        multiple={false}
        confirmLabel={t('common.apply')}
        folders={folders}
      />

      {/* Confirm: import backup */}
      <ConfirmDialog
        open={!!confirmImport}
        onOpenChange={(o) => !o && setConfirmImport(null)}
        title={t('settings.confirmRestoreTitle')}
        description={t('settings.confirmRestoreDesc')}
        confirmLabel={t('settings.confirmRestoreLabel')}
        ConfirmIcon={Upload}
        tone="danger"
        onConfirm={handleConfirmImport}
        busy={backupBusy}
      />

      {/* Confirm: empty trash */}
      <ConfirmDialog
        open={confirmEmptyTrash}
        onOpenChange={setConfirmEmptyTrash}
        title={t('settings.confirmEmptyTitle')}
        description={t('settings.confirmEmptyDesc')}
        confirmLabel={t('settings.confirmEmptyLabel')}
        ConfirmIcon={Trash2}
        tone="danger"
        onConfirm={handleEmptyTrash}
      />
    </div>
  )
}

/* ---------- Subcomponents ---------- */

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <Label>{label}</Label>
        {hint && <p className="text-[11px] text-[var(--fw-text-muted)] mt-0.5">{hint}</p>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">{children}</div>
    </div>
  )
}

function IgnoredRow({
  title,
  count,
  onClear,
}: {
  title: string
  count: number | null
  onClear: () => void
}) {
  const { t } = useT()
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium">{title}</p>
        <p className="text-[11px] text-[var(--fw-text-muted)]">
          {count === null
            ? t('common.loading')
            : count === 0
              ? t('settings.noneIgnored')
              : t('common.nItems', { count })}
        </p>
      </div>
      {(count ?? 0) > 0 && (
        <Button variant="ghost" size="sm" onClick={onClear} className="gap-1 h-6 px-2 text-[11px]">
          <X className="h-3 w-3" />
          {t('common.clear')}
        </Button>
      )}
    </div>
  )
}

function TrashPanel({
  items,
  onRestore,
  onEmpty,
}: {
  items: TrashEntry[] | null
  onRestore: (ids: string[]) => void
  onEmpty: () => void
}) {
  const { t } = useT()
  if (items === null) {
    return <div className="p-3 text-xs text-[var(--fw-text-subtle)]">{t('settings.loadingTrash')}</div>
  }
  if (items.length === 0) {
    return (
      <EmptyState
        Icon={Trash2}
        tone="success"
        title={t('settings.trashEmpty')}
        description={t('settings.trashEmptyDesc')}
      />
    )
  }
  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--fw-text-muted)]">
          {t('common.nItems', { count: items.length })}
        </p>
        <div className="flex gap-1.5">
          {items.length > 1 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRestore(items.map((it) => it.bookmarkId))}
              className="gap-1 h-6 px-2"
            >
              <RotateCcw className="h-3 w-3" />
              {t('common.restoreAll')}
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={onEmpty}
            className="gap-1 h-6 px-2"
          >
            <Trash2 className="h-3 w-3" />
            {t('settings.emptyTrash')}
          </Button>
        </div>
      </div>

      <div className={cn('flex items-start gap-2 px-2.5 py-1.5 rounded-[var(--fw-radius-md)] text-[11px]', status.info.soft)}>
        <Info className={cn('h-3 w-3 flex-shrink-0 mt-0.5', status.info.icon)} />
        <span>{t('settings.trashNote')}</span>
      </div>

      <div className="space-y-1.5">
        {items.map((item) => (
          <div
            key={item.bookmarkId}
            className="bg-[var(--fw-surface)] rounded-[var(--fw-radius-lg)] border border-[var(--fw-border)] px-3 py-2.5 flex items-start gap-2"
          >
            <Favicon url={item.url} size={18} framed className="mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate">
                {item.title || item.url || item.bookmarkId}
              </p>
              <p className="text-[11px] text-[var(--fw-text-subtle)] mt-0.5 truncate">
                <span className="opacity-60">›</span>{' '}
                {formatFolderPath(item.originalPath) || 'Root'}
              </p>
              <p className="text-[10.5px] text-[var(--fw-text-subtle)] mt-0.5 tabular-nums">
                {new Date(item.trashedAt).toLocaleString('en', {
                  month: 'short', day: 'numeric', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </p>
            </div>
            <div className="flex gap-0.5 flex-shrink-0">
              {item.url && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={t('common.open')}
                  title={t('common.open')}
                  className="h-6 w-6 flex items-center justify-center rounded-[var(--fw-radius-sm)] text-[var(--fw-text-subtle)] hover:text-[var(--fw-accent-text)] hover:bg-[var(--fw-bg-subtle)] transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRestore([item.bookmarkId])}
                className="gap-1 h-6 px-2 text-[11px]"
              >
                <RotateCcw className="h-3 w-3" />
                {t('common.restore')}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function LogPanel({
  entries,
  pageEntries,
  page,
  totalPages,
  onPage,
}: {
  entries: OperationLogEntry[] | null
  pageEntries: OperationLogEntry[]
  page: number
  totalPages: number
  onPage: (p: number) => void
}) {
  const { t } = useT()
  if (entries === null) {
    return <div className="p-3 text-xs text-[var(--fw-text-subtle)]">{t('settings.loadingActivity')}</div>
  }
  if (entries.length === 0) {
    return (
      <EmptyState
        Icon={History}
        tone="info"
        title={t('settings.noActivity')}
        description={t('settings.noActivityDesc')}
      />
    )
  }
  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-[var(--fw-text-subtle)]">
          Showing {page * LOG_PAGE_SIZE + 1}–
          {Math.min((page + 1) * LOG_PAGE_SIZE, entries.length)} of {entries.length}
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onPage(Math.max(0, page - 1))}
              disabled={page === 0}
              aria-label={t('common.previousPage')}
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <span className="text-[11px] tabular-nums">{page + 1} / {totalPages}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              aria-label={t('common.nextPage')}
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-[var(--fw-radius-lg)] border border-[var(--fw-border)] bg-[var(--fw-surface)] divide-y divide-[var(--fw-border)] overflow-hidden">
        {pageEntries.map((entry) => (
          <div key={entry.operationId} className="px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Badge variant={ACTION_BADGE[entry.actionType]}>
                  {t(ACTION_LABEL_KEYS[entry.actionType])}
                </Badge>
                <span className="text-[11px] text-[var(--fw-text-muted)]">
                  {t('common.nItems', { count: entry.bookmarkIds.length })}
                </span>
              </div>
              <span className="text-[10.5px] text-[var(--fw-text-subtle)] tabular-nums flex-shrink-0">
                {new Date(entry.timestamp).toLocaleString('en', {
                  month: 'short', day: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </span>
            </div>
            {entry.note && (
              <p className="text-[11px] text-[var(--fw-text-muted)] mt-1 italic">
                {entry.note}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T
  onChange: (v: T) => void
  options: Array<{ value: T; label: string }>
  ariaLabel: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex rounded-[var(--fw-radius-md)] bg-[var(--fw-bg-subtle)] p-0.5 border border-[var(--fw-border)]"
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'px-2 py-1 text-[11px] font-medium rounded-[var(--fw-radius-sm)] transition-colors',
              active
                ? 'bg-[var(--fw-surface)] text-[var(--fw-text)] shadow-[var(--fw-shadow-sm)]'
                : 'text-[var(--fw-text-muted)] hover:text-[var(--fw-text)]',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

