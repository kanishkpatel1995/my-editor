import { useEffect, useRef, useState } from 'react'
import { Send, Square, Globe, AlertTriangle } from 'lucide-react'
import { Button } from '../ui/Button'
import { AttachButton } from './AttachButton'
import { AttachmentChips } from './AttachmentChips'
import {
  classifyFile, downscaleImageIfHuge, MAX_TOTAL_PAYLOAD_BYTES,
  type PendingAttachment,
} from '../../lib/attachments'

interface Props {
  isGenerating: boolean
  initialValue?: string
  onSend: (text: string, attachments: PendingAttachment[]) => void
  onStop: () => void
  placeholder?: string
  webSearchActive?: boolean
  /** Resolved textarea height in px. When provided, overrides the default sizing. */
  height?: number
  /** When the selected model can't see images, we disable sending with images. */
  canSendImages?: boolean
  /** When the selected model can't read files, we disable sending with PDFs. */
  canSendFiles?: boolean
}

export function ChatInput({
  isGenerating, initialValue = '', onSend, onStop, placeholder, webSearchActive, height,
  canSendImages = true, canSendFiles = true,
}: Props) {
  const [value, setValue] = useState(initialValue)
  const [focused, setFocused] = useState(false)
  const [attachments, setAttachments] = useState<PendingAttachment[]>([])
  const [dragOver, setDragOver] = useState(false)
  const ref = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (initialValue) {
      setValue(initialValue)
      ref.current?.focus()
      requestAnimationFrame(() => {
        if (ref.current) {
          ref.current.selectionStart = ref.current.selectionEnd = ref.current.value.length
        }
      })
    }
  }, [initialValue])

  // Cleanup object URLs on unmount or when chips change.
  useEffect(() => {
    return () => {
      for (const a of attachments) URL.revokeObjectURL(a.previewUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addFiles = async (files: FileList | File[]) => {
    const additions: PendingAttachment[] = []
    for (const file of Array.from(files)) {
      const kind = classifyFile(file)
      if (!kind) continue
      let workingFile = file
      let downscaled = false
      if (kind === 'image') {
        const result = await downscaleImageIfHuge(file)
        workingFile = result.file
        downscaled = result.downscaled
      }
      const previewUrl = URL.createObjectURL(workingFile)
      additions.push({ file: workingFile, kind, previewUrl, downscaled })
    }
    if (additions.length) setAttachments((prev) => [...prev, ...additions])
  }

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => {
      const toRemove = prev[idx]
      if (toRemove) URL.revokeObjectURL(toRemove.previewUrl)
      return prev.filter((_, i) => i !== idx)
    })
  }

  const totalBytes = attachments.reduce((n, a) => n + a.file.size, 0)
  const overSize = totalBytes > MAX_TOTAL_PAYLOAD_BYTES
  const hasImages = attachments.some((a) => a.kind === 'image')
  const hasFiles = attachments.some((a) => a.kind === 'pdf')
  const imageBlocked = hasImages && !canSendImages
  const fileBlocked = hasFiles && !canSendFiles
  const blockReason = overSize
    ? `Attachments total ${(totalBytes / 1024 / 1024).toFixed(1)} MB · max 15 MB. Remove some to send.`
    : imageBlocked
      ? 'Selected model can\'t read images — switch model or remove image attachments.'
      : fileBlocked
        ? 'Selected model can\'t read PDFs — switch model or remove the PDF.'
        : null

  const canSend = !isGenerating && (value.trim() || attachments.length) && !blockReason

  const submit = () => {
    if (!canSend) return
    const v = value.trim()
    onSend(v, attachments)
    setValue('')
    setAttachments([]) // object URLs revoked downstream once saved to disk
  }

  return (
    <div className="border-t border-rule px-2 py-2">
      <div
        className={
          'flex items-end gap-1.5 border bg-paper px-1.5 py-1 transition-shadow duration-150 ' +
          (dragOver
            ? 'border-vermilion shadow-[inset_0_0_0_1px_var(--color-vermilion)]'
            : focused
              ? 'border-ink shadow-[inset_0_0_0_1px_var(--color-ink)]'
              : 'border-rule-soft')
        }
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault()
            setDragOver(true)
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (e.dataTransfer.files.length) {
            e.preventDefault()
            setDragOver(false)
            void addFiles(e.dataTransfer.files)
          }
        }}
      >
        <div className="flex-1">
          <AttachmentChips items={attachments} onRemove={removeAttachment} />
          {blockReason ? (
            <div className="mb-1.5 inline-flex items-center gap-1 border border-vermilion bg-vermilion-tint px-1.5 py-1 font-mono text-[10px] text-vermilion">
              <AlertTriangle size={10} />
              <span>{blockReason}</span>
            </div>
          ) : null}
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault()
                submit()
              }
            }}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData?.files || [])
              if (files.length) {
                e.preventDefault()
                void addFiles(files)
              }
            }}
            rows={3}
            placeholder={placeholder || 'Type a message… (⌘ + Enter to send)'}
            className="w-full resize-none bg-transparent px-2 py-1 text-[13px] leading-relaxed text-ink outline-none placeholder:text-mute"
            style={height != null ? { height, minHeight: 64 } : { minHeight: 64 }}
            disabled={isGenerating}
          />
        </div>
        <div className="flex flex-col items-end gap-1 self-stretch py-px">
          {webSearchActive ? (
            <span
              title="Web search active — :online suffix will be added"
              className="inline-flex items-center gap-0.5 border border-vermilion bg-vermilion-tint px-1 py-px font-mono text-[9px] uppercase tracking-[0.08em] text-vermilion"
            >
              <Globe size={9} /> :online
            </span>
          ) : null}
          <AttachButton onPick={(fl) => void addFiles(fl)} disabled={isGenerating} />
          {isGenerating ? (
            <Button variant="danger" size="sm" onClick={onStop} title="Stop" className="!h-8 !w-8 !p-0">
              <Square size={12} />
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={submit}
              disabled={!canSend}
              title={blockReason || 'Send (⌘ + Enter)'}
              className="!h-8 !w-8 !p-0"
            >
              <Send size={12} />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
