# my-editor

A local WYSIWYG editor + AI chat for the *Learn Agentic AI* newsletter.

Two jobs:
1. **Last-mile publishing.** Open a `.md`, see it the way it'll look on Substack (or LinkedIn), copy formatted, paste into the platform.
2. **Image generation + chat without leaving the editor.** Right-side panel powered by OpenRouter — pick any model (Claude, GPT, Gemini, free open models, **plus image-generation models like `google/gemini-2.5-flash-image-preview`**), draft prompts in cheap text mode, generate images in image mode, insert directly into the article. Threads save to local folders (one folder per thread, with `chat.md` + image files). No database.

---

## What's in this folder

- **[`PRD.md`](./PRD.md)** — what the tool is, who it's for, what it must do, what's out of scope.
- **[`TECH-SPEC.md`](./TECH-SPEC.md)** — implementation guide for Claude Code: stack, file structure, build order, definition-of-done.
- **`README.md`** — you are here.

The actual code does not live in this folder yet. This is the planning bundle. Claude Code will pick up `PRD.md` and `TECH-SPEC.md` and scaffold the app per the build order in §4 of the tech spec.

---

## How to use this with Claude Code

1. Move the contents of this folder into a new GitHub repo named `my-editor`.
2. Copy `.env.example` to `.env.local` and fill in your OpenRouter API key (get one at https://openrouter.ai/keys).
3. Open the repo in Cursor with Claude Code attached.
4. Tell Claude: *"Read PRD.md and TECH-SPEC.md. Implement step 1 of the build order in TECH-SPEC.md §4. Stop when step 1 is working and ask me to verify before moving on."*
5. Verify. Move to step 2. Repeat through step 14.

The tech spec is structured so each step produces a runnable app. You can stop, ship, and start using the tool from step 6 (publishing workflow) or step 13 (full chat + image gen + insert) onwards.

## Configuration (`.env.local`)

All persistent config lives in `.env.local` at the repo root. Set once on clone, never has to be re-typed.

```bash
# Required
VITE_OPENROUTER_API_KEY=sk-or-v1-replace-me

# Optional (defaults shown)
VITE_DEFAULT_MODEL=google/gemini-2.0-flash-exp:free
VITE_DEFAULT_IMAGE_MODEL=google/gemini-2.5-flash-image-preview
VITE_CHAT_FOLDER=~/Learn-Agentic-AI/Writing-Workflow/chats
VITE_MODEL_LIST_LIMIT=200
VITE_THREAD_COST_WARN_USD=1.00
```

> ⚠️ `.env.local` contains your API key. It's in `.gitignore` by default — keep it that way. **Never commit it.**

---

## Why both PRD and tech spec

The PRD is for me — to confirm I'm building the right thing. The tech spec is for Claude Code — to remove ambiguity from "build it." If they ever disagree, the PRD wins (the tech spec is downstream of the PRD).

---

## Stack at a glance

React 18 + TypeScript, Vite, TipTap (ProseMirror under the hood), `tiptap-markdown` for round-trip, Tailwind for chrome, raw scoped CSS for the editor canvas (so we can match Substack and LinkedIn pixel-perfect). File System Access API for native disk I/O. OpenRouter REST API for both text and image chat (key + defaults in `.env.local`; threads stored as folders containing `chat.md` plus image files). Zustand for chat state. No backend. No cloud. Personal tool, runs locally.

Full rationale: `TECH-SPEC.md` §1.

---

## Status

**Editor**
- [x] PRD drafted (incl. chat + image-gen feature)
- [x] Tech spec drafted (incl. chat + image-gen feature)
- [ ] Scaffolded with Vite
- [ ] Editor renders markdown round-trip
- [ ] File open/save working
- [ ] Substack theme matches reference
- [ ] LinkedIn theme matches reference
- [ ] Copy buttons land formatted content in target composers
- [ ] Round-trip tests passing on existing articles

**Chat (text + image)**
- [ ] `.env.local` config flow + setup screen on first run
- [ ] Chat folder picker + IndexedDB handle persistence
- [ ] Model picker with image / free / paid grouping + mode toggle
- [ ] Single-thread streaming text chat
- [ ] Single-thread image generation (Gemini Image / Flux / etc.)
- [ ] Per-thread folder persistence (`chat.md` + image files)
- [ ] Text Insert-into-article + Copy MD
- [ ] Image Insert-into-article (copy-near-article) + Save + Regenerate-with-tweak
- [ ] Per-thread cost-warn banner
- [ ] Chat-folder round-trip tests passing
