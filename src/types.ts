export type Theme = 'substack' | 'linkedin'
export type ChatMode = 'text' | 'image'

/** A file the user attached to a chat message (image or PDF). */
export interface Attachment {
  /** Thread-relative path on disk, e.g. `./att-01-screenshot.png`. */
  relPath: string
  /** MIME type, e.g. `image/png`, `application/pdf`. */
  mime: string
  kind: 'image' | 'pdf'
  /** Original filename as the user picked it. */
  name: string
  sizeBytes?: number
}

export interface ChatMessageT {
  role: 'user' | 'assistant'
  content: string
  images?: string[]
  /** Files the user attached to this (user) message. */
  attachments?: Attachment[]
  timestamp?: string
  model?: string
  /** Streamed reasoning / thinking tokens (provider-specific). */
  reasoning?: string
  /** Once stream ends, UI collapses the thinking block. */
  reasoningCollapsed?: boolean
  /** Wall-clock duration of the reasoning phase in ms (set on stream end). */
  reasoningDurationMs?: number
  /** Set on internally-generated messages (Review & regen wraps the original
   *  prompt into a follow-up user turn we want to collapse by default). */
  collapsedDefault?: boolean
}

export interface ChatThread {
  id: string
  title: string
  mode: ChatMode
  model: string
  createdAt: string
  updatedAt: string
  messages: ChatMessageT[]
  usage: ThreadUsage
  dirHandle?: FileSystemDirectoryHandle
}

export interface ThreadUsage {
  tokensIn: number
  tokensOut: number
  imagesGenerated: number
  costUsd: number
}

export interface ORModel {
  id: string
  name: string
  context_length?: number
  pricing?: {
    prompt?: string
    completion?: string
    image?: string
    request?: string
  }
  architecture?: {
    output_modalities?: string[]
    input_modalities?: string[]
  }
}

export interface Config {
  apiKey: string
  defaultModel: string
  defaultImageModel: string
  chatFolderPath: string
  modelListLimit: number
  threadCostWarnUsd: number
  /* ANVIL — the three models used in the review/learn flow. Falls back to
   * cheap-and-cheerful defaults if env vars aren't set. */
  anvilAnalystModel: string
  anvilVerifierModel: string
  anvilExplainerModel: string
}

/* ─────────── ANVIL (Adversarial Non-sycophantic Verification & Intellectual
 * Literacy) — the review-and-learn layer.
 *
 * Grounded in:
 *  - Cognitive Debt (MIT 2025; arxiv 2507.00181)
 *  - AI Sycophancy (Sharma et al., ICLR 2024; arxiv 2310.13548)
 *  - Desirable Difficulties (Bjork & Bjork, 2011)
 *  - Socratic Scaffolding (multiple RCTs 2024-2025)
 * ───────────── */

export type AnvilParagraphStatus =
  | 'pending'      // queued, not yet started
  | 'analysing'    // currently being streamed by the analyst
  | 'analysed'     // analyst finished, awaiting / processing user input
  | 'skipped'      // user skipped, or analyst declared transitional
  | 'failed'       // stream error

export type AnvilSlopBand = 'low' | 'medium' | 'high'

export interface AnvilAnnotation {
  /** Stable id: paragraphIndex + hash(span) — used by editor decorations. */
  id: string
  /** Verbatim span quoted from the paragraph. */
  span: string
  /** Editor's note explaining the issue + suggested correction. */
  note: string
  /** Extracted "suggested replacement" if the analyst gave one. */
  suggestion?: string
  /** User decision: 'accepted' applied to doc, 'rejected' dismissed, 'pending' default. */
  decision?: 'accepted' | 'rejected' | 'pending'
}

export interface AnvilClaim {
  /** Stable id: paragraphIndex + ordinal + hash(text). */
  id: string
  text: string
  /** Verifier verdict; `pending` while the web-search call is in flight. */
  verdict: 'ok' | 'verify' | 'verified-true' | 'verified-false' | 'inconclusive' | 'pending'
  confidence?: 'low' | 'medium' | 'high'
  /** One-sentence verdict explanation from the verifier. */
  explanation?: string
  /** Citation URLs returned by the verifier model. */
  sources?: string[]
}

export type AnvilCompState =
  | 'unanswered'
  | 'answered-yes'
  | 'answered-socratic'    // user attempted the follow-up
  | 'deferred-to-explain'  // user gave up; full explanation shown
  | 'skipped'

export interface AnvilComprehension {
  question: string
  state: AnvilCompState
  /** When the analyst says the paragraph is transitional / structural and no
   *  question is warranted. */
  isTransitional: boolean
  /** User's typed answer to the Socratic follow-up, if they engaged. */
  socraticAnswer?: string
  /** Streamed Socratic-followup question. */
  socraticFollowup?: string
  /** Streamed full explanation, only when the user clicked 'explain'. */
  explanation?: string
}

export interface AnvilParagraph {
  /** 1-based index in the article (skipped paragraphs keep their index). */
  index: number
  /** The paragraph text. */
  text: string
  status: AnvilParagraphStatus
  /** Analyst's raw streaming output — kept so we can reparse if needed. */
  rawAnalyst: string
  annotations: AnvilAnnotation[]
  slop: number | null         // 0-10
  slopReason: string
  claims: AnvilClaim[]
  comprehension: AnvilComprehension | null
  /** Cost & timing receipt for the analyst call. */
  receipt: {
    model: string
    promptTokens: number
    completionTokens: number
    latencyMs: number
    costUsd: number
  } | null
}

export interface AnvilMetrics {
  slopOverall: number | null       // running average across analysed paragraphs
  hallucinations: number           // count of verified-false claims
  comprehensionYes: number
  comprehensionNo: number
  comprehensionSkip: number
  aiMarkersBand: AnvilSlopBand
  cogDebtDelta: number | null      // v1: null — needs cross-session data
  costUsd: number
}

export interface AnvilSession {
  /** Stable id like `anv-2026-05-14-1538-<slug>`. */
  id: string
  /** Relative path to the article inside Writing-Workflow, e.g.
   *  `articles/05-fri-every-transformer-layer-two-things.md`. */
  articlePath: string
  /** Article slug — drives the `<slug>.anvil.md` filename. */
  articleSlug: string
  /** SHA-256 of article text at session start — lets us detect mid-flight
   *  article edits and offer to re-analyse only changed paragraphs. */
  articleSha: string
  startedAt: string
  finishedAt: string | null
  analystModel: string
  verifierModel: string
  explainerModel: string
  paragraphs: AnvilParagraph[]
  metrics: AnvilMetrics
}

/* ─────────── Article workflow types ─────────── */

export type DayAbbrev = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export type DayNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7

export interface ArticleRef {
  /** e.g. 'week-of-2026-05-04' */
  weekFolder: string
  dayNumber: DayNumber
  dayAbbrev: DayAbbrev
  /** filename minus the leading '01-mon-' prefix and '.md' suffix */
  slug: string
  /** filename in articles/, e.g. '05-fri-every-transformer-layer-two-things.md' */
  filename: string
}

export interface CompanionPaths {
  linkedin: string  // 'linkedin/05-fri-…-linkedin.md'
  diagram: string   // 'diagrams/05-fri-…-diagram.md'
  evaluation: null  // (per-day evaluation files don't exist; only mon-tue-wed and thu-fri-sat-sun bundles)
}

export type CompanionKind = 'linkedin' | 'diagram'

export interface PromptDef {
  id: string                   // '01-ideation-prompt-v3'
  index: number                // 1..7 (sort order)
  title: string                // 'Ideation' (parsed from filename + first heading)
  filename: string             // '01-ideation-prompt-v3.md'
  kind: 'text' | 'image'
  expectsArticleContext: boolean
  body: string                 // full prompt text, lazily loaded
}
