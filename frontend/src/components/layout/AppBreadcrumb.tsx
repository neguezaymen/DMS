import { Link, useLocation, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/shadcn/breadcrumb'

type Segment = { to: string; label: string; current?: boolean }

function trailForPath(pathname: string, params: Record<string, string | undefined>, t: (k: string, vars?: any) => string): Segment[] {
  if (pathname === '/dashboard') return []
  const parts: Segment[] = []

  if (pathname.startsWith('/documents/') && params.id) {
    parts.push({ to: '/documents', label: t('nav.documents') })
    parts.push({
      to: pathname,
      label: t('breadcrumb.documentTitle', { title: `#${params.id}` }),
      current: true,
    })
    return parts
  }

  if (pathname === '/documents') {
    parts.push({ to: '/documents', label: t('nav.documents'), current: true })
    return parts
  }

  const simple: Record<string, () => Segment[]> = {
    '/profile': () => [{ to: pathname, label: t('nav.profile'), current: true }],
    '/upload-requests': () => [{ to: pathname, label: t('nav.uploadRequests'), current: true }],
    '/trash': () => [{ to: pathname, label: t('nav.trash'), current: true }],
    '/audit-logs': () => [{ to: pathname, label: t('nav.auditLogs'), current: true }],
    '/ai-studio': () => [{ to: pathname, label: t('nav.aiStudio'), current: true }],
    '/ai-studio/batch': () => [{ to: pathname, label: t('nav.aiBatch'), current: true }],
    '/notifications': () => [{ to: pathname, label: t('layout.notifications'), current: true }],
    '/search': () => [{ to: pathname, label: t('breadcrumb.search'), current: true }],
    '/workflows/tasks': () => [{ to: pathname, label: t('nav.myTasks'), current: true }],
    '/workflows/templates': () => [{ to: pathname, label: t('nav.templates'), current: true }],
    '/admin/users': () => [{ to: pathname, label: t('nav.users'), current: true }],
    '/admin/departments': () => [{ to: pathname, label: t('nav.departments'), current: true }],
    '/admin/settings': () => [{ to: pathname, label: t('nav.settings'), current: true }],
    '/admin/custom-fields': () => [{ to: pathname, label: t('nav.customFields'), current: true }],
  }

  if (simple[pathname]) return simple[pathname]()
  return [{ to: pathname, label: pathname, current: true }]
}

export default function AppBreadcrumb() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const params = useParams()
  const trail = trailForPath(pathname, params, t)

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          {pathname === '/dashboard' ? (
            <BreadcrumbPage>{t('nav.dashboard')}</BreadcrumbPage>
          ) : (
            <BreadcrumbLink asChild>
              <Link to="/dashboard">{t('nav.dashboard')}</Link>
            </BreadcrumbLink>
          )}
        </BreadcrumbItem>
        {trail.map((seg, i) => (
          <span key={`${seg.to}-${i}`} className="contents">
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {seg.current ? (
                <BreadcrumbPage>{seg.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link to={seg.to}>{seg.label}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </span>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
