export async function renderPreview(...args) {
  const { renderMarkdownDraftPreview } = await import('../services/markdown/preview.ts')
  return renderMarkdownDraftPreview(...args)
}
