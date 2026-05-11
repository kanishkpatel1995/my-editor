import type { PromptDef } from '../types'
import { ensureRWPermission } from './fs'

/**
 * Static metadata about the seven reusable prompt files in
 * `Writing-Workflow/prompts/`. The body is loaded lazily from disk once
 * the user has granted access to the workflow root.
 *
 * `expectsArticleContext` drives the smart "Append article body" default
 * in PromptPicker: prompts that operate ON an article get the toggle ON;
 * standalone prompts (ideation, article writing) get it OFF.
 */
export const PROMPT_REGISTRY: Omit<PromptDef, 'body'>[] = [
  { id: '01-ideation',         index: 1, title: 'Ideation',          filename: '01-ideation-prompt-v3.md',          kind: 'text',  expectsArticleContext: false },
  { id: '02-article-writing',  index: 2, title: 'Article writing',   filename: '02-article-writing-prompt-v1.md',   kind: 'text',  expectsArticleContext: false },
  { id: '03-diagram',          index: 3, title: 'Diagram',           filename: '03-diagram-prompt-v4.md',           kind: 'image', expectsArticleContext: true  },
  { id: '04-banner',           index: 4, title: 'Banner ideas',      filename: '04-banner-ideas-prompt-v1.md',      kind: 'image', expectsArticleContext: true  },
  { id: '05-linkedin',         index: 5, title: 'LinkedIn post',     filename: '05-linkedin-post-prompt-v2.md',     kind: 'text',  expectsArticleContext: true  },
  { id: '06-evaluation',       index: 6, title: 'Article evaluation',filename: '06-article-evaluation-prompt-v1.md',kind: 'text',  expectsArticleContext: true  },
  { id: '07-substack-notes',   index: 7, title: 'Substack notes',    filename: '07-substack-notes-prompt-v1.md',    kind: 'text',  expectsArticleContext: true  },
]

export async function loadPrompt(
  workflowRoot: FileSystemDirectoryHandle,
  meta: Omit<PromptDef, 'body'>,
): Promise<PromptDef> {
  await ensureRWPermission(workflowRoot)
  const promptsDir = await workflowRoot.getDirectoryHandle('prompts')
  const fileHandle = await promptsDir.getFileHandle(meta.filename)
  const file = await fileHandle.getFile()
  const body = await file.text()
  return { ...meta, body }
}

export async function loadAllPrompts(
  workflowRoot: FileSystemDirectoryHandle,
): Promise<PromptDef[]> {
  const out: PromptDef[] = []
  for (const meta of PROMPT_REGISTRY) {
    try {
      out.push(await loadPrompt(workflowRoot, meta))
    } catch {
      // Skip prompts that don't exist on disk; user may have an older layout.
    }
  }
  return out
}

/**
 * Strip base64 data URLs from markdown article bodies so they don't balloon
 * the chat prompt. TipTap is configured with `allowBase64: true` for paste
 * convenience, which means embedded screenshots can serialise back as
 * `![](data:image/png;base64,…)` — useful in the editor, ruinous in a prompt
 * (a single screenshot can be tens of thousands of tokens).
 *
 * We replace the data URL with a short placeholder, preserving the alt text
 * so the LLM still sees that an image was here.
 */
export function stripBase64Images(markdown: string): string {
  // Markdown form: ![alt](data:...;base64,XXXX)
  // Base64 alphabet excludes ')' so the simple regex is safe.
  const md = markdown.replace(
    /!\[([^\]]*)\]\(data:[^)]*\)/g,
    (_m, alt) => `![${alt}](embedded-image)`,
  )
  // Defensive: HTML <img src="data:..."> in case raw HTML ever leaks through.
  return md.replace(
    /<img\b[^>]*\bsrc=["']data:[^"']*["'][^>]*>/gi,
    '<img src="embedded-image" />',
  )
}

/** Compose a prompt body + optional article context into a chat input pre-fill. */
export function composePromptInput(opts: {
  prompt: PromptDef
  articleBody?: string
  articleSlug?: string
  appendArticle: boolean
}): string {
  const { prompt, articleBody, articleSlug, appendArticle } = opts
  const head = prompt.body.trim()
  if (!appendArticle || !articleBody) return head
  const slugLine = articleSlug ? `\n<!-- article: ${articleSlug} -->\n` : '\n'
  const cleaned = stripBase64Images(articleBody).trim()
  return `${head}\n\n---${slugLine}\n${cleaned}\n`
}
