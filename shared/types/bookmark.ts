export interface BookmarkRecord {
  id: string
  title: string
  url?: string
  parentId?: string
  folderPath: string[]
  dateAdded?: number
  dateLastUsed?: number
  index?: number
}

export interface DeadLinkResult {
  bookmarkId: string
  url: string
  status: 'valid' | 'invalid' | 'suspicious' | 'retry'
  statusCode?: number
  checkedAt: number
  reason: string
  skipped?: boolean
}

export interface DeadLinkCheckState {
  status: 'idle' | 'checking' | 'paused' | 'completed'
  processed: number
  total: number
  lastRunAt?: number
}

export interface DuplicateGroup {
  id: string
  canonicalUrl: string
  bookmarkIds: string[]
}

export type OrganizeSuggestionKind = 'move' | 'create_and_move'

export interface OrganizeSuggestion {
  /** Deterministic content-addressed ID so ignores persist across scans. */
  id: string
  kind: OrganizeSuggestionKind
  /**
   * For kind='move': the single bookmark being moved.
   * For kind='create_and_move': representative bookmark (used for UI preview
   * and search). `memberIds` holds the full set.
   */
  bookmarkId: string
  /** All bookmarks bundled with this suggestion (size 1 for simple move). */
  memberIds: string[]
  currentPath: string[]
  /** Path of the final destination (includes new folder name if create_and_move). */
  suggestedPath: string[]
  /** Existing destination folder (kind='move') or the parent to create under (kind='create_and_move'). */
  targetFolderId: string
  /** Name of the new folder, only for kind='create_and_move'. */
  newFolderName?: string
  confidence: number
  reason: string
  reasonCodes?: Array<'domain_cluster' | 'keyword_match' | 'established_folder' | 'title_cluster'>
  alternatives?: Array<{
    targetFolderId: string
    suggestedPath: string[]
    confidence: number
    reason: string
  }>
}

export interface RediscoverItem {
  bookmarkId: string
  score: number
  /** Pre-rendered English reason — kept for back-compat and fallback. */
  reason: string
  /**
   * Localizable reason parts. When present, the UI should render these via
   * `t()` and join with ` · ` instead of using `reason`.
   */
  reasonParts?: Array<{ key: string; args?: Record<string, string | number> }>
  reasonType?: 'stale' | 'topic_match' | 'source_quality'
  lastOpenedAt?: number
  surfacedAt?: number
}

export interface EmptyFolder {
  id: string
  title: string
  /** Path of ancestor folder names (does NOT include this folder's own title) */
  folderPath: string[]
}

export interface ScanResult {
  id: string
  startedAt: number
  completedAt?: number
  status: 'running' | 'completed' | 'failed' | 'partial'
  totalBookmarks: number
  deadLinksChecked?: boolean
  deadLinkState?: DeadLinkCheckState
  deadLinks: DeadLinkResult[]
  deadLinkCache?: Record<string, DeadLinkResult>
  bookmarkUrlMap?: Record<string, string>
  duplicateGroups: DuplicateGroup[]
  organizeSuggestions: OrganizeSuggestion[]
  rediscoverItems: RediscoverItem[]
  emptyFolders: EmptyFolder[]
  /** Bookmark records referenced by this scan result, keyed by bookmark ID */
  bookmarkSnapshot?: Record<string, BookmarkRecord>
}

export interface ScanSummary {
  id: string
  startedAt: number
  completedAt?: number
  status: ScanResult['status']
  totalBookmarks: number
  invalidCount: number
  suspiciousCount: number
  duplicateGroupCount: number
  organizeSuggestionCount: number
}

export interface UserSettings {
  scanTimeoutMs: number
  maxConcurrentChecks: number
  excludedFolderIds: string[]
  enableTrashFolder: boolean
  retrySuspiciousLinks: boolean
  /** When set, Organize analysis focuses on this folder and its direct children. */
  organizeScopeFolderId?: string | null
  /**
   * Folders the user has manually organized. Any destructive operation
   * (Organize move, dead-link trash, duplicate resolve, empty-folder delete)
   * is blocked for bookmarks inside — children inherit protection.
   */
  protectedFolderIds?: string[]
  /** Automatic scan cadence. 'off' disables alarms entirely. */
  scheduleFrequency?: 'off' | 'daily' | 'weekly' | 'monthly'
  /** Theme override: 'system' respects OS; otherwise force light/dark. */
  theme?: 'system' | 'light' | 'dark'
  /** UI language: 'auto' picks by browser, otherwise force English / Simplified Chinese. */
  locale?: 'auto' | 'en' | 'zh-CN'
  /** Last folder used for quick save */
  lastSaveFolderId?: string
}

export interface TrashEntry {
  bookmarkId: string
  title: string
  url?: string
  originalPath: string[]
  trashedAt: number
  operationId: string
}

export interface OperationLogEntry {
  operationId: string
  timestamp: number
  actionType: 'trash' | 'delete' | 'restore' | 'move' | 'ignore'
  bookmarkIds: string[]
  previousFolderPaths?: string[][]
  targetFolderPath?: string[]
  note?: string
}
