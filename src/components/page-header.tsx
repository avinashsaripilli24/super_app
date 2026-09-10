import * as React from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'

import { cn } from '@/lib/utils'

/** Page title row with optional back link and right-aligned actions. */
export function PageHeader({
  title,
  description,
  backTo,
  actions,
  className,
}: {
  title: string
  description?: string
  backTo?: string
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-4 flex items-start gap-2', className)}>
      {backTo && (
        <Link
          to={backTo}
          aria-label="Back"
          className="-ml-2 mt-0.5 grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ChevronLeft className="size-5" />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
