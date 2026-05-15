/**
 * Parser for the ANVIL verifier response. Tolerant of imperfect model output:
 * accepts both the old comma-separated SOURCES format (single line) and the
 * new pipe-separated bulleted format (one source per line, fields:
 * `- <url> | <title> | <snippet>`).
 */

import type { VerifierSource } from '../types'

export interface VerifierResult {
  verdict: 'verified-true' | 'verified-false' | 'inconclusive'
  confidence: 'low' | 'medium' | 'high'
  sources: VerifierSource[]
  explanation: string
}

const URL_RE = /https?:\/\/[^\s,)|]+/g

export function parseVerifierResponse(text: string): VerifierResult {
  const verdict = (() => {
    const m = text.match(/^VERDICT:\s*(TRUE|FALSE|INCONCLUSIVE)/im)
    if (!m) return 'inconclusive' as const
    return m[1] === 'TRUE'
      ? ('verified-true' as const)
      : m[1] === 'FALSE'
        ? ('verified-false' as const)
        : ('inconclusive' as const)
  })()

  const confidence = (() => {
    const m = text.match(/^CONFIDENCE:\s*(LOW|MEDIUM|HIGH)/im)
    return ((m?.[1] || 'LOW').toLowerCase()) as 'low' | 'medium' | 'high'
  })()

  const explanation = (() => {
    const m = text.match(/^EXPLANATION:\s*([\s\S]*?)(?=^SOURCES:|$)/im)
    if (m) return m[1].trim()
    // Fall back: any text between SOURCES and end of CONFIDENCE block.
    const idx = text.search(/^SOURCES:/im)
    if (idx === -1) return text.trim()
    const before = text.slice(0, idx)
    const lines = before.split('\n').slice(2)  // skip VERDICT + CONFIDENCE lines
    return lines.join(' ').trim()
  })()

  const sources = parseSources(text)

  return { verdict, confidence, sources, explanation }
}

/**
 * Parses the educational-explainer response (no VERDICT, just EXPLANATION +
 * SOURCES) into the same shape. Tolerant of partial streamed input so the
 * UI can render progressively.
 */
export interface EducationalExplainerResult {
  explanation: string
  sources: VerifierSource[]
}

export function parseEducationalExplainerResponse(text: string): EducationalExplainerResult {
  // Pull EXPLANATION: <body> up to the SOURCES: header (or end of text)
  const m = text.match(/^EXPLANATION:\s*([\s\S]*?)(?=^SOURCES:|$)/im)
  const explanation = m
    ? m[1].trim()
    : text.split(/^SOURCES:/im)[0].replace(/^EXPLANATION:\s*/i, '').trim()
  return { explanation, sources: parseSources(text) }
}

function parseSources(text: string): VerifierSource[] {
  const idx = text.search(/^SOURCES:/im)
  if (idx === -1) return []
  const tail = text.slice(idx).split('\n').slice(1).join('\n')
  if (/^\s*-?\s*NONE\s*$/im.test(tail)) return []

  const out: VerifierSource[] = []

  // Format A — new bulleted: `- <url> | <title> | <snippet>`
  const bulletLines = tail.split('\n').filter((l) => /^\s*-\s+/.test(l))
  for (const raw of bulletLines) {
    const line = raw.replace(/^\s*-\s+/, '').trim()
    if (/^NONE$/i.test(line)) continue
    const parts = line.split('|').map((p) => p.trim())
    const urlPart = parts[0] || ''
    const url = (urlPart.match(URL_RE) || [])[0]
    if (!url) {
      // Maybe URL embedded in the line — pull first URL anywhere
      const m = line.match(URL_RE)
      if (m) out.push({ url: m[0] })
      continue
    }
    out.push({
      url,
      title: parts[1] || undefined,
      snippet: parts.slice(2).join(' | ').trim() || undefined,
    })
  }
  if (out.length) return out.slice(0, 6)

  // Format B — legacy single line: `SOURCES: url1, url2`
  const inline = tail.match(URL_RE)
  if (inline) {
    for (const u of inline.slice(0, 6)) out.push({ url: u })
  }
  return out
}
