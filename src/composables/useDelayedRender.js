import { onBeforeUnmount, ref, watch } from 'vue'

export function useDelayedRender(source, options = {}) {
  const delayMs = Number.isFinite(Number(options.delayMs)) ? Number(options.delayMs) : 260
  const rendered = ref(false)
  let closeTimer = null

  function clearCloseTimer() {
    if (closeTimer === null) return
    globalThis.clearTimeout?.(closeTimer)
    closeTimer = null
  }

  watch(
    source,
    (isActive) => {
      if (isActive) {
        clearCloseTimer()
        rendered.value = true
        return
      }

      if (!rendered.value) return
      clearCloseTimer()
      closeTimer = globalThis.setTimeout?.(() => {
        closeTimer = null
        rendered.value = false
      }, delayMs) ?? null

      if (closeTimer === null) {
        rendered.value = false
      }
    },
    { immediate: true }
  )

  onBeforeUnmount(() => {
    clearCloseTimer()
  })

  return rendered
}
