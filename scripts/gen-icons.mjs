#!/usr/bin/env node
// Rasterize assets/icon.svg into public/icon/{16,32,48,96,128}.png.
// Re-run whenever the SVG changes — output files are committed.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const svgPath = resolve(root, 'assets', 'icon.svg')
const outDir = resolve(root, 'public', 'icon')

const svg = readFileSync(svgPath, 'utf8')
const sizes = [16, 32, 48, 96, 128]

mkdirSync(outDir, { recursive: true })

console.log(`Generating icons from ${svgPath}`)
for (const size of sizes) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } })
  const png = resvg.render().asPng()
  const out = `${outDir}/${size}.png`
  writeFileSync(out, png)
  console.log(`  ✓ ${out} (${png.byteLength.toLocaleString()} bytes)`)
}
console.log('Done.')
