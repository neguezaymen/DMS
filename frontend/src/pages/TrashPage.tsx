import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, RotateCcw, Trash2 } from 'lucide-react'
import api from '../services/api/client'
import { useToast } from '../state/ToastContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/shadcn/card'
import { Button } from '@/components/shadcn/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/shadcn/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/shadcn/alert-dialog'

function formatDate(value: any, locale: string, t: (k: string) => string) {
  if (!value) return t('common.emDash')
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  const loc = locale?.startsWith('en') ? 'en-US' : 'fr-FR'
  return d.toLocaleString(loc)
}

export default function TrashPage() {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<any[]>([])
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 })

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((pagination.total || 0) / (pagination.limit || 20))),
    [pagination],
  )

  const loadTrash = async (page = 1) => {
    setLoading(true)
    try {
      const res = await api.get('/documents/trash', {
        params: { page, limit: pagination.limit || 20 },
      })
      setRows(res.data?.data || [])
      setPagination(res.data?.pagination || { page, limit: 20, total: 0 })
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('trash.loadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadTrash(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const restoreOne = async (id: number | string) => {
    try {
      await api.put(`/documents/trash/${id}/restore`)
      toast.success(t('trash.restoreOk'))
      void loadTrash(pagination.page)
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('trash.restoreFail'))
    }
  }

  const emptyTrash = async () => {
    try {
      const res = await api.delete('/documents/trash/empty')
      const deleted = Number(res.data?.data?.deleted || 0)
      toast.success(t('trash.emptyOk', { count: deleted }))
      void loadTrash(1)
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('trash.emptyFail'))
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">{t('trash.title')}</CardTitle>
          <CardDescription>
            {loading ? t('common.loading') : t('trash.listSubtitle', { total: pagination.total })}
          </CardDescription>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" disabled={loading || rows.length === 0}>
              <Trash2 className="mr-2 size-4" />
              {t('trash.emptyBtn')}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('trash.emptyBtn')}</AlertDialogTitle>
              <AlertDialogDescription>{t('trash.emptyConfirm')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel', 'Annuler')}</AlertDialogCancel>
              <AlertDialogAction onClick={emptyTrash}>{t('common.confirm', 'Confirmer')}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('trash.colTitle')}</TableHead>
                <TableHead>{t('trash.colOwner')}</TableHead>
                <TableHead>{t('trash.colDeleted')}</TableHead>
                <TableHead className="text-right">{t('trash.colActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    <Loader2 className="mx-auto size-4 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    {t('trash.emptyState')}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">{doc.title}</TableCell>
                    <TableCell>{doc.owner_name || t('common.emDash')}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(doc.deleted_at, i18n.language, t)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => restoreOne(doc.id)}>
                        <RotateCcw className="mr-2 size-4" />
                        {t('trash.restore')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <Button
            variant="outline"
            size="sm"
            disabled={loading || pagination.page <= 1}
            onClick={() => loadTrash(Math.max(1, pagination.page - 1))}
          >
            {t('common.prev')}
          </Button>
          <span>
            {t('common.page')} {pagination.page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={loading || pagination.page >= totalPages}
            onClick={() => loadTrash(Math.min(totalPages, pagination.page + 1))}
          >
            {t('common.next')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
