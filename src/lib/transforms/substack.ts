/**
 * Transform editor HTML for paste into Substack composer.
 * Substack reads semantic HTML; minimal massaging needed.
 */
export function transformForSubstack(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const root = doc.body.firstElementChild as HTMLElement
  if (!root) return html

  // Strip any inline style attributes TipTap may have added
  root.querySelectorAll<HTMLElement>('[style]').forEach((el) => el.removeAttribute('style'))

  // Substack ignores <hr> and renders centered three dots; emit a paragraph
  root.querySelectorAll('hr').forEach((hr) => {
    const p = doc.createElement('p')
    p.textContent = '· · ·'
    p.setAttribute('data-substack-divider', 'true')
    hr.replaceWith(p)
  })

  // Clean up empty paragraphs
  root.querySelectorAll('p').forEach((p) => {
    if (!p.textContent?.trim() && p.children.length === 0) p.remove()
  })

  return root.innerHTML
}
