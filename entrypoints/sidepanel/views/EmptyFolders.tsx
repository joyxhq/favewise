import { useEffect, useState, useMemo, useCallback } from 'react'
import { FolderX, RefreshCw, Trash2, Info, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import type { EmptyFolder } from '~/shared/types'
import type { ViewProps } from '../App'
import { Button } from '~/shared/components/ui/button'
import { Checkbox } from '~/shared/components/ui/checkbox'
import { EmptyState } from '~/shared/components/patterns/EmptyState'
import { ConfirmDialog, PreviewList } from '~/shared/components/patterns/ConfirmDialog'
import { DataList } from '~/shared/components/patterns/DataList'
import { StatusBar } from '~/shared/components/patterns/StatusBar'
import { IconBox } from '~/shared/components/patterns/IconBox'
import { cn } from '~/shared/lib/utils'
import { status } from '~/shared/lib/tokens'
import { send } from '~/shared/lib/messaging'
import { formatFolderPath } from '~/shared/utils/bookmark-tree'
import { useT } from '~/shared/lib/i18n'

export default function EmptyFolders({
  scanResult,
  scanVersion,
  startScan,
  refreshScanResult,
}: ViewProps) {
  const { t } = useT()
  const [emptyFolders, setEmptyFolders] = useState<EmptyFolder[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    const res = await send('emptyFolders.get')
    setEmptyFolders(res.ok ? res.data : [])
  }, [])

  useEffect(() => {
    load()
  }, [load, scanVersion])

  const folderMap = useMemo(() => {
    const m = new Map<string, EmptyFolder>()
    for (const f of emptyFolders ?? []) m.set(f.id, f)
    return m
  }, [emptyFolders])

  const handleConfirmedDelete = async () => {
    const ids = confirmDelete ?? []
    setConfirmDelete(null)
    if (ids.length === 0) return
    setDeleting(true)
    try {
      const res = await send('emptyFolders.delete', { folderIds: ids })
      if (res.ok) {
        setEmptyFolders((prev) => (prev ?? []).filter((f) => !ids.includes(f.id)))
        setSelected((prev) => {
          const next = new Set(prev)
          ids.forEach((id) => next.delete(id))
          return next
        })
        await refreshScanResult()
        const { deletedCount, failedCount, protectedSkipped, staleSkipped, nonEmptySkipped } = res.data
        const otherFailed =
          failedCount - (protectedSkipped ?? 0) - (staleSkipped ?? 0) - (nonEmptySkipped ?? 0)
        if (protectedSkipped > 0 || staleSkipped > 0 || nonEmptySkipped > 0 || otherFailed > 0) {
          const parts = [t('empty.deleteN', { count: deletedCount })]
          if (protectedSkipped > 0) parts.push(t('common.protectedSkippedN', { count: protectedSkipped }))
          if (staleSkipped > 0) parts.push(t('common.changedSinceScanN', { count: staleSkipped }))
          if (nonEmptySkipped > 0) parts.push(t('common.noLongerEmptyN', { count: nonEmptySkipped }))
          if (otherFailed > 0) parts.push(t('common.failedN', { count: otherFailed }))
          toast.warning(parts.join(' · '))
        } else {
          toast.success(t('empty.deleteN', { count: deletedCount }))
        }
      } else {
        toast.error(res.error.message)
      }
    } finally {
      setDeleting(false)
    }
  }

  if (!scanResult) {
    return (
      <EmptyState
        Icon={FolderX}
        tone="accent"
        title={t('common.noScanData')}
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

  if (emptyFolders === null) {
    return (
      <div className="p-3">
        <p className="text-xs text-[var(--fw-text-subtle)]">{t('empty.loading')}</p>
      </div>
    )
  }

  if (emptyFolders.length === 0) {
    return (
      <EmptyState
        Icon={Sparkles}
        tone="success"
        title={t('empty.empty.title')}
        description={t('empty.empty.desc')}
      />
    )
  }

  return (
    <div className="flex flex-col h-full">
      <StatusBar
        tone="warning"
        Icon={Info}
        label={t('empty.detectedN', { count: emptyFolders.length })}
        hint={t('empty.permanentNote')}
      />

      <DataList
        items={emptyFolders}
        getId={(f) => f.id}
        searchFields={(f) => `${f.title} ${f.folderPath.join(' / ')}`}
        searchPlaceholder={t('empty.searchPlaceholder')}
        selected={selected}
        onSelectedChange={setSelected}
        onDelete={(ids) => setConfirmDelete(ids)}
        renderRow={({ item: folder, selected: isSelected, toggle }) => {
          const path = formatFolderPath(folder.folderPath)
          return (
            <div
              onClick={toggle}
              className={cn(
                'px-3 py-2.5 flex items-center gap-2.5 cursor-pointer transition-colors',
                isSelected
                  ? 'bg-[var(--fw-danger-soft)]'
                  : 'hover:bg-[var(--fw-bg-subtle)]',
              )}
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={toggle}
                onClick={(e) => e.stopPropagation()}
                aria-label={t('common.selectItem', { name: folder.title })}
                className="flex-shrink-0"
              />
              <IconBox Icon={FolderX} tone={isSelected ? 'danger' : 'accent'} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate">{folder.title}</p>
                {path && (
                  <p className="text-[11px] text-[var(--fw-text-subtle)] truncate mt-0.5">
                    <span className="opacity-60">›</span> {path}
                  </p>
                )}
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
              <Button variant="ghost" size="sm" onClick={clear}>
                {t('common.clear')}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmDelete(selectedIds)}
                disabled={deleting}
                className="gap-1"
                aria-label={t('empty.deleteN', { count: selectedCount })}
              >
                <Trash2 className="h-3 w-3" />
                {t('empty.deleteN', { count: selectedCount })}
              </Button>
            </div>
          </div>
        )}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title={t('empty.confirmDelete', { count: confirmDelete?.length ?? 0 })}
        description={t('empty.confirmDeleteDesc')}
        preview={
          confirmDelete && (
            <PreviewList
              items={confirmDelete.map((id) => {
                const f = folderMap.get(id)
                return (
                  <span className="flex items-center gap-1.5">
                    <FolderX className={cn('h-3 w-3 flex-shrink-0', status.danger.icon)} />
                    <span className="truncate">
                      {f ? formatFolderPath([...f.folderPath, f.title]) : id}
                    </span>
                  </span>
                )
              })}
            />
          )
        }
        confirmLabel={t('empty.deleteFolders')}
        ConfirmIcon={Trash2}
        tone="danger"
        onConfirm={handleConfirmedDelete}
        busy={deleting}
      />
    </div>
  )
}
