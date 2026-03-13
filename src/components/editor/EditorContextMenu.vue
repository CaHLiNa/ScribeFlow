<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 z-[999]" @click="$emit('close')" @contextmenu.prevent="$emit('close')"></div>
    <div v-if="visible" class="context-menu py-1 ui-text-md" :style="menuStyle">
      <!-- Spell suggestions (inline, at top) -->
      <template v-if="spellSuggestions.length > 0">
        <div
          v-for="s in spellSuggestions.slice(0, 5)"
          :key="s"
          class="context-menu-item spell-suggestion"
          @click="applySuggestion(s)"
        >{{ s }}</div>
        <div class="context-menu-separator"></div>
      </template>

      <template v-if="hasSelection">
        <div class="context-menu-item" @click="addComment">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          {{ t('Add Comment') }}
          <span class="ml-auto" style="color: var(--fg-muted); font-size: 11px;">&#x21E7;&#x2318;L</span>
        </div>
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" @click="askAI">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4z"/>
            <path d="M18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9z"/>
          </svg>
          {{ t('Ask AI') }}
        </div>
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" @click="cut">{{ t('Cut') }}</div>
        <div class="context-menu-item" @click="copy">{{ t('Copy') }}</div>
        <div class="context-menu-item" @click="paste">{{ t('Paste') }}</div>
      </template>
      <template v-else>
        <div class="context-menu-item" @click="paste">{{ t('Paste') }}</div>
        <div class="context-menu-item" @click="selectAll">{{ t('Select All') }}</div>
      </template>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useEditorStore } from '../../stores/editor'
import { useCommentsStore } from '../../stores/comments'
import { useI18n } from '../../i18n'

const props = defineProps({
  visible: { type: Boolean, default: false },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  hasSelection: { type: Boolean, default: false },
  filePath: { type: String, default: '' },
  view: { type: Object, default: null },
  spellcheckEnabled: { type: Boolean, default: false },
})

const emit = defineEmits(['close'])
const editorStore = useEditorStore()
const commentsStore = useCommentsStore()
const { t } = useI18n()

const spellSuggestions = ref([])
// Word range in the document for replacement
let wordFrom = 0
let wordTo = 0

const menuStyle = ref({})

// When menu opens, compute position + fetch spell suggestions
watch(() => props.visible, async (show) => {
  if (!show) {
    spellSuggestions.value = []
    return
  }

  // Position
  const menuW = 200, menuH = props.hasSelection ? 280 : 80
  const x = Math.min(props.x, window.innerWidth - menuW - 8)
  const y = Math.min(props.y, window.innerHeight - menuH - 8)
  menuStyle.value = { left: x + 'px', top: y + 'px' }

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
        } catch { /* non-macOS or error */ }
      }
    }
  }
})

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
  window.dispatchEvent(new CustomEvent('comment-create', {
    detail: { paneId: pane?.id }
  }))
  emit('close')
}

function askAI() {
  const selection = props.view?.state?.selection?.main
  if (!props.view || !selection || selection.from === selection.to) {
    emit('close')
    return
  }

  const doc = props.view.state.doc
  const text = doc.sliceString(selection.from, selection.to, '\n')
  const beforeStart = Math.max(0, selection.from - 200)
  const afterEnd = Math.min(doc.length, selection.to + 200)
  const contextBefore = selection.from > 0
    ? doc.sliceString(beforeStart, selection.from, '\n')
    : ''
  const contextAfter = selection.to < doc.length
    ? doc.sliceString(selection.to, afterEnd, '\n')
    : ''

  editorStore.openChatBeside({
    selection: {
      file: props.filePath,
      text,
      contextBefore,
      contextAfter,
    },
  })

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

function paste() {
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
</script>

<style scoped>
.spell-suggestion {
  font-weight: 600;
  color: var(--accent);
}
.spell-suggestion:hover {
  color: var(--fg-primary);
}
</style>
