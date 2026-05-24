import { Cloud, HardDrive } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/shadcn/card'
import { Skeleton } from '@/components/shadcn/skeleton'
import { Progress } from '@/components/shadcn/progress'
import { cn } from '@/lib/utils'
import { formatBytes } from '../../utils/dashboardTime'

const DEFAULT_QUOTA_BYTES = 1 * 1024 * 1024 * 1024

interface StorageUsageProps {
  usedBytes?: number
  quotaBytes?: number
  loading?: boolean
  variant?: 'panel' | 'kpi'
  unavailable?: boolean
}

export default function StorageUsage({
  usedBytes = 0,
  quotaBytes = DEFAULT_QUOTA_BYTES,
  loading,
  variant = 'panel',
  unavailable = false,
}: StorageUsageProps) {
  const { t, i18n } = useTranslation()
  const loc = i18n.language
  const pct = quotaBytes > 0 ? Math.min(100, Math.round((usedBytes / quotaBytes) * 100)) : 0

  const tone =
    pct >= 80
      ? { fill: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400' }
      : pct >= 60
        ? { fill: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' }
        : { fill: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' }

  const message =
    pct > 80 ? t('storage.msgHigh') : pct >= 60 ? t('storage.msgMid') : t('storage.msgOk')

  if (loading) {
    return (
      <Card>
        <CardContent className="space-y-3 py-5">
          <Skeleton className="size-10 rounded-md" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (variant === 'kpi') {
    return (
      <Card>
        <CardContent className="flex flex-col gap-2.5 py-5">
          <div className="grid size-10 place-items-center rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <HardDrive className="size-5" strokeWidth={2} />
          </div>
          <p className="text-sm text-muted-foreground">{t('storage.usedLabel')}</p>
          {unavailable ? (
            <p className="text-base text-muted-foreground">{t('storage.unavailableShort')}</p>
          ) : (
            <>
              <p className="text-2xl font-semibold tabular-nums">{formatBytes(usedBytes, loc)}</p>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className={cn('h-full transition-all', tone.fill)} style={{ width: `${pct}%` }} />
              </div>
              <p className={cn('text-xs font-medium', tone.text)}>
                {pct}% ({formatBytes(usedBytes, loc)} / {formatBytes(quotaBytes, loc)})
              </p>
              <p className="text-xs text-muted-foreground">{message}</p>
            </>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold">{t('storage.panelTitle')}</h3>
            <p className="text-sm text-muted-foreground">{t('storage.panelSubtitle')}</p>
          </div>
          <Cloud className="size-6 text-muted-foreground" />
        </div>
        <Progress value={pct} className="h-2" />
        <p className={cn('text-sm font-medium', tone.text)}>
          {pct}% ({formatBytes(usedBytes, loc)} / {formatBytes(quotaBytes, loc)})
        </p>
        <p className="text-sm text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  )
}
