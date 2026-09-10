import { useEffect } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
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
import { upsertTarget, type AssetCategory, type AssetTarget } from '@/modules/assets/api'
import { targetSchema, type TargetFormValues } from '@/modules/assets/schemas'

/**
 * Set or edit the standing target for one asset type. The type is fixed while
 * editing; when creating, only types without a target are offered (or the one
 * preselected by the page).
 */
export function TargetSheet({
  open,
  onOpenChange,
  categories,
  editing,
  defaultCategoryId,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  /** Asset types (kind = asset) that can take a target. */
  categories: AssetCategory[]
  editing: AssetTarget | null
  defaultCategoryId?: string
  onSaved: () => void
}) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<TargetFormValues>({
    resolver: zodResolver(targetSchema),
    defaultValues: { category_id: defaultCategoryId ?? '', amount: undefined as unknown as number },
  })

  useEffect(() => {
    if (!open) return
    reset(
      editing
        ? { category_id: editing.category_id, amount: Number(editing.amount) }
        : { category_id: defaultCategoryId ?? '', amount: undefined as unknown as number },
    )
  }, [open, editing, defaultCategoryId, reset])

  const onSubmit = async (values: TargetFormValues) => {
    try {
      await upsertTarget({ category_id: values.category_id, amount: values.amount })
      toast.success('Target saved')
      onOpenChange(false)
      onSaved()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const lockType = !!editing || !!defaultCategoryId

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>{editing ? 'Edit target' : 'Set target'}</SheetTitle>
          <SheetDescription>Where you want this type of asset to reach. Shared by everyone.</SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <SheetBody className="space-y-4">
            <Field label="Asset type" error={errors.category_id?.message}>
              <Controller
                control={control}
                name="category_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={lockType}>
                    <SelectTrigger aria-label="Asset type" aria-invalid={!!errors.category_id}>
                      <SelectValue placeholder="Pick a type" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field
              label="Target value"
              htmlFor="target-amount"
              error={errors.amount?.message}
              hint={amountInWords(watch('amount')) ?? undefined}
            >
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                  ₹
                </span>
                <Input
                  id="target-amount"
                  type="number"
                  inputMode="decimal"
                  step="1"
                  min="0"
                  placeholder="0"
                  className="pl-8 text-lg font-semibold"
                  aria-invalid={!!errors.amount}
                  {...register('amount', { valueAsNumber: true })}
                />
              </div>
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
