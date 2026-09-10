import { Toaster } from '@/components/ui/sonner'
import { useTheme } from '@/components/theme-provider'

/** App-wide toast host that follows the active theme. */
export function ThemedToaster() {
  const { resolvedTheme } = useTheme()
  return <Toaster theme={resolvedTheme} />
}
