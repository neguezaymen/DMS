import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { DEFAULT_OG_IMAGE, SITE } from '@/config/site'

function setMeta(name: string, content: string, property = false) {
  const attr = property ? 'property' : 'name'
  let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, name)
    document.head.appendChild(el)
  }
  el.content = content
}

type PageTitleOptions = {
  /** Override default site description for this page. */
  description?: string
  /** Skip updating document.title (e.g. when title is set elsewhere). */
  skipTitle?: boolean
}

/**
 * Sets document title and core SEO meta tags for the current view.
 * Pass `null` to fall back to the site name only.
 */
export function usePageTitle(pageTitle: string | null | undefined, options?: PageTitleOptions) {
  const { t, i18n } = useTranslation()

  useEffect(() => {
    const siteName = t('site.name', SITE.name)
    const defaultDescription = t('site.description')
    const description = options?.description ?? defaultDescription
    const trimmed = pageTitle?.trim()

    if (!options?.skipTitle) {
      document.title = trimmed ? t('site.titleTemplate', { page: trimmed, site: siteName }) : siteName
    }

    document.documentElement.lang = i18n.language.startsWith('fr') ? 'fr' : 'en'

    setMeta('description', description)
    setMeta('og:title', trimmed ? `${trimmed} · ${siteName}` : siteName, true)
    setMeta('og:description', description, true)
    setMeta('og:site_name', siteName, true)
    setMeta('og:type', 'website', true)
    setMeta('og:locale', i18n.language.startsWith('fr') ? 'fr_FR' : 'en_US', true)
    setMeta('twitter:card', SITE.twitterCard)
    setMeta('twitter:title', trimmed ? `${trimmed} · ${siteName}` : siteName)
    setMeta('twitter:description', description)

    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    if (origin) {
      setMeta('og:url', `${origin}${window.location.pathname}`, true)
      setMeta('og:image', `${origin}${DEFAULT_OG_IMAGE}`, true)
      setMeta('twitter:image', `${origin}${DEFAULT_OG_IMAGE}`)
    }
  }, [pageTitle, options?.description, options?.skipTitle, t, i18n.language])
}
