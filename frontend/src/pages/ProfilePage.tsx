import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Camera, Loader2, X } from 'lucide-react'
import api from '../services/api/client'
import { useToast } from '../state/ToastContext'
import { useAuth } from '../state/AuthContext'
import i18n, { LANG_STORAGE_KEY, normalizeAppLanguage } from '../i18n'
import { useTheme } from '@/components/theme-provider'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/shadcn/card'
import { Button } from '@/components/shadcn/button'
import { Input } from '@/components/shadcn/input'
import { Label } from '@/components/shadcn/label'
import { Switch } from '@/components/shadcn/switch'
import { Separator } from '@/components/shadcn/separator'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/shadcn/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/shadcn/select'

const PREF_TYPES = ['share', 'workflow', 'expiry', 'upload', 'system', 'document_approval']

function initialsFromName(name: string) {
  const p = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (p.length === 0) return '?'
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase()
  return `${p[0][0] || ''}${p[p.length - 1][0] || ''}`.toUpperCase()
}

function allChannelsEnabled(prefMap: Record<string, any>, channel: 'email' | 'in_app') {
  return PREF_TYPES.every((type) => {
    const row = prefMap[type]
    if (channel === 'email') return row?.email_enabled !== false
    return row?.in_app_enabled !== false
  })
}

export default function ProfilePage() {
  const { t } = useTranslation()
  const toast = useToast()
  const { refreshProfile, user: authUser } = useAuth()
  const { setTheme, theme } = useTheme()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [roleLabels, setRoleLabels] = useState('')
  const [departmentLabels, setDepartmentLabels] = useState('')
  const [departmentIds, setDepartmentIds] = useState<number[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [canEditDepartment, setCanEditDepartment] = useState(false)

  const [locale, setLocale] = useState('fr')
  const [notifEmail, setNotifEmail] = useState(true)
  const [notifInApp, setNotifInApp] = useState(true)

  const [stats, setStats] = useState({ documents_uploaded: 0, workflows_approved: 0 })
  const [lastLoginAt, setLastLoginAt] = useState<Date | null>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)

  const [loading, setLoading] = useState(true)
  const [saveBusy, setSaveBusy] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const avatarObjectUrlRef = useRef<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const me = await api.get('/users/me')
      const u = me.data.data
      const fallbackStats = u.stats || { documents_uploaded: 0, workflows_approved: 0 }
      const userDepartments = Array.isArray(u.departments) ? u.departments : []
      const userRoles = Array.isArray(u.roles) ? u.roles : []
      const isAdminProfile = userRoles.some((role: any) => String(role).trim().toLowerCase() === 'admin')

      setFullName(u.full_name || '')
      setEmail(u.email || '')
      setRoleLabels(userRoles.join(', ') || t('common.emDash'))
      setDepartmentLabels(
        userDepartments.map((d: any) => d.name).filter(Boolean).join(', ') || t('common.emDash'),
      )
      setDepartmentIds(userDepartments.map((d: any) => Number(d.id)).filter(Boolean))
      setCanEditDepartment(isAdminProfile)
      const lng = normalizeAppLanguage(u.locale)
      setLocale(lng)
      void i18n.changeLanguage(lng)

      const prefRes = await api.get('/notifications/preferences').catch(() => ({ data: { data: {} } }))
      const prefMap = prefRes.data.data || {}
      setNotifEmail(allChannelsEnabled(prefMap, 'email'))
      setNotifInApp(allChannelsEnabled(prefMap, 'in_app'))

      if (isAdminProfile) {
        const depts = await api.get('/departments').catch(() => ({ data: { data: [] } }))
        setDepartments(Array.isArray(depts.data?.data) ? depts.data.data : [])
      } else {
        setDepartments([])
      }

      const [docsRes, workflowsRes] = await Promise.allSettled([
        api.get(`/documents?ownerId=${u.id}&limit=1`),
        api.get('/workflows/instances?status=approved'),
      ])
      const documentTotal =
        docsRes.status === 'fulfilled'
          ? Number((docsRes.value as any).data?.pagination?.total ?? (docsRes.value as any).headers?.['x-total-count'])
          : Number.NaN
      const approvedTotal =
        workflowsRes.status === 'fulfilled' && Array.isArray((workflowsRes.value as any).data?.data)
          ? (workflowsRes.value as any).data.data.length
          : Number.NaN
      setStats({
        documents_uploaded: Number.isFinite(documentTotal)
          ? documentTotal
          : Number(fallbackStats.documents_uploaded) || 0,
        workflows_approved: Number.isFinite(approvedTotal)
          ? approvedTotal
          : Number(fallbackStats.workflows_approved) || 0,
      })
      setLastLoginAt(u.last_login_at ? new Date(u.last_login_at) : null)
      setAvatarUrl(u.avatar_url || null)

      document.documentElement.lang = lng
    } catch (e: any) {
      setFullName(authUser?.fullName || '')
      setEmail(authUser?.email || '')
      setRoleLabels(
        Array.isArray(authUser?.roles)
          ? authUser.roles.join(', ') || t('common.emDash')
          : t('common.emDash'),
      )
      setDepartmentLabels(t('common.emDash'))
      setCanEditDepartment(false)
      toast.error(e.response?.data?.message || t('profile.loadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    return () => {
      if (avatarObjectUrlRef.current) URL.revokeObjectURL(avatarObjectUrlRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaveBusy(true)
    try {
      await api.put('/users/profile', {
        fullName,
        departmentIds: canEditDepartment ? departmentIds : undefined,
        locale: normalizeAppLanguage(locale),
        notificationsEmailEnabled: notifEmail,
        notificationsInAppEnabled: notifInApp,
      })
      document.documentElement.lang = normalizeAppLanguage(locale)
      try {
        localStorage.setItem(LANG_STORAGE_KEY, normalizeAppLanguage(locale))
      } catch {
        /* ignore */
      }
      await i18n.changeLanguage(normalizeAppLanguage(locale))
      await refreshProfile?.()
      toast.success(t('profile.saved'))
      await load()
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('profile.saveFail'))
    } finally {
      setSaveBusy(false)
    }
  }

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordBusy(true)
    try {
      await api.put('/users/change-password', { currentPassword, newPassword, confirmPassword })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast.success(t('profile.passwordOk'))
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('profile.passwordFail'))
    } finally {
      setPasswordBusy(false)
    }
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const allowedTypes = ['image/jpeg', 'image/png']
    if (!allowedTypes.includes(file.type)) {
      toast.error(t('profile.avatarFormat'))
      e.target.value = ''
      return
    }
    if (file.size > 1024 * 1024) {
      toast.error(t('profile.avatarSize'))
      e.target.value = ''
      return
    }
    if (avatarObjectUrlRef.current) URL.revokeObjectURL(avatarObjectUrlRef.current)
    const previewUrl = URL.createObjectURL(file)
    avatarObjectUrlRef.current = previewUrl
    setAvatarUrl(previewUrl)
    setAvatarBusy(true)
    try {
      const fd = new FormData()
      fd.append('avatar', file)
      const response = await api.post('/users/avatar', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setAvatarUrl(response.data?.data?.avatar_url || null)
      toast.success(t('profile.avatarOk'))
      await refreshProfile?.()
    } catch (err: any) {
      await load()
      toast.error(err.response?.data?.message || t('profile.avatarUploadFail'))
    } finally {
      setAvatarBusy(false)
      if (avatarObjectUrlRef.current) {
        URL.revokeObjectURL(avatarObjectUrlRef.current)
        avatarObjectUrlRef.current = null
      }
      e.target.value = ''
    }
  }

  const handleRemoveAvatar = async () => {
    if (!avatarUrl) return
    setAvatarBusy(true)
    try {
      await api.delete('/users/avatar')
      setAvatarUrl(null)
      toast.success(t('profile.avatarRemoved'))
      await refreshProfile?.()
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('profile.avatarRemoveFail'))
    } finally {
      setAvatarBusy(false)
    }
  }

  const formatLastLogin = () => {
    if (!lastLoginAt || Number.isNaN(lastLoginAt.getTime())) return t('common.emDash')
    return lastLoginAt.toLocaleString(locale === 'en' ? 'en' : 'fr-FR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('profile.title')}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t('profile.loading')}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">{t('profile.personalCardTitle')}</CardTitle>
          <CardDescription>{t('profile.personalCardSub')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <div className="relative">
              <Avatar className="size-20">
                {avatarUrl ? <AvatarImage src={avatarUrl} alt={t('profile.avatarAlt')} /> : null}
                <AvatarFallback className="text-lg font-medium">
                  {initialsFromName(fullName)}
                </AvatarFallback>
              </Avatar>
              <label
                className="absolute -bottom-1 -right-1 grid size-7 cursor-pointer place-items-center rounded-full border bg-background text-foreground shadow-sm hover:bg-accent"
                title={t('profile.changePhotoTitle')}
              >
                <Camera className="size-3.5" />
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={handleAvatarUpload}
                  disabled={avatarBusy}
                  hidden
                />
              </label>
            </div>
            <div className="flex-1 space-y-0.5">
              <h2 className="text-lg font-semibold">{fullName || t('common.emDash')}</h2>
              <p className="text-sm text-muted-foreground">{email}</p>
              {avatarBusy ? (
                <p className="text-xs text-muted-foreground">{t('profile.photoProcessing')}</p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {avatarUrl ? (
                  <Button variant="ghost" size="sm" onClick={handleRemoveAvatar} disabled={avatarBusy}>
                    <X className="mr-1 size-3" />
                    {t('profile.removePhoto')}
                  </Button>
                ) : null}
                <span className="text-xs text-muted-foreground">{t('profile.photoHint')}</span>
              </div>
            </div>
          </div>

          <form onSubmit={saveProfile} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="fullName">{t('profile.fullName')}</Label>
                <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">{t('profile.email')}</Label>
                <Input id="email" value={email} readOnly disabled />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="department">{t('profile.department')}</Label>
                {canEditDepartment ? (
                  <select
                    id="department"
                    multiple
                    value={departmentIds.map(String)}
                    onChange={(e) => {
                      const selected = Array.from(
                        e.target.selectedOptions,
                        (option) => Number(option.value),
                      ).filter(Boolean)
                      setDepartmentIds(selected)
                    }}
                    className="flex min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {departments.map((department: any) => (
                      <option key={department.id} value={String(department.id)}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input value={departmentLabels} readOnly disabled />
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="role">{t('profile.role')}</Label>
                <Input id="role" value={roleLabels} readOnly disabled />
              </div>
            </div>

            <Separator />

            <h4 className="text-sm font-semibold">{t('profile.prefsTitle')}</h4>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="notifEmail" className="text-sm font-normal">
                  {t('profile.notifEmail')}
                </Label>
                <Switch
                  id="notifEmail"
                  checked={notifEmail}
                  onCheckedChange={setNotifEmail}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="notifInApp" className="text-sm font-normal">
                  {t('profile.notifInApp')}
                </Label>
                <Switch
                  id="notifInApp"
                  checked={notifInApp}
                  onCheckedChange={setNotifInApp}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="language">{t('profile.language')}</Label>
                <Select value={locale} onValueChange={(v) => setLocale(normalizeAppLanguage(v))}>
                  <SelectTrigger id="language" className="w-full sm:max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fr">{t('layout.langCodeFr')}</SelectItem>
                    <SelectItem value="en">{t('layout.langCodeEn')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="theme">{t('profile.themeLabel', 'Thème')}</Label>
                <Select value={theme} onValueChange={(v: any) => setTheme(v)}>
                  <SelectTrigger id="theme" className="w-full sm:max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">{t('layout.themeLight')}</SelectItem>
                    <SelectItem value="dark">{t('layout.themeDark')}</SelectItem>
                    <SelectItem value="system">{t('layout.themeSystem')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button type="submit" disabled={saveBusy}>
              {saveBusy ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  {t('profile.saving')}
                </>
              ) : (
                t('profile.save')
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('profile.statsTitle')}</CardTitle>
            <CardDescription>{t('profile.statsSub')}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div className="flex items-baseline justify-between gap-3 border-b pb-2">
                <dt className="text-muted-foreground">{t('profile.statsDocs')}</dt>
                <dd className="text-lg font-semibold tabular-nums">{stats.documents_uploaded}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-b pb-2">
                <dt className="text-muted-foreground">{t('profile.statsWf')}</dt>
                <dd className="text-lg font-semibold tabular-nums">{stats.workflows_approved}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">{t('profile.statsLastLogin')}</dt>
                <dd className="text-xs text-foreground">{formatLastLogin()}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('profile.passwordCardTitle')}</CardTitle>
            <CardDescription>{t('profile.passwordCardSub')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitPassword} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="currentPassword">{t('profile.currentPassword')}</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="newPassword">{t('profile.newPassword')}</Label>
                <Input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">{t('profile.confirmPassword')}</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              <Button type="submit" variant="secondary" className="w-full" disabled={passwordBusy}>
                {passwordBusy ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    {t('profile.passwordUpdating')}
                  </>
                ) : (
                  t('profile.passwordSubmit')
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
