<template>
  <div class="docx-review-shell">
    <div class="docx-review-summary">
      <span class="docx-review-title">
        {{ changeCount > 0
          ? t(changeCount === 1 ? '{count} tracked change' : '{count} tracked changes', { count: changeCount })
          : t('Review tools ready') }}
      </span>
      <span v-if="roundTripSummary" class="docx-review-subtitle">
        {{ t('{count} features detected', { count: roundTripSummary.presentCount }) }}
        <template v-if="roundTripSummary.partialCount > 0"> · {{ t('{count} partial support', { count: roundTripSummary.partialCount }) }}</template>
        <template v-if="roundTripSummary.riskCount > 0"> · {{ t('{count} risk items', { count: roundTripSummary.riskCount }) }}</template>
      </span>
    </div>

    <div class="docx-review-actions">
      <button v-if="changeCount > 0" class="review-bar-btn review-bar-accept" @click="acceptAll">{{ t('Accept All') }}</button>
      <button v-if="changeCount > 0" class="review-bar-btn review-bar-reject" @click="rejectAll">{{ t('Reject All') }}</button>
      <button class="review-bar-btn" @click="openRoundTripPanel">{{ t('Round-trip Check') }}</button>
      <button class="review-bar-btn" @click="openVersionDiff">{{ t('Version Diff') }}</button>
      <button class="review-bar-btn" @click="exportVariant('clean')">{{ t('Export Clean') }}</button>
      <button class="review-bar-btn" @click="exportVariant('review')">{{ t('Export Review') }}</button>
    </div>
  </div>

  <Teleport to="body">
    <div v-if="showRoundTripPanel" class="docx-review-overlay" @click.self="showRoundTripPanel = false">
      <div class="docx-review-dialog">
        <div class="docx-review-dialog-header">
          <div>
            <div class="docx-review-dialog-title">{{ t('DOCX Round-trip Check') }}</div>
            <div class="docx-review-dialog-subtitle">{{ t('Support levels are explicit so unsupported features are visible before export.') }}</div>
          </div>
          <button class="docx-review-close" @click="showRoundTripPanel = false">×</button>
        </div>

        <div v-if="roundTripLoading" class="docx-review-empty">{{ t('Inspecting DOCX structure...') }}</div>
        <div v-else-if="!roundTripSummary" class="docx-review-empty">{{ t('No round-trip report available yet.') }}</div>
        <div v-else class="docx-review-grid">
          <div v-for="feature in roundTripSummary.features" :key="feature.id" class="docx-review-row">
            <div class="docx-review-row-main">
              <span class="docx-review-chip" :class="chipClass(feature.support)">{{ supportLabel(feature.support) }}</span>
              <span class="docx-review-feature">{{ t(feature.label) }}</span>
            </div>
            <div class="docx-review-row-detail">
              {{ feature.present ? t('Detected in current document') : t('Not detected in current document') }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import { trackChangesHelpers } from 'superdoc'
import { useEditorStore } from '../../stores/editor'
import { useToastStore } from '../../stores/toast'
import { blobToBase64 } from '../../utils/docxBridge'
import { analyzeDocxRoundTrip } from '../../services/docxRoundTrip'
import { useI18n } from '../../i18n'

const props = defineProps({
  filePath: { type: String, required: true },
  paneId: { type: String, required: true },
})

const editorStore = useEditorStore()
const toastStore = useToastStore()
const changeCount = ref(0)
const showRoundTripPanel = ref(false)
const roundTripLoading = ref(false)
const roundTripSummary = ref(null)
const { t } = useI18n()

let editorUnsubscribe = null

onMounted(() => {
  wireEditor()
  void inspectRoundTrip()
})

onUnmounted(() => {
  unwireEditor()
})

watch(() => props.filePath, () => {
  unwireEditor()
  wireEditor()
  void inspectRoundTrip()
})

function getSuperdoc() {
  return editorStore.getSuperdoc(props.paneId, props.filePath)
}

function wireEditor() {
  const sd = getSuperdoc()
  const ed = sd?.activeEditor
  if (!ed) {
    const timer = setTimeout(() => wireEditor(), 500)
    editorUnsubscribe = () => clearTimeout(timer)
    return
  }
  const handler = () => updateChangeCount()
  ed.on('update', handler)
  editorUnsubscribe = () => ed.off('update', handler)
  updateChangeCount()
}

function unwireEditor() {
  editorUnsubscribe?.()
  editorUnsubscribe = null
}

function updateChangeCount() {
  const sd = getSuperdoc()
  const ed = sd?.activeEditor
  if (!ed) {
    changeCount.value = 0
    return
  }
  try {
    const changes = trackChangesHelpers.getTrackChanges(ed.state)
    changeCount.value = Array.isArray(changes) ? changes.length : 0
  } catch {
    changeCount.value = 0
  }
}

async function inspectRoundTrip() {
  roundTripLoading.value = true
  try {
    const base64 = await invoke('read_file_base64', { path: props.filePath })
    roundTripSummary.value = await analyzeDocxRoundTrip(base64)
  } catch (error) {
    console.warn('DOCX round-trip inspection failed:', error)
    roundTripSummary.value = null
  } finally {
    roundTripLoading.value = false
  }
}

function openRoundTripPanel() {
  showRoundTripPanel.value = true
  if (!roundTripSummary.value && !roundTripLoading.value) {
    void inspectRoundTrip()
  }
}

function chipClass(level) {
  return `docx-review-chip-${level}`
}

function supportLabel(level) {
  if (level === 'stable') return t('Stable support')
  if (level === 'partial') return t('Partial support')
  if (level === 'risk') return t('Risky support')
  return t('Unknown support')
}

function openVersionDiff() {
  window.dispatchEvent(new CustomEvent('open-version-history', {
    detail: { path: props.filePath },
  }))
}

function buildSuggestedExportPath(kind = 'clean') {
  const suffix = kind === 'clean' ? '-clean.docx' : '-review.docx'
  return props.filePath.replace(/\.docx$/i, suffix)
}

async function exportVariant(kind = 'clean') {
  const sd = getSuperdoc()
  if (!sd) return

  const targetPath = await save({
    defaultPath: buildSuggestedExportPath(kind),
    filters: [{ name: 'Word Document', extensions: ['docx'] }],
  })
  if (!targetPath) return

  try {
    const blob = await sd.export({
      exportType: ['docx'],
      triggerDownload: false,
      isFinalDoc: kind === 'clean',
      commentsType: kind === 'clean' ? 'clean' : 'external',
    })
    const base64 = await blobToBase64(blob)
    await invoke('write_file_base64', { path: targetPath, data: base64 })
    toastStore.showOnce(`docx-export:${kind}:${props.filePath}`, t('Exported {kind} version to {file}', {
      kind: kind === 'clean' ? t('clean') : t('review'),
      file: targetPath.split('/').pop(),
    }), {
      type: 'success',
      duration: 4000,
    })
  } catch (error) {
    toastStore.showOnce(`docx-export:${kind}:${props.filePath}:error`, t('DOCX export failed: {error}', {
      error: error?.message || String(error || ''),
    }), {
      type: 'error',
      duration: 5000,
    })
  }
}

function acceptAll() {
  const sd = getSuperdoc()
  if (!sd?.activeEditor) return
  try {
    sd.activeEditor.commands?.acceptAllTrackedChanges?.()
    updateChangeCount()
  } catch (e) {
    console.warn('Accept all tracked changes failed:', e)
  }
}

function rejectAll() {
  const sd = getSuperdoc()
  if (!sd?.activeEditor) return
  try {
    sd.activeEditor.commands?.rejectAllTrackedChanges?.()
    updateChangeCount()
  } catch (e) {
    console.warn('Reject all tracked changes failed:', e)
  }
}
</script>

<style scoped>
.docx-review-shell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 10px;
  background: rgba(224, 175, 104, 0.08);
  border-bottom: 1px solid var(--border);
}

.docx-review-summary {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.docx-review-title {
  font-size: var(--ui-font-caption);
  color: var(--warning);
  font-weight: 600;
}

.docx-review-subtitle {
  font-size: var(--ui-font-micro);
  color: var(--fg-muted);
}

.docx-review-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}

.review-bar-btn {
  border: 1px solid var(--border);
  background: var(--bg-primary);
  color: var(--fg-primary);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: var(--ui-font-micro);
  cursor: pointer;
}

.review-bar-accept {
  color: var(--success, #50fa7b);
}

.review-bar-reject {
  color: var(--error, #f7768e);
}

.docx-review-overlay {
  position: fixed;
  inset: 0;
  z-index: 10010;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.38);
}

.docx-review-dialog {
  width: min(760px, calc(100vw - 32px));
  max-height: min(80vh, 720px);
  overflow: auto;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
}

.docx-review-dialog-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.docx-review-dialog-title {
  font-size: var(--ui-font-body);
  font-weight: 700;
  color: var(--fg-primary);
}

.docx-review-dialog-subtitle {
  margin-top: 4px;
  font-size: var(--ui-font-caption);
  color: var(--fg-muted);
}

.docx-review-close {
  border: none;
  background: none;
  color: var(--fg-muted);
  font-size: 24px;
  cursor: pointer;
}

.docx-review-grid {
  display: grid;
  gap: 10px;
}

.docx-review-row {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--bg-secondary);
}

.docx-review-row-main {
  display: flex;
  align-items: center;
  gap: 10px;
}

.docx-review-row-detail {
  margin-top: 6px;
  font-size: var(--ui-font-micro);
  color: var(--fg-muted);
}

.docx-review-feature {
  font-size: var(--ui-font-label);
  color: var(--fg-primary);
  font-weight: 600;
}

.docx-review-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: var(--ui-font-micro);
  font-weight: 600;
}

.docx-review-chip-stable {
  background: rgba(80, 250, 123, 0.14);
  color: var(--success, #50fa7b);
}

.docx-review-chip-partial {
  background: rgba(226, 185, 61, 0.14);
  color: var(--warning, #e2b93d);
}

.docx-review-chip-risk {
  background: rgba(247, 118, 142, 0.14);
  color: var(--error, #f7768e);
}

.docx-review-empty {
  padding: 20px 0;
  text-align: center;
  color: var(--fg-muted);
  font-size: var(--ui-font-caption);
}
</style>
