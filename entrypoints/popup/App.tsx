import { useEffect, useState } from 'react'
import { Sparkles, ArrowRight, Link2Off, Copy, FolderOpen, Bookmark, Check, ChevronDown } from 'lucide-react'
import { Button } from '~/shared/components/ui/button'
import { Input } from '~/shared/components/ui/input'
import { send } from '~/shared/lib/messaging'
import { openPrimaryPanel } from '~/shared/lib/webext'
import { cn } from '~/shared/lib/utils'
import { useT } from '~/shared/lib/i18n'

interface QuickSaveState {
  url: string
  title: string
  folderId: string
  folderTitle: string
  saving: boolean
  saved: boolean
}

export default function PopupApp() {
  const { t } = useT()
  const [stats, setStats] = useState<{
    total: number
    dead: number
    dupes: number
    orgs: number
  } | null>(null)

  const [qs, setQs] = useState<QuickSaveState | null>(null)
  const [folders, setFolders] = useState<Array<{ id: string; title: string; path: string[] }>>([])
  const [folderOpen, setFolderOpen] = useState(false)

  useEffect(() => {
    send('scan.latest.get').then((res) => {
      if (!res.ok || !res.data) return
      const s = res.data
      setStats({
        total: s.totalBookmarks,
        dead: s.deadLinks.filter((d) => d.status === 'invalid').length,
        dupes: s.duplicateGroups.length,
        orgs: s.organizeSuggestions.length,
      })
    })

    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (!tab?.url || !tab.url.startsWith('http')) return
      send('quickSave.getState').then((res) => {
        const folderId = res.ok ? (res.data.lastFolderId ?? '') : ''
        const folderTitle = res.ok ? (res.data.lastFolderTitle ?? t('popup.chooseFolder')) : t('popup.chooseFolder')
        setQs({
          url: tab.url ?? '',
          title: tab.title ?? '',
          folderId,
          folderTitle,
          saving: false,
          saved: false,
        })
      })
      send('quickSave.getFolders').then((res) => {
        if (res.ok) setFolders(res.data)
      })
    })
  }, [])

  const handleSave = async () => {
    if (!qs || qs.saving || qs.saved) return
    setQs((prev) => prev ? { ...prev, saving: true } : prev)
    const res = await send('quickSave.execute', {
      url: qs.url,
      title: qs.title,
      folderId: qs.folderId || (folders[0]?.id ?? ''),
    })
    if (res.ok) {
      setQs((prev) => prev ? { ...prev, saving: false, saved: true } : prev)
      setTimeout(() => setQs((prev) => prev ? { ...prev, saved: false } : prev), 2000)
    } else {
      setQs((prev) => prev ? { ...prev, saving: false } : prev)
    }
  }

  const openSidePanel = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    await openPrimaryPanel(tab?.id)
    window.close()
  }

  return (
    <div className="w-[280px] p-3.5 flex flex-col gap-3 bg-[var(--fw-surface)] text-[var(--fw-text)]">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-[var(--fw-radius-md)] bg-[var(--fw-accent)] flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-[var(--fw-accent-fg)]" strokeWidth={2.5} />
        </div>
        <div>
          <p className="text-sm font-bold leading-tight">{t('app.name')}</p>
          <p className="text-[11px] text-[var(--fw-text-muted)] leading-tight">
            {t('popup.subtitle')}
          </p>
        </div>
      </div>

      {qs && !qs.saved && (
        <div className="rounded-[var(--fw-radius-md)] border border-[var(--fw-border)] bg-[var(--fw-bg-subtle)] p-2.5 flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--fw-text-subtle)]">
            <Bookmark className="h-3 w-3" />
            {t('popup.saveThisPage')}
          </div>
          <Input
            value={qs.title}
            onChange={(e) => setQs((p) => p ? { ...p, title: e.target.value } : p)}
            className="h-7 text-[11px]"
            aria-label={t('popup.bookmarkTitleLabel')}
          />
          <div className="relative">
            <button
              onClick={() => setFolderOpen((o) => !o)}
              className="w-full flex items-center justify-between gap-1 px-2 py-1 rounded border border-[var(--fw-border)] bg-[var(--fw-surface)] text-[11px] hover:bg-[var(--fw-bg-subtle)] transition-colors"
            >
              <span className="truncate text-[var(--fw-text-subtle)]">{qs.folderTitle}</span>
              <ChevronDown className="h-3 w-3 flex-shrink-0 text-[var(--fw-text-muted)]" />
            </button>
            {folderOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 z-10 rounded border border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-md)] max-h-[140px] overflow-y-auto">
                {folders.slice(0, 20).map((f) => (
                  <button
                    key={f.id}
                    onClick={() => {
                      setQs((p) => p ? { ...p, folderId: f.id, folderTitle: f.title } : p)
                      setFolderOpen(false)
                    }}
                    className={cn(
                      'w-full text-left px-2 py-1 text-[11px] hover:bg-[var(--fw-bg-subtle)] truncate',
                      qs.folderId === f.id && 'text-[var(--fw-accent)] font-medium',
                    )}
                    title={f.path.join(' / ')}
                  >
                    {f.title}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={qs.saving}
            className="w-full h-7 text-[11px] gap-1"
          >
            {qs.saving ? (
              <span className="opacity-60">{t('popup.saving')}</span>
            ) : (
              <>
                <Bookmark className="h-3 w-3" />
                {t('popup.save')}
              </>
            )}
          </Button>
        </div>
      )}

      {qs?.saved && (
        <div className="rounded-[var(--fw-radius-md)] border border-[var(--fw-success-soft)] bg-[var(--fw-success-soft)] p-2.5 flex items-center gap-2">
          <Check className="h-3.5 w-3.5 text-[var(--fw-success-text)] flex-shrink-0" />
          <span className="text-[11px] font-medium text-[var(--fw-success-text)]">{t('popup.savedTo')} {qs.folderTitle}</span>
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-3 gap-1.5 text-center">
          <Stat Icon={Link2Off} label={t('popup.dead')} value={stats.dead} />
          <Stat Icon={Copy} label={t('popup.dupes')} value={stats.dupes} />
          <Stat Icon={FolderOpen} label={t('popup.moves')} value={stats.orgs} />
        </div>
      )}

      <Button onClick={openSidePanel} className="w-full gap-1.5" size="lg">
        {t('popup.openApp')}
        <ArrowRight className="h-3.5 w-3.5" />
      </Button>
      <p className="text-[10.5px] text-[var(--fw-text-subtle)] text-center">
        {stats
          ? t('popup.bookmarksInLibrary', { count: stats.total.toLocaleString() })
          : t('popup.openSidePanelHint')}
      </p>
    </div>
  )
}

function Stat({
  Icon,
  label,
  value,
}: {
  Icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
}) {
  return (
    <div className="p-2 rounded-[var(--fw-radius-md)] bg-[var(--fw-bg-subtle)] border border-[var(--fw-border)]">
      <Icon className="h-3 w-3 mx-auto text-[var(--fw-text-muted)] mb-1" />
      <p className="text-base font-bold tabular-nums leading-none">{value}</p>
      <p className="text-[10px] text-[var(--fw-text-subtle)] mt-0.5">{label}</p>
    </div>
  )
}
