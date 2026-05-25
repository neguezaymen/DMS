import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ShieldAlert, RefreshCw } from 'lucide-react'
import api from '../services/api/client'
import Card from '../components/ui/Card'
import { Button } from '@/components/shadcn/button'
import { Badge } from '@/components/shadcn/badge'
import { Progress } from '@/components/shadcn/progress'
import { useToast } from '../state/ToastContext'

function levelVariant(level: string) {
  if (level === 'high') return 'destructive' as const
  if (level === 'warning') return 'secondary' as const
  return 'outline' as const
}

export default function AICompliancePage() {
  const { t } = useTranslation()
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get('/ai-studio/compliance/scan')
      setData(res.data?.data || null)
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('aiCompliance.loadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const summary = data?.summary
  const reports = Array.isArray(data?.reports) ? data.reports : []

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
          <h1 className="text-2xl font-semibold tracking-tight">{t('aiCompliance.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('aiCompliance.subtitle')}</p>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className="mr-2 size-4" />
          {t('common.refresh')}
        </Button>
      </div>

      {summary ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card title={t('aiCompliance.scoreAvg')} className="lg:col-span-1">
            <p className="text-3xl font-semibold">{summary.averageScore}/100</p>
            <Progress value={summary.averageScore} className="mt-2 h-2" />
          </Card>
          <Card title={t('aiCompliance.scanned')}>
            <p className="text-2xl font-semibold">{summary.scanned}</p>
          </Card>
          <Card title={t('aiCompliance.highRisk')}>
            <p className="text-2xl font-semibold text-destructive">{summary.high}</p>
          </Card>
          <Card title={t('aiCompliance.warnings')}>
            <p className="text-2xl font-semibold">{summary.warning}</p>
          </Card>
        </div>
      ) : null}

      <Card title={t('aiCompliance.reportsTitle')} subtitle={t('aiCompliance.reportsSub')}>
        {loading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('aiCompliance.empty')}</p>
        ) : (
          <div className="space-y-3">
            {reports.map((report: any) => (
              <div key={report.documentId} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link
                      to={`/documents/${report.documentId}`}
                      className="font-medium hover:underline"
                    >
                      {report.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      #{report.documentId} · {report.category}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={levelVariant(report.level)}>{report.score}/100</Badge>
                    <ShieldAlert className="size-4 text-muted-foreground" />
                  </div>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {(report.findings || []).map((f: any, i: number) => (
                    <li key={i} className="text-sm text-muted-foreground">
                      <Badge variant="outline" className="mr-2 text-[10px]">
                        {f.type}
                      </Badge>
                      {f.message}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
