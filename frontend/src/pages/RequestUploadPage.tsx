import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Upload } from 'lucide-react'
import Card from '../components/ui/Card'
import { Button } from '@/components/shadcn/button'
import { Input } from '@/components/shadcn/input'
import { Label } from '@/components/shadcn/label'
import { Textarea } from '@/components/shadcn/textarea'
import { Alert, AlertDescription } from '@/components/shadcn/alert'
import { getApiOrigin } from '../utils/apiOrigin'

const API = `${getApiOrigin()}/api/v1`

export default function RequestUploadPage() {
  const { t, i18n } = useTranslation()
  const uiLocale = useMemo(
    () => (i18n.language?.startsWith('en') ? 'en-US' : 'fr-FR'),
    [i18n.language],
  )
  const { token } = useParams()
  const [meta, setMeta] = useState<any>(null)
  const [err, setErr] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [comment, setComment] = useState('')
  const [files, setFiles] = useState<FileList | null>(null)
  const [done, setDone] = useState(false)
  const [uploading, setUploading] = useState(false)

  const tEnc = encodeURIComponent(token || '')

  useEffect(() => {
    let c = false
    ;(async () => {
      try {
        const r = await fetch(`${API}/request-upload/${tEnc}/meta`)
        const j = await r.json()
        if (!r.ok) {
          setErr(j.message || t('requestUpload.invalidLink'))
          return
        }
        if (!c) setMeta(j.data)
      } catch {
        if (!c) setErr(t('requestUpload.serverUnreachable'))
      }
    })()
    return () => {
      c = true
    }
  }, [tEnc, t])

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    try {
      const r = await fetch(`${API}/request-upload/${tEnc}/grant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(meta?.requires_password ? { password } : {}),
      })
      const j = await r.json()
      if (!r.ok) {
        setErr(j.message || t('requestUpload.accessDenied'))
        return
      }
      setAccessToken(j.data.accessToken)
    } catch {
      setErr(t('requestUpload.networkError'))
    }
  }

  const submitFiles = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!files || files.length === 0) {
      setErr(t('requestUpload.selectFile'))
      return
    }
    setUploading(true)
    setErr('')
    try {
      const fd = new FormData()
      for (let i = 0; i < files.length; i += 1) {
        fd.append('files', files[i])
      }
      if (email) fd.append('email', email)
      if (comment) fd.append('comment', comment)

      const r = await fetch(`${API}/request-upload/${tEnc}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: fd,
      })
      const j = await r.json()
      if (!r.ok) {
        setErr(j.message || t('requestUpload.sendFail'))
        return
      }
      setDone(true)
    } catch {
      setErr(t('requestUpload.networkError'))
    } finally {
      setUploading(false)
    }
  }

  if (err && !meta) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <Card
          title={t('requestUpload.cardErrorTitle')}
          subtitle={t('requestUpload.cardErrorSub')}
        >
          <Alert variant="destructive">
            <AlertDescription>{err}</AlertDescription>
          </Alert>
        </Card>
      </div>
    )
  }

  if (!meta) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <Card title={t('requestUpload.title')} subtitle={t('requestUpload.cardLoadingSub')}>
          <p className="text-sm text-muted-foreground">{t('requestUpload.loadingLine')}</p>
        </Card>
      </div>
    )
  }

  if (done) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <Card
          title={t('requestUpload.thanksTitle')}
          subtitle={t('requestUpload.thanksSub')}
        >
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="size-12 text-emerald-500" />
            <p className="text-sm">{t('requestUpload.thanksBody')}</p>
          </div>
        </Card>
      </div>
    )
  }

  const typesPreview = meta.allowed_mime_types?.slice(0, 6).join(', ') || ''
  const typesEllipsis = meta.allowed_mime_types?.length > 6 ? '…' : ''

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Card title={t('requestUpload.formTitle')} subtitle={t('requestUpload.formSub')}>
        <ul className="space-y-1 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
          <li>{t('requestUpload.typesAccepted', { list: typesPreview + typesEllipsis })}</li>
          <li>
            {t('requestUpload.maxSizeLine', {
              mb: Math.round(meta.max_size_bytes / 1024 / 1024),
            })}
          </li>
          <li>{t('requestUpload.maxFilesLine', { n: meta.max_files })}</li>
          {meta.expires_at ? (
            <li>
              {t('requestUpload.expiresLine', {
                date: new Date(meta.expires_at).toLocaleString(uiLocale),
              })}
            </li>
          ) : null}
        </ul>

        {!accessToken ? (
          <form onSubmit={unlock} className="space-y-3">
            {meta.requires_password ? (
              <div className="space-y-1.5">
                <Label htmlFor="ru-pass">{t('requestUpload.linkPassword')}</Label>
                <Input
                  id="ru-pass"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            ) : null}
            {err ? (
              <Alert variant="destructive">
                <AlertDescription>{err}</AlertDescription>
              </Alert>
            ) : null}
            <Button type="submit">{t('requestUpload.continueBtn')}</Button>
          </form>
        ) : (
          <form onSubmit={submitFiles} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ru-email">{t('requestUpload.emailOptional')}</Label>
              <Input
                id="ru-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ru-comment">{t('requestUpload.commentOptional')}</Label>
              <Textarea
                id="ru-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ru-files">{t('requestUpload.filesLabel')}</Label>
              <Input
                id="ru-files"
                type="file"
                multiple
                onChange={(e) => setFiles(e.target.files)}
              />
            </div>
            {err ? (
              <Alert variant="destructive">
                <AlertDescription>{err}</AlertDescription>
              </Alert>
            ) : null}
            <Button type="submit" disabled={uploading}>
              <Upload className="mr-2 size-4" />
              {uploading ? t('requestUpload.sending') : t('requestUpload.sendBtn')}
            </Button>
          </form>
        )}
      </Card>
    </div>
  )
}
