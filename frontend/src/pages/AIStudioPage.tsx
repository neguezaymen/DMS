import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Sparkles, FileDown, Layers } from 'lucide-react'
import api from '../services/api/client'
import Card from '../components/ui/Card'
import AIGenerationPreview from '../components/ai/AIGenerationPreview'
import { Button } from '@/components/shadcn/button'
import { Label } from '@/components/shadcn/label'
import { Textarea } from '@/components/shadcn/textarea'
import { Checkbox } from '@/components/shadcn/checkbox'
import { Progress } from '@/components/shadcn/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/shadcn/select'
import { useToast } from '../state/ToastContext'

const TEMPLATE_BY_KEY: Record<string, string> = {
  email: 'Email professionnel',
  report: 'Rapport / Résumé documentaire',
  linkedin: 'Post LinkedIn',
  note: 'Note interne',
}

function downloadAsPdfLike(title: string, content: string) {
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(`
    <html><head><title>${title}</title></head>
    <body style="font-family:Arial;padding:24px;white-space:pre-wrap">${String(content || '').replace(/</g, '&lt;')}</body>
    </html>
  `)
  w.document.close()
  w.focus()
  w.print()
}

export default function AIStudioPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const [templates, setTemplates] = useState<any[]>([])
  const [quota, setQuota] = useState({ dailyLimit: 50, usedToday: 0 })
  const [loading, setLoading] = useState(false)
  const [output, setOutput] = useState('')
  const [template, setTemplate] = useState('email')
  const [form, setForm] = useState({
    templateId: '',
    context: '',
    language: 'FR',
    tone: 'professionnel',
    length: 'moyen',
    model: 'gpt-3.5-turbo',
    stream: true,
  })

  const load = async () => {
    try {
      const [tpl, q] = await Promise.all([
        api.get('/ai-studio/templates'),
        api.get('/ai-studio/quota'),
      ])
      setTemplates(tpl.data.data || [])
      setQuota(q.data.data || { dailyLimit: 50, usedToday: 0 })
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('aiStudio.loadError'))
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const targetName = TEMPLATE_BY_KEY[template]
    const found = templates.find((row: any) => row.name === targetName)
    if (found) {
      setForm((p) => ({ ...p, templateId: String(found.id) }))
    }
  }, [templates, template])

  const quotaPct = useMemo(() => {
    const d = Number(quota.dailyLimit || 0)
    const u = Number(quota.usedToday || 0)
    if (d <= 0) return 0
    return Math.min(100, Math.round((u * 100) / d))
  }, [quota])

  const runGenerate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.templateId) {
      toast.error(t('aiStudio.selectTemplate'))
      return
    }
    setLoading(true)
    setOutput('')
    try {
      if (!form.stream) {
        const res = await api.post('/ai-studio/generate', {
          templateId: Number(form.templateId),
          templateKind: template,
          context: form.context,
          language: form.language,
          tone: form.tone,
          length: form.length,
          model: form.model,
          stream: false,
        })
        setOutput(res.data.data?.output || '')
      } else {
        const token = localStorage.getItem('accessToken')
        const r = await fetch(
          `${(import.meta as any).env.VITE_API_URL || 'http://localhost:3000/api/v1'}/ai-studio/generate`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: token ? `Bearer ${token}` : '',
            },
            body: JSON.stringify({
              templateId: Number(form.templateId),
              templateKind: template,
              context: form.context,
              language: form.language,
              tone: form.tone,
              length: form.length,
              model: form.model,
              stream: true,
            }),
          },
        )
        if (!r.ok || !r.body) {
          const txt = await r.text()
          throw new Error(txt || t('aiStudio.streamError'))
        }
        const reader = r.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          let idx
          while ((idx = buffer.indexOf('\n\n')) >= 0) {
            const eventChunk = buffer.slice(0, idx)
            buffer = buffer.slice(idx + 2)
            const line = eventChunk.split('\n').find((l) => l.startsWith('data: '))
            if (!line) continue
            const payload = JSON.parse(line.slice(6))
            if (payload.chunk) setOutput((prev) => prev + payload.chunk)
          }
        }
      }
      await load()
      toast.success(t('aiStudio.genOk'))
    } catch (e: any) {
      toast.error(e.response?.data?.message || e.message || t('aiStudio.genFail'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card
        title={t('aiStudio.title')}
        subtitle={t('aiStudio.subtitle')}
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link to="/ai-studio/batch">
              <Layers className="mr-2 size-4" />
              {t('aiStudio.openBatch')}
            </Link>
          </Button>
        }
      >
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            {t('aiStudio.quotaLine', {
              used: quota.usedToday,
              limit: quota.dailyLimit,
              pct: quotaPct,
            })}
          </p>
          <Progress value={quotaPct} className="h-2" />
        </div>

        <form onSubmit={runGenerate} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ai-type">{t('aiStudio.contentType')}</Label>
              <Select value={template} onValueChange={setTemplate}>
                <SelectTrigger id="ai-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">{t('aiStudio.templateOptEmail')}</SelectItem>
                  <SelectItem value="report">{t('aiStudio.templateOptReport')}</SelectItem>
                  <SelectItem value="linkedin">{t('aiStudio.templateOptLinkedin')}</SelectItem>
                  <SelectItem value="note">{t('aiStudio.templateOptNote')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ai-lang">{t('aiStudio.language')}</Label>
              <Select
                value={form.language}
                onValueChange={(v) => setForm((p) => ({ ...p, language: v }))}
              >
                <SelectTrigger id="ai-lang">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FR">FR</SelectItem>
                  <SelectItem value="EN">EN</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ai-tone">{t('aiStudio.tone')}</Label>
              <Select
                value={form.tone}
                onValueChange={(v) => setForm((p) => ({ ...p, tone: v }))}
              >
                <SelectTrigger id="ai-tone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="professionnel">{t('aiStudio.tonePro')}</SelectItem>
                  <SelectItem value="neutre">{t('aiStudio.toneNeutral')}</SelectItem>
                  <SelectItem value="persuasif">{t('aiStudio.tonePersuasive')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ai-length">{t('aiStudio.length')}</Label>
              <Select
                value={form.length}
                onValueChange={(v) => setForm((p) => ({ ...p, length: v }))}
              >
                <SelectTrigger id="ai-length">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="court">{t('aiStudio.lenShort')}</SelectItem>
                  <SelectItem value="moyen">{t('aiStudio.lenMedium')}</SelectItem>
                  <SelectItem value="long">{t('aiStudio.lenLong')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ai-model">{t('aiStudio.aiModel')}</Label>
              <Select
                value={form.model}
                onValueChange={(v) => setForm((p) => ({ ...p, model: v }))}
              >
                <SelectTrigger id="ai-model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-3.5-turbo">{t('aiStudio.modelGpt35')}</SelectItem>
                  <SelectItem value="gpt-4">{t('aiStudio.modelGpt4')}</SelectItem>
                  <SelectItem value="gemini-pro">{t('aiStudio.modelGemini')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ai-context">{t('aiStudio.context')}</Label>
            <Textarea
              id="ai-context"
              rows={7}
              value={form.context}
              onChange={(e) => setForm((p) => ({ ...p, context: e.target.value }))}
              placeholder={t('aiStudio.contextPlaceholder')}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.stream}
              onCheckedChange={(c) => setForm((p) => ({ ...p, stream: c === true }))}
            />
            <span>{t('aiStudio.streamLabel')}</span>
          </label>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={loading}>
              <Sparkles className="mr-2 size-4" />
              {loading ? t('aiStudio.generating') : t('aiStudio.generate')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => downloadAsPdfLike('ai-generation', output)}
            >
              <FileDown className="mr-2 size-4" />
              {t('aiStudio.exportPdf')}
            </Button>
          </div>
        </form>

        <Card title={t('aiStudio.resultTitle')} subtitle={t('aiStudio.resultSub')}>
          <AIGenerationPreview content={output} emptyLabel={t('common.emDash')} />
        </Card>
      </Card>
    </div>
  )
}
