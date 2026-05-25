import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, FileSearch, GitCompare, MessageSquare, Sparkles } from 'lucide-react'
import api from '../../services/api/client'
import Card from '../ui/Card'
import Modal from '../ui/Modal'
import { Button } from '@/components/shadcn/button'
import { Input } from '@/components/shadcn/input'
import { Badge } from '@/components/shadcn/badge'
import { useToast } from '../../state/ToastContext'

type Props = {
  documentId: string
  canManageCustomFields: boolean
  onCustomFieldsUpdated?: () => void
}

export default function DocumentAIAssistant({
  documentId,
  canManageCustomFields,
  onCustomFieldsUpdated,
}: Props) {
  const { t } = useTranslation()
  const toast = useToast()
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryText, setSummaryText] = useState('')
  const [chatOpen, setChatOpen] = useState(false)
  const [chatLoading, setChatLoading] = useState(false)
  const [chatQuestion, setChatQuestion] = useState('')
  const [chatMessages, setChatMessages] = useState<Array<{ role: string; text: string }>>([])
  const [metaAiLoading, setMetaAiLoading] = useState(false)
  const [metaAiOutput, setMetaAiOutput] = useState<any>(null)
  const [versionCompareOpen, setVersionCompareOpen] = useState(false)
  const [versionCompareLoading, setVersionCompareLoading] = useState(false)
  const [versionCompareResult, setVersionCompareResult] = useState<any>(null)

  const summarizeDocument = async () => {
    setSummaryOpen(true)
    setSummaryLoading(true)
    setSummaryText('')
    try {
      const res = await api.post(`/ai-studio/summarize/${documentId}`, {})
      setSummaryText(res.data.data?.output || '')
    } catch (error: any) {
      setSummaryText('')
      toast.error(error.response?.data?.message || t('documentDetail.summaryFail'))
    } finally {
      setSummaryLoading(false)
    }
  }

  const askDocumentAI = async (event: React.FormEvent) => {
    event.preventDefault()
    const q = chatQuestion.trim()
    if (!q) return
    setChatLoading(true)
    setChatMessages((prev) => [...prev, { role: 'user', text: q }])
    setChatQuestion('')
    try {
      const res = await api.post(`/ai-studio/document-chat/${documentId}`, { question: q })
      const answer = res.data.data?.answer || t('common.emDash')
      setChatMessages((prev) => [...prev, { role: 'assistant', text: answer }])
    } catch (error: any) {
      const msg = error.response?.data?.message || t('documentDetail.chatAiFail')
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', text: t('documentDetail.chatErrorPrefix', { msg }) },
      ])
    } finally {
      setChatLoading(false)
    }
  }

  const runMetadataExtraction = async (applyToCustomFields: boolean) => {
    setMetaAiLoading(true)
    try {
      const res = await api.post(`/ai-studio/extract-metadata/${documentId}`, {
        applyToCustomFields,
      })
      setMetaAiOutput(res.data.data || null)
      toast.success(
        applyToCustomFields
          ? t('documentDetail.metadataExtractedApplied')
          : t('documentDetail.metadataExtracted'),
      )
      if (applyToCustomFields) {
        onCustomFieldsUpdated?.()
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('documentDetail.metadataExtractFail'))
    } finally {
      setMetaAiLoading(false)
    }
  }

  const runVersionCompare = async () => {
    setVersionCompareOpen(true)
    setVersionCompareLoading(true)
    setVersionCompareResult(null)
    try {
      const res = await api.post(`/ai-studio/version-compare/${documentId}`, {})
      setVersionCompareResult(res.data.data || null)
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('documentDetail.versionCompareFail'))
    } finally {
      setVersionCompareLoading(false)
    }
  }

  const tools = [
    {
      id: 'summary',
      icon: Sparkles,
      title: t('documentDetail.summarizeAi'),
      description: t('documentDetail.assistantSummaryDesc'),
      action: summarizeDocument,
    },
    {
      id: 'chat',
      icon: MessageSquare,
      title: t('documentDetail.chatWithAi'),
      description: t('documentDetail.assistantChatDesc'),
      action: () => setChatOpen(true),
    },
    {
      id: 'metadata',
      icon: FileSearch,
      title: t('documentDetail.extractMetadataAi'),
      description: t('documentDetail.assistantMetadataDesc'),
      action: () => runMetadataExtraction(false),
      loading: metaAiLoading,
    },
    {
      id: 'compare',
      icon: GitCompare,
      title: t('documentDetail.compareVersionsAi'),
      description: t('documentDetail.assistantCompareDesc'),
      action: runVersionCompare,
    },
  ]

  return (
    <>
      <Card
        title={t('documentDetail.assistantTitle')}
        subtitle={t('documentDetail.assistantSub')}
      >
        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Bot className="size-4" />
          {t('documentDetail.assistantHint')}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {tools.map((tool) => {
            const Icon = tool.icon
            return (
              <div
                key={tool.id}
                className="flex flex-col gap-3 rounded-lg border bg-card p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-md bg-primary/10 p-2">
                    <Icon className="size-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{tool.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{tool.description}</p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  disabled={tool.loading}
                  onClick={() => {
                    void tool.action().catch((error: any) => {
                      if (error?.response?.data?.message) {
                        toast.error(error.response.data.message)
                      }
                    })
                  }}
                >
                  {tool.loading ? t('documentDetail.extracting') : tool.title}
                </Button>
              </div>
            )
          })}
        </div>

        {canManageCustomFields ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-dashed p-3">
            <Badge variant="outline">{t('documentDetail.autofillCustomFields')}</Badge>
            <p className="text-xs text-muted-foreground">
              {t('documentDetail.assistantAutofillHint')}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={metaAiLoading}
              onClick={() => runMetadataExtraction(true)}
            >
              {metaAiLoading ? t('documentDetail.applying') : t('documentDetail.autofillCustomFields')}
            </Button>
          </div>
        ) : null}
      </Card>

      <Modal
        open={summaryOpen}
        title={t('documentDetail.summaryModalTitle')}
        onClose={() => setSummaryOpen(false)}
      >
        {summaryLoading ? (
          <p className="text-sm text-muted-foreground">{t('documentDetail.summaryGenerating')}</p>
        ) : (
          <pre className="whitespace-pre-wrap rounded-md border bg-muted p-3 text-sm">
            {summaryText || t('common.emDash')}
          </pre>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigator.clipboard.writeText(summaryText || '')}
          >
            {t('documentDetail.copy')}
          </Button>
        </div>
      </Modal>

      <Modal
        open={chatOpen}
        title={t('documentDetail.chatModalTitle')}
        onClose={() => setChatOpen(false)}
      >
        <div className="mb-3 flex max-h-[52vh] flex-col gap-2 overflow-y-auto">
          {chatMessages.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('documentDetail.chatEmptyHint')}</p>
          ) : (
            chatMessages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === 'user'
                    ? 'ml-auto max-w-[85%] whitespace-pre-wrap rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground'
                    : 'mr-auto max-w-[85%] whitespace-pre-wrap rounded-lg border bg-card px-3 py-2 text-sm'
                }
              >
                {m.text}
              </div>
            ))
          )}
        </div>
        <form onSubmit={askDocumentAI} className="flex gap-2">
          <Input
            value={chatQuestion}
            onChange={(e) => setChatQuestion(e.target.value)}
            placeholder={t('documentDetail.chatPlaceholder')}
            className="flex-1"
          />
          <Button type="submit" disabled={chatLoading}>
            {chatLoading ? t('documentDetail.sendingShort') : t('documentDetail.send')}
          </Button>
        </form>
      </Modal>

      <Modal
        open={Boolean(metaAiOutput)}
        title={t('documentDetail.metadataModalTitle')}
        onClose={() => setMetaAiOutput(null)}
      >
        <pre className="whitespace-pre-wrap rounded-md border bg-muted p-3 text-xs">
          {metaAiOutput ? JSON.stringify(metaAiOutput.metadata || {}, null, 2) : t('common.emDash')}
        </pre>
        {Array.isArray(metaAiOutput?.mapped) && metaAiOutput.mapped.length > 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {t('documentDetail.metadataFieldsUpdated', { count: metaAiOutput.mapped.length })}
          </p>
        ) : null}
      </Modal>

      <Modal
        open={versionCompareOpen}
        title={t('documentDetail.versionCompareTitle')}
        onClose={() => setVersionCompareOpen(false)}
      >
        {versionCompareLoading ? (
          <p className="text-sm text-muted-foreground">{t('documentDetail.versionCompareLoading')}</p>
        ) : versionCompareResult ? (
          <>
            <pre className="whitespace-pre-wrap rounded-md border bg-muted p-3 text-sm">
              {versionCompareResult.summary || t('common.emDash')}
            </pre>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Card title={t('documentDetail.linesAdded')}>
                <pre className="max-h-[20vh] overflow-y-auto whitespace-pre-wrap text-xs">
                  {(versionCompareResult.addedLines || []).join('\n') || t('common.emDash')}
                </pre>
              </Card>
              <Card title={t('documentDetail.linesRemoved')}>
                <pre className="max-h-[20vh] overflow-y-auto whitespace-pre-wrap text-xs">
                  {(versionCompareResult.removedLines || []).join('\n') || t('common.emDash')}
                </pre>
              </Card>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t('documentDetail.noCompareResult')}</p>
        )}
      </Modal>
    </>
  )
}
