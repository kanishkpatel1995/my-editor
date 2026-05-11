export type ParsedAssistant =
  | { kind: 'markdown'; text: string }
  | { kind: 'tool_call'; action: string; input: unknown; raw: string }
  | { kind: 'json'; value: unknown; raw: string }
  | { kind: 'error'; message: string; code?: number; raw: string }

const FENCE_RE = /^\s*```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```\s*$/

/**
 * Classify an assistant message body. Used only on completed (non-streaming)
 * assistant turns; live streams keep rendering as plain text and re-classify
 * once the stream ends.
 */
export function parseAssistantContent(text: string): ParsedAssistant {
  const trimmed = text.trim()
  if (!trimmed) return { kind: 'markdown', text }

  // Strip a single ```json fence wrapping the whole body.
  const fenceMatch = trimmed.match(FENCE_RE)
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed

  // Cheap pre-check: if the body doesn't *start* with { or [, it's prose.
  if (candidate[0] !== '{' && candidate[0] !== '[') {
    return { kind: 'markdown', text }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(candidate)
  } catch {
    return { kind: 'markdown', text }
  }

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>

    // OpenRouter / OpenAI-shaped errors: { error: { message, code? } }
    const err = obj.error
    if (err && typeof err === 'object' && !Array.isArray(err)) {
      const e = err as Record<string, unknown>
      if (typeof e.message === 'string') {
        return {
          kind: 'error',
          message: e.message,
          code: typeof e.code === 'number' ? e.code : undefined,
          raw: text,
        }
      }
    }

    // Tool-call shape: { action, action_input }
    if (typeof obj.action === 'string' && 'action_input' in obj) {
      return {
        kind: 'tool_call',
        action: obj.action,
        input: obj.action_input,
        raw: text,
      }
    }

    // Function-call shape (some models): { tool, args }
    if (typeof obj.tool === 'string' && 'args' in obj) {
      return {
        kind: 'tool_call',
        action: obj.tool,
        input: obj.args,
        raw: text,
      }
    }
  }

  return { kind: 'json', value: parsed, raw: text }
}

/** Pretty-print JSON for the mono <pre> blocks in callouts. */
export function prettyJson(value: unknown): string {
  if (typeof value === 'string') {
    // Models sometimes nest stringified JSON. Try one unwrap.
    try {
      const inner = JSON.parse(value)
      return JSON.stringify(inner, null, 2)
    } catch {
      return value
    }
  }
  return JSON.stringify(value, null, 2)
}
