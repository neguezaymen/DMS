import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy } from 'lucide-react'
import api from '../services/api/client'
import Card from '../components/ui/Card'
import { Button } from '@/components/shadcn/button'
import { Input } from '@/components/shadcn/input'
import { Label } from '@/components/shadcn/label'
import { Badge } from '@/components/shadcn/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/shadcn/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/shadcn/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/shadcn/table'
import { useToast } from '../state/ToastContext'
import { useAuth } from '../state/AuthContext'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/shadcn/dialog'

const MIME_PRESETS: Record<string, string[] | null> = {
  default: null,
  office_pdf: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
  ],
  images: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
}

export default function UploadRequestsPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const { isAuthenticated } = useAuth()
  const [tab, setTab] = useState('inbox')
  const [inbox, setInbox] = useState<any[]>([])
  const [mine, setMine] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [createdLinkUrl, setCreatedLinkUrl] = useState('')
  const [copied, setCopied] = useState(false)

  const [form, setForm] = useState({
    targetDocumentId: '',
    password: '',
    notificationEmail: '',
    expiresAt: '',
    maxFiles: 5,
    maxSizeMb: 10,
    allowedPreset: 'default',
  })

  const loadInbox = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/upload-requests/inbox')
      setInbox(res.data.data || [])
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('uploadRequests.loadError'))
    } finally {
      setLoading(false)
    }
  }, [toast, t])

  const loadMine = useCallback(async () => {
    try {
      const res = await api.get('/upload-requests/mine')
      setMine(res.data.data || [])
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('uploadRequests.loadMineError'))
    }
  }, [toast, t])

  useEffect(() => {
    if (tab === 'inbox') void loadInbox()
    if (tab === 'mine') void loadMine()
  }, [tab, loadInbox, loadMine])

  const copyCreatedLink = async () => {
    if (!createdLinkUrl) return
    try {
      await navigator.clipboard.writeText(createdLinkUrl)
      setCopied(true)
      toast.success(t('uploadRequests.linkCopied'))
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(t('uploadRequests.copyFailed'))
    }
  }

  const createLink = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const allowedMimeTypes =
        form.allowedPreset === 'default' ? undefined : MIME_PRESETS[form.allowedPreset]
      const body = {
        targetDocumentId: form.targetDocumentId ? Number(form.targetDocumentId) : undefined,
        password: form.password || undefined,
        notificationEmail: form.notificationEmail || undefined,
        expiresAt: form.expiresAt || undefined,
        maxFiles: Number(form.maxFiles) || 5,
        maxSizeBytes: Math.round((Number(form.maxSizeMb) || 10) * 1024 * 1024),
        allowedMimeTypes,
      }
      const res = await api.post('/upload-requests', body)
      const d = res.data.data
      const publicUrl = `${window.location.origin}/request-upload/${d.token}`
      setCreatedLinkUrl(publicUrl)
      setCopied(false)
      setLinkDialogOpen(true)
      toast.success(t('uploadRequests.linkCreated'))
      setForm({
        targetDocumentId: '',
        password: '',
        notificationEmail: '',
        expiresAt: '',
        maxFiles: 5,
        maxSizeMb: 10,
        allowedPreset: 'default',
      })
      void loadMine()
      setTab('mine')
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('uploadRequests.createDenied'))
    }
  }

  const revoke = async (id: number) => {
    if (!window.confirm(t('uploadRequests.revokeConfirm'))) return
    try {
      await api.patch(`/upload-requests/${id}/revoke`)
      toast.success(t('uploadRequests.revoked'))
      void loadMine()
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('common.failed'))
    }
  }

  const approve = async (fileId: number) => {
    try {
      await api.post(`/upload-requests/files/${fileId}/approve`)
      toast.success(t('uploadRequests.integrated'))
      void loadInbox()
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('common.failed'))
    }
  }

  const reject = async (fileId: number) => {
    const comment = window.prompt(t('uploadRequests.rejectPrompt'), '') || ''
    try {
      await api.post(`/upload-requests/files/${fileId}/reject`, { comment })
      toast.success(t('uploadRequests.rejectOk'))
      void loadInbox()
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('common.failed'))
    }
  }

  const requestCorrection = async (fileId: number) => {
    const comment = window.prompt(t('uploadRequests.promptCorrection'), '')
    if (!comment) return
    try {
      await api.post(`/upload-requests/files/${fileId}/request-correction`, { comment })
      toast.success(t('uploadRequests.requestSent'))
      void loadInbox()
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('common.failed'))
    }
  }

  return (
    <div className="space-y-4">
      <Card title={t('uploadRequests.cardTitle')} subtitle={t('uploadRequests.cardSub')}>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="inbox">{t('uploadRequests.tabInbox')}</TabsTrigger>
            <TabsTrigger value="create">{t('uploadRequests.tabCreate')}</TabsTrigger>
            <TabsTrigger value="mine">{t('uploadRequests.tabMine')}</TabsTrigger>
          </TabsList>

          <TabsContent value="inbox" className="space-y-3 pt-4">
            <p className="text-sm text-muted-foreground">{t('uploadRequests.inboxIntro')}</p>
            {loading ? (
              <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
            ) : null}
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('uploadRequests.colFile')}</TableHead>
                    <TableHead>{t('common.status')}</TableHead>
                    <TableHead>{t('uploadRequests.colEmail')}</TableHead>
                    <TableHead>{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inbox.map((row: any) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">{row.original_name}</div>
                        <p className="text-xs text-muted-foreground">
                          {t('uploadRequests.ipLine', {
                            ip: row.uploaded_by_ip || t('common.emDash'),
                          })}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.status}</Badge>
                      </TableCell>
                      <TableCell>{row.uploaded_by_email || t('common.emDash')}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => approve(row.id)}
                          >
                            {t('uploadRequests.approve')}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            onClick={() => reject(row.id)}
                          >
                            {t('uploadRequests.reject')}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => requestCorrection(row.id)}
                          >
                            {t('uploadRequests.requestCorrection')}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {inbox.length === 0 && !loading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        {t('uploadRequests.emptyInbox')}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="create" className="pt-4">
            <form onSubmit={createLink} className="max-w-2xl space-y-3">
              <p className="text-xs text-muted-foreground">
                {form.targetDocumentId.trim()
                  ? t('uploadRequests.targetDocOptionalHint')
                  : t('uploadRequests.createHint')}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="ur-target">{t('uploadRequests.targetDocLabel')}</Label>
                  <Input
                    id="ur-target"
                    value={form.targetDocumentId}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, targetDocumentId: e.target.value }))
                    }
                    placeholder={t('uploadRequests.targetDocPlaceholder')}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ur-pass">{t('uploadRequests.linkPasswordLabel')}</Label>
                  <Input
                    id="ur-pass"
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ur-email">{t('uploadRequests.notifyEmailLabel')}</Label>
                  <Input
                    id="ur-email"
                    type="email"
                    value={form.notificationEmail}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, notificationEmail: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ur-exp">{t('uploadRequests.expiresLabel')}</Label>
                  <Input
                    id="ur-exp"
                    type="datetime-local"
                    value={form.expiresAt}
                    onChange={(e) => setForm((p) => ({ ...p, expiresAt: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ur-maxf">{t('uploadRequests.maxFilesLabel')}</Label>
                  <Input
                    id="ur-maxf"
                    type="number"
                    min={1}
                    max={50}
                    value={form.maxFiles}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, maxFiles: Number(e.target.value) }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ur-maxsize">{t('uploadRequests.maxSizeMbLabel')}</Label>
                  <Input
                    id="ur-maxsize"
                    type="number"
                    min={1}
                    max={50}
                    value={form.maxSizeMb}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, maxSizeMb: Number(e.target.value) }))
                    }
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="ur-preset">{t('uploadRequests.allowedTypesLabel')}</Label>
                  <Select
                    value={form.allowedPreset}
                    onValueChange={(v) => setForm((p) => ({ ...p, allowedPreset: v }))}
                  >
                    <SelectTrigger id="ur-preset">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">{t('uploadRequests.filterDefault')}</SelectItem>
                      <SelectItem value="office_pdf">
                        {t('uploadRequests.presetOfficePdf')}
                      </SelectItem>
                      <SelectItem value="images">{t('uploadRequests.presetImages')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button type="submit" disabled={!isAuthenticated}>
                {t('uploadRequests.generateLink')}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="mine" className="pt-4">
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('uploadRequests.mineColId')}</TableHead>
                    <TableHead>{t('common.status')}</TableHead>
                    <TableHead>{t('uploadRequests.mineColPending')}</TableHead>
                    <TableHead>{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mine.map((row: any) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">{row.id}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.status}</Badge>
                      </TableCell>
                      <TableCell>{row.pending_count ?? 0}</TableCell>
                      <TableCell>
                        {row.status === 'active' ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => revoke(row.id)}
                          >
                            {t('uploadRequests.revokeBtn')}
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                  {mine.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        {t('common.noResults', '—')}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </Card>

      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('uploadRequests.linkAlertTitle')}</DialogTitle>
            <DialogDescription>{t('uploadRequests.linkDialogDesc')}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              readOnly
              value={createdLinkUrl}
              className="font-mono text-xs sm:flex-1"
              onFocus={(e) => e.target.select()}
              onClick={(e) => e.currentTarget.select()}
            />
            <Button
              type="button"
              variant="outline"
              className="shrink-0 gap-2 sm:w-auto"
              onClick={() => void copyCreatedLink()}
            >
              {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
              {copied ? t('uploadRequests.copied') : t('uploadRequests.copyLink')}
            </Button>
          </div>

          <DialogFooter>
            <Button type="button" onClick={() => setLinkDialogOpen(false)}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
