import { useTranslation } from 'react-i18next'
import { Languages } from 'lucide-react'
import { normalizeAppLanguage } from '../../i18n'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/shadcn/dropdown-menu'
import { Button } from '@/components/shadcn/button'

export default function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { i18n, t } = useTranslation()
  const lng = normalizeAppLanguage(i18n.resolvedLanguage || i18n.language || 'fr')

  const set = (code: string) => {
    const next = normalizeAppLanguage(code)
    if (next !== normalizeAppLanguage(i18n.language)) void i18n.changeLanguage(next)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size={compact ? 'icon' : 'sm'} aria-label={t('layout.language')}>
          {compact ? (
            <Languages className="h-[1.1rem] w-[1.1rem]" />
          ) : (
            <>
              <Languages className="mr-2 h-4 w-4" />
              <span className="text-xs uppercase">{lng}</span>
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[8rem]">
        <DropdownMenuItem onClick={() => set('fr')} className={lng === 'fr' ? 'font-medium' : ''}>
          {t('layout.langFr')}
          <span className="ml-auto text-xs text-muted-foreground">{t('layout.langCodeFr')}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => set('en')} className={lng === 'en' ? 'font-medium' : ''}>
          {t('layout.langEn')}
          <span className="ml-auto text-xs text-muted-foreground">{t('layout.langCodeEn')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
