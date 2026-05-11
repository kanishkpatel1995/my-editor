import { useEffect, useRef, useState } from 'react'
import { useChatStore } from '../../store/chatStore'
import { ChatInput } from './ChatInput'
import { MessageBubble } from './MessageBubble'
import { ImageMessage } from './ImageMessage'
import { ImageLightbox } from './ImageLightbox'
import { ModeToggle } from './ModeToggle'
import { ModelPicker } from './ModelPicker'
import { TokenCostBar } from './TokenCostBar'
import { PromptPicker } from './PromptPicker'
import { WebSearchToggle } from './WebSearchToggle'
import { QuickRecipes } from './QuickRecipes'
import { Callout } from '../ui/Callout'
import { Button } from '../ui/Button'
import { ResizeGutter } from '../ui/ResizeGutter'
import { useResizable } from '../../hooks/useResizable'
import { AlertTriangle, ArrowDown } from 'lucide-react'
import { isVisionCapable, isFileCapable } from '../../lib/openrouter'
import type { ChatMessageT, ChatThread } from '../../types'

const INPUT_DEFAULT = 96
const INPUT_MIN = 64
const INPUT_MAX_FRACTION = 0.6
const INPUT_HARD_MAX = 500

interface Props {
  thread: ChatThread
  onInsertText?: (markdown: string) => void
  onInsertImage?: (relPath: string, alt: string, threadDir: FileSystemDirectoryHandle) => void
  onSaveImage?: (relPath: string, threadDir: FileSystemDirectoryHandle) => void
}

const EMPTY_URLS: Record<string, string> = Object.freeze({})

export function ThreadView({ thread, onInsertText, onInsertImage, onSaveImage }: Props) {
  const isGenerating = useChatStore((s) => s.isGenerating)
  const setMode = useChatStore((s) => s.setMode)
  const sendMessage = useChatStore((s) => s.sendMessage)
  const stopStream = useChatStore((s) => s.stopStream)
  const imageURLs = useChatStore((s) => s.imageURLs[thread.id]) ?? EMPTY_URLS
  const config = useChatStore((s) => s.config)
  const lastModelError = useChatStore((s) => s.lastModelError)
  const clearModelError = useChatStore((s) => s.clearModelError)
  const openPicker = useChatStore((s) => s.openPicker)
  const setModel = useChatStore((s) => s.setModel)
  const webSearch = useChatStore((s) => s.webSearchByThread[thread.id]) ?? false
  const setWebSearch = useChatStore((s) => s.setWebSearch)

  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [draftPrefill, setDraftPrefill] = useState('')
  const [showJumpPill, setShowJumpPill] = useState(false)

  const models = useChatStore((s) => s.models)
  const reviewAndRegenerate = useChatStore((s) => s.reviewAndRegenerate)
  const currentModelMeta = models.find((m) => m.id === thread.model)
  const canSendImages = currentModelMeta ? isVisionCapable(currentModelMeta) : true
  const canSendFiles = currentModelMeta ? isFileCapable(currentModelMeta) : true

  const inputResizer = useResizable({
    axis: 'y',
    initial: INPUT_DEFAULT,
    min: INPUT_MIN,
    max: () => Math.min(window.innerHeight * INPUT_MAX_FRACTION, INPUT_HARD_MAX),
    storageKey: 'myeditor.chat.inputHeight',
    inverted: true,
  })

  // Listen for global "chat:prefill" events (fired by toolbar Companions / drag drops)
  useEffect(() => {
    const onPrefill = (e: Event) => {
      const detail = (e as CustomEvent<{ text?: string }>).detail
      if (detail?.text) setDraftPrefill(detail.text)
    }
    window.addEventListener('chat:prefill', onPrefill)
    return () => window.removeEventListener('chat:prefill', onPrefill)
  }, [])

  // Smart auto-scroll: follow the stream only when the user is already pinned
  // to the bottom. If they've scrolled up to read history, leave them alone.
  // Switching threads always snaps to bottom; a new user-sent message also does.
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const stickToBottomRef = useRef(true)
  const lastThreadIdRef = useRef(thread.id)
  const lastMsgCountRef = useRef(thread.messages.length)
  const lastUserCountRef = useRef(thread.messages.filter((m) => m.role === 'user').length)

  // Track whether the user is "near the bottom" (within 80 px). Updated on every
  // scroll. The threshold is generous enough that a near-bottom user reading a
  // tall image still counts as pinned.
  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop
    const nearBottom = distanceFromBottom <= 80
    stickToBottomRef.current = nearBottom
    setShowJumpPill(!nearBottom)
  }

  const jumpToLatest = () => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    stickToBottomRef.current = true
    setShowJumpPill(false)
  }

  // Extract the scroll-relevant signals into primitives so the effect's deps
  // are tight: a model swap (which only mutates `thread.model`) doesn't trigger
  // a re-run, while a real message change does.
  const threadId = thread.id
  const msgCount = thread.messages.length
  const lastMsg = thread.messages.at(-1)
  const lastContent = lastMsg?.content
  const lastImagesLen = lastMsg?.images?.length
  const lastReasoning = lastMsg?.reasoning
  const userCount = thread.messages.reduce((n, m) => n + (m.role === 'user' ? 1 : 0), 0)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    // Thread switch → unconditional snap.
    if (lastThreadIdRef.current !== threadId) {
      lastThreadIdRef.current = threadId
      stickToBottomRef.current = true
      el.scrollTop = el.scrollHeight
      lastMsgCountRef.current = msgCount
      lastUserCountRef.current = userCount
      setShowJumpPill(false)
      return
    }

    // New user-sent message → always snap (you just hit Send, you want to see it).
    if (userCount > lastUserCountRef.current) {
      stickToBottomRef.current = true
      el.scrollTop = el.scrollHeight
      lastMsgCountRef.current = msgCount
      lastUserCountRef.current = userCount
      setShowJumpPill(false)
      return
    }
    lastMsgCountRef.current = msgCount
    lastUserCountRef.current = userCount

    // Otherwise (streaming deltas, image arrival, reasoning ticks): follow only
    // if the user was at the bottom before this update.
    if (stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [threadId, msgCount, userCount, lastContent, lastImagesLen, lastReasoning])

  const prevUserBefore = (idx: number): string => {
    for (let i = idx - 1; i >= 0; i--) {
      if (thread.messages[i].role === 'user') return thread.messages[i].content
    }
    return ''
  }

  return (
    <div className="flex h-full flex-col">
      {/* Row 1: Mode, Model, Prompt, Web search */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-rule-soft px-3 py-2">
        <ModeToggle mode={thread.mode} onChange={setMode} />
        <ModelPicker mode={thread.mode} />
        <div className="ml-auto flex items-center gap-1.5">
          <PromptPicker onPrefill={(t) => setDraftPrefill(t)} />
          <WebSearchToggle active={webSearch} onToggle={() => setWebSearch(thread.id, !webSearch)} />
        </div>
      </div>

      {/* Row 2: Quick recipes */}
      <QuickRecipes
        onPrefill={(t) => setDraftPrefill(t)}
        onWebToggle={(on) => setWebSearch(thread.id, on)}
      />

      {/* Last-call routing error */}
      {lastModelError ? (
        <div className="px-3 pt-3">
          <Callout
            tone="error"
            title="Model unreachable"
            icon={<AlertTriangle size={11} />}
            action={
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  clearModelError()
                  openPicker()
                }}
              >
                Switch model
              </Button>
            }
          >
            <p className="font-mono text-[11px] leading-snug text-ink-soft">
              <code className="text-ink">{lastModelError.model}</code> · {lastModelError.message}
            </p>
            {config?.defaultImageModel && thread.mode === 'image' && lastModelError.model !== config.defaultImageModel ? (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => {
                  setModel(config.defaultImageModel)
                  clearModelError()
                }}
              >
                Use default image model
              </Button>
            ) : null}
          </Callout>
        </div>
      ) : null}

      <div className="relative flex-1 min-h-0">
        {showJumpPill ? (
          <button
            type="button"
            onClick={jumpToLatest}
            title="Jump to latest"
            className="absolute bottom-2 right-3 z-20 inline-flex items-center gap-1 border border-vermilion bg-vermilion-tint px-1.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-vermilion shadow-[var(--shadow-lift)] hover:bg-vermilion hover:text-paper"
          >
            <ArrowDown size={10} />
            <span>Latest</span>
          </button>
        ) : null}
      <div ref={scrollRef} onScroll={onScroll} className="thin-scroll h-full overflow-y-auto">
        {thread.messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center animate-fade-in">
            <div className="label-eyebrow">{thread.mode === 'image' ? 'Image mode' : 'Text mode'}</div>
            <p className="max-w-[28ch] text-sm text-ink-soft">
              {thread.mode === 'image'
                ? 'Describe the image you want. First generation usually takes 5–10s.'
                : 'Ask anything. ⌘ + Enter to send.'}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-mute">
              tip: try <span className="text-ink-soft">📝 Prompt</span> or a quick recipe
            </p>
          </div>
        ) : (
          thread.messages.map((m: ChatMessageT, i) => {
            const last = i === thread.messages.length - 1
            const streaming = last && isGenerating && m.role === 'assistant'
            if (m.role === 'assistant' && (m.images?.length || (thread.mode === 'image' && !m.content && !streaming))) {
              return (
                <ImageMessage
                  key={i}
                  message={m}
                  imageURLs={imageURLs}
                  isStreaming={streaming}
                  thread={thread}
                  previousUserPrompt={prevUserBefore(i)}
                  onInsertImage={
                    onInsertImage && thread.dirHandle
                      ? (rel, alt) => onInsertImage(rel, alt, thread.dirHandle!)
                      : undefined
                  }
                  onSaveLocal={
                    onSaveImage && thread.dirHandle
                      ? (rel) => onSaveImage(rel, thread.dirHandle!)
                      : undefined
                  }
                  onRegenerate={(prefill) => setDraftPrefill(prefill)}
                  onOpenLightbox={(url) => setLightboxSrc(url)}
                  onSwitchToImageModel={() => {
                    if (config?.defaultImageModel) setModel(config.defaultImageModel)
                  }}
                  onReviewRegenerate={(rel) => void reviewAndRegenerate(i, rel)}
                />
              )
            }
            if (m.role === 'assistant' && thread.mode === 'image' && streaming && !m.content && !m.images?.length) {
              return <ImageMessage key={i} message={m} imageURLs={imageURLs} isStreaming thread={thread} />
            }
            return (
              <MessageBubble
                key={i}
                message={m}
                onInsertText={onInsertText}
                isStreaming={streaming}
                onSwitchModel={() => openPicker()}
                threadDir={thread.dirHandle}
                onOpenLightbox={(url) => setLightboxSrc(url)}
              />
            )
          })
        )}
      </div>
      </div>

      <TokenCostBar
        usage={thread.usage}
        costWarnUsd={config?.threadCostWarnUsd || 1}
      />

      <ResizeGutter axis="y" label="Resize chat input" resizer={inputResizer} />

      <ChatInput
        isGenerating={isGenerating}
        initialValue={draftPrefill}
        onSend={(v, attachments) => {
          setDraftPrefill('')
          void sendMessage(v, { attachments })
        }}
        onStop={stopStream}
        webSearchActive={webSearch}
        height={inputResizer.size}
        canSendImages={canSendImages}
        canSendFiles={canSendFiles}
        placeholder={
          thread.mode === 'image'
            ? 'Describe the image (⌘ + Enter to send)'
            : 'Type a message… (⌘ + Enter to send)'
        }
      />

      <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
    </div>
  )
}
