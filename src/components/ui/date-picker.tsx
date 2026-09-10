import { useState } from 'react'
import { endOfMonth, format, isValid, parseISO, startOfMonth, subDays, subMonths } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import type { DateRange, Matcher } from 'react-day-picker'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useMediaQuery } from '@/hooks/use-media-query'
import { cn } from '@/lib/utils'

const ISO = 'yyyy-MM-dd'
const EARLIEST = new Date(2015, 0, 1)

/** `YYYY-MM-DD` → Date, or undefined for '' / garbage. */
function parse(value: string | undefined): Date | undefined {
  if (!value) return undefined
  const d = parseISO(value)
  return isValid(d) ? d : undefined
}

/** Local calendar date → `YYYY-MM-DD` (never `toISOString()`, which shifts by timezone). */
function iso(d: Date) {
  return format(d, ISO)
}

function today() {
  return iso(new Date())
}

function bounds(min: string | undefined, max: string | undefined) {
  const minDate = parse(min)
  const maxDate = parse(max)
  const disabled: Matcher[] = []
  if (maxDate) disabled.push({ after: maxDate })
  if (minDate) disabled.push({ before: minDate })
  const inRange = (v: string) => (!min || v >= min) && (!max || v <= max)
  return { minDate, maxDate, disabled, inRange }
}

function TriggerButton({
  id,
  empty,
  disabled,
  invalid,
  className,
  children,
}: {
  id?: string
  empty: boolean
  disabled?: boolean
  invalid?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <PopoverTrigger asChild>
      <Button
        id={id}
        type="button"
        variant="outline"
        disabled={disabled}
        aria-invalid={invalid || undefined}
        data-empty={empty || undefined}
        className={cn(
          'h-10 w-full justify-start gap-2 px-3 text-base font-normal shadow-xs',
          'data-[empty=true]:text-muted-foreground aria-invalid:border-destructive',
          className,
        )}
      >
        <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{children}</span>
      </Button>
    </PopoverTrigger>
  )
}

/** Single date. Value is an ISO `YYYY-MM-DD` string ('' when empty). */
export function DatePicker({
  id,
  value,
  onChange,
  onBlur,
  min,
  max = today(),
  disabled,
  placeholder = 'Pick a date',
  quickChips = true,
  modal = true,
  className,
  'aria-invalid': invalid,
}: {
  id?: string
  value: string
  onChange: (iso: string) => void
  onBlur?: () => void
  min?: string
  /** Latest selectable date; defaults to today. Pass `undefined` explicitly for no cap. */
  max?: string
  disabled?: boolean
  placeholder?: string
  /** Show Today / Yesterday shortcuts. */
  quickChips?: boolean
  /** Trap focus + block outside scroll while open (recommended inside sheets). */
  modal?: boolean
  className?: string
  'aria-invalid'?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selected = parse(value)
  const { maxDate, disabled: disabledDays, inRange } = bounds(min, max)

  const pick = (d: Date) => {
    onChange(iso(d))
    setOpen(false)
  }
  const chips = [
    { label: 'Today', value: today() },
    { label: 'Yesterday', value: iso(subDays(new Date(), 1)) },
  ].filter((c) => inRange(c.value))

  return (
    <Popover
      open={open}
      modal={modal}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) onBlur?.()
      }}
    >
      <TriggerButton id={id} empty={!selected} disabled={disabled} invalid={invalid} className={className}>
        {selected ? format(selected, 'd MMM yyyy') : placeholder}
      </TriggerButton>
      <PopoverContent align="start" className="w-auto p-0">
        {quickChips && chips.length > 0 && (
          <div className="flex gap-2 px-3 pt-3">
            {chips.map((c) => (
              <Button
                key={c.label}
                type="button"
                size="sm"
                variant={value === c.value ? 'default' : 'secondary'}
                onClick={() => pick(parseISO(c.value))}
              >
                {c.label}
              </Button>
            ))}
          </div>
        )}
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? maxDate ?? new Date()}
          onSelect={(d) => d && pick(d)}
          disabled={disabledDays}
          captionLayout="dropdown"
          startMonth={EARLIEST}
          endMonth={maxDate ? endOfMonth(maxDate) : new Date(new Date().getFullYear() + 5, 11, 1)}
        />
      </PopoverContent>
    </Popover>
  )
}

const RANGE_PRESETS: { label: string; range: () => { from: string; to: string } }[] = [
  { label: 'Last 7 days', range: () => ({ from: iso(subDays(new Date(), 6)), to: today() }) },
  { label: 'Last 30 days', range: () => ({ from: iso(subDays(new Date(), 29)), to: today() }) },
  { label: 'This month', range: () => ({ from: iso(startOfMonth(new Date())), to: today() }) },
  {
    label: 'Last month',
    range: () => {
      const m = subMonths(new Date(), 1)
      return { from: iso(startOfMonth(m)), to: iso(endOfMonth(m)) }
    },
  },
]

/** Start/end dates as ISO strings ('' while unset). */
export function DateRangePicker({
  id,
  from,
  to,
  onChange,
  onBlur,
  max = today(),
  disabled,
  modal = true,
  className,
  'aria-invalid': invalid,
}: {
  id?: string
  from: string
  to: string
  onChange: (range: { from: string; to: string }) => void
  onBlur?: () => void
  max?: string
  disabled?: boolean
  modal?: boolean
  className?: string
  'aria-invalid'?: boolean
}) {
  const [open, setOpen] = useState(false)
  const twoMonths = useMediaQuery('(min-width: 640px)')
  const fromDate = parse(from)
  const toDate = parse(to)
  const { maxDate, disabled: disabledDays } = bounds(undefined, max)
  const selected: DateRange | undefined = fromDate ? { from: fromDate, to: toDate } : undefined

  const label = fromDate
    ? `${format(fromDate, 'd MMM yyyy')} – ${toDate ? format(toDate, 'd MMM yyyy') : '…'}`
    : 'Pick a date range'

  const anchor = maxDate ?? new Date()
  const defaultMonth = fromDate ?? (twoMonths ? subMonths(anchor, 1) : anchor)

  return (
    <Popover
      open={open}
      modal={modal}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) onBlur?.()
      }}
    >
      <TriggerButton id={id} empty={!fromDate} disabled={disabled} invalid={invalid} className={className}>
        {label}
      </TriggerButton>
      <PopoverContent align="start" className="w-auto p-0">
        <div className="grid grid-cols-2 gap-2 px-3 pt-3 sm:flex sm:flex-wrap">
          {RANGE_PRESETS.map((p) => {
            const r = p.range()
            const active = r.from === from && r.to === to
            return (
              <Button
                key={p.label}
                type="button"
                size="sm"
                variant={active ? 'default' : 'secondary'}
                onClick={() => {
                  onChange(r)
                  setOpen(false)
                }}
              >
                {p.label}
              </Button>
            )
          })}
        </div>
        <Calendar
          mode="range"
          numberOfMonths={twoMonths ? 2 : 1}
          selected={selected}
          defaultMonth={defaultMonth}
          className="mx-auto"
          onSelect={(r) => onChange({ from: r?.from ? iso(r.from) : '', to: r?.to ? iso(r.to) : '' })}
          disabled={disabledDays}
          startMonth={EARLIEST}
          endMonth={maxDate ? endOfMonth(maxDate) : undefined}
        />
        <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!from && !to}
            onClick={() => onChange({ from: '', to: '' })}
          >
            Clear
          </Button>
          <Button type="button" size="sm" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
