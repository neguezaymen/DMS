import { ArrowRight, ClipboardList } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shadcn/card'
import { Skeleton } from '@/components/shadcn/skeleton'
import { Button } from '@/components/shadcn/button'

type TaskRow = {
  id: number | string
  document_id: number | string
  document_title?: string | null
  workflow_name?: string | null
  step_order?: number | null
}

interface PendingTasksProps {
  tasks?: TaskRow[]
  loading?: boolean
}

export default function PendingTasks({ tasks = [], loading }: PendingTasksProps) {
  const { t } = useTranslation()

  return (
    <Card id="taches-a-valider">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{t('pendingTasks.validateTitle')}</CardTitle>
        <Link
          to="/workflows/tasks"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {t('pendingTasks.allLink')} <ArrowRight className="size-3.5" />
        </Link>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
            <ClipboardList className="size-7 opacity-60" strokeWidth={1.5} />
            <p>{t('pendingTasks.emptyShort')}</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {tasks.slice(0, 5).map((task) => (
              <li
                key={task.id}
                className="flex items-center justify-between gap-3 rounded-md border bg-card/50 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {task.document_title || `${t('common.documentHash')}${task.document_id}`}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {task.workflow_name || t('pendingTasks.flow')} · {t('pendingTasks.step')}{' '}
                    {task.step_order ?? t('common.emDash')}
                  </p>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link to={`/documents/${task.document_id}?tab=workflow`}>
                    {t('pendingTasks.treat')}
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
