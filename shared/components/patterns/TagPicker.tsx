import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Plus, Search, Tag, X } from 'lucide-react'
import type { TagDef } from '~/shared/storage/schema'
import { Button } from '~/shared/components/ui/button'
import { Input } from '~/shared/components/ui/input'
import { Badge } from '~/shared/components/ui/badge'
import { send } from '~/shared/lib/messaging'
import { useT } from '~/shared/lib/i18n'
import { cn } from '~/shared/lib/utils'

const TAG_COLORS = [
  '#CC785C', '#E57373', '#F06292', '#BA68C8', '#7986CB',
  '#64B5F6', '#4FC3F7', '#4DB6AC', '#81C784', '#AED581',
  '#DCE775', '#FFF176', '#FFD54F', '#FFB74D', '#A1887F', '#90A4AE',
]

interface TagPickerProps {
  bookmarkId: string
  currentTags: TagDef[]
  onClose: () => void
  onChange?: (tags: TagDef[]) => void
}

export function TagPicker({ bookmarkId, currentTags, onClose, onChange }: TagPickerProps) {
  const { t } = useT()
  const [query, setQuery] = useState('')
  const [suggestedTags, setSuggestedTags] = useState<TagDef[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set(currentTags.map((t) => t.id)))
  const [creating, setCreating] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [focusIndex, setFocusIndex] = useState(0)

  const loadTags = useCallback(async () => {
    const res = await send('tags.search', { query })
    if (res.ok) setSuggestedTags(res.data)
  }, [query])

  useEffect(() => {
    loadTags()
  }, [loadTags])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const toggleTag = (tagId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(tagId)) next.delete(tagId)
      else next.add(tagId)
      return next
    })
  }

  const handleCreate = async () => {
    if (!creating || !creating.trim()) return
    setSaving(true)
    try {
      const res = await send('tags.create', { name: creating, color: TAG_COLORS[selected.size % TAG_COLORS.length] })
      if (res.ok) {
        const newTag = res.data
        setSelected((prev) => new Set([...prev, newTag.id]))
        setCreating('')
        await loadTags()
      }
    } finally {
      setSaving(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const currentIds = new Set(currentTags.map((t) => t.id))
      const toAdd = [...selected].filter((id) => !currentIds.has(id))
      const toRemove = [...currentIds].filter((id) => !selected.has(id))

      if (toAdd.length > 0) {
        await send('tags.assign', { bookmarkId, tagIds: toAdd })
      }
      if (toRemove.length > 0) {
        await send('tags.unassign', { bookmarkId, tagIds: toRemove })
      }

      const allTags = await send('tags.get')
      const updatedTags = allTags.ok ? allTags.data.filter((tag: TagDef) => selected.has(tag.id)) : currentTags
      onChange?.(updatedTags)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const displayTags = suggestedTags.filter((tag) => {
    if (!query.trim()) return true
    return tag.name.toLowerCase().includes(query.toLowerCase())
  })

  return (
    <div
      className="w-[280px] rounded-xl border border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-lg)] overflow-hidden"
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
        if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIndex((i) => Math.min(i + 1, displayTags.length - 1)); return }
        if (e.key === 'ArrowUp') { e.preventDefault(); setFocusIndex((i) => Math.max(i - 1, 0)); return }
        if (e.key === 'Enter' && displayTags[focusIndex]) {
          e.preventDefault()
          toggleTag(displayTags[focusIndex]!.id)
        }
      }}
    >
      <div className="p-2 border-b border-[var(--fw-border)]">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--fw-text-subtle)]" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('tags.searchPlaceholder')}
            className="pl-7 h-7 text-xs"
          />
        </div>
      </div>

      <div className="max-h-[200px] overflow-y-auto p-1.5">
        {displayTags.length === 0 && query.trim() && (
          <p className="text-xs text-[var(--fw-text-subtle)] text-center py-3">
            {t('tags.noMatch')}
          </p>
        )}
        {displayTags.map((tag, idx) => {
          const isSelected = selected.has(tag.id)
          const isFocused = idx === focusIndex
          return (
            <button
              key={tag.id}
              onClick={() => toggleTag(tag.id)}
              onMouseEnter={() => setFocusIndex(idx)}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors text-left',
                isSelected ? 'bg-[var(--fw-bg-subtle)]' : 'hover:bg-[var(--fw-bg-subtle)]',
                isFocused && 'ring-2 ring-[var(--fw-accent)] ring-inset',
              )}
            >
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: tag.color }}
              />
              <span className="flex-1 truncate">{tag.name}</span>
              {isSelected && <Check className="h-3 w-3 text-[var(--fw-accent)] flex-shrink-0" />}
            </button>
          )
        })}
      </div>

      {query.trim() && (
        <div className="p-2 border-t border-[var(--fw-border)]">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCreate}
            disabled={saving || !query.trim()}
            className="w-full gap-1.5 h-7 text-xs"
          >
            <Plus className="h-3 w-3" />
            {t('tags.createTag', { name: query.trim() })}
          </Button>
        </div>
      )}

      <div className="p-2 border-t border-[var(--fw-border)] flex gap-2">
        <Button variant="ghost" size="sm" onClick={onClose} className="flex-1 h-7 text-xs">
          {t('common.cancel')}
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving} className="flex-1 h-7 text-xs">
          {t('common.save')}
        </Button>
      </div>
    </div>
  )
}

export function TagBadgeSmall({ tag, onRemove }: { tag: TagDef; onRemove?: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10.5px] font-medium"
      style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
      <span className="truncate max-w-[80px]">{tag.name}</span>
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="ml-0.5 hover:opacity-70"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  )
}

export function TagBadgeDot({ color }: { color: string }) {
  return (
    <span
      className="w-2 h-2 rounded-full flex-shrink-0"
      style={{ backgroundColor: color }}
    />
  )
}