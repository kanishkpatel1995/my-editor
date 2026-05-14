import { useEffect, useRef } from 'react'
import { useAnvilStore } from '../../store/anvilStore'
import { AnvilMetricsHeader } from './AnvilMetricsHeader'
import { AnvilControls } from './AnvilControls'
import { AnvilParagraphCard } from './AnvilParagraphCard'
import { AnvilThinkingTape } from './AnvilThinkingTape'

/**
 * Body of the ANVIL tab. Rendered inside the right-rail aside, alongside
 * the chat panel — both share the same width gutter and tab pair above.
 */
export function AnvilPanel() {
  const session = useAnvilStore((s) => s.session)
  const currentIndex = useAnvilStore((s) => s.currentIndex)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)

  // Auto-scroll to the currently-analysed paragraph while running.
  useEffect(() => {
    if (!stickRef.current) return
    const el = scrollRef.current
    if (!el || currentIndex == null) return
    const card = el.querySelector(`[data-anvil-pidx="${currentIndex}"]`)
    if (card && 'scrollIntoView' in card) {
      ;(card as HTMLElement).scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [currentIndex, session])

  return (
    <div className="flex h-full flex-col">
      <AnvilMetricsHeader session={session} />
      <AnvilControls />

      <div
        ref={scrollRef}
        onScroll={() => {
          const el = scrollRef.current
          if (!el) return
          stickRef.current =
            el.scrollHeight - el.clientHeight - el.scrollTop <= 80
        }}
        className="thin-scroll flex-1 overflow-y-auto"
      >
        {!session ? (
          <EmptyState />
        ) : (
          session.paragraphs.map((p, i) => (
            <div key={p.index} data-anvil-pidx={i}>
              <AnvilParagraphCard paragraph={p} isCurrent={i === currentIndex} />
            </div>
          ))
        )}
      </div>

      <AnvilThinkingTape />
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center animate-fade-in">
      <div className="label-eyebrow">ANVIL · adversarial review</div>
      <p className="max-w-[34ch] text-sm text-ink-soft">
        Put your draft on the anvil. A reasoning model walks paragraph by
        paragraph, flagging slop, checking claims, and forcing comprehension
        questions before you publish.
      </p>
      <p className="max-w-[40ch] font-mono text-[10px] uppercase tracking-[0.08em] text-mute leading-relaxed">
        grounded in cognitive-debt (MIT 2025), sycophancy (Anthropic 2023),
        desirable-difficulties (Bjork 1994), and Socratic-scaffolding research.
      </p>
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-mute">
        open an article → press <span className="text-ink-soft normal-case tracking-normal">Start</span>
      </p>
    </div>
  )
}
