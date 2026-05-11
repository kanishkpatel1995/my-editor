import { Sparkles, PenLine, Lightbulb } from 'lucide-react'
import { useArticleStore } from '../../store/articleStore'
import { useChatStore } from '../../store/chatStore'
import { isImageCapable } from '../../lib/openrouter'
import { composePromptInput } from '../../lib/prompts'
import { cn } from '../../lib/cn'
import { useEffect } from 'react'

interface Props {
  onPrefill: (text: string) => void
  onWebToggle: (on: boolean) => void
}

/**
 * Three one-click recipes that combine prompt + article context + mode + (optional)
 * model swap + web search. They light up only when meaningful.
 */
export function QuickRecipes({ onPrefill, onWebToggle }: Props) {
  const prompts = useArticleStore((s) => s.prompts)
  const loadPromptsIfStale = useArticleStore((s) => s.loadPromptsIfStale)
  const current = useArticleStore((s) => s.current)
  const currentText = useArticleStore((s) => s.currentText)
  const setMode = useChatStore((s) => s.setMode)
  const setModel = useChatStore((s) => s.setModel)
  const models = useChatStore((s) => s.models)
  const config = useChatStore((s) => s.config)
  const activeThreadId = useChatStore((s) => s.activeThreadId)
  const threads = useChatStore((s) => s.threads)
  const activeThread = threads.find((t) => t.id === activeThreadId)

  useEffect(() => {
    void loadPromptsIfStale()
  }, [loadPromptsIfStale])

  const findPrompt = (id: string) => prompts.find((p) => p.id === id)

  const runDiagram = () => {
    const p = findPrompt('03-diagram')
    if (!p || !current) return
    const composed = composePromptInput({
      prompt: p,
      articleBody: currentText,
      articleSlug: current.slug,
      appendArticle: true,
    })
    if (activeThread?.mode !== 'image') setMode('image')
    const haveImage = models.some((m) => m.id === activeThread?.model && isImageCapable(m))
    if (!haveImage && config?.defaultImageModel) setModel(config.defaultImageModel)
    onWebToggle(false)
    onPrefill(composed)
  }

  const runLinkedIn = () => {
    const p = findPrompt('05-linkedin')
    if (!p || !current) return
    const composed = composePromptInput({
      prompt: p,
      articleBody: currentText,
      articleSlug: current.slug,
      appendArticle: true,
    })
    if (activeThread?.mode === 'image') setMode('text')
    onWebToggle(false)
    onPrefill(composed)
  }

  const runIdeate = () => {
    const p = findPrompt('01-ideation')
    if (!p) return
    const composed = composePromptInput({
      prompt: p,
      appendArticle: false,
    })
    if (activeThread?.mode === 'image') setMode('text')
    onWebToggle(true)
    onPrefill(composed)
  }

  const recipes = [
    {
      key: 'diagram',
      icon: <Sparkles size={11} />,
      label: 'Diagram for this',
      onClick: runDiagram,
      enabled: !!current && !!findPrompt('03-diagram'),
      hint: 'image · 03 + article',
    },
    {
      key: 'linkedin',
      icon: <PenLine size={11} />,
      label: 'LinkedIn promo',
      onClick: runLinkedIn,
      enabled: !!current && !!findPrompt('05-linkedin'),
      hint: 'text · 05 + article',
    },
    {
      key: 'ideate',
      icon: <Lightbulb size={11} />,
      label: 'Ideate',
      onClick: runIdeate,
      enabled: !!findPrompt('01-ideation'),
      hint: 'text · 01 + web',
    },
  ]

  return (
    <div className="flex items-center gap-1.5 border-b border-rule-soft px-3 py-1.5">
      <span className="label-eyebrow">Quick</span>
      <div className="flex flex-wrap items-center gap-1">
        {recipes.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={r.onClick}
            disabled={!r.enabled}
            title={r.enabled ? r.hint : 'Open an article + load prompts first'}
            className={cn(
              'inline-flex h-6 items-center gap-1 border px-1.5 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors duration-150',
              r.enabled
                ? 'border-rule-soft text-ink-soft hover:border-ink hover:text-ink hover:bg-paper-2'
                : 'border-rule-soft/50 text-mute/60 cursor-not-allowed',
            )}
          >
            {r.icon}
            <span>{r.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
