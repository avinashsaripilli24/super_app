import { useEffect, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Download, Laptop, LogOut, Moon, Share, Sun } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { SecurityCard } from '@/components/app-lock/security-card'
import { useTheme, type Theme } from '@/components/theme-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { usePwaInstall } from '@/hooks/use-pwa-install'
import { formatPhone } from '@/lib/phone'
import { supabase } from '@/lib/supabase'
import { cn, errorMessage } from '@/lib/utils'
import { useAuthStore } from '@/store/auth-store'

const profileSchema = z.object({
  full_name: z.string().trim().min(1, 'Name is required').max(120),
})
type ProfileValues = z.infer<typeof profileSchema>

const passwordSchema = z
  .object({
    password: z.string().min(8, 'At least 8 characters').max(72),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
type PasswordValues = z.infer<typeof passwordSchema>

export function SettingsPage() {
  const profile = useAuthStore((s) => s.profile)
  const refreshProfile = useAuthStore((s) => s.refreshProfile)
  const signOut = useAuthStore((s) => s.signOut)

  return (
    <div className="space-y-4">
      <ProfileCard
        fullName={profile?.full_name ?? ''}
        phone={formatPhone(profile?.phone) ?? profile?.email}
        role={profile?.role}
        loading={!profile}
        onSaved={refreshProfile}
      />
      <PasswordCard />
      <SecurityCard />
      <AppearanceCard />
      <InstallCard />
      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <div>
            <p className="text-sm font-medium">Super App</p>
            <p className="text-xs text-muted-foreground">Version {__APP_VERSION__}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void signOut()}>
            <LogOut /> Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function ProfileCard({
  fullName,
  phone,
  role,
  loading,
  onSaved,
}: {
  fullName: string
  phone?: string
  role?: string
  loading: boolean
  onSaved: () => Promise<void>
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileValues>({ resolver: zodResolver(profileSchema), defaultValues: { full_name: fullName } })

  useEffect(() => {
    reset({ full_name: fullName })
  }, [fullName, reset])

  const onSubmit = async (values: ProfileValues) => {
    const { data: session } = await supabase.auth.getSession()
    const id = session.session?.user.id
    if (!id) return
    const { error } = await supabase.from('profiles').update({ full_name: values.full_name }).eq('id', id)
    if (error) {
      toast.error(errorMessage(error))
      return
    }
    await onSaved()
    toast.success('Profile updated')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Your name is shown to administrators.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Field label="Full name" htmlFor="full_name" error={errors.full_name?.message}>
              <Input id="full_name" autoComplete="name" autoCapitalize="words" {...register('full_name')} />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="Mobile number"
                hint={role === 'admin' ? 'Change it from Users.' : 'Ask an administrator to change it.'}
              >
                <Input value={phone ?? ''} readOnly disabled />
              </Field>
              <Field label="Role">
                <div className="flex h-10 items-center">
                  <Badge variant={role === 'admin' ? 'default' : 'secondary'} className="capitalize">
                    {role}
                  </Badge>
                </div>
              </Field>
            </div>
            <Button type="submit" disabled={isSubmitting || !isDirty}>
              {isSubmitting ? 'Saving…' : 'Save changes'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

function PasswordCard() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: '', confirm: '' },
  })

  const onSubmit = async (values: PasswordValues) => {
    const { error } = await supabase.auth.updateUser({ password: values.password })
    if (error) {
      toast.error(errorMessage(error))
      return
    }
    reset()
    toast.success('Password changed')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
        <CardDescription>Use at least 8 characters.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Field label="New password" htmlFor="new-password" error={errors.password?.message}>
            <Input id="new-password" type="password" autoComplete="new-password" {...register('password')} />
          </Field>
          <Field label="Confirm new password" htmlFor="confirm-password" error={errors.confirm?.message}>
            <Input id="confirm-password" type="password" autoComplete="new-password" {...register('confirm')} />
          </Field>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Updating…' : 'Update password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function AppearanceCard() {
  const { theme, setTheme } = useTheme()
  const options: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Laptop },
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setTheme(o.value)}
              className={cn(
                'flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors',
                theme === o.value ? 'bg-card shadow-xs' : 'text-muted-foreground',
              )}
            >
              <o.icon className="size-4" /> {o.label}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function InstallCard() {
  const { canPrompt, installed, ios, promptInstall } = usePwaInstall()
  const [busy, setBusy] = useState(false)

  const install = async () => {
    setBusy(true)
    const result = await promptInstall()
    setBusy(false)
    if (result === 'accepted') toast.success('Installing…')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Install app</CardTitle>
        <CardDescription>Add Super App to your home screen for a full-screen experience.</CardDescription>
      </CardHeader>
      <CardContent>
        {installed ? (
          <p className="flex items-center gap-2 text-sm text-success">
            <Download className="size-4" /> Installed. You are using the app version.
          </p>
        ) : canPrompt ? (
          <Button onClick={() => void install()} disabled={busy}>
            <Download /> Install
          </Button>
        ) : ios ? (
          <p className="text-sm text-muted-foreground">
            In Safari, tap <Share className="inline size-4 align-text-bottom" /> Share, then choose{' '}
            <span className="font-medium text-foreground">Add to Home Screen</span>.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Open this site in Chrome or Edge on your phone and use the browser menu to install it.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
