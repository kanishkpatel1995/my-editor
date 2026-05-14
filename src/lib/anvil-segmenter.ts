/**
 * Article markdown → paragraph units for ANVIL.
 *
 * Splits on blank lines. Skips: ATX headings (`# `, `## `, etc.), fenced code
 * blocks (between ``` markers), images on their own lines, horizontal rules,
 * frontmatter blocks. Skipped paragraphs are returned with `skip: true` so the
 * UI can render them as dimmed placeholders without breaking the index.
 */

export interface AnvilSegment {
  index: number      // 1-based, position in the article
  text: string
  skip: boolean
  skipReason?: 'heading' | 'code' | 'image' | 'rule' | 'frontmatter' | 'empty'
}

function stripFrontmatter(md: string): string {
  if (!md.startsWith('---\n')) return md
  const end = md.indexOf('\n---', 4)
  return end === -1 ? md : md.slice(end + 4).replace(/^\n/, '')
}

/**
 * A "pseudo-heading" is a short, single-line, entirely-bolded paragraph that
 * the author used as a section label (e.g. `**Five sentences to take with you**`)
 * instead of an ATX heading. We treat them as headings — analysing them is a
 * waste and reliably triggers analyst confabulation.
 */
function isShortBoldPseudoHeading(text: string): boolean {
  // Single line.
  if (text.includes('\n')) return false
  // Wrapped in `**` start to end (allow trailing punctuation just in case).
  if (!/^\*\*[^*]+\*\*\s*[.!?:]?\s*$/.test(text)) return false
  // Short — under ~12 words and 80 chars after stripping the stars.
  const inner = text.replace(/^\*\*|\*\*\s*[.!?:]?\s*$/g, '')
  if (inner.length > 80) return false
  if (inner.split(/\s+/).length > 12) return false
  return true
}

export function segmentArticle(markdown: string): AnvilSegment[] {
  const body = stripFrontmatter(markdown)
  const lines = body.split('\n')
  const segments: AnvilSegment[] = []
  let buf: string[] = []
  let inFence = false
  let idx = 0

  const flush = (skipReason?: AnvilSegment['skipReason']) => {
    const text = buf.join('\n').trim()
    if (!text) {
      buf = []
      return
    }
    idx += 1
    if (skipReason) {
      segments.push({ index: idx, text, skip: true, skipReason })
    } else {
      // Detect single-line skip patterns that came in as their own paragraph.
      if (/^#{1,6}\s+/.test(text)) {
        segments.push({ index: idx, text, skip: true, skipReason: 'heading' })
      } else if (/^!\[[^\]]*]\([^)]+\)\s*$/.test(text)) {
        segments.push({ index: idx, text, skip: true, skipReason: 'image' })
      } else if (/^-{3,}$|^\*{3,}$|^_{3,}$/.test(text)) {
        segments.push({ index: idx, text, skip: true, skipReason: 'rule' })
      } else if (isShortBoldPseudoHeading(text)) {
        // E.g. **Five sentences to take with you** on its own line — markdown
        // bold used as a section heading rather than ATX `## `. Single-line,
        // entirely-bold, short. Treat as a heading so the analyst doesn't
        // waste tokens (and confabulate) on a structural label.
        segments.push({ index: idx, text, skip: true, skipReason: 'heading' })
      } else {
        segments.push({ index: idx, text, skip: false })
      }
    }
    buf = []
  }

  for (const line of lines) {
    if (/^```/.test(line)) {
      if (inFence) {
        // close fence — emit the whole block as a skipped paragraph
        buf.push(line)
        inFence = false
        flush('code')
        continue
      }
      // open fence — flush any pending prose first
      flush()
      inFence = true
      buf.push(line)
      continue
    }
    if (inFence) {
      buf.push(line)
      continue
    }
    if (line.trim() === '') {
      flush()
    } else {
      buf.push(line)
    }
  }
  // Final flush
  if (inFence) flush('code')
  else flush()

  return segments
}
