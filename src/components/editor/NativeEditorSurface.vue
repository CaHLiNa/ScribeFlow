<template>
  <div class="native-editor-surface">
    <div class="native-editor-card">
      <div class="native-editor-eyebrow">{{ t('Experimental native runtime') }}</div>
      <h3 class="native-editor-title">{{ fileLabel }}</h3>
      <p class="native-editor-copy">
        {{
          t(
            'Altals is currently routing this text pane through the experimental Rust-native editor path. This build does not yet embed the native editor UI back into the workbench, so this surface shows runtime status while the helper process runs out-of-process.'
          )
        }}
      </p>

      <div class="native-editor-grid">
        <div class="native-editor-stat">
          <div class="native-editor-stat-label">{{ t('Runtime mode') }}</div>
          <div class="native-editor-stat-value">{{ runtimeModeLabel }}</div>
        </div>

        <div class="native-editor-stat">
          <div class="native-editor-stat-label">{{ t('Helper status') }}</div>
          <div
            class="native-editor-stat-value"
            :class="{ 'is-active': editorRuntimeStore.nativeRuntimeConnected }"
          >
            {{ helperStatusLabel }}
          </div>
        </div>

        <div class="native-editor-stat">
          <div class="native-editor-stat-label">{{ t('Session') }}</div>
          <div class="native-editor-stat-mono">
            {{ editorRuntimeStore.lastNativeSessionId || t('Not started') }}
          </div>
        </div>

        <div class="native-editor-stat">
          <div class="native-editor-stat-label">{{ t('Protocol') }}</div>
          <div class="native-editor-stat-mono">
            {{ editorRuntimeStore.nativeProtocolVersion || 0 }}
          </div>
        </div>

        <div class="native-editor-stat">
          <div class="native-editor-stat-label">{{ t('Mirrored content') }}</div>
          <div class="native-editor-stat-mono">
            {{
              t('{count} chars', {
                count: currentContent.length,
              })
            }}
          </div>
        </div>
      </div>

      <div class="native-editor-section">
        <div class="native-editor-section-label">{{ t('Latest helper event') }}</div>
        <div v-if="latestNativeEvent" class="native-editor-event">
          <span class="native-editor-pill">{{ latestNativeEvent.kind || t('Unknown') }}</span>
          <span class="native-editor-event-copy">{{ formatNativeEvent(latestNativeEvent) }}</span>
        </div>
        <div v-else class="native-editor-empty">
          {{ t('No helper events yet. Keep this mode enabled and open a text file to initialize the native runtime.') }}
        </div>
      </div>

      <div class="native-editor-section">
        <div class="native-editor-section-label">{{ t('Current file preview') }}</div>
        <pre class="native-editor-preview">{{ previewText }}</pre>
        <div class="native-editor-actions native-editor-actions--save">
          <button
            type="button"
            class="native-editor-action native-editor-action--secondary"
            :disabled="!canSaveDocument"
            @click="saveNativeDocument"
          >
            {{ savingDocument ? t('Saving...') : t('Save to Altals document') }}
          </button>
          <span class="native-editor-muted">
            {{ saveStatusText || t('Writes the current native state back into the main Altals document buffer and file path.') }}
          </span>
        </div>
      </div>

      <div class="native-editor-section">
        <div class="native-editor-section-label">{{ t('Native edit smoke test') }}</div>
        <p class="native-editor-helper-copy">
          {{
            t(
              'This does not edit the main Altals document yet. It sends replacement text into the Rust-native helper so we can verify the first user-edit round trip.'
            )
          }}
        </p>
        <textarea
          v-model="editDraft"
          class="native-editor-input"
          :placeholder="t('Type replacement text for the native helper here...')"
        ></textarea>
        <div class="native-editor-actions">
          <button
            type="button"
            class="native-editor-action"
            :disabled="!canSubmitEdit"
            @click="submitNativeEdit"
          >
            {{ submittingEdit ? t('Sending...') : t('Send edit to native helper') }}
          </button>
          <span class="native-editor-muted">
            {{ submitStatusText }}
          </span>
        </div>
      </div>

      <div class="native-editor-section">
        <div class="native-editor-section-label">{{ t('Native session documents') }}</div>
        <div v-if="nativeDocuments.length" class="native-editor-doc-list">
          <div
            v-for="document in nativeDocuments"
            :key="document.path"
            class="native-editor-doc-item"
            :class="{ 'is-active': document.path === props.filePath }"
          >
            <div class="native-editor-doc-head">
              <span class="native-editor-pill">{{ document.path === props.filePath ? t('Active') : t('Open') }}</span>
              <span class="native-editor-doc-title">{{ shortPath(document.path) }}</span>
            </div>
            <div class="native-editor-doc-meta">
              {{
                t('{count} chars', {
                  count: document.textLength || 0,
                })
              }}
            </div>
          </div>
        </div>
        <div v-else class="native-editor-empty">
          {{ t('The native helper has not reported any mirrored documents yet.') }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue'
import { useFilesStore } from '../../stores/files'
import { useEditorStore } from '../../stores/editor'
import { useEditorRuntimeStore, EDITOR_RUNTIME_MODES } from '../../stores/editorRuntime'
import {
  createEditorRuntimeContract,
  emitEditorRuntimeTelemetry,
} from '../../domains/editor/editorRuntimeContract'
import { useI18n } from '../../i18n'

const props = defineProps({
  filePath: { type: String, required: true },
  paneId: { type: String, required: true },
})

defineEmits(['cursor-change', 'editor-stats', 'selection-change'])

const filesStore = useFilesStore()
const editorStore = useEditorStore()
const editorRuntimeStore = useEditorRuntimeStore()
const { t } = useI18n()
let editorRuntimeHandle = null
let nativeRuntimeActive = false

const currentContent = computed(() => String(filesStore.fileContents[props.filePath] || ''))
const fileLabel = computed(() => props.filePath.split('/').pop() || props.filePath)
const helperStatusLabel = computed(() => {
  if (editorRuntimeStore.nativeRuntimeConnected) return t('Connected')
  if (editorRuntimeStore.wantsNativeRuntime) return t('Starting or idle')
  return t('Off')
})
const runtimeModeLabel = computed(() =>
  editorRuntimeStore.mode === EDITOR_RUNTIME_MODES.NATIVE_EXPERIMENTAL
    ? t('Native experimental')
    : t('Web with native shadow')
)
const editDraft = ref('')
const submittingEdit = ref(false)
const submitStatusText = ref('')
const savingDocument = ref(false)
const saveStatusText = ref('')
const latestNativeEvent = computed(() => editorRuntimeStore.lastNativeRuntimeEvent || null)
const nativeDocuments = computed(() => Object.values(editorRuntimeStore.nativeDocuments || {}))
const activeNativeDocument = computed(
  () => editorRuntimeStore.nativeDocuments?.[props.filePath] || null
)
const canSubmitEdit = computed(
  () =>
    editorRuntimeStore.nativeRuntimeConnected &&
    !submittingEdit.value &&
    String(editDraft.value || '') !==
      String(activeNativeDocument.value?.textPreview || currentContent.value || '')
)
const previewText = computed(() => {
  const text =
    activeNativeDocument.value?.text ||
    activeNativeDocument.value?.textPreview ||
    currentContent.value
  if (!text) return t('This file is currently empty.')
  return text.length > 800 ? `${text.slice(0, 800)}\n…` : text
})
const currentDocumentText = computed(
  () => String(activeNativeDocument.value?.text || currentContent.value || '')
)
const canSaveDocument = computed(
  () =>
    !savingDocument.value &&
    !!props.filePath &&
    (editorStore.isFileDirty(props.filePath) || filesStore.isDraftFile?.(props.filePath))
)

watch(
  () => props.filePath,
  async (filePath) => {
    if (!filePath || filesStore.isDraftFile?.(filePath) || typeof filesStore.fileContents[filePath] === 'string') {
      return
    }
    const content = await filesStore.readFile(filePath).catch(() => '')
    if (typeof content === 'string') {
      filesStore.setInMemoryFileContent(filePath, content)
    }
  },
  { immediate: true },
)

watch(
  [activeNativeDocument, currentContent],
  ([nativeDocument, fallbackContent]) => {
    editDraft.value = String(nativeDocument?.text || nativeDocument?.textPreview || fallbackContent || '')
  },
  { immediate: true },
)

function getCurrentDocumentText() {
  return String(activeNativeDocument.value?.text || filesStore.fileContents[props.filePath] || '')
}

async function persistNativeDocument() {
  const currentText = getCurrentDocumentText()

  if (filesStore.isDraftFile?.(props.filePath)) {
    const selectedPath = await filesStore.promptAndSaveDraft(props.filePath, currentText)
    if (!selectedPath) return false
    editorStore.updateFilePath(props.filePath, selectedPath)
    editorStore.clearFileDirty(selectedPath)
    emitEditorRuntimeTelemetry({
      type: 'document-save',
      runtimeKind: 'native-experimental',
      paneId: props.paneId,
      filePath: selectedPath,
      draftPromoted: true,
    })
    await editorRuntimeStore.syncShadowDocument({
      path: selectedPath,
      text: currentText,
    }).catch(() => null)
    return true
  }

  const saved = await filesStore.saveFile(props.filePath, currentText)
  if (!saved) return false
  editorStore.clearFileDirty(props.filePath)
  emitEditorRuntimeTelemetry({
    type: 'document-save',
    runtimeKind: 'native-experimental',
    paneId: props.paneId,
    filePath: props.filePath,
    textLength: currentText.length,
  })
  return true
}

function buildNativeRuntimeHandle() {
  return createEditorRuntimeContract({
    runtimeKind: 'native-experimental',
    paneId: props.paneId,
    filePath: props.filePath,
    getContent: getCurrentDocumentText,
    persistContent: persistNativeDocument,
    applyExternalContent: async (nextContent = '') => {
      filesStore.setInMemoryFileContent(props.filePath, String(nextContent || ''))
      await editorRuntimeStore.syncShadowDocument({
        path: props.filePath,
        text: String(nextContent || ''),
      }).catch(() => null)
      return true
    },
    requestSelection: () => null,
    revealOffset: () => false,
    revealRange: () => false,
    setDiagnostics: (diagnostics = []) => {
      emitEditorRuntimeTelemetry({
        type: 'diagnostics-update',
        runtimeKind: 'native-experimental',
        paneId: props.paneId,
        filePath: props.filePath,
        diagnosticsCount: Array.isArray(diagnostics) ? diagnostics.length : 0,
      })
      return true
    },
    setOutlineContext: (context = null) => {
      emitEditorRuntimeTelemetry({
        type: 'outline-context-update',
        runtimeKind: 'native-experimental',
        paneId: props.paneId,
        filePath: props.filePath,
        hasContext: !!context,
      })
      return true
    },
  })
}

function activateNativeRuntime() {
  if (!editorRuntimeHandle || nativeRuntimeActive) return
  nativeRuntimeActive = true
  editorStore.registerEditorRuntime(props.paneId, props.filePath, editorRuntimeHandle)
  emitEditorRuntimeTelemetry({
    type: 'document-open',
    runtimeKind: 'native-experimental',
    paneId: props.paneId,
    filePath: props.filePath,
  })
}

function deactivateNativeRuntime() {
  if (!nativeRuntimeActive) return
  nativeRuntimeActive = false
  editorStore.unregisterEditorRuntime(props.paneId, props.filePath)
  emitEditorRuntimeTelemetry({
    type: 'document-close',
    runtimeKind: 'native-experimental',
    paneId: props.paneId,
    filePath: props.filePath,
  })
}

function formatNativeEvent(event = {}) {
  const kind = String(event.kind || '').trim()
  const path = String(event.path || '').trim()
  const reason = String(event.reason || '').trim()
  const message = String(event.message || '').trim()
  const textLength = Number(event.textLength ?? -1)

  if (kind === 'documentOpened') {
    return path
      ? t('Opened {path} ({count} chars)', {
          path,
          count: Number.isFinite(textLength) && textLength >= 0 ? textLength : 0,
        })
      : t('Document opened')
  }

  if (kind === 'contentChanged') {
    return path
      ? t('Updated {path} via {reason} ({count} chars)', {
          path,
          reason: reason || t('unknown'),
          count: Number.isFinite(textLength) && textLength >= 0 ? textLength : 0,
        })
      : t('Document content changed')
  }

  if (kind === 'ready') return t('Helper signaled ready')
  if (kind === 'pong') return t('Helper responded to health check')
  if (kind === 'stopped') return t('Helper stopped cleanly')
  if (kind === 'error') return message || t('Helper reported an error')
  if (message) return message
  if (path) return path
  return t('No extra details')
}

function shortPath(path = '') {
  const normalized = String(path || '')
  const segments = normalized.split('/').filter(Boolean)
  if (segments.length <= 2) return normalized || t('Untitled')
  return `${segments.slice(-2).join('/')}`
}

async function submitNativeEdit() {
  if (!canSubmitEdit.value) return
  submittingEdit.value = true
  submitStatusText.value = ''

  try {
    await editorRuntimeStore.replaceNativeDocumentText({
      path: props.filePath,
      text: editDraft.value,
    })
    submitStatusText.value = t('Edit sent to helper.')
  } catch (error) {
    submitStatusText.value =
      error instanceof Error ? error.message : t('Failed to send edit to helper.')
  } finally {
    submittingEdit.value = false
  }
}

async function saveNativeDocument() {
  if (!canSaveDocument.value) return
  savingDocument.value = true
  saveStatusText.value = ''

  try {
    const saved = await persistNativeDocument()
    saveStatusText.value = saved ? t('Saved to the main Altals document.') : t('Save cancelled.')
  } catch (error) {
    saveStatusText.value =
      error instanceof Error ? error.message : t('Failed to save the main document.')
  } finally {
    savingDocument.value = false
  }
}

onMounted(() => {
  editorRuntimeHandle = buildNativeRuntimeHandle()
  activateNativeRuntime()
})

onActivated(() => {
  activateNativeRuntime()
})

onDeactivated(() => {
  deactivateNativeRuntime()
})

onUnmounted(() => {
  deactivateNativeRuntime()
  editorRuntimeHandle = null
})
</script>

<style scoped>
.native-editor-surface {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  padding: 20px;
  background: var(--shell-editor-surface);
  overflow: auto;
}

.native-editor-card {
  width: min(880px, 100%);
  margin: 0 auto;
  padding: 18px 18px 20px;
  border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
  border-radius: 18px;
  background: color-mix(in srgb, var(--surface-elevated, var(--surface-secondary)) 82%, transparent);
  box-shadow: 0 14px 36px color-mix(in srgb, black 8%, transparent);
}

.native-editor-eyebrow {
  color: var(--accent);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.native-editor-title {
  margin: 6px 0 0;
  color: var(--text-primary);
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.native-editor-copy {
  margin: 10px 0 0;
  color: var(--text-secondary);
  font-size: var(--ui-font-size, 13px);
  line-height: 1.55;
}

.native-editor-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 12px;
  margin-top: 16px;
}

.native-editor-stat {
  min-width: 0;
}

.native-editor-stat-label,
.native-editor-section-label {
  color: var(--text-muted);
  font-size: var(--ui-font-label, 12px);
  line-height: 1.3;
  margin-bottom: 4px;
}

.native-editor-stat-value {
  color: var(--text-secondary);
  font-size: var(--ui-font-size, 13px);
  font-weight: 600;
}

.native-editor-stat-value.is-active {
  color: var(--accent);
}

.native-editor-stat-mono {
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: var(--ui-font-code, 12px);
  word-break: break-word;
}

.native-editor-section {
  margin-top: 16px;
}

.native-editor-event {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 6px;
}

.native-editor-pill {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
  font-size: 11px;
  font-weight: 700;
}

.native-editor-event-copy,
.native-editor-empty {
  color: var(--text-secondary);
  font-size: var(--ui-font-size, 13px);
  line-height: 1.45;
}

.native-editor-preview {
  margin: 6px 0 0;
  padding: 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-secondary) 72%, transparent);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.native-editor-helper-copy {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: var(--ui-font-size, 13px);
  line-height: 1.45;
}

.native-editor-input {
  display: block;
  width: 100%;
  min-height: 140px;
  margin-top: 8px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-secondary) 72%, transparent);
  color: var(--text-primary);
  font: inherit;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.5;
  resize: vertical;
}

.native-editor-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.native-editor-action {
  min-height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: 10px;
  background: var(--accent);
  color: var(--bg-primary, #111);
  font: inherit;
  font-size: var(--ui-font-size, 13px);
  font-weight: 700;
  cursor: pointer;
}

.native-editor-action--secondary {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent);
}

.native-editor-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.native-editor-muted {
  color: var(--text-muted);
  font-size: var(--ui-font-label, 12px);
}

.native-editor-doc-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 6px;
}

.native-editor-doc-item {
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-secondary) 52%, transparent);
}

.native-editor-doc-item.is-active {
  border-color: color-mix(in srgb, var(--accent) 36%, var(--border) 64%);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}

.native-editor-doc-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.native-editor-doc-title {
  color: var(--text-primary);
  font-size: var(--ui-font-size, 13px);
  font-weight: 600;
}

.native-editor-doc-meta {
  margin-top: 4px;
  color: var(--text-muted);
  font-size: var(--ui-font-label, 12px);
}
</style>
