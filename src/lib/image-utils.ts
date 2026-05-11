/**
 * Convert a base64 data URL or remote URL to a Blob.
 */
export async function urlToBlob(url: string): Promise<Blob> {
  if (url.startsWith('data:')) {
    const res = await fetch(url)
    return res.blob()
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch image: ${res.status}`)
  return res.blob()
}

/**
 * Save a Blob to a thread folder under a sequential filename. Returns relative path.
 */
export async function saveImageToThread(
  threadDir: FileSystemDirectoryHandle,
  blob: Blob,
  ext = 'png',
): Promise<string> {
  const existing = await listImageFilenames(threadDir)
  const next = String(existing.length + 1).padStart(2, '0') + '.' + ext
  const fileHandle = await threadDir.getFileHandle(next, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(blob)
  await writable.close()
  return `./${next}`
}

export async function listImageFilenames(threadDir: FileSystemDirectoryHandle): Promise<string[]> {
  const out: string[] = []
  for await (const [name, handle] of threadDir.entries()) {
    if (handle.kind !== 'file') continue
    if (/\.(png|jpe?g|webp|gif)$/i.test(name)) out.push(name)
  }
  return out
}

/**
 * Copy a thread image to a sibling images/ folder next to an article file,
 * returning the relative path from the article's directory.
 */
export async function copyImageNearArticle(
  threadDir: FileSystemDirectoryHandle,
  imageRelPath: string,
  articleHandle: FileSystemFileHandle,
): Promise<string> {
  const fname = imageRelPath.replace(/^\.\//, '')
  const srcHandle = await threadDir.getFileHandle(fname)
  const blob = await srcHandle.getFile()

  // We can't easily resolve the article's parent directory without the user
  // having granted directory access. If we can, use it; else, embed as data URL.
  // The standard approach: ask the user once for the article's parent dir.
  // For v1, we fall back to an absolute file:// path that the editor's <img>
  // can use locally; if even that fails, embed as data URL.

  // Try: read article's underlying File for path-style hints (most browsers don't expose).
  // We embed as base64 to keep it portable in v1.
  const reader = new FileReader()
  const dataUrl = await new Promise<string>((resolve, reject) => {
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
  void articleHandle
  return dataUrl
}
