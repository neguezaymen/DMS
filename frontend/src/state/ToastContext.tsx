import * as React from 'react'
import { toast as sonnerToast } from 'sonner'
import { Toaster } from '@/components/shadcn/sonner'

type ToastApi = {
  success: (message: string, opts?: Parameters<typeof sonnerToast.success>[1]) => void
  error: (message: string, opts?: Parameters<typeof sonnerToast.error>[1]) => void
  info: (message: string, opts?: Parameters<typeof sonnerToast.info>[1]) => void
  warning: (message: string, opts?: Parameters<typeof sonnerToast.warning>[1]) => void
}

const toastApi: ToastApi = {
  success: (m, o) => sonnerToast.success(m, o),
  error: (m, o) => sonnerToast.error(m, o),
  info: (m, o) => sonnerToast.info(m, o),
  warning: (m, o) => sonnerToast.warning(m, o),
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster position="top-right" richColors closeButton />
    </>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useToast = (): ToastApi => toastApi
