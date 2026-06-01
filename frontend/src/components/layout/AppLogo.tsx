import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

type AppLogoProps = {
  to?: string
  showSubtitle?: boolean
  size?: 'sm' | 'md'
  className?: string
  inverted?: boolean
}

export default function AppLogo({
  to = '/dashboard',
  showSubtitle = true,
  size = 'md',
  className,
  inverted = false,
}: AppLogoProps) {
  const { t } = useTranslation()
  const iconSize = size === 'sm' ? 'size-8' : 'size-9'
  const imgSize = size === 'sm' ? 32 : 36

  const content = (
    <>
      <img
        src="/logo.svg"
        alt=""
        width={imgSize}
        height={imgSize}
        className={cn('shrink-0 rounded-md', iconSize)}
        aria-hidden
      />
      <div
        className={cn(
          'flex flex-col gap-0.5 leading-none',
          !showSubtitle && 'justify-center',
          size === 'sm' && 'group-data-[collapsible=icon]:hidden',
        )}
      >
        <span
          className={cn(
            'font-semibold tracking-tight',
            size === 'sm' ? 'text-sm' : 'text-base',
            inverted ? 'text-white' : 'text-foreground',
          )}
        >
          {t('site.name')}
        </span>
        {showSubtitle ? (
          <span
            className={cn(
              'text-[11px]',
              inverted ? 'text-slate-300' : 'text-muted-foreground',
            )}
          >
            {t('layout.brandSubtitle')}
          </span>
        ) : null}
      </div>
    </>
  )

  const classes = cn('flex items-center gap-2', className)

  if (to) {
    return (
      <Link to={to} className={classes} aria-label={t('site.name')}>
        {content}
      </Link>
    )
  }

  return <div className={classes}>{content}</div>
}
