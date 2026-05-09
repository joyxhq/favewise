import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  FolderOpen,
  FolderClosed,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Trash2,
  FolderInput,
  Search,
  X,
  Plus,
  Sparkles,
  ShieldCheck,
  Shield,
  ClipboardCopy,
  FolderPlus as FolderPlusIcon,
  Minimize2,
  Maximize2,
} from 'lucide-react'
import { toast } from 'sonner'
import type { ViewProps } from '../App'
import { Button } from '~/shared/components/ui/button'
import { Checkbox } from '~/shared/components/ui/checkbox'
import { Input } from '~/shared/components/ui/input'
import { EmptyState } from '~/shared/components/patterns/EmptyState'
import { showUndoToast } from '~/shared/components/patterns/undo'
import { ConfirmDialog, PreviewList } from '~/shared/components/patterns/ConfirmDialog'
import { FolderPickerDialog } from '~/shared/components/patterns/FolderPickerDialog'
import { Popover, PopoverTrigger, PopoverContent } from '~/shared/components/ui/popover'
import { TagPicker, TagBadgeSmall, TagBadgeDot } from '~/shared/components/patterns/TagPicker'
import { SmartFolderEditorDialog } from '~/shared/components/patterns/SmartFolderEditorDialog'
import type { TagDef, SmartFolder } from '~/shared/storage/schema'
import { Favicon } from '~/shared/components/patterns/Favicon'
import { StatusBar } from '~/shared/components/patterns/StatusBar'
import { cn } from '~/shared/lib/utils'
import { status } from '~/shared/lib/tokens'
import { send } from '~/shared/lib/messaging'
import { useT } from '~/shared/lib/i18n'
import type { FolderSummary } from '~/shared/types/messages'

type Node = chrome.bookmarks.BookmarkTreeNode

/** Root system-folder IDs we treat as top-level containers (Chrome convention). */
const SYSTEM_ROOT_IDS = new Set(['0'])

function buildProtectedDisplaySet(tree: Node[], protectedRootIds: string[]): Set<string> {
  const roots = new Set(protectedRootIds)
  if (roots.size === 0) return new Set()
  const out = new Set<string>()
  const walk = (nodes: Node[], inherited: boolean) => {
    for (const n of nodes) {
      const on = inherited || roots.has(n.id)
      if (on && !n.url) out.add(n.id)
      if (n.children) walk(n.children, on)
    }
  }
  walk(tree, false)
  return out
}

export default function Library({ scanVersion }: ViewProps) {
  const { t } = useT()
  const [tree, setTree] = useState<Node[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['1', '2']))
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [protectedIds, setProtectedIds] = useState<string[]>([])
  const [folders, setFolders] = useState<FolderSummary[]>([])
  const [tags, setTags] = useState<TagDef[]>([])
  const [bookmarkTags, setBookmarkTags] = useState<Record<string, string[]>>({})
  const [smartFolders, setSmartFolders] = useState<SmartFolder[]>([])

  const [movePickerOpen, setMovePickerOpen] = useState(false)
  const [confirmTrash, setConfirmTrash] = useState<string[] | null>(null)
  const [confirmOpenMany, setConfirmOpenMany] = useState<number | null>(null)
  const [confirmDeleteSmartFolder, setConfirmDeleteSmartFolder] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Drag-and-drop state. `dropHint` tracks the row under the cursor AND
  // whether the drop should insert-before, enter-folder, or insert-after.
  type DropPosition = 'before' | 'into' | 'after'
  const [dropHint, setDropHint] = useState<{ nodeId: string; pos: DropPosition } | null>(null)
  const draggingIdsRef = useRef<string[]>([])
  // Cycle guard: when dragging folders, their own subtrees are off-limits.
  const forbiddenDropTargetsRef = useRef<Set<string>>(new Set())
  // Anchor for Shift+click range selection — the last row selected without
  // a Shift modifier. Reset when selection is cleared.
  const selectionAnchorRef = useRef<string | null>(null)

  // Keyboard navigation focus — separate from selection
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  // Context menu state
  const [menu, setMenu] = useState<
    | {
        x: number
        y: number
        targetKind: 'bookmark' | 'folder'
        targetId: string
        targetLabel: string
        targetUrl?: string
      }
    | null
  >(null)

  // Rename / Edit dialog
  const [editTarget, setEditTarget] = useState<
    | { id: string; kind: 'bookmark' | 'folder'; title: string; url?: string }
    | null
  >(null)

  // New subfolder dialog
  const [newFolderParent, setNewFolderParent] = useState<
    | { id: string; title: string }
    | null
  >(null)

  const [smartFolderEditorOpen, setSmartFolderEditorOpen] = useState(false)
  const [editingSmartFolder, setEditingSmartFolder] = useState<SmartFolder | null>(null)

  const reloadTree = useCallback(async () => {
    try {
      const t = await chrome.bookmarks.getTree()
      setTree(t)
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial + live refresh
  useEffect(() => {
    reloadTree()
    const refetch = () => void reloadTree()
    chrome.bookmarks.onCreated.addListener(refetch)
    chrome.bookmarks.onRemoved.addListener(refetch)
    chrome.bookmarks.onChanged.addListener(refetch)
    chrome.bookmarks.onMoved.addListener(refetch)
    return () => {
      chrome.bookmarks.onCreated.removeListener(refetch)
      chrome.bookmarks.onRemoved.removeListener(refetch)
      chrome.bookmarks.onChanged.removeListener(refetch)
      chrome.bookmarks.onMoved.removeListener(refetch)
    }
  }, [reloadTree])

  useEffect(() => {
    if (scanVersion > 0) reloadTree()
  }, [scanVersion, reloadTree])

  // Protected folder + folder-picker list
  useEffect(() => {
    send('settings.get').then((r) => {
      if (r.ok) setProtectedIds(r.data.protectedFolderIds ?? [])
    })
    send('folders.get').then((r) => {
      if (r.ok) setFolders(r.data)
    })
    send('tags.get').then((r) => {
      if (r.ok) setTags(r.data)
    })
    send('tags.getBookmarkTagsMap').then((r) => {
      if (r.ok) setBookmarkTags(r.data)
    })
    send('smartFolders.get').then((r) => {
      if (r.ok) setSmartFolders(r.data)
    })
  }, [scanVersion])

  useEffect(() => {
    if (query.trim().length < 2) {
      setDebouncedQuery('')
      return
    }
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 250)
    return () => clearTimeout(timer)
  }, [query])

  // Build a flat search index lazily
  const searchIndex = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase()
    if (q.length < 2) return null
    const out: Array<{ id: string; title: string; url: string; path: string[] }> = []
    const walk = (nodes: Node[], path: string[]) => {
      for (const n of nodes) {
        if (n.url) {
          const matchTitle = (n.title ?? '').toLowerCase().includes(q)
          const matchUrl = n.url.toLowerCase().includes(q)
          if (matchTitle || matchUrl) {
            out.push({ id: n.id, title: n.title ?? n.url, url: n.url, path })
          }
        } else if (n.children) {
          const nextPath = n.title ? [...path, n.title] : path
          walk(n.children, nextPath)
        }
      }
    }
    walk(tree, [])
    return out.slice(0, 200)
  }, [debouncedQuery, tree])

  // Total count across the tree — hook must run unconditionally, so compute
  // it here (before any early return) even when the tree is still loading.
  const total = useMemo(() => {
    let n = 0
    const walk = (nodes: Node[]) => {
      for (const a of nodes) {
        if (a.url) n++
        else if (a.children) walk(a.children)
      }
    }
    walk(tree)
    return n
  }, [tree])

  const topChildren: Node[] = tree[0] && !tree[0].url ? (tree[0].children ?? []) : tree

  // Flattened list of currently-visible rows (respecting expanded state).
  // Used for ArrowUp / ArrowDown navigation.
  const flatVisible = useMemo(() => {
    const out: Array<{ id: string; isFolder: boolean; parentId?: string }> = []
    const walk = (nodes: Node[]) => {
      for (const n of nodes) {
        if (SYSTEM_ROOT_IDS.has(n.id)) continue
        out.push({ id: n.id, isFolder: !n.url, parentId: n.parentId })
        if (!n.url && expanded.has(n.id) && n.children) walk(n.children)
      }
    }
    walk(topChildren)
    return out
  }, [topChildren, expanded])

  const selectedIds = useMemo(() => Array.from(selected), [selected])
  const protectedRootSet = useMemo(() => new Set(protectedIds), [protectedIds])
  const protectedDisplaySet = useMemo(
    () => buildProtectedDisplaySet(tree, protectedIds),
    [tree, protectedIds],
  )

  const selectedSummary = useMemo(() => {
    const folders: string[] = []
    const bookmarks: string[] = []
    const protectedRoots: string[] = []
    const unprotectedFolders: string[] = []
    for (const id of selectedIds) {
      const node = findNodeById(tree, id)
      if (!node) continue
      if (node.url) {
        bookmarks.push(id)
      } else {
        folders.push(id)
        if (protectedRootSet.has(id)) protectedRoots.push(id)
        if (!protectedDisplaySet.has(id)) unprotectedFolders.push(id)
      }
    }
    return { folders, bookmarks, protectedRoots, unprotectedFolders }
  }, [selectedIds, tree, protectedRootSet, protectedDisplaySet])

  // ----- Selection helpers -----

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const clearSelection = () => {
    setSelected(new Set())
    selectionAnchorRef.current = null
  }

  // Handles selection clicks on tree rows. Modifier keys:
  //   Shift        → range-select from last anchor to this row
  //   Ctrl / Cmd   → toggle just this row
  //   (no modifier)→ toggle just this row (matches legacy side-panel behavior)
  // In all cases, plain + ctrl clicks update the anchor to the clicked row.
  const handleRowSelectClick = (e: React.MouseEvent, id: string, _isFolder: boolean) => {
    if (e.shiftKey && selectionAnchorRef.current && selectionAnchorRef.current !== id) {
      e.preventDefault()
      const anchor = selectionAnchorRef.current
      const startIdx = flatVisible.findIndex((r) => r.id === anchor)
      const endIdx = flatVisible.findIndex((r) => r.id === id)
      if (startIdx === -1 || endIdx === -1) {
        toggleSelected(id)
      } else {
        const [lo, hi] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx]
        const rangeIds = flatVisible
          .slice(lo, hi + 1)
          .map((r) => r.id)
        setSelected((prev) => {
          const next = new Set(prev)
          for (const rid of rangeIds) next.add(rid)
          return next
        })
      }
      return
    }
    toggleSelected(id)
    selectionAnchorRef.current = id
  }

  /* ---------- Drag & drop ---------- */

  const handleDragStart = useCallback(
    (e: React.DragEvent, nodeId: string) => {
      const ids = selected.has(nodeId) ? Array.from(selected) : [nodeId]
      draggingIdsRef.current = ids
      // Precompute the subtree ids for any dragged folder — dropping into
      // those would form a cycle. Always includes the dragged ids themselves.
      const forbidden = new Set<string>(ids)
      const collect = (nodes: Node[] | undefined) => {
        if (!nodes) return
        for (const n of nodes) {
          forbidden.add(n.id)
          if (n.children) collect(n.children)
        }
      }
      const findNode = (nodes: Node[] | undefined, id: string): Node | null => {
        if (!nodes) return null
        for (const n of nodes) {
          if (n.id === id) return n
          const hit = findNode(n.children, id)
          if (hit) return hit
        }
        return null
      }
      for (const id of ids) {
        const n = findNode(tree, id)
        if (n && !n.url) collect(n.children)
      }
      forbiddenDropTargetsRef.current = forbidden
      try {
        e.dataTransfer.setData('application/x-favewise', JSON.stringify(ids))
        e.dataTransfer.effectAllowed = 'move'
      } catch { /* fallthrough */ }
    },
    [selected, tree],
  )

  const handleDragEnd = useCallback(() => {
    draggingIdsRef.current = []
    forbiddenDropTargetsRef.current = new Set()
    setDropHint(null)
  }, [])

  /**
   * Decide whether the cursor is hovering over the top strip (insert-before),
   * the middle (drop into this folder), or the bottom strip (insert-after).
   * For bookmark rows there's no middle — just a horizontal split at 50%.
   */
  const computeDropPosition = useCallback(
    (e: React.DragEvent, row: HTMLElement, isFolder: boolean): DropPosition => {
      const rect = row.getBoundingClientRect()
      const y = e.clientY - rect.top
      const h = rect.height
      if (isFolder) {
        const topZone = Math.max(4, h * 0.25)
        const bottomZone = Math.max(4, h * 0.25)
        if (y < topZone) return 'before'
        if (y > h - bottomZone) return 'after'
        return 'into'
      }
      return y < h / 2 ? 'before' : 'after'
    },
    [],
  )

  const handleRowDragOver = useCallback(
    (e: React.DragEvent, node: Node, isFolder: boolean) => {
      if (draggingIdsRef.current.length === 0) return
      // Never drop onto the item you're dragging or — for folder drags —
      // anywhere inside its own subtree (would create a cycle).
      if (forbiddenDropTargetsRef.current.has(node.id)) return
      const pos = computeDropPosition(e, e.currentTarget as HTMLElement, isFolder)
      // Reject drop INTO a protected folder; reordering (before/after) is fine
      // because the sibling folder isn't itself touched.
      if (pos === 'into' && protectedDisplaySet.has(node.id)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setDropHint((prev) =>
        prev && prev.nodeId === node.id && prev.pos === pos
          ? prev
          : { nodeId: node.id, pos },
      )
    },
    [computeDropPosition, protectedDisplaySet],
  )

  const handleRowDrop = useCallback(
    async (e: React.DragEvent, node: Node, isFolder: boolean) => {
      e.preventDefault()
      let ids: string[] = draggingIdsRef.current
      if (ids.length === 0) {
        try {
          const raw = e.dataTransfer.getData('application/x-favewise')
          if (raw) ids = JSON.parse(raw) as string[]
        } catch { /* ignore */ }
      }
      const activeDropHint = dropHint
      const pos = activeDropHint?.nodeId === node.id
        ? activeDropHint.pos
        : computeDropPosition(e, e.currentTarget as HTMLElement, isFolder)
      setDropHint(null)
      draggingIdsRef.current = []
      if (ids.length === 0) return
      if (ids.includes(node.id)) return

      // Compute target parent & index
      let targetFolderId: string
      let targetIndex: number | undefined
      if (pos === 'into') {
        targetFolderId = node.id
        targetIndex = undefined
      } else {
        if (!node.parentId) return
        targetFolderId = node.parentId
        const nodeIndex = node.index ?? 0
        targetIndex = pos === 'before' ? nodeIndex : nodeIndex + 1
      }

      setBusy(true)
      try {
        const res = await send('library.move', {
          bookmarkIds: ids,
          targetFolderId,
          targetIndex,
        })
        if (res.ok) {
          const { movedCount, protectedSkipped } = res.data
          if (protectedSkipped > 0) {
            toast.warning(
              `${t('toast.movedN', { count: movedCount })} · ${t('common.protectedSkippedN', { count: protectedSkipped })}`,
            )
          } else if (pos === 'into') {
            toast.success(t('toast.movedN', { count: movedCount }))
          } else {
            toast.success(t('toast.reorderedN', { count: movedCount }))
          }
          clearSelection()
        } else {
          toast.error(res.error.message)
        }
      } finally {
        setBusy(false)
      }
    },
    [dropHint, computeDropPosition, t],
  )

  /* ---------- Keyboard navigation ---------- */

  const anyDialogOpen =
    !!menu ||
    !!editTarget ||
    !!newFolderParent ||
    !!confirmTrash ||
    movePickerOpen

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null
      // Never hijack typing in inputs
      if (tgt && tgt.matches('input, textarea, [contenteditable="true"]')) {
        // Exception: Esc in the search input clears it
        if (e.key === 'Escape' && tgt === searchInputRef.current) {
          setQuery('')
          tgt.blur()
          e.preventDefault()
        }
        return
      }
      // Never fight command palette / global modals
      if (anyDialogOpen) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      if (flatVisible.length === 0) return
      const curIdx = focusedId
        ? flatVisible.findIndex((r) => r.id === focusedId)
        : -1

      switch (e.key) {
        case 'ArrowDown':
        case 'j': {
          e.preventDefault()
          const next = flatVisible[Math.min(curIdx + 1, flatVisible.length - 1)]
          if (next) {
            // Shift+ArrowDown → extend selection with the newly-focused bookmark
            if (e.shiftKey && focusedId && !next.isFolder) {
              if (!selectionAnchorRef.current) selectionAnchorRef.current = focusedId
              setSelected((prev) => new Set(prev).add(next.id))
            }
            setFocusedId(next.id)
            scrollRowIntoView(next.id)
          } else if (curIdx === -1 && flatVisible[0]) {
            setFocusedId(flatVisible[0].id)
            scrollRowIntoView(flatVisible[0].id)
          }
          break
        }
        case 'ArrowUp':
        case 'k': {
          e.preventDefault()
          const prev = flatVisible[Math.max(curIdx - 1, 0)]
          if (prev) {
            if (e.shiftKey && focusedId && !prev.isFolder) {
              if (!selectionAnchorRef.current) selectionAnchorRef.current = focusedId
              setSelected((prevSel) => new Set(prevSel).add(prev.id))
            }
            setFocusedId(prev.id)
            scrollRowIntoView(prev.id)
          }
          break
        }
        case 'ArrowRight':
        case 'l': {
          if (!focusedId) return
          const row = flatVisible[curIdx]
          if (!row?.isFolder) return
          e.preventDefault()
          if (!expanded.has(focusedId)) {
            setExpanded((prev) => new Set(prev).add(focusedId))
          } else {
            // Already expanded — step into first child
            const childIdx = curIdx + 1
            const child = flatVisible[childIdx]
            if (child && child.parentId === focusedId) {
              setFocusedId(child.id)
              scrollRowIntoView(child.id)
            }
          }
          break
        }
        case 'ArrowLeft':
        case 'h': {
          if (!focusedId) return
          const row = flatVisible[curIdx]
          e.preventDefault()
          if (row?.isFolder && expanded.has(focusedId)) {
            setExpanded((prev) => {
              const next = new Set(prev)
              next.delete(focusedId)
              return next
            })
          } else if (row?.parentId) {
            // Step out to parent
            setFocusedId(row.parentId)
            scrollRowIntoView(row.parentId)
          }
          break
        }
        case 'Enter': {
          if (!focusedId) return
          e.preventDefault()
          const row = flatVisible[curIdx]
          if (!row) return
          if (row.isFolder) {
            setExpanded((prev) => {
              const next = new Set(prev)
              next.has(focusedId) ? next.delete(focusedId) : next.add(focusedId)
              return next
            })
          } else {
            const node = findNodeById(tree, focusedId)
            if (node?.url) void chrome.tabs.create({ url: node.url })
          }
          break
        }
        case ' ': {
          if (!focusedId) return
          e.preventDefault()
          toggleSelected(focusedId)
          selectionAnchorRef.current = focusedId
          break
        }
        case 'Delete':
        case 'Backspace': {
          const focused = focusedId ? findNodeById(tree, focusedId) : undefined
          const ids = selected.size > 0
            ? selectedSummary.bookmarks
            : focused?.url
              ? [focusedId!]
              : []
          if (ids.length === 0) return
          e.preventDefault()
          setConfirmTrash(ids)
          break
        }
        case 'Escape': {
          if (selected.size > 0) {
            e.preventDefault()
            clearSelection()
          } else if (focusedId) {
            e.preventDefault()
            setFocusedId(null)
            selectionAnchorRef.current = null
          }
          break
        }
        case '/': {
          e.preventDefault()
          searchInputRef.current?.focus()
          searchInputRef.current?.select()
          break
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [anyDialogOpen, flatVisible, focusedId, expanded, selected, tree, selectedSummary.bookmarks])

  /* ---------- Context menu helpers ---------- */

  const closeMenu = useCallback(() => setMenu(null), [])

  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('[data-fw-menu="1"]')) return
      closeMenu()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeMenu() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu, closeMenu])

  const handleMenuOpenFolder = (folderId: string) => {
    // Expand the folder and all descendants
    setExpanded((prev) => {
      const next = new Set(prev)
      const walk = (nodes: Node[]) => {
        for (const n of nodes) {
          if (!n.url) {
            next.add(n.id)
            if (n.children) walk(n.children)
          }
        }
      }
      const root = findNodeById(tree, folderId)
      if (root) walk([root])
      return next
    })
  }

  const handleMenuCollapse = (folderId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.delete(folderId)
      return next
    })
  }

  const handleMenuToggleProtect = async (folderId: string) => {
    const on = !protectedIds.includes(folderId)
    const next = on
      ? [...protectedIds, folderId]
      : protectedIds.filter((x) => x !== folderId)
    setProtectedIds(next)
    const res = await send('settings.update', { protectedFolderIds: next })
    if (res.ok) {
      toast.success(on ? t('lib.folderProtected') : t('lib.folderUnprotected'))
    } else {
      setProtectedIds(protectedIds)
      toast.error(t('organize.protectionFailed'))
    }
  }

  const handleBulkProtect = async (protect: boolean) => {
    const folderIds = protect
      ? selectedSummary.unprotectedFolders
      : selectedSummary.protectedRoots
    if (folderIds.length === 0) return

    const next = protect
      ? Array.from(new Set([...protectedIds, ...folderIds]))
      : protectedIds.filter((id) => !folderIds.includes(id))

    setBusy(true)
    setProtectedIds(next)
    try {
      const res = await send('settings.update', { protectedFolderIds: next })
      if (res.ok) {
        toast.success(
          protect
            ? t('lib.protectedFoldersN', { count: folderIds.length })
            : t('lib.unprotectedFoldersN', { count: folderIds.length }),
        )
        clearSelection()
      } else {
        setProtectedIds(protectedIds)
        toast.error(t('organize.protectionFailed'))
      }
    } finally {
      setBusy(false)
    }
  }

  const handleMenuCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t('toast.urlCopied'))
    } catch {
      toast.error(t('toast.clipboardDenied'))
    }
  }

  const handleMenuOpen = async (url: string, inNewWindow = false) => {
    if (inNewWindow) await chrome.windows.create({ url })
    else await chrome.tabs.create({ url })
  }

  const handleSaveEdit = useCallback(
    async (patch: { title: string; url?: string }) => {
      if (!editTarget) return
      setBusy(true)
      try {
        const payload: { title: string; url?: string } = { title: patch.title }
        if (editTarget.kind === 'bookmark' && patch.url) payload.url = patch.url
        await chrome.bookmarks.update(editTarget.id, payload)
        setEditTarget(null)
        toast.success(
          editTarget.kind === 'folder'
            ? t('lib.folderRenamed')
            : t('lib.bookmarkUpdated'),
        )
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('common.updateFailed'))
      } finally {
        setBusy(false)
      }
    },
    [editTarget],
  )

  const handleCreateSubfolder = useCallback(
    async (title: string) => {
      if (!newFolderParent) return
      const name = title.trim()
      if (!name) return
      setBusy(true)
      try {
        const created = await chrome.bookmarks.create({
          parentId: newFolderParent.id,
          title: name,
        })
        // Auto-expand the parent so the new folder is visible
        setExpanded((prev) => new Set(prev).add(newFolderParent.id).add(created.id))
        setNewFolderParent(null)
        toast.success(t('lib.folderCreated', { name }))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('lib.createFolderFailed'))
      } finally {
        setBusy(false)
      }
    },
    [newFolderParent, t],
  )

  const handleOpenAll = async () => {
    // Collect URLs from the tree by ID
    const urlById = new Map<string, string>()
    const walk = (nodes: Node[]) => {
      for (const n of nodes) {
        if (n.url) urlById.set(n.id, n.url)
        else if (n.children) walk(n.children)
      }
    }
    walk(tree)
    const toOpen = selectedIds
      .map((id) => urlById.get(id))
      .filter((u): u is string => !!u)
    if (toOpen.length === 0) return
    if (toOpen.length > 8) {
      setConfirmOpenMany(toOpen.length)
      return
    }
    for (const url of toOpen) await chrome.tabs.create({ url, active: false })
    toast.success(t('toast.openedN', { count: toOpen.length }))
  }

  const handleMove = async (targetIds: string[]) => {
    const target = targetIds[0]
    if (!target) return
    const ids = selectedSummary.bookmarks.filter(Boolean)
    if (ids.length === 0) return
    const idSnapshot = [...ids]
    showUndoToast({
      message: t('toast.movedN', { count: idSnapshot.length }),
      undoLabel: t('common.undo'),
      durationMs: 5000,
      onCommit: async () => {
        setBusy(true)
        try {
          const res = await send('library.move', {
            bookmarkIds: idSnapshot,
            targetFolderId: target,
          })
          if (res.ok) {
            const { movedCount, protectedSkipped } = res.data
            if (protectedSkipped > 0) {
              toast.warning(
                `${t('toast.movedN', { count: movedCount })} · ${t('common.protectedSkippedN', { count: protectedSkipped })}`,
              )
            } else {
              toast.success(t('toast.movedN', { count: movedCount }))
            }
            clearSelection()
          } else {
            toast.error(res.error.message)
          }
        } finally {
          setBusy(false)
        }
      },
    })
  }

  const handleConfirmedOpenMany = async () => {
    const count = confirmOpenMany ?? 0
    setConfirmOpenMany(null)
    if (count === 0) return
    const urlById = new Map<string, string>()
    const walk = (nodes: Node[]) => {
      for (const n of nodes) {
        if (n.url) urlById.set(n.id, n.url)
        if (n.children) walk(n.children)
      }
    }
    walk(tree)
    const toOpen = selectedIds
      .map((id) => urlById.get(id))
      .filter((u): u is string => !!u)
    for (const url of toOpen) await chrome.tabs.create({ url, active: false })
    toast.success(t('toast.openedN', { count: toOpen.length }))
  }

  const handleConfirmedTrash = async () => {
    const ids = confirmTrash ?? []
    setConfirmTrash(null)
    if (ids.length === 0) return
    const idSnapshot = [...ids]
    showUndoToast({
      message: t('toast.trashedN', { count: idSnapshot.length }),
      undoLabel: t('common.undo'),
      durationMs: 5000,
      onCommit: async () => {
        setBusy(true)
        try {
          const res = await send('library.trash', { bookmarkIds: idSnapshot })
          if (res.ok) {
            const { trashedCount, protectedSkipped } = res.data
            if (protectedSkipped > 0) {
              toast.warning(
                `${t('toast.trashedN', { count: trashedCount })} · ${t('common.protectedSkippedN', { count: protectedSkipped })}`,
              )
            } else {
              toast.success(t('toast.trashedN', { count: trashedCount }))
            }
            clearSelection()
          } else {
            toast.error(res.error.message)
          }
        } finally {
          setBusy(false)
        }
      },
    })
  }

  // ----- Render -----

  if (loading) {
    return (
      <div className="p-3">
        <p className="text-xs text-[var(--fw-text-subtle)]">{t('lib.loading')}</p>
      </div>
    )
  }

  if (total === 0) {
    return (
      <EmptyState
        Icon={FolderOpen}
        tone="accent"
        title={t('lib.emptyTitle')}
        description={t('lib.emptyBody')}
      />
    )
  }

  const selectedBookmarkCount = selectedSummary.bookmarks.length
  const selectedFolderCount = selectedSummary.folders.length
  const selectionDetail = [
    selectedBookmarkCount > 0 ? t('common.bookmarksN', { count: selectedBookmarkCount }) : '',
    selectedFolderCount > 0 ? t('common.foldersN', { count: selectedFolderCount }) : '',
  ].filter(Boolean).join(' · ')

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <StatusBar
        tone="accent"
        label={t('lib.totalN', { count: total })}
        hint={
          query.trim().length >= 2
            ? t('lib.matchesN', { count: searchIndex?.length ?? 0 })
            : protectedIds.length > 0
              ? `${t('lib.protectedRootsN', { count: protectedIds.length })} · ${t('lib.browseHint')}`
              : t('lib.browseHint')
        }
      />

      {/* Search */}
      <div className="px-3 pt-2.5 pb-2 border-b border-[var(--fw-border)] flex-shrink-0 flex items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--fw-text-subtle)]" />
          <Input
            ref={searchInputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('lib.searchPlaceholder')}
            className="pl-7 pr-7 h-7"
            aria-label={t('lib.searchPlaceholder')}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label={t('common.clear')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--fw-text-subtle)] hover:text-[var(--fw-text)]"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Tree or flat search */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {searchIndex ? (
          <div className="divide-y divide-[var(--fw-border)]">
            {searchIndex.length === 0 ? (
              <p className="p-4 text-xs text-[var(--fw-text-subtle)] text-center">
                {t('lib.noneMatch', { query })}
              </p>
            ) : (
              searchIndex.map((item) => {
                const itemTags = (bookmarkTags[item.id] ?? []).map(tid => tags.find(t => t.id === tid)).filter(Boolean) as TagDef[]
                return (
                  <BookmarkRow
                    key={item.id}
                    id={item.id}
                    title={item.title}
                    url={item.url}
                    path={item.path.join(' / ')}
                    selected={selected.has(item.id)}
                    onClick={(e) => handleRowSelectClick(e, item.id, false)}
                    protectedFlag={false}
                    tags={itemTags}
                  />
                )
              })
            )}
          </div>
        ) : (
          <div className="py-1">
            {smartFolders.map(folder => (
              <SmartFolderNode
                key={folder.id}
                folder={folder}
                expanded={expanded}
                setExpanded={setExpanded}
                selected={selected}
                toggleSelected={toggleSelected}
                onFocusRow={(id) => setFocusedId(id)}
                focusedId={focusedId}
                tags={tags}
                bookmarkTags={bookmarkTags}
                onEdit={(f) => {
                  setEditingSmartFolder(f)
                  setSmartFolderEditorOpen(true)
                }}
                onDelete={(id) => {
                  setConfirmDeleteSmartFolder(id)
                }}
              />
            ))}
            {topChildren.map((n) => (
              <TreeNode
                key={n.id}
                node={n}
                depth={0}
                expanded={expanded}
                setExpanded={setExpanded}
                selected={selected}
                toggleSelected={toggleSelected}
                onRowSelectClick={handleRowSelectClick}
                protectedIds={protectedDisplaySet}
                dropHint={dropHint}
                focusedId={focusedId}
                onFocusRow={(id) => setFocusedId(id)}
                onDragStartBookmark={handleDragStart}
                onDragEndBookmark={handleDragEnd}
                onRowDragOver={handleRowDragOver}
                onRowDragLeave={() => setDropHint(null)}
                onRowDrop={handleRowDrop}
                tags={tags}
                bookmarkTags={bookmarkTags}
                onContextMenuBookmark={(e, node) => {
                  e.preventDefault()
                  setMenu({
                    x: e.clientX,
                    y: e.clientY,
                    targetKind: 'bookmark',
                    targetId: node.id,
                    targetLabel: node.title || node.url || '',
                    targetUrl: node.url,
                  })
                }}
                onContextMenuFolder={(e, node) => {
                  e.preventDefault()
                  setMenu({
                    x: e.clientX,
                    y: e.clientY,
                    targetKind: 'folder',
                    targetId: node.id,
                    targetLabel: node.title || '',
                  })
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div
          data-fw-selection-bar
          className="flex-shrink-0 border-t border-[var(--fw-border)] bg-[var(--fw-surface)] px-3 py-2 shadow-[0_-8px_18px_-16px_oklch(22%_0.02_40_/_28%)] overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="min-w-0 flex items-baseline gap-2">
              <p className="text-xs font-semibold text-[var(--fw-text)] whitespace-nowrap">
                {t('common.selected', { count: selected.size })}
              </p>
              {selectionDetail && (
                <p className="text-[10.5px] text-[var(--fw-text-subtle)] truncate whitespace-nowrap">
                  {selectionDetail}
                </p>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={clearSelection} className="h-7 px-2 text-[11px] whitespace-nowrap flex-shrink-0">
              {t('common.clear')}
            </Button>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center justify-end gap-1.5">
            <Button
              data-fw-smart-folder-create
              variant="outline"
              size="icon-sm"
              onClick={() => {
                setEditingSmartFolder(null)
                setSmartFolderEditorOpen(true)
              }}
              className="h-7 w-7 flex-shrink-0"
              title={t('smartFolder.new')}
              aria-label={t('smartFolder.new')}
            >
              <Sparkles className="h-3.5 w-3.5" />
            </Button>
            {selectedBookmarkCount > 0 && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleOpenAll}
                  disabled={busy}
                  className="gap-1 h-7 px-2 text-[11px] whitespace-nowrap"
                >
                  <ExternalLink className="h-3 w-3" />
                  {t('common.open')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMovePickerOpen(true)}
                  disabled={busy}
                  className="gap-1 h-7 px-2 text-[11px] whitespace-nowrap"
                >
                  <FolderInput className="h-3 w-3" />
                  {t('common.move')}
                </Button>
              </>
            )}
            {selectedSummary.unprotectedFolders.length > 0 && (
              <Button
                data-fw-bulk-protect
                variant="outline"
                size="sm"
                onClick={() => void handleBulkProtect(true)}
                disabled={busy}
                className="gap-1 h-7 px-2 text-[11px] whitespace-nowrap"
              >
                <ShieldCheck className="h-3 w-3" />
                {t('lib.protectSelected')}
              </Button>
            )}
            {selectedSummary.protectedRoots.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleBulkProtect(false)}
                disabled={busy}
                className="gap-1 h-7 px-2 text-[11px] whitespace-nowrap"
              >
                <Shield className="h-3 w-3" />
                {t('lib.unprotectSelected')}
              </Button>
            )}
            {selectedBookmarkCount > 0 && (
              <Button
                data-fw-bulk-trash
                variant="destructive"
                size="sm"
                onClick={() => setConfirmTrash(selectedSummary.bookmarks)}
                disabled={busy}
                className="gap-1 h-7 px-2 text-[11px] whitespace-nowrap"
              >
                <Trash2 className="h-3 w-3" />
                {t('common.trash')}
              </Button>
            )}
          </div>
        </div>
      )}

      <FolderPickerDialog
        open={movePickerOpen}
        onOpenChange={setMovePickerOpen}
        title={t('lib.moveSelectedTitle', { count: selectedSummary.bookmarks.length })}
        description={t('lib.movePickerDesc')}
        value={[]}
        onChange={handleMove}
        valueKey="id"
        multiple={false}
        confirmLabel={t('common.move')}
        folders={folders.filter((f) => !protectedDisplaySet.has(f.id))}
      />

      <ConfirmDialog
        open={!!confirmTrash}
        onOpenChange={(o) => !o && setConfirmTrash(null)}
        title={t('lib.confirmTrashTitle', { count: confirmTrash?.length ?? 0 })}
        description={t('lib.confirmTrashDesc')}
        preview={
          confirmTrash && (
            <PreviewList
              items={confirmTrash.slice(0, 6).map((id) => {
                const item = findNodeById(tree, id)
                return (
                  <span className="truncate font-medium">
                    {item?.title || item?.url || id}
                  </span>
                )
              })}
            />
          )
        }
        confirmLabel={t('common.moveToTrash')}
        ConfirmIcon={Trash2}
        tone="danger"
        onConfirm={handleConfirmedTrash}
        busy={busy}
      />

      <ConfirmDialog
        open={confirmOpenMany !== null}
        onOpenChange={(o) => !o && setConfirmOpenMany(null)}
        title={t('lib.openManyConfirm', { count: confirmOpenMany ?? 0 })}
        confirmLabel={t('common.open')}
        tone="info"
        onConfirm={handleConfirmedOpenMany}
      />

      <ConfirmDialog
        open={confirmDeleteSmartFolder !== null}
        onOpenChange={(o) => !o && setConfirmDeleteSmartFolder(null)}
        title={t('smartFolder.deleteConfirmTitle')}
        description={t('tags.deleteConfirm')}
        confirmLabel={t('common.delete')}
        tone="danger"
        ConfirmIcon={Trash2}
        onConfirm={async () => {
          const id = confirmDeleteSmartFolder
          setConfirmDeleteSmartFolder(null)
          if (!id) return
          await send('smartFolders.delete', { id })
          const r = await send('smartFolders.get')
          if (r.ok) setSmartFolders(r.data)
        }}
      />

      {menu && (
        <ContextMenuPopup
          x={menu.x}
          y={menu.y}
          targetKind={menu.targetKind}
          targetId={menu.targetId}
          targetLabel={menu.targetLabel}
          targetUrl={menu.targetUrl}
          selectedCount={selected.size}
          protectionState={
            protectedRootSet.has(menu.targetId)
              ? 'root'
              : protectedDisplaySet.has(menu.targetId)
                ? 'inherited'
                : 'none'
          }
          onClose={closeMenu}
          onOpen={(url, newWindow) => {
            closeMenu()
            void handleMenuOpen(url, newWindow)
          }}
          onMove={() => {
            closeMenu()
            if (!selected.has(menu.targetId)) {
              setSelected(new Set([menu.targetId]))
            }
            setMovePickerOpen(true)
          }}
          onTrash={() => {
            closeMenu()
            const ids =
              selected.has(menu.targetId) && selectedSummary.bookmarks.includes(menu.targetId)
                ? selectedSummary.bookmarks
                : [menu.targetId]
            setConfirmTrash(ids)
          }}
          onCopyUrl={(url) => {
            closeMenu()
            void handleMenuCopyUrl(url)
          }}
          onToggleProtect={() => {
            closeMenu()
            void handleMenuToggleProtect(menu.targetId)
          }}
          onExpandAll={() => {
            closeMenu()
            handleMenuOpenFolder(menu.targetId)
          }}
          onCollapse={() => {
            closeMenu()
            handleMenuCollapse(menu.targetId)
          }}
          onRename={() => {
            closeMenu()
            setEditTarget({
              id: menu.targetId,
              kind: menu.targetKind,
              title: menu.targetLabel,
              url: menu.targetUrl,
            })
          }}
          onNewSubfolder={() => {
            closeMenu()
            setNewFolderParent({ id: menu.targetId, title: menu.targetLabel })
          }}
        />
      )}

      <EditNodeDialog
        target={editTarget}
        onClose={() => setEditTarget(null)}
        onSave={handleSaveEdit}
        busy={busy}
        initialTags={editTarget ? (bookmarkTags[editTarget.id] ?? []).map(tid => tags.find(t => t.id === tid)).filter(Boolean) as TagDef[] : undefined}
        onTagsChange={(newTags) => {
          if (editTarget) {
            setBookmarkTags(prev => ({ ...prev, [editTarget.id]: newTags.map(t => t.id) }))
          }
        }}
      />

      <NewFolderDialog
        parent={newFolderParent}
        onClose={() => setNewFolderParent(null)}
        onCreate={handleCreateSubfolder}
        busy={busy}
      />

      <SmartFolderEditorDialog
        open={smartFolderEditorOpen}
        onOpenChange={setSmartFolderEditorOpen}
        folder={editingSmartFolder}
        onSave={() => {
          // Re-fetch smart folders
          send('smartFolders.get').then((r) => {
            if (r.ok) setSmartFolders(r.data)
          })
        }}
      />
    </div>
  )
}

/* ---------- Context menu popup ---------- */

function ContextMenuPopup(props: {
  x: number
  y: number
  targetKind: 'bookmark' | 'folder'
  targetId: string
  targetLabel: string
  targetUrl?: string
  selectedCount: number
  protectionState: 'none' | 'root' | 'inherited'
  onClose: () => void
  onOpen: (url: string, newWindow: boolean) => void
  onMove: () => void
  onTrash: () => void
  onCopyUrl: (url: string) => void
  onToggleProtect: () => void
  onExpandAll: () => void
  onCollapse: () => void
  onRename: () => void
  onNewSubfolder: () => void
}) {
  const { t } = useT()
  const {
    x, y, targetKind, targetLabel, targetUrl, selectedCount,
    protectionState, onOpen, onMove, onTrash, onCopyUrl, onToggleProtect,
    onExpandAll, onCollapse, onRename, onNewSubfolder,
  } = props

  // Clamp to viewport
  const style: React.CSSProperties = useMemo(() => {
    const w = 220
    const maxLeft = window.innerWidth - w - 8
    const maxTop = window.innerHeight - 260
    return {
      position: 'fixed',
      left: Math.max(8, Math.min(x, maxLeft)),
      top: Math.max(8, Math.min(y, maxTop)),
      width: w,
      zIndex: 60,
    }
  }, [x, y])

  return (
    <div
      data-fw-menu="1"
      style={style}
      role="menu"
      aria-label={t('common.actionsFor', { name: targetLabel })}
      className="rounded-[var(--fw-radius-md)] border border-[var(--fw-border)] bg-[var(--fw-surface)] shadow-[var(--fw-shadow-lg)] py-1"
    >
      <div className="px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--fw-text-subtle)] truncate">
        {selectedCount > 1 ? t('common.selected', { count: selectedCount }) : targetLabel}
      </div>

      {targetKind === 'bookmark' && targetUrl && (
        <>
          <MenuItem Icon={ExternalLink} label={t('lib.openInNewTab')} onClick={() => onOpen(targetUrl, false)} />
          <MenuItem Icon={Maximize2} label={t('lib.openInNewWindow')} onClick={() => onOpen(targetUrl, true)} />
          <MenuItem Icon={ClipboardCopy} label={t('lib.copyUrl')} onClick={() => onCopyUrl(targetUrl)} />
          <div className="h-px my-1 bg-[var(--fw-border)]" />
          <MenuItem Icon={FolderInput} label={t('common.move')} onClick={onMove} />
          <MenuItem Icon={FolderPlusIcon} label={t('lib.editBookmark')} onClick={onRename} />
          <MenuItem Icon={Trash2} label={t('common.trash')} danger onClick={onTrash} />
        </>
      )}

      {targetKind === 'folder' && (
        <>
          <MenuItem Icon={Maximize2} label={t('lib.expandAll')} onClick={onExpandAll} />
          <MenuItem Icon={Minimize2} label={t('lib.collapse')} onClick={onCollapse} />
          <div className="h-px my-1 bg-[var(--fw-border)]" />
          <MenuItem Icon={FolderPlusIcon} label={t('lib.newSubfolder')} onClick={onNewSubfolder} />
          <MenuItem Icon={FolderInput} label={t('lib.renameFolder')} onClick={onRename} />
          {protectionState === 'inherited' ? (
            <MenuItem Icon={ShieldCheck} label={t('lib.protectedByParent')} disabled />
          ) : (
            <MenuItem
              Icon={protectionState === 'root' ? Shield : ShieldCheck}
              label={protectionState === 'root' ? t('protect.unprotect') : t('protect.protect')}
              onClick={onToggleProtect}
            />
          )}
        </>
      )}
    </div>
  )
}

/* ---------- Rename / Edit bookmark dialog ---------- */

function EditNodeDialog({
  target,
  onClose,
  onSave,
  busy,
  initialTags,
  onTagsChange,
}: {
  target: { id: string; kind: 'bookmark' | 'folder'; title: string; url?: string } | null
  onClose: () => void
  onSave: (patch: { title: string; url?: string }) => void
  busy: boolean
  initialTags?: TagDef[]
  onTagsChange?: (tags: TagDef[]) => void
}) {
  const { t } = useT()
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [localTags, setLocalTags] = useState<TagDef[]>([])
  const [tagPickerOpen, setTagPickerOpen] = useState(false)

  useEffect(() => {
    if (target) {
      setTitle(target.title)
      setUrl(target.url ?? '')
      setLocalTags(initialTags ?? [])
    }
  }, [target, initialTags])

  if (!target) return null
  const isBookmark = target.kind === 'bookmark'

  const submit = () => {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) return
    if (isBookmark) {
      const trimmedUrl = url.trim()
      if (!trimmedUrl) return
      onSave({ title: trimmedTitle, url: trimmedUrl })
    } else {
      onSave({ title: trimmedTitle })
    }
  }

  return (
    <ConfirmDialog
      open={!!target}
      onOpenChange={(o) => !o && onClose()}
      title={isBookmark ? t('lib.editTitle') : t('lib.renameFolderTitle')}
      description={isBookmark ? t('lib.editDesc') : undefined}
      preview={
        <div className="space-y-2">
          <div>
            <label className="block text-[11px] font-medium mb-1">{t('lib.fieldTitle')}</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              aria-label={t('lib.fieldTitle')}
            />
          </div>
          {isBookmark && (
            <div>
              <label className="block text-[11px] font-medium mb-1">{t('lib.fieldUrl')}</label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                aria-label={t('lib.fieldUrl')}
                className="font-mono text-[11px]"
              />
            </div>
          )}
          {isBookmark && (
            <div>
              <label className="block text-[11px] font-medium mb-1">{t('tags.bookmarkTags')}</label>
              <div className="flex flex-wrap gap-1.5 items-center min-h-7">
                {localTags.map(tag => (
                  <TagBadgeSmall 
                    key={tag.id} 
                    tag={tag} 
                    onRemove={() => {
                      const next = localTags.filter(t => t.id !== tag.id)
                      setLocalTags(next)
                      // Immediately unassign in background
                      send('tags.unassign', { bookmarkId: target.id, tagIds: [tag.id] })
                      onTagsChange?.(next)
                    }} 
                  />
                ))}
                <Popover open={tagPickerOpen} onOpenChange={setTagPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-5 px-1.5 text-[10px] rounded-full gap-1">
                      <Plus className="h-2.5 w-2.5" />
                      {t('tags.addTag')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto p-0 border-0 shadow-none bg-transparent">
                    <TagPicker 
                      bookmarkId={target.id}
                      currentTags={localTags}
                      onClose={() => setTagPickerOpen(false)}
                      onChange={(newTags) => {
                        setLocalTags(newTags)
                        onTagsChange?.(newTags)
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}
        </div>
      }
      confirmLabel={t('common.save')}
      onConfirm={submit}
      busy={busy}
      tone="accent"
    />
  )
}

/* ---------- New subfolder dialog ---------- */

function NewFolderDialog({
  parent,
  onClose,
  onCreate,
  busy,
}: {
  parent: { id: string; title: string } | null
  onClose: () => void
  onCreate: (title: string) => void
  busy: boolean
}) {
  const { t } = useT()
  const [title, setTitle] = useState('')

  useEffect(() => {
    if (parent) setTitle('')
  }, [parent])

  if (!parent) return null

  return (
    <ConfirmDialog
      open={!!parent}
      onOpenChange={(o) => !o && onClose()}
      title={t('lib.newFolderIn', { parent: parent.title })}
      preview={
        <div>
          <label className="block text-[11px] font-medium mb-1">{t('lib.fieldName')}</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && onCreate(title)}
            aria-label={t('lib.fieldName')}
            placeholder={t('lib.folderNamePlaceholder')}
          />
        </div>
      }
      confirmLabel={t('lib.create')}
      ConfirmIcon={FolderPlusIcon}
      onConfirm={() => onCreate(title)}
      busy={busy || !title.trim()}
      tone="accent"
    />
  )
}

function MenuItem({
  Icon,
  label,
  onClick,
  danger,
  disabled,
}: {
  Icon: React.ComponentType<{ className?: string }>
  label: string
  onClick?: () => void
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
        danger
          ? 'text-[var(--fw-danger-text)] hover:bg-[var(--fw-danger-soft)]'
          : 'hover:bg-[var(--fw-bg-subtle)]',
      )}
    >
      <Icon className="h-3 w-3 flex-shrink-0" />
      {label}
    </button>
  )
}

/* ---------- Tree render ---------- */

interface TreeNodeProps {
  node: Node
  depth: number
  expanded: Set<string>
  setExpanded: (fn: (prev: Set<string>) => Set<string>) => void
  selected: Set<string>
  toggleSelected: (id: string) => void
  onRowSelectClick: (e: React.MouseEvent, id: string, isFolder: boolean) => void
  protectedIds: Set<string>
  dropHint: { nodeId: string; pos: 'before' | 'into' | 'after' } | null
  focusedId: string | null
  onFocusRow: (id: string) => void
  onDragStartBookmark: (e: React.DragEvent, id: string) => void
  onDragEndBookmark: () => void
  onRowDragOver: (e: React.DragEvent, node: Node, isFolder: boolean) => void
  onRowDragLeave: () => void
  onRowDrop: (e: React.DragEvent, node: Node, isFolder: boolean) => void
  onContextMenuBookmark: (e: React.MouseEvent, node: Node) => void
  onContextMenuFolder: (e: React.MouseEvent, node: Node) => void
  tags: TagDef[]
  bookmarkTags: Record<string, string[]>
}

function SmartFolderNode({
  folder,
  expanded,
  setExpanded,
  selected,
  toggleSelected,
  onFocusRow,
  focusedId,
  tags,
  bookmarkTags,
  onEdit,
  onDelete,
}: {
  folder: SmartFolder
  expanded: Set<string>
  setExpanded: (fn: (prev: Set<string>) => Set<string>) => void
  selected: Set<string>
  toggleSelected: (id: string) => void
  onFocusRow: (id: string) => void
  focusedId: string | null
  tags: TagDef[]
  bookmarkTags: Record<string, string[]>
  onEdit: (folder: SmartFolder) => void
  onDelete: (id: string) => void
}) {
  const { t } = useT()
  const isOpen = expanded.has(folder.id)
  const isFocused = focusedId === folder.id
  const isSelected = selected.has(folder.id)
  const [children, setChildren] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setLoading(true)
      send('smartFolders.evaluate', { id: folder.id }).then(res => {
        if (res.ok) {
          if (res.data.bookmarkIds.length === 0) {
            setChildren([])
            setLoading(false)
          } else {
            chrome.bookmarks.get(res.data.bookmarkIds as [string, ...string[]]).then(nodes => {
              setChildren(nodes)
              setLoading(false)
            })
          }
        }
      })
    }
  }, [isOpen, folder.id])

  return (
    <div className="relative group/sf">
      <div
        data-fw-row-id={folder.id}
        role="button"
        tabIndex={0}
        onClick={(e) => {
          onFocusRow(folder.id)
          setExpanded((prev) => {
            const next = new Set(prev)
            next.has(folder.id) ? next.delete(folder.id) : next.add(folder.id)
            return next
          })
        }}
        className={cn(
          'w-full flex items-center gap-1.5 px-2 py-1 text-left transition-colors cursor-pointer select-none',
          isSelected ? 'bg-[var(--fw-accent-soft)]' : isFocused ? 'bg-[var(--fw-bg-subtle)] ring-1 ring-inset ring-[color-mix(in_oklch,var(--fw-accent)_55%,transparent)]' : 'hover:bg-[var(--fw-bg-subtle)]',
        )}
        style={{ paddingLeft: '8px' }}
      >
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => {}}
          onClick={(e) => {
            e.stopPropagation()
            toggleSelected(folder.id)
            onFocusRow(folder.id)
          }}
          aria-label={t('smartFolder.selectAria', { name: folder.name })}
          className="flex-shrink-0"
        />
        {isOpen ? (
          <ChevronDown className="h-3 w-3 text-[var(--fw-text-subtle)] flex-shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-[var(--fw-text-subtle)] flex-shrink-0" />
        )}
        <Sparkles className="h-3.5 w-3.5 text-[var(--fw-accent)] flex-shrink-0" />
        <span className="text-xs font-medium truncate flex-1">{folder.name}</span>
        
        <div className="opacity-0 group-hover/sf:opacity-100 flex items-center pr-2 gap-1 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(folder) }}
            className="p-1 hover:bg-[var(--fw-surface-2)] rounded text-[var(--fw-text-subtle)] hover:text-[var(--fw-text)]"
            title={t('common.edit')}
          >
            <FolderInput className="h-3 w-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(folder.id) }}
            className="p-1 hover:bg-[var(--fw-danger-soft)] rounded text-[var(--fw-text-subtle)] hover:text-[var(--fw-danger)]"
            title={t('common.delete')}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
      {isOpen && (
        loading ? (
          <div className="py-1 px-8 text-[11px] text-[var(--fw-text-subtle)]">{t('common.loading')}</div>
        ) : children.length === 0 ? (
          <div className="py-1 px-8 text-[11px] text-[var(--fw-text-subtle)]">{t('smartFolder.noMatches')}</div>
        ) : (
          children.map(c => (
            <BookmarkRow
              key={c.id}
              id={c.id}
              title={c.title ?? ''}
              url={c.url ?? ''}
              path=""
              selected={selected.has(c.id)}
              onClick={(e) => {
                if (e.shiftKey || e.ctrlKey || e.metaKey) toggleSelected(c.id)
                else {
                  selected.forEach(s => toggleSelected(s))
                  toggleSelected(c.id)
                }
              }}
              protectedFlag={false}
              tags={(bookmarkTags[c.id] ?? []).map(tid => tags.find(t => t.id === tid)).filter(Boolean) as TagDef[]}
            />
          ))
        )
      )}
    </div>
  )
}

function TreeNode(props: TreeNodeProps) {
  const { t } = useT()
  const {
    node, depth, expanded, setExpanded, selected, toggleSelected, onRowSelectClick, protectedIds,
    dropHint, focusedId, onFocusRow,
    onDragStartBookmark, onDragEndBookmark,
    onRowDragOver, onRowDragLeave, onRowDrop,
    onContextMenuBookmark, onContextMenuFolder,
    tags, bookmarkTags,
  } = props

  if (SYSTEM_ROOT_IDS.has(node.id)) return null
  const isFolder = !node.url
  const isOpen = expanded.has(node.id)
  const isProtected = protectedIds.has(node.id)
  const indent = Math.min(depth, 6) * 12

  const activeDropHint = dropHint
  const thisHint = activeDropHint?.nodeId === node.id ? activeDropHint.pos : null
  const insertBefore = thisHint === 'before'
  const insertAfter = thisHint === 'after'
  const dropInto = thisHint === 'into'
  const isFocused = focusedId === node.id

  if (isFolder) {
    const childCount = (node.children ?? []).length
    const isSelected = selected.has(node.id)
    return (
      <div className="relative">
        {insertBefore && <DropIndicator />}
        <div
          data-fw-row-id={node.id}
          role="button"
          tabIndex={0}
          draggable={!SYSTEM_ROOT_IDS.has(node.parentId ?? '')}
          onDragStart={(e) => onDragStartBookmark(e, node.id)}
          onDragEnd={onDragEndBookmark}
          onClick={() => {
            onFocusRow(node.id)
            setExpanded((prev) => {
              const next = new Set(prev)
              next.has(node.id) ? next.delete(node.id) : next.add(node.id)
              return next
            })
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return
            e.preventDefault()
            onFocusRow(node.id)
            setExpanded((prev) => {
              const next = new Set(prev)
              next.has(node.id) ? next.delete(node.id) : next.add(node.id)
              return next
            })
          }}
          onContextMenu={(e) => onContextMenuFolder(e, node)}
          onDragOver={(e) => onRowDragOver(e, node, true)}
          onDragLeave={onRowDragLeave}
          onDrop={(e) => onRowDrop(e, node, true)}
          aria-expanded={isOpen}
          className={cn(
            'w-full flex items-center gap-1.5 px-2 py-1 text-left transition-colors cursor-pointer select-none',
            isProtected && 'bg-[color-mix(in_oklch,var(--fw-success)_7%,transparent)]',
            isSelected && 'bg-[var(--fw-accent-soft)]',
            dropInto
              ? 'outline outline-2 outline-[var(--fw-accent)] outline-offset-[-2px] bg-[var(--fw-accent-soft)]'
              : isSelected
                ? 'bg-[var(--fw-accent-soft)]'
                : isFocused
                ? 'bg-[var(--fw-bg-subtle)] ring-1 ring-inset ring-[color-mix(in_oklch,var(--fw-accent)_55%,transparent)]'
                : 'hover:bg-[var(--fw-bg-subtle)]',
          )}
          style={{ paddingLeft: `${indent + 8}px` }}
        >
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => {}}
            onClick={(e) => {
              e.stopPropagation()
              onRowSelectClick(e, node.id, true)
              onFocusRow(node.id)
            }}
            aria-label={t('lib.selectFolderAria', { title: node.title })}
            className="flex-shrink-0"
          />
          {isOpen ? (
            <ChevronDown className="h-3 w-3 text-[var(--fw-text-subtle)] flex-shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 text-[var(--fw-text-subtle)] flex-shrink-0" />
          )}
          {isProtected ? (
            <ShieldCheck className={cn('h-3.5 w-3.5 flex-shrink-0', status.success.icon)} />
          ) : isOpen ? (
            <FolderOpen className="h-3.5 w-3.5 text-[var(--fw-text-muted)] flex-shrink-0" />
          ) : (
            <FolderClosed className="h-3.5 w-3.5 text-[var(--fw-text-muted)] flex-shrink-0" />
          )}
          <span className="text-xs font-medium truncate flex-1">{node.title}</span>
          {childCount > 0 && (
            <span className="text-[10.5px] text-[var(--fw-text-subtle)] tabular-nums flex-shrink-0">
              {childCount}
            </span>
          )}
        </div>
        {insertAfter && <DropIndicator />}
        {isOpen &&
          node.children?.map((c) => (
            <TreeNode key={c.id} {...props} node={c} depth={depth + 1} />
          ))}
      </div>
    )
  }

  // Bookmark row
  return (
    <div className="relative">
      {insertBefore && <DropIndicator />}
      <div
        data-fw-row-id={node.id}
        draggable
        onDragStart={(e) => onDragStartBookmark(e, node.id)}
        onDragEnd={onDragEndBookmark}
        onContextMenu={(e) => onContextMenuBookmark(e, node)}
        onDragOver={(e) => onRowDragOver(e, node, false)}
        onDragLeave={onRowDragLeave}
        onDrop={(e) => onRowDrop(e, node, false)}
        className={cn(
          'flex items-center gap-1.5 py-1 pr-2 cursor-pointer group transition-colors select-none',
          selected.has(node.id)
            ? 'bg-[var(--fw-accent-soft)]'
            : isFocused
              ? 'bg-[var(--fw-bg-subtle)] ring-1 ring-inset ring-[color-mix(in_oklch,var(--fw-accent)_55%,transparent)]'
              : 'hover:bg-[var(--fw-bg-subtle)]',
        )}
        style={{ paddingLeft: `${indent + 24}px` }}
        onClick={(e) => {
          onFocusRow(node.id)
          onRowSelectClick(e, node.id, false)
        }}
      >
      <Checkbox
        checked={selected.has(node.id)}
        // Selection state is driven by onRowSelectClick below; onCheckedChange
        // is a no-op so Radix doesn't double-toggle.
        onCheckedChange={() => {}}
        onClick={(e) => {
          e.stopPropagation()
          // Route checkbox clicks through the same modifier-aware handler as
          // the row itself — Shift/Ctrl combos work identically whether the
          // user hits the box or the row.
          onRowSelectClick(e, node.id, false)
          onFocusRow(node.id)
        }}
        aria-label={t('common.selectItem', { name: node.title ?? node.url ?? '' })}
        className="flex-shrink-0"
      />
      <Favicon url={node.url} size={14} framed className="flex-shrink-0" />
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        <p className="text-xs font-medium truncate">{node.title || node.url}</p>
        {(bookmarkTags[node.id] ?? []).length > 0 && (
          <div className="flex gap-1 overflow-hidden">
            {(bookmarkTags[node.id] ?? []).map(tid => {
              const tag = tags.find(t => t.id === tid)
              if (!tag) return null
              return <TagBadgeDot key={tag.id} color={tag.color} />
            })}
          </div>
        )}
      </div>
      <a
        href={node.url}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        aria-label={t('common.openInNewTab')}
        className="opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 h-5 w-5 flex items-center justify-center rounded text-[var(--fw-text-subtle)] hover:text-[var(--fw-accent-text)] transition-all"
      >
        <ExternalLink className="h-3 w-3" />
      </a>
      </div>
      {insertAfter && <DropIndicator />}
    </div>
  )
}

function DropIndicator() {
  return (
    <div
      aria-hidden
      className="absolute left-6 right-2 h-0.5 rounded-full bg-[var(--fw-accent)] -mt-px z-10 pointer-events-none"
      style={{ boxShadow: '0 0 0 2px color-mix(in oklch, var(--fw-accent) 25%, transparent)' }}
    />
  )
}

function BookmarkRow({
  id,
  title,
  url,
  path,
  selected,
  onClick,
  protectedFlag,
  tags = [],
}: {
  id: string
  title: string
  url: string
  path: string
  selected: boolean
  onClick: (e: React.MouseEvent) => void
  protectedFlag: boolean
  tags?: TagDef[]
}) {
  const { t } = useT()
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 cursor-pointer group',
        selected ? 'bg-[var(--fw-accent-soft)]' : 'hover:bg-[var(--fw-bg-subtle)]',
      )}
      onClick={onClick}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={() => {}}
        onClick={(e) => {
          e.stopPropagation()
          onClick(e)
        }}
        aria-label={t('common.selectItem', { name: title })}
      />
      <Favicon url={url} size={16} framed className="flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{title}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <p className="text-[10.5px] text-[var(--fw-text-subtle)] truncate">
            {path ? `${path}` : t('common.root')}
            {protectedFlag && ` · ${t('common.protected')}`}
          </p>
          {tags.length > 0 && (
            <div className="flex gap-1 overflow-hidden">
              {tags.map(t => (
                <TagBadgeDot key={t.id} color={t.color} />
              ))}
            </div>
          )}
        </div>
      </div>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        aria-label={t('common.openInNewTab')}
        className="opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 h-5 w-5 flex items-center justify-center rounded text-[var(--fw-text-subtle)] hover:text-[var(--fw-accent-text)] transition-all"
      >
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  )
}

function scrollRowIntoView(id: string) {
  const el = document.querySelector(`[data-fw-row-id="${CSS.escape(id)}"]`)
  el?.scrollIntoView({ block: 'nearest' })
}

function findNodeById(tree: Node[], id: string): Node | undefined {
  const walk = (nodes: Node[]): Node | undefined => {
    for (const n of nodes) {
      if (n.id === id) return n
      if (n.children) {
        const hit = walk(n.children)
        if (hit) return hit
      }
    }
    return undefined
  }
  return walk(tree)
}
