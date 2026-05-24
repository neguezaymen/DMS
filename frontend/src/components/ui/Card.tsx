import * as React from 'react'
import {
  Card as ShadCard,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/shadcn/card'
import { cn } from '@/lib/utils'

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
}

export default function Card({
  title,
  subtitle,
  actions,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <ShadCard className={cn('gap-3', className)} {...rest}>
      {(title || subtitle || actions) && (
        <CardHeader className={cn('flex flex-row items-start justify-between gap-3', actions ? '' : '')}>
          <div className="min-w-0 flex-1 space-y-1">
            {title ? (
              <CardTitle className="text-base font-semibold leading-tight">{title}</CardTitle>
            ) : null}
            {subtitle ? (
              <CardDescription className="text-sm">{subtitle}</CardDescription>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </CardHeader>
      )}
      <CardContent className="flex flex-col gap-3">{children}</CardContent>
    </ShadCard>
  )
}
