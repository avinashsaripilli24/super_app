import { useEffect, useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from '@tanstack/react-router'
import { Lock, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
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
import { useAsyncData } from '@/hooks/use-async-data'
import { cn, errorMessage } from '@/lib/utils'
import {
  canEdit,
  createAssetCategory,
  deleteAssetCategory,
  listAssetCategories,
  updateAssetCategory,
  type AssetCategory,
  type AssetKind,
} from '@/modules/assets/api'
import { ASSET_CLASSES, ASSET_CLASS_LABEL, VALUATION_MODE_LABEL, VALUATION_MODE_SHORT } from '@/modules/assets/labels'
import { assetTypeSchema, type AssetTypeFormValues } from '@/modules/assets/schemas'
import { CategoryIcon } from '@/modules/expenses/components/category-icon'
import { CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_ICON_NAMES } from '@/modules/expenses/components/category-icons'
import { useAuthStore } from '@/store/auth-store'

export function AssetTypesPage() {
  const { data, loading, reload } = useAsyncData(listAssetCategories, 'asset-types', 'Failed to load types')
  const categories = useMemo(() => data ?? [], [data])
  const profile = useAuthStore((s) => s.profile)
  const [search, setSearch] = useState('')
  const term = search.trim().toLowerCase()
  const matching = useMemo(
    () => (term ? categories.filter((c) => c.name.toLowerCase().includes(term)) : categories),
    [categories, term],
  )
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<AssetCategory | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<AssetCategory | null>(null)
  const [deleting, setDeleting] = useState(false)

  const onDelete = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      await deleteAssetCategory(confirmDelete.id)
      toast.success('Type deleted')
      setConfirmDelete(null)
      reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  const groups: { kind: AssetKind; title: string }[] = [
    { kind: 'asset', title: 'Asset types' },
    { kind: 'debt', title: 'Debt types' },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        title="Types"
        description="Kinds of assets and debts, shared by everyone."
        backTo="/assets"
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
          aria-label="Search types"
          placeholder="Search asset and debt types"
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
                  {term ? `No ${g.kind} type matches “${search.trim()}”.` : `No ${g.kind} types yet.`}
                </li>
              )}
              {matching
                .filter((c) => c.kind === g.kind)
                .map((c) => {
                  const isDefault = c.user_id === null
                  const editable = !isDefault && canEdit(c, profile)
                  return (
                    <li key={c.id} className="flex items-center gap-2 py-1 pl-3 pr-2">
                      <Link
                        to="/assets/types/$typeId"
                        params={{ typeId: c.id }}
                        className="flex min-w-0 flex-1 items-center gap-3 py-1.5"
                      >
                        <CategoryIcon icon={c.icon} color={c.color} />
                        <span className="min-w-0 flex-1">
                          {/* Long default names wrap rather than truncate. */}
                          <span className="block break-words text-sm font-medium">{c.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {VALUATION_MODE_SHORT[c.valuation_mode]}
                            {c.asset_class ? ` · ${ASSET_CLASS_LABEL[c.asset_class]}` : ''}
                          </span>
                        </span>
                      </Link>
                      {!editable ? (
                        <span className="flex shrink-0 items-center gap-1 pr-1 text-xs text-muted-foreground">
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

      <AssetTypeSheet open={sheetOpen} onOpenChange={setSheetOpen} editing={editing} onSaved={reload} />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title={`Delete “${confirmDelete?.name}”?`}
        description="Only possible while no holding uses it."
        tone="destructive"
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={onDelete}
      />
    </div>
  )
}

const EMPTY_TYPE: AssetTypeFormValues = {
  kind: 'asset',
  name: '',
  icon: 'tag',
  color: CATEGORY_COLORS[0]!,
  valuation_mode: 'value',
  asset_class: 'other',
}

function AssetTypeSheet({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: AssetCategory | null
  onSaved: () => void
}) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AssetTypeFormValues>({
    resolver: zodResolver(assetTypeSchema),
    defaultValues: EMPTY_TYPE,
  })

  useEffect(() => {
    if (!open) return
    reset(
      editing
        ? {
            kind: editing.kind,
            name: editing.name,
            icon: editing.icon,
            color: editing.color,
            valuation_mode: editing.valuation_mode,
            asset_class: editing.asset_class ?? undefined,
          }
        : EMPTY_TYPE,
    )
  }, [open, editing, reset])

  const kind = watch('kind')

  const onSubmit = async (values: AssetTypeFormValues) => {
    try {
      if (editing) {
        await updateAssetCategory(editing.id, {
          name: values.name,
          icon: values.icon,
          color: values.color,
          asset_class: values.kind === 'asset' ? (values.asset_class ?? 'other') : null,
        })
        toast.success('Type updated')
      } else {
        await createAssetCategory({
          kind: values.kind,
          name: values.name,
          icon: values.icon,
          color: values.color,
          valuation_mode: values.kind === 'debt' ? 'value' : values.valuation_mode,
          asset_class: values.kind === 'asset' ? (values.asset_class ?? 'other') : null,
        })
        toast.success('Type created')
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
          <SheetTitle>{editing ? 'Edit type' : 'New type'}</SheetTitle>
          <SheetDescription>
            {editing
              ? 'How the type is valued cannot change once holdings use it.'
              : 'A kind of asset (e.g. REITs) or debt (e.g. Overdraft) not covered by the defaults.'}
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <SheetBody className="space-y-4">
            {!editing && (
              <Controller
                control={control}
                name="kind"
                render={({ field }) => (
                  <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                    {(['asset', 'debt'] as const).map((k) => (
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
            <Field label="Name" htmlFor="type-name" error={errors.name?.message}>
              <Input
                id="type-name"
                placeholder={kind === 'asset' ? 'e.g. REITs' : 'e.g. Overdraft'}
                autoComplete="off"
                autoCapitalize="words"
                aria-invalid={!!errors.name}
                {...register('name')}
              />
            </Field>
            {kind === 'asset' && (
              <>
                <Field label="How is it valued?" error={errors.valuation_mode?.message}>
                  <Controller
                    control={control}
                    name="valuation_mode"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange} disabled={!!editing}>
                        <SelectTrigger aria-label="Valuation">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(['units', 'value'] as const).map((m) => (
                            <SelectItem key={m} value={m}>
                              {VALUATION_MODE_LABEL[m]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>
                <Field label="Asset class" error={errors.asset_class?.message}>
                  <Controller
                    control={control}
                    name="asset_class"
                    render={({ field }) => (
                      <Select value={field.value ?? ''} onValueChange={field.onChange}>
                        <SelectTrigger aria-label="Asset class" aria-invalid={!!errors.asset_class}>
                          <SelectValue placeholder="Pick a class" />
                        </SelectTrigger>
                        <SelectContent>
                          {ASSET_CLASSES.map((c) => (
                            <SelectItem key={c} value={c}>
                              {ASSET_CLASS_LABEL[c]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>
              </>
            )}
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
