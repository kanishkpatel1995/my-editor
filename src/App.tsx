import { useEffect, useRef, useState, useCallback } from 'react'
import { Toaster, toast } from 'sonner'
import type { Editor as TipTapEditor } from '@tiptap/react'
import { MarkdownEditor, type EditorHandle, type ChatImageDragPayload } from './components/editor/Editor'
import { Toolbar } from './components/editor/Toolbar'
import { ChatPanel } from './components/chat/ChatPanel'
import { SetupScreen } from './components/SetupScreen'
import { TodayEmptyState } from './components/editor/TodayEmptyState'
import { useTheme } from './hooks/useTheme'
import { useHotkeys } from './hooks/useHotkeys'
import { loadConfig } from './lib/config'
import { openMarkdownFile, saveMarkdownFile, saveAsMarkdownFile, fsAccessSupported, pickDirectory, ensureRWPermission } from './lib/fs'
import { writeRichClipboard } from './lib/clipboard'
import { transformForSubstack } from './lib/transforms/substack'
import { transformForLinkedIn } from './lib/transforms/linkedin'
import { useChatStore } from './store/chatStore'
import { useArticleStore } from './store/articleStore'
import { copyImageNearArticle } from './lib/image-utils'
import { stripBase64Images } from './lib/prompts'
import type { ArticleRef, CompanionKind } from './types'
import './styles/editor-substack.css'
import './styles/editor-linkedin.css'

const SAMPLE_MD = `# Welcome to my-editor

A WYSIWYG markdown editor that previews exactly like **Substack** or **LinkedIn**.

## How it works

1. Open a \`.md\` file from disk.
2. Switch the theme on the right.
3. Edit. Click **Copy for Substack** or **Copy for LinkedIn**.
4. Paste into the platform composer.

> Markdown is the source of truth. The editor round-trips back to \`.md\` on save.

---

Use the right-side panel for AI chat — text drafts, prompt iteration, **image generation** for hero diagrams.
`

export default function App() {
  const [{ config, missing }] = useState(() => loadConfig())

  const [theme, setTheme] = useTheme()
  const editorRef = useRef<EditorHandle | null>(null)
  const [editorInstance, setEditorInstance] = useState<TipTapEditor | null>(null)
  const [, forceTick] = useState(0)
  const [markdown, setMarkdown] = useState<string>(SAMPLE_MD)
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  /** True when no article is open AND today isn't on disk — show the empty state. */
  const [showTodayEmpty, setShowTodayEmpty] = useState(false)

  const setStoreConfig = useChatStore((s) => s.setConfig)

  const articleHydrate = useArticleStore((s) => s.hydrate)
  const articleRoot = useArticleStore((s) => s.rootDir)
  const articleSetRoot = useArticleStore((s) => s.setRootDir)
  const articleHydrated = useArticleStore((s) => s.hydrated)
  const articleLatestRef = useArticleStore((s) => s.latestRef)
  const articleCurrent = useArticleStore((s) => s.current)
  const articleOpen = useArticleStore((s) => s.openArticle)
  const articleCreateToday = useArticleStore((s) => s.createToday)
  const articleSaveCurrent = useArticleStore((s) => s.saveCurrent)
  const articleLoadCompanion = useArticleStore((s) => s.loadCompanion)
  const articleRefresh = useArticleStore((s) => s.refreshDetection)
  const articleLoadPrompts = useArticleStore((s) => s.loadPromptsIfStale)

  /* ─── boot-time hydrate ─── */
  useEffect(() => {
    if (config) setStoreConfig(config)
  }, [config, setStoreConfig])

  useEffect(() => {
    void articleHydrate()
  }, [articleHydrate])

  // Once hydrated and we have a root, auto-open today's article (or empty state)
  const bootedRef = useRef(false)
  useEffect(() => {
    if (!articleHydrated || !articleRoot || bootedRef.current) return
    bootedRef.current = true
    void (async () => {
      await articleRefresh()
      void articleLoadPrompts()
      const today = useArticleStore.getState().todayRef
      if (today) {
        await openArticleRef(today)
      } else {
        setShowTodayEmpty(true)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleHydrated, articleRoot])

  /* ─── editor instance event hookup ─── */
  useEffect(() => {
    if (!editorInstance) return
    const tick = () => forceTick((n) => n + 1)
    editorInstance.on('selectionUpdate', tick)
    editorInstance.on('transaction', tick)
    return () => {
      editorInstance.off('selectionUpdate', tick)
      editorInstance.off('transaction', tick)
    }
  }, [editorInstance])

  /* ─── article actions ─── */
  const openArticleRef = useCallback(async (ref: ArticleRef) => {
    if (dirty && !window.confirm('Discard unsaved changes?')) return
    const r = await articleOpen(ref)
    if (!r) {
      toast.error(`Could not open ${ref.filename}`)
      return
    }
    setFileHandle(r.handle)
    setFileName(r.handle.name)
    setMarkdown(r.text)
    editorRef.current?.setMarkdown(r.text)
    setDirty(false)
    setShowTodayEmpty(false)
  }, [articleOpen, dirty])

  const pickWorkflowRoot = useCallback(async () => {
    if (!fsAccessSupported()) {
      toast.error('Your browser does not support the File System Access API.')
      return
    }
    try {
      const h = await pickDirectory({ startIn: 'documents' })
      const ok = await ensureRWPermission(h)
      if (!ok) return
      await articleSetRoot(h)
      await articleRefresh()
      void articleLoadPrompts(true)
      bootedRef.current = false // re-trigger auto-open effect
      toast.success('Writing-Workflow linked.')
    } catch (e) {
      if ((e as DOMException)?.name !== 'AbortError') toast.error((e as Error).message)
    }
  }, [articleSetRoot, articleRefresh, articleLoadPrompts])

  const createToday = useCallback(async () => {
    const title = window.prompt("Title for today's article:")
    if (!title || !title.trim()) return
    const ref = await articleCreateToday(title.trim())
    if (!ref) {
      toast.error('Could not create article. Did you pick the workflow folder?')
      return
    }
    // The store already set the current ref. Mirror to local editor state.
    const fh = useArticleStore.getState().currentHandle
    const text = useArticleStore.getState().currentText
    if (fh) setFileHandle(fh)
    setFileName(ref.filename)
    setMarkdown(text)
    editorRef.current?.setMarkdown(text)
    setDirty(false)
    setShowTodayEmpty(false)
    toast.success(`Created ${ref.filename}`)
  }, [articleCreateToday])

  const onOpenCompanion = useCallback(async (kind: CompanionKind) => {
    const text = await articleLoadCompanion(kind)
    if (text == null) {
      toast.error(`No ${kind} companion for this article yet.`)
      return
    }
    setFileHandle(null) // companions aren't tracked as the article handle
    setFileName(`${articleCurrent?.slug || 'companion'}-${kind}.md`)
    setMarkdown(text)
    editorRef.current?.setMarkdown(text)
    setDirty(false)
    setShowTodayEmpty(false)
    toast.message(`Viewing ${kind} companion (read-only edits won't save back)`)
  }, [articleLoadCompanion, articleCurrent])

  const onSendCompanionToChat = useCallback(async (kind: CompanionKind) => {
    const text = await articleLoadCompanion(kind)
    if (text == null) {
      toast.error(`No ${kind} companion for this article yet.`)
      return
    }
    setChatOpen(true)
    const cs = useChatStore.getState()
    if (!cs.activeThreadId) {
      if (!cs.rootDir) {
        toast.error('Pick a chat folder first to start a thread.')
        return
      }
      try {
        const id = await cs.newThread('text')
        await cs.selectThread(id)
      } catch (e) {
        toast.error((e as Error).message)
        return
      }
    }
    // Defer to next frame so ThreadView mounts and its listener attaches.
    // Strip embedded base64 images — companions saved from the editor can carry
    // huge data URLs that would balloon the prompt.
    const cleaned = stripBase64Images(text)
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent('chat:prefill', { detail: { text: cleaned } }))
    })
  }, [articleLoadCompanion])

  /* ─── disk file actions ─── */
  const handleOpen = useCallback(async () => {
    if (!fsAccessSupported()) {
      toast.error('Your browser does not support the File System Access API. Use Chromium.')
      return
    }
    if (dirty && !window.confirm('Discard unsaved changes?')) return
    try {
      const { handle, name, text } = await openMarkdownFile()
      setFileHandle(handle)
      setFileName(name)
      setMarkdown(text)
      editorRef.current?.setMarkdown(text)
      setDirty(false)
      setShowTodayEmpty(false)
      toast.success(`Opened ${name}`)
    } catch (e) {
      if ((e as DOMException)?.name !== 'AbortError') toast.error((e as Error).message)
    }
  }, [dirty])

  const handleSave = useCallback(async () => {
    const md = editorRef.current?.getMarkdown() ?? markdown
    try {
      // If this is an article tracked by articleStore, route through it (keeps state in sync).
      if (articleCurrent && fileHandle && fileHandle.name === articleCurrent.filename) {
        await articleSaveCurrent(md)
      } else if (fileHandle) {
        await saveMarkdownFile(fileHandle, md)
      } else {
        const h = await saveAsMarkdownFile(md, fileName || 'untitled.md')
        setFileHandle(h)
        setFileName(h.name)
      }
      toast.success('Saved')
      setDirty(false)
      editorRef.current?.markClean()
    } catch (e) {
      if ((e as DOMException)?.name !== 'AbortError') toast.error((e as Error).message)
    }
  }, [fileHandle, fileName, markdown, articleCurrent, articleSaveCurrent])

  const handleSaveAs = useCallback(async () => {
    const md = editorRef.current?.getMarkdown() ?? markdown
    try {
      const h = await saveAsMarkdownFile(md, fileName || 'untitled.md')
      setFileHandle(h)
      setFileName(h.name)
      setDirty(false)
      editorRef.current?.markClean()
      toast.success('Saved')
    } catch (e) {
      if ((e as DOMException)?.name !== 'AbortError') toast.error((e as Error).message)
    }
  }, [fileName, markdown])

  const copyForPlatform = useCallback(async (kind: 'substack' | 'linkedin') => {
    const editor = editorRef.current?.editor
    if (!editor) return
    const html = editor.getHTML()
    const md = editorRef.current?.getMarkdown() ?? ''
    const out = kind === 'substack' ? transformForSubstack(html) : transformForLinkedIn(html)
    try {
      await writeRichClipboard(out, md)
      const imageCount = (out.match(/<img\b/gi) || []).length
      toast.success(
        `Copied for ${kind === 'substack' ? 'Substack' : 'LinkedIn'}` +
          (imageCount > 0 ? `. ${imageCount} images will need re-uploading after pasting.` : '. Paste into the platform composer.'),
      )
    } catch (e) {
      toast.error('Clipboard write failed: ' + (e as Error).message)
    }
  }, [])

  useHotkeys({
    onOpen: handleOpen,
    onSave: handleSave,
    onCopy: () => copyForPlatform(theme === 'substack' ? 'substack' : 'linkedin'),
    onToggleChat: () => setChatOpen((v) => !v),
    onToggleMode: () => {
      const s = useChatStore.getState()
      if (!s.activeThreadId) return
      const t = s.threads.find((x) => x.id === s.activeThreadId)
      if (!t) return
      s.setMode(t.mode === 'image' ? 'text' : 'image')
    },
    onStop: () => useChatStore.getState().stopStream(),
  })

  const onInsertText = useCallback((md: string) => {
    editorRef.current?.insertMarkdown(md)
    toast.success('Inserted into article')
  }, [])

  /**
   * Drop handler for chat images — keeps the image in its chat-thread folder
   * (per the user's decision) and inserts a relative reference into the article.
   * Falls back to a base64 data URL if we can't compute a clean relative path.
   */
  const resolveChatImageSrc = useCallback(async (payload: ChatImageDragPayload): Promise<string | null> => {
    try {
      const cs = useChatStore.getState()
      const thread = cs.threads.find((t) => t.id === payload.threadId)
      if (!thread?.dirHandle) return null
      const fname = payload.relPath.replace(/^\.\//, '')
      const fileHandle2 = await thread.dirHandle.getFileHandle(fname)
      const file = await fileHandle2.getFile()
      // For now, embed as data URL — same approach as the click-Insert path.
      // (Article handle doesn't expose a usable filesystem path in the browser
      // sandbox, so a relative chats/.../NN.png reference can't be resolved.)
      const reader = new FileReader()
      const dataUrl: string = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
      })
      return dataUrl
    } catch (e) {
      console.error('resolveChatImageSrc failed', e)
      return null
    }
  }, [])

  const onInsertImage = useCallback(async (rel: string, alt: string, threadDir: FileSystemDirectoryHandle) => {
    if (!fileHandle) {
      const fname = rel.replace(/^\.\//, '')
      const src = await threadDir.getFileHandle(fname).then((h) => h.getFile())
      const reader = new FileReader()
      const dataUrl: string = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(src)
      })
      editorRef.current?.insertImage(dataUrl, alt)
      toast.message('Inserted as embedded data URL (no article file open).')
      return
    }
    try {
      const dataUrl = await copyImageNearArticle(threadDir, rel, fileHandle)
      editorRef.current?.insertImage(dataUrl, alt)
      toast.success('Inserted image into article')
    } catch (e) {
      toast.error('Insert failed: ' + (e as Error).message)
    }
  }, [fileHandle])

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  if (!config) return <SetupScreen missing={missing} />

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        editor={editorInstance}
        theme={theme}
        onThemeChange={setTheme}
        onOpen={handleOpen}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onCopySubstack={() => copyForPlatform('substack')}
        onCopyLinkedIn={() => copyForPlatform('linkedin')}
        onToggleChat={() => setChatOpen((v) => !v)}
        fileName={fileName}
        dirty={dirty}
        onPickWorkflow={pickWorkflowRoot}
        onOpenArticleRef={openArticleRef}
        onCreateToday={createToday}
        onOpenCompanion={onOpenCompanion}
        onSendCompanionToChat={onSendCompanionToChat}
      />
      <div className="flex flex-1 min-h-0">
        <main className="thin-scroll flex-1 overflow-y-auto bg-paper">
          {showTodayEmpty ? (
            <TodayEmptyState
              latest={articleLatestRef}
              onCreateToday={createToday}
              onOpenLatest={
                articleLatestRef
                  ? () => void openArticleRef(articleLatestRef)
                  : undefined
              }
            />
          ) : (
            <MarkdownEditor
              ref={editorRef}
              initialMarkdown={markdown}
              theme={theme}
              onChange={() => setDirty(true)}
              onReady={setEditorInstance}
              resolveChatImageSrc={resolveChatImageSrc}
            />
          )}
        </main>
        <ChatPanel
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          onInsertText={onInsertText}
          onInsertImage={onInsertImage}
        />
      </div>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--color-paper)',
            color: 'var(--color-ink)',
            border: '1px solid var(--color-rule)',
            borderRadius: 0,
            fontFamily: 'var(--font-sans)',
            fontSize: 12,
            letterSpacing: '-0.005em',
          },
        }}
      />
    </div>
  )
}

