import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useWorkspaceStore } from './workspace'

export const useAiDrawerStore = defineStore('aiDrawer', () => {
  const view = ref('launcher')
  const sessionId = ref(null)
  const workspace = useWorkspaceStore()
  const open = computed(() => workspace.rightSidebarOpen)

  function openLauncher() {
    workspace.openRightSidebar()
    view.value = 'launcher'
    sessionId.value = null
  }

  function openSession(id) {
    if (!id) {
      openLauncher()
      return
    }
    workspace.openRightSidebar()
    view.value = 'chat'
    sessionId.value = id
  }

  function close() {
    workspace.closeRightSidebar()
  }

  function toggle(force = null) {
    const next = typeof force === 'boolean' ? force : !open.value
    if (!next) {
      close()
      return
    }
    openLauncher()
  }

  return {
    open,
    view,
    sessionId,
    openLauncher,
    openSession,
    close,
    toggle,
  }
})
