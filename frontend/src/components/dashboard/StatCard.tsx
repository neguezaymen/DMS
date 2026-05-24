import type { LucideIcon } from 'lucide-react'
import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react'
import { Card, CardContent } from '@/components/shadcn/card'
import { Skeleton } from '@/components/shadcn/skeleton'
import { cn } from '@/lib/utils'

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: React.ReactNode
  trend?: number | null
  trendSuffix?: string
  accent?: string
  loading?: boolean
}

export default function StatCard({
  icon: Icon,
  label,
  value,
  trend,
  trendSuffix = '',
  accent = '#4f46e5',
  loading = false,
}: StatCardProps) {
  if (loading) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3 py-5">
          <Skeleton className="h-10 w-10 rounded-md" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-16" />
        </CardContent>
      </Card>
    )
  }

  const trendUp = trend != null && trend > 0
  const trendDown = trend != null && trend < 0
  const showTrend = trend != null && Number.isFinite(trend)

  const iconBg = accent + '1a'

  return (
    <Card>
      <CardContent className="flex flex-col gap-2.5 py-5">
        <div
          className="grid size-10 place-items-center rounded-md"
          style={{ background: iconBg, color: accent }}
        >
          <Icon className="size-5" strokeWidth={2} />
        </div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {showTrend ? (
          <p
            className={cn(
              'flex items-center gap-1 text-xs font-medium',
              trendUp && 'text-emerald-600 dark:text-emerald-400',
              trendDown && 'text-destructive',
              !trendUp && !trendDown && 'text-muted-foreground',
            )}
          >
            {trendUp ? <ArrowUp className="size-3" /> : trendDown ? <ArrowDown className="size-3" /> : <ArrowRight className="size-3" />}
            {Math.abs(trend!)}%{trendSuffix}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
