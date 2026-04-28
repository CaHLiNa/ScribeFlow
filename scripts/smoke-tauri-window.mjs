import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { spawn } from 'node:child_process'

const execFileAsync = promisify(execFile)

const APP_NAME = 'ScribeFlow'
const PROCESS_NAME = 'ScribeFlow'
const START_TIMEOUT_MS = 90000
const POLL_INTERVAL_MS = 750

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

async function main() {
  if (await isAppRunning()) {
    throw new Error(`${APP_NAME} is already running. Close it before running native smoke.`)
  }

  const logs = []
  const child = spawn(
    'npm',
    ['run', 'tauri', '--', 'dev', '--no-watch'],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    },
  )

  const rememberLog = (chunk) => {
    const text = String(chunk || '')
    if (!text) return
    logs.push(text)
    if (logs.length > 60) logs.shift()
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
    const startedAt = Date.now()
    let seenWindow = false
    let lastTitle = ''

    while (Date.now() - startedAt < START_TIMEOUT_MS) {
      const count = await getWindowCount()
      if (count > 0) {
        seenWindow = true
        lastTitle = await getFrontWindowTitle()
        break
      }
      if (child.exitCode !== null) {
        throw new Error(`tauri dev exited early with code ${child.exitCode}.`)
      }
      await sleep(POLL_INTERVAL_MS)
    }

    if (!seenWindow) {
      throw new Error(`Timed out waiting for ${APP_NAME} window.`)
    }

    console.log(`Native smoke passed: ${APP_NAME} window appeared${lastTitle ? ` (${lastTitle})` : ''}.`)
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
  }
}

await main()
