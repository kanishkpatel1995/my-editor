import { useEffect } from 'react'

export interface HotkeyHandlers {
  onOpen?: () => void
  onSave?: () => void
  onCopy?: () => void
  onToggleChat?: () => void
  onToggleAnvil?: () => void
  onToggleMode?: () => void
  onStop?: () => void
}

export function useHotkeys(h: HotkeyHandlers) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      if (!meta && e.key !== 'Escape') return
      if (meta && e.key.toLowerCase() === 'o' && h.onOpen) {
        e.preventDefault()
        h.onOpen()
      } else if (meta && e.key.toLowerCase() === 's' && h.onSave) {
        e.preventDefault()
        h.onSave()
      } else if (meta && e.shiftKey && e.key.toLowerCase() === 'c' && h.onCopy) {
        e.preventDefault()
        h.onCopy()
      } else if (meta && e.key.toLowerCase() === 'j' && h.onToggleChat) {
        e.preventDefault()
        h.onToggleChat()
      } else if (meta && e.key.toLowerCase() === 'l' && h.onToggleAnvil) {
        e.preventDefault()
        h.onToggleAnvil()
      } else if (meta && e.shiftKey && e.key.toLowerCase() === 'i' && h.onToggleMode) {
        e.preventDefault()
        h.onToggleMode()
      } else if (e.key === 'Escape' && h.onStop) {
        h.onStop()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [h])
}
