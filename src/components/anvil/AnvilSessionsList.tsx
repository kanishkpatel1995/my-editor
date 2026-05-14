import { useEffect } from 'react'
import { ArrowLeft, Eye, FileText, RefreshCw } from 'lucide-react'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { useAnvilStore } from '../../store/anvilStore'
import { useArticleStore } from '../../store/articleStore'
import type { AnvilHistoryEntry } from '../../lib/anvil-history'
import { toast } from 'sonner'

/**
 * History list for ANVIL sessions. Mirrors `ThreadList` for chat: each row is
 * one .anvil.md session; two action buttons per row: open the article (loads
 * it in the editor too) or just view this proof in the panel.
 */
export function AnvilSessionsList() {
  const history = useAnvilStore((s) => s.history)
  const refreshHistory = useAnvilStore((s) => s.refreshHistory)
  const loadSession = useAnvilStore((s) => s.loadSessionFromDisk)
  const setShowList = useAnvilStore((s) => s.setShowSessionsList)
  const currentArticleSlug = useArticleStore((s) => s.current?.slug)
  const refreshDetection = useArticleStore((s) => s.refreshDetection)
  const articles = useArticleStore((s) => s.weekArticles)
  const openArticle = useArticleStore((s) => s.openArticle)

  useEffect(() => {
    void refreshHistory()
  }, [refreshHistory])

  const openArticleAndLoad = async (e: AnvilHistoryEntry) => {
    // Find the ArticleRef for this slug in the current week (or refresh to find it).
    let ref = articles.find((a) => a.slug === e.slug)
    if (!ref) {
      await refreshDetection()
      ref = useArticleStore.getState().weekArticles.find((a) => a.slug === e.slug)
    }
    if (!ref) {
      toast.error(`Couldn't locate article "${e.slug}.md" in the current week. Open it manually first.`)
      return
    }
    await openArticle(ref)
    await loadSession(e.slug)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-1.5 border-b border-rule-soft px-2.5 py-2">
        <Button
          variant="ghost"
          size="sm"
          leading={<ArrowLeft size={11} />}
          onClick={() => setShowList(false)}
        >
          Back
        </Button>
        <div className="ml-auto font-mono text-[10px] uppercase tracking-[0.08em] text-mute">
          {history.length} session{history.length === 1 ? '' : 's'}
        </div>
        <IconButton
          size="sm"
          icon={<RefreshCw size={11} />}
          label="Refresh"
          title="Re-scan proofs/ folder"
          onClick={() => void refreshHistory()}
        />
      </div>

      {/* List */}
      <div className="thin-scroll flex-1 overflow-y-auto">
        {history.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center font-mono text-[11px] uppercase tracking-[0.08em] text-mute">
            no proofs yet — run anvil on an article
          </div>
        ) : (
          history.map((e) => {
            const isCurrent = e.slug === currentArticleSlug
            return (
              <article
                key={e.slug}
                className={
                  'border-b border-rule-soft px-3 py-2 ' +
                  (isCurrent ? 'bg-vermilion-tint/30' : '')
                }
              >
                <header className="mb-1 flex items-baseline gap-2">
                  <span className={'font-mono text-[10px] tracking-tight ' + (isCurrent ? 'text-vermilion' : 'text-ink')}>
                    {isCurrent ? '◉' : '◯'} {e.slug}
                  </span>
                </header>
                <div className="font-mono text-[10px] text-mute">
                  {formatDate(e.finishedAt || e.startedAt)} · {e.paragraphsAnalysed}/{e.paragraphsTotal} ¶ · ${e.metrics.costUsd.toFixed(3)}
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-ink-soft">
                  SLOP {e.metrics.slopOverall != null ? e.metrics.slopOverall.toFixed(1) : '—'} ·
                  {' '}COMP {e.metrics.comprehensionYes}/{e.metrics.comprehensionYes + e.metrics.comprehensionNo + e.metrics.comprehensionSkip} ·
                  {' '}{e.metrics.aiMarkersBand.toUpperCase()}
                </div>
                <div className="mt-1.5 flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    leading={<FileText size={11} />}
                    onClick={() => void openArticleAndLoad(e)}
                    title="Open the article in the editor + load this session"
                  >
                    open article
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    leading={<Eye size={11} />}
                    onClick={() => void loadSession(e.slug)}
                    title="View this session in the panel only (don't change the editor)"
                  >
                    view here
                  </Button>
                </div>
              </article>
            )
          })
        )}
      </div>
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}
