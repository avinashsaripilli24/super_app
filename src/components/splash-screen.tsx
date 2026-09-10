import { AppLogo } from '@/components/app-logo'

/** Full-screen splash shown while the auth session is being restored. */
export function SplashScreen() {
  return (
    <div className="flex h-full min-h-dvh flex-col items-center justify-center gap-4 bg-background">
      <AppLogo className="h-16 w-auto" />
      <p className="text-sm text-muted-foreground">Loading Super App…</p>
    </div>
  )
}
