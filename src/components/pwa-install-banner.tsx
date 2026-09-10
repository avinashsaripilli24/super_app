import { useState } from 'react'
import { Download, Share, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { INSTALL_DISMISS_KEY, usePwaInstall } from '@/hooks/use-pwa-install'

function readDismissed() {
  try {
    return localStorage.getItem(INSTALL_DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

/** Slim banner above the bottom nav inviting the user to install the app. */
export function PwaInstallBanner() {
  const { canPrompt, installed, ios, promptInstall } = usePwaInstall()
  const [dismissed, setDismissed] = useState(readDismissed)

  if (installed || dismissed) return null
  if (!canPrompt && !ios) return null

  const dismiss = () => {
    try {
      localStorage.setItem(INSTALL_DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
    setDismissed(true)
  }

  return (
    <div className="mx-3 mb-2 flex items-center gap-3 rounded-xl border bg-card px-3 py-2 text-sm shadow-md">
      <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <Download className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium leading-tight">Install Super App</p>
        {ios && !canPrompt ? (
          <p className="text-xs text-muted-foreground">
            Tap <Share className="inline size-3.5 align-text-bottom" /> then “Add to Home Screen”.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Add it to your home screen for quick access.</p>
        )}
      </div>
      {canPrompt && (
        <Button size="sm" onClick={() => void promptInstall()}>
          Install
        </Button>
      )}
      <Button size="icon-sm" variant="ghost" aria-label="Dismiss" onClick={dismiss}>
        <X />
      </Button>
    </div>
  )
}
