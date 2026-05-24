export function formatLongDate(date = new Date(), locale = 'fr') {
  const loc = String(locale || 'fr').toLowerCase().startsWith('en') ? 'en-US' : 'fr-FR'
  return date.toLocaleDateString(loc, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** @deprecated utilisez formatLongDate */
export function formatFrenchLongDate(date = new Date()) {
  return formatLongDate(date, 'fr')
}

export function formatRelative(isoString, locale = 'fr') {
  if (!isoString) return ''
  const date = new Date(isoString)
  const diffSec = Math.round((date.getTime() - Date.now()) / 1000)
  const abs = Math.abs(diffSec)
  const loc = String(locale || 'fr').toLowerCase().startsWith('en') ? 'en' : 'fr'
  const rtf = new Intl.RelativeTimeFormat(loc, { numeric: 'auto' })

  if (abs < 60) return rtf.format(Math.round(diffSec / 1), 'second')
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour')
  if (abs < 604800) return rtf.format(Math.round(diffSec / 86400), 'day')
  if (abs < 2592000) return rtf.format(Math.round(diffSec / 604800), 'week')
  return rtf.format(Math.round(diffSec / 2592000), 'month')
}

/** @deprecated utilisez formatRelative */
export function formatRelativeFr(isoString) {
  return formatRelative(isoString, 'fr')
}

export function formatBytes(bytes, locale = 'fr') {
  const en = String(locale || 'fr').toLowerCase().startsWith('en')
  if (bytes === 0) return en ? '0 B' : '0 o'
  const k = 1024
  const sizes = en ? ['B', 'KB', 'MB', 'GB', 'TB'] : ['o', 'Ko', 'Mo', 'Go', 'To']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const value = bytes / k ** i
  return `${value < 10 && i > 0 ? value.toFixed(1) : Math.round(value)} ${sizes[i]}`
}
