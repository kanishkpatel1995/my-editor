import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

type Variant = 'primary' | 'ghost' | 'icon' | 'danger'
type Size = 'sm' | 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  pressed?: boolean
  loading?: boolean
  leading?: ReactNode
  trailing?: ReactNode
}

const base =
  'inline-flex items-center justify-center gap-1.5 font-sans select-none ' +
  'transition-[background-color,color,border-color,box-shadow,transform] duration-150 ease-out ' +
  'disabled:opacity-40 disabled:cursor-not-allowed ' +
  'active:translate-y-px focus-visible:outline-none focus-visible:focus-ring'

const sizes: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-[11px] tracking-tight',
  md: 'h-8 px-3 text-xs tracking-tight',
}

const variants: Record<Variant, string> = {
  primary:
    'bg-ink text-paper border border-ink ' +
    'hover:bg-vermilion hover:border-vermilion ' +
    'shadow-[var(--shadow-press)]',
  ghost:
    'bg-transparent text-ink-soft border border-transparent ' +
    'hover:text-ink hover:border-rule-soft hover:bg-paper-2',
  icon:
    'bg-transparent text-ink-soft border border-transparent ' +
    'hover:text-ink hover:bg-paper-2',
  danger:
    'bg-vermilion text-paper border border-vermilion ' +
    'hover:bg-ink hover:border-ink',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'ghost', size = 'md', pressed, loading, leading, trailing, className, children, ...rest },
  ref,
) {
  const isIcon = variant === 'icon'
  const sizeClasses = isIcon ? (size === 'sm' ? 'h-7 w-7' : 'h-8 w-8') : sizes[size]
  return (
    <button
      ref={ref}
      type={rest.type ?? 'button'}
      data-pressed={pressed ? 'true' : undefined}
      className={cn(
        base,
        sizeClasses,
        variants[variant],
        pressed && (variant === 'icon'
          ? 'bg-paper-2 text-ink border-rule-soft'
          : 'bg-paper-2 text-ink border-rule-soft'),
        loading && 'cursor-wait',
        className,
      )}
      {...rest}
    >
      {leading}
      {children}
      {trailing}
    </button>
  )
})
