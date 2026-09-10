import { Tag } from 'lucide-react'

import { cn } from '@/lib/utils'
import { CATEGORY_ICONS } from '@/modules/expenses/components/category-icons'

export function CategoryIcon({
  icon,
  color,
  size = 'md',
  className,
}: {
  icon: string | null | undefined
  color: string | null | undefined
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const Icon = CATEGORY_ICONS[icon ?? 'tag'] ?? Tag
  const bg = color ?? '#94a3b8'
  const dims =
    size === 'sm' ? 'size-8 [&_svg]:size-4' : size === 'lg' ? 'size-12 [&_svg]:size-6' : 'size-10 [&_svg]:size-5'
  return (
    <span
      aria-hidden
      className={cn('grid shrink-0 place-items-center rounded-full', dims, className)}
      style={{ backgroundColor: `${bg}22`, color: bg }}
    >
      <Icon />
    </span>
  )
}
