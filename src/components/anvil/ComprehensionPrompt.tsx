import { useState } from 'react'
import { CheckCircle2, XCircle, ChevronRight } from 'lucide-react'
import { Button } from '../ui/Button'
import { useAnvilStore } from '../../store/anvilStore'
import type { AnvilComprehension } from '../../types'

interface Props {
  paragraphIndex: number
  comprehension: AnvilComprehension
}

/**
 * Comprehension card: Yes / No / skip → on No, Socratic follow-up streams in
 * with a text field for the user's attempted answer. Only after that does
 * "explain" reveal the full explainer.
 */
export function ComprehensionPrompt({ paragraphIndex, comprehension }: Props) {
  const answerYes = useAnvilStore((s) => s.answerYes)
  const answerNo = useAnvilStore((s) => s.answerNo)
  const submitSocraticAnswer = useAnvilStore((s) => s.submitSocraticAnswer)
  const requestExplanation = useAnvilStore((s) => s.requestExplanation)
  const skipComprehension = useAnvilStore((s) => s.skipComprehension)

  const [socraticDraft, setSocraticDraft] = useState('')

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

      {/* No → Socratic follow-up appears here */}
      {(state !== 'unanswered' && state !== 'answered-yes' && state !== 'skipped') ? (
        <div className="mt-3 border-l-2 border-vermilion pl-3">
          <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-vermilion">Try this first</div>
          <div className="mt-1 text-[12.5px] leading-snug text-ink">
            {comprehension.socraticFollowup || <span className="text-mute">…thinking…</span>}
          </div>

          {state !== 'deferred-to-explain' && state !== 'answered-socratic' ? (
            <>
              <textarea
                value={socraticDraft}
                onChange={(e) => setSocraticDraft(e.target.value)}
                rows={2}
                placeholder="In one sentence…"
                className="thin-scroll mt-2 w-full resize-none border border-rule-soft bg-paper px-2 py-1 text-[12px] leading-relaxed text-ink outline-none placeholder:text-mute focus:border-ink"
              />
              <div className="mt-1 flex gap-1.5">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    if (!socraticDraft.trim()) return
                    void submitSocraticAnswer(paragraphIndex, socraticDraft.trim())
                  }}
                  disabled={!socraticDraft.trim()}
                >
                  Submit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  leading={<ChevronRight size={11} />}
                  onClick={() => void requestExplanation(paragraphIndex)}
                  title="Counts toward COG-DEBT-Δ rather than COMP-RATE-yes"
                >
                  I really don't know — explain
                </Button>
              </div>
            </>
          ) : null}

          {state === 'answered-socratic' && comprehension.socraticAnswer ? (
            <div className="mt-2 border-l border-moss pl-2">
              <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-moss">your answer · ✓ noted</div>
              <div className="mt-0.5 text-[12.5px] text-ink-soft">{comprehension.socraticAnswer}</div>
            </div>
          ) : null}

          {state === 'deferred-to-explain' && comprehension.explanation != null ? (
            <div className="mt-3 border-l-2 border-rule-soft pl-3">
              <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-mute">
                ⚠ deferred · counts toward cognitive-debt
              </div>
              <div className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-soft">
                {comprehension.explanation || <span className="text-mute">…</span>}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
