<template>
  <section class="reference-workbench" data-surface-context-guard="true">
    <header class="reference-workbench__toolbar">
      <div class="reference-workbench__toolbar-group reference-workbench__toolbar-group--actions">
        <UiButton class="reference-workbench__toolbar-action" variant="ghost" size="sm" @click="showAddDialog = true">
          {{ t('Add Reference') }}
        </UiButton>
        <UiButton
          class="reference-workbench__toolbar-action"
          variant="secondary"
          size="sm"
          :loading="referencesStore.importInFlight"
          :disabled="referencesStore.isLoading"
          @click="handleImportPdf"
        >
          {{ t('Import PDF') }}
        </UiButton>
        <UiButton
          class="reference-workbench__toolbar-action"
          variant="secondary"
          size="sm"
          :loading="referencesStore.importInFlight"
          :disabled="referencesStore.isLoading"
          @click="handleImportBibTeX"
        >
          {{ t('Import BibTeX') }}
        </UiButton>
        <UiButton
          class="reference-workbench__toolbar-action"
          variant="ghost"
          size="sm"
          :disabled="referencesStore.references.length === 0"
          @click="handleExportBibTeX"
        >
          {{ t('Export BibTeX') }}
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
        <button
          type="button"
          class="reference-workbench__head-button"
          :class="{ 'is-active': isSortActive('title') }"
          @click="toggleTitleSort"
        >
          <span>{{ t('Title') }}</span>
          <span v-if="isSortActive('title')" class="reference-workbench__sort-chip reference-workbench__sort-chip--icon" aria-hidden="true">
            <svg
              :class="{ 'is-desc': sortKey === 'title-desc' }"
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M2 6l3-3 3 3" />
            </svg>
          </span>
        </button>
        <button
          type="button"
          class="reference-workbench__head-button"
          :class="{ 'is-active': isSortActive('author') }"
          @click="toggleAuthorSort"
        >
          <span>{{ t('Authors') }}</span>
          <span v-if="isSortActive('author')" class="reference-workbench__sort-chip reference-workbench__sort-chip--icon" aria-hidden="true">
            <svg
              :class="{ 'is-desc': sortKey === 'author-desc' }"
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M2 6l3-3 3 3" />
            </svg>
          </span>
        </button>
        <button
          type="button"
          class="reference-workbench__head-button"
          :class="{ 'is-active': isSortActive('year') }"
          @click="toggleYearSort"
        >
          <span>{{ t('Year') }}</span>
          <span v-if="isSortActive('year')" class="reference-workbench__sort-chip reference-workbench__sort-chip--icon" aria-hidden="true">
            <svg
              :class="{ 'is-desc': sortKey === 'year-desc' }"
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M2 6l3-3 3 3" />
            </svg>
          </span>
        </button>
        <div>{{ t('Source') }}</div>
      </div>

      <div
        v-for="reference in filteredReferences"
        :key="reference.id"
        class="reference-workbench__row"
        :class="{ 'is-active': reference.id === selectedReference?.id }"
        @click="referencesStore.selectReference(reference.id)"
        @contextmenu.prevent="openReferenceContextMenu($event, reference)"
      >
        <div class="reference-workbench__cell reference-workbench__cell--title">
          <span class="reference-workbench__title-icon" aria-hidden="true">
            <IconFileText :size="15" :stroke-width="1.85" />
          </span>
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

    <SurfaceContextMenu
      :visible="menuVisible"
      :x="menuX"
      :y="menuY"
      :groups="menuGroups"
      @close="closeSurfaceContextMenu"
      @select="handleSurfaceContextMenuSelect"
    />

    <ReferenceAddDialog
      :visible="showAddDialog"
      @close="showAddDialog = false"
      @imported="handleManualImport"
    />
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import { IconFileText } from '@tabler/icons-vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { useToastStore } from '../../stores/toast'
import { useUxStatusStore } from '../../stores/uxStatus'
import { useI18n } from '../../i18n'
import { useReferencesStore } from '../../stores/references'
import { useSurfaceContextMenu } from '../../composables/useSurfaceContextMenu.js'
import { readWorkspaceTextFile, renameWorkspacePath } from '../../services/fileStoreIO'
import {
  mergeImportedReferences,
  parseBibTeXText,
} from '../../services/references/bibtexImport.js'
import { cslToReferenceRecord } from '../../domains/references/referenceInterop.js'
import { lookupByDoi, searchByMetadata } from '../../services/references/crossref.js'
import { writeReferenceLibrarySnapshot } from '../../services/references/referenceLibraryIO.js'
import ReferenceAddDialog from './ReferenceAddDialog.vue'
import SurfaceContextMenu from '../shared/SurfaceContextMenu.vue'
import UiButton from '../shared/ui/UiButton.vue'

const { t } = useI18n()
const referencesStore = useReferencesStore()
const workspace = useWorkspaceStore()
const toastStore = useToastStore()
const uxStatusStore = useUxStatusStore()
const showAddDialog = ref(false)
const {
  menuVisible,
  menuX,
  menuY,
  menuGroups,
  closeSurfaceContextMenu,
  openSurfaceContextMenu,
  handleSurfaceContextMenuSelect,
} = useSurfaceContextMenu()

const filteredReferences = computed(() => referencesStore.filteredReferences)
const selectedReference = computed(() => referencesStore.selectedReference)
const sortKey = computed({
  get: () => referencesStore.sortKey,
  set: (value) => referencesStore.setSortKey(value),
})
const availableCollections = computed(() => referencesStore.collections)

function getReferenceAuthorLabel(reference) {
  const authors = Array.isArray(reference?.authors) ? reference.authors : []
  if (!authors.length) return '—'
  if (authors.length === 1) return authors[0]
  return `${authors[0]} et al.`
}

function isSortActive(group) {
  return sortKey.value.startsWith(`${group}-`)
}

function toggleTitleSort() {
  referencesStore.setSortKey(sortKey.value === 'title-asc' ? 'title-desc' : 'title-asc')
}

function toggleAuthorSort() {
  referencesStore.setSortKey(sortKey.value === 'author-asc' ? 'author-desc' : 'author-asc')
}

function toggleYearSort() {
  referencesStore.setSortKey(sortKey.value === 'year-desc' ? 'year-asc' : 'year-desc')
}

function referenceIsInCollection(reference = {}, collectionKey = '') {
  const collection = availableCollections.value.find((item) => item.key === collectionKey)
  if (!collection) return false

  const memberships = Array.isArray(reference.collections) ? reference.collections : []
  const normalizedKey = String(collection.key || '').trim().toLowerCase()
  const normalizedLabel = String(collection.label || '').trim().toLowerCase()
  return memberships.some((value) => {
    const normalizedValue = String(value || '').trim().toLowerCase()
    return normalizedValue === normalizedKey || normalizedValue === normalizedLabel
  })
}

function buildReferenceJsonExport(reference = {}) {
  return JSON.stringify(reference, null, 2)
}

function normalizeFilenameSegment(value = '', fallback = 'reference') {
  const normalized = String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^-+|-+$/g, '')
  return normalized || fallback
}

function getReferenceBibTeX(reference = {}) {
  if (!reference?.id) return ''
  return referencesStore.exportBibTeX([reference.id])
}

function getPdfRenameTarget(reference = {}, nextBaseName = '') {
  const currentPath = String(reference?.pdfPath || '').trim()
  if (!currentPath) return null

  const filename = currentPath.split('/').pop() || ''
  const extensionIndex = filename.lastIndexOf('.')
  const extension = extensionIndex >= 0 ? filename.slice(extensionIndex) : ''
  const dir = currentPath.slice(0, Math.max(0, currentPath.lastIndexOf('/')))
  const baseName = normalizeFilenameSegment(nextBaseName, filename.replace(/\.[^.]+$/, ''))

  return {
    oldPath: currentPath,
    newPath: `${dir}/${baseName}${extension}`,
    nextBaseName: baseName,
    oldBaseName: filename.replace(/\.[^.]+$/, ''),
  }
}

function getFulltextRenameTarget(reference = {}, oldBaseName = '', nextBaseName = '') {
  const currentPath = String(reference?.fulltextPath || '').trim()
  if (!currentPath) return null

  const filename = currentPath.split('/').pop() || ''
  const extensionIndex = filename.lastIndexOf('.')
  const extension = extensionIndex >= 0 ? filename.slice(extensionIndex) : ''
  const currentBaseName = extensionIndex >= 0 ? filename.slice(0, extensionIndex) : filename

  if (currentBaseName !== oldBaseName) return null

  const dir = currentPath.slice(0, Math.max(0, currentPath.lastIndexOf('/')))
  return {
    oldPath: currentPath,
    newPath: `${dir}/${nextBaseName}${extension}`,
  }
}

async function copyTextToClipboard(text = '', successMessage = t('Copied to clipboard')) {
  if (!text) return
  if (typeof navigator?.clipboard?.writeText !== 'function') {
    throw new Error(t('Clipboard is unavailable'))
  }

  await navigator.clipboard.writeText(text)
  toastStore.show(successMessage, {
    type: 'success',
    duration: 1800,
  })
}

async function handleRenameReferencePdf(reference = {}) {
  const renameTarget = getPdfRenameTarget(reference, '')
  if (!renameTarget?.oldPath) {
    toastStore.show(t('No PDF attached'), {
      type: 'error',
      duration: 2800,
    })
    return
  }

  const nextName = window.prompt(t('Rename PDF'), renameTarget.oldBaseName)
  if (nextName == null) return

  const normalizedBaseName = normalizeFilenameSegment(nextName, renameTarget.oldBaseName)
  if (!normalizedBaseName || normalizedBaseName === renameTarget.oldBaseName) return

  const nextPdfTarget = getPdfRenameTarget(reference, normalizedBaseName)
  const nextFulltextTarget = getFulltextRenameTarget(
    reference,
    renameTarget.oldBaseName,
    normalizedBaseName
  )

  try {
    const pdfResult = await renameWorkspacePath(nextPdfTarget.oldPath, nextPdfTarget.newPath)
    if (!pdfResult?.ok) {
      throw new Error(
        pdfResult?.code === 'exists' ? t('A file with this name already exists') : t('Failed to rename PDF')
      )
    }

    let nextFulltextPath = reference.fulltextPath
    if (nextFulltextTarget) {
      const fulltextResult = await renameWorkspacePath(
        nextFulltextTarget.oldPath,
        nextFulltextTarget.newPath
      )
      if (!fulltextResult?.ok && fulltextResult?.code !== 'exists') {
        throw new Error(t('Failed to rename PDF'))
      }
      if (fulltextResult?.ok) {
        nextFulltextPath = nextFulltextTarget.newPath
      }
    }

    await referencesStore.updateReference(workspace.globalConfigDir, reference.id, {
      pdfPath: nextPdfTarget.newPath,
      fulltextPath: nextFulltextPath,
    })
  } catch (error) {
    toastStore.show(error?.message || t('Failed to rename PDF'), {
      type: 'error',
      duration: 3600,
    })
  }
}

async function handleRefreshReferenceMetadata(reference = {}) {
  try {
    let csl = null
    const identifier = String(reference.identifier || '').trim()

    if (/^10\.\d{4,9}\//i.test(identifier)) {
      csl = await lookupByDoi(identifier)
    }

    if (!csl) {
      const match = await searchByMetadata(
        reference.title,
        Array.isArray(reference.authors) ? reference.authors[0] || '' : '',
        reference.year
      )
      csl = match?.csl || null
    }

    if (!csl) {
      toastStore.show(t('No metadata match found'), {
        type: 'error',
        duration: 3200,
      })
      return
    }

    const refreshed = cslToReferenceRecord(csl, {
      id: reference.id,
      citationKey: reference.citationKey,
      pdfPath: reference.pdfPath,
      fulltextPath: reference.fulltextPath,
      collections: reference.collections,
      tags: reference.tags,
      notes: reference.notes,
      annotations: reference.annotations,
      rating: reference.rating,
      hasPdf: reference.hasPdf,
      hasFullText: reference.hasFullText,
    })

    await referencesStore.updateReference(workspace.globalConfigDir, reference.id, {
      ...refreshed,
      _source: reference._source,
      _zoteroKey: reference._zoteroKey,
      _zoteroLibrary: reference._zoteroLibrary,
      _importMethod: reference._importMethod,
      _pushedByShoulders: reference._pushedByShoulders,
      _shouldersPushPending: reference._shouldersPushPending,
    })
  } catch (error) {
    toastStore.show(error?.message || t('Failed to refresh metadata'), {
      type: 'error',
      duration: 3600,
    })
  }
}

async function handleExportReferenceBibTeX(reference = {}) {
  const content = getReferenceBibTeX(reference)
  if (!content) return

  const target = await save({
    title: t('Export BibTeX'),
    defaultPath: `${normalizeFilenameSegment(reference.citationKey || reference.title, 'reference')}.bib`,
    filters: [{ name: 'BibTeX', extensions: ['bib'] }],
  })

  if (!target) return

  try {
    await invoke('write_file', {
      path: String(target),
      content,
    })
    uxStatusStore.success(t('Exported BibTeX'), { duration: 2200 })
  } catch (error) {
    toastStore.show(error?.message || t('Failed to export BibTeX'), {
      type: 'error',
      duration: 5000,
    })
  }
}

async function handleDetailedExport(reference = {}) {
  const target = await save({
    title: t('Detailed Export'),
    defaultPath: `${normalizeFilenameSegment(reference.citationKey || reference.title, 'reference')}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })

  if (!target) return

  try {
    await invoke('write_file', {
      path: String(target),
      content: buildReferenceJsonExport(reference),
    })
    uxStatusStore.success(t('Detailed export saved'), { duration: 2200 })
  } catch (error) {
    toastStore.show(error?.message || t('Failed to export reference details'), {
      type: 'error',
      duration: 5000,
    })
  }
}

async function handleCopyReferenceBibTeX(reference = {}) {
  try {
    await copyTextToClipboard(getReferenceBibTeX(reference), t('Copied to clipboard'))
  } catch (error) {
    toastStore.show(error?.message || t('Failed to copy citation'), {
      type: 'error',
      duration: 3200,
    })
  }
}

function openReferenceContextMenu(event, reference) {
  referencesStore.selectReference(reference.id)

  const groups = [
    {
      key: 'reference-maintenance',
      items: [
        {
          key: `rename-pdf:${reference.id}`,
          label: t('Rename PDF'),
          disabled: !String(reference.pdfPath || '').trim(),
          action: () => handleRenameReferencePdf(reference),
        },
        {
          key: `refresh-metadata:${reference.id}`,
          label: t('Refresh Metadata'),
          action: () => handleRefreshReferenceMetadata(reference),
        },
      ],
    },
    {
      key: 'reference-collections',
      items: [
        {
          key: `collections:${reference.id}`,
          label: t('Collections'),
          children: availableCollections.value.length
            ? availableCollections.value.map((collection) => ({
                key: `collection:${reference.id}:${collection.key}`,
                label: collection.label,
                checked: referenceIsInCollection(reference, collection.key),
                action: () =>
                  referencesStore.toggleReferenceCollection(
                    workspace.globalConfigDir,
                    reference.id,
                    collection.key
                  ),
              }))
            : [
                {
                  key: `collections-empty:${reference.id}`,
                  label: t('No collections yet'),
                  disabled: true,
                },
              ],
        },
      ],
    },
    {
      key: 'reference-exports',
      items: [
        {
          key: `export-bibtex:${reference.id}`,
          label: t('Export BibTeX...'),
          action: () => handleExportReferenceBibTeX(reference),
        },
        {
          key: `export-detailed:${reference.id}`,
          label: t('Detailed Export...'),
          action: () => handleDetailedExport(reference),
        },
        {
          key: `copy-bibtex:${reference.id}`,
          label: t('Copy BibTeX'),
          action: () => handleCopyReferenceBibTeX(reference),
        },
      ],
    },
    {
      key: 'reference-actions',
      items: [
        {
          key: `delete:${reference.id}`,
          label: t('Delete'),
          danger: true,
          action: () => referencesStore.removeReference(workspace.globalConfigDir, reference.id),
        },
      ],
    },
  ]

  openSurfaceContextMenu({
    x: event.clientX,
    y: event.clientY,
    groups,
  })
}

function handleManualImport(importedCount = 0) {
  if (importedCount > 0) {
    uxStatusStore.success(t('Imported {count} references', { count: importedCount }), {
      duration: 2200,
    })
  }
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
        ? await referencesStore.importBibTeXContent(workspace.globalConfigDir, content)
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

async function handleImportPdf() {
  const selected = await open({
    multiple: false,
    title: t('Import PDF'),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })

  if (!selected || Array.isArray(selected)) return

  const statusId = uxStatusStore.show(t('Importing PDF...'), {
    type: 'info',
    duration: 0,
  })

  try {
    const importedReference = await referencesStore.importReferencePdf(
      workspace.globalConfigDir,
      String(selected)
    )
    uxStatusStore.success(
      importedReference ? t('Imported PDF into reference library') : t('No new references were added'),
      { duration: 2200 }
    )
  } catch (error) {
    const message = error?.message || String(error || 'Failed to import PDF')
    uxStatusStore.error(t('Failed to import PDF'), { duration: 3200 })
    toastStore.show(message, { type: 'error', duration: 5000 })
  } finally {
    uxStatusStore.clear(statusId)
  }
}

async function handleExportBibTeX() {
  const content = referencesStore.exportBibTeX(filteredReferences.value.map((reference) => reference.id))
  const target = await save({
    title: t('Export BibTeX'),
    defaultPath: 'references.bib',
    filters: [{ name: 'BibTeX', extensions: ['bib'] }],
  })

  if (!target) return

  try {
    await invoke('write_file', {
      path: String(target),
      content,
    })
    uxStatusStore.success(t('Exported BibTeX'), { duration: 2200 })
  } catch (error) {
    toastStore.show(error?.message || t('Failed to export BibTeX'), {
      type: 'error',
      duration: 5000,
    })
  }
}

async function importBibTeXWithFallback(content = '') {
  const importedReferences = parseBibTeXText(content)
  const mergedReferences = mergeImportedReferences(referencesStore.references, importedReferences)
  const importedCount = Math.max(0, mergedReferences.length - referencesStore.references.length)

  const snapshot = {
    version: 2,
    citationStyle: referencesStore.citationStyle,
    collections: referencesStore.collections,
    tags: referencesStore.tags,
    references: mergedReferences,
  }

  await writeReferenceLibrarySnapshot(workspace.globalConfigDir, snapshot)

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
  background: transparent;
}

.reference-workbench__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 36px;
  padding: 0 12px;
  border-bottom: 1px solid var(--workbench-divider);
}

.reference-workbench__toolbar-group {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.reference-workbench__toolbar-group--actions {
  flex: 0 0 auto;
}

.reference-workbench__toolbar-group--actions :deep(.reference-workbench__toolbar-action) {
  min-height: 28px;
  padding: 0 10px;
  border-color: transparent !important;
  background: transparent !important;
  box-shadow: none !important;
  color: color-mix(in srgb, var(--text-secondary) 88%, transparent);
}

.reference-workbench__toolbar-group--actions :deep(.reference-workbench__toolbar-action:hover:not(:disabled)) {
  background: color-mix(in srgb, var(--surface-hover) 18%, transparent) !important;
  color: var(--text-primary);
}

.reference-workbench__toolbar-group--actions :deep(.reference-workbench__toolbar-action:active:not(:disabled)) {
  background: color-mix(in srgb, var(--surface-hover) 24%, transparent) !important;
}

.reference-workbench__content {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
  padding: 6px 0 20px;
}

.reference-workbench__table-head,
.reference-workbench__row {
  display: grid;
  grid-template-columns: minmax(280px, 3fr) minmax(140px, 1.35fr) 92px minmax(160px, 1.4fr);
  align-items: center;
  gap: 14px;
}

.reference-workbench__table-head {
  position: sticky;
  top: 0;
  z-index: 2;
  padding: 4px 12px;
  border-bottom: 1px solid var(--workbench-divider-soft);
  background: var(--panel-surface);
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.reference-workbench__head-button {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.reference-workbench__head-button.is-active {
  color: var(--text-primary);
}

.reference-workbench__sort-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  min-height: 20px;
  padding: 0 6px;
  border-radius: 7px;
  background: color-mix(in srgb, var(--surface-hover) 22%, transparent);
  color: color-mix(in srgb, var(--text-secondary) 88%, transparent);
  font-size: 10.5px;
  font-weight: var(--workbench-weight-medium);
  line-height: 1;
}

.reference-workbench__sort-chip--icon {
  padding: 0 4px;
}

.reference-workbench__sort-chip--icon svg.is-desc {
  transform: rotate(180deg);
}

.reference-workbench__row {
  min-height: 32px;
  padding: 0 12px;
  border-radius: 4px;
  margin: 1px 6px;
  cursor: pointer;
  transition: none; /* Native lists don't animate hover bg */
}

.reference-workbench__row:hover {
  background: var(--sidebar-item-hover);
}

.reference-workbench__row.is-active,
.reference-workbench__row.ui-list-row.is-active {
  background: var(--list-active-bg);
  color: var(--list-active-fg) !important;
  box-shadow: none;
}

.reference-workbench__row.is-active .reference-workbench__cell,
.reference-workbench__row.ui-list-row.is-active .reference-workbench__cell {
  color: var(--list-active-fg) !important;
}

.reference-workbench__cell {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  color: var(--text-primary);
  font-size: 13px;
}

.reference-workbench__cell--title {
  gap: 9px;
  font-weight: 500;
}

.reference-workbench__title-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  color: color-mix(in srgb, var(--text-secondary) 86%, transparent);
}

.reference-workbench__truncate {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reference-workbench__empty {
  padding: 16px 12px;
}

@media (max-width: 1200px) {
  .reference-workbench__table-head,
  .reference-workbench__row {
    grid-template-columns: minmax(220px, 2.5fr) minmax(120px, 1.2fr) 84px minmax(120px, 1.2fr);
    gap: 12px;
  }
}

@media (max-width: 920px) {
  .reference-workbench__toolbar {
    flex-wrap: wrap;
    padding-top: 6px;
    padding-bottom: 6px;
  }

  .reference-workbench__toolbar-group--actions {
    width: 100%;
  }
}
</style>
