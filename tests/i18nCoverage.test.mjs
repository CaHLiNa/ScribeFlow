import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function walkFiles(rootDir, fileList = []) {
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') {
      continue
    }

    const fullPath = path.join(rootDir, entry.name)
    if (entry.isDirectory()) {
      walkFiles(fullPath, fileList)
      continue
    }

    if (/\.(vue|js)$/.test(entry.name)) {
      fileList.push(fullPath)
    }
  }

  return fileList
}

function loadI18nKeys() {
  const source = fs.readFileSync('src/i18n/index.js', 'utf8')
  const end = source.indexOf('export const locale')
  const dictionarySource = end >= 0 ? source.slice(0, end) : source

  return new Set(
    [...dictionarySource.matchAll(/^\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z][A-Za-z0-9 _&.:-]*))\s*:/gm)]
      .map((match) => match[1] || match[2] || match[3])
      .filter(Boolean)
  )
}

function findLiteralTranslationKeys(source = '') {
  const keys = []

  for (const match of source.matchAll(/\bt\(\s*'([^']+)'/g)) {
    keys.push(match[1])
  }

  for (const match of source.matchAll(/\bt\(\s*"([^"]+)"/g)) {
    keys.push(match[1])
  }

  return keys
}

test('all literal translation keys used in src exist in the i18n dictionary', () => {
  const dictionaryKeys = loadI18nKeys()
  const sourceFiles = walkFiles('src')
  const missing = []

  for (const filePath of sourceFiles) {
    const source = fs.readFileSync(filePath, 'utf8')
    for (const key of findLiteralTranslationKeys(source)) {
      if (!dictionaryKeys.has(key)) {
        missing.push(`${filePath}: ${key}`)
      }
    }
  }

  assert.deepEqual(missing, [])
})
