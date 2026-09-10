import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
} from '@tanstack/react-router'

import { AssetsLockGate } from '@/components/app-lock/assets-lock-gate'
import { AppShell } from '@/components/app-shell'
import { NotFoundPage } from '@/pages/not-found'
import { LoginPage } from '@/pages/login'
import { useAuthStore } from '@/store/auth-store'

// Module pages are code-split so the initial bundle stays small.
const DashboardPage = lazyRouteComponent(() => import('@/modules/dashboard/dashboard-page'), 'DashboardPage')
const ExpensesPage = lazyRouteComponent(() => import('@/modules/expenses/expenses-page'), 'ExpensesPage')
const CategoriesPage = lazyRouteComponent(() => import('@/modules/expenses/categories-page'), 'CategoriesPage')
const BudgetsPage = lazyRouteComponent(() => import('@/modules/expenses/budgets-page'), 'BudgetsPage')
const YearPage = lazyRouteComponent(() => import('@/modules/expenses/year-page'), 'YearPage')
const UsersPage = lazyRouteComponent(() => import('@/modules/users/users-page'), 'UsersPage')
const SettingsPage = lazyRouteComponent(() => import('@/modules/settings/settings-page'), 'SettingsPage')
const AssetsOverviewPage = lazyRouteComponent(() => import('@/modules/assets/overview-page'), 'AssetsOverviewPage')
const AssetsActivityPage = lazyRouteComponent(() => import('@/modules/assets/activity-page'), 'AssetsActivityPage')
const AssetTypesPage = lazyRouteComponent(() => import('@/modules/assets/types-page'), 'AssetTypesPage')
const AssetTypePage = lazyRouteComponent(() => import('@/modules/assets/type-detail-page'), 'AssetTypePage')
const HoldingPage = lazyRouteComponent(() => import('@/modules/assets/holding-page'), 'HoldingPage')
const AssetTargetsPage = lazyRouteComponent(() => import('@/modules/assets/targets-page'), 'AssetTargetsPage')

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const rootRoute = createRootRoute({
  notFoundComponent: NotFoundPage,
})

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    const r = search.redirect
    return typeof r === 'string' && r.startsWith('/') ? { redirect: r } : {}
  },
  beforeLoad: ({ search }) => {
    if (useAuthStore.getState().status === 'signedIn') {
      throw redirect({ to: search.redirect ?? '/' })
    }
  },
  component: LoginPage,
})

// ---------------------------------------------------------------------------
// Authenticated shell
// ---------------------------------------------------------------------------

const authedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_authed',
  beforeLoad: ({ location }) => {
    if (useAuthStore.getState().status !== 'signedIn') {
      throw redirect({
        to: '/login',
        search: location.pathname === '/' ? {} : { redirect: location.href },
      })
    }
  },
  component: AppShell,
})

const dashboardRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/',
  component: DashboardPage,
})

// Expense tracker ------------------------------------------------------------

const expensesRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/expenses',
  validateSearch: (search: Record<string, unknown>): { month?: string } => {
    const m = search.month
    return typeof m === 'string' && /^\d{4}-\d{2}$/.test(m) ? { month: m } : {}
  },
  component: ExpensesPage,
})

const expenseCategoriesRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/expenses/categories',
  component: CategoriesPage,
})

const expenseYearRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/expenses/year',
  validateSearch: (search: Record<string, unknown>): { year?: number } => {
    const raw = search.year
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN
    return Number.isInteger(n) && n >= 2000 && n <= 2100 ? { year: n } : {}
  },
  component: YearPage,
})

const expenseBudgetsRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/expenses/budgets',
  validateSearch: (search: Record<string, unknown>): { month?: string } => {
    const m = search.month
    return typeof m === 'string' && /^\d{4}-\d{2}$/.test(m) ? { month: m } : {}
  },
  component: BudgetsPage,
})

// Assets & debts --------------------------------------------------------------

// Every Assets page sits behind the PIN / fingerprint lock (it re-locks when
// you navigate out). New Assets routes go under this layout too.
const assetsLockRoute = createRoute({
  getParentRoute: () => authedRoute,
  id: '_assetsLock',
  component: AssetsLockGate,
})

const assetsRoute = createRoute({
  getParentRoute: () => assetsLockRoute,
  path: '/assets',
  validateSearch: (search: Record<string, unknown>): { holder?: string } => {
    const h = search.holder
    return typeof h === 'string' && UUID_RE.test(h) ? { holder: h } : {}
  },
  component: AssetsOverviewPage,
})

const assetsActivityRoute = createRoute({
  getParentRoute: () => assetsLockRoute,
  path: '/assets/activity',
  validateSearch: (search: Record<string, unknown>): { view?: 'year'; month?: string; year?: number } => {
    const out: { view?: 'year'; month?: string; year?: number } = {}
    if (search.view === 'year') out.view = 'year'
    const m = search.month
    if (typeof m === 'string' && /^\d{4}-\d{2}$/.test(m)) out.month = m
    const raw = search.year
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN
    if (Number.isInteger(n) && n >= 2000 && n <= 2100) out.year = n
    return out
  },
  component: AssetsActivityPage,
})

const assetTypesRoute = createRoute({
  getParentRoute: () => assetsLockRoute,
  path: '/assets/types',
  component: AssetTypesPage,
})

const assetTypeRoute = createRoute({
  getParentRoute: () => assetsLockRoute,
  path: '/assets/types/$typeId',
  component: AssetTypePage,
})

const holdingRoute = createRoute({
  getParentRoute: () => assetsLockRoute,
  path: '/assets/holdings/$holdingId',
  component: HoldingPage,
})

const assetTargetsRoute = createRoute({
  getParentRoute: () => assetsLockRoute,
  path: '/assets/targets',
  component: AssetTargetsPage,
})

// Settings --------------------------------------------------------------------

const settingsRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: '/settings',
  component: SettingsPage,
})

// Admin only ------------------------------------------------------------------

const adminRoute = createRoute({
  getParentRoute: () => authedRoute,
  id: '_admin',
  beforeLoad: () => {
    if (useAuthStore.getState().profile?.role !== 'admin') {
      throw redirect({ to: '/' })
    }
  },
})

const usersRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/users',
  component: UsersPage,
})

const routeTree = rootRoute.addChildren([
  loginRoute,
  authedRoute.addChildren([
    dashboardRoute,
    expensesRoute,
    expenseCategoriesRoute,
    expenseYearRoute,
    expenseBudgetsRoute,
    assetsLockRoute.addChildren([
      assetsRoute,
      assetsActivityRoute,
      assetTypesRoute,
      assetTypeRoute,
      holdingRoute,
      assetTargetsRoute,
    ]),
    settingsRoute,
    adminRoute.addChildren([usersRoute]),
  ]),
])

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  scrollRestoration: true,
  defaultPendingComponent: () => (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="skeleton-shimmer h-16 rounded-xl" />
      ))}
    </div>
  ),
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
