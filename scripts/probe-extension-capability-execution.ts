import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

async function main() {
  const { stdout } = await execFileAsync(
    'cargo',
    [
      'test',
      '--manifest-path',
      'src-tauri/Cargo.toml',
      'extension_commands::tests::capability_registry_enables_runtime_capability_execution',
      '--',
      '--exact',
      '--nocapture',
    ],
    {
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024 * 8,
    },
  )

  if (!stdout.includes('test extension_commands::tests::capability_registry_enables_runtime_capability_execution ... ok')) {
    throw new Error('capability execution test did not pass with expected evidence')
  }

  console.log(JSON.stringify({
    ok: true,
    matched: 'extension_commands::tests::capability_registry_enables_runtime_capability_execution',
  }, null, 2))
}

void main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error?.message || String(error),
  }, null, 2))
  process.exitCode = 1
})
