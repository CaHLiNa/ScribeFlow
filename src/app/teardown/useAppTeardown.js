import { onUnmounted } from 'vue'
import { shutdownOpencodeSidecar } from '../../services/ai/opencodeSidecar'

export function useAppTeardown({
  cleanupAppShellLayout,
  workspace,
  filesStore,
  reviews,
  linksStore,
  commentsStore,
  referencesStore,
  researchArtifactsStore,
}) {
  onUnmounted(() => {
    cleanupAppShellLayout()
    workspace.cleanup()
    filesStore.cleanup()
    reviews.cleanup()
    linksStore.cleanup()
    void import('../../stores/chat.js').then(({ useChatStore }) => {
      useChatStore().cleanup()
    })
    commentsStore.cleanup()
    referencesStore.cleanup()
    researchArtifactsStore.cleanup()
    void shutdownOpencodeSidecar()
  })
}
