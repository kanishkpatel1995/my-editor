import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

export type ResizeAxis = 'x' | 'y'

export interface UseResizableOpts {
  axis: ResizeAxis
  initial: number
  min: number
  /** Number for static cap, function form for caps that depend on viewport size. */
  max: number | (() => number)
  storageKey: string
  /**
   * If true, drag delta is subtracted instead of added. Use when the gutter
   * is on the LEFT edge of a panel anchored to the RIGHT (or top edge of a
   * panel anchored to the BOTTOM): dragging "into" the panel should grow it.
   */
  inverted?: boolean
}

export interface UseResizable {
  size: number
  setSize: (n: number) => void
  reset: () => void
  isResizing: boolean
  /** Live readout string while dragging — for the readout pill. Empty when idle. */
  readout: string
  /** Pointer position of the active drag, for placing the readout pill. */
  pointer: { x: number; y: number } | null
  gutterProps: {
    role: 'separator'
    'aria-orientation': 'vertical' | 'horizontal'
    'aria-valuenow': number
    'aria-valuemin': number
    'aria-valuemax': number
    tabIndex: 0
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => void
    onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void
    onDoubleClick: () => void
  }
}

const ARROW_NUDGE = 16
const ARROW_NUDGE_LARGE = 64

function readMax(max: UseResizableOpts['max']): number {
  return typeof max === 'function' ? max() : max
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function readStored(storageKey: string, fallback: number, min: number, max: number): number {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return fallback
    const n = Number(raw)
    if (!Number.isFinite(n)) return fallback
    return clamp(n, min, max)
  } catch {
    return fallback
  }
}

export function useResizable(opts: UseResizableOpts): UseResizable {
  const { axis, initial, min, max, storageKey, inverted = false } = opts

  // Hydrate synchronously so the first paint already has the right size.
  const [size, setSizeState] = useState<number>(() =>
    readStored(storageKey, initial, min, readMax(max)),
  )
  const [isResizing, setIsResizing] = useState(false)
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)

  // Stash the latest opts in a ref so effects don't re-attach when callers pass
  // fresh closures every render (which is the common case for `max: () => …`).
  // Updated inside an effect so render is pure.
  const optsRef = useRef({ axis, min, max, inverted })
  useEffect(() => {
    optsRef.current = { axis, min, max, inverted }
  })

  // Refs that mutate during a drag without triggering re-renders.
  const dragStateRef = useRef<{
    startCoord: number
    startSize: number
    pointerId: number
    rafId: number | null
    pendingSize: number | null
  } | null>(null)

  // Persist on change. Debounced via RAF so a furious drag doesn't spam storage.
  const persistRafRef = useRef<number | null>(null)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (persistRafRef.current != null) cancelAnimationFrame(persistRafRef.current)
    persistRafRef.current = requestAnimationFrame(() => {
      try {
        window.localStorage.setItem(storageKey, String(Math.round(size)))
      } catch {
        /* storage may be disabled — fail silently */
      }
    })
    return () => {
      if (persistRafRef.current != null) cancelAnimationFrame(persistRafRef.current)
    }
  }, [size, storageKey])

  // Re-clamp when the viewport changes (only matters for callable max).
  useEffect(() => {
    const onResize = () => {
      const o = optsRef.current
      setSizeState((prev) => clamp(prev, o.min, readMax(o.max)))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const setSize = useCallback((n: number) => {
    const o = optsRef.current
    setSizeState(clamp(n, o.min, readMax(o.max)))
  }, [])

  const reset = useCallback(() => setSize(initial), [setSize, initial])

  const onPointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    const o = optsRef.current
    const startCoord = o.axis === 'x' ? e.clientX : e.clientY
    dragStateRef.current = {
      startCoord,
      startSize: size,
      pointerId: e.pointerId,
      rafId: null,
      pendingSize: null,
    }
    setIsResizing(true)
    setPointer({ x: e.clientX, y: e.clientY })
    document.body.classList.add(o.axis === 'x' ? 'is-resizing-x' : 'is-resizing-y')
  }, [size])

  // Pointer move/up listeners attached at the window level for the duration of drag.
  useEffect(() => {
    if (!isResizing) return
    const onMove = (e: globalThis.PointerEvent) => {
      const ds = dragStateRef.current
      if (!ds) return
      const o = optsRef.current
      const coord = o.axis === 'x' ? e.clientX : e.clientY
      const rawDelta = coord - ds.startCoord
      const delta = o.inverted ? -rawDelta : rawDelta
      const next = clamp(ds.startSize + delta, o.min, readMax(o.max))
      ds.pendingSize = next
      setPointer({ x: e.clientX, y: e.clientY })
      if (ds.rafId == null) {
        ds.rafId = requestAnimationFrame(() => {
          if (ds.pendingSize != null) setSizeState(ds.pendingSize)
          ds.rafId = null
        })
      }
    }
    const finish = () => {
      const ds = dragStateRef.current
      if (ds?.rafId != null) cancelAnimationFrame(ds.rafId)
      dragStateRef.current = null
      setIsResizing(false)
      setPointer(null)
      document.body.classList.remove('is-resizing-x', 'is-resizing-y')
    }
    const onUp = () => finish()
    const onCancel = () => {
      const ds = dragStateRef.current
      if (ds) setSizeState(ds.startSize)  // Esc-equivalent: pointercancel restores
      finish()
    }
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        const ds = dragStateRef.current
        if (ds) setSizeState(ds.startSize)
        finish()
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKey)
    }
  }, [isResizing])

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    const o = optsRef.current
    const positiveKey = o.axis === 'x' ? 'ArrowRight' : 'ArrowDown'
    const negativeKey = o.axis === 'x' ? 'ArrowLeft' : 'ArrowUp'
    const step = e.shiftKey ? ARROW_NUDGE_LARGE : ARROW_NUDGE
    // For inverted axes, "positive direction in space" maps to "shrink the panel".
    const sign = o.inverted ? -1 : 1
    if (e.key === positiveKey) {
      e.preventDefault()
      setSize(size + sign * step)
    } else if (e.key === negativeKey) {
      e.preventDefault()
      setSize(size - sign * step)
    } else if (e.key === 'Home') {
      e.preventDefault()
      setSize(o.min)
    } else if (e.key === 'End') {
      e.preventDefault()
      setSize(readMax(o.max))
    }
  }, [setSize, size])

  const readout = isResizing ? `${Math.round(size)} px` : ''

  return {
    size,
    setSize,
    reset,
    isResizing,
    readout,
    pointer,
    gutterProps: {
      role: 'separator',
      'aria-orientation': axis === 'x' ? 'vertical' : 'horizontal',
      'aria-valuenow': Math.round(size),
      'aria-valuemin': min,
      'aria-valuemax': Math.round(readMax(max)),
      tabIndex: 0,
      onPointerDown,
      onKeyDown,
      onDoubleClick: reset,
    },
  }
}
