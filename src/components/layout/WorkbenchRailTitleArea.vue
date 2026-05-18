<template>
  <div class="workbench-rail-center">
    <div class="workbench-rail-title-target">
      <div
        v-show="railTitleState.showReferenceTitle"
        ref="workspaceTitleWrapRef"
        class="workbench-rail-workspace-title"
        data-window-drag-ignore="true"
      >
        <button
          type="button"
          class="workbench-rail-workspace-title-button"
          :title="t('Reference Library')"
          :aria-label="t('Reference Library')"
          :aria-expanded="workspaceMenuOpen ? 'true' : 'false'"
          @click="$emit('toggle-workspace-menu')"
        >
          <span class="workbench-rail-workspace-title-label">{{ t('Reference Library') }}</span>
          <svg
            class="workbench-rail-workspace-title-chevron"
            width="13"
            height="13"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
            aria-hidden="true"
          >
            <path d="M4.5 6.5 8 10l3.5-3.5" />
          </svg>
        </button>

        <div v-if="workspaceMenuOpen" class="workbench-mode-menu">
          <div class="workbench-mode-menu-section-label">{{ t('Workspace') }}</div>

          <button
            v-for="item in workspaceModeItems"
            :key="item.id"
            type="button"
            class="workbench-mode-menu-item"
            :class="{ 'is-active': item.active }"
            @click="$emit('select-workbench-panel', item.id)"
          >
            <span class="workbench-mode-menu-glyph" aria-hidden="true">
              <svg
                v-if="item.active"
                class="workbench-mode-menu-check"
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M2.25 6.1 4.8 8.6 9.75 3.6" />
              </svg>
            </span>
            <span class="workbench-mode-menu-label">{{ item.label }}</span>
          </button>
        </div>
      </div>

      <div
        v-show="railTitleState.showDocumentTitleSlot"
        :id="documentTitleTargetId"
        class="workbench-rail-title-slot"
      ></div>
      <div
        v-if="railTitleState.showInlineDocumentTitle"
        class="workbench-rail-document-title"
        :title="railTitleState.documentTitleLabel"
        :aria-label="railTitleState.documentTitleLabel"
      >
        <span class="workbench-rail-document-title-label">{{ railTitleState.documentTitleLabel }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from '../../i18n'

defineEmits(['select-workbench-panel', 'toggle-workspace-menu'])

defineProps({
  documentTitleTargetId: { type: String, default: 'app-shell-topbar-document-title' },
  railTitleState: {
    type: Object,
    default: () => ({
      documentTitleLabel: '',
      showDocumentTitleSlot: true,
      showInlineDocumentTitle: false,
      showReferenceTitle: false,
    }),
  },
  workspaceMenuOpen: { type: Boolean, default: false },
  workspaceModeItems: { type: Array, default: () => [] },
})

const { t } = useI18n()
const workspaceTitleWrapRef = ref(null)

defineExpose({
  containsWorkspaceTitleTarget(target) {
    return Boolean(workspaceTitleWrapRef.value?.contains(target))
  },
})
</script>

<style scoped>
.workbench-rail-center {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  width: min(520px, calc(100% - 220px));
  min-width: 0;
  pointer-events: auto;
  transform: translate(-50%, -50%);
}

.workbench-rail-title-target {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 24px;
  min-width: 0;
  max-width: min(440px, 100%);
  overflow: visible;
  pointer-events: auto;
}

.workbench-rail-title-slot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-width: 0;
}

.workbench-rail-document-title {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  max-width: 100%;
  min-width: 0;
  min-height: 26px;
  padding: 0 8px;
  border-radius: 8px;
  background: transparent;
  box-shadow: none;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.25;
  user-select: none;
  -webkit-user-select: none;
}

.workbench-rail-document-title-label {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workbench-rail-workspace-title {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  max-width: 100%;
}

.workbench-rail-workspace-title-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  max-width: 100%;
  min-height: 26px;
  padding: 0 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: color-mix(in srgb, var(--text-primary) 92%, transparent);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.workbench-rail-workspace-title-button:hover {
  background: color-mix(in srgb, var(--surface-hover) 10%, transparent);
}

.workbench-rail-workspace-title-label {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workbench-rail-workspace-title-chevron {
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
  color: var(--text-muted);
}

.workbench-mode-menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  z-index: 30;
  width: min(220px, calc(100vw - 32px));
  padding: 5px;
  border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface-raised) 85%, transparent);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04);
  backdrop-filter: blur(24px) saturate(1.5);
  transform: translateX(-50%);
}

:global(.theme-light) .workbench-mode-menu {
  background: rgba(255, 255, 255, 0.85);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.04);
}

.workbench-mode-menu-section-label {
  padding: 4px 9px 5px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
}

.workbench-mode-menu-item {
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 26px;
  padding: 0 10px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.workbench-mode-menu-item:hover {
  background: var(--surface-hover);
}

.workbench-mode-menu-item.is-active {
  font-weight: 600;
}

.workbench-mode-menu-glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 12px;
  color: var(--text-secondary);
}

.workbench-mode-menu-label {
  min-width: 0;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 920px) {
  .workbench-rail-center {
    width: min(420px, calc(100% - 180px));
  }
}

@media (max-width: 720px) {
  .workbench-rail-center {
    width: min(320px, calc(100% - 148px));
  }
}
</style>
