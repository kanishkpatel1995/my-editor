import type { AnvilSession } from '../../types'

interface Props {
  session: AnvilSession | null
}

/**
 * Top strip of the ANVIL panel: progress bar + four metric chips
 * (SLOP-INDEX, SYCOPHANCY-σ, COG-DEBT-Δ, COMP-RATE).
 */
export function AnvilMetricsHeader({ session }: Props) {
  const total = session?.paragraphs.length ?? 0
  const done = session?.paragraphs.filter((p) =>
    p.status === 'analysed' || p.status === 'skipped' || p.status === 'failed',
  ).length ?? 0
  const pct = total ? Math.round((done / total) * 100) : 0

  const slop = session?.metrics.slopOverall
  const halls = session?.metrics.hallucinations ?? 0
  const yes = session?.metrics.comprehensionYes ?? 0
  const no = session?.metrics.comprehensionNo ?? 0
  const compTotal = yes + no
  const band = session?.metrics.aiMarkersBand ?? 'low'
  const bandLabel = band === 'high' ? 'HIGH' : band === 'medium' ? 'MED' : 'LOW'
  const bandClass = band === 'high'
    ? 'text-vermilion'
    : band === 'medium'
      ? 'text-ink'
      : 'text-ink-soft'

  return (
    <div className="border-b border-rule-soft bg-paper">
      {/* Progress */}
      <div className="px-3 pt-2">
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-mute">
          <span>ANVIL · v1</span>
          <span>{done} / {total} ¶ · {pct}%</span>
        </div>
        <div className="mt-1 h-[2px] w-full bg-paper-2">
          <div
            className="h-full bg-vermilion transition-[width] duration-200 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Metric chips */}
      <div className="grid grid-cols-4 gap-px px-3 py-2 bg-rule-soft">
        <MetricCell label="SLOP-INDEX" value={slop != null ? slop.toFixed(1) : '—'} suffix={slop != null ? '/10' : ''} />
        <MetricCell label="HALLUCS" value={String(halls)} suffix=" claims" emphasize={halls > 0} />
        <MetricCell label="COMP-RATE" value={compTotal ? `${yes}/${compTotal}` : '—'} />
        <MetricCell label="AI-MARKERS" value={bandLabel} valueClass={bandClass} />
      </div>
    </div>
  )
}

function MetricCell({
  label, value, suffix, valueClass, emphasize,
}: {
  label: string
  value: string
  suffix?: string
  valueClass?: string
  emphasize?: boolean
}) {
  return (
    <div className="bg-paper p-1.5">
      <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-mute">{label}</div>
      <div className={`font-mono text-[14px] tracking-tight ${valueClass || (emphasize ? 'text-vermilion' : 'text-ink')}`}>
        {value}<span className="text-mute text-[10px]">{suffix || ''}</span>
      </div>
    </div>
  )
}
