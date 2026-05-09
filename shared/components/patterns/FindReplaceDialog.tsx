import { useState, useEffect } from 'react'
import {
  Search,
  Replace,
  AlertCircle,
  CheckCircle2,
  ListFilter,
  Eye,
  ArrowRight,
} from 'lucide-react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from '~/shared/components/ui/alert-dialog'
import { Button } from '~/shared/components/ui/button'
import { Input } from '~/shared/components/ui/input'
import { Checkbox } from '~/shared/components/ui/checkbox'
import { send } from '~/shared/lib/messaging'
import { cn } from '~/shared/lib/utils'
import { useT } from '~/shared/lib/i18n'
import { toast } from 'sonner'
import { status } from '~/shared/lib/tokens'

interface FindReplaceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  targetBookmarkIds?: string[]
}

export function FindReplaceDialog({ open, onOpenChange, targetBookmarkIds }: FindReplaceDialogProps) {
  const { t } = useT()
  const [findStr, setFindStr] = useState('')
  const [replaceStr, setReplaceStr] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [findInTitle, setFindInTitle] = useState(true)
  const [findInUrl, setFindInUrl] = useState(false)

  const [previewing, setPreviewing] = useState(false)
  const [applying, setApplying] = useState(false)
  const [totalMatchCount, setTotalMatchCount] = useState<number | null>(null)

  const [matches, setMatches] = useState<Array<{
    id: string
    title: string
    url: string
    titleBefore?: string
    titleAfter?: string
    urlBefore?: string
    urlAfter?: string
  }>>([])

  useEffect(() => {
    if (open) {
      setMatches([])
      setFindStr('')
      setReplaceStr('')
      setTotalMatchCount(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    if (!findStr.trim()) {
      setMatches([])
      setTotalMatchCount(null)
      return
    }

    const timer = setTimeout(async () => {
      setPreviewing(true)
      try {
        const findIn: ('title' | 'url')[] = []
        if (findInTitle) findIn.push('title')
        if (findInUrl) findIn.push('url')

        const res = await send('findReplace.preview', {
          find: findStr,
          replace: replaceStr,
          findIn,
          replaceIn: findIn,
          caseSensitive,
          bookmarkIds: targetBookmarkIds,
        })
        if (res.ok) {
          setMatches(res.data.matches)
          setTotalMatchCount(res.data.totalCount ?? res.data.matches.length)
        }
      } finally {
        setPreviewing(false)
      }
    }, 400)

    return () => clearTimeout(timer)
  }, [findStr, replaceStr, caseSensitive, findInTitle, findInUrl, open, targetBookmarkIds])

  const handleApply = async () => {
    if (!findStr.trim() || matches.length === 0) return

    setApplying(true)
    try {
      const findIn: ('title' | 'url')[] = []
      if (findInTitle) findIn.push('title')
      if (findInUrl) findIn.push('url')

      const targetIds = matches.map(m => m.id)

      const res = await send('findReplace.execute', {
        find: findStr,
        replace: replaceStr,
        findIn,
        replaceIn: findIn,
        caseSensitive,
        bookmarkIds: targetIds,
      })

      if (res.ok) {
        toast.success(t('toast.updatedN', { count: res.data.updatedCount }))
        onOpenChange(false)
      } else {
        toast.error(res.error.message)
      }
    } finally {
      setApplying(false)
    }
  }

  const isCapped = totalMatchCount !== null && totalMatchCount > 50

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[500px] p-0 overflow-hidden flex flex-col max-h-[85vh]">
        <div className="px-4 py-3 border-b border-[var(--fw-border)] bg-[var(--fw-surface)]">
          <AlertDialogTitle className="flex items-center gap-2">
            <Replace className="h-4 w-4 text-[var(--fw-accent)]" />
            {t('findReplace.title')}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[11px] mt-1">
            {t('findReplace.desc')}
          </AlertDialogDescription>
        </div>

        <div className="p-4 bg-[var(--fw-bg-subtle)] border-b border-[var(--fw-border)] flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10.5px] font-semibold uppercase tracking-wider text-[var(--fw-text-subtle)] mb-1.5">
                {t('findReplace.find')}
              </label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--fw-text-muted)]" />
                <Input
                  value={findStr}
                  onChange={(e) => setFindStr(e.target.value)}
                  placeholder={t('findReplace.findPlaceholder')}
                  className="h-8 pl-8 text-xs font-mono"
                  autoFocus
                />
              </div>
            </div>
            <div>
              <label className="block text-[10.5px] font-semibold uppercase tracking-wider text-[var(--fw-text-subtle)] mb-1.5">
                {t('findReplace.replaceWith')}
              </label>
              <Input
                value={replaceStr}
                onChange={(e) => setReplaceStr(e.target.value)}
                placeholder={t('findReplace.replacePlaceholder')}
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>

          <div className="flex items-center gap-4 text-[11px] font-medium mt-1">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <Checkbox checked={caseSensitive} onCheckedChange={(c) => setCaseSensitive(!!c)} />
              {t('findReplace.caseSensitive')}
            </label>
            <div className="h-3 w-px bg-[var(--fw-border)]" />
            <span className="text-[var(--fw-text-subtle)] uppercase text-[10px] tracking-wider">In:</span>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <Checkbox checked={findInTitle} onCheckedChange={(c) => setFindInTitle(!!c)} />
              {t('findReplace.titles')}
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <Checkbox checked={findInUrl} onCheckedChange={(c) => setFindInUrl(!!c)} />
              {t('findReplace.urls')}
            </label>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-[var(--fw-bg)] p-3 min-h-[200px]">
          {!findStr.trim() ? (
            <div className="h-full flex flex-col items-center justify-center text-[var(--fw-text-subtle)] gap-2 opacity-60">
              <Search className="h-6 w-6" />
              <p className="text-xs">{t('findReplace.enterToSearch')}</p>
            </div>
          ) : previewing ? (
            <div className="h-full flex flex-col items-center justify-center text-[var(--fw-accent)] gap-2">
              <Eye className="h-6 w-6 animate-pulse" />
              <p className="text-xs font-medium">{t('findReplace.scanning')}</p>
            </div>
          ) : matches.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-[var(--fw-text-subtle)] gap-2 opacity-60">
              <AlertCircle className="h-6 w-6" />
              <p className="text-xs">{t('findReplace.noMatches')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="px-1 mb-2 text-[11px] font-medium text-[var(--fw-text-subtle)] flex items-center justify-between">
                <span>{t('findReplace.willBeUpdated', { count: totalMatchCount ?? matches.length })}</span>
              </div>
              {matches.slice(0, 50).map((m) => (
                <div key={m.id} className="p-2.5 rounded-[var(--fw-radius-md)] border border-[var(--fw-border)] bg-[var(--fw-surface)] space-y-1.5">
                  {m.titleBefore !== undefined && (
                    <div className="text-xs">
                      <span className="text-[10px] uppercase text-[var(--fw-text-subtle)] font-bold w-10 inline-block">Title</span>
                      <span className="line-through text-[var(--fw-danger)] opacity-70 mr-2">{m.titleBefore}</span>
                      <ArrowRight className="inline h-3 w-3 mx-1 text-[var(--fw-text-muted)]" />
                      <span className="text-[var(--fw-success)] font-medium">{m.titleAfter}</span>
                    </div>
                  )}
                  {m.urlBefore !== undefined && (
                    <div className="text-[11px] font-mono">
                      <span className="text-[10px] uppercase text-[var(--fw-text-subtle)] font-bold w-10 inline-block font-sans">URL</span>
                      <span className="line-through text-[var(--fw-danger)] opacity-70 mr-2 block truncate mt-0.5 max-w-[400px]">{m.urlBefore}</span>
                      <span className="text-[var(--fw-success)] font-medium block truncate mt-0.5 max-w-[400px]">{m.urlAfter}</span>
                    </div>
                  )}
                </div>
              ))}
              {isCapped && (
                <div className="space-y-1">
                  <p className="text-center text-xs text-[var(--fw-text-subtle)] py-1 italic">
                    {t('findReplace.moreN', { count: totalMatchCount! - 50 })}
                  </p>
                  <p className="text-center text-[10px] text-[var(--fw-text-muted)] py-0.5">
                    {t('findReplace.previewCapped')}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-[var(--fw-border)] bg-[var(--fw-surface)] flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleApply}
            disabled={applying || matches.length === 0 || !findStr.trim()}
            className="gap-1.5"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t('findReplace.applyToN', { count: totalMatchCount ?? matches.length })}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}
