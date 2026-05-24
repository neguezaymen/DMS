import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/shadcn/card'
import { statusLabel } from '../../utils/documentUi'

const BAR_TONE: Record<string, string> = {
  draft: 'bg-slate-400',
  brouillon: 'bg-slate-400',
  in_review: 'bg-amber-500',
  pending: 'bg-amber-500',
  active: 'bg-blue-500',
  actif: 'bg-blue-500',
  approved: 'bg-emerald-500',
  approuvé: 'bg-emerald-500',
  archived: 'bg-slate-500',
  archivé: 'bg-slate-500',
  rejected: 'bg-rose-500',
  rejeté: 'bg-rose-500',
}

function normalizeKey(s: string) {
  return String(s ?? '').trim().toLowerCase().replace(/\s+/g, '_')
}

interface Props {
  byStatus?: Record<string, number>
  totalDocuments?: number
}

export default function DocumentsStatusBreakdown({ byStatus = {}, totalDocuments = 0 }: Props) {
  const { t } = useTranslation()
  if (!totalDocuments || !byStatus || typeof byStatus !== 'object') return null

  const entries = Object.entries(byStatus)
    .map(([key, count]) => ({
      rawKey: key,
      count: Number(count) || 0,
      label: statusLabel(key === '(vide)' ? '' : key, t),
    }))
    .filter((e) => e.count > 0)

  if (entries.length === 0) return null

  const sum = entries.reduce((s, e) => s + e.count, 0)
  const denom = sum > 0 ? sum : totalDocuments

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('documentsStatus.title')}</CardTitle>
        <CardDescription>{t('documentsStatus.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {entries.map((e) => {
            const pct = Math.round((e.count / denom) * 100)
            const tone = BAR_TONE[normalizeKey(e.rawKey)] || 'bg-muted-foreground'
            return (
              <li key={e.rawKey || '__empty'} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{e.label}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {e.count} ({pct}%)
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className={`h-full rounded-full transition-all ${tone}`} style={{ width: `${pct}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
