<template>
  <div class="right-shell-sidebar" data-surface-context-guard="true">
    <KeepAlive :max="2">
      <ReferenceDetailPanel
        v-if="workspace.referenceDockOpen && workspace.leftSidebarPanel === 'references'"
        key="workspace-reference-detail"
        class="right-shell-pane"
      />
    </KeepAlive>
  </div>
</template>

<script setup>
import { defineAsyncComponent } from 'vue'
import { useWorkspaceStore } from '../../stores/workspace'

const ReferenceDetailPanel = defineAsyncComponent(() => import('../panel/ReferenceDetailPanel.vue'))

const workspace = useWorkspaceStore()
</script>

<style scoped>
.right-shell-sidebar {
  --sidebar-shell-top: 42px;
  --sidebar-shell-inline: 10px;
  --sidebar-shell-bottom: 10px;
  display: flex;
  flex-direction: column;
  position: relative;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  padding: var(--sidebar-shell-top) var(--sidebar-shell-inline) var(--sidebar-shell-bottom);
  border-left: 1px solid color-mix(in srgb, var(--border) 58%, transparent);
  background: color-mix(in srgb, var(--app-canvas) 88%, var(--surface-base) 12%);
  box-shadow: none;
}

.right-shell-pane {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  border-radius: 0;
  background: transparent;
}
</style>
