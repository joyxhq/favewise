import sharp from 'sharp'
import { mkdir, copyFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const outDir = path.join(root, 'store-assets')
const sourceDir = path.join(root, 'test-results')

const screenshots = [
  ['view-dashboard.png', '01-dashboard.png'],
  ['view-library.png', '02-library.png'],
  ['view-duplicates.png', '03-duplicates.png'],
  ['view-organize.png', '04-organize.png'],
  ['view-insights.png', '05-insights.png'],
]

const canvas = {
  width: 1280,
  height: 800,
  bg: '#FAF9F5',
}

await mkdir(outDir, { recursive: true })

for (const [srcName, destName] of screenshots) {
  const src = path.join(sourceDir, srcName)
  const dest = path.join(outDir, destName)
  const image = sharp(src)
  const meta = await image.metadata()
  if (!meta.width || !meta.height) throw new Error(`Could not read ${srcName}`)
  const verticalPadding = 32
  const scale = Math.min(
    (canvas.width - 96) / meta.width,
    (canvas.height - verticalPadding * 2) / meta.height,
  )
  const width = Math.round(meta.width * scale)
  const height = Math.round(meta.height * scale)
  const left = Math.round((canvas.width - width) / 2)
  const top = Math.round((canvas.height - height) / 2)
  const panel = await image
    .resize(width, height, { fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer()
  const shadow = Buffer.from(`
    <svg width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}" xmlns="http://www.w3.org/2000/svg">
      <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#2E2723" flood-opacity=".16"/>
      </filter>
      <rect x="${left}" y="${top}" width="${width}" height="${height}" rx="34" fill="#FFFFFF" filter="url(#s)"/>
    </svg>
  `)
  await sharp({
    create: {
      width: canvas.width,
      height: canvas.height,
      channels: 4,
      background: canvas.bg,
    },
  })
    .composite([
      { input: shadow, left: 0, top: 0 },
      { input: panel, left, top },
    ])
    .png()
    .toFile(dest)
}

await sharp(path.join(root, 'assets/icon.svg'))
  .resize(96, 96)
  .png()
  .toFile(path.join(outDir, '.promo-icon.png'))

const promoIconData = await sharp(path.join(outDir, '.promo-icon.png'))
  .png()
  .toBuffer()
  .then((buf) => buf.toString('base64'))

const promoSvg = `
<svg width="440" height="280" viewBox="0 0 440 280" xmlns="http://www.w3.org/2000/svg">
  <rect width="440" height="280" fill="#FAF9F5"/>
  <rect x="28" y="28" width="384" height="224" rx="18" fill="#FFFFFF" stroke="#E7DAD2"/>
  <image href="data:image/png;base64,${promoIconData}" x="42" y="52" width="64" height="64"/>
  <text x="122" y="75" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="800" fill="#2E2723">Favewise</text>
  <text x="122" y="101" font-family="Inter, Arial, sans-serif" font-size="15" fill="#7A6B61">Make bookmarks useful again</text>
  <rect x="44" y="144" width="352" height="18" rx="9" fill="#F2E8E2"/>
  <rect x="44" y="176" width="276" height="18" rx="9" fill="#EADDD5"/>
  <rect x="44" y="208" width="320" height="18" rx="9" fill="#F2E8E2"/>
  <circle cx="374" cy="153" r="10" fill="#CC785C"/>
  <circle cx="340" cy="185" r="10" fill="#7BAE7F"/>
  <circle cx="384" cy="217" r="10" fill="#E0A85F"/>
</svg>`

await sharp(Buffer.from(promoSvg), { density: 2 })
  .resize(440, 280, { fit: 'fill' })
  .png()
  .toFile(path.join(outDir, 'small-promo-440x280.png'))

await copyFile(path.join(root, 'public/icon/128.png'), path.join(outDir, 'icon-128.png'))
await rm(path.join(outDir, '.promo-icon.png'), { force: true })

console.log(`Store assets written to ${path.relative(root, outDir)}`)
