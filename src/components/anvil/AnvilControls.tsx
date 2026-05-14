import { Play, Pause, Square, Download } from 'lucide-react'
import { Button } from '../ui/Button'
import { useAnvilStore } from '../../store/anvilStore'
import { useArticleStore } from '../../store/articleStore'
import { toast } from 'sonner'
import { serializeAnvilSession } from '../../lib/anvil-storage'

export function AnvilControls() {
  const isRunning = useAnvilStore((s) => s.isRunning)
  const isPaused = useAnvilStore((s) => s.isPaused)
  const session = useAnvilStore((s) => s.session)
  const start = useAnvilStore((s) => s.start)
  const pause = useAnvilStore((s) => s.pause)
  const resume = useAnvilStore((s) => s.resume)
  const stop = useAnvilStore((s) => s.stop)
  const article = useArticleStore((s) => s.current)

  const canStart = !!article && !isRunning
  const canExport = !!session

  const onStart = async () => {
    if (!article) {
      toast.error('Open an article first.')
      return
    }
    await start()
  }

  const onExport = async () => {
    if (!session) return
    const md = serializeAnvilSession(session)
    await navigator.clipboard.writeText(md)
    toast.success('Copied ANVIL session markdown to clipboard.')
  }

  return (
    <div className="flex items-center gap-1.5 border-b border-rule-soft px-3 py-2">
      {!isRunning ? (
        <Button
          variant="primary"
          size="sm"
          leading={<Play size={11} />}
          onClick={onStart}
          disabled={!canStart}
          title={!article ? 'Open an article first' : (session ? 'Resume / re-run' : 'Start ANVIL pass')}
        >
          {session ? 'Resume' : 'Start'}
        </Button>
      ) : isPaused ? (
        <Button variant="primary" size="sm" leading={<Play size={11} />} onClick={() => void resume()}>
          Resume
        </Button>
      ) : (
        <Button variant="ghost" size="sm" leading={<Pause size={11} />} onClick={pause}>
          Pause
        </Button>
      )}
      {isRunning ? (
        <Button variant="ghost" size="sm" leading={<Square size={11} />} onClick={stop}>
          Stop
        </Button>
      ) : null}
      <div className="ml-auto" />
      <Button
        variant="ghost"
        size="sm"
        leading={<Download size={11} />}
        onClick={onExport}
        disabled={!canExport}
        title="Copy session markdown"
      >
        Export
      </Button>
    </div>
  )
}
