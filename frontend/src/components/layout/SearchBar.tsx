import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import { Input } from '@/components/shadcn/input'

export default function SearchBar() {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const navigate = useNavigate()

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const query = q.trim()
    if (!query) return
    navigate(`/search?q=${encodeURIComponent(query)}`)
  }

  return (
    <form onSubmit={onSubmit} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={q}
        onChange={(event) => setQ(event.target.value)}
        placeholder={t('searchBar.placeholder')}
        aria-label={t('searchBar.placeholder')}
        className="h-9 pl-9"
      />
    </form>
  )
}
