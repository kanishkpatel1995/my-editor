import { useEffect, useRef } from 'react'
import { ListTree, AlertTriangle } from 'lucide-react'
import { Button } from '../ui/Button'
import { useAnvilStore } from '../../store/anvilStore'
import { AnvilMetricsHeader } from './AnvilMetricsHeader'
import { AnvilControls } from './AnvilControls'
import { AnvilParagraphCard } from './AnvilParagraphCard'
import { AnvilThinkingTape } from './AnvilThinkingTape'
import { AnvilSessionsList } from './AnvilSessionsList'

/**
 * Body of the ANVIL tab. Rendered inside the right-rail aside, alongside
 * the chat panel — both share the same width gutter and tab pair above.
 */
export function AnvilPanel() {
  const session = useAnvilStore((s) => s.session)
  const currentIndex = useAnvilStore((s) => s.currentIndex)
  const showList = useAnvilStore((s) => s.showSessionsList)
  const setShowList = useAnvilStore((s) => s.setShowSessionsList)
  const staleAgainstArticle = useAnvilStore((s) => s.staleAgainstArticle)
  const start = useAnvilStore((s) => s.start)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)

  if (showList) return <AnvilSessionsList />

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
      {/* Sessions header row */}
      <div className="flex items-center gap-1.5 border-b border-rule-soft px-2.5 py-1.5">
        <Button
          variant="ghost"
          size="sm"
          leading={<ListTree size={11} />}
          onClick={() => setShowList(true)}
          title="Browse past ANVIL sessions on disk"
        >
          Sessions
        </Button>
        {session ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-mute truncate" title={session.articleSlug}>
            · {session.articleSlug}
          </span>
        ) : null}
      </div>

      {/* Stale-article banner */}
      {staleAgainstArticle && session ? (
        <div className="border-b border-vermilion bg-vermilion-tint px-3 py-1.5">
          <div className="flex items-start gap-1.5">
            <AlertTriangle size={11} className="mt-0.5 flex-shrink-0 text-vermilion" />
            <div className="text-[11.5px] leading-snug text-ink">
              Article changed since this proof. Paragraph contents in the cards
              may be stale.
              <button
                type="button"
                onClick={() => void start()}
                className="ml-1 font-mono uppercase tracking-[0.08em] text-vermilion underline-offset-2 hover:underline"
              >
                Re-run on current text
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
