import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Loader2, Lock, Mail } from 'lucide-react'
import api from '../services/api/client'
import { useAuth } from '../state/AuthContext'
import { useToast } from '../state/ToastContext'
import { Button } from '@/components/shadcn/button'
import { Input } from '@/components/shadcn/input'
import { Label } from '@/components/shadcn/label'

export default function LoginPage() {
  const { t } = useTranslation()
  const { applySession } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [loading, setLoading] = useState(false)

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }))
  }

  const validate = () => {
    const next: typeof errors = {}
    if (!form.email.match(/^\S+@\S+\.\S+$/)) next.email = t('auth.emailInvalid')
    if (form.password.length < 8) next.password = t('auth.passwordMin')
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!validate()) return
    setLoading(true)
    try {
      const response = await api.post('/auth/login', form)
      const data = response?.data?.data
      if (!data) {
        toast.error(t('auth.serverInvalid'))
        return
      }
      if (data.twoFactorRequired) {
        localStorage.setItem('2fa_session_token', data.twoFactorSessionToken)
        toast.info(t('auth.twoFactorSent'))
        navigate('/verify-2fa', {
          state: { twoFactorSessionToken: data.twoFactorSessionToken, email: form.email },
        })
        return
      }
      const accessToken = data.accessToken || data.token
      if (accessToken) localStorage.setItem('accessToken', accessToken)
      if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken)
      localStorage.removeItem('token')
      applySession(data)
      toast.success(t('auth.loginSuccess'))
      navigate('/dashboard')
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('auth.loginFail'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{t('auth.loginTitle')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('auth.loginSubtitle', 'Connectez-vous pour accéder à votre espace de travail.')}
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">{t('auth.email')}</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="admin@dms.local"
              value={form.email}
              onChange={onChange}
              aria-invalid={Boolean(errors.email)}
              className="pl-9"
            />
          </div>
          {errors.email ? <p className="text-xs text-destructive">{errors.email}</p> : null}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{t('auth.password')}</Label>
            <Link to="/forgot-password" className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              {t('auth.forgot')}
            </Link>
          </div>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={form.password}
              onChange={onChange}
              aria-invalid={Boolean(errors.password)}
              className="pl-9"
            />
          </div>
          {errors.password ? <p className="text-xs text-destructive">{errors.password}</p> : null}
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              {t('auth.loginLoading')}
            </>
          ) : (
            t('auth.loginSubmit')
          )}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {t('auth.noAccount', "Pas encore de compte ?")}{' '}
        <Link to="/register" className="font-medium text-foreground underline-offset-4 hover:underline">
          {t('auth.registerLink')}
        </Link>
      </p>
    </div>
  )
}
