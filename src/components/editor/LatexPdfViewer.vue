<template>
  <div class="h-full flex flex-col overflow-hidden">
    <!-- PDF viewer -->
    <div class="flex-1 overflow-hidden">
      <PdfViewer
        v-if="hasPdf"
        ref="pdfViewerRef"
        :key="pdfReloadKey"
        :filePath="pdfPath"
        :paneId="paneId"
        :toolbar-target-selector="toolbarTargetSelector"
        @dblclick-page="handleBackwardSync"
      />
      <div v-else class="flex items-center justify-center h-full" style="color: var(--fg-muted);">
        <div class="text-center text-sm">
          <div v-if="compileStatus === 'compiling'">
            {{ t('Compiling…') }}
          </div>
          <div v-else-if="compileStatus === 'error'">
            <div>{{ t('Compilation failed — see Terminal.') }}</div>
            <div class="mt-1 text-xs">{{ t('Diagnostics are shown in Terminal.') }}</div>
          </div>
          <div v-else-if="!latexStore.hasAvailableCompiler">
            {{ t('No LaTeX compiler configured. Choose one in Settings > System.') }}
          </div>
          <div v-else>
            {{ t('No PDF yet — click Compile in the .tex tab') }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useLatexStore } from '../../stores/latex'
import { useI18n } from '../../i18n'
import PdfViewer from './PdfViewer.vue'

const props = defineProps({
  filePath: { type: String, required: true }, // The .pdf path
  paneId: { type: String, required: true },
  toolbarTargetSelector: { type: String, default: '' },
})

const latexStore = useLatexStore()
const { t } = useI18n()

// Derive .tex path from .pdf path
const texPath = computed(() => {
  return props.filePath.replace(/\.pdf$/, '.tex')
})

const state = computed(() => latexStore.stateForFile(texPath.value))
const compileStatus = computed(() => state.value?.status || null)
const pdfPath = computed(() => state.value?.pdfPath || props.filePath)
const hasPdf = ref(false)

const pdfViewerRef = ref(null)
const pdfReloadKey = ref(0)

function handleBackwardSync({ page, x, y }) {
  const synctexPath = state.value?.synctexPath
  if (!synctexPath || !page) return

  invoke('synctex_backward', { synctexPath, page, x, y })
    .then(result => {
      if (result?.line) {
        window.dispatchEvent(new CustomEvent('latex-backward-sync', {
          detail: { file: result.file, line: result.line },
        }))
      }
    })
    .catch(() => {})
}

function handleCompileDone(e) {
  if (e.detail?.texPath === texPath.value) {
    pdfReloadKey.value++
    checkPdfExists()
  }
}

async function checkPdfExists() {
  try {
    hasPdf.value = await invoke('path_exists', { path: pdfPath.value })
  } catch {
    hasPdf.value = false
  }
}

// Forward sync: listen for cursor-response and invoke synctex_forward
function handleCursorResponse(e) {
  const { texPath: tp, line } = e.detail || {}
  if (tp !== texPath.value) return
  const synctexPath = state.value?.synctexPath
  if (!synctexPath) return

  invoke('synctex_forward', { synctexPath, texPath: texPath.value, line })
    .then(result => {
      if (result?.page) {
        pdfViewerRef.value?.scrollToLocation(result.page, result.x, result.y)
      }
    })
    .catch(() => {})
}

onMounted(() => {
  latexStore.checkCompilers()
  window.addEventListener('latex-compile-done', handleCompileDone)
  window.addEventListener('latex-cursor-response', handleCursorResponse)
  checkPdfExists()
})

onUnmounted(() => {
  window.removeEventListener('latex-compile-done', handleCompileDone)
  window.removeEventListener('latex-cursor-response', handleCursorResponse)
})
</script>
