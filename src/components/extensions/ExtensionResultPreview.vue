<template>
  <section v-if="entry" class="extension-result-preview">
    <div class="extension-result-preview__header">
      <div class="extension-result-preview__title-wrap">
        <div class="extension-result-preview__eyebrow">{{ t('Preview') }}</div>
        <div class="extension-result-preview__title">
          {{ t(previewPresentation.previewTitleKey) }}
        </div>
      </div>
      <div v-if="previewPresentation.toolbarActions.length > 0" class="extension-result-preview__actions">
        <ExtensionBlockedActionButton
          v-for="action in previewPresentation.toolbarActions"
          :key="action.id"
          :blocked="action.blocked"
          :loading="isActionBusy(action.entry)"
          :blocked-label="t(action.blockedLabelKey)"
          :blocked-message="t(action.blockedMessageKey, action.blockedMessageParams)"
          :label="t(action.labelKey)"
          :title="t(action.labelKey)"
          @click="$emit('run-action', action.entry)"
        />
      </div>
    </div>

    <div v-if="previewPresentation.isPdfPreview" class="extension-result-preview__body">
      <PdfArtifactPreview
        pane-id="extension-preview"
        :source-path="previewPresentation.previewPath"
        :artifact-path="previewPresentation.previewPath"
        kind="pdf"
        compact-toolbar
      />
    </div>

    <div v-else-if="previewPresentation.isImagePreview" class="extension-result-preview__body">
      <ImagePreviewPane :file-path="previewPresentation.previewPath" />
    </div>

    <div v-else-if="previewPresentation.isHtmlPreview" class="extension-result-preview__body">
      <iframe
        v-if="previewPresentation.htmlPreviewContent"
        class="extension-result-preview__html-frame"
        :srcdoc="previewPresentation.htmlPreviewContent"
        sandbox="allow-forms allow-modals allow-popups"
        referrerpolicy="no-referrer"
      ></iframe>
      <HtmlPreviewPane v-else :file-path="previewPresentation.previewPath" />
    </div>

    <div v-else-if="previewPresentation.isTextPreview" class="extension-result-preview__body extension-result-preview__body--text">
      <div v-if="textPreviewLoading" class="extension-result-preview__empty">
        {{ t('Loading text preview...') }}
      </div>
      <pre v-else class="extension-result-preview__text">{{ textPreviewContent }}</pre>
    </div>

    <div
      v-else-if="previewPresentation.emptyState?.kind === 'actionable'"
      class="extension-result-preview__empty extension-result-preview__empty--actionable"
    >
      <div class="extension-result-preview__empty-title">{{ t(previewPresentation.emptyState.titleKey) }}</div>
      <div class="extension-result-preview__empty-copy">{{ t(previewPresentation.emptyState.bodyKey) }}</div>
    </div>

    <div v-else class="extension-result-preview__empty">
      {{ t(previewPresentation.emptyState?.titleKey || 'Preview unavailable for this result entry.') }}
    </div>
  </section>
</template>

<script setup>
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { useI18n } from '../../i18n'
import { readWorkspaceTextFile } from '../../services/fileStoreIO'
import { readExtensionArtifactText } from '../../services/extensions/extensionArtifacts'
import { loadExtensionTextPreviewContent } from '../../services/extensions/extensionTextPreview'
import { useExtensionsStore } from '../../stores/extensions'
import {
  actionKeyForResultEntry,
  buildExtensionResultPreviewPresentation,
} from '../../domains/extensions/extensionResultPreviewPresentation.js'
import ExtensionBlockedActionButton from './ExtensionBlockedActionButton.vue'

const PdfArtifactPreview = defineAsyncComponent(() => import('../editor/PdfArtifactPreview.vue'))
const ImagePreviewPane = defineAsyncComponent(() => import('../editor/ImagePreviewPane.vue'))
const HtmlPreviewPane = defineAsyncComponent(() => import('../editor/HtmlPreviewPane.vue'))

const props = defineProps({
  entry: { type: Object, default: null },
  busyActionKey: { type: String, default: '' },
})

defineEmits(['run-action'])

const { t } = useI18n()
const extensionsStore = useExtensionsStore()

const textPreviewLoading = ref(false)
const textPreviewContent = ref('')
const hostDiagnostics = computed(() => {
  const extensionId = String(props.entry?.extensionId || props.entry?.extension_id || '').trim().toLowerCase()
  return extensionId ? extensionsStore.hostDiagnosticsFor(extensionId) : {}
})
const previewPresentation = computed(() =>
  buildExtensionResultPreviewPresentation(props.entry || {}, {
    hostDiagnostics: hostDiagnostics.value,
  })
)

async function loadTextPreview() {
  textPreviewContent.value = previewPresentation.value.inlineText
  if (!previewPresentation.value.isTextPreview) return
  if (textPreviewContent.value) return
  if (!previewPresentation.value.previewPath) return
  textPreviewLoading.value = true
  try {
    textPreviewContent.value = await loadExtensionTextPreviewContent({
      inlineText: previewPresentation.value.inlineText,
      previewPath: previewPresentation.value.previewPath,
      maxBytes: 4000,
      readWorkspaceText: readWorkspaceTextFile,
      readArtifactText: readExtensionArtifactText,
    })
  } finally {
    textPreviewLoading.value = false
  }
}

onMounted(() => {
  void loadTextPreview()
})

watch(
  () => [
    previewPresentation.value.previewPath,
    previewPresentation.value.previewMode,
    previewPresentation.value.inlineText,
  ],
  () => {
    void loadTextPreview()
  },
)

function isActionBusy(entry = {}) {
  return actionKeyForResultEntry(entry) === String(props.busyActionKey || '').trim()
}
</script>

<style scoped>
.extension-result-preview {
  container-type: inline-size;
  display: flex;
  min-height: 220px;
  max-height: min(520px, 70vh);
  flex-direction: column;
  gap: 10px;
  border: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--surface-base) 86%, transparent);
  padding: 10px;
}

.extension-result-preview__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.extension-result-preview__actions {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  flex: 0 1 auto;
}

.extension-result-preview__title-wrap {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.extension-result-preview__eyebrow {
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.extension-result-preview__title {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.extension-result-preview__body {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  overflow: hidden;
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface-base) 92%, transparent);
}

.extension-result-preview__body--text {
  border: 1px solid color-mix(in srgb, var(--border) 35%, transparent);
  background: color-mix(in srgb, var(--surface-base) 90%, transparent);
}

.extension-result-preview__empty--actionable {
  align-items: flex-start;
  justify-content: center;
  gap: 4px;
  min-height: 180px;
  border: 1px dashed color-mix(in srgb, var(--border) 36%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface-base) 92%, transparent);
  padding: 14px;
}

.extension-result-preview__empty-title {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.extension-result-preview__empty-copy {
  color: var(--text-muted);
  font-size: 11px;
}

.extension-result-preview__body :deep(.pdf-artifact-preview-host),
.extension-result-preview__body :deep(.image-preview-root),
.extension-result-preview__body :deep(.html-preview-root) {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.extension-result-preview__html-frame {
  width: 100%;
  min-height: 0;
  flex: 1 1 auto;
  border: 0;
  background: white;
}

.extension-result-preview__text {
  margin: 0;
  width: 100%;
  min-height: 0;
  padding: 12px;
  overflow: auto;
  color: var(--text-primary);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.extension-result-preview__empty {
  display: flex;
  min-height: 180px;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 12px;
  text-align: center;
}

@container (max-width: 360px) {
  .extension-result-preview__header {
    flex-direction: column;
  }

  .extension-result-preview__actions {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
