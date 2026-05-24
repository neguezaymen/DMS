import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Sparkles } from 'lucide-react'
import api from '../services/api/client'
import Card from '../components/ui/Card'
import { Button } from '@/components/shadcn/button'
import { Input } from '@/components/shadcn/input'
import { Label } from '@/components/shadcn/label'
import { Progress } from '@/components/shadcn/progress'
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
import { useToast } from '../state/ToastContext'

function parseCsvPreview(text: string) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  if (!lines.length) return { headers: [], rows: [], total: 0 }
  const delim = lines[0].includes(';') ? ';' : ','
  const headers = lines[0].split(delim).map((h) => h.trim().replace(/^"|"$/g, ''))
  const allRows = lines.slice(1).map((line) => {
    const parts = line.split(delim).map((p) => p.trim().replace(/^"|"$/g, ''))
    const row: Record<string, string> = {}
    headers.forEach((h, i) => {
      row[h] = parts[i] ?? ''
    })
    return row
  })
  return { headers, rows: allRows.slice(0, 5), total: allRows.length }
}

export default function AIBatchPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const [templates, setTemplates] = useState<any[]>([])
  const [batchKinds, setBatchKinds] = useState<any[]>([])
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<{
    headers: string[]
    rows: Record<string, string>[]
    total: number
  }>({ headers: [], rows: [], total: 0 })
  const [templateKind, setTemplateKind] = useState('contrat')
  const [templateId, setTemplateId] = useState('')
  const [progress, setProgress] = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const [tpl, kinds] = await Promise.all([
          api.get('/ai-studio/templates'),
          api.get('/ai-studio/batch-templates'),
        ])
        setTemplates(tpl.data?.data || [])
        setBatchKinds(kinds.data?.data || [])
      } catch {
        /* ignore */
      }
    }
    void load()
  }, [])

  const onFile = async (file: File | null) => {
    setCsvFile(file)
    if (!file) {
      setPreview({ headers: [], rows: [], total: 0 })
      return
    }
    const text = await file.text()
    setPreview(parseCsvPreview(text))
  }

  const runBatch = async () => {
    if (!csvFile) {
      toast.error(t('aiBatch.needCsv'))
      return
    }
    setLoading(true)
    setProgress(12)
    try {
      const form = new FormData()
      form.append('file', csvFile)
      form.append('templateKind', templateKind)
      if (templateId) form.append('templateId', templateId)

      const timer = setInterval(() => {
        setProgress((p) => Math.min(92, p + 8))
      }, 400)

      const res = await api.post('/ai-studio/batch-generate', form, {
        responseType: 'blob',
        timeout: 120000,
      })

      clearInterval(timer)
      setProgress(100)

      const blob = new Blob([res.data], { type: 'application/zip' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `dms-batch-${Date.now()}.zip`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(t('aiBatch.done'))
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('aiBatch.fail'))
    } finally {
      setLoading(false)
      setTimeout(() => setProgress(0), 800)
    }
  }

  return (
    <div className="space-y-4">
      <Card
        title={t('aiBatch.title')}
        subtitle={t('aiBatch.subtitle')}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/ai-studio">
              <ArrowLeft className="mr-2 size-4" />
              {t('aiBatch.backStudio')}
            </Link>
          </Button>
        }
      >
        <div className="space-y-1.5">
          <Label htmlFor="csv-file">{t('aiBatch.csvFile')}</Label>
          <Input
            id="csv-file"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => onFile(e.target.files?.[0] || null)}
          />
          <p className="text-xs text-muted-foreground">{t('aiBatch.csvHint')}</p>
        </div>

        {preview.headers.length > 0 ? (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">
              {t('aiBatch.preview')} ({preview.total} lignes)
            </h4>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {preview.headers.map((h) => (
                      <TableHead key={h}>{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.map((row, i) => (
                    <TableRow key={i}>
                      {preview.headers.map((h) => (
                        <TableCell key={h}>{row[h]}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="batch-kind">{t('aiBatch.templateKind')}</Label>
            <Select value={templateKind} onValueChange={setTemplateKind}>
              <SelectTrigger id="batch-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {batchKinds.map((k: any) => (
                  <SelectItem key={k.key} value={k.key}>
                    {k.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="batch-tpl">{t('aiBatch.templateOptional')}</Label>
            <Select
              value={templateId || 'none'}
              onValueChange={(v) => setTemplateId(v === 'none' ? '' : v)}
            >
              <SelectTrigger id="batch-tpl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('aiBatch.presetOnly')}</SelectItem>
                {templates.map((tpl: any) => (
                  <SelectItem key={tpl.id} value={String(tpl.id)}>
                    {tpl.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="space-y-1.5">
            <Progress value={progress} />
            <p className="text-xs text-muted-foreground">
              {t('aiBatch.generating', { pct: progress })}
            </p>
          </div>
        ) : null}

        <Button onClick={runBatch} disabled={loading || !csvFile}>
          <Sparkles className="mr-2 size-4" />
          {t('aiBatch.generateBtn', { n: preview.total || '…' })}
        </Button>
      </Card>
    </div>
  )
}
