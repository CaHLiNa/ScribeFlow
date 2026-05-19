import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const srcRoot = join(repoRoot, 'src')

const sourceExtensions = ['.ts', '.vue']
const latexRuntimePath = 'src/editor/latexLanguage.ts'
const textmateRuntimeMarkers = [
  'vscode-textmate',
  'vscode-oniguruma',
  'onig.wasm',
  './textmate/',
  'parseRawGrammar',
  'loadWASM',
  'createOnigScanner',
  'createOnigString',
]

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return walk(path)
    return path
  })
}

function isSourceFile(path) {
  return sourceExtensions.some((extension) => path.endsWith(extension))
}

function hasStaticLatexLanguageImport(source) {
  return /^\s*import\s+.+['"].*\/editor\/latexLanguage(?:\.(?:js|ts))?['"]/m.test(source)
    || /^\s*import\s+.+['"]\.\.\/\.\.\/editor\/latexLanguage(?:\.(?:js|ts))?['"]/m.test(source)
    || /^\s*import\s+.+['"]\.\/latexLanguage(?:\.(?:js|ts))?['"]/m.test(source)
}

const violations = []

for (const path of walk(srcRoot).filter(isSourceFile)) {
  const rel = relative(repoRoot, path)
  const source = readFileSync(path, 'utf8')

  if (rel !== latexRuntimePath) {
    const matchedMarkers = textmateRuntimeMarkers.filter((marker) => source.includes(marker))
    if (matchedMarkers.length > 0) {
      violations.push({
        file: rel,
        reason: `TextMate runtime markers must stay inside ${latexRuntimePath}: ${matchedMarkers.join(', ')}`,
      })
    }
  }

  if (rel !== latexRuntimePath && hasStaticLatexLanguageImport(source)) {
    violations.push({
      file: rel,
      reason: 'latexLanguage must be loaded through dynamic import from the LaTeX editor path.',
    })
  }
}

if (violations.length > 0) {
  console.error('TextMate runtime boundary violation:')
  for (const violation of violations) {
    console.error(`- ${violation.file}: ${violation.reason}`)
  }
  process.exit(1)
}

console.log('TextMate runtime boundary check passed.')
