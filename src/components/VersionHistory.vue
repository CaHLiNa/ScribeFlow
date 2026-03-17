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
            </div>
          </div>

          <!-- Loading state -->
          <div v-if="previewLoading" class="version-empty-state">
            <div class="text-xs" style="color: var(--fg-muted);">{{ t('Loading preview...') }}</div>
          </div>
          <div v-else-if="selectedCommit && isUnsupportedBinary" class="version-empty-state">
            <div style="color: var(--fg-muted); font-size: var(--ui-font-body);">{{ t('Version preview is not available for this file type.') }}</div>
            <div style="color: var(--fg-muted); opacity: 0.6; font-size: var(--ui-font-caption); margin-top: 6px;">
              {{ t('DOCX files remain in history, but Altals no longer previews or restores them.') }}
            </div>
          </div>
          <!-- Empty state -->
          <div v-else-if="!selectedCommit" class="version-empty-state">
            <div style="color: var(--fg-muted); font-size: var(--ui-font-body);">{{ t('Select a version to preview') }}</div>
            <div style="color: var(--fg-muted); opacity: 0.5; font-size: var(--ui-font-caption); margin-top: 6px;">
              {{ t('Click a commit on the left') }}
            </div>
          </div>
          <!-- Preview content -->
          <div
            v-else-if="selectedCommit"
            ref="previewContainer"
            class="flex-1 overflow-hidden"
          ></div>

          <!-- Action footer -->
          <div class="version-preview-footer">
            <button
              v-if="!isUnsupportedBinary"
              class="version-action-btn version-action-copy"
              :class="{ 'is-success': copyFeedback }"
              :disabled="!selectedCommit"
              @click="copyContent"
            >
              {{ copyFeedback ? t('Copied!') : t('Copy content') }}
            </button>
            <button
              v-if="!isUnsupportedBinary"
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
import { ref, computed, watch, onUnmounted, nextTick } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { IconX } from '@tabler/icons-vue'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { shouldersTheme, shouldersHighlighting } from '../editor/theme'
import { useWorkspaceStore } from '../stores/workspace'
import { useFilesStore } from '../stores/files'
import { useToastStore } from '../stores/toast'
import { gitLog, gitShow } from '../services/git'
import { getViewerType } from '../utils/fileTypes'
import { formatFileError } from '../utils/errorMessages'
import { ask } from '@tauri-apps/plugin-dialog'
import { useI18n, formatDate as formatLocaleDate } from '../i18n'

const props = defineProps({
  visible: { type: Boolean, default: false },
  filePath: { type: String, default: '' },
})

const emit = defineEmits(['close'])

const workspace = useWorkspaceStore()
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

let previewView = null // CodeMirror instance
let copyTimer = null

const fileName = computed(() => props.filePath.split('/').pop())
const isUnsupportedBinary = computed(() => getViewerType(props.filePath) === 'unsupported-binary')
const selectedCommit = computed(() =>
  selectedIndex.value >= 0 ? commits.value[selectedIndex.value] : null
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
    commits.value = []
    selectedIndex.value = -1
    previewLoading.value = false
    destroyPreview()
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
    if (isUnsupportedBinary.value) {
      previewContent.value = ''
      previewLoading.value = false
      destroyPreview()
      return
    }
    await selectVersionText(commit)
  } catch (e) {
    console.error('Failed to show version:', e)
    previewContent.value = t('Could not load this version.')
    previewLoading.value = false
  }
}

async function selectVersionText(commit) {
  const content = await gitShow(workspace.path, commit.hash, props.filePath)
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
    const content = await gitShow(workspace.path, commit.hash, props.filePath)
    await invoke('write_file', { path: props.filePath, content })
    await filesStore.reloadFile(props.filePath)
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
  width: 100%;
}
</style>
