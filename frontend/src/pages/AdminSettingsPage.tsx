import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Edit, Plus, Trash2 } from 'lucide-react'
import api from '../services/api/client'
import Card from '../components/ui/Card'
import { Button } from '@/components/shadcn/button'
import { Input } from '@/components/shadcn/input'
import { Label } from '@/components/shadcn/label'
import { Textarea } from '@/components/shadcn/textarea'
import { Checkbox } from '@/components/shadcn/checkbox'
import { Badge } from '@/components/shadcn/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/shadcn/tabs'
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
import { formatBytes } from '../utils/dashboardTime'

const BYTES_PER_MB = 1024 * 1024

function bytesToMb(bytes: number) {
  return Math.round(bytes / BYTES_PER_MB)
}

function mbToBytes(mb: number) {
  return Math.max(BYTES_PER_MB, Math.round(mb * BYTES_PER_MB))
}

const TAB_KEYS = ['general', 'fields', 'departments'] as const
type TabKey = (typeof TAB_KEYS)[number]

function parseTab(value: string | null): TabKey {
  if (value && TAB_KEYS.includes(value as TabKey)) return value as TabKey
  return 'general'
}

export default function AdminSettingsPage() {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = parseTab(searchParams.get('tab'))

  const [maxBytes, setMaxBytes] = useState(10 * 1024 * 1024)

  const [customFields, setCustomFields] = useState<any[]>([])
  const [fieldForm, setFieldForm] = useState({
    name: '',
    type: 'text',
    options: '',
    documentType: '',
    isActive: true,
  })

  const [departments, setDepartments] = useState<any[]>([])
  const [deptForm, setDeptForm] = useState({ name: '', description: '' })
  const [editingDept, setEditingDept] = useState<any>(null)

  const setTab = (tab: TabKey) => {
    setSearchParams(tab === 'general' ? {} : { tab }, { replace: true })
  }

  const loadGeneral = async () => {
    const st = await api.get('/admin/settings')
    setMaxBytes(Number(st.data.data?.maxUploadSizeBytes) || 10 * 1024 * 1024)
  }

  const loadFields = async () => {
    const res = await api.get('/custom-fields')
    setCustomFields(res.data.data || [])
  }

  const loadDepartments = async () => {
    const res = await api.get('/departments/overview')
    setDepartments(res.data.data || [])
  }

  const load = async () => {
    try {
      await Promise.all([loadGeneral(), loadFields(), loadDepartments()])
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('adminSettings.loadError'))
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveMax = async () => {
    try {
      await api.put('/admin/settings', { maxUploadSizeBytes: maxBytes })
      toast.success(t('adminSettings.maxSaved'))
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('adminSettings.saveFail'))
    }
  }

  const createField = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      let options: any = null
      if (fieldForm.type === 'select' && fieldForm.options.trim()) {
        try {
          options = JSON.parse(fieldForm.options)
        } catch {
          options = fieldForm.options.split(',').map((s) => s.trim())
        }
      }
      await api.post('/custom-fields', {
        name: fieldForm.name,
        type: fieldForm.type,
        options,
        documentType: fieldForm.documentType || null,
        isActive: fieldForm.isActive,
      })
      toast.success(t('adminCustomFields.created'))
      setFieldForm({ name: '', type: 'text', options: '', documentType: '', isActive: true })
      await loadFields()
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('adminCustomFields.saveFail'))
    }
  }

  const deleteField = async (id: number) => {
    if (!window.confirm(t('adminCustomFields.deleteConfirm'))) return
    try {
      await api.delete(`/custom-fields/${id}`)
      toast.success(t('adminCustomFields.deleted'))
      await loadFields()
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('adminCustomFields.saveFail'))
    }
  }

  const submitDepartment = async (event: React.FormEvent) => {
    event.preventDefault()
    try {
      if (editingDept) {
        await api.put(`/departments/${editingDept.id}`, deptForm)
        toast.success(t('adminDepartments.updated'))
      } else {
        await api.post('/departments', deptForm)
        toast.success(t('adminDepartments.created'))
      }
      setDeptForm({ name: '', description: '' })
      setEditingDept(null)
      await loadDepartments()
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('adminDepartments.saveFail'))
    }
  }

  const deleteDepartment = async (id: number) => {
    if (!window.confirm(t('adminDepartments.deleteConfirm'))) return
    try {
      await api.delete(`/departments/${id}`)
      toast.success(t('adminDepartments.deleted'))
      await loadDepartments()
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('adminDepartments.saveFail'))
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{t('adminSettings.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('adminSettings.pageSub')}</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setTab(parseTab(v))}>
        <TabsList>
          <TabsTrigger value="general">{t('adminSettings.tabGeneral')}</TabsTrigger>
          <TabsTrigger value="fields">{t('adminSettings.tabFields')}</TabsTrigger>
          <TabsTrigger value="departments">{t('adminSettings.tabDepartments')}</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4 pt-4">
          <Card title={t('adminSettings.uploadTitle')} subtitle={t('adminSettings.uploadSub')}>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="max-mb">{t('adminSettings.maxMbLabel')}</Label>
                <div className="flex max-w-xs items-center gap-2">
                  <Input
                    id="max-mb"
                    type="number"
                    min={1}
                    max={500}
                    step={1}
                    value={bytesToMb(maxBytes)}
                    onChange={(e) => {
                      const mb = Number(e.target.value)
                      if (Number.isFinite(mb) && mb >= 1) setMaxBytes(mbToBytes(mb))
                    }}
                  />
                  <span className="shrink-0 text-sm text-muted-foreground">{t('adminSettings.mbUnit')}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('adminSettings.maxMbHint', {
                    human: formatBytes(maxBytes, i18n.language),
                    bytes: maxBytes.toLocaleString(i18n.language?.startsWith('en') ? 'en-US' : 'fr-FR'),
                  })}
                </p>
              </div>
              <Button type="button" onClick={saveMax}>
                {t('common.save')}
              </Button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="fields" className="space-y-4 pt-4">
          <Card
            title={t('adminCustomFields.title')}
            subtitle={t('adminCustomFields.subtitleShort')}
          >
            <form onSubmit={createField} className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cf-name">{t('adminCustomFields.nameLabel')}</Label>
                <Input
                  id="cf-name"
                  value={fieldForm.name}
                  onChange={(e) => setFieldForm((p) => ({ ...p, name: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cf-type">{t('adminCustomFields.typeLabel')}</Label>
                <Select
                  value={fieldForm.type}
                  onValueChange={(v) => setFieldForm((p) => ({ ...p, type: v }))}
                >
                  <SelectTrigger id="cf-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">{t('adminCustomFields.typeText')}</SelectItem>
                    <SelectItem value="number">{t('adminCustomFields.typeNumber')}</SelectItem>
                    <SelectItem value="date">{t('adminCustomFields.typeDate')}</SelectItem>
                    <SelectItem value="select">{t('adminCustomFields.typeSelect')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {fieldForm.type === 'select' ? (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="cf-options">{t('adminCustomFields.optionsLabel')}</Label>
                  <Input
                    id="cf-options"
                    value={fieldForm.options}
                    onChange={(e) => setFieldForm((p) => ({ ...p, options: e.target.value }))}
                    placeholder="Option A, Option B"
                  />
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="cf-doc-type">{t('adminCustomFields.categoryLimitLabel')}</Label>
                <Input
                  id="cf-doc-type"
                  value={fieldForm.documentType}
                  onChange={(e) => setFieldForm((p) => ({ ...p, documentType: e.target.value }))}
                  placeholder="Facture, Contrat…"
                />
              </div>
              <label className="flex items-center gap-2 self-end text-sm">
                <Checkbox
                  checked={fieldForm.isActive}
                  onCheckedChange={(c) => setFieldForm((p) => ({ ...p, isActive: c === true }))}
                />
                <span>{t('adminCustomFields.activeLabel')}</span>
              </label>
              <div className="sm:col-span-2">
                <Button type="submit">
                  <Plus className="mr-2 size-4" />
                  {t('adminCustomFields.submit')}
                </Button>
              </div>
            </form>
          </Card>

          <Card title={t('adminCustomFields.listCardTitle')}>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('adminCustomFields.colName')}</TableHead>
                    <TableHead>{t('adminCustomFields.colType')}</TableHead>
                    <TableHead>{t('adminCustomFields.colCategory')}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customFields.map((f: any) => (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium">{f.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{f.type}</Badge>
                      </TableCell>
                      <TableCell>{f.document_type || t('common.emDash')}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          onClick={() => deleteField(f.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {customFields.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        {t('common.noResults')}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="departments" className="space-y-4 pt-4">
          <Card title={t('adminDepartments.title')} subtitle={t('adminDepartments.subtitle')}>
            <form onSubmit={submitDepartment} className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="dept-name">{t('common.name')}</Label>
                <Input
                  id="dept-name"
                  value={deptForm.name}
                  onChange={(e) => setDeptForm((p) => ({ ...p, name: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="dept-desc">{t('documentDetail.description')}</Label>
                <Textarea
                  id="dept-desc"
                  rows={2}
                  value={deptForm.description}
                  onChange={(e) => setDeptForm((p) => ({ ...p, description: e.target.value }))}
                />
              </div>
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <Button type="submit">
                  {editingDept ? t('adminDepartments.save') : t('adminDepartments.create')}
                </Button>
                {editingDept ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditingDept(null)
                      setDeptForm({ name: '', description: '' })
                    }}
                  >
                    {t('adminDepartments.cancelEdit')}
                  </Button>
                ) : null}
              </div>
            </form>
          </Card>

          <Card title={t('adminDepartments.listTitle')}>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('common.name')}</TableHead>
                    <TableHead>{t('adminDepartments.colMembers')}</TableHead>
                    <TableHead>{t('adminDepartments.colDocs')}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {departments.map((d: any) => (
                    <TableRow key={d.id}>
                      <TableCell>
                        <div className="font-medium">{d.name}</div>
                        {d.description ? (
                          <p className="text-xs text-muted-foreground">{d.description}</p>
                        ) : null}
                      </TableCell>
                      <TableCell>{d.userCount ?? 0}</TableCell>
                      <TableCell>{d.docCount ?? 0}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            type="button"
                            onClick={() => {
                              setEditingDept(d)
                              setDeptForm({ name: d.name, description: d.description || '' })
                            }}
                          >
                            <Edit className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            type="button"
                            onClick={() => deleteDepartment(d.id)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {departments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        {t('adminDepartments.empty')}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
