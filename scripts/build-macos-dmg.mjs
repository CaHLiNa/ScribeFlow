import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

function fail(message) {
  console.error(message)
  process.exit(1)
}

function run(command, args, options = {}) {
  const stdio = options.capture || options.stdoutToStderr
    ? ['inherit', 'pipe', 'pipe']
    : 'inherit'
  const result = spawnSync(command, args, {
    stdio,
    cwd: options.cwd || repoRoot,
    encoding: 'utf8',
  })
  if (options.stdoutToStderr) {
    if (result.stdout) process.stderr.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
  }
  if (result.status !== 0) {
    const stderr = result.stderr?.trim()
    const stdout = result.stdout?.trim()
    fail(stderr || stdout || `Command failed: ${command} ${args.join(' ')}`)
  }
  return result.stdout?.trim() || ''
}

function getArg(flag) {
  const index = process.argv.indexOf(flag)
  if (index === -1) return null
  return process.argv[index + 1] || null
}

function ensureMacOS() {
  if (process.platform !== 'darwin') {
    fail('build-macos-dmg.mjs can only run on macOS.')
  }
}

function readTauriConfig() {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, 'src-tauri', 'tauri.conf.json'), 'utf8'))
}

function archLabelFromTarget(target) {
  if (target?.includes('aarch64')) return 'aarch64'
  if (target?.includes('x86_64')) return 'x64'
  return process.arch === 'arm64' ? 'aarch64' : 'x64'
}

function defaultAppPath(target, productName) {
  const parts = [repoRoot, 'src-tauri', 'target']
  if (target) parts.push(target)
  parts.push('release', 'bundle', 'macos', `${productName}.app`)
  return path.join(...parts)
}

function defaultDmgPath(target, productName, version) {
  const parts = [repoRoot, 'src-tauri', 'target']
  if (target) parts.push(target)
  parts.push('release', 'bundle', 'dmg', `${productName}_${version}_${archLabelFromTarget(target)}.dmg`)
  return path.join(...parts)
}

function buildFixScript(productName) {
  const appBundle = `${productName}.app`
  return `#!/bin/bash
set -euo pipefail

APP_NAME="${appBundle}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

TARGETS=(
  "/Applications/$APP_NAME"
  "$HOME/Applications/$APP_NAME"
  "$SCRIPT_DIR/$APP_NAME"
)

fixed_any=0

for target in "\${TARGETS[@]}"; do
  if [ -e "$target" ]; then
    echo "Removing quarantine attribute from: $target"
    xattr -dr com.apple.quarantine "$target" || true
    fixed_any=1
  fi
done

if [ "$fixed_any" -eq 0 ]; then
  echo "Could not find $APP_NAME next to this script or in /Applications."
  exit 1
fi

echo
echo "Done. Try opening $APP_NAME again."

if [ -e "/Applications/$APP_NAME" ]; then
  open "/Applications/$APP_NAME" || true
elif [ -e "$SCRIPT_DIR/$APP_NAME" ]; then
  open "$SCRIPT_DIR/$APP_NAME" || true
fi
`
}

function main() {
  ensureMacOS()

  const target = getArg('--target')
  const config = readTauriConfig()
  const productName = config.productName || 'Altals'
  const version = config.version
  const appPath = path.resolve(getArg('--app-path') || defaultAppPath(target, productName))
  const outputPath = path.resolve(getArg('--output') || defaultDmgPath(target, productName, version))

  if (!fs.existsSync(appPath)) {
    fail(`App bundle not found: ${appPath}`)
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  if (fs.existsSync(outputPath)) {
    fs.rmSync(outputPath, { force: true })
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'altals-dmg-'))
  const stagingDir = path.join(tempRoot, 'staging')
  fs.mkdirSync(stagingDir, { recursive: true })

  const stagedAppPath = path.join(stagingDir, path.basename(appPath))
  const fixScriptPath = path.join(stagingDir, `Fix ${productName}.command`)

  try {
    run('cp', ['-R', appPath, stagedAppPath])
    run('ln', ['-s', '/Applications', path.join(stagingDir, 'Applications')])
    fs.writeFileSync(fixScriptPath, buildFixScript(productName), { mode: 0o755 })
    fs.chmodSync(fixScriptPath, 0o755)

    run('hdiutil', [
      'create',
      '-volname',
      productName,
      '-srcfolder',
      stagingDir,
      '-ov',
      '-format',
      'UDZO',
      outputPath,
    ], { stdoutToStderr: true })
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }

  console.log(outputPath)
}

main()
