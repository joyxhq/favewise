import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import pkg from './package.json' with { type: 'json' };
import { firefoxAddonId } from './shared/lib/webext';

const extensionName = 'Favewise - Bookmark Cleaner & Organizer';
const extensionShortName = 'Favewise';
const extensionDescription = 'Make bookmarks useful again. Find dead links, duplicates, empty folders, and forgotten bookmarks. Local-first, no tracking.';

// Single source of truth for the version: package.json. Bump there and both
// `npm publish`-style tooling and the built manifest stay in sync.
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: ({ browser }) => ({
    name: extensionName,
    short_name: extensionShortName,
    // Manifest description = Chrome Store short description (132-char limit).
    // Keep it concrete because this is what users see after uploading the ZIP.
    description: extensionDescription,
    version: pkg.version,
    permissions:
      browser === 'firefox'
        ? ['bookmarks', 'storage', 'unlimitedStorage', 'alarms', '<all_urls>']
        : ['bookmarks', 'storage', 'unlimitedStorage', 'sidePanel', 'favicon', 'alarms', 'activeTab'],
    optional_host_permissions: browser === 'firefox' ? undefined : ['<all_urls>'],
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self';",
    },
    // `action.default_title` is derived from entrypoints/popup/index.html's
    // <title> by WXT. Edit it there if you need to change the tooltip.
    action: {
      default_title: extensionName,
    },
    side_panel:
      browser === 'firefox'
        ? undefined
        : { default_path: 'sidepanel.html' },
    sidebar_action:
      browser === 'firefox'
        ? {
            default_title: 'Favewise',
            default_panel: 'sidepanel.html',
            browser_style: false,
          }
        : undefined,
    omnibox: {
      keyword: 'fave',
    },
    browser_specific_settings:
      browser === 'firefox'
        ? {
            gecko: {
              id: firefoxAddonId,
              strict_min_version: '142.0',
              data_collection_permissions: {
                required: ['none'],
              },
            },
          }
        : undefined,
    homepage_url: 'https://github.com/joyxhq/favewise',
  }),
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
