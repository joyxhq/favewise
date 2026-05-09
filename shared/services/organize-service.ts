import type { BookmarkRecord, OrganizeSuggestion } from '~/shared/types'
import { categorizeUrl } from '~/shared/lib/url-taxonomy'
import { hashStr, expandProtectedSubtree } from '~/shared/lib/protected-folders'

interface FolderProfile {
  id: string
  path: string[]
  domains: Map<string, number>
  keywords: Map<string, number>
  bookmarkCount: number
}

const NOW = () => Date.now()
const DAY_MS = 86_400_000

/* ---------- Deterministic IDs ---------- */

export function makeMoveId(bookmarkId: string, targetFolderId: string): string {
  return `mv_${hashStr(`${bookmarkId}::${targetFolderId}`)}`
}

export function makeCreateMoveId(
  parentFolderId: string,
  folderName: string,
  memberIds: string[],
): string {
  const sig = `${parentFolderId}::${folderName}::${[...memberIds].sort().join(',')}`
  return `cr_${hashStr(sig)}`
}

/* ---------- Shared helpers ---------- */

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'your', 'you',
  'are', 'but', 'not', 'how', 'what', 'why', 'all', 'any', 'can', 'com',
  'www', 'http', 'https', 'html', 'aspx', 'php', 'new', 'old', 'app',
  'org', 'net', 'get', 'use', 'run', 'like', 'just',
  // Chinese
  '的', '了', '和', '或', '是', '在', '有',
])

/**
 * Cross-language synonym index. Each entry maps many surface forms (English
 * variants, abbreviations, Simplified Chinese) to one canonical key and a
 * human-friendly folder label. Keeps English + 中文 bookmarks from splitting
 * into parallel clusters that mean the same thing.
 */
interface SynonymEntry {
  canonical: string
  label: string
  forms: string[]
}

const SYNONYM_ENTRIES: SynonymEntry[] = [
  // Security & auditing
  { canonical: 'security',       label: 'Security',       forms: ['security', '安全'] },
  { canonical: 'vulnerability',  label: 'Vulnerabilities',forms: ['vulnerability', 'vuln', '漏洞'] },
  { canonical: 'exploit',        label: 'Exploits',       forms: ['exploit', 'exploitation', '利用'] },
  { canonical: 'audit',          label: 'Audits',         forms: ['audit', '审计'] },
  { canonical: 'pentest',        label: 'Pentest',        forms: ['pentest', 'pentesting', '渗透'] },
  { canonical: 'malware',        label: 'Malware',        forms: ['malware', '恶意'] },
  { canonical: 'forensic',       label: 'Forensics',      forms: ['forensic', '取证'] },
  { canonical: 'incident',       label: 'Incidents',      forms: ['incident', '事件'] },
  { canonical: 'crypto',         label: 'Cryptography',   forms: ['cryptography', '密码'] },

  // Web3 / crypto
  { canonical: 'blockchain',     label: 'Blockchain',     forms: ['blockchain', '区块链', '链'] },
  { canonical: 'contract',       label: 'Smart Contracts',forms: ['contract', 'contracts', '合约', '智能合约'] },
  { canonical: 'defi',           label: 'DeFi',           forms: ['defi'] },
  { canonical: 'nft',            label: 'NFTs',           forms: ['nft', 'nfts'] },
  { canonical: 'web3',           label: 'Web3',           forms: ['web3'] },
  { canonical: 'zk',             label: 'ZK',             forms: ['zk', 'zkp', '零知识'] },
  { canonical: 'dao',            label: 'DAO',            forms: ['dao'] },

  // Content types
  { canonical: 'docs',           label: 'Docs',           forms: ['docs', 'documentation', '文档'] },
  { canonical: 'blog',           label: 'Blog',           forms: ['blog', '博客', '博文'] },
  { canonical: 'tutorial',       label: 'Tutorials',      forms: ['tutorial', 'guide', '教程', '指南'] },
  { canonical: 'tool',           label: 'Tools',          forms: ['tool', '工具'] },
  { canonical: 'news',           label: 'News',           forms: ['news', '新闻', '资讯'] },
  { canonical: 'paper',          label: 'Papers',         forms: ['paper', 'arxiv', '论文'] },
  { canonical: 'course',         label: 'Courses',        forms: ['course', '课程'] },
  { canonical: 'research',       label: 'Research',       forms: ['research', '研究'] },
  { canonical: 'cheatsheet',     label: 'Cheatsheets',    forms: ['cheatsheet', 'cheat-sheet', '速查'] },
  { canonical: 'template',       label: 'Templates',      forms: ['template', '模板'] },
  { canonical: 'example',        label: 'Examples',       forms: ['example', 'examples', '示例'] },
  { canonical: 'reference',      label: 'Reference',      forms: ['reference', 'ref', '参考'] },
  { canonical: 'workshop',       label: 'Workshops',      forms: ['workshop', '工作坊'] },

  // Dev topics
  { canonical: 'frontend',       label: 'Frontend',       forms: ['frontend', 'front-end', '前端'] },
  { canonical: 'backend',        label: 'Backend',        forms: ['backend', 'back-end', '后端'] },
  { canonical: 'devops',         label: 'DevOps',         forms: ['devops'] },
  { canonical: 'design',         label: 'Design',         forms: ['design', '设计'] },
  { canonical: 'architecture',   label: 'Architecture',   forms: ['architecture', '架构'] },
  { canonical: 'database',       label: 'Databases',      forms: ['database', 'db', '数据库'] },

  // Tech stacks
  { canonical: 'python',         label: 'Python',         forms: ['python'] },
  { canonical: 'rust',           label: 'Rust',           forms: ['rust'] },
  { canonical: 'solidity',       label: 'Solidity',       forms: ['solidity'] },
  { canonical: 'javascript',     label: 'JavaScript',     forms: ['javascript', 'typescript', 'ts'] },
  { canonical: 'go',             label: 'Go',             forms: ['golang'] },

  // Automation / data
  { canonical: 'automation',     label: 'Automation',     forms: ['automation', 'llm', 'gpt', '人工智能'] },
  { canonical: 'ml',             label: 'Machine Learning',forms: ['ml', 'machine-learning', '机器学习'] },
  { canonical: 'data',           label: 'Data',           forms: ['data', '数据'] },
  { canonical: 'math',           label: 'Math',           forms: ['math', 'mathematics', '数学'] },
]

const SYNONYM_INDEX = new Map<string, { canonical: string; label: string }>()
for (const entry of SYNONYM_ENTRIES) {
  for (const form of entry.forms) {
    SYNONYM_INDEX.set(form.toLowerCase(), { canonical: entry.canonical, label: entry.label })
  }
}

/** Simple English stemmer: strip common suffixes so plurals / tenses collapse. */
function stem(word: string): string {
  if (word.length < 4) return word
  // ing
  if (word.endsWith('ing') && word.length >= 5) return word.slice(0, -3)
  // ed
  if (word.endsWith('ed') && word.length >= 4) return word.slice(0, -2)
  // ies -> y
  if (word.endsWith('ies') && word.length >= 4) return word.slice(0, -3) + 'y'
  // es
  if (word.endsWith('es') && word.length >= 4) return word.slice(0, -2)
  // s
  if (word.endsWith('s') && word.length >= 3) return word.slice(0, -1)
  return word
}

/** Normalize one raw keyword via stem + synonym index. */
function normalizeKeyword(raw: string): string | null {
  if (!raw) return null
  const lower = raw.toLowerCase()
  if (STOPWORDS.has(lower)) return null
  // Direct synonym hit (covers CJK bigrams and English variants)
  const direct = SYNONYM_INDEX.get(lower)
  if (direct) return direct.canonical
  // Stem English words then re-check synonyms
  if (/^[a-z0-9-]+$/.test(lower)) {
    const stemmed = stem(lower)
    if (stemmed.length < 3) return null
    const viaStem = SYNONYM_INDEX.get(stemmed)
    if (viaStem) return viaStem.canonical
    return stemmed
  }
  return lower
}

function extractKeywords(title: string): string[] {
  if (!title) return []
  const result: string[] = []

  for (const token of title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff\s-]/g, ' ').split(/\s+/)) {
    if (token.length < 3) continue
    const norm = normalizeKeyword(token)
    if (norm && norm.length > 2) result.push(norm)
  }

  // CJK bigrams — Chinese often carries meaning in 2-char words like "安全",
  // "审计". Extract consecutive pairs; synonym index maps them to canonical.
  const cjkMatches = title.match(/[\u4e00-\u9fff]{2,}/g)
  if (cjkMatches) {
    for (const seq of cjkMatches) {
      for (let i = 0; i < seq.length - 1; i++) {
        const bg = seq.slice(i, i + 2)
        const norm = normalizeKeyword(bg)
        if (norm) result.push(norm)
      }
    }
  }

  return result
}

/** Look up a friendly label for a canonical keyword, or build a title-case one. */
function keywordToLabel(canonical: string): string {
  // First look in synonym map (canonical -> label)
  for (const entry of SYNONYM_ENTRIES) {
    if (entry.canonical === canonical) return entry.label
  }
  // Leave CJK as-is
  if (/[\u4e00-\u9fff]/.test(canonical)) return canonical
  return canonical.charAt(0).toUpperCase() + canonical.slice(1)
}

/** Map a domain to a friendlier human label. */
const DOMAIN_NAME_MAP: Record<string, string> = {
  'github.com': 'GitHub',
  'gitlab.com': 'GitLab',
  'stackoverflow.com': 'Stack Overflow',
  'stackexchange.com': 'Stack Exchange',
  'medium.com': 'Medium',
  'dev.to': 'DEV',
  'youtube.com': 'YouTube',
  'youtu.be': 'YouTube',
  'twitter.com': 'Twitter / X',
  'x.com': 'Twitter / X',
  'reddit.com': 'Reddit',
  'news.ycombinator.com': 'Hacker News',
  'producthunt.com': 'Product Hunt',
  'arxiv.org': 'arXiv',
  'scholar.google.com': 'Google Scholar',
  'docs.google.com': 'Google Docs',
  'drive.google.com': 'Google Drive',
  'notion.so': 'Notion',
  'figma.com': 'Figma',
  'linkedin.com': 'LinkedIn',
  'mozilla.org': 'Mozilla',
  'developer.mozilla.org': 'MDN',
  'npmjs.com': 'npm',
  'mdn.io': 'MDN',
}

function domainToFolderName(domain: string): string {
  const known = DOMAIN_NAME_MAP[domain]
  if (known) return known
  // Fall back: strip TLD, take first label, title-case
  const root = domain.replace(/\.(com|org|net|io|dev|co|ai|app|tech|gg|xyz)$/, '')
  const firstLabel = root.split('.')[0] ?? root
  return firstLabel.charAt(0).toUpperCase() + firstLabel.slice(1)
}

function recencyWeight(bm: BookmarkRecord): number {
  const age = NOW() - (bm.dateAdded ?? NOW())
  const ageDays = age / DAY_MS
  if (ageDays < 30) return 1.4
  if (ageDays < 180) return 1.1
  if (ageDays < 365) return 1.0
  return 0.8
}

function buildFolderProfiles(
  bookmarks: BookmarkRecord[],
  keywordsFor: (bm: BookmarkRecord) => string[],
): Map<string, FolderProfile> {
  const profiles = new Map<string, FolderProfile>()
  for (const bm of bookmarks) {
    if (!bm.url || !bm.parentId) continue
    let profile = profiles.get(bm.parentId)
    if (!profile) {
      profile = {
        id: bm.parentId,
        path: bm.folderPath,
        domains: new Map(),
        keywords: new Map(),
        bookmarkCount: 0,
      }
      profiles.set(bm.parentId, profile)
    }
    const w = recencyWeight(bm)
    profile.bookmarkCount++
    const domain = extractDomain(bm.url)
    if (domain) profile.domains.set(domain, (profile.domains.get(domain) ?? 0) + w)
    for (const kw of keywordsFor(bm)) {
      profile.keywords.set(kw, (profile.keywords.get(kw) ?? 0) + w)
    }
  }
  return profiles
}

interface MatchResult {
  folder: FolderProfile
  score: number
  reasons: string[]
  codes: NonNullable<OrganizeSuggestion['reasonCodes']>
}

function scoreFolderMatch(
  bookmark: BookmarkRecord,
  folder: FolderProfile,
  keywordsFor: (bm: BookmarkRecord) => string[],
): MatchResult {
  let score = 0
  const reasons: string[] = []
  const codes: MatchResult['codes'] = []

  const domain = bookmark.url ? extractDomain(bookmark.url) : null
  if (domain) {
    const domainCount = folder.domains.get(domain) ?? 0
    if (domainCount >= 2) {
      score += 30 + Math.min(Math.round(domainCount) * 5, 20)
      reasons.push(`${Math.round(domainCount)} bookmarks from ${domain} already live here`)
      codes.push('domain_cluster')
    }
  }

  const titleKeywords = keywordsFor(bookmark)
  const matched: string[] = []
  for (const kw of titleKeywords) {
    if ((folder.keywords.get(kw) ?? 0) >= 2) matched.push(kw)
  }
  if (matched.length > 0 && titleKeywords.length > 0) {
    const ratio = matched.length / titleKeywords.length
    score += Math.round(ratio * 30)
    reasons.push(`Title matches keywords: ${matched.slice(0, 3).join(', ')}`)
    codes.push('keyword_match')
  }

  if (folder.bookmarkCount >= 5) {
    score += 5
    codes.push('established_folder')
  }
  return { folder, score, reasons, codes }
}

/* ---------- Filters ---------- */

interface GenerateOptions {
  ignoredSuggestionIds?: string[]
  antiMoves?: string[]
  /** When set, only suggest moves for bookmarks in this folder's subtree. */
  scopeFolderId?: string | null
  limit?: number
  /**
   * Optional auxiliary text per bookmark. Merged
   * into the keyword extraction pool so cross-lingual clustering works.
   */
  auxiliaryText?: Map<string, string>
  /**
   * Folder IDs the user has marked protected — their entire subtree is off
   * limits: no bookmark inside is suggested for move, no suggestion targets
   * any folder inside.
   */
  protectedFolderIds?: string[]
}

function isInScope(
  bookmark: BookmarkRecord,
  scopeFolderId: string | null | undefined,
  descendantFolderIds: Set<string>,
): boolean {
  if (!scopeFolderId) return true
  return bookmark.parentId ? descendantFolderIds.has(bookmark.parentId) : false
}

function collectDescendantFolderIds(
  records: BookmarkRecord[],
  rootFolderId: string,
): Set<string> {
  const childrenOf = new Map<string, string[]>()
  for (const r of records) {
    if (r.url || !r.parentId) continue
    const list = childrenOf.get(r.parentId) ?? []
    list.push(r.id)
    childrenOf.set(r.parentId, list)
  }
  const result = new Set<string>([rootFolderId])
  const stack = [rootFolderId]
  while (stack.length > 0) {
    const id = stack.pop()!
    const kids = childrenOf.get(id) ?? []
    for (const k of kids) {
      if (!result.has(k)) {
        result.add(k)
        stack.push(k)
      }
    }
  }
  return result
}

function antiMovesSet(pairs: string[] | undefined): Set<string> {
  return new Set(pairs ?? [])
}

function isBlocked(
  bookmarkId: string,
  targetFolderId: string,
  antiMoves: Set<string>,
): boolean {
  return antiMoves.has(`${bookmarkId}::${targetFolderId}`)
}

/* ---------- Global move suggestions ---------- */

/**
 * Generate organization suggestions by analyzing folder content patterns.
 * When scopeFolderId is set, only bookmarks within that subtree are
 * considered as move sources.
 */
export function generateOrganizeSuggestions(
  bookmarks: BookmarkRecord[],
  options: GenerateOptions = {},
): OrganizeSuggestion[] {
  const {
    ignoredSuggestionIds = [],
    antiMoves = [],
    scopeFolderId = null,
    limit = 40,
    auxiliaryText,
    protectedFolderIds = [],
  } = options

  const links = bookmarks.filter((b) => b.url)
  if (links.length === 0) return []

  const protectedSet = expandProtectedFolders(bookmarks, protectedFolderIds)

  const keywordsFor = (bm: BookmarkRecord): string[] => {
    const primary = extractKeywords(bm.title)
    const aux = auxiliaryText?.get(bm.id)
    if (!aux) return primary
    return [...primary, ...extractKeywords(aux)]
  }

  const descendantFolders = scopeFolderId
    ? collectDescendantFolderIds(bookmarks, scopeFolderId)
    : new Set<string>()

  const scopedSources = scopeFolderId
    ? links.filter((b) => isInScope(b, scopeFolderId, descendantFolders))
    : links

  const profiles = buildFolderProfiles(links, keywordsFor)
  const ignoredSet = new Set(ignoredSuggestionIds)
  const blocked = antiMovesSet(antiMoves)
  const suggestions: OrganizeSuggestion[] = []

  for (const bookmark of scopedSources) {
    // Never suggest moving a bookmark that lives inside a protected subtree.
    if (bookmark.parentId && protectedSet.has(bookmark.parentId)) continue

    // Score the CURRENT folder too — used as a baseline so we don't propose a
    // cross-move between two folders that are both decent fits. Without this
    // any two folders rich in the same topic would ping-pong their items.
    let currentScore = 0
    if (bookmark.parentId) {
      const currentProfile = profiles.get(bookmark.parentId)
      if (currentProfile) {
        currentScore = scoreFolderMatch(bookmark, currentProfile, keywordsFor).score
      }
    }

    const scored: MatchResult[] = []
    for (const [folderId, folder] of profiles) {
      if (folderId === bookmark.parentId) continue
      if (folder.path.some((p) => p === 'Favewise Trash')) continue
      if (isBlocked(bookmark.id, folderId, blocked)) continue
      // Skip protected folders as destinations too.
      if (protectedSet.has(folderId)) continue
      const match = scoreFolderMatch(bookmark, folder, keywordsFor)
      if (match.score >= 35) scored.push(match)
    }
    if (scored.length === 0) continue
    scored.sort((a, b) => b.score - a.score)
    const top = scored[0]
    // Only propose a move if the new home is a *meaningfully* better fit.
    // 1.35× margin prevents churn between two comparable folders while still
    // catching clearly-misplaced bookmarks (loose items score ~0 here).
    if (currentScore > 0 && top.score < currentScore * 1.35) continue
    const id = makeMoveId(bookmark.id, top.folder.id)
    if (ignoredSet.has(id)) continue
    const folderName = top.folder.path[top.folder.path.length - 1] ?? 'Unknown'
    const alternatives = scored.slice(1, 3).map((m) => ({
      targetFolderId: m.folder.id,
      suggestedPath: m.folder.path,
      confidence: Math.min(m.score / 100, 0.99),
      reason: m.reasons[0] ?? `Possible fit for "${m.folder.path[m.folder.path.length - 1]}"`,
    }))

    suggestions.push({
      id,
      kind: 'move',
      bookmarkId: bookmark.id,
      memberIds: [bookmark.id],
      currentPath: bookmark.folderPath,
      suggestedPath: top.folder.path,
      targetFolderId: top.folder.id,
      confidence: Math.min(top.score / 100, 0.99),
      reason: top.reasons.join(' · ') || `Better fit for "${folderName}"`,
      reasonCodes: top.codes,
      alternatives: alternatives.length > 0 ? alternatives : undefined,
    })
  }

  suggestions.sort((a, b) => b.confidence - a.confidence)
  return suggestions.slice(0, limit)
}

/* ---------- Targeted analysis (cluster + propose new folders) ---------- */

interface AnalyzeOptions {
  ignoredSuggestionIds?: string[]
  antiMoves?: string[]
  /** Minimum cluster size for domain-based clusters (default 3) */
  minDomainClusterSize?: number
  /** Minimum cluster size for keyword-based clusters (default 2) */
  minKeywordClusterSize?: number
  /**
   * Optional map of bookmarkId → extra text (e.g. the English translation of
   * a non-English title). When provided, keywords are extracted from BOTH
   * the original title and this auxiliary text so cross-lingual bookmarks
   * cluster together ("安全" + "security" → one cluster labeled "Security").
   */
  auxiliaryText?: Map<string, string>
  /** Protected folder IDs — their subtree is off-limits for any move. */
  protectedFolderIds?: string[]
}

/**
 * List of words that, on their own, are meaningless as cluster themes. When
 * these appear as the top shared keyword across titles it's almost always
 * because sites share common generic page labels, not because they're
 * semantically related. Examples: "Home", "Platform", "Dashboard".
 */
const GENERIC_CLUSTER_WORDS = new Set([
  'home', 'homepage', 'index', 'main',
  'platform', 'service', 'system', 'site', 'website', 'page', 'app', 'apps',
  'welcome', 'about', 'contact', 'login', 'signin', 'signup',
  'dashboard', 'overview', 'portal', 'console',
  'default', 'details', 'view', 'list',
  'new', 'latest', 'today', 'online', 'live',
  'free', 'pro', 'plus',
])

/** Expand a protected-folder id set to include every descendant folder id. */
function expandProtectedFolders(
  allRecords: BookmarkRecord[],
  protectedIds: string[],
): Set<string> {
  return expandProtectedSubtree(allRecords, protectedIds)
}

/**
 * Analyze a specific folder and propose BOTH:
 *   1. moves into existing sibling subfolders when a good match exists
 *   2. new subfolders grouping loose direct-child bookmarks by domain / keyword
 *
 * This is the "organize just this folder" mode.
 */
export function analyzeFolder(
  allRecords: BookmarkRecord[],
  parentFolderId: string,
  options: AnalyzeOptions = {},
): OrganizeSuggestion[] {
  const {
    ignoredSuggestionIds = [],
    antiMoves = [],
    minDomainClusterSize = 3,
    minKeywordClusterSize = 2,
    auxiliaryText,
    protectedFolderIds = [],
  } = options

  const protectedSet = expandProtectedFolders(allRecords, protectedFolderIds)

  // If the scope folder itself is protected, analysis is a no-op.
  if (protectedSet.has(parentFolderId)) return []

  /** Combined keyword extraction: original title + any auxiliary form. */
  const keywordsFor = (bm: BookmarkRecord): string[] => {
    const primary = extractKeywords(bm.title)
    const aux = auxiliaryText?.get(bm.id)
    if (!aux) return primary
    return [...primary, ...extractKeywords(aux)]
  }

  const ignoredSet = new Set(ignoredSuggestionIds)
  const blocked = antiMovesSet(antiMoves)

  const parentNode = allRecords.find((r) => r.id === parentFolderId)
  if (!parentNode) return []
  const parentPath = [...parentNode.folderPath, parentNode.title].filter(Boolean)

  const directLinks = allRecords.filter(
    (r) => r.parentId === parentFolderId && r.url,
  )
  const directSubfolders = allRecords.filter(
    (r) => r.parentId === parentFolderId && !r.url,
  )
  const directSubfolderNames = new Set(
    directSubfolders.map((f) => f.title.toLowerCase().trim()),
  )

  // Profiles of direct subfolders for existing-match scoring
  const subfolderProfiles = new Map<string, FolderProfile>()
  for (const sub of directSubfolders) {
    const links = allRecords.filter(
      (r) => r.parentId === sub.id && r.url,
    )
    if (links.length === 0) continue
    const profile: FolderProfile = {
      id: sub.id,
      path: [...parentPath, sub.title],
      domains: new Map(),
      keywords: new Map(),
      bookmarkCount: links.length,
    }
    for (const bm of links) {
      const d = extractDomain(bm.url!)
      if (d) profile.domains.set(d, (profile.domains.get(d) ?? 0) + 1)
      for (const kw of keywordsFor(bm)) {
        profile.keywords.set(kw, (profile.keywords.get(kw) ?? 0) + 1)
      }
    }
    subfolderProfiles.set(sub.id, profile)
  }

  const visibleDirectLinks = directLinks.filter(
    (bm) => !bm.parentId || !protectedSet.has(bm.parentId),
  )

  const suggestions: OrganizeSuggestion[] = []
  const taken = new Set<string>()

  // ==== Pass 0: group by URL taxonomy (primary semantic signal) ====
  // Uses a curated ~300-domain classification — what each site DOES.
  // This is what catches "code4rena + cantina + halborn" → "Security Audits"
  // without relying on title keywords.
  const byTaxonomy = new Map<string, BookmarkRecord[]>()
  // Remainders fall through to domain clustering
  const notCategorized: BookmarkRecord[] = []
  for (const bm of visibleDirectLinks) {
    const cat = categorizeUrl(bm.url!)
    if (cat && cat.confidence >= 0.7) {
      const list = byTaxonomy.get(cat.label) ?? []
      list.push(bm)
      byTaxonomy.set(cat.label, list)
    } else {
      notCategorized.push(bm)
    }
  }

  // For taxonomy label → best existing subfolder affinity
  // Learn: does any existing subfolder already contain mostly this label?
  const subfolderLabelCounts = new Map<string, Map<string, number>>()
  for (const sub of directSubfolders) {
    const counts = new Map<string, number>()
    const kids = allRecords.filter((r) => r.parentId === sub.id && r.url)
    for (const k of kids) {
      const c = categorizeUrl(k.url!)
      if (c) counts.set(c.label, (counts.get(c.label) ?? 0) + 1)
    }
    subfolderLabelCounts.set(sub.id, counts)
  }
  // ==== Pass 0 resolution: decide create-new vs. move-into-existing ====
  for (const [label, items] of byTaxonomy) {
    if (items.length < 2) {
      for (const it of items) notCategorized.push(it)
      continue
    }
    // Find a sibling subfolder with strong affinity to this label, if any
    let bestSub: typeof directSubfolders[number] | undefined
    let bestCount = 0
    for (const sub of directSubfolders) {
      const c = subfolderLabelCounts.get(sub.id)?.get(label) ?? 0
      const nameMatches = sub.title.toLowerCase().includes(label.toLowerCase())
        || label.toLowerCase().includes(sub.title.toLowerCase())
      const score = c + (nameMatches ? 3 : 0)
      if (score >= 2 && score > bestCount) {
        bestCount = score
        bestSub = sub
      }
    }

    if (bestSub) {
      // Move each item into the existing folder
      for (const bm of items) {
        if (isBlocked(bm.id, bestSub.id, blocked)) continue
        if (bm.parentId === bestSub.id) continue
        const id = makeMoveId(bm.id, bestSub.id)
        if (ignoredSet.has(id)) continue
        taken.add(bm.id)
        suggestions.push({
          id,
          kind: 'move',
          bookmarkId: bm.id,
          memberIds: [bm.id],
          currentPath: bm.folderPath,
          suggestedPath: [...parentPath, bestSub.title],
          targetFolderId: bestSub.id,
          confidence: Math.min(0.82 + bestCount * 0.02, 0.95),
          reason: `Site function: ${label} — fits your existing "${bestSub.title}" folder`,
          reasonCodes: ['domain_cluster', 'established_folder'],
        })
      }
    } else {
      // Propose new subfolder with taxonomy label as its name
      let folderName = label
      while (directSubfolderNames.has(folderName.toLowerCase())) folderName += ' (new)'
      const memberIds = items.map((i) => i.id)
      const id = makeCreateMoveId(parentFolderId, folderName, memberIds)
      if (ignoredSet.has(id)) continue
      if (memberIds.every((mid) => isBlocked(mid, `new:${folderName}`, blocked))) continue
      for (const bm of items) taken.add(bm.id)
      suggestions.push({
        id,
        kind: 'create_and_move',
        bookmarkId: items[0].id,
        memberIds,
        currentPath: parentPath,
        suggestedPath: [...parentPath, folderName],
        targetFolderId: parentFolderId,
        newFolderName: folderName,
        confidence: Math.min(0.82 + items.length * 0.02, 0.95),
        reason: `${items.length} sites share function: ${label}`,
        reasonCodes: ['domain_cluster'],
      })
    }
  }

  // ==== Pass 1: fall back to domain clustering for untagged URLs ====
  const byDomain = new Map<string, BookmarkRecord[]>()
  const unclustered: BookmarkRecord[] = []
  for (const bm of notCategorized) {
    if (taken.has(bm.id)) continue
    const d = extractDomain(bm.url!)
    if (!d) { unclustered.push(bm); continue }
    const list = byDomain.get(d) ?? []
    list.push(bm)
    byDomain.set(d, list)
  }

  for (const [domain, items] of byDomain) {
    if (items.length < minDomainClusterSize) {
      for (const it of items) unclustered.push(it)
      continue
    }
    // Does an existing subfolder match this domain strongly?
    let matchedExisting: FolderProfile | null = null
    for (const p of subfolderProfiles.values()) {
      const d = p.domains.get(domain) ?? 0
      if (d >= Math.max(2, Math.floor(items.length / 2))) {
        matchedExisting = p
        break
      }
    }
    if (matchedExisting) {
      for (const bm of items) {
        if (isBlocked(bm.id, matchedExisting.id, blocked)) continue
        const id = makeMoveId(bm.id, matchedExisting.id)
        if (ignoredSet.has(id)) continue
        taken.add(bm.id)
        suggestions.push({
          id,
          kind: 'move',
          bookmarkId: bm.id,
          memberIds: [bm.id],
          currentPath: bm.folderPath,
          suggestedPath: matchedExisting.path,
          targetFolderId: matchedExisting.id,
          confidence: 0.8,
          reason: `Matches existing "${matchedExisting.path[matchedExisting.path.length - 1]}" folder by domain`,
          reasonCodes: ['domain_cluster', 'established_folder'],
        })
      }
    } else {
      // Propose NEW subfolder grouped by domain
      let folderName = domainToFolderName(domain)
      // Avoid name collision with siblings
      while (directSubfolderNames.has(folderName.toLowerCase())) folderName += ' (new)'
      const memberIds = items.map((i) => i.id)
      const id = makeCreateMoveId(parentFolderId, folderName, memberIds)
      if (ignoredSet.has(id)) continue
      // If every single pair is blocked, skip
      const allBlocked = memberIds.every((mid) => isBlocked(mid, `new:${folderName}`, blocked))
      if (allBlocked) continue
      for (const bm of items) taken.add(bm.id)
      suggestions.push({
        id,
        kind: 'create_and_move',
        bookmarkId: items[0].id,
        memberIds,
        currentPath: parentPath,
        suggestedPath: [...parentPath, folderName],
        targetFolderId: parentFolderId,
        newFolderName: folderName,
        confidence: Math.min(0.6 + items.length * 0.03, 0.92),
        reason: `${items.length} bookmarks share domain ${domain} — group them together`,
        reasonCodes: ['domain_cluster'],
      })
    }
  }

  // Cluster remaining by shared title keyword (stemmed + CJK bigrams).
  // Pass 1 at higher threshold catches strong themes first.
  // Pass 2 at minKeywordClusterSize sweeps up small-but-obvious themes.
  const remaining = unclustered.filter((bm) => !taken.has(bm.id))
  if (remaining.length >= minKeywordClusterSize) {
    const keywordBuckets = new Map<string, BookmarkRecord[]>()
    for (const bm of remaining) {
      // Use Set so duplicate keywords within one title don't inflate the bucket.
      const kws = new Set(keywordsFor(bm))
      for (const kw of kws) {
        const list = keywordBuckets.get(kw) ?? []
        list.push(bm)
        keywordBuckets.set(kw, list)
      }
    }

    // Rank buckets. Prefer: (a) larger size, (b) longer keyword (more specific),
    // (c) non-trivial keyword (length > 3).
    const ranked = Array.from(keywordBuckets.entries())
      .filter(([, items]) => items.length >= minKeywordClusterSize)
      .sort((a, b) => {
        if (b[1].length !== a[1].length) return b[1].length - a[1].length
        return b[0].length - a[0].length
      })

    const usedIds = new Set<string>()
    for (const [keyword, items] of ranked) {
      const fresh = items.filter((i) => !usedIds.has(i.id))
      if (fresh.length < minKeywordClusterSize) continue
      // Reject generic words that produce meaningless clusters even when
      // frequent (e.g. "home", "platform", "dashboard").
      if (GENERIC_CLUSTER_WORDS.has(keyword)) continue
      // If a bucket is trivially small (2) and keyword is short, skip to avoid
      // over-fragmentation; unless we're really running out of clusters.
      if (fresh.length < 3 && keyword.length < 4) continue
      const folderName = keywordToLabel(keyword)
      let finalName = folderName
      while (directSubfolderNames.has(finalName.toLowerCase())) finalName += ' (new)'
      const memberIds = fresh.map((i) => i.id)
      const id = makeCreateMoveId(parentFolderId, finalName, memberIds)
      if (ignoredSet.has(id)) continue
      for (const bm of fresh) usedIds.add(bm.id)
      suggestions.push({
        id,
        kind: 'create_and_move',
        bookmarkId: fresh[0].id,
        memberIds,
        currentPath: parentPath,
        suggestedPath: [...parentPath, finalName],
        targetFolderId: parentFolderId,
        newFolderName: finalName,
        confidence: Math.min(0.45 + fresh.length * 0.04, 0.9),
        reason:
          fresh.length === 2
            ? `Two titles share "${keyword}" — group them`
            : `${fresh.length} titles share the keyword "${keyword}"`,
        reasonCodes: ['title_cluster'],
      })
    }
  }

  // Rank: create_and_move with bigger clusters first, then moves by confidence
  suggestions.sort((a, b) => {
    if (a.kind === b.kind) return b.confidence - a.confidence
    return a.kind === 'create_and_move' ? -1 : 1
  })

  return suggestions
}
