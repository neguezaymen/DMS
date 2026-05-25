import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Archive,
  Download,
  Eye,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/shadcn/select'
import { Separator } from '@/components/shadcn/separator'
import { Alert, AlertDescription, AlertTitle } from '@/components/shadcn/alert'
import { Badge } from '@/components/shadcn/badge'
import { Checkbox } from '@/components/shadcn/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/shadcn/dialog'
import DataTable, { type DataTableColumn } from '../components/ui/DataTable'
import { useToast } from '../state/ToastContext'
import { statusBadgeClass, statusLabel, tagChipClass, mergeDocumentCategories, DEFAULT_DOCUMENT_CATEGORY, DOCUMENT_CATEGORY_PRESETS } from '../utils/documentUi'
import { cn } from '@/lib/utils'

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

const DOCUMENT_FILTER_STATUSES = [
  'active',
  'pending_approval',
  'draft',
  'in_review',
  'approved',
  'archived',
  'rejected',
] as const

export default function DocumentsListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isAdmin = useAdminAccess()
  const toast = useToast()
  const [documents, setDocuments] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
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
  const [categories, setCategories] = useState<string[]>(() =>
    mergeDocumentCategories([...DOCUMENT_CATEGORY_PRESETS]),
  )
  const [maxUploadBytes, setMaxUploadBytes] = useState(10 * 1024 * 1024)
  const [meta, setMeta] = useState({
    title: '',
    category: DEFAULT_DOCUMENT_CATEGORY,
    visibility: 'private',
    tags: '',
    description: '',
  })
  const [pendingDocs, setPendingDocs] = useState<any[]>([])
  const [customFields, setCustomFields] = useState<any[]>([])
  const [customValues, setCustomValues] = useState<Record<string, string>>({})
  const [docDownloadId, setDocDownloadId] = useState<number | null>(null)
  const [smartQuery, setSmartQuery] = useState('')
  const [smartLoading, setSmartLoading] = useState(false)
  const [smartMode, setSmartMode] = useState('')
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadInsights, setUploadInsights] = useState<any>(null)
  const [uploadInsightsLoading, setUploadInsightsLoading] = useState(false)
  const [metaTouched, setMetaTouched] = useState(false)
  const [autoEnrichMetadata, setAutoEnrichMetadata] = useState(true)
  const [startSuggestedWorkflow, setStartSuggestedWorkflow] = useState(true)

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
        const [depts, pub, cats] = await Promise.all([
          api.get('/departments').catch(() => ({ data: { data: [] } })),
          api.get('/settings/public').catch(() => ({ data: { data: {} } })),
          api.get('/documents/categories').catch(() => ({ data: { data: [] } })),
        ])
        setDepartments(depts.data.data || [])
        const catList = Array.isArray(cats.data?.data) ? cats.data.data : []
        setCategories(mergeDocumentCategories([...DOCUMENT_CATEGORY_PRESETS, ...catList]))
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
    if (!uploadDialogOpen) return
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
  }, [meta.category, uploadDialogOpen])

  useEffect(() => {
    if (!uploadDialogOpen || files.length === 0) {
      setUploadInsights(null)
      return
    }
    const file = files[0]
    let cancelled = false
    const analyze = async () => {
      setUploadInsightsLoading(true)
      try {
        const formData = new FormData()
        formData.append('file', file)
        const res = await api.post('/ai-studio/upload-insights', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        if (cancelled) return
        const data = res.data?.data
        setUploadInsights(data)
        if (!metaTouched && data) {
          if (data.detectedCategory) {
            setCategories((prev) => mergeDocumentCategories([...prev, data.detectedCategory]))
          }
          setMeta((prev) => ({
            ...prev,
            title: prev.title || String(file.name || '').replace(/\.[^.]+$/, ''),
            category: data.detectedCategory || prev.category,
            tags:
              prev.tags ||
              (Array.isArray(data.suggestedTags) ? data.suggestedTags.join(', ') : prev.tags),
          }))
        }
      } catch {
        if (!cancelled) setUploadInsights(null)
      } finally {
        if (!cancelled) setUploadInsightsLoading(false)
      }
    }
    void analyze()
    return () => {
      cancelled = true
    }
  }, [files, uploadDialogOpen, metaTouched])

  const resetUploadForm = () => {
    setFiles([])
    setDragging(false)
    setUploadInsights(null)
    setUploadInsightsLoading(false)
    setMetaTouched(false)
    setAutoEnrichMetadata(true)
    setStartSuggestedWorkflow(true)
    setMeta({
      title: '',
      category: categories[0] || DEFAULT_DOCUMENT_CATEGORY,
      visibility: 'private',
      tags: '',
      description: '',
    })
    setCustomValues({})
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const openUploadDialog = () => {
    resetUploadForm()
    setUploadDialogOpen(true)
  }

  const closeUploadDialog = () => {
    setUploadDialogOpen(false)
    resetUploadForm()
  }

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
      setUploading(true)
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
      const uploadRes = await api.post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const created = Array.isArray(uploadRes.data?.data) ? uploadRes.data.data : []
      if (autoEnrichMetadata && created.length > 0) {
        for (const doc of created.slice(0, 3)) {
          try {
            await api.post(`/ai-studio/extract-metadata/${doc.id}`, { applyToCustomFields: true })
          } catch {
            /* optional */
          }
        }
      }
      const first = created[0]
      if (startSuggestedWorkflow && uploadInsights?.suggestedWorkflow?.id && first?.id) {
        try {
          await api.post(`/workflows/${uploadInsights.suggestedWorkflow.id}/start`, {
            documentId: Number(first.id),
          })
          toast.success(
            t('documentsList.workflowStarted', { name: uploadInsights.suggestedWorkflow.name }),
          )
        } catch {
          navigate(
            `/documents/${first.id}?tab=workflow&workflowId=${uploadInsights.suggestedWorkflow.id}`,
          )
        }
      }
      toast.success(
        meta.visibility === 'private' && !isAdmin
          ? t('documentsList.uploadPending')
          : t('documentsList.uploadOk'),
      )
      closeUploadDialog()
      void loadDocuments()
    } catch (error: any) {
      const code = error.response?.data?.code
      if (code === 'SENSITIVE_CONTENT') {
        toast.error(error.response?.data?.message || t('documentsList.aiSensitive'))
      } else {
        toast.error(error.response?.data?.message || t('documentsList.uploadFail'))
      }
    } finally {
      setUploading(false)
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

  const applySmartSearchResults = (docs: any[], mode: string, fallback: boolean) => {
    setDocuments(docs)
    const modeLabel = fallback ? `${mode} (${t('documentsList.vectorFallbackHint')})` : mode
    setSmartMode(modeLabel)
  }

  const handleSmartSearch = async () => {
    const q = smartQuery.trim()
    if (!q) {
      setSmartMode('')
      void loadDocuments()
      return
    }
    setSmartLoading(true)
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
      applySmartSearchResults(docs, mode, fallback)
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
        applySmartSearchResults(docs, 'classic-fallback', true)
        if (docs.length > 0) {
          toast.success(t('documentsList.vectorSearchOkFallback', { count: docs.length }))
        } else {
          toast.info(t('documentsList.vectorSearchEmpty'))
        }
      } catch (e2: any) {
        toast.error(e2.response?.data?.message || t('documentsList.vectorSearchFail'))
      }
    } finally {
      setSmartLoading(false)
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
        vectorScore: doc.vectorScore,
      })),
    [documents],
  )

  const columns: DataTableColumn<any>[] = useMemo(() => {
    const cols: DataTableColumn<any>[] = [
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
    ]

    if (smartMode) {
      cols.splice(1, 0, {
        key: 'vectorScore',
        label: t('documentsList.relevanceCol'),
        render: (row) =>
          row.vectorScore != null ? (
            <span className="font-mono text-xs text-muted-foreground">
              {Math.round(Number(row.vectorScore) * 100)}%
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">{t('common.emDash')}</span>
          ),
      })
    }

    cols.push({
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
    })

    return cols
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, docDownloadId, smartMode])

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
        title={t('documentsList.listTitle')}
        subtitle={loading ? t('common.loading') : t('documentsList.listSub')}
        actions={
          <Button type="button" onClick={openUploadDialog}>
            <UploadIcon className="mr-2 size-4" />
            {t('documentsList.addDocument')}
          </Button>
        }
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="smart-search">
              <Sparkles className="mr-1 inline size-3.5" />
              {t('documentsList.vectorSearchLabel')}
            </Label>
            <p className="text-xs text-muted-foreground">{t('documentsList.smartSearchHint')}</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="smart-search"
                  value={smartQuery}
                  onChange={(e) => setSmartQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void handleSmartSearch()
                    }
                  }}
                  placeholder={t('documentsList.vectorSearchPh')}
                  className="pl-9"
                />
              </div>
              <Button onClick={handleSmartSearch} disabled={smartLoading} type="button">
                {smartLoading ? t('documentsList.vectorSearching') : t('documentsList.vectorSearchBtn')}
              </Button>
              {smartQuery.trim() ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSmartQuery('')
                    setSmartMode('')
                    void loadDocuments()
                  }}
                >
                  {t('documentsList.resetSearch')}
                </Button>
              ) : null}
            </div>
            {smartMode ? (
              <p className="text-xs text-muted-foreground">
                {t('documentsList.vectorMode', { mode: smartMode })}
              </p>
            ) : null}
          </div>

          <Separator />

          {/* Filters */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="f-search">{t('common.search')}</Label>
              <Input
                id="f-search"
                value={filters.search}
                onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="f-category">{t('common.category')}</Label>
              <Select
                value={filters.category || 'all'}
                onValueChange={(v) =>
                  setFilters((prev) => ({ ...prev, category: v === 'all' ? '' : v }))
                }
              >
                <SelectTrigger id="f-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.all')}</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="f-status">{t('common.status')}</Label>
              <Select
                value={filters.status || 'all'}
                onValueChange={(v) =>
                  setFilters((prev) => ({ ...prev, status: v === 'all' ? '' : v }))
                }
              >
                <SelectTrigger id="f-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.all')}</SelectItem>
                  {DOCUMENT_FILTER_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {statusLabel(status, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1.5">
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
        </div>
      </Card>

      <Dialog
        open={uploadDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeUploadDialog()
        }}
      >
        <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>{t('documentsList.uploadTitle')}</DialogTitle>
            <DialogDescription>
              {t('documentsList.uploadSub', { mb: Math.round(maxUploadBytes / 1048576) })}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onUpload} className="flex min-h-0 flex-1 flex-col">
            <div className="space-y-4 overflow-y-auto px-6 py-4">
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

              {uploadInsightsLoading ? (
                <Alert>
                  <Sparkles className="size-4" />
                  <AlertTitle>{t('documentsList.aiAnalyzing')}</AlertTitle>
                  <AlertDescription>{t('documentsList.uploadInsightsLoading')}</AlertDescription>
                </Alert>
              ) : null}

              {uploadInsights ? (
                <Alert className={uploadInsights.hasDuplicateRisk ? 'border-amber-500' : ''}>
                  <Sparkles className="size-4" />
                  <AlertTitle>{t('documentsList.uploadInsightsTitle')}</AlertTitle>
                  <AlertDescription className="space-y-2">
                    <p>{t('documentsList.wfCategory', { cat: uploadInsights.detectedCategory })}</p>
                    {uploadInsights.suggestedWorkflow ? (
                      <p>
                        {t('documentsList.uploadInsightsWorkflow', {
                          name: uploadInsights.suggestedWorkflow.name,
                        })}
                      </p>
                    ) : null}
                    {uploadInsights.rationale ? (
                      <p className="text-xs text-muted-foreground">{uploadInsights.rationale}</p>
                    ) : null}
                    {Array.isArray(uploadInsights.similar) && uploadInsights.similar.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {uploadInsights.similar.map((item: any) => (
                          <Badge key={item.id} variant="secondary">
                            {item.title || item.originalName} ({item.similarity}%)
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                    {uploadInsights.hasDuplicateRisk ? (
                      <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                        {t('documentsList.uploadInsightsDuplicate')}
                      </p>
                    ) : null}
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={autoEnrichMetadata}
                    onCheckedChange={(c) => setAutoEnrichMetadata(c === true)}
                  />
                  <span>{t('documentsList.autoEnrichMetadata')}</span>
                </label>
                {uploadInsights?.suggestedWorkflow ? (
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={startSuggestedWorkflow}
                      onCheckedChange={(c) => setStartSuggestedWorkflow(c === true)}
                    />
                    <span>
                      {t('documentsList.autoStartWorkflow', {
                        name: uploadInsights.suggestedWorkflow.name,
                      })}
                    </span>
                  </label>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="upload-title">{t('common.title')}</Label>
                  <Input
                    id="upload-title"
                    value={meta.title}
                    onChange={(event) => {
                      setMetaTouched(true)
                      setMeta((prev) => ({ ...prev, title: event.target.value }))
                    }}
                    placeholder={t('documentsList.titlePlaceholder')}
                  />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="upload-category">{t('common.category')}</Label>
                  <Select
                    value={meta.category || categories[0] || DEFAULT_DOCUMENT_CATEGORY}
                    onValueChange={(v) => {
                      setMetaTouched(true)
                      setMeta((prev) => ({ ...prev, category: v }))
                    }}
                  >
                    <SelectTrigger id="upload-category" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {categories.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="upload-visibility">{t('common.visibility')}</Label>
                  <Select
                    value={meta.visibility}
                    onValueChange={(v) => setMeta((prev) => ({ ...prev, visibility: v }))}
                  >
                    <SelectTrigger id="upload-visibility" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      <SelectItem value="private">{t('documentsList.visibilityPrivate')}</SelectItem>
                      <SelectItem value="public">{t('documentsList.visibilityPublic')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="upload-tags">{t('common.tags')}</Label>
                  <Input
                    id="upload-tags"
                    value={meta.tags}
                    onChange={(event) => {
                      setMetaTouched(true)
                      setMeta((prev) => ({ ...prev, tags: event.target.value }))
                    }}
                    placeholder={t('documentsList.tagsPlaceholder')}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="upload-description">{t('documentDetail.description')}</Label>
                  <Textarea
                    id="upload-description"
                    rows={3}
                    value={meta.description}
                    onChange={(event) =>
                      setMeta((prev) => ({ ...prev, description: event.target.value }))
                    }
                  />
                </div>
              </div>

              {customFields.length > 0 ? (
                <div className="space-y-2 rounded-md border p-3">
                  <p className="text-sm font-medium">{t('documentsList.customFieldsHeader')}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {customFields.map((field: any) => (
                      <div key={field.id} className="min-w-0 space-y-1.5">
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
                            <SelectContent position="popper">
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
                            type={
                              field.type === 'date'
                                ? 'date'
                                : field.type === 'number'
                                  ? 'number'
                                  : 'text'
                            }
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
            </div>

            <DialogFooter className="border-t px-6 py-4 sm:justify-end">
              <Button type="button" variant="outline" onClick={closeUploadDialog} disabled={uploading}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={uploading}>
                <UploadIcon className="mr-2 size-4" />
                {uploading ? t('common.uploading') : t('documentsList.uploadBtn')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
