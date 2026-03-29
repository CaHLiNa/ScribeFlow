<template>
  <Teleport to="body">
    <template v-if="showResults">
      <div class="workspace-quick-open-overlay" @click="closeSearchPalette"></div>
      <div class="workspace-quick-open-shell">
        <div class="workspace-quick-open-panel">
          <UiInput
            ref="searchInputRef"
            v-model="query"
            shell-class="workspace-quick-open-input-wrap"
            :placeholder="searchPlaceholder"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
            @keydown="onSearchKeydown"
          >
            <template #prefix>
              <IconSearch
                :size="SEARCH_ICON_SIZE"
                :stroke-width="1.5"
                class="workspace-quick-open-search-icon shrink-0"
              />
            </template>
            <template #suffix>
              <kbd class="ui-kbd shrink-0">{{ modKey }}+P</kbd>
            </template>
          </UiInput>

          <div class="workspace-quick-open-results">
            <SearchResults
              ref="searchResultsRef"
              :query="query"
              @select-file="onSelectFile"
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
import { ref, computed, nextTick, defineAsyncComponent } from 'vue'
import { IconSearch } from '@tabler/icons-vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { useEditorStore } from '../../stores/editor'
import { useI18n } from '../../i18n'
import { modKey } from '../../platform'
import { tinymistRangeToOffsets } from '../../services/tinymist/textEdits'
import UiInput from '../shared/ui/UiInput.vue'

const SearchResults = defineAsyncComponent(() => import('../SearchResults.vue'))

const workspace = useWorkspaceStore()
const editorStore = useEditorStore()
const { t } = useI18n()

const SEARCH_ICON_SIZE = 12
const EDITOR_WAIT_TIMEOUT_MS = 1500

const searchInputRef = ref(null)
const searchResultsRef = ref(null)
const query = ref('')
const searchOpen = ref(false)

const showResults = computed(() => searchOpen.value)
const searchPlaceholder = computed(() => t('Go to file...'))

function onSearchKeydown(event) {
  if (event.key === 'Escape') {
    closeSearchPalette()
    event.preventDefault()
    return
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    searchResultsRef.value?.moveSelection(1)
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    searchResultsRef.value?.moveSelection(-1)
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    searchResultsRef.value?.confirmSelection()
  }
}

function onSelectFile(path) {
  workspace.openWorkspaceSurface()
  editorStore.openFile(path)
  closeSearchPalette()
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

defineExpose({ focusSearch })
</script>

<style scoped>
.workspace-quick-open-overlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
  background: transparent;
}

.workspace-quick-open-shell {
  position: fixed;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  width: min(640px, calc(100vw - 32px));
  z-index: 9999;
}

.workspace-quick-open-panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.workspace-quick-open-input-wrap {
  min-height: 34px;
  border-color: transparent;
  border-radius: 11px;
  background: color-mix(in srgb, var(--panel-surface) 96%, transparent);
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.08);
}

.workspace-quick-open-search-icon {
  color: var(--text-muted);
}

.workspace-quick-open-results {
  position: relative;
}

.workspace-quick-open-results :deep(.search-results-dropdown) {
  position: static;
  top: auto;
  left: auto;
  transform: none;
  width: 100%;
  max-height: min(62vh, 460px);
  border-radius: 11px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.1);
}
</style>
