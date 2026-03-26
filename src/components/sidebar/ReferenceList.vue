<template>
  <div
    ref="rootEl"
    data-ref-drop-zone
    class="reference-list-shell flex flex-col h-full overflow-hidden"
  >
    <!-- Header -->
    <div
      v-if="!props.embedded"
      class="reference-list-header flex items-center h-7 shrink-0 px-2 gap-1 select-none"
    >
      <div
        class="flex items-center gap-1"
        :class="{ 'cursor-pointer': headingCollapsible }"
        @click="headingCollapsible ? $emit('toggle-collapse') : null"
      >
        <svg
          v-if="headingCollapsible"
          class="reference-heading-caret"
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          :class="{ 'is-open': !collapsed }"
        >
          <path d="M6 4l4 4-4 4" />
        </svg>
        <span class="ui-sidebar-kicker">{{ headingLabel || t('References') }}</span>
      </div>
      <span
        v-if="referencesStore.refCount > 0"
        class="reference-count-badge ui-sidebar-meta px-1.5 py-0.5 rounded-full"
      >
        {{ referencesStore.refCount }}
      </span>
      <div class="flex-1"></div>

      <div v-if="!collapsed" class="flex items-center gap-0.5">
        <UiButton
          v-if="referencesStore.refCount > 0"
          ref="exportBtnEl"
          variant="ghost"
          size="icon-sm"
          icon-only
          class="reference-toolbar-button"
          :title="t('Export references')"
          :aria-label="t('Export references')"
          @click.stop="toggleExportMenu"
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path d="M8 10V2M4 6l4-4 4 4M2 13h12" />
          </svg>
        </UiButton>
        <UiButton
          variant="ghost"
          size="icon-sm"
          icon-only
          class="reference-toolbar-button"
          :title="t('Add reference')"
          :aria-label="t('Add reference')"
          @click.stop="showAddDialog = true"
        >
          <IconPlus :size="11" :stroke-width="2" />
        </UiButton>
        <UiButton
          variant="ghost"
          size="icon-sm"
          icon-only
          class="reference-toolbar-button"
          :title="t('Reference maintenance')"
          :aria-label="t('Reference maintenance')"
          @click.stop="openReferenceAi"
        >
          <IconSparkles :size="11" :stroke-width="1.8" />
        </UiButton>
      </div>

      <!-- Export menu (Teleported) -->
      <Teleport to="body">
        <template v-if="showExportMenu">
          <div class="fixed inset-0 z-50" @click="showExportMenu = false"></div>
          <div class="context-menu z-50" :style="exportMenuPos">
            <div class="context-menu-section">{{ t('Export as .bib') }}</div>
            <div class="context-menu-item" @click="saveExport('bib', null)">
              {{ t('All ({count})', { count: referencesStore.refCount }) }}
            </div>
            <div
              v-if="citedCount > 0"
              class="context-menu-item"
              @click="saveExport('bib', [...referencesStore.citedKeys])"
            >
              {{ t('Cited only ({count})', { count: citedCount }) }}
            </div>
            <div
              v-if="searchQuery.trim()"
              class="context-menu-item"
              @click="saveFilteredExport('bib')"
            >
              {{ t('Filtered ({count})', { count: filteredRefs.length }) }}
            </div>
            <div
              v-if="referencesStore.selectedKeys.size > 0"
              class="context-menu-item"
              @click="saveExport('bib', [...referencesStore.selectedKeys])"
            >
              {{ t('Selected ({count})', { count: referencesStore.selectedKeys.size }) }}
            </div>
            <div class="context-menu-separator"></div>
            <div class="context-menu-section">{{ t('Export as .ris') }}</div>
            <div class="context-menu-item" @click="saveExport('ris', null)">
              {{ t('All ({count})', { count: referencesStore.refCount }) }}
            </div>
            <div
              v-if="citedCount > 0"
              class="context-menu-item"
              @click="saveExport('ris', [...referencesStore.citedKeys])"
            >
              {{ t('Cited only ({count})', { count: citedCount }) }}
            </div>
            <div
              v-if="searchQuery.trim()"
              class="context-menu-item"
              @click="saveFilteredExport('ris')"
            >
              {{ t('Filtered ({count})', { count: filteredRefs.length }) }}
            </div>
            <div
              v-if="referencesStore.selectedKeys.size > 0"
              class="context-menu-item"
              @click="saveExport('ris', [...referencesStore.selectedKeys])"
            >
              {{ t('Selected ({count})', { count: referencesStore.selectedKeys.size }) }}
            </div>
          </div>
        </template>
      </Teleport>
    </div>

    <!-- Content -->
    <template v-if="!collapsed">
      <!-- Search row -->
      <div class="px-2 py-0.5 shrink-0">
        <UiInput
          v-model="searchQuery"
          size="sm"
          class="reference-search-input"
          :placeholder="t('Search references...')"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
        >
          <template #prefix>
            <IconSearch :size="12" :stroke-width="1.5" />
          </template>
        </UiInput>
      </div>

      <!-- Style picker dropdown (Teleported) -->
      <Teleport to="body">
        <template v-if="showStyleMenu">
          <div class="fixed inset-0 z-50" @click="showStyleMenu = false"></div>
          <div class="context-menu z-50 pt-0 reference-style-menu" :style="styleMenuPos">
            <!-- Search input (sticky, z-index to stay above scrolling items) -->
            <div class="reference-style-search-shell sticky top-0 z-10 px-2 py-1.5">
              <UiInput
                ref="styleSearchEl"
                v-model="styleSearchQuery"
                size="sm"
                class="reference-style-search"
                :placeholder="t('Search styles...')"
                autocomplete="off"
                autocorrect="off"
                autocapitalize="off"
                spellcheck="false"
                @keydown.escape.stop="showStyleMenu = false"
              />
            </div>
            <!-- Style items -->
            <div
              v-for="style in filteredStyles"
              :key="style.id"
              class="context-menu-item"
              :class="{
                'reference-style-option-active': referencesStore.citationStyle === style.id,
              }"
              @click="selectStyle(style.id)"
            >
              <span class="flex-1 ui-text-micro">{{ style.name }}</span>
              <span v-if="style.category" class="ui-text-micro ml-2 opacity-50">{{
                style.category
              }}</span>
            </div>
            <div
              v-if="filteredStyles.length === 0"
              class="reference-style-empty px-3 py-2 ui-text-micro"
            >
              {{ t('No matching styles') }}
            </div>
            <!-- Add custom style -->
            <div class="context-menu-item reference-style-add-item" @click="addCustomStyle">
              <svg
                class="reference-style-add-icon"
                width="10"
                height="10"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path d="M8 3v10M3 8h10" />
              </svg>
              <span class="ml-1 ui-text-micro">{{ t('Add custom style (.csl)...') }}</span>
            </div>
          </div>
        </template>
      </Teleport>

      <!-- Sort + filter | compare | style -->
      <div v-if="referencesStore.refCount > 0" class="reference-toolbar-row shrink-0">
        <!-- Sort button -->
        <UiButton
          ref="sortBtnEl"
          variant="ghost"
          size="icon-xs"
          icon-only
          class="reference-toolbar-button shrink-0"
          :title="t('Sort references')"
          :aria-label="t('Sort references')"
          @click.stop="toggleSortMenu"
        >
          <IconArrowsSort :size="12" :stroke-width="1.6" />
        </UiButton>

        <!-- Filter dropdown -->
        <UiButton
          ref="filterBtnEl"
          variant="ghost"
          size="sm"
          class="reference-filter-button shrink-0"
          :active="citedFilter !== 'all'"
          :title="t('Filter references')"
          :aria-label="t('Filter references')"
          @click.stop="toggleFilterMenu"
        >
          <template #default>
            {{ filterLabel }}
          </template>
          <template #trailing>
            <svg
              width="6"
              height="4"
              viewBox="0 0 8 5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              class="reference-toolbar-caret"
            >
              <path d="M1 1l3 3 3-3" />
            </svg>
          </template>
        </UiButton>

        <UiButton
          v-if="canCompareSelected"
          variant="ghost"
          size="sm"
          class="reference-compare-button shrink-0"
          :title="t('Compare selected')"
          :aria-label="t('Compare selected')"
          @click.stop="compareSelectedReferences"
        >
          <template #leading>
            <IconGitCompare :size="11" :stroke-width="1.8" />
          </template>
          {{ t('Compare selected') }}
        </UiButton>

        <!-- Filter menu (Teleported) -->
        <Teleport to="body">
          <template v-if="showFilterMenu">
            <div class="fixed inset-0 z-50" @click="showFilterMenu = false"></div>
            <div class="context-menu z-50" :style="filterMenuPos">
              <div
                v-for="f in filterOptions"
                :key="f.value"
                class="context-menu-item"
                :class="{ 'reference-filter-option-active': citedFilter === f.value }"
                @click="applyCitedFilter(f.value)"
              >
                {{ f.label }}
              </div>
            </div>
          </template>
        </Teleport>

        <div class="flex-1"></div>

        <!-- Citation style (separate concern, right-aligned) -->
        <UiButton
          ref="styleBtnEl"
          variant="ghost"
          size="sm"
          class="reference-style-button shrink-0"
          :title="t('Citation style')"
          :aria-label="t('Citation style')"
          @click.stop="toggleStyleMenu"
        >
          <template #default>
            <span class="reference-style-label block truncate" :title="activeStyleName">
              {{ activeStyleName }}
            </span>
          </template>
          <template #trailing>
            <svg
              width="6"
              height="4"
              viewBox="0 0 8 5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              class="reference-toolbar-caret"
            >
              <path d="M1 1l3 3 3-3" />
            </svg>
          </template>
        </UiButton>

        <!-- Sort menu -->
        <Teleport to="body">
          <template v-if="showSortMenu">
            <div class="fixed inset-0 z-50" @click="showSortMenu = false"></div>
            <div ref="sortMenuEl" class="context-menu z-50" :style="sortMenuPos">
              <div
                v-for="opt in sortOptions"
                :key="opt.value"
                class="context-menu-item"
                :class="{ 'reference-sort-option-active': currentSortKey === opt.value }"
                @click="selectSortOption(opt.value)"
              >
                {{ opt.label }}
              </div>
            </div>
          </template>
        </Teleport>
      </div>

      <!-- Import status toast -->
      <div
        v-if="importToast"
        class="reference-import-toast flex items-center gap-1.5 mx-2 mb-1 px-2 py-1 rounded ui-sidebar-body shrink-0"
      >
        <svg
          v-if="importToast.hasAdded"
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          stroke="var(--success)"
          stroke-width="2"
        >
          <path d="M3 8l3 3 7-7" />
        </svg>
        {{ importToast.text }}
      </div>

      <!-- Reference list -->
      <div class="flex-1 overflow-y-auto relative py-1">
        <!-- Importing placeholders -->
        <div v-for="imp in importing" :key="imp.id" class="py-1.5 px-2">
          <div class="flex items-center gap-1">
            <div class="reference-import-name flex-1 min-w-0 truncate">
              {{ imp.name }}
            </div>
            <div class="ref-import-spinner shrink-0"></div>
          </div>
          <div class="reference-import-hint mt-0.5">
            {{ t('Importing...') }}
          </div>
        </div>

        <ReferenceItem
          v-for="r in filteredRefs"
          :key="r._key"
          :reference="r"
          :isSelected="referencesStore.selectedKeys.has(r._key)"
          :isCited="referencesStore.citedKeys.has(r._key)"
          @click="handleItemClick"
          @context-menu="handleContextMenu"
          @drag-start="handleDragStart"
        />

        <!-- Empty state -->
        <div
          v-if="filteredRefs.length === 0 && importing.length === 0"
          class="reference-empty-state px-3 py-4 text-center ui-sidebar-empty"
        >
          <template v-if="searchQuery">{{ t('No matching references') }}</template>
          <template v-else>
            <div>{{ t('Drop PDFs, .bib, .ris, or .json files here') }}</div>
          </template>
        </div>

        <!-- Drop zone overlay -->
        <div
          v-if="dropActive"
          class="reference-drop-overlay absolute inset-0 flex items-center justify-center pointer-events-none z-10"
        >
          <span class="reference-drop-overlay-label ui-sidebar-kicker">{{
            t('Drop files to import')
          }}</span>
        </div>
      </div>
    </template>

    <!-- Context menu -->
    <ReferenceContextMenu
      v-if="contextMenu.show"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :refKey="contextMenu.key"
      :hasPdf="contextMenu.hasPdf"
      :selectedCount="referencesStore.selectedKeys.size"
      @close="contextMenu.show = false"
      @copy-citation="copyCitation"
      @copy-multi-citation="copyMultiCitation"
      @open-pdf="openPdf"
      @view-details="viewDetails"
      @export-selected="exportSelected"
      @copy-formatted="copyFormatted"
      @delete="deleteRef"
      @delete-global="deleteGlobalRef"
    />

    <!-- Add dialog -->
    <AddReferenceDialog v-if="showAddDialog" @close="showAddDialog = false" />
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import UiButton from '../shared/ui/UiButton.vue'
import UiInput from '../shared/ui/UiInput.vue'
import { useReferencesStore } from '../../stores/references'
import { useEditorStore } from '../../stores/editor'
import { useChatStore } from '../../stores/chat'
import { useWorkspaceStore } from '../../stores/workspace'
import { formatReference } from '../../services/citationFormatter'
import { getAvailableStyles, getStyleName } from '../../services/citationStyleRegistry'
import { saveReferenceExport } from '../../services/referenceFiles'
import { useReferenceListUi } from '../../composables/useReferenceListUi'
import { useReferenceImports } from '../../composables/useReferenceImports'
import {
  launchReferenceCompareTask,
  launchReferenceMaintenanceTask,
} from '../../services/ai/workbenchTaskLaunchers'
import { isMod } from '../../platform'
import { ask } from '@tauri-apps/plugin-dialog'
import {
  IconSearch,
  IconArrowsSort,
  IconSparkles,
  IconGitCompare,
  IconPlus,
} from '@tabler/icons-vue'
import ReferenceItem from './ReferenceItem.vue'
import ReferenceContextMenu from './ReferenceContextMenu.vue'
import AddReferenceDialog from './AddReferenceDialog.vue'
import { useI18n } from '../../i18n'
import { buildCitationText } from '../../editor/citationSyntax'

const props = defineProps({
  collapsed: { type: Boolean, default: false },
  embedded: { type: Boolean, default: false },
  headingCollapsible: { type: Boolean, default: true },
  headingLabel: { type: String, default: '' },
})
defineEmits(['toggle-collapse'])

const referencesStore = useReferencesStore()
const editorStore = useEditorStore()
const chatStore = useChatStore()
const workspace = useWorkspaceStore()
const { t } = useI18n()

const rootEl = ref(null)
const searchQuery = ref('')
const sortMenuEl = ref(null)

const contextMenu = reactive({
  show: false,
  x: 0,
  y: 0,
  key: '',
  hasPdf: false,
})

const searchedRefs = computed(() => {
  if (!searchQuery.value.trim()) return referencesStore.sortedLibrary
  return referencesStore.searchGlobalRefs(searchQuery.value)
})

const citedCount = computed(
  () => searchedRefs.value.filter((r) => referencesStore.citedKeys.has(r._key)).length
)
const notCitedCount = computed(() => searchedRefs.value.length - citedCount.value)

const {
  showAddDialog,
  showSortMenu,
  sortBtnEl,
  sortMenuPos,
  showStyleMenu,
  styleBtnEl,
  styleSearchEl,
  styleSearchQuery,
  styleMenuPos,
  citedFilter,
  showFilterMenu,
  filterBtnEl,
  filterMenuPos,
  showExportMenu,
  exportBtnEl,
  exportMenuPos,
  importToast,
  activeStyleName,
  filteredStyles,
  filterOptions,
  filterLabel,
  sortOptions,
  currentSortKey,
  applySortOption,
  toggleFilterMenu,
  toggleStyleMenu,
  selectStyle,
  toggleSortMenu,
  toggleExportMenu,
  showImportMessage,
  showImportSummary,
} = useReferenceListUi({
  referencesStore,
  searchQueryRef: searchQuery,
  searchedRefs,
  citedCount,
  notCitedCount,
  t,
  getAvailableStyles,
  getStyleName,
})

const filteredRefs = computed(() => {
  if (citedFilter.value === 'cited') {
    return searchedRefs.value.filter((r) => referencesStore.citedKeys.has(r._key))
  }
  if (citedFilter.value === 'notCited') {
    return searchedRefs.value.filter((r) => !referencesStore.citedKeys.has(r._key))
  }
  return searchedRefs.value
})

const selectedReferenceKeys = computed(() => [...referencesStore.selectedKeys].filter(Boolean))
const canCompareSelected = computed(() => selectedReferenceKeys.value.length >= 2)

const { dropActive, importing, importCustomStyle } = useReferenceImports({
  referencesStore,
  workspace,
  t,
  showImportMessage,
  showImportSummary,
})

async function addCustomStyle() {
  showStyleMenu.value = false
  await importCustomStyle()
}

async function openReferenceAi() {
  await launchReferenceMaintenanceTask({
    editorStore,
    chatStore,
    focusKeys: selectedReferenceKeys.value,
  })
}

async function compareSelectedReferences() {
  if (!canCompareSelected.value) return
  await launchReferenceCompareTask({
    editorStore,
    chatStore,
    refKeys: selectedReferenceKeys.value,
  })
}

async function saveExport(format, keys) {
  showExportMenu.value = false
  const content =
    format === 'ris' ? referencesStore.exportRis(keys) : referencesStore.exportBibTeX(keys)
  const ext = format === 'ris' ? 'ris' : 'bib'
  await saveReferenceExport({
    format,
    title: t('Export references as .{ext}', { ext }),
    content,
  })
}

async function saveFilteredExport(format) {
  await saveExport(
    format,
    filteredRefs.value.map((reference) => reference._key)
  )
}

function applyCitedFilter(value) {
  citedFilter.value = value
  showFilterMenu.value = false
}

function selectSortOption(value) {
  applySortOption(value)
  showSortMenu.value = false
}

// --- Selection ---

const lastClickedIndex = ref(null)

function handleItemClick({ key, event }) {
  const refs = filteredRefs.value
  const clickedIndex = refs.findIndex((r) => r._key === key)

  if (event.shiftKey && lastClickedIndex.value !== null) {
    // Shift+click: range select
    const start = Math.min(lastClickedIndex.value, clickedIndex)
    const end = Math.max(lastClickedIndex.value, clickedIndex)
    referencesStore.selectedKeys.clear()
    for (let i = start; i <= end; i++) {
      referencesStore.selectedKeys.add(refs[i]._key)
    }
    referencesStore.activeKey = key
  } else if (isMod(event)) {
    // Cmd/Ctrl+click: toggle multi-select
    if (referencesStore.selectedKeys.has(key)) {
      referencesStore.selectedKeys.delete(key)
    } else {
      referencesStore.selectedKeys.add(key)
    }
    referencesStore.activeKey = key
    lastClickedIndex.value = clickedIndex
  } else {
    // Single click: select + inspect in Library
    referencesStore.selectedKeys.clear()
    referencesStore.selectedKeys.add(key)
    referencesStore.focusReferenceInLibrary(key, { mode: 'browse', addToWorkspace: true })
    lastClickedIndex.value = clickedIndex
  }
}

// --- Context menu ---

function handleContextMenu({ event, ref: refData }) {
  contextMenu.show = true
  contextMenu.x = event.clientX
  contextMenu.y = event.clientY
  contextMenu.key = refData._key
  contextMenu.hasPdf = !!refData._pdfFile

  if (!referencesStore.selectedKeys.has(refData._key)) {
    referencesStore.selectedKeys.clear()
    referencesStore.selectedKeys.add(refData._key)
  }
}

function copyCitation(key) {
  const citation = buildCitationText(editorStore.activeTab, key)
  navigator.clipboard.writeText(citation)
  contextMenu.show = false
}

function copyMultiCitation() {
  const keys = [...referencesStore.selectedKeys]
  const cite = buildCitationText(editorStore.activeTab, keys)
  navigator.clipboard.writeText(cite)
  contextMenu.show = false
}

function openPdf(key) {
  contextMenu.show = false
  referencesStore.addKeyToWorkspace(key)
  const pdfPath = referencesStore.pdfPathForKey(key)
  if (pdfPath) {
    editorStore.openFile(pdfPath)
  }
}

function viewDetails(key) {
  contextMenu.show = false
  referencesStore.focusReferenceInLibrary(key, { mode: 'edit', addToWorkspace: true })
}

async function exportSelected(format = 'bib') {
  contextMenu.show = false
  const keys = [...referencesStore.selectedKeys]
  await saveExport(format, keys)
}

function copyFormatted(key) {
  contextMenu.show = false
  const r = referencesStore.getByKey(key)
  if (r) {
    navigator.clipboard.writeText(formatReference(r, referencesStore.citationStyle))
  }
}

async function deleteRef(key) {
  contextMenu.show = false
  const keys = (
    referencesStore.selectedKeys.size > 1 ? [...referencesStore.selectedKeys] : [key]
  ).filter((item) => referencesStore.hasKeyInWorkspace(item))
  if (keys.length === 0) return
  const msg =
    keys.length === 1
      ? t('Remove reference @{key} from this project?', { key: keys[0] })
      : t('Remove {count} references from this project?', { count: keys.length })
  const yes = await ask(msg, { title: t('Confirm Remove'), kind: 'warning' })
  if (yes) {
    referencesStore.removeReferences(keys)
    await referencesStore.saveLibrary({ immediate: true })
  }
}

async function deleteGlobalRef(key) {
  contextMenu.show = false
  const keys = referencesStore.selectedKeys.size > 1 ? [...referencesStore.selectedKeys] : [key]
  const msg =
    keys.length === 1
      ? t('Delete reference @{key} from the global library?', { key: keys[0] })
      : t('Delete {count} references from the global library?', { count: keys.length })
  const yes = await ask(msg, { title: t('Confirm Global Delete'), kind: 'warning' })
  if (yes) {
    await referencesStore.removeReferencesFromGlobal(keys)
  }
}

defineExpose({
  openAddReferenceDialog() {
    showAddDialog.value = true
  },
  toggleExportMenuFrom(anchorEl = null) {
    if (anchorEl) {
      exportBtnEl.value = anchorEl
    }
    toggleExportMenu()
  },
  openReferenceAi,
})

// --- Drag to editor ---

function handleDragStart({ key, event }) {
  const selected = referencesStore.selectedKeys.size > 1 ? [...referencesStore.selectedKeys] : [key]

  const ghostLabel = selected.length === 1 ? `@${selected[0]}` : `${selected.length} refs`

  const ghost = document.createElement('div')
  ghost.className = 'tab-ghost'
  ghost.textContent = ghostLabel
  ghost.style.left = event.clientX + 'px'
  ghost.style.top = event.clientY + 'px'
  document.body.appendChild(ghost)
  document.body.classList.add('tab-dragging')
  window.dispatchEvent(
    new CustomEvent('reference-drag-start', {
      detail: { keys: [...selected] },
    })
  )

  const onMouseMove = (ev) => {
    ghost.style.left = ev.clientX + 'px'
    ghost.style.top = ev.clientY + 'px'
  }

  const onMouseUp = (ev) => {
    document.body.removeChild(ghost)
    document.body.classList.remove('tab-dragging')
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    window.dispatchEvent(
      new CustomEvent('reference-drag-end', {
        detail: { keys: [...selected], x: ev.clientX, y: ev.clientY },
      })
    )
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}
</script>

<style scoped>
.reference-list-shell {
  background: var(--bg-primary);
}

.reference-list-header {
  color: var(--fg-muted);
}

.reference-heading-caret {
  transition: transform 0.1s ease;
}

.reference-heading-caret.is-open {
  transform: rotate(90deg);
}

.reference-count-badge {
  padding: 1px 5px;
  background: var(--bg-tertiary);
  color: var(--fg-muted);
  line-height: 1.2;
}

.reference-toolbar-button {
  color: var(--fg-muted);
}

.reference-toolbar-row {
  display: flex;
  align-items: center;
  gap: var(--sidebar-inline-gap);
  padding: 2px 8px 4px;
}

.reference-search-input {
  background: var(--bg-tertiary);
  min-height: var(--sidebar-input-height);
  padding-inline: 7px;
  gap: var(--sidebar-inline-gap);
}

.reference-search-input :deep(.ui-input-control) {
  font-size: var(--sidebar-font-search);
}

.reference-style-search-shell {
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border);
}

.reference-style-search {
  background: var(--bg-tertiary);
}

.reference-style-search :deep(.ui-input-control) {
  font-size: var(--sidebar-font-search);
}

.reference-filter-button,
.reference-compare-button,
.reference-style-button {
  min-height: var(--sidebar-row-height-tight);
  border-radius: 6px;
  padding-inline: 7px;
  font-size: var(--sidebar-font-control);
}

.reference-style-menu {
  width: 240px;
  max-height: 320px;
  overflow-y: auto;
}

.reference-style-option-active,
.reference-filter-option-active,
.reference-sort-option-active {
  color: var(--accent);
}

.reference-style-option-active {
  font-weight: 500;
}

.reference-style-empty,
.reference-import-hint,
.reference-empty-state {
  color: var(--fg-muted);
}

.reference-style-add-item {
  border-top: 1px solid var(--border);
  color: var(--fg-muted);
}

.reference-style-add-icon {
  flex-shrink: 0;
}

.reference-toolbar-caret {
  flex-shrink: 0;
}

.reference-style-label {
  max-width: 88px;
}

.reference-drop-overlay {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  border: 2px dashed var(--accent);
}

.reference-import-toast {
  background: var(--bg-tertiary);
  color: var(--fg-secondary);
}

.reference-import-name {
  color: var(--fg-muted);
  font-size: var(--sidebar-font-item);
  line-height: 1.25;
}

.reference-import-hint {
  font-size: var(--sidebar-font-meta);
}

.reference-drop-overlay-label {
  color: var(--accent);
}
</style>
