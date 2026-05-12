import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { createLogger, createServer } from 'vite'

if (!globalThis.window) {
  globalThis.window = globalThis
}

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto
}

const vite = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
  logLevel: 'error',
  customLogger: createLogger('error', {
    customConsole: {
      ...console,
      error(message, ...rest) {
        const rendered = String(message || '')
        if (rendered.includes('WebSocket server error:')) return
        console.error(message, ...rest)
      },
    },
  }),
})

let clearTauriMocks = () => {}

try {
  const { mockIPC, mockWindows, clearMocks } = await import('@tauri-apps/api/mocks')
  clearTauriMocks = clearMocks
  mockWindows('main')

  const calls = []

  mockIPC(async (cmd, args) => {
    calls.push({ cmd, args })

    if (cmd === 'workspace_paths_hash') {
      return 'hash'
    }
    if (cmd === 'workspace_paths_resolve_data_dir') {
      return '/tmp/config/workspaces/workspace-id'
    }
    if (cmd === 'workspace_paths_resolve_claude_config_dir') {
      return '/tmp/.claude'
    }
    if (cmd === 'workspace_paths_resolve_skill_path') {
      return '/tmp/project/skills/demo'
    }
    if (cmd === 'workspace_paths_normalize_value') {
      return '/tmp/project'
    }

    throw new Error(`Unexpected IPC command: ${cmd}`)
  })

  const {
    hashWorkspacePath,
    normalizePathValue,
    resolveClaudeConfigDir,
    resolveSkillPath,
    resolveWorkspaceDataDir,
  } = await vite.ssrLoadModule('/src/services/workspacePaths.js')

  await hashWorkspacePath(42)
  await resolveWorkspaceDataDir(false, ' workspace-id ')
  await resolveClaudeConfigDir(' /tmp/config/scribeflow ')
  await resolveSkillPath(' /tmp/project ', ' .project/skills/demo ')
  await normalizePathValue(17)

  assert.deepEqual(calls.map((call) => call.cmd), [
    'workspace_paths_hash',
    'workspace_paths_resolve_data_dir',
    'workspace_paths_resolve_claude_config_dir',
    'workspace_paths_resolve_skill_path',
    'workspace_paths_normalize_value',
  ])
  assert.deepEqual(calls[0].args.params, { value: 42 })
  assert.deepEqual(calls[1].args.params, {
    globalConfigDir: false,
    workspaceId: ' workspace-id ',
  })
  assert.deepEqual(calls[2].args.params, {
    globalConfigDir: ' /tmp/config/scribeflow ',
  })
  assert.deepEqual(calls[3].args.params, {
    projectDir: ' /tmp/project ',
    rawPath: ' .project/skills/demo ',
  })
  assert.deepEqual(calls[4].args.params, { value: 17 })

  console.log('workspace paths rust normalization probe passed')
} finally {
  clearTauriMocks()
  await vite.close()
}
