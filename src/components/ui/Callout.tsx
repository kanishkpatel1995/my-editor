import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import type { ChipTone } from './Chip'

interface CalloutProps {
  tone?: ChipTone
  title?: ReactNode
  icon?: ReactNode
  action?: ReactNode
  className?: string
  children?: ReactNode
  collapsible?: boolean
  defaultOpen?: boolean
}

const toneBorder: Record<ChipTone, string> = {
  ink: 'border-rule',
  mute: 'border-rule-soft',
  accent: 'border-vermilion',
  warn: 'border-goldenrod',
  error: 'border-brick',
  success: 'border-moss',
}

const toneBar: Record<ChipTone, string> = {
  ink: 'bg-ink',
  mute: 'bg-rule-soft',
  accent: 'bg-vermilion',
  warn: 'bg-goldenrod',
  error: 'bg-brick',
  success: 'bg-moss',
}

const toneTitle: Record<ChipTone, string> = {
  ink: 'text-ink',
  mute: 'text-ink-soft',
  accent: 'text-vermilion',
  warn: 'text-goldenrod',
  error: 'text-brick',
  success: 'text-moss',
}

export function Callout({
  tone = 'mute',
  title,
  icon,
  action,
  className,
  children,
  collapsible,
  defaultOpen = false,
}: CalloutProps) {
  return (
    <div
      className={cn(
        'animate-fade-in relative border bg-paper',
        toneBorder[tone],
        className,
      )}
    >
      <span className={cn('absolute left-0 top-0 h-full w-0.5', toneBar[tone])} aria-hidden />
      <div className="px-3 py-2">
        {(title || action) && (
          <div className="mb-1 flex items-center gap-2">
            {icon ? <span className={cn('flex h-3 w-3 items-center justify-center', toneTitle[tone])}>{icon}</span> : null}
            {title ? (
              <span className={cn('font-mono text-[10px] uppercase tracking-[0.12em]', toneTitle[tone])}>
                {title}
              </span>
            ) : null}
            {action ? <span className="ml-auto">{action}</span> : null}
          </div>
        )}
        {collapsible ? (
          <details open={defaultOpen} className="group">
            <summary className="label-eyebrow cursor-pointer select-none list-none hover:text-ink">
              <span className="group-open:hidden">show ↓</span>
              <span className="hidden group-open:inline">hide ↑</span>
            </summary>
            <div className="mt-2">{children}</div>
          </details>
        ) : (
          children
        )}
      </div>
    </div>
  )
}
