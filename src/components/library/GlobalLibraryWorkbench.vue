<template>
  <div class="library-workbench h-full min-h-0">
    <div class="library-shell h-full min-h-0" :class="{ 'is-editing': isEditing }">
      <template v-if="isEditing && activeRef">
        <section class="library-editor-stage">
          <div class="library-editor-toolbar">
            <div class="library-editor-meta">
              <div class="library-section-label">{{ t('Edit reference metadata') }}</div>
            </div>

            <div class="library-editor-actions">
              <UiButton
                type="button"
                variant="secondary"
                size="sm"
                class="library-inline-button"
                @click="exitEditMode"
              >
                {{ t('Back to overview') }}
              </UiButton>
            </div>
          </div>

          <div class="library-editor-surface">
            <LibraryReferenceEditor :refKey="activeRef._key" />
          </div>
        </section>
      </template>

      <template v-else>
        <main class="library-main" @contextmenu="openTableEmptyContextMenu">
          <div class="library-toolbar">
            <div class="library-toolbar-row library-toolbar-row--primary">
              <div class="library-search-shell">
                <UiInput
                  v-model="searchQuery"
                  class="library-search-input"
                  size="sm"
                  :placeholder="t('Search title, author, DOI, tags, abstract...')"
                  autocomplete="off"
                  autocorrect="off"
                  autocapitalize="off"
                  spellcheck="false"
                />
              </div>

              <div class="library-toolbar-actions">
                <UiButton
                  ref="toolbarSortBtnEl"
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  icon-only
                  class="library-toolbar-icon-button"
                  :class="{ 'is-active': showToolbarSortMenu }"
                  :title="activeSortLabel"
                  :aria-label="activeSortLabel"
                  @click="toggleToolbarSortMenu"
                >
                  <IconArrowsSort :size="12" :stroke-width="1.7" />
                </UiButton>

                <UiButton
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  icon-only
                  class="library-toolbar-icon-button"
                  :title="t('Import references')"
                  :aria-label="t('Import references')"
                  @click="showImportDialog = true"
                >
                  <IconPlus :size="12" :stroke-width="1.8" />
                </UiButton>
              </div>
            </div>

            <Teleport to="body">
              <template v-if="showToolbarSortMenu">
                <div class="fixed inset-0 z-50" @click="showToolbarSortMenu = false"></div>
                <div
                  class="context-menu z-50 library-toolbar-sort-menu"
                  :style="toolbarSortMenuPos"
                >
                  <div
                    v-for="option in librarySortOptions"
                    :key="option.id"
                    class="context-menu-item"
                    :class="{ 'library-toolbar-sort-option-active': sortKey === option.id }"
                    @click="selectToolbarSort(option.id)"
                  >
                    {{ option.label }}
                  </div>
                </div>
              </template>
            </Teleport>

            <div v-if="selectedTags.length > 0" class="library-filter-row is-tag-summary">
              <div class="library-section-label">{{ t('Tags') }}</div>
              <div class="library-filter-chip-row">
                <UiButton
                  v-for="tag in selectedTags"
                  :key="tag"
                  variant="secondary"
                  size="sm"
                  :active="true"
                  class="library-filter-chip"
                  @click="toggleTag(tag)"
                >
                  {{ tag }}
                </UiButton>
              </div>
            </div>

            <div v-if="hasBatchSelection" class="library-batch-row">
              <div class="library-batch-head">
                <div class="library-batch-label">
                  {{ t('Selected ({count})', { count: selectedKeys.length }) }}
                </div>
                <div class="library-batch-actions">
                  <div class="library-batch-group">
                    <UiButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      class="library-inline-button"
                      @click="addSelectionToWorkspace"
                    >
                      {{ t('Add to project') }}
                    </UiButton>
                    <UiButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      class="library-inline-button"
                      @click="removeSelectionFromWorkspace"
                    >
                      {{ t('Remove from this project') }}
                    </UiButton>
                  </div>

                  <div class="library-batch-group is-fluid">
                    <UiSelect
                      v-model="batchTagAction"
                      size="sm"
                      class="library-select library-batch-select"
                    >
                      <option value="add">{{ t('Add tags') }}</option>
                      <option value="replace">{{ t('Replace tags') }}</option>
                      <option value="remove">{{ t('Remove tags') }}</option>
                    </UiSelect>
                    <UiInput
                      v-model="tagActionInput"
                      class="library-batch-input"
                      size="sm"
                      :placeholder="t('comma-separated')"
                      autocomplete="off"
                      autocorrect="off"
                      autocapitalize="off"
                      spellcheck="false"
                    />
                    <UiButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      class="library-inline-button"
                      @click="applyTagAction(batchTagAction)"
                    >
                      {{ t('Apply') }}
                    </UiButton>
                  </div>
                </div>
                <UiButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  class="library-link-button"
                  @click="clearSelection"
                >
                  {{ t('Clear') }}
                </UiButton>
              </div>
            </div>
          </div>

          <div class="library-table">
            <div class="library-table-header">
              <div></div>
              <div>{{ t('Reference') }}</div>
              <div>{{ t('Tags') }}</div>
              <div>{{ t('Current project') }}</div>
            </div>

            <div class="library-table-body">
              <template v-if="isLibraryLoading">
                <div class="library-empty-state">
                  <div class="library-empty-title">{{ t('Loading references...') }}</div>
                  <div class="library-empty-copy">
                    {{ t('Global library is loading for this project context.') }}
                  </div>
                </div>
              </template>

              <template v-else-if="filteredRefs.length === 0">
                <div class="library-empty-state">
                  <div class="library-empty-title">{{ t('Nothing in this view yet.') }}</div>
                  <div class="library-empty-copy">
                    {{
                      t(
                        'Switch library views, clear tag filters, or import references into the global library.'
                      )
                    }}
                  </div>
                </div>
              </template>

              <template v-else>
                <div
                  v-for="refItem in filteredRefs"
                  :key="refItem._key"
                  class="library-table-row"
                  :class="{ 'is-focused': activeKey === refItem._key }"
                  @click="focusReference(refItem._key)"
                  @dblclick="enterEditMode(refItem._key)"
                  @contextmenu.prevent.stop="openRowContextMenu($event, refItem._key)"
                >
                  <div class="library-checkbox-cell" @click.stop>
                    <UiCheckbox
                      :model-value="selectedKeySet.has(refItem._key)"
                      size="sm"
                      :aria-label="`Select reference ${refItem._key}`"
                      @update:modelValue="toggleSelection(refItem._key)"
                    />
                  </div>

                  <div class="library-ref-cell">
                    <div class="library-ref-title-row">
                      <span class="library-ref-title">{{
                        refItem.title || `@${refItem._key}`
                      }}</span>
                      <span v-if="refItem._needsReview" class="library-state-pill warning">{{
                        t('Needs review')
                      }}</span>
                      <span v-if="refItem._pdfFile" class="library-state-pill">{{ t('PDF') }}</span>
                    </div>
                    <div class="library-ref-meta">
                      <span>{{ formatAuthors(refItem) || t('Unknown author') }}</span>
                      <span v-if="extractYear(refItem)"> · {{ extractYear(refItem) }}</span>
                      <span v-if="containerLabel(refItem)"> · {{ containerLabel(refItem) }}</span>
                      <span class="library-ref-key">@{{ refItem._key }}</span>
                    </div>
                  </div>

                  <div class="library-tags-cell">
                    <template v-if="(refItem._tags || []).length > 0">
                      <span
                        v-for="tag in visibleTags(refItem)"
                        :key="`${refItem._key}-${tag}`"
                        class="library-tag-chip"
                      >
                        {{ tag }}
                      </span>
                      <span v-if="hiddenTagCount(refItem) > 0" class="library-tag-chip muted">
                        +{{ hiddenTagCount(refItem) }}
                      </span>
                    </template>
                    <span v-else class="library-muted-copy">
                      {{ t('Untagged') }}
                    </span>
                  </div>

                  <div class="library-project-cell">
                    <span
                      class="library-state-pill"
                      :class="{ active: isInCurrentProject(refItem._key) }"
                    >
                      {{ isInCurrentProject(refItem._key) ? t('In project') : t('Library only') }}
                    </span>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </main>
      </template>
    </div>

    <AddReferenceDialog v-if="showImportDialog" @close="showImportDialog = false" />

    <SurfaceContextMenu
      :visible="contextMenu.visible"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :groups="contextMenuGroups"
      @close="closeContextMenu"
      @select="handleContextMenuSelect"
    />
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { ask } from '@tauri-apps/plugin-dialog'
import { IconArrowsSort, IconPlus } from '@tabler/icons-vue'
import { useReferencesStore } from '../../stores/references'
import { useEditorStore } from '../../stores/editor'
import { useWorkspaceStore } from '../../stores/workspace'
import { useI18n } from '../../i18n'
import { useLibraryWorkbenchUi } from '../../composables/useLibraryWorkbenchUi'
import { openReferencePdfInWorkspace } from '../../domains/reference/referenceNavigation'
import AddReferenceDialog from '../sidebar/AddReferenceDialog.vue'
import SurfaceContextMenu from '../shared/SurfaceContextMenu.vue'
import UiButton from '../shared/ui/UiButton.vue'
import UiCheckbox from '../shared/ui/UiCheckbox.vue'
import UiInput from '../shared/ui/UiInput.vue'
import UiSelect from '../shared/ui/UiSelect.vue'

const LibraryReferenceEditor = defineAsyncComponent(() => import('./LibraryReferenceEditor.vue'))

const referencesStore = useReferencesStore()
const editorStore = useEditorStore()
const workspace = useWorkspaceStore()
const { t } = useI18n()
const {
  activeView,
  searchQuery,
  sortKey,
  selectedTags,
  selectedKeys,
  tagActionInput,
  batchTagAction,
  showImportDialog,
  allRefs,
  selectedKeySet,
  activeKey,
  activeRef,
  isLibraryLoading,
  hasBatchSelection,
  hasSelection,
  hasSelectionInProject,
  hasActiveFilters,
  sidebarViewOptions,
  librarySortOptions,
  filteredRefs,
  formatAuthors,
  extractYear,
  containerLabel,
  parseTags,
  visibleTags,
  hiddenTagCount,
  clearFilters,
  activateView,
  toggleTag,
  clearSelection,
  isInCurrentProject,
} = useLibraryWorkbenchUi()

const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  scope: '',
  refKey: null,
})

const isEditing = computed(() => referencesStore.libraryDetailMode === 'edit' && !!activeRef.value)
const toolbarSortBtnEl = ref(null)
const showToolbarSortMenu = ref(false)
const toolbarSortMenuPos = ref({ position: 'fixed', left: '0px', top: '0px' })
const activeSortLabel = computed(
  () => librarySortOptions.value.find((option) => option.id === sortKey.value)?.label || t('Sort')
)

const contextMenuRef = computed(() => {
  if (!contextMenu.value.refKey) return null
  return referencesStore.getByKey(contextMenu.value.refKey) || null
})

const contextMenuGroups = computed(() => {
  if (!contextMenu.value.visible) return []

  const scope = contextMenu.value.scope
  const refItem = contextMenuRef.value
  if ((scope === 'row' || scope === 'detail') && refItem?._key) {
    const key = refItem._key
    const items = []
    if (scope === 'row') {
      items.push({ key: 'open-details', label: t('Open details') })
    }
    items.push({ key: 'edit-metadata', label: t('Edit metadata') })
    if (referencesStore.pdfPathForKey(key)) {
      items.push({ key: 'open-pdf', label: t('Open PDF') })
    }

    const projectItem = {
      key: 'toggle-project-membership',
      label: isInCurrentProject(key) ? t('Remove from this project') : t('Add to project'),
      danger: isInCurrentProject(key),
    }

    return [
      { key: 'reference-actions', items },
      { key: 'reference-project', items: [projectItem] },
      {
        key: 'reference-danger',
        items: [{ key: 'delete-global', label: t('Delete from global library'), danger: true }],
      },
    ]
  }

  const generalItems = [{ key: 'import-references', label: t('Import references') }]
  if (hasSelection.value) {
    generalItems.push({ key: 'clear-selection', label: t('Clear selection') })
  }
  if (hasActiveFilters.value) {
    generalItems.push({ key: 'clear-filters', label: t('Clear filters') })
  }

  const groups = [{ key: 'library-general', items: generalItems }]

  if (hasSelection.value) {
    const selectionItems = [
      { key: 'add-selection-to-project', label: t('Add selection to project') },
      {
        key: 'remove-selection-from-project',
        label: t('Remove selection from this project'),
        danger: hasSelectionInProject.value,
      },
      {
        key: 'delete-selection-global',
        label: t('Delete selection from global library'),
        danger: true,
      },
    ]
    groups.push({ key: 'library-selection', items: selectionItems })
  }

  groups.push({
    key: 'library-views',
    label: t('Views'),
    items: sidebarViewOptions.value.map((view) => ({
      key: `view:${view.id}`,
      label: view.label,
      checked: activeView.value === view.id,
      meta: String(view.count),
    })),
  })

  groups.push({
    key: 'library-sort',
    label: t('Sort'),
    items: librarySortOptions.value.map((option) => ({
      key: `sort:${option.id}`,
      label: option.label,
      checked: sortKey.value === option.id,
    })),
  })

  return groups
})

watch(
  filteredRefs,
  (refs) => {
    closeContextMenu()
    const visibleKeys = new Set(refs.map((item) => item._key))
    selectedKeys.value = selectedKeys.value.filter((key) => visibleKeys.has(key))

    if (referencesStore.activeKey && referencesStore.getByKey(referencesStore.activeKey)) {
      if (isEditing.value) return
      if (visibleKeys.has(referencesStore.activeKey)) return
    }

    referencesStore.activeKey = refs[0]?._key || null
  },
  { immediate: true }
)

watch(
  allRefs,
  (refs) => {
    closeContextMenu()
    const availableKeys = new Set(refs.map((item) => item._key))
    selectedKeys.value = selectedKeys.value.filter((key) => availableKeys.has(key))
    if (referencesStore.activeKey && !availableKeys.has(referencesStore.activeKey)) {
      referencesStore.activeKey = null
      referencesStore.closeLibraryDetailMode()
    }
  },
  { deep: true }
)

watch(isEditing, () => {
  closeContextMenu()
  showToolbarSortMenu.value = false
})

function getToolbarAnchorPosition(anchor, menuWidth = 208) {
  if (!anchor?.getBoundingClientRect) {
    return { position: 'fixed', left: '0px', top: '0px' }
  }

  const rect = anchor.getBoundingClientRect()
  const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8))

  return {
    position: 'fixed',
    left: `${left}px`,
    top: `${rect.bottom + 4}px`,
  }
}

function toggleToolbarSortMenu() {
  showToolbarSortMenu.value = !showToolbarSortMenu.value
  if (showToolbarSortMenu.value) {
    toolbarSortMenuPos.value = getToolbarAnchorPosition(toolbarSortBtnEl.value)
  }
}

function selectToolbarSort(nextSortKey) {
  sortKey.value = nextSortKey
  showToolbarSortMenu.value = false
}

function closeContextMenu() {
  contextMenu.value.visible = false
}

function shouldIgnoreEmptyContextMenuTarget(event) {
  const target = event?.target
  if (!(target instanceof Element)) return false
  return !!target.closest('button, input, textarea, select, a, label, .library-table-row')
}

function openContextMenu(event, scope, refKey = null) {
  event.preventDefault()
  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    scope,
    refKey,
  }
}

function openRowContextMenu(event, key) {
  if (!key) return
  if (activeKey.value !== key || isEditing.value) {
    referencesStore.focusReferenceInLibrary(key, { mode: 'browse' })
  }
  openContextMenu(event, 'row', key)
}

function openTableEmptyContextMenu(event) {
  if (shouldIgnoreEmptyContextMenuTarget(event)) return
  openContextMenu(event, 'table-empty')
}

function focusReference(key) {
  referencesStore.focusReferenceInLibrary(key, { mode: 'browse' })
}

function enterEditMode(key) {
  referencesStore.focusReferenceInLibrary(key, { mode: 'edit' })
}

function exitEditMode() {
  referencesStore.closeLibraryDetailMode()
}

function toggleSelection(key) {
  if (selectedKeySet.value.has(key)) {
    selectedKeys.value = selectedKeys.value.filter((item) => item !== key)
    if (referencesStore.activeKey === key && selectedKeys.value.length > 0) {
      referencesStore.activeKey = selectedKeys.value[0]
    }
    return
  }
  selectedKeys.value = [...selectedKeys.value, key]
  referencesStore.activeKey = key
}

function addSelectionToWorkspace() {
  for (const key of selectedKeys.value) {
    referencesStore.addKeyToWorkspace(key)
  }
}

async function removeSelectionFromWorkspace() {
  if (selectedKeys.value.length === 0) return
  referencesStore.removeReferences(selectedKeys.value)
  await referencesStore.saveLibrary({ immediate: true })
}

async function toggleProjectMembership(key) {
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

function applyTagAction(action) {
  const keys = selectedKeys.value
  const tags = parseTags(tagActionInput.value)
  if (keys.length === 0) return
  if (action === 'replace') {
    referencesStore.replaceTagsForReferences(keys, tags)
  } else if (action === 'remove') {
    referencesStore.removeTagsFromReferences(keys, tags)
  } else {
    referencesStore.addTagsToReferences(keys, tags)
  }
  tagActionInput.value = ''
}

async function deleteReferencesFromGlobal(keys = []) {
  const uniqueKeys = Array.from(new Set((keys || []).filter(Boolean)))
  if (uniqueKeys.length === 0) return

  const msg =
    uniqueKeys.length === 1
      ? t('Delete reference @{key} from the global library?', { key: uniqueKeys[0] })
      : t('Delete {count} references from the global library?', { count: uniqueKeys.length })
  const yes = await ask(msg, {
    title: t('Confirm Global Delete'),
    kind: 'warning',
  })
  if (!yes) return

  await referencesStore.removeReferencesFromGlobal(uniqueKeys)
}

async function handleContextMenuSelect(actionKey) {
  const key = contextMenu.value.refKey
  if (actionKey.startsWith('view:')) {
    activateView(actionKey.slice(5))
    return
  }
  if (actionKey.startsWith('sort:')) {
    sortKey.value = actionKey.slice(5)
    return
  }

  switch (actionKey) {
    case 'open-details':
      focusReference(key)
      workspace.openRightSidebar()
      break
    case 'edit-metadata':
      enterEditMode(key)
      break
    case 'toggle-project-membership':
      await toggleProjectMembership(key)
      break
    case 'open-pdf':
      openReferencePdf(key)
      break
    case 'delete-global':
      await deleteReferencesFromGlobal([key])
      break
    case 'import-references':
      showImportDialog.value = true
      break
    case 'clear-selection':
      clearSelection()
      break
    case 'clear-filters':
      clearFilters()
      break
    case 'add-selection-to-project':
      addSelectionToWorkspace()
      break
    case 'remove-selection-from-project':
      await removeSelectionFromWorkspace()
      break
    case 'delete-selection-global':
      await deleteReferencesFromGlobal(selectedKeys.value)
      break
    default:
      break
  }
}
</script>

<style scoped>
.library-workbench {
  container-type: inline-size;
  position: relative;
  overflow: hidden;
  background: var(--bg-primary);
  color: var(--fg-primary);
  --library-label-size: 0.68rem;
  --library-subtle-size: 0.8rem;
  --library-ui-size: 0.89rem;
  --library-sidebar-title-size: 1.02rem;
  --library-list-title-size: 1rem;
  --library-detail-title-size: 1.16rem;
}

.library-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  background: var(--bg-secondary);
}

.library-shell.is-editing {
  grid-template-columns: minmax(0, 1fr);
}

.library-sidebar,
.library-main,
.library-detail,
.library-editor-stage {
  min-height: 0;
}

.library-sidebar {
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border);
  background: var(--bg-secondary);
  overflow: auto;
}

.library-sidebar-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 14px 12px;
  border-bottom: 1px solid var(--border);
}

.library-sidebar-head,
.library-detail-compact-head,
.library-compact-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.library-sidebar-row,
.library-toolbar-row,
.library-filter-row,
.library-batch-head,
.library-batch-actions,
.library-detail-actions,
.library-editor-actions,
.library-main-meta,
.library-detail-pill-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.library-sidebar-row,
.library-filter-row,
.library-toolbar-row,
.library-batch-actions,
.library-detail-actions,
.library-editor-actions,
.library-main-meta,
.library-detail-pill-row {
  flex-wrap: wrap;
}

.library-sidebar-row.is-section-header {
  width: 100%;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: nowrap;
}

.library-sidebar-row.is-section-header .library-section-label,
.library-filter-row.is-tag-summary .library-section-label {
  font-size: 0.76rem;
  letter-spacing: 0.06em;
}

.library-section-label,
.library-detail-label {
  font-size: var(--library-label-size);
  letter-spacing: 0.08em;
  line-height: 1.3;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--fg-muted) 92%, var(--fg-primary));
  font-weight: 600;
}

.library-subsection-label {
  margin-top: 4px;
  font-size: var(--library-label-size);
  color: var(--fg-muted);
}

.library-detail-title,
.library-empty-title {
  margin: 0;
  color: var(--fg-primary);
  font-weight: 600;
}

.library-inline-empty,
.library-muted-copy,
.library-empty-copy,
.library-ref-meta,
.library-detail-subtitle,
.library-detail-value {
  font-size: var(--library-subtle-size);
  color: var(--fg-muted);
  line-height: 1.62;
}

.library-sidebar-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 8px 0;
  border-top: 1px solid color-mix(in srgb, var(--border) 68%, transparent);
}

.library-sidebar-section:first-of-type {
  border-top: none;
  padding-top: 8px;
  padding-bottom: 8px;
}

.library-sidebar-section.grow {
  min-height: 0;
  flex: 1;
  padding-top: 14px;
  padding-bottom: 10px;
}

.library-nav-list,
.library-tag-list,
.library-filter-chip-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.library-filter-chip-row {
  flex-direction: row;
  flex-wrap: wrap;
  gap: 5px;
}

.library-filter-row.is-tag-summary {
  align-items: center;
}

.library-nav-list.is-secondary {
  gap: 2px;
}

.library-nav-list.is-secondary .library-nav-item {
  min-height: 23px;
  color: var(--fg-muted);
}

.library-nav-list.is-views {
  gap: 2px;
}

.library-tag-list {
  min-height: 0;
  overflow: auto;
}

.library-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--bg-primary);
}

.library-toolbar,
.library-editor-toolbar {
  border-bottom: 1px solid var(--border);
}

.library-sidebar-header.is-compact {
  padding-top: 10px;
  padding-bottom: 8px;
}

.library-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 1px solid color-mix(in srgb, var(--border) 88%, var(--fg-muted));
  border-radius: 5px;
  background: color-mix(in srgb, var(--bg-primary) 82%, var(--bg-hover));
  color: var(--fg-muted);
  font-size: var(--surface-font-title);
  line-height: 1;
  flex-shrink: 0;
}

.library-icon-button:hover {
  color: var(--fg-primary);
  border-color: color-mix(in srgb, var(--accent) 24%, var(--border));
  background: color-mix(in srgb, var(--bg-primary) 70%, var(--bg-hover));
}

.library-inline-label {
  color: var(--fg-muted);
}

.library-toolbar {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 8px 12px 7px;
  background: color-mix(in srgb, var(--bg-secondary) 82%, var(--bg-primary));
}

.library-compact-toolbar {
  display: none;
}

.library-toolbar-row--primary {
  flex-wrap: nowrap;
  gap: 4px;
}

.library-search-shell {
  flex: 1 1 300px;
  min-width: 220px;
}

.library-toolbar-row--primary .library-search-shell {
  flex: 1 1 auto;
  flex-basis: auto;
  min-width: 0;
}

.library-toolbar-actions {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex: 0 0 auto;
}

.library-search-input,
.library-select,
.library-batch-input {
  width: 100%;
  min-width: 0;
  font-size: var(--library-ui-size);
}

.library-search-input {
  min-height: var(--sidebar-input-height);
  padding-inline: 8px;
}

.library-search-input :deep(.ui-input-control) {
  font-size: var(--sidebar-font-control);
}

.library-select {
  width: 164px;
}

.library-toolbar-icon-button {
  border-color: color-mix(in srgb, var(--border) 88%, var(--fg-muted));
  background: color-mix(in srgb, var(--bg-primary) 82%, var(--bg-hover));
  color: var(--fg-muted);
}

.library-toolbar-icon-button:hover:not(:disabled) {
  color: var(--fg-primary);
  border-color: color-mix(in srgb, var(--accent) 24%, var(--border));
  background: color-mix(in srgb, var(--bg-primary) 70%, var(--bg-hover));
}

.library-toolbar-icon-button.is-active {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 30%, var(--border));
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.library-toolbar-sort-menu {
  min-width: 208px;
}

.library-toolbar-sort-option-active {
  color: var(--accent);
  font-weight: 500;
}

.library-batch-row {
  display: flex;
  padding-top: 5px;
  border-top: 1px solid var(--border);
}

.library-batch-head {
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 8px 10px;
}

.library-batch-label {
  font-size: var(--library-ui-size);
  font-weight: 600;
  color: var(--fg-secondary);
}

.library-batch-actions {
  gap: 6px;
  align-items: stretch;
  flex: 1 1 auto;
}

.library-batch-group {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 27px;
  padding: 1px;
  border: 1px solid color-mix(in srgb, var(--border) 88%, var(--fg-muted));
  border-radius: 6px;
  background: color-mix(in srgb, var(--bg-primary) 58%, var(--bg-hover));
}

.library-batch-group:focus-within {
  border-color: color-mix(in srgb, var(--accent) 48%, var(--border));
}

.library-batch-group.is-fluid {
  flex: 1 1 320px;
  min-width: 250px;
}

.library-batch-group.is-fluid .library-batch-input {
  flex: 1;
  min-width: 120px;
}

.library-batch-group .library-inline-button,
.library-batch-group .library-quiet-button,
.library-batch-group .library-select,
.library-batch-group .library-batch-input {
  border-color: transparent;
  background: transparent;
  box-shadow: none;
}

.library-batch-actions .library-batch-input {
  flex: 1;
  min-width: 160px;
}

.library-batch-select {
  width: 126px;
  flex: 0 0 auto;
}

.library-nav-item,
.library-tag-row,
.library-inline-button,
.library-quiet-button,
.library-filter-chip {
  transition:
    background-color 120ms,
    border-color 120ms,
    color 120ms;
}

.library-nav-item,
.library-tag-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-height: 30px;
  padding: 0 10px 0 12px;
}

.library-nav-list.is-views .library-nav-item {
  min-height: 28px;
  padding: 0 10px 0 12px;
  margin: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
}

.library-tag-row {
  min-height: 24px;
  padding: 0 4px 0 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
}

.library-inline-button,
.library-quiet-button,
.library-filter-chip {
  white-space: nowrap;
  flex-shrink: 0;
  font-size: var(--library-ui-size);
}

.library-filter-chip {
  padding: 0 6px;
  font-size: 0.76rem;
}

.library-nav-item,
.library-tag-row {
  font-size: var(--library-ui-size);
}

.library-tag-row {
  font-size: var(--library-label-size);
}

.library-nav-list.is-secondary .library-nav-item {
  background: color-mix(in srgb, var(--bg-primary) 62%, var(--bg-hover));
}

.library-nav-list.is-views .library-nav-item:hover {
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  border-color: transparent;
}

.library-nav-item:hover,
.library-tag-row:hover {
  background: color-mix(in srgb, var(--bg-primary) 68%, var(--bg-hover));
  border-color: color-mix(in srgb, var(--accent) 20%, var(--border));
  color: var(--fg-primary);
}

.library-tag-row:hover {
  background: color-mix(in srgb, var(--accent) 6%, transparent);
  border-color: transparent;
}

.library-nav-item.is-active,
.library-tag-row.is-active,
.library-state-pill.active {
  background: color-mix(in srgb, var(--accent) 10%, var(--bg-hover));
  border-color: color-mix(in srgb, var(--accent) 34%, var(--border));
  color: var(--accent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 10%, transparent);
}

.library-nav-list.is-views .library-nav-item.is-active {
  border-color: transparent;
  box-shadow: none;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.library-tag-row.is-active {
  border-color: transparent;
  box-shadow: none;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.library-nav-count {
  min-width: 20px;
  height: 18px;
  padding: 0 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--library-label-size);
  color: var(--fg-muted);
  border: 1px solid color-mix(in srgb, var(--border) 82%, var(--fg-muted));
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-secondary) 72%, var(--bg-primary));
}

.library-tag-row .library-nav-count {
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  font-size: var(--library-label-size);
  border-color: color-mix(in srgb, var(--border) 74%, var(--fg-muted));
  background: transparent;
}

.library-link-button {
  font-size: var(--library-subtle-size);
}

.library-section-header-action {
  height: auto;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--fg-muted);
  font-size: 0.76rem;
  line-height: 1.3;
}

.library-section-header-action:hover {
  border-color: transparent;
  background: transparent;
  color: var(--fg-primary);
}

.library-count-pill,
.library-state-pill,
.library-tag-chip {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  border: 1px solid var(--border);
  border-radius: 999px;
}

.library-count-pill {
  height: 20px;
  padding: 0 7px;
  font-size: var(--library-subtle-size);
  color: var(--fg-muted);
  background: var(--bg-primary);
}

.library-state-pill,
.library-tag-chip {
  padding: 1px 6px;
  font-size: var(--library-label-size);
  color: var(--fg-secondary);
  background: var(--bg-primary);
}

.library-state-pill.warning {
  border-color: color-mix(in srgb, #d97706 45%, var(--border));
  color: #d97706;
  background: color-mix(in srgb, #d97706 10%, var(--bg-primary));
}

.library-tag-chip.muted {
  color: var(--fg-muted);
}

.library-table {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.library-table-header,
.library-table-row {
  display: grid;
  grid-template-columns: 26px minmax(0, 1.8fr) minmax(0, 0.8fr) 108px;
  gap: 10px;
}

.library-table-header {
  align-items: center;
  min-height: 32px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-secondary);
  font-size: var(--library-label-size);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--fg-muted);
  position: sticky;
  top: 0;
  z-index: 1;
}

.library-table-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.library-table-row {
  align-items: flex-start;
  padding: 10px 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 62%, transparent);
  box-shadow: inset 0 0 0 1px transparent;
  cursor: default;
}

.library-table-row:hover {
  background: color-mix(in srgb, var(--bg-primary) 74%, var(--bg-hover));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 12%, var(--border));
}

.library-table-row.is-focused {
  background: color-mix(in srgb, var(--bg-hover) 82%, var(--bg-primary));
  box-shadow:
    inset 2px 0 0 var(--accent),
    inset 0 0 0 1px color-mix(in srgb, var(--accent) 20%, var(--border));
}

.library-checkbox-cell {
  padding-top: 3px;
}

.library-ref-cell,
.library-project-cell {
  min-width: 0;
}

.library-ref-title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.library-ref-title {
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  font-size: var(--library-list-title-size);
  line-height: 1.42;
  color: var(--fg-primary);
  font-weight: 600;
}

.library-ref-meta {
  margin-top: 5px;
  line-height: 1.55;
}

.library-ref-key {
  margin-left: 6px;
  color: var(--fg-secondary);
}

.library-tags-cell {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 3px;
}

.library-project-cell {
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  padding-top: 3px;
}

.library-detail {
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border);
  background: var(--bg-secondary);
  overflow: auto;
}

.library-detail-compact-head {
  display: none;
  min-height: 34px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-secondary) 90%, var(--bg-primary));
  position: sticky;
  top: 0;
  z-index: 2;
}

.library-editor-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-height: 28px;
  padding: 10px 14px;
  background: var(--bg-secondary);
  flex-wrap: wrap;
  position: sticky;
  top: 0;
  z-index: 2;
}

.library-detail-inner {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 16px 18px;
}

.library-detail-primary {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.library-detail-title {
  font-size: var(--library-detail-title-size);
  line-height: 1.22;
  font-weight: 600;
}

.library-detail-section {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}

.library-detail-actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  align-items: stretch;
}

.library-detail-section.grow {
  flex: 1;
}

.library-detail-grid {
  display: grid;
  grid-template-columns: 82px minmax(0, 1fr);
  gap: 6px 12px;
  align-items: start;
}

.library-detail-value {
  font-size: var(--library-subtle-size);
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.library-detail-copy {
  font-size: 0.94rem;
  line-height: 1.72;
  color: var(--fg-secondary);
  white-space: pre-wrap;
}

.library-detail-actions .library-inline-button,
.library-detail-actions .library-quiet-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-width: 0;
  font-size: var(--library-subtle-size);
  line-height: 1.1;
  letter-spacing: -0.01em;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
}

.library-editor-stage {
  display: flex;
  flex-direction: column;
  min-width: 0;
  grid-column: 1 / -1;
  background: var(--bg-primary);
}

.library-editor-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1 1 360px;
}

.library-editor-actions {
  flex: 0 0 auto;
  margin-left: auto;
}

.library-editor-surface {
  flex: 1;
  min-height: 0;
}

.library-empty-state {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 38ch;
  padding: 28px 18px;
}

.library-empty-state.detail {
  padding-top: 14px;
}

.library-empty-title {
  font-size: var(--library-sidebar-title-size);
}

.library-compact-backdrop {
  position: absolute;
  inset: 0;
  z-index: 3;
  border: none;
  background: color-mix(in srgb, var(--bg-primary) 30%, transparent);
  backdrop-filter: blur(1.5px);
}

@container (max-width: 1180px) {
  .library-toolbar-row {
    gap: 6px;
  }

  .library-search-shell {
    flex-basis: 100%;
    min-width: 0;
  }

  .library-select {
    width: 148px;
  }

  .library-table-header,
  .library-table-row {
    grid-template-columns: 26px minmax(0, 1.55fr) minmax(0, 0.75fr) 94px;
    gap: 8px;
  }

  .library-detail-grid {
    grid-template-columns: 62px minmax(0, 1fr);
  }
}

@container (max-width: 1080px) {
  .library-shell,
  .library-shell.is-editing {
    grid-template-columns: minmax(0, 1fr);
  }

  .library-detail {
    position: absolute;
    inset: 0 0 0 auto;
    width: min(312px, 68cqw);
    max-width: calc(100% - 28px);
    z-index: 4;
    pointer-events: none;
    border-left: 1px solid var(--border);
    border-top: none;
    transform: translateX(calc(100% + 10px));
    transition: transform 180ms ease;
    box-shadow: -14px 0 32px color-mix(in srgb, var(--bg-primary) 22%, transparent);
  }

  .library-workbench.is-detail-drawer-open .library-detail {
    pointer-events: auto;
    transform: translateX(0);
  }

  .library-main,
  .library-editor-stage {
    grid-column: 1;
  }

  .library-compact-toolbar,
  .library-detail-compact-head {
    display: flex;
  }

  .library-toolbar {
    gap: 4px;
    padding: 7px 10px 7px;
  }

  .library-toolbar-row {
    gap: 6px;
  }

  .library-search-shell {
    flex-basis: 100%;
    min-width: 0;
  }

  .library-select,
  .library-inline-button.is-primary {
    flex: 1 1 0;
    width: auto;
  }

  .library-table-header,
  .library-table-row {
    grid-template-columns: 24px minmax(0, 1fr) 92px;
    gap: 8px;
  }

  .library-table-header > :nth-child(3),
  .library-tags-cell {
    display: none;
  }

  .library-ref-title {
    -webkit-line-clamp: 2;
  }

  .library-detail-inner {
    gap: 8px;
    padding: 12px 12px 14px;
  }

  .library-detail-title {
    font-size: var(--surface-font-card);
  }
}

@container (max-width: 760px) {
  .library-select,
  .library-inline-button.is-primary,
  .library-quiet-button {
    flex: 1 1 0;
    width: auto;
  }

  .library-table-header,
  .library-table-row {
    grid-template-columns: 24px minmax(0, 1fr) 84px;
  }

  .library-detail {
    width: min(100%, 360px);
  }

  .library-detail-grid {
    grid-template-columns: 56px minmax(0, 1fr);
    gap: 4px 8px;
  }

  .library-detail-actions {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .library-detail-actions > :last-child {
    grid-column: 1 / -1;
  }
}

@container (max-width: 640px) {
  .library-table-header,
  .library-table-row {
    grid-template-columns: 24px minmax(0, 1fr);
  }

  .library-table-header > :nth-child(4),
  .library-project-cell {
    display: none;
  }
}
</style>
