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
