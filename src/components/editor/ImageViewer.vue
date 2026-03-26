<template>
  <div class="image-viewer h-full flex flex-col overflow-hidden">
    <!-- Toolbar -->
    <div class="image-viewer-toolbar">
      <UiButton
        class="image-viewer-toolbar-btn"
        variant="secondary"
        size="icon-sm"
        icon-only
        :title="t('Zoom out')"
        :aria-label="t('Zoom out')"
        @click="zoomOut"
        >−</UiButton
      >
      <span class="image-viewer-zoom-value">{{ Math.round(zoom * 100) }}%</span>
      <UiButton
        class="image-viewer-toolbar-btn"
        variant="secondary"
        size="icon-sm"
        icon-only
        :title="t('Zoom in')"
        :aria-label="t('Zoom in')"
        @click="zoomIn"
        >+</UiButton
      >
      <UiButton
        class="image-viewer-toolbar-btn"
        variant="secondary"
        size="sm"
        :title="t('Reset to actual size')"
        @click="resetView"
        >{{ isZh ? '适配' : 'Fit' }}</UiButton
      >
      <span class="image-viewer-toolbar-separator">|</span>
      <span v-if="naturalSize" class="image-viewer-toolbar-meta">{{ naturalSize }}</span>
      <span v-if="error" class="image-viewer-toolbar-error">{{ error }}</span>
    </div>

    <!-- Image viewport -->
    <div
      ref="viewport"
      class="image-viewer-viewport flex-1 overflow-hidden relative"
      @mousedown="startPan"
      @wheel="handleWheel"
      @dblclick="resetView"
    >
      <img
        v-if="dataUrl"
        ref="imgEl"
        :src="dataUrl"
        class="image-viewer-image absolute select-none"
        :style="{ transform: `translate(${panX}px, ${panY}px) scale(${zoom})` }"
        draggable="false"
        @load="onImgLoad"
      />
      <div
        v-else-if="loading"
        class="image-viewer-loading flex items-center justify-center h-full text-sm"
      >
        {{ t('Loading image...') }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, onMounted, onUnmounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { getMimeType } from '../../utils/fileTypes'
import { useI18n } from '../../i18n'
import UiButton from '../shared/ui/UiButton.vue'

const props = defineProps({
  filePath: { type: String, required: true },
  paneId: { type: String, required: true },
})

const { t, isZh } = useI18n()
const viewport = ref(null)
const imgEl = ref(null)
const dataUrl = ref(null)
const zoom = ref(1)
const panX = ref(0)
const panY = ref(0)
const naturalSize = ref('')
const loading = ref(true)
const error = ref(null)

let isPanning = false
let panStartX = 0
let panStartY = 0
let startPanX = 0
let startPanY = 0

onMounted(async () => {
  try {
    const base64 = await invoke('read_file_base64', { path: props.filePath })
    const mime = getMimeType(props.filePath)
    dataUrl.value = `data:${mime};base64,${base64}`
    loading.value = false
  } catch (e) {
    error.value = e.toString()
    loading.value = false
  }
})

async function onImgLoad() {
  if (!imgEl.value || !viewport.value) return
  const w = imgEl.value.naturalWidth
  const h = imgEl.value.naturalHeight
  naturalSize.value = `${w} × ${h}`
  await nextTick()
  // Default to 1:1 (top-left corner visible)
  zoom.value = 1
  panX.value = 0
  panY.value = 0
}

function resetView() {
  zoom.value = 1
  panX.value = 0
  panY.value = 0
}

function zoomIn() {
  zoomBy(1.25)
}

function zoomOut() {
  zoomBy(0.8)
}

function zoomBy(factor) {
  if (!viewport.value) return
  const vw = viewport.value.clientWidth
  const vh = viewport.value.clientHeight
  // Zoom towards center
  const cx = vw / 2
  const cy = vh / 2
  const newZoom = Math.max(0.01, Math.min(zoom.value * factor, 20))
  panX.value = cx - (cx - panX.value) * (newZoom / zoom.value)
  panY.value = cy - (cy - panY.value) * (newZoom / zoom.value)
  zoom.value = newZoom
}

function handleWheel(e) {
  e.preventDefault()
  const factor = e.deltaY < 0 ? 1.1 : 0.9
  const rect = viewport.value.getBoundingClientRect()
  const cx = e.clientX - rect.left
  const cy = e.clientY - rect.top
  const newZoom = Math.max(0.01, Math.min(zoom.value * factor, 20))
  panX.value = cx - (cx - panX.value) * (newZoom / zoom.value)
  panY.value = cy - (cy - panY.value) * (newZoom / zoom.value)
  zoom.value = newZoom
}

function startPan(e) {
  if (e.button !== 0) return
  isPanning = true
  panStartX = e.clientX
  panStartY = e.clientY
  startPanX = panX.value
  startPanY = panY.value
  viewport.value.style.cursor = 'grabbing'
  document.addEventListener('mousemove', onPanMove)
  document.addEventListener('mouseup', stopPan)
}

function onPanMove(e) {
  if (!isPanning) return
  panX.value = startPanX + (e.clientX - panStartX)
  panY.value = startPanY + (e.clientY - panStartY)
}

function stopPan() {
  isPanning = false
  if (viewport.value) viewport.value.style.cursor = 'grab'
  document.removeEventListener('mousemove', onPanMove)
  document.removeEventListener('mouseup', stopPan)
}

onUnmounted(() => {
  document.removeEventListener('mousemove', onPanMove)
  document.removeEventListener('mouseup', stopPan)
})
</script>

<style scoped>
.image-viewer-toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3);
  border-bottom: 1px solid var(--border);
  background: var(--bg-secondary);
  color: var(--fg-secondary);
}

.image-viewer-toolbar-btn {
  flex-shrink: 0;
}

.image-viewer-zoom-value {
  min-width: 3em;
  text-align: center;
  color: var(--text-secondary);
  font-size: var(--ui-font-caption);
  font-variant-numeric: tabular-nums;
}

.image-viewer-toolbar-separator,
.image-viewer-toolbar-meta {
  color: var(--text-muted);
  font-size: var(--ui-font-caption);
}

.image-viewer-toolbar-separator {
  margin: 0 var(--space-2);
}

.image-viewer-toolbar-error {
  margin-left: auto;
  color: var(--error);
  font-size: var(--ui-font-caption);
}

.image-viewer-viewport {
  cursor: grab;
}

.image-viewer-image {
  transform-origin: 0 0;
  image-rendering: auto;
}

.image-viewer-loading {
  color: var(--text-muted);
}
</style>
