<template>
  <header
    class="header-root grid items-center select-none shrink-0 relative"
    :class="{
      'is-resizing': props.leftSidebarResizing || props.rightSidebarResizing,
      'is-resizing-left': props.leftSidebarResizing,
      'is-resizing-right': props.rightSidebarResizing,
    }"
    data-tauri-drag-region
    :style="headerStyle"
  >
    <ShellChromeButton
      v-if="workspace.isOpen"
      class="header-sidebar-toggle-button"
      :active="workspace.leftSidebarOpen"
      :aria-label="t('Toggle sidebar ({shortcut})', { shortcut: `${modKey}+B` })"
      :title="t('Toggle sidebar ({shortcut})', { shortcut: `${modKey}+B` })"
      @click="workspace.toggleLeftSidebar()"
    >
      <component
        :is="workspace.leftSidebarOpen ? IconLayoutSidebarLeftCollapse : IconLayoutSidebar"
        :size="HEADER_ICON_SIZE"
        :stroke-width="1.5"
      />
    </ShellChromeButton>

    <div class="header-project-slot" data-tauri-drag-region></div>

    <ShellChromeButton
      v-if="workspace.isOpen && inspectorAvailable"
      class="header-inspector-toggle-button"
      :active="workspace.rightSidebarOpen"
      :aria-label="t('Toggle right sidebar')"
      :title="t('Toggle right sidebar')"
      @click="toggleRightSidebar"
    >
      <component
        :is="workspace.rightSidebarOpen ? IconLayoutSidebarRightCollapse : IconLayoutSidebarRight"
        :size="HEADER_ICON_SIZE"
        :stroke-width="1.5"
      />
    </ShellChromeButton>

    <div class="header-right-slot" data-tauri-drag-region>
    </div>
  </header>

  <Teleport to="body">
    <template v-if="showResults">
      <div class="header-command-overlay" @click="closeSearchPalette"></div>
      <div class="header-command-shell">
        <div class="header-command-panel">
          <UiInput
            ref="searchInputRef"
            v-model="query"
            shell-class="header-command-input-wrap"
            :placeholder="searchPlaceholder"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
            @keydown="onSearchKeydown"
          >
            <template #prefix>
              <IconSearch
                :size="HEADER_SEARCH_ICON_SIZE"
                :stroke-width="1.5"
                class="header-command-search-icon shrink-0"
              />
            </template>
            <template #suffix>
              <kbd class="ui-kbd shrink-0">
                {{ modKey }}+P
              </kbd>
            </template>
          </UiInput>

          <div class="header-command-results">
            <SearchResults
              ref="searchResultsRef"
              :query="query"
              @select-file="onSelectFile"
              @select-citation="onSelectCitation"
              @select-chat="onSelectChat"
              @select-typst-symbol="onSelectTypstSymbol"
              @mousedown.prevent
            />
          </div>
        </div>
      </div>
    </template>
  </Teleport>
</template>

<script setup>
import { ref, computed, nextTick, defineAsyncComponent, onMounted, onUnmounted } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useWorkspaceStore } from '../../stores/workspace'
import { useEditorStore } from '../../stores/editor'
import { useAiWorkbenchStore } from '../../stores/aiWorkbench'
import { useToastStore } from '../../stores/toast'
import { useReferencesStore } from '../../stores/references'
import {
  IconLayoutSidebarRight,
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebar,
  IconLayoutSidebarLeftCollapse,
  IconSearch,
} from '@tabler/icons-vue'
import { isMac, modKey } from '../../platform'
import { useI18n } from '../../i18n'
import {
  resolveHeaderChromeLayout,
} from '../../shared/headerChromeGeometry.js'
import { getWorkbenchInspectorChromeEntries } from '../../shared/workbenchChromeEntries.js'
import { tinymistRangeToOffsets } from '../../services/tinymist/textEdits'
import ShellChromeButton from '../shared/ShellChromeButton.vue'
import UiInput from '../shared/ui/UiInput.vue'

const SearchResults = defineAsyncComponent(() => import('../SearchResults.vue'))

const props = defineProps({
  leftRailWidth: { type: Number, default: 44 },
  leftSidebarResizing: { type: Boolean, default: false },
  rightSidebarResizing: { type: Boolean, default: false },
})

const workspace = useWorkspaceStore()
const editorStore = useEditorStore()
const aiWorkbench = useAiWorkbenchStore()
const toastStore = useToastStore()
const referencesStore = useReferencesStore()
const { t } = useI18n()
const isMacDesktop = isMac
  && typeof window !== 'undefined'
  && !!window.__TAURI_INTERNALS__
const isTauriDesktop = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__

const HEADER_HEIGHT = 30
const HEADER_ICON_SIZE = 18
const HEADER_SEARCH_ICON_SIZE = 12
const HEADER_BUTTON_INSET = 8
const HEADER_RIGHT_PADDING = 8
const DEFAULT_HEADER_SIDE_PADDING = 12
const MAC_TRAFFIC_LIGHT_SAFE_PADDING = 72
const EDITOR_WAIT_TIMEOUT_MS = 1500
const FULLSCREEN_HEADER_LEFT_PADDING = 12
const headerCommandTop = `${HEADER_HEIGHT + 8}px`

function toPx(value) {
  return `${Math.round(value * 100) / 100}px`
}

const appZoomScale = computed(() => {
  const percent = Math.max(Number(workspace.appZoomPercent) || 100, 80)
  return percent / 100
})

const isNativeFullscreen = ref(false)
let unlistenWindowResize = null

const macHeaderLeftPadding = computed(() => {
  if (!isMac) return DEFAULT_HEADER_SIDE_PADDING
  if (!isMacDesktop) return MAC_TRAFFIC_LIGHT_SAFE_PADDING
  if (isNativeFullscreen.value) return FULLSCREEN_HEADER_LEFT_PADDING / appZoomScale.value
  return MAC_TRAFFIC_LIGHT_SAFE_PADDING / appZoomScale.value
})

const hasVisibleTrafficLights = computed(() => isMacDesktop && !isNativeFullscreen.value)
const headerLeftPadding = computed(() => (
  isMac ? macHeaderLeftPadding.value : DEFAULT_HEADER_SIDE_PADDING
))

const headerStyle = computed(() => ({
  gridTemplateColumns: '1fr auto',
  background: 'var(--bg-primary)',
  borderBottom: '1px solid var(--border)',
  paddingLeft: toPx(headerLeftPadding.value),
  paddingRight: toPx(HEADER_RIGHT_PADDING),
  height: `${HEADER_HEIGHT}px`,
  '--header-left-toggle-left': toPx(headerChromeLayout.value.leftToggleLeft),
  '--header-right-toggle-right': toPx(headerChromeLayout.value.rightToggleRight),
}))

const headerChromeLayout = computed(() => resolveHeaderChromeLayout({
  hasVisibleTrafficLights: hasVisibleTrafficLights.value,
  macSafePadding: macHeaderLeftPadding.value,
  railBoundary: Number(props.leftRailWidth) || 44,
  buttonInset: HEADER_BUTTON_INSET,
}))
const inspectorEntries = computed(() => (
  getWorkbenchInspectorChromeEntries(t, workspace.primarySurface)
))
const inspectorAvailable = computed(() => inspectorEntries.value.length > 0)

// Search
const searchInputRef = ref(null)
const searchResultsRef = ref(null)
const query = ref('')
const searchOpen = ref(false)

const showResults = computed(() => searchOpen.value)
const searchPlaceholder = computed(() => t('Go to file...'))

function onSearchKeydown(e) {
  if (e.key === 'Escape') {
    closeSearchPalette()
    e.preventDefault()
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    searchResultsRef.value?.moveSelection(1)
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    searchResultsRef.value?.moveSelection(-1)
    return
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    searchResultsRef.value?.confirmSelection()
    return
  }
}

function onSelectFile(path) {
  workspace.openWorkspaceSurface()
  editorStore.openFile(path)
  closeSearchPalette()
}

async function onSelectCitation(key) {
  const target = editorStore.findPreferredResearchInsertTarget()
  if (target?.path) {
    workspace.openWorkspaceSurface()
    referencesStore.addKeyToWorkspace(key)
    editorStore.openFileInPane(target.path, target.paneId, { activatePane: true, replaceNewTab: false })
    const view = editorStore.getEditorView(target.paneId, target.path)
    if (view) {
      const { insertCitationWithAssist } = await import('../../services/latexCitationAssist.js')
      insertCitationWithAssist({
        view,
        filePath: target.path,
        keys: key,
        t,
        toastStore,
      })
      view.focus()
    }
  }
  closeSearchPalette()
}

function onSelectChat(sessionId) {
  workspace.openAiSurface()
  aiWorkbench.openSession(sessionId)
  closeSearchPalette()
}

function toggleRightSidebar() {
  if (!inspectorAvailable.value) return
  workspace.toggleRightSidebar()
}

async function waitForEditorView(targetPath) {
  const startedAt = Date.now()
  let targetView = editorStore.getAnyEditorView(targetPath)

  while (!targetView && Date.now() - startedAt < EDITOR_WAIT_TIMEOUT_MS) {
    await new Promise((resolve) => window.setTimeout(resolve, 16))
    targetView = editorStore.getAnyEditorView(targetPath)
  }

  return targetView
}

async function onSelectTypstSymbol(symbol) {
  const filePath = String(symbol?.filePath || '')
  if (!filePath) return

  workspace.openWorkspaceSurface()
  editorStore.openFile(filePath)
  const targetView = await waitForEditorView(filePath)
  if (targetView) {
    const offsets = tinymistRangeToOffsets(targetView.state, symbol?.range)
    if (offsets) {
      targetView.dispatch({
        selection: {
          anchor: offsets.from,
          head: offsets.to,
        },
        scrollIntoView: true,
      })
      targetView.focus()
    }
  }

  closeSearchPalette()
}

function focusSearch() {
  searchOpen.value = true
  nextTick(() => {
    searchInputRef.value?.focus()
    searchInputRef.value?.select()
  })
}

function closeSearchPalette() {
  searchOpen.value = false
  query.value = ''
  searchInputRef.value?.blur()
}

async function syncNativeWindowChromeState() {
  if (!isTauriDesktop) return
  try {
    isNativeFullscreen.value = await getCurrentWindow().isFullscreen()
  } catch {
    isNativeFullscreen.value = false
  }
}

onMounted(async () => {
  if (!isTauriDesktop) return
  await syncNativeWindowChromeState()
  try {
    unlistenWindowResize = await getCurrentWindow().onResized(() => {
      syncNativeWindowChromeState()
    })
  } catch {
    unlistenWindowResize = null
  }
})

onUnmounted(() => {
  unlistenWindowResize?.()
  unlistenWindowResize = null
})

defineExpose({ focusSearch })
</script>

<style scoped>
.header-project-slot {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  min-width: 0;
  height: 100%;
}

.header-right-slot {
  min-width: 0;
  height: 100%;
}

.header-sidebar-toggle-button {
  position: absolute;
  top: 50%;
  z-index: 2;
  left: var(--header-left-toggle-left);
  transform: translateY(-50%);
}

.header-inspector-toggle-button {
  position: absolute;
  top: 50%;
  z-index: 2;
  left: auto;
  right: var(--header-right-toggle-right);
  transform: translateY(-50%);
}

.header-root {
  align-items: center;
}

.header-root.is-resizing :deep(.shell-chrome-button) {
  transition: none !important;
}

.header-command-overlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
  background: transparent;
}

.header-command-shell {
  position: fixed;
  top: v-bind(headerCommandTop);
  left: 50%;
  transform: translateX(-50%);
  width: min(560px, calc(100vw - 28px));
  z-index: 9999;
}

.header-command-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.header-command-input-wrap {
  min-height: 34px;
  border-radius: var(--radius-lg);
  background: var(--surface-base);
  box-shadow: var(--shadow-md);
}

.header-command-search-icon {
  color: var(--text-muted);
}

.header-command-results {
  position: relative;
}

@media (max-width: 980px) {
  .header-surface-switcher {
    gap: 3px;
  }

  .header-surface-button {
    width: 56px;
    padding: 0 7px;
    gap: 3px;
  }

  .header-surface-button svg {
    display: none;
  }
}

.header-command-results :deep(.search-results-dropdown) {
  position: static;
  top: auto;
  left: auto;
  transform: none;
  width: 100%;
  max-height: min(62vh, 460px);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}
</style>
