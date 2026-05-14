/**
 * ANVIL session persistence — one `.anvil.md` file per article, in a sibling
 * `proofs/` (or settable) folder. Markdown for grep-ability + a small JSON
 * sidecar for fast machine reads of the metrics.
 */

import type { AnvilParagraph, AnvilSession } from '../types'

export async function ensureAnvilFolder(
  workflowRoot: FileSystemDirectoryHandle,
): Promise<FileSystemDirectoryHandle> {
  return workflowRoot.getDirectoryHandle('proofs', { create: true })
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text)
  const h = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(h))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function quoteParagraph(text: string): string {
  return text.split('\n').map((l) => '> ' + l).join('\n')
}

export function serializeAnvilSession(s: AnvilSession): string {
  const fm = [
    '---',
    `anvil_session_id: ${s.id}`,
    `article: ${s.articlePath}`,
    `article_slug: ${s.articleSlug}`,
    `article_sha256: ${s.articleSha}`,
    `started: ${s.startedAt}`,
    `finished: ${s.finishedAt || 'in-progress'}`,
    `analyst_model: ${s.analystModel}`,
    `verifier_model: ${s.verifierModel}`,
    `explainer_model: ${s.explainerModel}`,
    `paragraphs_total: ${s.paragraphs.length}`,
    `paragraphs_analysed: ${s.paragraphs.filter((p) => p.status === 'analysed').length}`,
    'metrics:',
    `  slop_overall: ${s.metrics.slopOverall ?? 'null'}`,
    `  hallucinations: ${s.metrics.hallucinations}`,
    `  comprehension_yes: ${s.metrics.comprehensionYes}`,
    `  comprehension_no: ${s.metrics.comprehensionNo}`,
    `  comprehension_skip: ${s.metrics.comprehensionSkip}`,
    `  ai_markers_band: ${s.metrics.aiMarkersBand}`,
    `  cost_usd: ${s.metrics.costUsd.toFixed(4)}`,
    '---',
    '',
  ].join('\n')

  const parts: string[] = [fm]
  for (const p of s.paragraphs) {
    parts.push(`## ¶ ${String(p.index).padStart(2, '0')}\n`)
    parts.push(quoteParagraph(p.text) + '\n')
    if (p.status === 'skipped') {
      parts.push(`_skipped (${p.status})_\n`)
      continue
    }
    if (p.annotations.length) {
      parts.push('### Annotations\n')
      for (const a of p.annotations) {
        parts.push(`- ${a.span ? `"${a.span}" — ` : ''}${a.note}${a.accepted ? '  ✓' : ''}\n`)
      }
    }
    if (p.slop != null) {
      parts.push(`\n### Slop\n${p.slop} / 10${p.slopReason ? `\n${p.slopReason}` : ''}\n`)
    }
    if (p.claims.length) {
      parts.push('\n### Claims\n')
      for (const c of p.claims) {
        const v = c.verdict === 'verified-true' ? '[TRUE]'
                : c.verdict === 'verified-false' ? '[FALSE]'
                : c.verdict === 'inconclusive' ? '[INCONCLUSIVE]'
                : c.verdict === 'ok' ? '[ok]'
                : c.verdict === 'verify' ? '[verify]'
                : '[pending]'
        const src = c.sources?.length
          ? '\n  ' + c.sources.map((s) =>
              s.title || s.snippet
                ? `  - ${s.url} | ${s.title || ''}${s.snippet ? ` — ${s.snippet}` : ''}`
                : `  - ${s.url}`,
            ).join('\n  ')
          : ''
        parts.push(`- ${c.text} → ${v}${src}\n`)
      }
    }
    if (p.comprehension) {
      parts.push('\n### Comprehension\n')
      if (p.comprehension.isTransitional) {
        parts.push('_transitional paragraph, no question_\n')
      } else {
        parts.push(`Q: ${p.comprehension.question}\n`)
        parts.push(`A: ${p.comprehension.state}\n`)
        if (p.comprehension.socraticFollowup) {
          parts.push(`Socratic: ${p.comprehension.socraticFollowup}\n`)
        }
        if (p.comprehension.socraticAnswer) {
          parts.push(`Reader: ${p.comprehension.socraticAnswer}\n`)
        }
        if (p.comprehension.explanation) {
          parts.push(`Explanation: ${p.comprehension.explanation}\n`)
        }
      }
    }
    if (p.receipt) {
      parts.push(
        `\n### Receipt\n` +
        `model=${p.receipt.model}, ` +
        `tokens=${p.receipt.promptTokens}+${p.receipt.completionTokens}, ` +
        `latency_ms=${p.receipt.latencyMs}, ` +
        `cost_usd=$${p.receipt.costUsd.toFixed(4)}\n`,
      )
    }
    parts.push('\n---\n\n')
  }
  return parts.join('\n')
}

export async function writeAnvilSession(
  proofsDir: FileSystemDirectoryHandle,
  slug: string,
  s: AnvilSession,
): Promise<void> {
  const filename = `${slug}.anvil.md`
  const fh = await proofsDir.getFileHandle(filename, { create: true })
  const w = await fh.createWritable()
  await w.write(serializeAnvilSession(s))
  await w.close()

  // JSON sidecar for fast metrics reads
  const jsonFh = await proofsDir.getFileHandle(`${slug}.anvil.json`, { create: true })
  const jw = await jsonFh.createWritable()
  await jw.write(JSON.stringify(s, replacerSkipHandles, 2))
  await jw.close()
}

function replacerSkipHandles(_key: string, value: unknown): unknown {
  if (value instanceof FileSystemDirectoryHandle) return undefined
  if (value instanceof FileSystemFileHandle) return undefined
  return value
}

export async function readAnvilSession(
  proofsDir: FileSystemDirectoryHandle,
  slug: string,
): Promise<AnvilSession | null> {
  try {
    const fh = await proofsDir.getFileHandle(`${slug}.anvil.json`)
    const file = await fh.getFile()
    const text = await file.text()
    return JSON.parse(text) as AnvilSession
  } catch {
    return null
  }
}

/** Recompute metrics from a list of paragraphs. Pure. */
export function computeMetrics(paragraphs: AnvilParagraph[], costUsd: number): {
  slopOverall: number | null
  hallucinations: number
  comprehensionYes: number
  comprehensionNo: number
  comprehensionSkip: number
  aiMarkersBand: 'low' | 'medium' | 'high'
  cogDebtDelta: number | null
  costUsd: number
} {
  const analysed = paragraphs.filter((p) => p.status === 'analysed')
  const slopVals = analysed.map((p) => p.slop).filter((s): s is number => s != null)
  const slopOverall = slopVals.length
    ? Math.round((slopVals.reduce((a, b) => a + b, 0) / slopVals.length) * 10) / 10
    : null
  const hallucinations = paragraphs.reduce(
    (n, p) => n + p.claims.filter((c) => c.verdict === 'verified-false').length, 0,
  )
  let yes = 0, no = 0, skip = 0
  for (const p of paragraphs) {
    if (!p.comprehension) continue
    if (p.comprehension.state === 'answered-yes' || p.comprehension.state === 'answered-socratic') yes++
    else if (p.comprehension.state === 'deferred-to-explain') no++
    else if (p.comprehension.state === 'skipped') skip++
  }
  // AI-markers band: derive from slop overall for now (v1).
  const band: 'low' | 'medium' | 'high' =
    slopOverall == null ? 'low' : slopOverall < 3.5 ? 'low' : slopOverall < 6 ? 'medium' : 'high'
  return {
    slopOverall,
    hallucinations,
    comprehensionYes: yes,
    comprehensionNo: no,
    comprehensionSkip: skip,
    aiMarkersBand: band,
    cogDebtDelta: null,  // v1: requires multi-session data
    costUsd,
  }
}
