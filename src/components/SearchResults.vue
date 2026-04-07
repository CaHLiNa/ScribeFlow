<template>
  <div class="search-results-dropdown">
    <div class="search-results-list">
      <!-- Title matches -->
      <template v-if="titleMatches.length > 0">
        <div class="quick-open-section" v-if="query && contentMatches.length > 0">
          {{ t('Files') }}
        </div>
        <div
          v-for="(file, idx) in titleMatches"
          :key="'t-' + file.path"
          class="quick-open-item"
          :class="{ active: idx === selectedIndex }"
          @mousedown.prevent="$emit('select-file', file.path)"
          @mouseover="selectedIndex = idx"
        >
          <div class="quick-open-primary truncate">{{ file.name }}</div>
          <div class="quick-open-secondary path">{{ relativePath(file.path) }}</div>
        </div>
      </template>

      <!-- Content matches -->
      <template v-if="contentMatches.length > 0">
        <div class="quick-open-section">{{ t('Content') }}</div>
        <div
          v-for="(match, idx) in contentMatches"
          :key="'c-' + match.path + ':' + match.line"
          class="quick-open-item"
          :class="{ active: titleMatches.length + idx === selectedIndex }"
          @mousedown.prevent="$emit('select-file', match.path)"
          @mouseover="selectedIndex = titleMatches.length + idx"
        >
          <div class="quick-open-primary truncate">{{ match.name }}</div>
          <div class="quick-open-secondary content-match">
            <span class="line-num">:{{ match.line }}</span>
            {{ match.text }}
          </div>
        </div>
      </template>

      <!-- Typst workspace symbols -->
      <template v-if="typstSymbolMatches.length > 0">
        <div class="quick-open-section">{{ t('Typst') }}</div>
        <div
          v-for="(symbol, idx) in typstSymbolMatches"
          :key="'ts-' + symbol.filePath + ':' + symbol.line + ':' + symbol.name"
          class="quick-open-item"
          :class="{ active: titleMatches.length + contentMatches.length + idx === selectedIndex }"
          @mousedown.prevent="$emit('select-typst-symbol', symbol)"
          @mouseover="selectedIndex = titleMatches.length + contentMatches.length + idx"
        >
          <div class="quick-open-primary truncate">{{ symbol.name }}</div>
          <div class="quick-open-secondary path">
            <span v-if="symbol.kindLabel" class="uppercase">{{ symbol.kindLabel }}</span>
            <span v-if="symbol.kindLabel"> · </span>
            {{ symbol.relativePath }}<span v-if="symbol.line">:{{ symbol.line }}</span>
          </div>
        </div>
      </template>

      <div
        v-if="
          titleMatches.length === 0 &&
          contentMatches.length === 0 &&
          typstSymbolMatches.length === 0 &&
          query
        "
        class="quick-open-item quick-open-item-empty"
      >
        {{ searching ? t('Searching...') : t('No results found') }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useFilesStore } from '../stores/files'
import { useWorkspaceStore } from '../stores/workspace'
import { useI18n } from '../i18n'
import { requestTinymistWorkspaceSymbols } from '../services/tinymist/session'
import { normalizeTinymistWorkspaceSymbols } from '../services/tinymist/symbols'
import { listWorkspaceFlatFileEntries } from '../domains/files/workspaceSnapshotFlatFilesRuntime'

const props = defineProps({
  query: { type: String, default: '' },
})

const emit = defineEmits(['select-file', 'select-typst-symbol'])

const files = useFilesStore()
const workspace = useWorkspaceStore()
const { t } = useI18n()

const selectedIndex = ref(0)
const contentMatches = ref([])
const typstSymbolMatches = ref([])
const searching = ref(false)

let searchTimer = null
let typstSymbolTimer = null
let typstSymbolRequestId = 0

onMounted(() => {
  files
    .readWorkspaceSnapshot()
    .catch(() => files.ensureFlatFilesReady())
    .catch((error) => {
      console.warn('[search-results] workspace snapshot preload failed:', error)
    })
})

const workspaceSnapshot = computed(() => (
  files.lastWorkspaceSnapshot || { flatFiles: files.flatFiles }
))

const workspaceFlatFiles = computed(() => listWorkspaceFlatFileEntries(workspaceSnapshot.value))

const titleMatches = computed(() => {
  const q = props.query.toLowerCase()
  if (!q) return workspaceFlatFiles.value.slice(0, 20)

  let list = workspaceFlatFiles.value.filter((f) => {
    const name = f.name.toLowerCase()
    const path = f.path.toLowerCase()
    let qi = 0
    for (let i = 0; i < name.length && qi < q.length; i++) {
      if (name[i] === q[qi]) qi++
    }
    return qi === q.length || path.includes(q)
  })

  list.sort((a, b) => {
    const aName = a.name.toLowerCase()
    const bName = b.name.toLowerCase()
    const aExact = aName.includes(q) ? 0 : 1
    const bExact = bName.includes(q) ? 0 : 1
    if (aExact !== bExact) return aExact - bExact
    const aStarts = aName.startsWith(q) ? 0 : 1
    const bStarts = bName.startsWith(q) ? 0 : 1
    if (aStarts !== bStarts) return aStarts - bStarts
    return aName.localeCompare(bName)
  })

  return list.slice(0, 15)
})

const totalItems = computed(
  () => titleMatches.value.length + contentMatches.value.length + typstSymbolMatches.value.length
)

// Debounced content search
watch(
  () => props.query,
  (q) => {
    typstSymbolRequestId += 1
    selectedIndex.value = 0
    contentMatches.value = []
    typstSymbolMatches.value = []

    clearTimeout(searchTimer)
    clearTimeout(typstSymbolTimer)
    if (q.length >= 2 && workspace.path) {
      searching.value = true
      searchTimer = setTimeout(async () => {
        try {
          const results = await invoke('search_file_contents', {
            dir: workspace.path,
            query: q,
            maxResults: 10,
          })
          contentMatches.value = results
        } catch (e) {
          console.error('Content search error:', e)
          contentMatches.value = []
        }
        searching.value = false
      }, 200)

      const requestId = typstSymbolRequestId
      typstSymbolTimer = setTimeout(async () => {
        try {
          const results = await requestTinymistWorkspaceSymbols(q, {
            workspacePath: workspace.path,
          })
          if (requestId !== typstSymbolRequestId) return
          typstSymbolMatches.value = normalizeTinymistWorkspaceSymbols(
            results,
            workspace.path
          ).slice(0, 8)
        } catch (error) {
          console.warn('[search-results] typst workspace symbol search failed:', error)
          if (requestId !== typstSymbolRequestId) return
          typstSymbolMatches.value = []
        }
      }, 180)
    } else {
      searching.value = false
      typstSymbolMatches.value = []
    }
  }
)

function relativePath(path) {
  if (workspace.path && path.startsWith(workspace.path)) {
    return path.slice(workspace.path.length + 1)
  }
  return path
}

function moveSelection(delta) {
  const len = totalItems.value
  if (len === 0) return
  selectedIndex.value = (selectedIndex.value + delta + len) % len
  nextTick(() => {
    const el = document.querySelector('.search-results-dropdown .quick-open-item.active')
    if (el) el.scrollIntoView({ block: 'nearest' })
  })
}

function confirmSelection() {
  if (totalItems.value === 0) return
  const fileEnd = titleMatches.value.length
  const contentEnd = fileEnd + contentMatches.value.length
  const typstEnd = contentEnd + typstSymbolMatches.value.length

  if (selectedIndex.value < fileEnd) {
    const file = titleMatches.value[selectedIndex.value]
    if (file) emit('select-file', file.path)
  } else if (selectedIndex.value < contentEnd) {
    const idx = selectedIndex.value - fileEnd
    const match = contentMatches.value[idx]
    if (match) emit('select-file', match.path)
  } else if (selectedIndex.value < typstEnd) {
    const idx = selectedIndex.value - contentEnd
    const symbol = typstSymbolMatches.value[idx]
    if (symbol) emit('select-typst-symbol', symbol)
  }
}

defineExpose({ moveSelection, confirmSelection })
</script>
