import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Plus, Check, FolderOpen } from 'lucide-react'
import { useArticleStore } from '../../store/articleStore'
import { chipLabel, currentWeekFolderName } from '../../lib/workflow'
import type { ArticleRef } from '../../types'
import { cn } from '../../lib/cn'

interface Props {
  /** Open an article (caller wires this to article-store + editor swap). */
  onOpenArticle: (ref: ArticleRef) => void | Promise<void>
  /** Prompt for a title and create today's article. */
  onCreateToday: () => void | Promise<void>
  /** Prompt the user to pick the Writing-Workflow root (first run). */
  onPickRoot: () => void | Promise<void>
}

/**
 * The "now editing" chip in the toolbar — also serves as the article picker
 * dropdown (today, latest, this week, a way to create today, and a fallback to
 * pick the workflow root if not set up yet).
 */
export function NowEditingChip({ onOpenArticle, onCreateToday, onPickRoot }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  const rootDir = useArticleStore((s) => s.rootDir)
  const current = useArticleStore((s) => s.current)
  const todayRef = useArticleStore((s) => s.todayRef)
  const latestRef = useArticleStore((s) => s.latestRef)
  const weekArticles = useArticleStore((s) => s.weekArticles)
  const weekFolder = useArticleStore((s) => s.weekFolder)
  const refreshDetection = useArticleStore((s) => s.refreshDetection)

  useEffect(() => {
    if (!open) return
    void refreshDetection()
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open, refreshDetection])

  const labelText = (() => {
    if (!rootDir) return 'PICK WORKFLOW'
    if (current) return chipLabel(current)
    if (todayRef) return chipLabel(todayRef)
    if (latestRef) return chipLabel(latestRef)
    return 'NO ARTICLE'
  })()

  const labelTone = (() => {
    if (!rootDir) return 'border-vermilion text-vermilion'
    if (current && todayRef && current.filename === todayRef.filename) return 'border-ink text-ink'
    if (current) return 'border-rule text-ink'
    return 'border-rule-soft text-ink-soft'
  })()

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex h-7 items-center gap-1.5 border bg-paper px-2 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors duration-150 hover:bg-paper-2',
          labelTone,
        )}
        title={current?.filename || 'Select an article'}
      >
        <span className="inline-block h-1.5 w-1.5 bg-current" />
        <span>{labelText}</span>
        <ChevronDown size={11} className={cn('text-mute transition-transform duration-150', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="animate-fade-in absolute left-0 z-50 mt-1 w-[22rem] border border-ink bg-paper shadow-[var(--shadow-lift)]">
          {!rootDir ? (
            <div className="p-3">
              <div className="label-eyebrow mb-1">Workflow</div>
              <p className="mb-2 text-[12px] text-ink-soft">
                Pick the <code className="font-mono text-ink">Writing-Workflow</code> folder once to enable today's article + companions + prompts.
              </p>
              <button
                type="button"
                onClick={() => { setOpen(false); void onPickRoot() }}
                className="inline-flex h-7 items-center gap-1.5 border border-vermilion bg-vermilion-tint px-2 font-mono text-[10px] uppercase tracking-[0.08em] text-vermilion hover:bg-vermilion hover:text-paper"
              >
                <FolderOpen size={11} /> Pick Writing-Workflow
              </button>
            </div>
          ) : (
            <>
              <Section label="Today">
                {todayRef ? (
                  <Row
                    label={todayRef.filename}
                    selected={current?.filename === todayRef.filename}
                    onClick={() => { setOpen(false); void onOpenArticle(todayRef) }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => { setOpen(false); void onCreateToday() }}
                    className="flex w-full items-center gap-1.5 border-b border-rule-soft bg-paper px-3 py-2 text-left text-[12px] tracking-tight text-vermilion hover:bg-paper-2"
                  >
                    <Plus size={11} />
                    <span>Create today's article</span>
                  </button>
                )}
              </Section>

              {latestRef && latestRef.filename !== todayRef?.filename ? (
                <Section label="Latest">
                  <Row
                    label={latestRef.filename}
                    selected={current?.filename === latestRef.filename}
                    onClick={() => { setOpen(false); void onOpenArticle(latestRef) }}
                  />
                </Section>
              ) : null}

              {weekArticles.length > 0 ? (
                <Section label={`This week · ${weekFolder.replace('week-of-', '')}`}>
                  {weekArticles.map((a) => (
                    <Row
                      key={a.filename}
                      label={a.filename}
                      selected={current?.filename === a.filename && current?.weekFolder === a.weekFolder}
                      onClick={() => { setOpen(false); void onOpenArticle(a) }}
                    />
                  ))}
                </Section>
              ) : (
                <Section label={`This week · ${currentWeekFolderName()}`}>
                  <div className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-mute">
                    no articles yet
                  </div>
                </Section>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="border-b border-rule-soft bg-paper-2 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
        {label}
      </div>
      {children}
    </div>
  )
}

function Row({ label, selected, onClick }: { label: string; selected?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-1.5 border-b border-rule-soft px-3 py-1.5 text-left text-[12px] tracking-tight transition-colors duration-150 last:border-b-0',
        selected ? 'bg-paper-2 text-ink' : 'text-ink-soft hover:bg-paper-2 hover:text-ink',
      )}
    >
      <span className="flex h-3 w-3 items-center justify-center text-vermilion">
        {selected ? <Check size={11} /> : null}
      </span>
      <span className="truncate font-mono">{label}</span>
    </button>
  )
}
