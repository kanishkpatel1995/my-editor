import { useEffect, useState } from 'react'
import type { Theme } from '../types'

const KEY = 'my-editor:theme'

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = (typeof localStorage !== 'undefined' && (localStorage.getItem(KEY) as Theme | null)) || null
    return saved === 'linkedin' || saved === 'substack' ? saved : 'substack'
  })
  useEffect(() => {
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      // ignore
    }
  }, [theme])
  return [theme, setTheme]
}
