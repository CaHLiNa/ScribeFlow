<template>
  <div class="h-full flex flex-col overflow-hidden">
    <div class="flex-1 overflow-hidden">
      <PdfViewer
        v-if="hasPdf"
        :key="pdfReloadKey"
        :filePath="pdfPath"
        :paneId="paneId"
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
          <div v-else-if="!typstStore.available && typstStore.lastCompilerCheckAt">
            {{ t('Typst compiler not available yet.') }}
          </div>
          <div v-else>
            {{ t('No PDF yet — click Compile in the .typ tab') }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useTypstStore } from '../../stores/typst'
import { useI18n } from '../../i18n'
import PdfViewer from './PdfViewer.vue'

const props = defineProps({
  filePath: { type: String, required: true },
  paneId: { type: String, required: true },
})

const typstStore = useTypstStore()
const { t } = useI18n()

const typPath = computed(() => props.filePath.replace(/\.pdf$/i, '.typ'))
const state = computed(() => typstStore.stateForFile(typPath.value))
const compileStatus = computed(() => state.value?.status || null)
const pdfPath = computed(() => state.value?.pdfPath || props.filePath)
const hasPdf = ref(false)
const pdfReloadKey = ref(0)

async function checkPdfExists() {
  try {
    hasPdf.value = await invoke('path_exists', { path: pdfPath.value })
  } catch {
    hasPdf.value = false
  }
}

function handleCompileDone(event) {
  if (event.detail?.typPath !== typPath.value) return
  pdfReloadKey.value += 1
  checkPdfExists()
}

onMounted(() => {
  typstStore.checkCompiler()
  window.addEventListener('typst-compile-done', handleCompileDone)
  checkPdfExists()
})

onUnmounted(() => {
  window.removeEventListener('typst-compile-done', handleCompileDone)
})
</script>
