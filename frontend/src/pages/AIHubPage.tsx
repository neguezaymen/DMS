import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Brain,
  FileSearch,
  GitBranch,
  Layers,
  MessageSquare,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  Tags,
} from 'lucide-react'
import api from '../services/api/client'
import Card from '../components/ui/Card'
import { Button } from '@/components/shadcn/button'
import { Progress } from '@/components/shadcn/progress'
import { Badge } from '@/components/shadcn/badge'
import { useToast } from '../state/ToastContext'

const FEATURE_CONFIG: Record<
  string,
  { icon: typeof Brain; labelKey: string; descKey: string }
> = {
  generate: { icon: Sparkles, labelKey: 'nav.aiStudio', descKey: 'aiHub.capGenerate' },
  batch: { icon: Layers, labelKey: 'nav.aiBatch', descKey: 'aiHub.capBatch' },
  search: { icon: FileSearch, labelKey: 'aiHub.smartSearch', descKey: 'aiHub.capSearch' },
  assistant: { icon: MessageSquare, labelKey: 'aiHub.documentAssistant', descKey: 'aiHub.capAssistant' },
  compliance: { icon: ShieldCheck, labelKey: 'aiHub.compliance', descKey: 'aiHub.capCompliance' },
  'corpus-qa': { icon: MessageSquareText, labelKey: 'aiHub.corpusQa', descKey: 'aiHub.capCorpusQa' },
  metadata: { icon: Tags, labelKey: 'aiHub.metadata', descKey: 'aiHub.capMetadata' },
  routing: { icon: GitBranch, labelKey: 'aiHub.routing', descKey: 'aiHub.capRouting' },
}

export default function AIHubPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [hub, setHub] = useState<any>(null)
  const [meta, setMeta] = useState<any>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const res = await api.get('/ai-studio/hub')
        if (!cancelled) {
          setHub(res.data?.data || null)
          setMeta(res.data?.meta || null)
        }
      } catch (error: any) {
        if (!cancelled) {
          toast.error(error.response?.data?.message || t('aiHub.loadError'))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [t, toast])

  const quota = hub?.quota || { dailyLimit: 50, usedToday: 0 }
  const pct =
    quota.dailyLimit > 0
      ? Math.min(100, Math.round((quota.usedToday / quota.dailyLimit) * 100))
      : 0
  const features = Array.isArray(hub?.features) ? hub.features : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('aiHub.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('aiHub.subtitle')}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={t('aiHub.quotaTitle')} subtitle={t('aiHub.quotaSub')} className="lg:col-span-1">
          {loading ? (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span>{t('aiHub.quotaUsed')}</span>
                <span className="font-medium">
                  {quota.usedToday}/{quota.dailyLimit}
                </span>
              </div>
              <Progress value={pct} />
              {meta?.source ? (
                <Badge variant="outline">{t('aiHub.source', { source: meta.source })}</Badge>
              ) : null}
            </div>
          )}
        </Card>

        <Card title={t('aiHub.quickLinks')} subtitle={t('aiHub.quickLinksSub')} className="lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2">
            {features.map((feature: any) => {
              const cfg = FEATURE_CONFIG[feature.id] || {
                icon: Brain,
                labelKey: 'aiHub.title',
                descKey: 'aiHub.subtitle',
              }
              const Icon = cfg.icon
              const label = t(cfg.labelKey)
              const path =
                feature.id === 'search' || feature.id === 'assistant'
                  ? feature.path
                  : feature.path
              return (
                <Link
                  key={feature.id}
                  to={path}
                  className="group flex items-start gap-3 rounded-lg border p-4 transition-colors hover:bg-accent/50"
                >
                  <div className="rounded-md bg-primary/10 p-2">
                    <Icon className="size-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t(cfg.descKey)}</p>
                  </div>
                  <ArrowRight className="mt-1 size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              )
            })}
          </div>
        </Card>
      </div>

      <Card title={t('aiHub.capabilitiesTitle')} subtitle={t('aiHub.capabilitiesSub')}>
        <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          <li>{t('aiHub.capGenerate')}</li>
          <li>{t('aiHub.capBatch')}</li>
          <li>{t('aiHub.capSearch')}</li>
          <li>{t('aiHub.capAssistant')}</li>
          <li>{t('aiHub.capCompliance')}</li>
          <li>{t('aiHub.capCorpusQa')}</li>
          <li>{t('aiHub.capMetadata')}</li>
          <li>{t('aiHub.capRouting')}</li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/ai-studio">{t('aiHub.openStudio')}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/ai/compliance">{t('aiHub.compliance')}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/documents">{t('nav.documents')}</Link>
          </Button>
        </div>
      </Card>
    </div>
  )
}
