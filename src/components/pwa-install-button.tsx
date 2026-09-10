import { useState } from 'react'
import { Download, Share } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { usePwaInstall } from '@/hooks/use-pwa-install'

/**
 * Header "Install" button, shown while the app runs in a browser tab and can
 * be installed: the native prompt on Chrome/Edge/Android, the Share → "Add to
 * Home Screen" hint on iOS Safari. Hidden once installed.
 */
export function PwaInstallButton() {
  const { canPrompt, installed, ios, promptInstall } = usePwaInstall()
  const [busy, setBusy] = useState(false)

  if (installed || (!canPrompt && !ios)) return null

  const trigger = (onClick?: () => void) => (
    <Button variant="outline" className="shrink-0" onClick={onClick} disabled={busy}>
      <Download /> Install
    </Button>
  )

  if (canPrompt) {
    const install = async () => {
      setBusy(true)
      const result = await promptInstall()
      setBusy(false)
      if (result === 'accepted') toast.success('Installing…')
    }
    return trigger(() => void install())
  }

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger()}</PopoverTrigger>
      <PopoverContent align="end" className="space-y-1">
        <p className="text-sm font-medium">Install Super App</p>
        <p className="text-sm text-muted-foreground">
          In Safari, tap <Share className="inline size-4 align-text-bottom" /> Share, then choose{' '}
          <span className="font-medium text-foreground">Add to Home Screen</span>.
        </p>
      </PopoverContent>
    </Popover>
  )
}
