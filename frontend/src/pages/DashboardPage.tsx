import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Clock, FileStack, RefreshCw, Sparkles, ExternalLink } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api, { hasStoredAuthSession } from '../services/api/client'
import { useAuth } from '../state/AuthContext'
import { useAdminAccess } from '../hooks/useAdminAccess'
import { useDashboardData } from '../hooks/useDashboardData'
import { formatLongDate } from '../utils/dashboardTime'
import { createDemoAuditEntries } from '../utils/demoAuditLogs'
import StatCard from '../components/dashboard/StatCard'
import RecentDocuments from '../components/dashboard/RecentDocuments'
import PendingTasks from '../components/dashboard/PendingTasks'
import ActivityTimeline from '../components/dashboard/ActivityTimeline'
import StorageUsage from '../components/dashboard/StorageUsage'
import DashboardInteractiveAnalytics from '../components/dashboard/DashboardInteractiveAnalytics'
import DocumentsStatusBreakdown from '../components/dashboard/DocumentsStatusBreakdown'
import AchievementBadges from '../components/dashboard/AchievementBadges'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/shadcn/card'
import { Button } from '@/components/shadcn/button'
import { Badge } from '@/components/shadcn/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/shadcn/alert'
import { Input } from '@/components/shadcn/input'
import { Label } from '@/components/shadcn/label'
import { cn } from '@/lib/utils'

const DEMO_AUDIT_STORAGE_KEY = 'dms_demo_audit_logs'
const DASHBOARD_STORAGE_QUOTA_BYTES = Number(
  (import.meta as any).env?.VITE_STORAGE_QUOTA_BYTES || 1024 * 1024 * 1024,
)

function loadDemoAuditFromSession() {
  try {
    const raw = sessionStorage.getItem(DEMO_AUDIT_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function roleBadgeLabel(isAdmin: boolean, t: (k: string) => string) {
  return isAdmin ? t('dashboard.roleAdmin') : t('dashboard.roleUser')
}

function getMotivationMessage(uploadCount: number, approvedCount: number, t: (k: string) => string) {
  if (uploadCount >= 50) return t('dashboard.motivation.m50')
  if (uploadCount >= 20) return t('dashboard.motivation.m20')
  if (uploadCount >= 10) return t('dashboard.motivation.m10u')
  if (approvedCount >= 10) return t('dashboard.motivation.m10a')
  if (approvedCount >= 5) return t('dashboard.motivation.m5a')
  return t('dashboard.motivation.m0')
}

function parsePredictiveDate(detail?: string) {
  const m = String(detail || '').match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (!m) return null
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  return Number.isNaN(d.getTime()) ? null : d
}

export default function DashboardPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdminUser = useAdminAccess()
  const [demoAuditLogs, setDemoAuditLogs] = useState<any[]>(loadDemoAuditFromSession)
  const [aiAlerts, setAiAlerts] = useState<any[]>([])
  const [predictiveDays, setPredictiveDays] = useState(15)
  const [predictiveAlerts, setPredictiveAlerts] = useState<any[]>([])
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [archivingBatch, setArchivingBatch] = useState(false)
  const [achievementStats, setAchievementStats] = useState({ uploads: 0, workflowsApproved: 0 })
  const [dashboardNow] = useState(() => Date.now())

  const {
    loading,
    statsLoading,
    statsReady,
    error,
    recentDocuments,
    totalDocuments,
    pendingTasks,
    auditLogs,
    archivable,
    documentsAccessible,
    meta,
    refetch,
  } = useDashboardData()

  useEffect(() => {
    if (!hasStoredAuthSession()) {
      navigate('/login', { replace: true, state: { message: t('dashboard.sessionExpired') } })
    }
  }, [navigate, t])

  useEffect(() => {
    try {
      sessionStorage.setItem(DEMO_AUDIT_STORAGE_KEY, JSON.stringify(demoAuditLogs))
    } catch {
      /* ignore */
    }
  }, [demoAuditLogs])

  useEffect(() => {
    let cancelled = false
    if (!hasStoredAuthSession()) return () => { cancelled = true }
    api
      .get('/users/me')
      .then((res) => {
        if (cancelled) return
        const s = res.data?.data?.stats
        setAchievementStats({
          uploads: Number(s?.documents_uploaded) || 0,
          workflowsApproved: Number(s?.workflows_approved) || 0,
        })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const mergedAuditLogs = useMemo(() => {
    const combined = [...(auditLogs || []), ...(demoAuditLogs || [])]
    return combined
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .slice(0, 15)
  }, [auditLogs, demoAuditLogs])

  const generateDemoActivity = useCallback(() => {
    setDemoAuditLogs((prev) => [...createDemoAuditEntries(), ...prev].slice(0, 20))
  }, [])

  const clearDemoActivity = useCallback(() => {
    setDemoAuditLogs([])
    try { sessionStorage.removeItem(DEMO_AUDIT_STORAGE_KEY) } catch { /* ignore */ }
  }, [])

  const storageUnavailable =
    documentsAccessible && totalDocuments > 0 && !statsReady && !statsLoading

  const showCharts =
    documentsAccessible && totalDocuments > 0 && (statsLoading || statsReady)

  const motivationMessage = useMemo(
    () => getMotivationMessage(achievementStats.uploads, achievementStats.workflowsApproved, t),
    [achievementStats.uploads, achievementStats.workflowsApproved, t],
  )

  const todayLabel = useMemo(() => formatLongDate(new Date(), i18n.language), [i18n.language])

  const weekdayLabels = useMemo(() => {
    const v = t('common.weekdaysShort', { returnObjects: true }) as unknown
    return Array.isArray(v) && v.length === 7 ? (v as string[]) : ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
  }, [t])

  const overdueWorkflows = useMemo(() => {
    return (pendingTasks || [])
      .filter((tt: any) => tt?.due_date)
      .map((tt: any) => ({ ...tt, dueTs: new Date(tt.due_date).getTime() }))
      .filter((tt: any) => Number.isFinite(tt.dueTs) && tt.dueTs < dashboardNow)
      .sort((a: any, b: any) => a.dueTs - b.dueTs)
  }, [dashboardNow, pendingTasks])

  const calendarEvents = useMemo(() => {
    const events: any[] = []
    for (const w of pendingTasks || []) {
      if (!(w as any)?.due_date) continue
      const d = new Date((w as any).due_date)
      if (Number.isNaN(d.getTime())) continue
      events.push({
        key: `wf-${(w as any).id}`,
        date: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
        title: `${t('dashboard.calendarWorkflow')} ${(w as any).document_title || `${t('common.docHash')}${(w as any).document_id}`}`,
        link: `/documents/${(w as any).document_id}?tab=workflow`,
        color: '#f59e0b',
      })
    }
    for (const a of predictiveAlerts || []) {
      const d = parsePredictiveDate(a.detail)
      if (!d) continue
      events.push({
        key: `pred-${a.documentId || a.title}-${d.toISOString()}`,
        date: d,
        title: a.title,
        link: a.link || (a.documentId ? `/documents/${a.documentId}` : null),
        color: a.severity === 'high' ? '#dc2626' : '#4f46e5',
      })
    }
    return events
  }, [pendingTasks, predictiveAlerts, t])

  const calendarGrid = useMemo(() => {
    const y = calendarMonth.getFullYear()
    const m = calendarMonth.getMonth()
    const start = new Date(y, m, 1)
    const startWeekday = (start.getDay() + 6) % 7
    const daysInMonth = new Date(y, m + 1, 0).getDate()
    const cells: (Date | null)[] = []
    for (let i = 0; i < startWeekday; i += 1) cells.push(null)
    for (let d = 1; d <= daysInMonth; d += 1) cells.push(new Date(y, m, d))
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [calendarMonth])

  useEffect(() => {
    const loadAlerts = async () => {
      try {
        const [res, pred] = await Promise.all([
          api.get('/ai-studio/alerts'),
          api.get(`/ai-studio/predictive-alerts?daysAhead=${predictiveDays}`),
        ])
        setAiAlerts(res.data.data || [])
        setPredictiveAlerts(pred.data.data?.alerts || [])
      } catch {
        setAiAlerts([])
        setPredictiveAlerts([])
      }
    }
    void loadAlerts()
  }, [predictiveDays])

  const archiveAllEligible = async () => {
    setArchivingBatch(true)
    try {
      await api.post('/documents/archive-batch', {})
      await refetch()
    } finally {
      setArchivingBatch(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header banner */}
      <Card className="overflow-hidden">
        <div className="relative">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-90"
            style={{
              background:
                'radial-gradient(700px 200px at 110% -20%, oklch(0.488 0.243 264 / 0.25), transparent 60%), radial-gradient(500px 200px at -10% 120%, oklch(0.6 0.118 184 / 0.20), transparent 60%)',
            }}
          />
          <div className="relative flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1.5">
              <p className="text-sm text-muted-foreground">
                {t('dashboard.greeting')}{' '}
                <strong className="text-foreground">{user?.fullName || t('common.user')}</strong>
              </p>
              <p className="text-xs text-muted-foreground">{todayLabel}</p>
              <h1 className="text-2xl font-semibold tracking-tight">{t('dashboard.heroTitle')}</h1>
              <p className="max-w-xl text-sm text-muted-foreground">{t('dashboard.heroSubtitle')}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant={isAdminUser ? 'default' : 'secondary'}
                className="gap-1"
              >
                <Sparkles className="size-3" />
                {roleBadgeLabel(isAdminUser, t)}
              </Badge>
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={loading}>
                <RefreshCw className={cn('mr-2 size-4', loading && 'animate-spin')} />
                {t('common.refresh')}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>{error}</AlertTitle>
          <AlertDescription>{t('dashboard.errorHint')}</AlertDescription>
        </Alert>
      ) : null}

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          icon={FileStack}
          label={t('dashboard.statDocuments')}
          value={totalDocuments}
          accent="#4f46e5"
          loading={loading}
        />
        <StatCard
          icon={Clock}
          label={t('dashboard.statPendingWf')}
          value={pendingTasks.length}
          accent="#f59e0b"
          loading={loading}
        />
        <StorageUsage
          variant="kpi"
          usedBytes={meta.totalBytes}
          quotaBytes={DASHBOARD_STORAGE_QUOTA_BYTES}
          loading={loading || (totalDocuments > 0 && statsLoading)}
          unavailable={storageUnavailable}
        />
      </div>

      {/* Achievements + Motivation */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('dashboard.achievementsTitle')}</CardTitle>
            <CardDescription>{t('dashboard.achievementsSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <AchievementBadges
              uploads={achievementStats.uploads}
              workflowsApproved={achievementStats.workflowsApproved}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 text-primary" />
              {t('dashboard.motivationTitle')}
            </CardTitle>
            <CardDescription>{t('dashboard.motivationSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-base font-medium">{motivationMessage}</p>
            <p className="text-xs text-muted-foreground">
              {t('dashboard.motivationMeta', {
                uploads: achievementStats.uploads,
                approved: achievementStats.workflowsApproved,
              })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent documents */}
      <RecentDocuments
        documents={recentDocuments}
        loading={loading}
        error={documentsAccessible ? null : error}
      />

      {/* Calendar + Pending */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t('dashboard.calendarTitle')}</CardTitle>
            <CardDescription>{t('dashboard.calendarSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex items-center justify-between">
              <Button
                variant="outline"
                size="icon"
                onClick={() =>
                  setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
                }
              >
                <ChevronLeft className="size-4" />
              </Button>
              <strong className="min-w-[180px] text-center text-sm">
                {calendarMonth.toLocaleDateString(
                  i18n.language?.startsWith('en') ? 'en-US' : 'fr-FR',
                  { month: 'long', year: 'numeric' },
                )}
              </strong>
              <Button
                variant="outline"
                size="icon"
                onClick={() =>
                  setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
                }
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {weekdayLabels.map((d) => (
                <div key={d} className="px-1 pb-1 text-xs font-medium text-muted-foreground">
                  {d}
                </div>
              ))}
              {calendarGrid.map((day, idx) => {
                if (!day) return <div key={`empty-${idx}`} />
                const dayEvents = calendarEvents.filter(
                  (ev) =>
                    ev.date.getFullYear() === day.getFullYear() &&
                    ev.date.getMonth() === day.getMonth() &&
                    ev.date.getDate() === day.getDate(),
                )
                return (
                  <div
                    key={day.toISOString()}
                    className="min-h-16 rounded-md border bg-card p-1.5"
                  >
                    <div className="text-xs font-medium">{day.getDate()}</div>
                    <div className="mt-1 flex flex-col gap-0.5">
                      {dayEvents.slice(0, 2).map((ev) => (
                        <a
                          key={ev.key}
                          href={ev.link || '#'}
                          className="truncate text-[10px] leading-tight hover:underline"
                          style={{ color: ev.color }}
                          title={ev.title}
                        >
                          • {ev.title}
                        </a>
                      ))}
                      {dayEvents.length > 2 ? (
                        <span className="text-[10px] text-muted-foreground">
                          {t('dashboard.calendarMore', { n: dayEvents.length - 2 })}
                        </span>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <PendingTasks tasks={pendingTasks} loading={loading} />
          <Card>
            <CardHeader>
              <CardTitle
                className={cn(
                  'text-base',
                  overdueWorkflows.length > 0 && 'text-destructive',
                )}
              >
                {t('dashboard.overdueTitle')}
              </CardTitle>
              <CardDescription>
                {overdueWorkflows.length > 0
                  ? t('dashboard.overdueSome', { n: overdueWorkflows.length })
                  : t('dashboard.overdueNone')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {overdueWorkflows.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('dashboard.overdueUpToDate')}</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {overdueWorkflows.slice(0, 8).map((w: any) => (
                    <li key={w.id} className="flex flex-col gap-0.5">
                      <strong className="truncate">
                        {w.document_title || `${t('common.documentHash')}${w.document_id}`}
                      </strong>
                      <span className="text-xs text-muted-foreground">
                        {t('dashboard.overdueDue')}{' '}
                        {new Date(w.due_date).toLocaleString(
                          i18n.language?.startsWith('en') ? 'en-US' : 'fr-FR',
                        )}{' '}
                        ·{' '}
                        <Link
                          to={`/documents/${w.document_id}?tab=workflow`}
                          className="text-primary hover:underline"
                        >
                          {t('common.open')}
                        </Link>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Archivable */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('dashboard.archivableTitle')}</CardTitle>
          <CardDescription>{t('dashboard.archivableCount', { count: archivable.count })}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {archivable.documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('dashboard.archivableEmpty')}</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {archivable.documents.slice(0, 5).map((doc: any) => (
                <li key={doc.id} className="flex flex-col">
                  <strong className="truncate">{doc.title || `${t('common.documentHash')}${doc.id}`}</strong>
                  <span className="text-xs text-muted-foreground">
                    {t('common.lastModified')}{' '}
                    {new Date(doc.updated_at).toLocaleDateString(
                      i18n.language?.startsWith('en') ? 'en-US' : 'fr-FR',
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button onClick={archiveAllEligible} disabled={archivingBatch || archivable.count === 0}>
              {archivingBatch ? t('common.archiving') : t('dashboard.archiveAll')}
            </Button>
            <Button variant="outline" onClick={() => navigate('/documents?archivable=1')}>
              {t('dashboard.seeAll')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* AI Alerts */}
      {aiAlerts.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('dashboard.aiAlertsTitle')}</CardTitle>
            <CardDescription>{t('dashboard.aiAlertsSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {aiAlerts.slice(0, 8).map((a: any, i: number) => (
                <li key={`${a.type}-${i}`}>
                  <strong>{a.title}</strong> — {a.detail}
                  {a.link ? (
                    <a href={a.link} className="ml-2 text-primary hover:underline">
                      {t('common.open')}
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {/* Predictive */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('dashboard.predictiveTitle')}</CardTitle>
          <CardDescription>{t('dashboard.predictiveSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex max-w-xs items-center gap-3">
            <Label htmlFor="predictiveDays" className="whitespace-nowrap text-xs">
              {t('dashboard.predictiveDaysLabel')}
            </Label>
            <Input
              id="predictiveDays"
              type="number"
              min={1}
              max={90}
              value={predictiveDays}
              onChange={(e) => setPredictiveDays(Number(e.target.value || 15))}
              className="h-9"
            />
          </div>
          {predictiveAlerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('dashboard.predictiveEmpty')}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {predictiveAlerts.slice(0, 10).map((a: any, i: number) => (
                <li key={`pred-${i}`}>
                  <strong>{a.title}</strong> — {a.detail}
                  {a.link ? (
                    <a href={a.link} className="ml-2 inline-flex items-center gap-1 text-primary hover:underline">
                      {t('common.open')}
                      <ExternalLink className="size-3" />
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {showCharts ? (
        <DashboardInteractiveAnalytics
          documentPoints={meta.documentPoints}
          byMonth={meta.byMonth}
          mimeByKind={meta.mimeByKind}
          loading={statsLoading}
        />
      ) : null}

      {documentsAccessible && statsReady && totalDocuments > 0 ? (
        <DocumentsStatusBreakdown byStatus={meta.byStatus} totalDocuments={totalDocuments} />
      ) : null}

      <ActivityTimeline
        logs={mergedAuditLogs}
        loading={loading}
        isAdminUser={isAdminUser}
        demoLogCount={demoAuditLogs.length}
        onGenerateDemo={generateDemoActivity}
        onClearDemo={clearDemoActivity}
      />
    </div>
  )
}
