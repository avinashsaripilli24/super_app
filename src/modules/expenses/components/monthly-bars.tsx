import { useEffect, useId, useRef, useState } from 'react'

import { cn, formatCompactINR, formatMoney } from '@/lib/utils'
import type { MonthTotals } from '@/modules/expenses/api'

const H = 240
const M = { top: 12, right: 8, bottom: 26, left: 46 }
const PLOT_H = H - M.top - M.bottom
const GAP = 2 // surface gap between the two bars of a group

/** Container width in CSS px so 1 SVG unit = 1px and text stays readable. */
function useWidth<T extends HTMLElement>(fallback = 720) {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w && w > 0) setWidth(Math.round(w))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

/** Round a max value up to a "nice" axis ceiling. */
function niceMax(v: number) {
  if (v <= 0) return 1000
  const exp = Math.pow(10, Math.floor(Math.log10(v)))
  const f = v / exp
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10
  return nice * exp
}

/** Rect with only the data-end (top) rounded, anchored to the baseline. */
function topRoundedPath(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return ''
  const rr = Math.min(r, w / 2, h)
  return [
    `M${x},${y + h}`,
    `V${y + rr}`,
    `Q${x},${y} ${x + rr},${y}`,
    `H${x + w - rr}`,
    `Q${x + w},${y} ${x + w},${y + rr}`,
    `V${y + h}`,
    'Z',
  ].join(' ')
}

/**
 * Grouped bar chart: spent vs income for each month of a year. Inline SVG,
 * responsive via viewBox, colours from the validated chart tokens.
 */
export function MonthlyBars({
  data,
  onSelectMonth,
  className,
}: {
  data: MonthTotals[]
  onSelectMonth?: (key: string) => void
  className?: string
}) {
  const id = useId()
  const [wrapRef, W] = useWidth<HTMLDivElement>()
  const PLOT_W = W - M.left - M.right
  const now = new Date()
  const defaultIndex = (() => {
    const current = data.findIndex((d) => d.key === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
    if (current >= 0) return current
    const last = [...data].reverse().find((d) => d.spent > 0 || d.income > 0)
    return last ? data.indexOf(last) : 0
  })()
  const [hover, setHover] = useState<number | null>(null)
  const active = hover ?? defaultIndex
  const activeRow = data[active]

  const max = niceMax(Math.max(...data.map((d) => Math.max(d.spent, d.income)), 0))
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max)
  const groupW = PLOT_W / 12
  const barW = Math.max(3, Math.min(22, (groupW - 6 - GAP) / 2))
  const y = (v: number) => M.top + PLOT_H - (v / max) * PLOT_H

  const empty = data.every((d) => d.spent === 0 && d.income === 0)

  return (
    <div className={cn('space-y-2', className)}>
      {/* Legend (text in text tokens, swatch carries identity) */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-chart-spent" /> Spent
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm bg-chart-income" /> Income
        </span>
      </div>

      <div ref={wrapRef} className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        role="img"
        aria-labelledby={`${id}-title`}
        className="block max-w-full select-none"
        onPointerLeave={() => setHover(null)}
      >
        <title id={`${id}-title`}>Spent and income per month</title>

        {/* Gridlines + y labels */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={M.left}
              x2={W - M.right}
              y1={y(t)}
              y2={y(t)}
              className="stroke-border"
              strokeWidth={1}
              strokeDasharray={t === 0 ? undefined : '2 4'}
            />
            <text
              x={M.left - 6}
              y={y(t)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted-foreground"
              fontSize={11}
            >
              {formatCompactINR(t)}
            </text>
          </g>
        ))}

        {/* Bars */}
        {data.map((d, i) => {
          const gx = M.left + i * groupW
          const x1 = gx + (groupW - (barW * 2 + GAP)) / 2
          const x2 = x1 + barW + GAP
          const isActive = i === active
          const label = `${d.label}: spent ${formatMoney(d.spent)}, income ${formatMoney(d.income)}`
          return (
            <g
              key={d.key}
              onPointerEnter={() => setHover(i)}
              onClick={() => onSelectMonth?.(d.key)}
              className={cn(onSelectMonth && 'cursor-pointer')}
            >
              {/* hit target bigger than the marks */}
              <rect x={gx} y={M.top} width={groupW} height={PLOT_H} fill="transparent">
                <title>{label}</title>
              </rect>
              {isActive && (
                <rect
                  x={gx + 2}
                  y={M.top}
                  width={groupW - 4}
                  height={PLOT_H}
                  rx={4}
                  className="fill-accent"
                  opacity={0.6}
                />
              )}
              <path d={topRoundedPath(x1, y(d.spent), barW, PLOT_H - (y(d.spent) - M.top), 4)} fill="var(--chart-spent)" />
              <path
                d={topRoundedPath(x2, y(d.income), barW, PLOT_H - (y(d.income) - M.top), 4)}
                fill="var(--chart-income)"
              />
              <text
                x={gx + groupW / 2}
                y={H - 8}
                textAnchor="middle"
                fontSize={11}
                className={cn('fill-muted-foreground', isActive && 'fill-foreground font-medium')}
              >
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>
      </div>

      {/* Hover/selection readout (acts as the tooltip on touch devices) */}
      <div className="flex items-center justify-between rounded-md bg-muted/60 px-3 py-2 text-xs">
        <span className="font-medium">{activeRow ? activeRow.label : '—'}</span>
        {empty ? (
          <span className="text-muted-foreground">No transactions this year</span>
        ) : activeRow ? (
          <span className="flex gap-3 tabular-nums">
            <span>
              <span className="text-muted-foreground">Spent </span>
              {formatMoney(activeRow.spent)}
            </span>
            <span>
              <span className="text-muted-foreground">Income </span>
              {formatMoney(activeRow.income)}
            </span>
          </span>
        ) : null}
      </div>
    </div>
  )
}
