<template>
  <section class="reference-workbench" data-surface-context-guard="true">
    <header class="reference-workbench__header">
      <div>
        <h1 class="reference-workbench__title">{{ currentSectionLabel }}</h1>
      </div>
      <div class="reference-workbench__header-actions">
        <div class="reference-workbench__summary">
          {{ t('{count} items', { count: filteredReferences.length }) }}
        </div>
        <UiButton
          variant="secondary"
          size="sm"
          :loading="referencesStore.importInFlight"
          :disabled="referencesStore.isLoading"
          @click="handleImportBibTeX"
        >
          {{ t('Import BibTeX') }}
        </UiButton>
      </div>
    </header>

    <div v-if="referencesStore.isLoading" class="reference-workbench__empty ui-empty-copy">
      {{ t('Loading references...') }}
    </div>

    <div v-else-if="referencesStore.loadError" class="reference-workbench__empty ui-empty-copy">
      {{ referencesStore.loadError }}
    </div>

    <div v-else-if="filteredReferences.length === 0" class="reference-workbench__empty ui-empty-copy">
      {{ t('No references in this section yet.') }}
    </div>

    <div v-else class="reference-workbench__content">
      <div class="reference-workbench__table-head">
        <div>{{ t('Title') }}</div>
        <div>{{ t('Authors') }}</div>
        <div>{{ t('Year') }}</div>
        <div>{{ t('Source') }}</div>
      </div>

      <div
        v-for="reference in filteredReferences"
        :key="reference.id"
        class="reference-workbench__row ui-list-row"
        :class="{ 'is-active': reference.id === selectedReference?.id }"
        @click="referencesStore.selectReference(reference.id)"
      >
        <div class="reference-workbench__cell reference-workbench__cell--title">
          <IconFileText :size="16" :stroke-width="1.8" />
          <span class="reference-workbench__truncate">{{ reference.title }}</span>
        </div>
        <div class="reference-workbench__cell">
          <span class="reference-workbench__truncate">{{ getReferenceAuthorLabel(reference) }}</span>
        </div>
        <div class="reference-workbench__cell">
          {{ reference.year || '—' }}
        </div>
        <div class="reference-workbench__cell">
          <span class="reference-workbench__truncate">{{ reference.source || '—' }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { open } from '@tauri-apps/plugin-dialog'
import { IconFileText } from '@tabler/icons-vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { useToastStore } from '../../stores/toast'
import { useUxStatusStore } from '../../stores/uxStatus'
import { useI18n } from '../../i18n'
import { getReferenceSectionLabelKey } from '../../domains/references/referencePresentation.js'
import { useReferencesStore } from '../../stores/references'
import { readWorkspaceTextFile } from '../../services/fileStoreIO'
import {
  mergeImportedReferences,
  parseBibTeXText,
} from '../../services/references/bibtexImport.js'
import { writeReferenceLibrarySnapshot } from '../../services/references/referenceLibraryIO.js'
import UiButton from '../shared/ui/UiButton.vue'

const { t } = useI18n()
const referencesStore = useReferencesStore()
const workspace = useWorkspaceStore()
const toastStore = useToastStore()
const uxStatusStore = useUxStatusStore()

const filteredReferences = computed(() => referencesStore.filteredReferences)
const selectedReference = computed(() => referencesStore.selectedReference)
const currentSectionLabel = computed(() => {
  const sectionKey =
    referencesStore.librarySections.find((section) => section.key === referencesStore.selectedSectionKey)
      ?.key || 'all'
  return t(getReferenceSectionLabelKey(sectionKey))
})

function getReferenceAuthorLabel(reference) {
  const authors = Array.isArray(reference?.authors) ? reference.authors : []
  if (!authors.length) return '—'
  if (authors.length === 1) return authors[0]
  return `${authors[0]} et al.`
}

async function handleImportBibTeX() {
  const selected = await open({
    multiple: false,
    title: t('Import BibTeX'),
    filters: [{ name: 'BibTeX', extensions: ['bib'] }],
  })

  if (!selected || Array.isArray(selected)) return

  const statusId = uxStatusStore.show(t('Importing BibTeX...'), {
    type: 'info',
    duration: 0,
  })

  try {
    const content = await readWorkspaceTextFile(String(selected))
    const importedCount =
      typeof referencesStore.importBibTeXContent === 'function'
        ? await referencesStore.importBibTeXContent(workspace.workspaceDataDir, content)
        : await importBibTeXWithFallback(content)

    uxStatusStore.success(
      importedCount > 0
        ? t('Imported {count} references', { count: importedCount })
        : t('No new references were added'),
      { duration: 2200 }
    )
  } catch (error) {
    const message = error?.message || String(error || 'Failed to import BibTeX')
    uxStatusStore.error(t('Failed to import BibTeX'), { duration: 3200 })
    toastStore.show(message, { type: 'error', duration: 5000 })
  } finally {
    uxStatusStore.clear(statusId)
  }
}

async function importBibTeXWithFallback(content = '') {
  const importedReferences = parseBibTeXText(content)
  const mergedReferences = mergeImportedReferences(referencesStore.references, importedReferences)
  const importedCount = Math.max(0, mergedReferences.length - referencesStore.references.length)

  const snapshot = {
    version: 1,
    collections: referencesStore.collections,
    tags: referencesStore.tags,
    references: mergedReferences,
  }

  await writeReferenceLibrarySnapshot(workspace.workspaceDataDir, snapshot)

  if (typeof referencesStore.applyLibrarySnapshot === 'function') {
    referencesStore.applyLibrarySnapshot(snapshot)
  } else {
    referencesStore.references = snapshot.references
    referencesStore.collections = snapshot.collections
    referencesStore.tags = snapshot.tags
  }

  const importedSelection = mergedReferences.find((reference) =>
    importedReferences.some((candidate) => candidate.id === reference.id)
  )
  if (importedSelection) {
    referencesStore.selectedReferenceId = importedSelection.id
  }

  return importedCount
}
</script>

<style scoped>
.reference-workbench {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: color-mix(in srgb, var(--panel-surface) 62%, transparent);
}

.reference-workbench__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 2px 28px 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--border-subtle) 10%, transparent);
}

.reference-workbench__header-actions {
  display: inline-flex;
  align-items: center;
  gap: 12px;
}

.reference-workbench__title {
  margin: 0;
  color: var(--text-primary);
  font-size: 17px;
  font-weight: 680;
  letter-spacing: -0.015em;
}

.reference-workbench__summary {
  color: color-mix(in srgb, var(--text-secondary) 78%, transparent);
  font-size: 13px;
  font-weight: 560;
  white-space: nowrap;
}

.reference-workbench__content {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
  padding: 6px 18px 24px;
}

.reference-workbench__table-head,
.reference-workbench__row {
  display: grid;
  grid-template-columns: minmax(280px, 3fr) minmax(140px, 1.35fr) 92px minmax(160px, 1.4fr);
  align-items: center;
  gap: 14px;
}

.reference-workbench__table-head {
  padding: 0 16px 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--border-subtle) 16%, transparent);
  color: color-mix(in srgb, var(--text-secondary) 84%, transparent);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.reference-workbench__row {
  min-height: 44px;
  padding: 0 16px;
  border-radius: 10px;
  cursor: pointer;
}

.reference-workbench__cell {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  color: color-mix(in srgb, var(--text-secondary) 90%, transparent);
  font-size: 12.5px;
  font-weight: 500;
}

.reference-workbench__cell--title {
  gap: 9px;
  color: var(--text-primary);
  font-size: 13.5px;
  font-weight: 560;
}

.reference-workbench__truncate {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reference-workbench__empty {
  padding: 24px 28px;
}

@media (max-width: 1200px) {
  .reference-workbench__table-head,
  .reference-workbench__row {
    grid-template-columns: minmax(220px, 2.5fr) minmax(120px, 1.2fr) 84px minmax(120px, 1.2fr);
    gap: 12px;
  }
}
</style>
