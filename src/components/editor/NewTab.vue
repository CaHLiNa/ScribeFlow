<template>
  <div class="flex flex-col h-full" style="background: var(--bg-primary);">

    <!-- Close pane button (split panes only) -->
    <div v-if="paneId !== 'pane-root'"
      class="flex items-center justify-end h-7 shrink-0 border-b px-1"
      style="border-color: var(--border);">
      <button
        class="p-1 rounded cursor-pointer"
        style="color: var(--fg-muted);"
        :title="t('Close pane')"
        @click="editorStore.collapsePane(paneId)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>

    <!-- Content — anchored at a fixed viewport-relative top position.
         The top of the block never moves when switching tabs (content grows down).
         No jiggle. No magic pixels. -->
    <div class="flex-1 overflow-y-auto min-h-0" ref="itemListRef">
      <div class="w-full mx-auto pb-10" style="max-width: min(80ch, 90%); padding-top: clamp(1rem, 20vh, 8rem);">

        <!-- Tab labels — pl-3 aligns with item text (› in gutter) -->
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

    <!-- Sticky bottom: ChatInput -->
    <div class="shrink-0 flex justify-center">
      <div class="w-full max-w-[80ch]">
        <ChatInput
          ref="chatInputRef"
          :isStreaming="false"
          :modelId="selectedModelId"
          :estimatedTokens="null"
          @send="sendChat"
          @update-model="selectModel"
        />
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useEditorStore } from '../../stores/editor'
import { useFilesStore } from '../../stores/files'
import { useChatStore } from '../../stores/chat'
import { useWorkspaceStore } from '../../stores/workspace'
import { isMarkdown } from '../../utils/fileTypes'
import { useI18n, formatRelativeFromNow } from '../../i18n'
import ChatInput from '../chat/ChatInput.vue'

const props = defineProps({
  paneId: { type: String, required: true },
})

const editorStore = useEditorStore()
const filesStore  = useFilesStore()
const chatStore   = useChatStore()
const workspace   = useWorkspaceStore()
const { t } = useI18n()

// ─── Refs ──────────────────────────────────────────────────────────

const chatInputRef    = ref(null)
const itemListRef     = ref(null)
const selectedModelId = ref(workspace.selectedModelId || null)
const activeTabId     = ref('quick')
const selectedIdx     = ref(0)
const chatsLimit      = ref(10)

// ─── Tab definitions ───────────────────────────────────────────────

const TABS = [
  { id: 'quick',     label: t('Start') },
  { id: 'recent',    label: t('Files') },
  { id: 'new',       label: t('Create') },
  { id: 'chats',     label: t('Chats') },
  { id: 'suggested', label: t('Suggested') },
]

const fileTypes = [
  { ext: '.md',    label: t('Markdown') },
  { ext: '.tex',   label: 'LaTeX' },
  { ext: '.typ',   label: 'Typst' },
  { ext: '.docx',  label: t('Word document') },
  { ext: '.ipynb', label: t('Jupyter notebook') },
  { ext: '.py',    label: 'Python' },
]

// ─── Data computeds ────────────────────────────────────────────────

const allRecentFiles = computed(() => {
  const flatPaths = new Set(filesStore.flatFiles.map(f => f.path))
  return editorStore.recentFiles.filter(entry => flatPaths.has(entry.path))
})

const allChats = computed(() =>
  [...chatStore.allSessionsMeta].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
)

const quickActions = computed(() => {
  const file = allRecentFiles.value[0]
  if (!file) return []
  const name = fileName(file.path)
  const path = file.path

  if (isMarkdown(path) || path.endsWith('.tex') || path.endsWith('.typ') || path.endsWith('.docx')) {
    return [
      { label: t('Proofread {name}', { name }),              prompt: t('Proofread this document for clarity, grammar, and academic tone.'),                                  file: path },
      { label: t('Find argument gaps in {name}', { name }),  prompt: t('Identify logical gaps, unsupported claims, or missing evidence in this document.'),                  file: path },
      { label: t('Summarise {name}', { name }),              prompt: t('Summarise the key arguments and contributions in this document.'),                                   file: path },
      { label: t('Peer review {name}', { name }),            prompt: t('Conduct a thorough peer review: assess originality, methodology, clarity, and impact.'),             file: path },
      { label: t('Check citation coverage'),                 prompt: t('Are all major claims backed by citations? Identify where references are missing or weak.'),          file: path },
      { label: t('Improve transitions in {name}', { name }), prompt: t('Strengthen the flow between sections and improve paragraph coherence throughout the document.'),     file: path },
      { label: t('Shorten and tighten {name}', { name }),    prompt: t('Trim redundancy and tighten prose while preserving the meaning and academic register.'),             file: path },
    ]
  }
  if (path.endsWith('.ipynb') || path.endsWith('.py') || path.endsWith('.r') || path.endsWith('.R') || path.endsWith('.jl')) {
    return [
      { label: t('Explain {name}', { name }),                prompt: t('Explain what this code does and why — for someone new to this project.'),                           file: path },
      { label: t('Debug {name}', { name }),                  prompt: t('Help me debug this code. Identify errors and suggest fixes.'),                                      file: path },
      { label: t('Document {name}', { name }),               prompt: t('Add clear docstrings and inline comments explaining functions, parameters, and key logic.'),         file: path },
      { label: t('Review code quality in {name}', { name }), prompt: t('Review code quality: clarity, style, error handling, and maintainability.'),                        file: path },
      { label: t('Check reproducibility'),                   prompt: t('Is this notebook reproducible? Identify missing data, dependencies, or unclear instructions.'),      file: path },
      { label: t('Optimise {name}', { name }),               prompt: t('Suggest concrete ways to make this code faster or more memory-efficient.'),                         file: path },
      { label: t('Interpret results'),                       prompt: t('What do the outputs and plots show? Suggest visualisations or next steps.'),                         file: path },
    ]
  }
  if (path.endsWith('.csv') || path.endsWith('.tsv')) {
    return [
      { label: t('Describe {name}', { name }),               prompt: t('Describe this dataset: variables, types, missing values, and sample size.'),                         file: path },
      { label: t('Find patterns in {name}', { name }),       prompt: t('What are the key patterns, correlations, or outliers in this data?'),                               file: path },
      { label: t('Data quality check'),                      prompt: t('Are there missing values, duplicates, or data type issues I should fix?'),                          file: path },
      { label: t('Suggest visualisations'),                  prompt: t('What charts or plots would best communicate the key findings in this data?'),                        file: path },
      { label: t('Statistical summary'),                     prompt: t('Compute and interpret descriptive statistics for each column in this dataset.'),                     file: path },
    ]
  }
  return []
})

// ─── Tab visibility ────────────────────────────────────────────────

const visibleTabs = computed(() =>
  TABS.filter(t => t.id !== 'suggested' || quickActions.value.length > 0)
)

// ─── QUICK tab items (curated, max 7) ─────────────────────────────

const quickItems = computed(() => {
  const items = []
  const recentFiles = allRecentFiles.value.slice(0, 3)
  for (let i = 0; i < recentFiles.length; i++) {
    const f = recentFiles[i]
    items.push({
      label: fileName(f.path),
      meta: relativeTime(f.openedAt),
      group: 'recent',
      groupHeader: i === 0 ? t('Recent files') : null,
      action: () => openFile(f.path),
    })
  }
  items.push({
    label: t('Markdown'),
    meta: '.md',
    group: 'new',
    groupHeader: t('Create'),
    action: () => createNewFile('.md'),
  })
  const suggestions = quickActions.value.slice(0, 2)
  for (let i = 0; i < suggestions.length; i++) {
    const a = suggestions[i]
    items.push({
      label: a.label,
      group: 'suggested',
      groupHeader: i === 0 ? t('Suggested') : null,
      muted: true,
      action: () => sendQuickAction(a),
    })
  }
  return items
})

// ─── Current tab items ─────────────────────────────────────────────

const currentItems = computed(() => {
  switch (activeTabId.value) {
    case 'quick':
      return quickItems.value
    case 'recent':
      return allRecentFiles.value.map(e => ({
        label: fileName(e.path),
        meta: relativeTime(e.openedAt),
        action: () => openFile(e.path),
      }))
    case 'new':
      return fileTypes.map(ft => ({
        label: ft.label,
        meta: ft.ext,
        action: () => createNewFile(ft.ext),
      }))
    case 'chats': {
      const visible = allChats.value.slice(0, chatsLimit.value)
      const items = visible.map(s => ({
        label: s.label,
        meta: relativeTime(s.updatedAt),
        action: () => openChat(s.id),
      }))
      if (allChats.value.length > chatsLimit.value) {
        items.push({
          label: t('Show more'),
          muted: true,
          action: () => { chatsLimit.value += 10 },
        })
      }
      return items
    }
    case 'suggested':
      return quickActions.value.map(a => ({
        label: a.label,
        muted: true,
        action: () => sendQuickAction(a),
      }))
    default:
      return []
  }
})

// ─── Watchers ──────────────────────────────────────────────────────

// Fall back to quick if active tab is hidden (e.g. suggested empties)
watch(visibleTabs, (tabs) => {
  if (!tabs.find(t => t.id === activeTabId.value)) {
    activeTabId.value = 'quick'
    selectedIdx.value = 0
  }
})

// Reset selection + chat pagination when switching tabs
watch(activeTabId, () => {
  selectedIdx.value = 0
  chatsLimit.value = 10
})

// ─── Tab navigation ────────────────────────────────────────────────

function setTab(id) {
  activeTabId.value = id
}

function switchTab(delta) {
  const tabs = visibleTabs.value
  const idx = tabs.findIndex(t => t.id === activeTabId.value)
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

// ─── Keyboard handler ──────────────────────────────────────────────

function handleKeydown(e) {
  // Only when this pane is active
  if (editorStore.activePaneId !== props.paneId) return
  // Don't intercept when any text input has focus (header search, dialogs, etc.)
  const active = document.activeElement
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return
  const richInput = chatInputRef.value?.$el?.querySelector('[contenteditable]')

  switch (e.key) {
    case 'ArrowLeft':  e.preventDefault(); switchTab(-1); break
    case 'ArrowRight': e.preventDefault(); switchTab(1);  break
    case 'ArrowUp':    e.preventDefault(); moveSelection(-1); break
    case 'ArrowDown':  e.preventDefault(); moveSelection(1);  break
    case 'Enter':      e.preventDefault(); activateSelected(); break
    default:
      // Printable character → warp focus + char into chat input
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        if (richInput) {
          richInput.focus()
          document.execCommand('insertText', false, e.key)
        }
      }
  }
}

// ─── Helpers ───────────────────────────────────────────────────────

function fileName(path) {
  return path.split('/').pop() || path
}

function relativeTime(ts) {
  return formatRelativeFromNow(ts)
}

// ─── Navigation ────────────────────────────────────────────────────

function openFile(path) {
  editorStore.setActivePane(props.paneId)
  editorStore.openFile(path)
}

function openChat(sessionId) {
  editorStore.setActivePane(props.paneId)
  chatStore.reopenSession(sessionId, { skipArchive: true })
  nextTick(() => {
    editorStore.openChat({ sessionId, paneId: props.paneId })
  })
}

// ─── Send ──────────────────────────────────────────────────────────

async function sendChat({ text, fileRefs, context }) {
  if (!text && !fileRefs?.length) return
  editorStore.setActivePane(props.paneId)
  const sessionId = chatStore.createSession()
  const session = chatStore.sessions.find(s => s.id === sessionId)
  if (session && selectedModelId.value) session.modelId = selectedModelId.value
  editorStore.openChat({ sessionId, paneId: props.paneId })
  await nextTick()
  chatStore.sendMessage(sessionId, { text, fileRefs, context })
}

async function sendQuickAction(action) {
  editorStore.setActivePane(props.paneId)
  const sessionId = chatStore.createSession()
  const session = chatStore.sessions.find(s => s.id === sessionId)
  if (session && selectedModelId.value) session.modelId = selectedModelId.value
  editorStore.openChat({ sessionId, paneId: props.paneId })
  await nextTick()

  let content = null
  try { content = await invoke('read_file', { path: action.file }) } catch {}

  chatStore.sendMessage(sessionId, {
    text: action.prompt,
    fileRefs: [{ path: action.file, content }],
  })
}

function selectModel(modelId) {
  selectedModelId.value = modelId
  workspace.setSelectedModelId(modelId)
}

// ─── File creation ─────────────────────────────────────────────────

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
    } catch { break }
    name = `${baseName}-${counter}${ext}`
    counter++
  }
  const created = await filesStore.createFile(workspace.path, name)
  if (created) {
    editorStore.setActivePane(props.paneId)
    editorStore.openFile(created)
  }
}

// ─── Lifecycle ─────────────────────────────────────────────────────

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>
