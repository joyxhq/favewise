import { useState, useEffect } from 'react'
import { Plus, Trash2, Save, Sparkles } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from '~/shared/components/ui/alert-dialog'
import { Button } from '~/shared/components/ui/button'
import { Input } from '~/shared/components/ui/input'
import type { SmartFolder, SmartFolderRule, SmartFolderRuleField, SmartFolderRuleOperator } from '~/shared/storage/schema'
import { send } from '~/shared/lib/messaging'
import { useT } from '~/shared/lib/i18n'

interface SmartFolderEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  folder?: SmartFolder | null
  onSave?: () => void
}

const FIELDS: { value: SmartFolderRuleField; labelKey: string }[] = [
  { value: 'title', labelKey: 'smartFolder.field.title' },
  { value: 'url', labelKey: 'smartFolder.field.url' },
  { value: 'domain', labelKey: 'smartFolder.field.domain' },
  { value: 'tag', labelKey: 'smartFolder.field.tag' },
  { value: 'parentFolder', labelKey: 'smartFolder.field.parentFolder' },
]

const OPERATORS: { value: SmartFolderRuleOperator; labelKey: string }[] = [
  { value: 'contains', labelKey: 'smartFolder.operator.contains' },
  { value: 'equals', labelKey: 'smartFolder.operator.equals' },
  { value: 'notContains', labelKey: 'smartFolder.operator.notContains' },
  { value: 'startsWith', labelKey: 'smartFolder.operator.startsWith' },
  { value: 'endsWith', labelKey: 'smartFolder.operator.endsWith' },
]

export function SmartFolderEditorDialog({ open, onOpenChange, folder, onSave }: SmartFolderEditorDialogProps) {
  const { t } = useT()
  const [name, setName] = useState('')
  const [rules, setRules] = useState<SmartFolderRule[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setName(folder?.name ?? '')
      setRules(folder?.rules ?? [{ field: 'title', operator: 'contains', value: '' }])
    }
  }, [open, folder])

  const handleSave = async () => {
    if (!name.trim() || rules.length === 0) return
    setBusy(true)
    try {
      const validRules = rules.filter(r => r.value.trim())
      if (validRules.length === 0) return

      if (folder) {
        await send('smartFolders.update', { id: folder.id, name: name.trim(), rules: validRules })
      } else {
        await send('smartFolders.create', { name: name.trim(), rules: validRules })
      }
      onSave?.()
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  const addRule = () => {
    setRules(prev => [...prev, { field: 'title', operator: 'contains', value: '' }])
  }

  const removeRule = (index: number) => {
    setRules(prev => prev.filter((_, i) => i !== index))
  }

  const updateRule = (index: number, patch: Partial<SmartFolderRule>) => {
    setRules(prev => {
      const next = [...prev]
      next[index] = { ...next[index], ...patch }
      return next
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="w-[min(88vw,480px)] max-w-none p-0 overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-[var(--fw-border)] bg-[var(--fw-surface)]">
          <AlertDialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[var(--fw-accent)]" />
            {folder ? t('smartFolder.edit') : t('smartFolder.new')}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[11px] mt-1">
            {t('smartFolder.description')}
          </AlertDialogDescription>
        </div>

        <div className="p-4 flex flex-col gap-4 bg-[var(--fw-bg)]">
          <div>
            <label className="block text-[10.5px] font-semibold uppercase tracking-wider text-[var(--fw-text-subtle)] mb-1.5">
              {t('smartFolder.folderName')}
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('smartFolder.namePlaceholder')}
              className="h-8 text-xs font-medium"
              autoFocus
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[10.5px] font-semibold uppercase tracking-wider text-[var(--fw-text-subtle)]">
                {t('smartFolder.rulesMatchAll')}
              </label>
            </div>
            
            <div className="space-y-2">
              {rules.map((rule, i) => (
                <div key={i} className="grid grid-cols-[minmax(110px,0.8fr)_minmax(130px,1fr)_minmax(120px,1fr)_auto] items-center gap-2 max-[430px]:grid-cols-1">
                  <select
                    value={rule.field}
                    onChange={(e) => updateRule(i, { field: e.target.value as SmartFolderRuleField })}
                    className="h-8 min-w-0 rounded-[var(--fw-radius-sm)] border border-[var(--fw-border)] bg-[var(--fw-surface)] text-xs px-2 outline-none focus:ring-2 focus:ring-[color-mix(in_oklch,var(--fw-accent)_55%,transparent)]"
                  >
                    {FIELDS.map(f => <option key={f.value} value={f.value}>{t(f.labelKey)}</option>)}
                  </select>
                  
                  <select
                    value={rule.operator}
                    onChange={(e) => updateRule(i, { operator: e.target.value as SmartFolderRuleOperator })}
                    className="h-8 min-w-0 rounded-[var(--fw-radius-sm)] border border-[var(--fw-border)] bg-[var(--fw-surface)] text-xs px-2 outline-none focus:ring-2 focus:ring-[color-mix(in_oklch,var(--fw-accent)_55%,transparent)]"
                  >
                    {OPERATORS.map(o => <option key={o.value} value={o.value}>{t(o.labelKey)}</option>)}
                  </select>

                  <Input
                    value={rule.value}
                    onChange={(e) => updateRule(i, { value: e.target.value })}
                    className="h-8 min-w-0 text-xs"
                    placeholder={t('smartFolder.valuePlaceholder')}
                  />

                  {rules.length > 1 && (
                    <Button variant="ghost" size="icon-sm" onClick={() => removeRule(i)}>
                      <Trash2 className="h-3.5 w-3.5 text-[var(--fw-danger)]" />
                    </Button>
                  )}
                </div>
              ))}
              
              <Button variant="outline" size="sm" onClick={addRule} className="h-7 text-[10.5px] mt-1 gap-1">
                <Plus className="h-3 w-3" /> {t('smartFolder.addRule')}
              </Button>
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-[var(--fw-border)] bg-[var(--fw-surface)] flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={busy || !name.trim() || !rules.some(r => r.value.trim())}
            className="gap-1.5"
          >
            <Save className="h-3.5 w-3.5" />
            {t('smartFolder.save')}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}
