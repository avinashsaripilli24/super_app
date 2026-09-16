import { useEffect, useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Trash2 } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
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
import { errorMessage } from '@/lib/utils'
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  createCategory,
  createRecurring,
  ordinal,
  updateRecurring,
  type Category,
  type RecurringExpense,
} from '@/modules/expenses/api'
import { CategoryPicker } from '@/modules/expenses/components/category-picker'
import { CATEGORY_COLORS } from '@/modules/expenses/components/category-icons'
import { recurringSchema, type RecurringFormValues } from '@/modules/expenses/schemas'

/** Matches the `name` cap in `categorySchema`. */
const MAX_CATEGORY_NAME = 40

/** Days every month has. */
const DAYS = Array.from({ length: 27 }, (_, i) => i + 1)

function emptyValues(): RecurringFormValues {
  return {
    category_id: '',
    amount: undefined as unknown as number,
    day_of_month: 1,
    note: '',
    payment_method: 'upi',
  }
}

export function RecurringSheet({
  open,
  onOpenChange,
  categories,
  editing,
  onSaved,
  onDelete,
  onCategoriesChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: Category[]
  /** When set, the sheet edits this item instead of creating one. */
  editing?: RecurringExpense | null
  onSaved: () => void
  onDelete?: () => void
  /** Called after a category is created inline so the parent can refetch. */
  onCategoriesChanged?: () => void
}) {
  const [addedCategories, setAddedCategories] = useState<Category[]>([])
  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RecurringFormValues>({
    resolver: zodResolver(recurringSchema),
    defaultValues: emptyValues(),
  })

  useEffect(() => {
    if (!open) return
    setAddedCategories([])
    reset(
      editing
        ? {
            category_id: editing.category_id ?? '',
            amount: Number(editing.amount),
            day_of_month: editing.day_of_month,
            note: editing.note ?? '',
            payment_method: (PAYMENT_METHODS as readonly string[]).includes(editing.payment_method)
              ? (editing.payment_method as RecurringFormValues['payment_method'])
              : 'other',
          }
        : emptyValues(),
    )
  }, [open, editing, reset])

  const expenseCategories = useMemo(() => {
    const byId = new Map(categories.filter((c) => c.kind === 'expense').map((c) => [c.id, c]))
    for (const c of addedCategories) if (!byId.has(c.id)) byId.set(c.id, c)
    return [...byId.values()]
  }, [categories, addedCategories])

  const otherCategory = useMemo(
    () => expenseCategories.find((c) => c.user_id === null && /^other\b/i.test(c.name)),
    [expenseCategories],
  )

  const createInlineCategory = async (name: string) => {
    try {
      const created = await createCategory({
        name,
        icon: 'tag',
        color: CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length]!,
        kind: 'expense',
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

  const onSubmit = async (values: RecurringFormValues) => {
    const payload = {
      category_id: values.category_id,
      amount: values.amount,
      day_of_month: values.day_of_month,
      note: values.note ? values.note : null,
      payment_method: values.payment_method,
    }
    try {
      if (editing) {
        await updateRecurring(editing.id, payload)
        toast.success('Recurring expense updated')
      } else {
        await createRecurring(payload)
        toast.success('Recurring expense added')
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
          <SheetTitle>{editing ? 'Edit recurring expense' : 'Add recurring expense'}</SheetTitle>
          <SheetDescription>Added to a month only when you choose to.</SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <SheetBody className="space-y-4">
            <Field
              label="Amount"
              htmlFor="recurring-amount"
              error={errors.amount?.message}
              hint={amountInWords(watch('amount')) ?? undefined}
            >
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                  ₹
                </span>
                <Input
                  id="recurring-amount"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  className="pl-8 text-lg font-semibold"
                  aria-invalid={!!errors.amount}
                  disabled={isSubmitting}
                  {...register('amount', { valueAsNumber: true })}
                />
              </div>
            </Field>

            <Field label="Category" htmlFor="recurring-category" error={errors.category_id?.message}>
              <Controller
                control={control}
                name="category_id"
                render={({ field }) => (
                  <CategoryPicker
                    id="recurring-category"
                    options={expenseCategories}
                    value={field.value}
                    onChange={field.onChange}
                    disabled={isSubmitting}
                    invalid={!!errors.category_id}
                    placeholder="Choose a category"
                    title="expense category"
                    searchPlaceholder="Search expense categories"
                    emptyNoun="expense category"
                    fallback={otherCategory}
                    create={{ maxLength: MAX_CATEGORY_NAME, onCreate: createInlineCategory }}
                  />
                )}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Day of month" hint="1st to 27th" error={errors.day_of_month?.message}>
                <Controller
                  control={control}
                  name="day_of_month"
                  render={({ field }) => (
                    <Select
                      value={String(field.value)}
                      onValueChange={(v) => field.onChange(Number(v))}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger aria-label="Day of month">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DAYS.map((d) => (
                          <SelectItem key={d} value={String(d)}>
                            {ordinal(d)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field label="Paid via" error={errors.payment_method?.message}>
                <Controller
                  control={control}
                  name="payment_method"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
                      <SelectTrigger aria-label="Paid via">
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

            <Field label="Note" htmlFor="recurring-note" error={errors.note?.message}>
              <Input
                id="recurring-note"
                placeholder="e.g. House rent"
                autoComplete="off"
                disabled={isSubmitting}
                {...register('note')}
              />
            </Field>
          </SheetBody>
          <SheetFooter>
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
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
