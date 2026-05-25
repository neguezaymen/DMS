import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, FileSearch, Sparkles } from 'lucide-react'
import api from '../services/api/client'
import Card from '../components/ui/Card'
import DocumentPicker from '../components/ai/DocumentPicker'
import { Button } from '@/components/shadcn/button'
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
import { useToast } from '../state/ToastContext'

export default function AIMetadataPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const [selected, setSelected] = useState<number[]>([])
  const [applyFields, setApplyFields] = useState(true)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

  const run = async () => {
    setLoading(true)
    setResult(null)
    try {
      const res = await api.post('/ai-studio/metadata/batch-enrich', {
        documentIds: selected.length > 0 ? selected : undefined,
        applyToCustomFields: applyFields,
        limit: 20,
      })
      setResult(res.data?.data || null)
      toast.success(t('aiMetadata.ok', { n: res.data?.data?.processed ?? 0 }))
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('aiMetadata.fail'))
    } finally {
      setLoading(false)
    }
  }

  const rows = Array.isArray(result?.results) ? result.results : []

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link to="/ai">
            <ArrowLeft className="mr-2 size-4" />
            {t('aiFeatures.backHub')}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">{t('aiMetadata.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('aiMetadata.subtitle')}</p>
      </div>

      <Card title={t('aiMetadata.formTitle')} subtitle={t('aiMetadata.formSub')}>
        <DocumentPicker selected={selected} onChange={setSelected} />
        <p className="text-xs text-muted-foreground">{t('aiMetadata.emptySelectionHint')}</p>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <Checkbox checked={applyFields} onCheckedChange={(c) => setApplyFields(c === true)} />
          <span>{t('aiMetadata.applyCustomFields')}</span>
        </label>
        <Button type="button" className="mt-4" onClick={() => void run()} disabled={loading}>
          <FileSearch className="mr-2 size-4" />
          {loading ? t('aiMetadata.running') : t('aiMetadata.run')}
        </Button>
      </Card>

      {result ? (
        <Card
          title={t('aiMetadata.resultsTitle')}
          subtitle={t('aiMetadata.resultsSub', {
            processed: result.processed,
            applied: result.applied,
          })}
        >
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.title')}</TableHead>
                  <TableHead>{t('aiMetadata.colCategory')}</TableHead>
                  <TableHead>{t('aiMetadata.colFields')}</TableHead>
                  <TableHead>{t('aiMetadata.colExtracted')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row: any) => (
                  <TableRow key={row.documentId}>
                    <TableCell>
                      <Link to={`/documents/${row.documentId}`} className="hover:underline">
                        {row.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.suggestedCategory || t('common.emDash')}</Badge>
                    </TableCell>
                    <TableCell>{row.mapped?.length || 0}</TableCell>
                    <TableCell className="max-w-[280px] truncate font-mono text-xs">
                      {Object.entries(row.metadata || {})
                        .filter(([, v]) => v)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(' · ') || t('common.emDash')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      ) : null}
    </div>
  )
}
