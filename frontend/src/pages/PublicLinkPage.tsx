import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Download, FileLock } from 'lucide-react'
import Card from '../components/ui/Card'
import { Button } from '@/components/shadcn/button'
import { Input } from '@/components/shadcn/input'
import { Label } from '@/components/shadcn/label'
import { Alert, AlertDescription } from '@/components/shadcn/alert'
import { getApiOrigin } from '../utils/apiOrigin'
import { usePageTitle } from '@/hooks/usePageTitle'

export default function PublicLinkPage() {
  const { t } = useTranslation()
  const { token } = useParams()
  const base = `${getApiOrigin()}/api/v1/public-links/${encodeURIComponent(token || '')}`
  const [meta, setMeta] = useState<any>(null)
  const [error, setError] = useState('')
  const [password, setPassword] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [allowDownload, setAllowDownload] = useState(false)
  usePageTitle(meta?.title || t('pageTitle.publicLink'))

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const r = await fetch(`${base}/meta`)
        const j = await r.json()
        if (!r.ok) {
          setError(j.message || t('publicLinkPage.invalidLink'))
          return
        }
        if (!cancelled) setMeta(j.data)
      } catch {
        if (!cancelled) setError(t('publicLinkPage.serverUnreachable'))
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [base, t])

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      const r = await fetch(`${base}/grant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: meta?.requires_password ? password : undefined,
        }),
      })
      const j = await r.json()
      if (!r.ok) {
        setError(j.message || t('publicLinkPage.accessDenied'))
        return
      }
      const at = j.data.accessToken
      setAccessToken(at)
      setAllowDownload(Boolean(j.data.allow_download))

      const prev = await fetch(`${base}/preview`, {
        headers: { Authorization: `Bearer ${at}` },
      })
      if (!prev.ok) {
        setError(t('publicLinkPage.previewLoadFail'))
        return
      }
      const blob = await prev.blob()
      const u = URL.createObjectURL(blob)
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old)
        return u
      })
    } catch {
      setError(t('publicLinkPage.networkError'))
    }
  }

  const download = async () => {
    if (!accessToken) return
    try {
      const r = await fetch(`${base}/download`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        setError(j.message || t('publicLinkPage.downloadDenied'))
        return
      }
      const blob = await r.blob()
      const u = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = u
      a.download = meta?.original_name || 'document'
      a.click()
      URL.revokeObjectURL(u)
    } catch {
      setError(t('publicLinkPage.downloadFail'))
    }
  }

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  if (error && !meta) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <Card
          title={t('publicLinkPage.cardTitle')}
          subtitle={t('publicLinkPage.errorSubtitle')}
        >
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </Card>
      </div>
    )
  }

  if (!meta) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <Card
          title={t('publicLinkPage.cardTitle')}
          subtitle={t('publicLinkPage.loadingSubtitle')}
        >
          <p className="text-sm text-muted-foreground">{t('publicLinkPage.loadingText')}</p>
        </Card>
      </div>
    )
  }

  const isPdf = (meta.mime_type || '').includes('pdf')
  const isImage = (meta.mime_type || '').startsWith('image/')

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <Card title={meta.title || t('common.documents')} subtitle={meta.original_name}>
        {!accessToken ? (
          <form onSubmit={unlock} className="space-y-3">
            {meta.requires_password ? (
              <div className="space-y-1.5">
                <Label htmlFor="link-password">
                  <FileLock className="mr-1 inline size-3.5" />
                  {t('publicLinkPage.passwordLabel')}
                </Label>
                <Input
                  id="link-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="off"
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t('publicLinkPage.noPassword')}
              </p>
            )}
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Button type="submit">{t('publicLinkPage.openBtn')}</Button>
          </form>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {allowDownload ? (
                <Button
                  type="button"
                  onClick={download}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <Download className="mr-2 size-4" />
                  {t('common.download')}
                </Button>
              ) : (
                <span className="text-sm text-muted-foreground">
                  {t('publicLinkPage.previewOnly')}
                </span>
              )}
            </div>
            {previewUrl && isPdf ? (
              <iframe
                title={t('publicLinkPage.previewIframeTitle')}
                src={previewUrl}
                className="h-[75vh] w-full rounded-lg border"
              />
            ) : null}
            {previewUrl && isImage ? (
              <img src={previewUrl} alt="" className="max-w-full rounded-lg border" />
            ) : null}
            {previewUrl && !isPdf && !isImage ? (
              <p className="text-sm">
                <a
                  href={previewUrl}
                  download={meta.original_name}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {t('publicLinkPage.openSaveFile')}
                </a>
              </p>
            ) : null}
          </>
        )}
      </Card>
    </div>
  )
}
