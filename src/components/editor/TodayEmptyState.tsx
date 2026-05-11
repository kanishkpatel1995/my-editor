import { Plus } from 'lucide-react'
import { Button } from '../ui/Button'
import { todayPrettyDate } from '../../lib/workflow'
import type { ArticleRef } from '../../types'

interface Props {
  latest: ArticleRef | null
  onCreateToday: () => void
  onOpenLatest?: () => void
}

export function TodayEmptyState({ latest, onCreateToday, onOpenLatest }: Props) {
  return (
    <div className="relative mx-auto flex h-full max-w-[600px] flex-col items-center justify-center gap-6 px-8 py-16 text-center animate-fade-in">
      {/* Registration marks at the corners — same press metaphor as the canvas */}
      <span aria-hidden className="absolute left-3 top-3 h-3 w-3 border-l border-t border-vermilion" />
      <span aria-hidden className="absolute right-3 top-3 h-3 w-3 border-r border-t border-vermilion" />
      <span aria-hidden className="absolute bottom-3 left-3 h-3 w-3 border-b border-l border-vermilion" />
      <span aria-hidden className="absolute bottom-3 right-3 h-3 w-3 border-b border-r border-vermilion" />

      <div className="label-eyebrow text-vermilion">Foundry · {todayPrettyDate()}</div>

      <h1 className="text-3xl font-medium tracking-tight text-ink">
        No article for today yet.
      </h1>

      <p className="max-w-[36ch] font-mono text-[12px] leading-relaxed text-ink-soft">
        Press <span className="border border-rule-soft bg-paper-2 px-1 py-px">Create</span> to start a fresh{' '}
        <code className="text-ink">{todayFilenameHint()}</code> in your weekly folder.
      </p>

      <Button variant="primary" size="md" leading={<Plus size={12} />} onClick={onCreateToday}>
        Create today's article
      </Button>

      {onOpenLatest && latest ? (
        <button
          type="button"
          onClick={onOpenLatest}
          className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-mute hover:text-ink"
        >
          or open the latest · <span className="text-ink-soft normal-case tracking-normal">{latest.filename}</span>
        </button>
      ) : null}

      <span className="hairline animate-rule-grow mt-8 w-24" />
    </div>
  )
}

function todayFilenameHint(): string {
  const now = new Date()
  const idx = (now.getDay() + 6) % 7
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
  return `${String(idx + 1).padStart(2, '0')}-${days[idx]}-…`
}
