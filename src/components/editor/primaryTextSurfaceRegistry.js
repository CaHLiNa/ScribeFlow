import { defineAsyncComponent } from 'vue'
import { PRIMARY_TEXT_SURFACE_TARGETS } from '../../domains/editor/primaryTextSurfaceTargets'

const surfaceLoaders = Object.freeze({
  [PRIMARY_TEXT_SURFACE_TARGETS.WEB]: () => import('./TextEditor.vue'),
  [PRIMARY_TEXT_SURFACE_TARGETS.NATIVE_PRIMARY]: () => import('./NativePrimaryTextSurface.vue'),
})

const surfaceComponentCache = new Map()

export function resolvePrimaryTextSurfaceComponent(target = PRIMARY_TEXT_SURFACE_TARGETS.WEB) {
  const normalizedTarget = Object.values(PRIMARY_TEXT_SURFACE_TARGETS).includes(target)
    ? target
    : PRIMARY_TEXT_SURFACE_TARGETS.WEB

  const resolvedTarget = surfaceLoaders[normalizedTarget]
    ? normalizedTarget
    : PRIMARY_TEXT_SURFACE_TARGETS.WEB

  if (!surfaceComponentCache.has(resolvedTarget)) {
    surfaceComponentCache.set(
      resolvedTarget,
      defineAsyncComponent(surfaceLoaders[resolvedTarget])
    )
  }

  return {
    target: resolvedTarget,
    component: surfaceComponentCache.get(resolvedTarget),
  }
}
