import { useEffect, useRef } from 'react'
import { useAnvilStore } from '../../store/anvilStore'

/**
 * Pinned to the bottom of the ANVIL panel while a run is active. Shows the
 * analyst model's reasoning-token stream for the current paragraph. Auto-
 * scrolls to bottom on each token unless the user has scrolled up.
 */
export function AnvilThinkingTape() {
  const thinking = useAnvilStore((s) => s.thinking)
  const isRunning = useAnvilStore((s) => s.isRunning)
  const currentIndex = useAnvilStore((s) => s.currentIndex)
  const session = useAnvilStore((s) => s.session)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !pinnedRef.current) return
    el.scrollTop = el.scrollHeight
  }, [thinking])

  if (!isRunning && !thinking) return null

  const paraIdx = currentIndex != null && session
    ? session.paragraphs[currentIndex]?.index
    : null

  return (
    <div className="border-t border-rule-soft bg-paper-2 px-3 py-2">
      <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-mute">
        ┊ THINKING {paraIdx ? `· ¶ ${paraIdx}` : ''}
      </div>
      <div
        ref={scrollRef}
        onScroll={() => {
          const el = scrollRef.current
          if (!el) return
          const distFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop
          pinnedRef.current = distFromBottom <= 24
        }}
        className="thin-scroll mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap border-l-2 border-rule-soft pl-2 font-mono text-[11px] leading-relaxed text-mute"
      >
        {thinking || '…'}
      </div>
    </div>
  )
}
