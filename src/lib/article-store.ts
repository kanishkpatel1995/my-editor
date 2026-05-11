import type { ArticleRef, CompanionKind } from '../types'
import { companionPathsFor, currentWeekFolderName, dayAbbrevForDate, dayNumberForDate, parseArticleFilename, slugify } from './workflow'
import { ensureRWPermission } from './fs'

/* ─────────── Helpers ─────────── */

async function getDir(
  root: FileSystemDirectoryHandle,
  segments: string[],
  create = false,
): Promise<FileSystemDirectoryHandle> {
  let dir = root
  for (const seg of segments) {
    dir = await dir.getDirectoryHandle(seg, { create })
  }
  return dir
}

async function readFile(
  root: FileSystemDirectoryHandle,
  segments: string[],
  filename: string,
): Promise<{ handle: FileSystemFileHandle; text: string } | null> {
  try {
    const dir = await getDir(root, segments)
    const handle = await dir.getFileHandle(filename)
    const text = await (await handle.getFile()).text()
    return { handle, text }
  } catch {
    return null
  }
}

async function writeFile(
  root: FileSystemDirectoryHandle,
  segments: string[],
  filename: string,
  text: string,
): Promise<FileSystemFileHandle> {
  const dir = await getDir(root, segments, true)
  const handle = await dir.getFileHandle(filename, { create: true })
  const w = await handle.createWritable()
  await w.write(text)
  await w.close()
  return handle
}

/* ─────────── Listing ─────────── */

export async function listWeeks(root: FileSystemDirectoryHandle): Promise<string[]> {
  await ensureRWPermission(root)
  const out: string[] = []
  for await (const [name, handle] of root.entries()) {
    if (handle.kind === 'directory' && /^week[-_]of/i.test(name)) {
      out.push(name)
    }
  }
  out.sort((a, b) => (a < b ? 1 : -1)) // newest first
  return out
}

export async function listArticlesInWeek(
  root: FileSystemDirectoryHandle,
  weekFolder: string,
): Promise<ArticleRef[]> {
  const out: ArticleRef[] = []
  try {
    const articlesDir = await getDir(root, [weekFolder, 'articles'])
    for await (const [name, handle] of articlesDir.entries()) {
      if (handle.kind !== 'file') continue
      const ref = parseArticleFilename(weekFolder, name)
      if (ref) out.push(ref)
    }
  } catch {
    return []
  }
  out.sort((a, b) => a.dayNumber - b.dayNumber)
  return out
}

/* ─────────── Article reads / writes ─────────── */

export async function readArticle(
  root: FileSystemDirectoryHandle,
  ref: ArticleRef,
): Promise<{ handle: FileSystemFileHandle; text: string } | null> {
  return readFile(root, [ref.weekFolder, 'articles'], ref.filename)
}

export async function writeArticle(
  root: FileSystemDirectoryHandle,
  ref: ArticleRef,
  text: string,
): Promise<FileSystemFileHandle> {
  return writeFile(root, [ref.weekFolder, 'articles'], ref.filename, text)
}

export async function createTodayArticle(
  root: FileSystemDirectoryHandle,
  title: string,
  today: Date = new Date(),
): Promise<{ ref: ArticleRef; handle: FileSystemFileHandle; text: string }> {
  const slug = slugify(title)
  const dayNum = dayNumberForDate(today)
  const dayAb = dayAbbrevForDate(today)
  const filename = `${String(dayNum).padStart(2, '0')}-${dayAb}-${slug}.md`
  const weekFolder = currentWeekFolderName(today)
  const ref: ArticleRef = { weekFolder, dayNumber: dayNum, dayAbbrev: dayAb, slug, filename }
  const text = `# ${title}\n\n`
  const handle = await writeFile(root, [weekFolder, 'articles'], filename, text)
  return { ref, handle, text }
}

/* ─────────── Companions ─────────── */

export async function readCompanion(
  root: FileSystemDirectoryHandle,
  ref: ArticleRef,
  kind: CompanionKind,
): Promise<{ handle: FileSystemFileHandle; text: string } | null> {
  const paths = companionPathsFor(ref)
  const rel = kind === 'linkedin' ? paths.linkedin : paths.diagram
  // Split 'linkedin/05-fri-…' into [folder, filename]
  const slash = rel.indexOf('/')
  const folder = rel.slice(0, slash)
  const filename = rel.slice(slash + 1)
  return readFile(root, [ref.weekFolder, folder], filename)
}

export async function companionExists(
  root: FileSystemDirectoryHandle,
  ref: ArticleRef,
  kind: CompanionKind,
): Promise<boolean> {
  return (await readCompanion(root, ref, kind)) != null
}

/* ─────────── Today / latest detection ─────────── */

export interface TodayOrLatest {
  today: ArticleRef | null
  latest: ArticleRef | null
  weekFolder: string
  weekArticles: ArticleRef[]
}

export async function detectTodayOrLatest(
  root: FileSystemDirectoryHandle,
  today: Date = new Date(),
): Promise<TodayOrLatest> {
  const weekFolder = currentWeekFolderName(today)
  const weekArticles = await listArticlesInWeek(root, weekFolder)
  const wantedNum = dayNumberForDate(today)
  const wantedAb = dayAbbrevForDate(today)
  const todayMatch =
    weekArticles.find((a) => a.dayNumber === wantedNum && a.dayAbbrev === wantedAb) || null

  // Latest by day-number within the current week (max). If empty, look back through earlier weeks.
  let latest: ArticleRef | null =
    weekArticles.length > 0
      ? weekArticles[weekArticles.length - 1]
      : null

  if (!latest) {
    const weeks = await listWeeks(root)
    for (const wk of weeks) {
      if (wk === weekFolder) continue
      const arts = await listArticlesInWeek(root, wk)
      if (arts.length > 0) {
        latest = arts[arts.length - 1]
        break
      }
    }
  }

  return { today: todayMatch, latest, weekFolder, weekArticles }
}
