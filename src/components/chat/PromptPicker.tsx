import { useEffect, useRef, useState } from 'react'
import { ChevronDown, FileText, Sparkles, BookOpen, Image as ImageIcon } from 'lucide-react'
import { useArticleStore } from '../../store/articleStore'
import { useChatStore } from '../../store/chatStore'
import { isImageCapable } from '../../lib/openrouter'
import { composePromptInput } from '../../lib/prompts'
import { cn } from '../../lib/cn'
import type { PromptDef } from '../../types'

interface Props {
  /** Pre-fill the chat input with the composed prompt + (optional) article body. */
  onPrefill: (text: string) => void
}

export function PromptPicker({ onPrefill }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  const prompts = useArticleStore((s) => s.prompts)
  const loadPromptsIfStale = useArticleStore((s) => s.loadPromptsIfStale)
  const current = useArticleStore((s) => s.current)
  const currentText = useArticleStore((s) => s.currentText)
  const setMode = useChatStore((s) => s.setMode)
  const setModel = useChatStore((s) => s.setModel)
  const models = useChatStore((s) => s.models)
  const config = useChatStore((s) => s.config)
  const activeThreadId = useChatStore((s) => s.activeThreadId)
  const threads = useChatStore((s) => s.threads)
  const activeThread = threads.find((t) => t.id === activeThreadId)

  // Per-prompt user override of the auto-decided "append article" toggle (sticky for session)
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (open) void loadPromptsIfStale()
  }, [open, loadPromptsIfStale])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const choose = (p: PromptDef) => {
    const append = overrides[p.id] ?? p.expectsArticleContext
    const composed = composePromptInput({
      prompt: p,
      articleBody: append ? currentText : undefined,
      articleSlug: current?.slug,
      appendArticle: append && !!current,
    })
    onPrefill(composed)

    // If image prompt and we're not in image mode, switch — and pick an image-capable model
    if (p.kind === 'image' && activeThread?.mode !== 'image') {
      setMode('image')
      const haveImage = models.some((m) => m.id === activeThread?.model && isImageCapable(m))
      if (!haveImage && config?.defaultImageModel) setModel(config.defaultImageModel)
    }
    setOpen(false)
  }

  const toggleOverride = (pid: string, def: boolean) =>
    setOverrides((s) => ({ ...s, [pid]: !(s[pid] ?? def) }))

  const text = prompts.filter((p) => p.kind === 'text')
  const image = prompts.filter((p) => p.kind === 'image')

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex h-7 items-center gap-1 border bg-paper px-2 font-mono text-[11px] tracking-tight text-ink-soft transition-colors duration-150',
          open ? 'border-ink text-ink' : 'border-rule-soft hover:border-ink hover:text-ink',
        )}
        title="Reusable prompts"
      >
        <FileText size={11} />
        <span>Prompt</span>
        <ChevronDown size={11} className={cn('transition-transform duration-150', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="animate-fade-in absolute right-0 z-50 mt-1 w-[26rem] max-w-[90vw] border border-ink bg-paper shadow-[var(--shadow-lift)]">
          <div className="border-b border-rule-soft px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-mute">
            Reusable prompts · {prompts.length}/7
          </div>
          {prompts.length === 0 ? (
            <div className="p-4 text-center font-mono text-[11px] text-mute">
              Pick the Writing-Workflow folder to load your prompts.
            </div>
          ) : (
            <div className="thin-scroll max-h-[24rem] overflow-y-auto">
              <Section title="Text" icon={<BookOpen size={11} />}>
                {text.map((p) => (
                  <Row
                    key={p.id}
                    p={p}
                    appendOverride={overrides[p.id]}
                    onToggleAppend={() => toggleOverride(p.id, p.expectsArticleContext)}
                    onPick={() => choose(p)}
                    hasArticle={!!current}
                  />
                ))}
              </Section>
              <Section title="Image" icon={<ImageIcon size={11} />}>
                {image.map((p) => (
                  <Row
                    key={p.id}
                    p={p}
                    appendOverride={overrides[p.id]}
                    onToggleAppend={() => toggleOverride(p.id, p.expectsArticleContext)}
                    onPick={() => choose(p)}
                    hasArticle={!!current}
                  />
                ))}
              </Section>
            </div>
          )}
          <div className="border-t border-rule-soft px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-mute">
            ↵ load into input · ⌘+enter to send
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center gap-1.5 border-y border-rule-soft bg-paper-2 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
        {icon}
        <span>{title}</span>
      </div>
      {children}
    </div>
  )
}

function Row({
  p, appendOverride, onToggleAppend, onPick, hasArticle,
}: {
  p: PromptDef
  appendOverride: boolean | undefined
  onToggleAppend: () => void
  onPick: () => void
  hasArticle: boolean
}) {
  const willAppend = (appendOverride ?? p.expectsArticleContext) && hasArticle
  return (
    <div className="group flex items-stretch gap-1 border-b border-rule-soft px-2 py-1.5 hover:bg-paper-2">
      <button
        type="button"
        onClick={onPick}
        className="flex flex-1 flex-col items-start gap-0.5 text-left"
      >
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] tracking-[0.06em] text-mute">
            {String(p.index).padStart(2, '0')}
          </span>
          <span className="text-[12px] tracking-tight text-ink">{p.title}</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-mute">
            v{(p.filename.match(/v(\d+)/i)?.[1]) ?? '?'}
          </span>
          {p.id === '03-diagram' ? (
            <span className="ml-1 inline-flex items-center gap-0.5 border border-vermilion px-1 py-px font-mono text-[9px] uppercase tracking-[0.08em] text-vermilion">
              <Sparkles size={9} /> branded
            </span>
          ) : null}
        </div>
        <div className="font-mono text-[10px] tracking-[0.04em] text-mute">
          {willAppend ? '+ article context' : 'standalone'}
        </div>
      </button>
      <button
        type="button"
        onClick={onToggleAppend}
        title="Toggle append article context"
        className={cn(
          'shrink-0 self-center border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] transition-colors duration-150',
          willAppend
            ? 'border-vermilion bg-vermilion-tint text-vermilion'
            : 'border-rule-soft text-mute hover:border-ink hover:text-ink',
        )}
        disabled={!hasArticle}
      >
        ctx
      </button>
    </div>
  )
}
