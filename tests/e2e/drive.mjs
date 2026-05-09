/**
 * Favewise sidepanel smoke drive, using Playwright's bundled Chromium so
 * --load-extension still works (recent system Chrome has disabled it).
 * Launches a headed browser with a fresh profile + the built extension,
 * opens the side-panel page as a tab, seeds test bookmarks, clicks through
 * every nav item, takes screenshots, and logs errors/warnings/console output
 * to test-results/e2e.log.
 */

import { chromium } from 'playwright'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '../..')
const EXT = path.join(REPO, '.output/chrome-mv3')
const PROFILE = '/tmp/favewise-e2e-profile'
const RESULTS = path.join(REPO, 'test-results')
const SIDE_PANEL_VIEWPORT = { width: 420, height: 760 }

const LOG_FILE = path.join(RESULTS, 'e2e.log')
const lines = []
const log = (s) => {
  const msg = typeof s === 'string' ? s : JSON.stringify(s)
  console.log(msg)
  lines.push(msg)
}
const flush = () => fs.writeFile(LOG_FILE, lines.join('\n') + '\n')

process.on('unhandledRejection', async (e) => {
  log(`\n[UNHANDLED] ${e?.stack || e}`)
  await flush()
  process.exit(1)
})

/** Read the current "N selected" count from the Library footer bar. */
async function countSelected(page) {
  // Footer bar renders "N selected" / "已选 N 项"; count by scraping the label.
  const txt = await page.locator('text=/(\\d+)\\s+selected|已选\\s+(\\d+)/').first().textContent().catch(() => '')
  const m = txt && (txt.match(/(\d+)\s+selected/) || txt.match(/已选\s+(\d+)/))
  return m ? Number(m[1]) : 0
}

async function assertSelectionBarPinned(page) {
  const viewport = page.viewportSize()
  if (!viewport) throw new Error('viewport unavailable')

  const bar = await page.locator('[data-fw-selection-bar]').first().boundingBox()
  if (!bar) throw new Error('selection bar not visible')
  const distanceFromBottom = Math.abs(viewport.height - (bar.y + bar.height))
  if (distanceFromBottom > 2) {
    throw new Error(`selection bar is not pinned to viewport bottom (${distanceFromBottom.toFixed(1)}px gap)`)
  }
}

async function assertSmartFolderActionBeforeProtect(page) {
  const smart = await page.locator('[data-fw-smart-folder-create]').first().boundingBox()
  const protectButton = page.locator('[data-fw-bulk-protect]').first()
  if (!await protectButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    throw new Error('Protect action is not visible for selected folders')
  }
  const protect = await protectButton.boundingBox()
  if (!smart || !protect) throw new Error('smart folder / Protect action boxes unavailable')

  const smartCenterY = smart.y + smart.height / 2
  const protectCenterY = protect.y + protect.height / 2
  if (Math.abs(smartCenterY - protectCenterY) > 3) {
    throw new Error('smart folder button and Protect button are not on the same row')
  }
  if (smart.x > protect.x) {
    throw new Error('smart folder button should sit to the left of Protect')
  }
}

async function assertWithinViewport(page, selector, label, margin = 2) {
  const viewport = page.viewportSize()
  if (!viewport) throw new Error('viewport unavailable')
  const loc = page.locator(selector).first()
  if (!await loc.isVisible({ timeout: 2000 }).catch(() => false)) {
    throw new Error(`${label} is not visible`)
  }
  const box = await loc.boundingBox()
  if (!box) throw new Error(`${label} box unavailable`)
  const right = box.x + box.width
  const bottom = box.y + box.height
  if (box.x < -margin || right > viewport.width + margin) {
    throw new Error(`${label} overflows horizontally: x=${box.x.toFixed(1)}, right=${right.toFixed(1)}, viewport=${viewport.width}`)
  }
  if (box.y < -margin || bottom > viewport.height + margin) {
    throw new Error(`${label} overflows vertically: y=${box.y.toFixed(1)}, bottom=${bottom.toFixed(1)}, viewport=${viewport.height}`)
  }
}

async function assertNoHorizontalOverflow(page, label) {
  const metrics = await page.evaluate(() => {
    const root = document.documentElement
    return {
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }
  })
  const scrollWidth = Math.max(metrics.scrollWidth, metrics.bodyScrollWidth)
  if (scrollWidth > metrics.clientWidth + 2) {
    throw new Error(`${label} horizontal overflow: ${scrollWidth}/${metrics.clientWidth}`)
  }
}

async function assertSingleLineText(page, selector, label) {
  const metrics = await page.locator(selector).evaluateAll((els) => els
    .filter((el) => {
      const rect = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden'
    })
    .map((el) => {
      const style = getComputedStyle(el)
      const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.2
      return {
        text: el.textContent?.trim() ?? '',
        height: el.getBoundingClientRect().height,
        scrollHeight: el.scrollHeight,
        lineHeight,
        whiteSpace: style.whiteSpace,
      }
    }))
  for (const item of metrics) {
    if (item.whiteSpace !== 'nowrap') {
      throw new Error(`${label} can wrap: "${item.text}" uses white-space=${item.whiteSpace}`)
    }
    if (item.scrollHeight > item.lineHeight * 1.6 || item.height > item.lineHeight * 1.6) {
      throw new Error(`${label} wrapped to multiple lines: "${item.text}"`)
    }
  }
  return metrics.length
}

async function clickNav(page, view) {
  const btns = await page.locator('nav button').all()
  const want = view === 'dead-links' ? /dead link|dead|死链/i
    : view === 'empty-folders' ? /empty|空/i
    : view === 'library' ? /library|书签库/i
    : view === 'organize' ? /organize|整理/i
    : view === 'rediscover' ? /rediscover|回顾/i
    : view === 'duplicates' ? /duplicates|重复/i
    : view === 'insights' ? /insights|洞察/i
    : view === 'settings' ? /settings|设置/i
    : view === 'dashboard' ? /dashboard|仪表盘/i
    : new RegExp(view, 'i')
  for (const b of btns) {
    const lbl = (await b.getAttribute('aria-label')) ?? ''
    if (want.test(lbl)) {
      await b.click({ timeout: 2000 })
      return
    }
  }
  throw new Error(`no nav matched ${view}`)
}

async function injectLayoutFixture(page, seed) {
  return page.evaluate(async ({ sandboxId }) => {
    const now = Date.now()
    const [root] = await chrome.bookmarks.getSubTree(sandboxId)
    const links = []

    function walk(node, path) {
      if (node.url) {
        links.push({
          id: node.id,
          title: node.title || node.url,
          url: node.url,
          parentId: node.parentId,
          folderPath: path,
          dateAdded: now - (180 * 24 * 60 * 60 * 1000),
          index: node.index,
        })
        return
      }
      const nextPath = node.id === sandboxId ? ['Bookmarks Bar', node.title] : [...path, node.title]
      for (const child of node.children ?? []) walk(child, nextPath)
    }

    walk(root, [])
    const snapshot = Object.fromEntries(links.map((link) => [link.id, link]))
    const deadStatuses = ['retry', 'retry', 'retry', 'retry', 'suspicious', 'suspicious', 'invalid']
    const deadLinks = links.slice(0, 21).map((link, index) => {
      const status = deadStatuses[index % deadStatuses.length]
      return {
        bookmarkId: link.id,
        url: link.url,
        status,
        statusCode: status === 'invalid' ? 404 : undefined,
        checkedAt: now,
        reason: status === 'retry'
          ? 'Connection timed out'
          : status === 'suspicious'
            ? 'Request blocked before the site could be checked'
            : 'Not found',
      }
    })
    const rediscoverItems = links.slice(0, 20).map((link, index) => ({
      bookmarkId: link.id,
      score: 100 - index,
      reason: `Saved but never visited · You've saved ${index + 2} links from ${new URL(link.url).hostname.replace(/^www\./, '')}`,
      reasonParts: [
        { key: 'rediscover.reason.neverVisited' },
        {
          key: 'rediscover.reason.savedNLinks',
          args: {
            count: index + 2,
            domain: new URL(link.url).hostname.replace(/^www\./, ''),
          },
        },
      ],
      reasonType: 'stale',
      surfacedAt: now,
    }))
    const organizeSuggestions = links.slice(0, 18).map((link, index) => ({
      id: `e2e-org-${link.id}`,
      kind: 'move',
      bookmarkId: link.id,
      memberIds: [link.id],
      currentPath: link.folderPath,
      suggestedPath: ['Bookmarks Bar', 'FavewiseE2E', 'Docs'],
      targetFolderId: sandboxId,
      confidence: 0.85,
      reason: `Title matches keywords: ${link.title}`,
      reasonCodes: ['keyword_match'],
      alternatives: [],
    }))
    const scan = {
      id: `e2e_layout_${now}`,
      startedAt: now - 1000,
      completedAt: now,
      status: 'completed',
      totalBookmarks: links.length,
      deadLinksChecked: true,
      deadLinkState: {
        status: 'paused',
        processed: 140,
        total: 778,
        lastRunAt: now,
      },
      deadLinks,
      deadLinkCache: {},
      bookmarkUrlMap: Object.fromEntries(links.map((link) => [link.id, link.url])),
      duplicateGroups: [
        {
          id: 'e2e-dupe-github',
          canonicalUrl: 'https://github.com/',
          bookmarkIds: links.slice(1, 3).map((link) => link.id),
        },
      ],
      organizeSuggestions,
      rediscoverItems,
      emptyFolders: [],
      bookmarkSnapshot: snapshot,
    }
    await chrome.storage.local.set({
      'favewise:latestScan': scan,
      'favewise:onboardingSeen': true,
    })
    return {
      links: links.length,
      deadLinks: deadLinks.length,
      rediscoverItems: rediscoverItems.length,
      organizeSuggestions: organizeSuggestions.length,
    }
  }, seed)
}

async function main() {
  log(`=== Favewise E2E drive — ${new Date().toISOString()} ===`)
  await fs.mkdir(RESULTS, { recursive: true })
  await fs.rm(PROFILE, { recursive: true, force: true })
  const fatalFailures = []

  log(`Launching Playwright Chromium with ${EXT}…`)
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  })

  // Wait for the extension's service worker to register so we can discover ID.
  let extId = null
  for (let i = 0; i < 40; i++) {
    const sw = ctx.serviceWorkers()[0]
    if (sw) { extId = new URL(sw.url()).host; break }
    await new Promise((r) => setTimeout(r, 250))
  }
  if (!extId) {
    // Fallback: service workers may suspend before we see them — check pages / workers
    const p = await ctx.newPage()
    await p.goto('chrome://extensions/', { waitUntil: 'domcontentloaded' })
    await p.waitForTimeout(1000)
    extId = await p.evaluate(() => {
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
    await p.close()
  }
  if (!extId) throw new Error('Could not discover extension ID')
  log(`Extension ID: ${extId}`)

  const page = await ctx.newPage()
  await page.setViewportSize(SIDE_PANEL_VIEWPORT)
  log(`Viewport: ${SIDE_PANEL_VIEWPORT.width}x${SIDE_PANEL_VIEWPORT.height} side-panel smoke`)
  page.on('console', (m) => {
    const loc = m.location()
    const where = loc.url ? `  @${loc.url.split('/').pop()}:${loc.lineNumber}` : ''
    log(`[console.${m.type()}] ${m.text()}${where}`)
  })
  page.on('pageerror', (e) => log(`[pageerror] ${e.message}\n${e.stack ?? ''}`))

  log(`\n=== Opening sidepanel.html ===`)
  await page.goto(`chrome-extension://${extId}/sidepanel.html`, {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForSelector('header img, header span', { timeout: 10000 })
  await page.waitForTimeout(500)
  log('  sidepanel rendered')

  // --- Seed test bookmarks ---
  log('\n=== Seeding test bookmarks ===')
  const seed = await page.evaluate(async () => {
    const bar = '1'
    const sandbox = await chrome.bookmarks.create({ parentId: bar, title: 'FavewiseE2E' })
    const urls = [
      { title: 'Google',         url: 'https://www.google.com/' },
      { title: 'GitHub',         url: 'https://github.com/' },
      { title: 'GitHub (again)', url: 'https://github.com/' },
      { title: 'Reliable 404',   url: 'https://httpstat.us/404' },
      { title: 'Dead hostname',  url: 'https://totally-nonexistent-domain-xyz-987654321.invalid/' },
      { title: 'MDN',            url: 'https://developer.mozilla.org/' },
      { title: 'StackOverflow',  url: 'https://stackoverflow.com/' },
      { title: 'HackerNews',     url: 'https://news.ycombinator.com/' },
      { title: 'Reddit',         url: 'https://www.reddit.com/' },
      { title: 'Twitter',        url: 'https://twitter.com/' },
      { title: 'React Docs',     url: 'https://react.dev/learn' },
      { title: 'Node Docs',      url: 'https://nodejs.org/en/docs' },
      { title: 'YouTube Video',  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
      { title: 'Coursera ML',    url: 'https://www.coursera.org/learn/machine-learning' },
      { title: 'Arxiv Paper',    url: 'https://arxiv.org/abs/2401.00001' },
      { title: 'Code4rena',      url: 'https://code4rena.com/audits' },
      { title: 'Uniswap',        url: 'https://uniswap.org/' },
      { title: 'Etherscan',      url: 'https://etherscan.io/' },
      { title: 'Medium Post',    url: 'https://medium.com/topic/programming' },
      { title: 'StackExchange',  url: 'https://stackexchange.com/' },
      { title: 'GitLab',         url: 'https://gitlab.com/' },
      { title: 'MDN CSS',        url: 'https://developer.mozilla.org/en-US/docs/Web/CSS' },
      { title: 'Vimeo Clip',     url: 'https://vimeo.com/123456' },
      { title: 'edX Course',     url: 'https://www.edx.org/course/demo' },
      { title: 'OpenReview',     url: 'https://openreview.net/forum?id=demo' },
      { title: 'Immunefi',       url: 'https://immunefi.com/bug-bounty/' },
      { title: 'Aave',           url: 'https://aave.com/' },
      { title: 'CoinGecko',      url: 'https://www.coingecko.com/' },
      { title: 'Dev Article',    url: 'https://dev.to/favewise/demo' },
      { title: 'Ask Ubuntu',     url: 'https://askubuntu.com/questions/1' },
    ]
    const empty = await chrome.bookmarks.create({ parentId: sandbox.id, title: 'EmptySubFolder' })
    const linkIds = []
    for (const bm of urls) {
      const created = await chrome.bookmarks.create({ parentId: sandbox.id, ...bm })
      linkIds.push(created.id)
    }

    // Create one genuinely organized folder so the dashboard protection card
    // is present in the side-panel fixture. The production heuristic requires
    // at least 3 direct subfolders, 10 subtree links, and few loose links.
    const organized = await chrome.bookmarks.create({ parentId: sandbox.id, title: 'Campus' })
    const groups = ['Courses', 'Study', 'Research']
    for (const group of groups) {
      const folder = await chrome.bookmarks.create({ parentId: organized.id, title: group })
      for (let i = 1; i <= 4; i++) {
        await chrome.bookmarks.create({
          parentId: folder.id,
          title: `${group} Resource ${i}`,
          url: `https://example.com/${group.toLowerCase()}/${i}`,
        })
      }
    }
    return {
      sandboxId: sandbox.id,
      emptyId: empty.id,
      organizedId: organized.id,
      linkIds,
      linkCount: urls.length,
    }
  })
  log(`  Seeded sandbox=${seed.sandboxId} with ${seed.linkCount} links + 1 empty subfolder`)
  await page.waitForTimeout(1500)

  // Dismiss onboarding if present
  try {
    for (let i = 0; i < 5; i++) {
      const btn = page.locator('[role="alertdialog"] button', { hasText: /Got it|知道了|Next|Skip/ }).first()
      if (await btn.isVisible({ timeout: 300 }).catch(() => false)) {
        await btn.click({ timeout: 800 }).catch(() => {})
        await page.waitForTimeout(150)
      } else break
    }
    log('  Onboarding dismissed (if shown)')
  } catch {}

  // Initial sync
  log('\n=== Clicking Sync ===')
  try {
    await page.locator('header button', { hasText: /Sync|同步/ }).first().click({ timeout: 3000 })
    await page.waitForTimeout(4000)
    log('  Sync done')
  } catch (e) { log(`  Sync ERROR: ${e.message}`) }

  log('\n=== Injecting deterministic layout fixture ===')
  try {
    const fixture = await injectLayoutFixture(page, seed)
    log(`  fixture scan: ${JSON.stringify(fixture)}`)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('header img, header span', { timeout: 10000 })
    await page.waitForTimeout(500)
    log('  fixture loaded into sidepanel')
  } catch (e) {
    log(`  ERROR: ${e.message}`)
    fatalFailures.push(`Layout fixture: ${e.message}`)
  }

  // Each nav view
  const VIEWS = [
    'dashboard', 'library', 'dead-links', 'duplicates',
    'organize', 'rediscover', 'empty-folders', 'insights', 'settings',
  ]
  for (const view of VIEWS) {
    log(`\n--- Nav → ${view} ---`)
    const before = lines.length
    try {
      await clickNav(page, view)
      await page.waitForTimeout(800)
      if (view === 'dashboard' || view === 'insights') {
        const metrics = await page.locator('main').first().evaluate((el) => ({
          clientHeight: el.clientHeight,
          scrollHeight: el.scrollHeight,
          scrollTop: el.scrollTop,
        }))
        if (metrics.scrollHeight <= metrics.clientHeight) {
          throw new Error(`${view} content did not overflow (${metrics.scrollHeight}/${metrics.clientHeight})`)
        }
        await page.locator('main').first().hover()
        await page.mouse.wheel(0, 360)
        await page.waitForTimeout(120)
        const afterTop = await page.locator('main').first().evaluate((el) => el.scrollTop)
        if (afterTop <= 0) throw new Error(`${view} main did not respond to wheel`)
        await page.screenshot({ path: path.join(RESULTS, `view-${view}-scrolled.png`), fullPage: false })
        await page.locator('main').first().evaluate((el) => { el.scrollTop = 0 })
        log(`  ${view} scrollable`)
      }
      if (view === 'dashboard') {
        const checked = await assertSingleLineText(page, '[data-fw-protection-stats]', 'Protection stats')
        if (checked === 0) throw new Error('Protection stats not rendered in dashboard fixture')
        log(`  protection stats single-line (${checked})`)
      }
      if (view === 'dead-links') {
        await assertWithinViewport(page, '[data-fw-deadlink-filter-tabs]', 'Dead Links filter tabs')
        await assertNoHorizontalOverflow(page, 'Dead Links view')
        log('  dead-link filter tabs fit side-panel width')
      }
      if (view === 'organize') {
        await assertWithinViewport(page, '[data-fw-organize-scope-button]', 'Organize scope button')
        await assertNoHorizontalOverflow(page, 'Organize view')
        log('  organize header controls fit side-panel width')
      }
      if (view === 'rediscover') {
        await assertWithinViewport(page, '[data-fw-rediscover-sort]', 'Rediscover sort control')
        await assertNoHorizontalOverflow(page, 'Rediscover view')
        log('  rediscover sort control fits side-panel width')
      }
      await page.screenshot({ path: path.join(RESULTS, `view-${view}.png`), fullPage: true })
      const errs = lines.slice(before).filter((l) => /\[pageerror\]|console\.error/.test(l))
      log(errs.length ? `  ⚠ ${errs.length} error(s) during render` : `  OK`)
    } catch (e) {
      log(`  FAIL: ${e.message}`)
      fatalFailures.push(`Nav ${view}: ${e.message}`)
    }
  }

  // Command palette — try Meta+K first (Mac convention) then Control+K
  log('\n=== Command palette (⌘K / Ctrl+K) ===')
  try {
    // Install a one-shot diagnostic: capture the next window keydown so we
    // can tell whether the handler fired and what it saw.
    await page.evaluate(() => {
      // @ts-ignore
      window.__fwKeyLog = []
      const h = (e) => {
        // @ts-ignore
        window.__fwKeyLog.push({
          key: e.key, code: e.code, meta: e.metaKey, ctrl: e.ctrlKey,
          defaultPrevented: e.defaultPrevented,
        })
      }
      window.addEventListener('keydown', h, true) // capture — runs BEFORE app
      // @ts-ignore
      window.__fwKeyLogRemove = () => window.removeEventListener('keydown', h, true)
    })
    // Make sure focus is on the panel body, not a form control that might eat the combo
    await page.locator('body').click({ timeout: 1500 }).catch(() => {})
    await page.keyboard.press('Meta+K')
    await page.waitForTimeout(500)
    // CommandPalette is built on Radix AlertDialog → role="alertdialog"
    let ok = await page.locator('[role="alertdialog"]').first().isVisible().catch(() => false)
    log(ok ? '  ✓ opened' : '  ✗ did not open')
    // Dump what the capture-phase listener saw
    const capture = await page.evaluate(() => {
      // @ts-ignore
      const r = window.__fwKeyLog
      // @ts-ignore
      window.__fwKeyLogRemove?.()
      return r
    })
    log(`  window keydown log: ${JSON.stringify(capture)}`)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
  } catch (e) { log(`  ERROR: ${e.message}`) }

  // Help (?)
  log('\n=== Help dialog (?) ===')
  try {
    await page.locator('body').click({ timeout: 1500 }).catch(() => {})
    await page.keyboard.press('?')
    await page.waitForTimeout(250)
    let ok = await page.getByText(/Keyboard shortcuts|快捷键/).first().isVisible().catch(() => false)
    if (!ok) {
      await page.keyboard.press('Shift+/')
      await page.waitForTimeout(250)
      ok = await page.getByText(/Keyboard shortcuts|快捷键/).first().isVisible().catch(() => false)
    }
    log(ok ? '  ✓ opened' : '  ✗ did not open')
    const gotIt = page.locator('[role="alertdialog"] button', { hasText: /Got it|知道了/ })
    if (await gotIt.count()) await gotIt.first().click().catch(() => {})
    await page.waitForTimeout(200)
  } catch (e) { log(`  ERROR: ${e.message}`) }

  // Library right-click
  log('\n=== Library right-click ===')
  try {
    await clickNav(page, 'library')
    await page.waitForTimeout(500)
    const sandbox = page.locator('[data-fw-row-id]', { hasText: 'FavewiseE2E' }).first()
    if (await sandbox.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sandbox.click().catch(() => {})
      await page.waitForTimeout(300)
    }
    const rows = page.locator('div[data-fw-row-id]').filter({ has: page.locator('a[aria-label]') })
    if (await rows.count()) {
      await rows.first().click({ button: 'right', timeout: 2000 })
      await page.waitForTimeout(300)
      const ok = await page.locator('[role="menu"]').first().isVisible().catch(() => false)
      log(ok ? '  ✓ context menu opened' : '  ✗ did not open')
      await page.keyboard.press('Escape')
    } else log('  (no bookmark row)')
  } catch (e) { log(`  ERROR: ${e.message}`) }

  // --- Shift+click range selection ---
  log('\n=== Selection: plain / Shift / Ctrl ===')
  try {
    // Make sure sandbox folder is expanded (we may have closed menus after the
    // context-menu test, but the tree state should survive).
    const bookmarkIds = seed.linkIds ?? []
    const rowForBookmark = async (index) => {
      const id = bookmarkIds[index]
      if (!id) throw new Error(`missing seeded bookmark id at index ${index}`)
      const row = page.locator(`[data-fw-row-id="${id}"]`).first()
      if (!await row.isVisible({ timeout: 500 }).catch(() => false)) {
        const sandboxRow = page.locator(`[data-fw-row-id="${seed.sandboxId}"]`).first()
        await sandboxRow.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {})
        await sandboxRow.click({ timeout: 2000 })
        await page.waitForTimeout(300)
      }
      await row.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {})
      if (!await row.isVisible({ timeout: 2000 }).catch(() => false)) {
        throw new Error(`seeded bookmark row ${id} is not visible`)
      }
      return row
    }

    if (bookmarkIds.length < 6) {
      log(`  Need ≥6 seeded bookmark rows — found ${bookmarkIds.length}, skipping`)
    } else {
      // Plain click on row #0 → expect 1 selected
      await (await rowForBookmark(0)).click({ timeout: 2000 })
      await page.waitForTimeout(200)
      const sel1 = await countSelected(page)
      log(`  plain click row 0 → selected=${sel1} (expect 1)`)

      // Shift+click row #3 → expect 4 selected (0,1,2,3)
      await (await rowForBookmark(3)).click({ modifiers: ['Shift'], timeout: 2000 })
      await page.waitForTimeout(200)
      const sel2 = await countSelected(page)
      log(`  shift+click row 3 → selected=${sel2} (expect 4)`)
      await page.screenshot({ path: path.join(RESULTS, 'view-library-bookmark-selected.png'), fullPage: true })
      await assertSelectionBarPinned(page)
      log('  bookmark selection bar pinned')

      // Cmd+click row #5 → expect 5 selected.
      // NOTE: on macOS, `{modifiers: ['Control']}` fires contextmenu not click,
      // so we use ControlOrMeta (Meta on Mac, Ctrl elsewhere). Our handler
      // accepts both with `(e.ctrlKey || e.metaKey)`.
      await (await rowForBookmark(5)).click({ modifiers: ['ControlOrMeta'], timeout: 2000 })
      await page.waitForTimeout(200)
      const sel3 = await countSelected(page)
      log(`  cmd/ctrl+click row 5 → selected=${sel3} (expect 5)`)

      // Click-checkbox then Shift+click to verify checkbox updates anchor too
      // Reset first
      await page.keyboard.press('Escape')
      await page.waitForTimeout(200)
      const secondBookmarkCheckbox = (await rowForBookmark(1)).locator('button[role="checkbox"]').first()
      await secondBookmarkCheckbox.click({ timeout: 2000 })
      await page.waitForTimeout(200)
      const sel4 = await countSelected(page)
      log(`  checkbox click row 1 → selected=${sel4} (expect 1)`)
      await (await rowForBookmark(4)).click({ modifiers: ['Shift'], timeout: 2000 })
      await page.waitForTimeout(200)
      const sel5 = await countSelected(page)
      log(`  shift+click row 4 after checkbox-anchor → selected=${sel5} (expect 4)`)

      // Folder-only selection: verifies the exact bulk-action layout used by
      // folder protection, including the smart-folder button beside Protect.
      await page.keyboard.press('Escape')
      await page.waitForTimeout(200)
      const sandboxRow = page.locator(`[data-fw-row-id="${seed.sandboxId}"]`).first()
      const emptyFolderRow = page.locator(`[data-fw-row-id="${seed.emptyId}"]`).first()
      if (!await emptyFolderRow.isVisible({ timeout: 500 }).catch(() => false)) {
        await sandboxRow.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {})
        await sandboxRow.click({ timeout: 2000 })
        await page.waitForTimeout(300)
      }
      await sandboxRow.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {})
      await sandboxRow.locator('button[role="checkbox"]').first().click({ timeout: 2000 })
      await emptyFolderRow.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {})
      await emptyFolderRow.locator('button[role="checkbox"]').first().click({ timeout: 2000 })
      await page.waitForTimeout(200)
      const folderSel = await countSelected(page)
      log(`  folder checkbox selection → selected=${folderSel} (expect 2)`)
      await page.screenshot({ path: path.join(RESULTS, 'view-library-selected.png'), fullPage: true })
      await assertSelectionBarPinned(page)
      await assertSmartFolderActionBeforeProtect(page)
      log('  folder selection bar pinned; smart-folder action shares row with Protect')

      // Keep the folder selection active for the zh-CN smart-folder dialog
      // regression below.
    }
  } catch (e) {
    log(`  ERROR: ${e.message}`)
    fatalFailures.push(`Selection layout: ${e.message}`)
  }

  // --- Folder drag-to-reorder ---
  log('\n=== Folder drag (reorder siblings) ===')
  try {
    // Seed a second folder at the same level as our sandbox so we can swap them
    const extraFolderId = await page.evaluate(async () => {
      const f = await chrome.bookmarks.create({ parentId: '1', title: 'ZZZ-E2E-Sibling' })
      return f.id
    })
    // The Library watches chrome.bookmarks.onCreated, but a refresh needs a
    // tick; wait until both folder rows are in the DOM before proceeding.
    await page.waitForFunction(() => {
      const btns = [...document.querySelectorAll('[data-fw-row-id]')]
      return btns.some((b) => b.innerText.includes('FavewiseE2E')) &&
             btns.some((b) => b.innerText.includes('ZZZ-E2E-Sibling'))
    }, { timeout: 5000 }).catch(() => {})

    // Folder button text = "<title><childCount>", so exact-match on the root
    // 'FavewiseE2E' won't match. Use a disambiguating filter that rules out
    // the ZZZ sibling.
    // Folder button text = "<title><childCount>", so use substring matching
    // and exclude the ZZZ sibling from the destination.
    const src = page.locator('[data-fw-row-id]', { hasText: 'ZZZ-E2E-Sibling' }).first()
    const dst = page
      .locator('[data-fw-row-id]', { hasText: 'FavewiseE2E' })
      .filter({ hasNotText: 'ZZZ' })
      .first()
    const srcVisible = await src.isVisible({ timeout: 1000 }).catch(() => false)
    const dstVisible = await dst.isVisible({ timeout: 1000 }).catch(() => false)
    if (srcVisible && dstVisible) {
      const srcBox = await src.boundingBox()
      const dstBox = await dst.boundingBox()
      if (srcBox && dstBox) {
        // HTML5 drag-and-drop through native Chromium events via Playwright's
        // dispatchEvent is the only reliable approach for custom drop targets.
        await src.hover()
        await page.mouse.down()
        // Move to top strip of destination — triggers "before" drop position
        await page.mouse.move(dstBox.x + 40, dstBox.y + 2, { steps: 8 })
        await page.waitForTimeout(200)
        await page.mouse.up()
        await page.waitForTimeout(600)
        // Verify: fetch sibling order from chrome API and see if ZZZ moved
        const orderAfter = await page.evaluate(async () => {
          const kids = await chrome.bookmarks.getChildren('1')
          return kids.map((k) => k.title)
        })
        log(`  after drag, top-level order: ${JSON.stringify(orderAfter)}`)
      } else log('  ✗ could not get bounding boxes')
    } else log(`  ✗ folders not visible (src=${srcVisible}, dst=${dstVisible})`)
    // Clean up the extra folder
    await page.evaluate(async (id) => chrome.bookmarks.removeTree(id).catch(() => {}), extraFolderId).catch(() => {})
  } catch (e) { log(`  ERROR: ${e.message}`) }

  // --- Organize Apply button (smoke) ---
  log('\n=== Organize view — just render, check no errors ===')
  try {
    await clickNav(page, 'organize')
    await page.waitForTimeout(1000)
    const applyBtns = await page.locator('button', { hasText: /^Apply|应用$/ }).count()
    log(`  Apply buttons visible: ${applyBtns}`)
  } catch (e) { log(`  ERROR: ${e.message}`) }

  // Language toggle
  log('\n=== Language 中文 ⇄ English ===')
  try {
    await clickNav(page, 'settings')
    await page.waitForTimeout(500)
    const zh = page.locator('button', { hasText: '中文' }).first()
    if (await zh.count()) {
      await zh.click({ timeout: 1500 })
      await page.waitForTimeout(300)
      const hasZh = await page.locator('header button', { hasText: '同步' }).count()
      log(hasZh ? '  ✓ zh-CN switch worked' : '  ✗ zh-CN label missing')
      await page.screenshot({ path: path.join(RESULTS, 'lang-zh.png'), fullPage: true })

      await clickNav(page, 'library')
      await page.waitForTimeout(300)
      const sandboxRow = page.locator(`[data-fw-row-id="${seed.sandboxId}"]`).first()
      const emptyFolderRow = page.locator(`[data-fw-row-id="${seed.emptyId}"]`).first()
      if (!await emptyFolderRow.isVisible({ timeout: 500 }).catch(() => false)) {
        await sandboxRow.click({ timeout: 2000 }).catch(() => {})
        await page.waitForTimeout(300)
      }
      if (!await page.locator('[data-fw-smart-folder-create]').first().isVisible({ timeout: 500 }).catch(() => false)) {
        await sandboxRow.locator('button[role="checkbox"]').first().click({ timeout: 2000 })
        await emptyFolderRow.locator('button[role="checkbox"]').first().click({ timeout: 2000 })
        await page.waitForTimeout(200)
      }
      await page.locator('[data-fw-smart-folder-create]').first().click({ timeout: 2000 })
      await page.waitForSelector('[role="alertdialog"]', { timeout: 3000 })
      const dialogText = await page.locator('[role="alertdialog"]').first().innerText()
      const leakedEnglish = [
        'New Smart Folder',
        'Smart folders automatically',
        'Folder Name',
        'Rules (Match All)',
        'Add Rule',
        'Save Folder',
        'Value...',
      ].filter((s) => dialogText.includes(s))
      if (leakedEnglish.length > 0) {
        throw new Error(`zh-CN smart-folder dialog leaked English: ${leakedEnglish.join(', ')}`)
      }
      log('  ✓ zh-CN smart-folder dialog localized')
      await page.screenshot({ path: path.join(RESULTS, 'lang-zh-smart-folder.png'), fullPage: true })
      await page.keyboard.press('Escape')
      await page.waitForTimeout(200)

      await clickNav(page, 'settings')
      await page.waitForTimeout(300)
      const en = page.locator('button', { hasText: 'English' }).first()
      await en.click({ timeout: 1500 })
      await page.waitForTimeout(300)
      log('  Back to English')
    } else log('  (language control not visible)')
  } catch (e) {
    log(`  ERROR: ${e.message}`)
    fatalFailures.push(`Language/i18n: ${e.message}`)
  }

  // Cleanup
  log('\n=== Cleanup ===')
  try {
    await page.evaluate(async (id) => chrome.bookmarks.removeTree(id), seed.sandboxId)
    log('  Sandbox removed')
  } catch (e) { log(`  ERROR: ${e.message}`) }

  const errs = lines.filter((l) => /\[pageerror\]|console\.error/.test(l)).length
  const warns = lines.filter((l) => /console\.warn/.test(l)).length
  log(`\n=== Summary ===`)
  log(`  console.error / pageerror: ${errs}`)
  log(`  console.warn:              ${warns}`)
  log(`  fatal smoke failures:      ${fatalFailures.length}`)
  log(`  Screenshots:               ${path.relative(REPO, RESULTS)}/view-*.png`)
  log(`  Log:                       ${path.relative(REPO, LOG_FILE)}`)

  await flush()
  await ctx.close()
  if (fatalFailures.length > 0) {
    for (const failure of fatalFailures) console.error(failure)
    process.exit(1)
  }
}

main().catch(async (e) => {
  log(`\n[FATAL] ${e?.stack || e}`)
  await flush()
  process.exit(1)
})
