import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
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

function trailForPath(pathname: string, params: Record<string, string | undefined>, t: (k: string, vars?: any) => string, settingsTab?: string | null): Segment[] {
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

  const aiHubParent = { to: '/ai', label: t('nav.aiHub') }

  const aiSubPages: Record<string, string> = {
    '/ai/compliance': 'aiHub.compliance',
    '/ai/corpus-qa': 'aiHub.corpusQa',
    '/ai/metadata': 'aiHub.metadata',
    '/ai/workflow-routing': 'aiHub.routing',
  }
  if (aiSubPages[pathname]) {
    parts.push(aiHubParent)
    parts.push({ to: pathname, label: t(aiSubPages[pathname]), current: true })
    return parts
  }

  if (pathname === '/ai') {
    parts.push({ to: '/ai', label: t('nav.aiHub'), current: true })
    return parts
  }

  if (pathname === '/ai-studio') {
    parts.push(aiHubParent)
    parts.push({ to: '/ai-studio', label: t('nav.aiStudio'), current: true })
    return parts
  }

  if (pathname === '/ai-studio/batch') {
    parts.push(aiHubParent)
    parts.push({ to: '/ai-studio/batch', label: t('nav.aiBatch'), current: true })
    return parts
  }

  if (pathname === '/admin/settings') {
    parts.push({
      to: '/admin/settings',
      label: t('nav.settings'),
      current: !settingsTab || settingsTab === 'general',
    })
    if (settingsTab === 'fields') {
      parts.push({ to: '/admin/settings?tab=fields', label: t('adminSettings.tabFields'), current: true })
    } else if (settingsTab === 'departments') {
      parts.push({
        to: '/admin/settings?tab=departments',
        label: t('adminSettings.tabDepartments'),
        current: true,
      })
    }
    return parts
  }

  const simple: Record<string, () => Segment[]> = {
    '/profile': () => [{ to: pathname, label: t('nav.profile'), current: true }],
    '/upload-requests': () => [{ to: pathname, label: t('nav.uploadRequests'), current: true }],
    '/trash': () => [{ to: pathname, label: t('nav.trash'), current: true }],
    '/audit-logs': () => [{ to: pathname, label: t('nav.auditLogs'), current: true }],
    '/notifications': () => [{ to: pathname, label: t('layout.notifications'), current: true }],
    '/search': () => [{ to: pathname, label: t('breadcrumb.search'), current: true }],
    '/workflows/tasks': () => [{ to: pathname, label: t('nav.myTasks'), current: true }],
    '/workflows/templates': () => [{ to: pathname, label: t('nav.templates'), current: true }],
    '/admin/users': () => [{ to: pathname, label: t('nav.users'), current: true }],
  }

  if (simple[pathname]) return simple[pathname]()
  return [{ to: pathname, label: pathname, current: true }]
}

export default function AppBreadcrumb() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  const params = useParams()
  const trail = trailForPath(pathname, params, t, searchParams.get('tab'))

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="min-w-0">
        <BreadcrumbItem>
          {pathname === '/dashboard' ? (
            <BreadcrumbPage className="max-w-[10rem] truncate sm:max-w-none sm:whitespace-normal">
              {t('nav.dashboard')}
            </BreadcrumbPage>
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
                <BreadcrumbPage className="max-w-[10rem] truncate sm:max-w-none sm:whitespace-normal">
                  {seg.label}
                </BreadcrumbPage>
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
