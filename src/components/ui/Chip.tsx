import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export type ChipTone = 'ink' | 'mute' | 'accent' | 'warn' | 'error' | 'success'

interface ChipProps {
  tone?: ChipTone
  active?: boolean
  className?: string
  children: ReactNode
  as?: 'span' | 'button'
  onClick?: () => void
  title?: string
}

const tones: Record<ChipTone, string> = {
  ink: 'border-rule text-ink bg-transparent',
  mute: 'border-rule-soft text-ink-soft bg-transparent',
  accent: 'border-vermilion text-vermilion bg-vermilion-tint',
  warn: 'border-goldenrod text-goldenrod bg-paper',
  error: 'border-brick text-brick bg-paper',
  success: 'border-moss text-moss bg-paper',
}

export function Chip({ tone = 'mute', active, className, children, as = 'span', onClick, title }: ChipProps) {
  const Tag = as
  return (
    <Tag
      onClick={onClick}
      title={title}
      className={cn(
        'inline-flex items-center gap-1 border px-1.5 py-px font-mono text-[10px] uppercase tracking-[0.08em]',
        tones[tone],
        active && 'bg-ink text-paper border-ink',
        as === 'button' && 'cursor-pointer transition-colors duration-150 hover:bg-paper-2',
        className,
      )}
    >
      {children}
    </Tag>
  )
}
