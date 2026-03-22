import { gitAdd, gitCommit, gitInit, gitLog, gitStatus } from './git.js'
import { pathExists } from './pathExists.js'
import { getHomeDirCached, normalizePathValue } from './workspacePaths.js'

export function createWorkspaceHistoryRepoService({
  gitAddImpl = gitAdd,
  gitCommitImpl = gitCommit,
  gitInitImpl = gitInit,
  gitLogImpl = gitLog,
  gitStatusImpl = gitStatus,
  pathExistsImpl = pathExists,
  getHomeDirCachedImpl = getHomeDirCached,
  normalizePathValueImpl = normalizePathValue,
} = {}) {
  async function ensureWorkspaceHistoryRepo(path = '', options = {}) {
    const {
      seedInitialCommit = false,
      seedMessage = 'Initial snapshot',
    } = options

    if (!path) return { ok: false, reason: 'missing' }

    const normalizedPath = normalizePathValueImpl(path)
    const normalizedHome = await getHomeDirCachedImpl()
    if (normalizedHome && normalizedPath === normalizedHome) {
      return { ok: false, reason: 'home' }
    }

    const hasRepo = await pathExistsImpl(`${normalizedPath}/.git`)
    let initialized = false
    if (!hasRepo) {
      await gitInitImpl(normalizedPath)
      initialized = true
    }

    if (!seedInitialCommit) {
      return { ok: true, initialized, seeded: false }
    }

    const commits = await gitLogImpl(normalizedPath, null, 1)
    if (commits.length > 0) {
      return { ok: true, initialized, seeded: false }
    }

    await gitAddImpl(normalizedPath)
    const status = await gitStatusImpl(normalizedPath)
    if (!status.trim()) {
      return { ok: true, initialized, seeded: false, empty: true }
    }

    await gitCommitImpl(normalizedPath, seedMessage)
    return { ok: true, initialized, seeded: true }
  }

  return {
    ensureWorkspaceHistoryRepo,
  }
}

export async function ensureWorkspaceHistoryRepo(path = '', options = {}) {
  const service = createWorkspaceHistoryRepoService()
  return service.ensureWorkspaceHistoryRepo(path, options)
}
