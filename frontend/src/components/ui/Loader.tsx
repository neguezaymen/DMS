import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton as ShadSkeleton } from '@/components/shadcn/skeleton'

export function Loader({ className, label }: { className?: string; label?: string }) {
  return (
    <div
      role="status"
      aria-label={label || 'Chargement'}
      className={cn('flex items-center justify-center text-muted-foreground', className)}
    >
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <ShadSkeleton className={cn('h-4 w-full', className)} />
}

export default Loader
