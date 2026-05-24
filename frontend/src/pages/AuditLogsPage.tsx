import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, ChevronLeft, ChevronRight } from 'lucide-react'
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
import api from '../services/api/client'
import { useToast } from '../state/ToastContext'

function formatDateTime(value: any, locale: string) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  const loc = String(locale || 'fr').toLowerCase().startsWith('en') ? 'en-US' : 'fr-FR'
  return d.toLocaleString(loc)
}

function extractLogRowsFromBody(body: any): any[] {
  if (!body || typeof body !== 'object') return []
  if (Array.isArray(body)) return body
  if (Array.isArray(body.logs)) return body.logs
  if (Array.isArray(body.data)) return body.data
  if (body.data && typeof body.data === 'object') {
    if (Array.isArray(body.data.logs)) return body.data.logs
    if (Array.isArray(body.data.data)) return body.data.data
    if (Array.isArray(body.data.items)) return body.data.items
    if (Array.isArray(body.data.results)) return body.data.results
  }
  if (Array.isArray(body.items)) return body.items
  if (Array.isArray(body.results)) return body.results
  return []
}

function extractFilterUsers(body: any): any[] {
  const u = body?.filters?.users
  return Array.isArray(u) ? u : []
}

function extractFilterActions(body: any): string[] {
  const a = body?.filters?.actions
  if (!Array.isArray(a)) return []
  return a
    .map((item: any) => (typeof item === 'string' ? item : item?.action))
    .filter((x: any) => x != null && String(x).trim() !== '')
}

function extractPagination(body: any, fallbackPage: number, fallbackLimit: number) {
  const p = body?.pagination
  if (p && typeof p === 'object') {
    return {
      page: Math.max(1, Number(p.page) || fallbackPage),
      limit: Math.min(100, Math.max(1, Number(p.limit) || fallbackLimit)),
      total: Math.max(0, Number(p.total) || 0),
    }
  }
  return { page: fallbackPage, limit: fallbackLimit, total: 0 }
}

function toAuditTableRow(raw: any, index: number, t: any) {
  if (!raw || typeof raw !== 'object') return null
  const id = raw.id != null ? String(raw.id) : `idx-${index}`
  const userLabel =
    raw.user_name ||
    raw.user_email ||
    (raw.user_id != null && raw.user_id !== ''
      ? t('audit.userNum', { id: raw.user_id })
      : t('common.emDash'))
  const documentLabel =
    raw.document_title ||
    (raw.entity_type === 'document' && raw.entity_id != null && raw.entity_id !== ''
      ? `#${raw.entity_id}`
      : t('common.emDash'))
  return {
    id,
    createdAt: raw.created_at,
    userLabel: userLabel || t('common.emDash'),
    action:
      raw.action != null && String(raw.action).trim() !== ''
        ? String(raw.action)
        : t('common.emDash'),
    documentLabel: documentLabel || t('common.emDash'),
    ip:
      raw.ip_address != null && String(raw.ip_address).trim() !== ''
        ? String(raw.ip_address)
        : t('common.emDash'),
  }
}

export default function AuditLogsPage() {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const toastRef = useRef(toast)
  toastRef.current = toast

  const [loading, setLoading] = useState(false)
  const [logs, setLogs] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [actions, setActions] = useState<string[]>([])
  const [filters, setFilters] = useState({
    userId: '',
    action: '',
    dateFrom: '',
    dateTo: '',
  })
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 })
  const [exporting, setExporting] = useState(false)

  const filtersRef = useRef(filters)
  filtersRef.current = filters
  const paginationRef = useRef(pagination)
  paginationRef.current = pagination

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((pagination.total || 0) / (pagination.limit || 20))),
    [pagination.total, pagination.limit],
  )

  const fetchLogs = useCallback(
    async (page = 1) => {
      setLoading(true)
      try {
        const f = filtersRef.current
        const limit = paginationRef.current.limit || 20
        const params = new URLSearchParams({
          page: String(page),
          limit: String(limit),
        })
        if (f.userId) params.set('userId', f.userId)
        if (f.action) params.set('action', f.action)
        if (f.dateFrom) params.set('dateFrom', f.dateFrom)
        if (f.dateTo) params.set('dateTo', f.dateTo)

        const response = await api.get(`/audit-logs?${params.toString()}`)
        const body = response.data

        const rawRows = extractLogRowsFromBody(body)
        const tableRows = rawRows
          .map((row: any, i: number) => toAuditTableRow(row, i, t))
          .filter(Boolean)

        setLogs(tableRows)
        setUsers(extractFilterUsers(body))
        setActions(extractFilterActions(body))
        setPagination(extractPagination(body, page, limit))
      } catch (error: any) {
        toastRef.current.error(error.response?.data?.message || t('audit.loadError'))
        setLogs([])
      } finally {
        setLoading(false)
      }
    },
    [t],
  )

  const exportCsv = async () => {
    setExporting(true)
    try {
      const f = filtersRef.current
      const params = new URLSearchParams()
      if (f.userId) params.set('userId', f.userId)
      if (f.action) params.set('action', f.action)
      if (f.dateFrom) params.set('dateFrom', f.dateFrom)
      if (f.dateTo) params.set('dateTo', f.dateTo)

      const response = await api.get(`/audit-logs/export?${params.toString()}`, {
        responseType: 'blob',
      })

      const blob =
        response.data instanceof Blob
          ? response.data
          : new Blob([response.data], { type: 'text/csv;charset=utf-8' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit-export-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      toastRef.current.success(t('audit.exportSuccess'))
    } catch (error: any) {
      let msg = t('audit.exportFail')
      const data = error.response?.data
      if (data instanceof Blob) {
        try {
          const txt = await data.text()
          const j = JSON.parse(txt)
          msg = j.message || msg
        } catch {
          msg = error.response?.status === 403 ? t('common.accessDenied') : msg
        }
      } else if (data && typeof data === 'object' && data.message) {
        msg = String(data.message)
      } else if (
        typeof error.message === 'string' &&
        error.message !== 'Request failed with status code 403'
      ) {
        msg = error.message
      } else if (error.response?.status === 403) {
        msg = t('common.accessDenied')
      }
      toastRef.current.error(msg)
    } finally {
      setExporting(false)
    }
  }

  useEffect(() => {
    void fetchLogs(1)
  }, [fetchLogs])

  const applyFilters = () => {
    void fetchLogs(1)
  }

  const goPrev = () => {
    const p = paginationRef.current
    void fetchLogs(Math.max(1, p.page - 1))
  }

  const goNext = () => {
    const p = paginationRef.current
    const tp = Math.max(1, Math.ceil((p.total || 0) / (p.limit || 20)))
    void fetchLogs(Math.min(tp, p.page + 1))
  }

  return (
    <div className="space-y-4">
      <Card
        title={t('audit.title')}
        subtitle={t('audit.subtitle')}
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={loading || exporting}
          >
            <Download className="mr-2 size-4" />
            {exporting ? t('common.exportRunning') : t('audit.exportCsv')}
          </Button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="f-user">{t('audit.userFilter')}</Label>
            <Select
              value={filters.userId || 'all'}
              onValueChange={(v) =>
                setFilters((prev) => ({ ...prev, userId: v === 'all' ? '' : v }))
              }
            >
              <SelectTrigger id="f-user">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all')}</SelectItem>
                {users.map((u: any) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.full_name || u.email || t('audit.userNum', { id: u.id })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-action">{t('audit.actionFilter')}</Label>
            <Select
              value={filters.action || 'all'}
              onValueChange={(v) =>
                setFilters((prev) => ({ ...prev, action: v === 'all' ? '' : v }))
              }
            >
              <SelectTrigger id="f-action">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.all')}</SelectItem>
                {actions.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-from">{t('audit.dateFrom')}</Label>
            <Input
              id="f-from"
              type="date"
              value={filters.dateFrom}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, dateFrom: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-to">{t('audit.dateTo')}</Label>
            <Input
              id="f-to"
              type="date"
              value={filters.dateTo}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, dateTo: event.target.value }))
              }
            />
          </div>
        </div>
        <div>
          <Button type="button" onClick={applyFilters} disabled={loading} size="sm">
            {loading ? t('common.loading') : t('audit.apply')}
          </Button>
        </div>
      </Card>

      <Card
        title={t('audit.tableTitle')}
        subtitle={
          loading ? t('audit.tableLoading') : t('audit.entries', { count: pagination.total })
        }
      >
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('audit.colDate')}</TableHead>
                <TableHead>{t('audit.colUser')}</TableHead>
                <TableHead>{t('audit.colAction')}</TableHead>
                <TableHead>{t('audit.colDocument')}</TableHead>
                <TableHead>{t('audit.colIp')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    {t('common.loading')}
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    {t('audit.emptyFiltered')}
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs">
                      {formatDateTime(log.createdAt, i18n.language)}
                    </TableCell>
                    <TableCell>{log.userLabel}</TableCell>
                    <TableCell>{log.action}</TableCell>
                    <TableCell>{log.documentLabel}</TableCell>
                    <TableCell className="font-mono text-xs">{log.ip}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {t('common.page')} {pagination.page} / {totalPages}
          </span>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-7"
              onClick={goPrev}
              disabled={loading || pagination.page <= 1}
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-7"
              onClick={goNext}
              disabled={loading || pagination.page >= totalPages}
            >
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
