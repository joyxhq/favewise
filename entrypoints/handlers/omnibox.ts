import { openPrimaryPanel } from '~/shared/lib/webext'
import { backgroundT } from '~/shared/lib/i18n-background'

const VIEW_ALIASES: Array<{ keys: string[]; view: string; labelKey: string }> = [
  { keys: ['dashboard', 'home'],    view: 'dashboard',     labelKey: 'nav.dashboard' },
  { keys: ['dead', 'dead-links'],   view: 'dead-links',    labelKey: 'nav.deadLinks' },
  { keys: ['dup', 'duplicates'],    view: 'duplicates',    labelKey: 'nav.duplicates' },
  { keys: ['organize', 'org'],      view: 'organize',      labelKey: 'nav.organize' },
  { keys: ['rediscover', 'old'],    view: 'rediscover',    labelKey: 'nav.rediscover' },
  { keys: ['empty', 'empty-folders'], view: 'empty-folders', labelKey: 'nav.emptyFolders' },
  { keys: ['insights', 'stats'],    view: 'insights',      labelKey: 'nav.insights' },
  { keys: ['settings'],             view: 'settings',      labelKey: 'nav.settings' },
]

function escapeOmnibox(s: string): string {
  return s.replace(/[&<>'"]/g, (c) => {
    switch (c) {
      case '&': return '&amp;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '"': return '&quot;'
      case "'": return '&apos;'
      default: return c
    }
  })
}

export function wireOmnibox() {
  if (!chrome.omnibox) return
  try {
    chrome.omnibox.setDefaultSuggestion({
      description: escapeOmnibox(backgroundT('omnibox.defaultSuggestion')),
    })
  } catch { /* ignore */ }

  chrome.omnibox.onInputChanged.addListener(async (text, suggest) => {
    const trimmed = text.trim()
    try {
      if (trimmed.startsWith(':')) {
        const q = trimmed.slice(1).toLowerCase()
        const out: chrome.omnibox.SuggestResult[] = []
        for (const entry of VIEW_ALIASES) {
          if (!q || entry.keys.some((k) => k.includes(q))) {
            out.push({
              content: `view:${entry.view}`,
              description: `${escapeOmnibox(backgroundT('omnibox.openApp'))} → <match>${escapeOmnibox(backgroundT(entry.labelKey))}</match>`,
            })
          }
        }
        suggest(out.slice(0, 8))
        return
      }

      if (trimmed.length < 2) {
        suggest([])
        return
      }

      const results = await chrome.bookmarks.search(trimmed)
      const suggestions: chrome.omnibox.SuggestResult[] = []
      for (const r of results.slice(0, 8)) {
        if (!r.url) continue
        const title = r.title || r.url
        suggestions.push({
          content: r.url,
          description: `<match>${escapeOmnibox(title)}</match> <dim>${escapeOmnibox(r.url)}</dim>`,
        })
      }
      if (suggestions.length === 0) {
        suggestions.push({
          content: 'view:dashboard',
          description: `${escapeOmnibox(backgroundT('omnibox.noBookmarkMatches', { query: trimmed }))} — <match>${escapeOmnibox(backgroundT('omnibox.openApp'))}</match>`,
        })
      }
      suggest(suggestions)
    } catch (e) {
      console.warn('[Favewise] omnibox.onInputChanged failed:', e)
    }
  })

  chrome.omnibox.onInputEntered.addListener(async (text, disposition) => {
    try {
      if (text.startsWith('view:')) {
        const view = text.slice(5)
        await chrome.storage.local.set({
          'favewise:pendingView': { view, at: Date.now() },
        })
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        await openPrimaryPanel(tab?.id)
        return
      }
      if (/^https?:\/\//i.test(text)) {
        if (disposition === 'newForegroundTab') {
          await chrome.tabs.create({ url: text })
        } else if (disposition === 'newBackgroundTab') {
          await chrome.tabs.create({ url: text, active: false })
        } else {
          await chrome.tabs.update({ url: text })
        }
        return
      }
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      await openPrimaryPanel(tab?.id)
    } catch (e) {
      console.warn('[Favewise] omnibox.onInputEntered failed:', e)
    }
  })
}
