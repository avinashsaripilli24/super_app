import * as React from 'react'
import { Inbox, type LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
}

function EmptyState({ icon: Icon = Inbox, title, description, action, className, ...rest }: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      role="status"
      className={cn('flex flex-col items-center justify-center px-6 py-10 text-center', className)}
      {...rest}
    >
      <div
        aria-hidden="true"
        className="mb-4 grid size-12 place-items-center rounded-full bg-muted text-muted-foreground"
      >
        <Icon className="size-5" />
      </div>
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export { EmptyState }
