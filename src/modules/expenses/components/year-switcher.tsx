import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'

export function YearSwitcher({ value, onChange }: { value: number; onChange: (year: number) => void }) {
  const current = new Date().getFullYear()
  return (
    <div className="flex items-center justify-between gap-2">
      <Button variant="ghost" size="icon" aria-label="Previous year" onClick={() => onChange(value - 1)}>
        <ChevronLeft />
      </Button>
      <button
        type="button"
        onClick={() => onChange(current)}
        className="rounded-md px-3 py-1 text-base font-semibold tracking-tight hover:bg-accent"
        title="Jump to current year"
      >
        {value}
      </button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Next year"
        disabled={value >= current}
        onClick={() => onChange(value + 1)}
      >
        <ChevronRight />
      </Button>
    </div>
  )
}
