import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Check, Search } from 'lucide-react'
import { useChatStore } from '../../store/chatStore'
import { isFreeText, isImageCapable, pricePerImage, pricePerMTokens } from '../../lib/openrouter'
import type { ChatMode, ORModel } from '../../types'

interface ModelPickerProps {
  mode: ChatMode
}

interface Group {
  label: string
  items: ORModel[]
}

export function ModelPicker({ mode }: ModelPickerProps) {
  const models = useChatStore((s) => s.models)
  const selectedTextModel = useChatStore((s) => s.selectedTextModel)
  const selectedImageModel = useChatStore((s) => s.selectedImageModel)
  const setModel = useChatStore((s) => s.setModel)
  const externallyOpen = useChatStore((s) => s.pickerOpen)
  const consumePickerOpen = useChatStore((s) => s.consumePickerOpen)

  const value = mode === 'image' ? selectedImageModel : selectedTextModel

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)

  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // External "open me" signal from chatStore
  useEffect(() => {
    if (externallyOpen) {
      setOpen(true)
      consumePickerOpen()
    }
  }, [externallyOpen, consumePickerOpen])

  const groups = useMemo<Group[]>(() => {
    const q = query.trim().toLowerCase()
    const matches = (m: ORModel): boolean => {
      if (!q) return true
      const hay = `${m.id} ${m.name || ''}`.toLowerCase()
      return q.split(/\s+/).every((tok) => hay.includes(tok))
    }
    if (mode === 'image') {
      const items = models.filter(isImageCapable).filter(matches)
      return [{ label: 'Image models', items }]
    }
    const free = models.filter(isFreeText).filter(matches)
    const paid = models
      .filter((m) => !isImageCapable(m) && !isFreeText(m))
      .sort((a, b) => a.id.localeCompare(b.id))
      .filter(matches)
    return [
      { label: 'Free text', items: free },
      { label: 'Paid text', items: paid },
    ]
  }, [models, query, mode])

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups])
  const flatIndex = (m: ORModel) => flat.findIndex((x) => x.id === m.id)

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    requestAnimationFrame(() => inputRef.current?.focus())
    const idx = flat.findIndex((m) => m.id === value)
    setHighlighted(idx >= 0 ? idx : 0)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setHighlighted(0)
  }, [query])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector(`[data-flatidx="${highlighted}"]`)
    if (el && 'scrollIntoView' in el) {
      ;(el as HTMLElement).scrollIntoView({ block: 'nearest' })
    }
  }, [highlighted, open])

  const choose = (m: ORModel) => {
    setModel(m.id)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((h) => Math.min(h + 1, Math.max(0, flat.length - 1)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setHighlighted(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setHighlighted(Math.max(0, flat.length - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const m = flat[highlighted]
      if (m) choose(m)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  const triggerLabel = value || (models.length === 0 ? 'Loading…' : 'Select model')

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={
          'flex h-7 max-w-[20rem] items-center gap-1 border bg-paper px-2 font-mono text-[11px] tracking-tight text-ink transition-colors duration-150 ' +
          (open ? 'border-ink' : 'border-rule-soft hover:border-ink')
        }
        aria-haspopup="listbox"
        aria-expanded={open}
        title={value}
      >
        <span className="max-w-[15rem] truncate">{triggerLabel}</span>
        <ChevronDown size={11} className={'ml-auto text-mute transition-transform duration-150 ' + (open ? 'rotate-180' : '')} />
      </button>

      {open && (
        <div
          role="listbox"
          className="animate-fade-in absolute right-0 z-50 mt-1 w-[26rem] max-w-[90vw] border border-ink bg-paper shadow-[var(--shadow-lift)]"
        >
          <div className="flex items-center gap-1.5 border-b border-rule px-2 py-2">
            <Search size={11} className="text-mute" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search models…"
              className="flex-1 bg-transparent font-mono text-[11px] text-ink outline-none placeholder:text-mute"
            />
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-mute">
              {flat.length}/{models.length}
            </span>
          </div>

          <div ref={listRef} className="thin-scroll max-h-72 overflow-y-auto py-1">
            {flat.length === 0 ? (
              <div className="p-4 text-center font-mono text-[11px] text-mute">No models match "{query}"</div>
            ) : (
              groups.map((g) =>
                g.items.length === 0 ? null : (
                  <div key={g.label}>
                    <div className="sticky top-0 z-10 flex items-center justify-between border-y border-rule-soft bg-paper-2 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
                      <span>{g.label}</span>
                      <span className="text-mute">({g.items.length})</span>
                    </div>
                    {g.items.map((m) => {
                      const idx = flatIndex(m)
                      const isSelected = m.id === value
                      const isHighlighted = idx === highlighted
                      return (
                        <button
                          key={m.id}
                          type="button"
                          data-flatidx={idx}
                          onMouseEnter={() => setHighlighted(idx)}
                          onClick={() => choose(m)}
                          className={
                            'flex w-full items-center gap-2 px-2 py-1.5 text-left font-mono text-[11px] transition-colors duration-150 ' +
                            (isHighlighted ? 'bg-paper-2 ' : '') +
                            (isSelected ? 'border-l-2 border-l-vermilion text-ink ' : 'border-l-2 border-l-transparent text-ink-soft ')
                          }
                        >
                          <span className="flex h-3 w-3 items-center justify-center text-vermilion">
                            {isSelected ? <Check size={11} /> : null}
                          </span>
                          <span className="flex-1 truncate">{m.id}</span>
                          <span className="shrink-0 text-mute">{priceLabel(m, mode)}</span>
                        </button>
                      )
                    })}
                  </div>
                ),
              )
            )}
          </div>

          <div className="border-t border-rule px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-mute">
            ↑↓ navigate · ↵ select · esc close
          </div>
        </div>
      )}
    </div>
  )
}

function priceLabel(m: ORModel, mode: ChatMode): string {
  if (mode === 'image' && isImageCapable(m)) {
    const p = pricePerImage(m)
    return `$${p.toFixed(3)}/img`
  }
  if (isFreeText(m)) return 'FREE'
  const p = pricePerMTokens(m.pricing?.prompt).toFixed(2)
  const c = pricePerMTokens(m.pricing?.completion).toFixed(2)
  return `$${p}/$${c} per 1M`
}
