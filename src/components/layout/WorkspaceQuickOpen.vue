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
          </UiInput>

          <div class="workspace-quick-open-results">
            <SearchResults
              ref="searchResultsRef"
              :query="query"
              @select-file="onSelectFile"
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
import UiInput from '../shared/ui/UiInput.vue'

const SearchResults = defineAsyncComponent(() => import('../SearchResults.vue'))

const workspace = useWorkspaceStore()
const editorStore = useEditorStore()
const { t } = useI18n()

const SEARCH_ICON_SIZE = 12
const searchInputRef = ref(null)
const searchResultsRef = ref(null)
const query = ref('')
const searchOpen = ref(false)

const showResults = computed(() => searchOpen.value)
const searchPlaceholder = computed(() => t('Search files'))

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
  background: color-mix(in srgb, var(--overlay-backdrop) 22%, transparent);
  backdrop-filter: blur(4px);
}

.workspace-quick-open-shell {
  position: fixed;
  top: 64px;
  left: 50%;
  transform: translateX(-50%);
  width: min(640px, calc(100vw - 56px));
  z-index: 9999;
}

.workspace-quick-open-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid color-mix(in srgb, var(--shell-border) 12%, transparent);
  border-radius: 16px;
  background: color-mix(in srgb, var(--panel-surface) 48%, var(--shell-surface));
  box-shadow: 0 16px 32px color-mix(in srgb, black 8%, transparent);
  backdrop-filter: blur(18px) saturate(0.94);
}

.workspace-quick-open-input-wrap {
  min-height: 38px;
  border-color: color-mix(in srgb, var(--shell-border) 9%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--workspace-paper) 14%, transparent);
  box-shadow: none;
}

.workspace-quick-open-search-icon {
  color: color-mix(in srgb, var(--text-muted) 86%, transparent);
}

:deep(.workspace-quick-open-input-wrap .ui-input-control) {
  font-size: 14px;
}

:deep(.workspace-quick-open-input-wrap .ui-input-control::placeholder) {
  color: color-mix(in srgb, var(--text-muted) 82%, transparent);
  opacity: 1;
}

:deep(.workspace-quick-open-input-wrap:focus-within) {
  border-color: color-mix(in srgb, var(--shell-border) 12%, transparent);
  background: color-mix(in srgb, var(--workspace-paper) 18%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--focus-ring) 22%, transparent);
}

.workspace-quick-open-results {
  position: relative;
  padding-top: 0;
}

.workspace-quick-open-results :deep(.search-results-dropdown) {
  position: static;
  top: auto;
  left: auto;
  transform: none;
  width: 100%;
  max-height: min(62vh, 440px);
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}
</style>
