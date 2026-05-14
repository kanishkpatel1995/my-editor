import { useEffect, useRef, useState } from 'react'
import { Check, X, Wand2, Sparkles } from 'lucide-react'
import { Button } from '../ui/Button'
import { useAnvilStore } from '../../store/anvilStore'
import type { Editor as TipTapEditor } from '@tiptap/react'
import { replaceSpan } from '../../lib/anvil-tiptap-decorations'
import type { AnvilAnnotationClickDetail } from '../../lib/anvil-tiptap-decorations'
import { toast } from 'sonner'

interface Props {
  editor: TipTapEditor | null
}

/**
 * Floating popover anchored to a clicked ANVIL strikethrough in the editor.
 * Three actions:
 *   - Apply  → replaces the span with the parsed `suggestion` (if any) and
 *              marks the annotation accepted; decoration disappears.
 *   - Reject → leaves the span; marks rejected; decoration disappears.
 *   - Rewrite with AI → opens an inline prompt; user types instruction;
 *              we ask the explainer model for a replacement and apply it.
 */
export function AnvilCommentPopover({ editor }: Props) {
  const session = useAnvilStore((s) => s.session)
  const setDecision = useAnvilStore((s) => s.setAnnotationDecision)
  const rewriteSpan = useAnvilStore((s) => s.rewriteSpan)

  const [activeId, setActiveId] = useState<string | null>(null)
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)
  const [rewriteMode, setRewriteMode] = useState(false)
  const [rewriteInstruction, setRewriteInstruction] = useState('')
  const [rewriting, setRewriting] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Listen for strikethrough clicks dispatched by the Tiptap plugin.
  useEffect(() => {
    const onClick = (e: Event) => {
      const detail = (e as CustomEvent<AnvilAnnotationClickDetail>).detail
      if (!detail?.id) return
      setActiveId(detail.id)
      // Position popover just below the clicked span.
      setAnchor({ x: detail.rect.x, y: detail.rect.y + detail.rect.height + 6 })
      setRewriteMode(false)
      setRewriteInstruction('')
    }
    window.addEventListener('anvil:annotation-click', onClick)
    return () => window.removeEventListener('anvil:annotation-click', onClick)
  }, [])

  // Dismiss on outside click / Esc.
  useEffect(() => {
    if (!activeId) return
    const onDoc = (e: MouseEvent) => {
      if (!popoverRef.current) return
      if (popoverRef.current.contains(e.target as Node)) return
      const tgt = e.target as HTMLElement
      if (tgt.closest('.anvil-strike')) return
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

  // Find the live annotation (may have just been deleted by a re-parse).
  let annotation: import('../../types').AnvilAnnotation | undefined
  let paragraphText = ''
  for (const p of session.paragraphs) {
    const a = p.annotations.find((x) => x.id === activeId)
    if (a) {
      annotation = a
      paragraphText = p.text
      break
    }
  }
  if (!annotation) return null

  const apply = async () => {
    if (!editor) return
    if (!annotation.suggestion) {
      toast.message('No clean replacement extracted — use "Rewrite with AI" to instruct the edit.')
      return
    }
    const ok = replaceSpan(editor.view, annotation.span, annotation.suggestion)
    if (!ok) {
      toast.error("Couldn't find that span in the editor — text may have changed.")
      return
    }
    await setDecision(activeId, 'accepted')
    setActiveId(null)
    toast.success('Suggestion applied.')
  }

  const reject = async () => {
    await setDecision(activeId, 'rejected')
    setActiveId(null)
  }

  const submitRewrite = async () => {
    if (!editor) return
    if (!rewriteInstruction.trim()) return
    setRewriting(true)
    try {
      const replacement = await rewriteSpan(annotation.span, rewriteInstruction, paragraphText)
      if (!replacement) {
        toast.error('AI returned an empty replacement.')
        return
      }
      const ok = replaceSpan(editor.view, annotation.span, replacement)
      if (!ok) {
        toast.error("Couldn't find that span in the editor — text may have changed.")
        return
      }
      await setDecision(activeId, 'accepted')
      setActiveId(null)
      toast.success('Rewrite applied.')
    } catch (e) {
      toast.error('Rewrite failed: ' + (e as Error).message)
    } finally {
      setRewriting(false)
    }
  }

  // Clamp position to viewport so the popover never spills offscreen.
  const POPOVER_W = 360
  const left = Math.max(8, Math.min(anchor.x, window.innerWidth - POPOVER_W - 8))
  const top = Math.min(anchor.y, window.innerHeight - 240)

  return (
    <div
      ref={popoverRef}
      style={{ position: 'fixed', left, top, width: POPOVER_W, zIndex: 70 }}
      className="border border-ink bg-paper shadow-[var(--shadow-lift)] animate-fade-in"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-rule-soft bg-paper-2 px-2 py-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-vermilion">◌ Anvil note</span>
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
        <div className="mb-1 font-mono text-[10px] tracking-tight text-vermilion truncate" title={annotation.span}>
          &ldquo;{annotation.span || '(no span)'}&rdquo;
        </div>
        <div className="text-[12.5px] leading-snug text-ink">{annotation.note}</div>

        {annotation.suggestion ? (
          <div className="mt-2 border-l-2 border-moss bg-paper-2 px-2 py-1">
            <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-moss">Suggested</div>
            <div className="text-[12.5px] text-ink">{annotation.suggestion}</div>
          </div>
        ) : null}
      </div>

      {!rewriteMode ? (
        <div className="flex items-center gap-1 border-t border-rule-soft px-2 py-1.5">
          <Button
            variant="primary"
            size="sm"
            leading={<Check size={11} />}
            onClick={apply}
            disabled={!annotation.suggestion}
            title={annotation.suggestion ? 'Replace span with suggestion' : 'No suggestion to apply — use rewrite'}
          >
            Apply
          </Button>
          <Button
            variant="ghost"
            size="sm"
            leading={<X size={11} />}
            onClick={reject}
            title="Dismiss this annotation (text unchanged)"
          >
            Reject
          </Button>
          <Button
            variant="ghost"
            size="sm"
            leading={<Wand2 size={11} />}
            onClick={() => setRewriteMode(true)}
            title="Tell the AI how to rewrite this span"
          >
            Rewrite
          </Button>
        </div>
      ) : (
        <div className="border-t border-rule-soft px-2 py-1.5">
          <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.12em] text-mute">
            ✎ How should this span be rewritten?
          </div>
          <textarea
            value={rewriteInstruction}
            onChange={(e) => setRewriteInstruction(e.target.value)}
            rows={2}
            placeholder="e.g. drop the 'every' over-claim and hedge to 'most'"
            className="thin-scroll w-full resize-none border border-rule-soft bg-paper px-2 py-1 text-[12px] leading-snug text-ink outline-none placeholder:text-mute focus:border-ink"
            autoFocus
          />
          <div className="mt-1 flex gap-1">
            <Button
              variant="primary"
              size="sm"
              leading={<Sparkles size={11} />}
              onClick={() => void submitRewrite()}
              disabled={!rewriteInstruction.trim() || rewriting}
            >
              {rewriting ? 'Rewriting…' : 'Submit'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setRewriteMode(false); setRewriteInstruction('') }}
              disabled={rewriting}
            >
              cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
