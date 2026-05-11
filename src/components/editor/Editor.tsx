import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import { Markdown } from 'tiptap-markdown'
import { useEffect, useImperativeHandle, forwardRef, useRef } from 'react'
import type { Theme } from '../../types'

export interface EditorHandle {
  getMarkdown: () => string
  setMarkdown: (md: string) => void
  insertMarkdown: (md: string) => void
  insertImage: (src: string, alt?: string) => void
  editor: Editor | null
  isDirty: () => boolean
  markClean: () => void
}

/** Payload of an image drag from the chat panel. */
export interface ChatImageDragPayload {
  threadId: string
  relPath: string
  /** Object URL is set on dataTransfer too (text/uri-list) for fallback drop. */
}

interface EditorProps {
  initialMarkdown: string
  theme: Theme
  onChange?: (markdown: string) => void
  onReady?: (editor: Editor) => void
  /**
   * Called when a chat image is dropped onto the editor. Should resolve to the
   * src string to insert at the drop point (e.g. a relative path like
   * `../../chats/.../01.png` or a data URL fallback).
   */
  resolveChatImageSrc?: (payload: ChatImageDragPayload) => Promise<string | null>
}

export const MarkdownEditor = forwardRef<EditorHandle, EditorProps>(function MarkdownEditor(
  { initialMarkdown, theme, onChange, onReady, resolveChatImageSrc },
  ref,
) {
  const dirtyRef = useRef(false)
  const lastInitialRef = useRef(initialMarkdown)
  const resolverRef = useRef(resolveChatImageSrc)
  resolverRef.current = resolveChatImageSrc

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: false,
        codeBlock: { HTMLAttributes: { class: 'pre-block' } },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer' },
      }),
      Image.configure({ inline: false, allowBase64: true }),
      Markdown.configure({
        html: false,
        tightLists: true,
        linkify: true,
        breaks: false,
        bulletListMarker: '-',
      }),
    ],
    content: initialMarkdown,
    onUpdate: ({ editor }) => {
      dirtyRef.current = true
      const md = (editor.storage as { markdown?: { getMarkdown: () => string } }).markdown?.getMarkdown() ?? ''
      onChange?.(md)
    },
    editorProps: {
      handleDrop(view, event, _slice, moved) {
        if (moved) return false
        const data = event.dataTransfer?.getData('application/x-myeditor-image')
        if (!data) return false
        const payload = (() => {
          try {
            return JSON.parse(data) as ChatImageDragPayload
          } catch {
            return null
          }
        })()
        if (!payload) return false
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
        if (pos == null) return false
        const resolver = resolverRef.current
        event.preventDefault()
        ;(async () => {
          const src = (await resolver?.(payload)) ?? event.dataTransfer?.getData('text/uri-list') ?? null
          if (!src) return
          const node = view.state.schema.nodes.image.create({ src, alt: '' })
          view.dispatch(view.state.tr.insert(pos, node))
        })()
        return true
      },
    },
  })

  useEffect(() => {
    if (!editor) return
    onReady?.(editor)
  }, [editor, onReady])

  useEffect(() => {
    if (!editor) return
    if (initialMarkdown !== lastInitialRef.current) {
      lastInitialRef.current = initialMarkdown
      editor.commands.setContent(initialMarkdown, { emitUpdate: false })
      dirtyRef.current = false
    }
  }, [initialMarkdown, editor])

  useImperativeHandle(ref, () => ({
    editor,
    getMarkdown: () =>
      (editor?.storage as { markdown?: { getMarkdown: () => string } } | undefined)?.markdown?.getMarkdown() ?? '',
    setMarkdown: (md: string) => {
      editor?.commands.setContent(md, { emitUpdate: false })
      dirtyRef.current = false
      lastInitialRef.current = md
    },
    insertMarkdown: (md: string) => {
      // tiptap-markdown can parse via the inserted content path
      editor?.commands.insertContent(md)
      dirtyRef.current = true
    },
    insertImage: (src: string, alt = '') => {
      editor?.chain().focus().setImage({ src, alt }).run()
      dirtyRef.current = true
    },
    isDirty: () => dirtyRef.current,
    markClean: () => {
      dirtyRef.current = false
    },
  }), [editor])

  return (
    <div data-theme={theme} className="editor-canvas-wrap">
      <div className="editor-canvas">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
})
