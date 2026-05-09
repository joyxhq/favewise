const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
const MARKDOWN_SPECIALS = /([\\`*_{}\[\]()#+\-.!|>])/g

export function escapeMarkdownText(value: string): string {
  return value
    .replace(CONTROL_CHARS, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n+/g, ' ')
    .replace(MARKDOWN_SPECIALS, '\\$1')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .trim()
}

export function formatMarkdownLink(title: string, url: string): string {
  const safeTitle = escapeMarkdownText(title || url) || 'Untitled'
  try {
    const safeUrl = encodeURI(url)
      .replace(/\(/g, '%28')
      .replace(/\)/g, '%29')
      .replace(/"/g, '%22')
      .replace(/</g, '%3C')
      .replace(/>/g, '%3E')
    return `[${safeTitle}](${safeUrl})`
  } catch {
    return `${safeTitle} — ${escapeMarkdownText(url)}`
  }
}
