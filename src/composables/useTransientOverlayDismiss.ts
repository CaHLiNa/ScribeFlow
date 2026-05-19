import { onMounted, onUnmounted } from 'vue'
import {
  broadcastTransientOverlayDismiss,
  createTransientOverlaySource,
  listenForTransientOverlayDismiss,
} from '../services/transientOverlayBus'

export function useTransientOverlayDismiss(scope = 'overlay', onDismiss = () => {}) {
  const dismissOverlaySourceId = createTransientOverlaySource(scope)
  let removeDismissListener = null
  let disposed = false

  onMounted(() => {
    disposed = false
    void listenForTransientOverlayDismiss(dismissOverlaySourceId, () => {
      onDismiss?.()
    }).then((cleanup) => {
      if (disposed) {
        void cleanup?.()
        return
      }
      removeDismissListener = cleanup
    })
  })

  onUnmounted(() => {
    disposed = true
    const cleanup = removeDismissListener
    removeDismissListener = null
    void cleanup?.()
  })

  function dismissOtherTransientOverlays() {
    void broadcastTransientOverlayDismiss(dismissOverlaySourceId)
  }

  return {
    dismissOtherTransientOverlays,
    dismissOverlaySourceId,
  }
}
