# my-editor — Technical Specification

This is the implementation guide for Claude Code. Read this alongside `PRD.md`. Where the PRD says "what and why," this spec says "what to build, in what file, and which library to use."

---

## 1. Stack

| Concern | Choice | Why |
|---|---|---|
| Runtime | Browser (Chromium) | Personal tool, no need for Electron yet |
| Framework | React 18 + TypeScript | Standard; TipTap has first-class React bindings |
| Build | Vite 5 | Fast dev server, native ESM, `import.meta.env` |
| Editor | TipTap 2.x | ProseMirror under the hood; battle-tested; clean React API |
| MD round-trip | `tiptap-markdown` | Direct serializer/parser to and from TipTap docs |
| Styling | Tailwind CSS v4 | Fast iteration; theme presets are scoped CSS modules |
| Icons | `lucide-react` | Lightweight, looks right |
| File I/O | File System Access API + IndexedDB for handle persistence | Native disk access in Chromium |
| Clipboard | `navigator.clipboard.write` with `ClipboardItem` | Rich-content clipboard |
| Notifications | `sonner` (toast library) | Simple |
| Config | `.env.local` via Vite `import.meta.env.VITE_*` | API key + defaults live in a single file the user controls |
| Chat provider | OpenRouter REST API (`/chat/completions`) | One key, all major models including image-output, OpenAI-compatible spec |
| SSE parsing | `eventsource-parser` | Streams OpenRouter SSE responses correctly |
| Chat MD render | `react-markdown` + `remark-gfm` | Render assistant text responses with code blocks, lists, links |
| YAML frontmatter | `gray-matter` | Parse / serialize chat `.md` file frontmatter |
| Image lightbox | `yet-another-react-lightbox` | Fullscreen view of generated images |
| Zip export | `jszip` | "Export thread as .zip" |
| Chat state | Zustand (one small store) | A second store for chat threads is worth the dependency now that there's real cross-component state including image buffers |

The editor itself stays prop-driven. The chat panel is the only place we reach for Zustand — thread list, active thread, streaming buffer, model selection, mode (text/image), image-gen results.

---

## 2. Project structure

```
my-editor/
├── PRD.md                       # product requirements (this folder)
├── TECH-SPEC.md                 # this file
├── README.md                    # how to run
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── index.html
├── .env.example                 # template — committed
├── .env.local                   # actual values — gitignored
├── .gitignore                   # ignores .env.local, node_modules, dist
├── src/
│   ├── main.tsx
│   ├── App.tsx                  # top-level layout (editor + chat panel)
│   ├── components/
│   │   ├── editor/
│   │   │   ├── Editor.tsx           # TipTap editor + theme wrapper
│   │   │   ├── Toolbar.tsx          # top toolbar
│   │   │   ├── FileMenu.tsx         # Open / Save / Save As / Recent
│   │   │   ├── ThemeSwitcher.tsx    # Substack ↔ LinkedIn toggle
│   │   │   ├── CopyButton.tsx       # Copy for Substack / LinkedIn
│   │   │   ├── BubbleMenu.tsx       # floating menu on text selection
│   │   │   ├── SlashMenu.tsx        # slash command popover
│   │   │   └── LinkPopover.tsx      # inline link editor
│   │   └── chat/
│   │       ├── ChatPanel.tsx        # right-side panel container; collapse/expand
│   │       ├── ThreadList.tsx       # list of all chats, sortable + searchable
│   │       ├── ThreadView.tsx       # active chat thread (messages + input)
│   │       ├── MessageBubble.tsx    # one user or assistant message (text)
│   │       ├── ImageMessage.tsx     # one assistant message with a generated image
│   │       ├── MessageActions.tsx   # Copy / Insert into article buttons (text)
│   │       ├── ImageActions.tsx     # Save / Regenerate / Insert / Copy MD (image)
│   │       ├── ImageLightbox.tsx    # fullscreen view of an image
│   │       ├── ModeToggle.tsx       # 💬 Text ↔ 🎨 Image switch
│   │       ├── ModelPicker.tsx      # grouped dropdown: image / free / paid
│   │       ├── ChatInput.tsx        # textarea + send button + stop button
│   │       ├── TokenCostBar.tsx     # running cost indicator
│   │       └── ConfigStatus.tsx     # banner if .env.local is missing values
│   ├── styles/
│   │   ├── globals.css              # Tailwind base + app chrome
│   │   ├── editor-substack.css      # Substack-mimicking canvas styles
│   │   └── editor-linkedin.css      # LinkedIn-mimicking canvas styles
│   ├── lib/
│   │   ├── markdown.ts              # MD ↔ TipTap doc helpers
│   │   ├── clipboard.ts             # writeRichClipboard()
│   │   ├── transforms/
│   │   │   ├── substack.ts          # HTML transformer for Substack paste
│   │   │   └── linkedin.ts          # HTML transformer for LinkedIn paste
│   │   ├── fs.ts                    # File System Access API wrappers
│   │   ├── handles-store.ts         # IndexedDB persistence of file handles
│   │   ├── config.ts                # reads import.meta.env.VITE_* into a typed Config
│   │   ├── openrouter.ts            # OpenRouter API client (models, text + image completions, SSE)
│   │   ├── image-utils.ts           # base64 ↔ Blob, save image to thread folder, etc.
│   │   └── chat-storage.ts          # read/write chat folder (chat.md + image files)
│   ├── hooks/
│   │   ├── useFileSystem.ts         # open/save/saveAs hooks
│   │   ├── useTheme.ts              # 'substack' | 'linkedin' state, persisted
│   │   ├── useHotkeys.ts            # global keyboard shortcuts
│   │   ├── useChatStream.ts         # streaming completion handler
│   │   └── useOpenRouterModels.ts   # cached model list
│   ├── store/
│   │   └── chatStore.ts             # Zustand: threads, activeThreadId, settings
│   └── types.ts
└── tests/
    ├── round-trip.test.ts           # opens every existing article .md, parses, serializes, checks diff
    ├── transforms.test.ts           # snapshot tests for substack/linkedin HTML transforms
    ├── chat-storage.test.ts         # round-trip chat .md files (parse → mutate → serialize)
    └── openrouter-mock.test.ts      # SSE parser handles real OpenRouter sample responses
```

---

## 3. Key implementation notes

### 3.1 TipTap setup (`src/components/Editor.tsx`)

```ts
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { Markdown } from 'tiptap-markdown';

export function Editor({ value, onChange, theme }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Link.configure({ openOnClick: false }),
      Image.configure({ inline: false, allowBase64: true }),
      Markdown.configure({
        html: false,
        tightLists: true,
        linkify: true,
        breaks: false,
      }),
    ],
    content: value,         // markdown string; tiptap-markdown parses it
    onUpdate: ({ editor }) => {
      onChange(editor.storage.markdown.getMarkdown());
    },
  });

  return (
    <div data-theme={theme} className="editor-canvas">
      <EditorContent editor={editor} />
    </div>
  );
}
```

The `data-theme` attribute switches which scoped CSS file applies. Both `editor-substack.css` and `editor-linkedin.css` start with `[data-theme='substack'] .editor-canvas { ... }` so only the active one renders.

### 3.2 File System Access (`src/lib/fs.ts`)

```ts
export async function openMarkdownFile(): Promise<{ handle: FileSystemFileHandle; text: string }> {
  const [handle] = await window.showOpenFilePicker({
    types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown'] } }],
  });
  const file = await handle.getFile();
  const text = await file.text();
  return { handle, text };
}

export async function saveMarkdownFile(handle: FileSystemFileHandle, text: string) {
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}
```

Persist `handle` in IndexedDB via `idb-keyval` so "Recent files" works across reloads (handles need explicit `requestPermission({ mode: 'readwrite' })` when re-acquired).

### 3.3 Clipboard write (`src/lib/clipboard.ts`)

```ts
export async function writeRichClipboard(html: string, plain: string) {
  const blob_html = new Blob([html], { type: 'text/html' });
  const blob_text = new Blob([plain], { type: 'text/plain' });
  await navigator.clipboard.write([
    new ClipboardItem({
      'text/html': blob_html,
      'text/plain': blob_text,
    }),
  ]);
}
```

### 3.4 HTML transforms

Each platform transformer takes the editor's raw HTML and returns paste-ready HTML.

- `transforms/substack.ts`: minimal. Strip `<span style>` from TipTap output, ensure paragraphs are bare `<p>`, normalize `<hr>` to `<p>· · ·</p>` (Substack ignores `<hr>` and renders centered three-dot dividers).
- `transforms/linkedin.ts`: more aggressive. Convert `<h1>` → `<p><strong>...</strong></p>`. Drop `<figcaption>`. Inline images as `<img>` placeholders (warn about re-upload). Strip `<code>` mark inside paragraphs to plain text (LinkedIn renders `<code>` inconsistently).

Both transformers run on a parsed `DOMParser` document, not regex. Use `DOMParser` → `document.body.innerHTML` round-trip.

### 3.5 Theme CSS

Use raw CSS (not Tailwind utilities) for the editor canvas, because we're trying to match a specific external visual. Tailwind elsewhere (toolbar, chrome) is fine.

`editor-substack.css` skeleton:

```css
[data-theme='substack'] .editor-canvas {
  font-family: 'Spectral', 'Source Serif Pro', Georgia, serif;
  font-size: 20px;
  line-height: 1.6;
  color: #222;
  max-width: 700px;
  margin: 0 auto;
  padding: 48px 32px;
  background: #fff;
}

[data-theme='substack'] .editor-canvas h1 {
  font-size: 36px;
  font-weight: 700;
  line-height: 1.15;
  margin: 0 0 24px;
}

[data-theme='substack'] .editor-canvas h2 {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.2;
  margin: 1.5em 0 0.5em;
}

[data-theme='substack'] .editor-canvas blockquote {
  border-left: 3px solid #ccc;
  padding: 4px 16px;
  margin: 24px 0;
  font-style: italic;
  color: #555;
}

[data-theme='substack'] .editor-canvas a {
  color: #1a1a1a;
  text-decoration: underline;
}

[data-theme='substack'] .editor-canvas a:hover { color: #a32d2d; }

[data-theme='substack'] .editor-canvas hr {
  border: none;
  text-align: center;
  margin: 32px 0;
}
[data-theme='substack'] .editor-canvas hr::after {
  content: '· · ·';
  color: #999;
  letter-spacing: 12px;
  font-size: 24px;
}

[data-theme='substack'] .editor-canvas img {
  width: 100%;
  height: auto;
  margin: 24px 0;
}
```

`editor-linkedin.css` follows the same structure with the LinkedIn values (see PRD §4.3).

### 3.6 Round-trip test

`tests/round-trip.test.ts` walks every `.md` file in a configurable input directory, parses it via `tiptap-markdown` into a TipTap doc, serializes back to markdown, and compares. Use `vitest`. Acceptable diffs: trailing-whitespace normalization, `__bold__` → `**bold**` style normalization, list-marker normalization.

For initial validation, point the test at:
```
../Writing-Workflow/week-of-2026-04-06/articles/
```

This directory has 7 production-quality articles with the full range of content types we'll see in real use.

### 3.7 Configuration loader (`src/lib/config.ts`)

A small typed wrapper around `import.meta.env`. Validates at startup and renders a configuration-error banner if anything required is missing.

```ts
export interface Config {
  apiKey: string;                   // VITE_OPENROUTER_API_KEY
  defaultModel: string;             // VITE_DEFAULT_MODEL
  defaultImageModel: string;        // VITE_DEFAULT_IMAGE_MODEL
  chatFolderPath: string;           // VITE_CHAT_FOLDER (advisory; user still has to grant access)
  modelListLimit: number;           // VITE_MODEL_LIST_LIMIT, default 200
  threadCostWarnUsd: number;        // VITE_THREAD_COST_WARN_USD, default 1.00
}

export function loadConfig(): { config: Config | null; missing: string[] } {
  const env = import.meta.env;
  const required = ['VITE_OPENROUTER_API_KEY'];
  const missing = required.filter((k) => !env[k]);
  if (missing.length) return { config: null, missing };
  return {
    config: {
      apiKey: env.VITE_OPENROUTER_API_KEY,
      defaultModel: env.VITE_DEFAULT_MODEL || 'google/gemini-2.0-flash-exp:free',
      defaultImageModel: env.VITE_DEFAULT_IMAGE_MODEL || 'google/gemini-2.5-flash-image-preview',
      chatFolderPath: env.VITE_CHAT_FOLDER || '',
      modelListLimit: Number(env.VITE_MODEL_LIST_LIMIT) || 200,
      threadCostWarnUsd: Number(env.VITE_THREAD_COST_WARN_USD) || 1.0,
    },
    missing: [],
  };
}
```

If `loadConfig` returns `missing` non-empty, the app renders a setup screen with instructions and the contents of `.env.example`.

### 3.8 OpenRouter client (`src/lib/openrouter.ts`)

A thin wrapper. No SDK — the API is OpenAI-compatible and `fetch` is enough. **Both text and image generation use the same `/chat/completions` endpoint.** The only difference is that image-capable models return images in `message.images[]`.

```ts
const BASE = 'https://openrouter.ai/api/v1';

export interface ORModel {
  id: string;                                  // e.g. 'anthropic/claude-3.5-sonnet'
  name: string;
  context_length: number;
  pricing: { prompt: string; completion: string; image?: string };
  architecture?: { output_modalities?: string[] };  // includes 'image' for image-capable
}

export function isImageCapable(m: ORModel): boolean {
  return Array.isArray(m.architecture?.output_modalities)
    && m.architecture!.output_modalities!.includes('image');
}

export async function listModels(apiKey: string): Promise<ORModel[]> {
  const res = await fetch(`${BASE}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`OpenRouter models: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string; }

// Text-mode streaming (delta-by-delta token streaming via SSE)
export async function streamChatCompletion(opts: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  onDelta: (text: string) => void;
  onUsage?: (usage: { prompt_tokens: number; completion_tokens: number }) => void;
}): Promise<void> { /* (same as before — see git history) */ }

// Image-mode (one-shot, non-streaming). Returns base64 data URLs.
export async function generateImage(opts: {
  apiKey: string;
  model: string;                  // e.g. 'google/gemini-2.5-flash-image-preview'
  messages: ChatMessage[];
  signal?: AbortSignal;
}): Promise<{ images: string[]; text: string; usage?: { prompt_tokens: number; completion_tokens: number } }> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://my-editor.local',
      'X-Title': 'my-editor',
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      modalities: ['image', 'text'],     // OpenRouter convention for image-capable models
    }),
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`OpenRouter image: ${res.status} ${await res.text()}`);
  const json = await res.json();
  const choice = json.choices?.[0]?.message;
  const images: string[] =
    (choice?.images || [])
      .map((img: any) => img?.image_url?.url)   // base64 data URL or signed URL
      .filter(Boolean);
  return { images, text: choice?.content || '', usage: json.usage };
}
```

Note on the image response shape: OpenRouter's image-capable models conform to a "multi-modal output" extension of the chat-completion spec. As of mid-2026, `message.images[].image_url.url` carries either a `data:image/png;base64,...` URL or a transient signed URL. The client's `image-utils.ts` handles both shapes — for signed URLs we `fetch` and convert to a Blob before saving.

### 3.9 Image utilities (`src/lib/image-utils.ts`)

```ts
// Convert a base64 data URL or remote URL to a Blob.
export async function urlToBlob(url: string): Promise<Blob> { /* ... */ }

// Save a Blob into a thread folder under a sequential filename, return relative path.
export async function saveImageToThread(
  threadDir: FileSystemDirectoryHandle,
  blob: Blob,
  ext = 'png',
): Promise<string> {
  const existing = await listImageFilenames(threadDir);
  const next = String(existing.length + 1).padStart(2, '0') + '.' + ext;
  const fileHandle = await threadDir.getFileHandle(next, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
  return `./${next}`;
}

// Copy an image from the thread folder into a sibling-of-article 'images/' folder
// when "Insert into article" runs. Returns the new relative path from the article's perspective.
export async function copyImageNearArticle(
  threadDir: FileSystemDirectoryHandle,
  imageRelPath: string,         // e.g. './03.png'
  articleHandle: FileSystemFileHandle,
): Promise<string> { /* ... */ }
```

The "copy on insert" step is what lets the article folder remain self-contained even though the chat folder is the long-term log of every iteration. (See PRD §9 question 6 — this is the recommended default.)

### 3.10 Chat storage (`src/lib/chat-storage.ts`)

Each chat thread is a **folder** containing a `chat.md` plus any generated image files. Folder layout defined in PRD §4.8.6. Parse the `.md` with `gray-matter`, serialize by hand (the body is human-friendly and we want full control over the structure).

```ts
import matter from 'gray-matter';

export type ChatMode = 'text' | 'image';

export interface ChatMessageSerialized {
  role: 'user' | 'assistant';
  content: string;                    // markdown text
  images?: string[];                  // relative paths to image files in the thread folder
  timestamp: string;                  // HH:MM:SS
  model?: string;                     // for assistant messages
}

export interface ChatThread {
  id: string;                         // == folder name
  title: string;
  mode: ChatMode;
  model: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessageSerialized[];
  usage: { tokensIn: number; tokensOut: number; imagesGenerated: number; costUsd: number };
  dirHandle: FileSystemDirectoryHandle;   // runtime-only; not persisted in frontmatter
}

export function parseChatFile(text: string): Omit<ChatThread, 'dirHandle' | 'id'> { /* ... */ }
export function serializeChatFile(thread: Omit<ChatThread, 'dirHandle'>): string { /* ... */ }
```

Body delimiters:
- `## You — HH:MM:SS`  (one user turn)
- `## {Model display name} ({model id}) — HH:MM:SS`  (one assistant turn)

Image references inside an assistant turn are written as `![](./NN.png)` — standard markdown. The parser maps each image reference back into the message's `images[]` array.

**Folder picker / chat root:** on first run, the app reads `VITE_CHAT_FOLDER` from env, calls `showDirectoryPicker({ startIn: 'documents' })`, prefilling the suggested path in the picker description. The user clicks Allow. Resolved directory handle is cached in IndexedDB. Subsequent loads call `requestPermission({ mode: 'readwrite' })` on the cached handle. On denial, re-prompt.

**Thread enumeration:** iterate the chat root's subdirectories (`for await (const [name, handle] of rootDir.entries())` filtered to `kind === 'directory'`). For each, read `chat.md`'s frontmatter only (cheap). Build the thread list lazily — full body and images load on thread selection.

**New thread:** `createDirectory(name)` then `chat.md` inside it.

**Save:** debounced 1s on text streams; image generations persist immediately (the image file plus the updated `chat.md`). All saves use the thread's `dirHandle`, never an absolute path.

**Delete:** `rootDir.removeEntry(name, { recursive: true })`.

### 3.11 Chat store (`src/store/chatStore.ts`)

Zustand. Lives only in memory (the disk thread folder is the source of truth).

```ts
interface ChatStore {
  threads: ChatThread[];
  activeThreadId: string | null;
  rootDirHandle: FileSystemDirectoryHandle | null;
  mode: ChatMode;                              // sticky per active thread
  selectedTextModel: string;
  selectedImageModel: string;
  models: ORModel[];                           // cached model list
  isGenerating: boolean;
  abortController: AbortController | null;

  initFromConfig: (config: Config) => Promise<void>;
  loadThreads: () => Promise<void>;
  newThread: (mode?: ChatMode) => Promise<string>;
  selectThread: (id: string) => void;
  setMode: (mode: ChatMode) => void;
  setModel: (modelId: string) => void;          // routes to text or image slot
  sendMessage: (content: string) => Promise<void>;
  regenerateImage: (messageIndex: number, newPrompt: string) => Promise<void>;
  stopStream: () => void;
  deleteThread: (id: string) => Promise<void>;
  renameThread: (id: string, title: string) => Promise<void>;
}
```

`sendMessage` orchestrates differently based on mode:
- **Text mode:** append user message → call `streamChatCompletion` → stream deltas into the assistant message buffer → on done, persist `chat.md`.
- **Image mode:** append user message → call `generateImage` → for each returned data URL, convert to Blob and `saveImageToThread`, accumulating relative paths → write the assistant message with those images → persist `chat.md`.

`regenerateImage(messageIndex, newPrompt)` builds a fresh user message from the prior prompt and `newPrompt`, then runs the same image flow. The result is a new assistant message appended to the thread (originals are kept, not replaced).

### 3.12 Insert-into-article wiring

The chat panel doesn't know about the editor. It exposes two callbacks via context:
- `onInsertText(markdown: string)` — for text messages.
- `onInsertImage(threadDir, relPath, alt)` — for image messages. The handler:
  1. Calls `copyImageNearArticle(threadDir, relPath, currentArticleHandle)` to copy the image into a sibling `images/` folder beside the article.
  2. Calls `editor.commands.insertContent(...)` with an `<img src="./images/NN.png" alt="...">` node.

For text inserts, a small `markdownToTipTapHTML` helper converts assistant markdown to ProseMirror-compatible HTML using the same `tiptap-markdown` package.

---

## 4. Build order (suggested for Claude Code)

Editor steps 1–6, chat steps 7–13, polish at 14. Each step ends with a runnable app.

1. **Scaffolding.** `npm create vite@latest my-editor -- --template react-ts`. Add Tailwind, lucide-react, sonner, idb-keyval, zustand. Commit a `.env.example`. Add `.env.local` to `.gitignore`.
2. **Editor with no theme.** Plain TipTap + StarterKit + Markdown extension. Hardcode a sample `.md` string. Verify edit → markdown round-trip via `editor.storage.markdown.getMarkdown()`.
3. **File open/save.** Wire `showOpenFilePicker` and `showSaveFilePicker`. Save back successfully to disk. Test on one of the existing `articles/` `.md` files.
4. **Themes.** Add Substack and LinkedIn CSS modules. Add toggle. Compare against real Substack post screenshot.
5. **Toolbar.** Bold, italic, H1/2/3, link, list, quote, hr, image. Bubble menu on selection.
6. **Copy buttons.** Implement `writeRichClipboard`, both transformers, snapshot tests.
7. **Config + setup screen.** Implement `loadConfig()`. Build a setup screen shown when `.env.local` is missing required values, displaying the contents of `.env.example` and instructions. App boots into setup or main view based on config validity.
8. **Chat panel scaffolding + folder picker.** Add the right-side panel shell, the chat-folder permission flow (`showDirectoryPicker`, IndexedDB caching, `requestPermission` on reload). Empty state: "No threads yet — click + New."
9. **Model picker.** Implement `listModels()` and `isImageCapable()`. Cache to IndexedDB for 24h. Render the grouped dropdown (image / free / paid). Implement the 💬 Text ↔ 🎨 Image mode toggle, which switches which model slot is active.
10. **Single-thread text chat.** Implement `streamChatCompletion()`. Wire `ChatInput` → store → stream → `MessageBubble` for the active in-memory thread. No persistence yet.
11. **Single-thread image chat.** Implement `generateImage()` and `saveImageToThread()`. In Image mode, send the prompt, receive image(s), save to a temp in-memory thread, render via `<ImageMessage>` with lightbox-on-click.
12. **Chat persistence (per-thread folders).** Implement `parseChatFile` / `serializeChatFile`. Save active thread folder to disk on stream completion / image generation. Load all threads from the chat root on startup. Thread list + select + rename + delete.
13. **Insert-into-article + per-message actions.** Wire text Insert (markdown → cursor), image Insert (copy file near article + insert `<img>` reference), Copy MD, image Save (rename + write to a chosen disk location), Regenerate-with-tweak (pre-fill input, append new message on send).
14. **Slash menu, recent files, round-trip test, polish.** TipTap slash menu, IndexedDB persistence of article handles, round-trip test on the articles folder, toasts, hotkeys (incl. `Cmd+J` toggle chat, `Cmd+Shift+I` toggle mode, `Esc` stop stream), unsaved-changes guard, image-warning on Copy-for-Substack/LinkedIn, per-thread cost-warn banner above `VITE_THREAD_COST_WARN_USD`.

Each step is one PR. After step 6 the publishing workflow is live; after step 11 image generation is live; after step 13 the full editor + chat loop is live; step 14 is the polish pass.

### `.env.example` (committed, lives at repo root)

```bash
# Required
VITE_OPENROUTER_API_KEY=sk-or-v1-replace-me

# Optional — sensible defaults below
VITE_DEFAULT_MODEL=google/gemini-2.0-flash-exp:free
VITE_DEFAULT_IMAGE_MODEL=google/gemini-2.5-flash-image-preview
VITE_CHAT_FOLDER=~/Learn-Agentic-AI/Writing-Workflow/chats
VITE_MODEL_LIST_LIMIT=200
VITE_THREAD_COST_WARN_USD=1.00
```

---

## 5. Definition of done

- Running `npm run dev` opens the editor at `http://localhost:5173`.
- I can open any `.md` from `Writing-Workflow/`, switch to Substack preset, and the rendering matches a real Substack post side-by-side within ±2px on the headline and body.
- "Copy for Substack" + paste into Substack composer produces a draft visually identical to the editor canvas (modulo images).
- "Copy for LinkedIn" + paste into LinkedIn article editor produces a working article with bold/italic/H2/lists/links preserved.
- Save round-trip is non-destructive on every `.md` in `week-of-2026-04-06/articles/`.
- I populate `.env.local` once with my OpenRouter key. The app boots straight into the editor (no setup screen).
- **Text chat:** I pick a model, send a message, see streamed output, click **Insert into article** to drop the response at the cursor, click **Copy MD** to put markdown on clipboard.
- **Image chat:** I switch the mode toggle to 🎨, the dropdown re-selects `google/gemini-2.5-flash-image-preview`. I send a prompt. An image appears within ~10s. I click **Regenerate with tweak** with a one-line edit. I get a second image. I click **Insert into article** on the keeper. The image file is copied into a sibling `images/` folder next to my article, and the editor shows the image.
- Threads persist as folders containing `chat.md` + image files in the configured chat folder. After a reload, threads are listed and selectable; opening one shows messages and renders previously generated images from disk.
- Tests pass: `npm test` — round-trip tests for articles AND chat-folder round-trip tests (parse `chat.md`, mutate, serialize, parse again, structural equality).

---

## 6. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Substack/LinkedIn paste handlers reject base64 images | Documented in PRD; user re-uploads images manually after paste. v2 adds image hosting. |
| File System Access API not in Safari/Firefox | Personal tool, Chromium-only is fine. Document in README. |
| TipTap markdown serializer drops or rewrites obscure markdown | Round-trip test on real articles catches regressions. |
| Substack changes its CSS / layout | We mimic, we don't scrape. Theme files are static and only need updating if the user notices drift after a Substack redesign. |
| LinkedIn article editor is being deprecated (LinkedIn pushed users toward feed posts in 2024) | If LinkedIn finally kills the article editor, repurpose the LinkedIn preset for "long-form feed posts" and adjust the transform. |
| OpenRouter API key exposed via `.env.local` if the repo is accidentally committed | `.env.local` is in `.gitignore` from step 1. README warns prominently. The key never leaves the user's machine except in calls to `openrouter.ai`. |
| OpenRouter changes pricing data shape on `/models` | Defensive parsing: validate with a small schema, fall back to "no price displayed" if shape is off. |
| OpenRouter changes the image-output response shape (`message.images[].image_url.url`) | The API is in active development as of mid-2026. Wrap response parsing in try/catch and show the raw response on error so the user can paste it to me to update the parser. |
| SSE stream stalls mid-response | The `AbortController` lets the user cancel; on cancel, flush whatever was streamed so far into the assistant message and persist the thread (incomplete is better than lost). |
| Image generation fails silently (model returns text-only when an image was expected) | Detect: assistant response with no `images[]` in image mode → render the text as fallback with a small "⚠ no image returned" banner. Don't burn another request automatically. |
| Image data URLs are large (multi-MB base64) bloating the in-memory thread | Persist the Blob to disk immediately after receipt; replace the in-memory message reference with the relative path. The base64 lives only for the few seconds between API response and disk write. |
| Chat folder permission revoked by user / OS between sessions | `requestPermission({ mode: 'readwrite' })` on each app load; on denial, prompt to re-pick the folder. |
| Two app windows pointed at the same chat folder write the same thread file simultaneously | v1: don't support multi-window. Document. v2: use a small lockfile or last-write-wins with a UI warning. |
| User runs out of OpenRouter credits mid-generation | Show the exact OpenRouter error message (it's helpful) in a toast. Don't retry. |
