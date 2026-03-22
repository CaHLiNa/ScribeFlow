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
        <button class="version-close-btn" @click="$emit('close')" :title="t('Close (Esc)')">
          <IconX :size="18" :stroke-width="1.5" />
        </button>

        <div class="version-list">
          <div
            class="px-3 py-2 text-xs font-medium uppercase tracking-wider"
            style="color: var(--fg-muted); border-bottom: 1px solid var(--border);"
          >
            {{ t('Saved versions') }}
          </div>
          <div v-if="loading" class="px-3 py-4 text-xs" style="color: var(--fg-muted);">
            {{ t('Loading...') }}
          </div>
          <div v-else-if="snapshots.length === 0" class="px-3 py-4 text-xs" style="color: var(--fg-muted);">
            {{ t('No saved versions yet') }}
          </div>
          <div
            v-for="(snapshot, idx) in snapshots"
            :key="snapshot.id"
            class="version-item"
            :class="{ active: idx === selectedIndex, 'version-item-named': isNamedSnapshot(snapshot) }"
            @click="selectedIndex = idx"
          >
            <div class="timestamp">{{ formatDisplayDate(snapshot.createdAt) }}</div>
            <div class="message" :class="{ 'version-named-message': isNamedSnapshot(snapshot) }">
              <svg
                v-if="isNamedSnapshot(snapshot)"
                class="version-bookmark-icon"
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="currentColor"
              >
                <path d="M3 1.5A1.5 1.5 0 014.5 0h7A1.5 1.5 0 0113 1.5v14a.5.5 0 01-.77.42L8 13.06l-4.23 2.86A.5.5 0 013 15.5V1.5z"/>
              </svg>
              {{ getSnapshotMessage(snapshot) }}
            </div>
          </div>
        </div>

        <div class="version-preview">
          <div v-if="selectedSnapshot" class="version-preview-header">
            <div class="workspace-snapshot-headline">
              <span class="text-xs" style="color: var(--fg-muted);">
                {{ formatDisplayDate(selectedSnapshot.createdAt) }}
              </span>
              <span class="text-sm font-medium" style="color: var(--fg-primary);">
                {{ selectedSnapshotMetadata.title }}
              </span>
            </div>
          </div>

          <div v-if="loading" class="version-empty-state">
            <div class="text-xs" style="color: var(--fg-muted);">{{ t('Loading...') }}</div>
          </div>
          <div v-else-if="!selectedSnapshot && snapshots.length === 0" class="version-empty-state">
            <div style="color: var(--fg-muted); font-size: var(--ui-font-body);">
              {{ t('No saved versions yet') }}
            </div>
            <div style="color: var(--fg-muted); opacity: 0.6; font-size: var(--ui-font-caption); margin-top: 6px;">
              {{ t('Create one with Save first, then browse it here.') }}
            </div>
          </div>
          <div v-else-if="!selectedSnapshot" class="version-empty-state">
            <div style="color: var(--fg-muted); font-size: var(--ui-font-body);">
              {{ t('Select a saved version') }}
            </div>
            <div style="color: var(--fg-muted); opacity: 0.5; font-size: var(--ui-font-caption); margin-top: 6px;">
              {{ t('Choose a workspace save point on the left.') }}
            </div>
          </div>
          <div v-else class="workspace-snapshot-detail">
            <div class="workspace-snapshot-card">
              <div class="workspace-snapshot-kicker">{{ t('Workspace save point') }}</div>
              <div class="workspace-snapshot-title">{{ selectedSnapshotMetadata.title }}</div>
              <div class="workspace-snapshot-meta">
                {{ isNamedSnapshot(selectedSnapshot) ? t('Named save point') : t('Saved automatically through the normal save flow') }}
              </div>
              <div v-if="selectedPayloadFileCount > 0" class="workspace-snapshot-meta">
                {{ t('{count} captured file(s) available for local restore', { count: selectedPayloadFileCount }) }}
              </div>
              <div v-if="selectedPayloadFileCount > 0" class="workspace-snapshot-meta">
                {{
                  isProjectTextSetSnapshot
                    ? t('Capture scope: project text files in the current workspace, excluding binary, preview, and support-only paths.')
                    : isLoadedWorkspaceTextSnapshot
                    ? t('Capture scope: workspace text files that were open or already loaded in Altals when this save point was created.')
                    : t('Capture scope: explicitly captured open workspace files.')
                }}
              </div>
              <div v-if="selectedPayloadSkippedCount > 0" class="workspace-snapshot-meta">
                {{ t('{count} file(s) were skipped during capture because they could not be read as restorable text at save-point time.', { count: selectedPayloadSkippedCount }) }}
              </div>
            </div>

            <div class="workspace-snapshot-note">
              {{ t('This browser lists workspace-level save points separately from File Version History.') }}
            </div>
            <div class="workspace-snapshot-note">
              {{ t('Workspace save points now have a local Altals index while still pointing at Git-backed milestones underneath.') }}
            </div>
            <div v-if="canRestoreSelectedSnapshot" class="workspace-snapshot-note">
              {{
                isProjectTextSetSnapshot
                  ? t('This save point can restore the current project text set captured for the workspace, without rewinding Git history.')
                  : isLoadedWorkspaceTextSnapshot
                  ? t('This save point can restore the workspace text files Altals had loaded when it was created, without rewinding Git history.')
                  : t('This save point can restore its captured files through the local snapshot payload without rewinding Git history.')
              }}
            </div>
            <div v-if="selectedAddedEntries.length > 0" class="workspace-snapshot-note">
              {{ t('This save point can also remove current project-text files that were added after it was created, still without using Git checkout.') }}
            </div>
            <div v-if="!canRestoreSelectedSnapshot && selectedAddedEntries.length === 0 && hasSelectedPayload" class="workspace-snapshot-note">
              {{ t('This save point recorded workspace payload coverage, but no files were captured for local restore. Check the skipped files list below.') }}
            </div>
            <div v-if="!canRestoreSelectedSnapshot && selectedAddedEntries.length === 0 && !hasSelectedPayload" class="workspace-snapshot-note">
              {{ t('Older workspace save points may appear here without a local payload yet. Use File Version History for per-file restores.') }}
            </div>

            <div v-if="payloadManifestLoading" class="workspace-snapshot-note">
              {{ t('Loading captured files...') }}
            </div>
            <div v-else-if="selectedPreviewSummary" class="workspace-snapshot-payload-list">
              <div class="workspace-snapshot-payload-title">{{ t('Current workspace comparison') }}</div>
              <div class="workspace-snapshot-payload-item">
                {{ t('{count} unchanged', { count: selectedPreviewCounts.unchanged }) }}
              </div>
              <div class="workspace-snapshot-payload-item">
                {{ t('{count} modified', { count: selectedPreviewCounts.modified }) }}
              </div>
              <div class="workspace-snapshot-payload-item">
                {{ t('{count} missing', { count: selectedPreviewCounts.missing }) }}
              </div>
              <div v-if="selectedPreviewCounts.added > 0" class="workspace-snapshot-payload-item">
                {{ t('{count} added after this save point', { count: selectedPreviewCounts.added }) }}
              </div>
              <div v-if="selectedPreviewCounts.unreadable > 0" class="workspace-snapshot-payload-item">
                {{ t('{count} unreadable', { count: selectedPreviewCounts.unreadable }) }}
              </div>
              <div v-if="selectedPreviewCounts.tooLarge > 0" class="workspace-snapshot-payload-item">
                {{ t('{count} too large to compare as text', { count: selectedPreviewCounts.tooLarge }) }}
              </div>
            </div>
            <div v-if="selectedPreviewEntries.length > 0" class="workspace-snapshot-payload-list">
              <div class="workspace-snapshot-payload-title">{{ t('Captured files') }}</div>
              <button
                v-for="entry in selectedPreviewEntries"
                :key="entry.path"
                type="button"
                class="workspace-snapshot-payload-entry"
                :class="{
                  'workspace-snapshot-payload-entry-active': entry.path === selectedPreviewEntryPath,
                  'workspace-snapshot-payload-entry-previewable': canLoadPreviewDetail(entry),
                }"
                @click="selectPreviewEntry(entry)"
              >
                <span>{{ entry.relativePath || entry.path }}</span>
                <span class="workspace-snapshot-payload-status">{{ formatPreviewStatus(entry.status) }}</span>
              </button>
            </div>
            <div v-if="selectedAddedEntries.length > 0" class="workspace-snapshot-payload-list">
              <div class="workspace-snapshot-payload-title">{{ t('Files Added After This Save Point') }}</div>
              <button
                v-for="entry in selectedAddedEntries"
                :key="entry.path"
                type="button"
                class="workspace-snapshot-payload-entry workspace-snapshot-payload-entry-previewable"
                :class="{
                  'workspace-snapshot-payload-entry-active': entry.path === selectedAddedEntryPath,
                }"
                @click="selectAddedEntry(entry)"
              >
                <span>{{ entry.relativePath || entry.path }}</span>
                <span class="workspace-snapshot-payload-status">{{ t('added after save point') }}</span>
              </button>
            </div>
            <div v-else-if="selectedPayloadFiles.length > 0" class="workspace-snapshot-payload-list">
              <div class="workspace-snapshot-payload-title">{{ t('Captured files') }}</div>
              <div
                v-for="file in selectedPayloadFiles"
                :key="file.path"
                class="workspace-snapshot-payload-item"
              >
                {{ file.relativePath || file.path }}<template v-if="previewStatusForPath(file.path)"> · {{ formatPreviewStatus(previewStatusForPath(file.path)) }}</template>
              </div>
            </div>
            <div v-if="selectedSkippedFiles.length > 0" class="workspace-snapshot-payload-list">
              <div class="workspace-snapshot-payload-title">{{ t('Skipped files') }}</div>
              <div
                v-for="file in selectedSkippedFiles"
                :key="`${file.path}:${file.reason}`"
                class="workspace-snapshot-payload-item"
              >
                {{ file.relativePath || file.path }} · {{ formatSkippedReason(file.reason) }}
              </div>
            </div>

            <div
              v-if="selectedPreviewEntry && canLoadPreviewDetail(selectedPreviewEntry)"
              class="workspace-snapshot-preview-card"
            >
              <div class="workspace-snapshot-payload-title">{{ t('Selected file preview') }}</div>
              <div class="workspace-snapshot-preview-meta">
                {{ selectedPreviewEntry.relativePath || selectedPreviewEntry.path }} · {{ formatPreviewStatus(selectedPreviewEntry.status) }}
              </div>
              <div v-if="previewDetailLoading" class="workspace-snapshot-note">
                {{ t('Loading file preview...') }}
              </div>
              <template v-else-if="selectedPreviewDetail">
                <div v-if="selectedPreviewDetail.summary?.firstChangedLine" class="workspace-snapshot-preview-meta">
                  {{
                    t('Changed near line {line} across {count} line(s).', {
                      line: selectedPreviewDetail.summary.firstChangedLine,
                      count: selectedPreviewDetail.summary.changedLineCount,
                    })
                  }}
                </div>
                <div
                  v-if="selectedPreviewDetail.status === 'missing'"
                  class="workspace-snapshot-preview-meta"
                >
                  {{ t('This file is currently missing from the workspace. Restoring the save point will recreate only the captured text content for it.') }}
                </div>
                <div class="workspace-snapshot-preview-meta">
                  {{ t('Patch/diff editor view: saved version versus current workspace content.') }}
                </div>
                <div class="workspace-snapshot-preview-meta">
                  {{ t('Use the Accept/Reject controls inside each changed block to choose which snapshot chunks to apply.') }}
                </div>
                <div
                  v-if="selectedPreviewUnresolvedChunkCount > 0"
                  class="workspace-snapshot-preview-meta"
                >
                  {{ t('{count} unresolved chunk(s) remain in this diff view.', { count: selectedPreviewUnresolvedChunkCount }) }}
                </div>
                <div
                  v-if="selectedPreviewHasMergedChanges"
                  class="workspace-snapshot-preview-meta"
                >
                  {{ t('The merged result below differs from the current workspace file and can be written back without using Git history.') }}
                </div>
                <WorkspaceSnapshotDiffEditor
                  :snapshot-content="selectedPreviewDetail.snapshotContent || ''"
                  :current-content="selectedPreviewDetail.currentContent || ''"
                  interactive
                  @update:merged-content="updateSelectedPreviewMergedContent"
                  @chunk-state-change="updateSelectedPreviewChunkState"
                />
                <div class="workspace-snapshot-actions">
                  <button
                    class="workspace-snapshot-action workspace-snapshot-action-apply"
                    :disabled="!selectedPreviewHasMergedChanges || applyingPreview || restoring"
                    @click="applySelectedPreviewChunks"
                  >
                    {{ applyingPreview ? t('Applying...') : t('Apply selected chunks') }}
                  </button>
                  <button
                    class="workspace-snapshot-action workspace-snapshot-action-restore"
                    :disabled="restoring || applyingPreview"
                    @click="restoreSelectedPreviewEntry"
                  >
                    {{ restoring ? t('Restoring...') : t('Restore this file') }}
                  </button>
                </div>
              </template>
            </div>

            <div
              v-if="selectedAddedEntry"
              class="workspace-snapshot-preview-card"
            >
              <div class="workspace-snapshot-payload-title">{{ t('Added File Removal') }}</div>
              <div class="workspace-snapshot-preview-meta">
                {{ selectedAddedEntry.relativePath || selectedAddedEntry.path }} · {{ t('added after save point') }}
              </div>
              <div class="workspace-snapshot-preview-meta">
                {{ t('This file is currently inside the workspace save-point restore scope, but it did not exist when this save point was created.') }}
              </div>
              <div class="workspace-snapshot-preview-meta">
                {{ t('Removing it here uses Altals file operations rather than Git checkout, and only affects the current project-text-set restore scope.') }}
              </div>
              <div class="workspace-snapshot-actions">
                <button
                  class="workspace-snapshot-action workspace-snapshot-action-remove"
                  :disabled="removingAddedEntry || restoring || applyingPreview"
                  @click="removeSelectedAddedEntry"
                >
                  {{ removingAddedEntry ? t('Removing...') : t('Remove this file') }}
                </button>
              </div>
            </div>

            <div class="workspace-snapshot-actions">
              <button
                class="workspace-snapshot-action workspace-snapshot-action-restore"
                :disabled="!canRestoreSelectedSavePoint || restoring || removingAddedEntry"
                @click="restoreSelectedSnapshot"
              >
                {{ restoring ? t('Restoring...') : t('Restore save point') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { IconX } from '@tabler/icons-vue'
import { ask } from '@tauri-apps/plugin-dialog'
import WorkspaceSnapshotDiffEditor from './WorkspaceSnapshotDiffEditor.vue'
import { useEditorStore } from '../stores/editor'
import { useFilesStore } from '../stores/files'
import { useToastStore } from '../stores/toast'
import { useWorkspaceStore } from '../stores/workspace'
import {
  applyWorkspaceSavePointFilePreviewContent,
  getWorkspaceSnapshotMetadata,
  isLoadedWorkspaceTextPayload,
  isNamedWorkspaceSnapshot,
  isProjectTextSetPayload,
  loadWorkspaceSavePointFilePreview,
  listWorkspaceSavePoints,
  loadWorkspaceSavePointPayloadManifest,
  loadWorkspaceSavePointPreviewSummary,
  removeWorkspaceSavePointAddedFile,
  restoreWorkspaceSavePoint,
  restoreWorkspaceSavePointFile,
} from '../domains/changes/workspaceSnapshot.js'
import { useI18n, formatDate as formatLocaleDate } from '../i18n'

const props = defineProps({
  visible: { type: Boolean, default: false },
})

const emit = defineEmits(['close'])

const workspace = useWorkspaceStore()
const editorStore = useEditorStore()
const filesStore = useFilesStore()
const toastStore = useToastStore()
const { t } = useI18n()
const overlayEl = ref(null)
const loading = ref(false)
const restoring = ref(false)
const applyingPreview = ref(false)
const removingAddedEntry = ref(false)
const payloadManifestLoading = ref(false)
const previewSummaryLoading = ref(false)
const previewDetailLoading = ref(false)
const snapshots = ref([])
const selectedIndex = ref(-1)
const selectedPayloadManifest = ref(null)
const selectedPreviewSummary = ref(null)
const selectedPreviewEntryPath = ref('')
const selectedAddedEntryPath = ref('')
const selectedPreviewDetail = ref(null)
const selectedPreviewMergedContent = ref('')
const selectedPreviewUnresolvedChunkCount = ref(0)

const selectedSnapshot = computed(() =>
  selectedIndex.value >= 0 ? snapshots.value[selectedIndex.value] : null
)
const selectedSnapshotMetadata = computed(() => getSnapshotMetadata(selectedSnapshot.value))
const selectedPayloadMeta = computed(() => selectedSnapshotMetadata.value?.payload || null)
const selectedPayloadFileCount = computed(() =>
  Number.parseInt(selectedPayloadMeta.value?.fileCount, 10) || 0
)
const selectedPayloadSkippedCount = computed(() =>
  Number.parseInt(selectedPayloadMeta.value?.skippedCount, 10) || 0
)
const isProjectTextSetSnapshot = computed(() =>
  isProjectTextSetPayload(selectedPayloadMeta.value)
)
const isLoadedWorkspaceTextSnapshot = computed(() =>
  isLoadedWorkspaceTextPayload(selectedPayloadMeta.value)
)
const hasSelectedPayload = computed(() => !!selectedPayloadMeta.value)
const selectedPayloadFiles = computed(() =>
  Array.isArray(selectedPayloadManifest.value?.files) ? selectedPayloadManifest.value.files : []
)
const selectedSkippedFiles = computed(() =>
  Array.isArray(selectedPayloadManifest.value?.skippedFiles) ? selectedPayloadManifest.value.skippedFiles : []
)
const selectedPreviewEntries = computed(() =>
  Array.isArray(selectedPreviewSummary.value?.entries) ? selectedPreviewSummary.value.entries : []
)
const selectedAddedEntries = computed(() =>
  Array.isArray(selectedPreviewSummary.value?.addedEntries) ? selectedPreviewSummary.value.addedEntries : []
)
const selectedPreviewEntry = computed(() =>
  selectedPreviewEntries.value.find((entry) => entry.path === selectedPreviewEntryPath.value) || null
)
const selectedAddedEntry = computed(() =>
  selectedAddedEntries.value.find((entry) => entry.path === selectedAddedEntryPath.value) || null
)
const selectedPreviewHasMergedChanges = computed(() => {
  if (!selectedPreviewDetail.value) {
    return false
  }
  return selectedPreviewMergedContent.value !== (selectedPreviewDetail.value.currentContent || '')
})
const selectedPreviewCounts = computed(() =>
  selectedPreviewSummary.value?.counts || {
    unchanged: 0,
    modified: 0,
    missing: 0,
    unreadable: 0,
    tooLarge: 0,
    added: 0,
  }
)
const canRestoreSelectedSnapshot = computed(() =>
  !!selectedSnapshotMetadata.value?.capabilities?.canRestore
)
const canRestoreSelectedSavePoint = computed(() =>
  canRestoreSelectedSnapshot.value || selectedAddedEntries.value.length > 0
)

watch(() => props.visible, async (visible) => {
  if (visible) {
    await loadWorkspaceSnapshots()
    await nextTick()
    overlayEl.value?.focus()
    return
  }

  snapshots.value = []
  selectedIndex.value = -1
  selectedPayloadManifest.value = null
  selectedPreviewSummary.value = null
  selectedPreviewEntryPath.value = ''
  selectedAddedEntryPath.value = ''
  selectedPreviewDetail.value = null
  resetSelectedPreviewEditorState()
})

watch(() => workspace.isOpen, (isOpen) => {
  if (!isOpen && props.visible) {
    emit('close')
  }
})

watch(selectedSnapshot, (snapshot) => {
  if (!props.visible) {
    return
  }
  void loadSelectedSnapshotPayloadManifest(snapshot)
})

watch(selectedPreviewEntry, (entry) => {
  if (!props.visible || !selectedSnapshot.value) {
    selectedPreviewDetail.value = null
    previewDetailLoading.value = false
    return
  }

  void loadSelectedPreviewDetail(selectedSnapshot.value, entry)
})

async function loadWorkspaceSnapshots() {
  if (!workspace.path) {
    snapshots.value = []
    selectedIndex.value = -1
    return
  }

  loading.value = true
  try {
    snapshots.value = await listWorkspaceSavePoints({
      workspacePath: workspace.path,
      workspaceDataDir: workspace.workspaceDataDir,
    })
    selectedIndex.value = snapshots.value.length > 0 ? 0 : -1
  } catch (error) {
    console.error('Failed to load workspace snapshots:', error)
    snapshots.value = []
    selectedIndex.value = -1
  } finally {
    loading.value = false
  }
}

function getSnapshotMetadata(snapshot) {
  return getWorkspaceSnapshotMetadata(snapshot)
}

function getSnapshotMessage(snapshot) {
  return getSnapshotMetadata(snapshot).title
}

function isNamedSnapshot(snapshot) {
  return getSnapshotMetadata(snapshot).isNamed && isNamedWorkspaceSnapshot(snapshot)
}

function resetSelectedPreviewEditorState() {
  selectedPreviewMergedContent.value = ''
  selectedPreviewUnresolvedChunkCount.value = 0
}

async function loadSelectedSnapshotPayloadManifest(snapshot) {
  if (!snapshot || !hasSelectedPayload.value) {
    selectedPayloadManifest.value = null
    payloadManifestLoading.value = false
    selectedPreviewSummary.value = null
    previewSummaryLoading.value = false
    selectedPreviewEntryPath.value = ''
    selectedAddedEntryPath.value = ''
    selectedPreviewDetail.value = null
    previewDetailLoading.value = false
    resetSelectedPreviewEditorState()
    return
  }

  payloadManifestLoading.value = true
  previewSummaryLoading.value = true
  try {
    const [manifest, previewSummary] = await Promise.all([
      loadWorkspaceSavePointPayloadManifest({
        workspace,
        snapshot,
      }),
      loadWorkspaceSavePointPreviewSummary({
        workspace,
        snapshot,
        filesStore,
        editorStore,
      }),
    ])
    selectedPayloadManifest.value = manifest
    selectedPreviewSummary.value = previewSummary
    selectedPreviewEntryPath.value = resolveDefaultPreviewEntryPath(previewSummary, selectedPreviewEntryPath.value)
    selectedAddedEntryPath.value = selectedPreviewEntryPath.value
      ? ''
      : resolveDefaultAddedEntryPath(previewSummary, selectedAddedEntryPath.value)
    if (!selectedPreviewEntryPath.value) {
      selectedPreviewDetail.value = null
      resetSelectedPreviewEditorState()
    }
  } catch (error) {
    console.error('Failed to load workspace snapshot payload manifest:', error)
    selectedPayloadManifest.value = null
    selectedPreviewSummary.value = null
    selectedPreviewEntryPath.value = ''
    selectedAddedEntryPath.value = ''
    selectedPreviewDetail.value = null
    resetSelectedPreviewEditorState()
  } finally {
    payloadManifestLoading.value = false
    previewSummaryLoading.value = false
  }
}

async function loadSelectedPreviewDetail(snapshot, entry) {
  if (!snapshot || !canLoadPreviewDetail(entry)) {
    selectedPreviewDetail.value = null
    previewDetailLoading.value = false
    resetSelectedPreviewEditorState()
    return
  }

  selectedPreviewDetail.value = null
  resetSelectedPreviewEditorState()
  previewDetailLoading.value = true
  try {
    selectedPreviewDetail.value = await loadWorkspaceSavePointFilePreview({
      workspace,
      snapshot,
      filePath: entry.path,
    })
    selectedPreviewMergedContent.value = selectedPreviewDetail.value?.currentContent || ''
  } catch (error) {
    console.error('Failed to load workspace save-point file preview:', error)
    selectedPreviewDetail.value = null
    resetSelectedPreviewEditorState()
  } finally {
    previewDetailLoading.value = false
  }
}

async function restoreWorkspaceSavePointSelection({
  targetPaths = [],
  confirmationText = '',
  successText = '',
  closeOnSuccess = false,
  removeAddedFiles = false,
} = {}) {
  const snapshot = selectedSnapshot.value
  if (!snapshot || !canRestoreSelectedSavePoint.value || restoring.value) {
    return false
  }

  const count = targetPaths.length > 0 ? targetPaths.length : selectedPayloadFileCount.value
  const addedCount = removeAddedFiles && targetPaths.length === 0 ? selectedAddedEntries.value.length : 0
  const confirmed = await ask(
    confirmationText || buildRestoreConfirmationText({
      snapshot,
      restoredCount: count,
      removedCount: addedCount,
    }),
    { title: t('Restore Workspace Save Point'), kind: 'warning' },
  )
  if (!confirmed) {
    return false
  }

  restoring.value = true
  try {
    const result = await restoreWorkspaceSavePoint({
      workspace,
      filesStore,
      editorStore,
      snapshot,
      targetPaths,
      removeAddedFiles,
    })
    if (!result?.restored) {
      const message = result?.reason === 'missing-payload'
        ? t('This saved version does not have a local restore payload yet.')
        : t('Failed to restore the selected workspace save point.')
      toastStore.show(message, { type: 'warning', duration: 5000 })
      return false
    }

    toastStore.show(successText || buildRestoreSuccessText({
      restoredCount: result.restoredFiles?.length || 0,
      removedCount: result.removedFiles?.length || 0,
    }), {
      type: 'success',
      duration: 4000,
    })
    if (closeOnSuccess) {
      emit('close')
      return true
    }

    await loadSelectedSnapshotPayloadManifest(snapshot)
    return true
  } catch (error) {
    console.error('Failed to restore workspace save point:', error)
    toastStore.show(t('Failed to restore the selected workspace save point.'), {
      type: 'error',
      duration: 5000,
    })
    return false
  } finally {
    restoring.value = false
  }
}

async function restoreSelectedSnapshot() {
  await restoreWorkspaceSavePointSelection({
    closeOnSuccess: true,
    removeAddedFiles: selectedAddedEntries.value.length > 0,
  })
}

async function restoreSelectedPreviewEntry() {
  const snapshot = selectedSnapshot.value
  const entry = selectedPreviewEntry.value
  if (!snapshot || !canLoadPreviewDetail(entry)) {
    return
  }

  const relativePath = entry.relativePath || entry.path
  const confirmed = await ask(
    t(
      'Restore the captured content for {path} from {date}? This overwrites the current contents of that file.',
      {
        path: relativePath,
        date: formatDisplayDate(snapshot.createdAt),
      },
    ),
    { title: t('Restore Workspace Save Point'), kind: 'warning' },
  )
  if (!confirmed || restoring.value) {
    return
  }

  restoring.value = true
  try {
    const result = await restoreWorkspaceSavePointFile({
      workspace,
      filesStore,
      editorStore,
      snapshot,
      filePath: entry.path,
    })
    if (!result?.restored) {
      const message = result?.reason === 'missing-payload'
        ? t('This saved version does not have a local restore payload yet.')
        : t('Failed to restore the selected workspace save point.')
      toastStore.show(message, { type: 'warning', duration: 5000 })
      return
    }

    toastStore.show(t('Restored the captured content for {path}.', {
      path: relativePath,
    }), {
      type: 'success',
      duration: 4000,
    })
    await loadSelectedSnapshotPayloadManifest(snapshot)
  } catch (error) {
    console.error('Failed to restore workspace save point:', error)
    toastStore.show(t('Failed to restore the selected workspace save point.'), {
      type: 'error',
      duration: 5000,
    })
  } finally {
    restoring.value = false
  }
}

async function applySelectedPreviewChunks() {
  const snapshot = selectedSnapshot.value
  const entry = selectedPreviewEntry.value
  const mergedContent = selectedPreviewMergedContent.value
  if (!snapshot || !canLoadPreviewDetail(entry) || !selectedPreviewHasMergedChanges.value || applyingPreview.value) {
    return
  }

  const relativePath = entry.relativePath || entry.path
  const confirmed = await ask(
    t(
      'Apply the selected snapshot chunks to {path} from {date}? This writes only the merged text currently shown in the diff editor.',
      {
        path: relativePath,
        date: formatDisplayDate(snapshot.createdAt),
      },
    ),
    { title: t('Apply Snapshot Chunks'), kind: 'warning' },
  )
  if (!confirmed) {
    return
  }

  applyingPreview.value = true
  try {
    const result = await applyWorkspaceSavePointFilePreviewContent({
      workspace,
      filesStore,
      editorStore,
      snapshot,
      filePath: entry.path,
      content: mergedContent,
    })
    if (!result?.applied) {
      toastStore.show(t('Failed to apply the selected snapshot chunks.'), {
        type: 'warning',
        duration: 5000,
      })
      return
    }

    toastStore.show(t('Applied the selected snapshot chunks to {path}.', {
      path: relativePath,
    }), {
      type: 'success',
      duration: 4000,
    })
    await loadSelectedSnapshotPayloadManifest(snapshot)
  } catch (error) {
    console.error('Failed to apply workspace snapshot chunks:', error)
    toastStore.show(t('Failed to apply the selected snapshot chunks.'), {
      type: 'error',
      duration: 5000,
    })
  } finally {
    applyingPreview.value = false
  }
}

async function removeSelectedAddedEntry() {
  const snapshot = selectedSnapshot.value
  const entry = selectedAddedEntry.value
  if (!snapshot || !entry?.path || removingAddedEntry.value) {
    return
  }

  const relativePath = entry.relativePath || entry.path
  const confirmed = await ask(
    t(
      'Remove {path} to restore the selected save point from {date}? This deletes that file from the current project-text-set restore scope.',
      {
        path: relativePath,
        date: formatDisplayDate(snapshot.createdAt),
      },
    ),
    { title: t('Remove Added File'), kind: 'warning' },
  )
  if (!confirmed) {
    return
  }

  removingAddedEntry.value = true
  try {
    const result = await removeWorkspaceSavePointAddedFile({
      workspace,
      filesStore,
      editorStore,
      snapshot,
      filePath: entry.path,
    })
    if (!result?.removed) {
      toastStore.show(t('Failed to remove the selected added file.'), {
        type: 'warning',
        duration: 5000,
      })
      return
    }

    toastStore.show(t('Removed {path} to match the selected save point.', {
      path: relativePath,
    }), {
      type: 'success',
      duration: 4000,
    })
    await loadSelectedSnapshotPayloadManifest(snapshot)
  } catch (error) {
    console.error('Failed to remove workspace snapshot added file:', error)
    toastStore.show(t('Failed to remove the selected added file.'), {
      type: 'error',
      duration: 5000,
    })
  } finally {
    removingAddedEntry.value = false
  }
}

function buildRestoreConfirmationText({
  snapshot = null,
  restoredCount = 0,
  removedCount = 0,
} = {}) {
  const date = formatDisplayDate(snapshot?.createdAt)
  if (restoredCount > 0 && removedCount > 0) {
    return t(
      'Restore {restoredCount} captured file(s) and remove {removedCount} file(s) added after this save point from {date}? This overwrites restored files and deletes the added files.',
      {
        restoredCount,
        removedCount,
        date,
      },
    )
  }
  if (removedCount > 0) {
    return t(
      'Remove {removedCount} file(s) added after this save point from {date}? This deletes those files to match the save point.',
      {
        removedCount,
        date,
      },
    )
  }
  return t('Restore {count} captured file(s) from {date}? This overwrites the current contents of those files.', {
    count: restoredCount,
    date,
  })
}

function buildRestoreSuccessText({
  restoredCount = 0,
  removedCount = 0,
} = {}) {
  if (restoredCount > 0 && removedCount > 0) {
    return t('Restored {restoredCount} file(s) and removed {removedCount} added file(s) from the selected workspace save point.', {
      restoredCount,
      removedCount,
    })
  }
  if (removedCount > 0) {
    return t('Removed {removedCount} added file(s) to match the selected workspace save point.', {
      removedCount,
    })
  }
  return t('Restored {count} file(s) from the selected workspace save point.', {
    count: restoredCount,
  })
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return dateStr
  return formatLocaleDate(date, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatSkippedReason(reason) {
  return reason === 'too-large'
    ? t('Too large to capture as text')
    : t('Could not read the file at save-point time')
}

function canLoadPreviewDetail(entry) {
  return entry?.status === 'modified' || entry?.status === 'missing'
}

function resolveDefaultPreviewEntryPath(previewSummary, previousPath = '') {
  const entries = Array.isArray(previewSummary?.entries) ? previewSummary.entries : []
  if (previousPath && entries.some((entry) => entry.path === previousPath && canLoadPreviewDetail(entry))) {
    return previousPath
  }
  return entries.find((entry) => canLoadPreviewDetail(entry))?.path || ''
}

function selectPreviewEntry(entry) {
  if (!canLoadPreviewDetail(entry)) {
    return
  }
  selectedPreviewEntryPath.value = entry.path
  selectedAddedEntryPath.value = ''
}

function resolveDefaultAddedEntryPath(previewSummary, previousPath = '') {
  const entries = Array.isArray(previewSummary?.addedEntries) ? previewSummary.addedEntries : []
  if (previousPath && entries.some((entry) => entry.path === previousPath)) {
    return previousPath
  }
  return entries[0]?.path || ''
}

function selectAddedEntry(entry) {
  if (!entry?.path) {
    return
  }
  selectedAddedEntryPath.value = entry.path
  selectedPreviewEntryPath.value = ''
  selectedPreviewDetail.value = null
  resetSelectedPreviewEditorState()
}

function updateSelectedPreviewMergedContent(content = '') {
  selectedPreviewMergedContent.value = typeof content === 'string' ? content : ''
}

function updateSelectedPreviewChunkState(detail = null) {
  const unresolvedCount = Number.parseInt(detail?.unresolvedCount, 10)
  selectedPreviewUnresolvedChunkCount.value = Number.isInteger(unresolvedCount) && unresolvedCount >= 0
    ? unresolvedCount
    : 0
}

function previewStatusForPath(path) {
  return selectedPreviewSummary.value?.entries?.find((entry) => entry.path === path)?.status || ''
}

function formatPreviewStatus(status) {
  if (status === 'unchanged') return t('unchanged')
  if (status === 'missing') return t('missing from workspace')
  if (status === 'too-large') return t('too large to compare')
  if (status === 'unreadable') return t('unreadable')
  return t('modified')
}
</script>

<style scoped>
.workspace-snapshot-headline {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
}

.workspace-snapshot-detail {
  flex: 1;
  padding: 18px 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.workspace-snapshot-card {
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--bg-hover) 65%, var(--bg-secondary));
}

.workspace-snapshot-kicker {
  font-size: var(--ui-font-label);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--fg-muted);
}

.workspace-snapshot-title {
  margin-top: 6px;
  font-size: var(--ui-font-body);
  font-weight: 600;
  color: var(--fg-primary);
}

.workspace-snapshot-meta {
  margin-top: 6px;
  font-size: var(--ui-font-caption);
  color: var(--fg-muted);
}

.workspace-snapshot-note {
  font-size: var(--ui-font-body);
  color: var(--fg-secondary);
  line-height: 1.5;
}

.workspace-snapshot-actions {
  display: flex;
  justify-content: flex-start;
  padding-top: 4px;
}

.workspace-snapshot-payload-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--bg-hover) 45%, var(--bg-primary));
}

.workspace-snapshot-payload-title {
  font-size: var(--ui-font-label);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--fg-muted);
}

.workspace-snapshot-payload-item {
  font-size: var(--ui-font-body);
  color: var(--fg-primary);
  word-break: break-word;
}

.workspace-snapshot-payload-entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: left;
  font-size: var(--ui-font-body);
  color: var(--fg-primary);
}

.workspace-snapshot-payload-entry-previewable {
  cursor: pointer;
}

.workspace-snapshot-payload-entry-active {
  color: var(--accent-fg, var(--fg-primary));
}

.workspace-snapshot-payload-status {
  flex-shrink: 0;
  font-size: var(--ui-font-caption);
  color: var(--fg-muted);
}

.workspace-snapshot-preview-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--bg-hover) 45%, var(--bg-primary));
}

.workspace-snapshot-preview-meta {
  font-size: var(--ui-font-caption);
  color: var(--fg-secondary);
  line-height: 1.5;
}


.workspace-snapshot-action {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 8px 14px;
  font-size: var(--ui-font-body);
  font-weight: 500;
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.workspace-snapshot-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.workspace-snapshot-action-restore {
  color: var(--fg-primary);
  background: color-mix(in srgb, var(--bg-hover) 72%, var(--bg-secondary));
}

.workspace-snapshot-action-restore:not(:disabled):hover {
  transform: translateY(-1px);
}

.workspace-snapshot-action-apply {
  background: color-mix(in srgb, var(--accent) 10%, var(--bg-primary));
}

.workspace-snapshot-action-apply:not(:disabled):hover {
  transform: translateY(-1px);
}

.workspace-snapshot-action-remove {
  color: var(--error);
  background: color-mix(in srgb, var(--error) 8%, var(--bg-primary));
}

.workspace-snapshot-action-remove:not(:disabled):hover {
  transform: translateY(-1px);
}

</style>
