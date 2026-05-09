import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import pkg from './package.json' with { type: 'json' };
import { firefoxAddonId } from './shared/lib/webext';

// Single source of truth for the version: package.json. Bump there and both
// `npm publish`-style tooling and the built manifest stay in sync.
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: ({ browser }) => ({
    name: 'Favewise',
    // Manifest description = Chrome Store short description (132-char limit).
    // Leads with the brand tagline, then compact value scan for discovery.
    description: 'Make bookmarks useful again. Clean dead links, duplicates, folders, and old saves — local-first, no accounts.',
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
    action: {},
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
