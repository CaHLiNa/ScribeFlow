import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const repoRoot = new URL('..', import.meta.url).pathname
const srcRoot = join(repoRoot, 'src')
const disallowedImports = ['@tauri-apps/api/', '@tauri-apps/plugin-']
const allowedNativeBridgeFile = 'src/services/tauriBridge.ts'

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return walk(path)
    return path
  })
}

const violations = walk(srcRoot)
  .filter((path) => path.endsWith('.js') || path.endsWith('.ts') || path.endsWith('.vue'))
  .filter((path) => {
    const rel = relative(repoRoot, path)
    if (rel === allowedNativeBridgeFile) return false
    const source = readFileSync(path, 'utf8')
    return disallowedImports.some((importPath) => source.includes(importPath))
  })
  .map((path) => relative(repoRoot, path))

if (violations.length > 0) {
  console.error(
    'UI bridge boundary violation: move direct Tauri API/plugin usage into src/services/tauriBridge.ts.',
  )
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log('UI bridge boundary check passed.')
