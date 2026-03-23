<template>
  <header class="header-root grid items-center select-none shrink-0 relative"
    data-tauri-drag-region
    :style="headerStyle"
  >
    <button
      v-if="workspace.isOpen"
      class="header-chrome-button header-sidebar-collapse-button flex items-center justify-center border-none bg-transparent cursor-pointer transition-colors"
      :style="sidebarCollapseButtonStyle"
      :title="t('Toggle sidebar ({shortcut})', { shortcut: `${modKey}+B` })"
      @click="workspace.toggleLeftSidebar()"
      @mouseover="$event.currentTarget.style.background='var(--bg-hover)'"
      @mouseout="$event.currentTarget.style.background='transparent'"
    >
      <component
        :is="workspace.leftSidebarOpen ? IconLayoutSidebarLeftCollapse : IconLayoutSidebar"
        :size="HEADER_ICON_SIZE"
        :stroke-width="1.5"
      />
    </button>

    <div class="header-project-slot" data-tauri-drag-region></div>

    <!-- Right: AI + settings -->
      <div class="flex items-center gap-0.5 justify-self-end" data-tauri-drag-region>
      <button
        v-if="!workspace.isAiSurface"
        class="header-chrome-button flex items-center justify-center border-none bg-transparent cursor-pointer transition-colors"
        :style="{ color: aiLauncherOpen ? 'var(--accent)' : 'var(--fg-muted)' }"
        @click="handleOpenAi"
        :title="aiButtonTitle"
        @mouseover="$event.currentTarget.style.background='var(--bg-hover)'"
        @mouseout="$event.currentTarget.style.background='transparent'"
      >
        <IconSparkles :size="HEADER_ICON_SIZE" :stroke-width="1.5" />
      </button>
      <button
        class="header-chrome-button flex items-center justify-center border-none bg-transparent cursor-pointer transition-colors"
        style="color: var(--fg-muted);"
        @click="$emit('open-settings')"
        :title="t('Settings ({shortcut})', { shortcut: `${modKey}+,` })"
        @mouseover="$event.currentTarget.style.background='var(--bg-hover)';$event.currentTarget.style.color='var(--fg-primary)'"
        @mouseout="$event.currentTarget.style.background='transparent';$event.currentTarget.style.color='var(--fg-muted)'"
      >
        <IconSettings :size="HEADER_ICON_SIZE" :stroke-width="1.5" />
      </button>
    </div>
  </header>

  <Teleport to="body">
    <template v-if="showResults">
      <div class="header-command-overlay" @click="closeSearchPalette"></div>
      <div class="header-command-shell">
        <div class="header-command-panel">
          <div
            class="header-command-input-wrap"
            :style="{
              borderColor: searchFocused ? 'var(--fg-muted)' : 'var(--border)',
            }"
          >
            <IconSearch
              :size="HEADER_SEARCH_ICON_SIZE"
              :stroke-width="1.5"
              class="shrink-0"
              :style="{ color: searchFocused ? 'var(--fg-secondary)' : 'var(--fg-muted)' }"
            />
            <input
              ref="searchInputRef"
              v-model="query"
              class="header-command-input"
              :style="{ height: `${HEADER_SEARCH_INPUT_HEIGHT}px` }"
              :placeholder="searchPlaceholder"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="off"
              spellcheck="false"
              @focus="onFocus"
              @blur="onBlur"
              @keydown="onSearchKeydown"
            />
            <kbd class="shrink-0" style="padding: 0 4px; line-height: 16px;">
              {{ modKey }}+P
            </kbd>
          </div>

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
import { useAiDrawerStore } from '../../stores/aiDrawer'
import { useAiWorkbenchStore } from '../../stores/aiWorkbench'
import { useToastStore } from '../../stores/toast'
import { useReferencesStore } from '../../stores/references'
import {
  IconLayoutSidebar,
  IconLayoutSidebarLeftCollapse,
  IconSettings, IconSearch, IconSparkles,
} from '@tabler/icons-vue'
import { isMac, modKey } from '../../platform'
import { useI18n } from '../../i18n'
import { insertCitationWithAssist } from '../../services/latexCitationAssist'
import { tinymistRangeToOffsets } from '../../services/tinymist/textEdits'

const SearchResults = defineAsyncComponent(() => import('../SearchResults.vue'))

const props = defineProps({
  leftSidebarWidth: { type: Number, default: 0 },
  leftRailWidth: { type: Number, default: 44 },
})
const emit = defineEmits(['open-settings'])

const workspace = useWorkspaceStore()
const editorStore = useEditorStore()
const aiDrawer = useAiDrawerStore()
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
const HEADER_SEARCH_HEIGHT = 24
const HEADER_SEARCH_INPUT_HEIGHT = 22
const HEADER_SEARCH_ICON_SIZE = 12
const HEADER_BUTTON_SIZE = 30
const HEADER_BUTTON_INSET = 8
const MAC_TRAFFIC_LIGHT_BUTTON_GAP = 8
const COLLAPSED_RAIL_BUTTON_GAP = 0
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

const headerStyle = computed(() => ({
  gridTemplateColumns: '1fr auto',
  background: 'var(--bg-secondary)',
  borderBottom: '1px solid var(--border)',
  paddingLeft: isMac ? toPx(macHeaderLeftPadding.value) : toPx(DEFAULT_HEADER_SIDE_PADDING),
  paddingRight: '8px',
  height: `${HEADER_HEIGHT}px`,
}))

const sidebarCollapseButtonStyle = computed(() => {
  const expandedBoundary = (Number(props.leftRailWidth) || 44)
    + Math.max(Number(props.leftSidebarWidth) || 0, 0)
    - HEADER_BUTTON_SIZE
    - HEADER_BUTTON_INSET
  const collapsedBoundary = hasVisibleTrafficLights.value
    ? macHeaderLeftPadding.value + MAC_TRAFFIC_LIGHT_BUTTON_GAP
    : (Number(props.leftRailWidth) || 4) + COLLAPSED_RAIL_BUTTON_GAP
  const leftBoundary = Math.max(
    workspace.leftSidebarOpen ? expandedBoundary : collapsedBoundary,
    0,
  )

  return {
    left: toPx(leftBoundary),
    color: 'var(--fg-muted)',
  }
})

// Search
const searchInputRef = ref(null)
const searchResultsRef = ref(null)
const query = ref('')
const searchFocused = ref(false)
const searchOpen = ref(false)

const showResults = computed(() => searchOpen.value)
const aiLauncherOpen = computed(() => aiDrawer.open)
const aiButtonTitle = computed(() => (aiDrawer.open ? t('Close Quick AI') : t('Open Quick AI')))
const searchPlaceholder = computed(() => t('Go to file...'))

function onFocus() {
  searchFocused.value = true
}

function onBlur() {
  window.setTimeout(() => {
    searchFocused.value = false
  }, 80)
}

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

function onSelectCitation(key) {
  const target = editorStore.findPreferredResearchInsertTarget()
  if (target?.path) {
    workspace.openWorkspaceSurface()
    referencesStore.addKeyToWorkspace(key)
    editorStore.openFileInPane(target.path, target.paneId, { activatePane: true, replaceNewTab: false })
    const view = editorStore.getEditorView(target.paneId, target.path)
    if (view) {
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

function handleOpenAi() {
  aiDrawer.toggle()
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
  searchFocused.value = false
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

.header-chrome-button {
  width: 30px;
  height: 30px;
  border-radius: 10px;
}

.header-sidebar-collapse-button {
  position: absolute;
  top: 50%;
  z-index: 2;
  transform: translateY(-50%);
  transition: background-color 140ms ease, color 140ms ease;
}

.header-root {
  align-items: center;
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
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-primary);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.18);
}

.header-command-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--fg-primary);
  font-size: var(--ui-font-label);
  font-family: inherit;
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
  border-radius: 10px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.18);
}
</style>
