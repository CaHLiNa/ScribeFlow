<template>
  <div class="flex flex-col h-full" style="background: var(--bg-primary);">
    <div class="flex-1 overflow-y-auto min-h-0" ref="itemListRef">
      <div class="w-full mx-auto pb-10" style="max-width: min(80ch, 90%); padding-top: clamp(1rem, 20vh, 8rem);">
        <div class="flex gap-5 mb-6 pl-5">
          <button
            v-for="tab in visibleTabs"
            :key="tab.id"
            class="ui-text-label font-semibold tracking-[0.06em] uppercase bg-transparent border-none cursor-pointer pb-0.5 transition-colors duration-75"
            :style="{
              color: activeTabId === tab.id ? 'var(--fg-primary)' : 'var(--fg-muted)',
              borderBottom: activeTabId === tab.id ? '1px solid var(--fg-primary)' : '1px solid transparent',
            }"
            @click="setTab(tab.id)"
          >{{ tab.label }}</button>
        </div>

        <template v-for="(item, i) in currentItems" :key="activeTabId + '-' + i">
          <div
            v-if="item.groupHeader"
            class="ui-text-caption font-semibold tracking-[0.06em] uppercase pl-5 pb-1"
            :class="i > 0 ? 'mt-4' : ''"
            style="color: var(--fg-muted);"
          >{{ item.groupHeader }}</div>
          <button
            class="newtab-item flex items-center gap-2 w-full border-none bg-transparent text-left py-1.5 cursor-pointer transition-colors duration-75"
            :style="{ color: selectedIdx === i ? 'var(--fg-primary)' : (item.muted ? 'var(--fg-muted)' : 'var(--fg-secondary)') }"
            @click="activate(item)"
            @mouseenter="selectedIdx = i"
          >
            <span
              class="w-3 shrink-0 leading-none select-none"
              style="font-size: var(--ui-font-title);"
              :style="{ color: selectedIdx === i ? 'var(--fg-muted)' : 'transparent' }"
            >›</span>
            <span class="flex-1 ui-text-title truncate min-w-0">{{ item.label }}</span>
            <span
              v-if="item.meta"
              class="ui-text-label shrink-0 whitespace-nowrap mx-4"
              style="color: var(--fg-muted);"
            >{{ item.meta }}</span>
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useEditorStore } from '../../stores/editor'
import { useFilesStore } from '../../stores/files'
import { useWorkspaceStore } from '../../stores/workspace'
import { useI18n, formatRelativeFromNow } from '../../i18n'

const props = defineProps({
  paneId: { type: String, required: true },
})

const editorStore = useEditorStore()
const filesStore = useFilesStore()
const workspace = useWorkspaceStore()
const { t } = useI18n()

const itemListRef = ref(null)
const activeTabId = ref('recent')
const selectedIdx = ref(0)
const recentFiles = ref([])

let recentFilesGeneration = 0

const TABS = [
  { id: 'recent', label: t('Files') },
  { id: 'new', label: t('Create') },
]

const fileTypes = [
  { ext: '.md', label: t('Markdown') },
  { ext: '.tex', label: 'LaTeX' },
  { ext: '.typ', label: 'Typst' },
  { ext: '.ipynb', label: t('Jupyter notebook') },
  { ext: '.py', label: 'Python' },
]

const visibleTabs = computed(() => TABS)

const recentItems = computed(() => {
  if (recentFiles.value.length > 0) {
    return recentFiles.value.map((entry) => ({
      label: fileName(entry.path),
      meta: relativeTime(entry.openedAt),
      muted: false,
      action: () => openFile(entry.path),
    }))
  }

  return [{
    label: t('No recent files'),
    meta: null,
    muted: true,
    action: () => {},
  }]
})

const currentItems = computed(() => {
  if (activeTabId.value === 'new') {
    return fileTypes.map((fileType) => ({
      label: fileType.label,
      meta: fileType.ext,
      muted: false,
      action: () => createNewFile(fileType.ext),
    }))
  }
  return recentItems.value
})

watch(activeTabId, () => {
  selectedIdx.value = 0
})

watch(
  () => editorStore.recentFiles.map((entry) => `${entry.path}:${entry.openedAt}`).join('|'),
  () => {
    refreshRecentFiles().catch((error) => {
      console.warn('[newtab] refreshRecentFiles failed:', error)
      recentFiles.value = []
    })
  },
  { immediate: true },
)

function setTab(id) {
  activeTabId.value = id
}

function switchTab(delta) {
  const tabs = visibleTabs.value
  const idx = tabs.findIndex((tab) => tab.id === activeTabId.value)
  const next = (idx + delta + tabs.length) % tabs.length
  activeTabId.value = tabs[next].id
  selectedIdx.value = 0
}

function moveSelection(delta) {
  const items = currentItems.value
  const next = Math.max(0, Math.min(items.length - 1, selectedIdx.value + delta))
  selectedIdx.value = next
  nextTick(() => {
    const buttons = itemListRef.value?.querySelectorAll('button.newtab-item')
    buttons?.[next]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}

function activateSelected() {
  const item = currentItems.value[selectedIdx.value]
  if (item) activate(item)
}

function activate(item) {
  item.action()
}

function handleKeydown(e) {
  if (editorStore.activePaneId !== props.paneId) return
  const active = document.activeElement
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return

  switch (e.key) {
    case 'ArrowLeft':
      e.preventDefault()
      switchTab(-1)
      break
    case 'ArrowRight':
      e.preventDefault()
      switchTab(1)
      break
    case 'ArrowUp':
      e.preventDefault()
      moveSelection(-1)
      break
    case 'ArrowDown':
      e.preventDefault()
      moveSelection(1)
      break
    case 'Enter':
      e.preventDefault()
      activateSelected()
      break
    default:
      break
  }
}

function fileName(path) {
  return path.split('/').pop() || path
}

function relativeTime(ts) {
  return formatRelativeFromNow(ts)
}

async function refreshRecentFiles() {
  const generation = ++recentFilesGeneration
  const entries = [...editorStore.recentFiles]

  if (entries.length === 0) {
    recentFiles.value = []
    return
  }

  const results = await Promise.all(
    entries.map(async (entry) => {
      try {
        const exists = await invoke('path_exists', { path: entry.path })
        return exists ? entry : null
      } catch {
        return null
      }
    }),
  )

  if (generation !== recentFilesGeneration) return
  recentFiles.value = results.filter(Boolean)
}

function openFile(path) {
  editorStore.setActivePane(props.paneId)
  editorStore.openFile(path)
}

async function createNewFile(ext) {
  if (!workspace.path) return
  const baseName = 'untitled'
  let name = `${baseName}${ext}`
  let counter = 2

  while (true) {
    const fullPath = `${workspace.path}/${name}`
    try {
      const exists = await invoke('path_exists', { path: fullPath })
      if (!exists) break
    } catch {
      break
    }
    name = `${baseName}-${counter}${ext}`
    counter++
  }

  const created = await filesStore.createFile(workspace.path, name)
  if (created) {
    editorStore.setActivePane(props.paneId)
    editorStore.openFile(created)
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  recentFilesGeneration += 1
  window.removeEventListener('keydown', handleKeydown)
})
</script>
