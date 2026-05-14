/**
 * Deterministic, LLM-free slop scorer.
 *
 * This is the *surface-marker* channel that feeds the AI-MARKERS chip in the
 * metrics strip. It's separate from (and complementary to) the analyst
 * model's slop score, which judges argumentative weakness.
 *
 * Source list compiled from:
 *  - Empirical word-frequency studies of GPT-generated text
 *  - The "delve" paper and follow-ups
 *  - Common AI-tells documented in writing communities
 */

const VOCAB_TELLS: string[] = [
  // Single-word AI-tells
  'delve', 'leverage', 'navigate', 'tapestry', 'robust', 'comprehensive',
  'explore', 'foster', 'utilise', 'utilize', 'showcase', 'pivotal',
  'paramount', 'underscore', 'elucidate', 'multifaceted', 'meticulous',
  'invaluable', 'crucial', 'imperative', 'embark', 'realm',
  'overarching', 'holistic', 'seamless', 'synergy', 'cutting-edge',
  'streamline', 'unprecedented', 'dynamic',
]

const PHRASE_TELLS: string[] = [
  // Multi-word AI-tells
  "in today's", "in the realm of", 'in the digital age', "in today's fast-paced",
  'it is important to note', 'it is worth noting', "let's dive in",
  'in conclusion', 'in summary', 'to summarize', 'as we have seen',
  'on the other hand', 'with that said', 'that being said',
  'when it comes to', 'at the end of the day', 'in the world of',
  'embark on a journey',
]

const HEDGING_TELLS: string[] = [
  'arguably', 'essentially', 'fundamentally', 'effectively',
  'in many ways', 'in some sense', 'to a certain extent',
  'broadly speaking',
]

const TRANSITIONS: string[] = [
  'moreover', 'furthermore', 'additionally', 'consequently', 'thus',
  'therefore', 'hence',
]

export interface SlopFeatureCounts {
  vocabTells: number
  phraseTells: number
  hedgingTells: number
  transitions: number
  bulletDensity: number  // fraction of lines that are bullets
  ruleOfThree: number    // count of `X, Y, and Z` triplets
  sentenceCount: number
  wordCount: number
}

function countOccurrences(haystack: string, needles: string[]): number {
  let n = 0
  for (const needle of needles) {
    // word-boundary case-insensitive; phrases use simple includes
    if (needle.includes(' ')) {
      const re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
      const m = haystack.match(re)
      if (m) n += m.length
    } else {
      const re = new RegExp(`\\b${needle}\\b`, 'gi')
      const m = haystack.match(re)
      if (m) n += m.length
    }
  }
  return n
}

export function scoreParagraphSlop(text: string): { score: number; counts: SlopFeatureCounts } {
  const lower = text.toLowerCase()
  const lines = text.split('\n').filter((l) => l.trim().length > 0)
  const bulletLines = lines.filter((l) => /^\s*[-*•]\s+|^\s*\d+\.\s+/.test(l)).length
  const sentences = text.split(/[.!?]+(?=\s|$)/).filter((s) => s.trim().length > 5)
  const words = text.split(/\s+/).filter((w) => w.length > 0)

  const ruleOfThree = (text.match(/\b\w+\b,\s+\b\w+\b,?\s+and\s+\b\w+\b/gi) || []).length

  const counts: SlopFeatureCounts = {
    vocabTells: countOccurrences(lower, VOCAB_TELLS),
    phraseTells: countOccurrences(lower, PHRASE_TELLS),
    hedgingTells: countOccurrences(lower, HEDGING_TELLS),
    transitions: countOccurrences(lower, TRANSITIONS),
    bulletDensity: lines.length ? bulletLines / lines.length : 0,
    ruleOfThree,
    sentenceCount: sentences.length,
    wordCount: words.length,
  }

  // Score 0-10. Weight tells per ~50 words so short paragraphs aren't unfairly
  // punished and long ones aren't underweighted.
  const per50 = (n: number) => (counts.wordCount ? (n / counts.wordCount) * 50 : 0)

  const score =
    per50(counts.vocabTells) * 2.5 +
    per50(counts.phraseTells) * 4.0 +
    per50(counts.hedgingTells) * 1.5 +
    per50(counts.transitions) * 1.5 +
    counts.bulletDensity * 3.0 +
    Math.min(counts.ruleOfThree, 3) * 0.6

  return { score: Math.min(10, Math.round(score * 10) / 10), counts }
}

export function bandForScore(score: number): 'low' | 'medium' | 'high' {
  if (score < 3.5) return 'low'
  if (score < 6.0) return 'medium'
  return 'high'
}

export function bandForAverage(scores: Array<number | null>): 'low' | 'medium' | 'high' {
  const ns = scores.filter((s): s is number => s != null)
  if (!ns.length) return 'low'
  const avg = ns.reduce((a, b) => a + b, 0) / ns.length
  return bandForScore(avg)
}
