import { pathExists } from '../pathExists.js'
import {
  basenamePath,
  normalizeFsPath,
} from '../documentIntelligence/workspaceGraph.js'
import { readLatexWorkshopSynctexContent } from './latexWorkshopSynctex.js'

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

function collapsePathSegments(value = '') {
  const normalized = normalizeFsPath(value)
  if (!normalized) return ''

  const isAbsolute = normalized.startsWith('/')
  const drivePrefixMatch = normalized.match(/^[A-Za-z]:\//)
  const drivePrefix = drivePrefixMatch ? drivePrefixMatch[0].slice(0, 2) : ''
  const seed = drivePrefix ? normalized.slice(3) : isAbsolute ? normalized.slice(1) : normalized
  const nextSegments = []

  for (const segment of seed.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (nextSegments.length > 0) nextSegments.pop()
      continue
    }
    nextSegments.push(segment)
  }

  if (drivePrefix) return normalizeFsPath(`${drivePrefix}/${nextSegments.join('/')}`)
  if (isAbsolute) return normalizeFsPath(`/${nextSegments.join('/')}`)
  return normalizeFsPath(nextSegments.join('/'))
}

function splitPathSegments(value = '') {
  const collapsed = collapsePathSegments(value)
  if (!collapsed) return []
  const withoutDrive = collapsed.replace(/^[A-Za-z]:\//, '')
  return withoutDrive.split('/').filter(Boolean)
}

function trailingSegmentMatchCount(left = '', right = '') {
  const leftSegments = splitPathSegments(left)
  const rightSegments = splitPathSegments(right)
  let matches = 0

  while (
    matches < leftSegments.length
    && matches < rightSegments.length
    && leftSegments[leftSegments.length - 1 - matches] === rightSegments[rightSegments.length - 1 - matches]
  ) {
    matches += 1
  }

  return matches
}

function scoreSynctexInputPath(rawInputPath = '', texPath = '') {
  const collapsedInputPath = collapsePathSegments(rawInputPath)
  const collapsedTexPath = collapsePathSegments(texPath)
  if (!collapsedInputPath || !collapsedTexPath) return -1
  if (collapsedInputPath === collapsedTexPath) return 10_000

  const inputBaseName = basenamePath(collapsedInputPath)
  const texBaseName = basenamePath(collapsedTexPath)
  if (!inputBaseName || inputBaseName !== texBaseName) return -1

  const trailingMatches = trailingSegmentMatchCount(collapsedInputPath, collapsedTexPath)
  return 100 + trailingMatches * 25
}

function parseSynctexInputPaths(content = '') {
  const inputs = []
  const seen = new Set()

  for (const line of String(content || '').split('\n')) {
    const match = line.match(/^Input:\d+:(.+)$/)
    if (!match) continue

    const rawPath = String(match[1] || '').trim()
    const collapsedPath = collapsePathSegments(rawPath)
    if (!rawPath || !collapsedPath || seen.has(rawPath)) continue

    seen.add(rawPath)
    inputs.push({
      rawPath,
      collapsedPath,
    })
  }

  return inputs
}

async function readCachedSynctexInputPaths(synctexPath = '') {
  const normalizedSynctexPath = normalizeFsPath(synctexPath)
  if (!normalizedSynctexPath) return []

  const content = await readLatexWorkshopSynctexContent(normalizedSynctexPath).catch(() => '')
  return parseSynctexInputPaths(content)
}

export async function resolveLatexSynctexInputPath(synctexPath = '', texPath = '') {
  const normalizedTexPath = normalizeFsPath(texPath)
  if (!synctexPath || !normalizedTexPath) return normalizedTexPath

  const inputs = await readCachedSynctexInputPaths(synctexPath)
  if (inputs.length === 0) return normalizedTexPath

  let best = null
  let bestScore = -1
  for (const input of inputs) {
    const score = scoreSynctexInputPath(input.rawPath, normalizedTexPath)
    if (score > bestScore) {
      best = input
      bestScore = score
    }
  }

  return best && bestScore >= 125 ? best.rawPath : normalizedTexPath
}
