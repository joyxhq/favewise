# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Version numbers follow [SemVer](https://semver.org/) and are shared with `package.json` → `manifest.json` (single source of truth).

## [1.0.0] — 2026-05-09

Initial public release.

### Features

- **Side-panel UI** with 9 views: Dashboard, Library, Dead Links, Duplicates, Organize, Rediscover, Empty Folders, Insights, Settings.
- **Dead-link check** with incremental processing, stop / resume, and safer classification for SSO / CAS / WebVPN portals.
- **Duplicate detection** with normalized URL matching (UTM, `www`, trailing slash) and Keep-Newest / Keep-Oldest / Safe-folder bulk resolution.
- **Smart Organize** driven by a curated ~300-domain site-function taxonomy plus domain / keyword clustering.
- **New-bookmark inbox** auto-categorizes freshly starred pages with one-click move-to suggestions.
- **Rediscover** surfaces old saves with personalized reasons (age, never visited, domain frequency).
- **Empty-folder sweep** with permanent delete confirmation.
- **Protected folders** — subtrees Favewise will never propose moves into or out of.
- **Insights dashboard** — age histogram, top domains, top categories, dead-link rate.
- **Library Explorer** — full-tree browse, drag-to-reorder (folders included), Shift-click range select, right-click CRUD, rename / create folders, sync to Chrome bookmarks in real time.
- **Command palette** (⌘K / Ctrl+K) with Go-to / Actions / Bookmark-search groups.
- **Keyboard navigation** throughout the Library (j/k, arrows, h/l, Enter, Space, Delete, `/`, Shift+Arrow range).
- **Omnibox integration** — `fave <query>` searches bookmarks, `fave :view` jumps to a view.
- **Settings** — scan cadence, protected folders, excluded folders, trash management, organize memory reset, diagnostics, backup export / import.
- **i18n** — full English + 简体中文 coverage; auto-detect or manual override.
- **Trash + 5-second undo** for every destructive action. Folder deletion is the only permanent operation and surfaces an explicit confirm.

### Safety

- Destructive handlers (`organize.apply`, `rediscover.apply`, `duplicates.resolve`, `deadLinks.trash`, `emptyFolders.remove`, `library.trash`, `library.move`) all respect `protectedFolderIds`.
- `organize.apply` now records reverse anti-moves automatically, preventing the "ping-pong" where previously-applied suggestions reappear in the opposite direction on the next scan.
- `generateOrganizeSuggestions` uses a 1.35× churn margin against the current folder's fit — avoids proposing cross-moves between two folders that are both decent homes for the same topic.

### UX

- Side-panel layout with a copper + warm cream product palette, full light / dark themes, and OKLCH custom properties.
- Drag-and-drop for both bookmarks and folders, with cycle-guard preventing drops into a folder's own subtree.
- Accessibility — every Radix AlertDialog has an explicit or sr-only description; `?` shortcut opens a keyboard / concept reference; all nav buttons have `aria-label` and `aria-current`.
- 98 Vitest unit tests cover URL normalization, duplicate detection, dead-link safety, protected folders, Markdown export, search parsing, settings validation, concurrency utilities, and i18n.
- Playwright smoke-drive (`pnpm e2e`) exercises every nav button, modifier-key selection, folder drag, language switch, and dialogs — see `test-results/*` after running.

### Known limits

- Dead-link check uses HEAD / GET requests against the bookmarked URLs; servers that reject HEAD or rate-limit aggressive IPs may surface as *Suspicious* until a retry clears them.
