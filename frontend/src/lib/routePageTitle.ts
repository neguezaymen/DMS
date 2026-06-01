/** i18n keys for document title per route (pathname without query). */
export const ROUTE_PAGE_TITLE_KEYS: Record<string, string> = {
  '/dashboard': 'pageTitle.dashboard',
  '/documents': 'pageTitle.documents',
  '/search': 'pageTitle.search',
  '/workflows/tasks': 'pageTitle.myTasks',
  '/workflows/templates': 'pageTitle.templates',
  '/ai': 'pageTitle.aiHub',
  '/ai/compliance': 'pageTitle.aiCompliance',
  '/ai/corpus-qa': 'pageTitle.aiCorpusQa',
  '/ai/metadata': 'pageTitle.aiMetadata',
  '/ai/workflow-routing': 'pageTitle.aiRouting',
  '/ai-studio': 'pageTitle.aiStudio',
  '/ai-studio/batch': 'pageTitle.aiBatch',
  '/upload-requests': 'pageTitle.uploadRequests',
  '/trash': 'pageTitle.trash',
  '/notifications': 'pageTitle.notifications',
  '/audit-logs': 'pageTitle.auditLogs',
  '/admin/users': 'pageTitle.adminUsers',
  '/admin/settings': 'pageTitle.adminSettings',
  '/admin/departments': 'pageTitle.adminDepartments',
  '/admin/custom-fields': 'pageTitle.adminCustomFields',
  '/profile': 'pageTitle.profile',
  '/login': 'pageTitle.login',
  '/register': 'pageTitle.register',
  '/forgot-password': 'pageTitle.forgotPassword',
  '/reset-password': 'pageTitle.resetPassword',
  '/verify-2fa': 'pageTitle.verify2fa',
}

const SETTINGS_TAB_TITLE_KEYS: Record<string, string> = {
  fields: 'pageTitle.adminCustomFields',
  departments: 'pageTitle.adminDepartments',
}

export function resolvePageTitleKey(pathname: string, settingsTab?: string | null): string | null {
  if (pathname.startsWith('/documents/')) return null
  if (pathname.startsWith('/public-link/')) return null
  if (pathname.startsWith('/request-upload/')) return null

  if (pathname === '/admin/settings' && settingsTab && SETTINGS_TAB_TITLE_KEYS[settingsTab]) {
    return SETTINGS_TAB_TITLE_KEYS[settingsTab]
  }

  return ROUTE_PAGE_TITLE_KEYS[pathname] ?? null
}
