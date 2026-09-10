import * as React from 'react'

import { Input } from '@/components/ui/input'
import { PIN_MAX } from '@/lib/app-lock'
import { cn } from '@/lib/utils'

/**
 * Digits-only PIN box. A masked text field rather than type="password", so
 * password managers don't offer to save the PIN after every unlock.
 */
export function PinInput({ className, ...props }: React.ComponentProps<typeof Input>) {
  return (
    <Input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={PIN_MAX}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="none"
      spellCheck={false}
      data-1p-ignore
      data-lpignore="true"
      className={cn('h-12 text-center text-xl tracking-[0.5em] [-webkit-text-security:disc]', className)}
      {...props}
    />
  )
}
