import type { ReactNode } from 'react'
import { Callout } from './ui/Callout'
import { Button } from './ui/Button'
import { ExternalLink } from 'lucide-react'

interface Props {
  missing: string[]
}

const EXAMPLE = `# .env.local

VITE_OPENROUTER_API_KEY=sk-or-v1-replace-me

VITE_DEFAULT_MODEL=qwen/qwen3.5-flash-02-23
VITE_DEFAULT_IMAGE_MODEL=google/gemini-3.1-flash-image-preview
VITE_CHAT_FOLDER=~/Learn-Agentic-AI/Writing-Workflow/chats
VITE_MODEL_LIST_LIMIT=200
VITE_THREAD_COST_WARN_USD=1.00
`

export function SetupScreen({ missing }: Props) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="w-full max-w-xl animate-fade-in">
        <div className="label-eyebrow mb-2">Foundry · setup</div>
        <h1 className="mb-4 text-3xl font-medium tracking-tight text-ink">A few keys before we open the press</h1>
        <Callout
          tone="warn"
          title="Missing required env values"
          icon={<span>!</span>}
        >
          <p className="mb-3 text-sm text-ink-soft">
            Create a file named <code className="font-mono text-ink">.env.local</code> in the project root containing:
          </p>
          <pre className="mb-3 overflow-x-auto border border-rule-soft bg-paper-2 p-3 font-mono text-[11px] leading-relaxed text-ink">
{EXAMPLE}
          </pre>
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.08em] text-mute">
            missing: {missing.map((m) => <code key={m} className="text-brick">{m}</code>).reduce((acc, el, i) => i === 0 ? [el] : [...acc, ', ', el], [] as ReactNode[])}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => window.open('https://openrouter.ai/keys', '_blank', 'noopener')}
              trailing={<ExternalLink size={12} />}
            >
              Get an OpenRouter key
            </Button>
            <span className="font-mono text-[10px] text-mute">then restart npm run dev</span>
          </div>
        </Callout>
      </div>
    </div>
  )
}
