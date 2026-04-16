import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { nanoid } from '../../stores/utils'
import { t } from '../../i18n'

const TEXT_ATTACHMENT_MAX_BYTES = 64 * 1024
const TEXT_ATTACHMENT_PREVIEW_CHARS = 4000

const MEDIA_TYPE_BY_EXTENSION = {
  md: 'text/markdown',
  txt: 'text/plain',
  tex: 'text/x-tex',
  bib: 'text/x-bibtex',
  json: 'application/json',
  js: 'text/javascript',
  ts: 'text/typescript',
  vue: 'text/x-vue',
  py: 'text/x-python',
  rs: 'text/x-rust',
  yaml: 'text/yaml',
  yml: 'text/yaml',
  csv: 'text/csv',
  html: 'text/html',
  css: 'text/css',
  xml: 'application/xml',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}

function basenamePath(path = '') {
  const normalized = String(path || '').trim()
  if (!normalized) return ''
  const parts = normalized.split('/').filter(Boolean)
  return parts[parts.length - 1] || normalized
}

function extname(path = '') {
  const name = basenamePath(path)
  const dotIndex = name.lastIndexOf('.')
  if (dotIndex <= 0) return ''
  return name.slice(dotIndex + 1).toLowerCase()
}

function detectMediaType(path = '') {
  const extension = extname(path)
  return MEDIA_TYPE_BY_EXTENSION[extension] || 'application/octet-stream'
}

function isTextLikeAttachment(mediaType = '', path = '') {
  if (String(mediaType || '').startsWith('text/')) return true
  return ['md', 'txt', 'tex', 'bib', 'json', 'js', 'ts', 'vue', 'py', 'rs', 'yaml', 'yml', 'csv', 'html', 'css', 'xml']
    .includes(extname(path))
}

function previewText(value = '', limit = TEXT_ATTACHMENT_PREVIEW_CHARS) {
  const normalized = String(value || '').trim()
  if (!normalized) return ''
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, limit).trimEnd()}…`
}

export async function pickAiAttachmentPaths() {
  const selected = await open({
    multiple: true,
    directory: false,
    title: t('Attach files'),
  })

  if (!selected) return []
  return Array.isArray(selected) ? selected : [selected]
}

export async function createAiAttachmentRecord(path = '', { workspacePath = '' } = {}) {
  const normalizedPath = String(path || '').trim()
  if (!normalizedPath) return null

  const mediaType = detectMediaType(normalizedPath)
  const isText = isTextLikeAttachment(mediaType, normalizedPath)
  let content = ''
  let truncated = false
  let readError = ''

  if (isText) {
    try {
      content = String(await invoke('read_file', {
        path: normalizedPath,
        maxBytes: TEXT_ATTACHMENT_MAX_BYTES,
      }) || '')
    } catch (error) {
      readError = error instanceof Error ? error.message : String(error || '')
    }
  }

  const preview = previewText(content)
  truncated = !!content && preview.length < content.trim().length

  return {
    id: `attachment:${nanoid()}`,
    name: basenamePath(normalizedPath),
    path: normalizedPath,
    relativePath: workspacePath && normalizedPath.startsWith(workspacePath)
      ? normalizedPath.slice(workspacePath.length).replace(/^\/+/, '')
      : '',
    mediaType,
    isText,
    content: preview,
    truncated,
    readError: String(readError || ''),
  }
}
