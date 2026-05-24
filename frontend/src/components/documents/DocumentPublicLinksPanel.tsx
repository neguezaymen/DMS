import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import api from '../../services/api/client'
import { Button } from '@/components/shadcn/button'
import { Input } from '@/components/shadcn/input'
import { Label } from '@/components/shadcn/label'
import { Checkbox } from '@/components/shadcn/checkbox'
import { Badge } from '@/components/shadcn/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/shadcn/table'
import { useToast } from '../../state/ToastContext'

interface DocumentPublicLinksPanelProps {
  documentId: string | number | undefined
  canManage: boolean
}

export default function DocumentPublicLinksPanel({
  documentId,
  canManage,
}: DocumentPublicLinksPanelProps) {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const uiLocale = i18n.language?.startsWith('en') ? 'en-US' : 'fr-FR'
  const [links, setLinks] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [logsFor, setLogsFor] = useState<number | null>(null)
  const [logs, setLogs] = useState<any[]>([])
  const [form, setForm] = useState({
    password: '',
    expiresAt: '',
    allowDownload: true,
  })

  const loadLinks = useCallback(async () => {
    if (!canManage) return
    setLoading(true)
    try {
      const res = await api.get(`/documents/${documentId}/public-links`)
      setLinks(res.data.data || [])
    } catch (e: any) {
      if (e.response?.status !== 403) {
        toast.error(e.response?.data?.message || t('documentPublicLinks.loadError'))
      }
    } finally {
      setLoading(false)
    }
  }, [canManage, documentId, toast, t])

  useEffect(() => {
    void loadLinks()
  }, [loadLinks])

  const loadLogs = async (linkId: number) => {
    try {
      const res = await api.get(
        `/documents/${documentId}/public-links/${linkId}/logs?limit=30`,
      )
      setLogs(res.data.data || [])
      setLogsFor(linkId)
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('documentPublicLinks.loadLogsError'))
    }
  }

  const createLink = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const body = {
        allowDownload: form.allowDownload,
        expiresAt: form.expiresAt || undefined,
        password: form.password || undefined,
      }
      const res = await api.post(`/documents/${documentId}/public-links`, body)
      const d = res.data.data
      const publicPage = `${window.location.origin}/public-link/${d.token}`
      toast.success(t('documentPublicLinks.created'))
      window.alert(t('documentPublicLinks.createdBody', { url: publicPage, token: d.token }))
      setForm({ password: '', expiresAt: '', allowDownload: true })
      void loadLinks()
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('documentPublicLinks.createFail'))
    }
  }

  const revoke = async (linkId: number) => {
    if (!window.confirm(t('documentPublicLinks.disableConfirm'))) return
    try {
      await api.patch(`/documents/${documentId}/public-links/${linkId}/revoke`)
      toast.success(t('documentPublicLinks.disabled'))
      void loadLinks()
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('common.failed'))
    }
  }

  const regenerate = async (linkId: number) => {
    if (!window.confirm(t('documentPublicLinks.regenConfirm'))) return
    try {
      const res = await api.patch(
        `/documents/${documentId}/public-links/${linkId}/regenerate`,
        {},
      )
      const d = res.data.data
      const publicPage = `${window.location.origin}/public-link/${d.token}`
      window.alert(t('documentPublicLinks.regenerateBody', { url: publicPage, token: d.token }))
      void loadLinks()
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('common.failed'))
    }
  }

  if (!canManage) return null

  return (
    <div className="mt-5 border-t pt-4">
      <h4 className="mb-2 text-sm font-medium">{t('documentPublicLinks.title')}</h4>
      <p className="mb-3 text-xs text-muted-foreground">{t('documentPublicLinks.intro')}</p>

      <form onSubmit={createLink} className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="link-password">{t('documentPublicLinks.passwordOptional')}</Label>
          <Input
            id="link-password"
            type="password"
            value={form.password}
            onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
            autoComplete="new-password"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="link-expires">{t('documentPublicLinks.expiresOptional')}</Label>
          <Input
            id="link-expires"
            type="datetime-local"
            value={form.expiresAt}
            onChange={(e) => setForm((p) => ({ ...p, expiresAt: e.target.value }))}
          />
        </div>
        <div className="flex items-end">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={form.allowDownload}
              onCheckedChange={(c) => setForm((p) => ({ ...p, allowDownload: c === true }))}
            />
            <span>{t('documentPublicLinks.allowDownload')}</span>
          </label>
        </div>
        <div className="flex items-end">
          <Button type="submit" className="w-full sm:w-auto">
            {t('documentPublicLinks.submit')}
          </Button>
        </div>
      </form>

      {loading ? <p className="text-sm text-muted-foreground">{t('common.loading')}</p> : null}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('documentPublicLinks.colTokenEnd')}</TableHead>
              <TableHead>{t('documentPublicLinks.colPassword')}</TableHead>
              <TableHead>{t('documentPublicLinks.colDownload')}</TableHead>
              <TableHead>{t('documentPublicLinks.colExpires')}</TableHead>
              <TableHead>{t('documentPublicLinks.colState')}</TableHead>
              <TableHead>{t('documentPublicLinks.colActions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {links.map((row: any) => (
              <TableRow key={row.id}>
                <TableCell className="font-mono text-xs">…{row.tokenSuffix}</TableCell>
                <TableCell>{row.hasPassword ? t('common.yes') : t('common.no')}</TableCell>
                <TableCell>{row.allow_download ? t('common.yes') : t('common.no')}</TableCell>
                <TableCell className="text-xs">
                  {row.expires_at
                    ? new Date(row.expires_at).toLocaleString(uiLocale)
                    : t('common.emDash')}
                </TableCell>
                <TableCell>
                  {row.revoked ? (
                    <Badge variant="secondary">{t('documentPublicLinks.stateDisabled')}</Badge>
                  ) : (
                    <Badge>{t('documentPublicLinks.stateActive')}</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    {!row.revoked ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => revoke(row.id)}
                        >
                          {t('documentPublicLinks.btnDeactivate')}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => regenerate(row.id)}
                        >
                          {t('documentPublicLinks.btnRegenerate')}
                        </Button>
                      </>
                    ) : null}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => loadLogs(row.id)}
                    >
                      {t('documentPublicLinks.btnLogs')}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {links.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  {t('common.noResults', '—')}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      {logsFor != null ? (
        <div className="mt-4 space-y-2">
          <strong className="text-sm">
            {t('documentPublicLinks.journalTitle', { id: logsFor })}
          </strong>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.date')}</TableHead>
                  <TableHead>{t('common.actions')}</TableHead>
                  <TableHead>{t('audit.colIp')}</TableHead>
                  <TableHead>User-Agent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log: any) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs">
                      {new Date(log.accessed_at).toLocaleString(uiLocale)}
                    </TableCell>
                    <TableCell>{log.action}</TableCell>
                    <TableCell>{log.ip_address || t('common.emDash')}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs">
                      {log.user_agent || t('common.emDash')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setLogsFor(null)}>
            {t('documentPublicLinks.closeJournal')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
