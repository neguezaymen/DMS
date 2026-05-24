import { Award } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

const TIER_STYLES: Record<string, { ring: string; text: string; bg: string }> = {
  bronze: {
    ring: 'ring-amber-700/40',
    text: 'text-amber-700 dark:text-amber-400',
    bg: 'bg-amber-100/60 dark:bg-amber-950/30',
  },
  silver: {
    ring: 'ring-slate-400/40',
    text: 'text-slate-600 dark:text-slate-300',
    bg: 'bg-slate-100/80 dark:bg-slate-800/60',
  },
  gold: {
    ring: 'ring-yellow-500/40',
    text: 'text-yellow-700 dark:text-yellow-400',
    bg: 'bg-yellow-100/70 dark:bg-yellow-950/30',
  },
  validator: {
    ring: 'ring-emerald-500/40',
    text: 'text-emerald-700 dark:text-emerald-400',
    bg: 'bg-emerald-100/70 dark:bg-emerald-950/30',
  },
}

function Badge({ earned, label, tier }: { earned: boolean; label: string; tier: keyof typeof TIER_STYLES }) {
  const tone = TIER_STYLES[tier]
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border px-3 py-2 transition-opacity',
        tone.bg,
        earned ? `${tone.ring} opacity-100 ring-2` : 'opacity-50',
      )}
    >
      <Award className={cn('size-5', tone.text)} />
      <span className="text-sm font-medium">{label}</span>
    </div>
  )
}

export default function AchievementBadges({
  uploads = 0,
  workflowsApproved = 0,
}: {
  uploads?: number
  workflowsApproved?: number
}) {
  const { t } = useTranslation()
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      <Badge tier="bronze" earned={uploads >= 10} label={t('achievements.bronze')} />
      <Badge tier="silver" earned={uploads >= 50} label={t('achievements.silver')} />
      <Badge tier="gold" earned={uploads >= 100} label={t('achievements.gold')} />
      <Badge tier="validator" earned={workflowsApproved >= 10} label={t('achievements.validator')} />
    </div>
  )
}
