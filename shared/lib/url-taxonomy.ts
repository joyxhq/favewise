/**
 * Favewise URL Taxonomy.
 *
 * A curated map of popular domains → semantic category label. This is the
 * PRIMARY signal for the Organize clustering algorithm: "what does this site
 * DO", not "what words appear in its title".
 *
 * Design goals:
 *   - Ship as static JSON in the extension (~20KB, no external downloads)
 *   - Cover ~80% of real-world bookmarks via ~300 well-known domains
 *   - Community-editable via PRs, additive only
 *   - Labels are short, concrete, human-readable English phrases
 *
 * Fallbacks for unknown domains:
 *   1. URL path heuristics (e.g. /docs/, /blog/, /wiki/ → category hints)
 *   2. Learned taxonomy from the user's own folder structure (handled in
 *      organize-service.ts — we infer that "anything in user's folder 'X'
 *      whose domain matches has category 'X'").
 */

export interface TaxonomyMatch {
  label: string
  confidence: number
}

interface PathPattern {
  pattern: RegExp
  label: string
}

interface TaxonomyEntry {
  label: string
  pathPatterns?: PathPattern[]
}

/* ---------- Curated site taxonomy ---------- */

const SITE_TAXONOMY: Record<string, TaxonomyEntry> = {
  // ===== Code hosting / review =====
  'github.com': {
    label: 'Code',
    pathPatterns: [
      { pattern: /\/issues(\/|$)/i, label: 'Issues' },
      { pattern: /\/pulls?(\/|$)/i, label: 'Pull Requests' },
      { pattern: /\/releases/i, label: 'Releases' },
      { pattern: /\/wiki(\/|$)/i, label: 'Docs' },
    ],
  },
  'gitlab.com':     { label: 'Code' },
  'bitbucket.org':  { label: 'Code' },
  'codeberg.org':   { label: 'Code' },
  'sourceforge.net':{ label: 'Code' },
  'gitee.com':      { label: 'Code' },

  // ===== Code sandboxes =====
  'codepen.io':     { label: 'Code Sandboxes' },
  'jsfiddle.net':   { label: 'Code Sandboxes' },
  'replit.com':     { label: 'Code Sandboxes' },
  'stackblitz.com': { label: 'Code Sandboxes' },
  'codesandbox.io': { label: 'Code Sandboxes' },
  'glitch.com':     { label: 'Code Sandboxes' },

  // ===== Q&A =====
  'stackoverflow.com': { label: 'Q&A' },
  'superuser.com':     { label: 'Q&A' },
  'serverfault.com':   { label: 'Q&A' },
  'askubuntu.com':     { label: 'Q&A' },
  'stackexchange.com': { label: 'Q&A' },
  'quora.com':         { label: 'Q&A' },

  // ===== Discussion / forums =====
  'reddit.com':              { label: 'Discussions' },
  'news.ycombinator.com':    { label: 'Discussions' },
  'lobste.rs':               { label: 'Discussions' },
  'discourse.org':           { label: 'Discussions' },
  'discord.com':             { label: 'Chat' },

  // ===== Research / papers =====
  'arxiv.org':             { label: 'Research Papers' },
  'paperswithcode.com':    { label: 'Research Papers' },
  'scholar.google.com':    { label: 'Research Papers' },
  'ssrn.com':              { label: 'Research Papers' },
  'openreview.net':        { label: 'Research Papers' },
  'semanticscholar.org':   { label: 'Research Papers' },
  'acm.org':               { label: 'Research Papers' },
  'ieeexplore.ieee.org':   { label: 'Research Papers' },
  'nature.com':            { label: 'Research Papers' },
  'sciencedirect.com':     { label: 'Research Papers' },
  'eprint.iacr.org':       { label: 'Research Papers' },

  // ===== Articles / blogs =====
  'medium.com':      { label: 'Articles' },
  'dev.to':          { label: 'Articles' },
  'substack.com':    { label: 'Articles' },
  'hashnode.com':    { label: 'Articles' },
  'mirror.xyz':      { label: 'Articles' },
  'paragraph.com':   { label: 'Articles' },
  'blogspot.com':    { label: 'Articles' },
  'wordpress.com':   { label: 'Articles' },
  'ghost.io':        { label: 'Articles' },

  // ===== Docs (popular tech) =====
  'developer.mozilla.org': { label: 'Docs' },
  'docs.python.org':       { label: 'Docs' },
  'docs.soliditylang.org': { label: 'Docs' },
  'nodejs.org':            { label: 'Docs' },
  'react.dev':             { label: 'Docs' },
  'vuejs.org':             { label: 'Docs' },
  'angular.io':            { label: 'Docs' },
  'nextjs.org':            { label: 'Docs' },
  'svelte.dev':            { label: 'Docs' },
  'tailwindcss.com':       { label: 'Docs' },
  'typescriptlang.org':    { label: 'Docs' },
  'rust-lang.org':         { label: 'Docs' },
  'go.dev':                { label: 'Docs' },
  'kubernetes.io':         { label: 'Docs' },
  'book.getfoundry.sh':    { label: 'Docs' },
  'ethereum.org':          { label: 'Docs' },
  'developer.apple.com':   { label: 'Docs' },
  'developer.android.com': { label: 'Docs' },
  'docs.microsoft.com':    { label: 'Docs' },
  'learn.microsoft.com':   { label: 'Docs' },
  'readthedocs.io':        { label: 'Docs' },

  // ===== Videos =====
  'youtube.com': {
    label: 'Videos',
    pathPatterns: [
      { pattern: /^\/@[^/]+$/i, label: 'Channels' },
      { pattern: /\/channel\//i, label: 'Channels' },
      { pattern: /\/playlist/i,  label: 'Playlists' },
    ],
  },
  'youtu.be':    { label: 'Videos' },
  'vimeo.com':   { label: 'Videos' },
  'bilibili.com':{ label: 'Videos' },
  'twitch.tv':   { label: 'Videos' },
  'tiktok.com':  { label: 'Videos' },

  // ===== Courses =====
  'coursera.org':       { label: 'Courses' },
  'edx.org':            { label: 'Courses' },
  'udemy.com':          { label: 'Courses' },
  'udacity.com':        { label: 'Courses' },
  'pluralsight.com':    { label: 'Courses' },
  'khanacademy.org':    { label: 'Courses' },
  'freecodecamp.org':   { label: 'Courses' },
  'codecademy.com':     { label: 'Courses' },
  'datacamp.com':       { label: 'Courses' },
  'egghead.io':         { label: 'Courses' },
  'frontendmasters.com':{ label: 'Courses' },

  // ===== Security — audits & firms =====
  'code4rena.com':     { label: 'Security Audits' },
  'cantina.xyz':       { label: 'Security Audits' },
  'immunefi.com':      { label: 'Security Audits' },
  'sherlock.xyz':      { label: 'Security Audits' },
  'spearbit.com':      { label: 'Security Audits' },
  'quantstamp.com':    { label: 'Security Audits' },
  'halborn.com':       { label: 'Security Audits' },
  'peckshield.com':    { label: 'Security Audits' },
  'consensys.net':     { label: 'Security' },
  'openzeppelin.com':  { label: 'Security' },
  'trailofbits.com':   { label: 'Security' },
  'blocksec.com':      { label: 'Security' },

  // ===== Security — tools & learning =====
  'slither.wiki':     { label: 'Security Tools' },
  'mythx.io':         { label: 'Security Tools' },
  'portswigger.net':  { label: 'Security Tools' },
  'burpsuite.com':    { label: 'Security Tools' },
  'kali.org':         { label: 'Security Tools' },
  'metasploit.com':   { label: 'Security Tools' },
  'nmap.org':         { label: 'Security Tools' },
  'rekt.news':        { label: 'Security News' },
  'krebsonsecurity.com': { label: 'Security News' },
  'thehackernews.com':{ label: 'Security News' },
  'bleepingcomputer.com':{ label: 'Security News' },
  'tryhackme.com':    { label: 'Security Learning' },
  'hackthebox.com':   { label: 'Security Learning' },
  'pwned-labs.io':    { label: 'Security Learning' },
  'picoctf.org':      { label: 'Security Learning' },
  'portswigger-academy.com': { label: 'Security Learning' },
  'exploit-db.com':   { label: 'Security Exploits' },
  'cve.mitre.org':    { label: 'CVE Database' },
  'nvd.nist.gov':     { label: 'CVE Database' },
  'first.org':        { label: 'Security' },

  // ===== Web3 — DeFi =====
  'uniswap.org':         { label: 'DeFi' },
  'curve.fi':            { label: 'DeFi' },
  'aave.com':            { label: 'DeFi' },
  'compound.finance':    { label: 'DeFi' },
  'lido.fi':             { label: 'DeFi' },
  'makerdao.com':        { label: 'DeFi' },
  '1inch.io':            { label: 'DeFi' },
  'sushi.com':           { label: 'DeFi' },
  'balancer.fi':         { label: 'DeFi' },
  'yearn.fi':            { label: 'DeFi' },
  'convexfinance.com':   { label: 'DeFi' },
  'pendle.finance':      { label: 'DeFi' },
  'synthetix.io':        { label: 'DeFi' },
  'gmx.io':              { label: 'DeFi' },
  'dydx.exchange':       { label: 'DeFi' },

  // ===== Web3 — Analytics =====
  'defillama.com':       { label: 'Crypto Analytics' },
  'dune.com':            { label: 'Crypto Analytics' },
  'flipsidecrypto.com':  { label: 'Crypto Analytics' },
  'tokenterminal.com':   { label: 'Crypto Analytics' },
  'l2beat.com':          { label: 'Crypto Analytics' },
  'growthepie.xyz':      { label: 'Crypto Analytics' },

  // ===== Web3 — Block explorers =====
  'etherscan.io':    { label: 'Block Explorers' },
  'arbiscan.io':     { label: 'Block Explorers' },
  'polygonscan.com': { label: 'Block Explorers' },
  'bscscan.com':     { label: 'Block Explorers' },
  'solscan.io':      { label: 'Block Explorers' },
  'basescan.org':    { label: 'Block Explorers' },
  'optimistic.etherscan.io': { label: 'Block Explorers' },
  'snowtrace.io':    { label: 'Block Explorers' },
  'blockchair.com':  { label: 'Block Explorers' },

  // ===== Web3 — Market data =====
  'coinmarketcap.com':   { label: 'Crypto Prices' },
  'coingecko.com':       { label: 'Crypto Prices' },
  'tradingview.com':     { label: 'Crypto Prices' },
  'cryptoquant.com':     { label: 'Crypto Prices' },

  // ===== Web3 — Exchanges =====
  'binance.com':    { label: 'Exchanges' },
  'coinbase.com':   { label: 'Exchanges' },
  'kraken.com':     { label: 'Exchanges' },
  'bybit.com':      { label: 'Exchanges' },
  'okx.com':        { label: 'Exchanges' },
  'kucoin.com':     { label: 'Exchanges' },
  'bitfinex.com':   { label: 'Exchanges' },

  // ===== Web3 — Research / funds =====
  'paradigm.xyz':        { label: 'Web3 Research' },
  'a16zcrypto.com':      { label: 'Web3 Research' },
  'variant.fund':        { label: 'Web3 Research' },
  'standardcrypto.vc':   { label: 'Web3 Research' },
  'messari.io':          { label: 'Web3 Research' },
  'galaxy.com':          { label: 'Web3 Research' },

  // ===== NFT =====
  'opensea.io':   { label: 'NFT' },
  'blur.io':      { label: 'NFT' },
  'magiceden.io': { label: 'NFT' },
  'rarible.com':  { label: 'NFT' },
  'foundation.app':{ label: 'NFT' },

  // ===== Design =====
  'figma.com':     { label: 'Design' },
  'dribbble.com':  { label: 'Design' },
  'behance.net':   { label: 'Design' },
  'canva.com':     { label: 'Design' },
  'sketch.com':    { label: 'Design' },
  'framer.com':    { label: 'Design' },
  'pinterest.com': { label: 'Design' },

  // ===== Productivity / notes =====
  'notion.so':        { label: 'Notes' },
  'obsidian.md':      { label: 'Notes' },
  'roamresearch.com': { label: 'Notes' },
  'evernote.com':     { label: 'Notes' },
  'logseq.com':       { label: 'Notes' },
  'remnote.com':      { label: 'Notes' },
  'craft.do':         { label: 'Notes' },

  // ===== Project management =====
  'linear.app':    { label: 'Project Management' },
  'jira.com':      { label: 'Project Management' },
  'atlassian.com': { label: 'Project Management' },
  'trello.com':    { label: 'Project Management' },
  'asana.com':     { label: 'Project Management' },
  'monday.com':    { label: 'Project Management' },
  'clickup.com':   { label: 'Project Management' },

  // ===== Cloud / hosting =====
  'aws.amazon.com':            { label: 'Cloud Services' },
  'console.aws.amazon.com':    { label: 'Cloud Services' },
  'console.cloud.google.com':  { label: 'Cloud Services' },
  'cloud.google.com':          { label: 'Cloud Services' },
  'portal.azure.com':          { label: 'Cloud Services' },
  'azure.microsoft.com':       { label: 'Cloud Services' },
  'cloud.mongodb.com':         { label: 'Cloud Services' },
  'vercel.com':                { label: 'Cloud Services' },
  'netlify.com':               { label: 'Cloud Services' },
  'heroku.com':                { label: 'Cloud Services' },
  'render.com':                { label: 'Cloud Services' },
  'railway.app':               { label: 'Cloud Services' },
  'fly.io':                    { label: 'Cloud Services' },
  'cloudflare.com':            { label: 'Cloud Services' },
  'digitalocean.com':          { label: 'Cloud Services' },
  'linode.com':                { label: 'Cloud Services' },

  // ===== Dev tools / CI =====
  'circleci.com':  { label: 'Dev Tools' },
  'travis-ci.com': { label: 'Dev Tools' },
  'docker.com':    { label: 'Dev Tools' },
  'hub.docker.com':{ label: 'Dev Tools' },
  'postman.com':   { label: 'Dev Tools' },

  // ===== Tech news =====
  'theverge.com':     { label: 'Tech News' },
  'techcrunch.com':   { label: 'Tech News' },
  'arstechnica.com':  { label: 'Tech News' },
  'wired.com':        { label: 'Tech News' },
  'engadget.com':     { label: 'Tech News' },
  'infoq.com':        { label: 'Tech News' },
  'infoq.cn':         { label: 'Tech News' },

  // ===== Social =====
  'twitter.com':     { label: 'Social' },
  'x.com':           { label: 'Social' },
  'linkedin.com':    { label: 'Professional' },
  'mastodon.social': { label: 'Social' },
  'bsky.app':        { label: 'Social' },
  'threads.net':     { label: 'Social' },
  'farcaster.xyz':   { label: 'Social' },
  'warpcast.com':    { label: 'Social' },

  // ===== Package registries =====
  'npmjs.com':     { label: 'Package Registries' },
  'pypi.org':      { label: 'Package Registries' },
  'crates.io':     { label: 'Package Registries' },
  'rubygems.org':  { label: 'Package Registries' },
  'maven.apache.org': { label: 'Package Registries' },
  'nuget.org':     { label: 'Package Registries' },
  'pkg.go.dev':    { label: 'Package Registries' },

  // ===== Chinese sites =====
  'zhihu.com':   { label: 'Q&A' },
  'csdn.net':    { label: 'Articles' },
  'jianshu.com': { label: 'Articles' },
  'juejin.cn':   { label: 'Articles' },
  'cnblogs.com': { label: 'Articles' },
  'segmentfault.com': { label: 'Articles' },
  'sspai.com':   { label: 'Articles' },
  'douban.com':  { label: 'Reviews' },
  'weibo.com':   { label: 'Social' },
  'kuaishou.com':{ label: 'Videos' },
}

/* ---------- Path-only heuristics (for unknown domains) ---------- */

const PATH_HINTS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\/docs?\//i,              label: 'Docs' },
  { pattern: /\/documentation\//i,      label: 'Docs' },
  { pattern: /\/api[-/]reference\//i,   label: 'API Reference' },
  { pattern: /\/api\//i,                label: 'API Reference' },
  { pattern: /\/blog\//i,               label: 'Blog' },
  { pattern: /\/news\//i,               label: 'News' },
  { pattern: /\/wiki\//i,               label: 'Wiki' },
  { pattern: /\/tutorial/i,             label: 'Tutorials' },
  { pattern: /\/course/i,               label: 'Courses' },
  { pattern: /\/download/i,             label: 'Downloads' },
  { pattern: /\/pricing/i,              label: 'Pricing' },
]

/* ---------- Public API ---------- */

/**
 * Categorize a URL into a semantic label. Returns null when no rule matches.
 * Confidence: 0.95 for curated exact domain+path, 0.8 for domain only,
 * 0.5 for path-only heuristic.
 */
export function categorizeUrl(url: string): TaxonomyMatch | null {
  let parsed: URL
  try { parsed = new URL(url) } catch { return null }
  const host = parsed.hostname.replace(/^www\./, '').toLowerCase()
  const path = parsed.pathname

  // Exact host match
  const entry = SITE_TAXONOMY[host]
  if (entry) {
    if (entry.pathPatterns) {
      for (const pp of entry.pathPatterns) {
        if (pp.pattern.test(path)) return { label: pp.label, confidence: 0.95 }
      }
    }
    return { label: entry.label, confidence: 0.9 }
  }

  // Parent-domain match ("docs.github.com" → check "github.com") and
  // informative-subdomain shortcut ("docs.*", "api.*" work even when the
  // root domain is unknown).
  const parts = host.split('.')
  if (parts.length > 2) {
    const parent = parts.slice(-2).join('.')
    const parentEntry = SITE_TAXONOMY[parent]
    const sub = parts[0]

    if (parentEntry) {
      if (parentEntry.pathPatterns) {
        for (const pp of parentEntry.pathPatterns) {
          if (pp.pattern.test(path)) return { label: pp.label, confidence: 0.88 }
        }
      }
      if (sub === 'docs' || sub === 'developer') return { label: 'Docs', confidence: 0.85 }
      if (sub === 'blog') return { label: 'Blog', confidence: 0.85 }
      if (sub === 'news') return { label: 'News', confidence: 0.85 }
      if (sub === 'api')  return { label: 'API Reference', confidence: 0.85 }
      return { label: parentEntry.label, confidence: 0.82 }
    }

    // Unknown parent but informative subdomain — still useful.
    if (sub === 'docs' || sub === 'developer') return { label: 'Docs', confidence: 0.7 }
    if (sub === 'blog') return { label: 'Blog', confidence: 0.7 }
    if (sub === 'news') return { label: 'News', confidence: 0.7 }
    if (sub === 'api')  return { label: 'API Reference', confidence: 0.7 }
  }

  // Path-only heuristics
  for (const h of PATH_HINTS) {
    if (h.pattern.test(path)) return { label: h.label, confidence: 0.5 }
  }

  return null
}

/**
 * For diagnostic UI: returns the total number of curated entries. Useful for
 * Settings ("covers ~N popular sites").
 */
export function getTaxonomySize(): number {
  return Object.keys(SITE_TAXONOMY).length
}
