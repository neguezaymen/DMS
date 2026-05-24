import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
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
import { useToast } from '../state/ToastContext'

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

export default function WorkflowTemplatesPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const [templates, setTemplates] = useState<any[]>([])
  const [roles, setRoles] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [form, setForm] = useState({
    name: '',
    description: '',
    documentCategory: '',
    steps: [
      { stepOrder: 1, assigneeType: 'role', assigneeId: '', dueHours: 24, reminderHours: 6 },
      { stepOrder: 2, assigneeType: 'role', assigneeId: '', dueHours: 24, reminderHours: 6 },
    ],
  })

  const loadTemplates = async () => {
    try {
      const response = await api.get('/workflows/templates')
      const seen = new Set<string>()
      const rows = (response.data.data || []).filter((tpl: any) => {
        const key = String(tpl.name || '').trim().toLowerCase()
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
      })
      setTemplates(rows)
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

  useEffect(() => {
    void loadTemplates()
    void (async () => {
      await loadRoles()
      await loadUsers()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const createTemplate = async (event: React.FormEvent) => {
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
      await api.post('/workflows/templates', { ...form, steps })
      toast.success(t('workflowTemplates.created'))
      setForm({
        name: '',
        description: '',
        documentCategory: '',
        steps: defaultStepsForRoles(roles),
      })
      await loadTemplates()
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('workflowTemplates.createFail'))
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
        title={t('workflowTemplates.cardCreateTitle')}
        subtitle={t('workflowTemplates.cardCreateSub')}
      >
        <form onSubmit={createTemplate} className="space-y-4">
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
              <Input
                id="tpl-cat"
                value={form.documentCategory}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, documentCategory: event.target.value }))
                }
              />
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
              <Card
                key={`workflow-step-${index}`}
                title={t('workflowTemplates.stepTitle', { n: index + 1 })}
                subtitle={t('workflowTemplates.stepSub')}
                actions={
                  form.steps.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeStep(index)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null
                }
              >
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
              </Card>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={addStep}>
              <Plus className="mr-2 size-4" />
              {t('workflowTemplates.addStep')}
            </Button>
            <Button type="submit">{t('workflowTemplates.submitCreate')}</Button>
          </div>
        </form>
      </Card>

      <Card
        title={t('workflowTemplates.listTitle')}
        subtitle={t('workflowTemplates.listSub')}
        actions={
          <Button asChild variant="secondary">
            <Link to="/workflows/visual-editor">{t('workflowTemplates.openVisualEditor')}</Link>
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
                </TableRow>
              ))}
              {templates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    {t('workflowTemplates.emptyModels')}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  )
}
