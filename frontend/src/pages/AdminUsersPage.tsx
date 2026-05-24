import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ChevronLeft,
  ChevronRight,
  Edit,
  ExternalLink,
  Trash2,
  Unlock,
} from 'lucide-react'
import api from '../services/api/client'
import Card from '../components/ui/Card'
import Modal from '../components/ui/Modal'
import { Button } from '@/components/shadcn/button'
import { Input } from '@/components/shadcn/input'
import { Label } from '@/components/shadcn/label'
import { Badge } from '@/components/shadcn/badge'
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
import { Checkbox } from '@/components/shadcn/checkbox'
import { useToast } from '../state/ToastContext'
import { useAuth } from '../state/AuthContext'

function roleLabel(name: string, t: any) {
  const key = `adminUsers.roles.${String(name).toLowerCase()}`
  const translated = t(key)
  return translated === key ? String(name) : translated
}

function defaultRoleId(list: any[]) {
  const userRole = list.find((role: any) => role.name === 'user')
  return userRole?.id || list[0]?.id || ''
}

const USERS_PAGE_SIZE = 8

function toAdminUserTableRow(item: any) {
  if (!item || typeof item !== 'object') return null
  const id = item.id
  if (id == null || id === '') return null
  const departments = Array.isArray(item.departments) ? item.departments.map(String) : []
  return {
    id,
    email: String(item.email ?? ''),
    full_name: String(item.full_name ?? ''),
    departments,
    role: item.role != null ? String(item.role) : '—',
    is_active: Boolean(item.is_active),
    is_locked: Boolean(item.is_locked),
  }
}

export default function AdminUsersPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const { user: authUser } = useAuth()
  const [users, setUsers] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [roles, setRoles] = useState<any[]>([])
  const [deptFilter, setDeptFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [listPage, setListPage] = useState(1)
  const [rowBusyId, setRowBusyId] = useState<any>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    role_id: '',
    department_ids: [] as number[],
  })

  const [editOpen, setEditOpen] = useState(false)
  const [editLoading, setEditLoading] = useState(false)
  const [editUserId, setEditUserId] = useState<any>(null)
  const [editForm, setEditForm] = useState({
    full_name: '',
    email: '',
    role_id: '',
    department_ids: [] as number[],
    is_active: true,
  })

  const loadUsers = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: '1', limit: '100' })
      if (deptFilter) params.set('departmentId', deptFilter)
      const response = await api.get(`/admin/users?${params.toString()}`)
      const rows = Array.isArray(response.data?.data)
        ? response.data.data
        : Array.isArray(response.data?.users)
          ? response.data.users
          : Array.isArray(response.data)
            ? response.data
            : []
      if (!Array.isArray(rows)) {
        setUsers([])
        return
      }
      const normalized = rows.map(toAdminUserTableRow).filter(Boolean) as any[]
      setUsers(normalized)
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('adminUsers.loadError'))
      setUsers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const loadDepts = async () => {
      try {
        const r = await api.get('/departments')
        setDepartments(r.data.data || [])
      } catch {
        setDepartments([])
      }
    }
    const loadRoles = async () => {
      try {
        const r = await api.get('/roles')
        const loadedRoles = Array.isArray(r.data?.data) ? r.data.data : []
        setRoles(loadedRoles)
        setForm((prev) => ({
          ...prev,
          role_id: prev.role_id || String(defaultRoleId(loadedRoles) || ''),
        }))
      } catch {
        setRoles([])
      }
    }
    void loadDepts()
    void loadRoles()
  }, [])

  useEffect(() => {
    setListPage(1)
    void loadUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deptFilter])

  useEffect(() => {
    const tp = Math.max(1, Math.ceil(users.length / USERS_PAGE_SIZE))
    setListPage((p) => Math.min(p, tp))
  }, [users.length])

  const listTotalPages = Math.max(1, Math.ceil(users.length / USERS_PAGE_SIZE))
  const listSafePage = Math.min(listPage, listTotalPages)
  const paginatedUsers = useMemo(() => {
    const start = (listSafePage - 1) * USERS_PAGE_SIZE
    return users.slice(start, start + USERS_PAGE_SIZE)
  }, [users, listSafePage])

  const createUser = async (event: React.FormEvent) => {
    event.preventDefault()
    try {
      await api.post('/admin/users', {
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        password: form.password,
        role_id: Number(form.role_id),
        department_ids: form.department_ids,
      })
      toast.success(t('adminUsers.createSuccess'))
      setForm({
        full_name: '',
        email: '',
        password: '',
        role_id: String(defaultRoleId(roles) || ''),
        department_ids: [],
      })
      void loadUsers()
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('adminUsers.createFail'))
    }
  }

  const openEditModal = async (user: any) => {
    setEditUserId(user.id)
    setEditOpen(true)
    setEditLoading(true)
    try {
      const r = await api.get(`/admin/users/${user.id}`)
      const u = r.data.data
      const deptIds = Array.isArray(u.department_ids)
        ? u.department_ids.map(Number).filter(Boolean)
        : (u.department_details || []).map((d: any) => Number(d.id)).filter(Boolean)
      setEditForm({
        full_name: u.full_name || '',
        email: u.email || '',
        role_id: String(u.role_id || defaultRoleId(roles) || ''),
        department_ids: deptIds,
        is_active: Boolean(u.is_active),
      })
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('adminUsers.detailFail'))
      setEditOpen(false)
    } finally {
      setEditLoading(false)
    }
  }

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editUserId) return
    setEditSaving(true)
    try {
      await api.put(`/admin/users/${editUserId}`, {
        full_name: editForm.full_name.trim(),
        role_id: Number(editForm.role_id),
        department_ids: editForm.department_ids,
        is_active: editForm.is_active,
      })
      toast.success(t('adminUsers.updateSuccess'))
      setEditOpen(false)
      await loadUsers()
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('adminUsers.updateFail'))
    } finally {
      setEditSaving(false)
    }
  }

  const toggleUserStatus = async (userRow: any) => {
    if (userRow.is_active) {
      const ok = window.confirm(
        t('adminUsers.deactivateConfirm', { name: userRow.full_name || userRow.email }),
      )
      if (!ok) return
    }
    setRowBusyId(userRow.id)
    try {
      await api.put(`/admin/users/${userRow.id}`, {
        is_active: !userRow.is_active,
        isActive: !userRow.is_active,
      })
      toast.success(
        userRow.is_active
          ? t('adminUsers.toggleSuccessOn')
          : t('adminUsers.toggleSuccessOff'),
      )
      await loadUsers()
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('adminUsers.toggleFail'))
    } finally {
      setRowBusyId(null)
    }
  }

  const deleteUser = async (userRow: any) => {
    if (authUser && String(userRow.id) === String(authUser.id)) {
      toast.error(t('adminUsers.selfDeactivate'))
      return
    }
    const ok = window.confirm(
      t('adminUsers.deactivateConfirm', { name: userRow.full_name || userRow.email }),
    )
    if (!ok) return
    setRowBusyId(userRow.id)
    try {
      await api.delete(`/admin/users/${userRow.id}`)
      toast.success(t('adminUsers.deleteSuccess'))
      await loadUsers()
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('adminUsers.deleteFail'))
    } finally {
      setRowBusyId(null)
    }
  }

  const unlockUser = async (id: any) => {
    setRowBusyId(id)
    try {
      await api.post(`/admin/users/${id}/unlock`)
      toast.success(t('adminUsers.unlockSuccess'))
      await loadUsers()
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('adminUsers.unlockFail'))
    } finally {
      setRowBusyId(null)
    }
  }

  const toggleCreateDept = (id: number) => {
    setForm((prev) => ({
      ...prev,
      department_ids: prev.department_ids.includes(id)
        ? prev.department_ids.filter((x) => x !== id)
        : [...prev.department_ids, id],
    }))
  }

  const toggleEditDept = (id: number) => {
    setEditForm((prev) => ({
      ...prev,
      department_ids: prev.department_ids.includes(id)
        ? prev.department_ids.filter((x) => x !== id)
        : [...prev.department_ids, id],
    }))
  }

  return (
    <div className="space-y-4">
      <Card title={t('adminUsers.title')} subtitle={t('adminUsers.subtitle')}>
        <form onSubmit={createUser} className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="usr-name">{t('adminUsers.fullName')}</Label>
            <Input
              id="usr-name"
              name="full_name"
              value={form.full_name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, full_name: event.target.value }))
              }
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="usr-email">{t('common.email')}</Label>
            <Input
              id="usr-email"
              name="email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, email: event.target.value }))
              }
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="usr-pass">{t('adminUsers.password')}</Label>
            <Input
              id="usr-pass"
              name="password"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, password: event.target.value }))
              }
              required
              minLength={8}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="usr-role">{t('adminUsers.role')}</Label>
            <Select
              value={form.role_id}
              onValueChange={(v) => setForm((prev) => ({ ...prev, role_id: v }))}
            >
              <SelectTrigger id="usr-role">
                <SelectValue placeholder={t('adminUsers.selectRole')} />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r: any) => (
                  <SelectItem key={r.id} value={String(r.id)}>
                    {roleLabel(r.name, t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t('adminUsers.deptHint')}</Label>
            <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-3">
              {departments.map((d: any) => (
                <label
                  key={d.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={form.department_ids.includes(Number(d.id))}
                    onCheckedChange={() => toggleCreateDept(Number(d.id))}
                  />
                  <span>{d.name}</span>
                </label>
              ))}
              {departments.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('adminUsers.noDept')}</p>
              ) : null}
            </div>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit">{t('adminUsers.createBtn')}</Button>
          </div>
        </form>
      </Card>

      <Card
        title={t('adminUsers.listTitle')}
        subtitle={
          loading ? t('adminUsers.listSubtitleLoading') : t('adminUsers.listSubtitle')
        }
      >
        <div className="space-y-1.5">
          <Label htmlFor="dept-filter">{t('adminUsers.deptFilter')}</Label>
          <Select
            value={deptFilter || 'all'}
            onValueChange={(v) => setDeptFilter(v === 'all' ? '' : v)}
          >
            <SelectTrigger id="dept-filter" className="max-w-[360px]">
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

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('adminUsers.colEmail')}</TableHead>
                <TableHead>{t('adminUsers.colName')}</TableHead>
                <TableHead>{t('adminUsers.colDept')}</TableHead>
                <TableHead>{t('adminUsers.colRole')}</TableHead>
                <TableHead>{t('adminUsers.colStatus')}</TableHead>
                <TableHead>{t('adminUsers.colLock')}</TableHead>
                <TableHead>{t('adminUsers.colActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    {t('common.loading')}
                  </TableCell>
                </TableRow>
              ) : paginatedUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    {t('adminUsers.empty')}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedUsers.map((user: any) => {
                  const rowBusy = rowBusyId != null && String(rowBusyId) === String(user.id)
                  const selfRow = authUser != null && String(user.id) === String(authUser.id)
                  return (
                    <TableRow key={user.id}>
                      <TableCell>{user.email}</TableCell>
                      <TableCell className="font-medium">{user.full_name}</TableCell>
                      <TableCell className="text-xs">
                        {user.departments?.length
                          ? user.departments.join(', ')
                          : t('common.emDash')}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{user.role}</Badge>
                      </TableCell>
                      <TableCell>
                        {user.is_active ? (
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300">
                            {t('common.active')}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">{t('common.inactive')}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {user.is_locked ? (
                          <Badge variant="destructive">{t('adminUsers.lockLocked')}</Badge>
                        ) : (
                          <Badge variant="outline">{t('adminUsers.lockNormal')}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={rowBusy}
                            onClick={() => openEditModal(user)}
                          >
                            <Edit className="mr-1 size-3.5" />
                            {t('adminUsers.edit')}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={rowBusy}
                            onClick={() => toggleUserStatus(user)}
                          >
                            {user.is_active
                              ? t('adminUsers.deactivate')
                              : t('adminUsers.activate')}
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            disabled={rowBusy || selfRow}
                            onClick={() => deleteUser(user)}
                          >
                            <Trash2 className="mr-1 size-3.5" />
                            {t('common.delete')}
                          </Button>
                          <Button asChild variant="ghost" size="sm">
                            <Link to={`/documents?ownerId=${user.id}`}>
                              <ExternalLink className="mr-1 size-3.5" />
                              {t('adminUsers.viewDocs')}
                            </Link>
                          </Button>
                          {user.is_locked ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={rowBusy}
                              onClick={() => unlockUser(user.id)}
                            >
                              <Unlock className="mr-1 size-3.5" />
                              {t('common.unlock')}
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        {!loading && users.length > 0 ? (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {t('adminUsers.pageOf', { page: listSafePage, total: listTotalPages })}
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="icon"
                className="size-7"
                type="button"
                onClick={() => setListPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-7"
                type="button"
                onClick={() => setListPage((p) => Math.min(listTotalPages, p + 1))}
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <Modal
        open={editOpen}
        title={t('adminUsers.editModalTitle')}
        onClose={() => setEditOpen(false)}
      >
        {editLoading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <form onSubmit={saveEdit} className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {t('adminUsers.editIdLine', { id: editUserId })}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="ed-name">{t('adminUsers.fullName')}</Label>
              <Input
                id="ed-name"
                name="full_name"
                value={editForm.full_name}
                onChange={(e) => setEditForm((p) => ({ ...p, full_name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ed-email">{t('adminUsers.emailReadonly')}</Label>
              <Input
                id="ed-email"
                name="email"
                type="email"
                autoComplete="email"
                value={editForm.email}
                readOnly
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ed-role">{t('adminUsers.role')}</Label>
              <Select
                value={editForm.role_id}
                onValueChange={(v) => setEditForm((p) => ({ ...p, role_id: v }))}
              >
                <SelectTrigger id="ed-role">
                  <SelectValue placeholder={t('adminUsers.selectRole')} />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r: any) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {roleLabel(r.name, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ed-status">{t('adminUsers.colStatus')}</Label>
              <Select
                value={editForm.is_active ? '1' : '0'}
                onValueChange={(v) =>
                  setEditForm((p) => ({ ...p, is_active: v === '1' }))
                }
              >
                <SelectTrigger id="ed-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">{t('common.active')}</SelectItem>
                  <SelectItem value="0">{t('common.inactive')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('adminUsers.deptHint')}</Label>
              <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
                {departments.map((d: any) => (
                  <label key={d.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={editForm.department_ids.includes(Number(d.id))}
                      onCheckedChange={() => toggleEditDept(Number(d.id))}
                    />
                    <span>{d.name}</span>
                  </label>
                ))}
                {departments.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('adminUsers.noDept')}</p>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button type="submit" disabled={editSaving}>
                {editSaving ? t('profile.saving') : t('common.save')}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={editSaving}
                onClick={() => setEditOpen(false)}
              >
                {t('adminUsers.cancel')}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
