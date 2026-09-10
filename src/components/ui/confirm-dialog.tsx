import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { AlertTriangle, type LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type ConfirmTone = 'default' | 'destructive' | 'success'

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: ConfirmTone
  icon?: LucideIcon
  loading?: boolean
  onConfirm: () => void | Promise<void>
}

const toneStyles: Record<
  ConfirmTone,
  { iconWrap: string; iconColor: string; confirmVariant: 'default' | 'destructive' }
> = {
  default: { iconWrap: 'bg-primary/10', iconColor: 'text-primary', confirmVariant: 'default' },
  destructive: {
    iconWrap: 'bg-destructive/10',
    iconColor: 'text-destructive',
    confirmVariant: 'destructive',
  },
  success: { iconWrap: 'bg-success/10', iconColor: 'text-success', confirmVariant: 'default' },
}

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  icon: Icon = AlertTriangle,
  loading = false,
  onConfirm,
}: ConfirmDialogProps) {
  const styles = toneStyles[tone]

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2',
            'rounded-xl border bg-card text-card-foreground shadow-xl outline-none',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
            'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
          )}
        >
          <div className="flex gap-4 px-5 py-5">
            <div
              aria-hidden="true"
              className={cn('grid size-10 shrink-0 place-items-center rounded-full', styles.iconWrap)}
            >
              <Icon className={cn('size-5', styles.iconColor)} />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <DialogPrimitive.Title className="text-sm font-semibold tracking-tight">
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description asChild className="text-xs text-muted-foreground">
                  <div>{description}</div>
                </DialogPrimitive.Description>
              )}
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 border-t bg-card px-5 py-3">
            <Button type="button" variant="ghost" size="sm" disabled={loading} onClick={() => onOpenChange(false)}>
              {cancelLabel}
            </Button>
            <Button
              type="button"
              variant={styles.confirmVariant}
              size="sm"
              disabled={loading}
              onClick={() => void onConfirm()}
            >
              {loading ? 'Working…' : confirmLabel}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export { ConfirmDialog }
