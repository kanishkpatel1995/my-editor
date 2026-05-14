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

export interface AnvilAnnotationClickDetail {
  id: string
  rect: { x: number; y: number; width: number; height: number }
}

export const anvilDecorationsKey = new PluginKey<DecorationSet>('anvilDecorations')

function buildDecorations(doc: import('@tiptap/pm/model').Node, annotations: AnvilDecorationInput[]): DecorationSet {
  if (!annotations.length) return DecorationSet.empty
  // Index annotations by span text for quick per-text-node lookup.
  const decos: Decoration[] = []
  doc.descendants((node, pos) => {
    if (!node.isText) return
    const text = node.text || ''
    for (const ann of annotations) {
      if (ann.decision === 'accepted' || ann.decision === 'rejected') continue
      if (!ann.span || ann.span.length < 2) continue
      let searchFrom = 0
      // Allow multiple occurrences of the same span in one text node.
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
            if (setMeta?.type === 'set' && Array.isArray(setMeta.annotations)) {
              return buildDecorations(tr.doc, setMeta.annotations as AnvilDecorationInput[])
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
): void {
  view.dispatch(view.state.tr.setMeta(anvilDecorationsKey, { type: 'set', annotations }))
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
