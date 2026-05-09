import {
  isScanning,
  isDeadLinksChecking,
  runScan,
} from '~/shared/services/scan-service'
import {
  getSettings,
  isBookmarkTreeDirty,
  markBookmarkTreeClean,
} from '~/shared/storage'
import { broadcast } from '~/shared/lib/messaging'
import { setToolbarBadgeText, setToolbarTitle } from '~/shared/lib/webext'
import { backgroundT } from '~/shared/lib/i18n-background'
import {
  getNewBookmarkInbox,
  getLatestScan,
} from '~/shared/storage'

const ALARM_SCAN = 'favewise:scheduledScan'
const FREQUENCY_MINUTES: Record<string, number> = {
  daily:   24 * 60,
  weekly:  7 * 24 * 60,
  monthly: 30 * 24 * 60,
}

export async function refreshScheduleAlarm(): Promise<void> {
  if (!chrome.alarms) return
  try {
    await chrome.alarms.clear(ALARM_SCAN)
    const settings = await getSettings()
    const freq = settings.scheduleFrequency ?? 'off'
    if (freq === 'off') return
    const period = FREQUENCY_MINUTES[freq]
    if (!period) return
    chrome.alarms.create(ALARM_SCAN, {
      periodInMinutes: period,
      delayInMinutes: period,
    })
  } catch (e) {
    console.error('[Favewise] refreshScheduleAlarm error:', e)
  }
}

async function runScheduledScan(): Promise<void> {
  if (isScanning() || isDeadLinksChecking()) return
  try {
    const dirty = await isBookmarkTreeDirty()
    if (!dirty) return
    const taskId = `scan_sched_${Date.now()}`
    const result = await runScan(taskId)
    await markBookmarkTreeClean()
    broadcast({ type: 'scan.completed', payload: result })
    await refreshBadge()
  } catch (e) {
    console.error('[Favewise] runScheduledScan error:', e)
  }
}

export async function refreshBadge(): Promise<void> {
  try {
    const [inbox, scan] = await Promise.all([
      getNewBookmarkInbox(),
      getLatestScan(),
    ])
    const pending = inbox.filter((e) => !e.dismissedAt).length

    await setToolbarBadgeText('')

    if (pending > 0) {
      await setToolbarTitle(backgroundT('toolbar.pendingNewBookmarks', { count: pending }))
      return
    }

    const deadCount = scan?.deadLinks?.filter((d) => d.status === 'invalid').length ?? 0
    if (deadCount > 0 && scan?.deadLinksChecked) {
      await setToolbarTitle(backgroundT('toolbar.deadLinksFound', { count: deadCount }))
      return
    }

    await setToolbarTitle(backgroundT('app.name'))
  } catch (e) {
    console.error('[Favewise] refreshBadge error:', e)
  }
}

export function wireAlarms() {
  if (!chrome.alarms) return
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_SCAN) runScheduledScan().catch(() => {})
  })
}
