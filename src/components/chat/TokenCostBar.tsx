import type { ThreadUsage } from '../../types'
import { cn } from '../../lib/cn'

export function TokenCostBar({ usage, costWarnUsd }: { usage: ThreadUsage; costWarnUsd: number }) {
  const pct = Math.min(1, costWarnUsd > 0 ? usage.costUsd / costWarnUsd : 0)
  const over = pct >= 1
  return (
    <div className="border-t border-rule">
      {/* tiny progress hairline */}
      <div className="relative h-px bg-paper-2">
        <div
          className={cn(
            'absolute inset-y-0 left-0 transition-[width] duration-300 ease-out',
            over ? 'bg-vermilion' : pct > 0.66 ? 'bg-goldenrod' : 'bg-rule-soft',
          )}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
      <div
        className={cn(
          'flex items-center justify-between px-3 py-1 font-mono text-[10px] uppercase tracking-[0.08em]',
          over ? 'text-vermilion' : 'text-mute',
        )}
      >
        <span>
          in <span className="text-ink-soft">{usage.tokensIn.toLocaleString()}</span>
          {' · '}
          out <span className="text-ink-soft">{usage.tokensOut.toLocaleString()}</span>
          {usage.imagesGenerated ? <> {' · '}<span className="text-ink-soft">{usage.imagesGenerated}</span> img</> : null}
        </span>
        <span className={cn('text-ink-soft', over && 'text-vermilion')}>
          ${usage.costUsd.toFixed(4)}
        </span>
      </div>
    </div>
  )
}
