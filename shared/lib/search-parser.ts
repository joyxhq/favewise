export type FilterField = 'domain' | 'tag' | 'folder' | 'title' | 'url' | 'before' | 'after'
export type FilterOperator = 'contains' | 'equals'

export interface ParsedQuery {
  raw: string
  filters: Filter[]
  freeText: string[]
}

export interface Filter {
  field: FilterField
  operator: FilterOperator
  value: string
}

const FILTER_PATTERNS: Array<{
  field: FilterField
  pattern: RegExp
  extractValue: (m: RegExpMatchArray) => string
}> = [
  {
    field: 'domain',
    pattern: /^domain:(.+)$/i,
    extractValue: (m) => m[1].trim(),
  },
  {
    field: 'tag',
    pattern: /^tag:(.+)$/i,
    extractValue: (m) => m[1].trim(),
  },
  {
    field: 'folder',
    pattern: /^folder:(.+)$/i,
    extractValue: (m) => m[1].trim(),
  },
  {
    field: 'title',
    pattern: /^title:(.+)$/i,
    extractValue: (m) => m[1].trim(),
  },
  {
    field: 'url',
    pattern: /^url:(.+)$/i,
    extractValue: (m) => m[1].trim(),
  },
  {
    field: 'before',
    pattern: /^before:(\d{4}-\d{2}(?:-\d{2})?)$/i,
    extractValue: (m) => m[1].trim(),
  },
  {
    field: 'after',
    pattern: /^after:(\d{4}-\d{2}(?:-\d{2})?)$/i,
    extractValue: (m) => m[1].trim(),
  },
]

export function parseQuery(input: string): ParsedQuery {
  if (!input?.trim()) {
    return { raw: input, filters: [], freeText: [] }
  }

  const tokens = input.trim().split(/\s+/)
  const filters: Filter[] = []
  const freeText: string[] = []

  for (const token of tokens) {
    let matched = false

    for (const fp of FILTER_PATTERNS) {
      const m = token.match(fp.pattern)
      if (m) {
        const value = fp.extractValue(m)
        if (value) {
          filters.push({ field: fp.field, operator: 'contains', value })
        }
        matched = true
        break
      }
    }

    if (!matched) {
      if (token.startsWith('"') && token.endsWith('"') && token.length > 2) {
        freeText.push(token.slice(1, -1))
      } else {
        freeText.push(token)
      }
    }
  }

  return { raw: input, filters, freeText }
}

export function matchesFilter(
  bm: { title?: string; url?: string; dateAdded?: number; parentId?: string },
  filter: Filter,
  bookmarkTags: string[],
  folderPath?: string[],
): boolean {
  const { field, operator, value } = filter
  const caseInsensitive = operator !== 'equals'
  const v = caseInsensitive ? value.toLowerCase() : value

  switch (field) {
    case 'domain': {
      if (!bm.url) return false
      try {
        const domain = new URL(bm.url).hostname.replace(/^www\./, '')
        return caseInsensitive ? domain.toLowerCase().includes(v) : domain.includes(v)
      } catch { return false }
    }
    case 'url':
      return caseInsensitive
        ? (bm.url ?? '').toLowerCase().includes(v)
        : (bm.url ?? '').includes(v)
    case 'title':
      return caseInsensitive
        ? (bm.title ?? '').toLowerCase().includes(v)
        : (bm.title ?? '').includes(v)
    case 'tag': {
      const tagStr = bookmarkTags.join(' ').toLowerCase()
      return caseInsensitive ? tagStr.includes(v) : tagStr.includes(value)
    }
    case 'folder': {
      const folderStr = folderPath?.join(' ').toLowerCase() ?? ''
      return caseInsensitive ? folderStr.includes(v) : folderStr.includes(value)
    }
    case 'before': {
      if (!bm.dateAdded) return false
      const cutoff = new Date(value).getTime()
      return bm.dateAdded < cutoff
    }
    case 'after': {
      if (!bm.dateAdded) return false
      const cutoff = new Date(value).getTime() + 86400000
      return bm.dateAdded >= cutoff
    }
  }
}

export function matchesParsedQuery(
  bm: { title?: string; url?: string; dateAdded?: number; parentId?: string },
  query: ParsedQuery,
  bookmarkTags: string[],
  folderPath?: string[],
): boolean {
  if (query.filters.length === 0 && query.freeText.length === 0) {
    return true
  }

  for (const filter of query.filters) {
    if (!matchesFilter(bm, filter, bookmarkTags, folderPath)) {
      return false
    }
  }

  if (query.freeText.length > 0) {
    const haystack = [
      bm.title ?? '',
      bm.url ?? '',
    ].join(' ').toLowerCase()

    const allMatch = query.freeText.every((ft) =>
      haystack.includes(ft.toLowerCase()),
    )
    if (!allMatch) return false
  }

  return true
}

export function getFilterSuggestions(query: string): string[] {
  const hints: string[] = []
  if (!query.includes('domain:')) hints.push('domain:github.com')
  if (!query.includes('tag:')) hints.push('tag:work')
  if (!query.includes('folder:')) hints.push('folder:Projects')
  if (!query.includes('title:')) hints.push('title:react')
  if (!query.includes('url:')) hints.push('url:api')
  if (!query.includes('before:')) hints.push('before:2024-01-01')
  if (!query.includes('after:')) hints.push('after:2024-01-01')
  return hints
}