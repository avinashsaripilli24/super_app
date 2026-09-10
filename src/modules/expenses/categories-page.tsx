import { useEffect, useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Lock, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useAsyncData } from '@/hooks/use-async-data'
import { cn, errorMessage } from '@/lib/utils'
import {
  canEdit,
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
  type Category,
} from '@/modules/expenses/api'
import { CategoryIcon } from '@/modules/expenses/components/category-icon'
import { CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_ICON_NAMES } from '@/modules/expenses/components/category-icons'
import { categorySchema, type CategoryFormValues } from '@/modules/expenses/schemas'
import { useAuthStore } from '@/store/auth-store'

export function CategoriesPage() {
  const { data, loading, reload } = useAsyncData(listCategories, 'categories', 'Failed to load categories')
  const categories = useMemo(() => data ?? [], [data])
  const profile = useAuthStore((s) => s.profile)
  const [search, setSearch] = useState('')
  const term = search.trim().toLowerCase()
  const matching = useMemo(
    () => (term ? categories.filter((c) => c.name.toLowerCase().includes(term)) : categories),
    [categories, term],
  )
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState(false)

  const onDelete = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      await deleteCategory(confirmDelete.id)
      toast.success('Category deleted')
      setConfirmDelete(null)
      reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  const groups: { kind: 'expense' | 'income'; title: string }[] = [
    { kind: 'expense', title: 'Expense categories' },
    { kind: 'income', title: 'Income categories' },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        title="Categories"
        description="Shared by everyone. Custom ones can be changed by their creator or an admin."
        backTo="/expenses"
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditing(null)
              setSheetOpen(true)
            }}
          >
            <Plus /> New
          </Button>
        }
      />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Search categories"
          placeholder="Search expense and income categories"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.kind} className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{g.title}</h3>
            <ul className="divide-y overflow-hidden rounded-xl border bg-card">
              {matching.filter((c) => c.kind === g.kind).length === 0 && (
                <li className="px-3 py-4 text-sm text-muted-foreground">
                  {term ? `No ${g.kind} category matches “${search.trim()}”.` : `No ${g.kind} categories yet.`}
                </li>
              )}
              {matching
                .filter((c) => c.kind === g.kind)
                .map((c) => {
                  const isDefault = c.user_id === null
                  const editable = !isDefault && canEdit(c, profile)
                  return (
                    <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                      <CategoryIcon icon={c.icon} color={c.color} />
                      <span className="min-w-0 flex-1 break-words text-sm font-medium">{c.name}</span>
                      {!editable ? (
                        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                          <Lock className="size-3" /> {isDefault ? 'Default' : 'Shared'}
                        </span>
                      ) : (
                        <>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label="Edit"
                            onClick={() => {
                              setEditing(c)
                              setSheetOpen(true)
                            }}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label="Delete"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setConfirmDelete(c)}
                          >
                            <Trash2 />
                          </Button>
                        </>
                      )}
                    </li>
                  )
                })}
            </ul>
          </section>
        ))
      )}

      <CategorySheet open={sheetOpen} onOpenChange={setSheetOpen} editing={editing} onSaved={reload} />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title={`Delete “${confirmDelete?.name}”?`}
        description="Transactions using it will become uncategorised."
        tone="destructive"
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={onDelete}
      />
    </div>
  )
}

function CategorySheet({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: Category | null
  onSaved: () => void
}) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: '', icon: 'tag', color: CATEGORY_COLORS[0]!, kind: 'expense' },
  })

  useEffect(() => {
    if (!open) return
    reset(
      editing
        ? { name: editing.name, icon: editing.icon, color: editing.color, kind: editing.kind }
        : { name: '', icon: 'tag', color: CATEGORY_COLORS[0]!, kind: 'expense' },
    )
  }, [open, editing, reset])

  const onSubmit = async (values: CategoryFormValues) => {
    try {
      if (editing) {
        await updateCategory(editing.id, { name: values.name, icon: values.icon, color: values.color })
        toast.success('Category updated')
      } else {
        await createCategory(values)
        toast.success('Category created')
      }
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
          <SheetTitle>{editing ? 'Edit category' : 'New category'}</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <SheetBody className="space-y-4">
            {!editing && (
              <Controller
                control={control}
                name="kind"
                render={({ field }) => (
                  <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                    {(['expense', 'income'] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => field.onChange(k)}
                        className={cn(
                          'rounded-md py-2 text-sm font-medium capitalize',
                          field.value === k ? 'bg-card shadow-xs' : 'text-muted-foreground',
                        )}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                )}
              />
            )}
            <Field label="Name" htmlFor="cat-name" error={errors.name?.message}>
              <Input
                id="cat-name"
                placeholder="e.g. Pets"
                autoComplete="off"
                autoCapitalize="words"
                {...register('name')}
              />
            </Field>
            <Field label="Icon" error={errors.icon?.message}>
              <Controller
                control={control}
                name="icon"
                render={({ field }) => (
                  <div className="-m-0.5 grid max-h-56 grid-cols-6 gap-2 overflow-y-auto overscroll-contain p-0.5 sm:grid-cols-7">
                    {CATEGORY_ICON_NAMES.map((name) => {
                      const Icon = CATEGORY_ICONS[name]!
                      const active = field.value === name
                      return (
                        <button
                          key={name}
                          type="button"
                          aria-label={name}
                          onClick={() => field.onChange(name)}
                          className={cn(
                            'grid aspect-square place-items-center rounded-lg border transition-colors',
                            active ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent',
                          )}
                        >
                          <Icon className="size-5" />
                        </button>
                      )
                    })}
                  </div>
                )}
              />
            </Field>
            <Field label="Colour" error={errors.color?.message}>
              <Controller
                control={control}
                name="color"
                render={({ field }) => (
                  <div className="flex flex-wrap gap-2">
                    {CATEGORY_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={c}
                        onClick={() => field.onChange(c)}
                        className={cn(
                          'size-8 rounded-full border-2 transition-transform',
                          field.value === c ? 'scale-110 border-foreground' : 'border-transparent',
                        )}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                )}
              />
            </Field>
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
