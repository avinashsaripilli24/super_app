import { useEffect, useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table'
import { format, parseISO } from 'date-fns'
import { Copy, KeyRound, MoreVertical, Plus, RefreshCw, Search, Smartphone, UserCheck, UserX } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ListSkeleton } from '@/components/ui/list-skeleton'
import { LoadMoreSentinel } from '@/components/ui/load-more-sentinel'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useInfiniteList } from '@/hooks/use-infinite-list'
import {
  createUser,
  deactivateUser,
  generateTempPassword,
  listUsersPage,
  reactivateUser,
  resetUserPassword,
  setUserPhone,
  type UserProfile,
} from '@/lib/admin-users'
import { formatPhone } from '@/lib/phone'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/utils'
import {
  changePhoneSchema,
  createUserSchema,
  resetPasswordSchema,
  type ChangePhoneValues,
  type CreateUserValues,
  type ResetPasswordValues,
} from '@/modules/users/schemas'
import { useAuthStore } from '@/store/auth-store'

/** Login number for display; a row without one falls back to its auth email. */
const contactOf = (u: UserProfile) => formatPhone(u.phone) ?? u.email
const labelOf = (u: UserProfile) => u.full_name || contactOf(u)

/** Shimmer shaped like one table row: name/number block + two badges. */
const skeletonRow = () => (
  <div className="flex items-center gap-3">
    <Skeleton className="h-10 flex-1" />
    <Skeleton className="h-6 w-16" />
    <Skeleton className="h-6 w-16" />
  </div>
)

export function UsersPage() {
  const me = useAuthStore((s) => s.profile)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search.trim(), 300)

  const [createOpen, setCreateOpen] = useState(false)
  const [resetTarget, setResetTarget] = useState<UserProfile | null>(null)
  const [phoneTarget, setPhoneTarget] = useState<UserProfile | null>(null)
  const [toggleTarget, setToggleTarget] = useState<UserProfile | null>(null)
  const [toggling, setToggling] = useState(false)

  const list = useInfiniteList<UserProfile>(
    (offset, limit, signal) => listUsersPage({ offset, limit, search: debouncedSearch }, signal),
    `users|${debouncedSearch.toLowerCase()}`,
    { errorLabel: 'Failed to load users' },
  )
  const { reload } = list

  const columns = useMemo<ColumnDef<UserProfile>[]>(
    () => [
      {
        id: 'user',
        header: 'User',
        accessorFn: (u) => `${u.full_name ?? ''} ${contactOf(u)}`.toLowerCase(),
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">
              {row.original.full_name || '—'}
              {row.original.id === me?.id && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}
            </p>
            <p className="truncate text-xs text-muted-foreground">{contactOf(row.original)}</p>
          </div>
        ),
      },
      {
        id: 'role',
        header: 'Role',
        accessorKey: 'role',
        cell: ({ getValue }) => (
          <Badge variant={getValue<string>() === 'admin' ? 'default' : 'secondary'} className="capitalize">
            {getValue<string>()}
          </Badge>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        accessorKey: 'is_active',
        cell: ({ getValue }) =>
          getValue<boolean>() ? <Badge variant="success">Active</Badge> : <Badge variant="destructive">Inactive</Badge>,
      },
      {
        id: 'created',
        header: 'Created',
        accessorKey: 'created_at',
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{format(parseISO(getValue<string>()), 'd MMM yyyy')}</span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const u = row.original
          const isSelf = u.id === me?.id
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon-sm" variant="ghost" aria-label="Actions">
                  <MoreVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => setResetTarget(u)}>
                  <KeyRound /> Reset password
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setPhoneTarget(u)}>
                  <Smartphone /> Change mobile number
                </DropdownMenuItem>
                {u.is_active ? (
                  <DropdownMenuItem disabled={isSelf} onSelect={() => setToggleTarget(u)}>
                    <UserX /> Deactivate
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => setToggleTarget(u)}>
                    <UserCheck /> Reactivate
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    [me?.id],
  )

  // Column definitions only; search and paging happen server-side.
  const table = useReactTable({ data: list.items, columns, getCoreRowModel: getCoreRowModel() })

  const onToggle = async () => {
    if (!toggleTarget) return
    setToggling(true)
    try {
      if (toggleTarget.is_active) {
        await deactivateUser(toggleTarget.id)
        toast.success(`${labelOf(toggleTarget)} deactivated`)
      } else {
        await reactivateUser(toggleTarget.id)
        toast.success(`${labelOf(toggleTarget)} reactivated`)
      }
      setToggleTarget(null)
      reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setToggling(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Users"
        description="Create accounts and control access."
        actions={
          <>
            <Button size="icon-sm" variant="ghost" aria-label="Refresh" onClick={reload}>
              <RefreshCw />
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus /> Add user
            </Button>
          </>
        }
      />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search by name or mobile"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        {list.loading ? (
          <ListSkeleton rows={6} row={skeletonRow} className="p-3" />
        ) : list.items.length === 0 ? (
          list.error ? null : (
            <EmptyState title="No users found" description="Try a different search or add a user." />
          )
        ) : (
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((h) => (
                    <TableHead
                      key={h.id}
                      className={h.column.id === 'created' ? 'hidden sm:table-cell' : undefined}
                    >
                      {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={
                        cell.column.id === 'created'
                          ? 'hidden sm:table-cell'
                          : cell.column.id === 'user'
                            ? 'max-w-[12rem] whitespace-normal'
                            : undefined
                      }
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {!list.loading && (
        <LoadMoreSentinel
          sentinelRef={list.sentinelRef}
          hasMore={list.hasMore}
          loadingMore={list.loadingMore}
          error={list.error}
          onRetry={list.items.length === 0 ? reload : list.loadMore}
          rows={3}
          row={skeletonRow}
        />
      )}

      <CreateUserSheet open={createOpen} onOpenChange={setCreateOpen} onSaved={reload} />
      <ResetPasswordSheet target={resetTarget} onOpenChange={(o) => !o && setResetTarget(null)} />
      <ChangePhoneSheet target={phoneTarget} onOpenChange={(o) => !o && setPhoneTarget(null)} onSaved={reload} />

      <ConfirmDialog
        open={!!toggleTarget}
        onOpenChange={(o) => !o && setToggleTarget(null)}
        title={
          toggleTarget?.is_active
            ? `Deactivate ${labelOf(toggleTarget)}?`
            : `Reactivate ${toggleTarget ? labelOf(toggleTarget) : ''}?`
        }
        description={
          toggleTarget?.is_active
            ? 'They will be signed out and unable to sign in until reactivated.'
            : 'They will be able to sign in again with their existing password.'
        }
        tone={toggleTarget?.is_active ? 'destructive' : 'success'}
        confirmLabel={toggleTarget?.is_active ? 'Deactivate' : 'Reactivate'}
        loading={toggling}
        onConfirm={onToggle}
      />
    </div>
  )
}

// -----------------------------------------------------------------------------

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  } catch {
    toast.error('Could not copy')
  }
}

function CreateUserSheet({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { full_name: '', phone: '', role: 'user', password: '' },
  })

  useEffect(() => {
    if (open) reset({ full_name: '', phone: '', role: 'user', password: generateTempPassword() })
  }, [open, reset])

  const onSubmit = async (values: CreateUserValues) => {
    try {
      await createUser(values)
      toast.success('User created', {
        description: `${values.full_name} signs in with ${formatPhone(values.phone)}. Share the temporary password with them.`,
        action: { label: 'Copy password', onClick: () => void copy(values.password) },
        duration: 10_000,
      })
      onOpenChange(false)
      onSaved()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Add user</SheetTitle>
          <SheetDescription>They sign in with this mobile number and temporary password.</SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <SheetBody className="space-y-4">
            <Field label="Full name" htmlFor="u-name" error={errors.full_name?.message}>
              <Input id="u-name" autoComplete="off" autoCapitalize="words" placeholder="Jane Doe" {...register('full_name')} />
            </Field>
            <Field label="Mobile number" htmlFor="u-phone" error={errors.phone?.message}>
              <Input id="u-phone" type="tel" autoComplete="off" placeholder="98765 43210" {...register('phone')} />
            </Field>
            <Field label="Role" error={errors.role?.message}>
              <Controller
                control={control}
                name="role"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field
              label="Temporary password"
              htmlFor="u-password"
              error={errors.password?.message}
              hint="Share this with the user. They can change it in Settings."
            >
              <div className="flex gap-2">
                <Input
                  id="u-password"
                  autoComplete="new-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="font-mono"
                  {...register('password')}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Generate"
                  onClick={() => setValue('password', generateTempPassword(), { shouldValidate: true })}
                >
                  <RefreshCw />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Copy"
                  onClick={() => void copy(getValues('password'))}
                >
                  <Copy />
                </Button>
              </div>
            </Field>
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating…' : 'Create user'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

function ResetPasswordSheet({
  target,
  onOpenChange,
}: {
  target: UserProfile | null
  onOpenChange: (o: boolean) => void
}) {
  const open = !!target
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '' },
  })

  useEffect(() => {
    if (open) reset({ password: generateTempPassword() })
  }, [open, reset])

  const onSubmit = async (values: ResetPasswordValues) => {
    if (!target) return
    try {
      await resetUserPassword(target.id, values.password)
      toast.success('Password reset', {
        description: `Share the new temporary password with ${labelOf(target)}.`,
        action: { label: 'Copy password', onClick: () => void copy(values.password) },
        duration: 10_000,
      })
      onOpenChange(false)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Reset password</SheetTitle>
          <SheetDescription>{target && `${labelOf(target)} · ${contactOf(target)}`}</SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <SheetBody className="space-y-4">
            <Field label="New temporary password" htmlFor="r-password" error={errors.password?.message}>
              <div className="flex gap-2">
                <Input
                  id="r-password"
                  autoComplete="new-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="font-mono"
                  {...register('password')}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Generate"
                  onClick={() => setValue('password', generateTempPassword(), { shouldValidate: true })}
                >
                  <RefreshCw />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Copy"
                  onClick={() => void copy(getValues('password'))}
                >
                  <Copy />
                </Button>
              </div>
            </Field>
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Reset password'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

function ChangePhoneSheet({
  target,
  onOpenChange,
  onSaved,
}: {
  target: UserProfile | null
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const me = useAuthStore((s) => s.profile)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePhoneValues>({
    resolver: zodResolver(changePhoneSchema),
    defaultValues: { phone: '' },
  })

  useEffect(() => {
    if (target) reset({ phone: target.phone?.replace(/^\+91/, '') ?? '' })
  }, [target, reset])

  const onSubmit = async (values: ChangePhoneValues) => {
    if (!target) return
    try {
      await setUserPhone(target.id, values.phone)
      if (target.id === me?.id) {
        // Your own number: the session still holds the old auth email (Forgot
        // PIN signs in with it) until it is refreshed.
        await supabase.auth.refreshSession()
        await useAuthStore.getState().refreshProfile()
      }
      toast.success('Mobile number changed', {
        description: `${labelOf(target)} now signs in with ${formatPhone(values.phone)}.`,
      })
      onOpenChange(false)
      onSaved()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Sheet open={!!target} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Change mobile number</SheetTitle>
          <SheetDescription>
            {target && `${labelOf(target)} signs in with this number from now on. Their password stays the same.`}
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <SheetBody className="space-y-4">
            <Field label="Mobile number" htmlFor="p-phone" error={errors.phone?.message}>
              <Input id="p-phone" type="tel" autoComplete="off" placeholder="98765 43210" {...register('phone')} />
            </Field>
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Change number'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
