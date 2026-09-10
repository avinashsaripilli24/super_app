import { useState } from 'react'
import { addMonths, format } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { monthKey, monthRange } from '@/modules/expenses/api'

const MONTHS = Array.from({ length: 12 }, (_, i) => format(new Date(2000, i, 1), 'MMM'))
const EARLIEST_YEAR = 2015

/**
 * Prev / next month chevrons around a label that opens a month + year grid
 * (future months disabled).
 */
export function MonthSwitcher({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  const { date } = monthRange(value)
  const current = monthKey(new Date())
  const isCurrent = value === current
  const [open, setOpen] = useState(false)
  const [pickerYear, setPickerYear] = useState(date.getFullYear())
  const currentYear = new Date().getFullYear()

  const pick = (key: string) => {
    onChange(key)
    setOpen(false)
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Previous month"
        onClick={() => onChange(monthKey(addMonths(date, -1)))}
      >
        <ChevronLeft />
      </Button>

      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (o) setPickerYear(date.getFullYear())
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className="rounded-md px-3 py-1 text-base font-semibold tracking-tight hover:bg-accent"
            aria-label="Choose month"
          >
            {format(date, 'MMMM yyyy')}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3" align="center">
          <div className="mb-2 flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous year"
              disabled={pickerYear <= EARLIEST_YEAR}
              onClick={() => setPickerYear((y) => y - 1)}
            >
              <ChevronLeft />
            </Button>
            <span className="text-sm font-semibold tabular-nums">{pickerYear}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next year"
              disabled={pickerYear >= currentYear}
              onClick={() => setPickerYear((y) => y + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {MONTHS.map((label, i) => {
              const key = monthKey(new Date(pickerYear, i, 1))
              const selected = key === value
              return (
                <Button
                  key={key}
                  type="button"
                  size="sm"
                  variant={selected ? 'default' : 'ghost'}
                  disabled={key > current}
                  className={cn('h-10', key === current && !selected && 'font-semibold text-primary')}
                  onClick={() => pick(key)}
                >
                  {label}
                </Button>
              )
            })}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 w-full"
            disabled={isCurrent}
            onClick={() => pick(current)}
          >
            This month
          </Button>
        </PopoverContent>
      </Popover>

      <Button
        variant="ghost"
        size="icon"
        aria-label="Next month"
        disabled={isCurrent}
        onClick={() => onChange(monthKey(addMonths(date, 1)))}
      >
        <ChevronRight />
      </Button>
    </div>
  )
}
