import { Link } from '@tanstack/react-router'

import { cn } from '@/lib/utils'

/** Month | Year segmented control shared by the month and year pages. */
export function ViewToggle({ active }: { active: 'month' | 'year' }) {
  const item = (key: 'month' | 'year', label: string, to: '/expenses' | '/expenses/year') => (
    <Link
      to={to}
      className={cn(
        'rounded-md py-1.5 text-center text-sm font-medium transition-colors',
        active === key ? 'bg-card shadow-xs' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </Link>
  )
  return (
    <div className="mx-auto grid w-full max-w-xs grid-cols-2 gap-1 rounded-lg bg-muted p-1">
      {item('month', 'Month', '/expenses')}
      {item('year', 'Year', '/expenses/year')}
    </div>
  )
}
