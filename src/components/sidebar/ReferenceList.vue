<template>
  <div ref="rootEl" data-ref-drop-zone class="flex flex-col h-full overflow-hidden" :style="{ background: 'var(--bg-secondary)' }">
    <!-- Header -->
    <div
      class="flex items-center h-7 shrink-0 px-2 gap-1 select-none"
      :style="{ color: 'var(--fg-muted)', }"
    >
      <div class="flex items-center gap-1 cursor-pointer" @click="$emit('toggle-collapse')">
        <svg
          width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"
          :style="{ transform: collapsed ? '' : 'rotate(90deg)', transition: 'transform 0.1s' }"
        >
          <path d="M6 4l4 4-4 4"/>
        </svg>
        <span class="ui-text-xs font-medium uppercase tracking-wider">{{ t('References') }}</span>
      </div>
      <span
        v-if="referencesStore.refCount > 0"
        class="ui-text-xs px-1.5 py-0.5 rounded-full"
        :style="{ background: 'var(--bg-tertiary)', color: 'var(--fg-muted)' }"
      >
        {{ referencesStore.refCount }}
      </span>
      <div class="flex-1"></div>

        <div v-if="!collapsed" class="flex items-center gap-1">
        <!-- Export button -->
        <button
          v-if="referencesStore.refCount > 0"
          ref="exportBtnEl"
          class="h-5 px-1.5 flex items-center gap-1 rounded ui-text-xs hover:opacity-80"
          :style="{ color: 'var(--fg-muted)' }"
          :title="t('Export references')"
          @click.stop="toggleExportMenu"
        >
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M8 10V2M4 6l4-4 4 4M2 13h12"/>
          </svg>
          {{ t('Export') }}
        </button>
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
            <div v-if="citedCount > 0" class="context-menu-item" @click="saveExport('bib', [...referencesStore.citedKeys])">
              {{ t('Cited only ({count})', { count: citedCount }) }}
            </div>
            <div v-if="searchQuery.trim()" class="context-menu-item" @click="saveExport('bib', filteredRefs.map(r => r._key))">
              {{ t('Filtered ({count})', { count: filteredRefs.length }) }}
            </div>
            <div v-if="referencesStore.selectedKeys.size > 0" class="context-menu-item" @click="saveExport('bib', [...referencesStore.selectedKeys])">
              {{ t('Selected ({count})', { count: referencesStore.selectedKeys.size }) }}
            </div>
            <div class="context-menu-separator"></div>
            <div class="context-menu-section">{{ t('Export as .ris') }}</div>
            <div class="context-menu-item" @click="saveExport('ris', null)">
              {{ t('All ({count})', { count: referencesStore.refCount }) }}
            </div>
            <div v-if="citedCount > 0" class="context-menu-item" @click="saveExport('ris', [...referencesStore.citedKeys])">
              {{ t('Cited only ({count})', { count: citedCount }) }}
            </div>
            <div v-if="searchQuery.trim()" class="context-menu-item" @click="saveExport('ris', filteredRefs.map(r => r._key))">
              {{ t('Filtered ({count})', { count: filteredRefs.length }) }}
            </div>
            <div v-if="referencesStore.selectedKeys.size > 0" class="context-menu-item" @click="saveExport('ris', [...referencesStore.selectedKeys])">
              {{ t('Selected ({count})', { count: referencesStore.selectedKeys.size }) }}
            </div>
          </div>
        </template>
      </Teleport>
    </div>

    <!-- Content -->
    <template v-if="!collapsed">
      <!-- Search + Add button row -->
      <div class="flex items-center gap-1 px-2 py-1 shrink-0">
        <div class="flex-1 min-w-0 flex items-center rounded border px-1 overflow-hidden"
          :style="{ background: 'var(--bg-tertiary)', borderColor: searchFocused ? 'var(--accent)' : 'var(--border)' }">
          <IconSearch :size="12" :stroke-width="1.5" style="color: var(--fg-muted); flex-shrink: 0;" />
          <input
            v-model="searchQuery"
            class="flex-1 px-1 py-0.5 ui-text-md outline-none bg-transparent"
            style="color: var(--fg-primary);"
            :placeholder="t('Search references...')"
            autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
            @focus="searchFocused = true"
            @blur="searchFocused = false"
          />
        </div>
        <button
          class="shrink-0 h-5 px-1.5 flex items-center gap-0.5 rounded ui-text-sm hover:bg-[var(--bg-hover)]"
          :style="{ color: 'var(--fg-muted)' }"
          :title="t('Add reference')"
          @click.stop="showAddDialog = true"
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M8 3v10M3 8h10"/>
          </svg>
          {{ t('Add') }}
        </button>
        <button
          class="shrink-0 h-5 px-1.5 flex items-center gap-1 rounded ui-text-sm hover:bg-[var(--bg-hover)]"
          :style="{ color: 'var(--fg-muted)' }"
          :title="t('Reference maintenance')"
          @click.stop="openReferenceAi"
        >
          <IconSparkles :size="11" :stroke-width="1.8" />
          {{ t('Ask AI') }}
        </button>
        <button
          v-if="canCompareSelected"
          class="shrink-0 h-5 px-1.5 flex items-center gap-1 rounded ui-text-sm hover:bg-[var(--bg-hover)]"
          :style="{ color: 'var(--fg-muted)' }"
          :title="t('Compare selected')"
          @click.stop="compareSelectedReferences"
        >
          <IconGitCompare :size="11" :stroke-width="1.8" />
          {{ t('Compare selected') }}
        </button>
      </div>

      <!-- Style picker dropdown (Teleported) -->
      <Teleport to="body">
        <template v-if="showStyleMenu">
          <div class="fixed inset-0 z-50" @click="showStyleMenu = false"></div>
          <div
            class="context-menu z-50 pt-0"
            :style="styleMenuPos"
            style="width: 240px; max-height: 320px; overflow-y: auto;"
          >
            <!-- Search input (sticky, z-index to stay above scrolling items) -->
            <div class="sticky top-0 z-10 px-2 py-1.5" style="background: var(--bg-secondary); border-bottom: 1px solid var(--border);">
              <input
                ref="styleSearchEl"
                v-model="styleSearchQuery"
                class="w-full px-1.5 py-0.5 ui-text-md rounded border outline-none"
                :style="{ background: 'var(--bg-tertiary)', color: 'var(--fg-primary)', borderColor: 'var(--border)' }"
                :placeholder="t('Search styles...')"
                autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
                @keydown.escape.stop="showStyleMenu = false"
              />
            </div>
            <!-- Style items -->
            <div
              v-for="style in filteredStyles"
              :key="style.id"
              class="context-menu-item"
              :style="{ color: referencesStore.citationStyle === style.id ? 'var(--accent)' : undefined, fontWeight: referencesStore.citationStyle === style.id ? '500' : undefined }"
              @click="selectStyle(style.id)"
            >
              <span class="flex-1 ui-text-sm">{{ style.name }}</span>
              <span v-if="style.category" class="ui-text-xs ml-2 opacity-50">{{ style.category }}</span>
            </div>
            <div v-if="filteredStyles.length === 0" class="px-3 py-2 ui-text-md" style="color: var(--fg-muted);">
              {{ t('No matching styles') }}
            </div>
            <!-- Add custom style -->
            <div
              class="context-menu-item"
              :style="{ borderTop: '1px solid var(--border)', color: 'var(--fg-muted)' }"
              @click="addCustomStyle"
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" style="flex-shrink: 0;">
                <path d="M8 3v10M3 8h10"/>
              </svg>
              <span class="ml-1 ui-text-md">{{ t('Add custom style (.csl)...') }}</span>
            </div>
          </div>
        </template>
      </Teleport>

      <!-- Sort + filter | style (single compact row) -->
      <div v-if="referencesStore.refCount > 0" class="flex items-center gap-1 px-2 pt-1 pb-0.5 shrink-0">
        <!-- Sort button -->
        <button
          ref="sortBtnEl"
          class="w-5 h-5 flex items-center justify-center rounded shrink-0 hover:opacity-80"
          :style="{ color: 'var(--fg-muted)' }"
          :title="t('Sort references')"
          @click.stop="toggleSortMenu"
        >
          <IconArrowsSort :size="13" :stroke-width="1.5" />
        </button>

        <!-- Filter dropdown -->
        <button
          ref="filterBtnEl"
          class="h-5 px-1.5 flex items-center gap-0.5 rounded shrink-0 ui-text-sm hover:opacity-80"
          :style="{ color: citedFilter !== 'all' ? 'var(--accent)' : 'var(--fg-muted)' }"
          :title="t('Filter references')"
          @click.stop="toggleFilterMenu"
        >
          {{ filterLabel }}
          <svg width="6" height="4" viewBox="0 0 8 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" style="flex-shrink: 0;">
            <path d="M1 1l3 3 3-3"/>
          </svg>
        </button>

        <!-- Filter menu (Teleported) -->
        <Teleport to="body">
          <template v-if="showFilterMenu">
            <div class="fixed inset-0 z-50" @click="showFilterMenu = false"></div>
            <div class="context-menu z-50" :style="filterMenuPos">
              <div
                v-for="f in filterOptions"
                :key="f.value"
                class="context-menu-item"
                :style="{ color: citedFilter === f.value ? 'var(--accent)' : undefined }"
                @click="citedFilter = f.value; showFilterMenu = false"
              >
                {{ f.label }}
              </div>
            </div>
          </template>
        </Teleport>

        <div class="flex-1"></div>

        <!-- Citation style (separate concern, right-aligned) -->
        <button
          ref="styleBtnEl"
          class="h-5 px-1.5 flex items-center gap-0.5 rounded shrink-0 ui-text-sm hover:opacity-80"
          :style="{ color: 'var(--fg-muted)' }"
          :title="t('Citation style')"
          @click.stop="toggleStyleMenu"
        >
          <span
            class="block truncate"
            style="max-width: 100px;"
            :title="activeStyleName"
          >
            {{ activeStyleName }}
          </span>
          <svg width="6" height="4" viewBox="0 0 8 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" style="flex-shrink: 0;">
            <path d="M1 1l3 3 3-3"/>
          </svg>
        </button>

        <!-- Sort menu -->
        <Teleport to="body">
          <template v-if="showSortMenu">
            <div class="fixed inset-0 z-50" @click="showSortMenu = false"></div>
            <div
              ref="sortMenuEl"
              class="context-menu z-50"
              :style="sortMenuPos"
            >
              <div
                v-for="opt in sortOptions"
                :key="opt.value"
                class="context-menu-item"
                :style="{ color: currentSortKey === opt.value ? 'var(--accent)' : undefined }"
                @click="applySortOption(opt.value); showSortMenu = false"
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
        class="flex items-center gap-1.5 mx-2 mb-1 px-2 py-1 rounded ui-text-md shrink-0"
        :style="{ background: 'var(--bg-tertiary)', color: 'var(--fg-secondary)' }"
      >
        <svg v-if="importToast.hasAdded" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="var(--success)" stroke-width="2">
          <path d="M3 8l3 3 7-7"/>
        </svg>
        {{ importToast.text }}
      </div>

      <!-- Reference list -->
      <div class="flex-1 overflow-y-auto relative py-1">
        <!-- Importing placeholders -->
        <div
          v-for="imp in importing"
          :key="imp.id"
          class="py-1.5 px-2"
        >
          <div class="flex items-center gap-1">
            <div class="flex-1 min-w-0 ui-text-base truncate" :style="{ color: 'var(--fg-muted)' }">
              {{ imp.name }}
            </div>
            <div class="ref-import-spinner shrink-0"></div>
          </div>
          <div class="ui-text-sm mt-0.5" :style="{ color: 'var(--fg-muted)' }">{{ t('Importing...') }}</div>
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
          class="px-3 py-4 text-center ui-text-md"
          :style="{ color: 'var(--fg-muted)' }"
        >
          <template v-if="searchQuery">{{ t('No matching references') }}</template>
          <template v-else>
            <div>{{ t('Drop PDFs, .bib, .ris, or .json files here') }}</div>
          </template>
        </div>

        <!-- Drop zone overlay -->
        <div
          v-if="dropActive"
          class="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
          :style="{ background: 'rgba(122, 162, 247, 0.1)', border: '2px dashed var(--accent)' }"
        >
          <span class="ui-text-base" :style="{ color: 'var(--accent)' }">{{ t('Drop files to import') }}</span>
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
    <AddReferenceDialog
      v-if="showAddDialog"
      @close="showAddDialog = false"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { useReferencesStore } from '../../stores/references'
import { useEditorStore } from '../../stores/editor'
import { useChatStore } from '../../stores/chat'
import { useWorkspaceStore } from '../../stores/workspace'
import { formatReference } from '../../services/citationFormatter'
import { getAvailableStyles, getStyleName } from '../../services/citationStyleRegistry'
import { saveReferenceExport } from '../../services/referenceFiles'
import { useReferenceListUi } from '../../composables/useReferenceListUi'
import { useReferenceImports } from '../../composables/useReferenceImports'
import { launchAiTask } from '../../services/ai/launch'
import { createReferenceCompareTask, createReferenceMaintenanceTask } from '../../services/ai/taskCatalog'
import { isMod } from '../../platform'
import { ask } from '@tauri-apps/plugin-dialog'
import { IconSearch, IconArrowsSort, IconSparkles, IconGitCompare } from '@tabler/icons-vue'
import ReferenceItem from './ReferenceItem.vue'
import ReferenceContextMenu from './ReferenceContextMenu.vue'
import AddReferenceDialog from './AddReferenceDialog.vue'
import { useI18n } from '../../i18n'
import { buildCitationText } from '../../editor/citationSyntax'

const props = defineProps({
  collapsed: { type: Boolean, default: false },
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

const citedCount = computed(() =>
  searchedRefs.value.filter(r => referencesStore.citedKeys.has(r._key)).length
)
const notCitedCount = computed(() =>
  searchedRefs.value.length - citedCount.value
)

const {
  searchFocused,
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
    return searchedRefs.value.filter(r => referencesStore.citedKeys.has(r._key))
  }
  if (citedFilter.value === 'notCited') {
    return searchedRefs.value.filter(r => !referencesStore.citedKeys.has(r._key))
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
  await launchAiTask({
    editorStore,
    chatStore,
    paneId: editorStore.activePaneId || null,
    beside: true,
    task: createReferenceMaintenanceTask({
      source: 'reference-list',
      entryContext: 'reference-list',
      focusKeys: selectedReferenceKeys.value,
    }),
  })
}

async function compareSelectedReferences() {
  if (!canCompareSelected.value) return
  await launchAiTask({
    editorStore,
    chatStore,
    paneId: editorStore.activePaneId || null,
    beside: true,
    task: createReferenceCompareTask({
      refKeys: selectedReferenceKeys.value,
      source: 'reference-list',
      entryContext: 'reference-list',
    }),
  })
}

async function saveExport(format, keys) {
  showExportMenu.value = false
  const content = format === 'ris'
    ? referencesStore.exportRis(keys)
    : referencesStore.exportBibTeX(keys)
  const ext = format === 'ris' ? 'ris' : 'bib'
  await saveReferenceExport({
    format,
    title: t('Export references as .{ext}', { ext }),
    content,
  })
}

// --- Selection ---

const lastClickedIndex = ref(null)

function handleItemClick({ key, event }) {
  const refs = filteredRefs.value
  const clickedIndex = refs.findIndex(r => r._key === key)

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
    // Single click: select + open reference view in editor
    referencesStore.selectedKeys.clear()
    referencesStore.selectedKeys.add(key)
    referencesStore.activeKey = key
    referencesStore.addKeyToWorkspace(key)
    editorStore.openFile(`ref:@${key}`)
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
  referencesStore.activeKey = key
  referencesStore.addKeyToWorkspace(key)
  editorStore.openFile(`ref:@${key}`)
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
  const keys = (referencesStore.selectedKeys.size > 1
    ? [...referencesStore.selectedKeys]
    : [key]
  ).filter((item) => referencesStore.hasKeyInWorkspace(item))
  if (keys.length === 0) return
  const msg = keys.length === 1
    ? t('Remove reference @{key} from this project?', { key: keys[0] })
    : t('Remove {count} references from this project?', { count: keys.length })
  const yes = await ask(msg, { title: t('Confirm Remove'), kind: 'warning' })
  if (yes) {
    referencesStore.removeReferences(keys)
  }
}

async function deleteGlobalRef(key) {
  contextMenu.show = false
  const keys = referencesStore.selectedKeys.size > 1
    ? [...referencesStore.selectedKeys]
    : [key]
  const msg = keys.length === 1
    ? t('Delete reference @{key} from the global library?', { key: keys[0] })
    : t('Delete {count} references from the global library?', { count: keys.length })
  const yes = await ask(msg, { title: t('Confirm Global Delete'), kind: 'warning' })
  if (yes) {
    await referencesStore.removeReferencesFromGlobal(keys)
  }
}

// --- Drag to editor ---

function handleDragStart({ key, event }) {
  const selected = referencesStore.selectedKeys.size > 1
    ? [...referencesStore.selectedKeys]
    : [key]

  const ghostLabel = selected.length === 1
    ? `@${selected[0]}`
    : `${selected.length} refs`

  const ghost = document.createElement('div')
  ghost.className = 'tab-ghost'
  ghost.textContent = ghostLabel
  ghost.style.left = event.clientX + 'px'
  ghost.style.top = event.clientY + 'px'
  document.body.appendChild(ghost)
  document.body.classList.add('tab-dragging')
  window.dispatchEvent(new CustomEvent('reference-drag-start', {
    detail: { keys: [...selected] },
  }))

  const onMouseMove = (ev) => {
    ghost.style.left = ev.clientX + 'px'
    ghost.style.top = ev.clientY + 'px'
  }

  const onMouseUp = (ev) => {
    document.body.removeChild(ghost)
    document.body.classList.remove('tab-dragging')
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    window.dispatchEvent(new CustomEvent('reference-drag-end', {
      detail: { keys: [...selected], x: ev.clientX, y: ev.clientY },
    }))
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}
</script>
