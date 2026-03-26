<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="editor-context-menu-backdrop fixed inset-0"
      @click="$emit('close')"
      @contextmenu.prevent="$emit('close')"
    ></div>
    <div
      v-if="visible"
      ref="menuRef"
      class="context-menu editor-context-menu py-1 ui-text-md"
      :style="menuStyle"
      @mousedown.prevent
    >
      <!-- Spell suggestions (inline, at top) -->
      <template v-if="spellSuggestions.length > 0">
        <div
          v-for="s in spellSuggestions.slice(0, 5)"
          :key="s"
          class="context-menu-item spell-suggestion"
          @click="applySuggestion(s)"
        >
          {{ s }}
        </div>
        <div class="context-menu-separator"></div>
      </template>

      <template v-if="typstCodeActions.length > 0">
        <div class="context-menu-section">{{ t('Quick Fixes') }}</div>
        <div
          v-for="action in typstCodeActions"
          :key="action.id"
          class="context-menu-item"
          @click="applyTypstCodeAction(action)"
        >
          {{ typstCodeActionLabel(action) }}
        </div>
        <div class="context-menu-separator"></div>
      </template>

      <template v-if="hasSelection">
        <div class="context-menu-item" @click="addComment">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {{ t('Add Comment') }}
          <span class="editor-context-menu-shortcut ml-auto">&#x21E7;&#x2318;L</span>
        </div>
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" @click="askAI">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4z" />
            <path d="M18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9z" />
          </svg>
          {{ t('Ask AI') }}
        </div>
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" @click="cut">{{ t('Cut') }}</div>
        <div class="context-menu-item" @click="copy">{{ t('Copy') }}</div>
        <div class="context-menu-item" @click="paste">{{ t('Paste') }}</div>
        <template v-if="showMarkdownInsertTable">
          <div class="context-menu-separator"></div>
          <div class="context-menu-item" @click="insertMarkdownTable">{{ t('Insert Table') }}</div>
        </template>
        <template v-if="showMarkdownFormatTable">
          <div class="context-menu-item" @click="formatMarkdownTable">{{ t('Format Table') }}</div>
        </template>
        <template v-if="showFormatDocument">
          <div class="context-menu-separator"></div>
          <div class="context-menu-item" @click="formatDocument">{{ t('Format Document') }}</div>
        </template>
      </template>
      <template v-else>
        <div class="context-menu-item" @click="paste">{{ t('Paste') }}</div>
        <div class="context-menu-item" @click="selectAll">{{ t('Select All') }}</div>
        <template v-if="showMarkdownInsertTable">
          <div class="context-menu-separator"></div>
          <div class="context-menu-item" @click="insertMarkdownTable">{{ t('Insert Table') }}</div>
        </template>
        <template v-if="showMarkdownFormatTable">
          <div class="context-menu-item" @click="formatMarkdownTable">{{ t('Format Table') }}</div>
        </template>
        <template v-if="showFormatDocument">
          <div class="context-menu-separator"></div>
          <div class="context-menu-item" @click="formatDocument">{{ t('Format Document') }}</div>
        </template>
      </template>
    </div>
  </Teleport>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useEditorStore } from '../../stores/editor'
import { useChatStore } from '../../stores/chat'
import { useCommentsStore } from '../../stores/comments'
import { useI18n } from '../../i18n'
import { launchSelectionAsk } from '../../services/ai/launch'

const props = defineProps({
  visible: { type: Boolean, default: false },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  hasSelection: { type: Boolean, default: false },
  filePath: { type: String, default: '' },
  view: { type: Object, default: null },
  spellcheckEnabled: { type: Boolean, default: false },
  showFormatDocument: { type: Boolean, default: false },
  showMarkdownInsertTable: { type: Boolean, default: false },
  showMarkdownFormatTable: { type: Boolean, default: false },
  typstCodeActions: { type: Array, default: () => [] },
})

const emit = defineEmits([
  'close',
  'format-document',
  'insert-markdown-table',
  'format-markdown-table',
  'apply-typst-code-action',
])
const editorStore = useEditorStore()
const chatStore = useChatStore()
const commentsStore = useCommentsStore()
const { t } = useI18n()

const menuRef = ref(null)
const spellSuggestions = ref([])
// Word range in the document for replacement
let wordFrom = 0
let wordTo = 0

const menuStyle = ref({})

async function repositionMenu() {
  if (!props.visible || typeof window === 'undefined') return
  await nextTick()

  const menuWidth = menuRef.value?.offsetWidth || 200
  const maxHeight = Math.max(120, window.innerHeight - 16)
  const measuredHeight = menuRef.value?.offsetHeight || 160
  const menuHeight = Math.min(measuredHeight, maxHeight)
  const x = Math.max(8, Math.min(props.x, window.innerWidth - menuWidth - 8))
  const y = Math.max(8, Math.min(props.y, window.innerHeight - menuHeight - 8))
  menuStyle.value = {
    left: `${x}px`,
    top: `${y}px`,
    maxHeight: `${maxHeight}px`,
    overflowY: 'auto',
  }
}

// When menu opens, compute position + fetch spell suggestions
watch(
  () => props.visible,
  async (show) => {
    if (!show) {
      spellSuggestions.value = []
      return
    }

    await repositionMenu()

    // Spell check: get word at click position
    if (props.spellcheckEnabled && props.view) {
      const pos = props.view.posAtCoords({ x: props.x, y: props.y })
      if (pos !== null) {
        const word = getWordAt(props.view.state, pos)
        if (word) {
          wordFrom = word.from
          wordTo = word.to
          try {
            const suggestions = await invoke('spell_suggest', { word: word.text })
            // Only show if menu is still open
            if (props.visible) {
              spellSuggestions.value = suggestions
            }
          } catch {
            /* non-macOS or error */
          }
        }
      }
    }
  }
)

watch(
  () => [
    props.visible,
    spellSuggestions.value.length,
    props.typstCodeActions.length,
    props.hasSelection,
    props.showFormatDocument,
    props.showMarkdownInsertTable,
    props.showMarkdownFormatTable,
  ],
  async ([show]) => {
    if (!show) return
    await repositionMenu()
  }
)

function getWordAt(state, pos) {
  const line = state.doc.lineAt(pos)
  const text = line.text
  const col = pos - line.from

  // Walk back to find word start
  let start = col
  while (start > 0 && /[\w\u00C0-\u024F'-]/.test(text[start - 1])) start--
  // Walk forward to find word end
  let end = col
  while (end < text.length && /[\w\u00C0-\u024F'-]/.test(text[end])) end++

  if (start === end) return null
  return {
    text: text.slice(start, end),
    from: line.from + start,
    to: line.from + end,
  }
}

function applySuggestion(suggestion) {
  if (!props.view) return
  props.view.dispatch({
    changes: { from: wordFrom, to: wordTo, insert: suggestion },
  })
  emit('close')
}

function addComment() {
  // Auto-show margin
  const filePath = editorStore.activePane?.activeTab
  if (filePath && !commentsStore.isMarginVisible(filePath)) {
    commentsStore.toggleMargin(filePath)
  }

  // Dispatch event for EditorPane to handle
  const pane = editorStore.activePane
  window.dispatchEvent(
    new CustomEvent('comment-create', {
      detail: { paneId: pane?.id },
    })
  )
  emit('close')
}

async function askAI() {
  const launched = await launchSelectionAsk({
    editorStore,
    chatStore,
    filePath: props.filePath,
    view: props.view,
  })

  if (!launched) {
    emit('close')
    return
  }

  emit('close')
}

function cut() {
  document.execCommand('cut')
  emit('close')
}

function copy() {
  document.execCommand('copy')
  emit('close')
}

async function paste() {
  if (props.view && navigator.clipboard?.readText) {
    try {
      const text = await navigator.clipboard.readText()
      if (typeof text === 'string') {
        const selection = props.view.state.selection.main
        const from = selection?.from ?? 0
        const to = selection?.to ?? from
        props.view.focus()
        props.view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + text.length },
        })
        emit('close')
        return
      }
    } catch {
      // Fall back to execCommand when direct clipboard access is unavailable.
    }
  }

  document.execCommand('paste')
  emit('close')
}

function selectAll() {
  if (props.view) {
    props.view.dispatch({
      selection: { anchor: 0, head: props.view.state.doc.length },
    })
  }
  emit('close')
}

function formatDocument() {
  emit('format-document')
  emit('close')
}

function formatMarkdownTable() {
  emit('format-markdown-table')
  emit('close')
}

function insertMarkdownTable() {
  emit('insert-markdown-table')
  emit('close')
}

function applyTypstCodeAction(action) {
  emit('apply-typst-code-action', action)
  emit('close')
}

function typstCodeActionLabel(action) {
  const title = String(action?.title || '').trim()
  if (!title) return ''

  const createMissingFileMatch = /^Create missing file at `(.+)`$/.exec(title)
  if (createMissingFileMatch) {
    return t('Create missing file at `{path}`', {
      path: createMissingFileMatch[1],
    })
  }

  return t(title)
}
</script>

<style scoped>
.editor-context-menu-backdrop {
  z-index: calc(var(--z-dropdown) - 1);
}

.editor-context-menu {
  max-height: min(360px, calc(100vh - 16px));
  overflow-y: auto;
}

.editor-context-menu-shortcut {
  color: var(--fg-muted);
  font-size: var(--ui-font-caption);
}

.spell-suggestion {
  font-weight: 600;
  color: var(--accent);
}
.spell-suggestion:hover {
  color: var(--fg-primary);
}
</style>
