<template>
  <header class="header-root grid items-center select-none shrink-0 relative"
    data-tauri-drag-region
    :style="headerStyle"
  >
    <div data-tauri-drag-region></div>

    <!-- Center: search input -->
    <div class="relative">
      <div class="flex items-center rounded-md"
        :style="{
          background: 'var(--bg-primary)',
          border: '1px solid ' + (searchFocused ? 'var(--fg-muted)' : 'var(--border)'),
          width: '320px',
          height: `${HEADER_SEARCH_HEIGHT}px`,
          transition: 'border-color 150ms',
        }"
      >
        <IconSearch :size="HEADER_SEARCH_ICON_SIZE" :stroke-width="1.5"
          class="shrink-0 ml-2"
          :style="{ color: searchFocused ? 'var(--fg-secondary)' : 'var(--fg-muted)' }" />
        <input
          ref="searchInputRef"
          v-model="query"
          class="flex-1 bg-transparent border-none outline-none px-2"
          :style="{
            color: 'var(--fg-primary)',
            fontSize: 'var(--ui-font-label)',
            fontFamily: 'inherit',
            height: `${HEADER_SEARCH_INPUT_HEIGHT}px`,
          }"
          :placeholder="searchPlaceholder"
          autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
          @focus="onFocus"
          @blur="onBlur"
          @keydown="onSearchKeydown"
        />
        <kbd v-if="!searchFocused && !query"
          class="mr-2 shrink-0"
          style="padding: 0px 4px; line-height: 16px;">
          {{ modKey }}+P
        </kbd>
      </div>

      <!-- Search results dropdown -->
      <SearchResults
        v-if="showResults"
        ref="searchResultsRef"
        :query="query"
        @select-file="onSelectFile"
        @select-citation="onSelectCitation"
        @select-chat="onSelectChat"
        @mousedown.prevent
      />
    </div>

    <!-- Right: sidebar toggles + settings -->
    <div class="flex items-center gap-0.5 justify-self-end" data-tauri-drag-region>
      <button
        class="header-chrome-button flex items-center justify-center border-none bg-transparent cursor-pointer transition-colors"
        :style="{ color: workspace.leftSidebarOpen ? 'var(--fg-primary)' : 'var(--fg-muted)' }"
        @click="workspace.toggleLeftSidebar()"
        :title="t('Toggle sidebar ({shortcut})', { shortcut: `${modKey}+B` })"
        @mouseover="$event.currentTarget.style.background='var(--bg-hover)'"
        @mouseout="$event.currentTarget.style.background='transparent'"
      >
        <component
          :is="workspace.leftSidebarOpen ? IconLayoutSidebarFilled : IconLayoutSidebar"
          :size="HEADER_ICON_SIZE" :stroke-width="1.5"
        />
      </button>
      <button
        class="header-chrome-button flex items-center justify-center border-none bg-transparent cursor-pointer transition-colors"
        :style="{ color: workspace.rightSidebarOpen ? 'var(--fg-primary)' : 'var(--fg-muted)' }"
        @click="workspace.toggleRightSidebar()"
        :title="t('Toggle right panel ({shortcut})', { shortcut: `${modKey}+J` })"
        @mouseover="$event.currentTarget.style.background='var(--bg-hover)'"
        @mouseout="$event.currentTarget.style.background='transparent'"
      >
        <component
          :is="workspace.rightSidebarOpen ? IconLayoutSidebarRightFilled : IconLayoutSidebarRight"
          :size="HEADER_ICON_SIZE" :stroke-width="1.5"
        />
      </button>
      <button
        class="header-chrome-button flex items-center justify-center border-none bg-transparent cursor-pointer transition-colors"
        :style="{ color: workspace.bottomPanelOpen ? 'var(--fg-primary)' : 'var(--fg-muted)' }"
        @click="workspace.toggleBottomPanel()"
        :title="t('Toggle terminal ({shortcut})', { shortcut: `${modKey}+\`` })"
        @mouseover="$event.currentTarget.style.background='var(--bg-hover)'"
        @mouseout="$event.currentTarget.style.background='transparent'"
      >
        <IconTerminal2 :size="HEADER_ICON_SIZE" :stroke-width="1.5" />
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
</template>

<script setup>
import { ref, computed, nextTick, defineAsyncComponent } from 'vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { useEditorStore } from '../../stores/editor'
import {
  IconLayoutSidebar, IconLayoutSidebarFilled,
  IconLayoutSidebarRight, IconLayoutSidebarRightFilled,
  IconSettings, IconSearch, IconTerminal2,
} from '@tabler/icons-vue'
import { isMac, modKey } from '../../platform'
import { useI18n } from '../../i18n'
import { buildCitationText } from '../../editor/citationSyntax'

const SearchResults = defineAsyncComponent(() => import('../SearchResults.vue'))

const emit = defineEmits(['open-settings'])

const workspace = useWorkspaceStore()
const editorStore = useEditorStore()
const { t } = useI18n()
const isMacDesktop = isMac
  && typeof window !== 'undefined'
  && !!window.__TAURI_INTERNALS__

const HEADER_HEIGHT = 32
const HEADER_ICON_SIZE = 14
const HEADER_SEARCH_HEIGHT = 24
const HEADER_SEARCH_INPUT_HEIGHT = 22
const HEADER_SEARCH_ICON_SIZE = 12
const DEFAULT_HEADER_SIDE_PADDING = 12
const MAC_TRAFFIC_LIGHT_SAFE_PADDING = 72

function toPx(value) {
  return `${Math.round(value * 100) / 100}px`
}

const appZoomScale = computed(() => {
  const percent = Math.max(Number(workspace.appZoomPercent) || 100, 80)
  return percent / 100
})

const macHeaderLeftPadding = computed(() => {
  if (!isMac) return DEFAULT_HEADER_SIDE_PADDING
  if (!isMacDesktop) return MAC_TRAFFIC_LIGHT_SAFE_PADDING
  return MAC_TRAFFIC_LIGHT_SAFE_PADDING / appZoomScale.value
})

const headerStyle = computed(() => ({
  gridTemplateColumns: '1fr auto 1fr',
  background: 'var(--bg-secondary)',
  borderBottom: '1px solid var(--border)',
  paddingLeft: isMac ? toPx(macHeaderLeftPadding.value) : toPx(DEFAULT_HEADER_SIDE_PADDING),
  paddingRight: '8px',
  height: `${HEADER_HEIGHT}px`,
}))

// Search
const searchInputRef = ref(null)
const searchResultsRef = ref(null)
const query = ref('')
const searchFocused = ref(false)

const showResults = computed(() => searchFocused.value || query.value.length > 0)

const searchPlaceholder = computed(() => t('Go to file...'))

function onFocus() {
  searchFocused.value = true
}

function onBlur() {
  // Small delay so click events on results can fire before we close
  setTimeout(() => {
    searchFocused.value = false
    // If no query, results will hide via showResults computed
  }, 150)
}

function onSearchKeydown(e) {
  if (e.key === 'Escape') {
    query.value = ''
    searchInputRef.value?.blur()
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
  editorStore.openFile(path)
  query.value = ''
  searchInputRef.value?.blur()
}

function onSelectCitation(key) {
  const pane = editorStore.activePane
  if (pane?.activeTab) {
    const view = editorStore.getEditorView(pane.id, pane.activeTab)
    if (view) {
      const cite = buildCitationText(pane.activeTab, key)
      const selection = view.state.selection.main
      view.dispatch({
        changes: { from: selection.from, to: selection.to, insert: cite },
        selection: { anchor: selection.from + cite.length },
      })
      view.focus()
    }
  }
  query.value = ''
  searchInputRef.value?.blur()
}

function onSelectChat(sessionId) {
  editorStore.openChat({ sessionId })
  query.value = ''
  searchInputRef.value?.blur()
}

function focusSearch() {
  searchInputRef.value?.focus()
  nextTick(() => {
    searchInputRef.value?.select()
  })
}

defineExpose({ focusSearch })
</script>

<style scoped>
.header-chrome-button {
  width: 24px;
  height: 24px;
  border-radius: 6px;
}
</style>
