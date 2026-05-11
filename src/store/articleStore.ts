import { create } from 'zustand'
import type { ArticleRef, CompanionKind, PromptDef } from '../types'
import { ensureRWPermission } from '../lib/fs'
import {
  loadWorkflowRootHandle,
  saveWorkflowRootHandle,
} from '../lib/handles-store'
import {
  detectTodayOrLatest,
  listArticlesInWeek,
  listWeeks,
  readArticle,
  readCompanion,
  writeArticle,
  createTodayArticle,
} from '../lib/article-store'
import { loadAllPrompts } from '../lib/prompts'

interface ArticleStore {
  /** Cached handle for Writing-Workflow/. */
  rootDir: FileSystemDirectoryHandle | null

  /** Currently open article reference, if any. */
  current: ArticleRef | null
  currentHandle: FileSystemFileHandle | null
  currentText: string

  /** Today / latest detection results, refreshed on hydrate(). */
  todayRef: ArticleRef | null
  latestRef: ArticleRef | null
  weekArticles: ArticleRef[]
  weekFolder: string

  /** All weeks (newest first). */
  weeks: string[]

  /** Loaded prompts (lazy). */
  prompts: PromptDef[]
  promptsLoadedAt: number

  /** Set when initial hydrate has run, success or no-handle. */
  hydrated: boolean

  // actions
  setRootDir: (h: FileSystemDirectoryHandle | null) => Promise<void>
  hydrate: () => Promise<void>
  refreshDetection: () => Promise<void>
  openArticle: (ref: ArticleRef) => Promise<{ text: string; handle: FileSystemFileHandle } | null>
  saveCurrent: (text: string) => Promise<void>
  setCurrentText: (text: string) => void
  createToday: (title: string) => Promise<ArticleRef | null>
  loadCompanion: (kind: CompanionKind) => Promise<string | null>
  loadPromptsIfStale: (force?: boolean) => Promise<void>
  refreshArticlesInWeek: (weekFolder: string) => Promise<ArticleRef[]>
}

const PROMPT_TTL_MS = 60 * 60 * 1000 // 1 hour

export const useArticleStore = create<ArticleStore>((set, get) => ({
  rootDir: null,
  current: null,
  currentHandle: null,
  currentText: '',
  todayRef: null,
  latestRef: null,
  weekArticles: [],
  weekFolder: '',
  weeks: [],
  prompts: [],
  promptsLoadedAt: 0,
  hydrated: false,

  setRootDir: async (h) => {
    set({ rootDir: h })
    if (h) await saveWorkflowRootHandle(h)
  },

  hydrate: async () => {
    const cached = await loadWorkflowRootHandle()
    if (!cached) {
      set({ hydrated: true })
      return
    }
    const ok = await ensureRWPermission(cached)
    if (!ok) {
      set({ hydrated: true })
      return
    }
    set({ rootDir: cached })
    await get().refreshDetection()
    set({ hydrated: true })
  },

  refreshDetection: async () => {
    const { rootDir } = get()
    if (!rootDir) return
    try {
      const det = await detectTodayOrLatest(rootDir)
      const weeks = await listWeeks(rootDir)
      set({
        todayRef: det.today,
        latestRef: det.latest,
        weekArticles: det.weekArticles,
        weekFolder: det.weekFolder,
        weeks,
      })
    } catch (e) {
      console.error('detectTodayOrLatest failed', e)
    }
  },

  refreshArticlesInWeek: async (weekFolder) => {
    const { rootDir } = get()
    if (!rootDir) return []
    const arts = await listArticlesInWeek(rootDir, weekFolder)
    if (weekFolder === get().weekFolder) {
      set({ weekArticles: arts })
    }
    return arts
  },

  openArticle: async (ref) => {
    const { rootDir } = get()
    if (!rootDir) return null
    const r = await readArticle(rootDir, ref)
    if (!r) return null
    set({ current: ref, currentHandle: r.handle, currentText: r.text })
    return r
  },

  saveCurrent: async (text) => {
    const { rootDir, current } = get()
    if (!rootDir || !current) return
    await writeArticle(rootDir, current, text)
    set({ currentText: text })
  },

  setCurrentText: (text) => set({ currentText: text }),

  createToday: async (title) => {
    const { rootDir } = get()
    if (!rootDir) return null
    const { ref, handle, text } = await createTodayArticle(rootDir, title)
    set({ current: ref, currentHandle: handle, currentText: text })
    await get().refreshDetection()
    return ref
  },

  loadCompanion: async (kind) => {
    const { rootDir, current } = get()
    if (!rootDir || !current) return null
    const r = await readCompanion(rootDir, current, kind)
    return r?.text ?? null
  },

  loadPromptsIfStale: async (force = false) => {
    const { rootDir, promptsLoadedAt } = get()
    if (!rootDir) return
    if (!force && promptsLoadedAt && Date.now() - promptsLoadedAt < PROMPT_TTL_MS) return
    try {
      const prompts = await loadAllPrompts(rootDir)
      set({ prompts, promptsLoadedAt: Date.now() })
    } catch (e) {
      console.error('loadAllPrompts failed', e)
    }
  },
}))
