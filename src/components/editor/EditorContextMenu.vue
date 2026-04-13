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
      <template v-if="hasSelection">
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
import { readText as readClipboardText } from '@tauri-apps/plugin-clipboard-manager'
import { useI18n } from '../../i18n'

const props = defineProps({
  visible: { type: Boolean, default: false },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  hasSelection: { type: Boolean, default: false },
  view: { type: Object, default: null },
  showFormatDocument: { type: Boolean, default: false },
  showMarkdownInsertTable: { type: Boolean, default: false },
  showMarkdownFormatTable: { type: Boolean, default: false },
})

const emit = defineEmits([
  'close',
  'format-document',
  'insert-markdown-table',
  'format-markdown-table',
  'paste-unavailable',
])
const { t } = useI18n()

const menuRef = ref(null)
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

watch(
  () => props.visible,
  async (show) => {
    if (!show) return
    await repositionMenu()
  }
)

watch(
  () => [
    props.visible,
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

function cut() {
  document.execCommand('cut')
  emit('close')
}

function copy() {
  document.execCommand('copy')
  emit('close')
}

async function paste() {
  if (props.view) {
    try {
      const text = await readClipboardText()
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
      try {
        const text = await navigator.clipboard?.readText?.()
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
        // Last resort falls through to a host hint instead of showing the native paste popup.
      }
    }
  }

  emit('close')
  emit('paste-unavailable')
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
</style>
