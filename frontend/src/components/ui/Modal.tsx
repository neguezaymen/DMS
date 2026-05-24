import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/shadcn/dialog'

export interface ModalProps {
  open: boolean
  title?: React.ReactNode
  description?: React.ReactNode
  onClose: () => void
  children?: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const SIZE_CLASS: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
}

export default function Modal({
  open,
  title,
  description,
  onClose,
  children,
  size = 'md',
}: ModalProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className={SIZE_CLASS[size]}>
        {(title || description) && (
          <DialogHeader>
            {title ? <DialogTitle>{title}</DialogTitle> : null}
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
        )}
        <div className="flex flex-col gap-3">{children}</div>
      </DialogContent>
    </Dialog>
  )
}
