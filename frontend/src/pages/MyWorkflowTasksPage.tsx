import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import api from '../services/api/client'
import Card from '../components/ui/Card'
import { Button } from '@/components/shadcn/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/shadcn/table'
import { useToast } from '../state/ToastContext'
import { workflowTimelineAction } from '../utils/documentUi'

export default function MyWorkflowTasksPage() {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const uiLocale = i18n.language?.startsWith('en') ? 'en-US' : 'fr-FR'

  const loadTasks = async () => {
    setLoading(true)
    try {
      const response = await api.get('/workflows/instances?status=pending')
      setTasks(response.data.data || [])
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('myWorkflowTasks.loadError'))
      setTasks([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadTasks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submitAction = async (instanceId: number, action: string) => {
    const comment =
      window.prompt(
        t('myWorkflowTasks.workflowPromptComment', {
          action: workflowTimelineAction(action, t),
        }),
        '',
      ) || ''
    try {
      await api.post(`/workflows/instances/${instanceId}/${action}`, { comment })
      toast.success(t('myWorkflowTasks.actionOk'))
      await loadTasks()
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('myWorkflowTasks.actionFail', { action }))
    }
  }

  return (
    <div className="space-y-4">
      <Card
        title={t('myWorkflowTasks.title')}
        subtitle={loading ? t('common.loading') : t('myWorkflowTasks.subtitle')}
      >
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('myWorkflowTasks.colDoc')}</TableHead>
                <TableHead>{t('myWorkflowTasks.colWorkflow')}</TableHead>
                <TableHead>{t('myWorkflowTasks.colStep')}</TableHead>
                <TableHead>{t('myWorkflowTasks.colAssignee')}</TableHead>
                <TableHead>{t('myWorkflowTasks.colDue')}</TableHead>
                <TableHead>{t('myWorkflowTasks.colActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task: any) => (
                <TableRow key={task.id}>
                  <TableCell>
                    <Link
                      to={`/documents/${task.document_id}?tab=workflow`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {task.document_title}
                    </Link>
                  </TableCell>
                  <TableCell>{task.workflow_name}</TableCell>
                  <TableCell>
                    {task.step_order
                      ? t('myWorkflowTasks.stepLine', { n: task.step_order })
                      : t('common.emDash')}
                  </TableCell>
                  <TableCell>{task.assignee_label || t('common.emDash')}</TableCell>
                  <TableCell className="text-xs">
                    {task.due_date
                      ? new Date(task.due_date).toLocaleString(uiLocale)
                      : t('common.emDash')}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => submitAction(task.id, 'approve')}
                      >
                        {t('documentDetail.approve')}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => submitAction(task.id, 'reject')}
                      >
                        {t('documentDetail.reject')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => submitAction(task.id, 'request-changes')}
                      >
                        {t('documentDetail.requestChanges')}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {tasks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    {t('myWorkflowTasks.emptyTasks')}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  )
}
