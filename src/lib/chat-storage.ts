import type { ChatMode, ChatMessageT, ChatThread, ThreadUsage } from '../types'

/**
 * Tiny frontmatter parser — we own both ends of the format, so we don't need a
 * full YAML implementation (which would pull in Buffer-using deps).
 */
function parseFrontmatter(text: string): { data: Record<string, string>; content: string } {
  if (!text.startsWith('---\n')) return { data: {}, content: text }
  const end = text.indexOf('\n---', 4)
  if (end === -1) return { data: {}, content: text }
  const yaml = text.slice(4, end)
  const content = text.slice(end + 4).replace(/^\n/, '')
  const data: Record<string, string> = {}
  for (const line of yaml.split('\n')) {
    const m = line.match(/^([a-zA-Z_][\w]*):\s*(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      try {
        v = JSON.parse(v.replace(/^'|'$/g, '"'))
      } catch {
        v = v.slice(1, -1)
      }
    }
    data[m[1]] = v
  }
  return { data, content }
}

export interface ParsedChat {
  title: string
  mode: ChatMode
  model: string
  createdAt: string
  updatedAt: string
  messages: ChatMessageT[]
  usage: ThreadUsage
}

/**
 * Parse a chat.md file body into structured messages.
 *
 * Message delimiters look like:
 *   `## You — HH:MM:SS`
 *   `## Model display ({model id}) — HH:MM:SS`
 *
 * IMPORTANT: assistant content frequently contains `## …` markdown headings
 * (e.g. "## Prompt 1: …"). We must NOT treat those as message boundaries —
 * only lines that end with the literal em-dash + `HH:MM:SS` suffix are real
 * message headers. We find header positions with a strict regex and slice the
 * body between them; everything in between stays inside the message body.
 */
const MESSAGE_HEADER_RE = /^## (You|.+?)(?:\s+\((.+?)\))?\s+—\s+(\d{2}:\d{2}:\d{2})\s*$/gm

export function parseChatFile(text: string): ParsedChat {
  const parsed = parseFrontmatter(text)
  const fm = parsed.data as Record<string, unknown>
  const body = parsed.content

  const messages: ChatMessageT[] = []
  // Walk all header positions in one pass. Each match's `index` is the start
  // of the header line; the message body is the slice from end-of-header up
  // to the next header's start (or end-of-body for the last one).
  type Header = { start: number; headerEnd: number; bodyEnd: number; who: string; modelId: string | undefined; ts: string }
  const headers: Header[] = []
  MESSAGE_HEADER_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = MESSAGE_HEADER_RE.exec(body)) !== null) {
    headers.push({
      start: match.index,
      headerEnd: match.index + match[0].length,
      bodyEnd: 0, // back-filled below
      who: match[1],
      modelId: match[2],
      ts: match[3],
    })
  }
  for (let i = 0; i < headers.length; i++) {
    headers[i].bodyEnd = i + 1 < headers.length ? headers[i + 1].start : body.length
  }

  for (const h of headers) {
    const role: 'user' | 'assistant' = h.who === 'You' ? 'user' : 'assistant'
    const rawContent = body.slice(h.headerEnd, h.bodyEnd)
    const content = rawContent.replace(/^\n+/, '').replace(/\n+$/, '')

    // Pull image references out of content. On USER messages, references to
    // `./att-NN-…` files are attachments (user-uploaded); other `./…` images
    // are assistant-side generated images (legacy) we keep in `images`. On
    // ASSISTANT messages everything stays in `images`.
    const images: string[] = []
    const attachments: import('../types').Attachment[] = []
    let stripped = content
    // Image links: ![](./xxx)
    stripped = stripped.replace(/!\[[^\]]*]\((\.\/[^)]+)\)/g, (_full, p1: string) => {
      if (role === 'user' && /\/att-\d+-/.test(p1)) {
        const name = p1.replace(/^\.\//, '').replace(/^att-\d+-/, '')
        attachments.push({ relPath: p1, mime: 'image/png', kind: 'image', name })
      } else {
        images.push(p1)
      }
      return ''
    })
    // PDF / file links: [📄 name.pdf](./att-NN-name.pdf)
    stripped = stripped.replace(/\[📄\s*([^\]]+)\]\((\.\/[^)]+)\)/g, (_full, name: string, p2: string) => {
      attachments.push({
        relPath: p2,
        mime: 'application/pdf',
        kind: 'pdf',
        name: name.trim(),
      })
      return ''
    })
    stripped = stripped.replace(/\n{3,}/g, '\n\n').trim()

    messages.push({
      role,
      content: stripped,
      images: images.length ? images : undefined,
      attachments: attachments.length ? attachments : undefined,
      timestamp: h.ts,
      model: h.modelId,
    })
  }

  return {
    title: (fm.title as string) || 'Untitled chat',
    mode: ((fm.mode as ChatMode) || 'text'),
    model: (fm.model as string) || '',
    createdAt: (fm.created as string) || new Date().toISOString(),
    updatedAt: (fm.updated as string) || new Date().toISOString(),
    messages,
    usage: {
      tokensIn: Number(fm.tokens_in) || 0,
      tokensOut: Number(fm.tokens_out) || 0,
      imagesGenerated: Number(fm.images_generated) || 0,
      costUsd: Number(fm.cost_usd) || 0,
    },
  }
}

export function serializeChatFile(thread: Omit<ChatThread, 'dirHandle'>): string {
  const fm = [
    '---',
    `id: ${thread.id}`,
    `title: ${escapeYaml(thread.title)}`,
    `mode: ${thread.mode}`,
    `model: ${thread.model}`,
    `created: ${thread.createdAt}`,
    `updated: ${thread.updatedAt}`,
    `tokens_in: ${thread.usage.tokensIn}`,
    `tokens_out: ${thread.usage.tokensOut}`,
    `images_generated: ${thread.usage.imagesGenerated}`,
    `cost_usd: ${thread.usage.costUsd.toFixed(4)}`,
    '---',
    '',
  ].join('\n')

  const parts: string[] = [fm]
  for (const m of thread.messages) {
    const ts = m.timestamp || new Date().toISOString().slice(11, 19)
    if (m.role === 'user') {
      parts.push(`## You — ${ts}\n`)
    } else {
      const display = displayNameForModel(m.model || thread.model)
      parts.push(`## ${display} (${m.model || thread.model}) — ${ts}\n`)
    }
    parts.push(m.content.trim() + '\n')
    if (m.images?.length) {
      parts.push('')
      for (const path of m.images) parts.push(`![](${path})\n`)
    }
    if (m.attachments?.length) {
      parts.push('')
      for (const att of m.attachments) {
        if (att.kind === 'image') {
          parts.push(`![](${att.relPath})\n`)
        } else {
          parts.push(`[📄 ${att.name}](${att.relPath})\n`)
        }
      }
    }
    parts.push('')
  }
  return parts.join('\n')
}

function displayNameForModel(id: string): string {
  if (!id) return 'Assistant'
  const slug = id.split('/').pop() || id
  return slug
    .replace(/[-_:]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}

function escapeYaml(s: string): string {
  if (/[:#\n]/.test(s)) return JSON.stringify(s)
  return s
}

export function makeThreadId(title: string): string {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const mi = String(now.getMinutes()).padStart(2, '0')
  const slug = (title || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'untitled'
  return `${yyyy}-${mm}-${dd}-${hh}${mi}-${slug}`
}

export async function listThreadFolders(root: FileSystemDirectoryHandle): Promise<Array<{
  id: string
  dirHandle: FileSystemDirectoryHandle
  meta: ParsedChat | null
}>> {
  const out: Array<{ id: string; dirHandle: FileSystemDirectoryHandle; meta: ParsedChat | null }> = []
  for await (const [name, handle] of root.entries()) {
    if (handle.kind !== 'directory') continue
    let meta: ParsedChat | null = null
    try {
      const fileHandle = await (handle as FileSystemDirectoryHandle).getFileHandle('chat.md')
      const file = await fileHandle.getFile()
      const text = await file.text()
      meta = parseChatFile(text)
    } catch {
      // No chat.md; skip
    }
    out.push({ id: name, dirHandle: handle as FileSystemDirectoryHandle, meta })
  }
  // Most recent first by updatedAt (or fallback to id which is timestamped)
  out.sort((a, b) => {
    const ax = a.meta?.updatedAt || a.id
    const bx = b.meta?.updatedAt || b.id
    return ax > bx ? -1 : ax < bx ? 1 : 0
  })
  return out
}

export async function writeChatFile(dir: FileSystemDirectoryHandle, content: string): Promise<void> {
  const handle = await dir.getFileHandle('chat.md', { create: true })
  const w = await handle.createWritable()
  await w.write(content)
  await w.close()
}

export async function createThreadFolder(root: FileSystemDirectoryHandle, id: string): Promise<FileSystemDirectoryHandle> {
  return root.getDirectoryHandle(id, { create: true })
}

export async function removeThreadFolder(root: FileSystemDirectoryHandle, id: string): Promise<void> {
  await root.removeEntry(id, { recursive: true })
}

export async function readThreadImages(dir: FileSystemDirectoryHandle): Promise<Map<string, string>> {
  // Returns relative path (./NN.png) → object URL
  const out = new Map<string, string>()
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind !== 'file') continue
    if (!/\.(png|jpe?g|webp|gif)$/i.test(name)) continue
    const file = await (handle as FileSystemFileHandle).getFile()
    out.set(`./${name}`, URL.createObjectURL(file))
  }
  return out
}
