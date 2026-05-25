import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Bell,
  Building2,
  ClipboardList,
  ClipboardCheck,
  Files,
  Gauge,
  Inbox,
  LayoutGrid,
  History,
  Sliders,
  Trash2,
  UserCircle,
  Users,
  LogOut,
  Settings,
  ChevronDown,
  Search,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../state/AuthContext'
import api from '../services/api/client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/shadcn/button'
import { Badge } from '@/components/shadcn/badge'
import { Avatar, AvatarFallback } from '@/components/shadcn/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/shadcn/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/shadcn/sidebar'
import { Separator } from '@/components/shadcn/separator'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/shadcn/command'
import AppBreadcrumb from '../components/layout/AppBreadcrumb'
import LanguageSwitcher from '../components/layout/LanguageSwitcher'
import { ThemeToggle } from '@/components/theme-toggle'

type NavItem = {
  icon: LucideIcon
  labelKey: string
  to: string
  adminOnly?: boolean
}

type NavSection = {
  titleKey: string
  items: NavItem[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    titleKey: 'nav.section.main',
    items: [
      { icon: Gauge, labelKey: 'nav.dashboard', to: '/dashboard' },
      { icon: Files, labelKey: 'nav.documents', to: '/documents' },
    ],
  },
  {
    titleKey: 'nav.section.workflow',
    items: [
      { icon: ClipboardCheck, labelKey: 'nav.myTasks', to: '/workflows/tasks' },
      { icon: ClipboardList, labelKey: 'nav.templates', to: '/workflows/templates', adminOnly: true },
    ],
  },
  {
    titleKey: 'nav.section.ai',
    items: [{ icon: LayoutGrid, labelKey: 'nav.aiHub', to: '/ai' }],
  },
  {
    titleKey: 'nav.section.external',
    items: [
      { icon: Inbox, labelKey: 'nav.uploadRequests', to: '/upload-requests' },
      { icon: Trash2, labelKey: 'nav.trash', to: '/trash' },
    ],
  },
  {
    titleKey: 'nav.section.management',
    items: [
      { icon: Users, labelKey: 'nav.users', to: '/admin/users', adminOnly: true },
      { icon: Sliders, labelKey: 'nav.settings', to: '/admin/settings', adminOnly: true },
      { icon: History, labelKey: 'nav.auditLogs', to: '/audit-logs', adminOnly: true },
    ],
  },
]

function userInitials(name?: string | null) {
  if (!name) return 'U'
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase() || 'U'
}

export default function MainLayout() {
  const { t } = useTranslation()
  const { user, logout, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [unreadCount, setUnreadCount] = useState(0)
  const [commandOpen, setCommandOpen] = useState(false)

  const sections = useMemo(
    () =>
      NAV_SECTIONS.map((sec) => ({
        title: t(sec.titleKey),
        items: sec.items
          .filter((item) => !item.adminOnly || isAdmin)
          .map((item) => ({ ...item, label: t(item.labelKey) })),
      })).filter((sec) => sec.items.length > 0),
    [isAdmin, t],
  )

  useEffect(() => {
    let cancelled = false
    const loadUnread = async () => {
      try {
        const res = await api.get('/notifications/unread/count')
        if (!cancelled) setUnreadCount(Number(res.data.data?.unread || 0))
      } catch {
        if (!cancelled) setUnreadCount(0)
      }
    }
    void loadUnread()
    const timer = setInterval(loadUnread, 30000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setCommandOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const version = (import.meta as any).env?.VITE_APP_VERSION || '0.0.0'

  const runCommand = (path: string) => {
    setCommandOpen(false)
    navigate(path)
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="border-r">
        <SidebarHeader>
          <Link to="/dashboard" className="flex items-center gap-2 px-2 py-1.5">
            <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <span className="text-sm font-bold">D</span>
            </div>
            <div className="flex flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
              <span className="text-sm font-semibold">DMS Workspace</span>
              <span className="text-[11px] text-muted-foreground">{t('layout.brandSubtitle')}</span>
            </div>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          {sections.map((sec) => (
            <SidebarGroup key={sec.title}>
              <SidebarGroupLabel>{sec.title}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {sec.items.map((item) => (
                    <SidebarMenuItem key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.to === '/dashboard'}
                        className={({ isActive }) =>
                          cn(
                            'block w-full',
                            isActive && '[&>button]:bg-sidebar-accent [&>button]:text-sidebar-accent-foreground',
                          )
                        }
                      >
                        <SidebarMenuButton tooltip={item.label}>
                          <item.icon className="size-4" aria-hidden />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </NavLink>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter>
          <div className="px-2 py-1 text-[11px] text-muted-foreground group-data-[collapsible=icon]:hidden">
            {t('layout.footerVersion', { version })}
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-14 w-full items-center gap-2 border-b bg-background/80 px-3 backdrop-blur supports-backdrop-filter:bg-background/60 md:px-4">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <SidebarTrigger className="-ml-1 shrink-0" />
            <Separator orientation="vertical" className="mx-1 hidden h-5 sm:block" />
            <Button
              variant="outline"
              size="sm"
              className="h-9 min-w-0 w-full max-w-md justify-start gap-2 text-muted-foreground"
              onClick={() => setCommandOpen(true)}
            >
              <Search className="size-4 shrink-0" />
              <span className="truncate">{t('searchBar.placeholder')}</span>
              <kbd className="ml-auto hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
                ⌘K
              </kbd>
            </Button>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
            <Button
              asChild
              variant="ghost"
              size="icon"
              aria-label={t('layout.notifications')}
              className="relative"
            >
              <Link to="/notifications">
                <Bell className="size-4" />
                {unreadCount > 0 ? (
                  <Badge
                    variant="destructive"
                    className="absolute -right-1 -top-1 h-4 min-w-4 rounded-full px-1 text-[10px] tabular-nums"
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Badge>
                ) : null}
              </Link>
            </Button>

            <ThemeToggle />
            <LanguageSwitcher compact />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-9 gap-2 pl-1.5 pr-2">
                  <Avatar className="size-7">
                    <AvatarFallback className="bg-primary text-xs font-medium text-primary-foreground">
                      {userInitials(user?.fullName)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden max-w-[160px] truncate text-sm font-medium md:inline">
                    {user?.fullName || t('common.user')}
                  </span>
                  <ChevronDown className="hidden size-3.5 text-muted-foreground md:inline" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="flex flex-col gap-0.5">
                  <span className="text-sm">{user?.fullName || t('common.user')}</span>
                  <span className="truncate text-xs font-normal text-muted-foreground">{user?.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem asChild>
                    <Link to="/profile">
                      <UserCircle className="mr-2 size-4" />
                      {t('nav.profile')}
                    </Link>
                  </DropdownMenuItem>
                  {isAdmin ? (
                    <DropdownMenuItem asChild>
                      <Link to="/admin/settings">
                        <Settings className="mr-2 size-4" />
                        {t('nav.settings')}
                      </Link>
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void logout()}>
                  <LogOut className="mr-2 size-4" />
                  {t('layout.logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <div className="border-b bg-background px-4 py-2.5 md:px-6">
          <AppBreadcrumb />
        </div>

        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-6 lg:px-8">
          <Outlet />
        </main>

        <footer className="border-t bg-background px-4 py-3 text-xs text-muted-foreground md:px-6">
          <div className="flex flex-wrap items-center gap-1.5">
            <span>{t('layout.footerCopyright', { year: new Date().getFullYear() })}</span>
            <span>·</span>
            <span>{t('layout.footerVersion', { version })}</span>
            <span>·</span>
            <span>{t('layout.footerDocs')}</span>
          </div>
        </footer>
      </SidebarInset>

      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        <CommandInput placeholder={t('searchBar.placeholder')} />
        <CommandList>
          <CommandEmpty>{t('common.noResults', 'Aucun résultat')}</CommandEmpty>
          {sections.map((sec) => (
            <span key={sec.title} className="contents">
              <CommandGroup heading={sec.title}>
                {sec.items.map((item) => (
                  <CommandItem
                    key={item.to}
                    value={`${sec.title} ${item.label} ${item.to}`}
                    onSelect={() => runCommand(item.to)}
                  >
                    <item.icon className="mr-2 size-4" />
                    <span>{item.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
            </span>
          ))}
        </CommandList>
      </CommandDialog>
    </SidebarProvider>
  )
}
