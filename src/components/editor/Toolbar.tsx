import {
  Bold, Italic, Strikethrough, Code, Link as LinkIcon,
  Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Minus, Image as ImageIcon,
  FolderOpen, Save, MessageCircle, ChevronDown, Hammer,
} from 'lucide-react'
import type { Editor } from '@tiptap/react'
import type { ArticleRef, CompanionKind, Theme } from '../../types'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { NowEditingChip } from './NowEditingChip'
import { CompanionsMenu } from './CompanionsMenu'

interface ToolbarProps {
  editor: Editor | null
  theme: Theme
  onThemeChange: (t: Theme) => void
  onOpen: () => void
  onSave: () => void
  onSaveAs: () => void
  onCopySubstack: () => void
  onCopyLinkedIn: () => void
  onToggleChat: () => void
  onToggleAnvil: () => void
  fileName: string | null
  dirty: boolean
  /** Workflow integrations. If absent, the chip + companions menu still render but with limited actions. */
  onPickWorkflow?: () => void | Promise<void>
  onOpenArticleRef?: (ref: ArticleRef) => void | Promise<void>
  onCreateToday?: () => void | Promise<void>
  onOpenCompanion?: (kind: CompanionKind) => void | Promise<void>
  onSendCompanionToChat?: (kind: CompanionKind) => void | Promise<void>
}

export function Toolbar(props: ToolbarProps) {
  const { editor, theme, onThemeChange, fileName, dirty } = props

  const sep = <div className="mx-1 h-5 w-px bg-rule-soft" />

  const promptForLink = () => {
    if (!editor) return
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('URL', prev || 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  const promptForImage = () => {
    if (!editor) return
    const url = window.prompt('Image URL', 'https://')
    if (!url) return
    const alt = window.prompt('Alt text', '') || ''
    editor.chain().focus().setImage({ src: url, alt }).run()
  }

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b border-rule bg-paper px-3 py-2">
      <NowEditingChip
        onOpenArticle={(r) => props.onOpenArticleRef?.(r)}
        onCreateToday={() => props.onCreateToday?.()}
        onPickRoot={() => props.onPickWorkflow?.()}
      />
      {sep}
      <Button variant="ghost" size="sm" onClick={props.onOpen} leading={<FolderOpen size={14} />} title="Open .md (⌘O)">
        Open
      </Button>
      <Button variant="ghost" size="sm" onClick={props.onSave} leading={<Save size={14} />} title="Save (⌘S)">
        <span className="flex items-center gap-1.5">
          Save
          {dirty ? (
            <span
              aria-label="unsaved changes"
              title="unsaved changes"
              className="block h-1.5 w-1.5 bg-vermilion"
            />
          ) : null}
        </span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={props.onSaveAs}
        title="Save As"
        className="hidden sm:inline-flex"
      >
        Save As…
      </Button>

      {sep}

      <IconButton size="sm" icon={<Bold size={14} />} label="Bold" title="Bold (⌘B)"
        pressed={!!editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()} />
      <IconButton size="sm" icon={<Italic size={14} />} label="Italic" title="Italic (⌘I)"
        pressed={!!editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()} />
      <IconButton size="sm" icon={<Strikethrough size={14} />} label="Strikethrough"
        pressed={!!editor?.isActive('strike')} onClick={() => editor?.chain().focus().toggleStrike().run()} />
      <IconButton size="sm" icon={<Code size={14} />} label="Inline code"
        pressed={!!editor?.isActive('code')} onClick={() => editor?.chain().focus().toggleCode().run()} />
      <IconButton size="sm" icon={<LinkIcon size={14} />} label="Link" title="Link (⌘K)"
        pressed={!!editor?.isActive('link')} onClick={promptForLink} />

      {sep}

      <IconButton size="sm" icon={<Heading1 size={14} />} label="H1"
        pressed={!!editor?.isActive('heading', { level: 1 })}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} />
      <IconButton size="sm" icon={<Heading2 size={14} />} label="H2"
        pressed={!!editor?.isActive('heading', { level: 2 })}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} />
      <IconButton size="sm" icon={<Heading3 size={14} />} label="H3"
        pressed={!!editor?.isActive('heading', { level: 3 })}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} />

      {sep}

      <IconButton size="sm" icon={<List size={14} />} label="Bullet list"
        pressed={!!editor?.isActive('bulletList')}
        onClick={() => editor?.chain().focus().toggleBulletList().run()} />
      <IconButton size="sm" icon={<ListOrdered size={14} />} label="Numbered list"
        pressed={!!editor?.isActive('orderedList')}
        onClick={() => editor?.chain().focus().toggleOrderedList().run()} />
      <IconButton size="sm" icon={<Quote size={14} />} label="Blockquote"
        pressed={!!editor?.isActive('blockquote')}
        onClick={() => editor?.chain().focus().toggleBlockquote().run()} />
      <IconButton size="sm" icon={<Minus size={14} />} label="Horizontal rule"
        onClick={() => editor?.chain().focus().setHorizontalRule().run()} />
      <IconButton size="sm" icon={<ImageIcon size={14} />} label="Image" onClick={promptForImage} />

      <div className="ml-auto flex items-center gap-2">
        <span
          className="hidden max-w-[28ch] truncate font-mono text-[10px] uppercase tracking-[0.08em] text-mute sm:inline"
          title={fileName ?? undefined}
        >
          {fileName || 'no file'}
        </span>

        <CompanionsMenu
          onOpen={(k) => props.onOpenCompanion?.(k)}
          onSendToChat={(k) => props.onSendCompanionToChat?.(k)}
        />

        <ThemeSwitcher theme={theme} onChange={onThemeChange} />

        <Button
          variant="primary"
          size="sm"
          onClick={theme === 'substack' ? props.onCopySubstack : props.onCopyLinkedIn}
          title="Copy for the active platform (⌘⇧C)"
        >
          Copy for {theme === 'substack' ? 'Substack' : 'LinkedIn'}
        </Button>

        <IconButton
          size="sm"
          icon={<Hammer size={14} />}
          label="Toggle ANVIL"
          title="Toggle ANVIL — adversarial review (⌘L)"
          onClick={props.onToggleAnvil}
          className="text-vermilion hover:bg-vermilion-tint"
        />
        <IconButton
          size="sm"
          icon={<MessageCircle size={14} />}
          label="Toggle chat"
          title="Toggle chat (⌘J)"
          onClick={props.onToggleChat}
        />
      </div>
    </div>
  )
}

function ThemeSwitcher({ theme, onChange }: { theme: Theme; onChange: (t: Theme) => void }) {
  return (
    <label className="relative flex h-7 items-center border border-rule bg-paper px-2 text-[11px] uppercase tracking-[0.08em] text-ink-soft transition-colors hover:border-ink hover:text-ink">
      <span className="font-mono">{theme === 'substack' ? 'SUBSTACK' : 'LINKEDIN'}</span>
      <ChevronDown size={11} className="ml-1.5 text-mute" />
      <select
        value={theme}
        onChange={(e) => onChange(e.target.value as Theme)}
        className="absolute inset-0 opacity-0"
        aria-label="Theme"
      >
        <option value="substack">Substack</option>
        <option value="linkedin">LinkedIn</option>
      </select>
    </label>
  )
}
