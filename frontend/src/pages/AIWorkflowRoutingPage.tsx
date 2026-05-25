import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, GitBranch, Play, RefreshCw } from 'lucide-react'
import api from '../services/api/client'
import Card from '../components/ui/Card'
import { Button } from '@/components/shadcn/button'
import { Badge } from '@/components/shadcn/badge'
import { useToast } from '../state/ToastContext'

function priorityVariant(p: string) {
  if (p === 'high') return 'destructive' as const
  if (p === 'normal') return 'secondary' as const
  return 'outline' as const
}

export default function AIWorkflowRoutingPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)
  const [startingId, setStartingId] = useState<number | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get('/ai-studio/workflow-routing/recommendations')
      setData(res.data?.data || null)
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('aiRouting.loadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startWorkflow = async (rec: any) => {
    if (!rec.suggestedWorkflow?.id) return
    setStartingId(rec.documentId)
    try {
      await api.post(`/workflows/${rec.suggestedWorkflow.id}/start`, {
        documentId: rec.documentId,
      })
      toast.success(t('aiRouting.started', { name: rec.suggestedWorkflow.name }))
      void load()
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('aiRouting.startFail'))
    } finally {
      setStartingId(null)
    }
  }

  const recommendations = Array.isArray(data?.recommendations) ? data.recommendations : []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
            <Link to="/ai">
              <ArrowLeft className="mr-2 size-4" />
              {t('aiFeatures.backHub')}
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">{t('aiRouting.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('aiRouting.subtitle')}</p>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className="mr-2 size-4" />
          {t('common.refresh')}
        </Button>
      </div>

      {data ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card title={t('aiRouting.total')}>
            <p className="text-2xl font-semibold">{data.total}</p>
          </Card>
          <Card title={t('aiRouting.withoutWorkflow')}>
            <p className="text-2xl font-semibold">{data.withoutWorkflow}</p>
          </Card>
        </div>
      ) : null}

      <Card title={t('aiRouting.listTitle')} subtitle={t('aiRouting.listSub')}>
        {loading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : recommendations.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('aiRouting.empty')}</p>
        ) : (
          <div className="space-y-3">
            {recommendations.map((rec: any) => (
              <div key={rec.documentId} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      to={`/documents/${rec.documentId}?tab=workflow`}
                      className="font-medium hover:underline"
                    >
                      {rec.title}
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {rec.currentCategory} → {rec.suggestedCategory}
                    </p>
                    {rec.suggestedWorkflow ? (
                      <p className="mt-2 flex items-center gap-2 text-sm">
                        <GitBranch className="size-4 text-primary" />
                        {rec.suggestedWorkflow.name}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">{rec.rationale}</p>
                    {rec.suggestedTags?.length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {rec.suggestedTags.map((tag: string) => (
                          <Badge key={tag} variant="outline">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge variant={priorityVariant(rec.priority)}>{rec.priority}</Badge>
                    {rec.hasActiveWorkflow ? (
                      <Badge variant="secondary">{rec.activeWorkflowName}</Badge>
                    ) : rec.canStartWorkflow ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={startingId === rec.documentId}
                        onClick={() => void startWorkflow(rec)}
                      >
                        <Play className="mr-2 size-3.5" />
                        {startingId === rec.documentId
                          ? t('common.loading')
                          : t('aiRouting.startBtn')}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          navigate(`/documents/${rec.documentId}?tab=workflow&workflowId=${rec.suggestedWorkflow?.id || ''}`)
                        }
                      >
                        {t('aiRouting.viewDoc')}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
