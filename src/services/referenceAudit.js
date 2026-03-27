import { invoke } from '@tauri-apps/api/core'
import { extractMarkdownCitationKeys } from './markdown/citations.js'
import { extractLatexCitationKeys } from './latexCitationParsing.js'
import {
  bibliographyPathForSource,
  hasLatexBibliographyDirective,
  normalizeBibContent,
  planBibFileSync,
} from './latexBibliography.js'

const TYPST_CITE_RE = /(^|[^\w])@([A-Za-z][\w:-]*)/gm
const TYPST_BIB_RE = /#bibliography\s*\(/

function fileExtension(path = '') {
  const idx = String(path).lastIndexOf('.')
  return idx >= 0 ? String(path).slice(idx + 1).toLowerCase() : ''
}

function bibliographyPathForFile(filePath = '') {
  return bibliographyPathForSource(filePath)
}

function extractTypstCitationKeys(text = '') {
  const keys = []
  const seen = new Set()
  const source = String(text || '')
  TYPST_CITE_RE.lastIndex = 0
  let match
  while ((match = TYPST_CITE_RE.exec(source)) !== null) {
    const key = match[2]
    if (!seen.has(key)) {
      seen.add(key)
      keys.push(key)
    }
  }
  return keys
}

function bibliographyDirectiveStatus(filePath, content) {
  const ext = fileExtension(filePath)
  if (['tex', 'latex'].includes(ext)) {
    return hasLatexBibliographyDirective(content)
  }
  if (ext === 'typ') {
    return TYPST_BIB_RE.test(content)
  }
  return true
}

function citationsForFile(filePath, content) {
  const ext = fileExtension(filePath)
  if (['md', 'markdown', 'qmd', 'rmd'].includes(ext)) {
    return extractMarkdownCitationKeys(content)
  }
  if (['tex', 'latex'].includes(ext)) {
    return extractLatexCitationKeys(content)
  }
  if (ext === 'typ') {
    return extractTypstCitationKeys(content)
  }
  return []
}

async function readIfExists(path) {
  try {
    const exists = await invoke('path_exists', { path })
    if (!exists) return null
    return await invoke('read_file', { path })
  } catch {
    return null
  }
}

export async function auditReferenceUsage(filesByPath = {}, referencesStore) {
  const libraryKeys = new Set(referencesStore.allKeys || [])
  const issues = []
  const missingKeys = new Set()
  const citedFiles = []

  for (const [filePath, content] of Object.entries(filesByPath || {})) {
    const citations = citationsForFile(filePath, content)
    if (citations.length === 0) continue

    citedFiles.push(filePath)
    const ext = fileExtension(filePath)

    for (const key of citations) {
      if (!libraryKeys.has(key)) {
        missingKeys.add(key)
        issues.push({
          type: 'missing-reference',
          severity: 'error',
          filePath,
          key,
        })
      }
    }

    const needsDirective = ['tex', 'latex', 'typ'].includes(ext)
    const hasDirective = bibliographyDirectiveStatus(filePath, content)
    if (needsDirective && !hasDirective) {
      issues.push({
        type: 'missing-bibliography',
        severity: 'warning',
        filePath,
        bibliographyPath: bibliographyPathForFile(filePath),
      })
      continue
    }

    const bibliographyPath = bibliographyPathForFile(filePath)
    const existingBib = await readIfExists(bibliographyPath)
    if (!existingBib) {
      issues.push({
        type: 'missing-bibliography',
        severity: 'warning',
        filePath,
        bibliographyPath,
      })
      continue
    }

    const syncPlan = planBibFileSync({
      sourcePath: filePath,
      sourceContent: content,
      existingBibContent: existingBib,
      referencesStore,
    })

    if (normalizeBibContent(existingBib) !== normalizeBibContent(syncPlan.nextContent || '')) {
      issues.push({
        type: 'stale-bibliography',
        severity: 'warning',
        filePath,
        bibliographyPath,
      })
    }
  }

  return {
    issues,
    citedFiles,
    missingKeys: [...missingKeys],
    missingReferenceCount: issues.filter(issue => issue.type === 'missing-reference').length,
    bibliographyIssueCount: issues.filter(issue => issue.type !== 'missing-reference').length,
    checkedFileCount: citedFiles.length,
    generatedBibliographyPreview: null,
  }
}
