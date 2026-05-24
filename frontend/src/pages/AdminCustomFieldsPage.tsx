import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import api from '../services/api/client'
import Card from '../components/ui/Card'
import { Button } from '@/components/shadcn/button'
import { Input } from '@/components/shadcn/input'
import { Label } from '@/components/shadcn/label'
import { Checkbox } from '@/components/shadcn/checkbox'
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
import { useToast } from '../state/ToastContext'

export default function AdminCustomFieldsPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const [list, setList] = useState<any[]>([])
  const [form, setForm] = useState({
    name: '',
    type: 'text',
    options: '',
    documentType: '',
    isActive: true,
  })

  const load = async () => {
    try {
      const res = await api.get('/custom-fields')
      setList(res.data.data || [])
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('adminCustomFields.loadError'))
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      let options: any = null
      if (form.type === 'select' && form.options.trim()) {
        try {
          options = JSON.parse(form.options)
        } catch {
          options = form.options.split(',').map((s) => s.trim())
        }
      }
      await api.post('/custom-fields', {
        name: form.name,
        type: form.type,
        options,
        documentType: form.documentType || null,
        isActive: form.isActive,
      })
      toast.success(t('adminCustomFields.created'))
      setForm({ name: '', type: 'text', options: '', documentType: '', isActive: true })
      void load()
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('adminCustomFields.saveFail'))
    }
  }

  const remove = async (id: number) => {
    if (!window.confirm(t('adminCustomFields.deleteConfirm'))) return
    try {
      await api.delete(`/custom-fields/${id}`)
      toast.success(t('adminCustomFields.deleted'))
      void load()
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('adminCustomFields.saveFail'))
    }
  }

  return (
    <div className="space-y-4">
      <Card
        title={t('adminCustomFields.title')}
        subtitle={
          <span>
            {t('adminCustomFields.subtitle')}{' '}
            <Link
              to="/admin/settings"
              className="text-primary underline-offset-4 hover:underline"
            >
              {t('adminCustomFields.backSettings')}
            </Link>
          </span>
        }
      >
        <form onSubmit={create} className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cf-name">{t('adminCustomFields.nameLabel')}</Label>
            <Input
              id="cf-name"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cf-type">{t('adminCustomFields.typeLabel')}</Label>
            <Select
              value={form.type}
              onValueChange={(v) => setForm((p) => ({ ...p, type: v }))}
            >
              <SelectTrigger id="cf-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">{t('adminCustomFields.typeText')}</SelectItem>
                <SelectItem value="date">{t('adminCustomFields.typeDate')}</SelectItem>
                <SelectItem value="number">{t('adminCustomFields.typeNumber')}</SelectItem>
                <SelectItem value="select">{t('adminCustomFields.typeSelect')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cf-options">{t('adminCustomFields.optionsLabel')}</Label>
            <Input
              id="cf-options"
              value={form.options}
              onChange={(e) => setForm((p) => ({ ...p, options: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cf-cat">{t('adminCustomFields.categoryLimitLabel')}</Label>
            <Input
              id="cf-cat"
              value={form.documentType}
              onChange={(e) => setForm((p) => ({ ...p, documentType: e.target.value }))}
            />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <Checkbox
              checked={form.isActive}
              onCheckedChange={(c) => setForm((p) => ({ ...p, isActive: c === true }))}
            />
            <span>{t('adminCustomFields.activeLabel')}</span>
          </label>
          <div className="sm:col-span-2">
            <Button type="submit">{t('adminCustomFields.submit')}</Button>
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
              {list.map((f: any) => (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">{f.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{f.type}</Badge>
                  </TableCell>
                  <TableCell>{f.document_type || t('common.emDash')}</TableCell>
                  <TableCell>
                    <Button
                      variant="destructive"
                      size="sm"
                      type="button"
                      onClick={() => remove(f.id)}
                    >
                      <Trash2 className="mr-1 size-3.5" />
                      {t('common.delete')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {list.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    {t('common.noResults', '—')}
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
