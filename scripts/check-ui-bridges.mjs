import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const repoRoot = new URL('..', import.meta.url).pathname
const srcRoot = join(repoRoot, 'src')
const disallowedImport = '@tauri-apps/api/core'

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return walk(path)
    return path
  })
}

const violations = walk(srcRoot)
  .filter((path) => path.endsWith('.js') || path.endsWith('.vue'))
  .filter((path) => {
    const rel = relative(repoRoot, path)
    if (rel.startsWith('src/services/')) return false
    return readFileSync(path, 'utf8').includes(disallowedImport)
  })
  .map((path) => relative(repoRoot, path))

if (violations.length > 0) {
  console.error('UI bridge boundary violation: move @tauri-apps/api/core usage into src/services/.')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log('UI bridge boundary check passed.')
