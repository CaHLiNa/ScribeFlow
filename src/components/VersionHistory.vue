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
        <UiButton class="version-close-btn" variant="ghost" size="icon-sm" icon-only :title="t('Close (Esc)')" @click="$emit('close')">
          <IconX :size="18" :stroke-width="1.5" />
        </UiButton>

        <!-- Version list -->
        <div class="version-list">
          <div class="version-list-heading px-3 py-2 text-xs font-medium uppercase tracking-wider">
            {{ t('File Version History: {fileName}', { fileName }) }}
          </div>
          <div v-if="loading" class="version-list-empty px-3 py-4 text-xs">
            {{ t('Loading...') }}
          </div>
          <div v-else-if="snapshots.length === 0" class="version-list-empty px-3 py-4 text-xs">
            {{ t('No history yet') }}
          </div>
          <div
            v-for="(snapshot, idx) in snapshots"
            :key="snapshot.id"
            class="version-item"
            :class="{ active: idx === selectedIndex, 'version-item-named': isNamedSnapshot(snapshot) }"
            @click="selectVersion(idx)"
          >
            <div class="timestamp">{{ formatDisplayDate(snapshot.createdAt) }}</div>
            <div class="message" :class="{ 'version-named-message': isNamedSnapshot(snapshot) }">
              <svg v-if="isNamedSnapshot(snapshot)" class="version-bookmark-icon" width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M3 1.5A1.5 1.5 0 014.5 0h7A1.5 1.5 0 0113 1.5v14a.5.5 0 01-.77.42L8 13.06l-4.23 2.86A.5.5 0 013 15.5V1.5z"/></svg>
              {{ getSnapshotMessage(snapshot) }}
            </div>
          </div>
        </div>

        <!-- Preview -->
        <div class="version-preview">
          <div v-if="selectedSnapshot" class="version-preview-header">
            <div class="version-preview-headline">
              <span class="version-preview-meta text-xs">
                {{ formatDisplayDate(selectedSnapshot.createdAt) }}
                <span v-if="selectedSnapshotMetadata.title" class="version-preview-meta version-preview-meta-muted">
                  {{ selectedSnapshotMetadata.title }}
                </span>
              </span>
            </div>
          </div>

          <!-- Loading state -->
          <div v-if="previewLoading" class="version-empty-state">
            <div class="version-empty-copy text-xs">{{ t('Loading preview...') }}</div>
          </div>
          <div v-else-if="selectedSnapshot && isUnsupportedBinary" class="version-empty-state">
            <div class="version-empty-copy">{{ t('Version preview is not available for this file type.') }}</div>
            <div class="version-empty-detail">
              {{ t('DOCX files remain in history, but Altals no longer previews or restores them.') }}
            </div>
          </div>
          <div v-else-if="selectedSnapshot && !canPreviewSelectedSnapshot" class="version-empty-state">
            <div class="version-empty-copy">{{ t('This saved version is not previewable from file history.') }}</div>
            <div class="version-empty-detail">
              {{ t('Workspace-level save points remain Git-backed, but this view only restores file-level history.') }}
            </div>
          </div>
          <!-- Empty state -->
          <div v-else-if="!selectedSnapshot" class="version-empty-state">
            <div class="version-empty-copy">{{ t('Select a version to preview') }}</div>
            <div class="version-empty-detail version-empty-detail-faint">
              {{ t('Click a version on the left') }}
            </div>
          </div>
          <!-- Preview content -->
          <div
            v-else-if="selectedSnapshot"
            ref="previewContainer"
            class="flex-1 overflow-hidden"
          ></div>

          <!-- Action footer -->
          <div class="version-preview-footer">
            <UiButton
              v-if="!isUnsupportedBinary"
              variant="secondary"
              :disabled="!selectedSnapshot || !canCopySelectedSnapshot"
              @click="copyContent"
            >
              {{ copyFeedback ? t('Copied!') : t('Copy content') }}
            </UiButton>
            <UiButton
              v-if="!isUnsupportedBinary"
              variant="danger"
              :disabled="!selectedSnapshot || !canRestoreSelectedSnapshot"
              @click="restoreVersion"
            >
              {{ t('Restore this version') }}
            </UiButton>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onUnmounted, nextTick } from 'vue'
import { IconX } from '@tabler/icons-vue'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { shouldersTheme, shouldersHighlighting } from '../editor/theme'
import { useWorkspaceStore } from '../stores/workspace'
import { useFilesStore } from '../stores/files'
import { useToastStore } from '../stores/toast'
import {
  getWorkspaceSnapshotMetadata,
  isNamedWorkspaceSnapshot,
  listFileVersionHistory,
  loadFileVersionHistoryPreview,
  restoreFileVersionHistoryEntry,
} from '../domains/changes/workspaceSnapshot.js'
import { getViewerType } from '../utils/fileTypes'
import { formatFileError } from '../utils/errorMessages'
import { ask } from '@tauri-apps/plugin-dialog'
import { useI18n, formatDate as formatLocaleDate } from '../i18n'
import UiButton from './shared/ui/UiButton.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  filePath: { type: String, default: '' },
})

const emit = defineEmits(['close'])

const workspace = useWorkspaceStore()
const filesStore = useFilesStore()
const toastStore = useToastStore()
const { t } = useI18n()
const previewContainer = ref(null)
const overlayEl = ref(null)

const loading = ref(false)
const previewLoading = ref(false)
const snapshots = ref([])
const selectedIndex = ref(-1)
const previewContent = ref('')
const copyFeedback = ref(false)

let previewView = null // CodeMirror instance
let copyTimer = null

const fileName = computed(() => props.filePath.split('/').pop())
const isUnsupportedBinary = computed(() => getViewerType(props.filePath) === 'unsupported-binary')
const selectedSnapshot = computed(() =>
  selectedIndex.value >= 0 ? snapshots.value[selectedIndex.value] : null
)
const selectedSnapshotMetadata = computed(() => getSnapshotMetadata(selectedSnapshot.value))
const canPreviewSelectedSnapshot = computed(() =>
  !!selectedSnapshotMetadata.value?.capabilities?.canPreview
)
const canCopySelectedSnapshot = computed(() =>
  canPreviewSelectedSnapshot.value && !isUnsupportedBinary.value
)
const canRestoreSelectedSnapshot = computed(() =>
  !!selectedSnapshotMetadata.value?.capabilities?.canRestore && !isUnsupportedBinary.value
)

function destroyPreview() {
  if (previewView) {
    previewView.destroy()
    previewView = null
  }
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
    snapshots.value = []
    selectedIndex.value = -1
    previewLoading.value = false
    destroyPreview()
  }
})

async function loadHistory() {
  if (!workspace.path) return
  loading.value = true
  try {
    snapshots.value = await listFileVersionHistory({
      workspacePath: workspace.path,
      filePath: props.filePath,
      t,
    })
    selectedIndex.value = -1
  } catch (e) {
    console.error('Failed to load history:', e)
    snapshots.value = []
  }
  loading.value = false
}

async function selectVersion(idx) {
  selectedIndex.value = idx
  const snapshot = snapshots.value[idx]
  if (!snapshot || !workspace.path) return

  previewLoading.value = true
  try {
    if (isUnsupportedBinary.value) {
      previewContent.value = ''
      previewLoading.value = false
      destroyPreview()
      return
    }
    if (!getSnapshotMetadata(snapshot)?.capabilities?.canPreview) {
      previewContent.value = ''
      previewLoading.value = false
      destroyPreview()
      return
    }
    await selectVersionText(snapshot)
  } catch (e) {
    console.error('Failed to show version:', e)
    previewContent.value = t('Could not load this version.')
    previewLoading.value = false
  }
}

async function selectVersionText(snapshot) {
  const content = await loadFileVersionHistoryPreview({
    workspacePath: workspace.path,
    filePath: props.filePath,
    snapshot,
  })
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
  const snapshot = selectedSnapshot.value
  if (!snapshot || !workspace.path) return
  if (!getSnapshotMetadata(snapshot)?.capabilities?.canRestore) return

  const yes = await ask(
    t('Restore "{fileName}" to version from {date}?', {
      fileName: fileName.value,
      date: formatDisplayDate(snapshot.createdAt),
    }),
    { title: t('Confirm Restore'), kind: 'warning' },
  )
  if (!yes) {
    return
  }

  try {
    await restoreFileVersionHistoryEntry({
      workspacePath: workspace.path,
      filePath: props.filePath,
      snapshot,
      reloadFileImpl: (path) => filesStore.reloadFile(path),
    })
    emit('close')
  } catch (e) {
    console.error('Failed to restore:', e)
    toastStore.show(formatFileError('restore', props.filePath, e), { type: 'error', duration: 5000 })
  }
}

function isNamedSnapshot(snapshot) {
  return getSnapshotMetadata(snapshot).isNamed && isNamedWorkspaceSnapshot(snapshot)
}

function getSnapshotMessage(snapshot) {
  return getSnapshotMetadata(snapshot).title
}

function getSnapshotMetadata(snapshot) {
  return getWorkspaceSnapshotMetadata(snapshot)
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
  width: 100%;
}

.version-list-heading,
.version-list-empty,
.version-preview-meta,
.version-empty-copy,
.version-empty-detail {
  color: var(--text-muted);
}

.version-list-heading {
  border-bottom: 1px solid var(--border-subtle);
}

.version-preview-meta-muted {
  margin-left: var(--space-2);
  opacity: 0.72;
}

.version-empty-copy {
  font-size: var(--ui-font-body);
}

.version-empty-detail {
  margin-top: var(--space-2);
  font-size: var(--ui-font-caption);
  opacity: 0.72;
}

.version-empty-detail-faint {
  opacity: 0.56;
}
</style>
