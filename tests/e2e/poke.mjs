import { chromium } from 'playwright'
const b = await chromium.connectOverCDP('http://localhost:9222')
const ctx = b.contexts()[0]
const page = await ctx.newPage()
await page.goto('chrome://policy/')
await page.waitForTimeout(1500)
const policies = await page.evaluate(() => document.body.innerText.slice(0, 2000))
console.log(policies)
console.log('\n---\n')
await page.goto('chrome://version/')
await page.waitForTimeout(500)
const v = await page.evaluate(() => document.body.innerText.slice(0, 1500))
console.log(v)
await b.close()
