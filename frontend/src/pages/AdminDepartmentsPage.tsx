import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Edit, Trash2 } from 'lucide-react'
import api from '../services/api/client'
import Card from '../components/ui/Card'
import { Button } from '@/components/shadcn/button'
import { Input } from '@/components/shadcn/input'
import { Label } from '@/components/shadcn/label'
import { Textarea } from '@/components/shadcn/textarea'
import { Badge } from '@/components/shadcn/badge'
import { useToast } from '../state/ToastContext'

export default function AdminDepartmentsPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const [list, setList] = useState<any[]>([])
  const [overview, setOverview] = useState<any[]>([])
  const [form, setForm] = useState({ name: '', description: '' })
  const [editing, setEditing] = useState<any>(null)

  const load = async () => {
    try {
      const [res, ov] = await Promise.all([
        api.get('/departments'),
        api.get('/departments/overview'),
      ])
      setList(res.data.data || [])
      setOverview(ov.data.data || [])
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('adminDepartments.loadError'))
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    try {
      if (editing) {
        await api.put(`/departments/${editing.id}`, form)
        toast.success(t('adminDepartments.updated'))
      } else {
        await api.post('/departments', form)
        toast.success(t('adminDepartments.created'))
      }
      setForm({ name: '', description: '' })
      setEditing(null)
      void load()
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('adminDepartments.saveFail'))
    }
  }

  const remove = async (id: number) => {
    if (!window.confirm(t('adminDepartments.deleteConfirm'))) return
    try {
      await api.delete(`/departments/${id}`)
      toast.success(t('adminDepartments.deleted'))
      void load()
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('adminDepartments.saveFail'))
    }
  }

  return (
    <div className="space-y-4">
      <Card title={t('adminDepartments.title')} subtitle={t('adminDepartments.subtitle')}>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="dept-name">{t('common.name')}</Label>
            <Input
              id="dept-name"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dept-desc">{t('documentDetail.description')}</Label>
            <Textarea
              id="dept-desc"
              rows={3}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit">
              {editing ? t('adminDepartments.save') : t('adminDepartments.create')}
            </Button>
            {editing ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditing(null)
                  setForm({ name: '', description: '' })
                }}
              >
                {t('adminDepartments.cancelEdit')}
              </Button>
            ) : null}
          </div>
        </form>
      </Card>

      <Card
        title={t('adminDepartments.viewTitle')}
        subtitle={t('adminDepartments.viewSub')}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {overview.map((d: any) => (
            <div key={d.id} className="rounded-lg border bg-card p-4">
              <h4 className="text-sm font-semibold">{d.name}</h4>
              <p className="text-xs text-muted-foreground">{d.description || t('common.emDash')}</p>
              <div className="mt-2 flex gap-2 text-xs">
                <Badge variant="secondary">{d.userCount} 👤</Badge>
                <Badge variant="outline">{d.docCount} 📄</Badge>
              </div>
              {d.users?.length ? (
                <ul className="mt-3 space-y-1 text-sm">
                  {d.users.map((u: any) => (
                    <li key={u.id} className="flex justify-between">
                      <span>{u.full_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {t('adminDepartments.memberDocs', { count: u.docCount })}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t('adminDepartments.noUsersInDept')}
                </p>
              )}
            </div>
          ))}
        </div>
        {overview.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('adminDepartments.empty')}</p>
        ) : null}
      </Card>

      <Card title={t('adminDepartments.listTitle')} subtitle={t('adminDepartments.listSub')}>
        <ul className="divide-y">
          {list.map((d: any) => (
            <li key={d.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <strong className="block text-sm">{d.name}</strong>
                <p className="text-xs text-muted-foreground">
                  {d.description || t('common.emDash')}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => {
                    setEditing(d)
                    setForm({ name: d.name, description: d.description || '' })
                  }}
                >
                  <Edit className="mr-1 size-3.5" />
                  {t('common.edit')}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  type="button"
                  onClick={() => remove(d.id)}
                >
                  <Trash2 className="mr-1 size-3.5" />
                  {t('common.delete')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
