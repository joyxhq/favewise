# 🔖 Favewise™

**Make bookmarks useful again.**

[🇨🇳 简体中文](./README.zh-CN.md) · [Privacy](./PRIVACY.md) · [Security](./SECURITY.md) · [License](./LICENSE) · [Trademark](./TRADEMARK.md) · [Changelog](./CHANGELOG.md)

---

> **Trademark notice.** "Favewise™", the wordmark, the icon, and the associated color palette (copper `#CC785C` + warm cream `#FAF9F5`) are unregistered trademarks of Callum ([@0xca1x](https://github.com/0xca1x)), used by JoyX. First public use: 2026-05-09. The source is AGPL-3.0 — forks are welcome under the license, **but must be renamed and rebranded**. See [TRADEMARK.md](./TRADEMARK.md) for the full policy.

Favewise (悦藏) is a local-first, zero-account browser extension that sits **alongside** your browser's native bookmarks — it doesn't replace the save flow, it cleans up the pile you've built up over years. Works in Chrome, Edge, and Firefox.

## Project status

Favewise 1.0.0 is the first public release. Chrome and Edge use Manifest V3. Firefox currently uses the WXT Firefox MV2 build.

## ✨ What it does

- 🔗 **Dead-link check** — flags 404s, hangs, and suspicious redirects; distinguishes real broken links from login / SSO / VPN portals.
- 🧮 **Deduplication** — normalized URL matching (strips UTM params, `www`, trailing slashes). Pick Keep-Newest / Keep-Oldest, or define *safe folders* and bulk-resolve thousands.
- 🧠 **Smart organize** — clusters loose bookmarks by what each site **does** (Code, Security Audits, DeFi, Research Papers, Dev Tools…). Built on a curated ~300-domain taxonomy.
- 📥 **New-bookmark inbox** — the moment you ⭐ a page, Favewise categorizes it and offers a one-click "Move to X?".
- ✨ **Rediscover** — resurfaces old saves with personalized reasons ("never visited", "you've saved N from this domain", "saved 3y ago").
- 🧹 **Empty-folder sweep** — finds and deletes folders whose entire subtree is empty.
- 🛡 **Protected folders** — mark subtrees you've already organized by hand. Favewise will never move, trash, or suggest changes inside.
- 📊 **Insights** — age histogram, top domains, dead-link rate, taxonomy coverage.
- 🗂 **Library Explorer** — full-tree browse, drag to reorder (folders included), right-click CRUD, rename / create folders. Everything syncs to the browser's native bookmarks in real time.

## 🛡 Privacy by design

- **No accounts, telemetry, or JoyX server upload.** Clustering uses a bundled site-function map. Dead-link checks are the only feature that contacts bookmarked URLs, and only after you start a check.
- **Nothing is deleted permanently.** Destructive actions go through a recoverable trash, with a 5-second Undo toast as a safety net.
- **Organizes, doesn't store.** Your browser's ⭐ still creates bookmarks — Favewise handles everything that happens afterwards.

Full disclosure: [PRIVACY.md](./PRIVACY.md).

## Permissions

Favewise asks for only the permissions it needs to operate:

| Permission | Why it is needed |
|---|---|
| `bookmarks` | Read and update the browser bookmark tree when you use organize, deduplicate, trash, restore, rename, or drag-and-drop features. |
| `storage` / `unlimitedStorage` | Keep local scan results, undo/trash state, settings, protected folders, tags, and cached analysis without uploading them to JoyX servers. |
| `sidePanel` | Open the main Chrome/Edge side-panel interface. |
| `activeTab` | Read the current tab's title and URL for quick-save flows after a user gesture. |
| `favicon` | Show browser-managed favicons in Chrome/Edge UI. |
| `alarms` | Run user-enabled scheduled local scans. |
| Optional `<all_urls>` | Requested only when the user starts Dead Links, so the extension can check bookmarked HTTP(S) URLs. Local, private, and non-HTTP(S) URLs are skipped. |

Firefox currently requires `<all_urls>` in the MV2 build because optional host permissions are not used there.

## 🚀 Install

**Local install (developer mode):**

```bash
pnpm install
pnpm build          # Chrome / Edge
pnpm build:firefox  # Firefox
```

- **Chrome / Edge:** go to `chrome://extensions` (or `edge://extensions`) → enable Developer mode → **Load unpacked** → pick `.output/chrome-mv3`.
- **Firefox:** go to `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → pick any file in `.output/firefox-mv2`.

## 🧰 Keyboard shortcuts

| Action | Shortcut |
|---|---|
| Open command palette | `⌘K` / `Ctrl+K` |
| Show help & shortcuts | `?` |
| Search bookmarks from the address bar | `fave` ␣ query |
| Jump to a view from the address bar | `fave` ␣ `:dashboard` / `:library` / `:organize` / … |
| Library keyboard nav | `j/k` or `↑/↓`, `h/l` for collapse / expand, `Enter`, `Space`, `Delete` |
| Library range select | Shift-click a bookmark to extend selection from the last clicked row |

## 🏗 Tech

- [WXT](https://wxt.dev/) (Chrome / Edge MV3, Firefox MV2 build) + React 19 + TypeScript 6
- Radix UI primitives + Tailwind CSS v4
- Copper + warm cream product palette, full light/dark themes, shadcn-style component conventions

## 🧪 Development

```bash
pnpm dev              # Chrome / Edge live-reload
pnpm dev:firefox      # Firefox live-reload
pnpm compile          # tsc --noEmit
pnpm test             # vitest (unit)
pnpm e2e              # Playwright side-panel smoke drive (uses a disposable profile)
pnpm build            # production build → .output/chrome-mv3
pnpm zip              # Chrome / Edge store-ready zip
pnpm zip:firefox      # Firefox store-ready zip
```

Screenshots + per-view logs from the e2e run land in `test-results/`.

## ⚠️ Disclaimer

Favewise modifies your browser's bookmark data. **Back up via your browser's bookmark export before first use.** The developers and JoyX assume no liability for unintended data loss.

Campus portals, SSO flows, CAS gateways, and VPN pages may look like dead links to an automated HEAD check — review the *Suspicious* tab before deleting.

## 📄 License & trademark

- **Code:** [GNU AGPL v3](./LICENSE). Forks and modifications are welcome, provided the fork is also published under AGPL-3.0 *and* renamed / rebranded per the trademark policy.
- **Trademark:** "Favewise™", wordmark, icon, and palette — see [TRADEMARK.md](./TRADEMARK.md).
- **Copyright:** Held by Callum personally. JoyX is the operator, not the owner. See [COPYRIGHT.md](./COPYRIGHT.md), [CLA.md](./CLA.md), [LEGAL-SIGNOFF.md](./LEGAL-SIGNOFF.md).

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) and the files it references.

## 🧯 Support & security

- Product questions and bugs: [GitHub Issues](https://github.com/joyxhq/favewise/issues)
- Security reports: see [SECURITY.md](./SECURITY.md)
- Privacy questions: `privacy@joyx.io`
