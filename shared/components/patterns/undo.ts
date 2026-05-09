import { toast } from 'sonner'

interface UndoToastOptions {
  message: string
  /** Label shown on the toast's action button */
  undoLabel?: string
  /** Time window before the commit runs. Default 5s. */
  durationMs?: number
  /** Commit the action if the user does NOT click undo */
  onCommit: () => void | Promise<void>
  /** Optional additional cleanup on undo */
  onUndo?: () => void | Promise<void>
  /** Optional successful-toast message after commit */
  commitMessage?: string
}

/**
 * Show an undoable toast. The `onCommit` runs after `durationMs` unless the
 * user clicks the undo action, in which case `onUndo` runs instead.
 *
 * This is intentionally simple: it assumes the caller has already removed the
 * items from the visible list optimistically. On commit it may fire a real
 * background action (e.g. trash); on undo it just skips that.
 */
export function showUndoToast({
  message,
  undoLabel = 'Undo',
  durationMs = 5000,
  onCommit,
  onUndo,
  commitMessage,
}: UndoToastOptions) {
  let settled = false

  const commit = async () => {
    if (settled) return
    settled = true
    try {
      await onCommit()
      if (commitMessage) toast.success(commitMessage)
    } catch (e) {
      toast.error(`Action failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const undo = async () => {
    if (settled) return
    settled = true
    try {
      await onUndo?.()
    } catch {
      /* best-effort */
    }
  }

  toast(message, {
    duration: durationMs,
    action: {
      label: undoLabel,
      onClick: () => void undo(),
    },
    onAutoClose: () => void commit(),
    onDismiss: () => void undo(),
  })
}
