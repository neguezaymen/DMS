import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { ArrowLeft, FileText } from 'lucide-react'
import api, {
  downloadBlobFromApi,
  parseAxiosBlobErrorMessage,
  toApiRelativePath,
} from '../services/api/client'
import Card from '../components/ui/Card'
import Modal from '../components/ui/Modal'
import { Button } from '@/components/shadcn/button'
import { Input } from '@/components/shadcn/input'
import { Label } from '@/components/shadcn/label'
import { Textarea } from '@/components/shadcn/textarea'
import { Checkbox } from '@/components/shadcn/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/shadcn/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/shadcn/tabs'
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
import { useAuth } from '../state/AuthContext'
import { statusLabel, tagChipClass, workflowTimelineAction, mergeDocumentCategories, DOCUMENT_CATEGORY_PRESETS } from '../utils/documentUi'
import { resolveDocumentAccess } from '../utils/documentAccess'
import DocumentSharesPanel from '../components/documents/DocumentSharesPanel'
import DocumentPublicLinksPanel from '../components/documents/DocumentPublicLinksPanel'

function isImageMime(mime?: string) {
  return mime?.startsWith('image/')
}

function isPdfMime(mime?: string) {
  return mime === 'application/pdf'
}

function isTextMime(mime?: string) {
  return mime?.startsWith('text/')
}

const OFFICE_PREVIEW_MIMES = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])

function isMicrosoftPreviewLikelyBlocked(publicFileUrl: string) {
  try {
    const u = new URL(publicFileUrl)
    const h = u.hostname.toLowerCase()
    if (h === 'localhost' || h === '127.0.0.1') return true
    if (h.startsWith('192.168.')) return true
    if (h.startsWith('10.')) return true
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h)) return true
    if (h.endsWith('.local')) return true
    return false
  } catch {
    return true
  }
}

function isOfficeOnlineMime(mime?: string) {
  const m = (mime || '').toLowerCase().trim()
  if (OFFICE_PREVIEW_MIMES.has(m)) return true
  return (
    m.includes('officedocument') ||
    m.includes('wordprocessingml') ||
    m.includes('spreadsheetml') ||
    m.includes('presentationml') ||
    m === 'application/vnd.ms-excel' ||
    m === 'application/vnd.ms-powerpoint'
  )
}

function workflowInstanceStatus(status: string | undefined, t: (k: string) => string) {
  const k = String(status || '').toLowerCase()
  const key = `documentDetail.instanceStatus.${k}`
  const translated = t(key)
  return translated !== key ? translated : status || t('common.emDash')
}

export default function DocumentDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const toast = useToast()
  const { isAdmin, user } = useAuth()
  const { t, i18n } = useTranslation()
  const uiLocale = i18n.language?.startsWith('en') ? 'en-US' : 'fr-FR'
  const [document, setDocument] = useState<any>(null)
  const [textPreview, setTextPreview] = useState('')
  const [binaryPreviewUrl, setBinaryPreviewUrl] = useState('')
  const [activeTab, setActiveTab] = useState('metadata')
  const [versions, setVersions] = useState<any[]>([])
  const [versionFile, setVersionFile] = useState<File | null>(null)
  const [versionComment, setVersionComment] = useState('')
  const [workflowData, setWorkflowData] = useState<{ instances: any[]; timeline: any[] }>({
    instances: [],
    timeline: [],
  })
  const [workflowTemplates, setWorkflowTemplates] = useState<any[]>([])
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('')
  const [officePreviewModalOpen, setOfficePreviewModalOpen] = useState(false)
  const [officePreviewEmbedUrl, setOfficePreviewEmbedUrl] = useState('')
  const [officePreviewLocalNotice, setOfficePreviewLocalNotice] = useState(false)
  const [officePreviewPublicHelpOpen, setOfficePreviewPublicHelpOpen] = useState(false)
  const [officePreviewLoadError, setOfficePreviewLoadError] = useState('')
  const [officePreviewLoading, setOfficePreviewLoading] = useState(false)
  const [watermarkSaving, setWatermarkSaving] = useState(false)
  const [docDownloadBusy, setDocDownloadBusy] = useState(false)
  const [versionDownloadId, setVersionDownloadId] = useState<number | null>(null)
  const [cfFields, setCfFields] = useState<any[]>([])
  const [cfValues, setCfValues] = useState<Record<string, any>>({})
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
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [emailSending, setEmailSending] = useState(false)
  const [emailForm, setEmailForm] = useState({
    recipients: '',
    subject: '',
    message: '',
    mode: 'link',
    extraIds: '',
  })
  const [categories, setCategories] = useState<string[]>([])
  const [categorySaving, setCategorySaving] = useState(false)
  const [comments, setComments] = useState<any[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const previewRequestRef = useRef(0)
  const [newCommentText, setNewCommentText] = useState('')
  const [commentPosting, setCommentPosting] = useState(false)

  const loadCategories = async () => {
    try {
      const res = await api.get('/documents/categories')
      const list = Array.isArray(res.data?.data) ? res.data.data : []
      setCategories(mergeDocumentCategories(list))
    } catch {
      setCategories([])
    }
  }

  const loadComments = async () => {
    setCommentsLoading(true)
    try {
      const res = await api.get(`/documents/${id}/comments`)
      setComments(Array.isArray(res.data?.data) ? res.data.data : [])
    } catch (error: any) {
      setComments([])
      toast.error(error.response?.data?.message || t('documentDetail.loadCommentsFail'))
    } finally {
      setCommentsLoading(false)
    }
  }

  const loadCustomFields = async () => {
    try {
      const res = await api.get(`/documents/${id}/custom-values`)
      const { fields, values } = res.data.data || {}
      setCfFields(fields || [])
      setCfValues(values || {})
    } catch {
      setCfFields([])
      setCfValues({})
    }
  }

  const loadDocument = async () => {
    try {
      const response = await api.get(`/documents/${id}`)
      const doc = response.data.data
      setDocument(doc)
      if (isTextMime(doc.mime_type)) {
        const textResponse = await api.get(`/documents/${id}/preview`, { responseType: 'blob' })
        const text = await textResponse.data.text()
        setTextPreview(text.slice(0, 5000))
      } else {
        setTextPreview('')
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('documentDetail.loadDocumentFail'))
    }
  }

  const loadVersions = async () => {
    try {
      const response = await api.get(`/documents/${id}/versions`)
      setVersions(response.data.data || [])
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('documentDetail.loadVersionsFail'))
    }
  }

  const loadWorkflowData = async () => {
    try {
      const [timelineResponse, templatesResponse] = await Promise.all([
        api.get(`/workflows/instances/by-document/${id}`),
        api.get('/workflows/templates'),
      ])
      setWorkflowData(timelineResponse.data.data || { instances: [], timeline: [] })
      const seen = new Set<string>()
      const templates = (templatesResponse.data.data || []).filter((tpl: any) => {
        const key = String(tpl.name || '').trim().toLowerCase()
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
      })
      setWorkflowTemplates(templates)
      if (!selectedWorkflowId && templates.length > 0) {
        setSelectedWorkflowId(String(templates[0].id))
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('documentDetail.loadWorkflowFail'))
    }
  }

  const postComment = async (event: React.FormEvent) => {
    event.preventDefault()
    const text = newCommentText.trim()
    if (!text) return
    setCommentPosting(true)
    try {
      const res = await api.post(`/documents/${id}/comments`, { comment: text })
      const created = res.data?.data
      if (created) {
        setComments((prev) => [...prev, created])
      } else {
        await loadComments()
      }
      setNewCommentText('')
      toast.success(t('documentDetail.commentAdded'))
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('documentDetail.commentAddFail'))
    } finally {
      setCommentPosting(false)
    }
  }

  const deleteComment = async (commentId: number) => {
    const ok = window.confirm(t('documentDetail.confirmDeleteComment'))
    if (!ok) return
    try {
      await api.delete(`/comments/${commentId}`)
      setComments((prev) => prev.filter((c) => Number(c.id) !== Number(commentId)))
      toast.success(t('documentDetail.commentDeleted'))
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('documentDetail.commentDeleteFail'))
    }
  }

  useEffect(() => {
    setDocument(null)
    setTextPreview('')
    setBinaryPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return ''
    })
    previewRequestRef.current += 1

    const load = async () => {
      try {
        await loadDocument()
        await loadVersions()
        await loadWorkflowData()
        await loadCustomFields()
        await loadCategories()
        await loadComments()
      } catch (error: any) {
        toast.error(error.response?.data?.message || t('documentDetail.loadDocumentFail'))
      }
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab === 'workflow' || tab === 'versions' || tab === 'metadata' || tab === 'comments') {
      setActiveTab(tab)
    }
  }, [searchParams])

  useEffect(() => {
    if (!id || !document?.mime_type || String(document.id) !== String(id)) return

    if (!isPdfMime(document.mime_type) && !isImageMime(document.mime_type)) {
      setBinaryPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return ''
      })
      return
    }

    const requestId = ++previewRequestRef.current

    void (async () => {
      try {
        const res = await api.get(`/documents/${id}/preview`, { responseType: 'blob' })
        if (requestId !== previewRequestRef.current) return

        const blob = res.data as Blob
        const mime = blob.type || document.mime_type
        if (!blob.size || (!isPdfMime(mime) && !isImageMime(mime))) {
          setBinaryPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev)
            return ''
          })
          return
        }

        const objectUrl = URL.createObjectURL(blob)
        setBinaryPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return objectUrl
        })
      } catch {
        if (requestId !== previewRequestRef.current) return
        setBinaryPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return ''
        })
      }
    })()
  }, [document?.id, document?.mime_type, id])

  useEffect(() => {
    if (activeTab === 'comments' && id) {
      void loadComments()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, id])

  const categoryOptions = useMemo(() => {
    const extras = document?.category ? [String(document.category).trim()] : []
    return mergeDocumentCategories([...DOCUMENT_CATEGORY_PRESETS, ...categories, ...extras])
  }, [categories, document?.category])

  const changeDocumentCategory = async (nextCategory: string) => {
    const next = String(nextCategory || '').trim()
    if (!document || !next || next === String(document.category || '').trim()) return
    setCategorySaving(true)
    try {
      await api.put(`/documents/${id}/category`, { category: next })
      toast.success(t('documentDetail.categoryUpdated'))
      await loadDocument()
      await loadCategories()
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('documentDetail.categoryUpdateFail'))
    } finally {
      setCategorySaving(false)
    }
  }

  if (!document) {
    return (
      <Card title={t('documentDetail.loadingCardTitle')} subtitle={t('common.loading')}>
        <p className="text-sm text-muted-foreground">{t('documentDetail.loadingCardBody')}</p>
      </Card>
    )
  }

  const startWorkflow = async () => {
    if (!selectedWorkflowId) {
      toast.error(t('documentDetail.selectWorkflowTemplate'))
      return
    }
    try {
      await api.post(`/workflows/${selectedWorkflowId}/start`, { documentId: Number(id) })
      toast.success(t('documentDetail.workflowStarted'))
      await loadWorkflowData()
      await loadDocument()
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('documentDetail.workflowStartFail'))
    }
  }

  const actOnCurrentInstance = async (action: string) => {
    const instance =
      (workflowData.instances || []).find((item: any) => item.status === 'pending') ||
      workflowData.instances?.[0]
    if (!instance) {
      toast.error(t('documentDetail.noWorkflowInstance'))
      return
    }
    const comment =
      window.prompt(
        t('documentDetail.workflowPromptComment', { action: workflowTimelineAction(action, t) }),
        '',
      ) || ''
    try {
      await api.post(`/workflows/instances/${instance.id}/${action}`, { comment })
      toast.success(t('documentDetail.actionRecorded'))
      await loadWorkflowData()
      await loadDocument()
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('documentDetail.actionFail', { action }))
    }
  }

  const uploadVersion = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!versionFile) {
      toast.error(t('documentDetail.selectVersionFile'))
      return
    }
    try {
      const formData = new FormData()
      formData.append('file', versionFile)
      formData.append('comment', versionComment)
      await api.post(`/documents/${id}/versions`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      toast.success(t('documentDetail.versionUploaded'))
      setVersionFile(null)
      setVersionComment('')
      await loadVersions()
      await loadDocument()
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('documentDetail.versionUploadFail'))
    }
  }

  const saveCustomFields = async () => {
    try {
      await api.put(`/documents/${id}/custom-values`, { values: cfValues })
      toast.success(t('documentDetail.customFieldsSaved'))
      await loadCustomFields()
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('documentDetail.saveFailGeneric'))
    }
  }

  const duplicateDocument = async () => {
    try {
      const res = await api.post(`/documents/${id}/duplicate`)
      const newId = res.data.data?.id
      toast.success(t('documentDetail.duplicated'))
      if (newId) navigate(`/documents/${newId}`)
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('documentDetail.duplicateFail'))
    }
  }

  const openOfficePreview = async () => {
    setOfficePreviewLoading(true)
    setOfficePreviewLocalNotice(false)
    setOfficePreviewLoadError('')
    setOfficePreviewEmbedUrl('')
    try {
      const res = await api.get(`/documents/${id}/public-url`)
      const publicUrl = res.data.data?.publicUrl || ''
      const embedUrl = res.data.data?.embedUrl || ''
      if (isMicrosoftPreviewLikelyBlocked(publicUrl)) {
        setOfficePreviewLocalNotice(true)
        setOfficePreviewModalOpen(true)
        return
      }
      if (!embedUrl) {
        toast.info(t('documentDetail.previewUrlUnavailable'))
        return
      }
      setOfficePreviewEmbedUrl(embedUrl)
      setOfficePreviewModalOpen(true)
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('documentDetail.officePreviewFail'))
    } finally {
      setOfficePreviewLoading(false)
    }
  }

  const saveWatermarkEnabled = async (enabled: boolean) => {
    setWatermarkSaving(true)
    try {
      await api.put(`/documents/${id}/watermark`, { enabled })
      toast.success(t('documentDetail.watermarkSaved'))
      await loadDocument()
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('documentDetail.watermarkSaveFail'))
    } finally {
      setWatermarkSaving(false)
    }
  }

  const downloadCurrentDocument = async () => {
    if (!id || !document?.downloadUrl) return
    setDocDownloadBusy(true)
    try {
      await downloadBlobFromApi(
        toApiRelativePath(document.downloadUrl),
        document.original_name || 'download',
      )
    } catch (error) {
      toast.error(await parseAxiosBlobErrorMessage(error))
    } finally {
      setDocDownloadBusy(false)
    }
  }

  const downloadVersionDocument = async (version: any) => {
    if (!id || !version?.downloadUrl) return
    setVersionDownloadId(version.id)
    try {
      const fallback =
        document?.original_name != null && document.original_name !== ''
          ? `v${version.version_number}-${document.original_name}`
          : `version-${version.version_number}`
      await downloadBlobFromApi(toApiRelativePath(version.downloadUrl), fallback)
    } catch (error) {
      toast.error(await parseAxiosBlobErrorMessage(error))
    } finally {
      setVersionDownloadId(null)
    }
  }

  const permanentDelete = async () => {
    const ok = window.confirm(t('documentDetail.permanentDeleteConfirm'))
    if (!ok) return
    try {
      await api.delete(`/documents/${id}/permanent`)
      toast.success(t('documentDetail.deleted'))
      navigate('/documents')
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('common.failed'))
    }
  }

  const restoreVersion = async (versionId: number) => {
    const ok = window.confirm(t('documentDetail.restoreVersionConfirm'))
    if (!ok) return
    try {
      await api.post(`/documents/${id}/versions/${versionId}/restore`)
      toast.success(t('documentDetail.versionRestored'))
      await loadDocument()
      await loadVersions()
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('documentDetail.restoreFail'))
    }
  }

  const summarizeDocument = async () => {
    setSummaryOpen(true)
    setSummaryLoading(true)
    setSummaryText('')
    try {
      const res = await api.post(`/ai-studio/summarize/${id}`, {})
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
      const res = await api.post(`/ai-studio/document-chat/${id}`, { question: q })
      const answer = res.data.data?.answer || t('common.emDash')
      setChatMessages((prev) => [...prev, { role: 'assistant', text: answer }])
    } catch (error: any) {
      const msg = error.response?.data?.message || t('documentDetail.chatAiFail')
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', text: t('documentDetail.chatErrorPrefix', { msg }) },
      ])
      toast.error(msg)
    } finally {
      setChatLoading(false)
    }
  }

  const runMetadataExtraction = async (applyToCustomFields: boolean) => {
    setMetaAiLoading(true)
    try {
      const res = await api.post(`/ai-studio/extract-metadata/${id}`, { applyToCustomFields })
      setMetaAiOutput(res.data.data || null)
      toast.success(
        applyToCustomFields
          ? t('documentDetail.metadataExtractedApplied')
          : t('documentDetail.metadataExtracted'),
      )
      if (applyToCustomFields) {
        await loadCustomFields()
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
      const res = await api.post(`/ai-studio/version-compare/${id}`, {})
      setVersionCompareResult(res.data.data || null)
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('documentDetail.versionCompareFail'))
    } finally {
      setVersionCompareLoading(false)
    }
  }

  const sendByEmail = async (event: React.FormEvent) => {
    event.preventDefault()
    const recipients = emailForm.recipients
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
    if (recipients.length === 0) {
      toast.error(t('documentDetail.emailRecipientsRequired'))
      return
    }
    const extraIds = emailForm.extraIds
      .split(',')
      .map((v) => Number(v.trim()))
      .filter((n) => Number.isFinite(n) && n > 0 && n !== Number(id))
    setEmailSending(true)
    try {
      await api.post(`/documents/${id}/send-email`, {
        recipients,
        subject:
          emailForm.subject ||
          t('documentDetail.emailDefaultSubject', { title: document.title }),
        message: emailForm.message || '',
        mode: emailForm.mode,
        documentIds: extraIds,
      })
      toast.success(t('documentDetail.emailSent'))
      setEmailModalOpen(false)
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('documentDetail.emailSendFail'))
    } finally {
      setEmailSending(false)
    }
  }

  const tags = Array.isArray(document.tags) ? document.tags : []
  const acc = document.access
  const isOwner =
    user != null && document.owner_id != null && String(document.owner_id) === String(user.id)
  const rights = resolveDocumentAccess({ isAdmin, isOwner, access: acc })
  const canDownload = rights.canDownload
  const canViewDoc = document.access?.permissions?.view !== false
  const canManageV = rights.canManage
  const isOwnerOrAdmin = rights.role === 'owner'
  const canManageShares = isAdmin || isOwner
  const currentWorkflowInstance =
    (workflowData.instances || []).find((instance: any) => instance.status === 'pending') ||
    workflowData.instances?.[0] ||
    null
  const canActOnCurrentWorkflow = Boolean(currentWorkflowInstance?.can_act)
  const canComment = Boolean(document.access?.permissions?.view !== false)

  return (
    <div className="space-y-4">
      <Card
        title={document.title}
        subtitle={t('documentDetail.subtitleStatus', { status: statusLabel(document.status, t) })}
      >
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="metadata">{t('documentDetail.tabMetadata')}</TabsTrigger>
            <TabsTrigger value="versions">{t('documentDetail.tabVersions')}</TabsTrigger>
            <TabsTrigger value="workflow">{t('documentDetail.tabWorkflow')}</TabsTrigger>
            <TabsTrigger value="comments">{t('documentDetail.tabComments')}</TabsTrigger>
          </TabsList>

          <TabsContent value="metadata" className="space-y-4 pt-4">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">{t('documentDetail.categoryLabel')}</span>
                {!canManageV ? (
                  <span>{document.category}</span>
                ) : (
                  <Select
                    value={document.category || ''}
                    onValueChange={changeDocumentCategory}
                    disabled={categorySaving}
                  >
                    <SelectTrigger className="h-8 w-[220px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categoryOptions.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {categorySaving ? (
                  <span className="text-xs text-muted-foreground">{t('common.saving')}</span>
                ) : null}
              </div>
              <p>
                <span className="font-medium">{t('documentDetail.ownerLabel')}</span>{' '}
                {document.owner_name}
              </p>
              <p>
                <span className="font-medium">{t('documentDetail.mimeLabel')}</span>{' '}
                {document.mime_type}
              </p>
              <p>
                <span className="font-medium">{t('documentDetail.sizeLabel')}</span>{' '}
                {t('documentDetail.byteCount', { n: document.size })}
              </p>
              <div className="sm:col-span-2">
                <span className="font-medium">{t('documentDetail.tagsLabel')}</span>{' '}
                {tags.length === 0 ? (
                  <span>{t('common.emDash')}</span>
                ) : (
                  <span className="inline-flex flex-wrap gap-1 align-middle">
                    {tags.map((tag: string, i: number) => (
                      <span key={i} className={tagChipClass(tag)}>
                        {tag}
                      </span>
                    ))}
                  </span>
                )}
              </div>
              <p className="sm:col-span-2">
                <span className="font-medium">{t('documentDetail.descriptionLabel')}</span>{' '}
                {document.description || t('common.emDash')}
              </p>
              {rights.role === 'share' ? (
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  {t('documentDetail.shareLine', {
                    permission: rights.permission || acc?.permission || 'view',
                    download: canDownload ? t('common.yes') : t('common.no'),
                    versions: canManageV ? t('common.yes') : t('common.no'),
                  })}
                </p>
              ) : null}
            </div>

            {isPdfMime(document.mime_type) && canManageV ? (
              <div className="rounded-md border p-3">
                {String(document.visibility || '').toLowerCase() === 'private' ? (
                  <p className="text-xs text-muted-foreground">
                    {t('documentDetail.watermarkPrivateAuto')}
                  </p>
                ) : (
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={
                        document.watermark_enabled === true ||
                        document.watermark_enabled === 1 ||
                        Number(document.watermark_enabled) === 1
                      }
                      disabled={watermarkSaving}
                      onCheckedChange={(checked) => saveWatermarkEnabled(checked === true)}
                    />
                    <span>{t('documentDetail.watermarkToggle')}</span>
                  </label>
                )}
              </div>
            ) : null}

            {cfFields.length > 0 ? (
              <div className="space-y-3 rounded-md border p-3">
                <h4 className="text-sm font-medium">
                  {t('documentDetail.customFieldsHeading')}
                </h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  {cfFields.map((field: any) => (
                    <div key={field.id} className="space-y-1.5">
                      <Label htmlFor={`cf-${field.id}`}>{field.name}</Label>
                      {field.type === 'text' ? (
                        <Input
                          id={`cf-${field.id}`}
                          value={cfValues[field.id] ?? ''}
                          onChange={(e) =>
                            setCfValues((prev) => ({ ...prev, [field.id]: e.target.value }))
                          }
                        />
                      ) : null}
                      {field.type === 'number' ? (
                        <Input
                          id={`cf-${field.id}`}
                          type="number"
                          value={cfValues[field.id] ?? ''}
                          onChange={(e) =>
                            setCfValues((prev) => ({ ...prev, [field.id]: e.target.value }))
                          }
                        />
                      ) : null}
                      {field.type === 'date' ? (
                        <Input
                          id={`cf-${field.id}`}
                          type="date"
                          value={(cfValues[field.id] || '').slice(0, 10)}
                          onChange={(e) =>
                            setCfValues((prev) => ({ ...prev, [field.id]: e.target.value }))
                          }
                        />
                      ) : null}
                      {field.type === 'select' ? (
                        <Select
                          value={cfValues[field.id] ?? ''}
                          onValueChange={(v) =>
                            setCfValues((prev) => ({ ...prev, [field.id]: v }))
                          }
                        >
                          <SelectTrigger id={`cf-${field.id}`}>
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            {(Array.isArray(field.options)
                              ? field.options
                              : typeof field.options === 'string'
                                ? (() => {
                                    try {
                                      const p = JSON.parse(field.options)
                                      return Array.isArray(p) ? p : []
                                    } catch {
                                      return []
                                    }
                                  })()
                                : []
                            ).map((opt: any) => (
                              <SelectItem key={String(opt)} value={String(opt)}>
                                {String(opt)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : null}
                    </div>
                  ))}
                </div>
                {canManageV ? (
                  <Button type="button" variant="secondary" onClick={saveCustomFields}>
                    {t('documentDetail.saveCustomFieldsBtn')}
                  </Button>
                ) : null}
              </div>
            ) : null}

            <DocumentSharesPanel documentId={id} canManage={canManageShares} />
            <DocumentPublicLinksPanel documentId={id} canManage={canManageShares} />

            <div className="rounded-lg border bg-muted/30 p-4">
              <h4 className="mb-3 text-sm font-medium">{t('documentDetail.actionsHeading')}</h4>
              <div className="flex flex-wrap gap-2">
                {canDownload ? (
                  <Button
                    type="button"
                    onClick={downloadCurrentDocument}
                    disabled={docDownloadBusy}
                  >
                    {docDownloadBusy ? t('common.loading') : t('common.download')}
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {t('documentDetail.downloadNotAllowed')}
                  </span>
                )}
                {canViewDoc && isOfficeOnlineMime(document.mime_type) ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={openOfficePreview}
                    disabled={officePreviewLoading}
                  >
                    <FileText className="mr-2 size-4" />
                    {officePreviewLoading ? t('common.loading') : t('documentDetail.officePreviewBtn')}
                  </Button>
                ) : null}
                {isOwnerOrAdmin ? (
                  <Button type="button" variant="outline" onClick={duplicateDocument}>
                    {t('documentDetail.duplicate')}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setEmailForm((prev) => ({
                      ...prev,
                      subject:
                        prev.subject ||
                        t('documentDetail.emailDefaultSubject', { title: document.title }),
                    }))
                    setEmailModalOpen(true)
                  }}
                >
                  {t('documentDetail.sendEmail')}
                </Button>
                <Button type="button" variant="secondary" onClick={summarizeDocument}>
                  {t('documentDetail.summarizeAi')}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setChatOpen(true)}>
                  {t('documentDetail.chatWithAi')}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => runMetadataExtraction(false)}
                  disabled={metaAiLoading}
                >
                  {metaAiLoading ? t('documentDetail.extracting') : t('documentDetail.extractMetadataAi')}
                </Button>
                {canManageV ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => runMetadataExtraction(true)}
                    disabled={metaAiLoading}
                  >
                    {metaAiLoading
                      ? t('documentDetail.applying')
                      : t('documentDetail.autofillCustomFields')}
                  </Button>
                ) : null}
                <Button type="button" variant="outline" onClick={runVersionCompare}>
                  {t('documentDetail.compareVersionsAi')}
                </Button>
                {isAdmin ? (
                  <Button type="button" variant="destructive" onClick={permanentDelete}>
                    {t('documentDetail.permanentDelete')}
                  </Button>
                ) : null}
                <Button asChild variant="ghost">
                  <Link to="/documents">
                    <ArrowLeft className="mr-2 size-4" />
                    {t('documentDetail.backToDocuments')}
                  </Link>
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="versions" className="space-y-4 pt-4">
            {canManageV ? (
              <form onSubmit={uploadVersion} className="space-y-3 rounded-md border p-3">
                <div className="space-y-1.5">
                  <Label htmlFor="version-file">{t('documentDetail.newVersionFile')}</Label>
                  <Input
                    id="version-file"
                    type="file"
                    onChange={(event) => setVersionFile(event.target.files?.[0] || null)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="version-comment">{t('documentDetail.versionComment')}</Label>
                  <Input
                    id="version-comment"
                    value={versionComment}
                    onChange={(event) => setVersionComment(event.target.value)}
                    placeholder={t('documentDetail.versionNotePlaceholder')}
                  />
                </div>
                <Button type="submit">{t('documentDetail.uploadVersionBtn')}</Button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">{t('documentDetail.noVersionPermission')}</p>
            )}

            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('documentDetail.colVersion')}</TableHead>
                    <TableHead>{t('documentDetail.colSize')}</TableHead>
                    <TableHead>{t('documentDetail.colBy')}</TableHead>
                    <TableHead>{t('documentDetail.colComment')}</TableHead>
                    <TableHead>{t('documentDetail.colDate')}</TableHead>
                    <TableHead>{t('documentDetail.colActions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {versions.map((version: any) => (
                    <TableRow key={version.id}>
                      <TableCell>v{version.version_number}</TableCell>
                      <TableCell>{t('documentDetail.byteCount', { n: version.size })}</TableCell>
                      <TableCell>{version.created_by_name}</TableCell>
                      <TableCell>{version.comment || t('common.emDash')}</TableCell>
                      <TableCell>
                        {new Date(version.created_at).toLocaleString(uiLocale)}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {canDownload ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={versionDownloadId === version.id}
                              onClick={() => downloadVersionDocument(version)}
                            >
                              {versionDownloadId === version.id
                                ? t('common.loading')
                                : t('common.download')}
                            </Button>
                          ) : null}
                          {canManageV ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => restoreVersion(version.id)}
                            >
                              {t('documentDetail.restore')}
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {versions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        {t('documentDetail.noVersionsYet')}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="comments" className="space-y-4 pt-4">
            {canComment ? (
              <form onSubmit={postComment} className="space-y-2">
                <Label htmlFor="new-comment">{t('documentDetail.newComment')}</Label>
                <Textarea
                  id="new-comment"
                  rows={4}
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  placeholder={t('documentDetail.commentPlaceholder')}
                  maxLength={8000}
                />
                <Button type="submit" disabled={commentPosting || !newCommentText.trim()}>
                  {commentPosting ? t('documentDetail.publishing') : t('documentDetail.publish')}
                </Button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t('documentDetail.noCommentPermission')}
              </p>
            )}

            <h4 className="text-sm font-medium">{t('documentDetail.commentsHistory')}</h4>
            {commentsLoading ? (
              <p className="text-sm text-muted-foreground">{t('documentDetail.loadingComments')}</p>
            ) : comments.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('documentDetail.noCommentsYet')}</p>
            ) : (
              <ul className="divide-y">
                {comments.map((c: any) => {
                  const canDeleteThis =
                    isAdmin || (user && String(c.user_id) === String(user.id))
                  return (
                    <li key={c.id} className="space-y-2 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <strong className="text-sm">
                          {c.author_name || c.author_email || t('documentDetail.userFallback')}
                        </strong>
                        <span className="text-xs text-muted-foreground">
                          {c.created_at
                            ? new Date(c.created_at).toLocaleString(uiLocale)
                            : t('common.emDash')}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm">{c.comment}</p>
                      {canDeleteThis ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => deleteComment(c.id)}
                        >
                          {t('common.delete')}
                        </Button>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="workflow" className="space-y-4 pt-4">
            <Card
              title={t('documentDetail.startWorkflowTitle')}
              subtitle={t('documentDetail.startWorkflowSub')}
            >
              {canManageV ? (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="workflow-template">
                      {t('documentDetail.templateLabel')}
                    </Label>
                    <Select
                      value={selectedWorkflowId}
                      onValueChange={(v) => setSelectedWorkflowId(v)}
                    >
                      <SelectTrigger id="workflow-template" className="w-[260px]">
                        <SelectValue placeholder={t('documentDetail.chooseTemplate')} />
                      </SelectTrigger>
                      <SelectContent>
                        {workflowTemplates.map((template: any) => (
                          <SelectItem key={template.id} value={String(template.id)}>
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={startWorkflow}>{t('documentDetail.startWorkflowBtn')}</Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t('documentDetail.workflowManageRequired')}
                </p>
              )}
            </Card>

            <Card
              title={t('documentDetail.currentInstanceTitle')}
              subtitle={t('documentDetail.currentInstanceSub')}
            >
              {currentWorkflowInstance ? (
                <div className="space-y-2 text-sm">
                  <p>
                    <span className="font-medium">
                      {t('documentDetail.workflowNameLabel')}
                    </span>{' '}
                    {currentWorkflowInstance.workflow_name || t('common.emDash')}
                  </p>
                  <p>
                    <span className="font-medium">{t('documentDetail.statusLabel')}</span>{' '}
                    <Badge variant="outline">
                      {workflowInstanceStatus(currentWorkflowInstance.status, t)}
                    </Badge>
                  </p>
                  <p>
                    <span className="font-medium">{t('documentDetail.currentStepLabel')}</span>{' '}
                    {currentWorkflowInstance.step_order
                      ? t('documentDetail.stepN', { n: currentWorkflowInstance.step_order })
                      : t('common.emDash')}
                  </p>
                  <p>
                    <span className="font-medium">{t('documentDetail.assignedTo')}</span>{' '}
                    {currentWorkflowInstance.assignee_label || t('common.emDash')}
                  </p>
                  {currentWorkflowInstance.due_date ? (
                    <p>
                      <span className="font-medium">{t('documentDetail.dueDateLabel')}</span>{' '}
                      {new Date(currentWorkflowInstance.due_date).toLocaleString(uiLocale)}
                    </p>
                  ) : null}
                  {canActOnCurrentWorkflow ? (
                    <div className="flex flex-wrap gap-2 pt-2">
                      <Button
                        className="bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => actOnCurrentInstance('approve')}
                      >
                        {t('documentDetail.approve')}
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => actOnCurrentInstance('reject')}
                      >
                        {t('documentDetail.reject')}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => actOnCurrentInstance('request-changes')}
                      >
                        {t('documentDetail.requestChanges')}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {t('documentDetail.workflowActionsHint')}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t('documentDetail.noWorkflowForDoc')}
                </p>
              )}
            </Card>

            <Card
              title={t('documentDetail.timelineTitle')}
              subtitle={t('documentDetail.timelineSub')}
            >
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('documentDetail.colDate')}</TableHead>
                      <TableHead>{t('documentDetail.timelineActor')}</TableHead>
                      <TableHead>{t('documentDetail.timelineStep')}</TableHead>
                      <TableHead>{t('documentDetail.timelineAction')}</TableHead>
                      <TableHead>{t('documentDetail.timelineComment')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(workflowData.timeline || []).map((item: any) => (
                      <TableRow key={item.id}>
                        <TableCell>{new Date(item.created_at).toLocaleString(uiLocale)}</TableCell>
                        <TableCell>{item.actor_name || t('documentDetail.systemActor')}</TableCell>
                        <TableCell>
                          {item.step_order
                            ? t('documentDetail.stepN', { n: item.step_order })
                            : t('common.emDash')}
                        </TableCell>
                        <TableCell>{workflowTimelineAction(item.action, t)}</TableCell>
                        <TableCell>{item.comment || t('common.emDash')}</TableCell>
                      </TableRow>
                    ))}
                    {(workflowData.timeline || []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          {t('documentDetail.noTimelineYet')}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </Card>

      <Card title={t('documentDetail.previewTitle')} subtitle={t('documentDetail.previewSub')}>
        {isImageMime(document.mime_type) && !binaryPreviewUrl ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : null}
        {isImageMime(document.mime_type) && binaryPreviewUrl ? (
          <img
            src={binaryPreviewUrl}
            alt={document.title}
            className="max-w-full rounded-lg border"
          />
        ) : null}
        {isPdfMime(document.mime_type) && !binaryPreviewUrl ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : null}
        {isPdfMime(document.mime_type) && binaryPreviewUrl ? (
          <iframe
            src={binaryPreviewUrl}
            title={document.title}
            className="h-[70vh] w-full rounded-lg border"
          />
        ) : null}
        {isTextMime(document.mime_type) ? (
          <pre className="overflow-x-auto rounded-lg border bg-muted p-3 text-xs">
            {textPreview}
          </pre>
        ) : null}
        {isOfficeOnlineMime(document.mime_type) ? (
          <p className="text-xs text-muted-foreground">{t('documentDetail.officeHint')}</p>
        ) : null}
        {!isImageMime(document.mime_type) &&
        !isPdfMime(document.mime_type) &&
        !isTextMime(document.mime_type) &&
        !isOfficeOnlineMime(document.mime_type) ? (
          <p className="text-sm text-muted-foreground">{t('documentDetail.previewUnavailable')}</p>
        ) : null}
      </Card>

      <Modal
        open={summaryOpen}
        title={t('documentDetail.summaryModalTitle')}
        onClose={() => setSummaryOpen(false)}
      >
        {summaryLoading ? (
          <p className="text-sm text-muted-foreground">
            {t('documentDetail.summaryGenerating')}
          </p>
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
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const w = window.open('', '_blank')
              if (!w) return
              w.document.write(
                `<pre style="white-space:pre-wrap;font-family:Arial;padding:24px">${String(summaryText || '').replace(/</g, '&lt;')}</pre>`,
              )
              w.document.close()
              w.focus()
              w.print()
            }}
          >
            {t('documentDetail.exportPdf')}
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
            <p className="text-sm text-muted-foreground">
              {t('documentDetail.chatEmptyHint')}
            </p>
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
          <p className="text-sm text-muted-foreground">
            {t('documentDetail.versionCompareLoading')}
          </p>
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

      <Modal
        open={officePreviewModalOpen}
        title={t('documentDetail.officePreviewModalTitle')}
        onClose={() => {
          setOfficePreviewModalOpen(false)
          setOfficePreviewEmbedUrl('')
          setOfficePreviewLocalNotice(false)
          setOfficePreviewPublicHelpOpen(false)
          setOfficePreviewLoadError('')
        }}
      >
        {officePreviewLocalNotice ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            <Trans
              i18nKey="documentDetail.officePreviewLocalUnavailable"
              components={{
                learnMore: (
                  <button
                    type="button"
                    className="text-primary underline-offset-4 hover:underline"
                    onClick={() => setOfficePreviewPublicHelpOpen(true)}
                  />
                ),
              }}
            />
          </p>
        ) : null}
        {officePreviewLoadError ? (
          <p className={officePreviewLocalNotice ? 'mt-3 text-sm text-destructive' : 'text-sm text-destructive'}>
            {officePreviewLoadError}
          </p>
        ) : null}
        {officePreviewEmbedUrl ? (
          <>
            <div className="mt-3 overflow-hidden rounded-lg border">
              <iframe
                className="aspect-16/10 w-full"
                title={t('documentDetail.officeIframeTitle')}
                src={officePreviewEmbedUrl}
                onError={() =>
                  setOfficePreviewLoadError(t('documentDetail.officePreviewServiceError'))
                }
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {t('documentDetail.officePreviewIframeHint')}
            </p>
          </>
        ) : null}
      </Modal>

      <Modal
        open={officePreviewPublicHelpOpen}
        title={t('documentDetail.officePreviewHelpModalTitle')}
        onClose={() => setOfficePreviewPublicHelpOpen(false)}
      >
        <div className="space-y-3 text-sm">
          <p>{t('documentDetail.officePreviewHelpIntro')}</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>{t('documentDetail.officePreviewHelpStep1')}</li>
            <li>{t('documentDetail.officePreviewHelpStep2')}</li>
            <li>{t('documentDetail.officePreviewHelpStep3')}</li>
          </ul>
          <p className="text-xs text-muted-foreground">
            {t('documentDetail.officePreviewHelpNote')}
          </p>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOfficePreviewPublicHelpOpen(false)}
            >
              {t('documentDetail.officePreviewHelpClose')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={emailModalOpen}
        title={t('documentDetail.emailModalTitle')}
        onClose={() => setEmailModalOpen(false)}
      >
        <form onSubmit={sendByEmail} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email-recipients">{t('documentDetail.recipientsLabel')}</Label>
            <Input
              id="email-recipients"
              value={emailForm.recipients}
              onChange={(e) => setEmailForm((p) => ({ ...p, recipients: e.target.value }))}
              placeholder={t('documentDetail.recipientsPlaceholder')}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email-subject">{t('documentDetail.subjectLabel')}</Label>
            <Input
              id="email-subject"
              value={emailForm.subject}
              onChange={(e) => setEmailForm((p) => ({ ...p, subject: e.target.value }))}
              placeholder={t('documentDetail.subjectPlaceholder')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email-message">{t('documentDetail.messageLabel')}</Label>
            <Textarea
              id="email-message"
              rows={4}
              value={emailForm.message}
              onChange={(e) => setEmailForm((p) => ({ ...p, message: e.target.value }))}
              placeholder={t('documentDetail.messagePlaceholder')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email-mode">{t('documentDetail.modeLabel')}</Label>
            <Select
              value={emailForm.mode}
              onValueChange={(v) => setEmailForm((p) => ({ ...p, mode: v }))}
            >
              <SelectTrigger id="email-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="link">{t('documentDetail.modeLink')}</SelectItem>
                <SelectItem value="attachment">{t('documentDetail.modeAttachment')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email-extra">{t('documentDetail.extraDocIdsLabel')}</Label>
            <Input
              id="email-extra"
              value={emailForm.extraIds}
              onChange={(e) => setEmailForm((p) => ({ ...p, extraIds: e.target.value }))}
              placeholder={t('documentDetail.extraDocIdsPlaceholder')}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={emailSending}>
              {emailSending ? t('documentDetail.sendingShort') : t('documentDetail.send')}
            </Button>
            <Button type="button" variant="outline" onClick={() => setEmailModalOpen(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
