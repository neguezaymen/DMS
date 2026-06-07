import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import api from '../services/api/client'
import Card from '../components/ui/Card'
import { Button } from '@/components/shadcn/button'
import { Input } from '@/components/shadcn/input'
import { Label } from '@/components/shadcn/label'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/shadcn/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/shadcn/alert-dialog'
import { useToast } from '../state/ToastContext'
import {
  DEFAULT_DOCUMENT_CATEGORY,
  DOCUMENT_CATEGORY_PRESETS,
  mergeDocumentCategories,
} from '../utils/documentUi'

function defaultStepsForRoles(roles: any[]) {
  const manager = roles.find((role: any) => String(role.name).toLowerCase() === 'manager')
  const admin = roles.find((role: any) => String(role.name).toLowerCase() === 'admin')
  return [
    { stepOrder: 1, assigneeType: 'role', assigneeId: manager?.id || '', dueHours: 24, reminderHours: 6 },
    { stepOrder: 2, assigneeType: 'role', assigneeId: admin?.id || '', dueHours: 24, reminderHours: 6 },
  ]
}

function responseRows(payload: any, key: string): any[] {
  if (Array.isArray(payload?.data)) return payload.data
  if (payload?.data && typeof payload.data === 'object' && Array.isArray(payload.data[key])) {
    return payload.data[key]
  }
  if (Array.isArray(payload?.[key])) return payload[key]
  if (Array.isArray(payload)) return payload
  return []
}

function normalizeRoleRow(raw: any) {
  if (raw == null || typeof raw !== 'object') return null
  const id = raw.id ?? raw.ID ?? raw.role_id ?? raw.roleId
  const name = raw.name ?? raw.Name ?? raw.role_name ?? raw.roleName
  if (id == null || id === '') return null
  return { id: Number(id) || id, name: name != null && name !== '' ? String(name) : String(id) }
}

function extractRolesFromApiBody(body: any): any[] {
  if (body == null) return []
  if (Array.isArray(body)) return body.map(normalizeRoleRow).filter(Boolean) as any[]
  if (Array.isArray(body.data)) return body.data.map(normalizeRoleRow).filter(Boolean) as any[]
  if (body.data && typeof body.data === 'object') {
    if (Array.isArray(body.data.data))
      return body.data.data.map(normalizeRoleRow).filter(Boolean) as any[]
    if (Array.isArray(body.data.roles))
      return body.data.roles.map(normalizeRoleRow).filter(Boolean) as any[]
  }
  if (Array.isArray(body.roles)) return body.roles.map(normalizeRoleRow).filter(Boolean) as any[]
  return responseRows(body, 'roles').map(normalizeRoleRow).filter(Boolean) as any[]
}

function normalizeAssigneeType(value: any) {
  const s = String(value ?? '').trim().toLowerCase()
  if (s === 'user' || s === 'utilisateur') return 'user'
  if (s === 'role' || s === 'rôle') return 'role'
  return 'role'
}

function stepAssignsRole(step: any) {
  return normalizeAssigneeType(step?.assigneeType) === 'role'
}

function normalizeStepFromApi(raw: any, index: number) {
  return {
    stepOrder: Number(raw?.step_order ?? raw?.stepOrder ?? index + 1),
    assigneeType: normalizeAssigneeType(raw?.assignee_type ?? raw?.assigneeType),
    assigneeId: raw?.assignee_id ?? raw?.assigneeId ?? '',
    dueHours: Number(raw?.due_hours ?? raw?.dueHours ?? 24),
    reminderHours: Number(raw?.reminder_hours ?? raw?.reminderHours ?? 6),
  }
}

export default function WorkflowTemplatesPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const [templates, setTemplates] = useState<any[]>([])
  const [roles, setRoles] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [formLoading, setFormLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [categories, setCategories] = useState<string[]>(
    mergeDocumentCategories([...DOCUMENT_CATEGORY_PRESETS]),
  )
  const [form, setForm] = useState({
    name: '',
    description: '',
    documentCategory: DEFAULT_DOCUMENT_CATEGORY,
    steps: [
      { stepOrder: 1, assigneeType: 'role', assigneeId: '', dueHours: 24, reminderHours: 6 },
      { stepOrder: 2, assigneeType: 'role', assigneeId: '', dueHours: 24, reminderHours: 6 },
    ],
  })

  const loadTemplates = async () => {
    try {
      const response = await api.get('/workflows/templates')
      setTemplates(response.data.data || [])
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('workflowTemplates.loadError'))
    }
  }

  const loadRoles = async () => {
    try {
      const rolesResponse = await api.get('/roles')
      const loadedRoles = extractRolesFromApiBody(rolesResponse?.data)
      setRoles(loadedRoles)
      setForm((prev) => {
        const hasAssignees = prev.steps.some((step) => step.assigneeId)
        return hasAssignees ? prev : { ...prev, steps: defaultStepsForRoles(loadedRoles) }
      })
      return loadedRoles
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('workflowTemplates.loadRolesError'))
      return []
    }
  }

  const loadUsers = async () => {
    try {
      const usersResponse = await api.get('/admin/users?page=1&limit=100')
      const list = responseRows(usersResponse.data, 'users')
      setUsers(list)
    } catch (error: any) {
      setUsers([])
      toast.error(error.response?.data?.message || t('workflowTemplates.loadUsersError'))
    }
  }

  const loadCategories = async () => {
    try {
      const response = await api.get('/documents/categories')
      const list = Array.isArray(response.data?.data) ? response.data.data : []
      setCategories(mergeDocumentCategories([...DOCUMENT_CATEGORY_PRESETS, ...list]))
    } catch {
      setCategories(mergeDocumentCategories([...DOCUMENT_CATEGORY_PRESETS]))
    }
  }

  useEffect(() => {
    void loadTemplates()
    void loadCategories()
    void (async () => {
      await loadRoles()
      await loadUsers()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const resetForm = () => {
    setEditingId(null)
    setForm({
      name: '',
      description: '',
      documentCategory: categories[0] || DEFAULT_DOCUMENT_CATEGORY,
      steps: defaultStepsForRoles(roles),
    })
  }

  const openCreateForm = () => {
    resetForm()
    setFormDialogOpen(true)
  }

  const closeFormDialog = () => {
    setFormDialogOpen(false)
    resetForm()
  }

  const openEditForm = async (template: any) => {
    setFormLoading(true)
    setEditingId(Number(template.id))
    setFormDialogOpen(true)
    try {
      const stepsResponse = await api.get(`/workflows/templates/${template.id}/steps`)
      const rawSteps = stepsResponse.data?.data || []
      const steps =
        rawSteps.length > 0
          ? rawSteps.map((step: any, index: number) => normalizeStepFromApi(step, index))
          : defaultStepsForRoles(roles)
      setForm({
        name: template.name || '',
        description: template.description || '',
        documentCategory: template.document_category || categories[0] || DEFAULT_DOCUMENT_CATEGORY,
        steps,
      })
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('workflowTemplates.loadStepsError'))
      closeFormDialog()
    } finally {
      setFormLoading(false)
    }
  }

  const saveTemplate = async (event: React.FormEvent) => {
    event.preventDefault()
    try {
      const steps = form.steps.map((step, index) => ({
        ...step,
        stepOrder: index + 1,
        assigneeId: Number(step.assigneeId),
        role_id: stepAssignsRole(step) ? Number(step.assigneeId) : undefined,
        user_id: !stepAssignsRole(step) ? Number(step.assigneeId) : undefined,
        dueHours: Number(step.dueHours || 0),
        reminderHours: Number(step.reminderHours || 0),
      }))
      if (steps.some((step) => !step.assigneeId)) {
        toast.error(t('workflowTemplates.stepAssigneeRequired'))
        return
      }
      const payload = { ...form, steps }
      if (editingId != null) {
        await api.put(`/workflows/templates/${editingId}`, payload)
        toast.success(t('workflowTemplates.updated'))
      } else {
        await api.post('/workflows/templates', payload)
        toast.success(t('workflowTemplates.created'))
      }
      closeFormDialog()
      await loadTemplates()
    } catch (error: any) {
      const fallback = editingId != null ? t('workflowTemplates.updateFail') : t('workflowTemplates.createFail')
      toast.error(error.response?.data?.message || fallback)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleteLoading(true)
    try {
      await api.delete(`/workflows/templates/${deleteTarget.id}`)
      toast.success(t('workflowTemplates.deleted'))
      setDeleteTarget(null)
      await loadTemplates()
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('workflowTemplates.deleteFail'))
    } finally {
      setDeleteLoading(false)
    }
  }

  const updateStep = (index: number, patch: Partial<any>) => {
    setForm((prev) => ({
      ...prev,
      steps: prev.steps.map((step, i) => {
        if (i !== index) return step
        const nextType =
          patch.assigneeType != null ? normalizeAssigneeType(patch.assigneeType) : step.assigneeType
        const typeChanged =
          patch.assigneeType != null && normalizeAssigneeType(step.assigneeType) !== nextType
        return {
          ...step,
          ...patch,
          assigneeType: patch.assigneeType != null ? nextType : step.assigneeType,
          assigneeId: typeChanged ? '' : (patch.assigneeId ?? step.assigneeId),
        }
      }),
    }))
  }

  const changeAssigneeType = (index: number, assigneeType: string) => {
    const normalized = normalizeAssigneeType(assigneeType)
    updateStep(index, { assigneeType: normalized })
    if (normalized === 'role') {
      void loadRoles()
    }
  }

  const addStep = () => {
    setForm((prev) => ({
      ...prev,
      steps: [
        ...prev.steps,
        {
          stepOrder: prev.steps.length + 1,
          assigneeType: 'role',
          assigneeId: roles[0]?.id || '',
          dueHours: 24,
          reminderHours: 6,
        },
      ],
    }))
  }

  const removeStep = (index: number) => {
    setForm((prev) => ({
      ...prev,
      steps: prev.steps
        .filter((_, i) => i !== index)
        .map((step, i) => ({ ...step, stepOrder: i + 1 })),
    }))
  }

  return (
    <div className="space-y-4">
      <Card
        title={t('workflowTemplates.listTitle')}
        subtitle={t('workflowTemplates.listSub')}
        actions={
          <Button type="button" onClick={openCreateForm}>
            <Plus className="mr-2 size-4" />
            {t('workflowTemplates.addModel')}
          </Button>
        }
      >
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.name')}</TableHead>
                <TableHead>{t('workflowTemplates.colCategory')}</TableHead>
                <TableHead>{t('workflowTemplates.colSteps')}</TableHead>
                <TableHead>{t('workflowTemplates.colCreated')}</TableHead>
                <TableHead className="w-[120px] text-right">{t('workflowTemplates.colActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((template: any) => (
                <TableRow key={template.id}>
                  <TableCell>
                    <div className="font-medium">{template.name}</div>
                    {template.description ? (
                      <div className="text-xs text-muted-foreground">{template.description}</div>
                    ) : null}
                  </TableCell>
                  <TableCell>{template.document_category || t('common.emDash')}</TableCell>
                  <TableCell>{template.steps_count ?? 0}</TableCell>
                  <TableCell className="text-xs">
                    {template.created_at
                      ? new Date(template.created_at).toLocaleDateString()
                      : t('common.emDash')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title={t('workflowTemplates.editModel')}
                        onClick={() => void openEditForm(template)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title={t('workflowTemplates.deleteModel')}
                        onClick={() => setDeleteTarget(template)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {templates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    {t('workflowTemplates.emptyModels')}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog
        open={formDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeFormDialog()
        }}
      >
        <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>
              {editingId != null
                ? t('workflowTemplates.cardEditTitle')
                : t('workflowTemplates.cardCreateTitle')}
            </DialogTitle>
            <DialogDescription>
              {editingId != null
                ? t('workflowTemplates.cardEditSub')
                : t('workflowTemplates.cardCreateSub')}
            </DialogDescription>
          </DialogHeader>

          {formLoading ? (
            <div className="flex items-center justify-center gap-2 px-6 py-16 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              {t('common.loading')}
            </div>
          ) : (
          <form onSubmit={saveTemplate} className="flex min-h-0 flex-1 flex-col">
            <div className="space-y-4 overflow-y-auto px-6 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="tpl-name">{t('common.name')}</Label>
                  <Input
                    id="tpl-name"
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tpl-cat">{t('workflowTemplates.categoryLabel')}</Label>
                  <Select
                    value={form.documentCategory || categories[0] || DEFAULT_DOCUMENT_CATEGORY}
                    onValueChange={(v) => setForm((prev) => ({ ...prev, documentCategory: v }))}
                  >
                    <SelectTrigger id="tpl-cat" className="w-full">
                      <SelectValue placeholder={t('common.category')} />
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
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="tpl-desc">{t('documentDetail.description')}</Label>
                  <Input
                    id="tpl-desc"
                    value={form.description}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, description: event.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-3">
                {form.steps.map((step, index) => (
                  <div
                    key={`workflow-step-${index}`}
                    className="space-y-3 rounded-lg border bg-muted/20 p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">
                          {t('workflowTemplates.stepTitle', { n: index + 1 })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t('workflowTemplates.stepSub')}
                        </p>
                      </div>
                      {form.steps.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeStep(index)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      ) : null}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor={`step-${index}-type`}>
                          {t('workflowTemplates.assignTypeLabel')}
                        </Label>
                        <Select
                          value={normalizeAssigneeType(step.assigneeType)}
                          onValueChange={(v) => changeAssigneeType(index, v)}
                        >
                          <SelectTrigger id={`step-${index}-type`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="role">
                              {t('workflowTemplates.assigneeTypeRole')}
                            </SelectItem>
                            <SelectItem value="user">
                              {t('workflowTemplates.assigneeTypeUser')}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`step-${index}-assignee`}>
                          {t('workflowTemplates.assigneeLabel')}
                        </Label>
                        {stepAssignsRole(step) ? (
                          <Select
                            value={String(step.assigneeId ?? '')}
                            onValueChange={(v) => updateStep(index, { assigneeId: v })}
                          >
                            <SelectTrigger id={`step-${index}-assignee`}>
                              <SelectValue placeholder={t('workflowTemplates.chooseRole')} />
                            </SelectTrigger>
                            <SelectContent>
                              {roles.map((role: any) => (
                                <SelectItem key={String(role.id)} value={String(role.id)}>
                                  {role.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Select
                            value={String(step.assigneeId ?? '')}
                            onValueChange={(v) => updateStep(index, { assigneeId: v })}
                          >
                            <SelectTrigger id={`step-${index}-assignee`}>
                              <SelectValue placeholder={t('workflowTemplates.chooseUser')} />
                            </SelectTrigger>
                            <SelectContent>
                              {users.map((user: any) => (
                                <SelectItem key={user.id} value={String(user.id)}>
                                  {user.full_name || user.email} ({user.email})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        {stepAssignsRole(step) && roles.length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            {t('workflowTemplates.rolesEmptyHint')}
                          </span>
                        ) : null}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`step-${index}-due`}>
                          {t('workflowTemplates.dueHours')}
                        </Label>
                        <Input
                          id={`step-${index}-due`}
                          type="number"
                          min={0}
                          value={step.dueHours}
                          onChange={(event) => updateStep(index, { dueHours: event.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`step-${index}-reminder`}>
                          {t('workflowTemplates.reminderHours')}
                        </Label>
                        <Input
                          id={`step-${index}-reminder`}
                          type="number"
                          min={0}
                          value={step.reminderHours}
                          onChange={(event) =>
                            updateStep(index, { reminderHours: event.target.value })
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <Button type="button" variant="outline" onClick={addStep}>
                <Plus className="mr-2 size-4" />
                {t('workflowTemplates.addStep')}
              </Button>
            </div>

            <DialogFooter className="border-t px-6 py-4 sm:justify-end">
              <Button type="button" variant="outline" onClick={closeFormDialog}>
                {t('common.cancel')}
              </Button>
              <Button type="submit">
                {editingId != null
                  ? t('workflowTemplates.submitEdit')
                  : t('workflowTemplates.submitCreate')}
              </Button>
            </DialogFooter>
          </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open && !deleteLoading) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('workflowTemplates.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('workflowTemplates.deleteConfirmDesc', { name: deleteTarget?.name || '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault()
                void confirmDelete()
              }}
            >
              {deleteLoading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  {t('common.loading')}
                </>
              ) : (
                t('workflowTemplates.deleteConfirmAction')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
