import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const srcRoot = join(repoRoot, 'src')

const sourceExtensions = ['.js', '.vue']
const embedPdfImporters = new Set([
  'src/components/editor/PdfEmbedSurface.vue',
  'src/components/editor/PdfEmbedDocumentSurface.vue',
  'src/components/editor/PdfPreviewEngine.worker.js',
  'src/services/pdf/embedPdfAdapter.js',
])
const pdfiumEngineImporters = new Set([
  'src/components/editor/PdfEmbedSurface.vue',
  'src/components/editor/PdfPreviewEngine.worker.js',
])
const pdfSurfaceImporters = new Set([
  'src/components/editor/PdfArtifactPreview.vue',
])
const pdfDocumentSurfaceImporters = new Set([
  'src/components/editor/PdfEmbedSurface.vue',
])

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return walk(path)
    return path
  })
}

function isSourceFile(path) {
  return sourceExtensions.some((extension) => path.endsWith(extension))
}

function hasStaticVueImport(source, componentFileName) {
  const escapedName = componentFileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^\\s*import\\s+.+${escapedName}['"]`, 'm').test(source)
}

const violations = []

for (const path of walk(srcRoot).filter(isSourceFile)) {
  const rel = relative(repoRoot, path)
  const source = readFileSync(path, 'utf8')

  if (source.includes('@embedpdf/') && !embedPdfImporters.has(rel)) {
    violations.push({
      file: rel,
      reason: '@embedpdf imports must stay inside the PDF preview runtime boundary.',
    })
  }

  if (
    (source.includes('@embedpdf/engines') || source.includes('usePdfiumEngine'))
    && !pdfiumEngineImporters.has(rel)
  ) {
    violations.push({
      file: rel,
      reason: 'PDFium engine loading must stay inside PdfEmbedSurface.',
    })
  }

  if (hasStaticVueImport(source, 'PdfArtifactPreview.vue')) {
    violations.push({
      file: rel,
      reason: 'PdfArtifactPreview must be loaded with defineAsyncComponent.',
    })
  }

  if (hasStaticVueImport(source, 'PdfEmbedSurface.vue') && !pdfSurfaceImporters.has(rel)) {
    violations.push({
      file: rel,
      reason: 'PdfEmbedSurface must only be statically imported by PdfArtifactPreview.',
    })
  }

  if (
    hasStaticVueImport(source, 'PdfEmbedDocumentSurface.vue')
    && !pdfDocumentSurfaceImporters.has(rel)
  ) {
    violations.push({
      file: rel,
      reason: 'PdfEmbedDocumentSurface must only be statically imported by PdfEmbedSurface.',
    })
  }
}

if (violations.length > 0) {
  console.error('PDF runtime boundary violation:')
  for (const violation of violations) {
    console.error(`- ${violation.file}: ${violation.reason}`)
  }
  process.exit(1)
}

console.log('PDF runtime boundary check passed.')
