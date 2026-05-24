import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Play, Plus, Trash2 } from 'lucide-react'
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

function formatBytes(n: number) {
  if (n >= 1048576) return `${(n / 1048576).toFixed(1)} Mo`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} Ko`
  return `${n} o`
}

export default function AdminSettingsPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const [maxBytes, setMaxBytes] = useState(10 * 1024 * 1024)
  const [rules, setRules] = useState<any[]>([])
  const [ruleForm, setRuleForm] = useState({
    name: '',
    conditionField: 'status',
    conditionOperator: '=',
    conditionValue: 'active',
    daysInactive: 90,
    isActive: true,
  })

  const load = async () => {
    try {
      const [st, ar] = await Promise.all([
        api.get('/admin/settings'),
        api.get('/admin/archiving-rules'),
      ])
      setMaxBytes(Number(st.data.data?.maxUploadSizeBytes) || 10 * 1024 * 1024)
      setRules(ar.data.data || [])
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

  const createRule = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api.post('/admin/archiving-rules', ruleForm)
      toast.success(t('adminSettings.ruleCreated'))
      setRuleForm({
        name: '',
        conditionField: 'status',
        conditionOperator: '=',
        conditionValue: 'active',
        daysInactive: 90,
        isActive: true,
      })
      void load()
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('adminSettings.saveFail'))
    }
  }

  const deleteRule = async (id: number) => {
    if (!window.confirm(t('adminSettings.deleteRuleConfirm'))) return
    try {
      await api.delete(`/admin/archiving-rules/${id}`)
      toast.success(t('adminSettings.deleted'))
      void load()
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('adminSettings.saveFail'))
    }
  }

  const runJob = async () => {
    try {
      const res = await api.post('/admin/archiving-rules/run-now')
      toast.success(
        t('adminSettings.archiveResult', { count: res.data.data?.archivedTotal ?? 0 }),
      )
      void load()
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('adminSettings.saveFail'))
    }
  }

  return (
    <div className="space-y-4">
      <Card title={t('adminSettings.uploadTitle')} subtitle={t('adminSettings.uploadSub')}>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="max-bytes">
              {t('adminSettings.maxBytesLabel', { human: formatBytes(maxBytes) })}
            </Label>
            <Input
              id="max-bytes"
              type="number"
              value={maxBytes}
              onChange={(e) => setMaxBytes(Number(e.target.value))}
            />
          </div>
          <Button type="button" onClick={saveMax}>
            {t('common.save')}
          </Button>
        </div>
      </Card>

      <Card
        title={t('adminSettings.archiveTitle')}
        subtitle={t('adminSettings.archiveSub')}
        actions={
          <Button variant="outline" size="sm" type="button" onClick={runJob}>
            <Play className="mr-2 size-4" />
            {t('adminSettings.runJobNow')}
          </Button>
        }
      >
        <p className="text-sm text-muted-foreground">{t('adminSettings.archiveIntro')}</p>

        <form onSubmit={createRule} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="rule-name">{t('adminSettings.ruleName')}</Label>
            <Input
              id="rule-name"
              value={ruleForm.name}
              onChange={(e) => setRuleForm((p) => ({ ...p, name: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rule-field">{t('adminSettings.conditionField')}</Label>
            <Select
              value={ruleForm.conditionField}
              onValueChange={(v) => setRuleForm((p) => ({ ...p, conditionField: v }))}
            >
              <SelectTrigger id="rule-field">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="status">status</SelectItem>
                <SelectItem value="category">category</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rule-op">{t('adminSettings.operator')}</Label>
            <Select
              value={ruleForm.conditionOperator}
              onValueChange={(v) => setRuleForm((p) => ({ ...p, conditionOperator: v }))}
            >
              <SelectTrigger id="rule-op">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="=">=</SelectItem>
                <SelectItem value="!=">≠</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rule-value">{t('adminSettings.value')}</Label>
            <Input
              id="rule-value"
              value={ruleForm.conditionValue}
              onChange={(e) => setRuleForm((p) => ({ ...p, conditionValue: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rule-days">{t('adminSettings.inactiveDays')}</Label>
            <Input
              id="rule-days"
              type="number"
              value={ruleForm.daysInactive}
              onChange={(e) =>
                setRuleForm((p) => ({ ...p, daysInactive: Number(e.target.value) }))
              }
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={ruleForm.isActive}
              onCheckedChange={(c) => setRuleForm((p) => ({ ...p, isActive: c === true }))}
            />
            <span>{t('adminSettings.activeRule')}</span>
          </label>
          <div className="sm:col-span-2 lg:col-span-3">
            <Button type="submit">
              <Plus className="mr-2 size-4" />
              {t('adminSettings.addRule')}
            </Button>
          </div>
        </form>

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.name')}</TableHead>
                <TableHead>{t('adminSettings.colCondition')}</TableHead>
                <TableHead>{t('adminSettings.colDays')}</TableHead>
                <TableHead>{t('adminSettings.colRuleActive')}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-xs">
                    {r.condition_field} {r.condition_operator}{' '}
                    {r.condition_value ?? t('common.emDash')}
                  </TableCell>
                  <TableCell>{r.days_inactive}</TableCell>
                  <TableCell>
                    {r.is_active ? (
                      <Badge>{t('common.yes')}</Badge>
                    ) : (
                      <Badge variant="secondary">{t('common.no')}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="destructive"
                      size="sm"
                      type="button"
                      onClick={() => deleteRule(r.id)}
                    >
                      <Trash2 className="mr-1 size-3.5" />
                      {t('common.delete')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {rules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
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
