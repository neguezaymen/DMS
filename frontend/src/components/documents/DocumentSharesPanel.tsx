import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import api from '../../services/api/client'
import { Button } from '@/components/shadcn/button'
import { Input } from '@/components/shadcn/input'
import { Label } from '@/components/shadcn/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/shadcn/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/shadcn/table'
import { Badge } from '@/components/shadcn/badge'
import { useToast } from '../../state/ToastContext'

function permLabels(t: (k: string) => string) {
  return {
    view: t('documentShares.permView'),
    download: t('documentShares.permDownload'),
    manage: t('documentShares.permManage'),
  }
}

interface DocumentSharesPanelProps {
  documentId: string | number | undefined
  canManage: boolean
}

export default function DocumentSharesPanel({ documentId, canManage }: DocumentSharesPanelProps) {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const uiLocale = i18n.language?.startsWith('en') ? 'en-US' : 'fr-FR'
  const [shares, setShares] = useState<any[]>([])
  const [roles, setRoles] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    target: 'user',
    sharedWithUserId: '',
    sharedWithRoleId: '',
    permission: 'view',
    startDate: '',
    endDate: '',
  })

  const loadShares = useCallback(async () => {
    if (!canManage) return
    setLoading(true)
    try {
      const res = await api.get(`/documents/${documentId}/shares`)
      setShares(res.data.data || [])
    } catch (e: any) {
      if (e.response?.status !== 403) {
        toast.error(e.response?.data?.message || t('documentShares.loadError'))
      }
    } finally {
      setLoading(false)
    }
  }, [canManage, documentId, toast, t])

  useEffect(() => {
    void loadShares()
  }, [loadShares])

  useEffect(() => {
    const loadRoles = async () => {
      try {
        const res = await api.get('/roles')
        setRoles(res.data.data || [])
      } catch {
        setRoles([])
      }
    }
    if (canManage) void loadRoles()
  }, [canManage])

  const submitShare = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const body =
        form.target === 'user'
          ? {
              sharedWithUserId: Number(form.sharedWithUserId),
              permission: form.permission,
              startDate: form.startDate || undefined,
              endDate: form.endDate || undefined,
            }
          : {
              sharedWithRoleId: Number(form.sharedWithRoleId),
              permission: form.permission,
              startDate: form.startDate || undefined,
              endDate: form.endDate || undefined,
            }
      await api.post(`/documents/${documentId}/shares`, body)
      toast.success(t('documentShares.created'))
      setForm({
        target: 'user',
        sharedWithUserId: '',
        sharedWithRoleId: '',
        permission: 'view',
        startDate: '',
        endDate: '',
      })
      void loadShares()
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('documentShares.saveFail'))
    }
  }

  const revoke = async (shareId: number) => {
    if (!window.confirm(t('documentShares.revokeConfirm'))) return
    try {
      await api.patch(`/documents/${documentId}/shares/${shareId}/revoke`)
      toast.success(t('documentShares.revoked'))
      void loadShares()
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('documentShares.saveFail'))
    }
  }

  if (!canManage) return null

  const labels = permLabels(t)

  return (
    <div className="mt-5 border-t pt-4">
      <h4 className="mb-2 text-sm font-medium">{t('documentShares.title')}</h4>
      <p className="mb-3 text-xs text-muted-foreground">{t('documentShares.intro')}</p>

      <form onSubmit={submitShare} className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="share-target">{t('documentShares.recipientType')}</Label>
          <Select
            value={form.target}
            onValueChange={(v) => setForm((p) => ({ ...p, target: v }))}
          >
            <SelectTrigger id="share-target">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">{t('documentShares.userOption')}</SelectItem>
              <SelectItem value="role">{t('documentShares.roleOption')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {form.target === 'user' ? (
          <div className="space-y-1.5">
            <Label htmlFor="share-user">{t('documentShares.userId')}</Label>
            <Input
              id="share-user"
              type="number"
              required
              value={form.sharedWithUserId}
              onChange={(e) => setForm((p) => ({ ...p, sharedWithUserId: e.target.value }))}
            />
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="share-role">{t('documentShares.roleSelect')}</Label>
            <Select
              value={form.sharedWithRoleId}
              onValueChange={(v) => setForm((p) => ({ ...p, sharedWithRoleId: v }))}
            >
              <SelectTrigger id="share-role">
                <SelectValue placeholder={t('common.emDash')} />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r: any) => (
                  <SelectItem key={r.id} value={String(r.id)}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="share-perm">{t('documentShares.permission')}</Label>
          <Select
            value={form.permission}
            onValueChange={(v) => setForm((p) => ({ ...p, permission: v }))}
          >
            <SelectTrigger id="share-perm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="view">{labels.view}</SelectItem>
              <SelectItem value="download">{labels.download}</SelectItem>
              <SelectItem value="manage">{labels.manage}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="share-start">{t('documentShares.startDate')}</Label>
          <Input
            id="share-start"
            type="datetime-local"
            value={form.startDate}
            onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="share-end">{t('documentShares.endDate')}</Label>
          <Input
            id="share-end"
            type="datetime-local"
            value={form.endDate}
            onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
          />
        </div>
        <div className="flex items-end">
          <Button type="submit" className="w-full sm:w-auto">
            {t('documentShares.submitShare')}
          </Button>
        </div>
      </form>

      {loading ? (
        <p className="text-sm text-muted-foreground">{t('documentShares.loadingList')}</p>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('documentShares.colRecipient')}</TableHead>
                <TableHead>{t('documentShares.colPermission')}</TableHead>
                <TableHead>{t('documentShares.colPeriod')}</TableHead>
                <TableHead>{t('documentShares.colCreatedBy')}</TableHead>
                <TableHead>{t('documentShares.colState')}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {shares.map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell>
                    {s.shared_user_name || s.shared_role_name || t('common.emDash')}
                    <span className="ml-1 text-xs text-muted-foreground">
                      {s.shared_with_user_id
                        ? ` ${t('documentShares.badgeUser', { id: s.shared_with_user_id })}`
                        : ''}
                      {s.shared_with_role_id
                        ? ` ${t('documentShares.badgeRole', { id: s.shared_with_role_id })}`
                        : ''}
                    </span>
                  </TableCell>
                  <TableCell>
                    {(labels as any)[s.permission] || s.permission}
                  </TableCell>
                  <TableCell className="text-xs">
                    {s.start_date ? new Date(s.start_date).toLocaleString(uiLocale) : t('common.emDash')}{' '}
                    →{' '}
                    {s.end_date
                      ? new Date(s.end_date).toLocaleString(uiLocale)
                      : t('documentShares.openEnded')}
                  </TableCell>
                  <TableCell>{s.created_by_name}</TableCell>
                  <TableCell>
                    {s.revoked ? (
                      <Badge variant="secondary">{t('documentShares.stateRevoked')}</Badge>
                    ) : (
                      <Badge>{t('documentShares.stateActive')}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {!s.revoked ? (
                      <Button
                        variant="destructive"
                        size="sm"
                        type="button"
                        onClick={() => revoke(s.id)}
                      >
                        {t('documentShares.revokeBtn')}
                      </Button>
                    ) : (
                      t('common.emDash')
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {shares.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    {t('common.noResults', '—')}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
