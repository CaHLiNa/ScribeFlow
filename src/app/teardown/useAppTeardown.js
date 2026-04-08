import { onUnmounted } from 'vue'

export function useAppTeardown({
  cleanupAppShellLayout,
  workspace,
  filesStore,
  linksStore,
}) {
  onUnmounted(() => {
    cleanupAppShellLayout()
    workspace.cleanup()
    filesStore.cleanup()
    linksStore.cleanup()
  })
}
