import * as React from 'react'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { DayPicker, getDefaultClassNames, type DayButton, type DayPickerProps } from 'react-day-picker'

import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * react-day-picker v9 styled with Tailwind tokens (no `style.css` import).
 * Cells are 40px (`--cell-size`) so days are comfortable touch targets and a
 * single month fits a 320px viewport.
 */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = 'label',
  components,
  ...props
}: DayPickerProps) {
  const d = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      captionLayout={captionLayout}
      className={cn('group/calendar bg-popover p-3 [--cell-size:2.5rem]', className)}
      classNames={{
        root: cn('w-fit', d.root),
        months: cn('relative flex flex-col gap-4 md:flex-row', d.months),
        month: cn('flex w-full flex-col gap-4', d.month),
        nav: cn('absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1', d.nav),
        button_previous: cn(
          buttonVariants({ variant: 'ghost' }),
          'size-(--cell-size) select-none p-0 aria-disabled:opacity-50',
          d.button_previous,
        ),
        button_next: cn(
          buttonVariants({ variant: 'ghost' }),
          'size-(--cell-size) select-none p-0 aria-disabled:opacity-50',
          d.button_next,
        ),
        month_caption: cn('flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)', d.month_caption),
        dropdowns: cn(
          'flex h-(--cell-size) w-full items-center justify-center gap-1.5 text-sm font-medium',
          d.dropdowns,
        ),
        dropdown_root: cn(
          'relative rounded-md border border-input shadow-xs has-focus:border-ring has-focus:ring-2 has-focus:ring-ring/50',
          d.dropdown_root,
        ),
        // Native <select> stays in the tree (keyboard + mobile pickers) but is invisible.
        dropdown: cn('absolute inset-0 opacity-0', d.dropdown),
        caption_label: cn(
          'select-none font-medium',
          captionLayout === 'label'
            ? 'text-sm'
            : 'flex h-8 items-center gap-1 rounded-md pl-2 pr-1 text-sm [&>svg]:size-3.5 [&>svg]:text-muted-foreground',
          d.caption_label,
        ),
        month_grid: cn('w-full border-collapse', d.month_grid),
        weekdays: cn('flex', d.weekdays),
        weekday: cn('flex-1 select-none rounded-md text-[0.8rem] font-normal text-muted-foreground', d.weekday),
        week: cn('mt-2 flex w-full', d.week),
        day: cn(
          'group/day relative aspect-square h-full w-full select-none p-0 text-center',
          '[&:first-child[data-selected=true]_button]:rounded-l-md [&:last-child[data-selected=true]_button]:rounded-r-md',
          d.day,
        ),
        range_start: cn('rounded-l-md bg-accent', d.range_start),
        range_middle: cn('rounded-none', d.range_middle),
        range_end: cn('rounded-r-md bg-accent', d.range_end),
        today: cn('rounded-md bg-accent text-accent-foreground data-[selected=true]:rounded-none', d.today),
        outside: cn('text-muted-foreground aria-selected:text-muted-foreground', d.outside),
        disabled: cn('text-muted-foreground opacity-50', d.disabled),
        hidden: cn('invisible', d.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...p }) => (
          <div data-slot="calendar" ref={rootRef} className={cn(className)} {...p} />
        ),
        Chevron: ({ className, orientation }) => {
          if (orientation === 'left') return <ChevronLeft className={cn('size-4', className)} />
          if (orientation === 'right') return <ChevronRight className={cn('size-4', className)} />
          return <ChevronDown className={cn('size-4', className)} />
        },
        DayButton: CalendarDayButton,
        ...components,
      }}
      {...props}
    />
  )
}

function CalendarDayButton({ className, day, modifiers, ...props }: React.ComponentProps<typeof DayButton>) {
  const d = getDefaultClassNames()
  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  const selectedSingle =
    !!modifiers.selected && !modifiers.range_start && !modifiers.range_end && !modifiers.range_middle

  return (
    <button
      ref={ref}
      type="button"
      data-day={day.date.toDateString()}
      data-selected-single={selectedSingle || undefined}
      data-range-start={modifiers.range_start || undefined}
      data-range-end={modifiers.range_end || undefined}
      data-range-middle={modifiers.range_middle || undefined}
      className={cn(
        buttonVariants({ variant: 'ghost', size: 'icon' }),
        'flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 font-normal leading-none',
        'data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground data-[selected-single=true]:hover:bg-primary',
        'data-[range-start=true]:rounded-l-md data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground',
        'data-[range-end=true]:rounded-r-md data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground',
        'data-[range-middle=true]:rounded-none data-[range-middle=true]:bg-accent data-[range-middle=true]:text-accent-foreground',
        'group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:ring-2 group-data-[focused=true]/day:ring-ring/50',
        d.day_button,
        className,
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
