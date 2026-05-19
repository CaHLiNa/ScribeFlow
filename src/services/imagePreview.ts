import { invokeCommand as invoke } from './tauriBridge.ts'

export async function renderImagePreview(path, maxSize = 1600) {
  return invoke('workspace_render_image_preview', {
    path,
    maxSize,
  })
}
