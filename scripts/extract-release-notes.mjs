import fs from 'node:fs'

const changelogPath = process.argv[2] ?? 'CHANGELOG.md'
const outPath = process.argv[3] ?? 'release-notes.md'
const rawTag = process.argv[4] ?? process.env.GITHUB_REF_NAME ?? ''
const version = rawTag.replace(/^v/, '')

if (!version) {
  console.error('Missing release tag/version. Pass v1.2.3 or set GITHUB_REF_NAME.')
  process.exit(1)
}

const changelog = fs.readFileSync(changelogPath, 'utf8')
const heading = new RegExp(`^## \\[${escapeRegExp(version)}\\].*$`, 'm')
const match = heading.exec(changelog)

if (!match) {
  console.error(`Could not find CHANGELOG section for ${version}`)
  process.exit(1)
}

const start = match.index
const nextHeading = changelog.slice(start + match[0].length).search(/^## \[/m)
const end = nextHeading === -1 ? changelog.length : start + match[0].length + nextHeading
const body = changelog.slice(start, end).trim()

fs.writeFileSync(outPath, `# Favewise v${version}\n\n${body}\n`)
console.log(`Wrote ${outPath} from ${changelogPath}#${version}`)

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
