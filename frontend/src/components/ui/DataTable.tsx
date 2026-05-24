import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/shadcn/table'
import { Skeleton } from '@/components/shadcn/skeleton'
import { Button } from '@/components/shadcn/button'
import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface DataTableColumn<T = any> {
  key: string
  label: React.ReactNode
  render?: (row: T) => React.ReactNode
  tdClassName?: string
}

export interface DataTableProps<T = any> {
  columns: DataTableColumn<T>[]
  rows: T[]
  pageSize?: number
  loading?: boolean
  emptyMessage?: React.ReactNode
}

export default function DataTable<T extends { id?: any }>({
  columns,
  rows,
  pageSize = 5,
  loading = false,
  emptyMessage,
}: DataTableProps<T>) {
  const { t } = useTranslation()
  const [page, setPage] = React.useState(1)
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, totalPages)

  React.useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const paginated = React.useMemo(() => {
    const start = (safePage - 1) * pageSize
    return rows.slice(start, start + pageSize)
  }, [rows, safePage, pageSize])

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column.key} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: Math.min(pageSize, 5) }, (_, i) => (
                <TableRow key={`sk-${i}`}>
                  {columns.map((col) => (
                    <TableCell key={col.key}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-sm text-muted-foreground">
                  {emptyMessage ?? t('common.noResults', 'Aucun résultat')}
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((row, index) => (
                <TableRow key={`${(row as any).id ?? 'r'}-${index}`}>
                  {columns.map((column) => (
                    <TableCell key={column.key} className={cn('align-middle text-sm', column.tdClassName)}>
                      {typeof column.render === 'function'
                        ? column.render(row)
                        : (row as any)[column.key]}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {totalPages > 1 ? (
        <div className="flex flex-col items-center justify-between gap-2 px-1 text-xs text-muted-foreground sm:flex-row">
          <span>
            {t('common.page', 'Page')} {safePage} / {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setPage(1)}
              disabled={safePage <= 1}
              aria-label={t('common.firstPage', 'First page')}
            >
              <ChevronsLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              aria-label={t('common.prev', 'Previous')}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              aria-label={t('common.next', 'Next')}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setPage(totalPages)}
              disabled={safePage >= totalPages}
              aria-label={t('common.lastPage', 'Last page')}
            >
              <ChevronsRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
