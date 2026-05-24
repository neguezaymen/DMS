import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Loader2, ShieldCheck } from 'lucide-react'
import { useAuth } from '../state/AuthContext'
import { useToast } from '../state/ToastContext'
import { Button } from '@/components/shadcn/button'
import { Input } from '@/components/shadcn/input'
import { Label } from '@/components/shadcn/label'

export default function Verify2FAPage() {
  const { t } = useTranslation()
  const { verify2fa } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [loading, setLoading] = useState(false)
  const [code, setCode] = useState('')
  const sessionToken =
    (location.state as any)?.twoFactorSessionToken ||
    localStorage.getItem('2fa_session_token') ||
    ''
  const email = (location.state as any)?.email || ''

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!sessionToken) {
      localStorage.removeItem('2fa_session_token')
      toast.error(t('auth.session2faExpired'))
      navigate('/login')
      return
    }
    if (!code.match(/^\d{6}$/)) {
      toast.error(t('auth.code6'))
      return
    }
    setLoading(true)
    try {
      const payload = await verify2fa({ twoFactorSessionToken: sessionToken, code })
      const accessToken = payload?.accessToken || payload?.token
      if (accessToken) localStorage.setItem('accessToken', accessToken)
      if (payload?.refreshToken) localStorage.setItem('refreshToken', payload.refreshToken)
      localStorage.removeItem('token')
      localStorage.removeItem('2fa_session_token')
      toast.success(t('auth.verifySuccess'))
      navigate('/dashboard')
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('auth.verifyFail'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center text-center space-y-3">
        <div className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
          <ShieldCheck className="size-6" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t('auth.verify2faTitle')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('auth.verify2faSubtitle')}
            {email ? (
              <>
                {' '}
                <span className="font-medium text-foreground">{email}</span>
              </>
            ) : null}
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="code">{t('auth.verifyCode')}</Label>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123 456"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            className="text-center text-lg font-mono tracking-[0.4em]"
          />
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              {t('auth.verifyLoading')}
            </>
          ) : (
            t('auth.verifySubmit')
          )}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        <Link to="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
          {t('auth.backLogin')}
        </Link>
      </p>
    </div>
  )
}
