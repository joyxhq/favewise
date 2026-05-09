const BROWSER = (import.meta as { env?: { BROWSER?: string } }).env?.BROWSER
const FIREFOX_ID = 'favewise@joyx.io'

type AnyApi = Record<string, unknown>

const globalScope = globalThis as typeof globalThis & {
  browser?: AnyApi
  chrome?: AnyApi
}

function createFirefoxChromeCompat(browserApi: AnyApi): AnyApi {
  const panelApi: Record<string, unknown> = {
    open: async () => {
      const sidebar = browserApi.sidebarAction as Record<string, unknown> | undefined
      if (typeof sidebar?.open === 'function') {
        await (sidebar.open as () => Promise<void>)()
      }
    },
    setPanelBehavior: async () => {},
  }

  return new Proxy(browserApi, {
    get(target, prop, receiver) {
      if (prop === 'action') return target.browserAction
      if (prop === 'sidePanel') return panelApi
      return Reflect.get(target, prop, receiver)
    },
  })
}

if (BROWSER === 'firefox' && globalScope.browser) {
  ;(globalScope as { chrome?: AnyApi }).chrome = createFirefoxChromeCompat(globalScope.browser)
}

export const webext = (globalScope.chrome ?? globalScope.browser) as AnyApi
export const isFirefox = BROWSER === 'firefox'
export const firefoxAddonId = FIREFOX_ID
export const DEAD_LINK_HOST_PERMISSION = '<all_urls>'

export function supportsFaviconEndpoint(): boolean {
  return !isFirefox
}

export async function hasDeadLinkHostPermission(): Promise<boolean> {
  if (isFirefox) return true
  const permissions = webext.permissions as Record<string, unknown> | undefined
  const contains = permissions?.contains as
    | ((permissions: { origins: string[] }) => Promise<boolean>)
    | undefined
  if (typeof contains !== 'function') return false
  try {
    return await contains({ origins: [DEAD_LINK_HOST_PERMISSION] })
  } catch {
    return false
  }
}

export async function requestDeadLinkHostPermission(): Promise<boolean> {
  if (isFirefox) return true
  const permissions = webext.permissions as Record<string, unknown> | undefined
  const request = permissions?.request as
    | ((permissions: { origins: string[] }) => Promise<boolean>)
    | undefined
  if (typeof request !== 'function') return false
  try {
    return await request({ origins: [DEAD_LINK_HOST_PERMISSION] })
  } catch {
    return false
  }
}

export async function openPrimaryPanel(tabId?: number): Promise<void> {
  if (isFirefox) {
    const sidebar = webext.sidebarAction as Record<string, unknown> | undefined
    if (typeof sidebar?.open === 'function') {
      await (sidebar.open as () => Promise<void>)()
    }
    return
  }
  const sidePanel = webext.sidePanel as Record<string, unknown> | undefined
  if (typeof sidePanel?.open === 'function' && tabId !== undefined) {
    await (sidePanel.open as (opts: { tabId: number }) => Promise<void>)({ tabId })
  }
}

export async function configurePrimaryPanelBehavior(): Promise<void> {
  if (isFirefox) return
  const sidePanel = webext.sidePanel as Record<string, unknown> | undefined
  if (typeof sidePanel?.setPanelBehavior === 'function') {
    await (sidePanel.setPanelBehavior as (opts: { openPanelOnActionClick: boolean }) => Promise<void>)({ openPanelOnActionClick: true })
  }
}

function toolbarApi(): Record<string, unknown> | undefined {
  return isFirefox ? (webext.browserAction as Record<string, unknown>) : (webext.action as Record<string, unknown>)
}

export async function setToolbarBadgeText(text: string): Promise<void> {
  const api = toolbarApi()
  const fn = api?.setBadgeText as ((opts: { text: string }) => Promise<void>) | undefined
  if (typeof fn === 'function') {
    await fn({ text })
  }
}

export async function setToolbarTitle(title: string): Promise<void> {
  const api = toolbarApi()
  const fn = api?.setTitle as ((opts: { title: string }) => Promise<void>) | undefined
  if (typeof fn === 'function') {
    await fn({ title })
  }
}
