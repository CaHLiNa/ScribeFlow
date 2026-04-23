<template>
  <div class="html-preview-root">
    <div class="html-preview-toolbar">
      <div class="html-preview-meta">
        <span class="html-preview-label">{{ t('HTML preview') }}</span>
        <span class="html-preview-name">{{ fileName }}</span>
      </div>
      <button type="button" class="html-preview-action" @click="handleOpenExternal">
        {{ t('Open externally') }}
      </button>
    </div>

    <iframe
      v-if="fileUrl"
      class="html-preview-frame"
      :src="fileUrl"
      sandbox="allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
      referrerpolicy="no-referrer"
    ></iframe>
    <div v-else class="html-preview-empty">
      <div>{{ t('HTML preview unavailable.') }}</div>
      <div class="html-preview-empty-detail">
        {{ t('This preview requires the desktop runtime workspace protocol.') }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { basenamePath } from '../../utils/path'
import { toWorkspaceProtocolUrl } from '../../utils/workspaceProtocol'
import { openLocalPath } from '../../services/localFileOpen'
import { isTauriDesktopRuntime } from '../../app/browserPreview/routes'
import { useI18n } from '../../i18n'

const props = defineProps({
  filePath: { type: String, required: true },
})

const workspace = useWorkspaceStore()
const { t } = useI18n()

const fileName = computed(() => basenamePath(props.filePath) || props.filePath)
const fileUrl = computed(() =>
  (isTauriDesktopRuntime()
    ? toWorkspaceProtocolUrl(props.filePath, workspace, {
        version: fileName.value,
      })
    : '')
)

function handleOpenExternal() {
  void openLocalPath(props.filePath)
}
</script>

<style scoped>
.html-preview-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--bg-primary);
}

.html-preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-secondary);
}

.html-preview-meta {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.html-preview-label {
  color: var(--fg-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.html-preview-name {
  min-width: 0;
  overflow: hidden;
  color: var(--fg-primary);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.html-preview-action {
  flex: none;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--fg-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.html-preview-action:hover {
  background: var(--bg-hover);
  color: var(--fg-primary);
}

.html-preview-frame {
  display: block;
  flex: 1;
  width: 100%;
  min-height: 0;
  border: 0;
  background: white;
}

.html-preview-empty {
  display: flex;
  flex: 1;
  min-height: 0;
  align-items: center;
  justify-content: center;
  padding: 32px;
  color: var(--fg-secondary);
  text-align: center;
}

.html-preview-empty-detail {
  margin-top: 8px;
  color: var(--fg-muted);
  font-size: 12px;
}
</style>
