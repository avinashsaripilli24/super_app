import type * as React from 'react'
import type { LucideIcon } from 'lucide-react'

/** Centred layout shared by the lock, setup and unavailable screens. */
export function LockShell({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon
  title: string
  description: string
  children?: React.ReactNode
}) {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-5 pt-6 text-center md:pt-12">
      <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="size-6" />
      </span>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children && <div className="w-full space-y-3">{children}</div>}
    </div>
  )
}
