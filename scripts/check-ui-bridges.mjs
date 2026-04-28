import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const ROOT = process.cwd()
const GUARDED_DIRECTORIES = [
  'src/app',
  'src/components',
  'src/composables',
  'src/i18n',
]
const GUARDED_FILES = [
  'src/stores/workspace.js',
  'src/stores/files.js',
  'src/stores/links.js',
  'src/stores/latex.js',
  'src/stores/references.js',
]
const SOURCE_FILE_PATTERN = /\.(js|vue)$/u
const TAURI_CORE_IMPORT_PATTERN = /@tauri-apps\/api\/core/u

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...await collectFiles(absolutePath))
      continue
    }

    if (SOURCE_FILE_PATTERN.test(entry.name)) {
      files.push(absolutePath)
    }
  }

  return files
}

function toLineNumber(content, matchIndex) {
  return content.slice(0, matchIndex).split('\n').length
}

async function main() {
  const violations = []

  for (const relativeDirectory of GUARDED_DIRECTORIES) {
    const absoluteDirectory = path.join(ROOT, relativeDirectory)
    const files = await collectFiles(absoluteDirectory)

    for (const filePath of files) {
      const content = await readFile(filePath, 'utf8')
      const match = TAURI_CORE_IMPORT_PATTERN.exec(content)
      if (!match) continue

      violations.push({
        filePath: path.relative(ROOT, filePath),
        line: toLineNumber(content, match.index),
      })
    }
  }

  for (const relativeFilePath of GUARDED_FILES) {
    const absoluteFilePath = path.join(ROOT, relativeFilePath)
    const content = await readFile(absoluteFilePath, 'utf8')
    const match = TAURI_CORE_IMPORT_PATTERN.exec(content)
    if (!match) continue

    violations.push({
      filePath: path.relative(ROOT, absoluteFilePath),
      line: toLineNumber(content, match.index),
    })
  }

  if (violations.length === 0) {
    console.log('UI bridge guard passed: guarded UI layers, i18n entrypoints, and selected main-path stores have no direct @tauri-apps/api/core imports.')
    return
  }

  console.error('UI bridge guard failed. Move Tauri core access out of guarded UI layers:')
  for (const violation of violations) {
    console.error(`- ${violation.filePath}:${violation.line}`)
  }
  process.exit(1)
}

await main()
