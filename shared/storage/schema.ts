import type {
  ScanResult,
  ScanSummary,
  UserSettings,
  TrashEntry,
  OperationLogEntry,
} from '../types'

/** All storage keys used by Favewise */
export const STORAGE_KEYS = {
  /** Schema version — drives migrations when storage shape changes. */
  SCHEMA_VERSION: 'favewise:schemaVersion',
  SETTINGS: 'favewise:settings',
  LATEST_SCAN: 'favewise:latestScan',
  SCAN_HISTORY: 'favewise:scanHistory',
  IGNORED_DEAD_LINKS: 'favewise:ignoredDeadLinks',
  IGNORED_SUGGESTIONS: 'favewise:ignoredSuggestions',
  REDISCOVER_HISTORY: 'favewise:rediscoverHistory',
  TRASH_ITEMS: 'favewise:trashItems',
  OPERATION_LOG: 'favewise:operationLog',
  /** Map of bookmarkId → parentId recorded when a move suggestion was applied. */
  ORGANIZE_PLACEMENTS: 'favewise:organizePlacements',
  /**
   * List of "bookmarkId::parentId" tokens representing pairs the user has
   * signaled they do NOT want. Populated when an applied placement is later
   * reversed by the user. Future suggestions for the same pair are suppressed.
   */
  ORGANIZE_ANTI_MOVES: 'favewise:organizeAntiMoves',
  /** Freshly-created bookmarks awaiting quick categorization by the user. */
  NEW_BOOKMARK_INBOX: 'favewise:newBookmarkInbox',
  /** Onboarding progress marker (true once the tour has been completed or skipped). */
  ONBOARDING_SEEN: 'favewise:onboardingSeen',
  /** Folder IDs the user has dismissed from the protection-suggestion surface. */
  PROTECTION_DISMISSALS: 'favewise:protectionDismissals',
  /**
   * Flipped true whenever a bookmark event (create/change/move/remove) fires.
   * Cleared when a successful scan completes. Used by the scan handler to
   * short-circuit when the tree hasn't changed since the last scan.
   */
  BOOKMARK_TREE_DIRTY: 'favewise:bookmarkTreeDirty',
  /** Tag definitions: array of TagDef objects */
  TAGS: 'favewise:tags',
  /** Bookmark-to-tag mapping: bookmarkId → string[] of tag IDs */
  BOOKMARK_TAGS: 'favewise:bookmarkTags',
  /** Smart folders / saved searches */
  SMART_FOLDERS: 'favewise:smartFolders',
} as const

/** Current schema version. Bump when storage shape changes. */
export const CURRENT_SCHEMA_VERSION = 2

/**
 * Storage keys that should live in `chrome.storage.sync` (≤100KB total across
 * all sync keys). Small user preferences only. Anything that might grow large
 * (scans, trash, caches) stays in `chrome.storage.local`.
 */
export const SYNC_KEYS = new Set<string>([
  STORAGE_KEYS.SETTINGS,
  STORAGE_KEYS.IGNORED_DEAD_LINKS,
  STORAGE_KEYS.IGNORED_SUGGESTIONS,
  STORAGE_KEYS.ONBOARDING_SEEN,
])

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]

/** Default user settings */
export const DEFAULT_SETTINGS: UserSettings = {
  scanTimeoutMs: 10000,
  maxConcurrentChecks: 5,
  excludedFolderIds: [],
  enableTrashFolder: true,
  retrySuspiciousLinks: false,
  organizeScopeFolderId: null,
  protectedFolderIds: [],
  scheduleFrequency: 'off',
  theme: 'system',
  locale: 'auto',
}

const SETTINGS_KEYS = new Set<keyof UserSettings>([
  'scanTimeoutMs',
  'maxConcurrentChecks',
  'excludedFolderIds',
  'enableTrashFolder',
  'retrySuspiciousLinks',
  'organizeScopeFolderId',
  'protectedFolderIds',
  'scheduleFrequency',
  'theme',
  'locale',
  'lastSaveFolderId',
])
const SCHEDULE_FREQUENCIES = new Set(['off', 'daily', 'weekly', 'monthly'])
const THEMES = new Set(['system', 'light', 'dark'])
const LOCALES = new Set(['auto', 'en', 'zh-CN'])

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function validateNumber(
  value: unknown,
  key: string,
  min: number,
  max: number,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new Error(`Invalid setting: ${key}`)
  }
  return value
}

function validateBoolean(value: unknown, key: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Invalid setting: ${key}`)
  return value
}

function validateStringId(value: unknown, key: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) {
    throw new Error(`Invalid setting: ${key}`)
  }
  return value
}

function validateStringIdArray(value: unknown, key: string): string[] {
  if (!Array.isArray(value) || value.length > 5000) {
    throw new Error(`Invalid setting: ${key}`)
  }
  return value.map((item) => validateStringId(item, key))
}

export function normalizeUserSettings(input: unknown): UserSettings {
  if (input === undefined || input === null) return { ...DEFAULT_SETTINGS }
  if (!isPlainRecord(input)) throw new Error('Invalid settings')

  const normalized: UserSettings = { ...DEFAULT_SETTINGS }
  for (const [key, value] of Object.entries(input)) {
    if (!SETTINGS_KEYS.has(key as keyof UserSettings)) {
      throw new Error(`Unknown setting: ${key}`)
    }

    switch (key as keyof UserSettings) {
      case 'scanTimeoutMs':
        normalized.scanTimeoutMs = validateNumber(value, key, 1000, 30000)
        break
      case 'maxConcurrentChecks':
        normalized.maxConcurrentChecks = validateNumber(value, key, 1, 20)
        break
      case 'excludedFolderIds':
        normalized.excludedFolderIds = validateStringIdArray(value, key)
        break
      case 'enableTrashFolder':
        normalized.enableTrashFolder = validateBoolean(value, key)
        break
      case 'retrySuspiciousLinks':
        normalized.retrySuspiciousLinks = validateBoolean(value, key)
        break
      case 'organizeScopeFolderId':
        normalized.organizeScopeFolderId =
          value === null ? null : validateStringId(value, key)
        break
      case 'protectedFolderIds':
        normalized.protectedFolderIds = validateStringIdArray(value, key)
        break
      case 'scheduleFrequency':
        if (typeof value !== 'string' || !SCHEDULE_FREQUENCIES.has(value)) {
          throw new Error(`Invalid setting: ${key}`)
        }
        normalized.scheduleFrequency = value as UserSettings['scheduleFrequency']
        break
      case 'theme':
        if (typeof value !== 'string' || !THEMES.has(value)) {
          throw new Error(`Invalid setting: ${key}`)
        }
        normalized.theme = value as UserSettings['theme']
        break
      case 'locale':
        if (typeof value !== 'string' || !LOCALES.has(value)) {
          throw new Error(`Invalid setting: ${key}`)
        }
        normalized.locale = value as UserSettings['locale']
        break
      case 'lastSaveFolderId':
        normalized.lastSaveFolderId = validateStringId(value, key)
        break
    }
  }

  return normalized
}

/** Typed storage schema */
export interface StorageSchema {
  [STORAGE_KEYS.SETTINGS]: UserSettings
  [STORAGE_KEYS.LATEST_SCAN]: ScanResult | null
  [STORAGE_KEYS.SCAN_HISTORY]: ScanSummary[]
  [STORAGE_KEYS.IGNORED_DEAD_LINKS]: string[]
  [STORAGE_KEYS.IGNORED_SUGGESTIONS]: string[]
  [STORAGE_KEYS.REDISCOVER_HISTORY]: Array<{
    bookmarkId: string
    action: 'dismissed' | 'save_for_later' | 'opened'
    at: number
  }>
  [STORAGE_KEYS.TRASH_ITEMS]: TrashEntry[]
  [STORAGE_KEYS.OPERATION_LOG]: OperationLogEntry[]
  [STORAGE_KEYS.ORGANIZE_PLACEMENTS]: Record<string, string>
  [STORAGE_KEYS.ORGANIZE_ANTI_MOVES]: string[]
  [STORAGE_KEYS.SCHEMA_VERSION]: number
  [STORAGE_KEYS.NEW_BOOKMARK_INBOX]: NewBookmarkInboxEntry[]
  [STORAGE_KEYS.ONBOARDING_SEEN]: boolean
  [STORAGE_KEYS.PROTECTION_DISMISSALS]: string[]
  [STORAGE_KEYS.BOOKMARK_TREE_DIRTY]: boolean
  [STORAGE_KEYS.TAGS]: TagDef[]
  [STORAGE_KEYS.BOOKMARK_TAGS]: Record<string, string[]>
  [STORAGE_KEYS.SMART_FOLDERS]: SmartFolder[]
}

/* ---------- Types for inbox entries ---------- */

export interface NewBookmarkInboxEntry {
  bookmarkId: string
  /** Unix ms when the bookmark was observed being added */
  createdAt: number
  /** Bookmark title at creation time (for display even if bookmark is deleted) */
  title: string
  /** URL at creation time */
  url: string
  /** Parent folder ID the bookmark landed in initially */
  parentId?: string
  /** Suggested category label from URL taxonomy (if any) */
  suggestedLabel?: string
  /** Sibling folder id whose title best matches the suggested label (if any) */
  suggestedFolderId?: string
  /** Title of the suggested folder (captured at enrichment time) */
  suggestedFolderTitle?: string
  /** Set by user dismissal — entry is still cached for audit but hidden from UI */
  dismissedAt?: number
}

/* ---------- Types for tags ---------- */

export interface TagDef {
  id: string
  name: string
  color: string
  createdAt: number
}

/* ---------- Types for smart folders ---------- */

export type SmartFolderRuleField = 'domain' | 'url' | 'title' | 'parentFolder' | 'tag' | 'dateAdded' | 'lastUsed'
export type SmartFolderRuleOperator = 'contains' | 'equals' | 'startsWith' | 'endsWith' | 'notContains'
export type SmartFolderSortBy = 'added' | 'domain' | 'title'

export interface SmartFolderRule {
  field: SmartFolderRuleField
  operator: SmartFolderRuleOperator
  value: string
}

export interface SmartFolder {
  id: string
  name: string
  rules: SmartFolderRule[]
  sortBy: SmartFolderSortBy
  sortOrder: 'asc' | 'desc'
  createdAt: number
  updatedAt: number
}
