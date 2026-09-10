import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

import { cn, formatCompactINR, formatMoney } from '@/lib/utils'
import type { BarRow } from '@/modules/assets/api'

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

export interface BarSeries {
  name: string
  /** CSS custom property carrying the fill, e.g. `--chart-assets`. */
  cssVar: '--chart-assets' | '--chart-debts' | '--chart-income' | '--chart-spent'
  /** Tailwind utility for the legend swatch, e.g. `bg-chart-assets`. */
  swatchClass: string
}

/**
 * Grouped bar chart of two series over 12 months. Inline SVG (no chart
 * library), responsive via a ResizeObserver, colours from the chart tokens.
 * Groups with `null` values (months not started) draw no bars.
 */
export function PairedBars({
  data,
  series,
  title,
  emptyText = 'Nothing recorded this year',
  readout,
  onSelect,
  className,
}: {
  data: BarRow[]
  series: { a: BarSeries; b: BarSeries }
  /** Accessible title of the chart. */
  title: string
  emptyText?: string
  /** Custom content for the selection strip; defaults to both series' values. */
  readout?: (row: BarRow) => ReactNode
  onSelect?: (key: string) => void
  className?: string
}) {
  const id = useId()
  const [wrapRef, W] = useWidth<HTMLDivElement>()
  const PLOT_W = W - M.left - M.right
  const now = new Date()
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const defaultIndex = (() => {
    const current = data.findIndex((d) => d.key === currentKey && d.a !== null)
    if (current >= 0) return current
    const last = [...data].reverse().find((d) => d.a !== null || d.b !== null)
    return last ? data.indexOf(last) : 0
  })()
  const [hover, setHover] = useState<number | null>(null)
  const active = hover ?? defaultIndex
  const activeRow = data[active]

  const max = niceMax(Math.max(...data.map((d) => Math.max(d.a ?? 0, d.b ?? 0)), 0))
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max)
  const groupW = PLOT_W / 12
  const barW = Math.max(3, Math.min(22, (groupW - 6 - GAP) / 2))
  const y = (v: number) => M.top + PLOT_H - (v / max) * PLOT_H

  const empty = data.every((d) => !d.a && !d.b)

  return (
    <div className={cn('space-y-2', className)}>
      {/* Legend (text in text tokens, swatch carries identity) */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className={cn('size-2.5 rounded-sm', series.a.swatchClass)} /> {series.a.name}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className={cn('size-2.5 rounded-sm', series.b.swatchClass)} /> {series.b.name}
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
          <title id={`${id}-title`}>{title}</title>

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
            const label =
              d.a === null && d.b === null
                ? `${d.label}: not started`
                : `${d.label}: ${series.a.name} ${formatMoney(d.a ?? 0)}, ${series.b.name} ${formatMoney(d.b ?? 0)}`
            return (
              <g
                key={d.key}
                onPointerEnter={() => setHover(i)}
                onClick={() => onSelect?.(d.key)}
                className={cn(onSelect && 'cursor-pointer')}
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
                {d.a !== null && (
                  <path
                    d={topRoundedPath(x1, y(d.a), barW, PLOT_H - (y(d.a) - M.top), 4)}
                    fill={`var(${series.a.cssVar})`}
                  />
                )}
                {d.b !== null && (
                  <path
                    d={topRoundedPath(x2, y(d.b), barW, PLOT_H - (y(d.b) - M.top), 4)}
                    fill={`var(${series.b.cssVar})`}
                  />
                )}
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
      <div className="flex items-center justify-between gap-3 rounded-md bg-muted/60 px-3 py-2 text-xs">
        <span className="font-medium">{activeRow ? activeRow.label : '—'}</span>
        {empty ? (
          <span className="text-muted-foreground">{emptyText}</span>
        ) : activeRow ? (
          activeRow.a === null && activeRow.b === null ? (
            <span className="text-muted-foreground">Not started</span>
          ) : readout ? (
            readout(activeRow)
          ) : (
            <span className="flex gap-3 tabular-nums">
              <span>
                <span className="text-muted-foreground">{series.a.name} </span>
                {formatMoney(activeRow.a ?? 0)}
              </span>
              <span>
                <span className="text-muted-foreground">{series.b.name} </span>
                {formatMoney(activeRow.b ?? 0)}
              </span>
            </span>
          )
        ) : null}
      </div>
    </div>
  )
}
