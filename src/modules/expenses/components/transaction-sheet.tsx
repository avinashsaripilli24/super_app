import { useEffect, useMemo, useState } from 'react'
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
import { amountInWords } from '@/lib/money-words'
import { cn, errorMessage } from '@/lib/utils'
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  createCategory,
  createTransaction,
  updateTransaction,
  type Category,
  type LedgerRow,
  type UserNames,
} from '@/modules/expenses/api'
import { CategoryPicker } from '@/modules/expenses/components/category-picker'
import { CATEGORY_COLORS } from '@/modules/expenses/components/category-icons'
import { transactionSchema, type TransactionFormValues } from '@/modules/expenses/schemas'
import { useAuthStore } from '@/store/auth-store'

/** Matches the `name` cap in `categorySchema`. */
const MAX_CATEGORY_NAME = 40

function emptyValues(defaultDate: string | undefined, meId: string | undefined): TransactionFormValues {
  return {
    kind: 'expense',
    amount: undefined as unknown as number,
    category_id: '',
    occurred_on: defaultDate ?? format(new Date(), 'yyyy-MM-dd'),
    note: '',
    payment_method: 'upi',
    earned_by: meId,
  }
}

export function TransactionSheet({
  open,
  onOpenChange,
  categories,
  people,
  editing,
  readOnly = false,
  defaultDate,
  onSaved,
  onDelete,
  onCategoriesChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: Category[]
  /** Household members selectable as "Earned by" on income. */
  people: UserNames
  /** When set, the sheet shows/edits this transaction instead of creating one. */
  editing?: LedgerRow | null
  /** Viewer may not edit this row (not the creator and not an admin). */
  readOnly?: boolean
  /** ISO date used for new transactions (defaults to today). */
  defaultDate?: string
  onSaved: () => void
  /** Shown only while editing with write access. */
  onDelete?: () => void
  /** Called after a category is created inline so the parent can refetch. */
  onCategoriesChanged?: () => void
}) {
  const me = useAuthStore((s) => s.profile)
  // Categories created from inside this sheet, kept locally so the new one is
  // selectable straight away instead of waiting for the parent's refetch.
  const [addedCategories, setAddedCategories] = useState<Category[]>([])
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: emptyValues(defaultDate, me?.id),
  })

  // Hydrate when opened.
  useEffect(() => {
    if (!open) return
    setAddedCategories([])
    if (editing) {
      reset({
        kind: editing.kind,
        amount: Number(editing.amount),
        category_id: editing.category_id ?? '',
        occurred_on: editing.occurred_on,
        note: editing.note ?? '',
        payment_method: (PAYMENT_METHODS as readonly string[]).includes(editing.payment_method ?? '')
          ? (editing.payment_method as TransactionFormValues['payment_method'])
          : 'other',
        // Legacy income rows have no earner: credit the creator. Expenses
        // pre-select the viewer in case they flip the row to income.
        earned_by: editing.earned_by ?? (editing.kind === 'income' ? editing.user_id : me?.id),
      })
    } else {
      reset(emptyValues(defaultDate, me?.id))
    }
  }, [open, editing, defaultDate, reset, me?.id])

  const kind = watch('kind')
  const allCategories = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]))
    for (const c of addedCategories) if (!byId.has(c.id)) byId.set(c.id, c)
    return [...byId.values()]
  }, [categories, addedCategories])
  const visibleCategories = useMemo(() => allCategories.filter((c) => c.kind === kind), [allCategories, kind])

  // Clear the category if it doesn't belong to the newly chosen kind.
  const categoryId = watch('category_id')
  useEffect(() => {
    if (readOnly) return
    if (categoryId && !visibleCategories.some((c) => c.id === categoryId)) {
      setValue('category_id', '')
    }
  }, [categoryId, visibleCategories, setValue, readOnly])

  /** The global "Other" / "Other Income" fallback for the current kind. */
  const otherCategory = useMemo(
    () => visibleCategories.find((c) => c.user_id === null && /^other\b/i.test(c.name)),
    [visibleCategories],
  )

  /** Create the searched-for category from the picker; it selects the returned id. */
  const createInlineCategory = async (name: string) => {
    try {
      const created = await createCategory({
        name,
        icon: 'tag',
        color: CATEGORY_COLORS[allCategories.length % CATEGORY_COLORS.length]!,
        kind,
      })
      setAddedCategories((prev) => [...prev, created])
      toast.success(`Category “${created.name}” added`)
      onCategoriesChanged?.()
      return created.id
    } catch (err) {
      toast.error(errorMessage(err))
      return null
    }
  }

  // Income needs an earner; default to the signed-in user.
  const earnedBy = watch('earned_by')
  useEffect(() => {
    if (!readOnly && kind === 'income' && !earnedBy && me?.id) setValue('earned_by', me.id)
  }, [kind, earnedBy, me?.id, setValue, readOnly])

  const peopleSorted = useMemo(() => [...people.entries()].sort((a, b) => a[1].localeCompare(b[1])), [people])

  const onSubmit = async (values: TransactionFormValues) => {
    if (readOnly) return
    const payload = {
      kind: values.kind,
      amount: values.amount,
      category_id: values.category_id,
      occurred_on: values.occurred_on,
      note: values.note ? values.note : null,
      payment_method: values.payment_method,
      earned_by: values.kind === 'income' ? (values.earned_by ?? null) : null,
    }
    try {
      if (editing) {
        await updateTransaction(editing.id, payload)
        toast.success('Transaction updated')
      } else {
        await createTransaction(payload)
        toast.success('Transaction added')
      }
      onOpenChange(false)
      onSaved()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const disabled = readOnly || isSubmitting
  const title = readOnly ? 'Transaction' : editing ? 'Edit transaction' : 'Add transaction'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {editing ? (
            <SheetDescription>
              {editing.kind === 'income' && editing.earned_by_name ? `Earned by ${editing.earned_by_name} · ` : ''}
              Added by {editing.added_by} on {format(new Date(editing.created_at), 'd MMM yyyy, HH:mm')}
            </SheetDescription>
          ) : (
            <SheetDescription>Record what you spent or received.</SheetDescription>
          )}
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <SheetBody className="space-y-4">
            {readOnly && (
              <p className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                <Lock className="size-3.5" /> Only {editing?.added_by} or an admin can change this transaction.
              </p>
            )}

            {/* Kind toggle */}
            <Controller
              control={control}
              name="kind"
              render={({ field }) => (
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                  {(['expense', 'income'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      disabled={disabled}
                      onClick={() => field.onChange(k)}
                      className={cn(
                        'rounded-md py-2 text-sm font-medium capitalize transition-colors disabled:cursor-default',
                        field.value === k
                          ? k === 'expense'
                            ? 'bg-card text-destructive shadow-xs'
                            : 'bg-card text-success shadow-xs'
                          : 'text-muted-foreground',
                      )}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              )}
            />

            <Field
              label="Amount"
              htmlFor="amount"
              error={errors.amount?.message}
              hint={amountInWords(watch('amount')) ?? undefined}
            >
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                  ₹
                </span>
                <Input
                  id="amount"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  className="pl-8 text-lg font-semibold"
                  aria-invalid={!!errors.amount}
                  disabled={disabled}
                  {...register('amount', { valueAsNumber: true })}
                />
              </div>
            </Field>

            <Field label="Category" htmlFor="category" error={errors.category_id?.message}>
              <Controller
                control={control}
                name="category_id"
                render={({ field }) => (
                  <CategoryPicker
                    id="category"
                    options={visibleCategories}
                    value={field.value}
                    onChange={field.onChange}
                    disabled={disabled}
                    invalid={!!errors.category_id}
                    placeholder="Choose a category"
                    title={`${kind} category`}
                    searchPlaceholder={`Search ${kind} categories`}
                    emptyNoun={`${kind} category`}
                    fallback={otherCategory}
                    create={{ maxLength: MAX_CATEGORY_NAME, onCreate: createInlineCategory }}
                  />
                )}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Date" htmlFor="occurred_on" error={errors.occurred_on?.message}>
                <Controller
                  control={control}
                  name="occurred_on"
                  render={({ field }) => (
                    <DatePicker
                      id="occurred_on"
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      disabled={disabled}
                      aria-invalid={!!errors.occurred_on}
                    />
                  )}
                />
              </Field>
              <Field label={kind === 'income' ? 'Received via' : 'Paid via'} error={errors.payment_method?.message}>
                <Controller
                  control={control}
                  name="payment_method"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
                      <SelectTrigger>
                        <SelectValue placeholder="Method" />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map((m) => (
                          <SelectItem key={m} value={m}>
                            {PAYMENT_METHOD_LABEL[m]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </div>

            {kind === 'income' && (
              <Field label="Earned by" error={errors.earned_by?.message}>
                <Controller
                  control={control}
                  name="earned_by"
                  render={({ field }) => (
                    <Select value={field.value ?? ''} onValueChange={field.onChange} disabled={disabled}>
                      <SelectTrigger aria-label="Earned by" aria-invalid={!!errors.earned_by}>
                        <SelectValue placeholder="Who earned it?" />
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
            )}

            <Field label="Note" htmlFor="note" error={errors.note?.message}>
              <Input
                id="note"
                placeholder="What was it for?"
                autoComplete="off"
                disabled={disabled}
                {...register('note')}
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
