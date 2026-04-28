import { spawn } from 'node:child_process'
import process from 'node:process'

const HOST = '127.0.0.1'
const PORT = 1421
const BASE_URL = `http://${HOST}:${PORT}`
const START_TIMEOUT_MS = 30000
const POLL_INTERVAL_MS = 500

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchText(url) {
  const response = await fetch(url)
  const text = await response.text()
  return { response, text }
}

async function waitForServer() {
  const startedAt = Date.now()
  let lastError = null

  while (Date.now() - startedAt < START_TIMEOUT_MS) {
    try {
      const { response, text } = await fetchText(BASE_URL)
      if (response.ok) {
        return { response, text }
      }
      lastError = new Error(`Unexpected status: ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await sleep(POLL_INTERVAL_MS)
  }

  throw lastError || new Error('Timed out waiting for the Vite shell.')
}

async function main() {
  const logs = []
  const child = spawn(
    'npm',
    ['run', 'dev', '--', '--host', HOST, '--port', String(PORT), '--strictPort'],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    },
  )

  const rememberLog = (chunk) => {
    const text = String(chunk || '')
    if (!text) return
    logs.push(text)
    if (logs.length > 40) logs.shift()
  }

  child.stdout.on('data', rememberLog)
  child.stderr.on('data', rememberLog)

  const stopChild = async () => {
    if (child.killed || child.exitCode !== null) return
    child.kill('SIGTERM')
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      sleep(3000),
    ])
    if (child.exitCode === null) {
      child.kill('SIGKILL')
    }
  }

  try {
    const { text: html } = await waitForServer()
    if (!html.includes('<div id="app"></div>')) {
      throw new Error('App root container missing from Vite shell response.')
    }

    const { response: mainResponse, text: mainText } = await fetchText(`${BASE_URL}/src/main.js`)
    if (!mainResponse.ok) {
      throw new Error(`Main entry returned ${mainResponse.status}.`)
    }
    if (!mainText.includes("createApp")) {
      throw new Error('Main entry does not look like the frontend boot script.')
    }

    console.log(`Smoke passed: ${BASE_URL} served the app shell and main entry.`)
  } catch (error) {
    const recentLogs = logs.join('').trim()
    if (recentLogs) {
      console.error('Recent dev server output:')
      console.error(recentLogs)
    }
    throw error
  } finally {
    await stopChild()
  }
}

await main()
