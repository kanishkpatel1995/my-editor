import { useRef } from 'react'
import { Paperclip } from 'lucide-react'

interface Props {
  /** Called with the user-picked files. Caller classifies + downscales. */
  onPick: (files: FileList) => void
  disabled?: boolean
  title?: string
}

/**
 * Tiny icon trigger that opens the native file picker. We keep the underlying
 * <input type="file"> in the DOM (visually hidden) so the click() programmatic
 * dispatch reliably opens the picker across browsers.
 */
export function AttachButton({ onPick, disabled, title }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        title={title || 'Attach image or PDF'}
        aria-label="Attach file"
        className={
          'inline-flex h-8 w-8 items-center justify-center border bg-paper text-mute transition-colors duration-150 ' +
          (disabled
            ? 'border-rule-soft/50 cursor-not-allowed'
            : 'border-rule-soft hover:border-ink hover:text-ink')
        }
      >
        <Paperclip size={12} />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onPick(e.target.files)
          // Reset so picking the same file twice in a row still fires onChange.
          e.target.value = ''
        }}
      />
    </>
  )
}
