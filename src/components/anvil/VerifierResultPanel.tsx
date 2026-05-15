import { ExternalLink, ShieldCheck, ShieldX, ShieldAlert, Loader2, Link2 } from 'lucide-react'
import type { VerifierSource } from '../../types'

interface Props {
  verdict?: 'verified-true' | 'verified-false' | 'inconclusive' | 'ok' | 'pending'
  confidence?: 'low' | 'medium' | 'high'
  explanation?: string
  sources?: VerifierSource[]
  /** Shown above the verdict — e.g. "Web verification" or the claim text. */
  header?: string
  /** True while the verifier is streaming. Shows a pulse + "checking…" label. */
  streaming?: boolean
  /** When supplied, each source gets a small "Cite" button that wraps the
   *  span/claim text in a markdown link to that source's URL. */
  onCite?: (source: VerifierSource) => void
}

/**
 * Shared verdict + sources panel used by both the strikethrough popover
 * (when the user runs Verify-claim on a span) and the claim popover.
 * Stateless, presentational — caller controls when to render it.
 */
export function VerifierResultPanel({
  verdict, confidence, explanation, sources, header, streaming, onCite,
}: Props) {
  if (!verdict && !explanation && !streaming) return null

  // If the verdict has arrived (mid-stream), show it immediately — only fall
  // back to `pending` when we genuinely don't have one yet.
  const v = verdict || 'pending'
  const label = labelFor(v, confidence)
  const Icon = iconFor(v)

  return (
    <div className="border-t border-rule-soft px-3 py-2 bg-paper-2">
      {header ? (
        <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.12em] text-goldenrod">
          {header}
        </div>
      ) : null}

      <div className={'inline-flex items-center gap-1.5 border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-tight ' + label.tone}>
        <Icon size={11} className={streaming ? 'animate-spin' : ''} />
        {label.text}
        {streaming ? <span className="text-mute"> · checking…</span> : null}
      </div>

      {explanation ? (
        <div className="mt-2 border-l-2 border-rule-soft pl-2 text-[12.5px] leading-snug text-ink whitespace-pre-wrap">
          {explanation}
        </div>
      ) : null}

      {sources && sources.length ? (
        <div className="mt-2">
          <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-mute">Sources</div>
          <ul className="mt-1 space-y-1.5">
            {sources.map((s, i) => (
              <li key={i} className="border-l-2 border-rule-soft pl-2">
                <div className="flex items-start gap-1.5">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex-1 min-w-0 text-[11.5px] text-vermilion hover:underline"
                    title={s.url}
                  >
                    <span className="inline-flex items-start gap-1">
                      <ExternalLink size={10} className="mt-0.5 flex-shrink-0" />
                      <span className="break-words font-mono">
                        {s.title || s.url}
                      </span>
                    </span>
                  </a>
                  {onCite ? (
                    <button
                      type="button"
                      onClick={() => onCite(s)}
                      title="Wrap the span in the editor as [span](this-url) — a real hyperlink in the article"
                      className="inline-flex flex-shrink-0 items-center gap-0.5 border border-rule-soft bg-paper-2 px-1 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-ink-soft hover:border-vermilion hover:text-vermilion"
                    >
                      <Link2 size={9} /> Cite
                    </button>
                  ) : null}
                </div>
                {s.snippet ? (
                  <div className="mt-0.5 text-[11.5px] leading-snug text-ink-soft">{s.snippet}</div>
                ) : null}
                {s.title && s.url !== s.title ? (
                  <div className="font-mono text-[10px] text-mute truncate max-w-full" title={s.url}>{s.url}</div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function labelFor(
  v: 'verified-true' | 'verified-false' | 'inconclusive' | 'ok' | 'pending',
  confidence?: 'low' | 'medium' | 'high',
): { text: string; tone: string } {
  const conf = confidence ? ` · ${confidence}` : ''
  switch (v) {
    case 'verified-true':  return { text: 'TRUE' + conf,        tone: 'text-moss border-moss bg-paper-2' }
    case 'verified-false': return { text: 'FALSE' + conf,       tone: 'text-vermilion border-vermilion bg-vermilion-tint' }
    case 'inconclusive':   return { text: 'INCONCLUSIVE' + conf, tone: 'text-goldenrod border-goldenrod bg-paper-2' }
    case 'ok':             return { text: 'OK · manual',         tone: 'text-moss border-moss bg-paper-2' }
    case 'pending':
    default:               return { text: 'verifying',           tone: 'text-goldenrod border-goldenrod bg-paper-2' }
  }
}

function iconFor(v: string) {
  switch (v) {
    case 'verified-true': case 'ok':  return ShieldCheck
    case 'verified-false':            return ShieldX
    case 'inconclusive':              return ShieldAlert
    case 'pending':
    default:                          return Loader2
  }
}
