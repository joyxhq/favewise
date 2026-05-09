import { en } from './locale/en'
import { zhCN } from './locale/zh-CN'

type Args = Record<string, string | number>
type Key = keyof typeof en | string

function backgroundLocale(): 'en' | 'zh-CN' {
  try {
    const raw = chrome.i18n?.getUILanguage?.() ?? 'en'
    return raw.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
  } catch {
    return 'en'
  }
}

function interpolate(template: string, args: Args): string {
  return template.replace(/\{(\w+)\}/g, (_, name) => {
    const v = args[name]
    return v === undefined ? '' : String(v)
  })
}

export function backgroundT(key: Key, args?: Args): string {
  const dict = backgroundLocale() === 'zh-CN' ? zhCN : en
  const fallback = en
  const k = key as keyof typeof en

  if (args && typeof args.count === 'number' && args.count !== 1) {
    const pluralKey = `${String(k)}.plural` as keyof typeof en
    const pluralEntry = (dict[pluralKey] ?? fallback[pluralKey]) as string | undefined
    if (pluralEntry) return interpolate(pluralEntry, args)
  }

  const entry = (dict[k] ?? fallback[k]) as string | undefined
  if (!entry) return String(key)
  return args ? interpolate(entry, args) : entry
}
