import { invoke } from '@tauri-apps/api/core'
import { normalizeFsPath } from '../documentIntelligence/workspaceGraph.js'

/*
 * Adapted from LaTeX-Workshop:
 * - src/locate/synctex/synctexjs.ts
 * - src/locate/synctex/worker.ts
 * Original upstream is MIT licensed.
 */

class Rectangle {
  constructor({ top, bottom, left, right }) {
    this.top = top
    this.bottom = bottom
    this.left = left
    this.right = right
  }

  include(rect) {
    return this.left <= rect.left
      && this.right >= rect.right
      && this.bottom >= rect.bottom
      && this.top <= rect.top
  }

  distanceFromCenter(x, y) {
    return Math.sqrt(
      ((this.left + this.right) / 2 - x) ** 2
      + ((this.bottom + this.top) / 2 - y) ** 2,
    )
  }
}

function isBlock(value) {
  return value && value.parent !== undefined
}

function toRect(blocks) {
  if (!Array.isArray(blocks)) {
    const top = blocks.bottom - blocks.height
    const bottom = blocks.bottom
    const left = blocks.left
    const right = blocks.width != null ? blocks.left + blocks.width : blocks.left
    return new Rectangle({ top, bottom, left, right })
  }

  let top = Number.POSITIVE_INFINITY
  let bottom = 0
  let left = Number.POSITIVE_INFINITY
  let right = 0

  for (const block of blocks) {
    if (block.elements !== undefined || block.type === 'k' || block.type === 'r') {
      continue
    }
    bottom = Math.max(block.bottom, bottom)
    top = Math.min(block.bottom - block.height, top)
    left = Math.min(block.left, left)
    if (block.width !== undefined) {
      right = Math.max(block.left + block.width, right)
    }
  }

  return new Rectangle({ top, bottom, left, right })
}

function splitNormalizedPathSegments(value = '') {
  return normalizeFsPath(value)
    .toLowerCase()
    .split('/')
    .filter(Boolean)
}

function scoreSynctexInputPath(inputPath = '', filePath = '') {
  const normalizedInputPath = normalizeFsPath(inputPath).toLowerCase()
  const normalizedFilePath = normalizeFsPath(filePath).toLowerCase()
  if (!normalizedInputPath || !normalizedFilePath) return -1
  if (normalizedInputPath === normalizedFilePath) return 10_000

  const inputSegments = splitNormalizedPathSegments(normalizedInputPath)
  const fileSegments = splitNormalizedPathSegments(normalizedFilePath)
  if (inputSegments.length === 0 || fileSegments.length === 0) return -1
  if (inputSegments[inputSegments.length - 1] !== fileSegments[fileSegments.length - 1]) return -1

  let trailingMatches = 0
  while (
    trailingMatches < inputSegments.length
    && trailingMatches < fileSegments.length
    && inputSegments[inputSegments.length - 1 - trailingMatches]
      === fileSegments[fileSegments.length - 1 - trailingMatches]
  ) {
    trailingMatches += 1
  }

  return 100 + trailingMatches * 25
}

function findForwardInputFilePath(filePath = '', pdfSyncObject = {}) {
  const inputPaths = Object.keys(pdfSyncObject.blockNumberLine || {})
  let bestPath = ''
  let bestScore = -1

  for (const inputPath of inputPaths) {
    const score = scoreSynctexInputPath(inputPath, filePath)
    if (score > bestScore) {
      bestPath = inputPath
      bestScore = score
    }
  }

  return bestScore >= 125 ? bestPath : ''
}

function resolveForwardLineCandidate(lineNums = [], requestedLine = 0) {
  if (!Array.isArray(lineNums) || lineNums.length === 0) return 0
  if (lineNums.includes(requestedLine)) return requestedLine

  const nextLine = lineNums.find((lineNum) => lineNum >= requestedLine)
  if (Number.isInteger(nextLine) && nextLine > 0) return nextLine
  return lineNums[lineNums.length - 1] || 0
}

function buildForwardRectRecord(pdfSyncObject, page, blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) return null
  const rect = toRect(blocks)
  const width = Math.max(0, rect.right - rect.left)
  const height = Math.max(0, rect.bottom - rect.top)
  const x = rect.left + pdfSyncObject.offset.x
  const y = rect.bottom + pdfSyncObject.offset.y
  return {
    page: Number(page),
    x,
    y,
    h: x,
    v: y,
    W: width,
    H: height,
    indicator: true,
  }
}

function parseSyncTex(content = '') {
  const unit = 65781.76
  const blockNumberLine = Object.create(null)
  const files = Object.create(null)
  const pages = Object.create(null)
  const hBlocks = []

  let numberPages = 0
  let currentPage
  let currentElement

  const lineArray = String(content || '').split('\n')
  const pdfSyncObject = {
    offset: { x: 0, y: 0 },
    version: (lineArray[0] || '').replace('SyncTeX Version:', ''),
    files,
    pages,
    blockNumberLine,
    hBlocks,
    numberPages,
  }

  const inputPattern = /Input:([0-9]+):(.+)/
  const offsetPattern = /(X|Y) Offset:([0-9]+)/
  const openPagePattern = /\{([0-9]+)$/
  const closePagePattern = /\}([0-9]+)$/
  const verticalBlockPattern = /\[([0-9]+),([0-9]+):(-?[0-9]+),(-?[0-9]+):(-?[0-9]+),(-?[0-9]+),(-?[0-9]+)/
  const closeVerticalBlockPattern = /\]$/
  const horizontalBlockPattern = /\(([0-9]+),([0-9]+):(-?[0-9]+),(-?[0-9]+):(-?[0-9]+),(-?[0-9]+),(-?[0-9]+)/
  const closeHorizontalBlockPattern = /\)$/
  const elementBlockPattern = /(.)([0-9]+),([0-9]+):(-?[0-9]+),(-?[0-9]+)(:?(-?[0-9]+))?/

  for (let index = 1; index < lineArray.length; index += 1) {
    const line = lineArray[index]

    let match = line.match(inputPattern)
    if (match) {
      files[match[1]] = { path: match[2] }
      continue
    }

    match = line.match(offsetPattern)
    if (match) {
      if (match[1].toLowerCase() === 'x') {
        pdfSyncObject.offset.x = Number(match[2]) / unit
      } else {
        pdfSyncObject.offset.y = Number(match[2]) / unit
      }
      continue
    }

    match = line.match(openPagePattern)
    if (match) {
      currentPage = {
        page: Number(match[1]),
        blocks: [],
        type: 'page',
      }
      numberPages = Math.max(numberPages, currentPage.page)
      currentElement = currentPage
      continue
    }

    match = line.match(closePagePattern)
    if (match && currentPage) {
      pages[match[1]] = currentPage
      currentPage = undefined
      continue
    }

    match = line.match(verticalBlockPattern)
    if (match && currentPage && currentElement) {
      const block = {
        type: 'vertical',
        parent: currentElement,
        fileNumber: Number(match[1]),
        file: files[match[1]],
        line: Number(match[2]),
        left: Number(match[3]) / unit,
        bottom: Number(match[4]) / unit,
        width: Number(match[5]) / unit,
        height: Number(match[6]) / unit,
        depth: Number(match[7]),
        blocks: [],
        elements: [],
        page: currentPage.page,
      }
      currentElement = block
      continue
    }

    if (line.match(closeVerticalBlockPattern)) {
      if (isBlock(currentElement) && isBlock(currentElement.parent) && currentElement.parent.blocks) {
        currentElement.parent.blocks.push(currentElement)
        currentElement = currentElement.parent
      }
      continue
    }

    match = line.match(horizontalBlockPattern)
    if (match && currentPage && currentElement) {
      const block = {
        type: 'horizontal',
        parent: currentElement,
        fileNumber: Number(match[1]),
        file: files[match[1]],
        line: Number(match[2]),
        left: Number(match[3]) / unit,
        bottom: Number(match[4]) / unit,
        width: Number(match[5]) / unit,
        height: Number(match[6]) / unit,
        blocks: [],
        elements: [],
        page: currentPage.page,
      }
      hBlocks.push(block)
      currentElement = block
      continue
    }

    if (line.match(closeHorizontalBlockPattern)) {
      if (isBlock(currentElement) && isBlock(currentElement.parent) && currentElement.parent.blocks) {
        currentElement.parent.blocks.push(currentElement)
        currentElement = currentElement.parent
      }
      continue
    }

    match = line.match(elementBlockPattern)
    if (match && currentPage && isBlock(currentElement)) {
      const fileNumber = Number(match[2])
      const lineNumber = Number(match[3])
      const file = files[fileNumber]
      if (!file) continue

      const element = {
        type: match[1],
        parent: currentElement,
        fileNumber,
        file,
        line: lineNumber,
        left: Number(match[4]) / unit,
        bottom: Number(match[5]) / unit,
        width: match[7] ? Number(match[7]) / unit : undefined,
        height: currentElement.height,
        page: currentPage.page,
      }

      if (!blockNumberLine[file.path]) {
        blockNumberLine[file.path] = Object.create(null)
      }
      if (!blockNumberLine[file.path][lineNumber]) {
        blockNumberLine[file.path][lineNumber] = Object.create(null)
      }
      if (!blockNumberLine[file.path][lineNumber][element.page]) {
        blockNumberLine[file.path][lineNumber][element.page] = []
      }
      blockNumberLine[file.path][lineNumber][element.page].push(element)
      currentElement.elements?.push(element)
    }
  }

  pdfSyncObject.numberPages = numberPages
  return pdfSyncObject
}

export function computeLatexWorkshopBackwardSync(content, page, x, y) {
  const pdfSyncObject = parseSyncTex(content)
  const y0 = y - pdfSyncObject.offset.y
  const x0 = x - pdfSyncObject.offset.x
  const fileNames = Object.keys(pdfSyncObject.blockNumberLine || {})
  if (fileNames.length === 0) return null

  const record = {
    input: '',
    line: 0,
    distanceFromCenter: Number.POSITIVE_INFINITY,
    rect: new Rectangle({
      top: 0,
      bottom: Number.POSITIVE_INFINITY,
      left: 0,
      right: Number.POSITIVE_INFINITY,
    }),
  }

  for (const fileName of fileNames) {
    const linePageBlocks = pdfSyncObject.blockNumberLine[fileName]
    for (const [lineNum, pageBlocks] of Object.entries(linePageBlocks)) {
      for (const [pageNum, blocks] of Object.entries(pageBlocks)) {
        if (Number(pageNum) !== page) continue
        for (const block of blocks) {
          if (block.elements !== undefined || block.type === 'k' || block.type === 'r') {
            continue
          }
          const rect = toRect(block)
          const distanceFromCenter = rect.distanceFromCenter(x0, y0)
          if (
            record.rect.include(rect)
            || (distanceFromCenter < record.distanceFromCenter && !rect.include(record.rect))
          ) {
            record.input = fileName
            record.line = Number(lineNum)
            record.distanceFromCenter = distanceFromCenter
            record.rect = rect
          }
        }
      }
    }
  }

  if (!record.input) return null
  return {
    file: normalizeFsPath(record.input) || record.input,
    line: record.line,
    column: 0,
  }
}

export function computeLatexWorkshopForwardSync(content, filePath, line) {
  const normalizedFilePath = normalizeFsPath(filePath)
  const requestedLine = Number(line || 0)
  if (!normalizedFilePath || !Number.isInteger(requestedLine) || requestedLine < 1) return null

  const pdfSyncObject = parseSyncTex(content)
  const inputFilePath = findForwardInputFilePath(normalizedFilePath, pdfSyncObject)
  if (!inputFilePath) return null

  const linePageBlocks = pdfSyncObject.blockNumberLine?.[inputFilePath]
  if (!linePageBlocks || typeof linePageBlocks !== 'object') return null

  const lineNums = Object.keys(linePageBlocks)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0)
    .sort((left, right) => left - right)
  const resolvedLine = resolveForwardLineCandidate(lineNums, requestedLine)
  if (!resolvedLine) return null

  const pageBlocks = linePageBlocks[resolvedLine]
  if (!pageBlocks || typeof pageBlocks !== 'object') return null

  const records = Object.entries(pageBlocks)
    .map(([page, blocks]) => buildForwardRectRecord(pdfSyncObject, page, blocks))
    .filter(Boolean)
    .sort((left, right) => left.page - right.page)

  if (records.length === 0) return null
  return {
    mode: 'rects',
    records,
    record: records[0],
  }
}

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
