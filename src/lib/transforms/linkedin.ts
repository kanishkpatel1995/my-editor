/**
 * Transform editor HTML for paste into LinkedIn article editor.
 * LinkedIn flattens H1, drops captions, and renders <code> inconsistently.
 */
export function transformForLinkedIn(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const root = doc.body.firstElementChild as HTMLElement
  if (!root) return html

  // Strip inline styles
  root.querySelectorAll<HTMLElement>('[style]').forEach((el) => el.removeAttribute('style'))

  // H1 → bold paragraph
  root.querySelectorAll('h1').forEach((h1) => {
    const p = doc.createElement('p')
    const strong = doc.createElement('strong')
    strong.innerHTML = h1.innerHTML
    p.appendChild(strong)
    h1.replaceWith(p)
  })

  // <hr> → paragraph with em dash
  root.querySelectorAll('hr').forEach((hr) => {
    const p = doc.createElement('p')
    p.textContent = '—'
    hr.replaceWith(p)
  })

  // Drop figcaptions
  root.querySelectorAll('figcaption').forEach((el) => el.remove())

  // Inline <code> → plain text
  root.querySelectorAll('code').forEach((c) => {
    if (c.parentElement?.tagName !== 'PRE') {
      const t = doc.createTextNode(c.textContent || '')
      c.replaceWith(t)
    }
  })

  // Empty paragraphs out
  root.querySelectorAll('p').forEach((p) => {
    if (!p.textContent?.trim() && p.children.length === 0) p.remove()
  })

  return root.innerHTML
}
