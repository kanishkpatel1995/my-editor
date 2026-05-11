import { useEffect, useState } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, FolderOpen, ListTree, RefreshCw, X } from 'lucide-react'
import { Callout } from '../ui/Callout'
import { useChatStore } from '../../store/chatStore'
import { ThreadList } from './ThreadList'
import { ThreadView } from './ThreadView'
import { pickDirectory, ensureRWPermission } from '../../lib/fs'
import { loadChatRootHandle } from '../../lib/handles-store'
import { toast } from 'sonner'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { ResizeGutter } from '../ui/ResizeGutter'
import { useResizable } from '../../hooks/useResizable'
import { CHAT_HISTORY_PATH, CHAT_HISTORY_FOLDER_NAME } from '../../lib/workflow'

const PANEL_DEFAULT = 440
const PANEL_MIN = 320
const EDITOR_FLOOR = 480

interface Props {
  open: boolean
  onClose: () => void
  onInsertText?: (markdown: string) => void
  onInsertImage?: (relPath: string, alt: string, threadDir: FileSystemDirectoryHandle) => void
}

export function ChatPanel({ open, onClose, onInsertText, onInsertImage }: Props) {
  const config = useChatStore((s) => s.config)
  const rootDir = useChatStore((s) => s.rootDir)
  const setRootDir = useChatStore((s) => s.setRootDir)
  const loadThreads = useChatStore((s) => s.loadThreads)
  const refreshModels = useChatStore((s) => s.refreshModels)
  const threads = useChatStore((s) => s.threads)
  const activeThreadId = useChatStore((s) => s.activeThreadId)
  const newThread = useChatStore((s) => s.newThread)
  const selectThread = useChatStore((s) => s.selectThread)

  const [showList, setShowList] = useState(false)

  const widthResizer = useResizable({
    axis: 'x',
    initial: PANEL_DEFAULT,
    min: PANEL_MIN,
    max: () => Math.max(PANEL_MIN, window.innerWidth - EDITOR_FLOOR),
    storageKey: 'myeditor.chat.panelWidth',
    inverted: true,
  })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const cached = await loadChatRootHandle()
      if (cached && !cancelled) {
        const ok = await ensureRWPermission(cached)
        if (ok) {
          await setRootDir(cached)
          await loadThreads()
        }
      }
    })()
    return () => { cancelled = true }
  }, [setRootDir, loadThreads])

  useEffect(() => {
    if (config) void refreshModels()
  }, [config, refreshModels])

  const pickFolder = async () => {
    try {
      // Open the picker focused on the user's current (possibly-wrong) folder
      // so a "navigate up + into chat_history" fix is two clicks max. Fall back
      // to the 'documents' well-known dir on a fresh install.
      // The `id: 'chat-root'` makes Chrome remember the last-used chat folder
      // independently of other pickers (article file, workflow root).
      const h = await pickDirectory({
        id: 'chat-root',
        startIn: rootDir ?? 'documents',
      })
      await setRootDir(h)
      await loadThreads()
      if (h.name === CHAT_HISTORY_FOLDER_NAME) {
        toast.success(`Linked ${h.name}.`)
      } else {
        toast.warning(
          `Linked "${h.name}" — note the recommended folder is "${CHAT_HISTORY_FOLDER_NAME}". Click the folder icon to re-pick.`,
          { duration: 8000 },
        )
      }
    } catch (e) {
      if ((e as DOMException)?.name !== 'AbortError') toast.error((e as Error).message)
    }
  }

  const active = threads.find((t) => t.id === activeThreadId) || null

  if (!open) return null

  return (
    <div className="flex h-full flex-shrink-0">
      <ResizeGutter axis="x" label="Resize chat panel" resizer={widthResizer} />
      <aside
        className="thin-scroll animate-slide-in-right flex h-full flex-shrink-0 flex-col border-l border-rule bg-paper"
        style={{ width: widthResizer.size }}
      >
      {/* Header */}
      <div className="flex items-center gap-1.5 border-b border-rule bg-paper px-2.5 py-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowList((v) => !v)}
          leading={showList ? <ChevronRight size={11} /> : <ChevronLeft size={11} />}
          title="Threads"
        >
          <span className="flex items-center gap-1">
            <ListTree size={11} />
            <span>Chats</span>
          </span>
        </Button>

        {!rootDir ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={pickFolder}
            leading={<FolderOpen size={11} />}
            className="border border-vermilion text-vermilion hover:bg-vermilion-tint"
          >
            Pick folder
          </Button>
        ) : (
          <>
            <IconButton
              size="sm"
              icon={<RefreshCw size={11} />}
              label="Refresh"
              title="Reload threads & models"
              onClick={async () => {
                await loadThreads()
                await refreshModels(true)
                toast.success('Refreshed.')
              }}
            />
            <IconButton
              size="sm"
              icon={<FolderOpen size={11} />}
              label="Change folder"
              title={`Currently: ${rootDir.name}${
                rootDir.name !== CHAT_HISTORY_FOLDER_NAME
                  ? ` (expected ${CHAT_HISTORY_FOLDER_NAME})`
                  : ''
              } · click to pick a different folder`}
              onClick={pickFolder}
              className={
                rootDir.name !== CHAT_HISTORY_FOLDER_NAME
                  ? 'border border-vermilion text-vermilion'
                  : ''
              }
            />
          </>
        )}

        <div
          className="ml-auto truncate font-mono text-[10px] uppercase tracking-[0.08em] text-mute"
          title={active?.title || (rootDir ? `Folder: ${rootDir.name} · no thread selected` : 'No folder picked')}
        >
          {active?.title || (rootDir ? `${rootDir.name} · no thread` : 'no folder')}
        </div>

        <IconButton size="sm" icon={<X size={12} />} label="Close" title="Close (⌘J)" onClick={onClose} />
      </div>

      {/* Wrong-folder warning */}
      {rootDir && rootDir.name !== CHAT_HISTORY_FOLDER_NAME ? (
        <div className="border-b border-rule-soft px-3 py-2">
          <Callout
            tone="warn"
            title="Wrong chat folder"
            icon={<AlertTriangle size={11} />}
            action={
              <Button variant="primary" size="sm" leading={<FolderOpen size={11} />} onClick={pickFolder}>
                Change folder
              </Button>
            }
          >
            <p className="text-sm leading-snug text-ink">
              Linked to <code className="font-mono text-[11px] text-ink-soft">{rootDir.name}</code>, but threads
              live in <code className="font-mono text-[11px] text-ink-soft">{CHAT_HISTORY_FOLDER_NAME}</code>.
              The picker will reopen near the current folder — go up one level and pick{' '}
              <code className="font-mono text-[11px] text-ink-soft">my-editor/chat_history</code>.
            </p>
          </Callout>
        </div>
      ) : null}

      {/* Body */}
      <div className="thin-scroll flex flex-1 min-h-0 flex-col">
        {showList ? (
          <ThreadList onClose={() => setShowList(false)} />
        ) : !rootDir ? (
          <FolderEmptyState
            suggested={config?.chatFolderPath || CHAT_HISTORY_PATH}
            onPick={pickFolder}
          />
        ) : !active ? (
          <NoThreadEmptyState
            count={threads.length}
            onNewText={async () => {
              const id = await newThread('text')
              await selectThread(id)
            }}
            onNewImage={async () => {
              const id = await newThread('image')
              await selectThread(id)
            }}
            onShowList={() => setShowList(true)}
          />
        ) : (
          <ThreadView
            thread={active}
            onInsertText={onInsertText}
            onInsertImage={onInsertImage}
            onSaveImage={async (rel, dir) => {
              try {
                const fname = rel.replace(/^\.\//, '')
                const fh = await dir.getFileHandle(fname)
                const blob = await (await fh.getFile()).slice()
                const out = await window.showSaveFilePicker({ suggestedName: fname })
                const w = await out.createWritable()
                await w.write(blob)
                await w.close()
                toast.success(`Saved ${fname}`)
              } catch (e) {
                if ((e as DOMException)?.name !== 'AbortError') toast.error((e as Error).message)
              }
            }}
          />
        )}
      </div>
      </aside>
    </div>
  )
}

function FolderEmptyState({ suggested, onPick }: { suggested: string; onPick: () => void }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-8 text-center animate-fade-in">
      <div className="label-eyebrow">Foundry · chats</div>
      <h3 className="text-lg font-medium tracking-tight text-ink">Pick a folder for thread storage</h3>
      <p className="max-w-[28ch] text-xs text-ink-soft">
        Each chat becomes a folder containing <code className="font-mono text-ink">chat.md</code> + any generated images.
        Grep-able, version-able, sync-able.
      </p>
      <Button variant="primary" size="md" onClick={onPick}>Choose folder</Button>
      {suggested ? (
        <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-mute">
          suggestion: <span className="text-ink-soft normal-case tracking-normal">{suggested}</span>
        </div>
      ) : null}
    </div>
  )
}

function NoThreadEmptyState({
  count, onNewText, onNewImage, onShowList,
}: { count: number; onNewText: () => void; onNewImage: () => void; onShowList: () => void }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-8 text-center animate-fade-in">
      <div className="label-eyebrow">{count > 0 ? `${count} threads on disk` : 'No threads yet'}</div>
      <h3 className="text-lg font-medium tracking-tight text-ink">Start a new run</h3>
      <div className="flex gap-2">
        <Button variant="primary" size="md" onClick={onNewText}>+ Text chat</Button>
        <Button variant="ghost" size="md" onClick={onNewImage}>🎨 Image chat</Button>
      </div>
      {count > 0 ? (
        <button
          type="button"
          onClick={onShowList}
          className="font-mono text-[10px] uppercase tracking-[0.08em] text-mute underline-offset-4 hover:text-ink hover:underline"
        >
          show {count} existing
        </button>
      ) : null}
    </div>
  )
}
