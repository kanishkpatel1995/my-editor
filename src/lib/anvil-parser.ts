/**
 * Incremental parser for streamed analyst output. The analyst emits four
 * named sections: ## Annotations, ## Slop, ## Claims, ## Question. We parse
 * on every text delta so the UI can fill section-by-section as it arrives.
 *
 * Parsing is best-effort: trailing partial section is parsed as far as
 * possible; never throws on incomplete input.
 */

import type { AnvilAnnotation, AnvilClaim, AnvilComprehension } from '../types'

export interface ParsedAnalyst {
  annotations: AnvilAnnotation[]
  slop: number | null
  slopReason: string
  claims: AnvilClaim[]
  comprehension: AnvilComprehension | null
}

const HEADERS = ['Annotations', 'Slop', 'Claims', 'Question'] as const
type HeaderName = (typeof HEADERS)[number]

function splitSections(text: string): Record<HeaderName, string> {
  const out: Record<HeaderName, string> = {
    Annotations: '', Slop: '', Claims: '', Question: '',
  }
  // Find header line positions via a multiline regex.
  const re = /^##\s+(Annotations|Slop|Claims|Question)\s*$/gm
  const matches: Array<{ name: HeaderName; start: number; end: number }> = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    matches.push({ name: m[1] as HeaderName, start: m.index, end: m.index + m[0].length })
  }
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i]
    const next = matches[i + 1]
    const body = text.slice(cur.end, next ? next.start : text.length)
    out[cur.name] = body.trim()
  }
  return out
}

function parseAnnotations(body: string): AnvilAnnotation[] {
  // Bullet lines like: - "span" — note...
  const out: AnvilAnnotation[] = []
  const lines = body.split('\n')
  let current: string | null = null
  for (const raw of lines) {
    const line = raw.trimEnd()
    const m = line.match(/^[-*]\s+(.*)$/)
    if (m) {
      if (current != null) {
        const parsed = parseOneAnnotation(current)
        if (parsed) out.push(parsed)
      }
      current = m[1].trim()
    } else if (current != null && line.trim().length) {
      current += ' ' + line.trim()
    }
  }
  if (current != null) {
    const parsed = parseOneAnnotation(current)
    if (parsed) out.push(parsed)
  }
  return out
}

function parseOneAnnotation(line: string): AnvilAnnotation | null {
  if (/^none$/i.test(line)) return null
  // Patterns: "span" — note  /  "span" - note  /  span — note  /  span -- note
  const re = /^["“]([^"”]+)["”]\s*[—–-]+\s*(.+)$/
  const m = line.match(re)
  const span = m ? m[1].trim() : ''
  const note = m ? m[2].trim() : line.trim()
  // Heuristic: pull a "Suggested replacement: 'X'" or "Suggested: 'X'" or
  // "Suggest: 'X'" or "Suggested replacement: \"X\"" out of the note body.
  const suggestion = extractSuggestion(note)
  return {
    id: '', // assigned by the store from paragraphIndex + index
    span,
    note,
    suggestion,
    decision: 'pending',
  }
}

function extractSuggestion(note: string): string | undefined {
  // "Suggested replacement: 'X'" / "Suggested: 'X'" / "Suggest: 'X'" / "→ 'X'"
  const patterns = [
    /[Ss]uggested(?:\s+replacement)?\s*:?\s*["“]([^"”]+)["”]/,
    /[Ss]uggest(?:ion)?:?\s*["“]([^"”]+)["”]/,
    /(?:use|try)\s+["“]([^"”]+)["”]/i,
    /→\s*["“]([^"”]+)["”]/,
  ]
  for (const re of patterns) {
    const m = note.match(re)
    if (m) return m[1].trim()
  }
  return undefined
}

function parseSlop(body: string): { score: number | null; reason: string } {
  const scoreLine = body.split('\n').find((l) => /\d+(\.\d+)?\s*\/\s*10/.test(l))
  const reason = body.split('\n').slice(1).join(' ').trim()
  if (!scoreLine) return { score: null, reason }
  const sm = scoreLine.match(/(\d+(?:\.\d+)?)\s*\/\s*10/)
  return { score: sm ? Math.min(10, Number(sm[1])) : null, reason }
}

function parseClaims(body: string): AnvilClaim[] {
  const out: AnvilClaim[] = []
  for (const raw of body.split('\n')) {
    const line = raw.trim()
    if (!line.startsWith('-') && !line.startsWith('*')) continue
    const inner = line.replace(/^[-*]\s+/, '')
    if (/^none$/i.test(inner)) continue
    // Pattern: "claim text" → [ok|verify]   or   claim text -> [ok|verify]
    const m = inner.match(/^["“]?([^"”]+?)["”]?\s*(?:→|->|—|–|-)\s*\[(ok|verify)\]\s*$/i)
    if (m) {
      out.push({
        text: m[1].trim(),
        verdict: m[2].toLowerCase() === 'ok' ? 'ok' : 'verify',
      })
    } else {
      // Plain bullet — treat as verify by default
      out.push({ text: inner.replace(/^["“]|["”]$/g, '').trim(), verdict: 'verify' })
    }
  }
  return out
}

function parseQuestion(body: string): AnvilComprehension | null {
  const trimmed = body.trim()
  if (!trimmed) return null
  if (/^skip\b/i.test(trimmed)) {
    return {
      question: '',
      state: 'skipped',
      isTransitional: true,
    }
  }
  return {
    question: trimmed.replace(/^[Qq]:\s*/, ''),
    state: 'unanswered',
    isTransitional: false,
  }
}

export function parseAnalystOutput(text: string): ParsedAnalyst {
  const sections = splitSections(text)
  const slop = parseSlop(sections.Slop)
  return {
    annotations: parseAnnotations(sections.Annotations),
    slop: slop.score,
    slopReason: slop.reason,
    claims: parseClaims(sections.Claims),
    comprehension: parseQuestion(sections.Question),
  }
}
