import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, MessageSquareText, Sparkles } from 'lucide-react'
import api from '../services/api/client'
import Card from '../components/ui/Card'
import DocumentPicker from '../components/ai/DocumentPicker'
import AIGenerationPreview from '../components/ai/AIGenerationPreview'
import { Button } from '@/components/shadcn/button'
import { Textarea } from '@/components/shadcn/textarea'
import { Label } from '@/components/shadcn/label'
import { Badge } from '@/components/shadcn/badge'
import { useToast } from '../state/ToastContext'

export default function AICorpusQAPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const [selected, setSelected] = useState<number[]>([])
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

  const ask = async (event: React.FormEvent) => {
    event.preventDefault()
    if (selected.length === 0) {
      toast.error(t('aiCorpusQa.selectDocs'))
      return
    }
    if (!question.trim()) {
      toast.error(t('aiCorpusQa.questionRequired'))
      return
    }
    setLoading(true)
    setResult(null)
    try {
      const res = await api.post('/ai-studio/corpus-qa', {
        documentIds: selected,
        question: question.trim(),
      })
      setResult(res.data?.data || null)
      toast.success(t('aiCorpusQa.ok'))
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('aiCorpusQa.fail'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link to="/ai">
            <ArrowLeft className="mr-2 size-4" />
            {t('aiFeatures.backHub')}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">{t('aiCorpusQa.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('aiCorpusQa.subtitle')}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <Card title={t('aiCorpusQa.formTitle')} subtitle={t('aiCorpusQa.formSub')}>
          <DocumentPicker selected={selected} onChange={setSelected} />
          <form onSubmit={ask} className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="corpus-question">{t('aiCorpusQa.questionLabel')}</Label>
              <Textarea
                id="corpus-question"
                rows={4}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={t('aiCorpusQa.questionPh')}
              />
            </div>
            <Button type="submit" disabled={loading}>
              <Sparkles className="mr-2 size-4" />
              {loading ? t('aiCorpusQa.thinking') : t('aiCorpusQa.submit')}
            </Button>
          </form>
        </Card>

        <Card title={t('aiCorpusQa.answerTitle')} subtitle={t('aiCorpusQa.answerSub')}>
          {result?.sources?.length ? (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {result.sources.map((s: any) => (
                <Badge key={s.id} variant="secondary" asChild>
                  <Link to={`/documents/${s.id}`}>
                    #{s.id} · {s.relevance}%
                  </Link>
                </Badge>
              ))}
            </div>
          ) : null}
          {result?.sources?.length ? (
            <div className="mb-4 space-y-2">
              {result.sources.slice(0, 3).map((s: any) => (
                <div key={s.id} className="rounded-md border bg-muted/40 p-2 text-xs">
                  <p className="font-medium">{s.title}</p>
                  <p className="mt-1 text-muted-foreground">{s.excerpt}</p>
                </div>
              ))}
            </div>
          ) : null}
          <AIGenerationPreview content={result?.answer || ''} emptyLabel={t('aiCorpusQa.emptyAnswer')} />
        </Card>
      </div>
    </div>
  )
}
