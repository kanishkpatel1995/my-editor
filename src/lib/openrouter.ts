import { createParser, type EventSourceMessage } from 'eventsource-parser'
import type { ORModel } from '../types'

const BASE = 'https://openrouter.ai/api/v1'

const headers = (apiKey: string) => ({
  Authorization: `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
  'HTTP-Referer': 'http://localhost:5173',
  'X-Title': 'my-editor',
})

export async function listModels(apiKey: string): Promise<ORModel[]> {
  const res = await fetch(`${BASE}/models`, { headers: headers(apiKey) })
  if (!res.ok) throw new Error(`OpenRouter models: ${res.status}`)
  const json = await res.json()
  return (json.data as ORModel[]) ?? []
}

export function isImageCapable(m: ORModel): boolean {
  const out = m.architecture?.output_modalities
  return Array.isArray(out) && out.includes('image')
}

/** Can this model accept images as INPUT? (Different from `isImageCapable`,
 *  which checks output.) */
export function isVisionCapable(m: ORModel): boolean {
  const inp = m.architecture?.input_modalities
  return Array.isArray(inp) && inp.includes('image')
}

/** Can this model accept files (PDFs etc.) as input content parts? */
export function isFileCapable(m: ORModel): boolean {
  const inp = m.architecture?.input_modalities
  return Array.isArray(inp) && inp.includes('file')
}

export function isFreeText(m: ORModel): boolean {
  if (isImageCapable(m)) return false
  const p = parseFloat(m.pricing?.prompt || '0')
  const c = parseFloat(m.pricing?.completion || '0')
  return p === 0 && c === 0
}

export function pricePerMTokens(price: string | undefined): number {
  const n = parseFloat(price || '0')
  return n * 1_000_000
}

export function pricePerImage(m: ORModel): number {
  return parseFloat(m.pricing?.image || '0')
}

/**
 * Heuristic: does this model id likely emit reasoning / thinking deltas
 * that we should ask for and stream separately?
 */
const REASONING_PATTERNS = [
  /(^|\/)o[1-9](-|$)/i,                  // openai/o1, openai/o3, openai/o4 …
  /thinking/i,                            // *-thinking, gemini-2.5-flash-thinking
  /(^|\/)claude-3\.7|(^|\/)claude-4/i,   // claude-3.7-sonnet, claude-4
  /deepseek-r1/i,
  /qwen.*-(r1|thinking)/i,
  /reasoning/i,
]
export function isReasoningCapable(modelId: string): boolean {
  return REASONING_PATTERNS.some((re) => re.test(modelId))
}

/**
 * Strip a trailing OpenRouter routing suffix like ":online" or ":free" so we
 * can match the bare id against architecture / pricing data.
 */
export function bareModelId(modelId: string): string {
  return modelId.replace(/:[a-z0-9-]+$/i, '')
}

/** Append :online to a model id (idempotent). */
export function withOnline(modelId: string): string {
  return /:online$/.test(modelId) ? modelId : `${modelId}:online`
}

/** Multimodal content parts accepted by OpenRouter chat-completion. */
export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'file'; file: { filename: string; file_data: string } }

export interface StreamChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ChatContentPart[]
}

/**
 * OpenRouter provider-preference shape. Use this to constrain which upstream
 * provider OpenRouter is allowed to route to.
 *
 * Edge case we defend against: when calling `anthropic/*` models with images,
 * OpenRouter may route to Amazon Bedrock, whose Anthropic variants reject
 * image input. Pinning to `['anthropic']` for Anthropic models with images
 * works around this. Most open-weights models (Qwen, Llama, Gemma) and Google
 * Gemini don't have this issue.
 *
 * Docs: https://openrouter.ai/docs/provider-routing
 */
export interface ProviderPreferences {
  /** Whitelist — OpenRouter MUST pick a provider from this list. */
  only?: string[]
  /** Ordered preference — OpenRouter tries these in sequence. */
  order?: string[]
  /** Disallow fallbacks beyond the listed providers. */
  allow_fallbacks?: boolean
  /** Blocklist — OpenRouter MUST NOT pick a provider from this list. */
  ignore?: string[]
}

export interface StreamChatOptions {
  apiKey: string
  model: string
  messages: StreamChatMessage[]
  /** Restrict / order which upstream provider OpenRouter routes to. */
  provider?: ProviderPreferences
  signal?: AbortSignal
  modalities?: ('text' | 'image')[]
  /** Request and pass through reasoning / thinking deltas. Default: auto-detected from model id. */
  reasoning?: boolean | { effort?: 'low' | 'medium' | 'high' }
  /** Append :online to model id and request OpenRouter web-search routing. */
  webSearch?: boolean
  /** Called with each text delta as soon as it arrives (low TTFT). */
  onTextDelta?: (delta: string) => void
  /** Called with each reasoning / thinking delta. */
  onReasoningDelta?: (delta: string) => void
  /** Called when an image arrives (data URL or signed URL). */
  onImage?: (dataUrl: string, index: number) => void
  onUsage?: (usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }) => void
  /** Web search citations / annotations — emitted when web search returns sources. */
  onCitations?: (urls: string[]) => void
}

/**
 * Streams a chat completion via SSE. Always streams (`stream: true`) — image
 * bytes typically arrive in a final chunk while any preamble text streams
 * immediately, keeping time-to-first-token low. Reasoning deltas (when the
 * model exposes them) are emitted separately so the UI can render them in a
 * greyed "thinking" block.
 */
export async function streamChat(opts: StreamChatOptions): Promise<{
  text: string
  reasoning: string
  images: string[]
  citations: string[]
}> {
  const wantReasoning =
    opts.reasoning === false
      ? false
      : opts.reasoning != null
        ? true
        : isReasoningCapable(bareModelId(opts.model))

  const finalModel = opts.webSearch ? withOnline(opts.model) : opts.model

  const body: Record<string, unknown> = {
    model: finalModel,
    messages: opts.messages,
    stream: true,
    stream_options: { include_usage: true },
  }
  if (opts.modalities?.length) body.modalities = opts.modalities
  if (opts.provider) body.provider = opts.provider
  if (wantReasoning) {
    const effort =
      typeof opts.reasoning === 'object' && opts.reasoning?.effort
        ? opts.reasoning.effort
        : 'medium'
    body.reasoning = { effort }
    body.include_reasoning = true
  }

  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: headers(opts.apiKey),
    body: JSON.stringify(body),
    signal: opts.signal,
  })

  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => '')
    throw new Error(`OpenRouter ${res.status}: ${txt || res.statusText}`)
  }

  let textBuffer = ''
  let reasoningBuffer = ''
  const seenImages = new Set<string>()
  const seenCitations = new Set<string>()
  const images: string[] = []
  const citations: string[] = []

  const handleImagesArray = (arr: unknown) => {
    if (!Array.isArray(arr)) return
    for (const img of arr as Array<{ image_url?: { url?: string }; type?: string; url?: string }>) {
      const url = img?.image_url?.url || img?.url
      if (url && !seenImages.has(url)) {
        seenImages.add(url)
        images.push(url)
        opts.onImage?.(url, images.length - 1)
      }
    }
  }

  const handleAnnotations = (arr: unknown) => {
    if (!Array.isArray(arr)) return
    const fresh: string[] = []
    for (const a of arr as Array<{ url_citation?: { url?: string }; url?: string; type?: string }>) {
      const url = a?.url_citation?.url || a?.url
      if (url && !seenCitations.has(url)) {
        seenCitations.add(url)
        citations.push(url)
        fresh.push(url)
      }
    }
    if (fresh.length && opts.onCitations) opts.onCitations([...citations])
  }

  const parser = createParser({
    onEvent(ev: EventSourceMessage) {
      if (!ev.data) return
      if (ev.data === '[DONE]') return
      let json: Record<string, unknown>
      try {
        json = JSON.parse(ev.data)
      } catch {
        return
      }
      const choice = (json.choices as Array<Record<string, unknown>> | undefined)?.[0]
      const delta = choice?.delta as Record<string, unknown> | undefined
      const message = choice?.message as Record<string, unknown> | undefined

      // DEBUG — temporary instrumentation for empty-response diagnosis
      // eslint-disable-next-line no-console
      if (delta || message) console.log('[streamChat SSE]', { hasDelta: !!delta, hasMessage: !!message, deltaContentType: typeof delta?.content, messageContentType: typeof message?.content, raw: JSON.stringify(json).slice(0, 400) })

      // ---- Pull text + images out of arbitrarily-shaped content ----
      // OpenRouter providers ship content in several flavours:
      //   1. delta.content as a string (most text models)
      //   2. delta.content as an array of parts (Anthropic multimodal,
      //      some Gemini image-gen variants) — parts can be type 'text' OR
      //      'image_url' OR 'image'
      //   3. delta.images as a separate array (Gemini image-gen, standard
      //      OpenRouter "images" field)
      //   4. Any of the above on `message` instead of `delta` when the
      //      provider sends a single non-streamed chunk.
      //
      // We must handle ALL of these — dropping image_url parts in (2) was
      // the cause of the silent "DEVELOPING…" forever for image-gen flows.

      const extractFromContentArray = (arr: Array<{ type?: string; text?: string; image_url?: { url?: string }; url?: string }>) => {
        for (const part of arr) {
          if (!part) continue
          if (part.type === 'text' && typeof part.text === 'string' && part.text) {
            textBuffer += part.text
            opts.onTextDelta?.(part.text)
            continue
          }
          if (part.type === 'image_url' || part.type === 'image') {
            const url = part.image_url?.url || part.url
            if (url && !seenImages.has(url)) {
              seenImages.add(url)
              images.push(url)
              opts.onImage?.(url, images.length - 1)
            }
          }
        }
      }

      // Text/images from delta
      const content = delta?.content as string | undefined
      if (typeof content === 'string' && content) {
        textBuffer += content
        opts.onTextDelta?.(content)
      } else if (Array.isArray(delta?.content)) {
        extractFromContentArray(delta.content as Array<{ type?: string; text?: string; image_url?: { url?: string }; url?: string }>)
      }

      // Text/images from final non-streamed message
      const finalContent = message?.content
      if (typeof finalContent === 'string' && !textBuffer) {
        textBuffer += finalContent
        opts.onTextDelta?.(finalContent)
      } else if (Array.isArray(finalContent)) {
        extractFromContentArray(finalContent as Array<{ type?: string; text?: string; image_url?: { url?: string }; url?: string }>)
      }

      // Reasoning content — providers use different field names; normalise here.
      const r =
        (delta?.reasoning as string | undefined) ??
        (delta?.reasoning_content as string | undefined) ??
        (delta?.thinking as string | undefined) ??
        null
      if (r) {
        reasoningBuffer += r
        opts.onReasoningDelta?.(r)
      }
      // Some providers send the whole reasoning at the end on `message`.
      const finalR =
        (message?.reasoning as string | undefined) ??
        (message?.reasoning_content as string | undefined) ??
        null
      if (!r && finalR && !reasoningBuffer) {
        reasoningBuffer += finalR
        opts.onReasoningDelta?.(finalR)
      }

      handleImagesArray(delta?.images)
      handleImagesArray(message?.images)
      handleAnnotations(delta?.annotations)
      handleAnnotations(message?.annotations)

      if (json.usage) opts.onUsage?.(json.usage as { prompt_tokens?: number; completion_tokens?: number })
    },
  })

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    parser.feed(decoder.decode(value, { stream: true }))
  }

  return { text: textBuffer, reasoning: reasoningBuffer, images, citations }
}
