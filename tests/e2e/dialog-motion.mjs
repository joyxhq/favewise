import { chromium } from 'playwright'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '../..')
const EXT = path.join(REPO, '.output/chrome-mv3')
const PROFILE = '/tmp/favewise-dialog-motion-profile'
const RESULTS = path.join(REPO, 'test-results/dialog-motion')
const VIEWPORT = { width: 420, height: 900 }

async function discoverExtensionId(ctx) {
  for (let i = 0; i < 40; i++) {
    const sw = ctx.serviceWorkers()[0]
    if (sw) return new URL(sw.url()).host
    await new Promise((r) => setTimeout(r, 250))
  }
  const page = await ctx.newPage()
  await page.goto('chrome://extensions/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  const id = await page.evaluate(() => {
    function findItem(root, depth = 0, acc = []) {
      if (!root || depth > 6) return acc
      const children = root.querySelectorAll ? root.querySelectorAll('*') : []
      for (const el of children) {
        if (el.tagName?.toLowerCase() === 'extensions-item' && el.id) acc.push(el.id)
        if (el.shadowRoot) findItem(el.shadowRoot, depth + 1, acc)
      }
      return acc
    }
    return findItem(document)[0] ?? null
  })
  await page.close()
  if (!id) throw new Error('Could not discover extension ID')
  return id
}

async function seedBookmarks(page) {
  return page.evaluate(async () => {
    await chrome.runtime.sendMessage({ type: 'settings.update', payload: { locale: 'zh-CN' } }).catch(() => null)
    const sandbox = await chrome.bookmarks.create({ parentId: '1', title: 'FavewiseMotion' })
    const empty = await chrome.bookmarks.create({ parentId: sandbox.id, title: 'EmptyMotion' })
    for (const title of ['Google', 'GitHub', 'MDN']) {
      await chrome.bookmarks.create({ parentId: sandbox.id, title, url: `https://example.com/${title.toLowerCase()}` })
    }
    return { sandboxId: sandbox.id, emptyId: empty.id }
  })
}

async function dismissInitialDialogs(page) {
  for (let i = 0; i < 6; i++) {
    const visibleDialog = await page.locator('[role="alertdialog"]').first().isVisible({ timeout: 300 }).catch(() => false)
    if (!visibleDialog) return
    const action = page.locator('[role="alertdialog"] button', { hasText: /Got it|知道了|Next|Skip|Cancel|取消/ }).first()
    if (await action.isVisible({ timeout: 300 }).catch(() => false)) {
      await action.click({ timeout: 1000 }).catch(() => {})
    } else {
      await page.keyboard.press('Escape').catch(() => {})
    }
    await page.waitForTimeout(180)
  }
}

async function sampleDialogDuringClick(page, clickLocator, label) {
  await page.evaluate(() => {
    window.__fwDialogMotion = []
  })
  await page.evaluate(() => {
    const samples = window.__fwDialogMotion
    const start = performance.now()
    const tick = () => {
      const el = document.querySelector('[role="alertdialog"]')
      if (el) {
        const r = el.getBoundingClientRect()
        samples.push({
          t: Math.round(performance.now() - start),
          x: Number(r.x.toFixed(2)),
          y: Number(r.y.toFixed(2)),
          w: Number(r.width.toFixed(2)),
          h: Number(r.height.toFixed(2)),
          cx: Number((r.x + r.width / 2).toFixed(2)),
          cy: Number((r.y + r.height / 2).toFixed(2)),
        })
      }
      if (performance.now() - start < 450) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await clickLocator.click({ timeout: 3000 })
  await page.waitForSelector('[role="alertdialog"]', { timeout: 3000 })
  await page.waitForTimeout(500)
  const samples = await page.evaluate(() => window.__fwDialogMotion ?? [])
  await fs.writeFile(path.join(RESULTS, `${label}.json`), JSON.stringify(samples, null, 2))
  if (samples.length < 3) throw new Error(`${label}: not enough dialog motion samples`)
  const final = samples[samples.length - 1]
  const maxCenterDrift = Math.max(...samples.map((s) => Math.abs(s.cx - final.cx)))
  if (maxCenterDrift > 1.5) {
    throw new Error(`${label}: dialog center drifted ${maxCenterDrift.toFixed(2)}px during open`)
  }
  return { samples, maxCenterDrift }
}

async function main() {
  await fs.rm(RESULTS, { recursive: true, force: true })
  await fs.mkdir(RESULTS, { recursive: true })
  await fs.rm(PROFILE, { recursive: true, force: true })

  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    viewport: VIEWPORT,
    recordVideo: { dir: RESULTS, size: VIEWPORT },
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      '--no-first-run',
      '--no-default-browser-check',
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
    ],
  })
  const extId = await discoverExtensionId(ctx)
  const page = await ctx.newPage()
  await page.setViewportSize(VIEWPORT)
  await page.goto(`chrome-extension://${extId}/sidepanel.html`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('header img, header span', { timeout: 10000 })
  await dismissInitialDialogs(page)
  const seed = await seedBookmarks(page)
  await page.waitForTimeout(1000)
  await page.locator('header button', { hasText: /Sync|同步/ }).first().click({ timeout: 3000 }).catch(() => {})
  await page.waitForTimeout(1200)

  const library = page.locator('nav[aria-label="Primary"] button[aria-label*="library" i], nav[aria-label="Primary"] button[aria-label*="书签库"]').first()
  await library.click({ timeout: 3000 })
  await page.waitForTimeout(400)
  const sandboxRow = page.locator(`[data-fw-row-id="${seed.sandboxId}"]`).first()
  await sandboxRow.click({ timeout: 3000 }).catch(() => {})
  await page.waitForTimeout(300)
  await sandboxRow.locator('button[role="checkbox"]').first().click({ timeout: 3000 })
  await page.locator(`[data-fw-row-id="${seed.emptyId}"] button[role="checkbox"]`).first().click({ timeout: 3000 })
  await page.waitForTimeout(300)

  const smart = await sampleDialogDuringClick(page, page.locator('[data-fw-smart-folder-create]').first(), 'smart-folder')
  await page.screenshot({ path: path.join(RESULTS, 'smart-folder-final.png'), fullPage: true })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  const bookmarkRow = page.locator('div[data-fw-row-id]').filter({ has: page.locator('a[aria-label]') }).first()
  await bookmarkRow.click({ timeout: 3000 })
  await page.waitForTimeout(300)
  const trash = await sampleDialogDuringClick(page, page.locator('[data-fw-bulk-trash]').first(), 'trash-confirm')
  await page.screenshot({ path: path.join(RESULTS, 'trash-confirm-final.png'), fullPage: true })

  await page.evaluate(async (id) => chrome.bookmarks.removeTree(id).catch(() => {}), seed.sandboxId).catch(() => {})
  const video = await page.video()?.path()
  await ctx.close()
  await fs.writeFile(path.join(RESULTS, 'summary.json'), JSON.stringify({
    viewport: VIEWPORT,
    smartFolderMaxCenterDrift: smart.maxCenterDrift,
    trashConfirmMaxCenterDrift: trash.maxCenterDrift,
    video,
  }, null, 2))
  console.log(`dialog motion OK. video=${video}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
