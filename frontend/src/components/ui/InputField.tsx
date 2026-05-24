import * as React from 'react'
import { Input } from '@/components/shadcn/input'
import { Label } from '@/components/shadcn/label'
import { cn } from '@/lib/utils'

export interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode
  error?: string
  hint?: React.ReactNode
}

let uid = 0
const nextId = () => `input-${++uid}`

const InputField = React.forwardRef<HTMLInputElement, InputFieldProps>(
  ({ label, error, hint, id, className, ...props }, ref) => {
    const inputId = React.useMemo(() => id || nextId(), [id])
    return (
      <div className="flex w-full flex-col gap-1.5">
        {label ? (
          <Label htmlFor={inputId} className="text-sm font-medium">
            {label}
          </Label>
        ) : null}
        <Input
          id={inputId}
          ref={ref}
          aria-invalid={Boolean(error)}
          className={cn(error && 'border-destructive ring-destructive/20', className)}
          {...props}
        />
        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : hint ? (
          <p className="text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </div>
    )
  },
)
InputField.displayName = 'InputField'

export default InputField
