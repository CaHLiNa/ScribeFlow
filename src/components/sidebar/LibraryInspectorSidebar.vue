<template>
  <div class="library-inspector">
    <div v-if="activeRef" class="library-inspector-inner">
      <div class="library-inspector-primary">
        <div v-if="isEditing" class="library-inspector-kicker">
          {{ t('Edit reference metadata') }}
        </div>
        <div class="library-inspector-title">{{ activeRef.title || `@${activeRef._key}` }}</div>
        <div class="library-inspector-subtitle">
          {{ formatAuthors(activeRef) || t('Unknown author') }}
          <span v-if="extractYear(activeRef)"> · {{ extractYear(activeRef) }}</span>
          <span v-if="containerLabel(activeRef)"> · {{ containerLabel(activeRef) }}</span>
        </div>
        <div class="library-inspector-pill-row">
          <span class="library-state-pill" :class="{ active: isInCurrentProject(activeRef._key) }">
            {{ isInCurrentProject(activeRef._key) ? t('In current project') : t('Global only') }}
          </span>
          <span v-if="activeRef._needsReview" class="library-state-pill warning">{{
            t('Needs review')
          }}</span>
          <span v-if="activeRef._pdfFile" class="library-state-pill">{{ t('PDF') }}</span>
        </div>
      </div>

      <div class="library-inspector-section">
        <div class="library-inspector-grid">
          <template v-for="row in activeDetailRows" :key="row.label">
            <div class="library-inspector-label">{{ row.label }}</div>
            <div class="library-inspector-value">{{ row.value }}</div>
          </template>
        </div>

        <div class="library-inspector-actions">
          <UiButton
            type="button"
            variant="primary"
            size="sm"
            class="library-inline-button"
            @click="toggleProjectMembership(activeRef._key)"
          >
            {{
              isInCurrentProject(activeRef._key)
                ? t('Remove from this project')
                : t('Add to project')
            }}
          </UiButton>
          <UiButton
            v-if="activePdfPath"
            type="button"
            variant="secondary"
            size="sm"
            class="library-quiet-button"
            @click="openReferencePdf(activeRef._key)"
          >
            {{ t('Open PDF') }}
          </UiButton>
          <UiButton
            type="button"
            variant="secondary"
            size="sm"
            class="library-quiet-button"
            @click="enterEditMode(activeRef._key)"
          >
            {{ t('Edit metadata') }}
          </UiButton>
          <UiButton
            v-if="isEditing"
            type="button"
            variant="ghost"
            size="sm"
            class="library-quiet-button"
            @click="exitEditMode"
          >
            {{ t('Back to overview') }}
          </UiButton>
        </div>
      </div>

      <div class="library-inspector-section">
        <div class="library-inspector-section-label">{{ t('Tags') }}</div>
        <div class="library-inspector-tags">
          <span v-for="tag in activeRef._tags || []" :key="tag" class="library-tag-chip">
            {{ tag }}
          </span>
          <span v-if="!activeRef._tags || activeRef._tags.length === 0" class="library-muted-copy">
            {{ t('Untagged') }}
          </span>
        </div>
      </div>

      <div class="library-inspector-section grow">
        <div class="library-inspector-section-label">
          {{ activeRef._summary ? t('Summary') : t('Abstract') }}
        </div>
        <div class="library-inspector-copy">
          {{ activeSummaryText || t('No abstract available.') }}
        </div>
      </div>
    </div>

    <div v-else-if="isLibraryLoading" class="library-inspector-empty">
      <div class="library-inspector-empty-title">{{ t('Loading references...') }}</div>
      <div class="library-inspector-empty-copy">
        {{ t('Global library is loading for this project context.') }}
      </div>
    </div>

    <div v-else class="library-inspector-empty">
      <div class="library-inspector-empty-title">{{ t('No reference selected') }}</div>
      <div class="library-inspector-empty-copy">
        {{ t('Select a reference to inspect and manage it for the current project.') }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useReferencesStore } from '../../stores/references'
import { useEditorStore } from '../../stores/editor'
import { useWorkspaceStore } from '../../stores/workspace'
import { useI18n } from '../../i18n'
import { useLibraryWorkbenchUi } from '../../composables/useLibraryWorkbenchUi'
import { openReferencePdfInWorkspace } from '../../domains/reference/referenceNavigation'
import UiButton from '../shared/ui/UiButton.vue'

const referencesStore = useReferencesStore()
const editorStore = useEditorStore()
const workspace = useWorkspaceStore()
const { t } = useI18n()
const {
  activeRef,
  activePdfPath,
  activeSummaryText,
  activeDetailRows,
  isLibraryLoading,
  formatAuthors,
  extractYear,
  containerLabel,
  isInCurrentProject,
} = useLibraryWorkbenchUi()

const isEditing = computed(() => referencesStore.libraryDetailMode === 'edit' && !!activeRef.value)

async function toggleProjectMembership(key) {
  if (!key) return
  if (isInCurrentProject(key)) {
    referencesStore.removeReference(key)
    await referencesStore.saveLibrary({ immediate: true })
    return
  }
  referencesStore.addKeyToWorkspace(key)
}

function openReferencePdf(key) {
  openReferencePdfInWorkspace({
    key,
    referencesStore,
    editorStore,
    workspace,
  })
}

function enterEditMode(key) {
  if (!key) return
  referencesStore.focusReferenceInLibrary(key, { mode: 'edit' })
}

function exitEditMode() {
  referencesStore.closeLibraryDetailMode()
}
</script>

<style scoped>
.library-inspector {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--bg-primary);
  color: var(--fg-primary);
}

.library-inspector-inner {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  flex-direction: column;
  gap: 12px;
  padding: 14px 14px 16px;
  overflow-y: auto;
}

.library-inspector-primary {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.library-inspector-kicker,
.library-inspector-section-label,
.library-inspector-label {
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--fg-muted);
}

.library-inspector-title {
  font-size: 1.08rem;
  line-height: 1.35;
  font-weight: 600;
  color: var(--fg-primary);
}

.library-inspector-subtitle,
.library-inspector-value,
.library-inspector-copy,
.library-inspector-empty-copy {
  font-size: 0.9rem;
  line-height: 1.55;
  color: var(--fg-secondary);
}

.library-inspector-pill-row,
.library-inspector-actions,
.library-inspector-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.library-inspector-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.library-inspector-section.grow {
  flex: 1 1 auto;
}

.library-inspector-grid {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: 6px 10px;
}

.library-inspector-copy {
  white-space: pre-wrap;
}

.library-inspector-empty {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  padding: 18px 16px;
}

.library-inspector-empty-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--fg-primary);
}

.library-inline-button,
.library-quiet-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 26px;
  border-radius: 10px;
  font-size: 0.86rem;
}

.library-state-pill,
.library-tag-chip {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 6px;
  border-radius: 9px;
  border: 1px solid var(--border);
  background: var(--bg-primary);
  font-size: 0.8rem;
  color: var(--fg-secondary);
}

.library-state-pill.active {
  color: var(--fg-primary);
  border-color: color-mix(in srgb, var(--accent) 18%, var(--border));
}

.library-state-pill.warning {
  color: color-mix(in srgb, var(--warning) 80%, var(--fg-primary));
}

.library-muted-copy {
  font-size: 0.86rem;
  color: var(--fg-muted);
}
</style>
