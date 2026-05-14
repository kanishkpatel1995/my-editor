import { AlertTriangle, Check, Search } from 'lucide-react'
import type { AnvilParagraph } from '../../types'
import { ComprehensionPrompt } from './ComprehensionPrompt'

interface Props {
  paragraph: AnvilParagraph
  isCurrent: boolean
}

/**
 * Render one analysed paragraph as a stacked card:
 *   1. Paragraph preview (number + first 60 chars)
 *   2. Body with strikethrough annotations applied inline
 *   3. Slop chip
 *   4. Claims list (with verdict colour)
 *   5. Comprehension prompt
 *   6. Receipt footer
 */
export function AnvilParagraphCard({ paragraph, isCurrent }: Props) {
  const p = paragraph
  if (p.status === 'skipped') {
    return (
      <div className="border-b border-rule-soft px-3 py-2 opacity-60">
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-mute">
          ¶ {String(p.index).padStart(2, '0')} · skipped
        </div>
      </div>
    )
  }

  return (
    <article
      className={
        'border-b border-rule-soft px-3 py-3 animate-stamp-in ' +
        (isCurrent ? 'bg-vermilion-tint/30' : '')
      }
    >
      {/* Header */}
      <header className="mb-2 flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink">
          ¶ {String(p.index).padStart(2, '0')}
          {p.status === 'analysing' ? ' · analysing…' : ''}
          {p.status === 'failed' ? ' · failed' : ''}
        </span>
        {p.slop != null ? <SlopChip slop={p.slop} /> : null}
      </header>

      {/* Body with strikethroughs */}
      <div className="mb-2 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-soft">
        {renderAnnotatedBody(p.text, p.annotations)}
      </div>

      {/* Annotations notes (below the body, attached to each span) */}
      {p.annotations.length ? (
        <div className="mb-2 space-y-1.5">
          {p.annotations.map((a, i) => (
            <div key={i} className="border-l-2 border-vermilion bg-paper-2 pl-2 py-1 pr-2">
              {a.span ? (
                <div className="font-mono text-[10px] tracking-tight text-vermilion">
                  ◌ &quot;{a.span}&quot;
                </div>
              ) : null}
              <div className="text-[12.5px] leading-snug text-ink">{a.note}</div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Slop reason */}
      {p.slopReason ? (
        <div className="mb-2 flex gap-1.5 border border-rule-soft bg-paper-2 px-2 py-1">
          <AlertTriangle size={11} className="mt-0.5 flex-shrink-0 text-vermilion" />
          <div className="text-[12px] leading-snug text-ink-soft">{p.slopReason}</div>
        </div>
      ) : null}

      {/* Claims */}
      {p.claims.length ? (
        <div className="mb-2">
          <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-mute">
            ✓ Claims
          </div>
          <div className="space-y-1">
            {p.claims.map((c, i) => (
              <ClaimChip key={i} text={c.text} verdict={c.verdict} sources={c.sources} />
            ))}
          </div>
        </div>
      ) : null}

      {/* Comprehension */}
      {p.comprehension ? (
        <ComprehensionPrompt paragraphIndex={p.index} comprehension={p.comprehension} />
      ) : null}

      {/* Receipt */}
      {p.receipt ? (
        <footer className="mt-2 font-mono text-[9px] uppercase tracking-[0.12em] text-mute">
          ⚙ {p.receipt.model.split('/').pop()} · {p.receipt.latencyMs}ms ·
          {' '}{p.receipt.promptTokens + p.receipt.completionTokens} tok · ${p.receipt.costUsd.toFixed(4)}
        </footer>
      ) : null}
    </article>
  )
}

function SlopChip({ slop }: { slop: number }) {
  const band = slop < 3.5 ? 'low' : slop < 6 ? 'med' : 'high'
  const cls = band === 'high'
    ? 'border-vermilion text-vermilion bg-vermilion-tint'
    : band === 'med'
      ? 'border-rule text-ink bg-paper-2'
      : 'border-rule-soft text-ink-soft bg-paper'
  return (
    <span className={`inline-flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[10px] tracking-tight ${cls}`}>
      SLOP {slop.toFixed(1)}<span className="text-mute">/10</span>
    </span>
  )
}

function ClaimChip({
  text, verdict, sources,
}: {
  text: string
  verdict: 'ok' | 'verify' | 'verified-true' | 'verified-false' | 'inconclusive' | 'pending'
}) {
  let icon: React.ReactNode = null
  let cls = 'text-ink-soft'
  if (verdict === 'verified-true' || verdict === 'ok') {
    icon = <Check size={11} className="text-moss" />
    cls = 'text-ink'
  } else if (verdict === 'verified-false') {
    icon = <AlertTriangle size={11} className="text-vermilion" />
    cls = 'text-vermilion'
  } else if (verdict === 'verify' || verdict === 'pending') {
    icon = <Search size={11} className="text-mute" />
    cls = 'text-mute'
  } else if (verdict === 'inconclusive') {
    icon = <AlertTriangle size={11} className="text-goldenrod" />
    cls = 'text-goldenrod'
  }
  void sources  // v1.1 will render citation chips
  return (
    <div className={`flex items-start gap-1.5 text-[12px] leading-snug ${cls}`}>
      <span className="mt-0.5 flex-shrink-0">{icon}</span>
      <span className="flex-1">{text}</span>
    </div>
  )
}

/**
 * Render paragraph text with strikethrough applied where annotation spans
 * match verbatim. Falls back to plain text if a span isn't found.
 */
function renderAnnotatedBody(text: string, annotations: AnvilParagraph['annotations']): React.ReactNode[] {
  const spans = annotations
    .map((a) => a.span)
    .filter((s): s is string => !!s && s.length > 1)
  if (spans.length === 0) return [text]
  // Build a regex that matches any of the spans. Longest first to win
  // overlapping cases.
  const escaped = spans
    .sort((a, b) => b.length - a.length)
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp(`(${escaped.join('|')})`, 'g')
  const parts = text.split(re)
  return parts.map((part, i) =>
    spans.includes(part)
      ? <s key={i} className="text-vermilion decoration-vermilion">{part}</s>
      : part,
  )
}
