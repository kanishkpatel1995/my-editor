/**
 * File-attachment helpers for chat messages.
 *
 * Attachments live in the thread folder alongside `chat.md` and any generated
 * images. We persist them with an `att-NN-<safe-name>.<ext>` naming so they
 * sort predictably and don't collide with generated-image filenames
 * (`NN.ext`).
 */

import type { Attachment } from '../types'

export const MAX_IMAGE_EDGE_PX = 1536
export const MAX_TOTAL_PAYLOAD_BYTES = 15 * 1024 * 1024  // 15 MB

/** A file selected in the input that hasn't been persisted yet. */
export interface PendingAttachment {
  file: File
  kind: 'image' | 'pdf'
  /** Object URL for in-input preview. Caller must revoke when removing. */
  previewUrl: string
  /** Set after downscaling — keeps the user informed via the chip UI. */
  downscaled?: boolean
}

export function classifyFile(file: File): 'image' | 'pdf' | null {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return 'pdf'
  return null
}

/** Read a File / Blob as a base64 `data:` URL. */
export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

/**
 * Downscale an image File so its longest edge is at most `maxEdge` pixels.
 * Returns the original File unchanged if it's already small enough.
 * Skips animated formats (best effort: GIF is left alone).
 */
export async function downscaleImageIfHuge(
  file: File,
  maxEdge = MAX_IMAGE_EDGE_PX,
): Promise<{ file: File; downscaled: boolean }> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') {
    return { file, downscaled: false }
  }
  const bmp = await createImageBitmap(file).catch(() => null)
  if (!bmp) return { file, downscaled: false }
  const longest = Math.max(bmp.width, bmp.height)
  if (longest <= maxEdge) {
    bmp.close()
    return { file, downscaled: false }
  }
  const scale = maxEdge / longest
  const w = Math.round(bmp.width * scale)
  const h = Math.round(bmp.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bmp.close()
    return { file, downscaled: false }
  }
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
  const quality = outType === 'image/jpeg' ? 0.9 : undefined
  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, outType, quality),
  )
  if (!blob) return { file, downscaled: false }
  const ext = outType === 'image/png' ? 'png' : 'jpg'
  const safeStem = file.name.replace(/\.[^.]+$/, '') || 'image'
  const downscaledFile = new File([blob], `${safeStem}.${ext}`, { type: outType })
  return { file: downscaledFile, downscaled: true }
}

/** Sanitise a filename for filesystem-safe writing. Keeps the original extension. */
function safeName(name: string): string {
  const dot = name.lastIndexOf('.')
  const stem = (dot >= 0 ? name.slice(0, dot) : name) || 'file'
  const ext = dot >= 0 ? name.slice(dot) : ''
  const cleaned = stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'file'
  return cleaned + ext.toLowerCase()
}

/** List existing `att-NN-…` files in a thread directory to compute the next index. */
async function nextAttachmentIndex(threadDir: FileSystemDirectoryHandle): Promise<number> {
  let max = 0
  for await (const [name, handle] of threadDir.entries()) {
    if (handle.kind !== 'file') continue
    const m = name.match(/^att-(\d+)-/)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return max + 1
}

/**
 * Write a pending attachment into the thread folder and return its persisted
 * descriptor. The relative path uses `./att-NN-name.ext` so the existing
 * markdown serialiser and image-handling code both work without changes.
 */
export async function saveAttachmentToThread(
  threadDir: FileSystemDirectoryHandle,
  pending: PendingAttachment,
): Promise<Attachment> {
  const idx = await nextAttachmentIndex(threadDir)
  const indexStr = String(idx).padStart(2, '0')
  const filename = `att-${indexStr}-${safeName(pending.file.name)}`
  const fh = await threadDir.getFileHandle(filename, { create: true })
  const writable = await fh.createWritable()
  await writable.write(pending.file)
  await writable.close()
  return {
    relPath: `./${filename}`,
    mime: pending.file.type || (pending.kind === 'pdf' ? 'application/pdf' : 'application/octet-stream'),
    kind: pending.kind,
    name: pending.file.name,
    sizeBytes: pending.file.size,
  }
}

/** Read a persisted attachment off disk and return a `data:` URL for the API call. */
export async function loadAttachmentDataUrl(
  threadDir: FileSystemDirectoryHandle,
  relPath: string,
): Promise<string> {
  const fname = relPath.replace(/^\.\//, '')
  const fh = await threadDir.getFileHandle(fname)
  const file = await fh.getFile()
  return fileToDataUrl(file)
}

/**
 * Read a persisted image off disk, downscale to at most `maxEdge` px on its
 * longest side, and return as a base64 data URL. For the critique flow we
 * want a smaller payload than the generic attachment path — Gemini's 1024×
 * PNGs base64-encode to ~1.5 MB which can fail at the TLS layer with very
 * large surrounding prompts.
 */
export async function loadImageDataUrlDownscaled(
  threadDir: FileSystemDirectoryHandle,
  relPath: string,
  maxEdge = 1024,
): Promise<{ dataUrl: string; downscaled: boolean; originalBytes: number; finalBytes: number }> {
  const fname = relPath.replace(/^\.\//, '')
  const fh = await threadDir.getFileHandle(fname)
  const file = await fh.getFile()
  const originalBytes = file.size
  const { file: scaled, downscaled } = await downscaleImageIfHuge(file, maxEdge)
  const dataUrl = await fileToDataUrl(scaled)
  return { dataUrl, downscaled, originalBytes, finalBytes: scaled.size }
}

/** Format a byte count for chip labels (e.g. "412 KB", "1.2 MB"). */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
