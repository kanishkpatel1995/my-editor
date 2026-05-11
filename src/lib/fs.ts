/**
 * File System Access API wrappers. Chromium-only; Vite dev runs in Chrome.
 */

export interface OpenedFile {
  handle: FileSystemFileHandle
  name: string
  text: string
}

export async function openMarkdownFile(): Promise<OpenedFile> {
  const [handle] = await window.showOpenFilePicker({
    types: [
      {
        description: 'Markdown',
        accept: { 'text/markdown': ['.md', '.markdown'] },
      },
    ],
    multiple: false,
  })
  const file = await handle.getFile()
  const text = await file.text()
  return { handle, name: handle.name, text }
}

export async function saveMarkdownFile(handle: FileSystemFileHandle, text: string): Promise<void> {
  await ensureRWPermission(handle)
  const writable = await handle.createWritable()
  await writable.write(text)
  await writable.close()
}

export async function saveAsMarkdownFile(text: string, suggestedName?: string): Promise<FileSystemFileHandle> {
  const handle = await window.showSaveFilePicker({
    suggestedName: suggestedName || 'untitled.md',
    types: [
      {
        description: 'Markdown',
        accept: { 'text/markdown': ['.md'] },
      },
    ],
  })
  const writable = await handle.createWritable()
  await writable.write(text)
  await writable.close()
  return handle
}

/**
 * Open the native directory picker.
 *
 * `startIn` may be one of the standard well-known locations
 * (`'documents' | 'pictures' | 'music' | 'desktop' | 'downloads' | 'videos'`)
 * OR a `FileSystemDirectoryHandle`. When a handle is supplied, Chrome opens
 * the picker focused on that directory — so passing the user's current root
 * means a wrong-folder fix is one step up + one click sideways.
 *
 * `id` is a logical-category key Chrome uses to remember the last folder per
 * scope: `'chat-root'`, `'workflow-root'`, `'article-file'`, etc. don't share
 * each other's history.
 */
export type StartInValue =
  | 'documents' | 'pictures' | 'music' | 'desktop' | 'downloads' | 'videos'
  | FileSystemDirectoryHandle

export async function pickDirectory(opts?: {
  startIn?: StartInValue
  id?: string
}): Promise<FileSystemDirectoryHandle> {
  const dpOpts: { mode: 'readwrite'; id?: string; startIn?: StartInValue } = { mode: 'readwrite' }
  if (opts?.id) dpOpts.id = opts.id
  if (opts?.startIn) dpOpts.startIn = opts.startIn
  return window.showDirectoryPicker(dpOpts as Parameters<typeof window.showDirectoryPicker>[0])
}

export async function ensureRWPermission(
  handle: FileSystemHandle,
): Promise<boolean> {
  const opts: { mode: 'readwrite' } = { mode: 'readwrite' }
  const cur = await handle.queryPermission?.(opts)
  if (cur === 'granted') return true
  const req = await handle.requestPermission?.(opts)
  return req === 'granted'
}

export function fsAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showOpenFilePicker' in window
}
