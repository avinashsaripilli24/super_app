import { Link, Outlet, useLocation, useNavigate } from '@tanstack/react-router'
import { LogOut, UserRound } from 'lucide-react'
import { toast } from 'sonner'

import { AppLogo } from '@/components/app-logo'
import { PwaInstallBanner } from '@/components/pwa-install-banner'
import { PwaInstallButton } from '@/components/pwa-install-button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { moduleForPath, modulesForRole, tabBarModules } from '@/modules/registry'
import { useAuthStore } from '@/store/auth-store'

function initials(name: string | null | undefined, email: string | undefined) {
  const src = (name && name.trim()) || email || '?'
  return src
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join('')
}

/**
 * Mobile-first shell: sticky top bar, scrollable content, bottom tab bar on
 * small screens and a left sidebar from `md` up. Navigation entries come from
 * the module registry filtered by the signed-in role.
 */
export function AppShell() {
  const profile = useAuthStore((s) => s.profile)
  const signOut = useAuthStore((s) => s.signOut)
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const modules = modulesForRole(profile?.role)
  const navItems = modules.filter((m) => m.inNav)
  const tabItems = tabBarModules(modules)
  // Nav modules kept out of the phone's tab bar still need a route in: the
  // account menu carries them on small screens.
  const menuOnly = navItems.filter((m) => !tabItems.includes(m))
  const current = moduleForPath(pathname)

  const isActive = (path: string) => (path === '/' ? pathname === '/' : pathname.startsWith(path))

  const onSignOut = async () => {
    await signOut()
    toast.success('Signed out')
    void navigate({ to: '/login' })
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden md:flex-row">
      {/* Sidebar (md+) */}
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <AppLogo className="h-7 w-auto" />
          <span className="font-semibold tracking-tight">Super App</span>
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {navItems.map((m) => (
            <Link
              key={m.id}
              to={m.path}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive(m.path)
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
              )}
            >
              <m.icon className="size-4" />
              {m.title}
            </Link>
          ))}
        </nav>
      </aside>

      {/* min-h-0 lets this column shrink so <main> scrolls instead of the page. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="pt-safe sticky top-0 z-40 border-b bg-card/80 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-4">
            <AppLogo className="h-7 w-auto md:hidden" />
            <h1 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight">
              {current?.title ?? 'Super App'}
            </h1>
            <PwaInstallButton />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Account menu"
                  className="grid size-9 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-foreground outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2"
                >
                  {initials(profile?.full_name, profile?.email)}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel className="space-y-0.5">
                  <p className="truncate text-sm font-medium text-foreground">
                    {profile?.full_name || 'Account'}
                  </p>
                  <p className="truncate text-xs font-normal">{profile?.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {menuOnly.map((m) => (
                  <DropdownMenuItem key={m.id} className="md:hidden" onSelect={() => void navigate({ to: m.path })}>
                    <m.icon /> {m.title}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem onSelect={() => void navigate({ to: '/settings' })}>
                  <UserRound /> Profile & settings
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void onSignOut()}>
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Content */}
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl px-4 py-4 pb-6">
            <Outlet />
          </div>
        </main>

        {/* Bottom nav (mobile); out of the way while typing, like a native app. */}
        <div className="md:hidden keyboard-open:hidden">
          <PwaInstallBanner />
          <nav className="pb-safe border-t bg-card">
            <ul className="flex items-stretch">
              {tabItems.map((m) => {
                const active = isActive(m.path)
                return (
                  <li key={m.id} className="flex-1">
                    <Link
                      to={m.path}
                      className={cn(
                        'flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors',
                        active ? 'text-primary' : 'text-muted-foreground',
                      )}
                    >
                      <span
                        className={cn(
                          'grid h-7 w-12 place-items-center rounded-full transition-colors',
                          active && 'bg-primary/12',
                        )}
                      >
                        <m.icon className="size-5" />
                      </span>
                      {m.shortTitle ?? m.title}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>
        </div>
      </div>
    </div>
  )
}
