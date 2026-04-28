import { invoke } from '@tauri-apps/api/core'
import { normalizeFsPath } from '../documentIntelligence/workspaceGraph.js'
import {
  computeLatexWorkshopBackwardSync,
  computeLatexWorkshopForwardSync,
} from './latexWorkshopSynctexParser.js'

export async function readLatexWorkshopSynctexContent(synctexPath) {
  const normalizedPath = normalizeFsPath(synctexPath)
  if (!normalizedPath) return ''
  return invoke('read_latex_synctex', { path: normalizedPath })
}

export async function requestLatexWorkshopBackwardSync(options = {}) {
  const synctexPath = normalizeFsPath(options.synctexPath)
  const page = Number(options.page || 0)
  const x = Number(options.x)
  const y = Number(options.y)
  if (!synctexPath || !Number.isInteger(page) || page < 1 || !Number.isFinite(x) || !Number.isFinite(y)) {
    return null
  }

  const content = await readLatexWorkshopSynctexContent(synctexPath)
  return computeLatexWorkshopBackwardSync(content, page, x, y)
}

export async function requestLatexWorkshopForwardSync(options = {}) {
  const synctexPath = normalizeFsPath(options.synctexPath)
  const filePath = normalizeFsPath(options.filePath)
  const line = Number(options.line || 0)
  if (!synctexPath || !filePath || !Number.isInteger(line) || line < 1) {
    return null
  }

  const content = await readLatexWorkshopSynctexContent(synctexPath)
  return computeLatexWorkshopForwardSync(content, filePath, line)
}
