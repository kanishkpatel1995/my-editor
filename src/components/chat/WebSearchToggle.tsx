import { Globe } from 'lucide-react'
import { cn } from '../../lib/cn'

interface Props {
  active: boolean
  onToggle: () => void
}

export function WebSearchToggle({ active, onToggle }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={active ? 'Web search ON — model:online' : 'Web search OFF'}
      aria-pressed={active}
      className={cn(
        'inline-flex h-7 items-center gap-1 border bg-paper px-2 font-mono text-[11px] tracking-tight transition-colors duration-150',
        active
          ? 'border-vermilion text-vermilion bg-vermilion-tint'
          : 'border-rule-soft text-ink-soft hover:border-ink hover:text-ink',
      )}
    >
      <Globe size={11} />
      <span>Web</span>
      {active ? <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-vermilion" /> : null}
    </button>
  )
}
