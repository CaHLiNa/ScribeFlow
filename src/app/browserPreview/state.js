import {
  REFERENCE_COLLECTIONS,
  REFERENCE_TAGS,
} from '../../services/references/referenceLibraryFixtures.js'

export const BROWSER_PREVIEW_WORKSPACE_PATH = '/Altals Preview Workspace'
export const BROWSER_PREVIEW_GLOBAL_CONFIG_DIR = '/.altals-preview'
export const BROWSER_PREVIEW_WORKSPACE_ID = 'browser-preview'
export const BROWSER_PREVIEW_WORKSPACE_DATA_DIR = `${BROWSER_PREVIEW_GLOBAL_CONFIG_DIR}/workspaces/${BROWSER_PREVIEW_WORKSPACE_ID}`
export const BROWSER_PREVIEW_CLAUDE_DIR = `${BROWSER_PREVIEW_GLOBAL_CONFIG_DIR}/claude`

export const BROWSER_PREVIEW_PRIMARY_DOCUMENT = `${BROWSER_PREVIEW_WORKSPACE_PATH}/drafts/introduction.md`

const DEFAULT_PREVIEW_FILES = Object.freeze({
  [`${BROWSER_PREVIEW_WORKSPACE_PATH}/README.md`]: `# Altals Browser Preview

This route is a browser-only preview shell for the desktop workbench.

- Preview workspace chrome without Tauri
- Jump between settings, references, and document surfaces
- Inspect layout changes using stable mock data
`,
  [`${BROWSER_PREVIEW_WORKSPACE_PATH}/drafts/introduction.md`]: `# Introduction

Altals keeps writing, reading, and references inside one local-first desktop workbench.

## Preview Goals

- Preserve the existing shell layout
- Support internal route previews in the browser
- Avoid coupling browser previews to native Tauri APIs

> This file is backed by in-memory preview content while running in the browser.
`,
  [`${BROWSER_PREVIEW_WORKSPACE_PATH}/drafts/method.tex`]: `\\documentclass{article}
\\usepackage{amsmath}
\\title{Altals Preview Draft}
\\author{Browser Preview Mode}
\\begin{document}
\\maketitle

\\section{Method}
This preview route exists so internal desktop surfaces can be reviewed in a browser.

\\end{document}
`,
  [`${BROWSER_PREVIEW_WORKSPACE_PATH}/references/library.bib`]: `@article{altals-preview,
  title={Altals Browser Preview Mode},
  author={Altals Team},
  journal={Local-first Research Systems},
  year={2026}
}
`,
})

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function basename(path = '') {
  return String(path || '').split('/').pop() || ''
}

function createFileEntry(path) {
  return {
    path,
    name: basename(path),
    is_dir: false,
  }
}

function createDirEntry(path, children = []) {
  return {
    path,
    name: basename(path),
    is_dir: true,
    children,
  }
}

function buildPreviewTree() {
  return [
    createFileEntry(`${BROWSER_PREVIEW_WORKSPACE_PATH}/README.md`),
    createDirEntry(`${BROWSER_PREVIEW_WORKSPACE_PATH}/drafts`, [
      createFileEntry(`${BROWSER_PREVIEW_WORKSPACE_PATH}/drafts/introduction.md`),
      createFileEntry(`${BROWSER_PREVIEW_WORKSPACE_PATH}/drafts/method.tex`),
    ]),
    createDirEntry(`${BROWSER_PREVIEW_WORKSPACE_PATH}/references`, [
      createFileEntry(`${BROWSER_PREVIEW_WORKSPACE_PATH}/references/library.bib`),
    ]),
  ]
}

function buildPreviewFlatFiles(files = {}) {
  return Object.keys(files).map((path) => createFileEntry(path))
}

function buildDefaultReferenceSnapshot() {
  return {
    version: 2,
    legacyMigrationComplete: true,
    citationStyle: 'apa',
    collections: clone(REFERENCE_COLLECTIONS),
    tags: clone(REFERENCE_TAGS),
    references: [
      {
        id: 'preview-ref-1',
        title: 'Designing Local-First Research Workbenches',
        authors: ['A. Researcher', 'B. Systems'],
        authorLine: 'A. Researcher; B. Systems',
        year: 2025,
        identifier: '10.1000/preview.2025.001',
        typeKey: 'journal-article',
        source: 'Zotero',
        _source: 'zotero',
        collections: [],
        tags: [],
      },
      {
        id: 'preview-ref-2',
        title: 'Grounded Citation Assistance in Desktop Writing Tools',
        authors: ['C. Writer', 'D. Scholar'],
        authorLine: 'C. Writer; D. Scholar',
        year: 2026,
        identifier: 'grounded-citation-assistance-2026',
        typeKey: 'conference-paper',
        source: 'Imported Manually',
        _source: 'manual',
        collections: [],
        tags: [],
      },
    ],
  }
}

let previewFiles = { ...DEFAULT_PREVIEW_FILES }
let previewReferenceSnapshot = buildDefaultReferenceSnapshot()

export function isBrowserPreviewWorkspacePath(path = '') {
  return String(path || '').replace(/\/+$/, '') === BROWSER_PREVIEW_WORKSPACE_PATH
}

export function resetBrowserPreviewState() {
  previewFiles = { ...DEFAULT_PREVIEW_FILES }
  previewReferenceSnapshot = buildDefaultReferenceSnapshot()
}

export function listBrowserPreviewExpandedDirs() {
  return new Set([
    `${BROWSER_PREVIEW_WORKSPACE_PATH}/drafts`,
    `${BROWSER_PREVIEW_WORKSPACE_PATH}/references`,
  ])
}

export function readBrowserPreviewWorkspaceSnapshot(path = '') {
  if (!isBrowserPreviewWorkspacePath(path)) return null
  return {
    tree: clone(buildPreviewTree()),
    flatFiles: clone(buildPreviewFlatFiles(previewFiles)),
  }
}

export function readBrowserPreviewFileContents() {
  return { ...previewFiles }
}

export function readBrowserPreviewTextFile(path = '') {
  if (path in previewFiles) return previewFiles[path]
  throw new Error(`Preview file not found: ${path}`)
}

export function writeBrowserPreviewTextFile(path = '', content = '') {
  if (!String(path || '').startsWith(`${BROWSER_PREVIEW_WORKSPACE_PATH}/`)) {
    throw new Error(`Preview path is outside the mock workspace: ${path}`)
  }
  previewFiles[path] = String(content ?? '')
  return previewFiles[path]
}

export function readBrowserPreviewReferenceSnapshot() {
  return clone(previewReferenceSnapshot)
}

export function writeBrowserPreviewReferenceSnapshot(snapshot = {}) {
  previewReferenceSnapshot = clone(snapshot)
  return readBrowserPreviewReferenceSnapshot()
}
