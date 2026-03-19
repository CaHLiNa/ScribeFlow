<template>
  <div class="rounded border"
    style="background: var(--bg-secondary); border-color: var(--border); box-shadow: 0 -4px 12px rgba(0,0,0,0.3); max-height: 240px;"
    @mousedown.prevent>
    <div class="overflow-y-auto" style="max-height: 240px;">
      <!-- Models section -->
      <template v-if="filteredModels.length > 0">
        <div class="px-2 pt-1.5 pb-0.5 ui-text-sm uppercase tracking-wider" style="color: var(--fg-muted);">{{ t('Model') }}</div>
        <div v-for="(m, i) in filteredModels" :key="'model-' + m.id"
          class="px-2 py-1.5 ui-text-base cursor-pointer flex items-center gap-2"
          :style="{
            background: i === selectedIdx ? 'var(--bg-hover)' : 'transparent',
            color: i === selectedIdx ? 'var(--fg-primary)' : 'var(--fg-secondary)',
          }"
          @click="$emit('select-model', m.id)"
          @mouseenter="selectedIdx = i">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" style="flex-shrink:0; opacity:0.6;">
            <rect x="2" y="2" width="5" height="5" rx="1"/>
            <rect x="9" y="2" width="5" height="5" rx="1"/>
            <rect x="2" y="9" width="5" height="5" rx="1"/>
            <rect x="9" y="9" width="5" height="5" rx="1"/>
          </svg>
          <span class="truncate flex-1">{{ m.name }}</span>
        </div>
        <div v-if="filteredFiles.length > 0" class="border-t mx-2 my-1" style="border-color: var(--border);"></div>
      </template>

      <!-- Files section -->
      <template v-if="filteredFiles.length > 0">
        <div v-for="(file, i) in filteredFiles" :key="file.path"
          class="px-2 py-1.5 ui-text-base cursor-pointer flex items-center gap-2"
          :style="{
            background: (filteredModels.length + i) === selectedIdx ? 'var(--bg-hover)' : 'transparent',
            color: (filteredModels.length + i) === selectedIdx ? 'var(--fg-primary)' : 'var(--fg-secondary)',
          }"
          @click="$emit('select', file)"
          @mouseenter="selectedIdx = filteredModels.length + i">
          <span class="truncate shrink-0" style="max-width: 50%;">{{ file.name }}</span>
          <span class="ui-text-sm truncate" style="color: var(--fg-muted);">
            {{ folderPath(file.path) }}
          </span>
        </div>
      </template>

      <!-- Empty state -->
      <div v-if="filteredModels.length === 0 && filteredFiles.length === 0"
        class="px-2 py-3 ui-text-base text-center" style="color: var(--fg-muted);">
        {{ t('No files found') }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useFilesStore } from '../../stores/files'
import { useWorkspaceStore } from '../../stores/workspace'
import { useEditorStore } from '../../stores/editor'
import { useI18n } from '../../i18n'

const props = defineProps({
  filter: { type: String, default: '' },
  models: { type: Array,  default: () => [] },  // { id, name }[]
})
const emit = defineEmits(['select', 'select-model', 'close'])

const filesStore = useFilesStore()
const workspace = useWorkspaceStore()
const editorStore = useEditorStore()
const selectedIdx = ref(0)
const { t } = useI18n()

const FILE_RESULT_LIMIT = 40

async function ensureFilesReady() {
  if (!workspace.path) return
  try {
    await filesStore.ensureFlatFilesReady()
  } catch (error) {
    console.warn('[chat-file-mention] ensureFlatFilesReady failed:', error)
  }
}

const filteredModels = computed(() => {
  if (!props.filter || !props.models.length) return []
  const q = props.filter.toLowerCase()
  return props.models.filter(m =>
    m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)
  )
})

function isWorkspaceFilePath(path = '') {
  if (!path || !workspace.path) return false
  return path === workspace.path || path.startsWith(`${workspace.path}/`)
}

function basename(path = '') {
  return String(path || '').split('/').pop() || ''
}

function buildFileEntry(path = '') {
  return {
    name: basename(path),
    path,
  }
}

const workspaceFiles = computed(() => {
  const map = new Map()

  for (const entry of filesStore.flatFiles || []) {
    if (!isWorkspaceFilePath(entry?.path) || entry?.is_dir) continue
    map.set(entry.path, entry)
  }

  const extraPaths = [
    ...editorStore.allOpenFiles,
    ...editorStore.recentFiles.map(entry => entry.path),
    ...Object.keys(filesStore.fileContents || {}),
  ]

  for (const path of extraPaths) {
    if (!isWorkspaceFilePath(path) || map.has(path)) continue
    map.set(path, buildFileEntry(path))
  }

  return [...map.values()]
})

const openFileBoosts = computed(() => {
  const boosts = new Map()
  let rank = 30
  for (const path of editorStore.allOpenFiles) {
    if (!isWorkspaceFilePath(path)) continue
    boosts.set(path, Math.max(boosts.get(path) || 0, rank))
    rank = Math.max(10, rank - 2)
  }
  return boosts
})

const recentFileBoosts = computed(() => {
  const boosts = new Map()
  let rank = 24
  for (const entry of editorStore.recentFiles) {
    const path = entry?.path
    if (!isWorkspaceFilePath(path)) continue
    boosts.set(path, Math.max(boosts.get(path) || 0, rank))
    rank = Math.max(6, rank - 1)
  }
  return boosts
})

function scoreFile(file, rawQuery = '') {
  const query = String(rawQuery || '').trim().toLowerCase()
  const path = String(file?.path || '')
  const name = String(file?.name || basename(path)).toLowerCase()
  const rel = relativePath(path).toLowerCase()
  const segments = rel.split('/').filter(Boolean)
  const tokens = query.split(/\s+/).filter(Boolean)

  if (!query) {
    let score = 0
    if (path === editorStore.preferredContextPath) score += 120
    score += openFileBoosts.value.get(path) || 0
    score += recentFileBoosts.value.get(path) || 0
    if (segments.length <= 2) score += 8
    return score
  }

  let score = 0

  if (name === query) score += 800
  if (rel === query) score += 700
  if (name.startsWith(query)) score += 420
  if (segments.some(segment => segment.toLowerCase() === query)) score += 320
  if (segments.some(segment => segment.toLowerCase().startsWith(query))) score += 260
  if (rel.startsWith(query)) score += 220
  if (name.includes(query)) score += 180
  if (rel.includes(query)) score += 120

  for (const token of tokens) {
    if (!token) continue
    if (name.includes(token)) score += 40
    if (rel.includes(token)) score += 25
    if (segments.some(segment => segment.toLowerCase().startsWith(token))) score += 20
  }

  if (path === editorStore.preferredContextPath) score += 70
  score += openFileBoosts.value.get(path) || 0
  score += recentFileBoosts.value.get(path) || 0

  if (!name.includes(query) && !rel.includes(query) && tokens.length > 0) {
    const allTokensMatched = tokens.every(token =>
      name.includes(token) || rel.includes(token),
    )
    if (!allTokensMatched) return -1
  }

  return score
}

const filteredFiles = computed(() => {
  const q = props.filter.toLowerCase().trim()
  return workspaceFiles.value
    .map((file) => ({
      ...file,
      _score: scoreFile(file, q),
    }))
    .filter(file => file._score >= 0)
    .sort((a, b) => {
      if (b._score !== a._score) return b._score - a._score
      const aRel = relativePath(a.path).toLowerCase()
      const bRel = relativePath(b.path).toLowerCase()
      return aRel.localeCompare(bRel)
    })
    .slice(0, FILE_RESULT_LIMIT)
})

const totalItems = computed(() => filteredModels.value.length + filteredFiles.value.length)

function relativePath(fullPath) {
  if (!workspace.path) return fullPath
  return fullPath.replace(workspace.path + '/', '')
}

function folderPath(fullPath) {
  const rel = relativePath(fullPath)
  const lastSlash = rel.lastIndexOf('/')
  return lastSlash >= 0 ? rel.substring(0, lastSlash) : ''
}

function selectNext() {
  selectedIdx.value = Math.min(selectedIdx.value + 1, totalItems.value - 1)
}

function selectPrev() {
  selectedIdx.value = Math.max(selectedIdx.value - 1, 0)
}

function confirmSelection() {
  const mLen = filteredModels.value.length
  if (selectedIdx.value < mLen) {
    const model = filteredModels.value[selectedIdx.value]
    if (model) emit('select-model', model.id)
  } else {
    const file = filteredFiles.value[selectedIdx.value - mLen]
    if (file) emit('select', file)
  }
}

watch(() => props.filter, () => {
  selectedIdx.value = 0
})

watch(
  () => workspace.path,
  () => {
    ensureFilesReady()
  },
  { immediate: true },
)

defineExpose({ selectNext, selectPrev, confirmSelection })
</script>
