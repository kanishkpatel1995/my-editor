/**
 * Parser for the ANVIL verifier response.
 *
 * Verifier output is structured:
 *   VERDICT: TRUE | FALSE | INCONCLUSIVE
 *   CONFIDENCE: LOW | MEDIUM | HIGH
 *   SOURCES: <comma-separated URLs> | NONE
 *   <one sentence explanation on line 4+>
 */

export interface VerifierResult {
  verdict: 'verified-true' | 'verified-false' | 'inconclusive'
  confidence: 'low' | 'medium' | 'high'
  sources: string[]
  explanation: string
}

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

  const sources = (() => {
    const m = text.match(/^SOURCES:\s*(.+)$/im)
    if (!m) return []
    const raw = m[1].trim()
    if (/^NONE$/i.test(raw)) return []
    return raw.split(/[,\s]+/).filter((s) => /^https?:\/\//.test(s)).slice(0, 6)
  })()

  // Explanation = everything after the SOURCES line, joined.
  const explanation = (() => {
    const idx = text.search(/^SOURCES:/im)
    if (idx === -1) return text.trim()
    const tail = text.slice(idx)
    const nlIdx = tail.indexOf('\n')
    if (nlIdx === -1) return ''
    return tail.slice(nlIdx + 1).trim()
  })()

  return { verdict, confidence, sources, explanation }
}
