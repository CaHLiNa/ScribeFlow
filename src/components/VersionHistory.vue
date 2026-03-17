<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="overlayEl"
      class="version-overlay"
      tabindex="-1"
      @click.self="$emit('close')"
      @keydown.esc="$emit('close')"
    >
      <div class="version-modal">
        <!-- Modal-level close button -->
        <button class="version-close-btn" @click="$emit('close')" :title="t('Close (Esc)')">
          <IconX :size="18" :stroke-width="1.5" />
        </button>

        <!-- Version list -->
        <div class="version-list">
          <div class="px-3 py-2 text-xs font-medium uppercase tracking-wider"
            style="color: var(--fg-muted); border-bottom: 1px solid var(--border);">
            {{ t('History: {fileName}', { fileName }) }}
          </div>
          <div v-if="loading" class="px-3 py-4 text-xs" style="color: var(--fg-muted);">
            {{ t('Loading...') }}
          </div>
          <div v-else-if="commits.length === 0" class="px-3 py-4 text-xs" style="color: var(--fg-muted);">
            {{ t('No history yet') }}
          </div>
          <div
            v-for="(commit, idx) in commits"
            :key="commit.hash"
            class="version-item"
            :class="{ active: idx === selectedIndex, 'version-item-named': isNamedSnapshot(commit.message) }"
            @click="selectVersion(idx)"
          >
            <div class="timestamp">{{ formatDisplayDate(commit.date) }}</div>
            <div class="message" :class="{ 'version-named-message': isNamedSnapshot(commit.message) }">
              <svg v-if="isNamedSnapshot(commit.message)" class="version-bookmark-icon" width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M3 1.5A1.5 1.5 0 014.5 0h7A1.5 1.5 0 0113 1.5v14a.5.5 0 01-.77.42L8 13.06l-4.23 2.86A.5.5 0 013 15.5V1.5z"/></svg>
              {{ commit.message }}
            </div>
          </div>
        </div>

        <!-- Preview -->
        <div class="version-preview">
          <div v-if="selectedCommit" class="version-preview-header">
            <div class="version-preview-headline">
              <span class="text-xs" style="color: var(--fg-muted);">
                {{ formatDisplayDate(selectedCommit.date) }}
                <span v-if="selectedCommit.message" style="margin-left: 8px; color: var(--fg-muted); opacity: 0.7;">
                  {{ selectedCommit.message }}
                </span>
              </span>
              <div v-if="isDocx" class="version-view-toggle">
                <button class="version-toggle-btn" :class="{ active: docxViewMode === 'diff' }" @click="docxViewMode = 'diff'">{{ t('Diff') }}</button>
                <button class="version-toggle-btn" :class="{ active: docxViewMode === 'preview' }" @click="docxViewMode = 'preview'">{{ t('Preview') }}</button>
              </div>
            </div>
          </div>

          <!-- Loading state -->
          <div v-if="previewLoading" class="version-empty-state">
            <div class="text-xs" style="color: var(--fg-muted);">{{ t('Loading preview...') }}</div>
          </div>
          <!-- Empty state -->
          <div v-else-if="!selectedCommit" class="version-empty-state">
            <div style="color: var(--fg-muted); font-size: var(--ui-font-body);">{{ t('Select a version to preview') }}</div>
            <div style="color: var(--fg-muted); opacity: 0.5; font-size: var(--ui-font-caption); margin-top: 6px;">
              {{ t('Click a commit on the left') }}
            </div>
          </div>
          <div
            v-if="selectedCommit && !previewLoading && isDocx && docxViewMode === 'diff'"
            class="version-docx-diff"
          >
            <div v-if="docxDiffBlocks.length === 0" class="version-empty-state">
              <div class="text-xs" style="color: var(--fg-muted);">{{ t('No paragraph-level differences found.') }}</div>
            </div>
            <div v-else class="version-docx-diff-list">
              <div v-for="(block, index) in docxDiffBlocks" :key="`${block.type}:${index}`" class="version-docx-diff-block" :class="`version-docx-diff-${block.type}`">
                <template v-if="block.type === 'insert'">
                  <div class="version-docx-diff-label">{{ t('Added paragraph') }}</div>
                  <div class="version-docx-diff-text">{{ block.after }}</div>
                </template>
                <template v-else-if="block.type === 'delete'">
                  <div class="version-docx-diff-label">{{ t('Removed paragraph') }}</div>
                  <div class="version-docx-diff-text">{{ block.before }}</div>
                </template>
                <template v-else>
                  <div class="version-docx-diff-label">{{ t('Replaced paragraph') }}</div>
                  <div class="version-docx-diff-compare">
                    <div class="version-docx-diff-side">
                      <span>{{ block.inline.beforePrefix }}</span><mark class="version-docx-mark-remove">{{ block.inline.beforeChanged }}</mark><span>{{ block.inline.beforeSuffix }}</span>
                    </div>
                    <div class="version-docx-diff-side">
                      <span>{{ block.inline.afterPrefix }}</span><mark class="version-docx-mark-add">{{ block.inline.afterChanged }}</mark><span>{{ block.inline.afterSuffix }}</span>
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </div>

          <!-- Preview content -->
          <div
            v-show="selectedCommit && !previewLoading && (!isDocx || docxViewMode === 'preview')"
            ref="previewContainer"
            class="flex-1 overflow-hidden"
            :class="{ 'version-docx-container': isDocx }"
          ></div>

          <!-- Action footer -->
          <div class="version-preview-footer">
            <button
              v-if="!isDocx"
              class="version-action-btn version-action-copy"
              :class="{ 'is-success': copyFeedback }"
              :disabled="!selectedCommit"
              @click="copyContent"
            >
              {{ copyFeedback ? t('Copied!') : t('Copy content') }}
            </button>
            <button
              class="version-action-btn version-action-restore"
              :disabled="!selectedCommit"
              @click="restoreVersion"
            >
              {{ t('Restore this version') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, shallowRef, markRaw, onUnmounted, nextTick } from 'vue'
import { IconX } from '@tabler/icons-vue'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { shouldersTheme, shouldersHighlighting } from '../editor/theme'
import { useWorkspaceStore } from '../stores/workspace'
import { useEditorStore } from '../stores/editor'
import { useFilesStore } from '../stores/files'
import { useToastStore } from '../stores/toast'
import { buildDocxParagraphDiff, extractDocxParagraphs } from '../services/docxRoundTrip'
import { gitLog, gitShow, gitShowBase64 } from '../services/git'
import { getViewerType } from '../utils/fileTypes'
import { base64ToFile } from '../utils/docxBridge'
import { formatFileError } from '../utils/errorMessages'
import { invoke } from '@tauri-apps/api/core'
import { ask } from '@tauri-apps/plugin-dialog'
import { useI18n, formatDate as formatLocaleDate } from '../i18n'

const props = defineProps({
  visible: { type: Boolean, default: false },
  filePath: { type: String, default: '' },
})

const emit = defineEmits(['close'])

const workspace = useWorkspaceStore()
const editorStore = useEditorStore()
const filesStore = useFilesStore()
const { t } = useI18n()
const previewContainer = ref(null)
const overlayEl = ref(null)

const loading = ref(false)
const previewLoading = ref(false)
const commits = ref([])
const selectedIndex = ref(-1)
const previewContent = ref('')
const copyFeedback = ref(false)
const docxViewMode = ref('diff')
const docxDiffBlocks = ref([])

let previewView = null // CodeMirror instance
let superdocInstance = null // SuperDoc instance
let copyTimer = null

const fileName = computed(() => props.filePath.split('/').pop())
const isDocx = computed(() => getViewerType(props.filePath) === 'docx')
const selectedCommit = computed(() =>
  selectedIndex.value >= 0 ? commits.value[selectedIndex.value] : null
)

function destroyPreview() {
  if (previewView) {
    previewView.destroy()
    previewView = null
  }
  if (superdocInstance) {
    superdocInstance.destroy()
    superdocInstance = null
  }
  // Clear any SuperDoc DOM remnants from the container
  if (previewContainer.value) {
    previewContainer.value.innerHTML = ''
  }
}

async function createMarkdownPreviewState(content) {
  const { markdown, markdownLanguage } = await import('@codemirror/lang-markdown')
  return EditorState.create({
    doc: content,
    extensions: [
      EditorView.editable.of(false),
      markdown({ base: markdownLanguage }),
      shouldersTheme,
      shouldersHighlighting,
    ],
  })
}

watch(() => props.visible, async (v) => {
  if (v && props.filePath) {
    await loadHistory()
    await nextTick()
    overlayEl.value?.focus()
  } else {
    commits.value = []
    selectedIndex.value = -1
    previewLoading.value = false
    docxDiffBlocks.value = []
    docxViewMode.value = 'diff'
    destroyPreview()
  }
})

watch(docxViewMode, async (mode) => {
  if (!isDocx.value || !selectedCommit.value) return
  if (mode === 'preview' || mode === 'diff') {
    await selectVersionDocx(selectedCommit.value)
  }
})

async function loadHistory() {
  if (!workspace.path) return
  loading.value = true
  try {
    commits.value = await gitLog(workspace.path, props.filePath)
    selectedIndex.value = -1
  } catch (e) {
    console.error('Failed to load history:', e)
    commits.value = []
  }
  loading.value = false
}

async function selectVersion(idx) {
  selectedIndex.value = idx
  const commit = commits.value[idx]
  if (!commit || !workspace.path) return

  previewLoading.value = true
  try {
    if (isDocx.value) {
      await selectVersionDocx(commit)
    } else {
      await selectVersionText(commit)
    }
  } catch (e) {
    console.error('Failed to show version:', e)
    previewContent.value = t('Could not load this version.')
    previewLoading.value = false
  }
}

async function selectVersionText(commit) {
  const content = await gitShow(workspace.path, commit.hash, props.filePath)
  docxDiffBlocks.value = []
  previewContent.value = content
  previewLoading.value = false

  await nextTick()
  if (previewContainer.value) {
    destroyPreview()

    const state = await createMarkdownPreviewState(content)

    previewView = new EditorView({
      state,
      parent: previewContainer.value,
    })
  }
}

async function selectVersionDocx(commit) {
  const base64 = await gitShowBase64(workspace.path, commit.hash, props.filePath)
  const currentBase64 = await invoke('read_file_base64', { path: props.filePath })
  const [beforeParagraphs, afterParagraphs] = await Promise.all([
    extractDocxParagraphs(base64),
    extractDocxParagraphs(currentBase64),
  ])
  docxDiffBlocks.value = buildDocxParagraphDiff(beforeParagraphs, afterParagraphs)
  previewContent.value = '' // no text content for docx
  previewLoading.value = false

  if (docxViewMode.value !== 'preview') {
    destroyPreview()
    return
  }

  await nextTick()
  if (!previewContainer.value) return

  destroyPreview()

  // Create a unique container ID for SuperDoc
  const containerId = 'version-superdoc-preview'
  const div = document.createElement('div')
  div.id = containerId
  previewContainer.value.appendChild(div)

  const file = base64ToFile(base64, fileName.value)

  // Dynamic import to avoid loading SuperDoc for non-docx workflows
  const { SuperDoc } = await import('superdoc')
  await import('superdoc/style.css')

  const sd = new SuperDoc({
    selector: `#${containerId}`,
    document: file,
    documentMode: 'viewing',
  })

  superdocInstance = markRaw(sd)
}

async function copyContent() {
  if (previewContent.value) {
    await navigator.clipboard.writeText(previewContent.value)
    copyFeedback.value = true
    clearTimeout(copyTimer)
    copyTimer = setTimeout(() => {
      copyFeedback.value = false
    }, 1500)
  }
}

async function restoreVersion() {
  const commit = selectedCommit.value
  if (!commit || !workspace.path) return

  const yes = await ask(
    t('Restore "{fileName}" to version from {date}?', {
      fileName: fileName.value,
      date: formatDisplayDate(commit.date),
    }),
    { title: t('Confirm Restore'), kind: 'warning' },
  )
  if (!yes) {
    return
  }

  try {
    if (isDocx.value) {
      const base64 = await gitShowBase64(workspace.path, commit.hash, props.filePath)
      await invoke('write_file_base64', { path: props.filePath, data: base64 })
      // Force DocxEditor to remount by closing and reopening the tab
      const paneId = editorStore.activePaneId
      editorStore.closeTab(paneId, props.filePath)
      await nextTick()
      editorStore.openFile(props.filePath)
    } else {
      const content = await gitShow(workspace.path, commit.hash, props.filePath)
      await invoke('write_file', { path: props.filePath, content })
      await filesStore.reloadFile(props.filePath)
    }
    emit('close')
  } catch (e) {
    console.error('Failed to restore:', e)
    useToastStore().show(formatFileError('restore', props.filePath, e), { type: 'error', duration: 5000 })
  }
}

function isNamedSnapshot(message) {
  if (!message) return false
  return !message.startsWith('Auto:') && !message.startsWith('Save:')
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr // Fallback to raw string
  return formatLocaleDate(d, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

onUnmounted(() => {
  destroyPreview()
  clearTimeout(copyTimer)
})
</script>

<style scoped>
.version-preview-headline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.version-view-toggle {
  display: flex;
  gap: 6px;
}

.version-toggle-btn {
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  color: var(--fg-muted);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: var(--ui-font-micro);
  cursor: pointer;
}

.version-toggle-btn.active {
  color: var(--fg-primary);
  border-color: var(--accent);
}

.version-docx-diff {
  flex: 1;
  overflow: auto;
  padding: 12px 16px;
}

.version-docx-diff-list {
  display: grid;
  gap: 12px;
}

.version-docx-diff-block {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px;
  background: var(--bg-secondary);
}

.version-docx-diff-label {
  margin-bottom: 8px;
  font-size: var(--ui-font-micro);
  font-weight: 700;
  color: var(--fg-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.version-docx-diff-text,
.version-docx-diff-side {
  white-space: pre-wrap;
  line-height: 1.6;
  color: var(--fg-primary);
}

.version-docx-diff-compare {
  display: grid;
  gap: 10px;
}

.version-docx-diff-insert {
  border-color: rgba(80, 250, 123, 0.25);
}

.version-docx-diff-delete {
  border-color: rgba(247, 118, 142, 0.25);
}

.version-docx-diff-replace {
  border-color: rgba(226, 185, 61, 0.25);
}

.version-docx-mark-add {
  background: rgba(80, 250, 123, 0.22);
  color: inherit;
}

.version-docx-mark-remove {
  background: rgba(247, 118, 142, 0.22);
  color: inherit;
}
</style>
