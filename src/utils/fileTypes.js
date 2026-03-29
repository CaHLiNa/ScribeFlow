const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico']
const MULTIMODAL_IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp']
const CSV_EXTS = ['csv', 'tsv']
const PDF_EXTS = ['pdf']
const DOCX_EXTS = ['docx']
const SUPPORTED_TEXT_EXTS = ['md', 'markdown', 'tex', 'latex', 'typ']
const RUNNABLE_MAP = {}

function getExt(path) {
  const name = path.split('/').pop() || ''
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.substring(dot + 1).toLowerCase() : ''
}

export function isNewTab(path) {
  return path?.startsWith('newtab:')
}

export function isPreviewPath(path) {
  return isMarkdownPreviewPath(path) || isTypstPreviewPath(path)
}

export function isMarkdownPreviewPath(path) {
  return typeof path === 'string' && path.startsWith('preview:')
}

export function isTypstPreviewPath(path) {
  return typeof path === 'string' && path.startsWith('typst-preview:')
}

export function previewSourcePathFromPath(path) {
  if (isMarkdownPreviewPath(path)) return path.slice('preview:'.length)
  if (isTypstPreviewPath(path)) return path.slice('typst-preview:'.length)
  return ''
}

export function getViewerType(path) {
  if (isNewTab(path)) return 'newtab'
  if (isMarkdownPreviewPath(path)) return 'markdown-preview'
  if (isTypstPreviewPath(path)) return 'typst-native-preview'
  const ext = getExt(path)
  if (SUPPORTED_TEXT_EXTS.includes(ext)) return 'text'
  return 'unsupported-binary'
}

export function isMarkdown(path) {
  const ext = getExt(path)
  return ext === 'md' || ext === 'markdown'
}

export function isLatex(path) {
  const ext = getExt(path)
  return ext === 'tex' || ext === 'latex'
}

export function isBibFile(path) {
  return false
}

export function isTypst(path) {
  return getExt(path) === 'typ'
}

export function isImage(path) {
  const ext = getExt(path)
  return IMAGE_EXTS.includes(ext)
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
  const fromDir = fromFile.substring(0, fromFile.lastIndexOf('/'))
  const fromParts = fromDir.split('/')
  const toParts = toFile.split('/')
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
  if (isNewTab(path)) return false
  const ext = getExt(path)
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
  typ: 'IconMath',
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
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }
  return mimes[ext] || 'application/octet-stream'
}
