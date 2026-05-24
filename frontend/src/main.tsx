import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './state/AuthContext'
import { ToastProvider } from './state/ToastContext'
import { ThemeProvider } from './components/theme-provider'
import { TooltipProvider } from './components/shadcn/tooltip'
import { initPromise } from './i18n.js'

void initPromise.then(() => {
  const root = document.getElementById('root')
  if (!root) return
  createRoot(root).render(
    <StrictMode>
      <BrowserRouter>
        <ThemeProvider defaultTheme="system" storageKey="dms-ui-theme">
          <TooltipProvider delayDuration={150}>
            <AuthProvider>
              <ToastProvider>
                <App />
              </ToastProvider>
            </AuthProvider>
          </TooltipProvider>
        </ThemeProvider>
      </BrowserRouter>
    </StrictMode>,
  )
})
