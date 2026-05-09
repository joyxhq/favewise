import { chromium } from 'playwright'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '../..')
const EXT = path.join(REPO, '.output/chrome-mv3')
const PROFILE = '/tmp/favewise-edge-smoke-profile'
const RESULTS = path.join(REPO, 'test-results')
const BOOKMARK_HTML = '/Users/hohin/Documents/bookmarks_12_27_25.html'
const LOG_FILE = path.join(RESULTS, 'edge-smoke.log')

const lines = []
const log = (s) => {
  const msg = typeof s === 'string' ? s : JSON.stringify(s)
  console.log(msg)
  lines.push(msg)
}
const flush = () => fs.writeFile(LOG_FILE, lines.join('\n') + '\n')

function decodeHtml(text) {
  return text
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
  }

function parseBookmarkHtml(html) {
  const root = { title: 'root', children: [] }
  const stack = [root]
  let pendingFolder = null

  for (const rawLine of html.split(/\r?\n/)) {
    const line = rawLine.trim()
    const folderMatch = line.match(/<DT><H3\b[^>]*>(.*?)<\/H3>/i)
    if (folderMatch) {
      pendingFolder = { title: decodeHtml(folderMatch[1]), children: [] }
      continue
    }

    const bookmarkMatch = line.match(/<DT><A\b[^>]*HREF="([^"]+)"[^>]*>(.*?)<\/A>/i)
    if (bookmarkMatch) {
      stack.at(-1).children.push({
        title: decodeHtml(bookmarkMatch[2]),
        url: decodeHtml(bookmarkMatch[1]),
      })
      continue
    }

    if (/<DL><p>/i.test(line)) {
      if (pendingFolder) {
        stack.at(-1).children.push(pendingFolder)
        stack.push(pendingFolder)
        pendingFolder = null
      }
      continue
    }

    if (/<\/DL><p>/i.test(line)) {
      if (stack.length > 1) stack.pop()
    }
  }

  return root.children
}

async function importTree(page, htmlPath) {
  const html = await fs.readFile(htmlPath, 'utf8')
  const roots = parseBookmarkHtml(html)
  const bar = roots.find((node) => node.title === 'Bookmarks Bar')
  const other = roots.find((node) => node.title === 'Other Bookmarks')

  return page.evaluate(async ({ bar, other }) => {
    async function clearChildren(parentId) {
      const kids = await chrome.bookmarks.getChildren(parentId)
      for (const kid of kids) {
        await chrome.bookmarks.removeTree(kid.id).catch(() => {})
      }
    }

    async function createNodes(parentId, nodes) {
      let folders = 0
      let bookmarks = 0
      for (const node of nodes ?? []) {
        if (node.url) {
          await chrome.bookmarks.create({ parentId, title: node.title, url: node.url })
          bookmarks += 1
          continue
        }
        const folder = await chrome.bookmarks.create({ parentId, title: node.title })
        folders += 1
        const nested = await createNodes(folder.id, node.children)
        folders += nested.folders
        bookmarks += nested.bookmarks
      }
      return { folders, bookmarks }
    }

    await clearChildren('1')
    await clearChildren('2')

    const barResult = await createNodes('1', bar?.children ?? [])
    const otherResult = await createNodes('2', other?.children ?? [])
    return {
      folders: barResult.folders + otherResult.folders,
      bookmarks: barResult.bookmarks + otherResult.bookmarks,
    }
  }, { bar, other })
}

process.on('unhandledRejection', async (e) => {
  log(`\n[UNHANDLED] ${e?.stack || e}`)
  await flush()
  process.exit(1)
})

async function main() {
  await fs.mkdir(RESULTS, { recursive: true })
  await fs.rm(PROFILE, { recursive: true, force: true })
  log(`=== Edge import smoke — ${new Date().toISOString()} ===`)
  log(`Launching Microsoft Edge with ${EXT}…`)

  const ctx = await chromium.launchPersistentContext(PROFILE, {
    channel: 'msedge',
    headless: false,
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  })

  let extId = null
  for (let i = 0; i < 40; i++) {
    const sw = ctx.serviceWorkers()[0]
    if (sw) {
      extId = new URL(sw.url()).host
      break
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  if (!extId) throw new Error('Could not discover Edge extension ID')
  log(`Extension ID: ${extId}`)

  const page = await ctx.newPage()
  page.on('console', (m) => {
    const loc = m.location()
    const where = loc.url ? ` @${loc.url.split('/').pop()}:${loc.lineNumber}` : ''
    log(`[console.${m.type()}] ${m.text()}${where}`)
  })
  page.on('pageerror', (e) => log(`[pageerror] ${e.message}\n${e.stack ?? ''}`))

  await page.goto(`chrome-extension://${extId}/sidepanel.html`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('header', { timeout: 10000 })
  await page.waitForTimeout(500)

  log('\n=== Importing bookmark HTML into temporary Edge profile ===')
  const imported = await importTree(page, BOOKMARK_HTML)
  log(`Imported ${imported.bookmarks} bookmarks across ${imported.folders} folders`)
  await page.waitForTimeout(1500)

  try {
    for (let i = 0; i < 5; i++) {
      const btn = page.locator('[role="alertdialog"] button', { hasText: /Got it|知道了|Next|Skip/ }).first()
      if (await btn.isVisible({ timeout: 300 }).catch(() => false)) {
        await btn.click({ timeout: 800 }).catch(() => {})
        await page.waitForTimeout(150)
      } else break
    }
  } catch {}

  log('\n=== Running sync ===')
  await page.locator('header button', { hasText: /Sync|同步/ }).first().click({ timeout: 3000 })
  await page.waitForTimeout(5000)

  const views = [
    'dashboard', 'library', 'dead-links', 'duplicates',
    'organize', 'rediscover', 'empty-folders', 'insights', 'settings',
  ]
  for (const view of views) {
    log(`\n--- Nav → ${view} ---`)
    try {
      const btns = await page.locator('nav[aria-label="Primary"] button').all()
      const want = view === 'dead-links' ? /dead link|死链/i
        : view === 'empty-folders' ? /empty|空/i
        : new RegExp(view, 'i')
      let clicked = false
      for (const b of btns) {
        const lbl = (await b.getAttribute('aria-label')) ?? ''
        if (want.test(lbl)) {
          await b.click({ timeout: 2000 })
          clicked = true
          break
        }
      }
      if (!clicked) throw new Error(`no nav matched ${view}`)
      await page.waitForTimeout(1000)
      await page.screenshot({
        path: path.join(RESULTS, `edge-${view}.png`),
        fullPage: true,
      })
      log('  OK')
    } catch (e) {
      log(`  FAIL: ${e.message}`)
    }
  }

  log('\n=== Library sanity ===')
  await page.locator('nav[aria-label="Primary"] button[aria-label*="library" i], nav[aria-label="Primary"] button[aria-label*="书签库"]').first().click({ timeout: 2000 })
  await page.waitForTimeout(500)
  const libText = await page.locator('body').textContent().catch(() => '')
  const hasLargeLibrary = /bookmarks in your library|书签库共/.test(libText ?? '')
  log(`Library summary visible: ${hasLargeLibrary}`)

  const errs = lines.filter((l) => /\[pageerror\]|console\.error/.test(l)).length
  const warns = lines.filter((l) => /console\.warn/.test(l)).length
  log('\n=== Summary ===')
  log(`console.error / pageerror: ${errs}`)
  log(`console.warn: ${warns}`)
  await flush()
  await ctx.close()
}

main().catch(async (e) => {
  log(`\n[FATAL] ${e?.stack || e}`)
  await flush()
  process.exit(1)
})
