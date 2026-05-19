import { resolveLatexExistingSynctex } from './runtime.ts'

export async function resolveExistingLatexSynctexPath(pdfPath = '') {
  const resolved = await resolveLatexExistingSynctex({ pdfPath }).catch(() => null)
  const resolvedPath = String(resolved?.path || '').trim()
  return resolvedPath
}
