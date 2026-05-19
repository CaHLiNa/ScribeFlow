import { readdirSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const assetsDir = resolve(rootDir, 'dist/assets')

const KiB = 1024
const MiB = 1024 * KiB

const ASSET_BUDGETS = [
  {
    id: 'pdfium-wasm',
    label: 'PDFium WASM engine',
    pattern: /^pdfium-[\w-]+\.wasm$/,
    limit: 5 * MiB,
    reason: 'PDFium WASM engine budget.',
    heavy: true,
  },
  {
    id: 'embedpdf-worker',
    label: 'EmbedPDF PDFium worker',
    pattern: /^worker-engine-[\w-]+\.js$/,
    limit: 750 * KiB,
    reason: 'EmbedPDF PDFium worker is an upstream worker bundle.',
    heavy: true,
  },
  {
    id: 'oniguruma-wasm',
    label: 'TextMate Oniguruma WASM',
    pattern: /^onig-[\w-]+\.wasm$/,
    limit: 512 * KiB,
    reason: 'TextMate Oniguruma WASM budget.',
    heavy: true,
  },
  {
    id: 'ordinary-js',
    label: 'Ordinary JS chunk',
    pattern: /\.js$/,
    limit: 500 * KiB,
    reason: 'Default JS chunk budget.',
    heavy: false,
  },
  {
    id: 'ordinary-css',
    label: 'Ordinary CSS asset',
    pattern: /\.css$/,
    limit: 128 * KiB,
    reason: 'Default CSS asset budget.',
    heavy: false,
  },
]

const UNKNOWN_ASSET_LIMIT = 500 * KiB

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(2)} KiB`
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return walk(path)
    return path
  })
}

function budgetForAsset(fileName) {
  return ASSET_BUDGETS.find((budget) => budget.pattern.test(fileName)) || null
}

let assets = []
try {
  assets = walk(assetsDir)
} catch {
  console.error('Bundle budget check requires a completed Vite build at dist/assets.')
  process.exit(1)
}

const checked = []
const violations = []
const unknownOversizedAssets = []

for (const assetPath of assets) {
  const fileName = basename(assetPath)
  const budget = budgetForAsset(fileName)
  const size = statSync(assetPath).size

  if (!budget) {
    if (size > UNKNOWN_ASSET_LIMIT) {
      unknownOversizedAssets.push({
        path: relative(rootDir, assetPath),
        size,
        limit: UNKNOWN_ASSET_LIMIT,
      })
    }
    continue
  }

  const entry = {
    path: relative(rootDir, assetPath),
    size,
    ...budget,
  }
  checked.push(entry)
  if (size > budget.limit) violations.push(entry)
}

if (violations.length > 0 || unknownOversizedAssets.length > 0) {
  console.error('Bundle budget exceeded:')
  for (const violation of violations.sort((left, right) => right.size - left.size)) {
    console.error(
      `- ${violation.path}: ${formatBytes(violation.size)} > ${formatBytes(violation.limit)} (${violation.label}; ${violation.reason})`,
    )
  }
  for (const asset of unknownOversizedAssets.sort((left, right) => right.size - left.size)) {
    console.error(
      `- ${asset.path}: ${formatBytes(asset.size)} > ${formatBytes(asset.limit)} (unknown asset class; add an explicit budget before accepting this asset)`,
    )
  }
  process.exit(1)
}

console.log('Bundle budget check passed.')

const heavyAssets = checked
  .filter((asset) => asset.heavy)
  .sort((left, right) => right.size - left.size)
const ordinaryAssets = checked
  .filter((asset) => !asset.heavy)
  .sort((left, right) => right.size - left.size)
  .slice(0, 5)

if (heavyAssets.length > 0) {
  console.log('Known heavy runtime assets:')
  for (const asset of heavyAssets) {
    console.log(`- ${asset.label}: ${asset.path}: ${formatBytes(asset.size)} / ${formatBytes(asset.limit)}`)
  }
}

if (ordinaryAssets.length > 0) {
  console.log('Largest ordinary checked assets:')
  for (const asset of ordinaryAssets) {
    console.log(`- ${asset.label}: ${asset.path}: ${formatBytes(asset.size)} / ${formatBytes(asset.limit)}`)
  }
}
