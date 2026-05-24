import { useCallback, useMemo, useRef, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { endOfMonth, format, isWithinInterval, parseISO, startOfMonth, subMonths } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'
import { useTranslation } from 'react-i18next'
import { toPng } from 'html-to-image'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/shadcn/card'
import { Skeleton } from '@/components/shadcn/skeleton'
import { Button } from '@/components/shadcn/button'
import { Slider } from '@/components/shadcn/slider'
import { Badge } from '@/components/shadcn/badge'

const CHART_TICK = { fontSize: 11, fill: 'currentColor', opacity: 0.6 }
const CHART_GRID = 'currentColor'
const BAR_FILL = 'var(--color-chart-1)'
const BAR_ACTIVE = 'var(--color-primary)'

const MIME_ORDER = ['Images', 'PDF', 'Office', 'Autres'] as const
const MIME_COLORS: Record<string, string> = {
  Images: 'var(--color-chart-2)',
  PDF: 'var(--color-chart-1)',
  Office: 'var(--color-chart-4)',
  Autres: 'var(--color-chart-3)',
}

function parsePointDate(createdAt: any) {
  if (!createdAt) return null
  const raw = typeof createdAt === 'string' ? createdAt.replace(' ', 'T') : createdAt
  const d = parseISO(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

function lastTwelveMonthKeys() {
  const keys: string[] = []
  const d = new Date()
  for (let i = 11; i >= 0; i -= 1) {
    const dt = subMonths(new Date(d.getFullYear(), d.getMonth(), 1), i)
    keys.push(format(dt, 'yyyy-MM'))
  }
  return keys
}

interface Props {
  documentPoints?: Array<{ createdAt: string; month: string; mimeCategory: string }>
  byMonth?: Record<string, number>
  mimeByKind?: Record<string, number>
  loading?: boolean
}

export default function DashboardInteractiveAnalytics({
  documentPoints = [],
  byMonth = {},
  mimeByKind = {},
  loading,
}: Props) {
  const { t, i18n } = useTranslation()
  const exportRef = useRef<HTMLDivElement>(null)
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [selectedMime, setSelectedMime] = useState<string | null>(null)
  const [rangeIndex, setRangeIndex] = useState<[number, number]>([0, 11])
  const [exporting, setExporting] = useState(false)

  const monthKeys = useMemo(() => lastTwelveMonthKeys(), [])
  const rangeStart = monthKeys[rangeIndex[0]] || monthKeys[0]
  const rangeEnd = monthKeys[rangeIndex[1]] || monthKeys[monthKeys.length - 1]

  const filteredPoints = useMemo(() => {
    const start = startOfMonth(parseISO(`${rangeStart}-01`))
    const end = endOfMonth(parseISO(`${rangeEnd}-01`))
    return (documentPoints || []).filter((p) => {
      const d = parsePointDate(p.createdAt)
      if (!d) return false
      if (!isWithinInterval(d, { start, end })) return false
      if (selectedMonth && p.month !== selectedMonth) return false
      if (selectedMime && p.mimeCategory !== selectedMime) return false
      return true
    })
  }, [documentPoints, rangeStart, rangeEnd, selectedMonth, selectedMime])

  const keyToLabel = useCallback(
    (key: string) => {
      const [, m] = key.split('-')
      const monthNames = t('common.monthNames', { returnObjects: true }) as unknown
      const y = key.split('-')[0]
      if (Array.isArray(monthNames) && monthNames[Number(m) - 1]) {
        return `${monthNames[Number(m) - 1]} ${y}`
      }
      return format(parseISO(`${key}-01`), 'MMM yyyy', {
        locale: i18n.language?.startsWith('en') ? enUS : fr,
      })
    },
    [t, i18n.language],
  )

  const uploadsData = useMemo(() => {
    const counts: Record<string, number> = Object.fromEntries(monthKeys.map((k) => [k, 0]))
    if (documentPoints?.length) {
      for (const p of filteredPoints) {
        if (p.month && counts[p.month] !== undefined) counts[p.month] += 1
      }
    } else {
      for (const k of monthKeys) counts[k] = Number(byMonth[k]) || 0
    }
    return monthKeys
      .filter((k) => k >= rangeStart && k <= rangeEnd)
      .map((k) => ({
        key: k,
        name: keyToLabel(k),
        uploads: counts[k] || 0,
      }))
  }, [filteredPoints, monthKeys, rangeStart, rangeEnd, byMonth, documentPoints, keyToLabel])

  const mimeData = useMemo(() => {
    const counts: Record<string, number> = { Images: 0, PDF: 0, Office: 0, Autres: 0 }
    if (documentPoints?.length) {
      for (const p of filteredPoints) {
        const k = p.mimeCategory || 'Autres'
        if (counts[k] !== undefined) counts[k] += 1
        else counts.Autres += 1
      }
    } else {
      for (const name of MIME_ORDER) counts[name] = Number(mimeByKind[name]) || 0
    }
    return MIME_ORDER.map((name) => ({
      name: t(`mimeCategory.${name}`),
      rawName: name,
      value: counts[name] || 0,
    })).filter((row) => row.value > 0)
  }, [filteredPoints, mimeByKind, documentPoints, t])

  const uploadsTotal = uploadsData.reduce((s, r) => s + r.uploads, 0)
  const mimeTotal = mimeData.reduce((s, r) => s + r.value, 0)

  const clearFilters = () => {
    setSelectedMonth(null)
    setSelectedMime(null)
  }

  const exportPng = async () => {
    if (!exportRef.current) return
    setExporting(true)
    try {
      const dataUrl = await toPng(exportRef.current, { cacheBust: true, pixelRatio: 2 })
      const link = document.createElement('a')
      link.download = `dms-dashboard-${format(new Date(), 'yyyy-MM-dd')}.png`
      link.href = dataUrl
      link.click()
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="py-5">
              <Skeleton className="h-[260px] w-full rounded-md" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (uploadsTotal === 0 && mimeTotal === 0) return null

  return (
    <section className="space-y-4">
      <Card>
        <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {(selectedMonth || selectedMime) ? (
              <Badge variant="secondary">
                {t('dashboard.activeFilters', {
                  month: selectedMonth || '—',
                  mime: selectedMime || '—',
                  count: filteredPoints.length,
                })}
              </Badge>
            ) : null}
            <Button variant="outline" size="sm" onClick={clearFilters}>
              {t('dashboard.clearChartFilters')}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={exportPng} disabled={exporting}>
              {exporting ? t('common.loading') : t('dashboard.exportPng')}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              {t('dashboard.exportPdf')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 py-5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{t('dashboard.timeSliderLabel')}</span>
            <span className="text-muted-foreground">
              {keyToLabel(rangeStart)} — {keyToLabel(rangeEnd)}
            </span>
          </div>
          <Slider
            min={0}
            max={11}
            step={1}
            value={rangeIndex}
            onValueChange={(v) => setRangeIndex([v[0] ?? 0, v[1] ?? 11])}
          />
        </CardContent>
      </Card>

      <div ref={exportRef} className="grid gap-4 md:grid-cols-2">
        {uploadsTotal > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('analytics.uploads6mTitle')}</CardTitle>
              <CardDescription>{t('dashboard.crossFilterBarHint')}</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={uploadsData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} strokeOpacity={0.15} vertical={false} />
                  <XAxis dataKey="name" tick={CHART_TICK} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={CHART_TICK} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 12 }} />
                  <Bar
                    dataKey="uploads"
                    name={t('analytics.uploadsBarName')}
                    radius={[6, 6, 0, 0]}
                    cursor="pointer"
                    onClick={(_bar: any, index: number) => {
                      const entry = uploadsData[index]
                      if (entry?.key) {
                        setSelectedMonth((prev) => (prev === entry.key ? null : entry.key))
                      }
                    }}
                  >
                    {uploadsData.map((entry) => (
                      <Cell
                        key={entry.key}
                        fill={selectedMonth === entry.key ? BAR_ACTIVE : BAR_FILL}
                        opacity={selectedMonth && selectedMonth !== entry.key ? 0.45 : 1}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ) : null}

        {mimeTotal > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('analytics.mimeTitle')}</CardTitle>
              <CardDescription>{t('dashboard.crossFilterPieHint')}</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={mimeData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={88}
                    paddingAngle={2}
                    onClick={(_: any, index: number) => {
                      const row = mimeData[index]
                      if (row?.rawName) {
                        setSelectedMime((prev) => (prev === row.rawName ? null : row.rawName))
                      }
                    }}
                  >
                    {mimeData.map((entry) => (
                      <Cell
                        key={entry.rawName}
                        fill={MIME_COLORS[entry.rawName] || 'var(--color-chart-3)'}
                        opacity={selectedMime && selectedMime !== entry.rawName ? 0.35 : 1}
                        stroke={selectedMime === entry.rawName ? 'var(--color-primary)' : 'transparent'}
                        strokeWidth={selectedMime === entry.rawName ? 2 : 0}
                        style={{ cursor: 'pointer' }}
                      />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </section>
  )
}
