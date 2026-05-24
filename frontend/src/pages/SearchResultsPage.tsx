import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import api from '../services/api/client'
import { useToast } from '../state/ToastContext'
import { statusBadgeClass, statusLabel } from '../utils/documentUi'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/shadcn/card'
import { Button } from '@/components/shadcn/button'
import { Input } from '@/components/shadcn/input'
import { Label } from '@/components/shadcn/label'

function highlightText(text: string, term: string) {
  if (!text) return ''
  if (!term) return text
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark class="bg-amber-200/60 dark:bg-amber-900/40 rounded px-0.5">$1</mark>')
}

export default function SearchResultsPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [filters, setFilters] = useState({
    q: params.get('q') || '',
    category: params.get('category') || '',
    status: params.get('status') || '',
    dateFrom: params.get('dateFrom') || '',
    dateTo: params.get('dateTo') || '',
  })
  const [results, setResults] = useState<any[]>([])
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0 })
  const [loading, setLoading] = useState(false)

  const fetchSearch = async (nextPage = 1) => {
    setLoading(true)
    try {
      const query = new URLSearchParams({
        q: filters.q || '',
        category: filters.category || '',
        status: filters.status || '',
        dateFrom: filters.dateFrom || '',
        dateTo: filters.dateTo || '',
        page: String(nextPage),
        limit: '10',
      })
      const response = await api.get(`/documents/search?${query.toString()}`)
      setResults(response.data.data || [])
      setPagination(response.data.pagination || { page: nextPage, limit: 10, total: 0 })
      setParams(query)
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('searchResults.searchFail'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchSearch(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((pagination.total || 0) / (pagination.limit || 10))),
    [pagination],
  )

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('searchResults.filtersTitle')}</CardTitle>
          <CardDescription>{t('searchResults.filtersSub')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void fetchSearch(1)
            }}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="q">{t('searchResults.keyword')}</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="q"
                  value={filters.q}
                  onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="category">{t('common.category')}</Label>
              <Input
                id="category"
                value={filters.category}
                onChange={(event) => setFilters((prev) => ({ ...prev, category: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status">{t('common.status')}</Label>
              <Input
                id="status"
                value={filters.status}
                onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dateFrom">{t('searchResults.dateFrom')}</Label>
              <Input
                id="dateFrom"
                type="date"
                value={filters.dateFrom}
                onChange={(event) => setFilters((prev) => ({ ...prev, dateFrom: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dateTo">{t('searchResults.dateTo')}</Label>
              <Input
                id="dateTo"
                type="date"
                value={filters.dateTo}
                onChange={(event) => setFilters((prev) => ({ ...prev, dateTo: event.target.value }))}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full" disabled={loading}>
                {t('common.apply')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('searchResults.resultsTitle')}</CardTitle>
          <CardDescription>
            {loading
              ? t('searchResults.searching')
              : t('searchResults.resultCount', { total: pagination.total })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {results.length === 0 && !loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('searchResults.noResults')}</p>
          ) : (
            <ul className="divide-y">
              {results.map((result) => (
                <li key={result.id} className="py-3">
                  <Link
                    to={`/documents/${result.id}`}
                    className="text-base font-semibold hover:underline"
                  >
                    {result.title}
                  </Link>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{result.category}</span>
                    <span>·</span>
                    <span className={statusBadgeClass(result.status)}>{statusLabel(result.status, t)}</span>
                    <span>·</span>
                    <span>{result.owner_name}</span>
                  </p>
                  <p
                    className="mt-2 text-sm text-muted-foreground"
                    dangerouslySetInnerHTML={{
                      __html: highlightText(
                        (result.extracted_text || result.description || '').slice(0, 240),
                        filters.q,
                      ),
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1 || loading}
              onClick={() => fetchSearch(pagination.page - 1)}
            >
              {t('common.prev')}
            </Button>
            <span>
              {t('common.page')} {pagination.page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= totalPages || loading}
              onClick={() => fetchSearch(pagination.page + 1)}
            >
              {t('common.next')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
