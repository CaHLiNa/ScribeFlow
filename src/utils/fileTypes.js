import { basenamePath, dirnamePath, normalizeFsPath } from './path'

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico', 'tif', 'tiff', 'eps', 'ps']
const MULTIMODAL_IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp']
const POSTSCRIPT_TEXT_EXTS = ['eps', 'ps']
const CSV_EXTS = ['csv', 'tsv']
const HTML_EXTS = ['html', 'htm']
const PDF_EXTS = ['pdf']
const DOCX_EXTS = ['docx']
const LATEX_AUX_TEXT_EXTS = [
  'aux',
  'acn',
  'acr',
  'alg',
  'bcf',
  'bbl',
  'blg',
  'fdb_latexmk',
  'fls',
  'glg',
  'glo',
  'gls',
  'idx',
  'ilg',
  'ind',
  'ist',
  'lof',
  'log',
  'lot',
  'nav',
  'out',
  'run.xml',
  'snm',
  'synctex',
  'toc',
  'vrb',
]
const LATEX_EDITOR_EXTS = ['tex', 'latex', 'cls', 'sty']
const GENERAL_TEXT_EXTS = [
  'bib',
  'c',
  'cpp',
  'css',
  'cjs',
  'go',
  'h',
  'java',
  'jl',
  'js',
  'json',
  'jsx',
  'kt',
  'lua',
  'm',
  'markdown',
  'md',
  'mjs',
  'php',
  'py',
  'qmd',
  'r',
  'rb',
  'rmd',
  'rs',
  'scss',
  'sh',
  'sql',
  'svelte',
  'toml',
  'ts',
  'tsx',
  'txt',
  'vue',
  'xml',
  'yaml',
  'yml',
  'zig',
  'zsh',
  'bash',
]
const SUPPORTED_TEXT_EXTS = [...GENERAL_TEXT_EXTS, ...LATEX_EDITOR_EXTS, ...LATEX_AUX_TEXT_EXTS]
const RUNNABLE_MAP = {}

function getExt(path) {
  const name = basenamePath(path)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.substring(dot + 1).toLowerCase() : ''
}

export function isNewTab(path) {
  return path?.startsWith('newtab:')
}

export function isDraftPath(path) {
  return path?.startsWith('draft:')
}

export function isPreviewPath(path) {
  return isMarkdownPreviewPath(path)
}

export function isMarkdownPreviewPath(path) {
  return typeof path === 'string' && path.startsWith('preview:')
}

export function previewSourcePathFromPath(path) {
  if (isMarkdownPreviewPath(path)) return path.slice('preview:'.length)
  return ''
}

export function getViewerType(path) {
  if (isNewTab(path)) return 'newtab'
  if (isMarkdownPreviewPath(path)) return 'markdown-preview'
  const ext = getExt(path)
  if (POSTSCRIPT_TEXT_EXTS.includes(ext)) return 'text'
  if (IMAGE_EXTS.includes(ext)) return 'image'
  if (CSV_EXTS.includes(ext)) return 'csv'
  if (HTML_EXTS.includes(ext)) return 'html'
  if (SUPPORTED_TEXT_EXTS.includes(ext)) return 'text'
  if (PDF_EXTS.includes(ext)) return 'pdf'
  return 'unsupported-binary'
}

export function isMarkdown(path) {
  const ext = getExt(path)
  return ext === 'md' || ext === 'markdown' || ext === 'qmd' || ext === 'rmd'
}

export function isLatex(path) {
  const ext = getExt(path)
  return ext === 'tex' || ext === 'latex'
}

export function isLatexEditorFile(path) {
  return LATEX_EDITOR_EXTS.includes(getExt(path))
}

export function isBibFile(path) {
  return getExt(path) === 'bib'
}

export function isImage(path) {
  const ext = getExt(path)
  return IMAGE_EXTS.includes(ext)
}

export function isHtml(path) {
  const ext = getExt(path)
  return HTML_EXTS.includes(ext)
}

export function isMultimodalImage(path) {
  const ext = getExt(path)
  return MULTIMODAL_IMAGE_EXTS.includes(ext)
}

export function isPdf(path) {
  const ext = getExt(path)
  return ext === 'pdf'
}

export function relativePath(fromFile, toFile) {
  const normalizedFrom = normalizeFsPath(fromFile)
  const normalizedTo = normalizeFsPath(toFile)
  const fromDrive = normalizedFrom.match(/^[A-Za-z]:/)?.[0]?.toLowerCase() || ''
  const toDrive = normalizedTo.match(/^[A-Za-z]:/)?.[0]?.toLowerCase() || ''
  if (fromDrive && toDrive && fromDrive !== toDrive) return normalizedTo

  const fromDir = dirnamePath(normalizedFrom)
  const fromParts = fromDir.split('/')
  const toParts = normalizedTo.split('/')
  let common = 0
  while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) {
    common++
  }
  const ups = fromParts.length - common
  const remainder = toParts.slice(common)
  if (ups === 0) return remainder.join('/')
  return '../'.repeat(ups) + remainder.join('/')
}

export function isBinaryFile(path) {
  if (isNewTab(path) || isDraftPath(path)) return false
  const ext = getExt(path)
  if (POSTSCRIPT_TEXT_EXTS.includes(ext)) return false
  return IMAGE_EXTS.includes(ext) || PDF_EXTS.includes(ext) || DOCX_EXTS.includes(ext)
}

const ICON_MAP = {
  '_instructions.md': 'IconSparkles',
  'instructions.md': 'IconSparkles',
  md: 'IconFileText',
  txt: 'IconFileText',
  json: 'IconBraces',
  js: 'IconBrandJavascript',
  mjs: 'IconBrandJavascript',
  cjs: 'IconBrandJavascript',
  ts: 'IconBrandTypescript',
  tsx: 'IconBrandTypescript',
  jsx: 'IconBrandJavascript',
  m: 'IconFileCode',
  py: 'IconBrandPython',
  rs: 'IconFileCode',
  go: 'IconFileCode',
  java: 'IconFileCode',
  c: 'IconFileCode',
  cpp: 'IconFileCode',
  h: 'IconFileCode',
  rb: 'IconFileCode',
  php: 'IconFileCode',
  swift: 'IconFileCode',
  kt: 'IconFileCode',
  html: 'IconBrandHtml5',
  css: 'IconBrandCss3',
  scss: 'IconBrandCss3',
  vue: 'IconBrandVue',
  svelte: 'IconFileCode',
  sh: 'IconTerminal2',
  bash: 'IconTerminal2',
  zsh: 'IconTerminal2',
  sql: 'IconDatabase',
  yaml: 'IconFileCode',
  yml: 'IconFileCode',
  toml: 'IconFileCode',
  xml: 'IconFileCode',
  svg: 'IconPhoto',
  png: 'IconPhoto',
  jpg: 'IconPhoto',
  jpeg: 'IconPhoto',
  gif: 'IconPhoto',
  webp: 'IconPhoto',
  bmp: 'IconPhoto',
  ico: 'IconPhoto',
  tif: 'IconPhoto',
  tiff: 'IconPhoto',
  eps: 'IconPhoto',
  ps: 'IconPhoto',
  pdf: 'IconFileTypePdf',
  docx: 'IconFileTypeDocx',
  doc: 'IconFileTypeDoc',
  csv: 'IconTable',
  tsv: 'IconTable',
  env: 'IconLock',
  gitignore: 'IconLock',
  lock: 'IconLock',
  r: 'IconFileCode',
  rmd: 'IconFileText',
  qmd: 'IconFileText',
  jl: 'IconFileCode',
  ipynb: 'IconNotebook',
  tex: 'IconMath',
  cls: 'IconMath',
  sty: 'IconMath',
  bib: 'IconFileText',
  lua: 'IconFileCode',
  zig: 'IconFileCode',
}

export function getFileIconName(fileName) {
  const name = fileName.toLowerCase()
  // Check full filename first (e.g. ".gitignore", ".env")
  if (ICON_MAP[name]) return ICON_MAP[name]
  // Strip leading dot for dotfiles
  const stripped = name.startsWith('.') ? name.substring(1) : name
  if (ICON_MAP[stripped]) return ICON_MAP[stripped]
  // Extension
  const dot = name.lastIndexOf('.')
  if (dot > 0) {
    const ext = name.substring(dot + 1)
    if (ICON_MAP[ext]) return ICON_MAP[ext]
  }
  return 'IconFile'
}

export function isRunnable(path) {
  const ext = getExt(path)
  return ext in RUNNABLE_MAP
}

export function getLanguage(path) {
  const ext = getExt(path)
  return RUNNABLE_MAP[ext] || null
}

export function isRmdOrQmd(path) {
  return false
}

export function getMimeType(path) {
  const ext = getExt(path)
  const mimes = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    bmp: 'image/bmp',
    ico: 'image/x-icon',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    eps: 'application/postscript',
    ps: 'application/postscript',
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }
  return mimes[ext] || 'application/octet-stream'
}
