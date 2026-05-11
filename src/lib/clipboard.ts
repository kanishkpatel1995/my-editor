export async function writeRichClipboard(html: string, plain: string): Promise<void> {
  const html_blob = new Blob([html], { type: 'text/html' })
  const text_blob = new Blob([plain], { type: 'text/plain' })
  await navigator.clipboard.write([
    new ClipboardItem({
      'text/html': html_blob,
      'text/plain': text_blob,
    }),
  ])
}
