import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

type TauriConfig = {
  app?: {
    windows?: Array<Record<string, unknown>>
  }
}

async function readJsonConfig(path: string) {
  return JSON.parse(await readFile(path, 'utf8')) as TauriConfig
}

function assertMacosChromeContract(path: string, config: TauriConfig) {
  const [windowConfig] = config.app?.windows ?? []
  assert.ok(windowConfig, `${path} must define the main window config`)
  assert.equal(
    windowConfig.titleBarStyle,
    'Transparent',
    `${path} must avoid Overlay titlebar style so WebView resize does not use the titlebar overlay geometry`,
  )
  assert.equal(
    windowConfig.decorations,
    true,
    `${path} must keep native decorations while using the transparent titlebar`,
  )
  assert.equal(
    windowConfig.transparent,
    false,
    `${path} must keep an opaque backing surface during live resize`,
  )
  assert.equal(
    windowConfig.backgroundColor,
    '#1E1E1E',
    `${path} must keep the native window background aligned with the app shell`,
  )
  assert.equal(
    Object.hasOwn(windowConfig, 'trafficLightPosition'),
    false,
    `${path} must not set trafficLightPosition because Tauri only supports it with Overlay`,
  )
}

const mainConfig = await readJsonConfig('src-tauri/tauri.conf.json')
const macosConfig = await readJsonConfig('src-tauri/tauri.macos.conf.json')
const macosShellSource = await readFile('src-tauri/src/macos_shell.rs', 'utf8')

assertMacosChromeContract('src-tauri/tauri.conf.json', mainConfig)
assertMacosChromeContract('src-tauri/tauri.macos.conf.json', macosConfig)

assert.doesNotMatch(
  macosShellSource,
  /FullSizeContentView|setStyleMask\s*\(/,
  'macOS shell sync must not override the Tauri Transparent titlebar geometry at runtime',
)
assert.match(
  macosShellSource,
  /setOpaque\(true\)/,
  'macOS shell sync must keep the native window backing layer opaque',
)
assert.match(
  macosShellSource,
  /setBackgroundColor\(Some\(&background\)\)/,
  'macOS shell sync must keep the native window background color explicit',
)

console.log('macOS window chrome contract probe passed')
