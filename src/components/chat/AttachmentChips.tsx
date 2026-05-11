import { X, FileText, Image as ImageIcon } from 'lucide-react'
import { formatBytes, type PendingAttachment } from '../../lib/attachments'

interface Props {
  items: PendingAttachment[]
  onRemove: (idx: number) => void
}

/**
 * Row of pill previews above the input. Image chips show a tiny thumbnail from
 * the object URL the caller created in `PendingAttachment.previewUrl`. PDF
 * chips show a file icon and filename. Each chip has a × to remove.
 */
export function AttachmentChips({ items, onRemove }: Props) {
  if (!items.length) return null
  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
      {items.map((it, i) => (
        <div
          key={i}
          className="inline-flex items-center gap-1.5 border border-rule-soft bg-paper-2 px-1.5 py-1 font-mono text-[10px] tracking-tight text-ink"
        >
          {it.kind === 'image' ? (
            <img
              src={it.previewUrl}
              alt=""
              className="h-6 w-6 border border-rule-soft object-cover"
            />
          ) : (
            <FileText size={12} className="text-mute" />
          )}
          <span className="max-w-[14ch] truncate" title={it.file.name}>
            {it.file.name}
          </span>
          <span className="text-mute">{formatBytes(it.file.size)}</span>
          {it.downscaled ? (
            <span className="border border-vermilion px-1 text-vermilion" title="Image was downscaled before sending">
              ↘
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => onRemove(i)}
            title="Remove attachment"
            className="ml-0.5 inline-flex h-4 w-4 items-center justify-center text-mute hover:text-vermilion"
          >
            <X size={10} />
          </button>
        </div>
      ))}
    </div>
  )
}

/** Re-exported for components that want the icon shape without parsing the chip. */
export { ImageIcon }
