import { create } from 'zustand'
import type {
  AnvilSession, AnvilParagraph, AnvilCompState,
} from '../types'
import { streamChat } from '../lib/openrouter'
import { segmentArticle } from '../lib/anvil-segmenter'
import {
  buildAnalystPrompt, buildSocraticFollowupPrompt, buildExplainerPrompt,
  buildVerifierPrompt,
} from '../lib/anvil-prompts'
import { parseVerifierResponse } from '../lib/anvil-verifier'
import { parseAnalystOutput } from '../lib/anvil-parser'
import {
  ensureAnvilFolder, sha256Hex, writeAnvilSession, readAnvilSession, computeMetrics,
} from '../lib/anvil-storage'
import { listAnvilSessions, type AnvilHistoryEntry } from '../lib/anvil-history'
import { useChatStore } from './chatStore'
import { useArticleStore } from './articleStore'
import { pricePerMTokens } from '../lib/openrouter'

const now = () => new Date().toISOString()

interface AnvilStore {
  /** Open panel UI flag. */
  open: boolean
  /** Currently active tab in the right rail: 'chat' or 'anvil'. */
  activeTab: 'chat' | 'anvil'

  /** The live session — null when nothing is running. */
  session: AnvilSession | null
  /** Index (0-based) of the paragraph currently being streamed. */
  currentIndex: number | null
  /** Reasoning-tape text for the paragraph currently being streamed. */
  thinking: string

  /** True while paragraphs are still being streamed in. */
  isRunning: boolean
  /** True if user has paused — controller is honoured between paragraphs. */
  isPaused: boolean
  /** Abort controller for the in-flight analyst call. */
  abortController: AbortController | null

  /** True when the loaded session's article_sha doesn't match the current
   *  article's SHA — paragraph contents are out of date. */
  staleAgainstArticle: boolean

  /** When non-null, the panel shows the history list instead of the cards. */
  showSessionsList: boolean
  /** Cached history list. Refreshed on demand. */
  history: AnvilHistoryEntry[]
  historyLoadedAt: number

  // Actions
  setOpen: (open: boolean) => void
  setActiveTab: (tab: 'chat' | 'anvil') => void
  start: () => Promise<void>
  pause: () => void
  resume: () => Promise<void>
  stop: () => void
  answerYes: (paragraphIndex: number) => Promise<void>
  answerNo: (paragraphIndex: number) => Promise<void>
  submitSocraticAnswer: (paragraphIndex: number, answer: string) => Promise<void>
  requestExplanation: (paragraphIndex: number) => Promise<void>
  skipComprehension: (paragraphIndex: number) => Promise<void>
  /** Drop the in-memory session — does not delete on-disk file. */
  closeSession: () => void

  /** Decide an inline annotation: accepted (user applied edit to doc) or
   *  rejected (dismissed). Both remove the decoration in the editor. */
  setAnnotationDecision: (annotationId: string, decision: 'accepted' | 'rejected') => Promise<void>

  /** Run a one-shot rewrite of a span via the explainer model.
   *  Returns the rewritten text. Caller is responsible for putting it in the doc. */
  rewriteSpan: (originalSpan: string, userInstruction: string, contextParagraph: string) => Promise<string>

  /** Auto-load a prior session for the given article if one exists on disk.
   *  Fired on article-switch. SHA mismatch sets `staleAgainstArticle`. */
  hydrateForArticle: (slug: string, articleText: string) => Promise<void>

  /** Refresh the on-disk history list. */
  refreshHistory: () => Promise<void>

  /** Load a session-by-slug from disk into the panel (without changing
   *  which article is open in the editor). */
  loadSessionFromDisk: (slug: string) => Promise<void>

  setShowSessionsList: (v: boolean) => void

  /** Run the verifier (web-search) on one claim by id. Updates verdict +
   *  sources in place; persists. Marks `pending` immediately so the popover
   *  can show a busy indicator. */
  verifyClaim: (claimId: string) => Promise<void>
  /** Manual override — user asserts the claim is true without running the
   *  web verifier. Costs nothing. */
  markClaimOk: (claimId: string) => Promise<void>

  /** Run a quick web search to gather context about a span (used from the
   *  strikethrough popover when the user wants more info before deciding).
   *  Returns the streamed research text; caller renders it. */
  searchWebForSpan: (span: string, contextParagraph: string, onDelta: (s: string) => void) => Promise<string>
}

function emptySession(opts: {
  articlePath: string
  articleSlug: string
  articleSha: string
  analyst: string
  verifier: string
  explainer: string
}): AnvilSession {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:T.]/g, '')
    .slice(0, 12)  // YYYYMMDDHHMM
  return {
    id: `anv-${stamp}-${opts.articleSlug}`,
    articlePath: opts.articlePath,
    articleSlug: opts.articleSlug,
    articleSha: opts.articleSha,
    startedAt: now(),
    finishedAt: null,
    analystModel: opts.analyst,
    verifierModel: opts.verifier,
    explainerModel: opts.explainer,
    paragraphs: [],
    metrics: {
      slopOverall: null,
      hallucinations: 0,
      comprehensionYes: 0,
      comprehensionNo: 0,
      comprehensionSkip: 0,
      aiMarkersBand: 'low',
      cogDebtDelta: null,
      costUsd: 0,
    },
  }
}

/** Costs a paragraph based on the current model list and accumulates into the
 *  session's running totals. */
function priceUsd(modelId: string, promptTokens: number, completionTokens: number): number {
  const m = useChatStore.getState().models.find((mm) => mm.id === modelId)
  if (!m) return 0
  const p = pricePerMTokens(m.pricing?.prompt) * promptTokens / 1_000_000
  const c = pricePerMTokens(m.pricing?.completion) * completionTokens / 1_000_000
  return p + c
}

async function persistSession(session: AnvilSession): Promise<void> {
  const root = useArticleStore.getState().rootDir
  if (!root) return
  try {
    const dir = await ensureAnvilFolder(root)
    await writeAnvilSession(dir, session.articleSlug, session)
  } catch (e) {
    console.error('persistAnvilSession failed', e)
  }
}

export const useAnvilStore = create<AnvilStore>((set, get) => ({
  open: false,
  activeTab: 'chat',
  session: null,
  currentIndex: null,
  thinking: '',
  isRunning: false,
  isPaused: false,
  abortController: null,
  staleAgainstArticle: false,
  showSessionsList: false,
  history: [],
  historyLoadedAt: 0,

  setOpen: (open) => {
    set({ open })
    if (open) set({ activeTab: 'anvil' })
  },
  setActiveTab: (tab) => set({ activeTab: tab }),

  start: async () => {
    const article = useArticleStore.getState().current
    const articleText = useArticleStore.getState().currentText
    const config = useChatStore.getState().config
    if (!article || !articleText || !config) {
      console.warn('ANVIL start: no article, text, or config')
      return
    }

    // Hydrate from disk if a prior session exists for this article + sha match.
    const root = useArticleStore.getState().rootDir
    let session: AnvilSession | null = null
    if (root) {
      try {
        const dir = await ensureAnvilFolder(root)
        const prior = await readAnvilSession(dir, article.slug)
        const sha = await sha256Hex(articleText)
        if (prior && prior.articleSha === sha) {
          session = prior
        }
      } catch (e) {
        console.warn('ANVIL hydrate failed', e)
      }
    }

    if (!session) {
      const sha = await sha256Hex(articleText)
      // Seed paragraphs from the segmenter.
      const segments = segmentArticle(articleText)
      session = emptySession({
        articlePath: `articles/${article.filename}`,
        articleSlug: article.slug,
        articleSha: sha,
        analyst: config.anvilAnalystModel,
        verifier: config.anvilVerifierModel,
        explainer: config.anvilExplainerModel,
      })
      session.paragraphs = segments.map((seg): AnvilParagraph => ({
        index: seg.index,
        text: seg.text,
        status: seg.skip ? 'skipped' : 'pending',
        rawAnalyst: '',
        annotations: [],
        slop: null,
        slopReason: '',
        claims: [],
        comprehension: null,
        receipt: null,
      }))
    }

    set({
      session,
      isRunning: true,
      isPaused: false,
      currentIndex: null,
      thinking: '',
    })

    await runLoop()
  },

  pause: () => {
    set({ isPaused: true })
    const ac = get().abortController
    ac?.abort()
  },

  resume: async () => {
    if (!get().session) return
    set({ isPaused: false, isRunning: true })
    await runLoop()
  },

  stop: () => {
    const ac = get().abortController
    ac?.abort()
    const s = get().session
    if (s) {
      const finished = { ...s, finishedAt: now() }
      set({ session: finished })
      void persistSession(finished)
    }
    set({ isRunning: false, isPaused: false, currentIndex: null, thinking: '' })
  },

  answerYes: async (paragraphIndex) => {
    const s = get().session
    if (!s) return
    const next = patchParagraph(s, paragraphIndex, (p) => {
      if (!p.comprehension) return p
      return {
        ...p,
        comprehension: { ...p.comprehension, state: 'answered-yes' as AnvilCompState },
      }
    })
    set({ session: next })
    await persistSession(next)
  },

  answerNo: async (paragraphIndex) => {
    const s = get().session
    if (!s) return
    const p = s.paragraphs.find((x) => x.index === paragraphIndex)
    if (!p?.comprehension) return

    // Fire Socratic follow-up.
    const prompt = buildSocraticFollowupPrompt({
      paragraphText: p.text,
      comprehensionQuestion: p.comprehension.question,
    })
    const config = useChatStore.getState().config
    if (!config) return
    let buf = ''
    try {
      await streamChat({
        apiKey: config.apiKey,
        model: s.explainerModel,
        messages: [{ role: 'user', content: prompt }],
        onTextDelta: (delta) => {
          buf += delta
          const next = patchParagraph(get().session!, paragraphIndex, (pp) => ({
            ...pp,
            comprehension: pp.comprehension
              ? { ...pp.comprehension, socraticFollowup: buf }
              : pp.comprehension,
          }))
          set({ session: next })
        },
      })
      const final = patchParagraph(get().session!, paragraphIndex, (pp) => ({
        ...pp,
        comprehension: pp.comprehension
          ? { ...pp.comprehension, socraticFollowup: buf.trim() }
          : pp.comprehension,
      }))
      set({ session: final })
      await persistSession(final)
    } catch (e) {
      console.error('socratic followup failed', e)
    }
  },

  submitSocraticAnswer: async (paragraphIndex, answer) => {
    const s = get().session
    if (!s) return
    const next = patchParagraph(s, paragraphIndex, (p) => {
      if (!p.comprehension) return p
      return {
        ...p,
        comprehension: {
          ...p.comprehension,
          socraticAnswer: answer,
          state: 'answered-socratic' as AnvilCompState,
        },
      }
    })
    set({ session: next })
    await persistSession(next)
  },

  requestExplanation: async (paragraphIndex) => {
    const s = get().session
    if (!s) return
    const p = s.paragraphs.find((x) => x.index === paragraphIndex)
    if (!p?.comprehension) return

    // Mark deferred — counts against COG-DEBT-Δ, not toward COMP-RATE-yes.
    let next = patchParagraph(s, paragraphIndex, (pp) => ({
      ...pp,
      comprehension: pp.comprehension
        ? { ...pp.comprehension, state: 'deferred-to-explain' as AnvilCompState, explanation: '' }
        : pp.comprehension,
    }))
    set({ session: next })

    const prompt = buildExplainerPrompt({
      paragraphText: p.text,
      comprehensionQuestion: p.comprehension.question,
      socraticFollowup: p.comprehension.socraticFollowup,
      socraticAnswer: p.comprehension.socraticAnswer,
    })
    const config = useChatStore.getState().config
    if (!config) return
    let buf = ''
    try {
      await streamChat({
        apiKey: config.apiKey,
        model: s.explainerModel,
        messages: [{ role: 'user', content: prompt }],
        onTextDelta: (delta) => {
          buf += delta
          const upd = patchParagraph(get().session!, paragraphIndex, (pp) => ({
            ...pp,
            comprehension: pp.comprehension
              ? { ...pp.comprehension, explanation: buf }
              : pp.comprehension,
          }))
          set({ session: upd })
        },
      })
      next = patchParagraph(get().session!, paragraphIndex, (pp) => ({
        ...pp,
        comprehension: pp.comprehension
          ? { ...pp.comprehension, explanation: buf.trim() }
          : pp.comprehension,
      }))
      set({ session: next })
      await persistSession(next)
    } catch (e) {
      console.error('explainer failed', e)
    }
  },

  skipComprehension: async (paragraphIndex) => {
    const s = get().session
    if (!s) return
    const next = patchParagraph(s, paragraphIndex, (p) => {
      if (!p.comprehension) return p
      return {
        ...p,
        comprehension: { ...p.comprehension, state: 'skipped' as AnvilCompState },
      }
    })
    set({ session: next })
    await persistSession(next)
  },

  closeSession: () => {
    set({
      session: null,
      currentIndex: null,
      thinking: '',
      isRunning: false,
      isPaused: false,
      abortController: null,
    })
  },

  setAnnotationDecision: async (annotationId, decision) => {
    const s = get().session
    if (!s) return
    const paragraphs = s.paragraphs.map((p) => ({
      ...p,
      annotations: p.annotations.map((a) =>
        a.id === annotationId ? { ...a, decision } : a,
      ),
    }))
    const next = { ...s, paragraphs }
    set({ session: next })
    await persistSession(next)
  },

  hydrateForArticle: async (slug, articleText) => {
    const root = useArticleStore.getState().rootDir
    if (!root) return
    try {
      const dir = await ensureAnvilFolder(root)
      const prior = await readAnvilSession(dir, slug)
      if (!prior) {
        set({ session: null, staleAgainstArticle: false, currentIndex: null, thinking: '' })
        return
      }
      const sha = await sha256Hex(articleText)
      const stale = sha !== prior.articleSha
      set({
        session: prior,
        staleAgainstArticle: stale,
        currentIndex: null,
        thinking: '',
      })
    } catch (e) {
      console.warn('hydrateForArticle failed', e)
    }
  },

  refreshHistory: async () => {
    const root = useArticleStore.getState().rootDir
    if (!root) return
    try {
      const history = await listAnvilSessions(root)
      set({ history, historyLoadedAt: Date.now() })
    } catch (e) {
      console.warn('refreshHistory failed', e)
    }
  },

  loadSessionFromDisk: async (slug) => {
    const root = useArticleStore.getState().rootDir
    if (!root) return
    try {
      const dir = await ensureAnvilFolder(root)
      const prior = await readAnvilSession(dir, slug)
      if (!prior) return
      // Mark stale unless this is the same article currently in the editor.
      const currentSlug = useArticleStore.getState().current?.slug
      let stale = currentSlug !== slug
      if (!stale) {
        const sha = await sha256Hex(useArticleStore.getState().currentText)
        stale = sha !== prior.articleSha
      }
      set({
        session: prior,
        staleAgainstArticle: stale,
        showSessionsList: false,
        currentIndex: null,
        thinking: '',
      })
    } catch (e) {
      console.warn('loadSessionFromDisk failed', e)
    }
  },

  setShowSessionsList: (v) => set({ showSessionsList: v }),

  verifyClaim: async (claimId) => {
    const s = get().session
    if (!s) return
    const config = useChatStore.getState().config
    if (!config) return

    // Find the claim and its paragraph.
    let claimPara: import('../types').AnvilParagraph | undefined
    for (const p of s.paragraphs) {
      if (p.claims.some((c) => c.id === claimId)) { claimPara = p; break }
    }
    const claim = claimPara?.claims.find((c) => c.id === claimId)
    if (!claim || !claimPara) return

    // Mark pending.
    let next = patchClaim(s, claimId, (c) => ({ ...c, verdict: 'pending' as const }))
    set({ session: next })

    const articleTitle = inferArticleTitle(s.paragraphs.map((p) => p.text))
    const prompt = buildVerifierPrompt({ claim: claim.text, articleTitle })

    let raw = ''
    try {
      await streamChat({
        apiKey: config.apiKey,
        model: s.verifierModel,
        messages: [{ role: 'user', content: prompt }],
        webSearch: true,
        onTextDelta: (d) => { raw += d },
      })
    } catch (e) {
      console.error('verifyClaim stream failed', e)
      next = patchClaim(get().session!, claimId, (c) => ({
        ...c,
        verdict: 'inconclusive' as const,
        explanation: `Verifier failed: ${(e as Error).message}`,
      }))
      set({ session: next })
      await persistSession(next)
      return
    }

    const parsed = parseVerifierResponse(raw)
    next = patchClaim(get().session!, claimId, (c) => ({
      ...c,
      verdict: parsed.verdict,
      confidence: parsed.confidence,
      sources: parsed.sources,
      explanation: parsed.explanation,
    }))
    set({ session: next })
    await persistSession(next)
  },

  searchWebForSpan: async (span, contextParagraph, onDelta) => {
    const config = useChatStore.getState().config
    const s = get().session
    if (!config || !s) throw new Error('No active session/config')
    const prompt = `Quick web research on a span from an article.

Context paragraph (for what topic this is about):
"""
${contextParagraph}
"""

Span the editor flagged:
"${span}"

Search the web for accurate, current information about this span. Then
write 2-4 sentences summarising what you found that's relevant to whether
the span is correct, current, or worth changing. End with a bulleted list
of 1-3 source URLs.

Output ONLY the research summary + sources. No preamble.`
    let buf = ''
    await streamChat({
      apiKey: config.apiKey,
      model: s.verifierModel,
      messages: [{ role: 'user', content: prompt }],
      webSearch: true,
      onTextDelta: (d) => { buf += d; onDelta(d) },
    })
    return buf.trim()
  },

  markClaimOk: async (claimId) => {
    const s = get().session
    if (!s) return
    const next = patchClaim(s, claimId, (c) => ({
      ...c,
      verdict: 'ok' as const,
      explanation: 'Marked OK manually by user (no web verification run).',
      sources: [],
    }))
    set({ session: next })
    await persistSession(next)
  },

  rewriteSpan: async (originalSpan, userInstruction, contextParagraph) => {
    const config = useChatStore.getState().config
    const s = get().session
    if (!config || !s) throw new Error('No active session/config')
    const prompt = `You are rewriting one short span of text inside a paragraph.

Context paragraph (for tone & terminology only):
"""
${contextParagraph}
"""

Span to rewrite:
"${originalSpan}"

User's instruction for how to rewrite it:
"${userInstruction}"

Output ONLY the replacement text. No quotes around it, no preamble, no
explanation, no markdown formatting. Just the new span text, on a single
line if possible, keeping the same grammatical role as the original.`
    let buf = ''
    await streamChat({
      apiKey: config.apiKey,
      model: s.explainerModel,
      messages: [{ role: 'user', content: prompt }],
      onTextDelta: (d) => { buf += d },
    })
    return buf.trim().replace(/^["'`]|["'`]$/g, '')
  },
}))

/** Mutate one paragraph in-place; returns a new session object. */
function patchParagraph(
  s: AnvilSession,
  index: number,
  patcher: (p: AnvilParagraph) => AnvilParagraph,
): AnvilSession {
  const paragraphs = s.paragraphs.map((p) => (p.index === index ? patcher(p) : p))
  const metrics = computeMetrics(paragraphs, s.metrics.costUsd)
  return { ...s, paragraphs, metrics }
}

/** Locate a claim by id across all paragraphs and patch it. */
function patchClaim(
  s: AnvilSession,
  claimId: string,
  patcher: (c: import('../types').AnvilClaim) => import('../types').AnvilClaim,
): AnvilSession {
  const paragraphs = s.paragraphs.map((p) => {
    if (!p.claims.some((c) => c.id === claimId)) return p
    return { ...p, claims: p.claims.map((c) => (c.id === claimId ? patcher(c) : c)) }
  })
  const metrics = computeMetrics(paragraphs, s.metrics.costUsd)
  return { ...s, paragraphs, metrics }
}

/**
 * Walks the pending paragraphs in order, streaming the analyst's output and
 * patching the session as deltas arrive. Stops cleanly when paused / stopped /
 * out of work.
 */
async function runLoop(): Promise<void> {
  const get = () => useAnvilStore.getState()
  const set = useAnvilStore.setState

  while (true) {
    const s = get().session
    if (!s || get().isPaused || !get().isRunning) break

    const idx = s.paragraphs.findIndex((p) => p.status === 'pending')
    if (idx === -1) {
      // Done.
      const finished = { ...get().session!, finishedAt: now() }
      set({ session: finished, isRunning: false, currentIndex: null, thinking: '' })
      void persistSession(finished)
      break
    }

    const para = s.paragraphs[idx]
    set({ currentIndex: idx, thinking: '' })

    // Build context window.
    const prev = idx > 0 ? s.paragraphs[idx - 1].text : ''
    const next = idx < s.paragraphs.length - 1 ? s.paragraphs[idx + 1].text : ''
    const articleTitle = inferArticleTitle(s.paragraphs.map((p) => p.text))

    // Mark analysing.
    let working = patchParagraph(s, para.index, (p) => ({ ...p, status: 'analysing' }))
    set({ session: working })

    const prompt = buildAnalystPrompt({
      articleTitle,
      totalParagraphs: s.paragraphs.length,
      index: para.index,
      prev, target: para.text, next,
    })

    const config = useChatStore.getState().config
    if (!config) break

    const ac = new AbortController()
    set({ abortController: ac })

    let raw = ''
    let promptTokens = 0
    let completionTokens = 0
    const t0 = Date.now()
    try {
      await streamChat({
        apiKey: config.apiKey,
        model: s.analystModel,
        messages: [{ role: 'user', content: prompt }],
        signal: ac.signal,
        onTextDelta: (delta) => {
          raw += delta
          const parsed = parseAnalystOutput(raw)
          // Assign stable IDs: `p<index>-a<n>-<span-hash>` so re-parses on
          // subsequent deltas keep the same id and editor decorations stay put.
          //
          // CONFABULATION GUARD: the analyst sometimes emits spans that don't
          // literally appear in the paragraph (it picks canonical AI-slop
          // markers from the prompt's lexicon instead of true quotes). We
          // detect that by checking `para.text.includes(span)` and mark such
          // annotations `unanchored: true`. The editor decoration push then
          // filters them out (no strikethrough), and the side-panel card
          // renders them with a "couldn't anchor" badge so the user knows.
          const withIds = parsed.annotations.map((a, n) => {
            const span = (a.span || '').trim()
            const unanchored = !!span && !para.text.includes(span)
            return {
              ...a,
              id: makeAnnotationId(para.index, n, a.span),
              decision: a.decision || 'pending',
              unanchored,
            }
          })
          const claimsWithIds = parsed.claims.map((c, n) => ({
            ...c,
            id: makeClaimId(para.index, n, c.text),
          }))
          const next = patchParagraph(get().session!, para.index, (p) => ({
            ...p,
            rawAnalyst: raw,
            annotations: withIds,
            slop: parsed.slop,
            slopReason: parsed.slopReason,
            // Preserve any verified claim verdicts from a prior pass on same ids.
            claims: claimsWithIds.map((c) => {
              const old = p.claims.find((x) => x.id === c.id)
              return old && (old.verdict === 'verified-true' || old.verdict === 'verified-false' || old.verdict === 'inconclusive')
                ? { ...c, verdict: old.verdict, confidence: old.confidence, explanation: old.explanation, sources: old.sources }
                : c
            }),
            comprehension: parsed.comprehension,
          }))
          set({ session: next })
        },
        onReasoningDelta: (delta) => {
          set({ thinking: get().thinking + delta })
        },
        onUsage: (u) => {
          promptTokens = u.prompt_tokens || 0
          completionTokens = u.completion_tokens || 0
        },
      })
    } catch (e) {
      const errMsg = (e as Error)?.message || String(e)
      console.error('anvil analyst failed', errMsg)
      const failed = patchParagraph(get().session!, para.index, (p) => ({ ...p, status: 'failed' }))
      set({ session: failed, abortController: null })
      if (get().isPaused) break
      continue
    }

    // Finalize the paragraph.
    const cost = priceUsd(s.analystModel, promptTokens, completionTokens)
    const latencyMs = Date.now() - t0
    working = patchParagraph(get().session!, para.index, (p) => ({
      ...p,
      status: (p.comprehension?.isTransitional ? 'skipped' : 'analysed'),
      receipt: {
        model: s.analystModel,
        promptTokens, completionTokens, latencyMs,
        costUsd: cost,
      },
    }))
    working = { ...working, metrics: { ...working.metrics, costUsd: working.metrics.costUsd + cost } }
    set({ session: working, abortController: null })
    void persistSession(working)
  }
}

/** Heuristic title extractor — the first non-empty H1 in the article. */
function inferArticleTitle(paragraphs: string[]): string {
  for (const p of paragraphs) {
    const m = p.match(/^#\s+(.+?)\s*$/m)
    if (m) return m[1]
  }
  return 'Untitled article'
}

/** Cheap deterministic hash for stable annotation IDs (NOT cryptographic). */
function makeAnnotationId(paragraphIndex: number, ordinal: number, span: string): string {
  let h = 0
  for (let i = 0; i < span.length; i++) {
    h = (h * 31 + span.charCodeAt(i)) | 0
  }
  return `p${paragraphIndex}-a${ordinal}-${(h >>> 0).toString(36)}`
}

function makeClaimId(paragraphIndex: number, ordinal: number, text: string): string {
  let h = 0
  for (let i = 0; i < text.length; i++) {
    h = (h * 31 + text.charCodeAt(i)) | 0
  }
  return `p${paragraphIndex}-c${ordinal}-${(h >>> 0).toString(36)}`
}
