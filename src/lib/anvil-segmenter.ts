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
