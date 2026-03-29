export async function openLocalPath(path) {
  const targetPath = String(path || '').trim()
  if (!targetPath) return false

  const { open } = await import('@tauri-apps/plugin-shell')
  await open(targetPath)
  return true
}
