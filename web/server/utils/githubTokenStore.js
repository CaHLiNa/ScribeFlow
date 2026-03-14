// In-memory store for GitHub OAuth tokens awaiting desktop polling
// Tokens live for 2 minutes max — no DB needed

import { createHash } from 'crypto'

const store = new Map()
const processedCodes = new Set()

export function hashValue(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function setGitHubToken(stateHash, data) {
  store.set(stateHash, { data, expiresAt: Date.now() + 120_000 })
  setTimeout(() => store.delete(stateHash), 120_000)
}

export function getGitHubToken(stateHash) {
  const entry = store.get(stateHash)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    store.delete(stateHash)
    return null
  }
  // One-time read
  store.delete(stateHash)
  return entry.data
}

// Prevent double code exchange (browser can hit callback twice)
export function markCodeUsed(code) {
  processedCodes.add(code)
  setTimeout(() => processedCodes.delete(code), 120_000)
}

export function isCodeUsed(code) {
  return processedCodes.has(code)
}
