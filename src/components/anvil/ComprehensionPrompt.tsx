import { CheckCircle2, XCircle, ExternalLink, Loader2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { useAnvilStore } from '../../store/anvilStore'
import type { AnvilComprehension } from '../../types'

interface Props {
  paragraphIndex: number
  comprehension: AnvilComprehension
}

/**
 * Comprehension card: Yes / No / skip.
 *  - Yes: marks understood (counts toward COMP-RATE).
 *  - No: immediately fires the educational explainer with web search; the
 *        explanation streams in along with 2-3 cited sources. Marks the
 *        paragraph 'deferred-to-explain' so it counts toward COG-DEBT-Δ
 *        rather than COMP-RATE-yes — the tracking stays honest about what
 *        the user actually learned vs what the model just told them.
 *  - skip: dismiss without learning anything.
 *
 * The Socratic follow-up flow (intermediate "try answering this narrower
 * question yourself" step) is retired from the UI in favour of immediate
 * explanation + references the user can go read. The data model still
 * carries `socraticFollowup` / `socraticAnswer` fields for future revival.
 */
export function ComprehensionPrompt({ paragraphIndex, comprehension }: Props) {
  const answerYes = useAnvilStore((s) => s.answerYes)
  const answerNo = useAnvilStore((s) => s.answerNo)
  const skipComprehension = useAnvilStore((s) => s.skipComprehension)

  if (comprehension.isTransitional) {
    return (
      <div className="border-t border-rule-soft px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-mute">
        ⊙ transitional paragraph — no question
      </div>
    )
  }

  const state = comprehension.state

  return (
    <div className="border-t border-rule-soft px-3 py-2">
      <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-vermilion">⊙ Do you understand?</div>
      <div className="text-[13px] leading-snug text-ink">{comprehension.question}</div>

      {state === 'unanswered' ? (
        <div className="mt-2 flex gap-1.5">
          <Button variant="primary" size="sm" leading={<CheckCircle2 size={11} />} onClick={() => void answerYes(paragraphIndex)}>
            Yes
          </Button>
          <Button variant="ghost" size="sm" leading={<XCircle size={11} />} onClick={() => void answerNo(paragraphIndex)}>
            No
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void skipComprehension(paragraphIndex)}>
            skip
          </Button>
        </div>
      ) : null}

      {state === 'answered-yes' ? (
        <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-moss">
          ✓ marked as understood
        </div>
      ) : null}

      {state === 'skipped' ? (
        <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-mute">
          skipped
        </div>
      ) : null}

      {state === 'deferred-to-explain' ? (
        <ExplanationPanel comprehension={comprehension} />
      ) : null}
    </div>
  )
}

function ExplanationPanel({ comprehension }: { comprehension: AnvilComprehension }) {
  const streaming = !comprehension.explanation || comprehension.explanation.length < 40
  return (
    <div className="mt-3 border-l-2 border-vermilion pl-3">
      <div className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.12em] text-vermilion">
        ✗ no — let me explain
        {streaming ? <Loader2 size={9} className="animate-spin" /> : null}
        <span className="ml-auto text-mute" title="Counts toward COG-DEBT-Δ rather than COMP-RATE-yes">
          deferred · cog-debt
        </span>
      </div>

      <div className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink">
        {comprehension.explanation || <span className="text-mute">… searching the web and writing an explanation …</span>}
      </div>

      {comprehension.explanationSources && comprehension.explanationSources.length ? (
        <div className="mt-3">
          <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-mute">References</div>
          <ul className="mt-1 space-y-1.5">
            {comprehension.explanationSources.map((s, i) => (
              <li key={i} className="border-l-2 border-rule-soft pl-2">
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-start gap-1 text-[11.5px] text-vermilion hover:underline"
                  title={s.url}
                >
                  <ExternalLink size={10} className="mt-0.5 flex-shrink-0" />
                  <span className="break-words font-mono">{s.title || s.url}</span>
                </a>
                {s.snippet ? (
                  <div className="mt-0.5 text-[11.5px] leading-snug text-ink-soft">{s.snippet}</div>
                ) : null}
                {s.title && s.url !== s.title ? (
                  <div className="font-mono text-[10px] text-mute truncate" title={s.url}>{s.url}</div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
