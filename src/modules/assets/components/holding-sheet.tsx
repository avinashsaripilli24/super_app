import { useEffect, useMemo } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { format } from 'date-fns'
import { Lock, Trash2 } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
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
import { cn, errorMessage } from '@/lib/utils'
import {
  createHolding,
  updateHolding,
  type AssetCategory,
  type AssetKind,
  type HoldingInput,
  type HoldingRow,
  type UserNames,
} from '@/modules/assets/api'
import { FAR_FUTURE } from '@/modules/assets/labels'
import { holdingSchema, optionalNumber, type HoldingFormValues } from '@/modules/assets/schemas'
import { CategoryPicker } from '@/modules/expenses/components/category-picker'
import { useAuthStore } from '@/store/auth-store'

function emptyValues(kind: AssetKind, categoryId: string | undefined, meId: string | undefined): HoldingFormValues {
  return {
    kind,
    category_id: categoryId ?? '',
    name: '',
    institution: '',
    identifier: '',
    holder_id: meId ?? '',
    opened_on: '',
    maturity_on: '',
    interest_rate: undefined,
    notes: '',
  }
}

/** Create or edit a holding (an instrument, loan, account, property…). */
export function HoldingSheet({
  open,
  onOpenChange,
  categories,
  people,
  editing,
  readOnly = false,
  defaultKind = 'asset',
  defaultCategoryId,
  onSaved,
  onDelete,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: AssetCategory[]
  /** Household members selectable as the holder. */
  people: UserNames
  /** When set, the sheet shows/edits this holding instead of creating one. */
  editing?: HoldingRow | null
  /** Viewer may not edit this row (not the creator and not an admin). */
  readOnly?: boolean
  defaultKind?: AssetKind
  defaultCategoryId?: string
  /** Receives the holding id (new or edited). */
  onSaved: (id: string) => void
  /** Shown only while editing with write access. */
  onDelete?: () => void
}) {
  const me = useAuthStore((s) => s.profile)
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<HoldingFormValues>({
    resolver: zodResolver(holdingSchema),
    defaultValues: emptyValues(defaultKind, defaultCategoryId, me?.id),
  })

  // Hydrate when opened.
  useEffect(() => {
    if (!open) return
    if (editing) {
      reset({
        kind: editing.kind,
        category_id: editing.category_id,
        name: editing.name,
        institution: editing.institution ?? '',
        identifier: editing.identifier ?? '',
        holder_id: editing.holder_id ?? editing.user_id,
        opened_on: editing.opened_on ?? '',
        maturity_on: editing.maturity_on ?? '',
        interest_rate: editing.interest_rate ?? undefined,
        notes: editing.notes ?? '',
      })
    } else {
      reset(emptyValues(defaultKind, defaultCategoryId, me?.id))
    }
  }, [open, editing, defaultKind, defaultCategoryId, reset, me?.id])

  const kind = watch('kind')
  const visibleTypes = useMemo(() => categories.filter((c) => c.kind === kind), [categories, kind])

  const peopleSorted = useMemo(() => [...people.entries()].sort((a, b) => a[1].localeCompare(b[1])), [people])

  const onSubmit = async (values: HoldingFormValues) => {
    if (readOnly) return
    const payload: HoldingInput = {
      category_id: values.category_id,
      holder_id: values.holder_id || null,
      name: values.name,
      institution: values.institution || null,
      identifier: values.identifier || null,
      opened_on: values.opened_on || null,
      maturity_on: values.maturity_on || null,
      interest_rate: values.interest_rate ?? null,
      notes: values.notes || null,
    }
    try {
      if (editing) {
        await updateHolding(editing.id, payload)
        toast.success('Holding updated')
        onOpenChange(false)
        onSaved(editing.id)
      } else {
        const id = await createHolding(payload)
        toast.success('Holding added')
        onOpenChange(false)
        onSaved(id)
      }
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const disabled = readOnly || isSubmitting
  const isDebt = kind === 'debt'
  const title = readOnly ? 'Holding' : editing ? 'Edit holding' : isDebt ? 'Add a debt' : 'Add an asset'
  const addedBy = editing ? (people.get(editing.user_id) ?? 'Unknown') : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {editing ? (
            <SheetDescription>
              Added by {addedBy} on {format(new Date(editing.created_at), 'd MMM yyyy')}
            </SheetDescription>
          ) : (
            <SheetDescription>
              {isDebt
                ? 'A loan, card or anything you owe. Record what you borrow and repay on it afterwards.'
                : 'One instrument, account or item. Record buys, sales and current values on it afterwards.'}
            </SheetDescription>
          )}
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <SheetBody className="space-y-4">
            {readOnly && (
              <p className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                <Lock className="size-3.5" /> Only {addedBy} or an admin can change this holding.
              </p>
            )}

            {/* Kind toggle (fixed once created: a holding cannot move between assets and debts) */}
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
                        disabled={disabled}
                        onClick={() => {
                          if (field.value === k) return
                          field.onChange(k)
                          setValue('category_id', '')
                        }}
                        className={cn(
                          'rounded-md py-2 text-sm font-medium capitalize transition-colors disabled:cursor-default',
                          field.value === k
                            ? k === 'asset'
                              ? 'bg-card text-success shadow-xs'
                              : 'bg-card text-destructive shadow-xs'
                            : 'text-muted-foreground',
                        )}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                )}
              />
            )}

            <Field label="Type" htmlFor="holding-type" error={errors.category_id?.message}>
              <Controller
                control={control}
                name="category_id"
                render={({ field }) => (
                  <CategoryPicker
                    id="holding-type"
                    options={visibleTypes}
                    value={field.value}
                    onChange={field.onChange}
                    disabled={disabled}
                    invalid={!!errors.category_id}
                    placeholder="Choose a type"
                    title={`${kind} type`}
                    searchPlaceholder={`Search ${kind} types`}
                    emptyNoun={`${kind} type`}
                  />
                )}
              />
            </Field>

            <Field label="Name" htmlFor="holding-name" error={errors.name?.message}>
              <Input
                id="holding-name"
                placeholder={isDebt ? 'e.g. HDFC home loan' : 'e.g. Bandhan Small Cap Fund'}
                autoComplete="off"
                autoCapitalize="words"
                disabled={disabled}
                aria-invalid={!!errors.name}
                {...register('name')}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field
                label={isDebt ? 'Lender' : 'Institution / AMC'}
                htmlFor="holding-institution"
                error={errors.institution?.message}
              >
                <Input
                  id="holding-institution"
                  placeholder={isDebt ? 'e.g. HDFC Bank' : 'e.g. Zerodha'}
                  autoComplete="off"
                  autoCapitalize="words"
                  disabled={disabled}
                  {...register('institution')}
                />
              </Field>
              <Field
                label={isDebt ? 'Loan / card no.' : 'Folio / account no.'}
                htmlFor="holding-identifier"
                error={errors.identifier?.message}
              >
                <Input
                  id="holding-identifier"
                  placeholder="Optional"
                  autoComplete="off"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={disabled}
                  {...register('identifier')}
                />
              </Field>
            </div>

            <Field label={isDebt ? 'Borrower' : 'Holder'} error={errors.holder_id?.message}>
              <Controller
                control={control}
                name="holder_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
                    <SelectTrigger aria-label="Holder" aria-invalid={!!errors.holder_id}>
                      <SelectValue placeholder="Whose is it?" />
                    </SelectTrigger>
                    <SelectContent>
                      {peopleSorted.map(([id, name]) => (
                        <SelectItem key={id} value={id}>
                          {name}
                          {id === me?.id ? ' (you)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={isDebt ? 'Taken on' : 'Opened on'} htmlFor="holding-opened" error={errors.opened_on?.message}>
                <Controller
                  control={control}
                  name="opened_on"
                  render={({ field }) => (
                    <DatePicker
                      id="holding-opened"
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      disabled={disabled}
                      placeholder="Optional"
                      aria-invalid={!!errors.opened_on}
                    />
                  )}
                />
              </Field>
              <Field label={isDebt ? 'Ends on' : 'Matures on'} htmlFor="holding-maturity" error={errors.maturity_on?.message}>
                <Controller
                  control={control}
                  name="maturity_on"
                  render={({ field }) => (
                    <DatePicker
                      id="holding-maturity"
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      disabled={disabled}
                      placeholder="Optional"
                      max={FAR_FUTURE}
                      quickChips={false}
                      aria-invalid={!!errors.maturity_on}
                    />
                  )}
                />
              </Field>
            </div>

            <Field
              label="Interest rate % per year"
              htmlFor="holding-rate"
              error={errors.interest_rate?.message}
              hint="Optional. For deposits, bonds and loans."
            >
              <Input
                id="holding-rate"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                max="100"
                placeholder="e.g. 7.1"
                disabled={disabled}
                aria-invalid={!!errors.interest_rate}
                {...register('interest_rate', optionalNumber)}
              />
            </Field>

            <Field label="Notes" htmlFor="holding-notes" error={errors.notes?.message}>
              <Input
                id="holding-notes"
                placeholder="Nominee, lock-in, anything worth remembering"
                autoComplete="off"
                disabled={disabled}
                {...register('notes')}
              />
            </Field>
          </SheetBody>
          <SheetFooter>
            {readOnly ? (
              <Button type="button" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            ) : (
              <>
                {editing && onDelete && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mr-auto text-destructive hover:text-destructive"
                    onClick={onDelete}
                    disabled={isSubmitting}
                  >
                    <Trash2 /> Delete
                  </Button>
                )}
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving…' : editing ? 'Save changes' : 'Add'}
                </Button>
              </>
            )}
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
