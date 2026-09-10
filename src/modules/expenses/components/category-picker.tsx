import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Plus, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useMediaQuery } from '@/hooks/use-media-query'
import { cn } from '@/lib/utils'
import { CategoryIcon } from '@/modules/expenses/components/category-icon'

export type PickerOption = { id: string; name: string; icon: string | null; color: string | null }

/**
 * A category/type field for forms: one input-height row showing the pick, which
 * opens the full searchable list in its own bottom sheet stacked on the form.
 * Keeps the 30–40 row list from pushing the form's later fields off screen.
 */
export function CategoryPicker({
  id,
  options,
  value,
  onChange,
  disabled = false,
  invalid = false,
  placeholder,
  title,
  searchPlaceholder,
  emptyNoun,
  fallback,
  create,
}: {
  id?: string
  /** Already narrowed to the current kind. */
  options: PickerOption[]
  value: string
  onChange: (id: string) => void
  disabled?: boolean
  invalid?: boolean
  placeholder: string
  title: string
  searchPlaceholder: string
  /** e.g. "expense category", for "No expense category matches …". */
  emptyNoun: string
  /** Offered when nothing matches the search (the "Other" category). */
  fallback?: PickerOption
  /** Lets the search term become a new option; `onCreate` resolves to its id (null on failure). */
  create?: { maxLength: number; onCreate: (name: string) => Promise<string | null> }
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  // On phones, opening straight into the keyboard would hide most of the list.
  const touch = useMediaQuery('(pointer: coarse)')
  const searchInput = useRef<HTMLInputElement | null>(null)
  const activeRow = useRef<HTMLButtonElement | null>(null)

  const selected = options.find((o) => o.id === value)

  // Filter by name; the current pick stays pinned so it never looks
  // unselected while a search is narrowing the list.
  const term = search.trim()
  const matches = useMemo(() => {
    if (!term) return options
    const lower = term.toLowerCase()
    return options.filter((o) => o.name.toLowerCase().includes(lower))
  }, [options, term])
  const shown =
    selected && term && !matches.some((o) => o.id === selected.id) ? [selected, ...matches] : matches

  const canCreate =
    !!create &&
    term.length > 0 &&
    term.length <= create.maxLength &&
    !options.some((o) => o.name.toLowerCase() === term.toLowerCase())

  // Bring the current pick into view when the list opens.
  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => activeRow.current?.scrollIntoView({ block: 'nearest' }))
    return () => cancelAnimationFrame(frame)
  }, [open])

  const openPicker = () => {
    if (disabled) return
    setSearch('')
    setOpen(true)
  }

  const pick = (optionId: string) => {
    onChange(optionId)
    setSearch('')
    setOpen(false)
  }

  const createFromSearch = async () => {
    if (!create || !canCreate || creating) return
    setCreating(true)
    try {
      const newId = await create.onCreate(term)
      if (newId) pick(newId)
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openPicker}
        className={cn(
          'flex min-h-11 w-full items-center gap-2 rounded-md border border-input bg-background px-2 py-1.5 text-left text-base shadow-xs outline-none transition-[color,box-shadow]',
          'focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'aria-invalid:border-destructive disabled:cursor-default',
        )}
      >
        {selected ? (
          <>
            <CategoryIcon icon={selected.icon} color={selected.color} size="sm" />
            <span className="min-w-0 flex-1 break-words text-sm leading-snug">{selected.name}</span>
          </>
        ) : (
          <span className="min-w-0 flex-1 px-1 text-muted-foreground">{placeholder}</span>
        )}
        {!disabled && <ChevronDown className="size-4 shrink-0 text-muted-foreground" />}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="h-[85dvh]"
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            if (!touch) searchInput.current?.focus()
          }}
        >
          {/* Only the title row clears the close button; the search runs full width. */}
          <SheetHeader className="gap-3 pr-5">
            <div className="space-y-1 pr-8">
              <SheetTitle className="first-letter:uppercase">{title}</SheetTitle>
              <SheetDescription>Search or scroll, then tap one to choose it.</SheetDescription>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInput}
                type="search"
                aria-label={searchPlaceholder}
                placeholder={searchPlaceholder}
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  // The pinned current pick doesn't count: Enter takes the one real match.
                  const only = term && matches.length === 1 ? matches[0] : undefined
                  if (only) pick(only.id)
                  else if (canCreate) void createFromSearch()
                }}
              />
            </div>
          </SheetHeader>

          <SheetBody className="space-y-2">
            {/* Rows, not tiles: names like "Post Office Schemes (NSC/KVP/SSY/SCSS)"
                have to be readable in full. */}
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {shown.map((o) => {
                const active = o.id === value
                return (
                  <button
                    key={o.id}
                    ref={active ? activeRow : undefined}
                    type="button"
                    onClick={() => pick(o.id)}
                    className={cn(
                      'flex min-h-11 items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-sm leading-snug transition-colors',
                      active ? 'border-primary bg-primary/10 font-medium' : 'hover:bg-accent',
                    )}
                  >
                    <CategoryIcon icon={o.icon} color={o.color} size="sm" />
                    <span className="min-w-0 flex-1 break-words">{o.name}</span>
                    {active && <Check className="size-4 shrink-0 text-primary" />}
                  </button>
                )
              })}
            </div>

            {matches.length === 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {term ? `No ${emptyNoun} matches “${term}”.` : `No ${emptyNoun} yet.`}
                </p>
                {fallback && (
                  <Button type="button" variant="outline" size="sm" onClick={() => pick(fallback.id)}>
                    <CategoryIcon icon={fallback.icon} color={fallback.color} size="sm" />
                    Use “{fallback.name}”
                  </Button>
                )}
              </div>
            )}

            {canCreate && (
              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-10 w-full whitespace-normal"
                disabled={creating}
                onClick={() => void createFromSearch()}
              >
                <Plus />
                {creating ? 'Adding…' : `Add “${term}” as a new ${emptyNoun}`}
              </Button>
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  )
}
