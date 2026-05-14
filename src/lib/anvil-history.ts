/**
 * Read summaries of every ANVIL session on disk by walking `proofs/` for
 * `*.anvil.json` sidecar files. Kept separate from `anvil-storage.ts` because
 * the history list only needs lightweight metrics — never the full paragraph
 * arrays — so a folder with dozens of sessions stays fast.
 */

import type { AnvilSession, AnvilMetrics } from '../types'
import { ensureAnvilFolder } from './anvil-storage'

export interface AnvilHistoryEntry {
  slug: string
  articlePath: string
  sessionId: string
  startedAt: string
  finishedAt: string | null
  paragraphsTotal: number
  paragraphsAnalysed: number
  metrics: AnvilMetrics
  analystModel: string
}

export async function listAnvilSessions(
  workflowRoot: FileSystemDirectoryHandle,
): Promise<AnvilHistoryEntry[]> {
  const dir = await ensureAnvilFolder(workflowRoot)
  const out: AnvilHistoryEntry[] = []
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind !== 'file') continue
    if (!/\.anvil\.json$/.test(name)) continue
    try {
      const file = await handle.getFile()
      const text = await file.text()
      const s = JSON.parse(text) as AnvilSession
      out.push({
        slug: s.articleSlug,
        articlePath: s.articlePath,
        sessionId: s.id,
        startedAt: s.startedAt,
        finishedAt: s.finishedAt,
        paragraphsTotal: s.paragraphs?.length || 0,
        paragraphsAnalysed: s.paragraphs?.filter((p) => p.status === 'analysed').length || 0,
        metrics: s.metrics,
        analystModel: s.analystModel,
      })
    } catch (e) {
      console.warn('listAnvilSessions: bad file', name, e)
    }
  }
  // Sort by finishedAt desc, fall back to startedAt
  return out.sort((a, b) => {
    const ax = a.finishedAt || a.startedAt
    const bx = b.finishedAt || b.startedAt
    return bx.localeCompare(ax)
  })
}
