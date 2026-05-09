import type {
  ScanResult,
  DeadLinkResult,
  OperationLogEntry,
  TrashEntry,
  UserSettings,
  EmptyFolder,
} from './bookmark'
import type { TagDef } from '../storage/schema'

/* ---------- Envelope ---------- */

export interface SuccessResponse<T> {
  ok: true
  data: T
}

export interface ErrorResponse {
  ok: false
  error: {
    code: string
    message: string
    retryable?: boolean
  }
}

export type MessageResponse<T> = SuccessResponse<T> | ErrorResponse

/* ---------- Broadcast events (background → sidepanel) ---------- */

export type ScanProgressEvent = {
  type: 'scan.progress'
  payload: {
    taskId: string
    stage:
      | 'snapshotting'
      | 'detecting_duplicates'
      | 'generating_organize_suggestions'
      | 'generating_rediscover'
      | 'detecting_empty_folders'
    processed?: number
    total?: number
  }
}

export type ScanCompletedEvent = {
  type: 'scan.completed'
  payload: ScanResult
}

export type ScanFailedEvent = {
  type: 'scan.failed'
  payload: { taskId: string; error: string }
}

export type DeadLinksProgressEvent = {
  type: 'deadLinks.progress'
  payload: {
    taskId: string
    processed: number
    total: number
    status: 'checking' | 'paused' | 'completed'
  }
}

/** Fired from background when a new bookmark is added externally & enriched. */
export type InboxUpdatedEvent = {
  type: 'inbox.updated'
  payload: { count: number }
}

export type BroadcastEvent =
  | ScanProgressEvent
  | ScanCompletedEvent
  | ScanFailedEvent
  | DeadLinksProgressEvent
  | InboxUpdatedEvent

/* ---------- Error codes ---------- */

export const ERROR_CODES = {
  SCAN_ALREADY_RUNNING: 'SCAN_ALREADY_RUNNING',
  SCAN_NOT_FOUND: 'SCAN_NOT_FOUND',
  PERMISSION_MISSING: 'PERMISSION_MISSING',
  BOOKMARK_NOT_FOUND: 'BOOKMARK_NOT_FOUND',
  TRASH_FOLDER_UNAVAILABLE: 'TRASH_FOLDER_UNAVAILABLE',
  RESTORE_TARGET_MISSING: 'RESTORE_TARGET_MISSING',
  NETWORK_RETRY_NEEDED: 'NETWORK_RETRY_NEEDED',
  PARTIAL_FAILURE: 'PARTIAL_FAILURE',
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  UNKNOWN: 'UNKNOWN',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

/* ---------- Typed request/response map ---------- */

export interface FolderSummary {
  id: string
  title: string
  folderPath: string[]
  /** Number of direct link children — used to sort messy folders to the top. */
  directLinkCount?: number
  /** Number of direct subfolder children — zero usually means unsorted. */
  directSubfolderCount?: number
}

export interface MessageMap {
  // Scan lifecycle
  'scan.start':       { req: { force?: boolean } | void; res: { taskId: string; status: string } }
  'scan.status.get':  { req: void; res: { isScanning: boolean; isCheckingDeadLinks: boolean } }
  'scan.latest.get':  { req: void; res: ScanResult | null }

  // Dead links
  'deadLinks.start':   { req: { forceFull?: boolean } | void; res: { taskId: string; status: string } }
  'deadLinks.stop':    { req: void; res: { stopped: boolean } }
  'deadLinks.checkableCount': {
    req: { bookmarkIds?: string[] } | void
    res: { checkableCount: number; skippedCount: number }
  }
  'deadLinks.recheck': {
    req: { bookmarkIds: string[] }
    res: { checkedCount: number; stillDeadCount: number; scan?: ScanResult }
  }
  'deadLinks.ignore': { req: { bookmarkIds: string[] }; res: { ignoredCount: number } }
  'deadLinks.trash':  {
    req: { bookmarkIds: string[] }
    res: {
      trashedCount: number
      failedCount: number
      protectedSkipped: number
      staleSkipped: number
    }
  }

  // Duplicates
  'duplicates.resolve': {
    req: { groupId: string; keepBookmarkIds: string[]; trashBookmarkIds: string[] }
    res: {
      trashedCount: number
      failedCount: number
      protectedSkipped: number
      staleSkipped: number
    }
  }
  'duplicates.resolveBulk': {
    req: {
      resolutions: Array<{
        groupId: string
        keepBookmarkIds: string[]
        trashBookmarkIds: string[]
      }>
    }
    res: {
      resolvedCount: number
      trashedCount: number
      protectedSkipped: number
      staleSkipped: number
      failedCount: number
    }
  }

  // Organize
  'organize.apply': {
    req: { suggestionIds: string[] }
    res: {
      movedCount: number
      failedCount: number
      createdFolders: number
      protectedSkipped: number
    }
  }
  'organize.ignore': {
    req: { suggestionIds: string[] }
    res: { ignoredCount: number }
  }
  'organize.analyze': {
    /** When scopeFolderId is set, run targeted cluster analysis on that folder. */
    req: { scopeFolderId: string | null }
    res: {
      scopeFolderId: string | null
      scopePath: string[] | null
      suggestions: import('./bookmark').OrganizeSuggestion[]
      directChildLinkCount: number
      directSubfolderCount: number
      /** Bookmark metadata for every member referenced by `suggestions` */
      bookmarkSnapshot: Record<string, import('./bookmark').BookmarkRecord>
    }
  }
  'organize.antiMoves.clear': { req: void; res: null }

  /* ----- New-bookmark inbox ----- */
  'inbox.get': {
    req: void
    res: {
      entries: import('../storage/schema').NewBookmarkInboxEntry[]
    }
  }
  'inbox.dismiss': { req: { bookmarkIds: string[] }; res: null }
  'inbox.apply': {
    req: { bookmarkId: string; targetFolderId: string }
    res: { ok: true } | { ok: false; reason: string }
  }

  /* ----- Onboarding ----- */
  'onboarding.seen.get': { req: void; res: { seen: boolean } }
  'onboarding.seen.set': { req: void; res: null }

  /* ----- Library (manual browse) ----- */
  'library.move': {
    req: {
      bookmarkIds: string[]
      targetFolderId: string
      /** Optional insert position within the target folder's children. Omit to append. */
      targetIndex?: number
    }
    res: { movedCount: number; failedCount: number; protectedSkipped: number }
  }
  'library.trash': {
    req: { bookmarkIds: string[] }
    res: { trashedCount: number; failedCount: number; protectedSkipped: number }
  }

  /* ----- Share / Export folder ----- */
  'share.exportFolder': {
    req: {
      folderId: string
      format: 'html' | 'md' | 'json'
      includeSubfolders?: boolean
    }
    res: { content: string; filename: string; byteSize: number; bookmarkCount: number }
  }

  /* ----- Protection advisor ----- */
  /**
   * Suggests folders that look already-organized and might benefit from
   * being marked Protected. Heuristic: has subfolders, few loose links,
   * content spread across multiple subtrees.
   */
  'protection.candidates.get': {
    req: void
    res: {
      candidates: Array<{
        id: string
        title: string
        folderPath: string[]
        directLinkCount: number
        directSubfolderCount: number
        totalLinks: number
        score: number
      }>
    }
  }
  /** Mark a candidate as dismissed so we stop suggesting protection for it. */
  'protection.candidates.dismiss': { req: { folderId: string }; res: null }

  /* ----- Backup ----- */
  'backup.export': {
    req: void
    res: { json: string; filename: string; byteSize: number }
  }
  'backup.import': {
    req: { json: string }
    res: { keysRestored: number; schemaVersion: number }
  }

  /* ----- Diagnostics ----- */
  'diagnostics.get': {
    req: void
    res: {
      version: string
      userAgent: string
      schemaVersion: number
      storageKeys: Array<{ key: string; bytes: number; area: 'local' | 'sync' }>
      bookmarks: { total: number; folders: number; links: number }
      scan: { completedAt: number | null; totalBookmarks: number; deadLinksChecked: boolean }
      recentErrors: Array<{ at: number; message: string }>
      report: string
    }
  }

  // Rediscover
  'rediscover.dismiss':      { req: { bookmarkId: string }; res: null }
  'rediscover.saveForLater': { req: { bookmarkId: string }; res: null }
  'savedForLater.get':       { req: void; res: Array<{ bookmarkId: string; at: number }> }
  'savedForLater.dismiss':   { req: { bookmarkId: string }; res: null }

  // Trash
  'trash.get':     { req: void; res: TrashEntry[] }
  'trash.restore': {
    req: { bookmarkIds: string[] }
    res: { restoredCount: number; failedCount: number; fallbackCount: number }
  }
  'trash.empty': { req: void; res: { deletedCount: number } }

  // Ignored lists
  'ignoredDeadLinks.get':    { req: void; res: string[] }
  'ignoredDeadLinks.clear':  { req: void; res: null }
  'ignoredSuggestions.get':  { req: void; res: string[] }
  'ignoredSuggestions.clear':{ req: void; res: null }

  // Empty folders
  'emptyFolders.get':    { req: void; res: EmptyFolder[] }
  'emptyFolders.delete': {
    req: { folderIds: string[] }
    res: {
      deletedCount: number
      failedCount: number
      protectedSkipped: number
      staleSkipped: number
      nonEmptySkipped: number
    }
  }

  // Settings
  'settings.get':    { req: void; res: UserSettings }
  'settings.update': { req: Partial<UserSettings>; res: UserSettings }

  // Tags
  'tags.get':        { req: void; res: TagDef[] }
  'tags.create':     { req: { name: string; color?: string }; res: TagDef }
  'tags.update':     { req: { id: string; name?: string; color?: string }; res: TagDef | null }
  'tags.delete':     { req: { id: string }; res: null }
  'tags.assign':     { req: { bookmarkId: string; tagIds: string[] }; res: null }
  'tags.unassign':   { req: { bookmarkId: string; tagIds: string[] }; res: null }
  'tags.getForBookmark': { req: { bookmarkId: string }; res: TagDef[] }
  'tags.search':     { req: { query: string }; res: TagDef[] }
  'tags.findByBookmarkIds': { req: { bookmarkIds: string[] }; res: Record<string, TagDef[]> }
  'tags.getBookmarkTagsMap': { req: void; res: Record<string, string[]> }

  // Operation log
  'operationLog.get':   { req: void; res: OperationLogEntry[] }
  'operationLog.clear': { req: void; res: null }

  // Folders (for pickers)
  'folders.get': { req: void; res: FolderSummary[] }

  // Smart folders
  'smartFolders.get': { req: void; res: import('../storage/schema').SmartFolder[] }
  'smartFolders.create': {
    req: { name: string; rules: import('../storage/schema').SmartFolderRule[]; sortBy?: import('../storage/schema').SmartFolderSortBy; sortOrder?: 'asc' | 'desc' }
    res: import('../storage/schema').SmartFolder
  }
  'smartFolders.update': {
    req: { id: string; name?: string; rules?: import('../storage/schema').SmartFolderRule[]; sortBy?: import('../storage/schema').SmartFolderSortBy; sortOrder?: 'asc' | 'desc' }
    res: import('../storage/schema').SmartFolder | null
  }
  'smartFolders.delete': { req: { id: string }; res: null }
  'smartFolders.evaluate': {
    req: { id: string }
    res: { bookmarkIds: string[] }
  }

  // Quick save
  'quickSave.getState': { req: void; res: { lastFolderId?: string; lastFolderTitle?: string } }
  'quickSave.execute': {
    req: { url: string; title: string; folderId: string; tagIds?: string[] }
    res: { bookmarkId: string }
  }
  'quickSave.getFolders': { req: void; res: Array<{ id: string; title: string; path: string[] }> }

  // Find & Replace
  'findReplace.preview': {
    req: {
      find: string
      replace: string
      findIn: ('title' | 'url')[]
      replaceIn: ('title' | 'url')[]
      caseSensitive: boolean
      bookmarkIds?: string[]
    }
    res: {
      matches: Array<{
        id: string
        title: string
        url: string
        titleBefore?: string
        titleAfter?: string
        urlBefore?: string
        urlAfter?: string
      }>
      totalCount?: number
    }
  }
  'findReplace.execute': {
    req: {
      find: string
      replace: string
      findIn: ('title' | 'url')[]
      replaceIn: ('title' | 'url')[]
      caseSensitive: boolean
      bookmarkIds: string[]
    }
    res: { updatedCount: number }
  }

  // Undo (soft trash with deferred execution)
  'undo.trash': {
    req: { bookmarkIds: string[]; snapshots: Array<{ id: string; title: string; url?: string; originalPath: string[]; parentId?: string; index?: number }> }
    res: { restoredCount: number }
  }
}

export type MessageType = keyof MessageMap
export type MessageRequest<T extends MessageType> = MessageMap[T]['req']
export type MessageResult<T extends MessageType> = MessageMap[T]['res']

// Re-export bookmark types so consumers get types from one place
export type {
  DeadLinkResult,
  ScanResult,
  OperationLogEntry,
  TrashEntry,
  UserSettings,
  EmptyFolder,
}
