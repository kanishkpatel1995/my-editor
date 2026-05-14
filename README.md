# my-editor

> A local, file-system-first markdown editor for AI-assisted writing — with an
> adversarial review layer that pushes back instead of agreeing with you.

![license: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-black) ![status: alpha](https://img.shields.io/badge/status-alpha-vermilion) ![stack: React · Vite · TipTap](https://img.shields.io/badge/stack-React%20·%20Vite%20·%20TipTap-paper)

Markdown is the source of truth. Your articles live as `.md` files on disk —
not in a database, not in someone's cloud, not behind a sign-in. Chat history
lives next to them. So do AI critiques. Everything is grep-able, git-trackable,
and editable in any other tool you already use.

The editor previews exactly how the post will look on **Substack** or
**LinkedIn**, so what you see while you're writing is what subscribers will
see when you publish. The chat panel talks to any OpenRouter model, generates
images, drag-drops them into your draft, and writes the conversation back to
disk as a normal `chat.md`. The **ANVIL** module (the part of this project I'm
most proud of) takes a finished draft and walks it paragraph-by-paragraph with
a reasoning model that's actively trying to *disagree* with it — flagging
slop, verifying claims against the live web, and forcing comprehension
questions that you have to answer before you publish.

---

## Why this exists

There's a research consensus forming that's worth taking seriously.

- **Cognitive Debt** ([MIT Media Lab, 2025](https://www.media.mit.edu/publications/your-brain-on-chatgpt/)). EEG study, 54 subjects, 32 brain regions. ChatGPT users had the lowest brain engagement and "consistently underperformed at neural, linguistic, and behavioral levels". Over time they got lazier — more copy-paste, less ownership, weaker recall.
- **Sycophancy** ([Sharma et al., ICLR 2024](https://arxiv.org/abs/2310.13548)). Five SOTA models, four task types, three measurable subtypes — feedback, answer, and mimicry sycophancy. Models prefer telling you what you want to hear over telling you what's true.
- **Desirable Difficulties** ([Bjork & Bjork, 2011](https://bjorklab.psych.ucla.edu/wp-content/uploads/sites/13/2016/04/EBjork_RBjork_2011.pdf)). The conditions that feel hard while learning — retrieval practice, generation, spacing — produce durable knowledge. The conditions that feel smooth produce inflated confidence and weak retention.
- **Socratic scaffolding** ([Frontiers in Education, 2025](https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2025.1528603/full); [arxiv 2409.05511](https://arxiv.org/html/2409.05511v1)). AI tutors that *question* produce significantly stronger critical-thinking gains than AI tutors that *answer*. But the same literature warns of "outsourced metacognition" — if learners defer all inquiry to the AI, the muscles atrophy *more*.

The result is a tool that tries to push back on you as you write — corrections
to consider rather than approvals to collect, questions to answer in your own
head rather than answers to copy. The goal is not "use AI to write faster".
The goal is "use AI without rotting your brain in the process".

---

## What's in here

### Editor (two-pane WYSIWYG with platform previews)

TipTap-based markdown editor that round-trips through `.md` on save. The
canvas switches between **Substack** and **LinkedIn** themes — Spectral for
Substack, Source Sans for LinkedIn, with the column widths, leading, and
margins that match the actual published post. Click **Copy for Substack** /
**Copy for LinkedIn** and paste into the platform composer. No formatting
loss.

Toolbar surfaces an article picker (today / latest / this week), a
**Companions ▾** menu (LinkedIn promo, diagram prompt, evaluation files
auto-linked to each article by naming convention), and the chat / ANVIL
toggles.

Resizable right panel. ⌘J toggles the chat. ⌘L toggles ANVIL.

### Chat panel (multimodal, threaded, persisted)

Every conversation is a folder on disk. `chats/2026-05-14-1430-thread-slug/`
contains `chat.md` (full transcript with frontmatter) and any images the
model generated. `chat.md` is plain markdown — grep it, diff it, edit it by
hand. The store re-parses cleanly on reload.

- **Multimodal input**: paperclip / drag-drop / paste-from-clipboard for
  images and PDFs. Attachments save to the thread folder and round-trip
  through `chat.md`.
- **Reasoning tokens** stream in a collapsible "Thinking" block for models
  that expose them (o-series, Claude with `thinking`, DeepSeek R1, Gemini
  2.5 Pro/Flash with `:thinking`).
- **Image generation** via Gemini 3.1 / 3 Pro / 2.5 image-preview. Images
  save to the thread folder and drag-drop into the editor by relative path.
- **Review & regenerate** under every generated image: a critique model
  rates it (information density, brand compliance, text quality), proposes a
  refined prompt, and pipes that prompt back into the image model with the
  original image as visual context. Auto-regen loops are recursive.
- **Quick recipes** — one-click `Diagram for this`, `LinkedIn promo`,
  `Ideate` — pre-fill the prompt + (optionally) the article body, switch
  mode, pick the right model.
- **Web search** via OpenRouter's `:online` suffix, controlled by a single
  toggle.
- **Capability-aware send**: blocks sending images to non-vision models;
  pins provider to Anthropic-direct when an `anthropic/*` model would
  otherwise get routed to Bedrock (which rejects images).

### ANVIL — adversarial review

The most original part of the project. Click the 🔨 icon (or ⌘L) and a
reasoning model walks the open article paragraph-by-paragraph, producing
four streamed sections per paragraph: corrections, slop score, factual
claims, and a comprehension question.

- **Strikethroughs in-canvas**. Spans the analyst flags appear as
  ProseMirror decorations (never saved to disk) directly in the editor.
  Click → popover with Apply / Keep original / Rewrite with AI / Search web.
- **Confabulation guard**. The analyst sometimes hallucinates spans that
  aren't in the paragraph. A runtime check (`paragraph.text.includes(span)`)
  flags those and refuses to strike them; they appear in the side panel
  only, with a `couldn't anchor` badge. Honest about model failure modes.
- **Per-claim web verification**. Factual claims get goldenrod underlines
  in the editor. Click → popover with `🔍 Verify on web` (manual,
  cost-disclosed) or `✓ Mark OK`. Verifier streams `VERDICT / CONFIDENCE /
  SOURCES + one-sentence explanation`. Underline colour changes:
  moss = TRUE, vermilion = FALSE, amber = INCONCLUSIVE.
- **Comprehension chips after each paragraph**. `⊙ do you understand? ·
  click` widget decoration. Click → Y / N / skip. "No" triggers a
  **Socratic follow-up question** (not the answer — the literature is clear
  that the questioning loop is where the learning happens). Only after you
  attempt the Socratic question does the full explainer fire, and it's
  marked `deferred-to-explain` so it counts against cognitive-debt rather
  than toward comprehension-rate.
- **Metrics strip**: SLOP-INDEX (analyst's rolling average), HALLUCS
  (count of verified-false claims), COMP-RATE (yes / total), AI-MARKERS
  (low / medium / high band).
- **Sessions on disk**. Every run writes `proofs/<slug>.anvil.md` + a JSON
  sidecar. Re-opening an article auto-hydrates its prior proof. A vermilion
  banner appears when the article SHA has drifted since the proof was
  written. A Sessions list (top-left of the panel) browses every proof on
  disk like a history.

### Foundry design system

Letterpress vocabulary throughout: paper-tone background (`#F4EFE6`),
vermilion (`#E64727`) as the single accent, moss for confirmation, goldenrod
for warning, registration-mark glyphs at canvas corners, mono micro-labels.
Editor canvas reads like a proof pulled from a press. Everything is
greyscale-with-one-accent — never a rainbow.

---

## Quick start

Prerequisites: Node 20+, a Chromium-based browser (File System Access API),
and an [OpenRouter](https://openrouter.ai) API key.

```bash
git clone https://github.com/kanishkpatel1995/my-editor.git
cd my-editor
npm install
cp .env.example .env.local
# edit .env.local — paste your OpenRouter key
npm run dev
```

Open `http://localhost:5173`. On first run, click **Pick folder** in the
chat panel and choose a folder for chat history (the in-repo `chat_history/`
is the recommended default). Similarly for the writing workflow root if you
plan to use the article-picker / companions menu.

---

## Configuration

`.env.local` keys (all optional except the API key):

| Var | Default | Purpose |
|---|---|---|
| `VITE_OPENROUTER_API_KEY` | *(required)* | OpenRouter API key. Get one at [openrouter.ai/keys](https://openrouter.ai/keys). |
| `VITE_DEFAULT_MODEL` | `qwen/qwen3.5-flash-02-23` | Text-mode default. Open-weights, 1M context, vision-capable, ~$0.07/$0.26 per 1M tokens. |
| `VITE_DEFAULT_IMAGE_MODEL` | `google/gemini-3.1-flash-image-preview` | Image-mode default. |
| `VITE_CHAT_FOLDER` | — | Hint shown on first chat-folder pick. |
| `VITE_MODEL_LIST_LIMIT` | `200` | OpenRouter model-list cap. |
| `VITE_THREAD_COST_WARN_USD` | `1.00` | Threshold above which the cost bar turns vermilion. |
| `VITE_ANVIL_ANALYST_MODEL` | `deepseek/deepseek-r1` | Reasoning model for ANVIL's per-paragraph critique. |
| `VITE_ANVIL_VERIFIER_MODEL` | `qwen/qwen3.5-flash-02-23` | Web-search verifier (used with `:online`). |
| `VITE_ANVIL_EXPLAINER_MODEL` | `anthropic/claude-haiku-4.5` | Snappy explainer for Socratic + deferred-explain. |

---

## File-system requirements

The browser File System Access API is non-negotiable here. The app stores
nothing of yours on a server. Articles live where you tell them to. The
default workflow looks like:

```
Writing-Workflow/
├── week-of-2026-05-11/
│   ├── articles/04-thu-what-is-harness-engineering.md       ← the article
│   ├── linkedin/04-thu-…-linkedin.md                        ← companion
│   ├── diagrams/04-thu-…-diagram.md                         ← companion prompt
│   └── evaluations/eval-…
├── prompts/                                                  ← seven reusable prompts
└── proofs/
    ├── 04-thu-what-is-harness-engineering.anvil.md          ← ANVIL session log
    └── 04-thu-what-is-harness-engineering.anvil.json        ← machine sidecar
```

Folder handles are cached in IndexedDB after the first directory-picker
prompt; you grant access once per scope and the app never asks again unless
you click **Change folder**.

---

## Architecture overview

| Layer | What's there |
|---|---|
| **Editor** | TipTap + StarterKit + tiptap-markdown, custom drop handler for chat images, custom decoration plugin for ANVIL strikethroughs / claims / comprehension chips. |
| **State** | Zustand stores per concern: `chatStore` (threads, models, send loop), `articleStore` (workflow root, today/latest/companions), `anvilStore` (sessions, run loop, decoration push). |
| **Lib** | Pure helpers — `openrouter.ts` for streaming chat (handles array-content, image-output, reasoning, citations, modality routing, provider preferences); `anvil-prompts.ts` for the four prompts; `anvil-parser.ts` for incremental `## Section` parsing; `anvil-segmenter.ts` for paragraph splitting; `chat-storage.ts` for `chat.md` round-tripping. |
| **Persistence** | File System Access API for all on-disk state. IndexedDB only for directory handles + small per-session UI prefs (panel widths, chat-input height). |
| **Styling** | TailwindCSS v4 with a custom `@theme` block defining the Foundry tokens. No design framework — every component is hand-rolled. |

---

## ANVIL: a closer look

ANVIL is the deepest part of the project. The high-level flow is:

```
press ▷ Start
       ↓
segment article into paragraph units (skipping headings, code blocks, images,
                                      and short bolded pseudo-headings)
       ↓
for each pending paragraph:
   ┌──────────────────────────────────────────────────────────────────┐
   │ 1. build analyst prompt with prev / target / next context        │
   │ 2. streamChat to analyst (reasoning model)                       │
   │      → reasoning deltas → live thinking tape at panel bottom     │
   │      → content deltas → incremental parser → side-panel card     │
   │ 3. confabulation guard:                                          │
   │      for each annotation: paragraph.text.includes(span)?         │
   │        false → mark `unanchored`, side-panel-only with badge     │
   │        true  → push to editor as a strikethrough decoration      │
   │ 4. push claim decorations to editor (goldenrod underlines)       │
   │ 5. push end-of-paragraph comprehension chip to editor            │
   │ 6. persist {paragraph, annotations, claims, comprehension} to    │
   │      proofs/<slug>.anvil.md + .anvil.json                        │
   └──────────────────────────────────────────────────────────────────┘
       ↓
user interactions:
   click strikethrough → popover {Apply | Keep original | Rewrite | Search web}
   click claim         → popover {Verify on web | Mark OK}
   click chip          → popover {Yes | No → Socratic | skip}
```

The Socratic flow on "No" is the most important UX choice in the whole tool.
Standard AI tutors give you the answer. The literature is clear that this
*shrinks* your critical-thinking muscles. ANVIL instead asks you a *narrower*
follow-up question — the answer to which you should be able to attempt in
one sentence — and only falls back to a full explanation if you give up.
Even then, the giving-up is tracked separately from the success case so the
cognitive-debt metric reflects reality.

### Confabulation defense (this is real and matters)

Reasoning models sometimes emit canonical AI-slop markers (`delve`,
`leverage`, `tapestry`, `robust`) as "verbatim spans" even when the target
paragraph contains none of those words. The prompt asks for verbatim quotes,
but model behaviour doesn't always honour that. Three defenses land
together:

1. **Anchor-check at parse time**: every annotation's `span` is verified
   against `paragraph.text.includes(span)`. Unanchored annotations are
   flagged, never get a strikethrough, and surface in the side panel with a
   `couldn't anchor` badge so the user knows the analyst was probably
   hallucinating.
2. **Skip pseudo-headings**: bolded one-liners (`**Five sentences to take
   with you**`) that authors use as section labels are now treated as
   headings by the segmenter — analysing them was a reliable confabulation
   trigger.
3. **Strengthened analyst prompt**: explicit "do NOT invent quotes; output
   `- none` when nothing genuine is wrong; a downstream check rejects every
   annotation whose span isn't in the paragraph, so confabulated quotes are
   wasted output."

The defenses are layered because each model behaves slightly differently —
defense in depth is the only sustainable answer.

---

## Hotkeys

| Combo | Action |
|---|---|
| ⌘O | Open `.md` file |
| ⌘S | Save current file |
| ⌘⇧C | Copy article for the active platform (Substack / LinkedIn) |
| ⌘J | Toggle chat panel |
| ⌘L | Toggle ANVIL panel |
| ⌘⇧I | Toggle chat mode (text ↔ image) |
| Esc | Stop in-flight stream |

---

## Development

```bash
npm run dev      # vite dev with HMR
npm run build    # type-check + production build
npm run lint     # eslint
```

The project intentionally has no test suite yet — it's small enough to
verify by hand for now. Type-checking and linting are the safety net.

`tsc --noEmit` is wired into the dev loop; build errors surface immediately.

---

## Roadmap / known issues

- **Sycophancy-σ metric**: planned for v1.1. Requires linking the article
  back to the chat thread that produced it so we can measure agreement-
  without-justification and opinion-flips in the chat history.
- **Cross-session COG-DEBT-Δ**: planned for v1.1. Needs loading prior
  proof sessions for the same article and computing a comprehension-rate
  delta.
- **Settings popover for ANVIL models**: currently configured via env
  vars; in-app override is a small future addition.
- **Verifier-result "Accept verdict & strike claim"**: stub button in
  the claim popover. Wiring is straightforward but not landed yet.
- **No tests**: noted above. Reasonable contributions welcome.

---

## Contributing

This is a personal tool published publicly because the ideas seemed worth
sharing. PRs welcome but please open an issue first to discuss scope —
much of the project is opinionated about the *interaction model* (Foundry
aesthetic, file-system-first, anti-sycophancy), and changes that conflict
with those decisions probably won't land.

Anything that demonstrably moves the needle on the four research pillars
(cognitive debt, sycophancy, desirable difficulties, Socratic scaffolding)
is the most welcome.

---

## Acknowledgements

- **Anthropic's sycophancy research** (Mrinank Sharma et al., 2023) for
  the measurable framework that ANVIL's analyst tries to counter.
- **MIT Media Lab's "Your Brain on ChatGPT"** for the empirical case
  that this matters.
- **Robert and Elizabeth Bjork** for the desirable-difficulties framing
  that underlies the comprehension flow.
- **TipTap** for the editor framework that lets ANVIL's decorations work
  without invasive surgery.
- **OpenRouter** for making multi-provider model routing trivial.

---

## License

[**GNU AGPL-3.0-only**](./LICENSE).

In plain English:

- **Use it freely** for personal, educational, research, or internal work.
  Run it, modify it, share it.
- **If you modify it AND offer the result as a network service** (a
  SaaS, a hosted app, anything someone reaches over a network), you must
  release your modifications under the AGPL-3.0 as well. You can't take
  the code, change it, and run a closed-source service on top of it.
- **Want to use it commercially without AGPL obligations?** Open an issue
  on the repo to discuss a commercial license. Dual-licensing is on the
  table for genuine use cases.

The reasoning: the design ideas in this project — the Foundry aesthetic,
the ANVIL adversarial-review framing, the Socratic comprehension flow —
are the result of real research synthesis and real iteration. AGPL keeps
the implementation open while making sure improvements made by anyone
running it as a service flow back to the community.

> AGPL-3.0 is a free-software license recognised by the OSI and FSF. It is
> what MongoDB used until 2018, what Sentry used until 2019, and what
> Bitwarden, GitLab Community Edition, and Mastodon still use today.
