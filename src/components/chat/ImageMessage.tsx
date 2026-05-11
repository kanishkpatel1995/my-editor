import { Copy, Maximize2, RefreshCw, ArrowDownToLine, Download, AlertTriangle, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import type { ChatMessageT, ChatThread } from '../../types'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { parseAssistantContent } from '../../lib/parse-assistant'

interface Props {
  message: ChatMessageT
  imageURLs: Record<string, string>
  thread: ChatThread
  isStreaming?: boolean
  previousUserPrompt?: string
  onInsertImage?: (relPath: string, alt: string) => void
  onRegenerate?: (preFill: string) => void
  onSaveLocal?: (relPath: string) => void
  onOpenLightbox?: (url: string) => void
  onSwitchToImageModel?: () => void
  onReviewRegenerate?: (relPath: string) => void
}

export function ImageMessage({
  message, imageURLs, thread, isStreaming,
  previousUserPrompt, onInsertImage, onRegenerate, onSaveLocal, onOpenLightbox,
  onSwitchToImageModel, onReviewRegenerate,
}: Props) {
  const images = message.images || []

  const copyMd = async (relPath: string) => {
    await navigator.clipboard.writeText(`![](${relPath})`)
    toast.success('Copied image markdown')
  }

  // Detect "model returned text instead of image" failure mode
  const parsed = (!isStreaming && images.length === 0 && message.content)
    ? parseAssistantContent(message.content)
    : null
  const wrongModel = parsed && (parsed.kind === 'tool_call' || parsed.kind === 'json' || parsed.kind === 'error')

  return (
    <article className="animate-stamp-in border-b border-rule-soft px-3 py-3 last:border-b-0">
      <header className="mb-1.5 flex items-baseline gap-2">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink">
          {message.model ? message.model.split('/').pop() : 'Assistant'}
        </span>
        {message.timestamp ? (
          <span className="font-mono text-[10px] tracking-[0.06em] text-mute">{message.timestamp}</span>
        ) : null}
      </header>

      {/* Skeleton while we wait */}
      {isStreaming && images.length === 0 ? (
        <div className="space-y-2">
          <div className="animate-shimmer relative aspect-[4/3] w-full overflow-hidden border border-rule-soft bg-paper-2">
            <div className="absolute inset-0 flex items-center justify-center font-mono text-[10px] uppercase tracking-[0.12em] text-mute">
              developing…
            </div>
            {/* Registration marks at corners */}
            <span className="absolute left-2 top-2 h-2 w-2 border-l border-t border-vermilion" />
            <span className="absolute right-2 top-2 h-2 w-2 border-r border-t border-vermilion" />
            <span className="absolute bottom-2 left-2 h-2 w-2 border-b border-l border-vermilion" />
            <span className="absolute bottom-2 right-2 h-2 w-2 border-b border-r border-vermilion" />
          </div>
          <div className="hairline animate-rule-grow" />
        </div>
      ) : null}

      {/* Wrong-model fallback */}
      {!isStreaming && wrongModel && parsed ? (
        <Callout
          tone="warn"
          title="No image returned"
          icon={<AlertTriangle size={11} />}
          action={
            onSwitchToImageModel ? (
              <Button variant="primary" size="sm" onClick={onSwitchToImageModel}>
                Use image model
              </Button>
            ) : null
          }
        >
          <p className="text-sm leading-snug text-ink">
            <code className="font-mono text-[11px] text-ink-soft">{thread.model}</code> replied with{' '}
            {parsed.kind === 'error' ? 'an error' : parsed.kind === 'tool_call' ? 'a tool-call payload' : 'JSON'} instead of an image.
            Switch to an image-capable model and try again.
          </p>
        </Callout>
      ) : null}

      {/* Optional preamble text */}
      {!wrongModel && message.content && !isStreaming ? (
        <div className="mb-2 whitespace-pre-wrap text-sm text-ink-soft">{message.content}</div>
      ) : null}

      {/* Images */}
      {images.map((rel, idx) => {
        const src = imageURLs[rel]
        if (!src) return null
        return (
          <figure key={rel} className="animate-stamp-in mb-2 last:mb-0">
            <div className="group relative">
              <img
                src={src}
                alt=""
                loading="lazy"
                draggable
                onDragStart={(e) => {
                  const payload = JSON.stringify({ threadId: thread.id, relPath: rel })
                  e.dataTransfer.setData('application/x-myeditor-image', payload)
                  e.dataTransfer.setData('text/uri-list', src)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                onClick={() => onOpenLightbox?.(src)}
                className="block w-full cursor-grab border border-rule-soft transition-[box-shadow,transform] duration-150 hover:shadow-[var(--shadow-press)] active:cursor-grabbing"
                title="Click to enlarge · drag onto the article to insert"
              />
              <button
                type="button"
                onClick={() => onOpenLightbox?.(src)}
                title="Open full size"
                className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center bg-ink/80 text-paper opacity-0 transition-opacity duration-150 hover:bg-ink group-hover:opacity-100"
              >
                <Maximize2 size={11} />
              </button>
              <span className="absolute -bottom-px left-2 font-mono text-[10px] uppercase tracking-[0.08em] text-mute">
                #{String(idx + 1).padStart(2, '0')}
              </span>
            </div>
            <div className="hairline animate-rule-grow mt-1" />
            <figcaption className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Button variant="ghost" size="sm" leading={<Download size={11} />} onClick={() => onSaveLocal?.(rel)}>
                Save
              </Button>
              {onRegenerate && previousUserPrompt ? (
                <Button
                  variant="ghost"
                  size="sm"
                  leading={<RefreshCw size={11} />}
                  onClick={() => onRegenerate(previousUserPrompt)}
                >
                  Regenerate w/ tweak
                </Button>
              ) : null}
              {onInsertImage ? (
                <Button
                  variant="ghost"
                  size="sm"
                  leading={<ArrowDownToLine size={11} />}
                  onClick={() => onInsertImage(rel, '')}
                >
                  Insert into article
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" leading={<Copy size={11} />} onClick={() => copyMd(rel)}>
                Copy MD
              </Button>
              {onReviewRegenerate ? (
                <Button
                  variant="ghost"
                  size="sm"
                  leading={<Sparkles size={11} />}
                  onClick={() => onReviewRegenerate(rel)}
                  title="Critique this image against the prompt, then regenerate"
                  className="border border-vermilion text-vermilion hover:bg-vermilion-tint"
                >
                  Review & regen
                </Button>
              ) : null}
            </figcaption>
          </figure>
        )
      })}
    </article>
  )
}
