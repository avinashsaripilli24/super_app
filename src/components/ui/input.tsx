import * as React from 'react'

import { cn } from '@/lib/utils'

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  ref?: React.Ref<HTMLInputElement>
}

// Phone keyboard defaults per type; props passed explicitly win.
const noAutoText = { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false } as const
const TYPE_DEFAULTS: Record<string, Partial<InputProps>> = {
  search: noAutoText,
  email: { inputMode: 'email', ...noAutoText },
  tel: { inputMode: 'tel', ...noAutoText },
  password: noAutoText,
}

function Input({ className, type, ref, ...props }: InputProps) {
  return (
    <input
      ref={ref}
      type={type}
      {...(type ? TYPE_DEFAULTS[type] : undefined)}
      data-slot="input"
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-1 text-base shadow-xs outline-none transition-[color,box-shadow] file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/40',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
