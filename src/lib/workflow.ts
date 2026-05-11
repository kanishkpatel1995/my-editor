import type { ArticleRef, CompanionPaths, DayAbbrev, DayNumber } from '../types'

/**
 * Hardcoded path to the user's Writing-Workflow root. Used as the `startIn`
 * hint for the directory picker and as the splash text on first run. The
 * browser still requires explicit permission via showDirectoryPicker; this is
 * just a constant so a single edit point exists if Drive moves.
 */
export const WRITING_WORKFLOW_PATH =
  '/Users/kanishk/Library/CloudStorage/GoogleDrive-patelkanishk1995@gmail.com/My Drive/remembr.xyz/Learn Agentic AI/Writing-Workflow'

/**
 * Hardcoded path to the in-repo `chat_history/` folder. Same pattern as
 * `WRITING_WORKFLOW_PATH`: the browser still requires `showDirectoryPicker`
 * once to grant permission; this constant is the path we show the user as a
 * hint in the empty state so they can find it quickly.
 *
 * The folder ships in the repo (with a `.gitkeep`) and its contents are
 * gitignored, so each developer's local chat threads stay private.
 */
export const CHAT_HISTORY_PATH =
  '/Users/kanishk/Library/CloudStorage/GoogleDrive-patelkanishk1995@gmail.com/My Drive/remembr.xyz/Learn Agentic AI/my-editor/chat_history'

/** Folder leaf-name. We check `rootDir.name === CHAT_HISTORY_FOLDER_NAME` to
 *  warn the user if they've picked a folder with a different name. */
export const CHAT_HISTORY_FOLDER_NAME = 'chat_history'

const DAY_ABBREVS: DayAbbrev[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

export function dayAbbrevForDate(d: Date): DayAbbrev {
  // Monday-based week; JS getDay(): 0 = Sun, 1 = Mon, … 6 = Sat
  const js = d.getDay()
  const idx = (js + 6) % 7 // Mon=0…Sun=6
  return DAY_ABBREVS[idx]
}

export function dayNumberForDate(d: Date): DayNumber {
  const js = d.getDay()
  const idx = (js + 6) % 7
  return (idx + 1) as DayNumber
}

/** Format a Date as YYYY-MM-DD (local time). */
function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/** The Monday-anchored week folder name for a given date, e.g. 'week-of-2026-05-04'. */
export function currentWeekFolderName(d: Date = new Date()): string {
  const monday = new Date(d)
  const idx = (monday.getDay() + 6) % 7 // Mon = 0
  monday.setDate(monday.getDate() - idx)
  monday.setHours(0, 0, 0, 0)
  return `week-of-${ymd(monday)}`
}

/** Parse '01-mon-multi-agent-growth.md' into an ArticleRef given its week folder. */
export function parseArticleFilename(weekFolder: string, filename: string): ArticleRef | null {
  const m = filename.match(/^(0[1-7])-(mon|tue|wed|thu|fri|sat|sun)-(.+)\.md$/i)
  if (!m) return null
  const dayNumber = parseInt(m[1], 10) as DayNumber
  const dayAbbrev = m[2].toLowerCase() as DayAbbrev
  const slug = m[3]
  return { weekFolder, dayNumber, dayAbbrev, slug, filename }
}

/** Companion sibling paths — relative to the week folder. */
export function companionPathsFor(article: ArticleRef): CompanionPaths {
  const stem = `${String(article.dayNumber).padStart(2, '0')}-${article.dayAbbrev}-${article.slug}`
  return {
    linkedin: `linkedin/${stem}-linkedin.md`,
    diagram: `diagrams/${stem}-diagram.md`,
    evaluation: null,
  }
}

/** "01-mon-…-untitled.md" (template for a new article today). */
export function todayArticleFilename(d: Date = new Date(), slug = 'untitled'): string {
  const n = dayNumberForDate(d)
  const ab = dayAbbrevForDate(d)
  return `${String(n).padStart(2, '0')}-${ab}-${slug}.md`
}

/** Slugify a free-form title into kebab-case. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'untitled'
}

/** Pretty label for the now-editing chip: 'TODAY · 03-WED' or 'LATEST · 06-SAT'. */
export function chipLabel(article: ArticleRef, today: Date = new Date()): string {
  const num = String(article.dayNumber).padStart(2, '0')
  const abbrev = article.dayAbbrev.toUpperCase()
  const isCurrentWeek = article.weekFolder === currentWeekFolderName(today)
  const isToday =
    isCurrentWeek &&
    article.dayNumber === dayNumberForDate(today) &&
    article.dayAbbrev === dayAbbrevForDate(today)
  if (isToday) return `TODAY · ${num}-${abbrev}`
  if (isCurrentWeek) return `THIS WEEK · ${num}-${abbrev}`
  return `${article.weekFolder.replace('week-of-', '')} · ${num}-${abbrev}`
}

/** A short uppercase label for a missing-today empty state, e.g. "WEDNESDAY 8 MAY". */
export function todayPrettyDate(d: Date = new Date()): string {
  const dayName = d.toLocaleDateString(undefined, { weekday: 'long' }).toUpperCase()
  const day = d.getDate()
  const month = d.toLocaleDateString(undefined, { month: 'long' }).toUpperCase()
  return `${dayName} ${day} ${month}`
}
