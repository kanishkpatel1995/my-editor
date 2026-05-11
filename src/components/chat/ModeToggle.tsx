import type { ChatMode } from '../../types'

export function ModeToggle({ mode, onChange }: { mode: ChatMode; onChange: (m: ChatMode) => void }) {
  return (
    <div
      role="tablist"
      className="inline-flex items-center border border-rule bg-paper font-mono text-[10px] uppercase tracking-[0.08em]"
    >
      <Segment label="💬 Text" active={mode === 'text'} onClick={() => onChange('text')} />
      <span className="h-5 w-px bg-rule" aria-hidden />
      <Segment label="🎨 Image" active={mode === 'image'} onClick={() => onChange('image')} />
    </div>
  )
}

function Segment({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      type="button"
      onClick={onClick}
      className={
        'h-6 px-2 transition-colors duration-150 ' +
        (active ? 'bg-ink text-paper' : 'bg-paper text-ink-soft hover:bg-paper-2 hover:text-ink')
      }
    >
      {label}
    </button>
  )
}
