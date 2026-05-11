import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import type { Attachment } from '../../types'
import { loadAttachmentDataUrl } from '../../lib/attachments'

interface Props {
  attachments: Attachment[]
  threadDir?: FileSystemDirectoryHandle
  onOpenLightbox?: (url: string) => void
}

/**
 * Renders attachments on a sent user message. Images become inline thumbnails
 * (click → lightbox). PDFs become a file chip the user can click to open in a
 * new tab.
 */
export function AttachmentThumb({ attachments, threadDir, onOpenLightbox }: Props) {
  const [urls, setUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!threadDir) return
    let cancelled = false
    const created: string[] = []
    ;(async () => {
      const out: Record<string, string> = {}
      for (const att of attachments) {
        try {
          // For images we want a blob URL (cheap to revoke). For PDFs we use a
          // data URL since the user may open it in a new tab.
          const dataUrl = await loadAttachmentDataUrl(threadDir, att.relPath)
          if (att.kind === 'image') {
            const blob = await (await fetch(dataUrl)).blob()
            const obj = URL.createObjectURL(blob)
            created.push(obj)
            out[att.relPath] = obj
          } else {
            out[att.relPath] = dataUrl
          }
        } catch (e) {
          console.error('AttachmentThumb load failed', att.relPath, e)
        }
      }
      if (!cancelled) setUrls(out)
    })()
    return () => {
      cancelled = true
      for (const u of created) URL.revokeObjectURL(u)
    }
  }, [attachments, threadDir])

  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
      {attachments.map((att) => {
        const url = urls[att.relPath]
        if (att.kind === 'image') {
          return (
            <button
              type="button"
              key={att.relPath}
              onClick={() => url && onOpenLightbox?.(url)}
              className="border border-rule-soft"
              title={att.name}
            >
              {url ? (
                <img src={url} alt={att.name} className="h-16 w-16 object-cover" />
              ) : (
                <div className="h-16 w-16 animate-pulse bg-paper-2" />
              )}
            </button>
          )
        }
        return (
          <a
            key={att.relPath}
            href={url || '#'}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 border border-rule-soft bg-paper-2 px-2 py-1 font-mono text-[10px] text-ink hover:border-ink"
            title={`Open ${att.name}`}
          >
            <FileText size={11} className="text-mute" />
            <span className="max-w-[20ch] truncate">{att.name}</span>
          </a>
        )
      })}
    </div>
  )
}
