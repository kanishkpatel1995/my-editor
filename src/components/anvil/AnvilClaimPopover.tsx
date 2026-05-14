import { useEffect, useRef, useState } from 'react'
import { Search, Check, X, ExternalLink, AlertTriangle } from 'lucide-react'
import { Button } from '../ui/Button'
import { useAnvilStore } from '../../store/anvilStore'
import type { AnvilAnnotationClickDetail } from '../../lib/anvil-tiptap-decorations'

/**
 * Floating popover anchored to a clicked ANVIL claim decoration. Lets the
 * user kick off a web-search verification of the claim, or mark it OK
 * manually (no API call).
 */
export function AnvilClaimPopover() {
  const session = useAnvilStore((s) => s.session)
  const verifyClaim = useAnvilStore((s) => s.verifyClaim)
  const markClaimOk = useAnvilStore((s) => s.markClaimOk)

  const [activeId, setActiveId] = useState<string | null>(null)
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: Event) => {
      const detail = (e as CustomEvent<AnvilAnnotationClickDetail>).detail
      if (!detail?.id) return
      setActiveId(detail.id)
      setAnchor({ x: detail.rect.x, y: detail.rect.y + detail.rect.height + 6 })
    }
    window.addEventListener('anvil:claim-click', onClick)
    return () => window.removeEventListener('anvil:claim-click', onClick)
  }, [])

  useEffect(() => {
    if (!activeId) return
    const onDoc = (e: MouseEvent) => {
      if (!popoverRef.current) return
      if (popoverRef.current.contains(e.target as Node)) return
      const tgt = e.target as HTMLElement
      if (tgt.closest('.anvil-claim')) return
      setActiveId(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveId(null)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [activeId])

  if (!activeId || !anchor || !session) return null

  let claim: import('../../types').AnvilClaim | undefined
  for (const p of session.paragraphs) {
    const c = p.claims.find((x) => x.id === activeId)
    if (c) { claim = c; break }
  }
  if (!claim) return null

  const isVerifying = claim.verdict === 'pending'
  const wasVerified = claim.verdict === 'verified-true' || claim.verdict === 'verified-false' || claim.verdict === 'inconclusive' || claim.verdict === 'ok'

  const POPOVER_W = 380
  const left = Math.max(8, Math.min(anchor.x, window.innerWidth - POPOVER_W - 8))
  const top = Math.min(anchor.y, window.innerHeight - 320)

  const verdictLabel = (() => {
    switch (claim.verdict) {
      case 'verified-true':  return { text: 'TRUE',         tone: 'text-moss border-moss bg-paper-2' }
      case 'verified-false': return { text: 'FALSE',        tone: 'text-vermilion border-vermilion bg-vermilion-tint' }
      case 'inconclusive':   return { text: 'INCONCLUSIVE', tone: 'text-goldenrod border-goldenrod bg-paper-2' }
      case 'ok':             return { text: 'OK · manual',  tone: 'text-moss border-moss bg-paper-2' }
      case 'pending':        return { text: 'verifying…',   tone: 'text-goldenrod border-goldenrod bg-paper-2 animate-pulse' }
      case 'verify':
      default:               return { text: 'pending verify', tone: 'text-mute border-rule-soft bg-paper-2' }
    }
  })()

  return (
    <div
      ref={popoverRef}
      style={{ position: 'fixed', left, top, width: POPOVER_W, zIndex: 70 }}
      className="border border-ink bg-paper shadow-[var(--shadow-lift)] animate-fade-in"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-rule-soft bg-paper-2 px-2 py-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-goldenrod">◌ Anvil claim</span>
        <button
          type="button"
          onClick={() => setActiveId(null)}
          className="inline-flex h-5 w-5 items-center justify-center text-mute hover:text-ink"
          title="Close"
        >
          <X size={11} />
        </button>
      </div>

      <div className="px-3 py-2">
        <div className="text-[13px] leading-snug text-ink">&ldquo;{claim.text}&rdquo;</div>
        <div className={'mt-2 inline-flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-tight ' + verdictLabel.tone}>
          {verdictLabel.text}
          {claim.confidence ? <span className="text-mute"> · {claim.confidence}</span> : null}
        </div>

        {wasVerified && claim.explanation ? (
          <div className="mt-2 border-l-2 border-rule-soft pl-2 text-[12.5px] leading-snug text-ink-soft">
            {claim.explanation}
          </div>
        ) : null}

        {wasVerified && claim.sources && claim.sources.length ? (
          <div className="mt-2">
            <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-mute">Sources</div>
            <ul className="mt-1 space-y-0.5">
              {claim.sources.map((url, i) => (
                <li key={i}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 text-[11.5px] text-vermilion hover:underline"
                  >
                    <ExternalLink size={9} />
                    <span className="truncate max-w-[34ch]">{url}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-1 border-t border-rule-soft px-2 py-1.5">
        <Button
          variant="primary"
          size="sm"
          leading={<Search size={11} />}
          onClick={() => void verifyClaim(activeId)}
          disabled={isVerifying}
          title={`Run web-search verification via ${session.verifierModel} (~$0.002)`}
        >
          {isVerifying ? 'Verifying…' : (wasVerified ? 'Re-verify' : 'Verify on web')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          leading={<Check size={11} />}
          onClick={() => void markClaimOk(activeId)}
          disabled={isVerifying || claim.verdict === 'ok'}
          title="Skip web verification — assert this claim is correct"
        >
          Mark OK
        </Button>
        {claim.verdict === 'verified-false' ? (
          <Button
            variant="ghost"
            size="sm"
            leading={<AlertTriangle size={11} />}
            disabled
            title="To-do: 'Accept verdict & strike claim' (v1.1)"
            className="text-vermilion ml-auto"
          >
            FALSE
          </Button>
        ) : null}
      </div>
    </div>
  )
}
