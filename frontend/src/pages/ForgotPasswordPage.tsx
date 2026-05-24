import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Loader2, Mail } from 'lucide-react'
import api from '../services/api/client'
import { useToast } from '../state/ToastContext'
import { Button } from '@/components/shadcn/button'
import { Input } from '@/components/shadcn/input'
import { Label } from '@/components/shadcn/label'
import { Alert, AlertDescription } from '@/components/shadcn/alert'

export default function ForgotPasswordPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!email.match(/^\S+@\S+\.\S+$/)) {
      setError(t('auth.emailInvalid'))
      return
    }
    setError('')
    setLoading(true)
    try {
      await api.post('/auth/forgot-password', { email })
      const message = t('auth.forgotSuccess')
      setSuccessMessage(message)
      toast.success(message)
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('auth.forgotFail'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{t('auth.forgotTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('auth.forgotSubtitle')}</p>
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
              placeholder="vous@entreprise.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={Boolean(error)}
              className="pl-9"
            />
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              {t('auth.forgotLoading')}
            </>
          ) : (
            t('auth.forgotSubmit')
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
