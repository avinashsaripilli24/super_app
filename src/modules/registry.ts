import { Landmark, LayoutDashboard, Settings, Users, Wallet, type LucideIcon } from 'lucide-react'

import type { Enums } from '@/lib/database.types'

export type AppRole = Enums<'app_role'>

export interface ModuleDef {
  id: string
  title: string
  /** Short label for the bottom tab bar. */
  shortTitle?: string
  description: string
  icon: LucideIcon
  path: string
  /** Roles that can see and open this module. */
  roles: AppRole[]
  /** Show in the navigation (md+ sidebar, and the mobile tab bar unless `inTabBar` says otherwise). */
  inNav: boolean
  /**
   * Show as a bottom tab on mobile. Defaults to `inNav`; set `false` to keep a
   * module in the sidebar but out of the tab bar. Four tabs is the comfortable
   * maximum on a small phone.
   */
  inTabBar?: boolean
  /** Show as a tile on the Dashboard. */
  onDashboard: boolean
  /** Accent colour for the dashboard tile. */
  color: string
}

/**
 * Single source of truth for modules. Adding a module = one folder under
 * src/modules/<name> + one entry here + its routes wired in src/router.tsx.
 */
export const MODULES: ModuleDef[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    shortTitle: 'Home',
    description: 'Overview of everything at a glance.',
    icon: LayoutDashboard,
    path: '/',
    roles: ['admin', 'user'],
    inNav: true,
    onDashboard: false,
    color: '#2563eb',
  },
  {
    id: 'expenses',
    title: 'Expense Tracker',
    shortTitle: 'Expenses',
    description: 'Track daily spending, income and monthly budgets.',
    icon: Wallet,
    path: '/expenses',
    roles: ['admin', 'user'],
    inNav: true,
    onDashboard: true,
    color: '#f97316',
  },
  {
    id: 'assets',
    title: 'Assets & Debts',
    shortTitle: 'Assets',
    description: 'Net worth: investments, loans, current values and targets.',
    icon: Landmark,
    path: '/assets',
    roles: ['admin', 'user'],
    inNav: true,
    onDashboard: true,
    color: '#0d9488',
  },
  {
    id: 'users',
    title: 'User Management',
    shortTitle: 'Users',
    description: 'Create users, assign roles and manage access.',
    icon: Users,
    path: '/users',
    roles: ['admin'],
    inNav: true,
    // Admin-only and rarely used: keep the phone's tab bar at four everyday
    // tabs. Admins reach it from the sidebar, the dashboard tile or the
    // account menu.
    inTabBar: false,
    onDashboard: true,
    color: '#8b5cf6',
  },
  {
    id: 'settings',
    title: 'Settings',
    shortTitle: 'Settings',
    description: 'Profile, password, theme and app install.',
    icon: Settings,
    path: '/settings',
    roles: ['admin', 'user'],
    inNav: true,
    onDashboard: true,
    color: '#64748b',
  },
]

export function modulesForRole(role: AppRole | null | undefined): ModuleDef[] {
  if (!role) return []
  return MODULES.filter((m) => m.roles.includes(role))
}

/** Modules that get a tab in the mobile bottom bar. */
export function tabBarModules(modules: ModuleDef[]): ModuleDef[] {
  return modules.filter((m) => m.inNav && (m.inTabBar ?? true))
}

export function moduleForPath(pathname: string): ModuleDef | undefined {
  // Longest matching prefix wins; "/" only matches exactly.
  return MODULES.filter((m) => (m.path === '/' ? pathname === '/' : pathname.startsWith(m.path))).sort(
    (a, b) => b.path.length - a.path.length,
  )[0]
}
