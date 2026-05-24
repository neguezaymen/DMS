import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/shadcn/card'
import { Skeleton } from '@/components/shadcn/skeleton'

const CHART_TICK = { fontSize: 11, fill: 'currentColor', opacity: 0.6 }
const CHART_GRID = 'currentColor'
const MIME_ORDER = ['Images', 'PDF', 'Office', 'Autres'] as const
const MIME_COLORS: Record<string, string> = {
  Images: 'var(--color-chart-2)',
  PDF: 'var(--color-chart-1)',
  Office: 'var(--color-chart-4)',
  Autres: 'var(--color-chart-3)',
}

function lastSixMonthKeys() {
  const keys: string[] = []
  const d = new Date()
  for (let i = 5; i >= 0; i -= 1) {
    const dt = new Date(d.getFullYear(), d.getMonth() - i, 1)
    keys.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`)
  }
  return keys
}

interface Props {
  byMonth?: Record<string, number>
  mimeByKind?: Record<string, number>
  loading?: boolean
}

export default function DashboardAnalytics({ byMonth = {}, mimeByKind = {}, loading }: Props) {
  const { t } = useTranslation()

  const keyToLabel = useMemo(() => {
    return (key: string) => {
      const [, m] = key.split('-')
      const monthNames = t('common.monthNames', { returnObjects: true }) as unknown
      const y = key.split('-')[0]
      if (Array.isArray(monthNames) && monthNames[Number(m) - 1]) {
        return `${monthNames[Number(m) - 1]} ${y}`
      }
      return key
    }
  }, [t])

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="py-5">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="mt-3 h-[220px] w-full rounded-md" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const monthKeys = lastSixMonthKeys()
  const uploadsData = monthKeys.map((k) => ({
    name: keyToLabel(k),
    uploads: Number(byMonth[k]) || 0,
  }))
  const uploadsTotal = uploadsData.reduce((s, r) => s + r.uploads, 0)

  const mimeData = MIME_ORDER.map((name) => ({
    name: t(`mimeCategory.${name}`),
    rawName: name,
    value: Number(mimeByKind[name]) || 0,
  })).filter((row) => row.value > 0)

  const mimeTotal = mimeData.reduce((s, r) => s + r.value, 0)
  const showBar = uploadsTotal > 0
  const showPie = mimeTotal > 0

  if (!showBar && !showPie) return null

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {showBar ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('analytics.uploads6mTitle')}</CardTitle>
            <CardDescription>{t('analytics.uploads6mSub')}</CardDescription>
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
                  fill="var(--color-chart-1)"
                  radius={[6, 6, 0, 0]}
                  name={t('analytics.uploadsBarName')}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ) : null}
      {showPie ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('analytics.mimeTitle')}</CardTitle>
            <CardDescription>{t('analytics.mimeSub')}</CardDescription>
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
                >
                  {mimeData.map((entry) => (
                    <Cell key={entry.rawName} fill={MIME_COLORS[entry.rawName] || 'var(--color-chart-3)'} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 12 }} formatter={(v: any, _n: any, p: any) => [v, p.payload.name]} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
