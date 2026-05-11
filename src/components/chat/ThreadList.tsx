import { useState } from 'react'
import { Plus, Trash2, Image as ImageIcon, Search } from 'lucide-react'
import { useChatStore } from '../../store/chatStore'
import { toast } from 'sonner'
import { Button } from '../ui/Button'

interface Props {
  onClose: () => void
}

export function ThreadList({ onClose }: Props) {
  const threads = useChatStore((s) => s.threads)
  const activeId = useChatStore((s) => s.activeThreadId)
  const newThread = useChatStore((s) => s.newThread)
  const selectThread = useChatStore((s) => s.selectThread)
  const deleteThread = useChatStore((s) => s.deleteThread)
  const renameThread = useChatStore((s) => s.renameThread)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [search, setSearch] = useState('')

  const filtered = threads.filter((t) => {
    if (!search) return true
    const s = search.toLowerCase()
    return t.title.toLowerCase().includes(s)
      || t.messages.some((m) => m.content.toLowerCase().includes(s))
  })

  const create = async () => {
    try {
      const id = await newThread('text')
      await selectThread(id)
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 border-b border-rule-soft px-2 py-2">
        <Button variant="primary" size="sm" onClick={create} leading={<Plus size={11} />}>
          New
        </Button>
        <div className="relative flex flex-1 items-center">
          <Search size={11} className="pointer-events-none absolute left-2 text-mute" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search threads…"
            className="h-7 w-full border border-rule-soft bg-paper pl-6 pr-2 font-mono text-[11px] text-ink outline-none placeholder:text-mute focus:border-ink"
          />
        </div>
      </div>
      <div className="thin-scroll flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-6 text-center font-mono text-[10px] uppercase tracking-[0.08em] text-mute">
            {search ? `No matches for "${search}"` : 'No threads yet — click + New'}
          </div>
        ) : null}
        <ul>
          {filtered.map((t) => {
            const active = t.id === activeId
            const hasImages = t.messages.some((m) => m.images?.length)
            const updated = (t.updatedAt || '').slice(11, 16)
            const date = (t.updatedAt || '').slice(0, 10)
            return (
              <li
                key={t.id}
                className={
                  'group animate-fade-in cursor-pointer border-b border-rule-soft px-2 py-2 text-xs transition-colors duration-150 hover:bg-paper-2 ' +
                  (active ? 'bg-paper-2 border-l-2 border-l-vermilion' : 'border-l-2 border-l-transparent')
                }
                onClick={() => {
                  if (editingId !== t.id) {
                    void selectThread(t.id).then(onClose)
                  }
                }}
                onDoubleClick={() => {
                  setEditingId(t.id)
                  setDraftTitle(t.title)
                }}
              >
                <div className="flex items-center gap-1.5">
                  {hasImages ? <ImageIcon size={11} className="shrink-0 text-mute" /> : null}
                  {editingId === t.id ? (
                    <input
                      autoFocus
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      onBlur={() => {
                        void renameThread(t.id, draftTitle.trim() || t.title)
                        setEditingId(null)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      className="h-6 flex-1 border border-rule bg-paper px-1 font-mono text-[11px]"
                    />
                  ) : (
                    <span className="flex-1 truncate font-medium tracking-tight text-ink">{t.title}</span>
                  )}
                  <button
                    type="button"
                    aria-label="Delete thread"
                    onClick={(e) => {
                      e.stopPropagation()
                      const imgCount = t.messages.reduce((n, m) => n + (m.images?.length || 0), 0)
                      if (window.confirm(`Delete "${t.title}"${imgCount ? ` and ${imgCount} image${imgCount > 1 ? 's' : ''}` : ''}?`)) {
                        void deleteThread(t.id)
                      }
                    }}
                    className="opacity-0 transition-opacity duration-150 hover:text-brick group-hover:opacity-100"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-mute">
                  <span>{date} · {updated}</span>
                  <span>·</span>
                  <span>{t.messages.length} msg</span>
                  <span>·</span>
                  <span className="truncate">{t.model.split('/').pop()}</span>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
