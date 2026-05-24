import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import api from '../services/api/client'
import { useToast } from '../state/ToastContext'
import { Button } from '@/components/shadcn/button'
import { Input } from '@/components/shadcn/input'
import { Label } from '@/components/shadcn/label'

export default function RegisterPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }))
  }

  const validate = () => {
    const next: Record<string, string> = {}
    if (form.fullName.trim().length < 2) next.fullName = t('auth.nameMin')
    if (!form.email.match(/^\S+@\S+\.\S+$/)) next.email = t('auth.emailInvalid')
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
      await api.post('/auth/register', form)
      toast.success(t('auth.registerSuccess'))
      navigate('/login')
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('auth.registerFail'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{t('auth.registerTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('auth.registerSubtitle')}</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="fullName">{t('auth.fullName')}</Label>
          <Input
            id="fullName"
            name="fullName"
            placeholder="Marion Dupont"
            value={form.fullName}
            onChange={onChange}
            aria-invalid={Boolean(errors.fullName)}
          />
          {errors.fullName ? <p className="text-xs text-destructive">{errors.fullName}</p> : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">{t('auth.email')}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="vous@entreprise.com"
            value={form.email}
            onChange={onChange}
            aria-invalid={Boolean(errors.email)}
          />
          {errors.email ? <p className="text-xs text-destructive">{errors.email}</p> : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="password">{t('auth.password')}</Label>
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
              {t('auth.registerLoading')}
            </>
          ) : (
            t('auth.registerSubmit')
          )}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        <Link to="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
          {t('auth.haveAccount')}
        </Link>
      </p>
    </div>
  )
}
