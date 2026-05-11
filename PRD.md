# my-editor — Product Requirements Document

**Owner:** Kanishk
**Status:** Draft v1, ready for implementation
**Last updated:** 2026-05-07

---

## 1. The problem in one paragraph

I write every newsletter article in Markdown (.md). Markdown is the right format for source — it's portable, diffable, lives in Git, and AI agents read and write it natively. But Markdown is the **wrong format for posting**. When I paste raw .md into Substack's composer or LinkedIn's "create article" box, I get literal `**asterisks**` and `## hashes` instead of formatted text. The current workaround is: render the .md to HTML somewhere, copy from the rendered preview, paste into the platform, fix what broke. It's slow, error-prone, and adds 10–15 minutes per post.

I want a tool that I open, I drop in a .md file, and I see the article exactly the way it will look once posted to Substack (or LinkedIn). I can make small edits visually if needed. I click one button. The clipboard now holds richly-formatted content that, when I paste into the platform composer, comes out looking right the first time.

A second pain point lives next to this one: every article I publish needs a diagram or hero image. Today I draft long, detailed image-generation prompts in a separate folder (`Writing-Workflow/.../diagram-prompts/`), then bounce between Cursor, ChatGPT/Claude, and Gemini to refine and generate. **The biggest single use of this chat panel will be image generation** — drafting prompts, generating the image right there, iterating on it ("make this horizontal," "swap the accent color"), saving the final image, and dropping it into the article. **OpenRouter** is the model provider because one API key gets me access to image-capable models (`google/gemini-2.5-flash-image-preview`, Flux variants, etc.) plus every text model worth using (Claude, GPT, Gemini, free open models for cheap drafts). The chat history is saved locally as plain `.md` files plus the generated images alongside them — grep-able, version-able, reusable.

The tool lives locally. It's a GitHub repo. Claude Code is implementing it.

---

## 2. Goals and non-goals

### Goals (MVP)
1. Open any `.md` file from disk.
2. Render it in a WYSIWYG editor that looks **exactly like the Substack composer** (typography, spacing, image style) or **the LinkedIn article editor** — toggle between the two themes.
3. Allow visual edits — bold, italic, headings, links, images, blockquotes, lists, code, dividers.
4. **One-click "Copy for Substack"** and **"Copy for LinkedIn"** buttons that put rich HTML on the clipboard. When pasted into the target platform's composer, formatting is preserved.
5. Save edits back to the original `.md` file (Markdown is still the source of truth).
6. Round-trip safely: opening a file, making no edits, saving it should produce a byte-identical (or near-identical) `.md`.
7. **Side-panel AI chat** powered by OpenRouter: pick a model from a dropdown, send messages, stream a response, save the thread to a local folder of `.md` + image files.
8. **Image generation, in-app.** When the selected model is an image-capable one (e.g., `google/gemini-2.5-flash-image-preview`, Flux variants), the chat sends image-gen prompts and renders the returned image inline in the thread. The image is saved to disk alongside the chat `.md`. **This is the biggest expected use.**
9. **Insert response into article.** A one-click action on any assistant message:
   - For text → drops the markdown content at the editor's cursor.
   - For an image → inserts an `<img>` referencing the saved image file.
10. **Iterate on images.** Click any generated image to "regenerate with a tweak" — pre-fills the input with the previous prompt and lets me edit before resending.
11. **Configuration via a local file**, not browser storage. The OpenRouter API key, default model, and chat folder location all live in a `.env.local` file at the project root. Set once on clone, never has to be re-typed.

### Non-goals (explicit, for v1)
- No cloud sync, no accounts, no auth.
- No collaboration / multi-cursor / comments.
- No direct API publishing to Substack or LinkedIn (their APIs are restrictive; clipboard paste is the path of least resistance and gives me one final review before posting).
- No Word / Notion / Medium themes — only Substack and LinkedIn for v1.
- No mobile. Desktop browser only (the GitHub repo serves a static site; I run it locally).
- **No database for chat history.** Threads are folders containing a `.md` plus generated images. Search is filesystem grep. That's the feature, not a limitation.
- No tool-use / function-calling for the chat. Plain text/image in, plain text/image out.
- No video generation. No audio. Only text and still images.
- No automatic image post-processing (no resize, crop, background-removal). Images come out of the model and go to disk as-is.

---

## 3. Users and use cases

There is one user: me. There are two workflows.

### Workflow A — last-mile publishing
1. I finish a draft `.md` article in my normal editor (Cursor / VS Code).
2. I open `my-editor` (run `npm run dev`, open `localhost:5173`).
3. I open the `.md` file from disk.
4. I switch to the **Substack** preset. I scroll the article. The headline looks right. The H2s have the right weight. Block quotes look like Substack quotes. The little gray "by line" looks right. Images render at the correct width.
5. I make tiny edits — fix a typo, add a bold, swap a link.
6. I click **Copy for Substack**.
7. I open Substack's composer. I paste. It looks right.
8. I click **Save to file**. The `.md` updates with the edits I made in step 5.
9. I switch the preset to **LinkedIn**, click **Copy for LinkedIn**, open LinkedIn's article editor, paste. Done.

### Workflow B — generate the article's hero image (the dominant use)
1. I'm editing an article. I'm at the section that needs a hero diagram.
2. I press `Cmd+J`. The chat panel slides in from the right.
3. I switch the model to `google/gemini-2.5-flash-image-preview` (the dropdown surfaces image-capable models in their own group).
4. I paste my draft prompt — the long, detailed kind that lives in `Writing-Workflow/.../diagram-prompts/` — and hit send.
5. The model returns an image inline in the chat. I see it within ~5 seconds.
6. It's close but not right. I click the image's **Regenerate with tweak** button. The input pre-fills with the previous prompt. I edit: *"…make the layout horizontal instead of vertical, swap teal for amber, add a small legend on the left."* Resend.
7. Round 3 looks right. I click **Insert into article**. The image is saved as `2026-05-08-1430-refine-diagram-prompt/03.png` inside my chat folder, and an `![alt](relative/path)` is dropped into the editor at my cursor.
8. The thread auto-saves to `~/learn-agentic-ai/chats/2026-05-08-1430-refine-diagram-prompt/chat.md` (alongside the saved image files) after every message.

### Workflow C — text-mode chat for prompt drafting and quick rewrites
For when I don't want to spend image-gen credits on early iterations.
1. Same article, same chat panel.
2. Switch the model to a free text model: default is `google/gemini-2.0-flash-exp:free`.
3. Paste my article section: *"Draft a diagram prompt in our house style — minimalist, 70/30 grayscale + accent — for this paragraph."*
4. Iterate on the prompt in text only. Once I like it, switch to the image model, send, generate (workflow B from step 5).
5. Or use this same mode for "rewrite this paragraph 30% shorter, keep the bold" and similar small tasks. Click **Insert** to drop the rewrite into the article.

The three workflows interleave constantly. A typical session: open article → text-chat to draft a diagram prompt cheaply → switch to image model and generate → insert image into article → make text edits → copy for Substack → paste → post.

---

## 4. Detailed feature requirements

### 4.1 File handling
- **Open file**: button in toolbar uses the File System Access API (`window.showOpenFilePicker`) to open a `.md` from disk. Fallback: a hidden `<input type="file" accept=".md,.markdown">`.
- **Save file**: writes back to the original handle when available. If the file was opened via the fallback, "Save" downloads a new `.md`. "Save As" always prompts.
- **Recent files**: keep last 10 file handles in IndexedDB (the API allows it). Show in a dropdown.
- **Unsaved-changes warning**: prompt before closing or opening a new file if there are unsaved edits.

### 4.2 Editor (WYSIWYG)
Built on **TipTap** (`@tiptap/react` + `@tiptap/starter-kit`).

**Required nodes / marks:**
- Headings H1, H2, H3 (Substack uses H1+H2 mostly; LinkedIn flattens H1→large text)
- Paragraph
- Bold, italic, strikethrough, inline code
- Links (with editable URL on click)
- Bullet list, ordered list (no nested lists deeper than 2)
- Blockquote
- Code block with no syntax highlighting (LinkedIn doesn't render code blocks well; treat as preformatted gray box)
- Horizontal rule (`---`)
- Image (inline, with alt text and optional caption)
- Hard break (Shift+Enter) and paragraph break (Enter)

**Required behaviors:**
- Markdown shortcuts: typing `## ` makes an H2, `> ` makes a blockquote, `* ` starts a bullet, `**bold**` becomes bold, etc. (TipTap's StarterKit does most of this.)
- Slash menu (`/`): typing `/` at the start of a line shows a popover with H2, H3, bullet, image, link, divider.
- Floating bubble menu on text selection: bold, italic, link, code.
- Drag-and-drop images: drop an image file → embedded as base64 in a temporary preview, prompt for alt text. (The image stays inline as a base64 data URL until export — see §4.4.)

### 4.3 Theme presets
Two presets, switchable via a top-right toggle. Each preset is a CSS module that styles the editor canvas to look like the target platform.

#### Substack preset
- **Width:** ~700px content column, centered.
- **Font:** "Spectral" (Google Fonts) for body, "Spectral" or "Dancing Script" alternative for headers — match Substack's actual stack: `'Spectral', 'Source Serif Pro', Georgia, serif` for body.
- **Body size:** 20px, line-height 1.6, color `#222`.
- **H1:** 36px, weight 700, line-height 1.15.
- **H2:** 28px, weight 700, with extra `margin-top: 1.5em`.
- **Blockquote:** left border 3px solid `#ccc`, padding-left 16px, italic.
- **Link:** underline, dark color, slight orange-red on hover (`#a32d2d`).
- **Image:** full content width, rounded 0, with optional small italic caption below.
- **Body horizontal rule:** centered three dots `· · ·` rather than a line (this matches Substack's actual divider rendering).

#### LinkedIn preset
- **Width:** ~720px.
- **Font:** `'Source Sans 3', 'Source Sans Pro', -apple-system, sans-serif`.
- **Body size:** 16px, line-height 1.5, color `#000`.
- **H1:** 32px, weight 600.
- **H2:** 24px, weight 600.
- **Body horizontal rule:** thin 1px gray.
- **Link:** LinkedIn blue (`#0a66c2`), no underline until hover.
- **Image:** full width, rounded 8px, no caption rendering (LinkedIn drops captions).

The two presets are implemented as `data-theme="substack"` / `data-theme="linkedin"` on the editor wrapper, with all rules scoped under those selectors.

### 4.4 Copy-for-platform buttons
Two buttons in the toolbar: **Copy for Substack** and **Copy for LinkedIn**. Each:
1. Serializes the current editor state to HTML using TipTap's `editor.getHTML()`.
2. Runs a platform-specific HTML transformer:
   - **Substack:** keep H1/H2/blockquote/lists/links/images. Strip code blocks → preformatted `<pre>`. Inline-style nothing — Substack's paste handler reads semantic HTML.
   - **LinkedIn:** flatten H1 → bold paragraph (LinkedIn ignores H1 in pasted articles). Convert `<hr>` → empty paragraph with `—` (em dash). Strip image captions. Strip empty paragraphs.
3. Writes both `text/html` and `text/plain` to the clipboard via `navigator.clipboard.write([new ClipboardItem({...})])`. The text/plain fallback is the markdown source so plain-text consumers get something readable.
4. Toasts "Copied. Paste into Substack." (or LinkedIn).

**Image handling on copy:** v1 limitation. If images are inline (base64), they will *not* survive a paste into Substack or LinkedIn — both platforms reject pasted base64 and require manual upload. The "Copy" button shows a warning "N images will need to be re-uploaded after pasting" when the document contains images. Images keep their alt text in the markdown source and are kept as `<img src="…">` placeholders in the copied HTML so the user can find them on the page after pasting.

### 4.5 Round-trip Markdown ↔ TipTap
Use **`tiptap-markdown`** extension. On open: `.md` source → TipTap doc. On save: TipTap doc → `.md`. Round-trip rules:
- Preserve original `---` frontmatter as-is (treat as a code block at the top of the document; do not parse).
- Preserve image alt text and src.
- Preserve link titles (`[text](url "title")`).
- Use `**bold**` not `__bold__`. Use `*italic*` not `_italic_`. Be consistent.
- Preserve trailing newline at end of file.

A round-trip test should verify: opening any `.md` from `Writing-Workflow/week-of-2026-04-06/articles/`, making zero edits, and saving produces a `.md` whose only difference from the source is whitespace normalization that we accept.

### 4.6 Toolbar layout
Top of editor canvas, sticky on scroll:
```
[Open] [Save] | [B] [I] [S] [code] [link] | [H2] [H3] | [• list] [1. list] | [quote] [hr] [image] | [Substack ▼] | [📋 Copy for Substack]
```
Right side updates: when LinkedIn is selected the right button reads **Copy for LinkedIn**.

### 4.7 Keyboard shortcuts
- `Cmd/Ctrl + S` — save
- `Cmd/Ctrl + O` — open
- `Cmd/Ctrl + B` / `I` — bold / italic
- `Cmd/Ctrl + K` — insert link
- `Cmd/Ctrl + Shift + C` — copy for current platform
- `Cmd/Ctrl + 1` / `2` / `3` — H1 / H2 / H3
- `Cmd/Ctrl + J` — toggle AI chat panel (open/close)
- `Cmd/Ctrl + Enter` — send chat message (when chat input focused)
- `Cmd/Ctrl + Shift + I` — toggle 💬 Text ↔ 🎨 Image mode in the active thread
- `Esc` while link popover open — cancel
- `Esc` mid-stream — stop streaming

### 4.8 AI chat panel (OpenRouter, image-generation first)

A right-side collapsible panel (~420px wide, collapsible to a 32px sidebar) that holds an AI chat. **Primary use is image generation** for article hero diagrams. Secondary uses: drafting/refining image-gen prompts in cheap text mode, "rewrite this paragraph," "what's a better hook?" — but image gen is the workflow this panel is shaped around.

#### 4.8.1 Provider: OpenRouter

OpenRouter (`https://openrouter.ai/`) is a single API that proxies dozens of model providers. One API key gets me text models (Claude, GPT, Gemini, Llama, DeepSeek, Mistral, free open models) **and** image-generation models (`google/gemini-2.5-flash-image-preview` aka Nano Banana, Flux variants, others). Spec is OpenAI-compatible. Endpoint for both text and image-capable models: `POST https://openrouter.ai/api/v1/chat/completions`. Image-capable models return images in `message.images[]` alongside any text in `message.content`.

#### 4.8.2 Configuration: `.env.local`, not browser storage

All persistent config lives in a `.env.local` file at the project root. Vite reads it at dev/build time and exposes the values to the app via `import.meta.env.VITE_*`. The file is gitignored. Set once on clone, edit and restart `npm run dev` to change.

```bash
# .env.local

# OpenRouter API key — get one at https://openrouter.ai/keys
VITE_OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Default model for new chats. Free text default.
VITE_DEFAULT_MODEL=google/gemini-2.0-flash-exp:free

# Default image-generation model (used when the chat is in "image mode").
VITE_DEFAULT_IMAGE_MODEL=google/gemini-2.5-flash-image-preview

# Where chats and generated images get saved.
# Absolute path. The folder is created if it doesn't exist.
VITE_CHAT_FOLDER=/Users/kanishk/Library/CloudStorage/GoogleDrive-patelkanishk1995@gmail.com/My Drive/remembr.xyz/Learn Agentic AI/Writing-Workflow/chats

# Optional: cap the number of model-list rows shown in the dropdown
VITE_MODEL_LIST_LIMIT=200
```

A `.env.example` ships in the repo so the user knows what values to fill. The first time the app runs without a populated `.env.local`, it shows a "Set up your `.env.local`" splash screen with the example template and a one-liner instruction.

The chat folder path is *advisory* in the browser (the File System Access API still requires explicit user permission via `showDirectoryPicker` on first run). On first run the app reads `VITE_CHAT_FOLDER` from env, prefills the picker prompt with that path, the user clicks "Allow," and the resolved directory handle is cached in IndexedDB. On subsequent runs the app re-acquires permission on the cached handle. If the env var changes, the app prompts to re-pick.

#### 4.8.3 Default model and the "free vs paid" surfacing

- **Default text model** (set via `VITE_DEFAULT_MODEL`): `google/gemini-2.0-flash-exp:free` — free, fast, more than capable for drafting prompts and rewrites.
- **Default image model** (set via `VITE_DEFAULT_IMAGE_MODEL`): `google/gemini-2.5-flash-image-preview` — currently ~$0.04/image, the cheapest decent image generator on OpenRouter as of mid-2026. Image gen is **never free** on OpenRouter; setting expectations matters.
- **Model picker dropdown** is grouped:
  1. **🎨 Image models** (capabilities include `image_output`) — separated and labeled with their per-image cost.
  2. **🆓 Free text models** (input price = 0) — labeled "FREE."
  3. **💬 Paid text models** — sorted by name.
  Each row shows: model id, context length, price per 1M input/output tokens (or per-image cost for image models).
- A **mode toggle** above the input switches between **💬 Text** and **🎨 Image**. Switching to Image auto-selects `VITE_DEFAULT_IMAGE_MODEL` if the currently selected model isn't image-capable. Switching back to Text restores the previous text model. The mode is sticky per-thread.
- **Model list:** fetched once per session from `GET https://openrouter.ai/api/v1/models`. Cached for 24h in IndexedDB. Free filter is a checkbox; image-capable filter is implicit when in Image mode.

#### 4.8.4 Chat UI

```
┌─────────────────────────────────────────┐
│  ◀ Chats   [+ New]   ⚙                  │
├─────────────────────────────────────────┤
│  Thread title              [✎] [Export] │
├─────────────────────────────────────────┤
│  [💬 Text | 🎨 Image]  [Model ▾]  ☐ Free │
├─────────────────────────────────────────┤
│                                         │
│   You:  Generate a diagram for…         │
│                                         │
│   Gemini Image:                         │
│   ┌─────────────────────────┐           │
│   │                         │           │
│   │      [generated png]    │           │
│   │                         │           │
│   └─────────────────────────┘           │
│   [⬇ Save] [🔄 Regenerate w/ tweak]     │
│   [➕ Insert into article] [📋 Copy MD]  │
│                                         │
│   You:  Make the layout horizontal      │
│                                         │
│   Gemini Image: [next image]            │
│                                         │
├─────────────────────────────────────────┤
│  ┌─────────────────────────────┐   ▶   │
│  │ Type a message…             │       │
│  └─────────────────────────────┘       │
│  Tokens in: 3,201   out: 0   $0.0048   │
└─────────────────────────────────────────┘
```

- **Streaming:** text responses stream token-by-token (SSE). Image responses arrive as one or two chunks at completion (no streaming preview of partial images).
- **Markdown rendering:** assistant text messages are rendered with `react-markdown` + `remark-gfm` so code blocks, lists, and links display properly.
- **Image rendering:** generated images render at the chat panel's full content width. Click to open in a lightbox at full resolution.
- **Per-message actions** appear under each assistant message:
  - **Text messages:** [📋 Copy MD] · [➕ Insert into article]
  - **Image messages:** [⬇ Save (with chosen filename)] · [🔄 Regenerate with tweak] · [➕ Insert into article] · [📋 Copy markdown reference]
- **Insert into article** behavior:
  - Text → drops the markdown content at the cursor.
  - Image → inserts `![alt](relative/path/to/image.png)` at the cursor, where the image is the saved file inside the thread folder. The relative path resolves correctly when the article also lives in the project (Drive folder); for articles outside the project an absolute `file://` path is used. The "Copy for Substack" / "Copy for LinkedIn" flow handles image references the same way as any other inline image (still requires manual re-upload to the platform — see §4.4).
- **Regenerate with tweak** (image messages only) — pre-fills the input with the prompt that produced the image and focuses the cursor at the end of it. The next send creates a *new* assistant message in the thread (does not overwrite). This way the thread is a record of every variant.
- **Edit-and-resend** on user messages — click any of my messages to edit, resend, drop later messages.
- **Stop button** appears mid-stream to cancel; partial output is preserved.
- **Token-and-cost display** at the bottom of the thread:
  - Text mode: running total of input tokens, output tokens, estimated cost in USD using the model's pricing.
  - Image mode: count of images generated × per-image price.

#### 4.8.5 Multi-thread management

- **Threads list view:** click "◀ Chats" or the toggle to see all threads — sortable by recency, searchable by title or content. Each row shows title, model, message count, and a small "🎨" icon if any image was generated in the thread.
- **New thread:** "+ New" creates an empty thread with title `Untitled chat — YYYY-MM-DD HH:MM` and the default text model. First user message auto-generates a title via a follow-up call (*"Give a 4-word title for this conversation: {first message}"*) using the cheapest free text model regardless of what the thread itself is using. Title is editable inline.
- **One thread visible at a time.** No tabs. Switching threads in the sidebar swaps the view.

#### 4.8.6 Storage: each thread is a folder

Threads are stored as **folders** under the chat folder configured in `.env.local`. Each folder contains the `chat.md` (full conversation, human-readable) plus any generated image files, numbered sequentially.

```
{VITE_CHAT_FOLDER}/
├── 2026-05-08-1430-transformer-hero-diagram/
│   ├── chat.md
│   ├── 01.png             # first generated image
│   ├── 02.png             # second
│   └── 03.png             # third (the one I ended up using)
├── 2026-05-09-0915-llm-pipeline-figure/
│   ├── chat.md
│   └── 01.png
└── 2026-05-09-1145-rewrite-opening/
    └── chat.md            # text-only thread, no images
```

The folder name is the thread id: `YYYY-MM-DD-HHMM-{slug}`. The slug is the auto-generated short title.

**`chat.md` format:**

```markdown
---
id: 2026-05-08-1430-transformer-hero-diagram
title: Transformer hero diagram
mode: image                          # 'text' | 'image'
model: google/gemini-2.5-flash-image-preview
created: 2026-05-08T14:30:12Z
updated: 2026-05-08T14:42:55Z
tokens_in: 1834
tokens_out: 0
images_generated: 3
cost_usd: 0.120
---

## You — 14:30:12

Generate a diagram for the following section: Every transformer layer does exactly two things…

## Gemini Image (google/gemini-2.5-flash-image-preview) — 14:30:21

Generated image:

![](./01.png)

## You — 14:36:04

Make the layout horizontal instead of vertical.

## Gemini Image — 14:36:11

Generated image:

![](./02.png)

## You — 14:40:44

Swap teal for amber.

## Gemini Image — 14:40:52

Generated image:

![](./03.png)
```

- The `.md` references images via **relative paths** (`./01.png`) so the thread folder is fully portable. Move it elsewhere, share it, sync it to Drive — the relative paths still resolve.
- The `.md` is rewritten on every message append, debounced 1s.
- On startup, the app enumerates the chat folder's subdirectories, reads each `chat.md`'s frontmatter (cheap), and builds the thread list. Full body and image files are loaded only when a thread is selected.
- **Delete thread:** removes the entire folder (with confirmation modal showing the count of images about to be lost).
- **Search across threads:** walks each `chat.md` and greps content. Hits are returned with thread title + snippet. Image files are not OCR'd; only the prompts are searchable. v1 is fine doing this in-process.
- **Export thread as a self-contained `.zip`:** "Export" button bundles the folder. Useful for sharing a thread with someone else.

#### 4.8.7 Use cases this enables, ranked by frequency

1. **(Primary) Generate a hero/diagram image for an article.** Image mode. Paste prompt. Generate. Iterate. Insert into article. Save the keeper to disk. This is the dominant flow.
2. **Draft an image-gen prompt cheaply in text mode, then switch to image mode and generate.** Cuts cost when I know the prompt needs 3–4 rounds of refinement before it's worth burning $0.04 per attempt.
3. **Quick rewrites of a paragraph.** Text mode. "Make this 30% shorter, keep the bold." Insert into article.
4. **Hook brainstorming.** "Give me 5 alternative opening lines." Pick one. Insert.
5. **Reference lookup.** "Who proposed sparse attention in 2020?" Without leaving the tool.

#### 4.8.8 Out of scope for chat v1

- **No image input to models** (no "describe this image" with a user-uploaded photo). v2.
- **No video, no audio, no document upload.** Text in / text out, or text in / image out. That's it.
- **No system-prompt presets or "personas."** v2 candidate: saved "Diagram-prompt — house style" preset that pre-loads the 70/30 grayscale-plus-accent guide.
- **No multi-model parallel responses** ("ask 3 models the same question side by side"). Cool, not v1.
- **No automatic cost caps / spend limits.** The cost display is informational only; the user enforces discipline. Image gen makes this matter — it's easy to burn $1 quickly. The display turns red above a per-thread cap (configurable via `VITE_THREAD_COST_WARN_USD`, default $1).
- **No image post-processing.** No crop, resize, background-removal, or upscale. Generated images go to disk as-is.

---

## 5. Visual design notes

The editor canvas should look like an **isolated rendering of the target platform**, not like a generic CMS chrome wrapped around content. Reference screenshots to study:
- Substack: open any post on `*.substack.com`. Inspect the article body container. Match its column width, font stack, and rhythm.
- LinkedIn: open any "article" (not feed post) on `linkedin.com/pulse/...`. Same study.

Outside the editor canvas (toolbar, file picker, theme switcher) — keep this neutral and minimal. Light gray app chrome (Tailwind `bg-zinc-50`, `border-zinc-200`). The editor canvas itself is pure white and styled per preset.

---

## 6. Out-of-scope for v1, parking lot for v2+

- **Image hosting + auto-replace on copy:** wire the editor to a (paid?) image host (Cloudinary, Imgur API) and have "Copy for Substack" replace local image paths with hosted URLs that survive paste. Today the user re-uploads after pasting. With image gen now in-app, this is the most-felt v2 gap.
- **Image input to models** (vision): drag a screenshot into chat and ask "what's wrong with this diagram?"
- **System-prompt presets** ("Diagram-prompt — house style," "LinkedIn promo writer," "Tightener") — saved system messages applied to new threads.
- **One-click publish to Substack via API** (Substack now has a draft-creation API as of late 2025; worth revisiting).
- **Inline AI assistant** — "rewrite this paragraph for LinkedIn punchiness" via a small inline button on selected text in the editor (vs. opening the chat panel).
- **Batch mode** — open all 7 `.md` files for a week, render each in its target preset, generate a "publishing checklist" report.
- **Newsletter footer presets** — auto-append the standard "Read more articles at learn-agentic-ai.com" footer with one click.
- **Diff view** — compare current edit against last saved version.
- **Mobile / tablet** support.

---

## 7. Success criteria

Five measurable bars for "v1 is done":
1. **Round-trip parity:** I can open any of the 35+ existing `.md` articles in `Writing-Workflow/week-of-2026-*/articles/`, make no edits, and save them back without diffs that change content meaning.
2. **Paste fidelity:** Pasting copied content into a fresh Substack draft produces the same visual layout I see in the editor canvas, modulo image re-uploads. Same for LinkedIn.
3. **Time saved on publishing:** End-to-end "draft `.md` → published Substack post" drops from ~15 min of formatting fixes today to under 2 min.
4. **Chat works end-to-end:** I can pick a model, send a message, see streamed output, and the thread is on disk as a readable `.md` file when I close the tab.
5. **Diagram-prompt loop in one window:** I can refine a diagram prompt in chat, copy it, and never have to leave `my-editor` to draft the prompt itself. The only out-of-tool step is pasting the finished prompt into Gemini.

A casual sixth criterion: I never go back to copy-pasting from a Markdown previewer ever again, and I never open ChatGPT in a separate tab to refine a prompt while I'm writing.

---

## 8. Tech stack recommendation

See `TECH-SPEC.md` for the implementation guide. Headline choices:
- **React 18 + TypeScript** — standard.
- **Vite** — dev server and build.
- **TipTap** (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `@tiptap/extension-image`) for the editor.
- **`tiptap-markdown`** for `.md` ↔ TipTap doc serialization.
- **Tailwind CSS v4** for styling, with two theme files (`substack.css`, `linkedin.css`).
- **File System Access API** for native file I/O — for both article `.md` files and chat `.md` files (Chromium-only is fine; this is a personal tool).
- **Lucide-react** for toolbar icons.
- **OpenRouter API** for both text and image chat — direct `fetch` calls from the browser. SSE streaming via `eventsource-parser`. Image responses come through the same `/chat/completions` endpoint with `message.images[].image_url.url` as a base64 data URL or signed URL.
- **`react-markdown` + `remark-gfm`** for rendering assistant text responses inside the chat panel.
- **`gray-matter`** for parsing/serializing the YAML frontmatter on chat `.md` files.
- **Vite env vars (`import.meta.env.VITE_*`)** for all persistent config: API key, default model, default image model, chat folder path. The user edits `.env.local` and restarts dev. No browser-storage persistence of secrets.
- **JSZip** for "Export thread as .zip."
- No backend. No server. Static site. The OpenRouter API key lives only in `.env.local` (never sent anywhere except OpenRouter's API). Chat history and images live only on the user's disk in the configured folder.

---

## 9. Open questions for Kanishk

**Resolved (per follow-up answers):**
- ✅ **Default model:** Free text default. Set to `google/gemini-2.0-flash-exp:free`. Default image model is `google/gemini-2.5-flash-image-preview` (cheapest decent image-gen on OpenRouter; image gen has no truly free option).
- ✅ **Config storage:** All in `.env.local`, not browser storage. API key, default model, image model, chat folder path.
- ✅ **Chat folder location:** Set via `VITE_CHAT_FOLDER`. Recommended default = `Learn Agentic AI/Writing-Workflow/chats` so chats sync via Drive.
- ✅ **Image generation:** First-class feature, not a v2 parking-lot item.

**Still open:**
1. Should the tool also generate the **LinkedIn short-post version** (the punchy ~200-word post that links to the Substack article)? Now that the chat panel does image gen, the LinkedIn-promo workflow could be a small "Generate LinkedIn promo" button on the toolbar that opens chat in text mode with the current article and a hard-coded system prompt. Worth wiring in v1?
2. Hot keys: prefer Cmd-S to save vs auto-save every N seconds? (PRD assumes Cmd-S; happy to switch.)
3. Should "Save" overwrite the original article file, or always save to a copy with a `.edited.md` suffix? PRD assumes overwrite.
4. **Image filenames:** PRD currently auto-numbers (`01.png`, `02.png` …) inside each thread folder. Want descriptive filenames instead (`transformer-layer-horizontal.png`)? More work to wire (would need to ask the model for a slug, or prompt the user before save).
5. **Per-thread cost warning threshold:** PRD defaults the warning to $1 (`VITE_THREAD_COST_WARN_USD`). Reasonable, or should it be lower (e.g., $0.50)?
6. **Article folder ↔ chat folder linkage:** today, when "Insert image into article" runs and the article is in `Writing-Workflow/.../articles/05-fri-...md` and the image is in `Writing-Workflow/chats/2026-05-08-1430-.../03.png`, should the inserted reference be a relative `../../chats/.../03.png` or should the image be **copied into a sibling `images/` folder next to the article** so the article folder stays self-contained? My recommendation: copy on insert. Articles stay portable; the chat folder remains the long-term log.
