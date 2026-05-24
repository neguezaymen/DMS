import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink, Loader2 } from 'lucide-react'
import api from '../services/api/client'
import { useToast } from '../state/ToastContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/shadcn/card'
import { Button } from '@/components/shadcn/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/shadcn/table'
import { Badge } from '@/components/shadcn/badge'
import { Switch } from '@/components/shadcn/switch'
import { Label } from '@/components/shadcn/label'
import { Separator } from '@/components/shadcn/separator'
import { cn } from '@/lib/utils'

const TYPES = ['share', 'workflow', 'expiry', 'upload', 'system', 'document_approval']

type Pref = { email_enabled?: boolean; in_app_enabled?: boolean }

export default function NotificationsPage() {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const [items, setItems] = useState<any[]>([])
  const [prefs, setPrefs] = useState<Record<string, Pref>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const uiLocale = i18n.language?.startsWith('en') ? 'en-US' : 'fr-FR'

  const load = async () => {
    setLoading(true)
    try {
      const [n, p] = await Promise.all([
        api.get('/notifications?limit=100'),
        api.get('/notifications/preferences'),
      ])
      setItems(n.data.data || [])
      setPrefs(p.data.data || {})
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('notifications.loadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const markRead = async (id: number | string) => {
    try {
      await api.put(`/notifications/${id}/read`)
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)))
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('notifications.markReadFail'))
    }
  }

  const savePrefs = async () => {
    setSaving(true)
    try {
      const payload = TYPES.map((type) => ({
        type,
        emailEnabled: prefs[type]?.email_enabled !== false,
        inAppEnabled: prefs[type]?.in_app_enabled !== false,
      }))
      await api.put('/notifications/preferences', { preferences: payload })
      toast.success(t('notifications.saved'))
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('notifications.saveFail'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('notifications.title')}</CardTitle>
          <CardDescription>{t('notifications.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t('notifications.loading')}
            </div>
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t('notifications.empty', 'Aucune notification')}
            </p>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('notifications.type')}</TableHead>
                    <TableHead>{t('notifications.notif')}</TableHead>
                    <TableHead>{t('notifications.date')}</TableHead>
                    <TableHead className="text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((n) => (
                    <TableRow key={n.id} className={cn(n.is_read && 'opacity-60')}>
                      <TableCell>
                        <Badge variant="outline">{n.type}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium">{n.title}</p>
                          <p className="text-xs text-muted-foreground">{n.message}</p>
                          {n.link ? (
                            <a
                              href={n.link}
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              {t('notifications.open')}
                              <ExternalLink className="size-3" />
                            </a>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(n.created_at).toLocaleString(uiLocale)}
                      </TableCell>
                      <TableCell className="text-right">
                        {!n.is_read ? (
                          <Button variant="outline" size="sm" onClick={() => markRead(n.id)}>
                            {t('notifications.markRead')}
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('notifications.prefsCardTitle')}</CardTitle>
          <CardDescription>{t('notifications.prefsCardSub')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {TYPES.map((type, i) => (
            <div key={type} className="space-y-3">
              {i > 0 ? <Separator /> : null}
              <p className="text-sm font-medium capitalize">{type.replace(/_/g, ' ')}</p>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor={`inapp-${type}`} className="text-sm text-muted-foreground">
                  {t('notifications.inApp')}
                </Label>
                <Switch
                  id={`inapp-${type}`}
                  checked={prefs[type]?.in_app_enabled !== false}
                  onCheckedChange={(checked) =>
                    setPrefs((prev) => ({
                      ...prev,
                      [type]: { ...(prev[type] || {}), in_app_enabled: checked },
                    }))
                  }
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor={`email-${type}`} className="text-sm text-muted-foreground">
                  {t('notifications.email')}
                </Label>
                <Switch
                  id={`email-${type}`}
                  checked={prefs[type]?.email_enabled !== false}
                  onCheckedChange={(checked) =>
                    setPrefs((prev) => ({
                      ...prev,
                      [type]: { ...(prev[type] || {}), email_enabled: checked },
                    }))
                  }
                />
              </div>
            </div>
          ))}
          <Separator />
          <Button onClick={savePrefs} disabled={saving} className="w-full">
            {saving ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                {t('common.saving', 'Enregistrement…')}
              </>
            ) : (
              t('notifications.savePrefs')
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
