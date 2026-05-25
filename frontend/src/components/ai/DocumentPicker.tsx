import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import api from '../../services/api/client'
import { Checkbox } from '@/components/shadcn/checkbox'
import { Label } from '@/components/shadcn/label'
import { Input } from '@/components/shadcn/input'
import { cn } from '@/lib/utils'

type Doc = { id: number; title: string; category?: string }

type Props = {
  selected: number[]
  onChange: (ids: number[]) => void
  max?: number
  className?: string
}

export default function DocumentPicker({ selected, onChange, max = 12, className }: Props) {
  const { t } = useTranslation()
  const [docs, setDocs] = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const res = await api.get('/documents?limit=50&page=1')
        if (!cancelled) {
          setDocs(Array.isArray(res.data?.data) ? res.data.data : [])
        }
      } catch {
        if (!cancelled) setDocs([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = docs.filter((d) => {
    const q = filter.trim().toLowerCase()
    if (!q) return true
    return `${d.title} ${d.category || ''}`.toLowerCase().includes(q)
  })

  const toggle = (id: number) => {
    if (selected.includes(id)) {
      onChange(selected.filter((x) => x !== id))
      return
    }
    if (selected.length >= max) return
    onChange([...selected, id])
  }

  return (
    <div className={cn('space-y-3 rounded-lg border p-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm font-medium">{t('aiFeatures.documentPickerTitle')}</Label>
        <span className="text-xs text-muted-foreground">
          {t('aiFeatures.documentPickerCount', { n: selected.length, max })}
        </span>
      </div>
      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={t('aiFeatures.documentPickerFilter')}
        className="h-8"
      />
      <div className="max-h-[240px] space-y-1 overflow-y-auto">
        {loading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('common.noResults')}</p>
        ) : (
          filtered.map((doc) => (
            <label
              key={doc.id}
              className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50"
            >
              <Checkbox
                checked={selected.includes(doc.id)}
                onCheckedChange={() => toggle(doc.id)}
                className="mt-0.5"
              />
              <span className="min-w-0 flex-1">
                <Link to={`/documents/${doc.id}`} className="text-sm font-medium hover:underline">
                  {doc.title}
                </Link>
                <span className="block text-xs text-muted-foreground">
                  #{doc.id} · {doc.category || t('common.emDash')}
                </span>
              </span>
            </label>
          ))
        )}
      </div>
    </div>
  )
}
