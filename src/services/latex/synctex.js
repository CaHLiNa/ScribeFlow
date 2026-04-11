import { pathExists } from '../pathExists.js'

export function buildLatexSynctexCandidates(pdfPath = '') {
  const normalizedPdfPath = String(pdfPath || '').trim()
  if (!normalizedPdfPath.toLowerCase().endsWith('.pdf')) return []
  const basePath = normalizedPdfPath.slice(0, -4)
  return [
    `${basePath}.synctex.gz`,
    `${basePath}.synctex`,
  ]
}

export async function resolveExistingLatexSynctexPath(pdfPath = '') {
  const candidates = buildLatexSynctexCandidates(pdfPath)
  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate
    }
  }
  return ''
}
