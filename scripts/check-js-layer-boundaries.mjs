import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const repoRoot = new URL('..', import.meta.url).pathname
const domainsRoot = join(repoRoot, 'src', 'domains')
const importPattern =
  /(?:import\s+(?:[^'"]+\s+from\s+)?|export\s+[^'"]+\s+from\s+|import\s*\()\s*['"]([^'"]+)['"]/g
const referenceRuntimePatterns = [
  {
    pattern: /\b(?:cslToReferenceRecord|referenceRecordToCsl|buildAuthorNamesFromCsl)\b/,
    message:
      'Reference CSL/record canonical conversion belongs in Rust references runtime, not src/domains.',
  },
  {
    pattern: /\bnormalizeReferenceRecord\b/,
    message:
      'Canonical reference record normalization belongs in Rust references runtime, not src/domains.',
  },
  {
    pattern: /\b(?:REFERENCE_TO_CSL_TYPE|CSL_TO_REFERENCE_TYPE)\b/,
    message:
      'Reference type mapping belongs in Rust references runtime, not src/domains.',
  },
]
const synchronousDomainRuntimeFiles = [
  'src/domains/files/fileTreeDisplayRuntime.js',
  'src/domains/files/workspaceSnapshotFlatFilesRuntime.js',
]

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
const referenceRuntimeViolations = walk(join(domainsRoot, 'references'))
  .filter((path) => path.endsWith('.js') || path.endsWith('.vue'))
  .flatMap((path) => {
    const source = readFileSync(path, 'utf8')
    return referenceRuntimePatterns
      .filter(({ pattern }) => pattern.test(source))
      .map(({ message }) => ({
        file: relative(repoRoot, path),
        message,
      }))
  })
const syncRuntimeAsyncBridgeViolations = synchronousDomainRuntimeFiles
  .map((relativePath) => {
    const path = join(repoRoot, relativePath)
    const source = readFileSync(path, 'utf8')
    const forbiddenPatterns = [
      {
        pattern: /\basync\s+function\b|\bexport\s+async\s+function\b/,
        message: 'must expose synchronous helpers for computed/getter call sites',
      },
      {
        pattern: /\bimport\s*\([^)]*\)|\binvoke\s*\(/,
        message: 'must not call async bridge APIs',
      },
      {
        pattern: /@tauri-apps\/api|\/services\//,
        message: 'must not import service or Tauri bridge modules',
      },
    ]
    return forbiddenPatterns
      .filter(({ pattern }) => pattern.test(source))
      .map(({ message }) => ({
        file: relativePath,
        message,
      }))
  })
  .flat()

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

if (referenceRuntimeViolations.length > 0) {
  console.error('JS layer boundary violation: reference canonical runtime must stay in Rust.')
  for (const violation of referenceRuntimeViolations) {
    console.error(`- ${violation.file}: ${violation.message}`)
  }
  process.exit(1)
}

if (syncRuntimeAsyncBridgeViolations.length > 0) {
  console.error('JS layer boundary violation: synchronous domain runtimes must stay sync.')
  for (const violation of syncRuntimeAsyncBridgeViolations) {
    console.error(`- ${violation.file}: ${violation.message}`)
  }
  process.exit(1)
}

console.log('JS layer boundary check passed.')
