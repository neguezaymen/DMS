import { ArrowRight, File, FileImage, FileText } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/shadcn/card'
import { Skeleton } from '@/components/shadcn/skeleton'
import { statusBadgeClass, statusLabel } from '../../utils/documentUi'

function mimeIcon(mime?: string) {
  if (!mime) return File
  if (mime.startsWith('image/')) return FileImage
  if (mime === 'application/pdf' || mime.includes('word') || mime.includes('document')) return FileText
  return File
}

type DocumentRow = {
  id: number | string
  title?: string | null
  original_name?: string | null
  mime_type?: string | null
  status?: string | null
  created_at?: string | null
}

interface RecentDocumentsProps {
  documents?: DocumentRow[]
  loading?: boolean
  error?: string | null
}

export default function RecentDocuments({ documents = [], loading, error }: RecentDocumentsProps) {
  const { t, i18n } = useTranslation()
  const dateLoc = i18n.language?.startsWith('en') ? 'en-US' : 'fr-FR'

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">{t('recentDocs.shortTitle')}</CardTitle>
          <CardDescription>{t('recentDocs.subtitle', "Les derniers fichiers ajoutés")}</CardDescription>
        </div>
        <Link
          to="/documents"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {t('recentDocs.seeAll')} <ArrowRight className="size-3.5" />
        </Link>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <ul className="divide-y">
            {[1, 2, 3].map((i) => (
              <li key={i} className="flex items-center gap-3 py-3">
                <Skeleton className="size-9 rounded-md" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </li>
            ))}
          </ul>
        ) : error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : documents.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('recentDocs.emptyDashboard')}
          </p>
        ) : (
          <ul className="divide-y">
            {documents.map((doc) => {
              const Icon = mimeIcon(doc.mime_type || undefined)
              const title = doc.title || doc.original_name || `#${doc.id}`
              const labelStatus = statusLabel(doc.status, t)
              return (
                <li key={doc.id}>
                  <Link
                    to={`/documents/${doc.id}`}
                    className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-muted/50"
                    aria-label={t('recentDocs.openAria', { title, status: labelStatus })}
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {doc.created_at
                          ? new Date(doc.created_at).toLocaleDateString(dateLoc, {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })
                          : t('common.emDash')}
                      </span>
                    </span>
                    <span className={statusBadgeClass(doc.status)}>{labelStatus}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
