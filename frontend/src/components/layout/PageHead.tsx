import { useMemo } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { resolvePageTitleKey } from '@/lib/routePageTitle'
import { usePageTitle } from '@/hooks/usePageTitle'

type PageHeadProps = {
  /** Explicit page title (overrides route-based title). */
  title?: string | null
  description?: string
}

export default function PageHead({ title, description }: PageHeadProps) {
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  const { t } = useTranslation()

  const routeTitle = useMemo(() => {
    if (title !== undefined) return title
    const key = resolvePageTitleKey(pathname, searchParams.get('tab'))
    return key ? t(key) : null
  }, [title, pathname, searchParams, t])

  usePageTitle(routeTitle, { description })

  return null
}
