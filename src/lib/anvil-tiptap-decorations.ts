/**
 * Tiptap / ProseMirror plugin that renders ANVIL annotations as inline
 * decorations (vermilion strikethrough). Decorations are PURELY visual —
 * they never serialise to markdown, so saving the article never persists
 * strikethrough syntax.
 *
 * Two transaction-meta channels:
 *   pluginKey + 'set'     → replace the entire annotation set
 *   pluginKey + 'clear'   → remove all decorations
 *
 * On click, the plugin dispatches a window `CustomEvent<AnvilAnnotationClick>`
 * with the annotation id and the screen coords of the clicked span so a
 * floating popover can anchor to it.
 */

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface AnvilDecorationInput {
  id: string
  span: string
  /** Soft display state — controls strikethrough class. */
  decision: 'pending' | 'accepted' | 'rejected'
}

export interface AnvilClaimDecorationInput {
  id: string
  text: string
  /** Determines colour class on the underline. */
  verdict: 'verify' | 'pending' | 'ok' | 'verified-true' | 'verified-false' | 'inconclusive'
}

export interface AnvilCompDecorationInput {
  /** Paragraph index (1-based, matches AnvilParagraph.index). */
  paragraphIndex: number
  /** First ~50 chars of paragraph — used to locate the paragraph in the doc. */
  paragraphPrefix: string
  state: 'unanswered' | 'answered-yes' | 'answered-socratic' | 'deferred-to-explain' | 'skipped'
  /** True if the analyst declared the paragraph transitional (no question). */
  isTransitional: boolean
}

export interface AnvilAnnotationClickDetail {
  id: string
  rect: { x: number; y: number; width: number; height: number }
}

export const anvilDecorationsKey = new PluginKey<DecorationSet>('anvilDecorations')

function claimClassFor(verdict: AnvilClaimDecorationInput['verdict']): string {
  switch (verdict) {
    case 'pending':         return 'anvil-claim busy'
    case 'verified-true':   return 'anvil-claim t'
    case 'verified-false':  return 'anvil-claim f'
    case 'inconclusive':    return 'anvil-claim i'
    case 'ok':              return 'anvil-claim ok'
    case 'verify':
    default:                return 'anvil-claim'
  }
}

function compChipLabel(d: AnvilCompDecorationInput): string {
  if (d.isTransitional) return '⊙ transitional'
  switch (d.state) {
    case 'answered-yes':         return '⊙ understood ✓'
    case 'answered-socratic':    return '⊙ socratic ✓'
    case 'deferred-to-explain':  return '⊙ deferred — see panel'
    case 'skipped':              return '⊙ skipped'
    case 'unanswered':
    default:                     return '⊙ do you understand? · click'
  }
}

function compChipClass(d: AnvilCompDecorationInput): string {
  const base = 'anvil-q-chip'
  if (d.isTransitional) return `${base} transitional`
  switch (d.state) {
    case 'answered-yes':         return `${base} answered`
    case 'answered-socratic':    return `${base} answered`
    case 'deferred-to-explain':  return `${base} deferred`
    case 'skipped':              return `${base} skipped`
    case 'unanswered':
    default:                     return `${base} unanswered`
  }
}

/** Build a plain-DOM widget for a comprehension chip. The widget dispatches a
 *  custom event on click so a React popover (in App-level) can render. */
function buildCompChip(d: AnvilCompDecorationInput): HTMLElement {
  const el = document.createElement('span')
  el.className = compChipClass(d)
  el.setAttribute('data-anvil-q-pidx', String(d.paragraphIndex))
  el.textContent = compChipLabel(d)
  el.contentEditable = 'false'
  el.addEventListener('mousedown', (ev) => ev.preventDefault())  // don't move selection
  el.addEventListener('click', (ev) => {
    ev.stopPropagation()
    const rect = el.getBoundingClientRect()
    window.dispatchEvent(new CustomEvent<AnvilAnnotationClickDetail & { paragraphIndex: number }>(
      'anvil:comp-click',
      {
        detail: {
          id: String(d.paragraphIndex),
          paragraphIndex: d.paragraphIndex,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        },
      },
    ))
  })
  return el
}

function buildDecorations(
  doc: import('@tiptap/pm/model').Node,
  annotations: AnvilDecorationInput[],
  claims: AnvilClaimDecorationInput[],
  comps: AnvilCompDecorationInput[],
): DecorationSet {
  if (!annotations.length && !claims.length && !comps.length) return DecorationSet.empty
  const decos: Decoration[] = []

  // Walk paragraph nodes to attach widget decorations at the END of any
  // paragraph whose text begins with the comp's `paragraphPrefix`. (Matching
  // by content prefix is more robust than by absolute index because the
  // article may have headings / images that the segmenter skipped.)
  if (comps.length) {
    doc.descendants((node, pos) => {
      if (node.type.name !== 'paragraph') return
      const text = node.textContent.trim()
      if (!text) return
      for (const c of comps) {
        if (!c.paragraphPrefix) continue
        if (text.startsWith(c.paragraphPrefix.trim())) {
          const endPos = pos + node.nodeSize - 1   // just before paragraph close
          decos.push(Decoration.widget(endPos, () => buildCompChip(c), {
            side: 1,
            ignoreSelection: true,
            key: `comp-${c.paragraphIndex}-${c.state}`,
          }))
        }
      }
    })
  }

  doc.descendants((node, pos) => {
    if (!node.isText) return
    const text = node.text || ''

    // Strikethroughs (corrections)
    for (const ann of annotations) {
      if (ann.decision === 'accepted' || ann.decision === 'rejected') continue
      if (!ann.span || ann.span.length < 2) continue
      let searchFrom = 0
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const idx = text.indexOf(ann.span, searchFrom)
        if (idx === -1) break
        const from = pos + idx
        const to = from + ann.span.length
        decos.push(
          Decoration.inline(from, to, {
            class: 'anvil-strike',
            'data-anvil-id': ann.id,
          }),
        )
        searchFrom = idx + ann.span.length
      }
    }

    // Claims (underlines, colour by verdict)
    for (const cl of claims) {
      if (!cl.text || cl.text.length < 2) continue
      let searchFrom = 0
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const idx = text.indexOf(cl.text, searchFrom)
        if (idx === -1) break
        const from = pos + idx
        const to = from + cl.text.length
        decos.push(
          Decoration.inline(from, to, {
            class: claimClassFor(cl.verdict),
            'data-anvil-claim-id': cl.id,
          }),
        )
        searchFrom = idx + cl.text.length
        break  // one occurrence per claim is enough
      }
    }
  })
  return DecorationSet.create(doc, decos)
}

export const AnvilDecorationsExtension = Extension.create({
  name: 'anvilDecorations',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: anvilDecorationsKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const setMeta = tr.getMeta(anvilDecorationsKey)
            if (setMeta?.type === 'set') {
              return buildDecorations(
                tr.doc,
                (setMeta.annotations as AnvilDecorationInput[]) || [],
                (setMeta.claims as AnvilClaimDecorationInput[]) || [],
                (setMeta.comps as AnvilCompDecorationInput[]) || [],
              )
            }
            if (setMeta?.type === 'clear') return DecorationSet.empty
            return old.map(tr.mapping, tr.doc)
          },
        },
        props: {
          decorations(state) {
            return anvilDecorationsKey.getState(state)
          },
          handleClick(view, _pos, event) {
            const target = event.target as HTMLElement | null
            const stricken = target?.closest('.anvil-strike') as HTMLElement | null
            if (stricken) {
              const id = stricken.getAttribute('data-anvil-id') || ''
              const rect = stricken.getBoundingClientRect()
              window.dispatchEvent(new CustomEvent<AnvilAnnotationClickDetail>(
                'anvil:annotation-click',
                { detail: { id, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } } },
              ))
              return true
            }
            const claimEl = target?.closest('.anvil-claim') as HTMLElement | null
            if (claimEl) {
              const id = claimEl.getAttribute('data-anvil-claim-id') || ''
              const rect = claimEl.getBoundingClientRect()
              window.dispatchEvent(new CustomEvent<AnvilAnnotationClickDetail>(
                'anvil:claim-click',
                { detail: { id, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } } },
              ))
              return true
            }
            return false
          },
        },
      }),
    ]
  },
})

/** Imperative helpers used by the editor wrapper to push annotation updates. */
export function setAnvilDecorations(
  view: import('@tiptap/pm/view').EditorView,
  annotations: AnvilDecorationInput[],
  claims: AnvilClaimDecorationInput[] = [],
  comps: AnvilCompDecorationInput[] = [],
): void {
  view.dispatch(view.state.tr.setMeta(anvilDecorationsKey, { type: 'set', annotations, claims, comps }))
}

export function clearAnvilDecorations(view: import('@tiptap/pm/view').EditorView): void {
  view.dispatch(view.state.tr.setMeta(anvilDecorationsKey, { type: 'clear' }))
}

/** Replace the first occurrence of `span` in the doc with `replacement` text. */
export function replaceSpan(
  view: import('@tiptap/pm/view').EditorView,
  span: string,
  replacement: string,
): boolean {
  if (!span) return false
  let found: { from: number; to: number } | null = null
  view.state.doc.descendants((node, pos) => {
    if (found || !node.isText) return
    const text = node.text || ''
    const idx = text.indexOf(span)
    if (idx !== -1) found = { from: pos + idx, to: pos + idx + span.length }
  })
  if (!found) return false
  view.dispatch(view.state.tr.insertText(replacement, found.from, found.to))
  return true
}
