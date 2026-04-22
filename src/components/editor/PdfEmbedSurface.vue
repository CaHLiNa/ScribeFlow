<template>
  <div class="pdf-artifact-preview" :style="surfaceStyle">
    <div v-if="surfaceLoading" class="pdf-artifact-preview__state">
      {{ t('Loading PDF...') }}
    </div>

    <div v-else-if="surfaceError" class="pdf-artifact-preview__state">
      <div class="pdf-artifact-preview__error-title">{{ t('Preview failed') }}</div>
      <div class="pdf-artifact-preview__error-message">{{ surfaceError }}</div>
      <div class="pdf-artifact-preview__error-actions">
        <UiButton variant="secondary" size="sm" @click="reloadPdf">
          {{ t('Retry') }}
        </UiButton>
        <UiButton variant="secondary" size="sm" @click="$emit('open-external')">
          {{ t('Open PDF') }}
        </UiButton>
      </div>
    </div>

    <div v-else-if="engine && documentBuffer" class="pdf-artifact-preview__viewer-shell">
      <EmbedPDF :key="embedViewerKey" :engine="engine" :plugins="plugins">
        <template #default="{ activeDocumentId }">
          <div v-if="!activeDocumentId" class="pdf-artifact-preview__state">
            {{ t('Loading PDF...') }}
          </div>

          <DocumentContent
            v-else
            :document-id="activeDocumentId"
            v-slot="{ documentState, isLoading, isError, isLoaded }"
          >
            <div v-if="isLoading" class="pdf-artifact-preview__state">
              {{ t('Loading PDF...') }}
            </div>

            <div v-else-if="isError" class="pdf-artifact-preview__state">
              <div class="pdf-artifact-preview__error-title">{{ t('Preview failed') }}</div>
              <div class="pdf-artifact-preview__error-message">
                {{ documentState?.error?.message || t('Could not load PDF') }}
              </div>
            </div>

            <Viewport
              v-else-if="isLoaded"
              :document-id="activeDocumentId"
              class="pdf-artifact-preview__viewport"
            >
              <Scroller :document-id="activeDocumentId" v-slot="{ page }">
                <div
                  class="pdf-artifact-preview__page"
                  :style="{ width: `${page.width}px`, height: `${page.height}px` }"
                >
                  <RenderLayer :document-id="activeDocumentId" :page-index="page.pageIndex" />
                </div>
              </Scroller>
            </Viewport>
          </DocumentContent>
        </template>
      </EmbedPDF>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

import { EmbedPDF } from '@embedpdf/core/vue'
import { usePdfiumEngine } from '@embedpdf/engines/vue'
import { DocumentContent } from '@embedpdf/plugin-document-manager/vue'
import { RenderLayer } from '@embedpdf/plugin-render/vue'
import { Scroller } from '@embedpdf/plugin-scroll/vue'
import { Viewport } from '@embedpdf/plugin-viewport/vue'

import { useI18n } from '../../i18n'
import UiButton from '../shared/ui/UiButton.vue'
import { readPdfArtifactBase64 } from '../../services/pdf/artifactPreview.js'
import {
  buildEmbedPdfPluginRegistrations,
  decodePdfBase64ToArrayBuffer,
} from '../../services/pdf/embedPdfAdapter.js'
import { basenamePath } from '../../utils/path.js'

const props = defineProps({
  sourcePath: { type: String, required: true },
  artifactPath: { type: String, required: true },
  previewRevision: { type: Object, default: null },
  themeTokens: { type: Object, default: () => ({}) },
})

defineEmits(['open-external'])

const { t } = useI18n()
const { engine, isLoading: engineLoading, error: engineError } = usePdfiumEngine()

const documentBuffer = ref(null)
const documentName = ref('')
const previewLoadPending = ref(true)
const previewLoadError = ref('')
const embedViewerKey = ref(0)

const plugins = computed(() =>
  buildEmbedPdfPluginRegistrations({
    documentBuffer: documentBuffer.value,
    documentName: documentName.value,
  })
)

const surfaceStyle = computed(() => ({
  '--embedpdf-surface': String(
    props.themeTokens?.['--shell-preview-surface']
      || props.themeTokens?.['--shell-editor-surface']
      || '#141311'
  ).trim(),
  '--embedpdf-page': String(props.themeTokens?.['--surface-base'] || '#ffffff').trim(),
}))

const surfaceLoading = computed(() => previewLoadPending.value || engineLoading.value)
const surfaceError = computed(() => {
  if (previewLoadError.value) return previewLoadError.value
  return engineError.value?.message || ''
})

let loadToken = 0

async function loadPdfDocument() {
  const artifactPath = String(props.artifactPath || '').trim()
  loadToken += 1
  const currentToken = loadToken
  previewLoadPending.value = true
  previewLoadError.value = ''
  documentBuffer.value = null
  documentName.value = basenamePath(artifactPath) || 'document.pdf'

  if (!artifactPath) {
    previewLoadPending.value = false
    previewLoadError.value = t('Could not load PDF')
    return
  }

  try {
    const base64 = await readPdfArtifactBase64(artifactPath)
    if (currentToken !== loadToken) return

    documentBuffer.value = decodePdfBase64ToArrayBuffer(base64)
    embedViewerKey.value += 1
    previewLoadPending.value = false
  } catch (error) {
    if (currentToken !== loadToken) return
    previewLoadPending.value = false
    previewLoadError.value = error?.message || String(error || t('Could not load PDF'))
  }
}

function reloadPdf() {
  void loadPdfDocument()
}

watch(
  () => [props.artifactPath, props.previewRevision?.revisionKey || ''],
  () => {
    void loadPdfDocument()
  },
  { immediate: true }
)
</script>

<style scoped>
.pdf-artifact-preview {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--embedpdf-surface);
}

.pdf-artifact-preview__viewer-shell {
  width: 100%;
  height: 100%;
}

.pdf-artifact-preview__viewport {
  width: 100%;
  height: 100%;
  background: var(--embedpdf-surface);
}

.pdf-artifact-preview__page {
  margin: 12px auto;
  box-shadow: 0 10px 30px rgb(0 0 0 / 0.16);
  background: var(--embedpdf-page);
}

.pdf-artifact-preview__state {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  text-align: center;
  color: var(--text-secondary);
  background: var(--embedpdf-surface);
}

.pdf-artifact-preview__error-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.pdf-artifact-preview__error-message {
  max-width: min(420px, 100%);
  line-height: 1.5;
}

.pdf-artifact-preview__error-actions {
  display: flex;
  gap: 8px;
}
</style>
