import { useEffect, useRef, useState } from 'react'
import { ChevronDown, FileText, FileImage, FileCheck2, ArrowRight, Send } from 'lucide-react'
import { useArticleStore } from '../../store/articleStore'
import { cn } from '../../lib/cn'
import type { CompanionKind } from '../../types'

interface Props {
  /** Single click on a companion: open in editor (replace article view). */
  onOpen: (kind: CompanionKind) => void | Promise<void>
  /** Cmd/Ctrl-click or the inline arrow: paste companion content into chat input. */
  onSendToChat: (kind: CompanionKind) => void | Promise<void>
}

export function CompanionsMenu({ onOpen, onSendToChat }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const current = useArticleStore((s) => s.current)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const disabled = !current

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className={cn(
          'inline-flex h-7 items-center gap-1 border bg-paper px-2 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors duration-150',
          disabled
            ? 'border-rule-soft/60 text-mute cursor-not-allowed'
            : open
              ? 'border-ink text-ink'
              : 'border-rule-soft text-ink-soft hover:border-ink hover:text-ink',
        )}
        title={disabled ? 'Open an article to see its companions' : 'LinkedIn / Diagram / Evaluation'}
      >
        <FileText size={11} />
        <span>Companions</span>
        <ChevronDown size={11} className={cn('text-mute transition-transform duration-150', open && 'rotate-180')} />
      </button>

      {open && current ? (
        <div className="animate-fade-in absolute right-0 z-50 mt-1 w-[26rem] border border-ink bg-paper shadow-[var(--shadow-lift)]">
          <div className="border-b border-rule-soft bg-paper-2 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
            Companions for {current.dayNumber.toString().padStart(2, '0')}-{current.dayAbbrev}-{current.slug}
          </div>
          <CompanionRow
            kind="linkedin"
            label="LinkedIn promo"
            icon={<FileText size={11} />}
            onOpen={() => { setOpen(false); void onOpen('linkedin') }}
            onSend={() => { setOpen(false); void onSendToChat('linkedin') }}
          />
          <CompanionRow
            kind="diagram"
            label="Diagram prompt"
            icon={<FileImage size={11} />}
            onOpen={() => { setOpen(false); void onOpen('diagram') }}
            onSend={() => { setOpen(false); void onSendToChat('diagram') }}
          />
          <div className="flex items-center gap-1.5 border-b border-rule-soft px-3 py-1.5 opacity-50">
            <FileCheck2 size={11} className="text-mute" />
            <span className="text-[12px] tracking-tight text-mute">Evaluation</span>
            <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.08em] text-mute">
              weekly bundle
            </span>
          </div>
          <div className="border-t border-rule-soft px-3 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-mute">
            click → open in editor · ⌘-click or → → paste in chat
          </div>
        </div>
      ) : null}
    </div>
  )
}

function CompanionRow({
  kind: _kind, label, icon, onOpen, onSend,
}: {
  kind: CompanionKind
  label: string
  icon: React.ReactNode
  onOpen: (modifier: boolean) => void
  onSend: () => void
}) {
  return (
    <div className="group flex items-stretch gap-1 border-b border-rule-soft hover:bg-paper-2">
      <button
        type="button"
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault()
            onSend()
          } else {
            onOpen(false)
          }
        }}
        className="flex flex-1 items-center gap-1.5 px-3 py-1.5 text-left"
        title="Click to open in editor · ⌘-click to paste in chat"
      >
        <span className="text-mute">{icon}</span>
        <span className="text-[12px] tracking-tight text-ink">{label}</span>
        <ArrowRight size={11} className="ml-auto text-mute opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
      <button
        type="button"
        onClick={onSend}
        title="Paste content into chat input"
        className="flex shrink-0 items-center gap-1 self-stretch border-l border-rule-soft px-2 font-mono text-[10px] uppercase tracking-[0.08em] text-mute hover:bg-vermilion-tint hover:text-vermilion"
      >
        <Send size={10} />
        <span>chat</span>
      </button>
    </div>
  )
}
