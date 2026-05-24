import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Archive,
  Download,
  Eye,
  Mic,
  Search,
  Sparkles,
  Trash2,
  Upload as UploadIcon,
  X,
} from 'lucide-react'
import api, {
  downloadBlobFromApi,
  parseAxiosBlobErrorMessage,
  toApiRelativePath,
} from '../services/api/client'
import { useAdminAccess } from '../hooks/useAdminAccess'
import Card from '../components/ui/Card'
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
import { Separator } from '@/components/shadcn/separator'
import DataTable, { type DataTableColumn } from '../components/ui/DataTable'
import { useToast } from '../state/ToastContext'
import { statusBadgeClass, statusLabel, tagChipClass } from '../utils/documentUi'
import { cn } from '@/lib/utils'
import i18n from '../i18n'

function parseCustomFieldOptions(options: any) {
  if (Array.isArray(options)) return options
  if (typeof options !== 'string' || !options.trim()) return []
  try {
    const parsed = JSON.parse(options)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return options
      .split(',')
      .map((option: string) => option.trim())
      .filter(Boolean)
  }
}

export default function DocumentsListPage() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const isAdmin = useAdminAccess()
  const toast = useToast()
  const [documents, setDocuments] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [filters, setFilters] = useState(() => {
    const archivable = searchParams.get('archivable') === '1' ? '1' : ''
    return {
      search: '',
      category: '',
      status: archivable ? 'active' : '',
      departmentId: '',
      archivable,
    }
  })
  const [departments, setDepartments] = useState<any[]>([])
  const [maxUploadBytes, setMaxUploadBytes] = useState(10 * 1024 * 1024)
  const [meta, setMeta] = useState({
    title: '',
    category: 'Général',
    visibility: 'private',
    tags: '',
    description: '',
  })
  const [pendingDocs, setPendingDocs] = useState<any[]>([])
  const [aiSuggestLoading, setAiSuggestLoading] = useState(false)
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null)
  const [naturalPhrase, setNaturalPhrase] = useState('')
  const [naturalLoading, setNaturalLoading] = useState(false)
  const [, setTotal] = useState(0)
  const [voiceListening, setVoiceListening] = useState(false)
  const [workflowHint, setWorkflowHint] = useState<any>(null)
  const [customFields, setCustomFields] = useState<any[]>([])
  const [customValues, setCustomValues] = useState<Record<string, string>>({})
  const [selectedForReport, setSelectedForReport] = useState<number[]>([])
  const [reportLoading, setReportLoading] = useState(false)
  const [similarDocId, setSimilarDocId] = useState('')
  const [similarLoading, setSimilarLoading] = useState(false)
  const [similarDocs, setSimilarDocs] = useState<any[]>([])
  const [qaQuestion, setQaQuestion] = useState('')
  const [qaLoading, setQaLoading] = useState(false)
  const [docDownloadId, setDocDownloadId] = useState<number | null>(null)
  const [qaAnswer, setQaAnswer] = useState('')
  const [vectorQuery, setVectorQuery] = useState('')
  const [vectorLoading, setVectorLoading] = useState(false)
  const [vectorMode, setVectorMode] = useState('')

  const loadPending = async () => {
    if (!isAdmin) {
      setPendingDocs([])
      return
    }
    try {
      const res = await api.get('/documents/pending')
      setPendingDocs(res.data.data || [])
    } catch {
      setPendingDocs([])
    }
  }

  const loadDocuments = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.search) params.set('search', filters.search)
      if (filters.category) params.set('category', filters.category)
      if (filters.status) params.set('status', filters.status)
      if (filters.departmentId) params.set('departmentId', filters.departmentId)
      if (filters.archivable) params.set('archivable', filters.archivable)
      const ownerId = searchParams.get('ownerId')
      if (isAdmin && ownerId) params.set('ownerId', ownerId)
      params.set('limit', '50')
      params.set('page', '1')
      const response = await api.get(`/documents?${params.toString()}`)
      setDocuments(response.data.data || [])
      await loadPending()
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('documentsList.loadError'))
    } finally {
      setLoading(false)
    }
  }

  const downloadDocumentRow = async (doc: any) => {
    if (!doc?.downloadUrl) return
    setDocDownloadId(doc.id)
    try {
      await downloadBlobFromApi(
        toApiRelativePath(doc.downloadUrl),
        doc.original_name || `document-${doc.id}`,
      )
    } catch (error) {
      toast.error(await parseAxiosBlobErrorMessage(error))
    } finally {
      setDocDownloadId(null)
    }
  }

  const removeFileAt = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  useEffect(() => {
    const boot = async () => {
      try {
        const [depts, pub] = await Promise.all([
          api.get('/departments').catch(() => ({ data: { data: [] } })),
          api.get('/settings/public').catch(() => ({ data: { data: {} } })),
        ])
        setDepartments(depts.data.data || [])
        const mb = Number(pub.data?.data?.maxUploadSizeBytes)
        if (Number.isFinite(mb) && mb > 0) setMaxUploadBytes(mb)
      } catch {
        /* ignore */
      }
    }
    void boot()
  }, [])

  useEffect(() => {
    void loadDocuments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, isAdmin])

  useEffect(() => {
    let cancelled = false
    const loadCustomFields = async () => {
      try {
        const res = await api.get('/custom-fields/active', { params: { category: meta.category || '' } })
        if (!cancelled) setCustomFields(Array.isArray(res.data?.data) ? res.data.data : [])
      } catch {
        if (!cancelled) setCustomFields([])
      }
    }
    void loadCustomFields()
    return () => {
      cancelled = true
    }
  }, [meta.category])

  const onUpload = async (event: React.FormEvent) => {
    event.preventDefault()
    const selectedFiles =
      files.length > 0 ? files : Array.from(fileInputRef.current?.files || [])

    if (selectedFiles.length === 0) {
      toast.error(t('documentsList.selectFile'))
      return
    }
    const tooLarge = selectedFiles.filter((f) => f.size > maxUploadBytes)
    if (tooLarge.length > 0) {
      toast.error(
        t('documentsList.fileTooLarge', {
          mb: Math.round(maxUploadBytes / 1048576),
          names: tooLarge.map((f) => f.name).join(', '),
        }),
      )
      return
    }
    try {
      const first = selectedFiles[0]
      if (first) {
        try {
          const fd = new FormData()
          fd.append('file', first)
          const hint = await api.post('/ai-studio/workflow-suggest-upload', fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          })
          setWorkflowHint(hint.data.data || null)
        } catch {
          setWorkflowHint(null)
        }
      }

      if (first) {
        try {
          const fdCheck = new FormData()
          fdCheck.append('file', first)
          const dup = await api.post('/ai-studio/deduplicate-upload-check', fdCheck, {
            headers: { 'Content-Type': 'multipart/form-data' },
          })
          const similar = dup.data?.data?.similar || []
          if (similar.length > 0) {
            const top = similar[0]
            const proceed = window.confirm(
              t('documentsList.similarPrompt', { pct: top.similarity, title: top.title || top.original_name }),
            )
            if (!proceed) return
          }
        } catch {
          /* IA indisponible */
        }
      }

      const formData = new FormData()
      selectedFiles.forEach((file) => formData.append('files', file))
      Object.entries(meta).forEach(([key, value]) => formData.append(key, value))
      const filledCustomValues = Object.fromEntries(
        Object.entries(customValues).filter(([, value]) => String(value ?? '').trim() !== ''),
      )
      if (Object.keys(filledCustomValues).length > 0) {
        formData.append('customValues', JSON.stringify(filledCustomValues))
      }
      if (!formData.getAll('files').length) {
        toast.error(t('documentsList.selectFile'))
        return
      }
      await api.post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      toast.success(
        meta.visibility === 'private' && !isAdmin
          ? t('documentsList.uploadPending')
          : t('documentsList.uploadOk'),
      )
      setFiles([])
      setCustomValues({})
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      void loadDocuments()
    } catch (error: any) {
      const code = error.response?.data?.code
      if (code === 'SENSITIVE_CONTENT') {
        toast.error(error.response?.data?.message || t('documentsList.aiSensitive'))
      } else {
        toast.error(error.response?.data?.message || t('documentsList.uploadFail'))
      }
    }
  }

  const approveDoc = async (id: number) => {
    try {
      await api.put(`/documents/${id}/approve`)
      toast.success(t('documentsList.approved'))
      void loadDocuments()
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('common.failed'))
    }
  }

  const rejectDoc = async (id: number) => {
    if (!window.confirm(t('documentsList.rejectConfirm', 'Rejeter et supprimer ce document ?'))) return
    try {
      await api.delete(`/documents/${id}/reject`)
      toast.info(t('documentsList.rejectedInfo'))
      void loadDocuments()
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('common.failed'))
    }
  }

  const toggleReportSelect = (docId: number) => {
    setSelectedForReport((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId],
    )
  }

  const generateMultiDocReport = async () => {
    if (selectedForReport.length === 0) {
      toast.error(t('documentsList.selectDocReport'))
      return
    }
    setReportLoading(true)
    try {
      const res = await api.post('/ai-studio/report-multi-docs', { documentIds: selectedForReport })
      const txt = res.data.data?.reportText || '—'
      const w = window.open('', '_blank')
      if (w) {
        w.document.write(
          `<pre style="white-space:pre-wrap;font-family:Arial;padding:24px">${txt.replace(/</g, '&lt;')}</pre>`,
        )
        w.document.close()
        w.focus()
        w.print()
      }
      toast.success(t('documentsList.reportOk'))
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('documentsList.reportFail'))
    } finally {
      setReportLoading(false)
    }
  }

  const handleNaturalSearch = async () => {
    const phrase = naturalPhrase.trim()
    if (!phrase) return
    setNaturalLoading(true)
    try {
      const response = await api.post('/ai-studio/search-natural', { phrase })
      const docs =
        (Array.isArray(response.data?.documents) ? response.data.documents : null) ||
        (Array.isArray(response.data?.data?.results) ? response.data.data.results : [])
      setDocuments(docs)
      setTotal(Number(response.data?.total || docs.length || 0))
      const f = response.data?.resolvedFilters || response.data?.data?.filters || {}
      setFilters((prev) => ({
        ...prev,
        search: f.search || '',
        category: f.category || '',
        status: f.status || '',
      }))
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('documentsList.naturalSearchFail'))
    } finally {
      setNaturalLoading(false)
    }
  }

  const applySearchResults = (docs: any[], mode: string, fallback: boolean) => {
    setDocuments(docs)
    setTotal(docs.length)
    const modeLabel = fallback ? `${mode} (${t('documentsList.vectorFallbackHint')})` : mode
    setVectorMode(modeLabel)
  }

  const handleVectorSearch = async () => {
    const q = vectorQuery.trim()
    if (!q) {
      void loadDocuments()
      setVectorMode('')
      return
    }
    setVectorLoading(true)
    try {
      const response = await api.post('/documents/search-vector', { q, limit: 25 })
      let docs = Array.isArray(response.data?.data) ? response.data.data : []
      let mode = response.data?.meta?.mode || 'vector'
      let fallback = Boolean(response.data?.meta?.fallback)
      if (docs.length === 0) {
        const classic = await api.get('/documents/search', { params: { q, page: 1, limit: 25 } })
        docs =
          (Array.isArray(classic.data?.documents) ? classic.data.documents : null) ||
          (Array.isArray(classic.data?.data) ? classic.data.data : [])
        mode = 'classic-fallback'
        fallback = true
      }
      applySearchResults(docs, mode, fallback)
      if (docs.length === 0) {
        toast.info(t('documentsList.vectorSearchEmpty'))
      } else {
        toast.success(
          fallback
            ? t('documentsList.vectorSearchOkFallback', { count: docs.length })
            : t('documentsList.vectorSearchOk', { count: docs.length }),
        )
      }
    } catch {
      try {
        const classic = await api.get('/documents/search', { params: { q, page: 1, limit: 25 } })
        const docs =
          (Array.isArray(classic.data?.documents) ? classic.data.documents : null) ||
          (Array.isArray(classic.data?.data) ? classic.data.data : [])
        applySearchResults(docs, 'classic-fallback', true)
        if (docs.length > 0) {
          toast.success(t('documentsList.vectorSearchOkFallback', { count: docs.length }))
        } else {
          toast.info(t('documentsList.vectorSearchEmpty'))
        }
      } catch (e2: any) {
        toast.error(e2.response?.data?.message || t('documentsList.vectorSearchFail'))
      }
    } finally {
      setVectorLoading(false)
    }
  }

  const handleSearch = async () => {
    const q = searchQuery.trim()
    if (!q) {
      void loadDocuments()
      return
    }
    setLoading(true)
    try {
      const response = await api.get('/documents/search', {
        params: { q, page: 1, limit: 20 },
      })
      const docs =
        (Array.isArray(response.data?.documents) ? response.data.documents : null) ||
        (Array.isArray(response.data?.data) ? response.data.data : [])
      setDocuments(docs)
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('documentsList.naturalSearchFail'))
    } finally {
      setLoading(false)
    }
  }

  const startVoiceSearch = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      toast.error(t('documentsList.voiceUnsupported'))
      return
    }
    const recog = new SpeechRecognition()
    recog.lang = i18n.language?.startsWith('en') ? 'en-US' : 'fr-FR'
    recog.interimResults = false
    recog.maxAlternatives = 1
    setVoiceListening(true)
    recog.onresult = (event: any) => {
      const txt = String(event.results?.[0]?.[0]?.transcript || '').trim()
      if (txt) {
        setNaturalPhrase(txt)
        void handleNaturalSearch()
        toast.success(t('documentsList.voiceCommandOk', { text: txt }))
      }
    }
    recog.onerror = () => toast.error(t('documentsList.voiceFail'))
    recog.onend = () => setVoiceListening(false)
    recog.start()
  }

  const fetchSimilarRecommendations = async () => {
    const id = Number(similarDocId || 0)
    if (!id) {
      toast.error(t('documentsList.similarIdInvalid'))
      return
    }
    setSimilarLoading(true)
    try {
      const res = await api.get(`/ai-studio/recommend-similar/${id}`)
      setSimilarDocs(res.data.data?.similar || [])
      toast.success(t('documentsList.similarOk'))
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('documentsList.similarFail'))
    } finally {
      setSimilarLoading(false)
    }
  }

  const askMultiDocs = async () => {
    if (selectedForReport.length === 0) {
      toast.error(t('documentsList.qaSelect'))
      return
    }
    if (!qaQuestion.trim()) {
      toast.error(t('documentsList.qaQuestionRequired'))
      return
    }
    setQaLoading(true)
    try {
      const res = await api.post('/ai-studio/multi-doc-qa', {
        documentIds: selectedForReport,
        question: qaQuestion,
      })
      setQaAnswer(res.data.data?.answer || '')
      toast.success(t('documentsList.qaOk'))
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('documentsList.qaFail'))
    } finally {
      setQaLoading(false)
    }
  }

  const suggestClassification = async () => {
    const selectedFiles = files.length > 0 ? files : Array.from(fileInputRef.current?.files || [])
    if (selectedFiles.length === 0) {
      toast.error(t('documentsList.classifySelect'))
      return
    }
    setAiSuggestLoading(true)
    try {
      const f = selectedFiles[0]
      const fd = new FormData()
      fd.append('file', f)
      const res = await api.post('/ai-studio/classify', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const out = String(res.data.data?.output || '')
      setAiSuggestion(out)
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('documentsList.suggestFail'))
    } finally {
      setAiSuggestLoading(false)
    }
  }

  const applySuggestion = () => {
    if (!aiSuggestion) return
    try {
      const parsed = JSON.parse(aiSuggestion)
      setMeta((prev) => ({
        ...prev,
        category: parsed.category || prev.category,
        tags: Array.isArray(parsed.tags) ? parsed.tags.join(', ') : prev.tags,
      }))
      toast.success(t('documentsList.suggestApplied'))
    } catch {
      toast.error(t('documentsList.suggestInvalidJson'))
    }
  }

  const onArchive = async (id: number) => {
    try {
      await api.put(`/documents/${id}/archive`)
      toast.success(t('documentsList.archived'))
      void loadDocuments()
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('documentsList.archiveFail'))
    }
  }

  const onDeleteToTrash = async (id: number) => {
    try {
      await api.put(`/documents/${id}/delete`)
      toast.success(t('documentsList.trashed'))
      void loadDocuments()
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('documentsList.trashFail'))
    }
  }

  const rows = useMemo(
    () =>
      documents.map((doc: any) => ({
        id: doc.id,
        title: doc.title,
        category: doc.category,
        status: doc.status,
        visibility: doc.visibility || 'private',
        owner: doc.owner_name,
        tagsList: Array.isArray(doc.tags) ? doc.tags : [],
        downloadUrl: doc.downloadUrl,
        original_name: doc.original_name,
      })),
    [documents],
  )

  const columns: DataTableColumn<any>[] = useMemo(
    () => [
      { key: 'title', label: t('common.title') },
      { key: 'category', label: t('common.category') },
      {
        key: 'visibility',
        label: t('common.visibility'),
        render: (row) => (row.visibility === 'public' ? t('common.public') : t('common.private')),
      },
      {
        key: 'status',
        label: t('common.status'),
        render: (row) => (
          <span className={statusBadgeClass(row.status)}>{statusLabel(row.status, t)}</span>
        ),
      },
      {
        key: 'tags',
        label: t('common.tags'),
        render: (row) => (
          <span className="flex flex-wrap gap-1">
            {row.tagsList.length === 0 ? (
              <span className="text-xs text-muted-foreground">{t('common.emDash')}</span>
            ) : (
              row.tagsList.map((tag: string, i: number) => (
                <span key={i} className={tagChipClass(tag)}>
                  {tag}
                </span>
              ))
            )}
          </span>
        ),
      },
      { key: 'owner', label: t('common.owner') },
      {
        key: 'actions',
        label: t('common.actions'),
        render: (row) => (
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="icon" className="size-7" title={`${t('common.open')} — ${row.title || row.id}`}>
              <Link to={`/documents/${row.id}`}>
                <Eye className="size-4" />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              title={t('common.download')}
              disabled={docDownloadId === row.id}
              onClick={() => downloadDocumentRow(row)}
            >
              <Download className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-amber-600 hover:text-amber-700"
              title={t('documentsList.archiveBtn')}
              onClick={() => onArchive(row.id)}
            >
              <Archive className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-destructive hover:text-destructive"
              title={t('documentsList.deleteBtn')}
              onClick={() => onDeleteToTrash(row.id)}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, docDownloadId],
  )

  const ownerIdFilter = searchParams.get('ownerId')

  return (
    <div className="space-y-4">
      {isAdmin && ownerIdFilter ? (
        <Card
          title={t('documentsList.adminFilterTitle')}
          subtitle={t('documentsList.adminFilterSub', { id: ownerIdFilter })}
        >
          <Button asChild variant="outline" size="sm">
            <Link to="/documents">{t('documentsList.filterOwnerClear')}</Link>
          </Button>
        </Card>
      ) : null}

      {isAdmin && pendingDocs.length > 0 ? (
        <Card title={t('documentsList.pendingTitle')} subtitle={t('documentsList.pendingSub')}>
          <ul className="divide-y">
            {pendingDocs.map((d: any) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <strong className="block truncate">{d.title}</strong>
                  <p className="truncate text-xs text-muted-foreground">
                    {d.owner_name} · {d.original_name}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => approveDoc(d.id)} size="sm">
                    {t('documentsList.approveBtn')}
                  </Button>
                  <Button onClick={() => rejectDoc(d.id)} variant="destructive" size="sm">
                    {t('documentsList.rejectBtn')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card
        title={t('documentsList.uploadTitle')}
        subtitle={t('documentsList.uploadSub', { mb: Math.round(maxUploadBytes / 1048576) })}
      >
        <form onSubmit={onUpload} className="space-y-4">
          <div
            className={cn(
              'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-6 transition-colors',
              dragging ? 'border-primary bg-primary/5' : 'border-border bg-muted/30',
            )}
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              setFiles(Array.from(event.dataTransfer.files || []))
            }}
          >
            <UploadIcon className="size-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {files.length > 0
                ? t('documentsList.filesSelected', { n: files.length })
                : t('documentsList.dropHere')}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={(event) => setFiles(Array.from(event.target.files || []))}
              className="block w-full max-w-sm text-sm file:mr-2 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1 file:text-sm file:font-medium file:text-foreground hover:file:bg-accent"
            />
            {files.length > 0 ? (
              <ul className="flex w-full flex-wrap gap-2">
                {files.map((file, idx) => (
                  <li
                    key={`${file.name}-${idx}`}
                    className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs"
                  >
                    <span className="max-w-[180px] truncate">{file.name}</span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => removeFileAt(idx)}
                    >
                      <X className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="upload-title">{t('common.title')}</Label>
              <Input
                id="upload-title"
                value={meta.title}
                onChange={(event) => setMeta((prev) => ({ ...prev, title: event.target.value }))}
                placeholder={t('documentsList.titlePlaceholder')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="upload-category">{t('common.category')}</Label>
              <Input
                id="upload-category"
                value={meta.category}
                onChange={(event) => setMeta((prev) => ({ ...prev, category: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="upload-visibility">{t('common.visibility')}</Label>
              <Select
                value={meta.visibility}
                onValueChange={(v) => setMeta((prev) => ({ ...prev, visibility: v }))}
              >
                <SelectTrigger id="upload-visibility">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">{t('documentsList.visibilityPrivate')}</SelectItem>
                  <SelectItem value="public">{t('documentsList.visibilityPublic')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="upload-tags">{t('common.tags')}</Label>
              <Input
                id="upload-tags"
                value={meta.tags}
                onChange={(event) => setMeta((prev) => ({ ...prev, tags: event.target.value }))}
                placeholder={t('documentsList.tagsPlaceholder')}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="upload-description">{t('documentsList.description')}</Label>
              <Textarea
                id="upload-description"
                rows={3}
                value={meta.description}
                onChange={(event) => setMeta((prev) => ({ ...prev, description: event.target.value }))}
              />
            </div>
          </div>

          {customFields.length > 0 ? (
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium">{t('documentsList.customFieldsHeader')}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {customFields.map((field: any) => (
                  <div key={field.id} className="space-y-1.5">
                    <Label htmlFor={`cf-${field.id}`}>{field.name}</Label>
                    {field.type === 'select' ? (
                      <Select
                        value={customValues[field.id] ?? ''}
                        onValueChange={(v) =>
                          setCustomValues((prev) => ({ ...prev, [field.id]: v }))
                        }
                      >
                        <SelectTrigger id={`cf-${field.id}`}>
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          {parseCustomFieldOptions(field.options).map((option: any) => (
                            <SelectItem key={String(option)} value={String(option)}>
                              {String(option)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id={`cf-${field.id}`}
                        type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
                        value={customValues[field.id] ?? ''}
                        onChange={(event) =>
                          setCustomValues((prev) => ({ ...prev, [field.id]: event.target.value }))
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit">
              <UploadIcon className="mr-2 size-4" />
              {t('documentsList.uploadBtn')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={suggestClassification}
              disabled={aiSuggestLoading}
            >
              <Sparkles className="mr-2 size-4" />
              {aiSuggestLoading ? t('documentsList.aiAnalyzing') : t('documentsList.aiSuggest')}
            </Button>
            {aiSuggestion ? (
              <>
                <Button type="button" variant="secondary" onClick={applySuggestion}>
                  {t('documentsList.applyAllSuggestion')}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setAiSuggestion(null)}>
                  {t('documentsList.ignoreSuggestion')}
                </Button>
              </>
            ) : null}
          </div>

          {aiSuggestion ? (
            <pre className="rounded-md border bg-muted p-3 text-xs whitespace-pre-wrap">{aiSuggestion}</pre>
          ) : null}

          {workflowHint ? (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <strong>{t('documentsList.workflowSuggestTitle')}</strong>{' '}
              {workflowHint.suggestedWorkflow
                ? t('documentsList.workflowSuggestNamed', {
                    name: workflowHint.suggestedWorkflow.name,
                    category: workflowHint.detectedCategory,
                  })
                : t('documentsList.workflowDetectedCategory', { cat: workflowHint.detectedCategory })}
              <p className="mt-1 text-xs text-muted-foreground">{workflowHint.rationale}</p>
            </div>
          ) : null}
        </form>
      </Card>

      <Card
        title={t('documentsList.listTitle')}
        subtitle={loading ? t('common.loading') : t('documentsList.listSub')}
      >
        <div className="space-y-3">
          {/* Search bars */}
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="quick-search">{t('common.search')}</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="quick-search"
                    type="text"
                    placeholder={t('documentsList.searchPh')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void handleSearch()
                      }
                    }}
                    className="pl-9"
                  />
                </div>
                <Button variant="outline" onClick={handleSearch} type="button">
                  {t('common.search')}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="natural">{t('documentsList.naturalSearchLabel')}</Label>
              <div className="flex gap-2">
                <Input
                  id="natural"
                  value={naturalPhrase}
                  onChange={(e) => setNaturalPhrase(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void handleNaturalSearch()
                    }
                  }}
                  placeholder={t('documentsList.naturalPh')}
                />
                <Button onClick={handleNaturalSearch} disabled={naturalLoading} type="button">
                  {t('documentsList.searchBtn')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={startVoiceSearch}
                  disabled={voiceListening}
                  title={voiceListening ? t('documentsList.voiceListening') : t('documentsList.voice')}
                >
                  <Mic className={cn('size-4', voiceListening && 'animate-pulse text-rose-500')} />
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="vector">
                <Sparkles className="mr-1 inline size-3.5" />
                {t('documentsList.vectorSearchLabel')}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="vector"
                  value={vectorQuery}
                  onChange={(e) => setVectorQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void handleVectorSearch()
                    }
                  }}
                  placeholder={t('documentsList.vectorSearchPh')}
                />
                <Button onClick={handleVectorSearch} disabled={vectorLoading} variant="secondary" type="button">
                  {vectorLoading ? t('documentsList.vectorSearching') : t('documentsList.vectorSearchBtn')}
                </Button>
              </div>
              {vectorMode ? (
                <p className="text-xs text-muted-foreground">
                  {t('documentsList.vectorMode', { mode: vectorMode })}
                </p>
              ) : null}
            </div>
          </div>

          <Separator />

          {/* Filters */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="f-search">{t('common.search')}</Label>
              <Input
                id="f-search"
                value={filters.search}
                onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-category">{t('common.category')}</Label>
              <Input
                id="f-category"
                value={filters.category}
                onChange={(event) => setFilters((prev) => ({ ...prev, category: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-status">{t('common.status')}</Label>
              <Input
                id="f-status"
                value={filters.status}
                onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-dept">{t('documentsList.departmentOwner')}</Label>
              <Select
                value={filters.departmentId || 'all'}
                onValueChange={(v) =>
                  setFilters((prev) => ({ ...prev, departmentId: v === 'all' ? '' : v }))
                }
              >
                <SelectTrigger id="f-dept">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.all')}</SelectItem>
                  {departments.map((d: any) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Button onClick={loadDocuments} type="button" size="sm">
              {t('documentsList.applyFilters')}
            </Button>
          </div>

          <DataTable columns={columns} rows={rows} loading={loading} pageSize={8} />

          {/* Multi-doc selection */}
          {documents.length > 0 ? (
            <div className="flex flex-wrap gap-2 rounded-md border bg-muted/30 p-3 text-sm">
              <span className="text-xs font-medium text-muted-foreground">
                {t('documentsList.selectIdsLabel', 'Sélection pour IA')}:
              </span>
              {documents.slice(0, 30).map((doc: any) => (
                <label
                  key={`rpt-${doc.id}`}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border bg-card px-2 py-1 hover:bg-accent"
                >
                  <Checkbox
                    checked={selectedForReport.includes(doc.id)}
                    onCheckedChange={() => toggleReportSelect(doc.id)}
                  />
                  <span className="text-xs">#{doc.id}</span>
                </label>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={generateMultiDocReport}
              disabled={reportLoading}
            >
              {reportLoading ? t('common.generating') : t('documentsList.reportBtn')}
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="similar-id">{t('documentsList.similarId')}</Label>
              <Input
                id="similar-id"
                className="w-32"
                value={similarDocId}
                onChange={(e) => setSimilarDocId(e.target.value)}
                placeholder={t('documentsList.similarIdPlaceholder')}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={fetchSimilarRecommendations}
              disabled={similarLoading}
            >
              {similarLoading ? t('documentsList.recommendSimilarLoading') : t('documentsList.recommendSimilar')}
            </Button>
          </div>

          {similarDocs.length > 0 ? (
            <p className="text-sm">
              <strong>{t('documentsList.similarDetected')}</strong>{' '}
              {similarDocs.map((d: any) => `#${d.id} ${d.title} (${d.similarity}%)`).join(' | ')}
            </p>
          ) : null}

          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[280px] flex-1 space-y-1.5">
              <Label htmlFor="qa-question">{t('documentsList.qaSectionLabel')}</Label>
              <Input
                id="qa-question"
                value={qaQuestion}
                onChange={(e) => setQaQuestion(e.target.value)}
                placeholder={t('documentsList.qaPh')}
              />
            </div>
            <Button type="button" variant="secondary" onClick={askMultiDocs} disabled={qaLoading}>
              {qaLoading ? t('documentsList.qaThinking') : t('documentsList.qaBtn')}
            </Button>
          </div>

          {qaAnswer ? (
            <pre className="rounded-md border bg-muted p-3 text-xs whitespace-pre-wrap">{qaAnswer}</pre>
          ) : null}
        </div>
      </Card>
    </div>
  )
}
