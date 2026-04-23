<template>
  <div class="image-preview-root">
    <div class="image-preview-toolbar">
      <div class="image-preview-meta">
        <span class="image-preview-label">{{ t('Image') }}</span>
        <span class="image-preview-name">{{ fileName }}</span>
      </div>
      <button type="button" class="image-preview-action" @click="handleOpenExternal">
        {{ t('Open externally') }}
      </button>
    </div>

    <div v-if="fileUrl" class="image-preview-stage">
      <img class="image-preview-media" :src="fileUrl" :alt="fileName" />
    </div>
    <div v-else class="image-preview-empty">
      <div>{{ t('Image preview unavailable.') }}</div>
      <div class="image-preview-empty-detail">
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
.image-preview-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--bg-primary);
}

.image-preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-secondary);
}

.image-preview-meta {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.image-preview-label {
  color: var(--fg-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.image-preview-name {
  min-width: 0;
  overflow: hidden;
  color: var(--fg-primary);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.image-preview-action {
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

.image-preview-action:hover {
  background: var(--bg-hover);
  color: var(--fg-primary);
}

.image-preview-stage {
  display: flex;
  flex: 1;
  min-height: 0;
  align-items: center;
  justify-content: center;
  padding: 24px;
  overflow: auto;
  background:
    radial-gradient(circle at top, color-mix(in srgb, var(--accent) 8%, transparent), transparent 45%),
    var(--bg-primary);
}

.image-preview-media {
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 14px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.18);
  background: white;
}

.image-preview-empty {
  display: flex;
  flex: 1;
  min-height: 0;
  align-items: center;
  justify-content: center;
  padding: 32px;
  color: var(--fg-secondary);
  text-align: center;
}

.image-preview-empty-detail {
  margin-top: 8px;
  color: var(--fg-muted);
  font-size: 12px;
}
</style>
