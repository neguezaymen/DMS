import type { LucideIcon } from 'lucide-react'
import {
  FileUp,
  KeyRound,
  LogIn,
  ShieldCheck,
  UserPlus,
  Workflow,
  ScrollText,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shadcn/card'
import { Skeleton } from '@/components/shadcn/skeleton'
import { Button } from '@/components/shadcn/button'
import { formatRelative } from '../../utils/dashboardTime'

const ACTION_ICONS: Record<string, LucideIcon> = {
  'documents.upload': FileUp,
  'auth.login': LogIn,
  'auth.register': UserPlus,
  'auth.login.2fa_verified': ShieldCheck,
  'auth.login.2fa_challenge_sent': KeyRound,
  'workflow.instance.start': Workflow,
}

function iconForAction(action: string) {
  return ACTION_ICONS[action] || ScrollText
}

type LogRow = {
  id?: string | number
  action: string
  entity_type?: string | null
  created_at?: string | null
}

interface ActivityTimelineProps {
  logs?: LogRow[]
  loading?: boolean
  isAdminUser?: boolean | null
  demoLogCount?: number
  onGenerateDemo?: () => void
  onClearDemo?: () => void
}

export default function ActivityTimeline({
  logs = [],
  loading,
  isAdminUser = null,
  demoLogCount = 0,
  onGenerateDemo,
  onClearDemo,
}: ActivityTimelineProps) {
  const { t, i18n } = useTranslation()
  const hasDemo = demoLogCount > 0

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{t('activity.title')}</CardTitle>
        {hasDemo && onClearDemo ? (
          <Button variant="ghost" size="sm" onClick={onClearDemo}>
            {t('activity.clearDemo')}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-8 rounded-full" />
                <Skeleton className="h-3 flex-1" />
              </div>
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center text-sm text-muted-foreground">
            <p>{isAdminUser === true ? t('activity.emptyAdmin') : t('activity.emptyUser')}</p>
            {isAdminUser === true && onGenerateDemo ? (
              <Button variant="outline" size="sm" onClick={onGenerateDemo}>
                {t('activity.generateDemo')}
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            {hasDemo ? (
              <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-300">
                {t('activity.demoBanner')}
              </p>
            ) : null}
            <ul className="relative space-y-4 before:absolute before:left-4 before:top-0 before:h-full before:w-px before:bg-border">
              {logs.map((log) => {
                const Icon = iconForAction(log.action)
                const actionKey = `activity.actions.${log.action}`
                const translated = t(actionKey)
                const label = translated !== actionKey ? translated : log.action
                const isDemo = String(log.id || '').startsWith('demo-')
                return (
                  <li key={log.id} className="relative flex gap-3 pl-1">
                    <span className="z-10 grid size-8 shrink-0 place-items-center rounded-full border bg-card text-muted-foreground">
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1 pt-1">
                      <p className="text-sm">
                        <span className="font-medium text-foreground">{label}</span>
                        {log.entity_type ? (
                          <span className="text-muted-foreground"> · {log.entity_type}</span>
                        ) : null}
                        {isDemo ? (
                          <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                            {t('activity.demo')}
                          </span>
                        ) : null}
                      </p>
                      <time className="text-xs text-muted-foreground">
                        {formatRelative(log.created_at, i18n.language)}
                      </time>
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}
