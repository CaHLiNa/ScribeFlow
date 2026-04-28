import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

const execFileAsync = promisify(execFile)

const APP_NAME = 'ScribeFlow'
const PROCESS_NAME = 'ScribeFlow'
const START_TIMEOUT_MS = 90000
const OPEN_TIMEOUT_MS = 45000
const POLL_INTERVAL_MS = 750

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve(port)
      })
    })
  })
}

async function runAppleScript(script) {
  const { stdout } = await execFileAsync('osascript', ['-e', script])
  return String(stdout || '').trim()
}

async function getWindowCount() {
  const result = await runAppleScript(
    `tell application "System Events" to count windows of process "${PROCESS_NAME}"`,
  ).catch(() => '0')
  const count = Number.parseInt(result, 10)
  return Number.isFinite(count) ? count : 0
}

async function getFrontWindowTitle() {
  return runAppleScript(
    `tell application "System Events" to get value of attribute "AXTitle" of front window of process "${PROCESS_NAME}"`,
  ).catch(() => '')
}

async function isAppRunning() {
  try {
    const { stdout } = await execFileAsync('pgrep', ['-x', PROCESS_NAME])
    return String(stdout || '').trim().length > 0
  } catch {
    return false
  }
}

async function quitApp() {
  await runAppleScript(`tell application "${APP_NAME}" to quit`).catch(() => {})
  await sleep(1500)
  await execFileAsync('pkill', ['-x', PROCESS_NAME]).catch(() => {})
}

async function waitForWindow() {
  const startedAt = Date.now()
  while (Date.now() - startedAt < START_TIMEOUT_MS) {
    const count = await getWindowCount()
    if (count > 0) return
    await sleep(POLL_INTERVAL_MS)
  }
  throw new Error(`Timed out waiting for ${APP_NAME} window.`)
}

async function waitForFrontendReady(logs) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < START_TIMEOUT_MS) {
    const output = logs.join('')
    if (output.includes('[app-dirs] get_global_config_dir=')) {
      await sleep(1000)
      return
    }
    await sleep(POLL_INTERVAL_MS)
  }
  throw new Error(`Timed out waiting for ${APP_NAME} frontend runtime to become ready.`)
}

async function automateOpenFolder(workspacePath) {
  const escapedPath = workspacePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  await runAppleScript(`tell application "${APP_NAME}" to activate`)
  await sleep(500)
  await runAppleScript(`
    set the clipboard to POSIX path of "${escapedPath}"
    tell application "System Events"
      tell process "${PROCESS_NAME}"
        keystroke "o" using {command down}
        delay 0.5
        keystroke "g" using {command down, shift down}
        delay 0.5
        keystroke "v" using {command down}
        delay 0.2
        key code 36
        delay 0.6
        key code 36
      end tell
    end tell
  `)
}

async function waitForWorkspaceLifecycle(lifecyclePath, workspacePath) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < OPEN_TIMEOUT_MS) {
    try {
      const content = await readFile(lifecyclePath, 'utf8')
      const parsed = JSON.parse(content)
      const lastWorkspace = String(parsed?.lastWorkspace || parsed?.state?.lastWorkspace || '')
      const recent = Array.isArray(parsed?.recentWorkspaces)
        ? parsed.recentWorkspaces
        : Array.isArray(parsed?.state?.recentWorkspaces)
          ? parsed.state.recentWorkspaces
          : []
      const recentHit = recent.some((entry) => String(entry?.path || '') === workspacePath)
      if (lastWorkspace === workspacePath && recentHit) {
        return parsed
      }
    } catch {
      // Keep waiting until the lifecycle file is written.
    }
    await sleep(POLL_INTERVAL_MS)
  }
  throw new Error('Timed out waiting for workspace lifecycle state to reflect the opened workspace.')
}

async function waitForBookmarkFile(bookmarksPath, workspacePath) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < OPEN_TIMEOUT_MS) {
    try {
      const content = await readFile(bookmarksPath, 'utf8')
      const parsed = JSON.parse(content)
      const bookmarks = parsed?.bookmarks && typeof parsed.bookmarks === 'object'
        ? parsed.bookmarks
        : {}
      if (typeof bookmarks[workspacePath] === 'string' && bookmarks[workspacePath].length > 0) {
        return
      }
    } catch {
      // Keep waiting until the bookmark file is written.
    }
    await sleep(POLL_INTERVAL_MS)
  }
  throw new Error('Timed out waiting for workspace bookmark persistence.')
}

async function main() {
  if (await isAppRunning()) {
    throw new Error(`${APP_NAME} is already running. Close it before running workspace-open smoke.`)
  }

  const realHome = String(process.env.HOME || '')
  const rustupHome = String(process.env.RUSTUP_HOME || (realHome ? path.join(realHome, '.rustup') : ''))
  const cargoHome = String(process.env.CARGO_HOME || (realHome ? path.join(realHome, '.cargo') : ''))
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'scribeflow-native-open-'))
  const fakeHome = path.join(tempRoot, 'home')
  const workspaceRoot = path.join(tempRoot, 'workspace')
  const devPort = await getFreePort()
  const devConfigPath = path.join(tempRoot, 'tauri.smoke.conf.json')
  const dataRoot = path.join(fakeHome, '.scribeflow')
  const lifecyclePath = path.join(dataRoot, 'workspace-lifecycle.json')
  const bookmarksPath = path.join(dataRoot, 'workspace-bookmarks.json')
  await mkdir(fakeHome, { recursive: true })
  await mkdir(workspaceRoot, { recursive: true })
  await writeFile(
    devConfigPath,
    JSON.stringify({
      build: {
        devUrl: `http://127.0.0.1:${devPort}`,
        beforeDevCommand: `npm run dev -- --host 127.0.0.1 --port ${devPort} --strictPort`,
      },
    }),
  )
  await writeFile(path.join(workspaceRoot, 'smoke-note.md'), '# Native workspace smoke\n\nThis workspace was opened by automation.\n')

  const logs = []
  const child = spawn(
    'npm',
    ['run', 'tauri', '--', 'dev', '--no-watch', '--config', devConfigPath],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        HOME: fakeHome,
        RUSTUP_HOME: rustupHome,
        CARGO_HOME: cargoHome,
      },
    },
  )

  const rememberLog = (chunk) => {
    const text = String(chunk || '')
    if (!text) return
    logs.push(text)
    if (logs.length > 80) logs.shift()
  }

  child.stdout.on('data', rememberLog)
  child.stderr.on('data', rememberLog)

  const stopChild = async () => {
    if (child.exitCode !== null || child.killed) return
    child.kill('SIGTERM')
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      sleep(5000),
    ])
    if (child.exitCode === null) {
      child.kill('SIGKILL')
    }
  }

  try {
    await waitForWindow()
    await waitForFrontendReady(logs)
    await automateOpenFolder(workspaceRoot)
    await waitForWorkspaceLifecycle(lifecyclePath, workspaceRoot)
    await waitForBookmarkFile(bookmarksPath, workspaceRoot)
    const title = await getFrontWindowTitle()
    console.log(`Native workspace-open smoke passed: opened ${workspaceRoot}${title ? ` in window "${title}"` : ''}.`)
  } catch (error) {
    const recentLogs = logs.join('').trim()
    if (recentLogs) {
      console.error('Recent tauri dev output:')
      console.error(recentLogs)
    }
    throw error
  } finally {
    await quitApp()
    await stopChild()
    await rm(tempRoot, { recursive: true, force: true }).catch(() => {})
  }
}

await main()
