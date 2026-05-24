import * as React from 'react'
import { Button as ShadButton } from '@/components/shadcn/button'
import { cn } from '@/lib/utils'

type LegacyVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'destructive'
  | 'success'
  | 'link'

type ShadVariant = React.ComponentProps<typeof ShadButton>['variant']
type ShadSize = React.ComponentProps<typeof ShadButton>['size']

const VARIANT_MAP: Record<LegacyVariant, ShadVariant> = {
  primary: 'default',
  secondary: 'secondary',
  outline: 'outline',
  ghost: 'ghost',
  danger: 'destructive',
  destructive: 'destructive',
  success: 'default',
  link: 'link',
}

export interface ButtonProps extends Omit<React.ComponentProps<typeof ShadButton>, 'variant'> {
  variant?: LegacyVariant
  size?: ShadSize
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', className, ...props }, ref) => {
    const mapped = VARIANT_MAP[variant] || 'default'
    const successClasses =
      variant === 'success'
        ? 'bg-emerald-600 text-white hover:bg-emerald-600/90 dark:bg-emerald-500 dark:hover:bg-emerald-500/90'
        : ''
    return <ShadButton ref={ref} variant={mapped} className={cn(successClasses, className)} {...props} />
  },
)
Button.displayName = 'Button'

export default Button
export { Button }
