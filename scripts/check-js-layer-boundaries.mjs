import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const repoRoot = new URL('..', import.meta.url).pathname
const domainsRoot = join(repoRoot, 'src', 'domains')
const importPattern =
  /(?:import\s+(?:[^'"]+\s+from\s+)?|export\s+[^'"]+\s+from\s+|import\s*\()\s*['"]([^'"]+)['"]/g

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return walk(path)
    return path
  })
}

const violations = walk(domainsRoot)
  .filter((path) => path.endsWith('.js') || path.endsWith('.vue'))
  .flatMap((path) => {
    const source = readFileSync(path, 'utf8')
    return Array.from(source.matchAll(importPattern))
      .map((match) => match[1])
      .filter(
        (importPath) =>
          importPath.startsWith('@tauri-apps/api/') ||
          importPath.startsWith('@tauri-apps/plugin-') ||
          importPath.includes('/services/') ||
          importPath.includes('/stores/'),
      )
      .map((importPath) => ({
        file: relative(repoRoot, path),
        importPath,
      }))
  })

const hardViolations = violations.filter((violation) =>
  violation.importPath.startsWith('@tauri-apps/'),
)
const legacyViolations = violations.filter(
  (violation) => !violation.importPath.startsWith('@tauri-apps/'),
)

if (hardViolations.length > 0) {
  console.error('JS layer boundary violation: src/domains must not import Tauri APIs.')
  for (const violation of hardViolations) {
    console.error(`- ${violation.file} imports ${violation.importPath}`)
  }
  process.exit(1)
}

if (legacyViolations.length > 0) {
  console.error(
    'JS layer boundary violation: src/domains must not import service/store modules.',
  )
  for (const violation of legacyViolations) {
    console.error(`- ${violation.file} imports ${violation.importPath}`)
  }
  process.exit(1)
}

console.log('JS layer boundary check passed.')
