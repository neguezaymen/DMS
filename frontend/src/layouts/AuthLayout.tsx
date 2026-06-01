import { Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ShieldCheck, Sparkles, Workflow, FileText } from 'lucide-react'
import AppLogo from '../components/layout/AppLogo'
import PageHead from '../components/layout/PageHead'
import LanguageSwitcher from '../components/layout/LanguageSwitcher'
import { ThemeToggle } from '@/components/theme-toggle'

export default function AuthLayout() {
  const { t } = useTranslation()
  const year = new Date().getFullYear()

  return (
    <div className="grid min-h-screen w-full lg:grid-cols-2">
      <PageHead />
      {/* Colonne gauche — branding (cachée en mobile) */}
      <aside className="relative hidden overflow-hidden bg-slate-950 p-10 text-slate-50 lg:flex lg:flex-col lg:justify-between">
        {/* Mesh gradient */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              'radial-gradient(900px 600px at 110% -10%, rgb(56, 78, 184, 0.55), transparent 60%), radial-gradient(700px 500px at -20% 110%, rgb(15, 118, 110, 0.45), transparent 60%), radial-gradient(500px 400px at 60% 50%, rgb(99, 102, 241, 0.35), transparent 60%)',
          }}
        />
        <div className="relative z-10">
          <AppLogo to="/login" showSubtitle={false} inverted />
        </div>

        <div className="relative z-10 space-y-6">
          <div className="space-y-3">
            <h1 className="text-balance text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
              {t('auth.heroTitle')}
            </h1>
            <p className="max-w-md text-pretty text-sm text-slate-300">
              {t('auth.heroSubtitle')}
            </p>
          </div>

          <ul className="space-y-2.5 text-sm text-slate-300">
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 grid size-6 place-items-center rounded-md bg-white/10 ring-1 ring-white/10">
                <FileText className="size-3.5" />
              </span>
              {t('auth.feature1')}
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 grid size-6 place-items-center rounded-md bg-white/10 ring-1 ring-white/10">
                <Workflow className="size-3.5" />
              </span>
              {t('auth.feature2')}
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 grid size-6 place-items-center rounded-md bg-white/10 ring-1 ring-white/10">
                <Sparkles className="size-3.5" />
              </span>
              {t('auth.feature3')}
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 grid size-6 place-items-center rounded-md bg-white/10 ring-1 ring-white/10">
                <ShieldCheck className="size-3.5" />
              </span>
              {t('auth.feature4')}
            </li>
          </ul>
        </div>

        <div className="relative z-10 text-xs text-slate-400">
          {t('auth.footerCopyright', { year })} · {t('auth.tagline')}
        </div>
      </aside>

      {/* Colonne droite — formulaire */}
      <main className="relative flex min-h-screen flex-col bg-background">
        <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-full border bg-card/80 px-1 py-1 shadow-sm backdrop-blur">
          <LanguageSwitcher compact />
          <ThemeToggle />
        </div>

        {/* Brand mobile */}
        <div className="px-6 pb-2 pt-6 lg:hidden">
          <AppLogo to="/login" showSubtitle={false} size="sm" />
        </div>

        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6 md:px-10">
          <div className="w-full max-w-md">
            <Outlet />
          </div>
        </div>

        <footer className="px-6 pb-4 text-center text-xs text-muted-foreground lg:hidden">
          {t('auth.footerCopyright', { year })}
        </footer>
      </main>
    </div>
  )
}
