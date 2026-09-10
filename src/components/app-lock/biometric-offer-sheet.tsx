import { useState } from 'react'
import { FingerprintPattern } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { enrollBiometric, isBiometricCancel } from '@/lib/app-lock'
import { errorMessage } from '@/lib/utils'
import { useAuthStore } from '@/store/auth-store'

/** Right after the first PIN is set: offer fingerprint / Face ID for next time. */
export function BiometricOfferSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const session = useAuthStore((s) => s.session)
  const profile = useAuthStore((s) => s.profile)
  const [busy, setBusy] = useState(false)

  const enable = async () => {
    if (!session) return
    setBusy(true)
    try {
      await enrollBiometric({ id: session.user.id, phone: profile?.phone, name: profile?.full_name })
      toast.success('Fingerprint / Face ID turned on')
      onOpenChange(false)
    } catch (err) {
      if (!isBiometricCancel(err)) toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Unlock with fingerprint / Face ID?</SheetTitle>
          <SheetDescription>Open Assets without typing the PIN. You can change this in Settings.</SheetDescription>
        </SheetHeader>
        <SheetBody className="flex justify-center py-6">
          <span className="grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary">
            <FingerprintPattern className="size-8" />
          </span>
        </SheetBody>
        <SheetFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Not now
          </Button>
          <Button onClick={() => void enable()} disabled={busy}>
            {busy ? 'Waiting…' : 'Enable'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
