import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '../../lib/cn'

interface Props {
  reasoning: string
  collapsed?: boolean
  durationMs?: number
  isStreaming?: boolean
  hasContent?: boolean
}

/**
 * Renders the model's reasoning / thinking deltas in a greyed-out block.
 * - Live state: expanded, no border, hairline left rule, blinking grey cursor.
 * - Post-stream: auto-collapsed to "▸ Thinking · 4.2s · 312 tokens", click to expand.
 */
export function ThinkingBlock({
  reasoning,
  collapsed,
  durationMs,
  isStreaming,
  hasContent,
}: Props) {
  const [open, setOpen] = useState(!collapsed)

  // Sync from props when stream completes
  useEffect(() => {
    setOpen(!collapsed)
  }, [collapsed])

  if (!reasoning && !isStreaming) return null

  // Mid-stream — always render expanded; subtle when content has begun, prominent when not
  const live = isStreaming && !collapsed
  const focal = live && !hasContent

  if (!live && collapsed) {
    return (
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-mute hover:text-ink"
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <span>Thinking{durationMs ? ` · ${(durationMs / 1000).toFixed(1)}s` : ''}</span>
        <span className="ml-1 inline-block h-1 w-1 rounded-full bg-rule-soft" />
      </button>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-mute hover:text-ink"
      >
        <ChevronRight size={11} />
        <span>Show thinking</span>
      </button>
    )
  }

  return (
    <div
      className={cn(
        'animate-fade-in mb-3 border-l-2 pl-3',
        focal ? 'border-l-vermilion' : 'border-l-rule-soft',
      )}
    >
      <div className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em]">
        <span className={cn(focal ? 'text-vermilion' : 'text-mute')}>
          Thinking{live ? ' · live' : durationMs ? ` · ${(durationMs / 1000).toFixed(1)}s` : ''}
        </span>
        {!live && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="ml-auto text-mute hover:text-ink"
            aria-label="Hide thinking"
          >
            <ChevronDown size={11} />
          </button>
        )}
      </div>
      <div
        className={cn(
          'whitespace-pre-wrap font-mono text-[12px] leading-relaxed',
          focal ? 'text-ink-soft' : 'text-mute',
        )}
      >
        {reasoning}
        {live ? (
          <span
            className="ml-0.5 inline-block h-3 w-1.5 align-text-bottom bg-mute animate-cursor-blink"
            aria-hidden
          />
        ) : null}
      </div>
    </div>
  )
}
