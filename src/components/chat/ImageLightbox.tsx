import { useEffect } from 'react'
import { X } from 'lucide-react'

interface Props {
  src: string | null
  onClose: () => void
}

export function ImageLightbox({ src, onClose }: Props) {
  useEffect(() => {
    if (!src) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [src, onClose])

  if (!src) return null
  return (
    <div
      onClick={onClose}
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-ink/92 p-8"
      style={{ backgroundColor: 'rgba(11,11,12,0.92)' }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center border border-rule-soft text-paper hover:border-vermilion hover:text-vermilion"
      >
        <X size={14} />
      </button>
      <img
        src={src}
        alt=""
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full border border-rule-soft"
      />
      {/* Registration marks */}
      <span className="absolute left-6 top-6 h-3 w-3 border-l border-t border-vermilion" />
      <span className="absolute right-6 top-6 h-3 w-3 border-r border-t border-vermilion" />
      <span className="absolute bottom-6 left-6 h-3 w-3 border-b border-l border-vermilion" />
      <span className="absolute bottom-6 right-6 h-3 w-3 border-b border-r border-vermilion" />
    </div>
  )
}
