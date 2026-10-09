import type { EnableStep } from '@/lib/push'
import { cn } from '@/lib/utils'

const STEPS: { step: EnableStep; label: string }[] = [
  { step: 'permission', label: 'Waiting for you to allow notifications…' },
  { step: 'subscribing', label: 'Registering this phone. This can take a few seconds…' },
  { step: 'saving', label: 'Almost done…' },
]

/** Progress while notifications are being turned on: done steps filled, the current one shimmering. */
export function PushProgress({ step }: { step: EnableStep }) {
  const current = STEPS.findIndex((s) => s.step === step)
  return (
    <div role="status" aria-live="polite" className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <div className="flex gap-1.5">
        {STEPS.map((s, i) => (
          <div
            key={s.step}
            className={cn(
              'h-1.5 flex-1 rounded-full',
              i < current ? 'bg-primary' : i === current ? 'skeleton-shimmer' : 'bg-muted',
            )}
          />
        ))}
      </div>
      <p className="text-sm text-muted-foreground">{STEPS[current]?.label}</p>
    </div>
  )
}
