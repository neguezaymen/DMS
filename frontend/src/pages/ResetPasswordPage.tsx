import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Loader2 } from 'lucide-react'
import api from '../services/api/client'
import { useToast } from '../state/ToastContext'
import { Button } from '@/components/shadcn/button'
import { Input } from '@/components/shadcn/input'
import { Label } from '@/components/shadcn/label'
import { Alert, AlertDescription } from '@/components/shadcn/alert'

export default function ResetPasswordPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const [params] = useSearchParams()
  const [loading, setLoading] = useState(false)
  const tokenFromUrl = params.get('token') || ''
  const emailFromUrl = params.get('email') || ''

  const [form, setForm] = useState({
    email: emailFromUrl,
    token: tokenFromUrl,
    password: '',
    confirmPassword: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [successMessage, setSuccessMessage] = useState('')

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }))
  }

  const readOnlyToken = useMemo(() => tokenFromUrl.length > 0, [tokenFromUrl])

  const validate = () => {
    const next: Record<string, string> = {}
    if (!form.email.match(/^\S+@\S+\.\S+$/)) next.email = t('auth.emailInvalid')
    if (form.token.trim().length < 20) next.token = t('auth.tokenInvalid')
    if (form.password.length < 8) next.password = t('auth.passwordMin')
    if (form.password !== form.confirmPassword) next.confirmPassword = t('auth.passwordMismatch')
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!validate()) return
    setLoading(true)
    try {
      await api.post('/auth/reset-password', form)
      const message = t('auth.resetSuccess')
      setSuccessMessage(message)
      toast.success(message)
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('auth.resetFail'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{t('auth.resetTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('auth.resetSubtitle')}</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">{t('auth.email')}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="vous@entreprise.com"
            value={form.email}
            onChange={onChange}
            aria-invalid={Boolean(errors.email)}
          />
          {errors.email ? <p className="text-xs text-destructive">{errors.email}</p> : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="token">{t('auth.tokenLabel')}</Label>
          <Input
            id="token"
            name="token"
            placeholder={t('auth.tokenPlaceholder')}
            value={form.token}
            onChange={onChange}
            aria-invalid={Boolean(errors.token)}
            readOnly={readOnlyToken}
            className={readOnlyToken ? 'font-mono text-xs' : ''}
          />
          {errors.token ? <p className="text-xs text-destructive">{errors.token}</p> : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="password">{t('auth.newPassword')}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={form.password}
              onChange={onChange}
              aria-invalid={Boolean(errors.password)}
            />
            {errors.password ? <p className="text-xs text-destructive">{errors.password}</p> : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">{t('auth.confirmPassword')}</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={form.confirmPassword}
              onChange={onChange}
              aria-invalid={Boolean(errors.confirmPassword)}
            />
            {errors.confirmPassword ? <p className="text-xs text-destructive">{errors.confirmPassword}</p> : null}
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              {t('auth.resetLoading')}
            </>
          ) : (
            t('auth.resetSubmit')
          )}
        </Button>

        {successMessage ? (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        ) : null}
      </form>

      <p className="text-center text-sm text-muted-foreground">
        <Link to="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
          {t('auth.backLogin')}
        </Link>
      </p>
    </div>
  )
}
