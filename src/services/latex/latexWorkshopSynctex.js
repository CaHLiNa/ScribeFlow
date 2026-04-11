import { invoke } from '@tauri-apps/api/core'
import {
  basenamePath,
  normalizeFsPath,
} from '../documentIntelligence/workspaceGraph.js'

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

function getBlocks(linePageBlocks, lineNum) {
  const pageBlocks = linePageBlocks[lineNum]
  const pageNums = Object.keys(pageBlocks || {})
  if (pageNums.length === 0) return []
  return pageBlocks[Number(pageNums[0])] || []
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

function latexWorkshopPathsMatch(candidatePath, targetPath) {
  const normalizedCandidate = normalizeFsPath(candidatePath)
  const normalizedTarget = normalizeFsPath(targetPath)
  if (!normalizedCandidate || !normalizedTarget) return false
  if (normalizedCandidate === normalizedTarget) return true
  if (!normalizedCandidate.startsWith('/') && normalizedTarget.endsWith(`/${normalizedCandidate}`)) {
    return true
  }
  return basenamePath(normalizedCandidate) === basenamePath(normalizedTarget)
}

function findInputFilePathForward(filePath, pdfSyncObject) {
  return Object.keys(pdfSyncObject.blockNumberLine || {}).find(inputFilePath =>
    latexWorkshopPathsMatch(inputFilePath, filePath),
  )
}

export function computeLatexWorkshopForwardSync(content, texPath, line) {
  const pdfSyncObject = parseSyncTex(content)
  const inputFilePath = findInputFilePathForward(texPath, pdfSyncObject)
  if (!inputFilePath) return null

  const linePageBlocks = pdfSyncObject.blockNumberLine[inputFilePath]
  const lineNums = Object.keys(linePageBlocks).map(Number).sort((left, right) => left - right)
  if (lineNums.length === 0) return null

  const lineIndex = lineNums.findIndex(value => value >= line)
  if (lineIndex === 0 || lineNums[lineIndex] === line) {
    const resolvedLine = lineNums[Math.max(0, lineIndex)]
    const blocks = getBlocks(linePageBlocks, resolvedLine)
    if (blocks.length === 0) return null
    const rect = toRect(blocks)
    return {
      page: blocks[0].page,
      x: rect.left + pdfSyncObject.offset.x,
      y: rect.bottom + pdfSyncObject.offset.y,
      indicator: true,
    }
  }

  if (lineIndex < 0) {
    const resolvedLine = lineNums[lineNums.length - 1]
    const blocks = getBlocks(linePageBlocks, resolvedLine)
    if (blocks.length === 0) return null
    const rect = toRect(blocks)
    return {
      page: blocks[0].page,
      x: rect.left + pdfSyncObject.offset.x,
      y: rect.bottom + pdfSyncObject.offset.y,
      indicator: true,
    }
  }

  const line0 = lineNums[lineIndex - 1]
  const blocks0 = getBlocks(linePageBlocks, line0)
  const rect0 = toRect(blocks0)
  const line1 = lineNums[lineIndex]
  const blocks1 = getBlocks(linePageBlocks, line1)
  if (blocks1.length === 0) return null
  const rect1 = toRect(blocks1)
  const bottom = rect0.bottom < rect1.bottom
    ? rect0.bottom * (line1 - line) / (line1 - line0)
      + rect1.bottom * (line - line0) / (line1 - line0)
    : rect1.bottom

  return {
    page: blocks1[0].page,
    x: rect1.left + pdfSyncObject.offset.x,
    y: bottom + pdfSyncObject.offset.y,
    indicator: true,
  }
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

export async function readLatexWorkshopSynctexContent(synctexPath) {
  const normalizedPath = normalizeFsPath(synctexPath)
  if (!normalizedPath) return ''
  return invoke('read_latex_synctex', { path: normalizedPath })
}

export async function requestLatexWorkshopForwardSync(options = {}) {
  const synctexPath = normalizeFsPath(options.synctexPath)
  const texPath = normalizeFsPath(options.texPath)
  const line = Number(options.line || 0)
  if (!synctexPath || !texPath || !Number.isInteger(line) || line < 1) return null

  const content = await readLatexWorkshopSynctexContent(synctexPath)
  return computeLatexWorkshopForwardSync(content, texPath, line)
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
