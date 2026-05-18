<template>
  <div
    class="app-shell-root flex flex-col h-screen w-screen overflow-hidden"
    :class="{
      'is-left-resizing': isLeftSidebarResizing,
      'is-right-resizing': isRightSidebarResizing,
      'is-shell-resizing': isLeftSidebarResizing || isRightSidebarResizing,
      'is-zen-mode': isZenMode,
    }"
  >
    <div class="app-shell-workspace flex flex-1 flex-col overflow-hidden">
      <WorkbenchRail
        v-if="isWorkspaceOpen"
        class="app-shell-topbar shrink-0"
        :current-document-label="currentDocumentLabel"
        :prefer-external-document-title="isWorkspaceSurface && leftSidebarPanel !== 'references'"
        :show-document-title-target="leftSidebarPanel !== 'references'"
        :left-sidebar-available="isWorkspaceSurface"
        :left-sidebar-open="leftSidebarVisible"
        :left-sidebar-panel="leftSidebarPanel"
        :right-sidebar-available="supportsRightSidebar"
        :right-sidebar-open="rightRailOpen"
        @select-workbench-panel="$emit('select-workbench-panel', $event)"
        @toggle-left-sidebar="$emit('toggle-left-sidebar')"
        @toggle-right-sidebar="$emit('toggle-right-sidebar')"
      />

      <div class="app-shell-workbench flex flex-1 overflow-hidden">
        <div
          class="app-shell-region app-shell-region-left shrink-0 overflow-hidden"
          :class="{
            'is-open': leftSidebarVisible,
            'is-collapsed': !leftSidebarVisible,
            'is-resizing': isLeftSidebarResizing,
            'is-workspace-left-region': isWorkspaceSurface,
          }"
          :style="{
            '--app-shell-sidebar-width': `${leftSidebarWidth}px`,
            width: leftSidebarVisible ? `${leftSidebarWidth}px` : '0px',
          }"
        >
          <div
            class="app-shell-sidebar app-shell-sidebar-left shrink-0 overflow-hidden"
            :class="{
              'is-open': leftSidebarVisible,
              'is-collapsed': !leftSidebarVisible,
              'is-resizing': isLeftSidebarResizing,
            }"
            data-sidebar="left"
            :aria-hidden="leftSidebarVisible ? 'false' : 'true'"
            :style="{ width: 'var(--app-shell-sidebar-width)' }"
          >
            <slot name="left-sidebar"></slot>
          </div>
        </div>

        <div
          class="app-shell-resize-slot"
          :class="{ 'is-visible': leftSidebarVisible, 'is-hidden': !leftSidebarVisible }"
        >
          <ResizeHandle
            class="app-shell-resize-handle app-shell-resize-handle-left"
            direction="vertical"
            @resize="$emit('left-resize', $event)"
            @resize-start="$emit('left-resize-start')"
            @resize-end="$emit('left-resize-end')"
          />
        </div>

        <div
          class="app-shell-region app-shell-region-main app-shell-main app-shell-main-shell flex-1 flex flex-col overflow-hidden"
        >
          <div
            class="app-shell-main-card flex-1 overflow-hidden relative"
            :class="{
              'has-left-sidebar': leftSidebarVisible,
              'has-right-sidebar': rightRailOpen,
              'is-workspace-surface-shell': isWorkspaceSurface,
              'is-empty-workspace-shell': !isWorkspaceOpen,
            }"
          >
            <slot name="main-workbench"></slot>
          </div>
        </div>
      </div>
    </div>

    <slot name="overlays"></slot>
  </div>
</template>

<script setup>
import ResizeHandle from './ResizeHandle.vue'
import WorkbenchRail from './WorkbenchRail.vue'

defineEmits([
  'left-resize',
  'left-resize-end',
  'left-resize-start',
  'select-workbench-panel',
  'toggle-left-sidebar',
  'toggle-right-sidebar',
])

defineProps({
  currentDocumentLabel: { type: String, default: '' },
  isLeftSidebarResizing: { type: Boolean, default: false },
  isRightSidebarResizing: { type: Boolean, default: false },
  isWorkspaceOpen: { type: Boolean, default: false },
  isWorkspaceSurface: { type: Boolean, default: false },
  isZenMode: { type: Boolean, default: false },
  leftSidebarPanel: { type: String, default: 'files' },
  leftSidebarVisible: { type: Boolean, default: false },
  leftSidebarWidth: { type: Number, default: 280 },
  rightRailOpen: { type: Boolean, default: false },
  supportsRightSidebar: { type: Boolean, default: false },
})
</script>

<style scoped>
.app-shell-root {
  background: var(--app-canvas);
  --shell-panel-motion-duration: 390ms;
  --shell-panel-fade-duration: 210ms;
  --shell-panel-surface-duration: 180ms;
  --shell-panel-motion-ease: cubic-bezier(0.3, 0, 0.2, 1);
  --inline-dock-motion-duration: var(--shell-panel-motion-duration);
  --inline-dock-fade-duration: var(--shell-panel-fade-duration);
  --inline-dock-surface-duration: var(--shell-panel-surface-duration);
  --inline-dock-motion-ease: var(--shell-panel-motion-ease);
}

.app-shell-workspace {
  position: relative;
  min-height: 0;
}

:global(html.is-tauri-macos) .app-shell-root,
:global(html.is-tauri-macos) .app-shell-workspace,
:global(html.is-tauri-macos) .app-shell-workbench {
  background: transparent !important;
  background-color: transparent !important;
}

.app-shell-topbar,
.app-shell-region-left,
.app-shell-region-right {
  transition:
    opacity var(--shell-panel-fade-duration) ease-out,
    width var(--shell-panel-motion-duration) var(--shell-panel-motion-ease);
}

.app-shell-root.is-zen-mode .app-shell-topbar:not(:hover),
.app-shell-root.is-zen-mode .app-shell-region-left:not(:hover),
.app-shell-root.is-zen-mode .app-shell-region-right:not(:hover) {
  opacity: 0.08;
  transition:
    opacity 1.5s ease-out 1.5s,
    width var(--shell-panel-motion-duration) var(--shell-panel-motion-ease);
}

.app-shell-topbar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 30;
  box-shadow: none;
}

.app-shell-workbench {
  min-height: 0;
  gap: 0;
  padding: 0;
  background: var(--app-canvas);
}

.app-shell-region {
  min-height: 0;
  min-width: 0;
}

.app-shell-region-left {
  background:
    linear-gradient(to bottom, var(--sidebar-glass-highlight), transparent 44%),
    var(--sidebar-glass-surface);
  border-right: 1px solid var(--sidebar-glass-border);
  box-shadow:
    inset -1px 0 0 var(--sidebar-glass-highlight),
    1px 0 16px var(--sidebar-glass-shadow);
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
  will-change: width;
}

.app-shell-region-left.is-workspace-left-region {
  background:
    linear-gradient(to bottom, var(--sidebar-glass-highlight), transparent 44%),
    var(--sidebar-glass-surface);
}

:global(html.is-tauri-macos.theme-dark) .app-shell-region-left,
:global(html.is-tauri-macos[data-theme-resolved='dark']) .app-shell-region-left {
  background:
    linear-gradient(to bottom, var(--sidebar-glass-highlight), transparent 44%),
    var(--sidebar-glass-surface);
  border-right-color: var(--sidebar-glass-border);
  box-shadow:
    inset -1px 0 0 var(--sidebar-glass-highlight),
    1px 0 16px var(--sidebar-glass-shadow);
}

.app-shell-region-main {
  background: transparent;
  overflow: visible;
}

.app-shell-region-right {
  background: transparent;
  will-change: width;
}

.app-shell-root.is-shell-resizing .app-shell-region-left,
.app-shell-root.is-shell-resizing .app-shell-region-right,
.app-shell-root.is-shell-resizing .app-shell-sidebar,
.app-shell-root.is-shell-resizing .app-shell-sidebar-left,
.app-shell-root.is-shell-resizing .app-shell-sidebar-right,
.app-shell-root.is-shell-resizing .app-shell-resize-slot,
.app-shell-root.is-shell-resizing .app-shell-resize-handle {
  transition: none !important;
}

.app-shell-root.is-shell-resizing .app-shell-main-card {
  transition: none !important;
}

.app-shell-root.is-shell-resizing .app-shell-main-card.has-left-sidebar {
  margin-left: 0;
  padding-left: 0;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}

.app-shell-sidebar {
  contain: layout paint;
  flex: 0 0 var(--app-shell-sidebar-width, 100%);
  min-width: var(--app-shell-sidebar-width, 100%);
  height: 100%;
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  will-change: opacity, transform;
  opacity: 1;
  transform: translateX(0);
  transition:
    opacity var(--shell-panel-fade-duration) ease,
    transform var(--shell-panel-motion-duration) var(--shell-panel-motion-ease),
    background-color var(--shell-panel-surface-duration) ease;
}

.app-shell-sidebar-left.is-collapsed {
  opacity: 1;
  transform: translateX(-6px);
}

.app-shell-sidebar-right.is-collapsed {
  opacity: 0;
  transform: translateX(10px);
}

.app-shell-sidebar-left {
  transition:
    transform var(--shell-panel-motion-duration) var(--shell-panel-motion-ease),
    background-color var(--shell-panel-surface-duration) ease;
}

.app-shell-sidebar-left.is-open,
.app-shell-sidebar-right.is-open {
  transition-delay: 8ms;
}

.app-shell-sidebar.is-collapsed {
  pointer-events: none;
}

.app-shell-sidebar.is-resizing {
  pointer-events: none;
  user-select: none;
  transition: none;
}

.app-shell-sidebar.is-resizing :deep(*) {
  transition: none !important;
}

.app-shell-main {
  min-width: 0;
}

.app-shell-main-shell {
  min-width: 220px;
}

.app-shell-main-card {
  min-width: 0;
  box-sizing: border-box;
  padding-top: 30px;
  border: none;
  border-radius: 0;
  background: var(--shell-editor-surface);
  box-shadow: none;
  overflow: hidden;
  z-index: 2;
  transition:
    margin-left var(--shell-panel-motion-duration) var(--shell-panel-motion-ease),
    padding-left var(--shell-panel-motion-duration) var(--shell-panel-motion-ease),
    margin-right var(--shell-panel-motion-duration) var(--shell-panel-motion-ease),
    padding-right var(--shell-panel-motion-duration) var(--shell-panel-motion-ease),
    border-radius var(--shell-panel-motion-duration) var(--shell-panel-motion-ease);
}

.app-shell-main-card.is-empty-workspace-shell {
  padding-top: 0;
}

.app-shell-main-card.is-workspace-surface-shell {
  padding-top: 36px;
}

.app-shell-main-card.has-left-sidebar {
  margin-left: 0;
  padding-left: 0;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}

.app-shell-main-card.has-right-sidebar {
  margin-right: 0;
  padding-right: 0;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.app-shell-resize-slot {
  flex: 0 0 auto;
  position: relative;
  z-index: 5;
  width: 0;
  overflow: visible;
  opacity: 0;
  transition:
    width var(--shell-panel-motion-duration) var(--shell-panel-motion-ease),
    opacity var(--shell-panel-surface-duration) ease;
}

.app-shell-resize-slot.is-visible {
  width: 0;
  opacity: 1;
  background: transparent;
}

.app-shell-resize-slot.is-hidden {
  pointer-events: none;
}

.app-shell-resize-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 8px;
  height: 100%;
  margin: 0;
}

.app-shell-resize-handle-left {
  left: -4px;
}

.app-shell-resize-handle-right {
  right: -14px;
}

@media (prefers-reduced-motion: reduce) {
  .app-shell-root {
    --shell-panel-motion-duration: 1ms;
    --shell-panel-fade-duration: 1ms;
    --shell-panel-surface-duration: 1ms;
  }
}
</style>
