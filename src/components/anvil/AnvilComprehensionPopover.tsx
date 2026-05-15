import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useAnvilStore } from '../../store/anvilStore'
import { ComprehensionPrompt } from './ComprehensionPrompt'

interface CompClickDetail {
  paragraphIndex: number
  rect: { x: number; y: number; width: number; height: number }
}

/**
 * Floating popover anchored to a clicked end-of-paragraph comprehension chip
 * in the editor canvas. Renders the same `ComprehensionPrompt` UI as the side
 * panel cards — so Y/N/skip + Socratic follow-up + deferred-explain are all
 * accessible inline, right next to the paragraph that triggered the question.
 */
export function AnvilComprehensionPopover() {
  const session = useAnvilStore((s) => s.session)
  const [activePidx, setActivePidx] = useState<number | null>(null)
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: Event) => {
      const detail = (e as CustomEvent<CompClickDetail>).detail
      if (!detail) return
      setActivePidx(detail.paragraphIndex)
      setAnchor({ x: detail.rect.x, y: detail.rect.y + detail.rect.height + 6 })
    }
    window.addEventListener('anvil:comp-click', onClick)
    return () => window.removeEventListener('anvil:comp-click', onClick)
  }, [])

  useEffect(() => {
    if (activePidx == null) return
    const onDoc = (e: MouseEvent) => {
      if (!popoverRef.current) return
      if (popoverRef.current.contains(e.target as Node)) return
      const tgt = e.target as HTMLElement
      if (tgt.closest('.anvil-q-chip')) return
      setActivePidx(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActivePidx(null)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [activePidx])

  if (activePidx == null || !anchor || !session) return null
  const para = session.paragraphs.find((p) => p.index === activePidx)
  if (!para?.comprehension) return null

  // Same scroll-safety as the strikethrough / claim popovers: cap maxHeight
  // against the viewport and put the body in an inner scroll container so the
  // explanation + references can grow arbitrarily without spilling off-screen.
  const POPOVER_W = 400
  const MARGIN = 12
  const left = Math.max(MARGIN, Math.min(anchor.x, window.innerWidth - POPOVER_W - MARGIN))
  const top = Math.max(MARGIN, Math.min(anchor.y, window.innerHeight - 100))
  const maxHeight = window.innerHeight - top - MARGIN

  return (
    <div
      ref={popoverRef}
      style={{ position: 'fixed', left, top, width: POPOVER_W, maxHeight, zIndex: 70 }}
      className="flex flex-col border border-ink bg-paper shadow-[var(--shadow-lift)] animate-fade-in"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex flex-shrink-0 items-center justify-between border-b border-rule-soft bg-paper-2 px-2 py-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-vermilion">
          ⊙ Comprehension · ¶ {String(para.index).padStart(2, '0')}
        </span>
        <button
          type="button"
          onClick={() => setActivePidx(null)}
          className="inline-flex h-5 w-5 items-center justify-center text-mute hover:text-ink"
          title="Close"
        >
          <X size={11} />
        </button>
      </div>
      <div className="thin-scroll flex-1 overflow-y-auto">
        <ComprehensionPrompt paragraphIndex={para.index} comprehension={para.comprehension} />
      </div>
    </div>
  )
}
