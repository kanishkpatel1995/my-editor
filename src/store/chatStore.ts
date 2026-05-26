import { create } from 'zustand'
import type { Attachment, ChatMode, ChatMessageT, ChatThread, Config, ORModel } from '../types'
import {
  listModels, streamChat, isImageCapable, isVisionCapable, pricePerMTokens, pricePerImage,
  type StreamChatMessage, type ChatContentPart,
} from '../lib/openrouter'
import {
  createThreadFolder,
  listThreadFolders,
  makeThreadId,
  parseChatFile,
  readThreadImages,
  removeThreadFolder,
  serializeChatFile,
  writeChatFile,
} from '../lib/chat-storage'
import { saveImageToThread, urlToBlob } from '../lib/image-utils'
import { ensureRWPermission, queryRWPermission } from '../lib/fs'
import { loadChatRootHandle, saveChatRootHandle } from '../lib/handles-store'
import {
  saveAttachmentToThread,
  loadAttachmentDataUrl,
  loadImageDataUrlDownscaled,
  type PendingAttachment,
} from '../lib/attachments'
import { buildCritiquePrompt, extractNewPrompt } from '../lib/critique'
import { toast } from 'sonner'

const CRITIQUE_FALLBACK_MODEL = 'qwen/qwen3.5-flash-02-23'

export interface SendOptions {
  /** Append :online to model id for this send (web search). */
  webSearch?: boolean
  /** Tag to remember which prompt produced this turn (for analytics / future replay). */
  promptId?: string
  /** Files the user attached in the input. Saved to thread folder + sent as content parts. */
  attachments?: PendingAttachment[]
}

interface ChatStore {
  config: Config | null
  rootDir: FileSystemDirectoryHandle | null

  /** A cached chat-root handle exists but Chrome needs a user gesture before
   *  we can re-grant access. UI shows a one-click "Reconnect" banner. */
  pendingReconnectHandle: FileSystemDirectoryHandle | null

  threads: ChatThread[]
  activeThreadId: string | null

  models: ORModel[]
  modelsLoadedAt: number

  selectedTextModel: string
  selectedImageModel: string

  isGenerating: boolean
  abortController: AbortController | null

  /** map of (threadId → relativePath → objectURL) for already-on-disk images */
  imageURLs: Record<string, Record<string, string>>

  lastModelError: { model: string; message: string } | null
  pickerOpen: boolean

  /** Per-thread persistent UI flag for the web-search toggle (sticky between sends). */
  webSearchByThread: Record<string, boolean>

  // Actions
  setConfig: (c: Config) => void
  setRootDir: (h: FileSystemDirectoryHandle | null) => Promise<void>
  /** Non-invasive hydrate of the cached chat-root handle on mount. Uses only
   *  queryPermission (no user gesture needed). If 'granted', sets rootDir
   *  silently; if 'prompt', stashes in pendingReconnectHandle for the UI. */
  hydrateChatRoot: () => Promise<void>
  /** User-click handler that fires requestPermission on the pending handle.
   *  Must be called from inside a user-gesture event handler. */
  reconnectChatRoot: () => Promise<boolean>
  refreshModels: (force?: boolean) => Promise<void>
  loadThreads: () => Promise<void>
  newThread: (mode?: ChatMode) => Promise<string>
  selectThread: (id: string) => Promise<void>
  setMode: (mode: ChatMode) => void
  setModel: (modelId: string) => void
  sendMessage: (content: string, opts?: SendOptions) => Promise<void>
  regenerateImage: (assistantIndex: number, newPrompt: string) => Promise<void>
  /** Critique a generated image with a vision-capable text model, then auto-regenerate. */
  reviewAndRegenerate: (assistantMessageIndex: number, imageRelPath: string) => Promise<void>
  stopStream: () => void
  deleteThread: (id: string) => Promise<void>
  renameThread: (id: string, title: string) => Promise<void>
  updateActiveAssistantText: (delta: string) => void
  updateActiveAssistantReasoning: (delta: string) => void
  collapseLastReasoning: (durationMs: number) => void
  pushAssistantImage: (relPath: string, objectUrl: string) => void
  clearModelError: () => void
  openPicker: () => void
  consumePickerOpen: () => void
  setWebSearch: (threadId: string, on: boolean) => void
}

const MODEL_CACHE_TTL = 24 * 60 * 60 * 1000

const now = () => new Date().toISOString()
const hms = () => new Date().toISOString().slice(11, 19)

export const useChatStore = create<ChatStore>((set, get) => ({
  config: null,
  rootDir: null,
  pendingReconnectHandle: null,
  threads: [],
  activeThreadId: null,
  models: [],
  modelsLoadedAt: 0,
  selectedTextModel: '',
  selectedImageModel: '',
  isGenerating: false,
  abortController: null,
  imageURLs: {},
  lastModelError: null,
  pickerOpen: false,
  webSearchByThread: {},

  clearModelError: () => set({ lastModelError: null }),
  openPicker: () => set({ pickerOpen: true }),
  consumePickerOpen: () => set({ pickerOpen: false }),

  setWebSearch: (threadId, on) =>
    set((s) => ({ webSearchByThread: { ...s.webSearchByThread, [threadId]: on } })),

  setConfig: (c) => set({
    config: c,
    selectedTextModel: c.defaultModel,
    selectedImageModel: c.defaultImageModel,
  }),

  setRootDir: async (h) => {
    set({ rootDir: h, pendingReconnectHandle: null })
    if (h) await saveChatRootHandle(h)
  },

  hydrateChatRoot: async () => {
    const cached = await loadChatRootHandle()
    if (!cached) return
    // queryPermission only — never requestPermission on auto-load.
    const state = await queryRWPermission(cached)
    if (state === 'granted') {
      set({ rootDir: cached, pendingReconnectHandle: null })
      await get().loadThreads()
      return
    }
    set({ pendingReconnectHandle: cached })
  },

  reconnectChatRoot: async () => {
    const cached = get().pendingReconnectHandle
    if (!cached) return false
    const ok = await ensureRWPermission(cached)
    if (!ok) return false
    set({ rootDir: cached, pendingReconnectHandle: null })
    await get().loadThreads()
    return true
  },

  refreshModels: async (force = false) => {
    const { config, modelsLoadedAt } = get()
    if (!config) return
    if (!force && modelsLoadedAt && Date.now() - modelsLoadedAt < MODEL_CACHE_TTL) return
    try {
      const models = await listModels(config.apiKey)
      set({ models, modelsLoadedAt: Date.now() })
    } catch (err) {
      console.error('listModels failed', err)
    }
  },

  loadThreads: async () => {
    const { rootDir } = get()
    if (!rootDir) return
    const ok = await ensureRWPermission(rootDir)
    if (!ok) return
    const entries = await listThreadFolders(rootDir)
    const threads: ChatThread[] = entries.map((e) => ({
      id: e.id,
      title: e.meta?.title || e.id,
      mode: e.meta?.mode || 'text',
      model: e.meta?.model || get().selectedTextModel,
      createdAt: e.meta?.createdAt || now(),
      updatedAt: e.meta?.updatedAt || now(),
      messages: e.meta?.messages || [],
      usage: e.meta?.usage || { tokensIn: 0, tokensOut: 0, imagesGenerated: 0, costUsd: 0 },
      dirHandle: e.dirHandle,
    }))
    set({ threads })
  },

  newThread: async (mode = 'text') => {
    const { rootDir, selectedTextModel, selectedImageModel } = get()
    if (!rootDir) throw new Error('Pick a chat folder first.')
    const title = `Untitled chat — ${new Date().toLocaleString()}`
    const id = makeThreadId('untitled')
    const dirHandle = await createThreadFolder(rootDir, id)
    const thread: ChatThread = {
      id,
      title,
      mode,
      model: mode === 'image' ? selectedImageModel : selectedTextModel,
      createdAt: now(),
      updatedAt: now(),
      messages: [],
      usage: { tokensIn: 0, tokensOut: 0, imagesGenerated: 0, costUsd: 0 },
      dirHandle,
    }
    await persistThread(thread)
    set({ threads: [thread, ...get().threads], activeThreadId: id })
    return id
  },

  selectThread: async (id) => {
    set({ activeThreadId: id })
    const t = get().threads.find((x) => x.id === id)
    if (!t || !t.dirHandle) return
    const map = await readThreadImages(t.dirHandle)
    set((s) => ({
      imageURLs: { ...s.imageURLs, [id]: Object.fromEntries(map.entries()) },
    }))
  },

  setMode: (mode) => {
    const { activeThreadId, threads, selectedTextModel, selectedImageModel } = get()
    if (!activeThreadId) return
    const newThreads = threads.map((t) => {
      if (t.id !== activeThreadId) return t
      const model = mode === 'image' ? selectedImageModel : selectedTextModel
      return { ...t, mode, model }
    })
    set({ threads: newThreads })
    const active = newThreads.find((t) => t.id === activeThreadId)
    if (active) void persistThread(active)
  },

  setModel: (modelId) => {
    const { models, activeThreadId, threads } = get()
    const isImg = !!models.find((m) => m.id === modelId && isImageCapable(m))
    const updates: Partial<ChatStore> = isImg
      ? { selectedImageModel: modelId }
      : { selectedTextModel: modelId }
    set(updates as ChatStore)
    if (activeThreadId) {
      const newThreads = threads.map((t) => (t.id === activeThreadId ? { ...t, model: modelId } : t))
      set({ threads: newThreads })
      const active = newThreads.find((t) => t.id === activeThreadId)
      if (active) void persistThread(active)
    }
  },

  updateActiveAssistantText: (delta) => {
    const { activeThreadId, threads } = get()
    if (!activeThreadId) return
    const newThreads = threads.map((t) => {
      if (t.id !== activeThreadId) return t
      const msgs = [...t.messages]
      const lastIdx = msgs.length - 1
      if (lastIdx >= 0 && msgs[lastIdx].role === 'assistant') {
        msgs[lastIdx] = { ...msgs[lastIdx], content: msgs[lastIdx].content + delta }
      }
      return { ...t, messages: msgs, updatedAt: now() }
    })
    set({ threads: newThreads })
  },

  updateActiveAssistantReasoning: (delta) => {
    const { activeThreadId, threads } = get()
    if (!activeThreadId) return
    const newThreads = threads.map((t) => {
      if (t.id !== activeThreadId) return t
      const msgs = [...t.messages]
      const lastIdx = msgs.length - 1
      if (lastIdx >= 0 && msgs[lastIdx].role === 'assistant') {
        msgs[lastIdx] = {
          ...msgs[lastIdx],
          reasoning: (msgs[lastIdx].reasoning || '') + delta,
        }
      }
      return { ...t, messages: msgs, updatedAt: now() }
    })
    set({ threads: newThreads })
  },

  collapseLastReasoning: (durationMs) => {
    const { activeThreadId, threads } = get()
    if (!activeThreadId) return
    const newThreads = threads.map((t) => {
      if (t.id !== activeThreadId) return t
      const msgs = [...t.messages]
      const lastIdx = msgs.length - 1
      if (lastIdx >= 0 && msgs[lastIdx].role === 'assistant' && msgs[lastIdx].reasoning) {
        msgs[lastIdx] = {
          ...msgs[lastIdx],
          reasoningCollapsed: true,
          reasoningDurationMs: durationMs,
        }
      }
      return { ...t, messages: msgs }
    })
    set({ threads: newThreads })
  },

  pushAssistantImage: (relPath, objectUrl) => {
    const { activeThreadId, threads, imageURLs } = get()
    if (!activeThreadId) return
    const newThreads = threads.map((t) => {
      if (t.id !== activeThreadId) return t
      const msgs = [...t.messages]
      const lastIdx = msgs.length - 1
      if (lastIdx >= 0 && msgs[lastIdx].role === 'assistant') {
        msgs[lastIdx] = {
          ...msgs[lastIdx],
          images: [...(msgs[lastIdx].images || []), relPath],
        }
      }
      const usage = { ...t.usage, imagesGenerated: t.usage.imagesGenerated + 1 }
      return { ...t, messages: msgs, usage, updatedAt: now() }
    })
    set({
      threads: newThreads,
      imageURLs: {
        ...imageURLs,
        [activeThreadId]: { ...(imageURLs[activeThreadId] || {}), [relPath]: objectUrl },
      },
    })
  },

  sendMessage: async (content, sendOpts) => {
    const state = get()
    const { config, activeThreadId, threads } = state
    if (!config || !activeThreadId) return
    const thread = threads.find((t) => t.id === activeThreadId)
    if (!thread) return

    const isImage = thread.mode === 'image'
    const modelId = thread.model
    const webSearch = sendOpts?.webSearch ?? state.webSearchByThread[activeThreadId] ?? false

    // Persist any pending attachments to the thread folder BEFORE building the
    // user message — we need the final on-disk relPath to live on the message.
    const persistedAttachments: Attachment[] = []
    if (sendOpts?.attachments?.length && thread.dirHandle) {
      for (const pending of sendOpts.attachments) {
        try {
          const att = await saveAttachmentToThread(thread.dirHandle, pending)
          persistedAttachments.push(att)
        } catch (e) {
          console.error('saveAttachmentToThread failed', e)
        }
      }
    }

    const userMsg: ChatMessageT = {
      role: 'user',
      content,
      timestamp: hms(),
      attachments: persistedAttachments.length ? persistedAttachments : undefined,
    }
    const assistantMsg: ChatMessageT = {
      role: 'assistant',
      content: '',
      images: isImage ? [] : undefined,
      timestamp: hms(),
      model: modelId,
    }
    const updatedThread: ChatThread = {
      ...thread,
      messages: [...thread.messages, userMsg, assistantMsg],
      updatedAt: now(),
    }
    set({
      threads: threads.map((t) => (t.id === activeThreadId ? updatedThread : t)),
      isGenerating: true,
      abortController: new AbortController(),
      lastModelError: null,
    })

    const ac = get().abortController!
    let promptTokens = 0
    let completionTokens = 0
    const sendStartedAt = Date.now()

    try {
      // Build API messages: for each message with attachments, build a
      // multimodal content-parts array; otherwise pass through as a string.
      const apiMessages: StreamChatMessage[] = await Promise.all(
        updatedThread.messages.slice(0, -1).map(async (m): Promise<StreamChatMessage> => {
          if (!m.attachments?.length || !thread.dirHandle) {
            return { role: m.role, content: m.content }
          }
          const parts: ChatContentPart[] = []
          if (m.content) parts.push({ type: 'text', text: m.content })
          for (const att of m.attachments) {
            try {
              const dataUrl = await loadAttachmentDataUrl(thread.dirHandle, att.relPath)
              if (att.kind === 'image') {
                parts.push({ type: 'image_url', image_url: { url: dataUrl } })
              } else if (att.kind === 'pdf') {
                parts.push({ type: 'file', file: { filename: att.name, file_data: dataUrl } })
              }
            } catch (e) {
              console.error('loadAttachmentDataUrl failed', att.relPath, e)
            }
          }
          return { role: m.role, content: parts }
        }),
      )

      // If the user attached images/files and we're hitting an Anthropic model,
      // pin to Anthropic direct — Bedrock's Anthropic variants reject image input.
      const hasAttachments = apiMessages.some((m) => Array.isArray(m.content))
      const pinAnthropic = hasAttachments && modelId.startsWith('anthropic/')

      await streamChat({
        apiKey: config.apiKey,
        model: modelId,
        messages: apiMessages,
        // For image-mode threads request ONLY image output. Asking for both
        // `['image', 'text']` 404s on `gemini-3.1-flash-image-preview` (no
        // endpoint serves both simultaneously), and omitting modalities
        // entirely makes the model default to text-only descriptions
        // instead of actually generating an image.
        modalities: isImage ? ['image'] : undefined,
        webSearch,
        provider: pinAnthropic ? { only: ['anthropic'], allow_fallbacks: false } : undefined,
        signal: ac.signal,
        onTextDelta: (delta) => get().updateActiveAssistantText(delta),
        onReasoningDelta: (delta) => get().updateActiveAssistantReasoning(delta),
        onImage: async (url) => {
          try {
            const blob = await urlToBlob(url)
            const t = get().threads.find((x) => x.id === activeThreadId)
            if (!t?.dirHandle) return
            const ext = (blob.type.split('/')[1] || 'png').replace('+xml', '')
            const rel = await saveImageToThread(t.dirHandle, blob, ext)
            const objUrl = URL.createObjectURL(blob)
            get().pushAssistantImage(rel, objUrl)
          } catch (e) {
            console.error('save image failed', e)
          }
        },
        onUsage: (u) => {
          promptTokens = u.prompt_tokens || 0
          completionTokens = u.completion_tokens || 0
        },
      })

      // Collapse reasoning block on completion
      get().collapseLastReasoning(Date.now() - sendStartedAt)

      // Finalize usage / cost
      const m = state.models.find((mm) => mm.id === modelId)
      const finalThread = get().threads.find((t) => t.id === activeThreadId)!
      const inUsd = m
        ? (promptTokens / 1_000_000) * pricePerMTokens(m.pricing?.prompt)
        : 0
      const outUsd = m
        ? (completionTokens / 1_000_000) * pricePerMTokens(m.pricing?.completion)
        : 0
      const imgUsd = m && isImage
        ? finalThread.usage.imagesGenerated * pricePerImage(m)
        : 0
      const usage = {
        ...finalThread.usage,
        tokensIn: finalThread.usage.tokensIn + promptTokens,
        tokensOut: finalThread.usage.tokensOut + completionTokens,
        costUsd: finalThread.usage.costUsd + inUsd + outUsd + imgUsd,
      }
      const persisted: ChatThread = { ...finalThread, usage, updatedAt: now() }
      set({
        threads: get().threads.map((t) => (t.id === activeThreadId ? persisted : t)),
      })
      await persistThread(persisted)

      if (persisted.title.startsWith('Untitled chat') && persisted.messages.length >= 2) {
        void autoTitleThread(persisted, config).then((newTitle) => {
          if (!newTitle) return
          const t = get().threads.find((x) => x.id === activeThreadId)
          if (!t) return
          const updated = { ...t, title: newTitle, updatedAt: now() }
          set({ threads: get().threads.map((x) => (x.id === activeThreadId ? updated : x)) })
          void persistThread(updated)
        })
      }
    } catch (err) {
      if ((err as DOMException)?.name !== 'AbortError') {
        console.error(err)
        const message = (err as Error).message || String(err)
        const m = message.toLowerCase()
        const looksLikeRoutingError =
          m.includes('404') ||
          m.includes('no endpoints') ||
          m.includes('not found') ||
          m.includes('does not exist') ||
          m.includes('unauthorized') ||
          m.includes('rate limit') ||
          m.includes('insufficient')
        if (looksLikeRoutingError) {
          set({ lastModelError: { model: modelId, message: extractFriendlyMessage(message) } })
          const t = get().threads.find((x) => x.id === activeThreadId)
          if (t) {
            const trimmed = { ...t, messages: t.messages.slice(0, -2) }
            set({ threads: get().threads.map((x) => (x.id === activeThreadId ? trimmed : x)) })
            await persistThread(trimmed).catch(() => undefined)
          }
        } else {
          get().updateActiveAssistantText(`\n\n⚠ ${extractFriendlyMessage(message)}`)
          const t = get().threads.find((x) => x.id === activeThreadId)
          if (t) await persistThread(t).catch(() => undefined)
        }
      }
    } finally {
      set({ isGenerating: false, abortController: null })
    }
  },

  regenerateImage: async (assistantIndex, newPrompt) => {
    const { activeThreadId, threads } = get()
    if (!activeThreadId) return
    const t = threads.find((x) => x.id === activeThreadId)
    if (!t) return
    void assistantIndex
    await get().sendMessage(newPrompt)
  },

  reviewAndRegenerate: async (assistantMessageIndex, imageRelPath) => {
    const state = get()
    const { config, activeThreadId, threads, models, selectedTextModel } = state
    if (!config || !activeThreadId) return
    const thread = threads.find((t) => t.id === activeThreadId)
    if (!thread?.dirHandle) return

    // 1. Walk backward from the image's assistant message to find the user
    //    prompt that produced it.
    let originalPrompt = ''
    for (let i = assistantMessageIndex - 1; i >= 0; i--) {
      const m = thread.messages[i]
      if (m.role === 'user' && m.content.trim()) {
        originalPrompt = m.content
        break
      }
    }
    if (!originalPrompt) {
      console.warn('reviewAndRegenerate: no originating prompt found')
      return
    }

    // 2. Pick the critique model. If the user's selected text model is
    //    vision-capable, use it; otherwise silently fall back to the
    //    Anthropic Haiku default so the call doesn't fail.
    const userTextModel = models.find((m) => m.id === selectedTextModel)
    const critiqueModel =
      userTextModel && isVisionCapable(userTextModel)
        ? selectedTextModel
        : CRITIQUE_FALLBACK_MODEL

    // 3. Add a visible user message that explains the action, with the image
    //    re-attached so the chat.md round-trip preserves the link.
    const reviewUserMsg: ChatMessageT = {
      role: 'user',
      content: `Review & regenerate ↻ ${imageRelPath}`,
      timestamp: hms(),
      attachments: [{
        relPath: imageRelPath,
        mime: 'image/png',
        kind: 'image',
        name: imageRelPath.replace(/^\.\//, ''),
      }],
    }
    const critiqueAssistantMsg: ChatMessageT = {
      role: 'assistant',
      content: '',
      timestamp: hms(),
      model: critiqueModel,
    }
    let threadAfterCritique: ChatThread = {
      ...thread,
      messages: [...thread.messages, reviewUserMsg, critiqueAssistantMsg],
      updatedAt: now(),
    }
    set({
      threads: threads.map((t) => (t.id === activeThreadId ? threadAfterCritique : t)),
      isGenerating: true,
      abortController: new AbortController(),
      lastModelError: null,
    })

    const ac = get().abortController!
    let promptTokens = 0
    let completionTokens = 0
    const startedAt = Date.now()

    try {
      // Load the image off disk, downscaling to 1024 px on its longest edge
      // before base64-encoding. Gemini's 1024×1024 PNGs combined with a large
      // embedded prompt can blow past the practical request-body size and
      // 400 / SSL-error from OpenRouter.
      const loaded = await loadImageDataUrlDownscaled(thread.dirHandle, imageRelPath, 1024)
      const dataUrl = loaded.dataUrl
      console.log('[reviewAndRegenerate] image payload', {
        originalBytes: loaded.originalBytes,
        finalBytes: loaded.finalBytes,
        downscaled: loaded.downscaled,
      })
      const systemPrompt = buildCritiquePrompt({
        originalPrompt,
        imageModelId: thread.model,
      })

      await streamChat({
        apiKey: config.apiKey,
        model: critiqueModel,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Please review the image attached.' },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        // Pin to Anthropic direct. Some OpenRouter providers (notably Amazon
        // Bedrock) ship Haiku 3.5 without vision input — routing there would
        // 400 "does not support image input". Anthropic's own API is always
        // vision-capable for these models.
        provider: critiqueModel.startsWith('anthropic/')
          ? { only: ['anthropic'], allow_fallbacks: false }
          : undefined,
        signal: ac.signal,
        onTextDelta: (delta) => get().updateActiveAssistantText(delta),
        onReasoningDelta: (delta) => get().updateActiveAssistantReasoning(delta),
        onUsage: (u) => {
          promptTokens = u.prompt_tokens || 0
          completionTokens = u.completion_tokens || 0
        },
      })

      get().collapseLastReasoning(Date.now() - startedAt)

      // Accumulate critique cost into the thread's usage.
      const m = state.models.find((mm) => mm.id === critiqueModel)
      const promptCost = m ? (promptTokens / 1_000_000) * pricePerMTokens(m.pricing?.prompt) : 0
      const completionCost = m ? (completionTokens / 1_000_000) * pricePerMTokens(m.pricing?.completion) : 0
      {
        const t = get().threads.find((x) => x.id === activeThreadId)!
        const next: ChatThread = {
          ...t,
          usage: {
            ...t.usage,
            tokensIn: t.usage.tokensIn + promptTokens,
            tokensOut: t.usage.tokensOut + completionTokens,
            costUsd: t.usage.costUsd + promptCost + completionCost,
          },
          updatedAt: now(),
        }
        set({ threads: get().threads.map((x) => (x.id === activeThreadId ? next : x)) })
      }
    } catch (e) {
      const errMsg = (e as Error)?.message || String(e)
      console.error('critique stream failed', e)
      // Write the failure into the assistant bubble so the user sees what
      // happened instead of "(empty response)". Also toast it.
      const t = get().threads.find((x) => x.id === activeThreadId)
      if (t) {
        const msgs = [...t.messages]
        const lastIdx = msgs.length - 1
        if (lastIdx >= 0 && msgs[lastIdx].role === 'assistant') {
          msgs[lastIdx] = {
            ...msgs[lastIdx],
            content: `⚠ Critique failed: ${errMsg.slice(0, 400)}`,
          }
          const updated = { ...t, messages: msgs, updatedAt: now() }
          set({ threads: get().threads.map((x) => (x.id === activeThreadId ? updated : x)) })
          await persistThread(updated).catch(() => undefined)
        }
      }
      toast.error(`Review failed: ${errMsg.slice(0, 200)}`, { duration: 8000 })
      set({ isGenerating: false, abortController: null })
      return
    }

    // 4. Pull the refined prompt out of the streamed critique. If it's
    //    absent, stop — we don't auto-fire a regen without a clean prompt.
    threadAfterCritique = get().threads.find((t) => t.id === activeThreadId)!
    const criticContent = threadAfterCritique.messages.at(-1)!.content
    console.log('[reviewAndRegenerate] critique done', {
      contentLength: criticContent.length,
      contentPreview: criticContent.slice(0, 200),
      promptTokens,
      completionTokens,
    })
    const newPrompt = extractNewPrompt(criticContent)
    if (!newPrompt) {
      set({ isGenerating: false, abortController: null })
      console.warn('reviewAndRegenerate: no `## New prompt` block found — stopping. content was:', criticContent.slice(0, 1000))
      // Persist anyway so the critique survives a reload, even if extraction failed.
      const finalThread = get().threads.find((t) => t.id === activeThreadId)
      if (finalThread) await persistThread(finalThread)
      return
    }
    console.log('[reviewAndRegenerate] extracted newPrompt length:', newPrompt.length)

    // 5. Append the refined user prompt (collapsed by default in UI) and
    //    delegate to sendMessage for the image regeneration. We persist
    //    the prompt first then fire sendMessage which will tack on a new
    //    user+assistant pair — but our refined prompt is the user message
    //    we want recorded, so we append it manually and call streamChat
    //    directly here for the image turn.
    const promptUserMsg: ChatMessageT = {
      role: 'user',
      content: newPrompt,
      timestamp: hms(),
      collapsedDefault: true,
    }
    const imageAssistantMsg: ChatMessageT = {
      role: 'assistant',
      content: '',
      images: [],
      timestamp: hms(),
      model: thread.model,
    }
    const threadBeforeRegen = get().threads.find((t) => t.id === activeThreadId)!
    const threadAfterPrompt: ChatThread = {
      ...threadBeforeRegen,
      messages: [...threadBeforeRegen.messages, promptUserMsg, imageAssistantMsg],
      updatedAt: now(),
    }
    set({
      threads: get().threads.map((t) => (t.id === activeThreadId ? threadAfterPrompt : t)),
      abortController: new AbortController(),
    })

    const ac2 = get().abortController!
    let imgPromptTokens = 0
    let imgCompletionTokens = 0
    let imageCount = 0
    try {
      // Send the refined prompt PLUS the previous image as a visual reference.
      // Gemini image-gen models accept (text + image) and use the text as the
      // full target description; the attached image is supplementary visual
      // grounding ("here's what we tried last time; do better in these specific
      // ways").
      //
      // `modalities: ['image']` is REQUIRED here. Asking for both
      // `['image', 'text']` 404s (no endpoint serves both for
      // `gemini-3.1-flash-image-preview`), and omitting it makes the model
      // default to text-only descriptions instead of generating the image.
      const refLoaded = await loadImageDataUrlDownscaled(thread.dirHandle, imageRelPath, 1024)
      await streamChat({
        apiKey: config.apiKey,
        model: thread.model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: newPrompt },
              { type: 'image_url', image_url: { url: refLoaded.dataUrl } },
            ],
          },
        ],
        modalities: ['image'],
        signal: ac2.signal,
        onTextDelta: (delta) => get().updateActiveAssistantText(delta),
        onImage: async (url) => {
          try {
            const blob = await urlToBlob(url)
            const t = get().threads.find((x) => x.id === activeThreadId)
            if (!t?.dirHandle) return
            const ext = (blob.type.split('/')[1] || 'png').replace('+xml', '')
            const rel = await saveImageToThread(t.dirHandle, blob, ext)
            const objUrl = URL.createObjectURL(blob)
            get().pushAssistantImage(rel, objUrl)
            imageCount++
          } catch (e) {
            console.error('save regen image failed', e)
          }
        },
        onUsage: (u) => {
          imgPromptTokens = u.prompt_tokens || 0
          imgCompletionTokens = u.completion_tokens || 0
        },
      })

      const m = state.models.find((mm) => mm.id === thread.model)
      const promptCost = m ? (imgPromptTokens / 1_000_000) * pricePerMTokens(m.pricing?.prompt) : 0
      const completionCost = m ? (imgCompletionTokens / 1_000_000) * pricePerMTokens(m.pricing?.completion) : 0
      const imageCost = m ? imageCount * pricePerImage(m) : 0
      {
        const t = get().threads.find((x) => x.id === activeThreadId)!
        const next: ChatThread = {
          ...t,
          usage: {
            ...t.usage,
            tokensIn: t.usage.tokensIn + imgPromptTokens,
            tokensOut: t.usage.tokensOut + imgCompletionTokens,
            imagesGenerated: t.usage.imagesGenerated + imageCount,
            costUsd: t.usage.costUsd + promptCost + completionCost + imageCost,
          },
          updatedAt: now(),
        }
        set({ threads: get().threads.map((x) => (x.id === activeThreadId ? next : x)) })
        await persistThread(next)
      }
    } catch (e) {
      const errMsg = (e as Error)?.message || String(e)
      console.error('regen image stream failed', e)
      const t = get().threads.find((x) => x.id === activeThreadId)
      if (t) {
        const msgs = [...t.messages]
        const lastIdx = msgs.length - 1
        if (lastIdx >= 0 && msgs[lastIdx].role === 'assistant') {
          msgs[lastIdx] = {
            ...msgs[lastIdx],
            content: `⚠ Regeneration failed: ${errMsg.slice(0, 400)}`,
          }
          const updated = { ...t, messages: msgs, updatedAt: now() }
          set({ threads: get().threads.map((x) => (x.id === activeThreadId ? updated : x)) })
          await persistThread(updated).catch(() => undefined)
        }
      }
      toast.error(`Regeneration failed: ${errMsg.slice(0, 200)}`, { duration: 8000 })
    } finally {
      set({ isGenerating: false, abortController: null })
    }
  },

  stopStream: () => {
    const ac = get().abortController
    ac?.abort()
  },

  deleteThread: async (id) => {
    const { rootDir, threads, activeThreadId } = get()
    if (!rootDir) return
    await removeThreadFolder(rootDir, id)
    const remaining = threads.filter((t) => t.id !== id)
    set({
      threads: remaining,
      activeThreadId: activeThreadId === id ? null : activeThreadId,
    })
  },

  renameThread: async (id, title) => {
    const newThreads = get().threads.map((t) => (t.id === id ? { ...t, title, updatedAt: now() } : t))
    set({ threads: newThreads })
    const t = newThreads.find((x) => x.id === id)
    if (t) await persistThread(t)
  },
}))

async function persistThread(thread: ChatThread) {
  if (!thread.dirHandle) return
  const text = serializeChatFile(thread)
  await writeChatFile(thread.dirHandle, text)
}

async function autoTitleThread(thread: ChatThread, config: Config): Promise<string | null> {
  const firstUser = thread.messages.find((m) => m.role === 'user')?.content || ''
  if (!firstUser) return null
  const cheapModel = config.defaultModel || 'google/gemini-2.5-flash-lite'
  let raw = ''
  try {
    await streamChat({
      apiKey: config.apiKey,
      model: cheapModel,
      reasoning: false, // titles don't need reasoning effort
      messages: [
        {
          role: 'system',
          content:
            'You name conversations. Reply ONLY with a 3-6 word plain-text title. ' +
            'No quotes. No punctuation. No JSON. No tool calls. No code fences. Title only.',
        },
        { role: 'user', content: `Title for:\n\n${firstUser.slice(0, 500)}` },
      ],
      onTextDelta: (d) => {
        raw += d
      },
    })
  } catch {
    return null
  }
  return sanitizeTitle(raw) || fallbackTitle(firstUser)
}

function sanitizeTitle(raw: string): string | null {
  let s = raw.trim()
  s = s.replace(/^```(?:[a-z]+)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
  if (s.startsWith('{') || s.startsWith('[')) return null
  s = s.replace(/^["'`]+|["'`]+$/g, '')
  s = s.replace(/[.!?,;:\s]+$/g, '')
  s = s.split('\n').find((line) => line.trim().length > 0)?.trim() ?? ''
  return s.slice(0, 60) || null
}

function fallbackTitle(firstUser: string): string | null {
  const clean = firstUser.replace(/\s+/g, ' ').trim().slice(0, 48)
  return clean || null
}

function extractFriendlyMessage(raw: string): string {
  const jsonStart = raw.indexOf('{')
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(raw.slice(jsonStart))
      const m = parsed?.error?.message
      if (typeof m === 'string') return m
    } catch {
      // fall through
    }
  }
  return raw.replace(/^OpenRouter \d+:\s*/, '')
}

export { parseChatFile }
