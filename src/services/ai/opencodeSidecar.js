import { invoke } from '@tauri-apps/api/core'
import { t } from '../../i18n'
import { getHomeDirCached, normalizePathValue } from '../workspacePaths'

const DEFAULT_IDLE_DISPOSE_MS = 2 * 60 * 1000
const DEFAULT_HOST = '127.0.0.1'
const CORS_ORIGINS = ['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost']

const runtimeState = {
  child: null,
  command: null,
  endpoint: '',
  port: 0,
  envSignature: '',
  launchMode: null,
  startPromise: null,
  workspaceTimers: new Map(),
  workspaceRequests: new Map(),
}

function normalizeEndpoint(value = '') {
  return String(value || '').trim().replace(/\/+$/, '')
}

function createDirectoryHeaders(directory = '') {
  const normalized = normalizePathValue(directory)
  return normalized
    ? { 'x-opencode-directory': encodeURIComponent(normalized) }
    : {}
}

function workspacePath(workspace = null) {
  return normalizePathValue(workspace?.path || '')
}

function runtimeOptions(workspace = null) {
  const opencode = workspace?.aiRuntime?.opencode || {}
  return {
    endpoint: normalizeEndpoint(opencode.endpoint || ''),
    launchProfile: String(opencode.launchProfile || 'auto').trim() || 'auto',
    devRepoPath: normalizePathValue(opencode.devRepoPath || ''),
    idleDisposeMs: Number(opencode.idleDisposeMs) > 0 ? Number(opencode.idleDisposeMs) : DEFAULT_IDLE_DISPOSE_MS,
  }
}

function pickPort() {
  return 43000 + Math.floor(Math.random() * 2000)
}

function buildForwardedEnv(workspace = null) {
  const env = {}
  for (const [key, value] of Object.entries(workspace?.apiKeys || {})) {
    if (!value) continue
    env[key] = String(value)
  }
  if (env.GOOGLE_API_KEY && !env.GOOGLE_GENERATIVE_AI_API_KEY) {
    env.GOOGLE_GENERATIVE_AI_API_KEY = env.GOOGLE_API_KEY
  }
  return env
}

function getEnvSignature(env = {}) {
  return JSON.stringify(
    Object.keys(env)
      .sort()
      .map((key) => [key, env[key]]),
  )
}

async function pathExists(path = '') {
  if (!path) return false
  try {
    return await invoke('path_exists', { path })
  } catch {
    return false
  }
}

async function detectDevRepoPath(workspace = null) {
  const configured = normalizePathValue(workspace?.aiRuntime?.opencode?.devRepoPath || '')
  if (configured && await pathExists(configured)) return configured

  const home = await getHomeDirCached()
  const candidates = [
    `${home}/Documents/GitHub项目/opencode-dev`,
    `${home}/Documents/GitHub/opencode-dev`,
    `${home}/GitHub项目/opencode-dev`,
    `${home}/GitHub/opencode-dev`,
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (await pathExists(candidate)) return normalizePathValue(candidate)
  }

  return ''
}

function buildGlobalLaunchPlan(port, env) {
  return {
    name: 'opencode-cli',
    args: [
      'serve',
      '--hostname', DEFAULT_HOST,
      '--port', String(port),
      ...CORS_ORIGINS.flatMap((origin) => ['--cors', origin]),
    ],
    env,
    mode: 'global',
  }
}

function buildDevLaunchPlan(port, repoPath, env) {
  if (!repoPath) return null
  return {
    name: 'bun-opencode-dev',
    args: [
      'run',
      '--cwd',
      'packages/opencode',
      '--conditions=browser',
      'src/index.ts',
      'serve',
      '--hostname', DEFAULT_HOST,
      '--port', String(port),
      ...CORS_ORIGINS.flatMap((origin) => ['--cors', origin]),
    ],
    cwd: repoPath,
    env,
    mode: 'dev',
  }
}

async function buildLaunchPlans(workspace = null, port = 0, env = {}) {
  const options = runtimeOptions(workspace)
  const devRepoPath = await detectDevRepoPath(workspace)
  const globalPlan = buildGlobalLaunchPlan(port, env)
  const devPlan = buildDevLaunchPlan(port, devRepoPath, env)

  switch (options.launchProfile) {
    case 'global':
      return [globalPlan]
    case 'dev':
      return devPlan ? [devPlan] : []
    default:
      return [globalPlan, devPlan].filter(Boolean)
  }
}

async function waitForServer(endpoint, workspace, abortSignal) {
  const startedAt = Date.now()
  let lastError = null

  while (Date.now() - startedAt < 15000) {
    if (abortSignal?.aborted) {
      throw abortSignal.reason || new DOMException('Aborted', 'AbortError')
    }

    try {
      const response = await fetch(`${endpoint}/path`, {
        method: 'GET',
        headers: createDirectoryHeaders(workspacePath(workspace)),
        signal: abortSignal,
      })
      if (response.ok) return true
      lastError = new Error(t('Sidecar health check failed ({status})', { status: response.status }))
    } catch (error) {
      lastError = error
    }

    await new Promise((resolve) => window.setTimeout(resolve, 200))
  }

  throw lastError || new Error(t('Timed out while waiting for the opencode sidecar to start.'))
}

async function stopManagedSidecar() {
  const child = runtimeState.child
  runtimeState.child = null
  runtimeState.command = null
  runtimeState.endpoint = ''
  runtimeState.port = 0
  runtimeState.envSignature = ''
  runtimeState.launchMode = null
  runtimeState.startPromise = null

  for (const timer of runtimeState.workspaceTimers.values()) {
    clearTimeout(timer)
  }
  runtimeState.workspaceTimers.clear()
  runtimeState.workspaceRequests.clear()

  if (child) {
    try {
      await child.kill()
    } catch {
      // Ignore cleanup failures while shutting down the managed sidecar.
    }
  }
}

async function tryLaunchPlan(plan, workspace, endpoint, abortSignal) {
  const { Command } = await import('@tauri-apps/plugin-shell')
  let child = null
  const command = Command.create(plan.name, plan.args, {
    cwd: plan.cwd || workspacePath(workspace) || undefined,
    env: plan.env,
  })

  let closePayload = null
  let commandError = null

  command.stdout.on('data', () => {})
  command.stderr.on('data', () => {})
  command.on('error', (error) => {
    commandError = error
  })
  command.on('close', (payload) => {
    closePayload = payload
    if (runtimeState.child === child) {
      runtimeState.child = null
      runtimeState.command = null
      runtimeState.endpoint = ''
      runtimeState.port = 0
      runtimeState.envSignature = ''
      runtimeState.launchMode = null
    }
  })

  child = await command.spawn()

  try {
    await waitForServer(endpoint, workspace, abortSignal)
    runtimeState.child = child
    runtimeState.command = command
    runtimeState.endpoint = endpoint
    runtimeState.launchMode = plan.mode
    return endpoint
  } catch (error) {
    try {
      await child.kill()
    } catch {
      // Ignore cleanup failures after a launch attempt already failed.
    }
    if (commandError) {
      throw new Error(`opencode sidecar launch failed: ${String(commandError)}`, { cause: error })
    }
    if (closePayload && closePayload.code !== 0) {
      throw new Error(
        t('opencode sidecar exited ({code}) before becoming ready.', { code: closePayload.code }),
        { cause: error },
      )
    }
    throw error
  }
}

async function startManagedSidecar(workspace, abortSignal) {
  const options = runtimeOptions(workspace)
  if (options.endpoint) return options.endpoint

  const env = buildForwardedEnv(workspace)
  const envSignature = getEnvSignature(env)
  if (runtimeState.child && runtimeState.endpoint && runtimeState.envSignature === envSignature) {
    return runtimeState.endpoint
  }

  if (runtimeState.child && runtimeState.envSignature !== envSignature) {
    await stopManagedSidecar()
  }

  if (runtimeState.startPromise) return await runtimeState.startPromise

  const port = pickPort()
  const endpoint = `http://${DEFAULT_HOST}:${port}`

  runtimeState.startPromise = (async () => {
    const plans = await buildLaunchPlans(workspace, port, env)
    if (plans.length === 0) {
      throw new Error(t('No opencode launch plan is available. Configure a global opencode install or a local opencode-dev repo path.'))
    }

    let lastError = null
    for (const plan of plans) {
      try {
        const readyEndpoint = await tryLaunchPlan(plan, workspace, endpoint, abortSignal)
        runtimeState.port = port
        runtimeState.envSignature = envSignature
        return readyEndpoint
      } catch (error) {
        lastError = error
      }
    }

    throw lastError || new Error(t('Failed to launch the opencode sidecar.'))
  })()

  try {
    return await runtimeState.startPromise
  } finally {
    runtimeState.startPromise = null
  }
}

function clearWorkspaceTimer(directory = '') {
  const normalized = normalizePathValue(directory)
  const timer = runtimeState.workspaceTimers.get(normalized)
  if (!timer) return
  clearTimeout(timer)
  runtimeState.workspaceTimers.delete(normalized)
}

function updateWorkspaceRequestCount(directory = '', delta = 0) {
  const normalized = normalizePathValue(directory)
  const next = Math.max(0, (runtimeState.workspaceRequests.get(normalized) || 0) + delta)
  if (next === 0) runtimeState.workspaceRequests.delete(normalized)
  else runtimeState.workspaceRequests.set(normalized, next)
  return next
}

export async function ensureOpencodeEndpoint(workspace, options = {}) {
  const explicitEndpoint = normalizeEndpoint(options.endpoint || runtimeOptions(workspace).endpoint)
  if (explicitEndpoint) return explicitEndpoint
  return await startManagedSidecar(workspace, options.abortSignal)
}

export async function disposeOpencodeWorkspaceInstance(workspacePathValue = '', options = {}) {
  const directory = normalizePathValue(workspacePathValue)
  if (!directory) return false

  const endpoint = normalizeEndpoint(options.endpoint || runtimeState.endpoint)
  if (!endpoint) return false

  clearWorkspaceTimer(directory)
  runtimeState.workspaceRequests.delete(directory)

  try {
    const response = await fetch(`${endpoint}/instance/dispose`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...createDirectoryHeaders(directory),
      },
    })
    return response.ok
  } catch {
    return false
  }
}

export function markOpencodeWorkspaceBusy(workspace, options = {}) {
  const directory = workspacePath(workspace)
  if (!directory) return
  clearWorkspaceTimer(directory)
  updateWorkspaceRequestCount(directory, 1)
  if (options.endpoint) runtimeState.endpoint = normalizeEndpoint(options.endpoint)
}

export function markOpencodeWorkspaceIdle(workspace, options = {}) {
  const directory = workspacePath(workspace)
  if (!directory) return

  const endpoint = normalizeEndpoint(options.endpoint || runtimeState.endpoint)
  const remaining = updateWorkspaceRequestCount(directory, -1)
  if (remaining > 0) return

  clearWorkspaceTimer(directory)
  const idleDisposeMs = Number(options.idleDisposeMs) > 0
    ? Number(options.idleDisposeMs)
    : runtimeOptions(workspace).idleDisposeMs

  const timer = window.setTimeout(() => {
    runtimeState.workspaceTimers.delete(directory)
    void disposeOpencodeWorkspaceInstance(directory, { endpoint })
  }, idleDisposeMs)
  runtimeState.workspaceTimers.set(directory, timer)
}

export async function releaseOpencodeWorkspaceInstance(workspacePathValue = '', options = {}) {
  const directory = normalizePathValue(workspacePathValue)
  if (!directory) return false

  if (options.immediate) {
    return await disposeOpencodeWorkspaceInstance(directory, options)
  }

  clearWorkspaceTimer(directory)
  const endpoint = normalizeEndpoint(options.endpoint || runtimeState.endpoint)
  const idleDisposeMs = Number(options.idleDisposeMs) > 0 ? Number(options.idleDisposeMs) : DEFAULT_IDLE_DISPOSE_MS
  const timer = window.setTimeout(() => {
    runtimeState.workspaceTimers.delete(directory)
    void disposeOpencodeWorkspaceInstance(directory, { endpoint })
  }, idleDisposeMs)
  runtimeState.workspaceTimers.set(directory, timer)
  return true
}

export async function shutdownOpencodeSidecar() {
  await stopManagedSidecar()
}
