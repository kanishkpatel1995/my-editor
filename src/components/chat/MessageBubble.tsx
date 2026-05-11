import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Copy, ArrowDownToLine, Wrench, Braces, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import type { ChatMessageT } from '../../types'
import { toast } from 'sonner'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { parseAssistantContent, prettyJson } from '../../lib/parse-assistant'
import { ThinkingBlock } from './ThinkingBlock'
import { AttachmentThumb } from './AttachmentThumb'

interface Props {
  message: ChatMessageT
  onInsertText?: (markdown: string) => void
  isStreaming?: boolean
  onSwitchModel?: () => void
  /** Used by AttachmentThumb to read attached files off disk. */
  threadDir?: FileSystemDirectoryHandle
  onOpenLightbox?: (url: string) => void
}

export function MessageBubble({ message, onInsertText, isStreaming, onSwitchModel, threadDir, onOpenLightbox }: Props) {
  const isUser = message.role === 'user'
  const [collapsed, setCollapsed] = useState<boolean>(!!message.collapsedDefault)

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text)
    toast.success('Copied markdown')
  }

  return (
    <article className="animate-stamp-in border-b border-rule-soft px-3 py-3 last:border-b-0">
      <header className="mb-1.5 flex items-baseline gap-2">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink">
          {isUser ? 'You' : (message.model ? message.model.split('/').pop() : 'Assistant')}
        </span>
        {message.timestamp ? (
          <span className="font-mono text-[10px] tracking-[0.06em] text-mute">{message.timestamp}</span>
        ) : null}
      </header>

      {isUser ? (
        <>
          {message.attachments?.length ? (
            <AttachmentThumb
              attachments={message.attachments}
              threadDir={threadDir}
              onOpenLightbox={onOpenLightbox}
            />
          ) : null}
          {message.collapsedDefault ? (
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className="mb-1 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.08em] text-mute hover:text-ink"
            >
              {collapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
              <span>{collapsed ? 'Refined prompt · click to expand' : 'Refined prompt · click to collapse'}</span>
            </button>
          ) : null}
          {!collapsed ? (
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">{message.content}</div>
          ) : null}
        </>
      ) : (
        <>
          {message.reasoning ? (
            <ThinkingBlock
              reasoning={message.reasoning}
              collapsed={message.reasoningCollapsed}
              durationMs={message.reasoningDurationMs}
              isStreaming={!!isStreaming}
              hasContent={!!message.content}
            />
          ) : null}
          <AssistantBody
            content={message.content}
            isStreaming={!!isStreaming}
            hasReasoning={!!message.reasoning}
            onSwitchModel={onSwitchModel}
          />
        </>
      )}

      {!isUser && message.content && !isStreaming ? (
        <div className="mt-2 flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => copy(message.content)}
            leading={<Copy size={11} />}
          >
            Copy MD
          </Button>
          {onInsertText ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onInsertText(message.content)}
              leading={<ArrowDownToLine size={11} />}
            >
              Insert into article
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

function AssistantBody({
  content,
  isStreaming,
  hasReasoning,
  onSwitchModel,
}: {
  content: string
  isStreaming: boolean
  hasReasoning?: boolean
  onSwitchModel?: () => void
}) {
  // While streaming, always render as plain text with a blinking cursor at the edge.
  if (isStreaming) {
    if (!content) {
      // Reasoning is taking the focal slot; show nothing here so the thinking block speaks.
      return hasReasoning ? null : (
        <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-mute">
          waiting…
        </div>
      )
    }
    return (
      <div className="text-sm leading-relaxed text-ink">
        <span className="whitespace-pre-wrap">{content}</span>
        <span className="cursor-bar animate-cursor-blink" aria-hidden />
      </div>
    )
  }

  if (!content.trim()) {
    return hasReasoning
      ? null
      : <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-mute">(empty response)</div>
  }

  const parsed = parseAssistantContent(content)

  if (parsed.kind === 'error') {
    return (
      <Callout
        tone="error"
        title={parsed.code ? `Error · ${parsed.code}` : 'Error'}
        icon={<AlertTriangle size={11} />}
        action={
          onSwitchModel ? (
            <Button variant="primary" size="sm" onClick={onSwitchModel}>Switch model</Button>
          ) : null
        }
      >
        <p className="text-sm leading-snug text-ink">{parsed.message}</p>
      </Callout>
    )
  }

  if (parsed.kind === 'tool_call') {
    return (
      <Callout
        tone="accent"
        title={`Tool call · ${parsed.action}`}
        icon={<Wrench size={11} />}
        collapsible
        defaultOpen
      >
        <pre className="overflow-x-auto whitespace-pre-wrap break-words border border-rule-soft bg-paper-2 p-2 font-mono text-[11px] leading-relaxed text-ink">
{prettyJson(parsed.input)}
        </pre>
      </Callout>
    )
  }

  if (parsed.kind === 'json') {
    return (
      <Callout
        tone="ink"
        title="Structured output"
        icon={<Braces size={11} />}
        collapsible
        defaultOpen
      >
        <pre className="overflow-x-auto whitespace-pre-wrap break-words border border-rule-soft bg-paper-2 p-2 font-mono text-[11px] leading-relaxed text-ink">
{prettyJson(parsed.value)}
        </pre>
      </Callout>
    )
  }

  // Default: render markdown
  return (
    <div className="prose-foundry text-sm leading-relaxed text-ink">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}
